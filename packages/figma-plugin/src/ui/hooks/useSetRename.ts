import { useState, useRef, useLayoutEffect } from 'react';
import { apiFetch } from '../shared/apiFetch';
import { SET_NAME_RE } from '../shared/utils';

interface UseSetRenameParams {
  serverUrl: string;
  connected: boolean;
  getDisconnectSignal: () => AbortSignal;
  activeSet: string;
  setActiveSet: (set: string) => void;
  refreshTokens: () => void;
  setSuccessToast: (msg: string) => void;
  markDisconnected: () => void;
  setTabMenuOpen: (v: string | null) => void;
}

export function useSetRename({
  serverUrl, connected, getDisconnectSignal,
  activeSet, setActiveSet, refreshTokens,
  setSuccessToast, markDisconnected, setTabMenuOpen,
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
    setTabMenuOpen(null);
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
      await apiFetch(`${serverUrl}/api/sets/${encodeURIComponent(renamingSet)}/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName }),
        signal: AbortSignal.any([AbortSignal.timeout(5000), getDisconnectSignal()]),
      });
      const oldName = renamingSet;
      if (activeSet === renamingSet) setActiveSet(newName);
      cancelRename();
      refreshTokens();
      setSuccessToast(`Renamed set "${oldName}" → "${newName}"`);
    } catch (err) {
      if (err instanceof TypeError || (err instanceof Error && err.message.includes('Failed to fetch'))) markDisconnected();
      setRenameError(err instanceof Error ? err.message : 'Rename failed');
    }
  };

  return {
    renamingSet,
    renameValue,
    setRenameValue,
    renameError,
    renameInputRef,
    startRename,
    cancelRename,
    handleRenameConfirm,
  };
}
