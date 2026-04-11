import { useCallback, useRef } from 'react';
import type { TokenMapEntry } from '../../shared/types';
import type { UndoSlot } from './useUndo';
import { apiFetch, ApiError } from '../shared/apiFetch';
import { tokenPathToUrlSegment } from '../shared/utils';

export interface UseTokenSaveParams {
  connected: boolean;
  serverUrl: string;
  setName: string;
  allTokensFlat: Record<string, TokenMapEntry>;
  perSetFlat?: Record<string, Record<string, TokenMapEntry>>;
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
    const encodedPath = tokenPathToUrlSegment(path);
    try {
      await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/${encodedPath}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ $type: type, $value: newValue }),
      });
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
          await apiFetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedSet)}/${encodedPath}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              $type: previousSnapshot.type,
              $value: previousSnapshot.value,
            }),
          });
          onRefresh();
        },
        redo: async () => {
          if (setNameRef.current !== capturedSet) {
            onError?.(`Redo skipped: active set changed to "${setNameRef.current}" (operation was on "${capturedSet}")`);
            return;
          }
          await apiFetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedSet)}/${encodedPath}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              $type: nextSnapshot.type,
              $value: nextSnapshot.value,
            }),
          });
          onRefresh();
        },
      });
    }
    onRefresh();
    onRecordTouch(path);
  }, [connected, serverUrl, setName, allTokensFlat, perSetFlat, onRefresh, onPushUndo, onRecordTouch, onError]);

  const handleDescriptionSave = useCallback(async (path: string, description: string) => {
    if (!connected) return;
    const encodedPath = tokenPathToUrlSegment(path);
    const oldEntry = perSetFlat?.[setName]?.[path] ?? allTokensFlat[path];
    try {
      await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/${encodedPath}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ $description: description }),
      });
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
          await apiFetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedSet)}/${encodedPath}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ $description: oldDesc }),
          });
          onRefresh();
        },
        redo: async () => {
          if (setNameRef.current !== capturedSet) {
            onError?.(`Redo skipped: active set changed to "${setNameRef.current}" (operation was on "${capturedSet}")`);
            return;
          }
          await apiFetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedSet)}/${encodedPath}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ $description: description }),
          });
          onRefresh();
        },
      });
    }
    onRefresh();
    onRecordTouch(path);
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
    const encodedPath = tokenPathToUrlSegment(path);
    try {
      await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(targetSet)}/${encodedPath}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ $type: type, $value: newValue }),
      });
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
          await apiFetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedSet)}/${encodedPath}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              $type: previousSnapshot.type,
              $value: previousSnapshot.value,
            }),
          });
          onRefresh();
        },
        redo: async () => {
          await apiFetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedSet)}/${encodedPath}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              $type: nextSnapshot.type,
              $value: nextSnapshot.value,
            }),
          });
          onRefresh();
        },
      });
    }
    onRefresh();
    onRecordTouch(path);
  }, [connected, serverUrl, perSetFlat, onRefresh, onPushUndo, onRecordTouch, onError]);

  const handleDetachFromGenerator = useCallback(async (path: string) => {
    if (!connected) return;
    const encodedPath = tokenPathToUrlSegment(path);
    const url = `${serverUrl}/api/tokens/${encodeURIComponent(setName)}/${encodedPath}`;
    let tokenData: { token: Record<string, unknown> } | null = null;
    try {
      const result = await apiFetch<{ token: Record<string, unknown> }>(url);
      tokenData = result;
    } catch (err) {
      onError?.(err instanceof ApiError ? err.message : 'Detach failed: network error');
      return;
    }
    const exts: Record<string, unknown> = { ...(tokenData?.token?.$extensions as Record<string, unknown>) };
    delete exts['com.tokenmanager.generator'];
    try {
      await apiFetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ $extensions: Object.keys(exts).length > 0 ? exts : undefined }),
      });
    } catch (err) {
      onError?.(err instanceof ApiError ? err.message : 'Detach failed: network error');
      return;
    }
    onRefresh();
    onRefreshGenerators?.();
  }, [connected, serverUrl, setName, onRefresh, onRefreshGenerators, onError]);

  return {
    handleInlineSave,
    handleDescriptionSave,
    handleMultiModeInlineSave,
    handleDetachFromGenerator,
  };
}
