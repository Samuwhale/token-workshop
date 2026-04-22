import { COLLECTION_NAME_RE as CORE_COLLECTION_NAME_RE } from '@tokenmanager/core';

/** Validates collection ids: letters, numbers, - and _ with / for folder hierarchy. */
export const COLLECTION_NAME_RE = CORE_COLLECTION_NAME_RE;

/** Detect Mac platform for keyboard shortcut labels. */
export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);

/** Platform-adaptive modifier key symbol: ⌘ on Mac, Ctrl on others. */
export const modKey = isMac ? '⌘' : 'Ctrl+';

/** Platform-adaptive shift symbol: ⇧ on Mac, Shift+ on others. */
export const shiftKey = isMac ? '⇧' : 'Shift+';

/** Replace Mac-only modifier symbols (⌘, ⇧) with platform-appropriate labels. */
export function adaptShortcut(shortcut: string): string {
  if (isMac) return shortcut;
  return shortcut.replace(/⌘/g, 'Ctrl+').replace(/⇧/g, 'Shift+');
}

/** Returns true if the caught value is an AbortError (from AbortController.signal). */
export function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

/** Extract a human-readable message from an unknown caught value. */
export function getErrorMessage(err: unknown, fallback = 'An unexpected error occurred'): string {
  return err instanceof Error ? err.message : fallback;
}

export function coerceBooleanValue(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') {
      return true;
    }
    if (normalized === 'false' || normalized === '0' || normalized === '') {
      return false;
    }
  }
  if (typeof value === 'number') {
    if (Number.isNaN(value)) {
      return false;
    }
    return value !== 0;
  }
  return Boolean(value);
}

/** Build a user-facing error string for a failed operation. */
export function describeError(err: unknown, operation?: string): string {
  return operation
    ? `${operation} failed: ${getErrorMessage(err, String(err))}`
    : getErrorMessage(err, String(err));
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

function serializeStable(value: unknown, insideArray: boolean): string | undefined {
  if (value === null) {
    return 'null';
  }

  const valueType = typeof value;
  if (valueType === 'string' || valueType === 'number' || valueType === 'boolean') {
    return JSON.stringify(value);
  }

  if (valueType === 'undefined' || valueType === 'function' || valueType === 'symbol') {
    return insideArray ? 'null' : undefined;
  }

  if (Array.isArray(value)) {
    return `[${value.map(item => serializeStable(item, true) ?? 'null').join(',')}]`;
  }

  if (valueType !== 'object') {
    return JSON.stringify(value);
  }

  const record = value as Record<string, unknown>;
  const parts: string[] = [];
  for (const key of Object.keys(record).sort()) {
    const serialized = serializeStable(record[key], false);
    if (serialized !== undefined) {
      parts.push(`${JSON.stringify(key)}:${serialized}`);
    }
  }
  return `{${parts.join(',')}}`;
}

/** JSON.stringify with keys sorted recursively, so key-insertion-order differences never produce different strings. */
export function stableStringify(value: unknown): string {
  return serializeStable(value, false) ?? 'null';
}

/** Convert a dot-separated token path into the wildcard route form expected by `/api/tokens/:collection/*`.
 * Each logical segment becomes one slash-delimited URL segment after `encodeURIComponent`.
 * e.g. `color.brand.primary` → `color/brand/primary`. */
export function tokenPathToUrlSegment(path: string): string {
  return path.split('.').map(encodeURIComponent).join('/');
}
