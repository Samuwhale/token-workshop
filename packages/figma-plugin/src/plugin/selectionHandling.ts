import { ALL_BINDABLE_PROPERTIES, LEGACY_KEY_MAP } from '../shared/types.js';
import type { ExtractedTokenEntry, NodeCapabilities, NodeCurrentValues, SelectionNodeInfo, TokenMapEntry, ResolvedTokenValue, TypographyValue, DimensionValue, BorderValue, ShadowTokenValue } from '../shared/types.js';
import { isAlias, resolveTokenValue } from '../shared/resolveAlias.js';
import { getErrorMessage } from '../shared/utils.js';
import { PLUGIN_DATA_NAMESPACE } from './constants.js';
import { parseColor, rgbToHex, parseDimValue, shadowTokenToEffects } from './colorUtils.js';
import { resolveStyleForWeight, fontStyleToWeight } from './fontLoading.js';
import { walkNodes } from './walkNodes.js';

// Apply a resolved token value to a specific node property
export async function applyTokenValue(node: SceneNode, property: string, value: ResolvedTokenValue, tokenType: string) {
  switch (property) {
    case 'fill':
      if ('fills' in node) {
        const colorVal = value as (Record<string, unknown> | string | null);
        const color = parseColor(typeof value === 'string' ? value : (colorVal as { color?: string })?.color as string || value as string);
        if (color) {
          (node as GeometryMixin & SceneNode).fills = [{ type: 'SOLID', color: color.rgb, opacity: color.a }];
        }
      }
      break;

    case 'stroke':
      if ('strokes' in node) {
        const strokeNode = node as GeometryMixin & SceneNode;
        if (tokenType === 'border' && typeof value === 'object' && value !== null) {
          const borderVal = value as BorderValue;
          const color = parseColor(borderVal.color);
          if (color) {
            strokeNode.strokes = [{ type: 'SOLID', color: color.rgb, opacity: color.a }];
          }
          if ('strokeWeight' in node && borderVal.width != null) {
            (node as Record<string, unknown>)['strokeWeight'] = parseDimValue(borderVal.width);
          }
          if ('dashPattern' in node && borderVal.style === 'dashed') {
            (node as Record<string, unknown>)['dashPattern'] = [8, 8];
          }
        } else {
          const colorVal = value as (Record<string, unknown> | string | null);
          const color = parseColor(typeof value === 'string' ? value : (colorVal as { color?: string })?.color as string || value as string);
          if (color) {
            strokeNode.strokes = [{ type: 'SOLID', color: color.rgb, opacity: color.a }];
          }
        }
      }
      break;

    case 'width':
      if ('resize' in node) {
        const w = parseDimValue(value as string | number | DimensionValue | null);
        const resizableW = node as SceneNode & { resize(w: number, h: number): void; height: number };
        resizableW.resize(w, resizableW.height);
      }
      break;

    case 'height':
      if ('resize' in node) {
        const h = parseDimValue(value as string | number | DimensionValue | null);
        const resizableH = node as SceneNode & { resize(w: number, h: number): void; width: number };
        resizableH.resize(resizableH.width, h);
      }
      break;

    case 'paddingTop':
      if ('paddingTop' in node) (node as Record<string, unknown>)['paddingTop'] = parseDimValue(value as string | number | DimensionValue | null);
      break;
    case 'paddingRight':
      if ('paddingRight' in node) (node as Record<string, unknown>)['paddingRight'] = parseDimValue(value as string | number | DimensionValue | null);
      break;
    case 'paddingBottom':
      if ('paddingBottom' in node) (node as Record<string, unknown>)['paddingBottom'] = parseDimValue(value as string | number | DimensionValue | null);
      break;
    case 'paddingLeft':
      if ('paddingLeft' in node) (node as Record<string, unknown>)['paddingLeft'] = parseDimValue(value as string | number | DimensionValue | null);
      break;

    case 'itemSpacing':
      if ('itemSpacing' in node) (node as Record<string, unknown>)['itemSpacing'] = parseDimValue(value as string | number | DimensionValue | null);
      break;

    case 'cornerRadius':
      if ('cornerRadius' in node) (node as Record<string, unknown>)['cornerRadius'] = parseDimValue(value as string | number | DimensionValue | null);
      break;

    case 'strokeWeight':
      if ('strokeWeight' in node) (node as Record<string, unknown>)['strokeWeight'] = parseDimValue(value as string | number | DimensionValue | null);
      break;

    case 'opacity':
      if ('opacity' in node) {
        let num = typeof value === 'number' ? value : parseFloat(String(value));
        // DTCG number tokens for opacity should be 0–1, but values > 1 indicate
        // a percentage (0–100) — normalize to 0–1 to avoid silent clamping.
        if (!isNaN(num)) {
          if (num > 1) num = num / 100;
          (node as Record<string, unknown>)['opacity'] = Math.max(0, Math.min(1, num));
        }
      }
      break;

    case 'typography':
      if (node.type === 'TEXT') {
        const textNode = node as TextNode;
        if (value == null || typeof value !== 'object' || Array.isArray(value)) break;
        const val = value as TypographyValue;
        try {
          const family = (Array.isArray(val.fontFamily) ? val.fontFamily[0] : val.fontFamily) || 'Inter';
          const style = val.fontWeight ? await resolveStyleForWeight(family, val.fontWeight) : (val.fontStyle || 'Regular');
          await figma.loadFontAsync({ family, style });
          textNode.fontName = { family, style };
          if (val.fontSize) textNode.fontSize = typeof val.fontSize === 'object' ? val.fontSize.value : val.fontSize;
          if (val.lineHeight != null) {
            if (typeof val.lineHeight === 'number') {
              // DTCG spec: unitless lineHeight is a multiplier (1.5 = 150%)
              textNode.lineHeight = { unit: 'PERCENT', value: val.lineHeight * 100 };
            } else if (val.lineHeight?.unit === 'px') {
              textNode.lineHeight = { unit: 'PIXELS', value: val.lineHeight.value };
            } else if (val.lineHeight?.unit === '%') {
              textNode.lineHeight = { unit: 'PERCENT', value: val.lineHeight.value };
            }
          }
          if (val.letterSpacing != null) {
            textNode.letterSpacing = { unit: 'PIXELS', value: typeof val.letterSpacing === 'object' ? val.letterSpacing.value : val.letterSpacing };
          }
        } catch (err) {
          figma.notify(`Font not available: ${err}`);
        }
      }
      break;

    case 'shadow':
      if ('effects' in node) {
        (node as Record<string, unknown>)['effects'] = shadowTokenToEffects(value as ShadowTokenValue | ShadowTokenValue[]);
      }
      break;

    case 'visible':
      node.visible = Boolean(value);
      break;

    case 'composition': {
      // Map each property in the composition value to its inferred token type
      const propTypeMap: Record<string, string> = {
        fill: 'color', stroke: 'color',
        width: 'dimension', height: 'dimension',
        paddingTop: 'dimension', paddingRight: 'dimension',
        paddingBottom: 'dimension', paddingLeft: 'dimension',
        itemSpacing: 'dimension', cornerRadius: 'dimension', strokeWeight: 'dimension',
        opacity: 'number',
        visible: 'boolean',
        typography: 'typography',
        shadow: 'shadow',
      };
      const compVal = typeof value === 'object' && value !== null ? value : {};
      for (const [prop, propVal] of Object.entries(compVal)) {
        const propType = propTypeMap[prop] || 'string';
        await applyTokenValue(node, prop, propVal, propType);
      }
      break;
    }
  }
}

