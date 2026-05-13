import type { ResolvedTokenValue } from '../shared/types.js';
import { applyToNodes } from './selectionHandling.js';

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
