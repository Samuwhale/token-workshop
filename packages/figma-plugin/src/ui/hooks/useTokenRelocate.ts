import { useState, useCallback, useMemo, useRef } from 'react';
import type { TokenMapEntry } from '../../shared/types';
import { apiFetch, ApiError } from '../shared/apiFetch';

export type RelocateConflictAction = 'overwrite' | 'skip' | 'rename';

export interface UseTokenRelocateParams {
  mode: 'move' | 'copy';
  connected: boolean;
  serverUrl: string;
  setName: string;
  sets: string[];
  perSetFlat?: Record<string, Record<string, TokenMapEntry>>;
  onRefresh: () => void;
  onSetOperationLoading?: (msg: string | null) => void;
  onError?: (msg: string) => void;
}

export interface UseTokenRelocateReturn {
  relocatingToken: string | null;
  setRelocatingToken: (v: string | null) => void;
  targetSet: string;
  setTargetSet: (v: string) => void;
  fromSet: string;
  conflict: TokenMapEntry | null;
  conflictAction: RelocateConflictAction;
  setConflictAction: (v: RelocateConflictAction) => void;
  conflictNewPath: string;
  setConflictNewPath: (v: string) => void;
  handleRequest: (tokenPath: string) => void;
  handleConfirm: () => Promise<void>;
  handleChangeTargetSet: (s: string) => void;
}

export function useTokenRelocate({
  mode,
  connected,
  serverUrl,
  setName,
  sets,
  perSetFlat,
  onRefresh,
  onSetOperationLoading,
  onError,
}: UseTokenRelocateParams): UseTokenRelocateReturn {
  const [relocatingToken, setRelocatingToken] = useState<string | null>(null);
  const [targetSet, setTargetSet] = useState('');
  const [fromSet, setFromSet] = useState('');
  const [conflictAction, setConflictAction] = useState<RelocateConflictAction>('overwrite');
  const [conflictNewPath, setConflictNewPath] = useState('');

  const serverUrlRef = useRef(serverUrl);
  serverUrlRef.current = serverUrl;

  const conflict = useMemo<TokenMapEntry | null>(() => {
    if (!relocatingToken || !targetSet) return null;
    return perSetFlat?.[targetSet]?.[relocatingToken] ?? null;
  }, [relocatingToken, targetSet, perSetFlat]);

  const handleRequest = useCallback((tokenPath: string) => {
    const otherSets = sets.filter(s => s !== setName);
    setTargetSet(otherSets[0] ?? '');
    setRelocatingToken(tokenPath);
    // Capture source set at dialog-open time so a set-switch before confirmation
    // cannot silently operate on the wrong set.
    setFromSet(setName);
    setConflictAction('overwrite');
    setConflictNewPath(tokenPath);
  }, [sets, setName]);

  // Also resets conflict resolution when the target set changes.
  const handleChangeTargetSet = useCallback((s: string) => {
    setTargetSet(s);
    setConflictAction('overwrite');
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!relocatingToken || !targetSet || !connected) {
      setRelocatingToken(null);
      return;
    }
    if (conflictAction === 'skip') {
      setRelocatingToken(null);
      return;
    }
    if (mode === 'move') onSetOperationLoading?.('Moving token…');
    try {
      await apiFetch(`${serverUrlRef.current}/api/tokens/${encodeURIComponent(fromSet)}/tokens/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenPath: relocatingToken, targetSet }),
      });
      // After relocation, rename in the target set if the user chose a new path.
      if (conflictAction === 'rename' && conflictNewPath && conflictNewPath !== relocatingToken) {
        await apiFetch(`${serverUrlRef.current}/api/tokens/${encodeURIComponent(targetSet)}/tokens/rename`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oldPath: relocatingToken, newPath: conflictNewPath, updateAliases: false }),
        });
      }
    } catch (err) {
      const verb = mode === 'move' ? 'Move' : 'Copy';
      onError?.(err instanceof ApiError ? err.message : `${verb} failed: network error`);
      if (mode === 'move') onSetOperationLoading?.(null);
      return;
    }
    setRelocatingToken(null);
    onRefresh();
    if (mode === 'move') onSetOperationLoading?.(null);
  }, [mode, relocatingToken, targetSet, fromSet, conflictAction, conflictNewPath, connected, onRefresh, onSetOperationLoading, onError]);

  return {
    relocatingToken,
    setRelocatingToken,
    targetSet,
    setTargetSet,
    fromSet,
    conflict,
    conflictAction,
    setConflictAction,
    conflictNewPath,
    setConflictNewPath,
    handleRequest,
    handleConfirm,
    handleChangeTargetSet,
  };
}
