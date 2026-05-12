import type {
  IconColorBehavior,
  IconColorMetadata,
  IconCodeMetadata,
  IconFigmaLink,
  IconRegistryFile,
  IconRegistrySettings,
  IconSource,
  IconStatus,
  IconSvgMetadata,
  ManagedIcon,
} from './icon-types.js';
import {
  DEFAULT_ICON_COMPONENT_PREFIX,
  DEFAULT_ICON_PAGE_NAME,
  DEFAULT_ICON_SIZE,
  ICON_REGISTRY_SCHEMA,
  iconComponentNameFromPath,
  iconExportNameFromPath,
  iconIdFromPath,
  iconNameFromPath,
  normalizeIconPath,
} from './icon-naming.js';

const ICON_STATUSES = new Set<IconStatus>([
  'draft',
  'published',
  'deprecated',
]);

export function createDefaultIconRegistry(): IconRegistryFile {
  return {
    $schema: ICON_REGISTRY_SCHEMA,
    icons: [],
    settings: createDefaultIconRegistrySettings(),
  };
}

export function createDefaultIconRegistrySettings(): IconRegistrySettings {
  return {
    componentPrefix: DEFAULT_ICON_COMPONENT_PREFIX,
    defaultSize: DEFAULT_ICON_SIZE,
    pageName: DEFAULT_ICON_PAGE_NAME,
  };
}

export interface ParsedIconSvg {
  content: string;
  viewBox: string;
  hash: string;
  contentHash: string;
  color: IconColorMetadata;
}

export function parseIconSvg(input: string): ParsedIconSvg {
  const content = normalizeIconSvgText(input);
  const viewBox = extractIconSvgViewBox(content);
  const hash = hashIconSvgContent(content);
  const color = analyzeIconSvgColor(content);
  return {
    content,
    viewBox,
    hash,
    contentHash: hash,
    color,
  };
}

export function normalizeIconSvgText(input: string): string {
  if (typeof input !== 'string' || !input.trim()) {
    throw new Error('SVG content must be a non-empty string.');
  }
  if (input.includes('\0')) {
    throw new Error('SVG content must not contain null bytes.');
  }
  return input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
}

export function extractIconSvgViewBox(svg: string): string {
  const openTag = readSvgOpeningTag(svg);
  const rawViewBox = readSvgAttribute(openTag, 'viewBox');
  if (!rawViewBox) {
    throw new Error('SVG root element must define a viewBox.');
  }

  const values = rawViewBox
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  if (values.length !== 4) {
    throw new Error('SVG viewBox must contain four numeric values.');
  }

  const numbers = values.map((value) => Number(value));
  if (numbers.some((value) => !Number.isFinite(value))) {
    throw new Error('SVG viewBox must contain four finite numeric values.');
  }
  if (numbers[2] <= 0 || numbers[3] <= 0) {
    throw new Error('SVG viewBox width and height must be positive.');
  }

  return numbers.map(formatSvgNumber).join(' ');
}

export function hashIconSvgContent(svg: string): string {
  return `sha256:${sha256Hex(normalizeIconSvgText(svg))}`;
}

export function analyzeIconSvgColor(svg: string): IconColorMetadata {
  const content = normalizeIconSvgText(svg);
  readSvgOpeningTag(content);

  const paintValues = new Set<string>();
  let usesCurrentColor = false;
  let hasInlineStyles = false;
  let hasPaintServers = false;
  let hasOpacity = false;

  for (const styleContent of readSvgStyleBlocks(content)) {
    for (const declaration of readCssPaintDeclarations(styleContent)) {
      collectPaintDeclaration(declaration.name, declaration.value);
    }
  }

  for (const tag of readSvgTags(content)) {
    const tagName = readTagName(tag);
    if (!tagName || isIgnoredSvgTag(tagName)) {
      continue;
    }
    if (isPaintServerTag(tagName)) {
      hasPaintServers = true;
    }

    const attributes = readSvgAttributes(tag);
    for (const [name, rawValue] of attributes) {
      const normalizedName = name.toLowerCase();
      const value = rawValue.trim();
      if (!value) {
        continue;
      }

      if (normalizedName === 'style') {
        hasInlineStyles = true;
        for (const declaration of readStyleDeclarations(value)) {
          collectPaintDeclaration(declaration.name, declaration.value);
        }
        continue;
      }

      collectPaintDeclaration(normalizedName, value);
    }
  }

  const values = Array.from(paintValues).sort();
  return {
    behavior: iconColorBehavior({
      values,
      usesCurrentColor,
      hasPaintServers,
    }),
    values,
    usesCurrentColor,
    hasInlineStyles,
    hasPaintServers,
    hasOpacity,
  };

  function collectPaintDeclaration(name: string, value: string): void {
    const normalizedName = name.toLowerCase();
    if (normalizedName.includes('opacity')) {
      hasOpacity = true;
    }
    if (!isPaintProperty(normalizedName)) {
      return;
    }

    const paint = normalizePaintValue(value);
    if (!paint || paint === 'none') {
      return;
    }
    if (paint === 'currentcolor') {
      usesCurrentColor = true;
      return;
    }
    if (paint.startsWith('url(')) {
      hasPaintServers = true;
      return;
    }
    paintValues.add(paint);
  }
}

