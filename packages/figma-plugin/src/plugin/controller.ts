// This runs in Figma's sandbox (no DOM access)

import { ALL_BINDABLE_PROPERTIES, LEGACY_KEY_MAP } from '../shared/types.js';

const SERVER_URL = 'http://localhost:9400';
const PLUGIN_DATA_NAMESPACE = 'tokenmanager';
const VARIABLE_COLLECTION_NAME = 'TokenManager';

figma.showUI(__html__, { width: 400, height: 600, themeColors: true });

let deepInspectEnabled = false;

// Handle messages from UI
figma.ui.onmessage = async (msg: PluginMessage) => {
  switch (msg.type) {
    case 'apply-variables':
      await applyVariables(msg.tokens, msg.collectionMap ?? {}, msg.modeMap ?? {});
      break;
    case 'apply-styles':
      await applyStyles(msg.tokens);
      break;
    case 'read-variables':
      await readFigmaVariables(msg.correlationId);
      break;
    case 'read-styles':
      await readFigmaStyles();
      break;
    case 'export-all-variables':
      await exportAllVariables();
      break;
    case 'apply-to-selection':
      await applyToSelection(msg.tokenPath, msg.tokenType, msg.targetProperty, msg.resolvedValue);
      break;
    case 'get-selection':
      await getSelection();
      break;
    case 'set-deep-inspect':
      deepInspectEnabled = msg.enabled;
      await getSelection();
      break;
    case 'remove-binding':
      await removeBinding(msg.property);
      break;
    case 'sync-bindings':
      await syncBindings(msg.tokenMap, msg.scope);
      break;
    case 'remap-bindings':
      await remapBindings(msg.remapMap, msg.scope);
      break;
    case 'highlight-layer-by-token':
      await highlightLayersByToken(msg.tokenPath);
      break;
    case 'notify':
      figma.notify(msg.message);
      break;
    case 'resize':
      figma.ui.resize(msg.width, msg.height);
      break;
    case 'delete-orphan-variables':
      await deleteOrphanVariables(msg.knownPaths);
      break;
    case 'scan-component-coverage':
      await scanComponentCoverage();
      break;
    case 'select-node':
      await selectNode(msg.nodeId);
      break;
    case 'scan-canvas-heatmap':
      await scanCanvasHeatmap();
      break;
    case 'select-heatmap-nodes':
      await selectHeatmapNodes(msg.nodeIds);
      break;
    case 'eyedropper':
      sampleSelectionColor();
      break;
    case 'get-active-themes': {
      const key = `active-themes:${figma.fileKey ?? 'default'}`;
      const themes = await figma.clientStorage.getAsync(key);
      figma.ui.postMessage({ type: 'active-themes-loaded', themes: themes ?? {} });
      break;
    }
    case 'set-active-themes': {
      const key = `active-themes:${figma.fileKey ?? 'default'}`;
      if (msg.themes && Object.keys(msg.themes).length > 0) {
        await figma.clientStorage.setAsync(key, msg.themes);
      } else {
        await figma.clientStorage.deleteAsync(key);
      }
      break;
    }
  }
};

// Message types
interface PluginMessage {
  type: string;
  [key: string]: any;
}

// Sample fill color from the first selected node and send it back to UI
function sampleSelectionColor() {
  const sel = figma.currentPage.selection;
  if (sel.length === 0) {
    figma.notify('Select a layer to sample its fill color');
    return;
  }
  const node = sel[0];
  if (!('fills' in node) || !Array.isArray(node.fills) || node.fills.length === 0) {
    figma.notify('Selected layer has no fills');
    return;
  }
  const fill = (node.fills as readonly Paint[]).find((f): f is SolidPaint => f.type === 'SOLID' && f.visible !== false);
  if (!fill) {
    figma.notify('No solid fill found on selected layer');
    return;
  }
  const { r, g, b } = fill.color;
  const toHex = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
  let hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  if (fill.opacity !== undefined && fill.opacity < 1) {
    hex += toHex(fill.opacity);
  }
  figma.ui.postMessage({ type: 'eyedropper-result', hex });
}

