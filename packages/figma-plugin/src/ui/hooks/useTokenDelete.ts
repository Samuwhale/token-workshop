import { useState, useCallback, useRef } from 'react';
import type { TokenNode } from './useTokens';
import type { TokenMapEntry } from '../../shared/types';
import type { UndoSlot } from './useUndo';
import type { DeleteConfirm, AffectedRef } from '../components/tokenListTypes';
import type { TokenGenerator } from './useGenerators';
import type { TokenCollection } from '@tokenmanager/core';
import { apiFetch } from '../shared/apiFetch';
import { getErrorMessage, tokenPathToUrlSegment } from '../shared/utils';
import { findLeafByPath, collectGroupLeaves } from '../components/tokenListUtils';
import { computeGeneratorImpacts, computeModeImpacts } from '../shared/tokenImpact';
import { entryReferencesAnyTokenPath } from '../shared/tokenUsage';

export interface UseTokenDeleteParams {
  connected: boolean;
  serverUrl: string;
  collectionId: string;
  tokens: TokenNode[];
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToCollectionId?: Record<string, string>;
  collectionIdsByPath?: Record<string, string[]>;
  perCollectionFlat?: Record<string, Record<string, TokenMapEntry>>;
  generators?: TokenGenerator[];
  collections?: TokenCollection[];
  onRefresh: () => void;
  onPushUndo?: (slot: UndoSlot) => void;
  onSetOperationLoading: (msg: string | null) => void;
  onSetLocallyDeletedPaths: (paths: Set<string>) => void;
  onDeletePaths?: (paths: string[], collectionId: string) => void;
  onClearSelection: () => void;
  onError?: (msg: string) => void;
}