// Apply token to selected nodes
export async function applyToSelection(tokenPath: string, tokenType: string, targetProperty: string, resolvedValue: ResolvedTokenValue) {
  const selection = figma.currentPage.selection;
  if (selection.length === 0) {
    figma.notify('Select a layer first');
    return;
  }

  let applied = 0;
  const errors: string[] = [];
  for (const node of selection) {
    // Snapshot the relevant property before mutating so we can roll back on failure
    const snap = captureNodeProps(node, [targetProperty]);
    try {
      await applyTokenValue(node, targetProperty, resolvedValue, tokenType);
      node.setSharedPluginData(PLUGIN_DATA_NAMESPACE, targetProperty, tokenPath);
      applied++;
    } catch (err) {
      const msg = getErrorMessage(err);
      errors.push(`${node.name}: ${msg}`);
      console.error(`Failed to apply ${tokenPath} to ${node.name}:`, err);
      // Roll back any partial mutation on this node
      await restoreNodeProps(node, snap).catch(re =>
        console.error('[applyToSelection] rollback failed for', node.name, re)
      );
    }
  }

  if (applied === 0 && errors.length > 0) {
    figma.notify(`Failed to apply ${tokenPath}: ${errors[0]}`, { error: true });
  } else if (errors.length > 0) {
    figma.notify(`Applied ${tokenPath} to ${applied} layer(s); ${errors.length} failed`);
  } else {
    figma.notify(`Applied ${tokenPath} to ${applied} layer(s)`);
  }
  figma.ui.postMessage({ type: 'applied-to-selection', count: applied, errors, targetProperty });
  await getSelection(false);
}

// Remove a token binding from selected nodes
export async function removeBinding(property: string) {
  const selection = figma.currentPage.selection;
  const errors: string[] = [];
  for (const node of selection) {
    try {
      node.setSharedPluginData(PLUGIN_DATA_NAMESPACE, property, '');
    } catch (err) {
      const msg = getErrorMessage(err);
      errors.push(`${node.name}: ${msg}`);
      console.error(`Failed to remove binding for ${property} on ${node.name}:`, err);
    }
  }
  if (errors.length > 0) {
    figma.notify(`Failed to remove binding: ${errors[0]}`, { error: true });
  }
  await getSelection(false);
}

// Remove all token bindings from selected nodes
export async function clearAllBindings() {
  const selection = figma.currentPage.selection;
  const errors: string[] = [];
  for (const node of selection) {
    for (const prop of ALL_BINDABLE_PROPERTIES) {
      try {
        node.setSharedPluginData(PLUGIN_DATA_NAMESPACE, prop, '');
      } catch (err) {
        const msg = getErrorMessage(err);
        if (!errors.includes(msg)) errors.push(msg);
      }
    }
  }
  if (errors.length > 0) {
    figma.notify(`Failed to clear some bindings: ${errors[0]}`, { error: true });
  }
  await getSelection(false);
}

// Get node capabilities for UI filtering
function getNodeCapabilities(node: SceneNode): NodeCapabilities {
  return {
    hasFills: 'fills' in node,
    hasStrokes: 'strokes' in node,
    hasAutoLayout: 'paddingTop' in node,
    isText: node.type === 'TEXT',
    hasEffects: 'effects' in node,
  };
}