export function normalizeIconRegistryFile(input: unknown): IconRegistryFile {
  if (!isRecord(input)) {
    throw new Error('Icon registry must be a JSON object.');
  }

  const settings = normalizeIconRegistrySettings(input.settings);
  const rawIcons = input.icons;
  if (!Array.isArray(rawIcons)) {
    throw new Error('Icon registry field "icons" must be an array.');
  }

  const seenIds = new Set<string>();
  const seenPaths = new Set<string>();
  const seenComponentNames = new Set<string>();
  const icons = rawIcons.map((rawIcon, index) => {
    const icon = normalizeManagedIcon(rawIcon, settings, index);
    assertUnique(icon.id, seenIds, `Duplicate icon id "${icon.id}".`);
    assertUnique(icon.path, seenPaths, `Duplicate icon path "${icon.path}".`);
    assertUnique(
      icon.componentName,
      seenComponentNames,
      `Duplicate icon component name "${icon.componentName}".`,
    );
    return icon;
  });

  const schema = typeof input.$schema === 'string' && input.$schema.trim()
    ? input.$schema.trim()
    : ICON_REGISTRY_SCHEMA;

  return {
    $schema: schema,
    icons,
    settings,
  };
}

function normalizeIconRegistrySettings(input: unknown): IconRegistrySettings {
  const defaults = createDefaultIconRegistrySettings();
  if (input === undefined) {
    return defaults;
  }
  if (!isRecord(input)) {
    throw new Error('Icon registry field "settings" must be an object.');
  }

  const componentPrefix = readOptionalString(
    input.componentPrefix,
    defaults.componentPrefix,
    'settings.componentPrefix',
  );
  const defaultSize = readOptionalPositiveNumber(
    input.defaultSize,
    defaults.defaultSize,
    'settings.defaultSize',
  );
  const pageName = readOptionalString(
    input.pageName,
    defaults.pageName,
    'settings.pageName',
  );

  return {
    componentPrefix,
    defaultSize,
    pageName,
  };
}

function normalizeManagedIcon(
  input: unknown,
  settings: IconRegistrySettings,
  index: number,
): ManagedIcon {
  if (!isRecord(input)) {
    throw new Error(`Icon at index ${index} must be an object.`);
  }

  const path = normalizeIconPath(
    readRequiredString(input.path, `icons[${index}].path`),
  );
  const id = readOptionalString(
    input.id,
    iconIdFromPath(path),
    `icons[${index}].id`,
  );
  const name = readOptionalString(
    input.name,
    iconNameFromPath(path),
    `icons[${index}].name`,
  );
  const componentName = readOptionalString(
    input.componentName,
    iconComponentNameFromPath(path, settings.componentPrefix),
    `icons[${index}].componentName`,
  );
  const source = normalizeIconSource(input.source, index);
  const svg = normalizeIconSvgMetadata(input.svg, index);
  const figma = normalizeIconFigmaLink(input.figma, index);
  const code = normalizeIconCodeMetadata(input.code, path, index);
  const status = normalizeIconStatus(input.status, index);
  const tags = normalizeIconTags(input.tags, index);

  return {
    id,
    name,
    path,
    componentName,
    source,
    svg,
    figma,
    code,
    status,
    ...(tags.length > 0 ? { tags } : {}),
  };
}

