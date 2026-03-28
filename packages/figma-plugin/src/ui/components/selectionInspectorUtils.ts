import type { BindableProperty, SelectionNodeInfo, NodeCapabilities, TokenMapEntry } from '../../shared/types';
import { TOKEN_PROPERTY_MAP, PROPERTY_LABELS, SCOPE_TO_PROPERTIES } from '../../shared/types';
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
    if (prop === 'opacity') return `${Math.round(value * 100)}%`;
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
