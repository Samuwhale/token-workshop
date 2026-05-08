import type {
  BindableProperty,
  BindablePropertyValue,
  BindableTokenValue,
  NodeCapabilities,
  SelectionNodeInfo,
  TokenMapEntry,
} from '../../shared/types';
import { TOKEN_PROPERTY_MAP, PROPERTY_LABELS, SCOPE_TO_PROPERTIES, PROPERTY_GROUPS } from '../../shared/types';
import { resolveTokenValue } from '../../shared/resolveAlias';
import type { UndoSlot } from '../hooks/useUndo';
import { formatTokenValueForDisplay } from '../shared/tokenFormatting';

export function shouldShowGroup(condition: string | undefined, caps: NodeCapabilities): boolean {
  if (!condition) return true;
  return caps[condition as keyof NodeCapabilities] ?? false;
}

export function getBindingForProperty(nodes: SelectionNodeInfo[], prop: BindableProperty): string | null | 'mixed' {
  if (nodes.length === 0) return null;
  const first = nodes[0].bindings[prop] || null;
  for (let i = 1; i < nodes.length; i++) {
    const val = nodes[i].bindings[prop] || null;
    if (val !== first) return 'mixed';
  }
  return first;
}

export function getCurrentValue(
  nodes: SelectionNodeInfo[],
  prop: BindableProperty,
): BindablePropertyValue | undefined {
  if (nodes.length === 0) return undefined;
  return nodes[0].currentValues[prop];
}

export function getCurrentValueState(
  nodes: SelectionNodeInfo[],
  prop: BindableProperty,
): {
  kind: "empty" | "single" | "mixed";
  value?: BindablePropertyValue;
  count: number;
} {
  if (nodes.length === 0) return { kind: "empty", count: 0 };
  let firstValue: BindablePropertyValue | undefined;
  let hasValue = false;
  let hasEmpty = false;

  for (const node of nodes) {
    const nextValue = node.currentValues[prop];
    if (nextValue === undefined || nextValue === null) {
      hasEmpty = true;
      if (hasValue) {
        return { kind: "mixed", value: firstValue, count: nodes.length };
      }
      continue;
    }

    if (hasEmpty) {
      return { kind: "mixed", value: nextValue, count: nodes.length };
    }

    if (!hasValue) {
      firstValue = nextValue;
      hasValue = true;
      continue;
    }

    if (!areComparableValuesEqual(firstValue, nextValue)) {
      return { kind: "mixed", value: firstValue, count: nodes.length };
    }
  }

  return hasValue
    ? { kind: "single", value: firstValue, count: nodes.length }
    : { kind: "empty", count: nodes.length };
}

/** Returns the distinct binding values (or null for unbound) with layer counts, for a mixed-state property. */
export function getMixedBindingValues(nodes: SelectionNodeInfo[], prop: BindableProperty): { binding: string | null; count: number }[] {
  const counts = new Map<string | null, number>();
  for (const node of nodes) {
    const val = node.bindings[prop] || null;
    counts.set(val, (counts.get(val) ?? 0) + 1);
  }
  // Sort: bound entries first (alphabetically), then unbound last
  return Array.from(counts.entries())
    .map(([binding, count]) => ({ binding, count }))
    .sort((a, b) => {
      if (a.binding === null && b.binding !== null) return 1;
      if (a.binding !== null && b.binding === null) return -1;
      return (a.binding ?? '').localeCompare(b.binding ?? '');
    });
}

export function getMergedCapabilities(nodes: SelectionNodeInfo[]): NodeCapabilities {
  if (nodes.length === 0) {
    return { hasFills: false, hasStrokes: false, hasAutoLayout: false, isText: false, hasEffects: false };
  }
  return {
    hasFills: nodes.some(n => n.capabilities.hasFills),
    hasStrokes: nodes.some(n => n.capabilities.hasStrokes),
    hasAutoLayout: nodes.some(n => n.capabilities.hasAutoLayout),
    isText: nodes.some(n => n.capabilities.isText),
    hasEffects: nodes.some(n => n.capabilities.hasEffects),
  };
}

