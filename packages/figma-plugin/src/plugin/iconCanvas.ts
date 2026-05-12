import type { IconCanvasItem } from '../shared/types.js';
import { findNearestMainComponent, iconSlotLabelFromNodeName, isIconSlotCandidateNode } from './iconSlotUtils.js';

type ReplaceIconResult = {
  count: number;
  skipped: number;
  skippedReason?: string;
};

type IconReplacement =
  | { replacement: InstanceNode; skippedReason?: never }
  | { replacement?: never; skippedReason: string };

export async function insertIconInstance(icon: IconCanvasItem): Promise<number> {
  const component = await resolveIconComponent(icon);
  const instance = component.createInstance();
  const selectedNode = figma.currentPage.selection[0];
  const insertion = getIconInsertionTarget(selectedNode);

  insertion.parent.insertChild(insertion.index, instance);
  instance.name = icon.componentName;

  if (insertion.referenceNode) {
    instance.x = insertion.referenceNode.x;
    instance.y = insertion.referenceNode.y;
  } else {
    instance.x = figma.viewport.center.x - instance.width / 2;
    instance.y = figma.viewport.center.y - instance.height / 2;
  }

  figma.currentPage.selection = [instance];
  figma.viewport.scrollAndZoomIntoView([instance]);
  return 1;
}

export async function replaceSelectionWithIcon(
  icon: IconCanvasItem,
): Promise<ReplaceIconResult> {
  const selection = [...figma.currentPage.selection];
  if (selection.length === 0) {
    throw new Error('Select one or more layers to replace.');
  }

  const component = await resolveIconComponent(icon);
  const replacements: InstanceNode[] = [];
  const skippedReasons: string[] = [];
  let skipped = 0;

  for (const node of selection) {
    try {
      const { replacement, skippedReason } = replaceNodeWithIconInstance(
        node,
        component,
        icon,
      );
      if (replacement) {
        replacements.push(replacement);
      } else {
        skipped += 1;
        skippedReasons.push(skippedReason);
      }
    } catch (error) {
      console.debug('[iconCanvas] skipped icon replacement:', node.id, error);
      skipped += 1;
      skippedReasons.push(getErrorMessage(error, 'Some layers could not be replaced.'));
    }
  }

  if (replacements.length === 0) {
    throw new Error(
      summarizeSkippedReasons(skippedReasons) ?? 'No selected layers could be replaced.',
    );
  }

  figma.currentPage.selection = replacements;
  figma.viewport.scrollAndZoomIntoView(replacements);
  return {
    count: replacements.length,
    skipped,
    skippedReason: summarizeSkippedReasons(skippedReasons),
  };
}

export async function setSelectionIconSwapProperty(
  icon: IconCanvasItem,
  propertyName: string,
  targetNodeIds: string[],
): Promise<ReplaceIconResult> {
  const selectedIds = new Set(figma.currentPage.selection.map((node) => node.id));
  const targetIds = new Set(targetNodeIds);
  const component = await resolveIconComponent(icon);
  const componentKey = component.key || icon.componentKey;

  if (!componentKey) {
    throw new Error('Publish this icon to Figma before using it in component slots.');
  }

  let count = 0;
  let skipped = 0;
  const skippedReasons: string[] = [];

  for (const nodeId of targetIds) {
    if (!selectedIds.has(nodeId)) {
      skipped += 1;
      skippedReasons.push('Selection changed before the slot could be updated.');
      continue;
    }

    const node = await figma.getNodeByIdAsync(nodeId);
    if (node?.type !== 'INSTANCE') {
      skipped += 1;
      skippedReasons.push('Only selected component instances with icon slots can be updated.');
      continue;
    }

    const property = node.componentProperties[propertyName];
    if (property?.type !== 'INSTANCE_SWAP') {
      skipped += 1;
      skippedReasons.push('The selected component no longer exposes that icon slot.');
      continue;
    }

    try {
      node.setProperties({ [propertyName]: componentKey });
      count += 1;
    } catch (error) {
      console.debug('[iconCanvas] skipped icon slot update:', node.id, propertyName, error);
      skipped += 1;
      skippedReasons.push(getErrorMessage(
        error,
        'This icon could not be used in the selected slot.',
      ));
    }
  }

  if (count === 0) {
    throw new Error(
      summarizeSkippedReasons(skippedReasons) ??
        'No selected component instances expose this icon slot.',
    );
  }

  return { count, skipped, skippedReason: summarizeSkippedReasons(skippedReasons) };
}

