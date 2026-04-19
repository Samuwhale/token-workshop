import { useState, useCallback } from 'react';
import {
  addRecentToken,
  clearRecentTokens,
  getRecentTokens,
  moveRecentToken,
  removeRecentToken,
  removeRecentTokensForCollection,
  renameRecentToken,
  renameRecentTokensForCollection,
  type RecentToken,
  createRecentTokenKey,
} from '../shared/recentTokens';

const MAX_ENTRIES = 500;

export interface RecentlyTouchedState {
  /** Map from recent-token key (`collectionId\\0path`) to timestamp (Date.now()) */
  timestamps: Map<string, number>;
  /** Number of tracked entries */
  count: number;
  /** Return the current collection-scoped paths for fast filtering. */
  getPathsForCollection: (collectionId: string) => Set<string>;
  /** Lookup a timestamp for one token in one collection. */
  getTimestamp: (path: string, collectionId: string) => number | undefined;
  /** Return all tracked entries with timestamps, newest first. */
  listEntries: () => Array<RecentToken & { timestamp: number }>;
  /** Record a single token touch */
  recordTouch: (path: string, collectionId: string) => void;
  /** Remove a path (on delete) */
  removePath: (path: string, collectionId: string) => void;
  /** Rename a path (preserves timestamp) */
  renamePath: (oldPath: string, newPath: string, collectionId: string) => void;
  /** Move a path across collections without losing its recency. */
  movePath: (
    oldPath: string,
    newPath: string,
    oldCollectionId: string,
    newCollectionId: string,
  ) => void;
  /** Remove all touched tokens for a deleted collection. */
  removeForCollection: (collectionId: string) => void;
  /** Update recent entries after a collection rename. */
  renameCollection: (oldCollectionId: string, newCollectionId: string) => void;
  /** Clear all tracking */
  clear: () => void;
}

