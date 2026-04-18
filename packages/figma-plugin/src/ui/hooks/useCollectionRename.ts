import { useState, useRef, useLayoutEffect } from 'react';
import { apiFetch, isNetworkError } from '../shared/apiFetch';
import { COLLECTION_NAME_RE } from '../shared/utils';
import type { UndoSlot } from './useUndo';

interface UseCollectionRenameParams {
  serverUrl: string;
  connected: boolean;
  getDisconnectSignal: () => AbortSignal;
  currentCollectionId: string;
  setCurrentCollectionId: (collectionId: string) => void;
  renameCollectionInState: (oldName: string, newName: string) => void;
  setSuccessToast: (msg: string) => void;
  markDisconnected: () => void;
  onPushUndo?: (slot: UndoSlot) => void;
  onRenameComplete?: (oldName: string, newName: string) => void;
}

export function useCollectionRename({
  serverUrl, connected, getDisconnectSignal,
  currentCollectionId, setCurrentCollectionId, renameCollectionInState,
  setSuccessToast, markDisconnected,
  onPushUndo,
  onRenameComplete,
}: UseCollectionRenameParams) {
  const [renamingCollectionId, setRenamingCollectionId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    if (renamingCollectionId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingCollectionId]);

  const startRename = (collectionId: string) => {
    setRenamingCollectionId(collectionId);
    setRenameValue(collectionId);
    setRenameError('');
  };

  const cancelRename = () => {
    setRenamingCollectionId(null);
    setRenameError('');
  };

  const handleRenameConfirm = async () => {
    if (!renamingCollectionId) return;
    const newName = renameValue.trim();
    if (!newName || newName === renamingCollectionId) { cancelRename(); return; }
    if (!COLLECTION_NAME_RE.test(newName)) {
      setRenameError('Use letters, numbers, - and _ (/ for folders)');
      return;
    }
    if (!connected) { cancelRename(); return; }
    try {
      await apiFetch(`${serverUrl}/api/collections/${encodeURIComponent(renamingCollectionId)}/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName }),
        signal: AbortSignal.any([AbortSignal.timeout(5000), getDisconnectSignal()]),
      });
      const oldName = renamingCollectionId;
      renameCollectionInState(oldName, newName);
      if (currentCollectionId === renamingCollectionId) setCurrentCollectionId(newName);
      onRenameComplete?.(oldName, newName);
      cancelRename();
      setSuccessToast(`Renamed collection "${oldName}" → "${newName}"`);
      onPushUndo?.({
        description: `Renamed collection "${oldName}" → "${newName}"`,
        restore: async () => {
          await apiFetch(`${serverUrl}/api/collections/${encodeURIComponent(newName)}/rename`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newName: oldName }),
          });
          renameCollectionInState(newName, oldName);
          if (currentCollectionId === newName) setCurrentCollectionId(oldName);
        },
        redo: async () => {
          await apiFetch(`${serverUrl}/api/collections/${encodeURIComponent(oldName)}/rename`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newName }),
          });
          renameCollectionInState(oldName, newName);
          if (currentCollectionId === oldName) setCurrentCollectionId(newName);
        },
      });
    } catch (err) {
      if (isNetworkError(err)) markDisconnected();
      setRenameError(err instanceof Error ? err.message : 'Rename failed');
    }
  };

  return {
    renamingCollectionId,
    renameValue,
    setRenameValue,
    renameError,
    renameInputRef,
    startRename,
    cancelRename,
    handleRenameConfirm,
  };
}
