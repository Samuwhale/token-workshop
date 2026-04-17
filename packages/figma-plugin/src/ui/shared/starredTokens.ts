import { STORAGE_KEYS, lsGetJson, lsSetJson } from './storage';

export interface StarredToken {
  path: string;
  collectionId: string;
}

/** Return all starred tokens in the order they were starred. */
export function getStarredTokens(): StarredToken[] {
  return lsGetJson<StarredToken[]>(STORAGE_KEYS.STARRED_TOKENS, []);
}

/** Add a token to starred list (no-op if already starred). */
export function addStarredToken(path: string, collectionId: string): void {
  const current = getStarredTokens();
  if (current.some(e => e.path === path && e.collectionId === collectionId)) return;
  lsSetJson(STORAGE_KEYS.STARRED_TOKENS, [...current, { path, collectionId }]);
}

/** Remove a token from the starred list. */
export function removeStarredToken(path: string, collectionId: string): void {
  const current = getStarredTokens();
  const filtered = current.filter(e => !(e.path === path && e.collectionId === collectionId));
  if (filtered.length !== current.length) {
    lsSetJson(STORAGE_KEYS.STARRED_TOKENS, filtered);
  }
}

/** Toggle starred status; returns the new starred state. */
export function toggleStarredToken(path: string, collectionId: string): boolean {
  const current = getStarredTokens();
  const idx = current.findIndex(e => e.path === path && e.collectionId === collectionId);
  if (idx >= 0) {
    lsSetJson(STORAGE_KEYS.STARRED_TOKENS, current.filter((_, i) => i !== idx));
    return false;
  } else {
    lsSetJson(STORAGE_KEYS.STARRED_TOKENS, [...current, { path, collectionId }]);
    return true;
  }
}

/** Check if a token is starred. */
export function isTokenStarred(path: string, collectionId: string): boolean {
  return getStarredTokens().some(e => e.path === path && e.collectionId === collectionId);
}

/** Remove all starred tokens for a deleted collection. */
export function removeStarredTokensForCollection(collectionId: string): void {
  const current = getStarredTokens();
  const filtered = current.filter(e => e.collectionId !== collectionId);
  if (filtered.length !== current.length) {
    lsSetJson(STORAGE_KEYS.STARRED_TOKENS, filtered);
  }
}

/** Rename a collection in all starred tokens. */
export function renameStarredTokensForCollection(oldName: string, newName: string): void {
  const current = getStarredTokens();
  const updated = current.map(e => e.collectionId === oldName ? { ...e, collectionId: newName } : e);
  lsSetJson(STORAGE_KEYS.STARRED_TOKENS, updated);
}

/** Update path for a renamed token. */
export function renameStarredToken(oldPath: string, newPath: string, collectionId: string): void {
  const current = getStarredTokens();
  const updated = current.map(e =>
    e.path === oldPath && e.collectionId === collectionId ? { ...e, path: newPath } : e,
  );
  lsSetJson(STORAGE_KEYS.STARRED_TOKENS, updated);
}