export function useRecentlyTouched(): RecentlyTouchedState {
  const [timestamps, setTimestamps] = useState<Map<string, number>>(() => {
    // Initialize from persisted localStorage so recents survive plugin reloads.
    // Entries are ordered most-recent-first; assign synthetic timestamps so the
    // in-memory sort order matches the persisted order.
    const saved = getRecentTokens();
    const map = new Map<string, number>();
    const now = Date.now();
    saved.forEach(({ path, collectionId }, idx) => {
      map.set(createRecentTokenKey(path, collectionId), now - idx * 1000);
    });
    return map;
  });

  const recordTouch = useCallback((path: string, collectionId: string) => {
    if (!path || !collectionId) return;
    const key = createRecentTokenKey(path, collectionId);
    setTimestamps(prev => {
      const next = new Map(prev);
      next.set(key, Date.now());
      // Evict oldest if over limit
      if (next.size > MAX_ENTRIES) {
        let oldestKey = '';
        let oldestTime = Infinity;
        for (const [k, t] of next) {
          if (t < oldestTime) { oldestTime = t; oldestKey = k; }
        }
        if (oldestKey) next.delete(oldestKey);
      }
      return next;
    });
    addRecentToken(path, collectionId);
  }, []);

  const moveTimestamp = useCallback((
    previous: Map<string, number>,
    oldKey: string,
    newKey: string,
  ): Map<string, number> => {
    const timestamp = previous.get(oldKey);
    if (timestamp == null) {
      return previous;
    }

    const next = new Map(previous);
    next.delete(oldKey);
    const existing = next.get(newKey);
    next.set(newKey, existing == null ? timestamp : Math.max(existing, timestamp));
    return next;
  }, []);

  const removePath = useCallback((path: string, collectionId: string) => {
    if (!path || !collectionId) return;
    const key = createRecentTokenKey(path, collectionId);
    setTimestamps(prev => {
      if (!prev.has(key)) return prev;
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
    removeRecentToken(path, collectionId);
  }, []);

  const renamePath = useCallback((
    oldPath: string,
    newPath: string,
    collectionId: string,
  ) => {
    if (!oldPath || !newPath || !collectionId) return;
    const oldKey = createRecentTokenKey(oldPath, collectionId);
    const newKey = createRecentTokenKey(newPath, collectionId);
    setTimestamps((prev) => moveTimestamp(prev, oldKey, newKey));
    renameRecentToken(oldPath, newPath, collectionId);
  }, [moveTimestamp]);

  const movePath = useCallback((
    oldPath: string,
    newPath: string,
    oldCollectionId: string,
    newCollectionId: string,
  ) => {
    if (!oldPath || !newPath || !oldCollectionId || !newCollectionId) return;
    const oldKey = createRecentTokenKey(oldPath, oldCollectionId);
    const newKey = createRecentTokenKey(newPath, newCollectionId);
    setTimestamps((prev) => moveTimestamp(prev, oldKey, newKey));
    moveRecentToken(oldPath, newPath, oldCollectionId, newCollectionId);
  }, [moveTimestamp]);

  const removeForCollection = useCallback((collectionId: string) => {
    if (!collectionId) return;
    setTimestamps(prev => {
      let changed = false;
      const next = new Map(prev);
      for (const key of next.keys()) {
        if (key.startsWith(`${collectionId}\u0000`)) {
          next.delete(key);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    removeRecentTokensForCollection(collectionId);
  }, []);

  const renameCollection = useCallback((oldCollectionId: string, newCollectionId: string) => {
    if (!oldCollectionId || !newCollectionId || oldCollectionId === newCollectionId) return;
    setTimestamps(prev => {
      let next: Map<string, number> | null = null;
      let changed = false;
      for (const [key, timestamp] of prev.entries()) {
        if (!key.startsWith(`${oldCollectionId}\u0000`)) continue;
        const path = key.slice(oldCollectionId.length + 1);
        if (next === null) {
          next = new Map(prev);
        }
        next.delete(key);
        const remappedKey = createRecentTokenKey(path, newCollectionId);
        const existing = next.get(remappedKey);
        next.set(
          remappedKey,
          existing == null ? timestamp : Math.max(existing, timestamp),
        );
        changed = true;
      }
      return changed && next ? next : prev;
    });
    renameRecentTokensForCollection(oldCollectionId, newCollectionId);
  }, []);

  const clear = useCallback(() => {
    setTimestamps(new Map());
    clearRecentTokens();
  }, []);

  const getPathsForCollection = useCallback((collectionId: string) => {
    const paths = new Set<string>();
    if (!collectionId) return paths;
    const prefix = `${collectionId}\u0000`;
    for (const key of timestamps.keys()) {
      if (key.startsWith(prefix)) {
        paths.add(key.slice(prefix.length));
      }
    }
    return paths;
  }, [timestamps]);

  const getTimestamp = useCallback((path: string, collectionId: string) => {
    if (!path || !collectionId) return undefined;
    return timestamps.get(createRecentTokenKey(path, collectionId));
  }, [timestamps]);

  const listEntries = useCallback(() => {
    return Array.from(timestamps.entries())
      .map(([key, timestamp]) => {
        const separatorIndex = key.indexOf('\u0000');
        if (separatorIndex <= 0 || separatorIndex >= key.length - 1) {
          return null;
        }
        return {
          collectionId: key.slice(0, separatorIndex),
          path: key.slice(separatorIndex + 1),
          timestamp,
        };
      })
      .filter((entry): entry is RecentToken & { timestamp: number } => entry !== null)
      .sort((left, right) => right.timestamp - left.timestamp);
  }, [timestamps]);

  return {
    timestamps,
    count: timestamps.size,
    getPathsForCollection,
    getTimestamp,
    listEntries,
    recordTouch,
    removePath,
    renamePath,
    movePath,
    removeForCollection,
    renameCollection,
    clear,
  };
}
