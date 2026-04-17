import { apiFetch, isNetworkError } from '../shared/apiFetch';
import type { CollectionSummary } from './useTokens';
import type { UndoSlot } from './useUndo';

interface UseCollectionDuplicateParams {
  serverUrl: string;
  connected: boolean;
  getDisconnectSignal: () => AbortSignal;
  syncCollectionSummariesToState: (collectionSummaries: CollectionSummary[]) => void;
  refreshTokens: () => void;
  setSuccessToast: (msg: string) => void;
  setErrorToast: (msg: string) => void;
  markDisconnected: () => void;
  pushUndo: (slot: UndoSlot) => void;
}

export function useCollectionDuplicate({
  serverUrl, connected, getDisconnectSignal,
  syncCollectionSummariesToState, refreshTokens,
  setSuccessToast, setErrorToast, markDisconnected, pushUndo,
}: UseCollectionDuplicateParams) {

  const handleDuplicateCollection = async (collectionId: string) => {
    if (!connected) return;
    let newName: string;
    try {
      const signal = AbortSignal.any([AbortSignal.timeout(5000), getDisconnectSignal()]);
      const result = await apiFetch<{
        ok: true;
        id: string;
        originalId: string;
        collections: CollectionSummary[];
      }>(
        `${serverUrl}/api/collections/${encodeURIComponent(collectionId)}/duplicate`,
        { method: 'POST', signal },
      );
      newName = result.id;
      syncCollectionSummariesToState(result.collections);
    } catch (err) {
      if (isNetworkError(err)) markDisconnected();
      else setErrorToast(`Duplicate failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      return;
    }
    setSuccessToast(`Duplicated collection "${collectionId}" → "${newName}"`);
    const url = serverUrl;
    const dupName = newName;
    pushUndo({
      description: `Duplicated collection "${collectionId}" → "${dupName}"`,
      restore: async () => {
        await apiFetch(`${url}/api/collections/${encodeURIComponent(dupName)}`, { method: 'DELETE' });
        refreshTokens();
      },
      redo: async () => {
        await apiFetch(`${url}/api/collections/${encodeURIComponent(collectionId)}/duplicate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newName: dupName }),
        });
        refreshTokens();
      },
    });
  };

  return { handleDuplicateCollection };
}
