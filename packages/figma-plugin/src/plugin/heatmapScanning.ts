import { ALL_BINDABLE_PROPERTIES, type BindableProperty, type ScanScope, type ResolvedTokenValue } from '../shared/types.js';
import { PLUGIN_DATA_NAMESPACE } from './constants.js';
import { applyToNodes } from './selectionHandling.js';
import { walkNodes, VISUAL_TYPES } from './walkNodes.js';
import { rgbToHex } from './colorUtils.js';

// Scan component nodes for token coverage
export async function scanComponentCoverage(correlationId?: string, signal?: { aborted: boolean }) {
  try {
    const components = figma.currentPage.findAllWithCriteria({ types: ['COMPONENT'] });
    const CHECKABLE_PROPS = ['fills', 'strokes', 'effects', 'opacity', 'fontSize', 'fontName', 'letterSpacing', 'lineHeight', 'cornerRadius'];

    let tokenized = 0;
    const untokenized: { id: string; name: string; hardcodedCount: number }[] = [];

    for (const node of components) {
      if (signal?.aborted) {
        figma.ui.postMessage({ type: 'component-coverage-cancelled', correlationId });
        return;
      }

      const applicableProps = collectApplicableBindableProperties(node, CHECKABLE_PROPS);
      const boundProps = collectBoundBindableProperties(node);

      let hardcodedCount = 0;
      for (const property of applicableProps) {
        if (!boundProps.has(property)) {
          hardcodedCount++;
        }
      }

      if (applicableProps.size > 0 && hardcodedCount === 0) {
        tokenized++;
      } else {
        untokenized.push({ id: node.id, name: node.name, hardcodedCount });
      }
    }

    figma.ui.postMessage({
      type: 'component-coverage-result',
      totalComponents: components.length,
      tokenizedComponents: tokenized,
      untokenized: untokenized.slice(0, 100),
      totalUntokenized: untokenized.length,
      correlationId,
    });
  } catch (error) {
    figma.ui.postMessage({ type: 'component-coverage-error', error: String(error), correlationId });
  }
}

// Select a node by ID on the canvas
export async function selectNode(nodeId: string) {
  try {
    const node = await figma.getNodeByIdAsync(nodeId);
    const selectable = getSelectableSceneNode(node);
    if (!selectable) return;

    await setCurrentPageIfNeeded(selectable.page);
    figma.currentPage.selection = [selectable.node];
    figma.viewport.scrollAndZoomIntoView([selectable.node]);
  } catch (_error) {
    // Silently ignore — node might not be accessible
  }
}

function getParentPage(node: BaseNode | null): PageNode | null {
  let current = node;
  while (current && current.type !== 'DOCUMENT') {
    if (current.type === 'PAGE') {
      return current;
    }
    current = ('parent' in current ? current.parent : null) ?? null;
  }
  return null;
}

function isSceneNode(node: BaseNode | null): node is SceneNode {
  return Boolean(node && 'visible' in node);
}

function getSelectableSceneNode(node: BaseNode | null): { node: SceneNode; page: PageNode } | null {
  if (!isSceneNode(node)) {
    return null;
  }
  const page = getParentPage(node);
  if (!page) {
    return null;
  }
  return { node, page };
}

async function setCurrentPageIfNeeded(page: PageNode): Promise<void> {
  if (figma.currentPage.id !== page.id) {
    await figma.setCurrentPageAsync(page);
  }
}

export function selectNextSibling() {
  const sel = figma.currentPage.selection;
  if (sel.length !== 1) {
    figma.ui.postMessage({ type: 'select-next-sibling-result', found: false });
    return;
  }
  const node = sel[0];
  const parent = node.parent;
  if (!parent || !('children' in parent)) {
    figma.ui.postMessage({ type: 'select-next-sibling-result', found: false });
    return;
  }
  const siblings = parent.children;
  const idx = siblings.indexOf(node);
  if (idx < 0 || idx >= siblings.length - 1) {
    figma.ui.postMessage({ type: 'select-next-sibling-result', found: false });
    return;
  }
  const next = siblings[idx + 1];
  figma.currentPage.selection = [next];
  figma.viewport.scrollAndZoomIntoView([next]);
  figma.ui.postMessage({ type: 'select-next-sibling-result', found: true });
}

