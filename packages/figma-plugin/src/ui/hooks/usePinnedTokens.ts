import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { STORAGE_KEY_BUILDERS, lsGetJson, lsSetJson } from '../shared/storage';

export interface PinnedTokensState {
  paths: Set<string>;
  count: number;
  isPinned: (path: string) => boolean;
  togglePin: (path: string) => void;
  removePin: (path: string) => void;
  renamePin: (oldPath: string, newPath: string) => void;
  clear: () => void;
}

export function usePinnedTokens(collectionId: string): PinnedTokensState {
  const [pinnedList, setPinnedList] = useState<string[]>(() =>
    lsGetJson<string[]>(STORAGE_KEY_BUILDERS.pinnedTokens(collectionId), [])
  );

  // Keep a ref so the persist effect always has the current collectionId without
  // depending on it — prevents writing the old collection's pin list to the new
  // collection's localStorage key when collectionId changes (both effects share the same
  // render cycle and pinnedList hasn't been reloaded yet).
  const collectionIdRef = useRef(collectionId);
  collectionIdRef.current = collectionId;

  // Re-initialize when collectionId changes
  useEffect(() => {
    setPinnedList(lsGetJson<string[]>(STORAGE_KEY_BUILDERS.pinnedTokens(collectionId), []));
  }, [collectionId]);

  // Persist to localStorage whenever pinnedList changes.
  // Uses collectionIdRef so this effect does NOT re-run on collectionId changes —
  // only on pinnedList changes, which prevents the stale-write race.
  useEffect(() => {
    lsSetJson(STORAGE_KEY_BUILDERS.pinnedTokens(collectionIdRef.current), pinnedList);
  }, [pinnedList]);

  const paths = useMemo(() => new Set(pinnedList), [pinnedList]);

  const isPinned = useCallback((path: string) => paths.has(path), [paths]);

  const togglePin = useCallback((path: string) => {
    setPinnedList(prev => {
      if (prev.includes(path)) return prev.filter(p => p !== path);
      return [...prev, path];
    });
  }, []);

  const removePin = useCallback((path: string) => {
    setPinnedList(prev => {
      if (!prev.includes(path)) return prev;
      return prev.filter(p => p !== path);
    });
  }, []);

  const renamePin = useCallback((oldPath: string, newPath: string) => {
    setPinnedList(prev => {
      const idx = prev.indexOf(oldPath);
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = newPath;
      return next;
    });
  }, []);

  const clear = useCallback(() => setPinnedList([]), []);

  return { paths, count: pinnedList.length, isPinned, togglePin, removePin, renamePin, clear };
}
