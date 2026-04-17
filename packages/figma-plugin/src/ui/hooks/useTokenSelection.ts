import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { TokenNode } from './useTokens';
import { flattenLeafNodes } from '../components/tokenListUtils';

export interface UseTokenSelectionParams {
  viewMode: string;
  flatItems: Array<{ node: TokenNode; depth: number }>;
  displayedLeafNodes: TokenNode[];
  crossCollectionResults: unknown[] | null;
  onSelectionChange?: (paths: string[]) => void;
}

export function useTokenSelection({
  viewMode,
  flatItems,
  displayedLeafNodes,
  crossCollectionResults,
  onSelectionChange,
}: UseTokenSelectionParams) {
  const [selectMode, setSelectMode] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [showBatchEditor, setShowBatchEditor] = useState(false);
  const lastSelectedPathRef = useRef<string | null>(null);

  // Notify parent when multi-select set changes
  useEffect(() => {
    onSelectionChange?.([...selectedPaths]);
  }, [selectedPaths, onSelectionChange]);

  const displayedLeafPaths = useMemo(
    () => crossCollectionResults !== null
      ? new Set((crossCollectionResults as Array<{ path: string }>).map(r => r.path))
      : new Set(displayedLeafNodes.map(n => n.path)),
    [crossCollectionResults, displayedLeafNodes]
  );

  const selectedLeafNodes = useMemo(
    () => displayedLeafNodes.filter(n => selectedPaths.has(n.path)),
    [displayedLeafNodes, selectedPaths]
  );

  // Handles token selection with modifier key support:
  // - ctrl/cmd-click: enter select mode and toggle the token
  // - shift-click (in select mode): range-select from last selected to current
  // - plain click (in select mode): toggle the token
  const handleTokenSelect = useCallback((path: string, modifiers?: { shift: boolean; ctrl: boolean }) => {
    const isCtrl = modifiers?.ctrl ?? false;
    const isShift = modifiers?.shift ?? false;

    if (isCtrl) {
      // Enter select mode on ctrl/cmd-click, then toggle this token
      if (!selectMode) setSelectMode(true);
      setSelectedPaths(prev => {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return next;
      });
      lastSelectedPathRef.current = path;
      return;
    }

    if (isShift && selectMode && lastSelectedPathRef.current !== null) {
      // Range-select from the anchor to the current path
      const orderedPaths = viewMode === 'tree'
        ? flatItems.filter(i => !i.node.isGroup).map(i => i.node.path)
        : displayedLeafNodes.map(n => n.path);
      const anchorIdx = orderedPaths.indexOf(lastSelectedPathRef.current);
      const targetIdx = orderedPaths.indexOf(path);
      if (anchorIdx !== -1 && targetIdx !== -1) {
        const lo = Math.min(anchorIdx, targetIdx);
        const hi = Math.max(anchorIdx, targetIdx);
        setSelectedPaths(prev => {
          const next = new Set(prev);
          for (let i = lo; i <= hi; i++) next.add(orderedPaths[i]);
          return next;
        });
        return; // Keep anchor at lastSelectedPathRef — don't update it on shift-click
      }
    }

    // Plain toggle
    setSelectedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
    lastSelectedPathRef.current = path;
  }, [selectMode, viewMode, flatItems, displayedLeafNodes]);

  const handleSelectAll = useCallback(() => {
    const allSelected = [...displayedLeafPaths].every(p => selectedPaths.has(p));
    if (allSelected) {
      setSelectedPaths(new Set());
    } else {
      setSelectedPaths(new Set(displayedLeafPaths));
    }
  }, [displayedLeafPaths, selectedPaths]);

  const handleSelectGroupChildren = useCallback((groupNode: TokenNode) => {
    const leafPaths = flattenLeafNodes(groupNode.children ?? []).map(n => n.path);
    if (leafPaths.length === 0) return;
    setSelectMode(true);
    setSelectedPaths(prev => {
      const next = new Set(prev);
      leafPaths.forEach(p => next.add(p));
      return next;
    });
  }, []);

  return {
    selectMode,
    setSelectMode,
    selectedPaths,
    setSelectedPaths,
    showBatchEditor,
    setShowBatchEditor,
    lastSelectedPathRef,
    displayedLeafPaths,
    selectedLeafNodes,
    handleTokenSelect,
    handleSelectAll,
    handleSelectGroupChildren,
  };
}
