import { useState, useCallback, useRef } from 'react';
import type { UndoSlot } from './useUndo';
import type { TokenGenerator } from './useGenerators';
import type { ThemeDimension } from '@tokenmanager/core';
import type { TokenMapEntry } from '../../shared/types';
import { apiFetch, ApiError } from '../shared/apiFetch';
import { computeGeneratorImpacts, computeThemeImpacts } from '../shared/tokenImpact';
import type { GeneratorImpact, ThemeImpact } from '../components/tokenListTypes';

export interface UseTokenRenameParams {
  connected: boolean;
  serverUrl: string;
  setName: string;
  generators?: TokenGenerator[];
  dimensions?: ThemeDimension[];
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
  generators,
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
    generatorImpacts: GeneratorImpact[];
    themeImpacts: ThemeImpact[];
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
    const generatorImpacts = computeGeneratorImpacts(targetPaths, generators ?? []);
    const themeImpacts = computeThemeImpacts(targetPaths, dimensions ?? [], source);
    if (data.count > 0 || generatorImpacts.length > 0 || themeImpacts.length > 0) {
      setRenameTokenConfirm({
        oldPath,
        newPath,
        depCount: data.count,
        deps: data.changes.map(c => ({ path: c.tokenPath, setName: c.setName, tokenPath: c.tokenPath, oldValue: c.oldValue, newValue: c.newValue })),
        generatorImpacts,
        themeImpacts,
      });
    } else {
      await executeTokenRename(oldPath, newPath);
    }
  }, [connected, serverUrl, setName, generators, dimensions, perSetFlat, allTokensFlat, executeTokenRename, onError]);

  return {
    renameTokenConfirm,
    setRenameTokenConfirm,
    pendingRenameToken,
    setPendingRenameToken,
    executeTokenRename,
    handleRenameToken,
  };
}