// Apply tokens as Figma variables
async function applyVariables(tokens: any[], collectionMap: Record<string, string> = {}, modeMap: Record<string, string> = {}) {
  try {
    // Get or create collection by name, with caching
    const existingCollections = await figma.variables.getLocalVariableCollectionsAsync();
    const collectionCache = new Map<string, VariableCollection>(
      existingCollections.map(c => [c.name, c])
    );

    const getOrCreateCollection = (name: string): VariableCollection => {
      let col = collectionCache.get(name);
      if (!col) {
        col = figma.variables.createVariableCollection(name);
        collectionCache.set(name, col);
      }
      return col;
    };

    // Find or create a mode by name within a collection
    const getOrCreateMode = (collection: VariableCollection, modeName: string): string => {
      const existing = collection.modes.find(m => m.name === modeName);
      if (existing) return existing.modeId;
      // Create a new mode; Figma API: collection.addMode(name) returns the new modeId
      return collection.addMode(modeName);
    };

    // Load all local variables once to avoid redundant async calls per token
    const localVariables = await figma.variables.getLocalVariablesAsync();

    for (const token of tokens) {
      const variableType = mapTokenTypeToVariableType(token.$type);
      if (!variableType) continue;

      // Resolve which collection this token belongs to
      const colName = (token.setName && collectionMap[token.setName])
        ? collectionMap[token.setName]
        : VARIABLE_COLLECTION_NAME;
      const collection = getOrCreateCollection(colName);

      // Find existing or create new
      const existing = findVariableInList(localVariables, collection.id, token.path);
      let variable: Variable;

      if (existing) {
        variable = existing;
      } else {
        variable = figma.variables.createVariable(token.path, collection, variableType);
      }

      // Resolve the target mode: use modeMap if provided, otherwise fall back to first mode
      const desiredModeName = token.setName ? modeMap[token.setName] : undefined;
      const modeId = desiredModeName
        ? getOrCreateMode(collection, desiredModeName)
        : collection.modes[0].modeId;
      const figmaValue = convertToFigmaValue(token.$value, token.$type);
      if (figmaValue !== null) {
        variable.setValueForMode(modeId, figmaValue);
      }

      // Apply scopes if specified (read from $extensions or legacy $scopes)
      const scopeOverrides: string[] = (
        (Array.isArray(token.$extensions?.['com.figma.scopes']) ? token.$extensions['com.figma.scopes'] : null) ??
        (Array.isArray(token.$scopes) ? token.$scopes : null) ??
        []
      );
      if (scopeOverrides.length > 0) {
        (variable as Variable & { scopes: string[] }).scopes = scopeOverrides;
      }

      // Store mapping in shared plugin data
      variable.setPluginData('tokenPath', token.path);
      variable.setPluginData('tokenSet', token.setName || '');
    }

    figma.ui.postMessage({ type: 'variables-applied', count: tokens.length });
  } catch (error) {
    figma.ui.postMessage({ type: 'error', message: String(error) });
  }
}

// Apply tokens as Figma styles
async function applyStyles(tokens: any[]) {
  for (const token of tokens) {
    try {
      if (token.$type === 'color') {
        await applyPaintStyle(token);
      } else if (token.$type === 'gradient') {
        await applyGradientPaintStyle(token);
      } else if (token.$type === 'typography') {
        await applyTextStyle(token);
      } else if (token.$type === 'shadow') {
        await applyEffectStyle(token);
      }
    } catch (error) {
      console.error(`Failed to apply style for ${token.path}:`, error);
    }
  }
  figma.ui.postMessage({ type: 'styles-applied', count: tokens.length });
}

async function applyPaintStyle(token: any) {
  const styles = await figma.getLocalPaintStylesAsync();
  let style = styles.find(s => s.name === token.path.replace(/\./g, '/'));
  if (!style) {
    style = figma.createPaintStyle();
    style.name = token.path.replace(/\./g, '/');
  }
  const color = parseColor(token.$value);
  if (color) {
    style.paints = [{ type: 'SOLID', color: color.rgb, opacity: color.a }];
  }
  style.setPluginData('tokenPath', token.path);
}