// Maps raw Figma node property names to BindableProperty equivalents.
// Typography props all map to 'typography' and are deduplicated in the loop below.
const CHECKABLE_TO_BINDABLE: Record<string, BindableProperty> = {
  fills:         'fill',
  strokes:       'stroke',
  effects:       'shadow',
  opacity:       'opacity',
  fontSize:      'typography',
  fontName:      'typography',
  letterSpacing: 'typography',
  lineHeight:    'typography',
  cornerRadius:  'cornerRadius',
  paddingTop:    'paddingTop',
  paddingRight:  'paddingRight',
  paddingBottom: 'paddingBottom',
  paddingLeft:   'paddingLeft',
  itemSpacing:   'itemSpacing',
};

function hasBoundVariableReference(value: unknown): boolean {
  return value !== null
    && typeof value === 'object'
    && ('id' in value || (Array.isArray(value) && value.length > 0));
}

function collectBoundBindableProperties(node: SceneNode): Set<BindableProperty> {
  const bound = new Set<BindableProperty>();
  const figmaBound = (node as SceneNode & { boundVariables?: Record<string, unknown> }).boundVariables ?? {};

  for (const [property, value] of Object.entries(figmaBound)) {
    if (!hasBoundVariableReference(value)) continue;
    const bindable = CHECKABLE_TO_BINDABLE[property];
    if (bindable) {
      bound.add(bindable);
    }
  }

  for (const property of ALL_BINDABLE_PROPERTIES) {
    const tokenPath = node.getSharedPluginData(PLUGIN_DATA_NAMESPACE, property);
    if (tokenPath && tokenPath.trim()) {
      bound.add(property);
    }
  }

  return bound;
}

function collectApplicableBindableProperties(
  node: SceneNode,
  checkableProps: string[],
): Set<BindableProperty> {
  const applicable = new Set<BindableProperty>();

  for (const property of checkableProps) {
    if (!(property in node)) continue;
    const value = (node as unknown as Record<string, unknown>)[property];
    const hasValue = Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null;
    if (!hasValue) continue;

    const bindable = CHECKABLE_TO_BINDABLE[property];
    if (bindable) {
      applicable.add(bindable);
    }
  }

  return applicable;
}

function toDimensionValue(value: number): ResolvedTokenValue {
  return {
    value: Math.round(value * 100) / 100,
    unit: 'px',
  };
}

function readHeatmapTokenValue(node: SceneNode, property: BindableProperty): ResolvedTokenValue | null {
  const record = node as unknown as Record<string, unknown>;

  switch (property) {
    case 'fill': {
      if (!('fills' in node)) return null;
      const fills = record['fills'];
      if (Array.isArray(fills) && fills.length > 0 && fills[0].type === 'SOLID') {
        return rgbToHex(fills[0].color as RGB, fills[0].opacity ?? 1);
      }
      return null;
    }
    case 'stroke': {
      if (!('strokes' in node)) return null;
      const strokes = record['strokes'];
      if (Array.isArray(strokes) && strokes.length > 0 && strokes[0].type === 'SOLID') {
        return rgbToHex(strokes[0].color as RGB, strokes[0].opacity ?? 1);
      }
      return null;
    }
    case 'opacity':
      return typeof record['opacity'] === 'number' ? record['opacity'] as number : null;
    case 'cornerRadius':
      return typeof record['cornerRadius'] === 'number' ? toDimensionValue(record['cornerRadius'] as number) : null;
    case 'paddingTop':
      return typeof record['paddingTop'] === 'number' ? toDimensionValue(record['paddingTop'] as number) : null;
    case 'paddingRight':
      return typeof record['paddingRight'] === 'number' ? toDimensionValue(record['paddingRight'] as number) : null;
    case 'paddingBottom':
      return typeof record['paddingBottom'] === 'number' ? toDimensionValue(record['paddingBottom'] as number) : null;
    case 'paddingLeft':
      return typeof record['paddingLeft'] === 'number' ? toDimensionValue(record['paddingLeft'] as number) : null;
    case 'itemSpacing':
      return typeof record['itemSpacing'] === 'number' ? toDimensionValue(record['itemSpacing'] as number) : null;
    default:
      return null;
  }
}