function normalizeIconSource(input: unknown, index: number): IconSource {
  if (!isRecord(input)) {
    throw new Error(`icons[${index}].source must be an object.`);
  }
  const kind = readRequiredString(input.kind, `icons[${index}].source.kind`);

  if (kind === 'local-svg') {
    return {
      kind,
      path: readRequiredString(input.path, `icons[${index}].source.path`),
    };
  }
  if (kind === 'pasted-svg') {
    return { kind };
  }
  if (kind === 'figma-selection') {
    return {
      kind,
      nodeId: readRequiredString(input.nodeId, `icons[${index}].source.nodeId`),
    };
  }
  if (kind === 'generated') {
    const description = readNullableString(
      input.description,
      `icons[${index}].source.description`,
    );
    return {
      kind,
      ...(description ? { description } : {}),
    };
  }

  throw new Error(`icons[${index}].source.kind "${kind}" is not supported.`);
}

function normalizeIconSvgMetadata(input: unknown, index: number): IconSvgMetadata {
  if (!isRecord(input)) {
    throw new Error(`icons[${index}].svg must be an object.`);
  }
  const content = readNullableString(
    input.content,
    `icons[${index}].svg.content`,
  );
  const color =
    input.color === undefined && content
      ? analyzeIconSvgColor(content)
      : normalizeIconColorMetadata(input.color, index);
  return {
    viewBox: readRequiredString(input.viewBox, `icons[${index}].svg.viewBox`),
    hash: readRequiredString(input.hash, `icons[${index}].svg.hash`),
    contentHash: readRequiredString(
      input.contentHash,
      `icons[${index}].svg.contentHash`,
    ),
    color,
    ...(content ? { content } : {}),
  };
}

function normalizeIconColorMetadata(
  input: unknown,
  index: number,
): IconColorMetadata {
  if (input === undefined) {
    return createUnknownIconColorMetadata();
  }
  if (!isRecord(input)) {
    throw new Error(`icons[${index}].svg.color must be an object.`);
  }

  const behavior = readRequiredString(
    input.behavior,
    `icons[${index}].svg.color.behavior`,
  );
  if (!isIconColorBehavior(behavior)) {
    throw new Error(
      `icons[${index}].svg.color.behavior must be inheritable, hardcoded-monotone, multicolor, or unknown.`,
    );
  }

  return {
    behavior,
    values: readStringArray(input.values, `icons[${index}].svg.color.values`),
    usesCurrentColor: readBoolean(
      input.usesCurrentColor,
      `icons[${index}].svg.color.usesCurrentColor`,
    ),
    hasInlineStyles: readBoolean(
      input.hasInlineStyles,
      `icons[${index}].svg.color.hasInlineStyles`,
    ),
    hasPaintServers: readBoolean(
      input.hasPaintServers,
      `icons[${index}].svg.color.hasPaintServers`,
    ),
    hasOpacity: readBoolean(
      input.hasOpacity,
      `icons[${index}].svg.color.hasOpacity`,
    ),
  };
}

function normalizeIconFigmaLink(input: unknown, index: number): IconFigmaLink {
  if (input === undefined) {
    return {
      componentId: null,
      componentKey: null,
      lastSyncedHash: null,
    };
  }
  if (!isRecord(input)) {
    throw new Error(`icons[${index}].figma must be an object.`);
  }
  return {
    componentId: readNullableString(
      input.componentId,
      `icons[${index}].figma.componentId`,
    ),
    componentKey: readNullableString(
      input.componentKey,
      `icons[${index}].figma.componentKey`,
    ),
    lastSyncedHash: readNullableString(
      input.lastSyncedHash,
      `icons[${index}].figma.lastSyncedHash`,
    ),
  };
}

function normalizeIconCodeMetadata(
  input: unknown,
  path: string,
  index: number,
): IconCodeMetadata {
  if (input === undefined) {
    return { exportName: iconExportNameFromPath(path) };
  }
  if (!isRecord(input)) {
    throw new Error(`icons[${index}].code must be an object.`);
  }
  return {
    exportName: readOptionalString(
      input.exportName,
      iconExportNameFromPath(path),
      `icons[${index}].code.exportName`,
    ),
  };
}