async function applyGradientPaintStyle(token: any) {
  const styles = await figma.getLocalPaintStylesAsync();
  let style = styles.find(s => s.name === token.path.replace(/\./g, '/'));
  if (!style) {
    style = figma.createPaintStyle();
    style.name = token.path.replace(/\./g, '/');
  }
  const stops: Array<{ color: string; position: number }> = Array.isArray(token.$value) ? token.$value : [];
  const gradientStops: ColorStop[] = stops
    .map(stop => {
      const color = parseColor(stop.color);
      if (!color) return null;
      return { position: stop.position, color: { ...color.rgb, a: color.a } } as ColorStop;
    })
    .filter((s): s is ColorStop => s !== null);
  if (gradientStops.length >= 2) {
    style.paints = [{
      type: 'GRADIENT_LINEAR',
      gradientTransform: [[1, 0, 0], [0, 1, 0]],
      gradientStops,
      opacity: 1,
    } as GradientPaint];
  }
  style.setPluginData('tokenPath', token.path);
}

async function applyTextStyle(token: any) {
  const styles = await figma.getLocalTextStylesAsync();
  let style = styles.find(s => s.name === token.path.replace(/\./g, '/'));
  if (!style) {
    style = figma.createTextStyle();
    style.name = token.path.replace(/\./g, '/');
  }
  const val = token.$value;
  if (val.fontFamily) {
    style.fontName = { family: Array.isArray(val.fontFamily) ? val.fontFamily[0] : val.fontFamily, style: val.fontStyle || 'Regular' };
  }
  if (val.fontSize) style.fontSize = typeof val.fontSize === 'object' ? val.fontSize.value : val.fontSize;
  if (val.lineHeight) {
    if (typeof val.lineHeight === 'number') {
      style.lineHeight = { unit: 'PERCENT', value: val.lineHeight * 100 };
    } else if (val.lineHeight.unit === 'px') {
      style.lineHeight = { unit: 'PIXELS', value: val.lineHeight.value };
    }
  }
  if (val.letterSpacing) {
    style.letterSpacing = { unit: 'PIXELS', value: typeof val.letterSpacing === 'object' ? val.letterSpacing.value : val.letterSpacing };
  }
  style.setPluginData('tokenPath', token.path);
}

async function applyEffectStyle(token: any) {
  const styles = await figma.getLocalEffectStylesAsync();
  let style = styles.find(s => s.name === token.path.replace(/\./g, '/'));
  if (!style) {
    style = figma.createEffectStyle();
    style.name = token.path.replace(/\./g, '/');
  }
  const shadows = Array.isArray(token.$value) ? token.$value : [token.$value];
  style.effects = shadows.map((s: any) => {
    const color = parseColor(s.color);
    return {
      type: s.type === 'innerShadow' ? 'INNER_SHADOW' : 'DROP_SHADOW',
      color: color ? { ...color.rgb, a: color.a } : { r: 0, g: 0, b: 0, a: 0.25 },
      offset: { x: parseDimValue(s.offsetX), y: parseDimValue(s.offsetY) },
      radius: parseDimValue(s.blur),
      spread: parseDimValue(s.spread),
      visible: true,
      blendMode: 'NORMAL',
    } as DropShadowEffect;
  });
  style.setPluginData('tokenPath', token.path);
}

