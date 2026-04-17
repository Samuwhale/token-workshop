import { useCallback, useRef } from 'react';
import { createRecipeOwnershipKey, getRecipeManagedOutputs } from '@tokenmanager/core';
import type { TokenMapEntry } from '../../shared/types';
import type { UndoSlot } from './useUndo';
import { ApiError } from '../shared/apiFetch';
import {
  applyTokenMutationSuccess,
  createTokenBody,
  createTokenValueBody,
  updateToken,
} from '../shared/tokenMutations';
import { apiFetch } from '../shared/apiFetch';
import type { TokenRecipe } from './useRecipes';

export interface UseTokenSaveParams {
  connected: boolean;
  serverUrl: string;
  collectionId: string;
  allTokensFlat: Record<string, TokenMapEntry>;
  perCollectionFlat?: Record<string, Record<string, TokenMapEntry>>;
  recipes?: TokenRecipe[];
  onRefresh: () => void;
  onPushUndo?: (slot: UndoSlot) => void;
  onRecordTouch: (path: string) => void;
  onRefreshRecipes?: () => void;
  onError?: (msg: string) => void;
}

function cloneUndoValue<T>(value: T): T {
  if (value === undefined || value === null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

export function useTokenSave({
  connected,
  serverUrl,
  collectionId,
  allTokensFlat,
  perCollectionFlat,
  recipes,
  onRefresh,
  onPushUndo,
  onRecordTouch,
  onRefreshRecipes,
  onError,
}: UseTokenSaveParams) {
  const collectionIdRef = useRef(collectionId);
  collectionIdRef.current = collectionId;
  const serverUrlRef = useRef(serverUrl);
  serverUrlRef.current = serverUrl;

  const handleInlineSave = useCallback(async (
    path: string,
    type: string,
    newValue: unknown,
    previousState?: { type?: string; value: unknown },
  ) => {
    if (!connected) return;
    // Prefer the raw per-collection entry (alias refs intact) over the resolved
    // cross-collection entry from allTokensFlat. For composite tokens (shadow,
    // typography, etc.) whose sub-properties may be aliases, restoring the resolved
    // value on undo would bake the resolved values into the file and destroy the
    // alias references. Using the per-collection entry also ensures undo is captured
    // when the token lives in a collection outside the current resolved flat map.
    const oldEntry = perCollectionFlat?.[collectionId]?.[path] ?? allTokensFlat[path];
    const previousSnapshot = previousState
      ? {
          type: previousState.type ?? oldEntry?.$type ?? type,
          value: cloneUndoValue(previousState.value),
        }
      : oldEntry
        ? {
            type: oldEntry.$type,
            value: cloneUndoValue(oldEntry.$value),
          }
        : null;
    const nextSnapshot = { type, value: cloneUndoValue(newValue) };
    try {
      await updateToken(serverUrl, collectionId, path, createTokenValueBody({ type, value: newValue }));
    } catch (err) {
      onError?.(err instanceof ApiError ? err.message : 'Save failed: network error');
      return;
    }
    if (onPushUndo && previousSnapshot) {
      const capturedCollectionId = collectionId;
      const capturedUrl = serverUrl;
      onPushUndo({
        description: `Edit ${path}`,
        restore: async () => {
          if (collectionIdRef.current !== capturedCollectionId) {
            onError?.(`Undo skipped: active collection changed to "${collectionIdRef.current}" (operation was on "${capturedCollectionId}")`);
            return;
          }
          await updateToken(capturedUrl, capturedCollectionId, path, createTokenValueBody({
            type: previousSnapshot.type,
            value: previousSnapshot.value,
          }));
          onRefresh();
        },
        redo: async () => {
          if (collectionIdRef.current !== capturedCollectionId) {
            onError?.(`Redo skipped: active collection changed to "${collectionIdRef.current}" (operation was on "${capturedCollectionId}")`);
            return;
          }
          await updateToken(capturedUrl, capturedCollectionId, path, createTokenValueBody({
            type: nextSnapshot.type,
            value: nextSnapshot.value,
          }));
          onRefresh();
        },
      });
    }
    await applyTokenMutationSuccess({
      onRefresh,
      onRecordTouch,
      touchedPath: path,
    });
  }, [connected, serverUrl, collectionId, allTokensFlat, perCollectionFlat, onRefresh, onPushUndo, onRecordTouch, onError]);

  const handleDescriptionSave = useCallback(async (path: string, description: string) => {
    if (!connected) return;
    const oldEntry = perCollectionFlat?.[collectionId]?.[path] ?? allTokensFlat[path];
    try {
      await updateToken(serverUrl, collectionId, path, createTokenBody({ $description: description }));
    } catch (err) {
      onError?.(err instanceof ApiError ? err.message : 'Save failed: network error');
      return;
    }
    if (onPushUndo && oldEntry) {
      const oldDesc = (oldEntry as unknown as Record<string, unknown>).$description ?? '';
      const capturedCollectionId = collectionId;
      const capturedUrl = serverUrl;
      onPushUndo({
        description: `Edit description of ${path}`,
        restore: async () => {
          if (collectionIdRef.current !== capturedCollectionId) {
            onError?.(`Undo skipped: active collection changed to "${collectionIdRef.current}" (operation was on "${capturedCollectionId}")`);
            return;
          }
          await updateToken(capturedUrl, capturedCollectionId, path, createTokenBody({ $description: oldDesc as string }));
          onRefresh();
        },
        redo: async () => {
          if (collectionIdRef.current !== capturedCollectionId) {
            onError?.(`Redo skipped: active collection changed to "${collectionIdRef.current}" (operation was on "${capturedCollectionId}")`);
            return;
          }
          await updateToken(capturedUrl, capturedCollectionId, path, createTokenBody({ $description: description }));
          onRefresh();
        },
      });
    }
    await applyTokenMutationSuccess({
      onRefresh,
      onRecordTouch,
      touchedPath: path,
    });
  }, [connected, serverUrl, collectionId, allTokensFlat, perCollectionFlat, onRefresh, onPushUndo, onRecordTouch, onError]);

  const handleMultiModeInlineSave = useCallback(async (
    path: string,
    _type: string,
    newValue: unknown,
    targetCollectionId: string,
    _collectionId: string,
    optionName: string,
    _previousState?: { type?: string; value: unknown },
  ) => {
    if (!connected) return;

    // Read the current token to get its full $extensions for deep merge.
    // The server PATCH replaces $extensions wholesale, so we must send
    // the complete merged object.
    const currentEntry = perCollectionFlat?.[targetCollectionId]?.[path] ?? allTokensFlat[path];
    const previousExtensions = currentEntry?.$extensions
      ? structuredClone(currentEntry.$extensions)
      : undefined;

    // Build the merged extensions with the new mode value
    const nextExtensions = currentEntry?.$extensions
      ? structuredClone(currentEntry.$extensions)
      : {};
    const tokenmanager =
      nextExtensions.tokenmanager &&
      typeof nextExtensions.tokenmanager === 'object' &&
      !Array.isArray(nextExtensions.tokenmanager)
        ? { ...(nextExtensions.tokenmanager as Record<string, unknown>) }
        : {};
    const modes =
      tokenmanager.modes &&
      typeof tokenmanager.modes === 'object' &&
      !Array.isArray(tokenmanager.modes)
        ? { ...(tokenmanager.modes as Record<string, Record<string, unknown>>) }
        : {};
    const collectionModes = modes[targetCollectionId] ? { ...modes[targetCollectionId] } : {};
    collectionModes[optionName] = newValue;
    tokenmanager.modes = { [targetCollectionId]: collectionModes };
    nextExtensions.tokenmanager = tokenmanager;

    try {
      await updateToken(serverUrl, targetCollectionId, path, createTokenBody({
        $extensions: nextExtensions,
      }));
    } catch (err) {
      onError?.(err instanceof ApiError ? err.message : 'Save failed: network error');
      return;
    }
    if (onPushUndo) {
      const capturedUrl = serverUrl;
      const capturedCollectionId = targetCollectionId;
      onPushUndo({
        description: `Edit mode ${optionName} for ${path}`,
        restore: async () => {
          await updateToken(capturedUrl, capturedCollectionId, path, createTokenBody({
            $extensions: previousExtensions,
          }));
          onRefresh();
        },
        redo: async () => {
          await updateToken(capturedUrl, capturedCollectionId, path, createTokenBody({
            $extensions: nextExtensions,
          }));
          onRefresh();
        },
      });
    }
    await applyTokenMutationSuccess({
      onRefresh,
      onRecordTouch,
      touchedPath: path,
    });
  }, [connected, serverUrl, allTokensFlat, onRefresh, onPushUndo, onRecordTouch, onError, perCollectionFlat]);

  const handleDetachFromRecipe = useCallback(async (path: string) => {
    if (!connected) return;
    try {
      const derivedRecipe = recipes?.find((recipe) =>
        getRecipeManagedOutputs(recipe).some(
          (output) =>
            output.key === createRecipeOwnershipKey(collectionId, path),
        ),
      );
      if (!derivedRecipe) {
        onError?.('Detach failed: recipe ownership not found');
        return;
      }
      await apiFetch(`${serverUrl}/api/recipes/${derivedRecipe.id}/detach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'token', path }),
      });
    } catch (err) {
      onError?.(err instanceof ApiError ? err.message : 'Detach failed: network error');
      return;
    }
    onRefresh();
    onRefreshRecipes?.();
  }, [connected, recipes, onError, onRefresh, onRefreshRecipes, serverUrl, collectionId]);

  return {
    handleInlineSave,
    handleDescriptionSave,
    handleMultiModeInlineSave,
    handleDetachFromRecipe,
  };
}