export function formatCurrentValue(
  prop: BindableProperty,
  value: BindablePropertyValue | undefined,
): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (prop === 'opacity') {
      const norm = value > 1 ? value / 100 : value;
      return `${Math.round(norm * 100)}%`;
    }
    return `${Math.round(value * 100) / 100}`;
  }
  return formatTokenValueForDisplay(getTokenTypeForProperty(prop), value, {
    emptyPlaceholder: '',
  });
}

export function getTokenTypeForProperty(prop: BindableProperty): string {
  if (prop === 'fill' || prop === 'stroke') return 'color';
  if (['width', 'height', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
       'itemSpacing', 'cornerRadius', 'strokeWeight'].includes(prop)) return 'dimension';
  if (prop === 'opacity') return 'number';
  if (prop === 'typography') return 'typography';
  if (prop === 'shadow') return 'shadow';
  if (prop === 'visible') return 'boolean';
  console.warn(`[SelectionInspector] getTokenTypeForProperty: unhandled property "${prop}", falling back to "string"`);
  return 'string';
}

export function getCompatibleTokenTypes(prop: BindableProperty): string[] {
  return Object.entries(TOKEN_PROPERTY_MAP)
    .filter(([, props]) => (props as BindableProperty[]).includes(prop))
    .map(([type]) => type);
}

export function getTokenValueFromProp(
  prop: BindableProperty,
  currentValue: BindablePropertyValue | undefined,
): BindableTokenValue {
  const type = getTokenTypeForProperty(prop);
  if (type === 'color') return typeof currentValue === 'string' ? currentValue : '#000000';
  if (type === 'dimension') {
    const num = typeof currentValue === 'number' ? currentValue : 0;
    return { value: Math.round(num * 100) / 100, unit: 'px' };
  }
  if (type === 'number') return typeof currentValue === 'number' ? currentValue : 0;
  if (type === 'boolean') return typeof currentValue === 'boolean' ? currentValue : true;
  if (type === 'typography' || type === 'shadow') return currentValue ?? '';
  return typeof currentValue === 'string' ? currentValue : '';
}

export function formatTokenValuePreview(
  prop: BindableProperty,
  currentValue: BindablePropertyValue | undefined,
): string {
  return formatTokenValueForDisplay(
    getTokenTypeForProperty(prop),
    getTokenValueFromProp(prop, currentValue),
    { emptyPlaceholder: '' },
  );
}

export const SUGGESTED_NAMES: Record<BindableProperty, string> = {
  fill: 'color.fill-color',
  stroke: 'color.stroke-color',
  width: 'size.width',
  height: 'size.height',
  paddingTop: 'spacing.padding-top',
  paddingRight: 'spacing.padding-right',
  paddingBottom: 'spacing.padding-bottom',
  paddingLeft: 'spacing.padding-left',
  itemSpacing: 'spacing.item-spacing',
  cornerRadius: 'radius.corner-radius',
  strokeWeight: 'border.stroke-weight',
  opacity: 'opacity.opacity',
  typography: 'typography.text-style',
  shadow: 'shadow.box-shadow',
  visible: 'other.visibility',
};

const PROP_SUFFIX: Partial<Record<BindableProperty, string>> = {
  stroke: 'stroke',
  width: 'width',
  height: 'height',
  paddingTop: 'padding-top',
  paddingRight: 'padding-right',
  paddingBottom: 'padding-bottom',
  paddingLeft: 'padding-left',
  itemSpacing: 'gap',
  cornerRadius: 'radius',
  strokeWeight: 'stroke-weight',
};

function slugifyLayerName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'layer';
}

