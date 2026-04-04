import { useState, useCallback, useRef, useEffect } from 'react';
import type { UndoSlot } from './useUndo';
import { nodeParentPath } from '../components/tokenListUtils';
import { apiFetch, ApiError } from '../shared/apiFetch';
import { isAbortError } from '../shared/utils';

export interface UseDragDropParams {
  connected: boolean;
  serverUrl: string;
  setName: string;
  siblingOrderMap: Map<string, string[]>;
  onRefresh: () => void;
  onPushUndo?: (slot: UndoSlot) => void;
  onError?: (msg: string) => void;
  /** Called after a successful rename/move to update tracking state */
  onRenamePath: (oldPath: string, newPath: string) => void;
}

export function useDragDrop({
  connected,
  serverUrl,
  setName,
  siblingOrderMap,
  onRefresh,
  onPushUndo,
  onError,
  onRenamePath,
}: UseDragDropParams) {
  const abortRef = useRef(new AbortController());
  useEffect(() => {
    const controller = abortRef.current;
    return () => { controller.abort(); };
  }, []);

  const [dragSource, setDragSource] = useState<{ paths: string[]; names: string[] } | null>(null);
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null);
  const [dragOverGroupIsInvalid, setDragOverGroupIsInvalid] = useState(false);
  const [dragOverReorder, setDragOverReorder] = useState<{ path: string; position: 'before' | 'after' } | null>(null);

  const handleDragStart = useCallback((paths: string[], names: string[]) => {
    setDragSource({ paths, names });
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragSource(null);
    setDragOverGroup(null);
    setDragOverGroupIsInvalid(false);
    setDragOverReorder(null);
  }, []);

  const handleDragOverGroup = useCallback((path: string | null, invalid?: boolean) => {
    setDragOverGroup(path);
    setDragOverGroupIsInvalid(invalid ?? false);
    setDragOverReorder(null);
  }, []);

  const handleDragOverToken = useCallback((path: string, _name: string, position: 'before' | 'after') => {
    setDragOverReorder({ path, position });
    setDragOverGroup(null);
  }, []);

  const handleDragLeaveToken = useCallback(() => {
    setDragOverReorder(null);
  }, []);

  const handleDropOnGroup = useCallback(async (targetGroupPath: string) => {
    if (!dragSource || !connected) return;
    const source = dragSource;
    setDragOverGroup(null);
    const planned: Array<{ oldPath: string; newPath: string }> = [];
    for (let i = 0; i < source.paths.length; i++) {
      const oldPath = source.paths[i];
      const name = source.names[i];
      const newPath = targetGroupPath ? `${targetGroupPath}.${name}` : name;
      if (newPath === oldPath) continue;
      planned.push({ oldPath, newPath });
    }
    if (planned.length === 0) return;

    // Check for name conflicts (two dragged tokens with the same leaf name)
    const newPaths = planned.map(r => r.newPath);
    if (new Set(newPaths).size !== newPaths.length) {
      onError?.('Two or more selected tokens share the same name — rename them before moving');
      return;
    }

    const capturedSet = setName;
    const capturedUrl = serverUrl;
    const signal = abortRef.current.signal;
    try {
      await apiFetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedSet)}/batch-rename-paths`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ renames: planned, updateAliases: true }),
        signal,
      });
    } catch (err) {
      if (isAbortError(err)) return;
      const msg = err instanceof ApiError
        ? (err.message || `Move failed (${err.status})`)
        : 'Move failed: network error';
      if (!signal.aborted) {
        setDragSource(null);
        onError?.(msg);
        onRefresh();
      }
      return;
    }
    if (signal.aborted) return;
    setDragSource(null);

    if (onPushUndo) {
      const label = planned.length === 1
        ? `Move "${planned[0].oldPath.split('.').pop() ?? planned[0].oldPath}"`
        : `Move ${planned.length} tokens`;
      onPushUndo({
        description: label,
        restore: async () => {
          const undoRenames = planned.map(r => ({ oldPath: r.newPath, newPath: r.oldPath }));
          try {
            await apiFetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedSet)}/batch-rename-paths`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ renames: undoRenames, updateAliases: true }),
            });
            for (const { oldPath, newPath } of planned) {
              onRenamePath(newPath, oldPath);
            }
            onRefresh();
          } catch (err) {
            console.warn('[useDragDrop] undo move failed:', err);
            onError?.('Undo failed');
          }
        },
        redo: async () => {
          try {
            await apiFetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedSet)}/batch-rename-paths`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ renames: planned, updateAliases: true }),
            });
            for (const { oldPath, newPath } of planned) {
              onRenamePath(oldPath, newPath);
            }
            onRefresh();
          } catch (err) {
            console.warn('[useDragDrop] redo move failed:', err);
            onError?.('Redo failed');
          }
        },
      });
    }
    for (const { oldPath, newPath } of planned) {
      onRenamePath(oldPath, newPath);
    }
    onRefresh();
  }, [dragSource, connected, serverUrl, setName, onRefresh, onPushUndo, onError, onRenamePath]);

  const handleDropReorder = useCallback(async (targetPath: string, targetName: string, position: 'before' | 'after') => {
    if (!dragSource || !connected || !serverUrl || !setName) return;
    setDragOverReorder(null);
    const source = dragSource;
    setDragOverGroup(null);

    const targetParent = nodeParentPath(targetPath, targetName) ?? '';
    const siblings = siblingOrderMap.get(targetParent);
    if (!siblings) return;

    // If any dragged token comes from a different group, fall back to a group move
    const allSameParent = source.paths.every(
      (p, i) => (nodeParentPath(p, source.names[i]) ?? '') === targetParent
    );
    if (!allSameParent) {
      void handleDropOnGroup(targetParent);
      return;
    }
    if (source.paths.length === 1 && source.paths[0] === targetPath) return;

    const draggedNames = new Set(source.names);
    const withoutDragged = siblings.filter(n => !draggedNames.has(n));
    const targetIdx = withoutDragged.indexOf(targetName);
    if (targetIdx < 0) return;
    const insertIdx = position === 'before' ? targetIdx : targetIdx + 1;
    const newOrder = [...withoutDragged.slice(0, insertIdx), ...source.names, ...withoutDragged.slice(insertIdx)];

    const prevOrder = [...siblings];
    const signal = abortRef.current.signal;
    try {
      await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/groups/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupPath: targetParent, orderedKeys: newOrder }),
        signal,
      });
    } catch (err) {
      if (isAbortError(err)) return;
      const msg = err instanceof ApiError ? (err.message || `Reorder failed (${err.status})`) : 'Reorder tokens failed: network error';
      if (!signal.aborted) {
        setDragSource(null);
        onError?.(msg);
        onRefresh();
      }
      return;
    }
    if (signal.aborted) return;
    setDragSource(null);
    if (onPushUndo) {
      const capturedSet = setName;
      const capturedUrl = serverUrl;
      const label = source.names.length === 1
        ? `Reorder "${source.names[0]}"`
        : `Reorder ${source.names.length} tokens`;
      onPushUndo({
        description: label,
        restore: async () => {
          await apiFetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedSet)}/groups/reorder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupPath: targetParent, orderedKeys: prevOrder }),
          });
          onRefresh();
        },
        redo: async () => {
          await apiFetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedSet)}/groups/reorder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupPath: targetParent, orderedKeys: newOrder }),
          });
          onRefresh();
        },
      });
    }
    onRefresh();
  }, [dragSource, connected, serverUrl, setName, siblingOrderMap, onRefresh, onPushUndo, onError, handleDropOnGroup]);

  return {
    dragSource,
    setDragSource,
    dragOverGroup,
    setDragOverGroup,
    dragOverGroupIsInvalid,
    setDragOverGroupIsInvalid,
    dragOverReorder,
    setDragOverReorder,
    handleDragStart,
    handleDragEnd,
    handleDragOverGroup,
    handleDragOverToken,
    handleDragLeaveToken,
    handleDropOnGroup,
    handleDropReorder,
  };
}
