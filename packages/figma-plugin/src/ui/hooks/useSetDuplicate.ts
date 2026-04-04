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
  sets, tokenCounts, addSetToState, refreshTokens,
  setSuccessToast, setErrorToast, markDisconnected, pushUndo, setTabMenuOpen,
}: UseSetDuplicateParams) {

  const handleDuplicateSet = async (setName: string) => {
    setTabMenuOpen(null);
    if (!connected) return;
    let newName = `${setName}-copy`;
    let i = 2;
    while (sets.includes(newName)) {
      newName = `${setName}-copy-${i++}`;
    }
    let savedTokens: Record<string, unknown> = {};
    try {
      const signal = AbortSignal.any([AbortSignal.timeout(5000), getDisconnectSignal()]);
      const data = await apiFetch<{ tokens: Record<string, unknown> }>(`${serverUrl}/api/sets/${encodeURIComponent(setName)}`, { signal });
      savedTokens = data.tokens || {};
      await apiFetch(`${serverUrl}/api/sets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, tokens: data.tokens }),
        signal,
      });
    } catch (err) {
      if (isNetworkError(err)) markDisconnected();
      else setErrorToast(`Duplicate failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      return;
    }
    addSetToState(newName, tokenCounts[setName] ?? 0);
    setSuccessToast(`Duplicated set "${setName}" → "${newName}"`);
    const url = serverUrl;
    const dupName = newName;
    const dupTokens = savedTokens;
    pushUndo({
      description: `Duplicated set "${setName}" → "${dupName}"`,
      restore: async () => {
        await apiFetch(`${url}/api/sets/${encodeURIComponent(dupName)}`, { method: 'DELETE' });
        refreshTokens();
      },
      redo: async () => {
        await apiFetch(`${url}/api/sets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: dupName, tokens: dupTokens }),
        });
        refreshTokens();
      },
    });
  };

  return { handleDuplicateSet };
}
