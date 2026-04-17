import { useState, useRef, useLayoutEffect } from 'react';
import { apiFetch, isNetworkError } from '../shared/apiFetch';
import { SET_NAME_RE } from '../shared/utils';
import type { UndoSlot } from './useUndo';

interface UseSetRenameParams {
  serverUrl: string;
  connected: boolean;
  getDisconnectSignal: () => AbortSignal;
  activeSet: string;
  setActiveSet: (set: string) => void;
  renameSetInState: (oldName: string, newName: string) => void;
  setSuccessToast: (msg: string) => void;
  markDisconnected: () => void;
  onPushUndo?: (slot: UndoSlot) => void;
}

export function useSetRename({
  serverUrl, connected, getDisconnectSignal,
  activeSet, setActiveSet, renameSetInState,
  setSuccessToast, markDisconnected,
  onPushUndo,
}: UseSetRenameParams) {
  const [renamingSet, setRenamingSet] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    if (renamingSet && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingSet]);

  const startRename = (setName: string) => {
    setRenamingSet(setName);
    setRenameValue(setName);
    setRenameError('');
  };

  const cancelRename = () => {
    setRenamingSet(null);
    setRenameError('');
  };

  const handleRenameConfirm = async () => {
    if (!renamingSet) return;
    const newName = renameValue.trim();
    if (!newName || newName === renamingSet) { cancelRename(); return; }
    if (!SET_NAME_RE.test(newName)) {
      setRenameError('Use letters, numbers, - and _ (/ for folders)');
      return;
    }
    if (!connected) { cancelRename(); return; }
    try {
      await apiFetch(`${serverUrl}/api/collections/${encodeURIComponent(renamingSet)}/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName }),
        signal: AbortSignal.any([AbortSignal.timeout(5000), getDisconnectSignal()]),
      });
      const oldName = renamingSet;
      renameSetInState(oldName, newName);
      if (activeSet === renamingSet) setActiveSet(newName);
      cancelRename();
      setSuccessToast(`Renamed set "${oldName}" → "${newName}"`);
      onPushUndo?.({
        description: `Renamed set "${oldName}" → "${newName}"`,
        restore: async () => {
          await apiFetch(`${serverUrl}/api/collections/${encodeURIComponent(newName)}/rename`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newName: oldName }),
          });
          renameSetInState(newName, oldName);
          if (activeSet === newName) setActiveSet(oldName);
        },
        redo: async () => {
          await apiFetch(`${serverUrl}/api/collections/${encodeURIComponent(oldName)}/rename`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newName }),
          });
          renameSetInState(oldName, newName);
          if (activeSet === oldName) setActiveSet(newName);
        },
      });
    } catch (err) {
      if (isNetworkError(err)) markDisconnected();
      setRenameError(err instanceof Error ? err.message : 'Rename failed');
    }
  };

  return {
    renamingSet,
    renameValue,
    setRenameValue,
    renameError,
    setRenameError,
    renameInputRef,
    startRename,
    cancelRename,
    handleRenameConfirm,
  };
}