// Read current visual values from a node for display in the inspector
function readCurrentValues(node: SceneNode): NodeCurrentValues {
  const values: NodeCurrentValues = {};

  const n = node as Record<string, unknown>;
  if ('fills' in node) {
    const fills = n['fills'];
    if (Array.isArray(fills) && fills.length > 0 && fills[0].type === 'SOLID') {
      values.fill = rgbToHex(fills[0].color, fills[0].opacity ?? 1);
    }
  }
  if ('strokes' in node) {
    const strokes = n['strokes'];
    if (Array.isArray(strokes) && strokes.length > 0 && strokes[0].type === 'SOLID') {
      values.stroke = rgbToHex(strokes[0].color, strokes[0].opacity ?? 1);
    }
  }
  if ('width' in node) values.width = n['width'] as number;
  if ('height' in node) values.height = n['height'] as number;
  if ('opacity' in node) values.opacity = n['opacity'] as number;
  if ('cornerRadius' in node) values.cornerRadius = n['cornerRadius'] as number;
  if ('strokeWeight' in node) values.strokeWeight = n['strokeWeight'] as number;
  if ('paddingTop' in node) {
    values.paddingTop = n['paddingTop'] as number;
    values.paddingRight = n['paddingRight'] as number;
    values.paddingBottom = n['paddingBottom'] as number;
    values.paddingLeft = n['paddingLeft'] as number;
  }
  if ('itemSpacing' in node) values.itemSpacing = n['itemSpacing'] as number;
  if ('visible' in node) values.visible = node.visible;

  return values;
}

function readNodeBindings(node: SceneNode): Record<string, string> {
  const bindings: Record<string, string> = {};
  for (const prop of ALL_BINDABLE_PROPERTIES) {
    const val = node.getSharedPluginData(PLUGIN_DATA_NAMESPACE, prop);
    if (val) bindings[prop] = val;
  }
  for (const [legacyKey, newKey] of Object.entries(LEGACY_KEY_MAP)) {
    if (!bindings[newKey]) {
      const val = node.getSharedPluginData(PLUGIN_DATA_NAMESPACE, legacyKey);
      if (val) bindings[newKey] = val;
    }
  }
  return bindings;
}

function collectDescendantsWithBindings(node: SceneNode, depth: number): SelectionNodeInfo[] {
  const results: SelectionNodeInfo[] = [];
  if (!('children' in node)) return results;
  for (const child of (node as SceneNode & { children: readonly SceneNode[] }).children) {
    const bindings = readNodeBindings(child);
    if (Object.keys(bindings).length > 0) {
      results.push({
        id: child.id,
        name: child.name,
        type: child.type,
        bindings,
        capabilities: getNodeCapabilities(child),
        currentValues: readCurrentValues(child),
        depth,
        parentId: node.id,
      });
    }
    results.push(...collectDescendantsWithBindings(child, depth + 1));
  }
  return results;
}

export async function getSelection(deepInspectEnabled: boolean) {
  const selection = figma.currentPage.selection;
  const info: SelectionNodeInfo[] = selection.map(node => ({
    id: node.id,
    name: node.name,
    type: node.type,
    bindings: readNodeBindings(node),
    capabilities: getNodeCapabilities(node),
    currentValues: readCurrentValues(node),
    depth: 0,
  }));

  if (deepInspectEnabled) {
    for (const node of selection) {
      info.push(...collectDescendantsWithBindings(node, 1));
    }
  }

  figma.ui.postMessage({ type: 'selection', nodes: info });
}

