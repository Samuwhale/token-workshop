import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { apiFetch, createFetchSignal } from '../shared/apiFetch';
import { getErrorMessage } from '../shared/utils';

export interface OperationEntry {
  id: string;
  timestamp: string;
  type: string;
  description: string;
  setName: string;
  affectedPaths: string[];
  rolledBack: boolean;
}

interface UseRecentOperationsParams {
  serverUrl: string;
  connected: boolean;
  /** Used as a trigger to re-fetch operations */
  lintKey: number;
  refreshAll: () => void;
  setSuccessToast: (msg: string) => void;
  setErrorToast: (msg: string) => void;
}

const INITIAL_LIMIT = 10;
const BATCH_SIZE = 10;

/** Entry in the redo stack — tracks a rolled-back operation so it can be re-applied. */
interface RedoEntry {
  /** The original operation's ID (now marked rolledBack: true) */
  origOpId: string;
  /** The rollback operation's ID that can itself be rolled back to redo */
  rollbackId: string;
  /** Human-readable description of the original operation */
  description: string;
}

export function useRecentOperations({
  serverUrl, connected, lintKey,
  refreshAll, setSuccessToast, setErrorToast,
}: UseRecentOperationsParams) {
  const [recentOperations, setRecentOperations] = useState<OperationEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loadedCount, setLoadedCount] = useState(INITIAL_LIMIT);

  /** Ordered list of redo entries — most recently rolled-back is last. */
  const [redoEntries, setRedoEntries] = useState<RedoEntry[]>([]);

  const hasMore = total > recentOperations.length;

  const unmountRef = useRef(new AbortController());
  // Abort any in-flight fetch on unmount
  useEffect(() => {
    const controller = unmountRef.current;
    return () => controller.abort();
  }, []);

  const fetchRecentOps = useCallback(async (limit?: number) => {
    if (!connected) return;
    const effectiveLimit = limit ?? loadedCount;
    try {
      const data = await apiFetch<{ operations: OperationEntry[]; total: number }>(
        `${serverUrl}/api/operations?limit=${effectiveLimit}`,
        { signal: createFetchSignal(unmountRef.current.signal) },
      );
      setRecentOperations(data.operations);
      setTotal(data.total);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      console.warn('[useRecentOperations] fetch failed:', err);
    }
  }, [serverUrl, connected, loadedCount]);

  // Refresh operations list whenever tokens refresh or loadedCount changes
  useEffect(() => { fetchRecentOps(); }, [fetchRecentOps, lintKey]);

  const loadMore = useCallback(() => {
    setLoadedCount(prev => prev + BATCH_SIZE);
  }, []);

  const handleRollback = useCallback(async (opId: string) => {
    try {
      const data = await apiFetch<{ ok: boolean; restoredPaths: string[]; rollbackEntryId: string }>(
        `${serverUrl}/api/operations/${opId}/rollback`,
        { method: 'POST' },
      );
      // Push to redo stack so user can re-apply this rollback
      if (data.rollbackEntryId) {
        const origOp = recentOperations.find(op => op.id === opId);
        const description = origOp?.description ?? 'Operation';
        setRedoEntries(prev => [
          // Remove any stale entry for this same origOpId (re-rollback)
          ...prev.filter(e => e.origOpId !== opId),
          { origOpId: opId, rollbackId: data.rollbackEntryId, description },
        ]);
      }
      refreshAll();
      fetchRecentOps();
      setSuccessToast('Operation rolled back');
    } catch (err) {
      setErrorToast(`Rollback failed: ${getErrorMessage(err)}`);
    }
  }, [serverUrl, recentOperations, refreshAll, fetchRecentOps, setSuccessToast, setErrorToast]);

  /**
   * Redo a specific rolled-back operation by its original op ID.
   * If opId is omitted, redoes the most recently rolled-back operation.
   */
  const handleServerRedo = useCallback(async (opId?: string) => {
    const entry = opId
      ? redoEntries.find(e => e.origOpId === opId)
      : redoEntries[redoEntries.length - 1];
    if (!entry) return;

    // Optimistically remove from redo stack
    setRedoEntries(prev => prev.filter(e => e !== entry));

    try {
      await apiFetch(
        `${serverUrl}/api/operations/${entry.rollbackId}/rollback`,
        { method: 'POST' },
      );
      refreshAll();
      fetchRecentOps();
      setSuccessToast('Operation redone');
    } catch (err) {
      // Restore on failure
      setRedoEntries(prev => [...prev, entry]);
      setErrorToast(`Redo failed: ${getErrorMessage(err)}`);
    }
  }, [serverUrl, redoEntries, refreshAll, fetchRecentOps, setSuccessToast, setErrorToast]);

  const canServerRedo = redoEntries.length > 0;

  /** Description of the most recent redoable operation. */
  const serverRedoDescription = redoEntries.length > 0
    ? redoEntries[redoEntries.length - 1].description
    : undefined;

  /** Set of original op IDs that currently have a redo available. */
  const redoableOpIds = useMemo(
    () => new Set(redoEntries.map(e => e.origOpId)),
    [redoEntries],
  );

  /** Ordered list of redoable items for command palette, most-recently-rolled-back last. */
  const redoableItems = useMemo(
    () => redoEntries.map(e => ({ origOpId: e.origOpId, description: e.description })),
    [redoEntries],
  );

  return {
    recentOperations,
    total,
    hasMore,
    loadMore,
    fetchRecentOps,
    handleRollback,
    handleServerRedo,
    canServerRedo,
    serverRedoDescription,
    redoableOpIds,
    redoableItems,
  };
}