export async function createSelectionIconSlots(
  icon: IconCanvasItem,
  targetNodeIds: string[],
): Promise<ReplaceIconResult> {
  const selectedIds = new Set(figma.currentPage.selection.map((node) => node.id));
  const targetIds = new Set(targetNodeIds);
  const component = await resolveIconComponent(icon);
  const replacements: InstanceNode[] = [];
  let skipped = 0;
  const skippedReasons: string[] = [];

  for (const nodeId of targetIds) {
    if (!selectedIds.has(nodeId) && !hasSelectedAncestor(nodeId, selectedIds)) {
      skipped += 1;
      skippedReasons.push('Selection changed before the slot could be created.');
      continue;
    }

    const node = await figma.getNodeByIdAsync(nodeId);
    if (!isSceneNode(node)) {
      skipped += 1;
      skippedReasons.push('Only selected icon-like layers can become icon slots.');
      continue;
    }

    try {
      replacements.push(promoteNodeToIconSlot(node, component, icon));
    } catch (error) {
      console.debug('[iconCanvas] skipped icon slot creation:', node.id, error);
      skipped += 1;
      skippedReasons.push(getErrorMessage(
        error,
        'This layer could not become an icon slot.',
      ));
    }
  }

  if (replacements.length === 0) {
    throw new Error(
      summarizeSkippedReasons(skippedReasons) ?? 'No selected layers could become icon slots.',
    );
  }

  figma.currentPage.selection = replacements;
  figma.viewport.scrollAndZoomIntoView(replacements);
  return {
    count: replacements.length,
    skipped,
    skippedReason: summarizeSkippedReasons(skippedReasons),
  };
}

async function resolveIconComponent(
  icon: IconCanvasItem,
): Promise<ComponentNode> {
  if (icon.componentId) {
    const localNode = await figma.getNodeByIdAsync(icon.componentId);
    if (localNode?.type === 'COMPONENT') {
      return localNode;
    }
  }

  if (icon.componentKey) {
    return figma.importComponentByKeyAsync(icon.componentKey);
  }

  throw new Error('Publish this icon to Figma before using it on the canvas.');
}

function replaceNodeWithIconInstance(
  node: SceneNode,
  component: ComponentNode,
  icon: IconCanvasItem,
): IconReplacement {
  if (node.id === component.id || isAncestorOf(node, component)) {
    return {
      skippedReason: 'The managed icon source component cannot replace itself.',
    };
  }

  if (node.type === 'INSTANCE') {
    if (hasInstanceSwapProperties(node)) {
      return {
        skippedReason: 'Selected component instances with icon slots use the slot action instead.',
      };
    }
    node.swapComponent(component);
    node.name = icon.componentName;
    return { replacement: node };
  }

  if (isNonEmptyContainer(node)) {
    return {
      skippedReason: 'Containers with child layers cannot be replaced by a single icon.',
    };
  }

  const parent = node.parent;
  if (!parent || !canMutateChildren(parent)) {
    return {
      skippedReason: 'Some selected layers cannot accept replacement instances.',
    };
  }

  const replacement = component.createInstance();
  replacement.name = icon.componentName;

  const index = parent.children.indexOf(node);
  parent.insertChild(index >= 0 ? index : parent.children.length, replacement);
  try {
    copyReplaceableLayout(node, replacement);
    node.remove();
  } catch (error) {
    if (!replacement.removed) {
      replacement.remove();
    }
    throw error;
  }
  return { replacement };
}

function promoteNodeToIconSlot(
  node: SceneNode,
  iconComponent: ComponentNode,
  icon: IconCanvasItem,
): InstanceNode {
  if (node.id === iconComponent.id || isAncestorOf(node, iconComponent)) {
    throw new Error('The managed icon source component cannot become its own slot.');
  }
  if (!isIconSlotCandidateNode(node)) {
    throw new Error('Select a raw icon layer or unmanaged icon placeholder inside a main component.');
  }

  const ownerComponent = findNearestMainComponent(node);
  if (!ownerComponent) {
    throw new Error('Select a layer inside a main component, not an instance or variant set.');
  }

  const parent = node.parent;
  if (!parent || !canMutateChildren(parent)) {
    throw new Error('The selected layer cannot be replaced in this component.');
  }

  const index = parent.children.indexOf(node);
  const replacement = iconComponent.createInstance();
  let propertyName: string | null = null;

  parent.insertChild(index >= 0 ? index : parent.children.length, replacement);
  try {
    replacement.name = node.name || icon.componentName;
    copyReplaceableLayout(node, replacement);
    const createdPropertyName = ownerComponent.addComponentProperty(
      uniqueComponentPropertyLabel(ownerComponent, iconSlotLabelFromNodeName(node.name)),
      'INSTANCE_SWAP',
      iconComponent.id,
    );
    propertyName = createdPropertyName;
    replacement.componentPropertyReferences = {
      ...(replacement.componentPropertyReferences ?? {}),
      mainComponent: createdPropertyName,
    };
    node.remove();
    return replacement;
  } catch (error) {
    if (propertyName) {
      ownerComponent.deleteComponentProperty(propertyName);
    }
    if (!replacement.removed) {
      replacement.remove();
    }
    throw error;
  }
}

