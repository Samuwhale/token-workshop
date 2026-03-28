import { ALL_BINDABLE_PROPERTIES, LEGACY_KEY_MAP } from '../shared/types.js';
import { isAlias, resolveTokenValue } from '../shared/resolveAlias.js';
import { getErrorMessage } from '../shared/utils.js';
import { PLUGIN_DATA_NAMESPACE } from './constants.js';
import { parseColor, rgbToHex, parseDimValue } from './colorUtils.js';
import { resolveStyleForWeight } from './fontLoading.js';

// Apply a resolved token value to a specific node property
export async function applyTokenValue(node: SceneNode, property: string, value: any, tokenType: string) {
  switch (property) {
    case 'fill':
      if ('fills' in node) {
        const color = parseColor(typeof value === 'string' ? value : value?.color || value);
        if (color) {
          (node as GeometryMixin & SceneNode).fills = [{ type: 'SOLID', color: color.rgb, opacity: color.a }];
        }
      }
      break;

    case 'stroke':
      if ('strokes' in node) {
        const strokeNode = node as GeometryMixin & SceneNode;
        if (tokenType === 'border' && typeof value === 'object') {
          const color = parseColor(value.color);
          if (color) {
            strokeNode.strokes = [{ type: 'SOLID', color: color.rgb, opacity: color.a }];
          }
          if ('strokeWeight' in node && value.width != null) {
            (node as Record<string, unknown>)['strokeWeight'] = parseDimValue(value.width);
          }
          if ('dashPattern' in node && value.style === 'dashed') {
            (node as Record<string, unknown>)['dashPattern'] = [8, 8];
          }
        } else {
          const color = parseColor(typeof value === 'string' ? value : value?.color || value);
          if (color) {
            strokeNode.strokes = [{ type: 'SOLID', color: color.rgb, opacity: color.a }];
          }
        }
      }
      break;

    case 'width':
      if ('resize' in node) {
        const w = parseDimValue(value);
        const resizableW = node as SceneNode & { resize(w: number, h: number): void; height: number };
        resizableW.resize(w, resizableW.height);
      }
      break;

    case 'height':
      if ('resize' in node) {
        const h = parseDimValue(value);
        const resizableH = node as SceneNode & { resize(w: number, h: number): void; width: number };
        resizableH.resize(resizableH.width, h);
      }
      break;

    case 'paddingTop':
      if ('paddingTop' in node) (node as Record<string, unknown>)['paddingTop'] = parseDimValue(value);
      break;
    case 'paddingRight':
      if ('paddingRight' in node) (node as Record<string, unknown>)['paddingRight'] = parseDimValue(value);
      break;
    case 'paddingBottom':
      if ('paddingBottom' in node) (node as Record<string, unknown>)['paddingBottom'] = parseDimValue(value);
      break;
    case 'paddingLeft':
      if ('paddingLeft' in node) (node as Record<string, unknown>)['paddingLeft'] = parseDimValue(value);
      break;

    case 'itemSpacing':
      if ('itemSpacing' in node) (node as Record<string, unknown>)['itemSpacing'] = parseDimValue(value);
      break;

    case 'cornerRadius':
      if ('cornerRadius' in node) (node as Record<string, unknown>)['cornerRadius'] = parseDimValue(value);
      break;

    case 'strokeWeight':
      if ('strokeWeight' in node) (node as Record<string, unknown>)['strokeWeight'] = parseDimValue(value);
      break;

    case 'opacity':
      if ('opacity' in node) {
        const num = typeof value === 'number' ? value : parseFloat(value);
        if (!isNaN(num)) (node as Record<string, unknown>)['opacity'] = Math.max(0, Math.min(1, num));
      }
      break;

    case 'typography':
      if (node.type === 'TEXT') {
        const textNode = node as TextNode;
        const val = value;
        try {
          const family = (Array.isArray(val.fontFamily) ? val.fontFamily[0] : val.fontFamily) || 'Inter';
          const style = val.fontWeight ? await resolveStyleForWeight(family, val.fontWeight) : (val.fontStyle || 'Regular');
          await figma.loadFontAsync({ family, style });
          textNode.fontName = { family, style };
          if (val.fontSize) textNode.fontSize = typeof val.fontSize === 'object' ? val.fontSize.value : val.fontSize;
          if (val.lineHeight != null) {
            if (typeof val.lineHeight === 'number') {
              textNode.lineHeight = { unit: 'PERCENT', value: val.lineHeight * 100 };
            } else if (val.lineHeight?.unit === 'px') {
              textNode.lineHeight = { unit: 'PIXELS', value: val.lineHeight.value };
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
        const shadows = Array.isArray(value) ? value : [value];
        (node as Record<string, unknown>)['effects'] = shadows.map((s: Record<string, unknown>) => {
          const color = parseColor(s['color']);
          return {
            type: s['type'] === 'innerShadow' ? 'INNER_SHADOW' : 'DROP_SHADOW',
            color: color ? { ...color.rgb, a: color.a } : { r: 0, g: 0, b: 0, a: 0.25 },
            offset: { x: parseDimValue(s['offsetX']), y: parseDimValue(s['offsetY']) },
            radius: parseDimValue(s['blur']),
            spread: parseDimValue(s['spread']),
            visible: true,
            blendMode: 'NORMAL',
          } as DropShadowEffect;
        });
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
export async function applyToSelection(tokenPath: string, tokenType: string, targetProperty: string, resolvedValue: any) {
  const selection = figma.currentPage.selection;
  if (selection.length === 0) {
    figma.notify('Select a layer first');
    return;
  }

  let applied = 0;
  const errors: string[] = [];
  for (const node of selection) {
    try {
      await applyTokenValue(node, targetProperty, resolvedValue, tokenType);
      node.setSharedPluginData(PLUGIN_DATA_NAMESPACE, targetProperty, tokenPath);
      applied++;
    } catch (err) {
      const msg = getErrorMessage(err);
      errors.push(`${node.name}: ${msg}`);
      console.error(`Failed to apply ${tokenPath} to ${node.name}:`, err);
    }
  }

  if (applied === 0 && errors.length > 0) {
    figma.notify(`Failed to apply ${tokenPath}: ${errors[0]}`, { error: true });
  } else if (errors.length > 0) {
    figma.notify(`Applied ${tokenPath} to ${applied} layer(s); ${errors.length} failed`);
  } else {
    figma.notify(`Applied ${tokenPath} to ${applied} layer(s)`);
  }
  figma.ui.postMessage({ type: 'applied-to-selection', count: applied, errors });
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
function getNodeCapabilities(node: SceneNode) {
  return {
    hasFills: 'fills' in node,
    hasStrokes: 'strokes' in node,
    hasAutoLayout: 'paddingTop' in node,
    isText: node.type === 'TEXT',
    hasEffects: 'effects' in node,
  };
}

// Read current visual values from a node for display in the inspector
function readCurrentValues(node: SceneNode): Record<string, any> {
  const values: Record<string, any> = {};

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
  if ('width' in node) values.width = n['width'];
  if ('height' in node) values.height = n['height'];
  if ('opacity' in node) values.opacity = n['opacity'];
  if ('cornerRadius' in node) values.cornerRadius = n['cornerRadius'];
  if ('strokeWeight' in node) values.strokeWeight = n['strokeWeight'];
  if ('paddingTop' in node) {
    values.paddingTop = n['paddingTop'];
    values.paddingRight = n['paddingRight'];
    values.paddingBottom = n['paddingBottom'];
    values.paddingLeft = n['paddingLeft'];
  }
  if ('itemSpacing' in node) values.itemSpacing = n['itemSpacing'];
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

function collectDescendantsWithBindings(node: SceneNode, depth: number): any[] {
  const results: any[] = [];
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
  const info: any[] = selection.map(node => {
    return {
      id: node.id,
      name: node.name,
      type: node.type,
      bindings: readNodeBindings(node),
      capabilities: getNodeCapabilities(node),
      currentValues: readCurrentValues(node),
      depth: 0,
    };
  });

  if (deepInspectEnabled) {
    for (const node of selection) {
      info.push(...collectDescendantsWithBindings(node, 1));
    }
  }

  figma.ui.postMessage({ type: 'selection', nodes: info });
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

  try {
    // Collect nodes to scan
    let nodes: SceneNode[];
    if (scope === 'selection') {
      // Include the selected nodes AND all their descendants
      const roots = [...figma.currentPage.selection];
      const all: SceneNode[] = [];
      for (const root of roots) {
        all.push(root);
        if ('findAll' in root) {
          (root as FrameNode).findAll(() => true).forEach(n => all.push(n));
        }
      }
      nodes = all;
    } else {
      nodes = figma.currentPage.findAll(() => true);
    }

    let updatedBindings = 0;
    let updatedNodes = 0;

    for (const node of nodes) {
      let nodeUpdated = false;
      for (const prop of ALL_BINDABLE_PROPERTIES) {
        const current = node.getSharedPluginData(PLUGIN_DATA_NAMESPACE, prop);
        if (!current) continue;
        const next = remapMap[current];
        if (next) {
          node.setSharedPluginData(PLUGIN_DATA_NAMESPACE, prop, next);
          updatedBindings++;
          nodeUpdated = true;
        }
      }
      if (nodeUpdated) updatedNodes++;
    }

    figma.ui.postMessage({ type: 'remap-complete', updatedBindings, updatedNodes });

    const label = `Remapped ${updatedBindings} binding${updatedBindings !== 1 ? 's' : ''} across ${updatedNodes} layer${updatedNodes !== 1 ? 's' : ''}`;
    figma.notify(updatedBindings > 0 ? label : 'No matching bindings found');

    // Refresh selection so the inspector shows updated paths
    await getSelection(deepInspectEnabled);
  } catch (err) {
    const message = getErrorMessage(err, 'Unknown error');
    figma.ui.postMessage({ type: 'remap-complete', updatedBindings: 0, updatedNodes: 0, error: message });
    figma.notify(`Remap failed: ${message}`, { error: true });
  }
}

// Snapshot readable properties of a node for the given binding keys.
function captureNodeProps(node: SceneNode, bindingProps: string[]): Record<string, unknown> {
  const snap: Record<string, unknown> = {};
  for (const prop of bindingProps) {
    try {
      const val = (node as Record<string, unknown>)[prop];
      if (val !== undefined) {
        snap[prop] = JSON.parse(JSON.stringify(val));
      }
    } catch { /* skip unreadable or unserializable properties */ }
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
    } catch { /* ignore individual restore errors */ }
  }
}

// Sync all bindings on the page or selection with latest token values
export async function syncBindings(tokenMap: Record<string, { $value: any; $type: string }>, scope: 'page' | 'selection') {
  let nodes: SceneNode[];
  if (scope === 'selection') {
    // Include the selected nodes AND all their descendants
    const roots = [...figma.currentPage.selection];
    const all: SceneNode[] = [];
    for (const root of roots) {
      all.push(root);
      if ('findAll' in root) {
        (root as FrameNode).findAll(() => true).forEach(n => all.push(n));
      }
    }
    nodes = all;
  } else {
    nodes = figma.currentPage.findAll(node => {
      for (const prop of ALL_BINDABLE_PROPERTIES) {
        if (node.getSharedPluginData(PLUGIN_DATA_NAMESPACE, prop)) return true;
      }
      for (const legacyKey of Object.keys(LEGACY_KEY_MAP)) {
        if (node.getSharedPluginData(PLUGIN_DATA_NAMESPACE, legacyKey)) return true;
      }
      return false;
    });
  }

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

        for (const [prop, tokenPath] of Object.entries(bindings)) {
          const entry = tokenMap[tokenPath];
          if (!entry) {
            missingTokens.add(tokenPath);
            skipped++;
            continue;
          }
          // Resolve alias references before applying
          let value = entry.$value;
          let type = entry.$type;
          if (isAlias(value)) {
            const resolved = resolveTokenValue(value, type, tokenMap);
            if (resolved.error) {
              console.warn(`Alias resolution failed for ${tokenPath}: ${resolved.error}`);
              skipped++;
              continue;
            }
            value = resolved.value;
            type = resolved.$type;
          }
          try {
            await applyTokenValue(node, prop, value, type);
            updated++;
          } catch (err) {
            console.error(`Sync error on ${node.name}.${prop}:`, err);
            errors++;
          }
        }
      }

      // Report progress
      figma.ui.postMessage({
        type: 'sync-progress',
        processed: Math.min(i + BATCH_SIZE, nodes.length),
        total: nodes.length,
      });

      // Yield between batches
      if (i + BATCH_SIZE < nodes.length) {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
    }

    const missingArr = [...missingTokens];
    figma.ui.postMessage({
      type: 'sync-complete',
      updated,
      skipped,
      errors,
      missingTokens: missingArr,
    });

    const summary = `Synced: ${updated} updated, ${skipped} skipped${errors ? `, ${errors} errors` : ''}`;
    figma.notify(summary);
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
