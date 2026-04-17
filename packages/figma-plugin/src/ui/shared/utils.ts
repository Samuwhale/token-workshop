/** Validates collection ids: letters, numbers, - and _ with / for folder hierarchy. */
export const COLLECTION_NAME_RE = /^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/;

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

/** Build a user-facing error string for a failed operation. */
export function describeError(err: unknown, operation?: string): string {
  return operation
    ? `${operation} failed: ${getErrorMessage(err, String(err))}`
    : getErrorMessage(err, String(err));
}

/** Log a caught error with a context label. Returns the formatted message string. */
export function logCatch(context: string, err: unknown, level: 'debug' | 'warn' = 'warn'): string {
  const msg = describeError(err, context);
  if (level === 'debug') console.debug(msg);
  else console.warn(msg);
  return msg;
}

/** JSON.stringify with keys sorted recursively, so key-insertion-order differences never produce different strings. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(item => stableStringify(item)).join(',') + ']';
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const parts = keys.map(k => JSON.stringify(k) + ':' + stableStringify(record[k]));
  return '{' + parts.join(',') + '}';
}

/** Convert a dot-separated token path into the wildcard route form expected by `/api/tokens/:collection/*`.
 * Each logical segment becomes one slash-delimited URL segment after `encodeURIComponent`.
 * e.g. `color.brand.primary` → `color/brand/primary`. */
export function tokenPathToUrlSegment(path: string): string {
  return path.split('.').map(encodeURIComponent).join('/');
}

/** Count leaf token nodes in a nested DTCG token group, with breakdown by $type. */
export function countLeafNodes(group: Record<string, any>): { total: number; byType: Record<string, number> } {
  let total = 0;
  const byType: Record<string, number> = {};
  for (const [key, value] of Object.entries(group)) {
    if (key.startsWith('$')) continue;
    if (value && typeof value === 'object' && '$value' in value) {
      total++;
      const t = value.$type || 'unknown';
      byType[t] = (byType[t] || 0) + 1;
    } else if (value && typeof value === 'object') {
      const sub = countLeafNodes(value);
      total += sub.total;
      for (const [t, c] of Object.entries(sub.byType)) {
        byType[t] = (byType[t] || 0) + c;
      }
    }
  }
  return { total, byType };
}
