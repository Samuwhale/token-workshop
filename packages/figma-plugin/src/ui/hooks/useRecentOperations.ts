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

export function useRecentOperations({
  serverUrl, connected, lintKey,
  refreshAll, setSuccessToast, setErrorToast,
}: UseRecentOperationsParams) {
  const [recentOperations, setRecentOperations] = useState<OperationEntry[]>([]);

  const fetchRecentOps = useCallback(async () => {
    if (!connected) return;
    try {
      const data = await apiFetch<{ operations: OperationEntry[] }>(`${serverUrl}/api/operations?limit=10`);
      setRecentOperations(data.operations);
    } catch (err) { console.warn('[useRecentOperations] fetch failed:', err); }
  }, [serverUrl, connected]);

  // Refresh operations list whenever tokens refresh
  useEffect(() => { fetchRecentOps(); }, [fetchRecentOps, lintKey]);

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
    fetchRecentOps,
    handleRollback,
  };
}
