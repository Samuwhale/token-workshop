import { useState, useCallback, useRef } from 'react';
import type { UndoSlot } from './useUndo';
import type { TokenGenerator } from './useGenerators';
import type { TokenCollection } from '@tokenmanager/core';
import type { TokenMapEntry } from '../../shared/types';
import { apiFetch, ApiError } from '../shared/apiFetch';
import { computeGeneratorImpacts, computeModeImpacts } from '../shared/tokenImpact';
import type { RenameTokenConfirmState } from '../shared/tokenListModalTypes';

export interface UseTokenRenameParams {
  connected: boolean;
  serverUrl: string;
  collectionId: string;
  generators?: TokenGenerator[];
  collections?: TokenCollection[];
  pathToCollectionId?: Record<string, string>;
  collectionIdsByPath?: Record<string, string[]>;
  perCollectionFlat?: Record<string, Record<string, TokenMapEntry>>;
  allTokensFlat?: Record<string, TokenMapEntry>;
  onRefresh: () => void;
  onPushUndo?: (slot: UndoSlot) => void;
  onRenamePath: (oldPath: string, newPath: string) => void;
  onSetOperationLoading: (msg: string | null) => void;
  onError?: (msg: string) => void;
}

export function useTokenRename({
  connected,
  serverUrl,
  collectionId,
  generators,
  collections,
  pathToCollectionId,
  collectionIdsByPath,
  perCollectionFlat,
  allTokensFlat,
  onRefresh,
  onPushUndo,
  onRenamePath,
  onSetOperationLoading,
  onError,
}: UseTokenRenameParams) {
  const [renameTokenConfirm, setRenameTokenConfirm] = useState<RenameTokenConfirmState | null>(null);
  const [pendingRenameToken, setPendingRenameToken] = useState<string | null>(null);

  const collectionIdRef = useRef(collectionId);
  collectionIdRef.current = collectionId;

  const executeTokenRename = useCallback(async (oldPath: string, newPath: string, updateAliases = true) => {
    if (!connected) return;
    onSetOperationLoading('Renaming token…');
    try {
      await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(collectionId)}/tokens/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPath, newPath, updateAliases }),
      });
    } catch (err) {
      onError?.(err instanceof ApiError ? err.message : 'Rename token failed: network error');
      onSetOperationLoading(null);
      return;
    }
    setRenameTokenConfirm(null);
    if (onPushUndo) {
      const capturedCollectionId = collectionId;
      const capturedUrl = serverUrl;
      onPushUndo({
        description: `Rename "${oldPath.split('.').pop() ?? oldPath}"`,
        groupKey: `rename-${capturedCollectionId}`,
        groupSummary: (n) => `Rename ${n} tokens`,
        restore: async () => {
          if (collectionIdRef.current !== capturedCollectionId) {
            onError?.(`Undo skipped: active collection changed to "${collectionIdRef.current}" (operation was on "${capturedCollectionId}")`);
            return;
          }
          try {
            await apiFetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedCollectionId)}/tokens/rename`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ oldPath: newPath, newPath: oldPath }),
            });
            onRefresh();
          } catch (err) {
            console.warn('[useTokenRename] undo token rename failed:', err);
            onError?.(err instanceof ApiError ? err.message : 'Undo failed');
          }
        },
        redo: async () => {
          if (collectionIdRef.current !== capturedCollectionId) {
            onError?.(`Redo skipped: active collection changed to "${collectionIdRef.current}" (operation was on "${capturedCollectionId}")`);
            return;
          }
          try {
            await apiFetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedCollectionId)}/tokens/rename`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ oldPath, newPath }),
            });
            onRefresh();
          } catch (err) {
            console.warn('[useTokenRename] redo token rename failed:', err);
            onError?.(err instanceof ApiError ? err.message : 'Redo failed');
          }
        },
      });
    }
    onRefresh();
    onRenamePath(oldPath, newPath);
    onSetOperationLoading(null);
  }, [connected, serverUrl, collectionId, onRefresh, onPushUndo, onRenamePath, onSetOperationLoading, onError]);

  const handleRenameToken = useCallback(async (oldPath: string, newPath: string) => {
    if (!connected) return;
    let data: { count: number; changes: Array<{ tokenPath: string; collectionId: string; oldValue: string; newValue: string }> };
    try {
      data = await apiFetch<{ count: number; changes: Array<{ tokenPath: string; collectionId: string; oldValue: string; newValue: string }> }>(
        `${serverUrl}/api/tokens/${encodeURIComponent(collectionId)}/tokens/rename-preview?oldPath=${encodeURIComponent(oldPath)}&newPath=${encodeURIComponent(newPath)}`
      );
    } catch (err) {
      console.warn('[useTokenRename] token rename preview failed:', err);
      onError?.(err instanceof ApiError ? err.message : 'Failed to check rename dependencies — rename cancelled');
      return;
    }
    const targetPaths = new Set([oldPath]);
    const source =
      perCollectionFlat ?? (allTokensFlat ? { [collectionId]: allTokensFlat } : {});
    const generatorImpacts = computeGeneratorImpacts(
      targetPaths,
      collectionId,
      generators ?? [],
      pathToCollectionId,
      collectionIdsByPath,
    );
    const modeImpacts = computeModeImpacts(
      targetPaths,
      collectionId,
      collections ?? [],
      source,
    );
    if (data.count > 0 || generatorImpacts.length > 0 || modeImpacts.length > 0) {
      setRenameTokenConfirm({
        oldPath,
        newPath,
        depCount: data.count,
        deps: data.changes.map(c => ({ path: c.tokenPath, collectionId: c.collectionId, tokenPath: c.tokenPath, oldValue: c.oldValue, newValue: c.newValue })),
        generatorImpacts,
        modeImpacts,
      });
    } else {
      await executeTokenRename(oldPath, newPath);
    }
  }, [collectionId, collectionIdsByPath, collections, connected, executeTokenRename, generators, pathToCollectionId, perCollectionFlat, allTokensFlat, onError, serverUrl]);

  return {
    renameTokenConfirm,
    setRenameTokenConfirm,
    pendingRenameToken,
    setPendingRenameToken,
    executeTokenRename,
    handleRenameToken,
  };
}
