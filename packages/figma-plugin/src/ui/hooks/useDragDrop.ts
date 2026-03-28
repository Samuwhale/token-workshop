import { useState, useCallback } from 'react';
import type { UndoSlot } from './useUndo';
import { nodeParentPath } from '../components/tokenListUtils';

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
    setDragSource(null);
    setDragOverGroup(null);
    const moves: Array<{ oldPath: string; newPath: string }> = [];
    for (let i = 0; i < source.paths.length; i++) {
      const oldPath = source.paths[i];
      const name = source.names[i];
      const newPath = targetGroupPath ? `${targetGroupPath}.${name}` : name;
      if (newPath === oldPath) continue;
      moves.push({ oldPath, newPath });
      try {
        const res = await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/tokens/rename`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oldPath, newPath }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: `Move failed (${res.status})` }));
          onError?.(data.error || `Move failed (${res.status})`);
          onRefresh();
          return;
        }
      } catch {
        onError?.('Move token failed: network error');
        onRefresh();
        return;
      }
    }
    if (onPushUndo && moves.length > 0) {
      const capturedSet = setName;
      const capturedUrl = serverUrl;
      const label = moves.length === 1
        ? `Move "${moves[0].oldPath.split('.').pop() ?? moves[0].oldPath}"`
        : `Move ${moves.length} tokens`;
      onPushUndo({
        description: label,
        restore: async () => {
          for (const { oldPath, newPath } of moves) {
            await fetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedSet)}/tokens/rename`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ oldPath: newPath, newPath: oldPath }),
            });
          }
          onRefresh();
        },
        redo: async () => {
          for (const { oldPath, newPath } of moves) {
            await fetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedSet)}/tokens/rename`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ oldPath, newPath }),
            });
          }
          onRefresh();
        },
      });
    }
    for (const { oldPath, newPath } of moves) {
      onRenamePath(oldPath, newPath);
    }
    onRefresh();
  }, [dragSource, connected, serverUrl, setName, onRefresh, onPushUndo, onError, onRenamePath]);

  const handleDropReorder = useCallback(async (targetPath: string, targetName: string, position: 'before' | 'after') => {
    if (!dragSource || !connected || !serverUrl || !setName) return;
    setDragOverReorder(null);
    const source = dragSource;
    setDragSource(null);
    setDragOverGroup(null);

    const targetParent = nodeParentPath(targetPath, targetName) ?? '';
    const siblings = siblingOrderMap.get(targetParent);
    if (!siblings) return;

    // Verify all dragged tokens are siblings in the same group
    for (let i = 0; i < source.paths.length; i++) {
      const srcParent = nodeParentPath(source.paths[i], source.names[i]) ?? '';
      if (srcParent !== targetParent) return;
    }
    if (source.paths.length === 1 && source.paths[0] === targetPath) return;

    const draggedNames = new Set(source.names);
    const withoutDragged = siblings.filter(n => !draggedNames.has(n));
    const targetIdx = withoutDragged.indexOf(targetName);
    if (targetIdx < 0) return;
    const insertIdx = position === 'before' ? targetIdx : targetIdx + 1;
    const newOrder = [...withoutDragged.slice(0, insertIdx), ...source.names, ...withoutDragged.slice(insertIdx)];

    const prevOrder = [...siblings];
    await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/groups/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupPath: targetParent, orderedKeys: newOrder }),
    });
    if (onPushUndo) {
      const capturedSet = setName;
      const capturedUrl = serverUrl;
      const label = source.names.length === 1
        ? `Reorder "${source.names[0]}"`
        : `Reorder ${source.names.length} tokens`;
      onPushUndo({
        description: label,
        restore: async () => {
          await fetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedSet)}/groups/reorder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupPath: targetParent, orderedKeys: prevOrder }),
          });
          onRefresh();
        },
        redo: async () => {
          await fetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedSet)}/groups/reorder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupPath: targetParent, orderedKeys: newOrder }),
          });
          onRefresh();
        },
      });
    }
    onRefresh();
  }, [dragSource, connected, serverUrl, setName, siblingOrderMap, onRefresh, onPushUndo]);

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
