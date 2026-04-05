import { STORAGE_KEYS, lsGetJson, lsSetJson } from './storage';

const MAX_RECENT = 15;

/** Return the list of recently-edited token paths (most recent first). */
export function getRecentTokens(): string[] {
  return lsGetJson<string[]>(STORAGE_KEYS.RECENT_TOKENS, []);
}

/** Prepend a token path to the recent list, deduplicate, and cap at MAX_RECENT. */
export function addRecentToken(path: string): void {
  const current = getRecentTokens();
  const deduped = [path, ...current.filter(p => p !== path)].slice(0, MAX_RECENT);
  lsSetJson(STORAGE_KEYS.RECENT_TOKENS, deduped);
}

/** Remove a token path from the recent list (e.g. on delete). */
export function removeRecentToken(path: string): void {
  const current = getRecentTokens();
  const filtered = current.filter(p => p !== path);
  if (filtered.length !== current.length) {
    lsSetJson(STORAGE_KEYS.RECENT_TOKENS, filtered);
  }
}

/** Rename a token path in the recent list (preserves position). */
export function renameRecentToken(oldPath: string, newPath: string): void {
  const current = getRecentTokens();
  const updated = current.map(p => (p === oldPath ? newPath : p));
  if (updated.some((p, i) => p !== current[i])) {
    lsSetJson(STORAGE_KEYS.RECENT_TOKENS, updated);
  }
}