export function suggestTokenPath(prop: BindableProperty, layerName: string): string {
  const namespace = SUGGESTED_NAMES[prop].split('.')[0];
  const slug = slugifyLayerName(layerName);
  const suffix = PROP_SUFFIX[prop];
  return suffix ? `${namespace}.${slug}.${suffix}` : `${namespace}.${slug}`;
}

export function resolveTokenEntryDisplay(
  entry: TokenMapEntry,
  tokenMap: Record<string, TokenMapEntry>,
): { resolvedDisplay: string | null; resolvedColor: string | null } {
  const resolved = resolveTokenValue(entry.$value, entry.$type, tokenMap);
  const resolvedValue = resolved.value ?? entry.$value;
  const resolvedType =
    typeof resolved.$type === 'string' ? resolved.$type : entry.$type;

  const resolvedDisplay =
    resolvedValue == null
      ? null
      : formatTokenValueForDisplay(resolvedType, resolvedValue, {
          emptyPlaceholder: '',
        }) || null;

  const resolvedColor =
    resolvedType === 'color' &&
    typeof resolvedValue === 'string' &&
    resolvedValue.startsWith('#')
      ? resolvedValue
      : null;

  return { resolvedDisplay, resolvedColor };
}

/** Resolve a binding to its display string and optional color swatch */
export function resolveBindingDisplay(
  binding: string,
  tokenMap: Record<string, TokenMapEntry>,
): { resolvedDisplay: string | null; resolvedColor: string | null } {
  const entry = tokenMap[binding];
  if (!entry) return { resolvedDisplay: null, resolvedColor: null };
  return resolveTokenEntryDisplay(entry, tokenMap);
}

/**
 * Check whether a token's scopes (if any) allow it to be bound to a target property.
 * Tokens without scopes are unrestricted and pass all checks.
 */
export function isTokenScopeCompatible(
  entry: TokenMapEntry,
  targetProperty: BindableProperty,
): boolean {
  if (!entry.$scopes || entry.$scopes.length === 0) return true;
  return entry.$scopes.some(scope => {
    const allowedProps = SCOPE_TO_PROPERTIES[scope];
    return allowedProps?.includes(targetProperty);
  });
}

/** Return default Figma variable scopes for a given bindable property. */
export function getDefaultScopesForProperty(prop: BindableProperty): string[] {
  switch (prop) {
    case 'fill': return ['FILL_COLOR'];
    case 'stroke': return ['STROKE_COLOR'];
    case 'paddingTop': case 'paddingRight': case 'paddingBottom': case 'paddingLeft':
    case 'itemSpacing': return ['GAP'];
    case 'cornerRadius': return ['CORNER_RADIUS'];
    case 'width': case 'height': return ['WIDTH_HEIGHT'];
    case 'strokeWeight': return ['STROKE_FLOAT'];
    case 'opacity': return ['OPACITY'];
    case 'visible': return ['SHOW_HIDE'];
    default: return [];
  }
}

// ---------------------------------------------------------------------------
// Contextual bind-candidate scoring
// ---------------------------------------------------------------------------

/**
 * Parse a hex color string to {r,g,b} in 0-255. Returns null if not a valid hex.
 */
