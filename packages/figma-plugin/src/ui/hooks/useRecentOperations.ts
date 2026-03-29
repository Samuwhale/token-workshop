import { useState, useCallback, useEffect } from 'react';
import { apiFetch } from '../shared/apiFetch';
import { getErrorMessage } from '../shared/utils';

interface OperationEntry {
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

export function useRecentOperations({
  serverUrl, connected, lintKey,
  refreshAll, setSuccessToast, setErrorToast,
}: UseRecentOperationsParams) {
  const [recentOperations, setRecentOperations] = useState<OperationEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loadedCount, setLoadedCount] = useState(INITIAL_LIMIT);

  const hasMore = total > recentOperations.length;

  const fetchRecentOps = useCallback(async (limit?: number) => {
    if (!connected) return;
    const effectiveLimit = limit ?? loadedCount;
    try {
      const data = await apiFetch<{ operations: OperationEntry[]; total: number }>(`${serverUrl}/api/operations?limit=${effectiveLimit}`);
      setRecentOperations(data.operations);
      setTotal(data.total);
    } catch (err) { console.warn('[useRecentOperations] fetch failed:', err); }
  }, [serverUrl, connected, loadedCount]);

  // Refresh operations list whenever tokens refresh or loadedCount changes
  useEffect(() => { fetchRecentOps(); }, [fetchRecentOps, lintKey]);

  const loadMore = useCallback(() => {
    setLoadedCount(prev => prev + BATCH_SIZE);
  }, []);

  const handleRollback = useCallback(async (opId: string) => {
    try {
      await apiFetch(`${serverUrl}/api/operations/${opId}/rollback`, { method: 'POST' });
      refreshAll();
      fetchRecentOps();
      setSuccessToast('Operation rolled back');
    } catch (err) {
      setErrorToast(`Rollback failed: ${getErrorMessage(err)}`);
    }
  }, [serverUrl, refreshAll, fetchRecentOps, setSuccessToast, setErrorToast]);

  return {
    recentOperations,
    total,
    hasMore,
    loadMore,
    fetchRecentOps,
    handleRollback,
  };
}
