import { useCallback, useRef } from 'react';
import { createGeneratorOwnershipKey, getGeneratorManagedOutputs } from '@tokenmanager/core';
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
import type { TokenGenerator } from './useGenerators';

export interface UseTokenSaveParams {
  connected: boolean;
  serverUrl: string;
  setName: string;
  allTokensFlat: Record<string, TokenMapEntry>;
  perSetFlat?: Record<string, Record<string, TokenMapEntry>>;
  generators?: TokenGenerator[];
  onRefresh: () => void;
  onPushUndo?: (slot: UndoSlot) => void;
  onRecordTouch: (path: string) => void;
  onRefreshGenerators?: () => void;
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
  setName,
  allTokensFlat,
  perSetFlat,
  generators,
  onRefresh,
  onPushUndo,
  onRecordTouch,
  onRefreshGenerators,
  onError,
}: UseTokenSaveParams) {
  const setNameRef = useRef(setName);
  setNameRef.current = setName;
  const serverUrlRef = useRef(serverUrl);
  serverUrlRef.current = serverUrl;

  const handleInlineSave = useCallback(async (
    path: string,
    type: string,
    newValue: unknown,
    previousState?: { type?: string; value: unknown },
  ) => {
    if (!connected) return;
    // Prefer the raw per-set entry (alias refs intact) over the resolved cross-set
    // entry from allTokensFlat. For composite tokens (shadow, typography, etc.) whose
    // sub-properties may be aliases, restoring the resolved value on undo would bake
    // the resolved values into the file and destroy the alias references. Using the
    // per-set entry also ensures undo is captured when the token lives in a theme-
    // disabled set that's absent from allTokensFlat.
    const oldEntry = perSetFlat?.[setName]?.[path] ?? allTokensFlat[path];
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
      await updateToken(serverUrl, setName, path, createTokenValueBody({ type, value: newValue }));
    } catch (err) {
      onError?.(err instanceof ApiError ? err.message : 'Save failed: network error');
      return;
    }
    if (onPushUndo && previousSnapshot) {
      const capturedSet = setName;
      const capturedUrl = serverUrl;
      onPushUndo({
        description: `Edit ${path}`,
        restore: async () => {
          if (setNameRef.current !== capturedSet) {
            onError?.(`Undo skipped: active set changed to "${setNameRef.current}" (operation was on "${capturedSet}")`);
            return;
          }
          await updateToken(capturedUrl, capturedSet, path, createTokenValueBody({
            type: previousSnapshot.type,
            value: previousSnapshot.value,
          }));
          onRefresh();
        },
        redo: async () => {
          if (setNameRef.current !== capturedSet) {
            onError?.(`Redo skipped: active set changed to "${setNameRef.current}" (operation was on "${capturedSet}")`);
            return;
          }
          await updateToken(capturedUrl, capturedSet, path, createTokenValueBody({
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
  }, [connected, serverUrl, setName, allTokensFlat, perSetFlat, onRefresh, onPushUndo, onRecordTouch, onError]);

  const handleDescriptionSave = useCallback(async (path: string, description: string) => {
    if (!connected) return;
    const oldEntry = perSetFlat?.[setName]?.[path] ?? allTokensFlat[path];
    try {
      await updateToken(serverUrl, setName, path, createTokenBody({ $description: description }));
    } catch (err) {
      onError?.(err instanceof ApiError ? err.message : 'Save failed: network error');
      return;
    }
    if (onPushUndo && oldEntry) {
      const oldDesc = (oldEntry as unknown as Record<string, unknown>).$description ?? '';
      const capturedSet = setName;
      const capturedUrl = serverUrl;
      onPushUndo({
        description: `Edit description of ${path}`,
        restore: async () => {
          if (setNameRef.current !== capturedSet) {
            onError?.(`Undo skipped: active set changed to "${setNameRef.current}" (operation was on "${capturedSet}")`);
            return;
          }
          await updateToken(capturedUrl, capturedSet, path, createTokenBody({ $description: oldDesc as string }));
          onRefresh();
        },
        redo: async () => {
          if (setNameRef.current !== capturedSet) {
            onError?.(`Redo skipped: active set changed to "${setNameRef.current}" (operation was on "${capturedSet}")`);
            return;
          }
          await updateToken(capturedUrl, capturedSet, path, createTokenBody({ $description: description }));
          onRefresh();
        },
      });
    }
    await applyTokenMutationSuccess({
      onRefresh,
      onRecordTouch,
      touchedPath: path,
    });
  }, [connected, serverUrl, setName, allTokensFlat, perSetFlat, onRefresh, onPushUndo, onRecordTouch, onError]);

  const handleMultiModeInlineSave = useCallback(async (
    path: string,
    type: string,
    newValue: unknown,
    targetSet: string,
    previousState?: { type?: string; value: unknown },
  ) => {
    if (!connected) return;
    const oldEntry = perSetFlat?.[targetSet]?.[path];
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
      await updateToken(serverUrl, targetSet, path, createTokenValueBody({ type, value: newValue }));
    } catch (err) {
      onError?.(err instanceof ApiError ? err.message : 'Save failed: network error');
      return;
    }
    if (onPushUndo && previousSnapshot) {
      const capturedUrl = serverUrl;
      const capturedSet = targetSet;
      onPushUndo({
        description: `Edit ${path} in ${targetSet}`,
        restore: async () => {
          await updateToken(capturedUrl, capturedSet, path, createTokenValueBody({
            type: previousSnapshot.type,
            value: previousSnapshot.value,
          }));
          onRefresh();
        },
        redo: async () => {
          await updateToken(capturedUrl, capturedSet, path, createTokenValueBody({
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
  }, [connected, serverUrl, perSetFlat, onRefresh, onPushUndo, onRecordTouch, onError]);

  const handleDetachFromGenerator = useCallback(async (path: string) => {
    if (!connected) return;
    try {
      const derivedGenerator = generators?.find((generator) =>
        getGeneratorManagedOutputs(generator).some(
          (output) =>
            output.key === createGeneratorOwnershipKey(setName, path),
        ),
      );
      if (!derivedGenerator) {
        onError?.('Detach failed: generator ownership not found');
        return;
      }
      await apiFetch(`${serverUrl}/api/generators/${derivedGenerator.id}/detach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'token', path }),
      });
    } catch (err) {
      onError?.(err instanceof ApiError ? err.message : 'Detach failed: network error');
      return;
    }
    onRefresh();
    onRefreshGenerators?.();
  }, [connected, generators, onError, onRefresh, onRefreshGenerators, serverUrl, setName]);

  return {
    handleInlineSave,
    handleDescriptionSave,
    handleMultiModeInlineSave,
    handleDetachFromGenerator,
  };
}