// Extract tokenizable properties from the current selection
export async function extractTokensFromSelection() {
  const selection = figma.currentPage.selection;
  if (selection.length === 0) {
    figma.ui.postMessage({ type: 'extracted-tokens', tokens: [] });
    return;
  }

  const entries: ExtractedTokenEntry[] = [];

  function slugify(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'layer';
  }

  for (const node of selection) {
    const slug = slugify(node.name);
    const n = node as Record<string, unknown>;

    // Fill color
    if ('fills' in node) {
      const fills = n['fills'];
      if (Array.isArray(fills) && fills.length > 0 && fills[0].type === 'SOLID') {
        const hex = rgbToHex(fills[0].color, fills[0].opacity ?? 1);
        entries.push({
          property: 'fill',
          tokenType: 'color',
          suggestedName: `color.${slug}`,
          value: hex,
          layerName: node.name,
          layerId: node.id,
        });
      }
    }

    // Stroke color
    if ('strokes' in node) {
      const strokes = n['strokes'];
      if (Array.isArray(strokes) && strokes.length > 0 && strokes[0].type === 'SOLID') {
        const hex = rgbToHex(strokes[0].color, strokes[0].opacity ?? 1);
        entries.push({
          property: 'stroke',
          tokenType: 'color',
          suggestedName: `color.${slug}.stroke`,
          value: hex,
          layerName: node.name,
          layerId: node.id,
        });
      }
    }

    // Dimensions: width, height
    if ('width' in node && typeof n['width'] === 'number') {
      entries.push({
        property: 'width',
        tokenType: 'dimension',
        suggestedName: `size.${slug}.width`,
        value: { value: Math.round((n['width'] as number) * 100) / 100, unit: 'px' },
        layerName: node.name,
        layerId: node.id,
      });
    }
    if ('height' in node && typeof n['height'] === 'number') {
      entries.push({
        property: 'height',
        tokenType: 'dimension',
        suggestedName: `size.${slug}.height`,
        value: { value: Math.round((n['height'] as number) * 100) / 100, unit: 'px' },
        layerName: node.name,
        layerId: node.id,
      });
    }

    // Corner radius
    if ('cornerRadius' in node && typeof n['cornerRadius'] === 'number' && (n['cornerRadius'] as number) > 0) {
      entries.push({
        property: 'cornerRadius',
        tokenType: 'dimension',
        suggestedName: `radius.${slug}`,
        value: { value: n['cornerRadius'] as number, unit: 'px' },
        layerName: node.name,
        layerId: node.id,
      });
    }

    // Stroke weight
    if ('strokeWeight' in node && typeof n['strokeWeight'] === 'number' && (n['strokeWeight'] as number) > 0) {
      entries.push({
        property: 'strokeWeight',
        tokenType: 'dimension',
        suggestedName: `border.${slug}.stroke-weight`,
        value: { value: n['strokeWeight'] as number, unit: 'px' },
        layerName: node.name,
        layerId: node.id,
      });
    }

    // Padding / spacing (auto-layout frames)
    if ('paddingTop' in node) {
      const pt = n['paddingTop'] as number;
      const pr = n['paddingRight'] as number;
      const pb = n['paddingBottom'] as number;
      const pl = n['paddingLeft'] as number;
      if (pt > 0) entries.push({ property: 'paddingTop', tokenType: 'dimension', suggestedName: `spacing.${slug}.padding-top`, value: { value: pt, unit: 'px' }, layerName: node.name, layerId: node.id });
      if (pr > 0) entries.push({ property: 'paddingRight', tokenType: 'dimension', suggestedName: `spacing.${slug}.padding-right`, value: { value: pr, unit: 'px' }, layerName: node.name, layerId: node.id });
      if (pb > 0) entries.push({ property: 'paddingBottom', tokenType: 'dimension', suggestedName: `spacing.${slug}.padding-bottom`, value: { value: pb, unit: 'px' }, layerName: node.name, layerId: node.id });
      if (pl > 0) entries.push({ property: 'paddingLeft', tokenType: 'dimension', suggestedName: `spacing.${slug}.padding-left`, value: { value: pl, unit: 'px' }, layerName: node.name, layerId: node.id });
    }
    if ('itemSpacing' in node && typeof n['itemSpacing'] === 'number' && (n['itemSpacing'] as number) > 0) {
      entries.push({
        property: 'itemSpacing',
        tokenType: 'dimension',
        suggestedName: `spacing.${slug}.gap`,
        value: { value: n['itemSpacing'] as number, unit: 'px' },
        layerName: node.name,
        layerId: node.id,
      });
    }

    // Border (stroke + strokeWeight combined)
    if ('strokes' in node && 'strokeWeight' in node) {
      const strokes = n['strokes'];
      const sw = n['strokeWeight'];
      if (Array.isArray(strokes) && strokes.length > 0 && strokes[0].type === 'SOLID' && typeof sw === 'number' && sw > 0) {
        const hex = rgbToHex(strokes[0].color, strokes[0].opacity ?? 1);
        entries.push({
          property: 'border',
          tokenType: 'border',
          suggestedName: `border.${slug}`,
          value: { color: hex, width: { value: sw, unit: 'px' }, style: 'solid' },
          layerName: node.name,
          layerId: node.id,
        });
      }
    }

    // Typography (TEXT nodes only)
    if (node.type === 'TEXT') {
      const textNode = node as TextNode;
      const fontName = textNode.fontName;
      const fontSize = textNode.fontSize;
      if (fontName !== figma.mixed && fontSize !== figma.mixed) {
        const weight = fontStyleToWeight(fontName.style);
        const typoValue: TypographyValue = {
          fontFamily: fontName.family,
          fontWeight: weight,
          fontSize: { value: fontSize, unit: 'px' },
        };
        const lh = textNode.lineHeight;
        if (lh !== figma.mixed) {
          if (lh.unit === 'PIXELS') {
            typoValue.lineHeight = { value: lh.value, unit: 'px' };
          } else if (lh.unit === 'PERCENT') {
            typoValue.lineHeight = lh.value / 100;
          }
        }
        const ls = textNode.letterSpacing;
        if (ls !== figma.mixed && ls.unit === 'PIXELS' && ls.value !== 0) {
          typoValue.letterSpacing = { value: ls.value, unit: 'px' };
        }
        entries.push({
          property: 'typography',
          tokenType: 'typography',
          suggestedName: `typography.${slug}`,
          value: typoValue,
          layerName: node.name,
          layerId: node.id,
        });
      }
    }

    // Shadow / effects
    if ('effects' in node) {
      const effects = n['effects'];
      if (Array.isArray(effects)) {
        const shadows = effects.filter((e: Effect) =>
          (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') && e.visible !== false
        ) as (DropShadowEffect | InnerShadowEffect)[];
        if (shadows.length > 0) {
          const shadowValue: ShadowTokenValue[] = shadows.map((s) => ({
            type: s.type === 'INNER_SHADOW' ? 'innerShadow' : 'dropShadow',
            color: rgbToHex(s.color, s.color.a ?? 1),
            offsetX: { value: s.offset.x, unit: 'px' },
            offsetY: { value: s.offset.y, unit: 'px' },
            blur: { value: s.radius, unit: 'px' },
            spread: { value: (s as DropShadowEffect).spread ?? 0, unit: 'px' },
          } as ShadowTokenValue));
          entries.push({
            property: 'shadow',
            tokenType: 'shadow',
            suggestedName: `shadow.${slug}`,
            value: shadowValue.length === 1 ? shadowValue[0] : shadowValue,
            layerName: node.name,
            layerId: node.id,
          });
        }
      }
    }

    // Opacity (only if non-default)
    if ('opacity' in node && typeof n['opacity'] === 'number' && (n['opacity'] as number) < 1) {
      entries.push({
        property: 'opacity',
        tokenType: 'number',
        suggestedName: `opacity.${slug}`,
        value: Math.round((n['opacity'] as number) * 100) / 100,
        layerName: node.name,
        layerId: node.id,
      });
    }
  }

  // Deduplicate entries with identical type+value: keep first, set layerCount
  const deduped: ExtractedTokenEntry[] = [];
  const seen = new Map<string, number>(); // valueKey -> index in deduped
  for (const entry of entries) {
    const valueKey = `${entry.tokenType}::${JSON.stringify(entry.value)}`;
    const existing = seen.get(valueKey);
    if (existing !== undefined) {
      deduped[existing].layerCount = (deduped[existing].layerCount ?? 1) + 1;
      deduped[existing].layerIds!.push(entry.layerId);
    } else {
      seen.set(valueKey, deduped.length);
      deduped.push({ ...entry, layerCount: 1, layerIds: [entry.layerId] });
    }
  }

  figma.ui.postMessage({ type: 'extracted-tokens', tokens: deduped });
}

// Select canvas layers that are bound to a specific token path
export async function highlightLayersByToken(tokenPath: string) {
  const nodes = figma.currentPage.findAll(node => {
    for (const prop of ALL_BINDABLE_PROPERTIES) {
      if (node.getSharedPluginData(PLUGIN_DATA_NAMESPACE, prop) === tokenPath) return true;
    }
    for (const legacyKey of Object.keys(LEGACY_KEY_MAP)) {
      if (node.getSharedPluginData(PLUGIN_DATA_NAMESPACE, legacyKey) === tokenPath) return true;
    }
    return false;
  });
  if (nodes.length > 0) {
    figma.currentPage.selection = nodes as SceneNode[];
    figma.viewport.scrollAndZoomIntoView(nodes as SceneNode[]);
  }
}

// Remap stored binding paths from old token paths to new token paths.
export async function remapBindings(remapMap: Record<string, string>, scope: 'selection' | 'page', deepInspectEnabled: boolean) {
  const entries = Object.entries(remapMap).filter(([oldPath, newPath]) => oldPath && newPath && oldPath !== newPath);
  if (entries.length === 0) {
    figma.ui.postMessage({ type: 'remap-complete', updatedBindings: 0, updatedNodes: 0 });
    return;
  }

  // Pre-operation snapshot: captures current binding paths for each node before any mutation.
  // Keyed by node id; used to restore original paths if the operation fails mid-way through.
  const nodeSnapshots = new Map<string, { node: SceneNode; bindings: Record<string, string> }>();

  try {
    const nodes = collectNodesForScope(scope);
    const total = nodes.length;

    let updatedBindings = 0;
    let updatedNodes = 0;
    const REMAP_BATCH = 100;

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      let nodeUpdated = false;

      // Capture current binding paths for this node before any mutation
      const currentBindings: Record<string, string> = {};
      for (const prop of ALL_BINDABLE_PROPERTIES) {
        const val = node.getSharedPluginData(PLUGIN_DATA_NAMESPACE, prop);
        if (val) currentBindings[prop] = val;
      }
      nodeSnapshots.set(node.id, { node, bindings: currentBindings });

      for (const prop of ALL_BINDABLE_PROPERTIES) {
        const current = currentBindings[prop];
        if (!current) continue;
        const next = remapMap[current];
        if (next) {
          node.setSharedPluginData(PLUGIN_DATA_NAMESPACE, prop, next);
          updatedBindings++;
          nodeUpdated = true;
        }
      }
      if (nodeUpdated) updatedNodes++;
      // Report progress every REMAP_BATCH nodes so UI stays responsive
      if ((i + 1) % REMAP_BATCH === 0 || i === nodes.length - 1) {
        figma.ui.postMessage({ type: 'remap-progress', processed: i + 1, total });
      }
    }

    figma.ui.postMessage({ type: 'remap-complete', updatedBindings, updatedNodes });

    const label = `Remapped ${updatedBindings} binding${updatedBindings !== 1 ? 's' : ''} across ${updatedNodes} layer${updatedNodes !== 1 ? 's' : ''}`;
    figma.notify(updatedBindings > 0 ? label : 'No matching bindings found');

    // Refresh selection so the inspector shows updated paths
    await getSelection(deepInspectEnabled);
  } catch (err) {
    // Restore all binding paths to their pre-operation values
    for (const { node, bindings } of nodeSnapshots.values()) {
      for (const prop of ALL_BINDABLE_PROPERTIES) {
        const original = bindings[prop] ?? '';
        try {
          node.setSharedPluginData(PLUGIN_DATA_NAMESPACE, prop, original);
        } catch (re) {
          console.error('[remapBindings] rollback failed for', node.name, prop, re);
        }
      }
    }
    const message = getErrorMessage(err, 'Unknown error');
    figma.ui.postMessage({ type: 'remap-complete', updatedBindings: 0, updatedNodes: 0, error: message });
    figma.notify(`Remap failed: ${message}`, { error: true });
  }
}

