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

/** Extract a human-readable message from an unknown caught value. */
export function getErrorMessage(err: unknown, fallback = 'An unexpected error occurred'): string {
  return err instanceof Error ? err.message : fallback;
}

/** JSON.stringify with keys sorted recursively, so key-insertion-order differences never produce different strings. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return JSON.stringify(value);
  }
  const keys = Object.keys(value as object).sort();
  const parts = keys.map(k => JSON.stringify(k) + ':' + stableStringify((value as Record<string, unknown>)[k]));
  return '{' + parts.join(',') + '}';
}
