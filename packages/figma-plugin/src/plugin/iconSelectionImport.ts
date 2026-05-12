import type { IconSelectionImportItem } from '../shared/types.js';

const SVG_EXPORT_SETTINGS: ExportSettingsSVG = {
  format: 'SVG',
  svgOutlineText: true,
  svgIdAttribute: false,
  svgSimplifyStroke: false,
};

const ICON_PREFIX_RE = /^icon[/_.\-\s]+/i;
const SUPPORTED_SELECTION_TYPES = new Set<string>([
  'BOOLEAN_OPERATION',
  'COMPONENT',
  'ELLIPSE',
  'FRAME',
  'GROUP',
  'INSTANCE',
  'LINE',
  'POLYGON',
  'RECTANGLE',
  'STAR',
  'VECTOR',
]);

type SvgViewBoxMetadata = {
  viewBox: string;
  viewBoxMinX: number;
  viewBoxMinY: number;
  viewBoxWidth: number;
  viewBoxHeight: number;
};

export async function readSelectedIconsForImport(): Promise<IconSelectionImportItem[]> {
  const selection = [...figma.currentPage.selection];
  if (selection.length === 0) {
    throw new Error('Select one or more Figma layers to import as icons.');
  }

  const icons: IconSelectionImportItem[] = [];
  for (const node of selection) {
    icons.push(await readIconSelectionItem(node));
  }
  return icons;
}

async function readIconSelectionItem(node: SceneNode): Promise<IconSelectionImportItem> {
  assertExportableNode(node);

  const linkedComponent = await readLinkedComponent(node);
  const exportNode = linkedComponent ?? node;
  assertExportableNode(exportNode);

  const svgBytes = await exportNode.exportAsync(SVG_EXPORT_SETTINGS);
  const svg = new TextDecoder().decode(svgBytes);
  const viewBox = readSvgViewBoxMetadata(svg);
  const suggestedName = displayNameFromNodeName(exportNode.name);

  return {
    nodeId: node.id,
    nodeName: node.name,
    nodeType: node.type,
    fileKey: figma.fileKey ?? null,
    pageId: figma.currentPage.id,
    pageName: figma.currentPage.name,
    svg,
    ...viewBox,
    suggestedPath: pathFromNodeName(exportNode.name),
    suggestedName,
    width: roundDimension(exportNode.width),
    height: roundDimension(exportNode.height),
    warnings: collectSelectionImportWarnings(node, exportNode),
    ...(linkedComponent
      ? {
          componentId: linkedComponent.id,
          componentKey: linkedComponent.key || null,
        }
      : {}),
  };
}

function assertExportableNode(node: SceneNode): void {
  if (!SUPPORTED_SELECTION_TYPES.has(node.type)) {
    throw new Error(
      `"${node.name}" is a ${node.type.toLowerCase()} layer and cannot be imported as an icon.`,
    );
  }
  if (node.type === 'SLICE') {
    throw new Error(`"${node.name}" is a slice and cannot be imported as an icon.`);
  }
  if (node.width <= 0 || node.height <= 0) {
    throw new Error(`"${node.name}" must have a visible width and height.`);
  }
}

async function readLinkedComponent(
  node: SceneNode,
): Promise<ComponentNode | null> {
  if (node.type === 'COMPONENT') {
    return node;
  }
  if (node.type === 'INSTANCE') {
    return node.getMainComponentAsync();
  }
  return null;
}

function collectSelectionImportWarnings(
  selectedNode: SceneNode,
  exportNode: SceneNode,
): string[] {
  const warnings = new Set<string>();

  if (exportNode !== selectedNode) {
    warnings.add('Imports the selected instance from its main component artwork.');
  }

  if (!selectedNode.visible || !exportNode.visible || hasHiddenDescendants(exportNode)) {
    warnings.add(
      'Contains hidden layers; import uses the exported SVG appearance, so review the source if hidden artwork should not affect the icon.',
    );
  }

  if (selectedNode.locked || exportNode.locked || hasLockedDescendants(exportNode)) {
    warnings.add(
      'Contains locked layers; unlock and review the source if the artwork should be editable before import.',
    );
  }

  if (hasUnsupportedDescendants(exportNode)) {
    warnings.add(
      'Contains text or other non-vector child layers; import flattens them into SVG artwork and future edits may be harder.',
    );
  }

  if (hasMaskDescendants(exportNode)) {
    warnings.add(
      'Contains masks; import preserves the exported appearance, but masked artwork can be harder to audit and repair later.',
    );
  }

  if (hasEffects(exportNode)) {
    warnings.add(
      'Contains effects; shadows, blurs, and similar styling are baked into the imported SVG artwork.',
    );
  }

  if (hasVisibleStrokePaint(exportNode)) {
    warnings.add(
      'Contains strokes; confirm stroke weights still look correct when the icon is swapped or resized.',
    );
  }

  if (hasImagePaint(exportNode)) {
    warnings.add(
      'Contains image fills; raster artwork may scale poorly and increase export size. Prefer vector artwork for icons.',
    );
  }

  return Array.from(warnings);
}