function parseHexToRGB(hex: string): { r: number; g: number; b: number } | null {
  if (!hex.startsWith('#')) return null;
  const h = hex.length === 4
    ? hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3]
    : hex.length >= 7 ? hex.slice(1, 7) : null;
  if (!h || !/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/**
 * Compute a 0-1 color similarity score (1 = identical, 0 = maximally different).
 * Uses Euclidean distance in RGB space (max distance ≈ 441).
 */
function colorSimilarity(hex1: string, hex2: string): number {
  const c1 = parseHexToRGB(hex1);
  const c2 = parseHexToRGB(hex2);
  if (!c1 || !c2) return 0;
  const dist = Math.sqrt((c1.r - c2.r) ** 2 + (c1.g - c2.g) ** 2 + (c1.b - c2.b) ** 2);
  return 1 - dist / 441.67; // 441.67 ≈ sqrt(3*255^2)
}

/**
 * Compute a 0-1 numeric similarity score for dimension/number values.
 * Uses ratio-based comparison so 8px vs 10px is "closer" than 100px vs 200px.
 */
function numericSimilarity(a: number, b: number): number {
  if (a === b) return 1;
  if (a === 0 && b === 0) return 1;
  const max = Math.max(Math.abs(a), Math.abs(b));
  if (max === 0) return 1;
  return 1 - Math.abs(a - b) / (max + Math.abs(a - b));
}

function readNumericTokenValue(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (
    typeof value === 'object' &&
    value !== null &&
    'value' in value &&
    typeof (value as { value?: unknown }).value === 'number'
  ) {
    return (value as { value: number }).value;
  }
  return null;
}

function areComparableValuesEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    if (left.length !== right.length) return false;
    return left.every((value, index) => areComparableValuesEqual(value, right[index]));
  }
  if (
    typeof left === 'object' &&
    left !== null &&
    typeof right === 'object' &&
    right !== null
  ) {
    const leftEntries = Object.entries(left as Record<string, unknown>);
    const rightEntries = Object.entries(right as Record<string, unknown>);
    if (leftEntries.length !== rightEntries.length) return false;
    return leftEntries.every(([key, value]) =>
      areComparableValuesEqual(value, (right as Record<string, unknown>)[key]),
    );
  }
  return false;
}

/**
 * Score a bind candidate for contextual ranking.
 *
 * Scoring dimensions (higher = more relevant):
 *  - Primary type match: token $type is the "primary" type for this property (+20)
 *  - Value similarity: resolved token value is close to current property value (+0-30)
 *  - Sibling usage: token is bound to the same property on sibling nodes (+25)
 *  - Same-node usage: token shares a path prefix with tokens already bound on this node (+10)
 */
export function scoreBindCandidate(
  tokenPath: string,
  entry: TokenMapEntry,
  prop: BindableProperty,
  currentValue: BindablePropertyValue | undefined,
  resolvedTokenValue: unknown,
  siblingBindings: Set<string>,
  nodeBoundPrefixes: Set<string>,
): number {
  let score = 0;

  // 1) Primary type match — the "natural" type for this property gets a boost
  const primaryType = getTokenTypeForProperty(prop);
  if (entry.$type === primaryType) {
    score += 20;
  }

  // 2) Value similarity
  if (currentValue != null && resolvedTokenValue != null) {
    if (entry.$type === 'color' && typeof resolvedTokenValue === 'string' && typeof currentValue === 'string') {
      const sim = colorSimilarity(currentValue, resolvedTokenValue);
      score += Math.round(sim * 30); // 0-30 points
    } else if ((entry.$type === 'dimension' || entry.$type === 'number') && currentValue != null) {
      const tokenNum = readNumericTokenValue(resolvedTokenValue);
      const propNum = typeof currentValue === 'number' ? currentValue : null;
      if (tokenNum != null && propNum != null) {
        const sim = numericSimilarity(propNum, tokenNum);
        score += Math.round(sim * 30);
      }
    } else if (entry.$type === 'boolean' && typeof currentValue === 'boolean') {
      if (currentValue === resolvedTokenValue) {
        score += 30;
      }
    } else if (areComparableValuesEqual(currentValue, resolvedTokenValue)) {
      score += 30;
    }
  }

  // 3) Sibling usage — tokens bound to same property on sibling nodes
  if (siblingBindings.has(tokenPath)) {
    score += 25;
  }

  // 4) Same-node context — token shares a path prefix with already-bound tokens
  const dotIdx = tokenPath.indexOf('.');
  if (dotIdx > 0) {
    const prefix = tokenPath.slice(0, dotIdx);
    if (nodeBoundPrefixes.has(prefix)) {
      score += 10;
    }
  }

  return score;
}