// Scan component nodes for token coverage
async function scanComponentCoverage() {
  try {
    const components = figma.currentPage.findAllWithCriteria({ types: ['COMPONENT'] });
    const CHECKABLE_PROPS = ['fills', 'strokes', 'effects', 'opacity', 'fontSize', 'fontName', 'letterSpacing', 'lineHeight', 'cornerRadius'];

    let tokenized = 0;
    const untokenized: { id: string; name: string; hardcodedCount: number }[] = [];

    for (const node of components) {
      const bound = (node as SceneNode & { boundVariables?: Record<string, unknown> }).boundVariables ?? {};
      const boundProps = new Set(Object.keys(bound).filter(k => {
        const v = bound[k];
        return v && (typeof v === 'object') && ('id' in v || (Array.isArray(v) && v.length > 0));
      }));

      // Count hardcoded: props that exist on node but aren't bound
      let hardcodedCount = 0;
      for (const prop of CHECKABLE_PROPS) {
        if (prop in node) {
          const val = (node as Record<string, unknown>)[prop];
          const hasValue = Array.isArray(val) ? val.length > 0 : val !== undefined && val !== null;
          if (hasValue && !boundProps.has(prop)) hardcodedCount++;
        }
      }

      if (boundProps.size > 0 && hardcodedCount === 0) {
        tokenized++;
      } else {
        untokenized.push({ id: node.id, name: node.name, hardcodedCount });
      }
    }

    figma.ui.postMessage({
      type: 'component-coverage-result',
      totalComponents: components.length,
      tokenizedComponents: tokenized,
      untokenized: untokenized.slice(0, 100), // cap list size
    });
  } catch (error) {
    figma.ui.postMessage({ type: 'error', message: String(error) });
  }
}

// Select a node by ID on the canvas
async function selectNode(nodeId: string) {
  try {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (node && 'parent' in node) {
      figma.currentPage.selection = [node as SceneNode];
      figma.viewport.scrollAndZoomIntoView([node as SceneNode]);
    }
  } catch (error) {
    // Silently ignore — node might not be accessible
  }
}

