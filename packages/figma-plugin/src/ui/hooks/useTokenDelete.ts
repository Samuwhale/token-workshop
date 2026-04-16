import { useState, useCallback, useRef } from 'react';
import type { TokenNode } from './useTokens';
import type { TokenMapEntry } from '../../shared/types';
import type { UndoSlot } from './useUndo';
import type { DeleteConfirm, AffectedRef } from '../components/tokenListTypes';
import type { TokenRecipe } from './useRecipes';
import type { TokenCollection } from '@tokenmanager/core';
import { apiFetch } from '../shared/apiFetch';
import { getErrorMessage, tokenPathToUrlSegment } from '../shared/utils';
import { findLeafByPath, collectGroupLeaves } from '../components/tokenListUtils';
import { isAlias, extractAliasPath } from '../../shared/resolveAlias';
import { computeRecipeImpacts, computeModeImpacts } from '../shared/tokenImpact';

export interface UseTokenDeleteParams {
  connected: boolean;
  serverUrl: string;
  setName: string;
  tokens: TokenNode[];
  allTokensFlat: Record<string, TokenMapEntry>;
  perSetFlat?: Record<string, Record<string, TokenMapEntry>>;
  recipes?: TokenRecipe[];
  collections?: TokenCollection[];
  onRefresh: () => void;
  onPushUndo?: (slot: UndoSlot) => void;
  onSetOperationLoading: (msg: string | null) => void;
  onSetLocallyDeletedPaths: (paths: Set<string>) => void;
  onClearSelection: () => void;
  onError?: (msg: string) => void;
}