/**
 * Collect token paths bound to the same property on sibling/related nodes.
 * "Siblings" = all rootNodes (the full selection set).
 */
export function collectSiblingBindings(
  rootNodes: SelectionNodeInfo[],
  prop: BindableProperty,
): Set<string> {
  const paths = new Set<string>();
  for (const node of rootNodes) {
    const b = node.bindings[prop];
    if (b) paths.add(b);
  }
  return paths;
}

/**
 * Collect the top-level path prefixes of all tokens currently bound on the selected nodes.
 * E.g. if a node has fill bound to "color.primary", this returns Set{"color"}.
 */
export function collectBoundPrefixes(
  rootNodes: SelectionNodeInfo[],
): Set<string> {
  const prefixes = new Set<string>();
  for (const node of rootNodes) {
    for (const tokenPath of Object.values(node.bindings)) {
      if (!tokenPath) continue;
      const dotIdx = tokenPath.indexOf('.');
      if (dotIdx > 0) {
        prefixes.add(tokenPath.slice(0, dotIdx));
      }
    }
  }
  return prefixes;
}

// ---------------------------------------------------------------------------
// Auto-advance: find the next unbound property
// ---------------------------------------------------------------------------

/**
 * Iterate through all visible property groups and return the first unbound
 * property after `afterProp` (or the first unbound property if `afterProp` is null).
 */
