import { STORAGE_KEYS, lsGetJson, lsSetJson } from './storage';

const MAX_RECENT = 10;

/** Return the list of recently-bound token paths (most recent first). */
export function getRecentTokens(): string[] {
  return lsGetJson<string[]>(STORAGE_KEYS.RECENT_TOKENS, []);
}

/** Prepend a token path to the recent list, deduplicate, and cap at MAX_RECENT. */
export function addRecentToken(path: string): void {
  const current = getRecentTokens();
  const deduped = [path, ...current.filter(p => p !== path)].slice(0, MAX_RECENT);
  lsSetJson(STORAGE_KEYS.RECENT_TOKENS, deduped);
}
