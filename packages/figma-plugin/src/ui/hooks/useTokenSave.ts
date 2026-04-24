import { useCallback, useRef } from 'react';
import {
  createGeneratorOwnershipKey,
  getGeneratorManagedOutputs,
  readTokenModeValuesForCollection,
  writeTokenModeValuesForCollection,
  type Token,
  type TokenCollection,
} from '@tokenmanager/core';
import type { TokenMapEntry } from '../../shared/types';
import type { UndoSlot } from './useUndo';
import { ApiError } from '../shared/apiFetch';
import {
  applyTokenMutationSuccess,
  createTokenBody,
  type TokenMutationBody,
  createTokenValueBody,
  updateToken,
} from '../shared/tokenMutations';
import { apiFetch } from '../shared/apiFetch';
import type { TokenGenerator } from './useGenerators';
import { cloneValue } from '../../shared/clone';

export interface UseTokenSaveParams {
  connected: boolean;
  serverUrl: string;
  collectionId: string;
  allTokensFlat: Record<string, TokenMapEntry>;
  perCollectionFlat?: Record<string, Record<string, TokenMapEntry>>;
  generators?: TokenGenerator[];
  collections?: TokenCollection[];
  onRefresh: () => void;
  onPushUndo?: (slot: UndoSlot) => void;
  onRecordTouch: (path: string) => void;
  onRefreshGeneratedGroups?: () => void;
  onError?: (msg: string) => void;
}

export interface MultiModeSaveOptions {
  allowGeneratedEdit?: boolean;
}

