import { useState, useCallback, useRef } from 'react';
import type { UndoSlot } from './useUndo';
import { apiFetch, ApiError } from '../shared/apiFetch';
import { nodeParentPath } from '../components/tokenListUtils';

export interface UseGroupOperationsParams {
  connected: boolean;
  serverUrl: string;
  setName: string;
  sets: string[];
  siblingOrderMap: Map<string, string[]>;
  onRefresh: () => void;
  onPushUndo?: (slot: UndoSlot) => void;
  onSetOperationLoading: (msg: string | null) => void;
  onError?: (msg: string) => void;
}

export function useGroupOperations({
  connected,
  serverUrl,
  setName,
  sets,
  siblingOrderMap,
  onRefresh,
  onPushUndo,
  onSetOperationLoading,
  onError,
}: UseGroupOperationsParams) {
  const [renameGroupConfirm, setRenameGroupConfirm] = useState<{
    oldPath: string;
    newPath: string;
    depCount: number;
    deps: Array<{ path: string; collectionId: string; tokenPath: string; oldValue: string; newValue: string }>;
  } | null>(null);

  const [newGroupDialogParent, setNewGroupDialogParent] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupError, setNewGroupError] = useState('');

  const [movingGroup, setMovingGroup] = useState<string | null>(null);
  const [copyingGroup, setCopyingGroup] = useState<string | null>(null);
  const [moveGroupTargetSet, setMoveGroupTargetSet] = useState('');
  const [copyGroupTargetSet, setCopyGroupTargetSet] = useState('');
  // Prevents concurrent move/copy calls from interleaving
  const groupOpInProgress = useRef(false);

  const executeGroupRename = useCallback(async (oldGroupPath: string, newGroupPath: string, updateAliases = true) => {
    if (!connected) return;
    onSetOperationLoading('Renaming group…');
    try {
      await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/groups/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldGroupPath, newGroupPath, updateAliases }),
      });
    } catch (err) {
      onError?.(err instanceof ApiError ? err.message : 'Rename group failed: network error');
      onSetOperationLoading(null);
      return;
    }
    setRenameGroupConfirm(null);
    if (onPushUndo) {
      const capturedSet = setName;
      const capturedUrl = serverUrl;
      onPushUndo({
        description: `Rename group "${oldGroupPath.split('.').pop() ?? oldGroupPath}"`,
        restore: async () => {
          try {
            await apiFetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedSet)}/groups/rename`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ oldGroupPath: newGroupPath, newGroupPath: oldGroupPath }),
            });
            onRefresh();
          } catch (err) {
            console.warn('[useGroupOperations] undo group rename failed:', err);
            onError?.(err instanceof ApiError ? err.message : 'Undo failed');
          }
        },
        redo: async () => {
          try {
            await apiFetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedSet)}/groups/rename`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ oldGroupPath, newGroupPath }),
            });
            onRefresh();
          } catch (err) {
            console.warn('[useGroupOperations] redo group rename failed:', err);
            onError?.(err instanceof ApiError ? err.message : 'Redo failed');
          }
        },
      });
    }
    onRefresh();
    onSetOperationLoading(null);
  }, [connected, serverUrl, setName, onRefresh, onPushUndo, onSetOperationLoading, onError]);

  const handleRenameGroup = useCallback(async (oldGroupPath: string, newGroupPath: string) => {
    if (!connected) return;
    try {
      const data = await apiFetch<{ count: number; changes: Array<{ tokenPath: string; collectionId: string; oldValue: string; newValue: string }> }>(
        `${serverUrl}/api/tokens/${encodeURIComponent(setName)}/groups/rename-preview?oldGroupPath=${encodeURIComponent(oldGroupPath)}&newGroupPath=${encodeURIComponent(newGroupPath)}`
      );
      if (data.count > 0) {
        setRenameGroupConfirm({
          oldPath: oldGroupPath,
          newPath: newGroupPath,
          depCount: data.count,
          deps: data.changes.map(c => ({ path: c.tokenPath, collectionId: c.collectionId, tokenPath: c.tokenPath, oldValue: c.oldValue, newValue: c.newValue })),
        });
        return;
      }
    } catch (err) {
      onError?.(err instanceof ApiError ? err.message : 'Could not fetch rename preview — please try again');
      return;
    }
    await executeGroupRename(oldGroupPath, newGroupPath);
  }, [connected, serverUrl, setName, executeGroupRename, onError]);

  const handleRequestMoveGroup = useCallback((groupPath: string) => {
    const otherSets = sets.filter(s => s !== setName);
    setMoveGroupTargetSet(otherSets[0] ?? '');
    setMovingGroup(groupPath);
  }, [sets, setName]);

  const handleConfirmMoveGroup = useCallback(async () => {
    if (!movingGroup || !moveGroupTargetSet || !connected) { setMovingGroup(null); return; }
    if (groupOpInProgress.current) return;
    groupOpInProgress.current = true;
    onSetOperationLoading('Moving group…');
    try {
      await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/groups/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupPath: movingGroup,
          targetCollectionId: moveGroupTargetSet,
        }),
      });
      setMovingGroup(null);
      onRefresh();
    } catch (err) {
      onError?.(err instanceof ApiError ? err.message : 'Move group failed: network error');
    } finally {
      groupOpInProgress.current = false;
      onSetOperationLoading(null);
    }
  }, [movingGroup, moveGroupTargetSet, connected, serverUrl, setName, onRefresh, onSetOperationLoading, onError]);

  const handleRequestCopyGroup = useCallback((groupPath: string) => {
    const otherSets = sets.filter(s => s !== setName);
    setCopyGroupTargetSet(otherSets[0] ?? '');
    setCopyingGroup(groupPath);
  }, [sets, setName]);

  const handleConfirmCopyGroup = useCallback(async () => {
    if (!copyingGroup || !copyGroupTargetSet || !connected) { setCopyingGroup(null); return; }
    if (groupOpInProgress.current) return;
    groupOpInProgress.current = true;
    onSetOperationLoading('Copying group…');
    try {
      await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/groups/copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupPath: copyingGroup,
          targetCollectionId: copyGroupTargetSet,
        }),
      });
    } catch (err) {
      onError?.(err instanceof ApiError ? err.message : 'Copy group failed: network error');
      groupOpInProgress.current = false;
      onSetOperationLoading(null);
      return;
    }
    groupOpInProgress.current = false;
    setCopyingGroup(null);
    onRefresh();
    onSetOperationLoading(null);
  }, [copyingGroup, copyGroupTargetSet, connected, serverUrl, setName, onRefresh, onSetOperationLoading, onError]);

  const handleDuplicateGroup = useCallback(async (groupPath: string) => {
    if (!connected) return;
    onSetOperationLoading('Duplicating group…');
    try {
      await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/groups/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupPath }),
      });
    } catch (err) {
      onError?.(err instanceof ApiError ? err.message : 'Duplicate group failed: network error');
      onSetOperationLoading(null);
      return;
    }
    onRefresh();
    onSetOperationLoading(null);
  }, [connected, serverUrl, setName, onRefresh, onSetOperationLoading, onError]);

  const handleUpdateGroupMeta = useCallback(async (
    groupPath: string,
    meta: { $type?: string | null; $description?: string | null },
  ) => {
    if (!connected) return;
    try {
      await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/groups/meta`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupPath, ...meta }),
      });
      onRefresh();
    } catch (err) {
      onError?.(err instanceof ApiError ? err.message : 'Update group failed: network error');
    }
  }, [connected, serverUrl, setName, onRefresh, onError]);

  const handleCreateGroup = useCallback(async (parent: string, name: string) => {
    if (!connected || !name.trim()) return;
    const groupPath = parent ? `${parent}.${name.trim()}` : name.trim();
    onSetOperationLoading('Creating group…');
    try {
      await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/groups/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupPath }),
      });
    } catch (err) {
      setNewGroupError(err instanceof ApiError ? err.message : 'Failed to create group');
      onSetOperationLoading(null);
      return;
    }
    setNewGroupDialogParent(null);
    setNewGroupName('');
    setNewGroupError('');
    onRefresh();
    onSetOperationLoading(null);
  }, [connected, serverUrl, setName, onRefresh, onSetOperationLoading]);

  const handleMoveTokenInGroup = useCallback(async (nodePath: string, nodeName: string, direction: 'up' | 'down') => {
    if (!connected || !serverUrl || !setName) return;
    const parentPath = nodeParentPath(nodePath, nodeName) ?? '';
    const siblings = siblingOrderMap.get(parentPath) ?? [];
    const idx = siblings.indexOf(nodeName);
    if (idx < 0) return;
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= siblings.length) return;
    const newOrder = [...siblings];
    [newOrder[idx], newOrder[newIdx]] = [newOrder[newIdx], newOrder[idx]];
    const prevOrder = [...siblings];
    onSetOperationLoading('Reordering…');
    try {
      await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/groups/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupPath: parentPath, orderedKeys: newOrder }),
      });
      if (onPushUndo) {
        const capturedSet = setName;
        const capturedUrl = serverUrl;
        onPushUndo({
          description: `Reorder "${nodeName}"`,
          restore: async () => {
            await apiFetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedSet)}/groups/reorder`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ groupPath: parentPath, orderedKeys: prevOrder }),
            });
            onRefresh();
          },
          redo: async () => {
            await apiFetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedSet)}/groups/reorder`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ groupPath: parentPath, orderedKeys: newOrder }),
            });
            onRefresh();
          },
        });
      }
      onRefresh();
    } catch (err) {
      onError?.(err instanceof ApiError ? err.message : 'Reorder failed: network error');
    } finally {
      onSetOperationLoading(null);
    }
  }, [connected, serverUrl, setName, siblingOrderMap, onRefresh, onPushUndo, onSetOperationLoading, onError]);

  return {
    // State
    renameGroupConfirm,
    setRenameGroupConfirm,
    newGroupDialogParent,
    setNewGroupDialogParent,
    newGroupName,
    setNewGroupName,
    newGroupError,
    setNewGroupError,
    movingGroup,
    setMovingGroup,
    copyingGroup,
    setCopyingGroup,
    moveGroupTargetSet,
    setMoveGroupTargetSet,
    copyGroupTargetSet,
    setCopyGroupTargetSet,
    // Callbacks
    executeGroupRename,
    handleRenameGroup,
    handleRequestMoveGroup,
    handleConfirmMoveGroup,
    handleRequestCopyGroup,
    handleConfirmCopyGroup,
    handleDuplicateGroup,
    handleUpdateGroupMeta,
    handleCreateGroup,
    handleMoveTokenInGroup,
  };
}