// Collect nodes for a scope-based operation.
// 'selection' includes the selected nodes and all their descendants.
// 'page' collects all nodes on the current page, optionally filtered.
function collectNodesForScope(
  scope: 'selection' | 'page',
  filter?: (node: SceneNode) => boolean,
): SceneNode[] {
  if (scope === 'selection') {
    const roots = [...figma.currentPage.selection];
    const all: SceneNode[] = [];
    for (const root of roots) {
      if (!filter || filter(root)) all.push(root);
      if ('findAll' in root) {
        (root as FrameNode).findAll(filter ?? (() => true)).forEach(n => all.push(n));
      }
    }
    return all;
  }
  return figma.currentPage.findAll(filter ?? (() => true));
}

// Maps binding key names (used as plugin data keys) to the actual Figma node
// property names that must be read/written for snapshot and restore.
// Keys not listed here map 1-to-1 (binding key === Figma property name).
const BINDING_TO_FIGMA_PROPS: Record<string, string[]> = {
  fill:       ['fills'],
  stroke:     ['strokes'],
  shadow:     ['effects'],
  typography: ['fontName', 'fontSize', 'lineHeight', 'letterSpacing'],
};

// Snapshot readable properties of a node for the given binding keys.
// Snapshots are keyed by Figma property name (not binding key) so that
// restoreNodeProps can assign them back directly.
function captureNodeProps(node: SceneNode, bindingProps: string[]): Record<string, unknown> {
  const snap: Record<string, unknown> = {};
  for (const bindingProp of bindingProps) {
    const figmaProps = BINDING_TO_FIGMA_PROPS[bindingProp] ?? [bindingProp];
    for (const prop of figmaProps) {
      try {
        const val = (node as Record<string, unknown>)[prop];
        if (val === undefined) continue;
        // figma.mixed is a Symbol — JSON.stringify silently drops Symbols, losing the value.
        // Store the reference directly so restoreNodeProps can assign it back.
        if (val === figma.mixed) {
          snap[prop] = figma.mixed;
          continue;
        }
        snap[prop] = JSON.parse(JSON.stringify(val));
      } catch (e) { console.debug('[selectionHandling] skip unreadable or unserializable property:', prop, e); }
    }
  }
  return snap;
}