export function useTokenDelete({
  connected,
  serverUrl,
  setName,
  tokens,
  allTokensFlat,
  perSetFlat,
  recipes,
  collections,
  onRefresh,
  onPushUndo,
  onSetOperationLoading,
  onSetLocallyDeletedPaths,
  onClearSelection,
  onError,
}: UseTokenDeleteParams) {
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirm | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const setNameRef = useRef(setName);
  setNameRef.current = setName;

  const requestDeleteToken = useCallback((path: string) => {
    if (!connected) return;
    const affectedRefs: AffectedRef[] = [];
    const source = perSetFlat ?? { '': allTokensFlat };
    for (const [sName, flatSet] of Object.entries(source)) {
      for (const [tokenPath, token] of Object.entries(flatSet)) {
        if (tokenPath === path) continue;
        const val = token.$value;
        if (!isAlias(val)) continue;
        if (extractAliasPath(val) === path) {
          affectedRefs.push({ path: tokenPath, setName: sName });
        }
      }
    }
    const targetPaths = new Set([path]);
    const recipeImpacts = computeRecipeImpacts(targetPaths, recipes ?? []);
    const modeImpacts = computeModeImpacts(targetPaths, collections ?? [], source);
    setDeleteConfirm({ type: 'token', path, orphanCount: affectedRefs.length, affectedRefs, recipeImpacts, modeImpacts });
  }, [connected, allTokensFlat, perSetFlat, recipes, collections]);

  const requestDeleteGroup = useCallback((path: string, name: string, tokenCount: number) => {
    if (!connected) return;
    const affectedRefs: AffectedRef[] = [];
    const prefix = `${path}.`;
    const source = perSetFlat ?? { '': allTokensFlat };
    // Collect all token paths under this group
    const groupPaths = new Set<string>();
    for (const flatSet of Object.values(source)) {
      for (const tokenPath of Object.keys(flatSet)) {
        if (tokenPath === path || tokenPath.startsWith(prefix)) groupPaths.add(tokenPath);
      }
    }
    for (const [sName, flatSet] of Object.entries(source)) {
      for (const [tokenPath, token] of Object.entries(flatSet)) {
        if (tokenPath === path || tokenPath.startsWith(prefix)) continue;
        const val = token.$value;
        if (!isAlias(val)) continue;
        const aliasPath = extractAliasPath(val);
        if (aliasPath && (aliasPath === path || aliasPath.startsWith(prefix))) {
          affectedRefs.push({ path: tokenPath, setName: sName });
        }
      }
    }
    const recipeImpacts = computeRecipeImpacts(groupPaths, recipes ?? []);
    const modeImpacts = computeModeImpacts(groupPaths, collections ?? [], source);
    setDeleteConfirm({ type: 'group', path, name, tokenCount, orphanCount: affectedRefs.length, affectedRefs, recipeImpacts, modeImpacts });
  }, [connected, allTokensFlat, perSetFlat, recipes, collections]);

  const requestBulkDelete = useCallback((selectedPaths: Set<string>) => {
    if (!connected || selectedPaths.size === 0) return;
    const paths = [...selectedPaths];
    const affectedRefs: AffectedRef[] = [];
    const source = perSetFlat ?? { '': allTokensFlat };
    for (const [sName, flatSet] of Object.entries(source)) {
      for (const [tokenPath, token] of Object.entries(flatSet)) {
        if (selectedPaths.has(tokenPath)) continue;
        const val = token.$value;
        if (!isAlias(val)) continue;
        const aliasPath = extractAliasPath(val);
        if (aliasPath && selectedPaths.has(aliasPath)) {
          affectedRefs.push({ path: tokenPath, setName: sName });
        }
      }
    }
    const recipeImpacts = computeRecipeImpacts(selectedPaths, recipes ?? []);
    const modeImpacts = computeModeImpacts(selectedPaths, collections ?? [], source);
    setDeleteConfirm({ type: 'bulk', paths, orphanCount: affectedRefs.length, affectedRefs, recipeImpacts, modeImpacts });
  }, [connected, allTokensFlat, perSetFlat, recipes, collections]);

  const executeDelete = useCallback(async () => {
    if (!deleteConfirm) return;

    type TokenSnapshot = { path: string; data: { $type?: string; $value?: unknown; $description?: string } };
    let undoTokens: TokenSnapshot[] = [];
    let undoDescription = '';

    if (deleteConfirm.type === 'token') {
      const found = findLeafByPath(tokens, deleteConfirm.path);
      if (found) {
        undoTokens = [{ path: deleteConfirm.path, data: { $type: found.$type, $value: found.$value, $description: found.$description } }];
      }
      const name = deleteConfirm.path.split('.').pop() ?? deleteConfirm.path;
      undoDescription = `Deleted "${name}"`;
    } else if (deleteConfirm.type === 'group') {
      undoTokens = collectGroupLeaves(tokens, deleteConfirm.path);
      undoDescription = `Deleted group "${deleteConfirm.name}" (${undoTokens.length} token${undoTokens.length !== 1 ? 's' : ''})`;
    } else {
      undoTokens = deleteConfirm.paths.map(p => {
        const found = findLeafByPath(tokens, p);
        return { path: p, data: found ? { $type: found.$type, $value: found.$value, $description: found.$description } : {} };
      });
      undoDescription = `Deleted ${deleteConfirm.paths.length} token${deleteConfirm.paths.length !== 1 ? 's' : ''}`;
    }

    const deletedType = deleteConfirm.type;
    const deletedPath = deleteConfirm.type !== 'bulk' ? deleteConfirm.path : '';
    const deletedPaths = deleteConfirm.type === 'bulk' ? deleteConfirm.paths : [];

    setDeleteConfirm(null);
    setDeleteError(null);
    onSetOperationLoading(deletedType === 'bulk' ? `Deleting ${deletedPaths.length} tokens…` : 'Deleting…');
    try {
      if (deletedType === 'token' || deletedType === 'group') {
        await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/${tokenPathToUrlSegment(deletedPath)}`, { method: 'DELETE' });
      } else {
        await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/batch-delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paths: deletedPaths }),
        });
        onClearSelection();
      }

      if (deletedType === 'token' || deletedType === 'group') {
        onSetLocallyDeletedPaths(new Set([deletedPath]));
      } else {
        onSetLocallyDeletedPaths(new Set(deletedPaths));
      }

      if (onPushUndo && undoTokens.length > 0) {
        const captured = undoTokens;
        const capturedSet = setName;
        const capturedUrl = serverUrl;
        onPushUndo({
          description: undoDescription,
          restore: async () => {
            if (setNameRef.current !== capturedSet) {
              onError?.(`Undo skipped: active set changed to "${setNameRef.current}" (operation was on "${capturedSet}")`);
              return;
            }
            await Promise.all(
              captured.map(({ path, data }) =>
                apiFetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedSet)}/${tokenPathToUrlSegment(path)}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(data),
                })
              )
            );
            onRefresh();
          },
        });
      }

      onRefresh();
    } catch (err) {
      console.error('Failed to delete:', err);
      setDeleteError(getErrorMessage(err, 'Delete failed'));
      onRefresh();
    } finally {
      onSetOperationLoading(null);
    }
  }, [deleteConfirm, tokens, serverUrl, setName, onRefresh, onPushUndo, onSetOperationLoading, onSetLocallyDeletedPaths, onClearSelection, onError]);

  return {
    deleteConfirm,
    setDeleteConfirm,
    deleteError,
    setDeleteError,
    requestDeleteToken,
    requestDeleteGroup,
    requestBulkDelete,
    executeDelete,
  };
}
