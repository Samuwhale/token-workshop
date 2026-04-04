import { useState } from 'react';
import { apiFetch, ApiError, isNetworkError } from '../shared/apiFetch';

interface UseSetDeleteParams {
  serverUrl: string;
  connected: boolean;
  getDisconnectSignal: () => AbortSignal;
  sets: string[];
  activeSet: string;
  setActiveSet: (set: string) => void;
  removeSetFromState: (name: string) => void;
  fetchTokensForSet: (name: string) => Promise<void>;
  setSuccessToast: (msg: string) => void;
  setErrorToast: (msg: string) => void;
  markDisconnected: () => void;
  setTabMenuOpen: (v: string | null) => void;
}

export function useSetDelete({
  serverUrl, connected, getDisconnectSignal,
  sets, activeSet, setActiveSet,
  removeSetFromState, fetchTokensForSet,
  setSuccessToast, setErrorToast, markDisconnected, setTabMenuOpen,
}: UseSetDeleteParams) {
  const [deletingSet, setDeletingSet] = useState<string | null>(null);

  const startDelete = (setName: string) => {
    setDeletingSet(setName);
    setTabMenuOpen(null);
  };

  const cancelDelete = () => {
    setDeletingSet(null);
  };

  const handleDeleteSet = async () => {
    if (!deletingSet || !connected) return;
    try {
      await apiFetch(`${serverUrl}/api/sets/${encodeURIComponent(deletingSet)}`, {
        method: 'DELETE',
        signal: AbortSignal.any([AbortSignal.timeout(5000), getDisconnectSignal()]),
      });
      const wasActive = activeSet === deletingSet;
      const remaining = sets.filter(s => s !== deletingSet);
      const newActive = wasActive ? (remaining[0] ?? '') : activeSet;

      removeSetFromState(deletingSet);
      if (wasActive) {
        setActiveSet(newActive);
        if (newActive) await fetchTokensForSet(newActive);
      }

      const name = deletingSet;
      setDeletingSet(null);
      setSuccessToast(`Deleted set "${name}"`);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorToast(`Delete failed: ${err.message}`);
        setDeletingSet(null);
      } else if (isNetworkError(err)) {
        markDisconnected();
        setDeletingSet(null);
      } else if (err instanceof Error && err.name === 'AbortError') {
        setDeletingSet(null);
      } else {
        setErrorToast('Delete failed: unexpected error');
        setDeletingSet(null);
      }
    }
  };

  return {
    deletingSet,
    startDelete,
    cancelDelete,
    handleDeleteSet,
  };
}