// Restore previously captured node properties.
async function restoreNodeProps(node: SceneNode, snap: Record<string, unknown>): Promise<void> {
  for (const [prop, val] of Object.entries(snap)) {
    try {
      if ((prop === 'width' || prop === 'height') && 'resize' in node) {
        const rn = node as SceneNode & { resize(w: number, h: number): void; width: number; height: number };
        if (prop === 'width') rn.resize(val as number, rn.height);
        else rn.resize(rn.width, val as number);
      } else {
        (node as Record<string, unknown>)[prop] = val;
      }
    } catch (e) { console.debug('[selectionHandling] restoreNodeProps: failed to restore property:', prop, e); }
  }
}

// Scan the current page and build a map of tokenPath → number of layers using it
export async function scanTokenUsageMap(signal?: { aborted: boolean }) {
  const usageMap: Record<string, number> = {};
  for await (const node of walkNodes(figma.currentPage.children, { signal })) {
    if (signal?.aborted) {
      figma.ui.postMessage({ type: 'token-usage-map-cancelled' });
      return;
    }
    const seen = new Set<string>();
    for (const prop of ALL_BINDABLE_PROPERTIES) {
      const tokenPath = node.getSharedPluginData(PLUGIN_DATA_NAMESPACE, prop);
      if (tokenPath && !seen.has(tokenPath)) {
        seen.add(tokenPath);
        usageMap[tokenPath] = (usageMap[tokenPath] || 0) + 1;
      }
    }
    for (const [legacyKey] of Object.entries(LEGACY_KEY_MAP)) {
      const tokenPath = node.getSharedPluginData(PLUGIN_DATA_NAMESPACE, legacyKey);
      if (tokenPath && !seen.has(tokenPath)) {
        seen.add(tokenPath);
        usageMap[tokenPath] = (usageMap[tokenPath] || 0) + 1;
      }
    }
  }
  if (signal?.aborted) {
    figma.ui.postMessage({ type: 'token-usage-map-cancelled' });
    return;
  }
  figma.ui.postMessage({ type: 'token-usage-map', usageMap });
}

