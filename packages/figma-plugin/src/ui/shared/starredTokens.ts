import { STORAGE_KEYS, lsGetJson, lsSetJson } from './storage';

export interface StarredToken {
  path: string;
  setName: string;
}

/** Return all starred tokens in the order they were starred. */
export function getStarredTokens(): StarredToken[] {
  return lsGetJson<StarredToken[]>(STORAGE_KEYS.STARRED_TOKENS, []);
}

/** Add a token to starred list (no-op if already starred). */
export function addStarredToken(path: string, setName: string): void {
  const current = getStarredTokens();
  if (current.some(e => e.path === path && e.setName === setName)) return;
  lsSetJson(STORAGE_KEYS.STARRED_TOKENS, [...current, { path, setName }]);
}

/** Remove a token from the starred list. */
export function removeStarredToken(path: string, setName: string): void {
  const current = getStarredTokens();
  const filtered = current.filter(e => !(e.path === path && e.setName === setName));
  if (filtered.length !== current.length) {
    lsSetJson(STORAGE_KEYS.STARRED_TOKENS, filtered);
  }
}

/** Toggle starred status; returns the new starred state. */
export function toggleStarredToken(path: string, setName: string): boolean {
  const current = getStarredTokens();
  const idx = current.findIndex(e => e.path === path && e.setName === setName);
  if (idx >= 0) {
    lsSetJson(STORAGE_KEYS.STARRED_TOKENS, current.filter((_, i) => i !== idx));
    return false;
  } else {
    lsSetJson(STORAGE_KEYS.STARRED_TOKENS, [...current, { path, setName }]);
    return true;
  }
}

/** Check if a token is starred. */
export function isTokenStarred(path: string, setName: string): boolean {
  return getStarredTokens().some(e => e.path === path && e.setName === setName);
}

/** Remove all starred tokens for a deleted/renamed set. */
export function removeStarredTokensForSet(setName: string): void {
  const current = getStarredTokens();
  const filtered = current.filter(e => e.setName !== setName);
  if (filtered.length !== current.length) {
    lsSetJson(STORAGE_KEYS.STARRED_TOKENS, filtered);
  }
}

/** Rename set in all starred tokens. */
export function renameStarredTokensForSet(oldName: string, newName: string): void {
  const current = getStarredTokens();
  const updated = current.map(e => e.setName === oldName ? { ...e, setName: newName } : e);
  lsSetJson(STORAGE_KEYS.STARRED_TOKENS, updated);
}

/** Update path for a renamed token. */
export function renameStarredToken(oldPath: string, newPath: string, setName: string): void {
  const current = getStarredTokens();
  const updated = current.map(e =>
    e.path === oldPath && e.setName === setName ? { ...e, path: newPath } : e,
  );
  lsSetJson(STORAGE_KEYS.STARRED_TOKENS, updated);
}