export function getNextUnboundProperty(
  afterProp: BindableProperty | null,
  nodes: SelectionNodeInfo[],
  caps: NodeCapabilities,
): BindableProperty | null {
  // Build a flat ordered list of eligible properties
  const ordered: BindableProperty[] = [];
  for (const group of PROPERTY_GROUPS) {
    if (!shouldShowGroup(group.condition, caps)) continue;
    for (const prop of group.properties) {
      ordered.push(prop);
    }
  }
  // Find the start index (right after afterProp, or 0 if null)
  let startIdx = 0;
  if (afterProp !== null) {
    const idx = ordered.indexOf(afterProp);
    startIdx = idx >= 0 ? idx + 1 : 0;
  }
  // Search from startIdx to end, then wrap around
  for (let i = 0; i < ordered.length; i++) {
    const prop = ordered[(startIdx + i) % ordered.length];
    if (prop === afterProp) continue;
    const binding = getBindingForProperty(nodes, prop);
    if (!binding) {
      const valueState = getCurrentValueState(nodes, prop);
      if (valueState.kind === 'single') return prop;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Quick-bind: determine which properties a token can auto-bind to
// ---------------------------------------------------------------------------

const CAPABILITY_FILTER: Partial<Record<BindableProperty, keyof NodeCapabilities>> = {
  fill: 'hasFills',
  stroke: 'hasStrokes',
  paddingTop: 'hasAutoLayout',
  paddingRight: 'hasAutoLayout',
  paddingBottom: 'hasAutoLayout',
  paddingLeft: 'hasAutoLayout',
  itemSpacing: 'hasAutoLayout',
  typography: 'isText',
  shadow: 'hasEffects',
};

/**
 * Determine which bindable properties a token can be quickly applied to,
 * given the current selection. Filters by type, scope, capability, and
 * existing bindings (unbound properties only).
 */
export function getQuickBindTargets(
  tokenType: string,
  tokenScopes: string[] | undefined,
  selectedNodes: SelectionNodeInfo[],
): BindableProperty[] {
  if (selectedNodes.length === 0) return [];
  const typeProps = TOKEN_PROPERTY_MAP[tokenType];
  if (!typeProps || typeProps.length === 0) return [];

  const caps = getMergedCapabilities(selectedNodes);

  return typeProps.filter(prop => {
    // 1. Capability check — layer must support this property
    const capKey = CAPABILITY_FILTER[prop];
    if (capKey && !caps[capKey]) return false;

    // 2. Scope check — if token has scopes, it must include this property
    if (tokenScopes && tokenScopes.length > 0) {
      const scopeAllows = tokenScopes.some(scope => {
        const allowed = SCOPE_TO_PROPERTIES[scope];
        return allowed?.includes(prop);
      });
      if (!scopeAllows) return false;
    }

    // 3. Binding check — skip properties already bound on ALL selected nodes
    const binding = getBindingForProperty(selectedNodes, prop);
    if (binding && binding !== 'mixed') return false;

    return true;
  });
}

// ---------------------------------------------------------------------------
// Context-aware token surfacing
// ---------------------------------------------------------------------------

export type SuggestionConfidence = 'strong' | 'moderate' | 'weak';

export interface SuggestedToken {
  path: string;
  entry: TokenMapEntry;
  score: number;
  bestProperty: BindableProperty;
  resolvedValue: unknown;
  matchReason: 'value-match' | 'already-bound' | 'sibling-usage' | 'type-match';
  confidence: SuggestionConfidence;
  reason: string;
  /**
   * True when this token would have scored but is hidden because its $scopes
   * don't permit binding to bestProperty. Callers should hide these by default
   * and expose an opt-in reveal.
   */
  scopeHidden?: boolean;
}

/** Derive a confidence level and human-readable reason from a scored suggestion. */
export function classifySuggestion(
  score: number,
  matchReason: SuggestedToken['matchReason'],
): { confidence: SuggestionConfidence; reason: string } {
  if (matchReason === 'already-bound') {
    return { confidence: 'strong', reason: 'Currently bound' };
  }
  if (matchReason === 'value-match' && score >= 50) {
    return { confidence: 'strong', reason: 'Exact value match' };
  }
  if (matchReason === 'value-match') {
    return { confidence: 'moderate', reason: 'Similar value' };
  }
  if (matchReason === 'sibling-usage') {
    return { confidence: 'strong', reason: 'Used on siblings' };
  }
  // type-match fallbacks
  if (score >= 40) {
    return { confidence: 'moderate', reason: 'Same type, close value' };
  }
  if (score >= 20) {
    return { confidence: 'moderate', reason: 'Compatible type' };
  }
  return { confidence: 'weak', reason: 'All tokens of this type' };
}

/** Group and order suggestions by confidence, preserving score order within each group. */
export function groupSuggestionsByConfidence<T extends { confidence: SuggestionConfidence; score: number }>(
  items: T[],
): { confidence: SuggestionConfidence; items: T[] }[] {
  const order: SuggestionConfidence[] = ['strong', 'moderate', 'weak'];
  const groups: { confidence: SuggestionConfidence; items: T[] }[] = [];
  for (const level of order) {
    const matching = items.filter(s => s.confidence === level);
    if (matching.length > 0) {
      groups.push({ confidence: level, items: matching });
    }
  }
  return groups;
}

/** Labels for confidence group headers in suggestion lists. */
export const CONFIDENCE_LABELS: Record<SuggestionConfidence, string> = {
  strong: 'Best matches',
  moderate: 'Possible matches',
  weak: 'All tokens',
};

/**
 * Classify a raw bind-candidate score into a confidence level and reason string.
 * Used by PropertyRow and QuickApplyPicker for inline token lists.
 */
export function classifyBindScore(
  score: number,
  tokenPath: string,
  siblingBindings: Set<string>,
  currentBinding: string | null | 'mixed',
): { confidence: SuggestionConfidence; reason: string } {
  if (currentBinding === tokenPath) {
    return { confidence: 'strong', reason: 'Currently bound' };
  }
  if (siblingBindings.has(tokenPath)) {
    return { confidence: 'strong', reason: 'Used on siblings' };
  }
  if (score >= 45) {
    return { confidence: 'strong', reason: 'Close value match' };
  }
  if (score >= 20) {
    return { confidence: 'moderate', reason: 'Compatible type' };
  }
  return { confidence: 'weak', reason: 'All tokens of this type' };
}

export interface ApplyWorkflowSummary {
  selectionCount: number;
  hasSelection: boolean;
  hasAnyTokens: boolean;
  hasVisibleProperties: boolean;
  suggestionCount: number;
  visiblePropertyCount: number;
  boundPropertyCount: number;
  mixedPropertyCount: number;
  unboundPropertyCount: number;
  nextUnboundProperty: BindableProperty | null;
  allVisiblePropertiesBound: boolean;
}

export function summarizeApplyWorkflow(
  selectedNodes: SelectionNodeInfo[],
  tokenMap: Record<string, TokenMapEntry>,
): ApplyWorkflowSummary {
  const rootNodes = selectedNodes.filter((node) => (node.depth ?? 0) === 0);
  const hasSelection = rootNodes.length > 0;
  const hasAnyTokens = Object.keys(tokenMap).length > 0;
  const caps = getMergedCapabilities(rootNodes);

  let visiblePropertyCount = 0;
  let boundPropertyCount = 0;
  let mixedPropertyCount = 0;
  let unboundPropertyCount = 0;

  for (const group of PROPERTY_GROUPS) {
    if (!shouldShowGroup(group.condition, caps)) continue;
    for (const prop of group.properties) {
      const binding = getBindingForProperty(rootNodes, prop);
      const value = getCurrentValue(rootNodes, prop);
      if (!binding && value === undefined) continue;
      visiblePropertyCount += 1;
      if (binding === 'mixed') mixedPropertyCount += 1;
      else if (binding) boundPropertyCount += 1;
      else unboundPropertyCount += 1;
    }
  }

  const hasVisibleProperties = visiblePropertyCount > 0;
  const suggestionCount = hasSelection && hasAnyTokens
    ? rankTokensForSelection(rootNodes, tokenMap, caps).length
    : 0;
  const nextUnboundProperty = hasSelection ? getNextUnboundProperty(null, rootNodes, caps) : null;

  return {
    selectionCount: rootNodes.length,
    hasSelection,
    hasAnyTokens,
    hasVisibleProperties,
    suggestionCount,
    visiblePropertyCount,
    boundPropertyCount,
    mixedPropertyCount,
    unboundPropertyCount,
    nextUnboundProperty,
    allVisiblePropertiesBound: hasVisibleProperties && boundPropertyCount > 0 && nextUnboundProperty === null,
  };
}

/**
 * Rank all tokens by relevance to the current Figma selection and return the top N.
 * Aggregates scores across all visible, capable properties of the selection.
 */
export function rankTokensForSelection(
  rootNodes: SelectionNodeInfo[],
  tokenMap: Record<string, TokenMapEntry>,
  caps: NodeCapabilities,
  limit = 8,
): SuggestedToken[] {
  if (rootNodes.length === 0) return [];
  const tokenEntries = Object.entries(tokenMap);
  if (tokenEntries.length === 0) return [];

  // Collect eligible properties (visible + capable + has a current value)
  const eligibleProps: BindableProperty[] = [];
  for (const group of PROPERTY_GROUPS) {
    if (!shouldShowGroup(group.condition, caps)) continue;
    for (const prop of group.properties) {
      const capKey = CAPABILITY_FILTER[prop];
      if (capKey && !caps[capKey]) continue;
      const valueState = getCurrentValueState(rootNodes, prop);
      if (valueState.kind !== 'empty') eligibleProps.push(prop);
    }
  }
  if (eligibleProps.length === 0) return [];

  // Pre-compute context data per property
  const propContext = new Map<BindableProperty, {
    currentValue: BindablePropertyValue | undefined;
    compatibleTypes: Set<string>;
    siblingBindings: Set<string>;
    existingBinding: string | null | 'mixed';
  }>();
  const boundPrefixes = collectBoundPrefixes(rootNodes);

  for (const prop of eligibleProps) {
    const valueState = getCurrentValueState(rootNodes, prop);
    propContext.set(prop, {
      currentValue: valueState.kind === 'single' ? valueState.value : undefined,
      compatibleTypes: new Set(getCompatibleTokenTypes(prop)),
      siblingBindings: collectSiblingBindings(rootNodes, prop),
      existingBinding: getBindingForProperty(rootNodes, prop),
    });
  }

  // Score each token across all eligible properties, keep best
  const scored: SuggestedToken[] = [];

  for (const [tokenPath, entry] of tokenEntries) {
    let bestScore = -1;
    let bestProp: BindableProperty = eligibleProps[0];
    let bestReason: SuggestedToken['matchReason'] = 'type-match';
    let bestResolved: unknown = null;
    let bestScopeHidden = false;

    // Quick check: does this token type match ANY eligible property?
    const tokenType = entry.$type;
    const typeProps = TOKEN_PROPERTY_MAP[tokenType];
    if (!typeProps || typeProps.length === 0) continue;

    // Resolve the token value once (used for similarity scoring)
    const resolved = resolveTokenValue(entry.$value, entry.$type, tokenMap);
    const resolvedValue = resolved.value;

    for (const prop of eligibleProps) {
      const ctx = propContext.get(prop)!;

      // Type compatibility check
      if (!ctx.compatibleTypes.has(tokenType)) continue;

      const scopeOk = isTokenScopeCompatible(entry, prop);

      // Use existing scoring infrastructure
      const score = scoreBindCandidate(
        tokenPath, entry, prop, ctx.currentValue, resolvedValue,
        ctx.siblingBindings, boundPrefixes,
      );

      // Bonus: already bound on this selection (+15)
      let bonus = 0;
      let reason: SuggestedToken['matchReason'] = 'type-match';
      if (ctx.existingBinding === tokenPath) {
        bonus += 15;
        reason = 'already-bound';
      } else if (ctx.siblingBindings.has(tokenPath)) {
        reason = 'sibling-usage';
      } else if (score >= 40) {
        // High value similarity
        reason = 'value-match';
      }

      const total = score + bonus;
      // Prefer scope-compatible matches: a compatible property with any score
      // outranks a scope-hidden one, regardless of raw score.
      const currentIsBetter =
        bestScore < 0 ||
        (bestScopeHidden && scopeOk) ||
        (bestScopeHidden === !scopeOk && total > bestScore);
      if (currentIsBetter) {
        bestScore = total;
        bestProp = prop;
        bestReason = reason;
        bestResolved = resolvedValue;
        bestScopeHidden = !scopeOk;
      }
    }

    // Minimum threshold to avoid surfacing irrelevant tokens
    if (bestScore >= 15) {
      const { confidence, reason } = classifySuggestion(bestScore, bestReason);
      scored.push({
        path: tokenPath,
        entry,
        score: bestScore,
        bestProperty: bestProp,
        resolvedValue: bestResolved,
        matchReason: bestReason,
        confidence,
        reason,
        scopeHidden: bestScopeHidden || undefined,
      });
    }
  }

  // Sort descending by score and return top N
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

/** Build an undo slot for removing a single binding */
export function buildRemoveBindingUndo(
  binding: string,
  prop: BindableProperty,
  tokenMap: Record<string, TokenMapEntry>,
): UndoSlot {
  const entry = tokenMap[binding];
  const tokenType = entry?.$type ?? getTokenTypeForProperty(prop);
  const resolved = entry ? resolveTokenValue(entry.$value, entry.$type, tokenMap) : { value: null };
  const resolvedValue = resolved.value;
  return {
    description: `Removed binding "${binding}" from ${PROPERTY_LABELS[prop]}`,
    restore: async () => {
      parent.postMessage({
        pluginMessage: {
          type: 'apply-to-selection',
          tokenPath: binding,
          tokenType,
          targetProperty: prop,
          resolvedValue,
        },
      }, '*');
    },
  };
}