// Scan visual nodes for token/variable binding coverage
export async function scanCanvasHeatmap(
  scope: ScanScope = 'page',
  signal?: { aborted: boolean },
  requestId?: string,
) {
  // Abort if the user navigates to a different page mid-scan (only relevant for
  // page/selection scopes where figma.currentPage is captured at scan start).
  let pageChangeHandler: (() => void) | null = null;
  if (scope !== 'all-pages' && signal) {
    pageChangeHandler = () => { signal.aborted = true; };
    figma.on('currentpagechange', pageChangeHandler);
  }
  try {
    const CHECKABLE_FIGMA_PROPS = ['fills', 'strokes', 'effects', 'opacity', 'fontSize', 'fontName', 'letterSpacing', 'lineHeight', 'cornerRadius', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'itemSpacing'];

    // Collect visual nodes via batched traversal to avoid freezing on large pages.
    const BATCH_SIZE = 200;
    const nodes: SceneNode[] = [];

    if (scope === 'all-pages') {
      const pages = figma.root.children;
      for (const page of pages) {
        for await (const node of walkNodes(page.children, { filter: VISUAL_TYPES, signal })) {
          nodes.push(node);
        }
        if (signal?.aborted) break;
      }
    } else {
      const roots = scope === 'selection'
        ? figma.currentPage.selection
        : figma.currentPage.children;
      for await (const node of walkNodes(roots, { filter: VISUAL_TYPES, signal })) {
        nodes.push(node);
      }
    }

    if (signal?.aborted) {
      figma.ui.postMessage({ type: 'canvas-heatmap-cancelled', requestId });
      return;
    }

    type HeatmapStatus = 'green' | 'yellow' | 'red';
    const result: {
      id: string;
      name: string;
      type: string;
      pageName?: string;
      status: HeatmapStatus;
      boundCount: number;
      totalCheckable: number;
      missingProperties: BindableProperty[];
      missingValueEntries: { property: BindableProperty; value: ResolvedTokenValue }[];
    }[] = [];
    let greenCount = 0, yellowCount = 0, redCount = 0;

    for (let i = 0; i < nodes.length; i++) {
      if (signal?.aborted) {
        figma.ui.postMessage({ type: 'canvas-heatmap-cancelled', requestId });
        return;
      }

      const node = nodes[i];

      const applicableProperties = collectApplicableBindableProperties(node, CHECKABLE_FIGMA_PROPS);
      const boundProperties = collectBoundBindableProperties(node);
      const totalCheckable = applicableProperties.size;
      const boundCount = [...applicableProperties].filter((property) => boundProperties.has(property)).length;
      let status: HeatmapStatus;
      if (totalCheckable === 0 && boundProperties.size === 0) {
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

      // Collect bindable properties that have values but no binding (figma variable or plugin data).
      const missingProperties: BindableProperty[] = [];
      const missingValueEntries: { property: BindableProperty; value: ResolvedTokenValue }[] = [];
      for (const property of applicableProperties) {
        if (boundProperties.has(property)) continue;
        missingProperties.push(property);
        const tokenValue = readHeatmapTokenValue(node, property);
        if (tokenValue !== null) {
          missingValueEntries.push({ property, value: tokenValue });
        }
      }

      const page = getParentPage(node);
      result.push({
        id: node.id,
        name: node.name,
        type: node.type,
        pageName: scope === 'all-pages' ? page?.name : undefined,
        status,
        boundCount,
        totalCheckable,
        missingProperties,
        missingValueEntries,
      });

      // Yield between batches to prevent freezing
      if ((i + 1) % BATCH_SIZE === 0) {
        figma.ui.postMessage({
          type: 'canvas-heatmap-progress',
          requestId,
          processed: i + 1,
          total: nodes.length,
        });
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
    }

    figma.ui.postMessage({
      type: 'canvas-heatmap-result',
      requestId,
      total: nodes.length,
      green: greenCount,
      yellow: yellowCount,
      red: redCount,
      nodes: result.slice(0, 300),
    });
  } catch (error) {
    figma.ui.postMessage({ type: 'canvas-heatmap-error', requestId, error: String(error) });
  } finally {
    if (pageChangeHandler) figma.off('currentpagechange', pageChangeHandler);
  }
}

// Select nodes by ID and zoom to them
export async function selectHeatmapNodes(nodeIds: string[]) {
  try {
    const selections: Array<{ node: SceneNode; page: PageNode }> = [];
    for (const id of nodeIds) {
      const node = await figma.getNodeByIdAsync(id);
      const selectable = getSelectableSceneNode(node);
      if (selectable) selections.push(selectable);
    }
    if (selections.length === 0) return;

    const firstPage = selections[0].page;
    const samePageNodes = selections
      .filter((entry) => entry.page.id === firstPage.id)
      .map((entry) => entry.node);

    await setCurrentPageIfNeeded(firstPage);
    figma.currentPage.selection = samePageNodes;
    figma.viewport.scrollAndZoomIntoView(samePageNodes);

    if (samePageNodes.length < selections.length) {
      figma.notify(`Selected ${samePageNodes.length} layer(s) on "${firstPage.name}". Other matches are on different pages.`, {
        timeout: 2500,
      });
    }
  } catch (e) {
    console.debug('[heatmapScanning] failed to select/zoom to nodes:', e);
  }
}

// Walk up the parent chain to find the nearest component or instance ancestor name.
function findComponentAncestor(node: SceneNode): string | null {
  let current: BaseNode | null = node.parent;
  while (current && current.type !== 'PAGE' && current.type !== 'DOCUMENT') {
    if (current.type === 'COMPONENT' || current.type === 'COMPONENT_SET' || current.type === 'INSTANCE') {
      return current.name;
    }
    current = (current as BaseNode & { parent?: BaseNode | null }).parent ?? null;
  }
  return null;
}

// Scan all nodes on the current page to find layers bound to a specific token path.
// Returns a list of { id, name, type, componentName, properties } for each node using this token.
export async function scanTokenUsage(tokenPath: string, signal?: { aborted: boolean }) {
  try {
    const layers: { id: string; name: string; type: string; componentName: string | null; properties: string[] }[] = [];

    for await (const current of walkNodes(figma.currentPage.children, { signal })) {
      // Check plugin data bindings for this token path
      const boundProps: string[] = [];
      for (const prop of ALL_BINDABLE_PROPERTIES) {
        if (current.getSharedPluginData(PLUGIN_DATA_NAMESPACE, prop) === tokenPath) {
          boundProps.push(prop);
        }
      }

      if (boundProps.length > 0) {
        layers.push({
          id: current.id,
          name: current.name,
          type: current.type,
          componentName: findComponentAncestor(current as SceneNode),
          properties: boundProps,
        });
      }
    }

    if (signal?.aborted) {
      figma.ui.postMessage({ type: 'token-usage-cancelled', tokenPath });
      return;
    }

    // Collect unique component names from all found layers
    const componentNames = [...new Set(layers.map(l => l.componentName).filter((n): n is string => n !== null))];

    figma.ui.postMessage({
      type: 'token-usage-result',
      tokenPath,
      layers: layers.slice(0, 200),
      total: layers.length,
      componentNames,
    });
  } catch (error) {
    figma.ui.postMessage({
      type: 'token-usage-result',
      tokenPath,
      layers: [],
      total: 0,
      componentNames: [],
      error: `Figma API error: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

export async function batchBindHeatmapNodes(nodeIds: string[], tokenPath: string, tokenType: string, targetProperty: string, resolvedValue: ResolvedTokenValue, skipNavigation = false) {
  const selections: Array<{ node: SceneNode; page: PageNode }> = [];
  for (const id of nodeIds) {
    const node = await figma.getNodeByIdAsync(id);
    const selectable = getSelectableSceneNode(node);
    if (selectable) selections.push(selectable);
  }
  await applyToNodes(nodeIds, tokenPath, tokenType, targetProperty, resolvedValue);

  if (skipNavigation || selections.length === 0) {
    return;
  }

  const firstPage = selections[0].page;
  const samePageNodes = selections
    .filter((entry) => entry.page.id === firstPage.id)
    .map((entry) => entry.node);

  await setCurrentPageIfNeeded(firstPage);
  figma.currentPage.selection = samePageNodes;
  figma.viewport.scrollAndZoomIntoView(samePageNodes);

  if (samePageNodes.length < selections.length) {
    figma.notify(`Applied bindings across ${selections.length} layer(s). Showing the ${samePageNodes.length} layer(s) on "${firstPage.name}".`, {
      timeout: 2500,
    });
  }
}
