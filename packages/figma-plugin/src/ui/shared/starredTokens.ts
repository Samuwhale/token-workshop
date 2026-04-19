import { STORAGE_KEYS, lsGetJson, lsRemove, lsSetJson } from './storage';

export interface StarredToken {
  path: string;
  collectionId: string;
}

function createStarredTokenKey(path: string, collectionId: string): string {
  return `${collectionId}\u0000${path}`;
}

function remapStarredTokens(
  current: StarredToken[],
  mapper: (entry: StarredToken) => StarredToken,
): StarredToken[] {
  const remapped: StarredToken[] = [];
  const seen = new Set<string>();
  let changed = false;

  for (const entry of current) {
    const nextEntry = mapper(entry);
    if (
      nextEntry.path !== entry.path ||
      nextEntry.collectionId !== entry.collectionId
    ) {
      changed = true;
    }

    const key = createStarredTokenKey(nextEntry.path, nextEntry.collectionId);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    remapped.push(nextEntry);
  }

  return changed ? sanitizeStarredTokens(remapped) : current;
}

function isStarredTokenEntry(value: unknown): value is StarredToken {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as StarredToken).path === 'string' &&
    (value as StarredToken).path.length > 0 &&
    typeof (value as StarredToken).collectionId === 'string' &&
    (value as StarredToken).collectionId.length > 0
  );
}

function areStarredTokensEqual(left: StarredToken[], right: StarredToken[]): boolean {
  return (
    left.length === right.length &&
    left.every(
      (entry, index) =>
        entry.path === right[index]?.path &&
        entry.collectionId === right[index]?.collectionId,
    )
  );
}

function sanitizeStarredTokens(raw: unknown): StarredToken[] {
  if (!Array.isArray(raw)) return [];

  const sanitized: StarredToken[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (!isStarredTokenEntry(entry)) continue;
    const key = createStarredTokenKey(entry.path, entry.collectionId);
    if (seen.has(key)) continue;
    seen.add(key);
    sanitized.push(entry);
  }
  return sanitized;
}

function persistStarredTokens(tokens: StarredToken[]): void {
  const sanitized = sanitizeStarredTokens(tokens);
  if (sanitized.length === 0) {
    lsRemove(STORAGE_KEYS.STARRED_TOKENS);
    return;
  }
  lsSetJson(STORAGE_KEYS.STARRED_TOKENS, sanitized);
}

/** Return all starred tokens in the order they were starred. */
export function getStarredTokens(): StarredToken[] {
  const stored = lsGetJson<unknown>(STORAGE_KEYS.STARRED_TOKENS, []);
  const sanitized = sanitizeStarredTokens(stored);
  if (
    !Array.isArray(stored) ||
    stored.length !== sanitized.length ||
    !areStarredTokensEqual(
      stored.filter(isStarredTokenEntry),
      sanitized,
    )
  ) {
    persistStarredTokens(sanitized);
  }
  return sanitized;
}

/** Remove multiple starred tokens from one collection in a single write. */
export function removeStarredTokens(paths: string[], collectionId: string): void {
  if (paths.length === 0) return;
  const pathSet = new Set(paths);
  const current = getStarredTokens();
  const filtered = current.filter(
    (entry) => entry.collectionId !== collectionId || !pathSet.has(entry.path),
  );
  if (filtered.length !== current.length) {
    persistStarredTokens(filtered);
  }
}

/** Toggle starred status; returns the new starred state. */
export function toggleStarredToken(path: string, collectionId: string): boolean {
  if (!path || !collectionId) return false;
  const current = getStarredTokens();
  const idx = current.findIndex(e => e.path === path && e.collectionId === collectionId);
  if (idx >= 0) {
    persistStarredTokens(current.filter((_, i) => i !== idx));
    return false;
  } else {
    persistStarredTokens([...current, { path, collectionId }]);
    return true;
  }
}

/** Remove all starred tokens for a deleted collection. */
export function removeStarredTokensForCollection(collectionId: string): void {
  const current = getStarredTokens();
  const filtered = current.filter(e => e.collectionId !== collectionId);
  if (filtered.length !== current.length) {
    persistStarredTokens(filtered);
  }
}

/** Rename a collection in all starred tokens. */
export function renameStarredTokensForCollection(oldName: string, newName: string): void {
  if (!oldName || !newName || oldName === newName) return;
  const current = getStarredTokens();
  const updated = remapStarredTokens(current, (entry) =>
    entry.collectionId === oldName
      ? { ...entry, collectionId: newName }
      : entry,
  );
  if (!areStarredTokensEqual(current, updated)) {
    persistStarredTokens(updated);
  }
}

/** Update path for a renamed token. */
export function renameStarredToken(oldPath: string, newPath: string, collectionId: string): void {
  if (!oldPath || !newPath || oldPath === newPath) return;
  const current = getStarredTokens();
  const updated = remapStarredTokens(current, (entry) =>
    entry.path === oldPath && entry.collectionId === collectionId
      ? { ...entry, path: newPath }
      : entry,
  );
  if (!areStarredTokensEqual(current, updated)) {
    persistStarredTokens(updated);
  }
}

/** Move a starred token to a new path and/or collection without changing its star state. */
export function moveStarredToken(
  oldPath: string,
  newPath: string,
  oldCollectionId: string,
  newCollectionId: string,
): void {
  if (!oldPath || !newPath || !oldCollectionId || !newCollectionId) return;
  const current = getStarredTokens();
  const updated = remapStarredTokens(current, (entry) =>
    entry.path === oldPath && entry.collectionId === oldCollectionId
      ? { path: newPath, collectionId: newCollectionId }
      : entry,
  );
  if (!areStarredTokensEqual(current, updated)) {
    persistStarredTokens(updated);
  }
}