// Sync all bindings on the page or selection with latest token values
export async function syncBindings(tokenMap: Record<string, TokenMapEntry>, scope: 'page' | 'selection') {
  const nodes = collectNodesForScope(scope, node => {
    for (const prop of ALL_BINDABLE_PROPERTIES) {
      if (node.getSharedPluginData(PLUGIN_DATA_NAMESPACE, prop)) return true;
    }
    for (const legacyKey of Object.keys(LEGACY_KEY_MAP)) {
      if (node.getSharedPluginData(PLUGIN_DATA_NAMESPACE, legacyKey)) return true;
    }
    return false;
  });

  let updated = 0;
  let skipped = 0;
  let errors = 0;
  const missingTokens = new Set<string>();
  const BATCH_SIZE = 50;

  // Pre-operation snapshots: keyed by node id so we can restore on unexpected failure
  const nodeSnapshots = new Map<string, { node: SceneNode; props: Record<string, unknown> }>();

  try {
    for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
      const batch = nodes.slice(i, i + BATCH_SIZE);

      for (const node of batch) {
        // Collect bindings, including legacy remapping
        const bindings: Record<string, string> = {};
        for (const prop of ALL_BINDABLE_PROPERTIES) {
          const val = node.getSharedPluginData(PLUGIN_DATA_NAMESPACE, prop);
          if (val) bindings[prop] = val;
        }
        for (const [legacyKey, newKey] of Object.entries(LEGACY_KEY_MAP)) {
          if (!bindings[newKey]) {
            const val = node.getSharedPluginData(PLUGIN_DATA_NAMESPACE, legacyKey);
            if (val) {
              bindings[newKey] = val;
              // Migrate legacy key to new key
              node.setSharedPluginData(PLUGIN_DATA_NAMESPACE, newKey, val);
              node.setSharedPluginData(PLUGIN_DATA_NAMESPACE, legacyKey, '');
            }
          }
        }

        // Snapshot current property values before any mutations on this node
        if (!nodeSnapshots.has(node.id)) {
          nodeSnapshots.set(node.id, { node, props: captureNodeProps(node, Object.keys(bindings)) });
        }

        let nodeUpdated = 0;
        let nodeErrors = 0;
        for (const [prop, tokenPath] of Object.entries(bindings)) {
          const entry = tokenMap[tokenPath];
          if (!entry) {
            // Track missing tokens distinctly — do not count them as skipped.
            // The missingTokens array is sent in the sync-complete message.
            missingTokens.add(tokenPath);
            continue;
          }
          // Resolve alias references before applying
          let value = entry.$value;
          let type = entry.$type;
          if (isAlias(value)) {
            const resolved = resolveTokenValue(value, type, tokenMap);
            if (resolved.error || resolved.value === null) {
              console.warn(`Alias resolution failed for ${tokenPath}: ${resolved.error}`);
              skipped++;
              continue;
            }
            value = resolved.value;
            type = resolved.$type;
          }
          try {
            await applyTokenValue(node, prop, value as ResolvedTokenValue, type);
            nodeUpdated++;
          } catch (err) {
            console.error(`Sync error on ${node.name}.${prop}:`, err);
            nodeErrors++;
          }
        }

        if (nodeErrors > 0) {
          // Any property failure means the node is left in a partial state — roll it back entirely
          const snap = nodeSnapshots.get(node.id);
          if (snap) {
            await restoreNodeProps(snap.node, snap.props).catch(re =>
              console.error('[syncBindings] per-node rollback failed:', re)
            );
            nodeSnapshots.delete(node.id); // prevent double-restore in outer catch
          }
          errors += nodeErrors;
        } else {
          updated += nodeUpdated;
        }
      }

      // Report progress
      figma.ui.postMessage({
        type: 'sync-progress',
        processed: Math.min(i + BATCH_SIZE, nodes.length),
        total: nodes.length,
      });

      // Note: do NOT yield with setTimeout between batches here — it breaks Figma's
      // automatic undo grouping, causing each batch to become a separate undo step.
      // The await calls to applyTokenValue (which uses Figma async APIs like
      // loadFontAsync) already yield to the runtime without breaking the undo group.
    }

    const missingArr = [...missingTokens];
    figma.ui.postMessage({
      type: 'sync-complete',
      updated,
      skipped,
      errors,
      missingTokens: missingArr,
    });

    const summaryParts = [`${updated} updated`];
    if (skipped > 0) summaryParts.push(`${skipped} skipped`);
    if (missingArr.length > 0) summaryParts.push(`${missingArr.length} missing token${missingArr.length !== 1 ? 's' : ''}`);
    if (errors > 0) summaryParts.push(`${errors} error${errors !== 1 ? 's' : ''}`);
    figma.notify(`Synced: ${summaryParts.join(', ')}`);
  } catch (outerError) {
    // An unexpected error broke out of the batch loop — roll back all node changes applied so far
    let rolledBack = false;
    try {
      for (const { node, props } of nodeSnapshots.values()) {
        await restoreNodeProps(node, props);
      }
      rolledBack = true;
    } catch (rollbackError) {
      console.error('[syncSelectionTokens] rollback failed:', rollbackError);
    }

    figma.ui.postMessage({
      type: 'sync-complete',
      updated: 0,
      skipped: 0,
      errors: nodes.length,
      missingTokens: [],
      error: String(outerError),
      rolledBack,
      rollbackError: rolledBack ? undefined : 'Rollback failed — partial changes may persist. Check console for details.',
    });

    figma.notify(`Sync failed — ${rolledBack ? 'changes rolled back' : 'partial changes may persist'}`, { error: true });
  }
}

