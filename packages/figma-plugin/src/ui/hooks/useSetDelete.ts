import { useState } from 'react';
import { apiFetch } from '../shared/apiFetch';

interface UseSetDeleteParams {
  serverUrl: string;
  connected: boolean;
  getDisconnectSignal: () => AbortSignal;
  sets: string[];
  setSets: (sets: string[]) => void;
  activeSet: string;
  setActiveSet: (set: string) => void;
  refreshTokens: () => void;
  setSuccessToast: (msg: string) => void;
  markDisconnected: () => void;
  setTabMenuOpen: (v: string | null) => void;
}

export function useSetDelete({
  serverUrl, connected, getDisconnectSignal,
  sets, setSets, activeSet, setActiveSet,
  refreshTokens, setSuccessToast, markDisconnected, setTabMenuOpen,
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
      const remaining = sets.filter(s => s !== deletingSet);
      setSets(remaining);
      if (activeSet === deletingSet) {
        setActiveSet(remaining[0] ?? '');
      }
      const name = deletingSet;
      setDeletingSet(null);
      refreshTokens();
      setSuccessToast(`Deleted set "${name}"`);
    } catch (err) {
      if (err instanceof TypeError || (err instanceof Error && err.message.includes('Failed to fetch'))) markDisconnected();
      setDeletingSet(null);
    }
  };

  return {
    deletingSet,
    startDelete,
    cancelDelete,
    handleDeleteSet,
  };
}