export function useTokenSave({
  connected,
  serverUrl,
  collectionId,
  allTokensFlat,
  perCollectionFlat,
  generators,
  collections,
  onRefresh,
  onPushUndo,
  onRecordTouch,
  onRefreshGeneratedGroups,
  onError,
}: UseTokenSaveParams) {
  const collectionIdRef = useRef(collectionId);
  collectionIdRef.current = collectionId;
  const serverUrlRef = useRef(serverUrl);
  serverUrlRef.current = serverUrl;

  const findProducingGenerator = useCallback((path: string) => {
    return generators?.find((generator) =>
      getGeneratorManagedOutputs(generator).some(
        (output) =>
          output.key === createGeneratorOwnershipKey(collectionId, path),
      ),
    );
  }, [collectionId, generators]);

  const getOverrideableStepName = useCallback(
    (generator: TokenGenerator, path: string): string | null => {
      const prefix = `${generator.targetGroup}.`;
      if (!path.startsWith(prefix)) {
        return null;
      }
      const stepName = path.slice(prefix.length);
      if (!stepName || stepName.includes(".")) {
        return null;
      }
      return stepName;
    },
    [],
  );

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
          value: cloneValue(previousState.value),
        }
      : oldEntry
        ? {
            type: oldEntry.$type,
            value: cloneValue(oldEntry.$value),
          }
        : null;
    const nextSnapshot = { type, value: cloneValue(newValue) };
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
    const nextDescription = description.length > 0 ? description : null;
    try {
      await updateToken(
        serverUrl,
        collectionId,
        path,
        createTokenBody({ $description: nextDescription }),
      );
    } catch (err) {
      onError?.(err instanceof ApiError ? err.message : 'Save failed: network error');
      return;
    }
    if (onPushUndo && oldEntry) {
      const previousDescription = Object.prototype.hasOwnProperty.call(
        oldEntry,
        '$description',
      )
        ? ((oldEntry as unknown as Record<string, unknown>).$description as string | undefined) ?? null
        : null;
      const capturedCollectionId = collectionId;
      const capturedUrl = serverUrl;
      onPushUndo({
        description: `Edit description of ${path}`,
        restore: async () => {
          if (collectionIdRef.current !== capturedCollectionId) {
            onError?.(`Undo skipped: active collection changed to "${collectionIdRef.current}" (operation was on "${capturedCollectionId}")`);
            return;
          }
          await updateToken(
            capturedUrl,
            capturedCollectionId,
            path,
            createTokenBody({ $description: previousDescription }),
          );
          onRefresh();
        },
        redo: async () => {
          if (collectionIdRef.current !== capturedCollectionId) {
            onError?.(`Redo skipped: active collection changed to "${collectionIdRef.current}" (operation was on "${capturedCollectionId}")`);
            return;
          }
          await updateToken(
            capturedUrl,
            capturedCollectionId,
            path,
            createTokenBody({ $description: nextDescription }),
          );
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

  const commitCollectionModeMutation = useCallback(async ({
    path,
    targetCollectionId,
    description,
    mutateModeValues,
    allowGeneratedEdit = false,
  }: {
    path: string;
    targetCollectionId: string;
    description: string;
    mutateModeValues: (
      nextModeValues: ReturnType<typeof readTokenModeValuesForCollection>,
      currentEntry: TokenMapEntry,
      targetCollection: TokenCollection,
    ) => void;
    allowGeneratedEdit?: boolean;
  }): Promise<boolean> => {
    if (!connected) {
      return false;
    }
    if (!allowGeneratedEdit && findProducingGenerator(path)) {
      onError?.(
        "This generated token must be edited through its generator, saved as a manual exception, or detached first.",
      );
      return false;
    }

    const targetCollection = collections?.find(
      (collection) => collection.id === targetCollectionId,
    );
    if (!targetCollection) {
      onError?.(`Save failed: collection "${targetCollectionId}" is unavailable`);
      return false;
    }

    const currentEntry =
      perCollectionFlat?.[targetCollectionId]?.[path] ?? allTokensFlat[path];
    if (!currentEntry) {
      onError?.(`Save failed: token "${path}" is unavailable in "${targetCollectionId}"`);
      return false;
    }

    const nextToken: Token = {
      $type: currentEntry.$type as Token["$type"],
      $value: cloneValue(currentEntry.$value) as Token["$value"],
      ...(currentEntry.$extensions
        ? { $extensions: structuredClone(currentEntry.$extensions) }
        : {}),
    };
    const nextModeValues = readTokenModeValuesForCollection(
      nextToken,
      targetCollection,
    );
    mutateModeValues(nextModeValues, currentEntry, targetCollection);
    writeTokenModeValuesForCollection(nextToken, targetCollection, nextModeValues);

    const previousMutation: TokenMutationBody = createTokenBody({
      $value: cloneValue(currentEntry.$value),
      $extensions: currentEntry.$extensions
        ? structuredClone(currentEntry.$extensions)
        : null,
    });
    const nextMutation: TokenMutationBody = createTokenBody({
      $value: cloneValue(nextToken.$value),
      $extensions: nextToken.$extensions
        ? structuredClone(nextToken.$extensions)
        : null,
    });

    try {
      await updateToken(serverUrl, targetCollectionId, path, nextMutation);
    } catch (err) {
      onError?.(err instanceof ApiError ? err.message : "Save failed: network error");
      return false;
    }

    if (onPushUndo) {
      const capturedUrl = serverUrl;
      const capturedCollectionId = targetCollectionId;
      onPushUndo({
        description,
        restore: async () => {
          if (collectionIdRef.current !== capturedCollectionId) {
            onError?.(`Undo skipped: active collection changed to "${collectionIdRef.current}" (operation was on "${capturedCollectionId}")`);
            return;
          }
          await updateToken(capturedUrl, capturedCollectionId, path, previousMutation);
          onRefresh();
        },
        redo: async () => {
          if (collectionIdRef.current !== capturedCollectionId) {
            onError?.(`Redo skipped: active collection changed to "${collectionIdRef.current}" (operation was on "${capturedCollectionId}")`);
            return;
          }
          await updateToken(capturedUrl, capturedCollectionId, path, nextMutation);
          onRefresh();
        },
      });
    }

    await applyTokenMutationSuccess({
      onRefresh,
      onRecordTouch,
      touchedPath: path,
    });
    return true;
  }, [
    allTokensFlat,
    collections,
    connected,
    findProducingGenerator,
    onError,
    onPushUndo,
    onRecordTouch,
    onRefresh,
    perCollectionFlat,
    serverUrl,
  ]);

  const handleMultiModeInlineSave = useCallback(async (
    path: string,
    _type: string,
    newValue: unknown,
    targetCollectionId: string,
    _collectionId: string,
    optionName: string,
    _previousState?: { type?: string; value: unknown },
    options?: MultiModeSaveOptions,
  ) => {
    await commitCollectionModeMutation({
      path,
      targetCollectionId,
      description: `Edit mode ${optionName} for ${path}`,
      allowGeneratedEdit: options?.allowGeneratedEdit,
      mutateModeValues: (nextModeValues) => {
        nextModeValues[optionName] = cloneValue(newValue);
      },
    });
  }, [
    commitCollectionModeMutation,
  ]);

  const handleCopyValueToAllModes = useCallback(async (
    path: string,
    targetCollectionId: string,
  ) => {
    await commitCollectionModeMutation({
      path,
      targetCollectionId,
      description: `Copy value to all modes for ${path}`,
      mutateModeValues: (nextModeValues, currentEntry, targetCollection) => {
        for (const mode of targetCollection.modes) {
          nextModeValues[mode.name] = cloneValue(currentEntry.$value);
        }
      },
    });
  }, [commitCollectionModeMutation]);

  const handleSaveGeneratedException = useCallback(async (
    path: string,
    newValue: unknown,
  ): Promise<boolean> => {
    if (!connected) return false;
    const derivedGenerator = findProducingGenerator(path);
    if (!derivedGenerator) {
      onError?.("Manual exception failed: generated group ownership not found");
      return false;
    }
    const stepName = getOverrideableStepName(derivedGenerator, path);
    if (!stepName) {
      onError?.(
        "Manual exception failed: this generated token must be detached before it can diverge.",
      );
      return false;
    }
    try {
      await apiFetch(
        `${serverUrl}/api/generators/${derivedGenerator.id}/steps/${encodeURIComponent(stepName)}/override`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: newValue, locked: true }),
        },
      );
    } catch (err) {
      onError?.(
        err instanceof ApiError
          ? err.message
          : "Manual exception failed: network error",
      );
      return false;
    }
    await applyTokenMutationSuccess({
      onRefresh,
      onRecordTouch,
      touchedPath: path,
    });
    onRefreshGeneratedGroups?.();
    return true;
  }, [
    connected,
    findProducingGenerator,
    getOverrideableStepName,
    onError,
    onRecordTouch,
    onRefresh,
    onRefreshGeneratedGroups,
    serverUrl,
  ]);

  const handleDetachFromGenerator = useCallback(async (path: string): Promise<boolean> => {
    if (!connected) return false;
    try {
      const derivedGenerator = findProducingGenerator(path);
      if (!derivedGenerator) {
        onError?.("Detach failed: generated group ownership not found");
        return false;
      }
      await apiFetch(`${serverUrl}/api/generators/${derivedGenerator.id}/detach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'token', path }),
      });
    } catch (err) {
      onError?.(err instanceof ApiError ? err.message : 'Detach failed: network error');
      return false;
    }
    onRefresh();
    onRefreshGeneratedGroups?.();
    return true;
  }, [connected, findProducingGenerator, onError, onRefresh, onRefreshGeneratedGroups, serverUrl]);

  return {
    handleInlineSave,
    handleDescriptionSave,
    handleMultiModeInlineSave,
    handleCopyValueToAllModes,
    handleSaveGeneratedException,
    handleDetachFromGenerator,
  };
}
