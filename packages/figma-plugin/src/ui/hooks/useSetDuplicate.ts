import type { UndoSlot } from './useUndo';

interface UseSetDuplicateParams {
  serverUrl: string;
  connected: boolean;
  getDisconnectSignal: () => AbortSignal;
  sets: string[];
  refreshTokens: () => void;
  setSuccessToast: (msg: string) => void;
  setErrorToast: (msg: string) => void;
  markDisconnected: () => void;
  pushUndo: (slot: UndoSlot) => void;
  setTabMenuOpen: (v: string | null) => void;
}

export function useSetDuplicate({
  serverUrl, connected, getDisconnectSignal,
  sets, refreshTokens, setSuccessToast, setErrorToast,
  markDisconnected, pushUndo, setTabMenuOpen,
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
      const res = await fetch(`${serverUrl}/api/sets/${encodeURIComponent(setName)}`, { signal });
      if (!res.ok) {
        setErrorToast(`Failed to read set "${setName}": server returned ${res.status}`);
        return;
      }
      const data = await res.json();
      savedTokens = data.tokens || {};
      const createRes = await fetch(`${serverUrl}/api/sets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, tokens: data.tokens }),
        signal,
      });
      if (!createRes.ok) {
        setErrorToast(`Failed to create duplicate set "${newName}": server returned ${createRes.status}`);
        return;
      }
    } catch (err) {
      if (err instanceof TypeError || (err instanceof Error && err.message.includes('Failed to fetch'))) markDisconnected();
      else setErrorToast(`Duplicate failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      return;
    }
    refreshTokens();
    setSuccessToast(`Duplicated set "${setName}" → "${newName}"`);
    const url = serverUrl;
    const dupName = newName;
    const dupTokens = savedTokens;
    pushUndo({
      description: `Duplicated set "${setName}" → "${dupName}"`,
      restore: async () => {
        await fetch(`${url}/api/sets/${encodeURIComponent(dupName)}`, { method: 'DELETE' });
        refreshTokens();
      },
      redo: async () => {
        await fetch(`${url}/api/sets`, {
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
