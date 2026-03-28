import type { BindableProperty, SelectionNodeInfo, NodeCapabilities, TokenMapEntry } from '../../shared/types';
import { TOKEN_PROPERTY_MAP, PROPERTY_LABELS, SCOPE_TO_PROPERTIES, PROPERTY_GROUPS } from '../../shared/types';
import { resolveTokenValue } from '../../shared/resolveAlias';
import { isDimensionLike } from './generators/generatorShared';
import type { UndoSlot } from '../hooks/useUndo';

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

export function getCurrentValue(nodes: SelectionNodeInfo[], prop: BindableProperty): any {
  if (nodes.length === 0) return undefined;
  return nodes[0].currentValues[prop];
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

export function formatCurrentValue(prop: BindableProperty, value: any): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (prop === 'opacity') {
      const norm = value > 1 ? value / 100 : value;
      return `${Math.round(norm * 100)}%`;
    }
    return `${Math.round(value * 100) / 100}`;
  }
  if (typeof value === 'string') return value;
  return '';
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

export function getTokenValueFromProp(prop: BindableProperty, currentValue: any): any {
  const type = getTokenTypeForProperty(prop);
  if (type === 'color') return typeof currentValue === 'string' ? currentValue : '#000000';
  if (type === 'dimension') {
    const num = typeof currentValue === 'number' ? currentValue : 0;
    return { value: Math.round(num * 100) / 100, unit: 'px' };
  }
  if (type === 'number') return typeof currentValue === 'number' ? currentValue : 0;
  if (type === 'boolean') return typeof currentValue === 'boolean' ? currentValue : true;
  return currentValue ?? '';
}

export function formatTokenValuePreview(prop: BindableProperty, currentValue: any): string {
  const type = getTokenTypeForProperty(prop);
  if (type === 'color') return typeof currentValue === 'string' ? currentValue : '#000000';
  if (type === 'dimension') {
    const num = typeof currentValue === 'number' ? currentValue : 0;
    return `${Math.round(num * 100) / 100}px`;
  }
  if (type === 'number') return String(typeof currentValue === 'number' ? currentValue : 0);
  if (type === 'boolean') return String(currentValue);
  return formatCurrentValue(prop, currentValue);
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

/** Resolve a binding to its display string and optional color swatch */
export function resolveBindingDisplay(
  binding: string,
  tokenMap: Record<string, TokenMapEntry>,
): { resolvedDisplay: string | null; resolvedColor: string | null } {
  const entry = tokenMap[binding];
  if (!entry) return { resolvedDisplay: null, resolvedColor: null };
  const resolved = resolveTokenValue(entry.$value, entry.$type, tokenMap);
  let resolvedDisplay: string | null = null;
  let resolvedColor: string | null = null;
  if (resolved.value != null) {
    if (typeof resolved.value === 'string') {
      resolvedDisplay = resolved.value;
      if (resolved.value.startsWith('#')) resolvedColor = resolved.value;
    } else if (isDimensionLike(resolved.value)) {
      resolvedDisplay = `${resolved.value.value}${resolved.value.unit}`;
    }
  }
  return { resolvedDisplay, resolvedColor };
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
  if (!h) return null;
  const n = parseInt(h, 16);
  if (isNaN(n)) return null;
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
  currentValue: any,
  resolvedTokenValue: any,
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
      const tokenNum = typeof resolvedTokenValue === 'object' && resolvedTokenValue?.value != null
        ? resolvedTokenValue.value
        : typeof resolvedTokenValue === 'number' ? resolvedTokenValue : null;
      const propNum = typeof currentValue === 'number' ? currentValue : null;
      if (tokenNum != null && propNum != null) {
        const sim = numericSimilarity(propNum, tokenNum);
        score += Math.round(sim * 30);
      }
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

/**
 * Find the next visible, unbound property after `afterProp`.
 * Walks PROPERTY_GROUPS in display order, skipping until past `afterProp`,
 * then returns the first unbound property with a non-null current value.
 * Returns null if all remaining properties are bound.
 */
export function getNextUnboundProperty(
  afterProp: BindableProperty | null,
  rootNodes: SelectionNodeInfo[],
  caps: NodeCapabilities,
): BindableProperty | null {
  let pastAfterProp = afterProp === null;
  for (const group of PROPERTY_GROUPS) {
    if (!shouldShowGroup(group.condition, caps)) continue;
    for (const prop of group.properties) {
      if (!pastAfterProp) {
        if (prop === afterProp) pastAfterProp = true;
        continue;
      }
      const value = getCurrentValue(rootNodes, prop);
      if (value === undefined || value === null) continue;
      const binding = getBindingForProperty(rootNodes, prop);
      if (!binding) return prop;
    }
  }
  return null;
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