// Scan all visual nodes on the current page for token/variable binding coverage
async function scanCanvasHeatmap() {
  try {
    const CHECKABLE_FIGMA_PROPS = ['fills', 'strokes', 'effects', 'opacity', 'fontSize', 'fontName', 'letterSpacing', 'lineHeight', 'cornerRadius', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'itemSpacing'];
    const VISUAL_TYPES = new Set(['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'RECTANGLE', 'ELLIPSE', 'POLYGON', 'STAR', 'VECTOR', 'LINE', 'TEXT']);

    const nodes = figma.currentPage.findAll(n => VISUAL_TYPES.has(n.type));

    type HeatmapStatus = 'green' | 'yellow' | 'red';
    const result: { id: string; name: string; type: string; status: HeatmapStatus; boundCount: number; totalCheckable: number }[] = [];
    let greenCount = 0, yellowCount = 0, redCount = 0;

    for (const node of nodes) {
      // Figma variable bindings
      const figmaBound = (node as SceneNode & { boundVariables?: Record<string, unknown> }).boundVariables ?? {};
      const figmaBoundProps = new Set<string>(
        Object.keys(figmaBound).filter(k => {
          const v = figmaBound[k];
          return v && (typeof v === 'object') && ('id' in v || (Array.isArray(v) && v.length > 0));
        })
      );

      // Our plugin data bindings
      let pluginBoundCount = 0;
      for (const prop of ALL_BINDABLE_PROPERTIES) {
        const val = node.getSharedPluginData(PLUGIN_DATA_NAMESPACE, prop);
        if (val && val.trim()) pluginBoundCount++;
      }

      // Count applicable Figma properties that have non-empty values
      let totalCheckable = 0;
      let figmaBoundMatchCount = 0;
      for (const prop of CHECKABLE_FIGMA_PROPS) {
        if (prop in node) {
          const val = (node as Record<string, unknown>)[prop];
          const hasValue = Array.isArray(val) ? val.length > 0 : val !== undefined && val !== null;
          if (hasValue) {
            totalCheckable++;
            if (figmaBoundProps.has(prop)) figmaBoundMatchCount++;
          }
        }
      }

      const boundCount = figmaBoundMatchCount + pluginBoundCount;
      let status: HeatmapStatus;
      if (totalCheckable === 0 && pluginBoundCount === 0) {
        status = 'red';
        redCount++;
      } else if (boundCount > 0 && boundCount >= totalCheckable) {
        status = 'green';
        greenCount++;
      } else if (boundCount > 0) {
        status = 'yellow';
        yellowCount++;
      } else {
        status = 'red';
        redCount++;
      }

      result.push({ id: node.id, name: node.name, type: node.type, status, boundCount, totalCheckable });
    }

    figma.ui.postMessage({
      type: 'canvas-heatmap-result',
      total: nodes.length,
      green: greenCount,
      yellow: yellowCount,
      red: redCount,
      nodes: result.slice(0, 300),
    });
  } catch (error) {
    figma.ui.postMessage({ type: 'error', message: String(error) });
  }
}

// Select nodes by ID and zoom to them
async function selectHeatmapNodes(nodeIds: string[]) {
  try {
    const nodes: SceneNode[] = [];
    for (const id of nodeIds) {
      const node = await figma.getNodeByIdAsync(id);
      if (node && 'parent' in node) nodes.push(node as SceneNode);
    }
    if (nodes.length > 0) {
      figma.currentPage.selection = nodes;
      figma.viewport.scrollAndZoomIntoView(nodes);
    }
  } catch {
    // ignore — node might not be accessible
  }
}

// Delete Figma variables in TokenManager collection that are not in the known paths list
async function deleteOrphanVariables(knownPaths: string[]) {
  try {
    const knownSet = new Set(knownPaths);
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    const tmCollection = collections.find(c => c.name === VARIABLE_COLLECTION_NAME);
    if (!tmCollection) {
      figma.ui.postMessage({ type: 'orphans-deleted', count: 0 });
      return;
    }
    let deleted = 0;
    for (const varId of tmCollection.variableIds) {
      const variable = await figma.variables.getVariableByIdAsync(varId);
      if (!variable) continue;
      const path = variable.name.replace(/\//g, '.');
      if (!knownSet.has(path)) {
        variable.remove();
        deleted++;
      }
    }
    figma.ui.postMessage({ type: 'orphans-deleted', count: deleted });
  } catch (error) {
    figma.ui.postMessage({ type: 'error', message: String(error) });
  }
}

// Read existing Figma variables as tokens
async function readFigmaVariables(correlationId?: string) {
  const localCollections = await figma.variables.getLocalVariableCollectionsAsync();
  const collections: any[] = [];

  for (const collection of localCollections) {
    if (collection.modes.length === 0) continue;

    const modes: any[] = [];
    for (const mode of collection.modes) {
      const tokens: any[] = [];
      for (const varId of collection.variableIds) {
        const variable = await figma.variables.getVariableByIdAsync(varId);
        if (!variable) continue;
        const value = variable.valuesByMode[mode.modeId];
        tokens.push({
          path: variable.name.replace(/\//g, '.'),
          $type: mapVariableTypeToTokenType(variable.resolvedType),
          $value: convertFromFigmaValue(value, variable.resolvedType),
          $description: variable.description || '',
          $scopes: variable.scopes,
        });
      }
      modes.push({ modeId: mode.modeId, modeName: mode.name, tokens });
    }
    collections.push({ name: collection.name, modes });
  }

  figma.ui.postMessage({ type: 'variables-read', collections, correlationId });
}

// Read existing Figma styles as tokens
async function readFigmaStyles() {
  const tokens: any[] = [];

  const paintStyles = await figma.getLocalPaintStylesAsync();
  for (const style of paintStyles) {
    if (style.paints.length > 0 && style.paints[0].type === 'SOLID') {
      const paint = style.paints[0] as SolidPaint;
      tokens.push({
        path: style.name.replace(/\//g, '.'),
        $type: 'color',
        $value: rgbToHex(paint.color, paint.opacity ?? 1),
      });
    }
  }

  const textStyles = await figma.getLocalTextStylesAsync();
  for (const style of textStyles) {
    tokens.push({
      path: style.name.replace(/\//g, '.'),
      $type: 'typography',
      $value: {
        fontFamily: style.fontName.family,
        fontSize: { value: style.fontSize, unit: 'px' },
        fontWeight: fontStyleToWeight(style.fontName.style),
        lineHeight: style.lineHeight.unit === 'PIXELS'
          ? { value: style.lineHeight.value, unit: 'px' }
          : style.lineHeight.unit === 'PERCENT'
          ? style.lineHeight.value / 100
          : 'auto',
        letterSpacing: { value: style.letterSpacing.value, unit: 'px' },
        fontStyle: style.fontName.style.toLowerCase().includes('italic') ? 'italic' : 'normal',
      },
    });
  }

  const effectStyles = await figma.getLocalEffectStylesAsync();
  for (const style of effectStyles) {
    const shadows = style.effects.filter(e => e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW');
    if (shadows.length > 0) {
      tokens.push({
        path: style.name.replace(/\//g, '.'),
        $type: 'shadow',
        $value: shadows.map(s => {
          const shadow = s as DropShadowEffect;
          return {
            color: rgbToHex(shadow.color, shadow.color.a),
            offsetX: { value: shadow.offset.x, unit: 'px' },
            offsetY: { value: shadow.offset.y, unit: 'px' },
            blur: { value: shadow.radius, unit: 'px' },
            spread: { value: shadow.spread || 0, unit: 'px' },
            type: s.type === 'INNER_SHADOW' ? 'innerShadow' : 'dropShadow',
          };
        }),
      });
    }
  }

  figma.ui.postMessage({ type: 'styles-read', tokens });
}

// Apply a resolved token value to a specific node property
async function applyTokenValue(node: SceneNode, property: string, value: any, tokenType: string) {
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
          const style = val.fontWeight ? weightToFontStyle(val.fontWeight) : (val.fontStyle || 'Regular');
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

// Apply token to selected nodes — now with actual property application
async function applyToSelection(tokenPath: string, tokenType: string, targetProperty: string, resolvedValue: any) {
  const selection = figma.currentPage.selection;
  if (selection.length === 0) {
    figma.notify('Select a layer first');
    return;
  }

  let applied = 0;
  for (const node of selection) {
    try {
      await applyTokenValue(node, targetProperty, resolvedValue, tokenType);
      node.setSharedPluginData(PLUGIN_DATA_NAMESPACE, targetProperty, tokenPath);
      applied++;
    } catch (err) {
      console.error(`Failed to apply ${tokenPath} to ${node.name}:`, err);
    }
  }

  figma.notify(`Applied ${tokenPath} to ${applied} layer(s)`);
  figma.ui.postMessage({ type: 'applied-to-selection', count: applied });
  await getSelection();
}

// Remove a token binding from selected nodes
async function removeBinding(property: string) {
  const selection = figma.currentPage.selection;
  for (const node of selection) {
    node.setSharedPluginData(PLUGIN_DATA_NAMESPACE, property, '');
  }
  await getSelection();
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

function collectDescendantsWithBindings(node: SceneNode, depth: number): ReturnType<typeof getSelection extends (...args: any) => Promise<infer R> ? never : never>[] {
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

async function getSelection() {
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

// Export ALL Figma variables with alias references preserved
async function exportAllVariables() {
  try {
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    const allVariables = await figma.variables.getLocalVariablesAsync();

    // Build a lookup: variable id -> variable name (for resolving aliases)
    const idToName = new Map<string, string>();
    for (const v of allVariables) {
      idToName.set(v.id, v.name.replace(/\//g, '.'));
    }

    const exportedCollections: ExportedCollection[] = [];

    for (const collection of collections) {
      const modes = collection.modes.map(m => ({ modeId: m.modeId, name: m.name }));
      const variables: ExportedVariable[] = [];

      for (const varId of collection.variableIds) {
        const variable = await figma.variables.getVariableByIdAsync(varId);
        if (!variable) continue;

        const modeValues: Record<string, ExportedModeValue> = {};

        for (const mode of modes) {
          const rawValue = variable.valuesByMode[mode.modeId];
          modeValues[mode.name] = convertExportValue(rawValue, variable.resolvedType, idToName);
        }

        variables.push({
          name: variable.name,
          path: variable.name.replace(/\//g, '.'),
          resolvedType: variable.resolvedType,
          $type: mapVariableTypeToTokenType(variable.resolvedType),
          description: variable.description || undefined,
          hiddenFromPublishing: variable.hiddenFromPublishing,
          scopes: variable.scopes,
          modeValues,
        });
      }

      exportedCollections.push({
        name: collection.name,
        modes: modes.map(m => m.name),
        variables,
      });
    }

    figma.ui.postMessage({ type: 'all-variables-exported', collections: exportedCollections });
  } catch (error) {
    figma.ui.postMessage({ type: 'error', message: `Failed to export variables: ${String(error)}` });
  }
}

interface ExportedModeValue {
  /** The resolved raw value (color hex, number, string, boolean) */
  resolvedValue: any;
  /** If this value is an alias, the DTCG reference string e.g. "{colors.primary}" */
  reference?: string;
  /** Whether this value is an alias to another variable */
  isAlias: boolean;
}

interface ExportedVariable {
  name: string;
  path: string;
  resolvedType: string;
  $type: string;
  description?: string;
  hiddenFromPublishing: boolean;
  scopes: string[];
  modeValues: Record<string, ExportedModeValue>;
}

interface ExportedCollection {
  name: string;
  modes: string[];
  variables: ExportedVariable[];
}

function convertExportValue(
  rawValue: any,
  resolvedType: VariableResolvedDataType,
  idToName: Map<string, string>,
): ExportedModeValue {
  // Check if it's a variable alias
  if (rawValue && typeof rawValue === 'object' && 'type' in rawValue && rawValue.type === 'VARIABLE_ALIAS') {
    const referencedName = idToName.get(rawValue.id);
    return {
      resolvedValue: null,
      reference: referencedName ? `{${referencedName}}` : `{unknown:${rawValue.id}}`,
      isAlias: true,
    };
  }

  return {
    resolvedValue: convertFromFigmaValue(rawValue, resolvedType),
    isAlias: false,
  };
}

// Utility functions
function mapTokenTypeToVariableType(tokenType: string): VariableResolvedDataType | null {
  switch (tokenType) {
    case 'color': return 'COLOR';
    case 'dimension':
    case 'number':
    case 'fontWeight':
    case 'lineHeight':
    case 'letterSpacing':
    case 'percentage':
      return 'FLOAT';
    case 'string':
    case 'fontFamily':
      return 'STRING';
    case 'boolean':
      return 'BOOLEAN';
    default:
      return null;
  }
}

function mapVariableTypeToTokenType(variableType: VariableResolvedDataType): string {
  switch (variableType) {
    case 'COLOR': return 'color';
    case 'FLOAT': return 'number';
    case 'STRING': return 'string';
    case 'BOOLEAN': return 'boolean';
    default: return 'string';
  }
}

function convertToFigmaValue(value: any, tokenType: string): VariableValue | null {
  switch (tokenType) {
    case 'color': {
      const color = parseColor(value);
      return color ? { r: color.rgb.r, g: color.rgb.g, b: color.rgb.b, a: color.a } : null;
    }
    case 'dimension':
      return typeof value === 'object' ? value.value : value;
    case 'number':
    case 'fontWeight':
    case 'percentage':
      return typeof value === 'number' ? value : parseFloat(value);
    case 'boolean':
      return Boolean(value);
    case 'string':
    case 'fontFamily':
      return Array.isArray(value) ? value[0] : String(value);
    default:
      return null;
  }
}

function convertFromFigmaValue(value: any, variableType: VariableResolvedDataType): any {
  switch (variableType) {
    case 'COLOR':
      return rgbToHex(value, value.a ?? 1);
    default:
      return value;
  }
}

function parseColor(value: string): { rgb: RGB; a: number } | null {
  if (typeof value !== 'string') return null;
  const hex = value.replace('#', '');
  if (hex.length === 6 || hex.length === 8) {
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
    return { rgb: { r, g, b }, a };
  }
  if (hex.length === 3) {
    const r = parseInt(hex[0] + hex[0], 16) / 255;
    const g = parseInt(hex[1] + hex[1], 16) / 255;
    const b = parseInt(hex[2] + hex[2], 16) / 255;
    return { rgb: { r, g, b }, a: 1 };
  }
  // 4-char shorthand hex: #RGBA → #RRGGBBAA
  if (hex.length === 4) {
    const r = parseInt(hex[0] + hex[0], 16) / 255;
    const g = parseInt(hex[1] + hex[1], 16) / 255;
    const b = parseInt(hex[2] + hex[2], 16) / 255;
    const a = parseInt(hex[3] + hex[3], 16) / 255;
    return { rgb: { r, g, b }, a };
  }
  return null;
}

function rgbToHex(color: RGB | RGBA, alpha = 1): string {
  const r = Math.round(color.r * 255).toString(16).padStart(2, '0');
  const g = Math.round(color.g * 255).toString(16).padStart(2, '0');
  const b = Math.round(color.b * 255).toString(16).padStart(2, '0');
  if (alpha < 1) {
    const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
    return `#${r}${g}${b}${a}`;
  }
  return `#${r}${g}${b}`;
}

function parseDimValue(dim: any): number {
  if (typeof dim === 'number') return dim;
  if (typeof dim === 'object' && dim.value != null) return dim.value;
  return 0;
}

function fontStyleToWeight(style: string): number {
  const s = style.toLowerCase();
  if (s.includes('thin') || s.includes('hairline')) return 100;
  if (s.includes('extralight') || s.includes('ultralight')) return 200;
  if (s.includes('light')) return 300;
  if (s.includes('medium')) return 500;
  if (s.includes('semibold') || s.includes('demibold')) return 600;
  if (s.includes('extrabold') || s.includes('ultrabold')) return 800;
  if (s.includes('bold')) return 700;
  if (s.includes('black') || s.includes('heavy')) return 900;
  return 400; // Regular/Normal
}

function weightToFontStyle(weight: number | string): string {
  const w = typeof weight === 'number' ? weight : parseInt(weight, 10);
  if (w <= 100) return 'Thin';
  if (w <= 200) return 'ExtraLight';
  if (w <= 300) return 'Light';
  if (w <= 400) return 'Regular';
  if (w <= 500) return 'Medium';
  if (w <= 600) return 'SemiBold';
  if (w <= 700) return 'Bold';
  if (w <= 800) return 'ExtraBold';
  return 'Black';
}

function findVariableInList(variables: Variable[], collectionId: string, name: string): Variable | null {
  return variables.find(v => v.variableCollectionId === collectionId && v.name === name) || null;
}

// Select canvas layers that are bound to a specific token path
async function highlightLayersByToken(tokenPath: string) {
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
// Does NOT re-apply visual values — run sync-bindings afterward to repaint.
async function remapBindings(remapMap: Record<string, string>, scope: 'selection' | 'page') {
  const entries = Object.entries(remapMap).filter(([oldPath, newPath]) => oldPath && newPath && oldPath !== newPath);
  if (entries.length === 0) {
    figma.ui.postMessage({ type: 'remap-complete', updatedBindings: 0, updatedNodes: 0 });
    return;
  }

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
  await getSelection();
}

// Sync all bindings on the page or selection with latest token values
async function syncBindings(tokenMap: Record<string, { $value: any; $type: string }>, scope: 'page' | 'selection') {
  let nodes: SceneNode[];
  if (scope === 'selection') {
    nodes = [...figma.currentPage.selection];
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

      for (const [prop, tokenPath] of Object.entries(bindings)) {
        const entry = tokenMap[tokenPath];
        if (!entry) {
          missingTokens.add(tokenPath);
          skipped++;
          continue;
        }
        try {
          await applyTokenValue(node, prop, entry.$value, entry.$type);
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
}

// Listen for selection changes
figma.on('selectionchange', () => {
  getSelection();
});
