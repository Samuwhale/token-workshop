import { useState, useCallback, useRef } from 'react';
import type { TokenNode } from './useTokens';
import type { TokenMapEntry } from '../../shared/types';
import type { UndoSlot } from './useUndo';
import type { DeleteConfirm, AffectedRef } from '../components/tokenListTypes';
import { apiFetch, ApiError } from '../shared/apiFetch';
import { getErrorMessage } from '../shared/utils';
import { findLeafByPath, collectGroupLeaves } from '../components/tokenListUtils';
import { isAlias, extractAliasPath } from '../../shared/resolveAlias';

export interface UseTokenCrudParams {
  connected: boolean;
  serverUrl: string;
  setName: string;
  sets: string[];
  tokens: TokenNode[];
  allTokensFlat: Record<string, TokenMapEntry>;
  perSetFlat?: Record<string, Record<string, TokenMapEntry>>;
  onRefresh: () => void;
  onPushUndo?: (slot: UndoSlot) => void;
  onRefreshGenerators?: () => void;
  onSetOperationLoading: (msg: string | null) => void;
  onSetLocallyDeletedPaths: (paths: Set<string>) => void;
  onRecordTouch: (path: string) => void;
  onRenamePath: (oldPath: string, newPath: string) => void;
  onClearSelection: () => void;
  onError?: (msg: string) => void;
}