function getIconInsertionTarget(selectedNode: SceneNode | undefined): {
  parent: BaseNode & ChildrenMixin;
  index: number;
  referenceNode?: SceneNode;
} {
  if (selectedNode?.parent && canMutateChildren(selectedNode.parent)) {
    const selectedIndex = selectedNode.parent.children.indexOf(selectedNode);
    return {
      parent: selectedNode.parent,
      index: selectedIndex >= 0
        ? selectedIndex + 1
        : selectedNode.parent.children.length,
      referenceNode: selectedNode,
    };
  }

  return {
    parent: figma.currentPage,
    index: figma.currentPage.children.length,
  };
}

function canInsertChild(node: BaseNode): node is BaseNode & ChildrenMixin {
  return 'insertChild' in node && 'children' in node;
}

function canMutateChildren(node: BaseNode): node is BaseNode & ChildrenMixin {
  return canInsertChild(node) && node.type !== 'INSTANCE';
}

function isSceneNode(node: BaseNode | null): node is SceneNode {
  return Boolean(node && 'visible' in node && 'x' in node && 'y' in node);
}

function isAncestorOf(possibleAncestor: BaseNode, node: BaseNode): boolean {
  let parent = node.parent;
  while (parent) {
    if (parent.id === possibleAncestor.id) {
      return true;
    }
    parent = parent.parent;
  }
  return false;
}

function hasInstanceSwapProperties(node: InstanceNode): boolean {
  return Object.values(node.componentProperties).some(
    (property) => property.type === 'INSTANCE_SWAP',
  );
}

function hasSelectedAncestor(nodeId: string, selectedIds: Set<string>): boolean {
  const node = figma.getNodeById(nodeId);
  let parent = node?.parent;
  while (parent) {
    if (selectedIds.has(parent.id)) {
      return true;
    }
    parent = parent.parent;
  }
  return false;
}

function uniqueComponentPropertyLabel(
  component: ComponentNode,
  preferredLabel: string,
): string {
  const existingLabels = new Set(
    Object.keys(component.componentPropertyDefinitions).map(stripComponentPropertyId),
  );
  if (!existingLabels.has(preferredLabel)) {
    return preferredLabel;
  }

  let index = 2;
  while (existingLabels.has(`${preferredLabel} ${index}`)) {
    index += 1;
  }
  return `${preferredLabel} ${index}`;
}

function stripComponentPropertyId(name: string): string {
  return name.replace(/#[^#]*$/, '');
}

function isNonEmptyContainer(node: SceneNode): node is SceneNode & ChildrenMixin {
  return 'children' in node && node.children.length > 0;
}

function summarizeSkippedReasons(reasons: string[]): string | undefined {
  const uniqueReasons = Array.from(new Set(reasons.filter(Boolean)));
  if (uniqueReasons.length > 1) {
    return 'Some layers could not be updated for multiple reasons.';
  }
  return uniqueReasons[0];
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function copyReplaceableLayout(source: SceneNode, target: InstanceNode): void {
  target.x = source.x;
  target.y = source.y;
  target.visible = source.visible;

  if ('rotation' in source) {
    target.rotation = source.rotation;
  }
  if ('opacity' in source) {
    target.opacity = source.opacity;
  }
  if ('locked' in source) {
    target.locked = source.locked;
  }
  if ('constraints' in source) {
    target.constraints = source.constraints;
  }
  if ('layoutPositioning' in source) {
    target.layoutPositioning = source.layoutPositioning;
  }
  if ('layoutSizingHorizontal' in source) {
    target.layoutSizingHorizontal = source.layoutSizingHorizontal;
  }
  if ('layoutSizingVertical' in source) {
    target.layoutSizingVertical = source.layoutSizingVertical;
  }

  if (source.width > 0 && source.height > 0) {
    target.resizeWithoutConstraints(source.width, source.height);
  }
}
