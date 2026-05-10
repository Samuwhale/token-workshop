import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { TokenNode } from './useTokens';
import { flattenLeafNodes } from '../components/tokenListUtils';

interface CrossCollectionSelectionResult {
  path: string;
}

export interface UseTokenSelectionParams {
  viewMode: string;
  flatItems: Array<{ node: TokenNode; depth: number }>;
  displayedLeafNodes: TokenNode[];
  crossCollectionResults: CrossCollectionSelectionResult[] | null;
  selectionScopeKey: string;
  selectionEnabled?: boolean;
  onSelectionChange?: (paths: string[]) => void;
}

function getOrderedLeafPaths(
  viewMode: string,
  flatItems: Array<{ node: TokenNode; depth: number }>,
  displayedLeafNodes: TokenNode[],
): string[] {
  return viewMode === 'tree'
    ? flatItems.flatMap(({ node }) => (node.isGroup ? [] : [node.path]))
    : displayedLeafNodes.map((node) => node.path);
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

  const selectionActive = selectedPaths.size > 0;

  // Notify parent when the token selection set changes.
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
        ? new Set(crossCollectionResults.map((result) => result.path))
        : new Set(displayedLeafNodes.map((node) => node.path));
    },
    [crossCollectionResults, displayedLeafNodes, selectionEnabled],
  );

  useEffect(() => {
    if (!selectionEnabled) {
      return;
    }
    setSelectedPaths((current) => {
      if (current.size === 0) {
        return current;
      }
      let changed = false;
      const next = new Set<string>();
      for (const path of current) {
        if (displayedLeafPaths.has(path)) {
          next.add(path);
        } else {
          changed = true;
        }
      }
      return changed ? next : current;
    });
    if (
      lastSelectedPathRef.current !== null &&
      !displayedLeafPaths.has(lastSelectedPathRef.current)
    ) {
      lastSelectedPathRef.current = null;
    }
  }, [displayedLeafPaths, selectionEnabled]);

  useEffect(() => {
    if (selectedPaths.size === 0) {
      setShowBatchEditor(false);
    }
  }, [selectedPaths.size]);

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
      const orderedPaths = getOrderedLeafPaths(viewMode, flatItems, displayedLeafNodes);
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
    if (displayedLeafPaths.size === 0) {
      return;
    }
    setSelectedPaths(prev => {
      const next = new Set(prev);
      const allDisplayedSelected = [...displayedLeafPaths].every(p => next.has(p));
      if (allDisplayedSelected) {
        displayedLeafPaths.forEach(p => next.delete(p));
      } else {
        displayedLeafPaths.forEach(p => next.add(p));
      }
      return next;
    });
  }, [displayedLeafPaths, selectionEnabled]);

  const handleToggleGroupChildren = useCallback((groupNode: TokenNode) => {
    if (!selectionEnabled) {
      return;
    }
    const leafPaths = flattenLeafNodes(groupNode.children ?? []).map(n => n.path);
    if (leafPaths.length === 0) return;
    setSelectedPaths(prev => {
      const next = new Set(prev);
      const allSelected = leafPaths.every(p => next.has(p));
      if (allSelected) {
        leafPaths.forEach(p => next.delete(p));
      } else {
        leafPaths.forEach(p => next.add(p));
      }
      return next;
    });
  }, [selectionEnabled]);

  const clearSelection = useCallback(() => {
    setSelectedPaths(new Set());
    setShowBatchEditor(false);
    lastSelectedPathRef.current = null;
  }, []);

  return {
    selectionActive,
    selectedPaths,
    setSelectedPaths,
    showBatchEditor,
    setShowBatchEditor,
    lastSelectedPathRef,
    displayedLeafPaths,
    selectedLeafNodes,
    handleTokenSelect,
    handleSelectAll,
    handleToggleGroupChildren,
    clearSelection,
  };
}
