import type {
  IconPublishItem,
  IconPublishResult,
  PublishIconsMessage,
} from '../shared/types.js';
import { getErrorMessage } from '../shared/utils.js';
import { PLUGIN_DATA_NAMESPACE } from './constants.js';
import { ICON_PLUGIN_DATA_KEYS, readManagedIconPluginData } from './iconPluginData.js';

const ARTWORK_NODE_NAME = 'Artwork';
const GRID_COLUMNS = 8;
const GRID_GAP = 32;
const MONOTONE_ICON_COLOR: RGB = { r: 0, g: 0, b: 0 };

export async function publishIcons(message: PublishIconsMessage): Promise<void> {
  await figma.loadAllPagesAsync();
  const results: IconPublishResult[] = [];

  for (const [index, item] of message.icons.entries()) {
    results.push(await publishIcon(message.pageName, item));
    figma.ui.postMessage({
      type: 'icons-publish-progress',
      current: index + 1,
      total: message.icons.length,
      correlationId: message.correlationId,
    });
  }

  figma.ui.postMessage({
    type: 'icons-published',
    results,
    correlationId: message.correlationId,
  });
}

async function ensureIconPage(pageName: string): Promise<PageNode> {
  const name = pageName.trim() || 'Icons';
  const storedPageId = figma.root.getSharedPluginData(
    PLUGIN_DATA_NAMESPACE,
    ICON_PLUGIN_DATA_KEYS.pageId,
  );
  if (storedPageId) {
    const storedPage = await figma.getNodeByIdAsync(storedPageId);
    if (storedPage?.type === 'PAGE') {
      return storedPage;
    }
  }

  const existing = figma.root.children.find((page) => page.name === name);
  if (existing) {
    storeIconPageId(existing);
    return existing;
  }

  const page = figma.createPage();
  page.name = name;
  storeIconPageId(page);
  return page;
}

function storeIconPageId(page: PageNode): void {
  figma.root.setSharedPluginData(
    PLUGIN_DATA_NAMESPACE,
    ICON_PLUGIN_DATA_KEYS.pageId,
    page.id,
  );
}

async function publishIcon(
  pageName: string,
  item: IconPublishItem,
): Promise<IconPublishResult> {
  try {
    const component = await findOrCreateIconComponent(pageName, item);
    const currentHash = component.getSharedPluginData(
      PLUGIN_DATA_NAMESPACE,
      ICON_PLUGIN_DATA_KEYS.hash,
    );

    if (currentHash === item.svgHash) {
      component.name = item.componentName;
      writeIconPluginData(component, item);
      return publishResult(item, component, 'skipped');
    }

    const action = currentHash ? 'updated' : 'created';
    const warning = await updateComponentArtwork(component, item);
    writeIconPluginData(component, item);
    return {
      ...publishResult(item, component, action),
      ...(warning ? { warning } : {}),
    };
  } catch (error) {
    return {
      id: item.id,
      error: getErrorMessage(error, 'Failed to publish icon.'),
    };
  }
}

async function findOrCreateIconComponent(
  pageName: string,
  item: IconPublishItem,
): Promise<ComponentNode> {
  const linkedComponent = await findLinkedComponent(item);
  if (linkedComponent) {
    linkedComponent.name = item.componentName;
    return linkedComponent;
  }

  const page = await ensureIconPage(pageName);
  const component = figma.createComponent();
  const index = page.children.filter((child) => child.type === 'COMPONENT').length;
  page.appendChild(component);
  component.name = item.componentName;
  component.resizeWithoutConstraints(item.targetSize, item.targetSize);
  component.x = gridX(index, item.targetSize);
  component.y = gridY(index, item.targetSize);
  component.fills = [];
  return component;
}

async function findLinkedComponent(
  item: IconPublishItem,
): Promise<ComponentNode | null> {
  if (item.componentId) {
    const node = await figma.getNodeByIdAsync(item.componentId);
    if (node?.type === 'COMPONENT') {
      return node;
    }
  }

  const linked = figma.root
    .findAllWithCriteria({
      types: ['COMPONENT'],
      sharedPluginData: {
        namespace: PLUGIN_DATA_NAMESPACE,
        keys: [ICON_PLUGIN_DATA_KEYS.id],
      },
    })
    .find(
      (node) =>
        readManagedIconPluginData(node)?.id === item.id,
    );

  if (linked?.type === 'COMPONENT') {
    return linked;
  }

  return null;
}