export function useTokenCrud({
  connected,
  serverUrl,
  setName,
  sets,
  tokens,
  allTokensFlat,
  perSetFlat,
  onRefresh,
  onPushUndo,
  onRefreshGenerators,
  onSetOperationLoading,
  onSetLocallyDeletedPaths,
  onRecordTouch,
  onRenamePath,
  onClearSelection,
  onError,
}: UseTokenCrudParams) {
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirm | null>(null);
  const [renameTokenConfirm, setRenameTokenConfirm] = useState<{
    oldPath: string;
    newPath: string;
    depCount: number;
    deps: Array<{ path: string; setName: string; tokenPath: string; oldValue: string; newValue: string }>;
  } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pendingRenameToken, setPendingRenameToken] = useState<string | null>(null);
  const [movingToken, setMovingToken] = useState<string | null>(null);
  const [copyingToken, setCopyingToken] = useState<string | null>(null);
  const [moveTokenTargetSet, setMoveTokenTargetSet] = useState('');
  const [copyTokenTargetSet, setCopyTokenTargetSet] = useState('');
  // moveFromSet/copyFromSet capture the source set when the dialog opens so that
  // a set-switch between "open dialog" and "confirm" doesn't silently target the wrong set.
  const [moveFromSet, setMoveFromSet] = useState('');
  const [copyFromSet, setCopyFromSet] = useState('');

  // Refs that always reflect the current setName/serverUrl so that undo/redo callbacks
  // can validate they are still operating in the correct set context.
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
            console.warn('[useTokenCrud] undo token rename failed:', err);
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
            console.warn('[useTokenCrud] redo token rename failed:', err);
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
      console.warn('[useTokenCrud] token rename preview failed:', err);
      data = { count: 0, changes: [] };
    }
    if (data.count > 0) {
      setRenameTokenConfirm({
        oldPath,
        newPath,
        depCount: data.count,
        deps: data.changes.map(c => ({ path: c.tokenPath, setName: c.setName, tokenPath: c.tokenPath, oldValue: c.oldValue, newValue: c.newValue })),
      });
    } else {
      await executeTokenRename(oldPath, newPath);
    }
  }, [connected, serverUrl, setName, executeTokenRename]);

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
    setDeleteConfirm({ type: 'token', path, orphanCount: affectedRefs.length, affectedRefs });
  }, [connected, allTokensFlat, perSetFlat]);

  const requestDeleteGroup = useCallback((path: string, name: string, tokenCount: number) => {
    if (!connected) return;
    const affectedRefs: AffectedRef[] = [];
    const prefix = `${path}.`;
    const source = perSetFlat ?? { '': allTokensFlat };
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
    setDeleteConfirm({ type: 'group', path, name, tokenCount, orphanCount: affectedRefs.length, affectedRefs });
  }, [connected, allTokensFlat, perSetFlat]);

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
    setDeleteConfirm({ type: 'bulk', paths, orphanCount: affectedRefs.length, affectedRefs });
  }, [connected, allTokensFlat, perSetFlat]);

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
        await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/${deletedPath.split('.').map(encodeURIComponent).join('/')}`, { method: 'DELETE' });
      } else {
        await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/bulk-delete`, {
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
                apiFetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedSet)}/${path.split('.').map(encodeURIComponent).join('/')}`, {
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
  }, [deleteConfirm, tokens, serverUrl, setName, onRefresh, onPushUndo, onSetOperationLoading, onSetLocallyDeletedPaths, onClearSelection]);

  const handleDuplicateToken = useCallback(async (path: string) => {
    if (!connected) return;
    const token = allTokensFlat[path];
    if (!token) return;
    // Use the full TokenNode to access $description and $extensions (not in TokenMapEntry)
    const tokenNode = findLeafByPath(tokens, path);
    const baseCopy = `${path}-copy`;
    let newPath = baseCopy;
    let i = 2;
    while (allTokensFlat[newPath]) {
      newPath = `${baseCopy}-${i++}`;
    }
    onSetOperationLoading('Duplicating token…');
    try {
      const body: Record<string, unknown> = { $type: token.$type, $value: token.$value };
      if (tokenNode?.$description) body.$description = tokenNode.$description;
      if (tokenNode?.$extensions) body.$extensions = tokenNode.$extensions;
      await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/${newPath.split('.').map(encodeURIComponent).join('/')}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      onRefresh();
      onRecordTouch(newPath);
      setPendingRenameToken(newPath);
    } catch (err) {
      onError?.(err instanceof ApiError ? err.message : 'Duplicate failed: network error');
    } finally {
      onSetOperationLoading(null);
    }
  }, [connected, serverUrl, setName, allTokensFlat, tokens, onRefresh, onRecordTouch, onSetOperationLoading, onError]);

  const handleInlineSave = useCallback(async (path: string, type: string, newValue: unknown) => {
    if (!connected) return;
    const oldEntry = allTokensFlat[path];
    const encodedPath = path.split('.').map(encodeURIComponent).join('/');
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
    if (onPushUndo && oldEntry) {
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
            body: JSON.stringify({ $type: oldEntry.$type, $value: oldEntry.$value }),
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
            body: JSON.stringify({ $type: type, $value: newValue }),
          });
          onRefresh();
        },
      });
    }
    onRefresh();
    onRecordTouch(path);
  }, [connected, serverUrl, setName, allTokensFlat, onRefresh, onPushUndo, onRecordTouch, onError]);

  const handleDescriptionSave = useCallback(async (path: string, description: string) => {
    if (!connected) return;
    const encodedPath = path.split('.').map(encodeURIComponent).join('/');
    const oldEntry = allTokensFlat[path];
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
  }, [connected, serverUrl, setName, allTokensFlat, onRefresh, onPushUndo, onRecordTouch, onError]);

  const handleMultiModeInlineSave = useCallback(async (path: string, type: string, newValue: unknown, targetSet: string) => {
    if (!connected) return;
    const oldEntry = perSetFlat?.[targetSet]?.[path];
    const encodedPath = path.split('.').map(encodeURIComponent).join('/');
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
    if (onPushUndo) {
      onPushUndo({
        description: `Edit ${path} in ${targetSet}`,
        restore: async () => {
          if (oldEntry) {
            await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(targetSet)}/${encodedPath}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ $type: oldEntry.$type, $value: oldEntry.$value }),
            });
          }
          onRefresh();
        },
        redo: async () => {
          await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(targetSet)}/${encodedPath}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ $type: type, $value: newValue }),
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
    const encodedPath = path.split('.').map(encodeURIComponent).join('/');
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

  const handleRequestMoveToken = useCallback((tokenPath: string) => {
    const otherSets = sets.filter(s => s !== setName);
    setMoveTokenTargetSet(otherSets[0] ?? '');
    setMovingToken(tokenPath);
    // Capture the source set at dialog-open time so a set-switch before confirmation
    // cannot silently move a token from the wrong set.
    setMoveFromSet(setName);
  }, [sets, setName]);

  const handleConfirmMoveToken = useCallback(async () => {
    if (!movingToken || !moveTokenTargetSet || !connected) { setMovingToken(null); return; }
    // Use moveFromSet (captured when the dialog opened) rather than the current setName so
    // that a set-switch between dialog-open and confirm doesn't move from the wrong set.
    onSetOperationLoading('Moving token…');
    try {
      await apiFetch(`${serverUrlRef.current}/api/tokens/${encodeURIComponent(moveFromSet)}/tokens/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenPath: movingToken, targetSet: moveTokenTargetSet }),
      });
    } catch (err) {
      onError?.(err instanceof ApiError ? err.message : 'Move failed: network error');
      onSetOperationLoading(null);
      return;
    }
    setMovingToken(null);
    onRefresh();
    onSetOperationLoading(null);
  }, [movingToken, moveTokenTargetSet, moveFromSet, connected, onRefresh, onSetOperationLoading, onError]);

  const handleRequestCopyToken = useCallback((tokenPath: string) => {
    const otherSets = sets.filter(s => s !== setName);
    setCopyTokenTargetSet(otherSets[0] ?? '');
    setCopyingToken(tokenPath);
    // Capture the source set at dialog-open time so a set-switch before confirmation
    // cannot silently copy a token from the wrong set.
    setCopyFromSet(setName);
  }, [sets, setName]);

  const handleConfirmCopyToken = useCallback(async () => {
    if (!copyingToken || !copyTokenTargetSet || !connected) { setCopyingToken(null); return; }
    // Use copyFromSet (captured when the dialog opened) rather than the current setName.
    try {
      await apiFetch(`${serverUrlRef.current}/api/tokens/${encodeURIComponent(copyFromSet)}/tokens/copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenPath: copyingToken, targetSet: copyTokenTargetSet }),
      });
    } catch (err) {
      onError?.(err instanceof ApiError ? err.message : 'Copy failed: network error');
      return;
    }
    setCopyingToken(null);
    onRefresh();
  }, [copyingToken, copyTokenTargetSet, copyFromSet, connected, onRefresh, onError]);

  return {
    // State
    deleteConfirm,
    setDeleteConfirm,
    renameTokenConfirm,
    setRenameTokenConfirm,
    deleteError,
    setDeleteError,
    pendingRenameToken,
    setPendingRenameToken,
    movingToken,
    setMovingToken,
    copyingToken,
    setCopyingToken,
    moveTokenTargetSet,
    setMoveTokenTargetSet,
    copyTokenTargetSet,
    setCopyTokenTargetSet,
    moveFromSet,
    copyFromSet,
    // Callbacks
    executeTokenRename,
    handleRenameToken,
    requestDeleteToken,
    requestDeleteGroup,
    requestBulkDelete,
    executeDelete,
    handleDuplicateToken,
    handleInlineSave,
    handleDescriptionSave,
    handleMultiModeInlineSave,
    handleDetachFromGenerator,
    handleRequestMoveToken,
    handleConfirmMoveToken,
    handleRequestCopyToken,
    handleConfirmCopyToken,
  };
}
