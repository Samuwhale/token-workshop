import { ALL_BINDABLE_PROPERTIES, type ResolvedTokenValue } from '../shared/types.js';
import { PLUGIN_DATA_NAMESPACE } from './constants.js';
import { applyToNodes } from './selectionHandling.js';
import { walkNodes } from './walkNodes.js';

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