function hasHiddenDescendants(node: SceneNode): boolean {
  if (!('children' in node)) {
    return false;
  }

  return node.children.some((child) => !child.visible || hasHiddenDescendants(child));
}

function hasLockedDescendants(node: SceneNode): boolean {
  if (!('children' in node)) {
    return false;
  }

  return node.children.some((child) => child.locked || hasLockedDescendants(child));
}

function hasUnsupportedDescendants(node: SceneNode): boolean {
  if (!('children' in node)) {
    return false;
  }

  return node.children.some((child) => {
    if (!SUPPORTED_SELECTION_TYPES.has(child.type)) {
      return true;
    }
    return hasUnsupportedDescendants(child);
  });
}

function hasMaskDescendants(node: SceneNode): boolean {
  if (nodeHasMask(node)) {
    return true;
  }
  if (!('children' in node)) {
    return false;
  }
  return node.children.some((child) => hasMaskDescendants(child));
}

function nodeHasMask(node: SceneNode): boolean {
  return 'isMask' in node && node.isMask;
}

function hasEffects(node: SceneNode): boolean {
  if (nodeHasEffects(node)) {
    return true;
  }
  if (!('children' in node)) {
    return false;
  }
  return node.children.some((child) => hasEffects(child));
}

function nodeHasEffects(node: SceneNode): boolean {
  return 'effects' in node && Array.isArray(node.effects) && node.effects.length > 0;
}

function hasVisibleStrokePaint(node: SceneNode): boolean {
  if (nodeHasVisibleStrokePaint(node)) {
    return true;
  }
  if (!('children' in node)) {
    return false;
  }
  return node.children.some((child) => hasVisibleStrokePaint(child));
}

function nodeHasVisibleStrokePaint(node: SceneNode): boolean {
  if (!('strokes' in node) || !Array.isArray(node.strokes)) {
    return false;
  }
  return node.strokes.some((paint) => paint.visible !== false);
}

function hasImagePaint(node: SceneNode): boolean {
  if (nodeHasImageFill(node)) {
    return true;
  }
  if (!('children' in node)) {
    return false;
  }
  return node.children.some((child) => hasImagePaint(child));
}

function nodeHasImageFill(node: SceneNode): boolean {
  if (!('fills' in node) || !Array.isArray(node.fills)) {
    return false;
  }
  return node.fills.some((paint) => paint.type === 'IMAGE');
}

function readSvgViewBoxMetadata(svg: string): SvgViewBoxMetadata {
  const openTag = /<svg(?=[\s>/])[^>]*>/i.exec(svg)?.[0];
  const rawViewBox = openTag ? readSvgAttribute(openTag, 'viewBox') : null;
  if (!rawViewBox) {
    throw new Error('Selected artwork exported without an SVG viewBox.');
  }

  const numbers = rawViewBox
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((value) => Number(value));
  if (
    numbers.length !== 4 ||
    numbers.some((value) => !Number.isFinite(value)) ||
    numbers[2] <= 0 ||
    numbers[3] <= 0
  ) {
    throw new Error('Selected artwork exported with an invalid SVG viewBox.');
  }

  return {
    viewBox: numbers.map(formatSvgNumber).join(' '),
    viewBoxMinX: numbers[0],
    viewBoxMinY: numbers[1],
    viewBoxWidth: numbers[2],
    viewBoxHeight: numbers[3],
  };
}

function readSvgAttribute(tag: string, attributeName: string): string | null {
  const pattern = new RegExp(
    '\\s' +
      escapeRegExp(attributeName) +
      '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s"\'=<>`]+))',
    'i',
  );
  const match = pattern.exec(tag);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatSvgNumber(value: number): string {
  if (Object.is(value, -0)) {
    return '0';
  }
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
}

function displayNameFromNodeName(name: string): string {
  const segments = name
    .replace(ICON_PREFIX_RE, '')
    .split(/[/_.-]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  const leaf = (segments.at(-1) ?? name.trim()) || 'Icon';
  return leaf
    .split(/\s+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function pathFromNodeName(name: string): string {
  const path = name
    .replace(ICON_PREFIX_RE, '')
    .split(/[/_.]+/)
    .flatMap((segment) => segment.split(/\s*-\s*/))
    .map(slugSegment)
    .filter(Boolean)
    .join('.');

  return path || 'icon';
}

function slugSegment(segment: string): string {
  return segment
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function roundDimension(value: number): number {
  return Math.round(value * 100) / 100;
}
