import { useState, useCallback, useMemo, useRef } from 'react';
import type { TokenMapEntry } from '../../shared/types';
import { apiFetch, ApiError } from '../shared/apiFetch';

export type RelocateConflictAction = 'overwrite' | 'skip' | 'rename';

export interface UseTokenRelocateParams {
  mode: 'move' | 'copy';
  connected: boolean;
  serverUrl: string;
  collectionId: string;
  collectionIds: string[];
  perCollectionFlat?: Record<string, Record<string, TokenMapEntry>>;
  onRefresh: () => void;
  onMovePath?: (
    oldPath: string,
    newPath: string,
    sourceCollectionId: string,
    targetCollectionId: string,
  ) => void;
  onSetOperationLoading?: (msg: string | null) => void;
  onError?: (msg: string) => void;
}

export interface UseTokenRelocateReturn {
  relocatingToken: string | null;
  setRelocatingToken: (v: string | null) => void;
  dismiss: () => void;
  targetCollectionId: string;
  setTargetCollectionId: (v: string) => void;
  sourceCollectionId: string;
  conflict: TokenMapEntry | null;
  conflictAction: RelocateConflictAction;
  setConflictAction: (v: RelocateConflictAction) => void;
  conflictNewPath: string;
  setConflictNewPath: (v: string) => void;
  handleRequest: (tokenPath: string) => void;
  handleConfirm: () => Promise<void>;
  handleChangeTargetCollection: (collectionId: string) => void;
}

export function useTokenRelocate({
  mode,
  connected,
  serverUrl,
  collectionId,
  collectionIds,
  perCollectionFlat,
  onRefresh,
  onMovePath,
  onSetOperationLoading,
  onError,
}: UseTokenRelocateParams): UseTokenRelocateReturn {
  const [relocatingToken, setRelocatingToken] = useState<string | null>(null);
  const [targetCollectionId, setTargetCollectionId] = useState('');
  const [sourceCollectionId, setSourceCollectionId] = useState('');
  const [conflictAction, setConflictAction] = useState<RelocateConflictAction>('overwrite');
  const [conflictNewPath, setConflictNewPath] = useState('');

  const serverUrlRef = useRef(serverUrl);
  serverUrlRef.current = serverUrl;

  const dismiss = useCallback(() => {
    setRelocatingToken(null);
    setTargetCollectionId('');
    setSourceCollectionId('');
    setConflictAction('overwrite');
    setConflictNewPath('');
  }, []);

  const effectiveTargetPath = useMemo(() => {
    if (!relocatingToken) return '';
    if (conflictAction !== 'rename') return relocatingToken;
    const trimmedPath = conflictNewPath.trim();
    return trimmedPath || relocatingToken;
  }, [conflictAction, conflictNewPath, relocatingToken]);

  const conflict = useMemo<TokenMapEntry | null>(() => {
    if (!targetCollectionId || !effectiveTargetPath) return null;
    return perCollectionFlat?.[targetCollectionId]?.[effectiveTargetPath] ?? null;
  }, [effectiveTargetPath, targetCollectionId, perCollectionFlat]);

  const handleRequest = useCallback((tokenPath: string) => {
    const otherCollectionIds = collectionIds.filter(s => s !== collectionId);
    setTargetCollectionId(otherCollectionIds[0] ?? '');
    setRelocatingToken(tokenPath);
    // Capture source collection at dialog-open time so a collection switch
    // before confirmation cannot silently operate on the wrong collection.
    setSourceCollectionId(collectionId);
    setConflictAction('overwrite');
    setConflictNewPath(tokenPath);
  }, [collectionIds, collectionId]);

  // Also resets conflict resolution when the target collection changes.
  const handleChangeTargetCollection = useCallback((collectionId: string) => {
    setTargetCollectionId(collectionId);
    setConflictAction('overwrite');
    setConflictNewPath(relocatingToken ?? '');
  }, [relocatingToken]);

  const handleConfirm = useCallback(async () => {
    if (!relocatingToken || !targetCollectionId || !connected) {
      dismiss();
      return;
    }
    if (conflictAction === 'skip') {
      dismiss();
      return;
    }
    const trimmedTargetPath = conflictNewPath.trim();
    if (conflictAction === 'rename' && (!trimmedTargetPath || trimmedTargetPath === relocatingToken)) {
      onError?.('Choose a different target path.');
      return;
    }
    if (conflictAction === 'rename' && conflict) {
      onError?.('Choose a path that does not already exist in the target collection.');
      return;
    }
    const targetPath = conflictAction === 'rename' ? trimmedTargetPath : relocatingToken;
    if (mode === 'move') onSetOperationLoading?.('Moving token…');
    try {
      await apiFetch(`${serverUrlRef.current}/api/tokens/${encodeURIComponent(sourceCollectionId)}/tokens/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenPath: relocatingToken,
          targetCollectionId: targetCollectionId,
          targetPath,
          overwriteExisting: conflictAction === 'overwrite',
        }),
      });
    } catch (err) {
      const verb = mode === 'move' ? 'Move' : 'Copy';
      onError?.(err instanceof ApiError ? err.message : `${verb} failed: network error`);
      if (mode === 'move') onSetOperationLoading?.(null);
      return;
    }
    if (mode === 'move') {
      onMovePath?.(relocatingToken, targetPath, sourceCollectionId, targetCollectionId);
    }
    dismiss();
    onRefresh();
    if (mode === 'move') onSetOperationLoading?.(null);
  }, [mode, relocatingToken, targetCollectionId, sourceCollectionId, conflictAction, conflictNewPath, connected, conflict, onRefresh, onMovePath, onSetOperationLoading, onError, dismiss]);

  return {
    relocatingToken,
    setRelocatingToken,
    dismiss,
    targetCollectionId,
    setTargetCollectionId,
    sourceCollectionId,
    conflict,
    conflictAction,
    setConflictAction,
    conflictNewPath,
    setConflictNewPath,
    handleRequest,
    handleConfirm,
    handleChangeTargetCollection,
  };
}
