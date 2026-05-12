export const ICON_REGISTRY_SCHEMA =
  'https://tokenworkshop.local/schemas/icons.json';

export const DEFAULT_ICON_COMPONENT_PREFIX = 'Icon';
export const DEFAULT_ICON_SIZE = 24;
export const DEFAULT_ICON_PAGE_NAME = 'Icons';

export function normalizeIconPath(value: string): string {
  const segments = splitIconPath(value).map((segment) =>
    segment
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, ''),
  );
  const normalized = segments.filter(Boolean).join('.');
  if (!normalized) {
    throw new Error('Icon path must contain at least one name segment.');
  }
  return normalized;
}

export function iconIdFromPath(path: string): string {
  return `icon.${normalizeIconPath(path)}`;
}

export function iconComponentNameFromPath(
  path: string,
  componentPrefix = DEFAULT_ICON_COMPONENT_PREFIX,
): string {
  const prefix = componentPrefix.trim();
  if (!prefix) {
    throw new Error('Icon component prefix is required.');
  }

  return [
    prefix,
    ...normalizeIconPath(path).split('.').map((segment) => toTitleSegment(segment)),
  ].join('/');
}

export function iconExportNameFromPath(path: string): string {
  const baseName = normalizeIconPath(path)
    .split('.')
    .map((segment) => toTitleSegment(segment))
    .join('');
  return `${baseName}Icon`;
}

export function iconNameFromPath(path: string): string {
  const lastSegment = normalizeIconPath(path).split('.').at(-1) ?? path;
  return lastSegment
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function splitIconPath(value: string): string[] {
  return value
    .trim()
    .split(/[./\\]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function toTitleSegment(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}
