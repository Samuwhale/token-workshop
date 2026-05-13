const ICON_LAYER_NAME_RE = /(^|[/_.\-\s])icon([/_.\-\s]|$)/i;
const ICON_SLOT_SIZE_MIN = 8;
const ICON_SLOT_SIZE_MAX = 64;
const ICON_SLOT_ASPECT_TOLERANCE = 0.35;
export const ICON_SLOT_PREFERRED_VALUE_POLICY_KEY = 'iconSlotPreferredValuePolicy';
export const ICON_SLOT_ALL_GOVERNED_ICONS_POLICY = 'all-governed-icons';

export function findNearestMainComponent(node: SceneNode): ComponentNode | null {
  let parent = node.parent;
  while (parent) {
    if (parent.type === 'INSTANCE') {
      return null;
    }
    if (parent.type === 'COMPONENT') {
      return parent;
    }
    parent = parent.parent;
  }
  return null;
}

export type IconSlotPropertyOwner = ComponentNode | ComponentSetNode;

export function getIconSlotPropertyOwner(component: ComponentNode): IconSlotPropertyOwner {
  return component.parent?.type === 'COMPONENT_SET' ? component.parent : component;
}

export function isIconSlotCandidateNode(
  node: SceneNode,
  options: { requireIconName?: boolean } = {},
): boolean {
  if (node.type === 'INSTANCE') {
    return looksLikeIconLayerName(node.name);
  }
  if (options.requireIconName && !looksLikeIconLayerName(node.name)) {
    return false;
  }
  if (!isVectorLikeIconNode(node)) {
    return false;
  }
  if (
    node.width < ICON_SLOT_SIZE_MIN ||
    node.height < ICON_SLOT_SIZE_MIN ||
    node.width > ICON_SLOT_SIZE_MAX ||
    node.height > ICON_SLOT_SIZE_MAX
  ) {
    return false;
  }

  const larger = Math.max(node.width, node.height);
  const smaller = Math.min(node.width, node.height);
  const aspectDelta = larger === 0 ? 1 : 1 - smaller / larger;
  return aspectDelta <= ICON_SLOT_ASPECT_TOLERANCE || looksLikeIconLayerName(node.name);
}

export function iconSlotLabelFromNodeName(name: string): string {
  const normalized = name.toLowerCase();
  if (normalized.includes('leading') || normalized.includes('left')) {
    return 'Leading icon';
  }
  if (normalized.includes('trailing') || normalized.includes('right')) {
    return 'Trailing icon';
  }
  return 'Icon';
}

export function iconSlotVisibilityLabel(slotLabel: string): string {
  const normalized = slotLabel.trim().toLowerCase();
  if (!normalized || normalized === 'icon') {
    return 'Show icon';
  }
  return `Show ${normalized}`;
}

export function looksLikeIconLayerName(name: string): boolean {
  return ICON_LAYER_NAME_RE.test(name) || name.startsWith('Icon/');
}

function isVectorLikeIconNode(node: SceneNode): boolean {
  return (
    node.type === 'VECTOR' ||
    node.type === 'BOOLEAN_OPERATION' ||
    node.type === 'LINE' ||
    node.type === 'ELLIPSE' ||
    node.type === 'POLYGON' ||
    node.type === 'RECTANGLE' ||
    node.type === 'STAR'
  );
}
