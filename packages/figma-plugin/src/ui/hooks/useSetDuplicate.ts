import { apiFetch, isNetworkError } from '../shared/apiFetch';
import type { UndoSlot } from './useUndo';

interface UseSetDuplicateParams {
  serverUrl: string;
  connected: boolean;
  getDisconnectSignal: () => AbortSignal;
  sets: string[];
  tokenCounts: Record<string, number>;
  addSetToState: (name: string, count?: number) => void;
  refreshTokens: () => void;
  setSuccessToast: (msg: string) => void;
  setErrorToast: (msg: string) => void;
  markDisconnected: () => void;
  pushUndo: (slot: UndoSlot) => void;
  setTabMenuOpen: (v: string | null) => void;
}

export function useSetDuplicate({
  serverUrl, connected, getDisconnectSignal,
  sets: _sets, tokenCounts, addSetToState, refreshTokens,
  setSuccessToast, setErrorToast, markDisconnected, pushUndo, setTabMenuOpen,
}: UseSetDuplicateParams) {

  const handleDuplicateSet = async (setName: string) => {
    setTabMenuOpen(null);
    if (!connected) return;
    let newName: string;
    try {
      const signal = AbortSignal.any([AbortSignal.timeout(5000), getDisconnectSignal()]);
      const result = await apiFetch<{ ok: true; name: string; originalName: string }>(
        `${serverUrl}/api/sets/${encodeURIComponent(setName)}/duplicate`,
        { method: 'POST', signal },
      );
      newName = result.name;
    } catch (err) {
      if (isNetworkError(err)) markDisconnected();
      else setErrorToast(`Duplicate failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      return;
    }
    addSetToState(newName, tokenCounts[setName] ?? 0);
    setSuccessToast(`Duplicated set "${setName}" → "${newName}"`);
    const url = serverUrl;
    const dupName = newName;
    pushUndo({
      description: `Duplicated set "${setName}" → "${dupName}"`,
      restore: async () => {
        await apiFetch(`${url}/api/sets/${encodeURIComponent(dupName)}`, { method: 'DELETE' });
        refreshTokens();
      },
      redo: async () => {
        await apiFetch(`${url}/api/sets/${encodeURIComponent(setName)}/duplicate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newName: dupName }),
        });
        refreshTokens();
      },
    });
  };

  return { handleDuplicateSet };
}
