import { STORAGE_KEYS, lsGetJson, lsRemove, lsSetJson } from './storage';

const MAX_RECENT = 15;

export interface RecentToken {
  path: string;
  collectionId: string;
}

export function createRecentTokenKey(path: string, collectionId: string): string {
  return `${collectionId}\u0000${path}`;
}

function remapRecentTokens(
  current: RecentToken[],
  mapper: (entry: RecentToken) => RecentToken,
): RecentToken[] {
  const remapped: RecentToken[] = [];
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

    const key = createRecentTokenKey(nextEntry.path, nextEntry.collectionId);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    remapped.push(nextEntry);
  }

  return changed ? sanitizeRecentTokens(remapped) : current;
}

function isRecentTokenEntry(value: unknown): value is RecentToken {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as RecentToken).path === 'string' &&
    (value as RecentToken).path.length > 0 &&
    typeof (value as RecentToken).collectionId === 'string' &&
    (value as RecentToken).collectionId.length > 0
  );
}

function areRecentTokensEqual(left: RecentToken[], right: RecentToken[]): boolean {
  return (
    left.length === right.length &&
    left.every(
      (entry, index) =>
        entry.path === right[index]?.path &&
        entry.collectionId === right[index]?.collectionId,
    )
  );
}

function sanitizeRecentTokens(raw: unknown): RecentToken[] {
  if (!Array.isArray(raw)) return [];

  const sanitized: RecentToken[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (!isRecentTokenEntry(entry)) continue;
    const key = createRecentTokenKey(entry.path, entry.collectionId);
    if (seen.has(key)) continue;
    seen.add(key);
    sanitized.push(entry);
    if (sanitized.length >= MAX_RECENT) {
      break;
    }
  }
  return sanitized;
}

function persistRecentTokens(tokens: RecentToken[]): void {
  const sanitized = sanitizeRecentTokens(tokens);
  if (sanitized.length === 0) {
    lsRemove(STORAGE_KEYS.RECENT_TOKENS);
    return;
  }
  lsSetJson(STORAGE_KEYS.RECENT_TOKENS, sanitized);
}

/** Return recently-edited tokens (most recent first). */
export function getRecentTokens(): RecentToken[] {
  const stored = lsGetJson<unknown>(STORAGE_KEYS.RECENT_TOKENS, []);
  const sanitized = sanitizeRecentTokens(stored);
  if (
    !Array.isArray(stored) ||
    stored.length !== sanitized.length ||
    !areRecentTokensEqual(
      stored.filter(isRecentTokenEntry),
      sanitized,
    )
  ) {
    persistRecentTokens(sanitized);
  }
  return sanitized;
}

export function getRecentTokenPaths(options?: {
  collectionId?: string;
}): string[] {
  const recentTokens = getRecentTokens();
  const result: string[] = [];
  const seenPaths = new Set<string>();
  for (const entry of recentTokens) {
    if (options?.collectionId && entry.collectionId !== options.collectionId) {
      continue;
    }
    if (seenPaths.has(entry.path)) continue;
    seenPaths.add(entry.path);
    result.push(entry.path);
  }
  return result;
}

/** Prepend a token path to the recent list, deduplicate, and cap at MAX_RECENT. */
export function addRecentToken(path: string, collectionId: string): void {
  if (!path || !collectionId) return;
  const current = getRecentTokens();
  const deduped = [
    { path, collectionId },
    ...current.filter(
      (entry) => entry.path !== path || entry.collectionId !== collectionId,
    ),
  ].slice(0, MAX_RECENT);
  persistRecentTokens(deduped);
}

/** Remove a token path from the recent list (e.g. on delete). */
export function removeRecentToken(path: string, collectionId: string): void {
  const current = getRecentTokens();
  const filtered = current.filter(
    (entry) => entry.path !== path || entry.collectionId !== collectionId,
  );
  if (filtered.length !== current.length) {
    persistRecentTokens(filtered);
  }
}

/** Rename a token path in the recent list (preserves position). */
export function renameRecentToken(
  oldPath: string,
  newPath: string,
  collectionId: string,
): void {
  if (!oldPath || !newPath || !collectionId) return;
  const current = getRecentTokens();
  const updated = remapRecentTokens(current, (entry) =>
    entry.path === oldPath && entry.collectionId === collectionId
      ? { ...entry, path: newPath }
      : entry,
  );
  if (!areRecentTokensEqual(current, updated)) {
    persistRecentTokens(updated);
  }
}

export function moveRecentToken(
  oldPath: string,
  newPath: string,
  oldCollectionId: string,
  newCollectionId: string,
): void {
  if (!oldPath || !newPath || !oldCollectionId || !newCollectionId) return;
  const current = getRecentTokens();
  const updated = remapRecentTokens(current, (entry) =>
    entry.path === oldPath && entry.collectionId === oldCollectionId
      ? { path: newPath, collectionId: newCollectionId }
      : entry,
  );
  if (!areRecentTokensEqual(current, updated)) {
    persistRecentTokens(updated);
  }
}

export function removeRecentTokensForCollection(collectionId: string): void {
  if (!collectionId) return;
  const current = getRecentTokens();
  const filtered = current.filter((entry) => entry.collectionId !== collectionId);
  if (filtered.length !== current.length) {
    persistRecentTokens(filtered);
  }
}

export function renameRecentTokensForCollection(
  oldCollectionId: string,
  newCollectionId: string,
): void {
  if (!oldCollectionId || !newCollectionId || oldCollectionId === newCollectionId) {
    return;
  }
  const current = getRecentTokens();
  const updated = remapRecentTokens(current, (entry) =>
    entry.collectionId === oldCollectionId
      ? { ...entry, collectionId: newCollectionId }
      : entry,
  );
  if (!areRecentTokensEqual(current, updated)) {
    persistRecentTokens(updated);
  }
}

/** Clear all recent token paths. */
export function clearRecentTokens(): void {
  lsRemove(STORAGE_KEYS.RECENT_TOKENS);
}
