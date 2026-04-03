import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { STORAGE_KEY, lsGetJson, lsSetJson } from '../shared/storage';

export interface PinnedTokensState {
  paths: Set<string>;
  count: number;
  isPinned: (path: string) => boolean;
  togglePin: (path: string) => void;
  removePin: (path: string) => void;
  renamePin: (oldPath: string, newPath: string) => void;
  clear: () => void;
}

export function usePinnedTokens(setName: string): PinnedTokensState {
  const [pinnedList, setPinnedList] = useState<string[]>(() =>
    lsGetJson<string[]>(STORAGE_KEY.pinnedTokens(setName), [])
  );

  // Keep a ref so the persist effect always has the current setName without
  // depending on it — prevents writing the old set's pin list to the new
  // set's localStorage key when setName changes (both effects share the same
  // render cycle and pinnedList hasn't been reloaded yet).
  const setNameRef = useRef(setName);
  setNameRef.current = setName;

  // Re-initialize when setName changes
  useEffect(() => {
    setPinnedList(lsGetJson<string[]>(STORAGE_KEY.pinnedTokens(setName), []));
  }, [setName]);

  // Persist to localStorage whenever pinnedList changes.
  // Uses setNameRef so this effect does NOT re-run on setName changes —
  // only on pinnedList changes, which prevents the stale-write race.
  useEffect(() => {
    lsSetJson(STORAGE_KEY.pinnedTokens(setNameRef.current), pinnedList);
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
