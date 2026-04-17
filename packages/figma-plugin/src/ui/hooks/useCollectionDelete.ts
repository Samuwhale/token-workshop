import { useState } from 'react';
import { apiFetch, ApiError, isNetworkError } from '../shared/apiFetch';
import { isAbortError } from '../shared/utils';
import type { UndoSlot } from './useUndo';

interface UseCollectionDeleteParams {
  serverUrl: string;
  connected: boolean;
  getDisconnectSignal: () => AbortSignal;
  collectionIds: string[];
  currentCollectionId: string;
  setCurrentCollectionId: (collectionId: string) => void;
  removeCollectionFromState: (collectionId: string) => void;
  fetchTokensForCollection: (name: string) => Promise<void>;
  refreshTokens: () => void;
  setSuccessToast: (msg: string) => void;
  setErrorToast: (msg: string) => void;
  markDisconnected: () => void;
  onPushUndo?: (slot: UndoSlot) => void;
}

export function useCollectionDelete({
  serverUrl, connected, getDisconnectSignal,
  collectionIds, currentCollectionId, setCurrentCollectionId,
  removeCollectionFromState, fetchTokensForCollection,
  refreshTokens,
  setSuccessToast, setErrorToast, markDisconnected,
  onPushUndo,
}: UseCollectionDeleteParams) {
  const [deletingCollectionId, setDeletingCollectionId] = useState<string | null>(null);

  const startDelete = (collectionId: string) => {
    setDeletingCollectionId(collectionId);
  };

  const cancelDelete = () => {
    setDeletingCollectionId(null);
  };

  const handleDeleteCollection = async () => {
    if (!deletingCollectionId || !connected) return;
    try {
      const result = await apiFetch<{ ok: true; name: string; operationId?: string }>(
        `${serverUrl}/api/collections/${encodeURIComponent(deletingCollectionId)}`,
        {
          method: 'DELETE',
          signal: AbortSignal.any([AbortSignal.timeout(5000), getDisconnectSignal()]),
        },
      );
      const wasActive = currentCollectionId === deletingCollectionId;
      const remaining = collectionIds.filter((collectionId) => collectionId !== deletingCollectionId);
      const newActive = wasActive ? (remaining[0] ?? '') : currentCollectionId;

      removeCollectionFromState(deletingCollectionId);
      if (wasActive) {
        setCurrentCollectionId(newActive);
        if (newActive) await fetchTokensForCollection(newActive);
      }

      const name = deletingCollectionId;
      setDeletingCollectionId(null);
      setSuccessToast(`Deleted collection "${name}"`);

      if (onPushUndo && result.operationId) {
        const opId = result.operationId;
        const url = serverUrl;
        onPushUndo({
          description: `Deleted collection "${name}"`,
          restore: async () => {
            await apiFetch(`${url}/api/operations/${encodeURIComponent(opId)}/rollback`, { method: 'POST' });
            refreshTokens();
          },
        });
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorToast(`Delete failed: ${err.message}`);
        setDeletingCollectionId(null);
      } else if (isNetworkError(err)) {
        markDisconnected();
        setDeletingCollectionId(null);
      } else if (isAbortError(err)) {
        setDeletingCollectionId(null);
      } else {
        setErrorToast('Delete failed: unexpected error');
        setDeletingCollectionId(null);
      }
    }
  };

  return {
    deletingCollectionId,
    startDelete,
    cancelDelete,
    handleDeleteCollection,
  };
}
