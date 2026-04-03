import { useState } from 'react';
import type { ThemeDimension } from '@tokenmanager/core';
import { apiFetch } from '../shared/apiFetch';

export interface UseThemeDragDropParams {
  serverUrl: string;
  connected: boolean;
  dimensions: ThemeDimension[];
  setDimensions: React.Dispatch<React.SetStateAction<ThemeDimension[]>>;
  fetchDimensions: () => void;
}

export function useThemeDragDrop({
  serverUrl,
  connected,
  dimensions,
  setDimensions,
  fetchDimensions,
}: UseThemeDragDropParams) {
  // Dimension drag-and-drop
  const [draggingDimId, setDraggingDimId] = useState<string | null>(null);
  const [dragOverDimId, setDragOverDimId] = useState<string | null>(null);

  // Option drag-and-drop
  const [draggingOpt, setDraggingOpt] = useState<{ dimId: string; optionName: string } | null>(null);
  const [dragOverOpt, setDragOverOpt] = useState<{ dimId: string; optionName: string } | null>(null);

  // --- Move dimension (button reorder) ---

  const handleMoveDimension = async (dimId: string, direction: 'up' | 'down') => {
    if (!connected) return;
    const idx = dimensions.findIndex(d => d.id === dimId);
    if (idx === -1) return;
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= dimensions.length) return;
    const reordered = [...dimensions];
    [reordered[idx], reordered[newIdx]] = [reordered[newIdx], reordered[idx]];
    setDimensions(reordered);
    try {
      await apiFetch(`${serverUrl}/api/themes/dimensions-order`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dimensionIds: reordered.map(d => d.id) }),
      });
    } catch (err) {
      console.warn('[ThemeManager] failed to reorder dimensions:', err);
      fetchDimensions();
    }
  };

  // --- Move option (button reorder) ---

  const handleMoveOption = async (dimId: string, optionName: string, direction: 'up' | 'down') => {
    const dim = dimensions.find(d => d.id === dimId);
    if (!dim || !connected) return;
    const idx = dim.options.findIndex(o => o.name === optionName);
    if (idx === -1) return;
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= dim.options.length) return;
    const reordered = [...dim.options];
    [reordered[idx], reordered[newIdx]] = [reordered[newIdx], reordered[idx]];
    setDimensions(prev => prev.map(d => d.id === dimId ? { ...d, options: reordered } : d));
    try {
      await apiFetch(
        `${serverUrl}/api/themes/dimensions/${encodeURIComponent(dimId)}/options-order`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ options: reordered.map(o => o.name) }),
        },
      );
    } catch (err) {
      console.warn('[ThemeManager] failed to reorder options:', err);
      fetchDimensions();
    }
  };

  // --- Drag-and-drop dimension reorder ---

  const handleDimDragStart = (e: React.DragEvent, dimId: string) => {
    e.dataTransfer.effectAllowed = 'move';
    setDraggingDimId(dimId);
  };

  const handleDimDragOver = (e: React.DragEvent, dimId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dimId !== dragOverDimId) setDragOverDimId(dimId);
  };

  const handleDimDrop = async (targetDimId: string) => {
    if (!draggingDimId || draggingDimId === targetDimId) {
      setDraggingDimId(null);
      setDragOverDimId(null);
      return;
    }
    const fromIdx = dimensions.findIndex(d => d.id === draggingDimId);
    const toIdx = dimensions.findIndex(d => d.id === targetDimId);
    if (fromIdx === -1 || toIdx === -1) { setDraggingDimId(null); setDragOverDimId(null); return; }
    const reordered = [...dimensions];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    setDimensions(reordered);
    setDraggingDimId(null);
    setDragOverDimId(null);
    try {
      await apiFetch(`${serverUrl}/api/themes/dimensions-order`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dimensionIds: reordered.map(d => d.id) }),
      });
    } catch (err) {
      console.warn('[ThemeManager] failed to reorder dimensions:', err);
      fetchDimensions();
    }
  };

  const handleDimDragEnd = () => { setDraggingDimId(null); setDragOverDimId(null); };

  // --- Drag-and-drop option reorder ---

  const handleOptDragStart = (e: React.DragEvent, dimId: string, optionName: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.stopPropagation();
    setDraggingOpt({ dimId, optionName });
  };

  const handleOptDragOver = (e: React.DragEvent, dimId: string, optionName: string) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverOpt?.dimId !== dimId || dragOverOpt?.optionName !== optionName) {
      setDragOverOpt({ dimId, optionName });
    }
  };

  const handleOptDrop = async (e: React.DragEvent, targetDimId: string, targetOptionName: string) => {
    e.stopPropagation();
    if (!draggingOpt || draggingOpt.dimId !== targetDimId || draggingOpt.optionName === targetOptionName) {
      setDraggingOpt(null);
      setDragOverOpt(null);
      return;
    }
    const dim = dimensions.find(d => d.id === targetDimId);
    if (!dim) { setDraggingOpt(null); setDragOverOpt(null); return; }
    const fromIdx = dim.options.findIndex(o => o.name === draggingOpt.optionName);
    const toIdx = dim.options.findIndex(o => o.name === targetOptionName);
    if (fromIdx === -1 || toIdx === -1) { setDraggingOpt(null); setDragOverOpt(null); return; }
    const reordered = [...dim.options];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    setDimensions(prev => prev.map(d => d.id === targetDimId ? { ...d, options: reordered } : d));
    setDraggingOpt(null);
    setDragOverOpt(null);
    try {
      await apiFetch(`${serverUrl}/api/themes/dimensions/${encodeURIComponent(targetDimId)}/options-order`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ options: reordered.map(o => o.name) }),
      });
    } catch (err) {
      console.warn('[ThemeManager] failed to reorder options:', err);
      fetchDimensions();
    }
  };

  const handleOptDragEnd = () => { setDraggingOpt(null); setDragOverOpt(null); };

  return {
    draggingDimId,
    dragOverDimId,
    draggingOpt,
    dragOverOpt,
    handleMoveDimension,
    handleMoveOption,
    handleDimDragStart,
    handleDimDragOver,
    handleDimDrop,
    handleDimDragEnd,
    handleOptDragStart,
    handleOptDragOver,
    handleOptDrop,
    handleOptDragEnd,
  };
}