// Search layers on the current page by name, type, or component name
export function searchLayers(query: string) {
  const q = query.toLowerCase().trim();
  if (!q) {
    figma.ui.postMessage({ type: 'search-layers-result', results: [] });
    return;
  }

  const results: Array<{ id: string; name: string; type: string; parentName?: string; boundCount: number }> = [];
  const MAX_RESULTS = 50;
  let totalSearched = 0;

  const stack: SceneNode[] = [...figma.currentPage.children];
  while (stack.length > 0 && results.length < MAX_RESULTS) {
    const node = stack.pop()!;
    totalSearched++;

    // Check match: name or type
    const nameMatch = node.name.toLowerCase().includes(q);
    const typeMatch = node.type.toLowerCase().includes(q);
    // For component instances, also match the main component name
    let componentMatch = false;
    if (node.type === 'INSTANCE') {
      const inst = node as InstanceNode;
      if (inst.mainComponent?.name?.toLowerCase().includes(q)) {
        componentMatch = true;
      }
    }

    if (nameMatch || typeMatch || componentMatch) {
      let boundCount = 0;
      for (const prop of ALL_BINDABLE_PROPERTIES) {
        if (node.getSharedPluginData(PLUGIN_DATA_NAMESPACE, prop)) boundCount++;
      }
      const parentName = node.parent && node.parent.type !== 'PAGE' ? node.parent.name : undefined;
      results.push({ id: node.id, name: node.name, type: node.type, parentName, boundCount });
    }

    // Push children (depth-first)
    if ('children' in node) {
      const children = (node as ChildrenMixin & SceneNode).children;
      for (let i = children.length - 1; i >= 0; i--) {
        stack.push(children[i]);
      }
    }
  }

  figma.ui.postMessage({ type: 'search-layers-result', results, totalSearched });
}

// Check if a node supports a given bindable property
function nodeSupportsProperty(node: SceneNode, property: string): boolean {
  switch (property) {
    case 'fill': return 'fills' in node;
    case 'stroke': return 'strokes' in node;
    case 'width': case 'height': return 'resize' in node;
    case 'paddingTop': case 'paddingRight': case 'paddingBottom': case 'paddingLeft':
    case 'itemSpacing': return 'paddingTop' in node;
    case 'cornerRadius': return 'cornerRadius' in node;
    case 'strokeWeight': return 'strokeWeight' in node;
    case 'opacity': return 'opacity' in node;
    case 'typography': return node.type === 'TEXT';
    case 'shadow': return 'effects' in node;
    case 'visible': return 'visible' in node;
    default: return false;
  }
}

// Find sibling layers (same parent) that support the given property and don't already have it bound
export function findPeersForProperty(nodeId: string, property: string) {
  let sourceNode: BaseNode | null = null;
  try {
    sourceNode = figma.getNodeById(nodeId);
  } catch (e) {
    console.debug('[selectionHandling] findPeersForProperty: node lookup failed for', nodeId, e);
    figma.ui.postMessage({ type: 'peers-for-property-result', nodeIds: [], property });
    return;
  }
  if (!sourceNode || !('parent' in sourceNode) || !sourceNode.parent) {
    figma.ui.postMessage({ type: 'peers-for-property-result', nodeIds: [], property });
    return;
  }

  const parent = sourceNode.parent;
  if (!('children' in parent)) {
    figma.ui.postMessage({ type: 'peers-for-property-result', nodeIds: [], property });
    return;
  }

  const peerIds: string[] = [];
  for (const child of (parent as ChildrenMixin).children) {
    if (child.id === nodeId) continue;
    if (!nodeSupportsProperty(child as SceneNode, property)) continue;
    // Skip if already bound to this property
    const existing = child.getSharedPluginData(PLUGIN_DATA_NAMESPACE, property);
    if (existing) continue;
    peerIds.push(child.id);
  }

  figma.ui.postMessage({ type: 'peers-for-property-result', nodeIds: peerIds, property });
}

// Apply a token binding to specific nodes by ID (without changing the current selection)
export async function applyToNodes(
  nodeIds: string[],
  tokenPath: string,
  tokenType: string,
  targetProperty: string,
  resolvedValue: ResolvedTokenValue,
) {
  let applied = 0;
  const errors: string[] = [];
  const total = nodeIds.length;

  for (let i = 0; i < nodeIds.length; i++) {
    const id = nodeIds[i];
    try {
      const node = await figma.getNodeByIdAsync(id);
      if (!node || !('parent' in node)) continue;
      const sceneNode = node as SceneNode;
      await applyTokenValue(sceneNode, targetProperty, resolvedValue, tokenType);
      sceneNode.setSharedPluginData(PLUGIN_DATA_NAMESPACE, targetProperty, tokenPath);
      applied++;
    } catch (err) {
      errors.push(getErrorMessage(err));
    }
    if (total > 1) {
      figma.ui.postMessage({ type: 'apply-progress', processed: i + 1, total });
    }
  }

  if (applied > 0) {
    figma.notify(`Applied ${tokenPath} to ${applied} additional layer${applied !== 1 ? 's' : ''}`);
  } else if (errors.length > 0) {
    figma.notify(`Failed to apply: ${errors[0]}`, { error: true });
  }

  figma.ui.postMessage({ type: 'applied-to-nodes', count: applied, errors });
  // Refresh selection so bindings show correctly
  await getSelection(false);
}

// Remove a token binding from a specific node by ID (without changing the current selection)
export async function removeBindingFromNode(nodeId: string, property: string) {
  try {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node || !('parent' in node)) {
      figma.ui.postMessage({ type: 'removed-binding-from-node', success: false, error: 'Node not found' });
      return;
    }
    const sceneNode = node as SceneNode;
    sceneNode.setSharedPluginData(PLUGIN_DATA_NAMESPACE, property, '');
    figma.ui.postMessage({ type: 'removed-binding-from-node', success: true, nodeId, property });
  } catch (err) {
    const msg = getErrorMessage(err);
    figma.notify(`Failed to remove binding: ${msg}`, { error: true });
    figma.ui.postMessage({ type: 'removed-binding-from-node', success: false, error: msg });
  }
  await getSelection(false);
}