function normalizeIconStatus(input: unknown, index: number): IconStatus {
  if (input === undefined) {
    return 'draft';
  }
  if (typeof input !== 'string' || !ICON_STATUSES.has(input as IconStatus)) {
    throw new Error(
      `icons[${index}].status must be one of draft, published, or deprecated.`,
    );
  }
  return input as IconStatus;
}

function normalizeIconTags(input: unknown, index: number): string[] {
  if (input === undefined) {
    return [];
  }
  if (!Array.isArray(input)) {
    throw new Error(`icons[${index}].tags must be an array of strings.`);
  }
  const tags = input.map((tag, tagIndex) => {
    if (typeof tag !== 'string' || !tag.trim()) {
      throw new Error(`icons[${index}].tags[${tagIndex}] must be a non-empty string.`);
    }
    return tag.trim();
  });
  return Array.from(new Set(tags));
}

function createUnknownIconColorMetadata(): IconColorMetadata {
  return {
    behavior: 'unknown',
    values: [],
    usesCurrentColor: false,
    hasInlineStyles: false,
    hasPaintServers: false,
    hasOpacity: false,
  };
}

function isIconColorBehavior(value: string): value is IconColorBehavior {
  return (
    value === 'inheritable' ||
    value === 'hardcoded-monotone' ||
    value === 'multicolor' ||
    value === 'unknown'
  );
}

function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} must be a non-empty string.`);
  }
  return value.trim();
}

function readOptionalString(
  value: unknown,
  fallback: string,
  field: string,
): string {
  if (value === undefined) {
    return fallback;
  }
  return readRequiredString(value, field);
}

function readNullableString(value: unknown, field: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  return readRequiredString(value, field);
}

function readBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${field} must be a boolean.`);
  }
  return value;
}

function readStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array of strings.`);
  }
  return value.map((item, index) => {
    if (typeof item !== 'string' || !item.trim()) {
      throw new Error(`${field}[${index}] must be a non-empty string.`);
    }
    return item.trim();
  });
}

function readOptionalPositiveNumber(
  value: unknown,
  fallback: number,
  field: string,
): number {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${field} must be a positive number.`);
  }
  return value;
}