export function useTokenDelete({
  connected,
  serverUrl,
  collectionId,
  tokens,
  allTokensFlat,
  pathToCollectionId,
  collectionIdsByPath,
  perCollectionFlat,
  generators,
  collections,
  onRefresh,
  onPushUndo,
  onSetOperationLoading,
  onSetLocallyDeletedPaths,
  onDeletePaths,
  onClearSelection,
  onError,
}: UseTokenDeleteParams) {
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirm | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const collectionIdRef = useRef(collectionId);
  collectionIdRef.current = collectionId;

  const getImpactCollections = useCallback(
    (): Record<string, Record<string, TokenMapEntry>> =>
      perCollectionFlat ?? { [collectionId]: allTokensFlat },
    [allTokensFlat, collectionId, perCollectionFlat],
  );

  const getCurrentCollectionFlat = useCallback(
    (): Record<string, TokenMapEntry> =>
      perCollectionFlat?.[collectionId] ?? allTokensFlat,
    [allTokensFlat, collectionId, perCollectionFlat],
  );

  const collectAffectedRefs = useCallback(
    (
      targetPaths: ReadonlySet<string>,
      excludedPaths: ReadonlySet<string>,
    ): AffectedRef[] => {
      const affectedRefs: AffectedRef[] = [];
      const seen = new Set<string>();

      for (const [candidateCollectionId, flatSet] of Object.entries(
        getImpactCollections(),
      )) {
        for (const [tokenPath, token] of Object.entries(flatSet)) {
          if (excludedPaths.has(tokenPath)) {
            continue;
          }
          if (!entryReferencesAnyTokenPath(token, targetPaths)) {
            continue;
          }

          const refKey = `${candidateCollectionId}:${tokenPath}`;
          if (seen.has(refKey)) {
            continue;
          }
          seen.add(refKey);
          affectedRefs.push({ path: tokenPath, collectionId: candidateCollectionId });
        }
      }

      return affectedRefs;
    },
    [getImpactCollections],
  );

  const buildDeleteImpacts = useCallback(
    (targetPaths: ReadonlySet<string>, excludedPaths: ReadonlySet<string>) => {
      const source = getImpactCollections();
      return {
        affectedRefs: collectAffectedRefs(targetPaths, excludedPaths),
        generatorImpacts: computeGeneratorImpacts(
          new Set(targetPaths),
          collectionId,
          generators ?? [],
          pathToCollectionId,
          collectionIdsByPath,
        ),
        modeImpacts: computeModeImpacts(
          new Set(targetPaths),
          collectionId,
          collections ?? [],
          source,
        ),
      };
    },
    [
      collectAffectedRefs,
      collectionId,
      collectionIdsByPath,
      collections,
      generators,
      getImpactCollections,
      pathToCollectionId,
    ],
  );

  const collectGroupPathsFromCurrentCollection = useCallback(
    (groupPath: string): Set<string> => {
      const targetPaths = new Set<string>();
      const prefix = `${groupPath}.`;

      for (const tokenPath of Object.keys(getCurrentCollectionFlat())) {
        if (tokenPath === groupPath || tokenPath.startsWith(prefix)) {
          targetPaths.add(tokenPath);
        }
      }

      return targetPaths;
    },
    [getCurrentCollectionFlat],
  );

  const requestDeleteToken = useCallback((path: string) => {
    if (!connected) return;
    const targetPaths = new Set([path]);
    const { affectedRefs, generatorImpacts, modeImpacts } =
      buildDeleteImpacts(targetPaths, targetPaths);
    setDeleteError(null);
    setDeleteConfirm({ type: 'token', path, orphanCount: affectedRefs.length, affectedRefs, generatorImpacts, modeImpacts });
  }, [buildDeleteImpacts, connected]);

  const requestDeleteGroup = useCallback((path: string, name: string, tokenCount: number) => {
    if (!connected) return;
    const groupPaths = collectGroupPathsFromCurrentCollection(path);
    const { affectedRefs, generatorImpacts, modeImpacts } =
      buildDeleteImpacts(groupPaths, groupPaths);
    setDeleteError(null);
    setDeleteConfirm({ type: 'group', path, name, tokenCount, orphanCount: affectedRefs.length, affectedRefs, generatorImpacts, modeImpacts });
  }, [buildDeleteImpacts, collectGroupPathsFromCurrentCollection, connected]);

  const requestBulkDelete = useCallback((selectedPaths: Set<string>) => {
    if (!connected || selectedPaths.size === 0) return;
    const paths = [...selectedPaths];
    const { affectedRefs, generatorImpacts, modeImpacts } =
      buildDeleteImpacts(selectedPaths, selectedPaths);
    setDeleteError(null);
    setDeleteConfirm({ type: 'bulk', paths, orphanCount: affectedRefs.length, affectedRefs, generatorImpacts, modeImpacts });
  }, [buildDeleteImpacts, connected]);

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
    const deletedLeafPaths =
      deletedType === 'group'
        ? undoTokens.map(({ path }) => path)
        : deletedType === 'bulk'
          ? deletedPaths
          : [deletedPath];

    setDeleteConfirm(null);
    setDeleteError(null);
    onSetOperationLoading(deletedType === 'bulk' ? `Deleting ${deletedPaths.length} tokens…` : 'Deleting…');
    try {
      if (deletedType === 'token' || deletedType === 'group') {
        await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(collectionId)}/${tokenPathToUrlSegment(deletedPath)}`, { method: 'DELETE' });
      } else {
        await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(collectionId)}/batch-delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paths: deletedPaths }),
        });
        onClearSelection();
      }

      onSetLocallyDeletedPaths(new Set(deletedLeafPaths));
      onDeletePaths?.(deletedLeafPaths, collectionId);

      if (onPushUndo && undoTokens.length > 0) {
        const captured = undoTokens;
        const capturedCollectionId = collectionId;
        const capturedUrl = serverUrl;
        onPushUndo({
          description: undoDescription,
          restore: async () => {
            if (collectionIdRef.current !== capturedCollectionId) {
              onError?.(`Undo skipped: active collection changed to "${collectionIdRef.current}" (operation was on "${capturedCollectionId}")`);
              return;
            }
            await Promise.all(
              captured.map(({ path, data }) =>
                apiFetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedCollectionId)}/${tokenPathToUrlSegment(path)}`, {
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
      const errorMessage = getErrorMessage(err, 'Delete failed');
      setDeleteError(errorMessage);
      onError?.(errorMessage);
      onRefresh();
    } finally {
      onSetOperationLoading(null);
    }
  }, [deleteConfirm, tokens, serverUrl, collectionId, onRefresh, onPushUndo, onSetOperationLoading, onSetLocallyDeletedPaths, onDeletePaths, onClearSelection, onError]);

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