async function updateComponentArtwork(
  component: ComponentNode,
  item: IconPublishItem,
): Promise<string | undefined> {
  component.resizeWithoutConstraints(item.targetSize, item.targetSize);
  component.name = item.componentName;
  component.fills = [];
  component.clipsContent = false;

  const imported = figma.createNodeFromSvg(item.svgContent);
  imported.name = ARTWORK_NODE_NAME;
  normalizeImportedArtworkPaints(imported, item);
  fitArtwork(imported, item.targetSize);

  if (await patchMatchingVectors(component, imported)) {
    imported.remove();
    return undefined;
  }

  [...component.children].forEach((child) => child.remove());
  component.appendChild(imported);
  fitArtwork(imported, item.targetSize);
  return 'Replaced component artwork because the SVG structure changed.';
}

async function patchMatchingVectors(
  component: ComponentNode,
  imported: FrameNode,
): Promise<boolean> {
  const currentVectors = component.findAllWithCriteria({ types: ['VECTOR'] });
  const nextVectors = imported.findAllWithCriteria({ types: ['VECTOR'] });
  if (
    currentVectors.length === 0 ||
    currentVectors.length !== nextVectors.length
  ) {
    return false;
  }

  for (let index = 0; index < currentVectors.length; index += 1) {
    await patchVectorNode(currentVectors[index], nextVectors[index]);
  }
  return true;
}

async function patchVectorNode(
  current: VectorNode,
  next: VectorNode,
): Promise<void> {
  await current.setVectorNetworkAsync(next.vectorNetwork);
  current.fills = next.fills;
  current.strokes = next.strokes;
  current.strokeWeight = next.strokeWeight;
  current.strokeAlign = next.strokeAlign;
  current.strokeCap = next.strokeCap;
  current.strokeJoin = next.strokeJoin;
  current.dashPattern = next.dashPattern;
  current.effects = next.effects;
  current.opacity = next.opacity;
  current.visible = next.visible;
  current.name = next.name;
}

function normalizeImportedArtworkPaints(
  imported: FrameNode,
  item: IconPublishItem,
): void {
  if (
    item.colorBehavior !== 'inheritable' &&
    item.colorBehavior !== 'hardcoded-monotone'
  ) {
    return;
  }

  for (const node of imported.findAll()) {
    normalizePaintableNode(node);
  }
}

function normalizePaintableNode(node: SceneNode): void {
  if (hasFills(node) && Array.isArray(node.fills)) {
    node.fills = normalizePaints(node.fills);
  }
  if (hasStrokes(node) && Array.isArray(node.strokes)) {
    node.strokes = normalizePaints(node.strokes);
  }
}

function hasFills(node: SceneNode): node is SceneNode & MinimalFillsMixin {
  return 'fills' in node;
}

function hasStrokes(node: SceneNode): node is SceneNode & MinimalStrokesMixin {
  return 'strokes' in node;
}

function normalizePaints(paints: readonly Paint[]): Paint[] {
  return paints.map((paint) => {
    if (paint.type !== 'SOLID') {
      return paint;
    }
    return {
      ...paint,
      color: MONOTONE_ICON_COLOR,
    };
  });
}

function fitArtwork(node: FrameNode, targetSize: number): void {
  node.x = 0;
  node.y = 0;
  if (node.width <= 0 || node.height <= 0) {
    return;
  }

  const scale = Math.min(targetSize / node.width, targetSize / node.height);
  if (Number.isFinite(scale) && scale > 0 && Math.abs(scale - 1) > 0.001) {
    node.rescale(scale);
  }

  node.x = (targetSize - node.width) / 2;
  node.y = (targetSize - node.height) / 2;
}

function writeIconPluginData(component: ComponentNode, item: IconPublishItem): void {
  component.setSharedPluginData(
    PLUGIN_DATA_NAMESPACE,
    ICON_PLUGIN_DATA_KEYS.id,
    item.id,
  );
  component.setSharedPluginData(
    PLUGIN_DATA_NAMESPACE,
    ICON_PLUGIN_DATA_KEYS.path,
    item.path,
  );
  component.setSharedPluginData(
    PLUGIN_DATA_NAMESPACE,
    ICON_PLUGIN_DATA_KEYS.hash,
    item.svgHash,
  );
}

function publishResult(
  item: IconPublishItem,
  component: ComponentNode,
  action: NonNullable<IconPublishResult['action']>,
): IconPublishResult {
  return {
    id: item.id,
    componentId: component.id,
    componentKey: component.key || null,
    lastSyncedHash: item.svgHash,
    action,
  };
}

function gridX(index: number, targetSize: number): number {
  const cell = targetSize + GRID_GAP;
  return (index % GRID_COLUMNS) * cell;
}

function gridY(index: number, targetSize: number): number {
  const cell = targetSize + GRID_GAP;
  return Math.floor(index / GRID_COLUMNS) * cell;
}