function assertUnique(value: string, seen: Set<string>, message: string): void {
  if (seen.has(value)) {
    throw new Error(message);
  }
  seen.add(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readSvgOpeningTag(svg: string): string {
  const body = stripSvgPreamble(svg);
  if (!/^<svg(?=[\s>/])/i.test(body)) {
    throw new Error('SVG content must have <svg> as its root element.');
  }

  let quote: '"' | "'" | null = null;
  for (let index = 4; index < body.length; index += 1) {
    const char = body[index];
    if (quote) {
      if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '>') {
      const openTag = body.slice(0, index + 1);
      const selfClosing = /\/\s*>$/.test(openTag);
      if (selfClosing) {
        assertNoContentAfterSvgRoot(body.slice(index + 1));
      } else {
        const closeMatch = /<\/svg\s*>/i.exec(body.slice(index + 1));
        if (!closeMatch) {
          throw new Error('SVG content must include a closing </svg> tag.');
        }
        assertNoContentAfterSvgRoot(
          body.slice(index + 1 + closeMatch.index + closeMatch[0].length),
        );
      }
      return openTag;
    }
  }

  throw new Error('SVG root element is missing a closing ">".');
}

function stripSvgPreamble(svg: string): string {
  let body = svg.trimStart();
  let changed = true;
  while (changed) {
    changed = false;
    if (body.startsWith('<?xml')) {
      const end = body.indexOf('?>');
      if (end < 0) {
        throw new Error('SVG XML declaration is not closed.');
      }
      body = body.slice(end + 2).trimStart();
      changed = true;
      continue;
    }
    if (body.startsWith('<!--')) {
      const end = body.indexOf('-->');
      if (end < 0) {
        throw new Error('SVG comment is not closed.');
      }
      body = body.slice(end + 3).trimStart();
      changed = true;
      continue;
    }
    if (/^<!doctype\b/i.test(body)) {
      const end = body.indexOf('>');
      if (end < 0) {
        throw new Error('SVG doctype is not closed.');
      }
      body = body.slice(end + 1).trimStart();
      changed = true;
    }
  }
  return body;
}

function assertNoContentAfterSvgRoot(value: string): void {
  let rest = value.trim();
  while (rest.startsWith('<!--')) {
    const end = rest.indexOf('-->');
    if (end < 0) {
      throw new Error('SVG comment is not closed.');
    }
    rest = rest.slice(end + 3).trim();
  }
  if (rest) {
    throw new Error('SVG content must have <svg> as its only root element.');
  }
}

function readSvgAttribute(openTag: string, attributeName: string): string | null {
  const pattern =
    /\s([a-zA-Z_:][a-zA-Z0-9_:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match: RegExpExecArray | null = pattern.exec(openTag);
  while (match) {
    if (match[1] === attributeName) {
      return match[2] ?? match[3] ?? match[4] ?? null;
    }
    match = pattern.exec(openTag);
  }
  return null;
}

function readSvgTags(svg: string): string[] {
  const tags: string[] = [];
  const pattern = /<[^!?/][^>]*>/g;
  let match: RegExpExecArray | null = pattern.exec(svg);
  while (match) {
    tags.push(match[0]);
    match = pattern.exec(svg);
  }
  return tags;
}

function readTagName(tag: string): string | null {
  const match = /^<\s*([a-zA-Z][a-zA-Z0-9:.-]*)/.exec(tag);
  return match ? match[1].toLowerCase() : null;
}

function readSvgAttributes(tag: string): Array<[string, string]> {
  const attributes: Array<[string, string]> = [];
  const pattern =
    /\s([a-zA-Z_:][a-zA-Z0-9_:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match: RegExpExecArray | null = pattern.exec(tag);
  while (match) {
    attributes.push([match[1], match[2] ?? match[3] ?? match[4] ?? '']);
    match = pattern.exec(tag);
  }
  return attributes;
}

function readStyleDeclarations(style: string): Array<{ name: string; value: string }> {
  return style
    .split(';')
    .map((declaration) => {
      const colonIndex = declaration.indexOf(':');
      if (colonIndex < 0) {
        return null;
      }
      const name = declaration.slice(0, colonIndex).trim().toLowerCase();
      const value = declaration.slice(colonIndex + 1).trim();
      return name && value ? { name, value } : null;
    })
    .filter((declaration): declaration is { name: string; value: string } =>
      declaration !== null,
    );
}

function readSvgStyleBlocks(svg: string): string[] {
  const blocks: string[] = [];
  const pattern = /<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi;
  let match: RegExpExecArray | null = pattern.exec(svg);
  while (match) {
    blocks.push(match[1]);
    match = pattern.exec(svg);
  }
  return blocks;
}

function readCssPaintDeclarations(css: string): Array<{ name: string; value: string }> {
  const declarations: Array<{ name: string; value: string }> = [];
  const pattern =
    /\b(fill|stroke|color|stop-color|flood-color|lighting-color|opacity|fill-opacity|stroke-opacity)\s*:\s*([^;}]+)/gi;
  let match: RegExpExecArray | null = pattern.exec(css);
  while (match) {
    declarations.push({
      name: match[1].toLowerCase(),
      value: match[2].trim(),
    });
    match = pattern.exec(css);
  }
  return declarations;
}

function isIgnoredSvgTag(tagName: string): boolean {
  return (
    tagName === 'title' ||
    tagName === 'desc' ||
    tagName === 'metadata'
  );
}

function isPaintServerTag(tagName: string): boolean {
  return (
    tagName === 'lineargradient' ||
    tagName === 'radialgradient' ||
    tagName === 'pattern'
  );
}

function isPaintProperty(property: string): boolean {
  return (
    property === 'fill' ||
    property === 'stroke' ||
    property === 'color' ||
    property === 'stop-color' ||
    property === 'flood-color' ||
    property === 'lighting-color'
  );
}

function normalizePaintValue(value: string): string | null {
  const cleaned = value
    .trim()
    .replace(/\s*!important\s*$/i, '')
    .replace(/^["']|["']$/g, '')
    .trim();
  if (!cleaned) {
    return null;
  }
  if (/^currentColor$/i.test(cleaned)) {
    return 'currentcolor';
  }
  if (/^none$/i.test(cleaned)) {
    return 'none';
  }
  if (/^url\(/i.test(cleaned)) {
    return cleaned.toLowerCase().replace(/\s+/g, '');
  }
  if (/^#[0-9a-f]{3,8}$/i.test(cleaned)) {
    return normalizeHexPaint(cleaned);
  }
  return cleaned.toLowerCase().replace(/\s+/g, ' ');
}

function normalizeHexPaint(value: string): string {
  const hex = value.slice(1).toLowerCase();
  if (hex.length === 3 || hex.length === 4) {
    return `#${hex
      .split('')
      .map((char) => `${char}${char}`)
      .join('')}`;
  }
  return `#${hex}`;
}

function iconColorBehavior(input: {
  values: string[];
  usesCurrentColor: boolean;
  hasPaintServers: boolean;
}): IconColorBehavior {
  if (
    input.hasPaintServers ||
    input.values.length > 1 ||
    (input.usesCurrentColor && input.values.length > 0)
  ) {
    return 'multicolor';
  }
  if (input.usesCurrentColor && input.values.length === 0) {
    return 'inheritable';
  }
  return 'hardcoded-monotone';
}

function formatSvgNumber(value: number): string {
  if (Object.is(value, -0)) {
    return '0';
  }
  return String(value);
}

function sha256Hex(input: string): string {
  return sha256Bytes(utf8Bytes(input))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function utf8Bytes(input: string): number[] {
  const bytes: number[] = [];
  for (const char of input) {
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined) {
      continue;
    }
    if (codePoint <= 0x7f) {
      bytes.push(codePoint);
    } else if (codePoint <= 0x7ff) {
      bytes.push(0xc0 | (codePoint >> 6));
      bytes.push(0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      bytes.push(0xe0 | (codePoint >> 12));
      bytes.push(0x80 | ((codePoint >> 6) & 0x3f));
      bytes.push(0x80 | (codePoint & 0x3f));
    } else {
      bytes.push(0xf0 | (codePoint >> 18));
      bytes.push(0x80 | ((codePoint >> 12) & 0x3f));
      bytes.push(0x80 | ((codePoint >> 6) & 0x3f));
      bytes.push(0x80 | (codePoint & 0x3f));
    }
  }
  return bytes;
}

function sha256Bytes(message: number[]): number[] {
  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
    0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
    0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
    0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
    0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
    0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  const h = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];

  const bytes = message.slice();
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) {
    bytes.push(0);
  }

  const high = Math.floor(bitLength / 0x100000000);
  const low = bitLength >>> 0;
  bytes.push((high >>> 24) & 0xff);
  bytes.push((high >>> 16) & 0xff);
  bytes.push((high >>> 8) & 0xff);
  bytes.push(high & 0xff);
  bytes.push((low >>> 24) & 0xff);
  bytes.push((low >>> 16) & 0xff);
  bytes.push((low >>> 8) & 0xff);
  bytes.push(low & 0xff);

  const w = new Array<number>(64);
  for (let chunk = 0; chunk < bytes.length; chunk += 64) {
    for (let index = 0; index < 16; index += 1) {
      const offset = chunk + index * 4;
      w[index] =
        ((bytes[offset] << 24) |
          (bytes[offset + 1] << 16) |
          (bytes[offset + 2] << 8) |
          bytes[offset + 3]) >>>
        0;
    }
    for (let index = 16; index < 64; index += 1) {
      const s0 =
        rotateRight(w[index - 15], 7) ^
        rotateRight(w[index - 15], 18) ^
        (w[index - 15] >>> 3);
      const s1 =
        rotateRight(w[index - 2], 17) ^
        rotateRight(w[index - 2], 19) ^
        (w[index - 2] >>> 10);
      w[index] = (w[index - 16] + s0 + w[index - 7] + s1) >>> 0;
    }

    let a = h[0];
    let b = h[1];
    let c = h[2];
    let d = h[3];
    let e = h[4];
    let f = h[5];
    let g = h[6];
    let hh = h[7];

    for (let index = 0; index < 64; index += 1) {
      const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hh + s1 + ch + k[index] + w[index]) >>> 0;
      const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;

      hh = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + hh) >>> 0;
  }

  const digest: number[] = [];
  for (const word of h) {
    digest.push((word >>> 24) & 0xff);
    digest.push((word >>> 16) & 0xff);
    digest.push((word >>> 8) & 0xff);
    digest.push(word & 0xff);
  }
  return digest;
}

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}
