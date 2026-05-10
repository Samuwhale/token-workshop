import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { apiFetch, combineAbortSignals, createFetchSignal, type PaginatedResponse } from '../shared/apiFetch';
import { rollbackOperation } from '../shared/tokenMutations';
import { getErrorMessage, isAbortError } from '../shared/utils';
import type { OperationEntry } from '../components/history/types';

export type { OperationEntry } from '../components/history/types';

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
  const fetchControllerRef = useRef<AbortController | null>(null);
  const fetchGenerationRef = useRef(0);
  // Abort any in-flight fetch on unmount
  useEffect(() => {
    const controller = unmountRef.current;
    return () => {
      fetchControllerRef.current?.abort();
      controller.abort();
    };
  }, []);

  const fetchRecentOps = useCallback(async (limit?: number) => {
    if (!connected || !serverUrl) return;
    const effectiveLimit = limit ?? loadedCount;
    fetchControllerRef.current?.abort();
    const controller = new AbortController();
    const generation = ++fetchGenerationRef.current;
    fetchControllerRef.current = controller;
    const signal = createFetchSignal(
      combineAbortSignals([unmountRef.current.signal, controller.signal]),
    );

    try {
      const data = await apiFetch<PaginatedResponse<OperationEntry>>(
        `${serverUrl}/api/operations?limit=${effectiveLimit}`,
        { signal },
      );
      if (generation !== fetchGenerationRef.current || signal.aborted) return;
      setRecentOperations(data.data ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      if (generation !== fetchGenerationRef.current || signal.aborted || isAbortError(err)) return;
      console.warn('[useRecentOperations] fetch failed:', err);
    } finally {
      if (fetchControllerRef.current === controller) {
        fetchControllerRef.current = null;
      }
    }
  }, [serverUrl, connected, loadedCount]);

  useEffect(() => {
    if (connected && serverUrl) return;
    fetchControllerRef.current?.abort();
    fetchGenerationRef.current++;
    setRecentOperations([]);
    setTotal(0);
    setLoadedCount(INITIAL_LIMIT);
    setRedoEntries([]);
  }, [connected, serverUrl]);

  // Refresh operations list whenever tokens refresh or loadedCount changes
  useEffect(() => { fetchRecentOps(); }, [fetchRecentOps, lintKey]);

  const loadMore = useCallback(() => {
    setLoadedCount(prev => prev + BATCH_SIZE);
  }, []);

  const handleRollback = useCallback(async (opId: string) => {
    try {
      const data = await rollbackOperation(serverUrl, opId);
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
      setErrorToast(`Restore failed: ${getErrorMessage(err)}`);
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
      await rollbackOperation(serverUrl, entry.rollbackId);
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
