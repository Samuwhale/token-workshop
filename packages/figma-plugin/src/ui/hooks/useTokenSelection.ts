import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { TokenNode } from './useTokens';
import { flattenLeafNodes } from '../components/tokenListUtils';

export interface UseTokenSelectionParams {
  viewMode: string;
  flatItems: Array<{ node: TokenNode; depth: number }>;
  displayedLeafNodes: TokenNode[];
  crossCollectionResults: unknown[] | null;
  selectionScopeKey: string;
  selectionEnabled?: boolean;
  onSelectionChange?: (paths: string[]) => void;
}

export function useTokenSelection({
  viewMode,
  flatItems,
  displayedLeafNodes,
  crossCollectionResults,
  selectionScopeKey,
  selectionEnabled = true,
  onSelectionChange,
}: UseTokenSelectionParams) {
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [showBatchEditor, setShowBatchEditor] = useState(false);
  const lastSelectedPathRef = useRef<string | null>(null);

  const selectMode = selectedPaths.size > 0;

  // Notify parent when multi-select set changes
  useEffect(() => {
    onSelectionChange?.([...selectedPaths]);
  }, [selectedPaths, onSelectionChange]);

  useEffect(() => {
    setSelectedPaths(new Set());
    setShowBatchEditor(false);
    lastSelectedPathRef.current = null;
  }, [selectionScopeKey, selectionEnabled]);

  const displayedLeafPaths = useMemo(
    () => {
      if (!selectionEnabled) {
        return new Set<string>();
      }
      return crossCollectionResults !== null
        ? new Set(
            (crossCollectionResults as Array<{ path: string }>).map((result) => result.path),
          )
        : new Set(displayedLeafNodes.map((node) => node.path));
    },
    [crossCollectionResults, displayedLeafNodes, selectionEnabled],
  );

  const selectedLeafNodes = useMemo(
    () => displayedLeafNodes.filter(n => selectedPaths.has(n.path)),
    [displayedLeafNodes, selectedPaths]
  );

  const handleTokenSelect = useCallback((path: string, modifiers?: { shift: boolean }) => {
    if (!selectionEnabled) {
      return;
    }
    const isShift = modifiers?.shift ?? false;

    if (isShift && lastSelectedPathRef.current !== null) {
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
        return;
      }
    }

    setSelectedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
    lastSelectedPathRef.current = path;
  }, [selectionEnabled, viewMode, flatItems, displayedLeafNodes]);

  const handleSelectAll = useCallback(() => {
    if (!selectionEnabled) {
      return;
    }
    const allSelected = [...displayedLeafPaths].every(p => selectedPaths.has(p));
    if (allSelected) {
      setSelectedPaths(new Set());
    } else {
      setSelectedPaths(new Set(displayedLeafPaths));
    }
  }, [displayedLeafPaths, selectedPaths, selectionEnabled]);

  const handleSelectGroupChildren = useCallback((groupNode: TokenNode) => {
    if (!selectionEnabled) {
      return;
    }
    const leafPaths = flattenLeafNodes(groupNode.children ?? []).map(n => n.path);
    if (leafPaths.length === 0) return;
    setSelectedPaths(prev => {
      const next = new Set(prev);
      leafPaths.forEach(p => next.add(p));
      return next;
    });
  }, [selectionEnabled]);

  const clearSelection = useCallback(() => {
    setSelectedPaths(new Set());
    setShowBatchEditor(false);
    lastSelectedPathRef.current = null;
  }, []);

  return {
    selectMode,
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
    clearSelection,
  };
}
