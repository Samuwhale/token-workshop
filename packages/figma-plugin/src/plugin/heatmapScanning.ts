import { ALL_BINDABLE_PROPERTIES, LEGACY_KEY_MAP, type HeatmapScope, type ResolvedTokenValue } from '../shared/types.js';
import { PLUGIN_DATA_NAMESPACE } from './constants.js';
import { applyToSelection } from './selectionHandling.js';
import { walkNodes, VISUAL_TYPES } from './walkNodes.js';

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
    if (node && 'parent' in node) {
      figma.currentPage.selection = [node as SceneNode];
      figma.viewport.scrollAndZoomIntoView([node as SceneNode]);
    }
  } catch (error) {
    // Silently ignore — node might not be accessible
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

// Scan visual nodes for token/variable binding coverage
export async function scanCanvasHeatmap(scope: HeatmapScope = 'page', signal?: { aborted: boolean }) {
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
      figma.ui.postMessage({ type: 'canvas-heatmap-cancelled' });
      return;
    }

    type HeatmapStatus = 'green' | 'yellow' | 'red';
    const result: { id: string; name: string; type: string; status: HeatmapStatus; boundCount: number; totalCheckable: number }[] = [];
    let greenCount = 0, yellowCount = 0, redCount = 0;

    for (let i = 0; i < nodes.length; i++) {
      if (signal?.aborted) {
        figma.ui.postMessage({ type: 'canvas-heatmap-cancelled' });
        return;
      }

      const node = nodes[i];

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

      // Yield between batches to prevent freezing
      if ((i + 1) % BATCH_SIZE === 0) {
        figma.ui.postMessage({
          type: 'canvas-heatmap-progress',
          processed: i + 1,
          total: nodes.length,
        });
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
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
    figma.ui.postMessage({ type: 'canvas-heatmap-error', error: String(error) });
  } finally {
    if (pageChangeHandler) figma.off('currentpagechange', pageChangeHandler);
  }
}

// Select nodes by ID and zoom to them
export async function selectHeatmapNodes(nodeIds: string[]) {
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
      for (const legacyKey of Object.keys(LEGACY_KEY_MAP)) {
        if (current.getSharedPluginData(PLUGIN_DATA_NAMESPACE, legacyKey) === tokenPath) {
          const mapped = (LEGACY_KEY_MAP as Record<string, string>)[legacyKey];
          if (!boundProps.includes(mapped)) boundProps.push(mapped);
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

export async function batchBindHeatmapNodes(nodeIds: string[], tokenPath: string, tokenType: string, targetProperty: string, resolvedValue: ResolvedTokenValue) {
  // First select the nodes so applyToSelection operates on them
  const nodes: SceneNode[] = [];
  for (const id of nodeIds) {
    const node = await figma.getNodeByIdAsync(id);
    if (node && 'parent' in node) nodes.push(node as SceneNode);
  }
  if (nodes.length > 0) {
    figma.currentPage.selection = nodes;
    figma.viewport.scrollAndZoomIntoView(nodes);
  }
  await applyToSelection(tokenPath, tokenType, targetProperty, resolvedValue);
}
