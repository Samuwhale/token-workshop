import { useState, useCallback, useMemo } from 'react';
import type { CrossSetRecentEntry } from '../shared/crossSetRecents';
import {
  getCrossSetRecents,
  addCrossSetRecent,
  removeCrossSetRecent,
  renameCrossSetRecent,
  removeCrossSetRecentsForSet,
  renameCrossSetRecentsForSet,
} from '../shared/crossSetRecents';

export interface CrossSetRecentsState {
  /** All entries sorted most-recent-first */
  entries: CrossSetRecentEntry[];
  /** Number of tracked entries */
  count: number;
  /** Record a token touch with its set name */
  recordTouch: (path: string, setName: string) => void;
  /** Remove entry (on token delete) */
  removeEntry: (path: string, setName: string) => void;
  /** Rename entry (on token rename) */
  renameEntry: (oldPath: string, newPath: string, setName: string) => void;
  /** Remove all entries for a deleted set */
  removeForSet: (setName: string) => void;
  /** Update set name for a renamed set */
  renameSet: (oldName: string, newName: string) => void;
  /** Clear all recents */
  clear: () => void;
}

export function useCrossSetRecents(): CrossSetRecentsState {
  const [entries, setEntries] = useState<CrossSetRecentEntry[]>(() => getCrossSetRecents());

  const recordTouch = useCallback((path: string, setName: string) => {
    addCrossSetRecent(path, setName);
    setEntries(getCrossSetRecents());
  }, []);

  const removeEntry = useCallback((path: string, setName: string) => {
    removeCrossSetRecent(path, setName);
    setEntries(getCrossSetRecents());
  }, []);

  const renameEntry = useCallback((oldPath: string, newPath: string, setName: string) => {
    renameCrossSetRecent(oldPath, newPath, setName);
    setEntries(getCrossSetRecents());
  }, []);

  const removeForSet = useCallback((setName: string) => {
    removeCrossSetRecentsForSet(setName);
    setEntries(getCrossSetRecents());
  }, []);

  const renameSet = useCallback((oldName: string, newName: string) => {
    renameCrossSetRecentsForSet(oldName, newName);
    setEntries(getCrossSetRecents());
  }, []);

  const clear = useCallback(() => {
    setEntries([]);
  }, []);

  const count = useMemo(() => entries.length, [entries]);

  return { entries, count, recordTouch, removeEntry, renameEntry, removeForSet, renameSet, clear };
}
