import { useState, useCallback, useRef } from 'react';
import type { UndoSlot } from './useUndo';
import type { TokenRecipe } from './useRecipes';
import type { CollectionDefinition } from '@tokenmanager/core';
import type { TokenMapEntry } from '../../shared/types';
import { apiFetch, ApiError } from '../shared/apiFetch';
import { computeRecipeImpacts, computeModeImpacts } from '../shared/tokenImpact';
import type { RecipeImpact, ModeImpact } from '../components/tokenListTypes';

export interface UseTokenRenameParams {
  connected: boolean;
  serverUrl: string;
  setName: string;
  recipes?: TokenRecipe[];
  dimensions?: CollectionDefinition[];
  perSetFlat?: Record<string, Record<string, TokenMapEntry>>;
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
  setName,
  recipes,
  dimensions,
  perSetFlat,
  allTokensFlat,
  onRefresh,
  onPushUndo,
  onRenamePath,
  onSetOperationLoading,
  onError,
}: UseTokenRenameParams) {
  const [renameTokenConfirm, setRenameTokenConfirm] = useState<{
    oldPath: string;
    newPath: string;
    depCount: number;
    deps: Array<{ path: string; setName: string; tokenPath: string; oldValue: string; newValue: string }>;
    recipeImpacts: RecipeImpact[];
    modeImpacts: ModeImpact[];
  } | null>(null);
  const [pendingRenameToken, setPendingRenameToken] = useState<string | null>(null);

  const setNameRef = useRef(setName);
  setNameRef.current = setName;
  const serverUrlRef = useRef(serverUrl);
  serverUrlRef.current = serverUrl;

  const executeTokenRename = useCallback(async (oldPath: string, newPath: string, updateAliases = true) => {
    if (!connected) return;
    onSetOperationLoading('Renaming token…');
    try {
      await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/tokens/rename`, {
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
      const capturedSet = setName;
      const capturedUrl = serverUrl;
      onPushUndo({
        description: `Rename "${oldPath.split('.').pop() ?? oldPath}"`,
        groupKey: `rename-${capturedSet}`,
        groupSummary: (n) => `Rename ${n} tokens`,
        restore: async () => {
          if (setNameRef.current !== capturedSet) {
            onError?.(`Undo skipped: active set changed to "${setNameRef.current}" (operation was on "${capturedSet}")`);
            return;
          }
          try {
            await apiFetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedSet)}/tokens/rename`, {
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
          if (setNameRef.current !== capturedSet) {
            onError?.(`Redo skipped: active set changed to "${setNameRef.current}" (operation was on "${capturedSet}")`);
            return;
          }
          try {
            await apiFetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedSet)}/tokens/rename`, {
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
  }, [connected, serverUrl, setName, onRefresh, onPushUndo, onRenamePath, onSetOperationLoading, onError]);

  const handleRenameToken = useCallback(async (oldPath: string, newPath: string) => {
    if (!connected) return;
    let data: { count: number; changes: Array<{ tokenPath: string; setName: string; oldValue: string; newValue: string }> };
    try {
      data = await apiFetch<{ count: number; changes: Array<{ tokenPath: string; setName: string; oldValue: string; newValue: string }> }>(
        `${serverUrl}/api/tokens/${encodeURIComponent(setName)}/tokens/rename-preview?oldPath=${encodeURIComponent(oldPath)}&newPath=${encodeURIComponent(newPath)}`
      );
    } catch (err) {
      console.warn('[useTokenRename] token rename preview failed:', err);
      onError?.(err instanceof ApiError ? err.message : 'Failed to check rename dependencies — rename cancelled');
      return;
    }
    const targetPaths = new Set([oldPath]);
    const source = perSetFlat ?? (allTokensFlat ? { '': allTokensFlat } : {});
    const recipeImpacts = computeRecipeImpacts(targetPaths, recipes ?? []);
    const modeImpacts = computeModeImpacts(targetPaths, dimensions ?? [], source);
    if (data.count > 0 || recipeImpacts.length > 0 || modeImpacts.length > 0) {
      setRenameTokenConfirm({
        oldPath,
        newPath,
        depCount: data.count,
        deps: data.changes.map(c => ({ path: c.tokenPath, setName: c.setName, tokenPath: c.tokenPath, oldValue: c.oldValue, newValue: c.newValue })),
        recipeImpacts,
        modeImpacts,
      });
    } else {
      await executeTokenRename(oldPath, newPath);
    }
  }, [connected, serverUrl, setName, recipes, dimensions, perSetFlat, allTokensFlat, executeTokenRename, onError]);

  return {
    renameTokenConfirm,
    setRenameTokenConfirm,
    pendingRenameToken,
    setPendingRenameToken,
    executeTokenRename,
    handleRenameToken,
  };
}
