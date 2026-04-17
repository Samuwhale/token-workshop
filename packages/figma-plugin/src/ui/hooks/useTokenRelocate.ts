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
  onSetOperationLoading?: (msg: string | null) => void;
  onError?: (msg: string) => void;
}

export interface UseTokenRelocateReturn {
  relocatingToken: string | null;
  setRelocatingToken: (v: string | null) => void;
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

  const conflict = useMemo<TokenMapEntry | null>(() => {
    if (!relocatingToken || !targetCollectionId) return null;
    return perCollectionFlat?.[targetCollectionId]?.[relocatingToken] ?? null;
  }, [relocatingToken, targetCollectionId, perCollectionFlat]);

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
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!relocatingToken || !targetCollectionId || !connected) {
      setRelocatingToken(null);
      return;
    }
    if (conflictAction === 'skip') {
      setRelocatingToken(null);
      return;
    }
    if (mode === 'move') onSetOperationLoading?.('Moving token…');
    try {
      await apiFetch(`${serverUrlRef.current}/api/tokens/${encodeURIComponent(sourceCollectionId)}/tokens/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenPath: relocatingToken,
          targetCollectionId: targetCollectionId,
        }),
      });
      // After relocation, rename in the target collection if the user chose a new path.
      if (conflictAction === 'rename' && conflictNewPath && conflictNewPath !== relocatingToken) {
        await apiFetch(`${serverUrlRef.current}/api/tokens/${encodeURIComponent(targetCollectionId)}/tokens/rename`, {
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
  }, [mode, relocatingToken, targetCollectionId, sourceCollectionId, conflictAction, conflictNewPath, connected, onRefresh, onSetOperationLoading, onError]);

  return {
    relocatingToken,
    setRelocatingToken,
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
