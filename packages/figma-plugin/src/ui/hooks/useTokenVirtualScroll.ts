import { useState, useCallback, useMemo, useLayoutEffect } from 'react';
import type { TokenNode } from './useTokens';
import type { TokenMapEntry } from '../../shared/types';
import { flattenVisible } from '../components/tokenListUtils';
import { isAlias, resolveTokenValue } from '../../shared/resolveAlias';
import { VIRTUAL_CHAIN_EXPAND_HEIGHT } from '../components/tokenListTypes';

export interface UseTokenVirtualScrollParams {
  displayedTokens: TokenNode[];
  expandedPaths: Set<string>;
  expandedChains: Set<string>;
  rowHeight: number;
  allTokensFlat: Record<string, TokenMapEntry>;
  viewMode: string;
  recentlyTouched: { paths: Set<string>; timestamps: Map<string, number> };
  highlightedToken?: string | null;
  virtualListRef: React.MutableRefObject<HTMLDivElement | null>;
  virtualScrollTopRef: React.MutableRefObject<number>;
  flatItemsRef: React.MutableRefObject<Array<{ node: { path: string; isGroup?: boolean; $value?: unknown; $type?: string } }>>;
  itemOffsetsRef: React.MutableRefObject<number[]>;
  scrollAnchorPathRef: React.MutableRefObject<string | null>;
  isFilterChangeRef: React.MutableRefObject<boolean>;
}

export function useTokenVirtualScroll({
  displayedTokens,
  expandedPaths,
  expandedChains,
  rowHeight,
  allTokensFlat,
  viewMode,
  recentlyTouched,
  highlightedToken,
  virtualListRef,
  virtualScrollTopRef: _virtualScrollTopRef,
  flatItemsRef,
  itemOffsetsRef,
  scrollAnchorPathRef,
  isFilterChangeRef,
}: UseTokenVirtualScrollParams) {
  const [virtualScrollTop, setVirtualScrollTop] = useState(0);

  // Tab navigation state
  const [pendingTabEdit, setPendingTabEdit] = useState<{ path: string; columnId: string | null } | null>(null);
  const handleClearPendingTabEdit = useCallback(() => setPendingTabEdit(null), []);

  // Flat list of visible nodes for virtual scrolling (respects expand/collapse state)
  const flatItems = useMemo(() => {
    if (viewMode !== 'tree') return [];
    if (recentlyTouched.paths.size > 0 && (displayedTokens as TokenNode[]).length === 0) return [];
    // Check if we're in "recently touched" mode by checking the recentlyTouched special rendering path
    // This is controlled outside, so we just flatten normally
    return flattenVisible(displayedTokens, expandedPaths);
  }, [displayedTokens, expandedPaths, viewMode, recentlyTouched.paths]);

  const CHAIN_STEP_HEIGHT = 18;
  // Cumulative row offsets for variable-height virtual scroll.
  const itemOffsets = useMemo(() => {
    const offsets = new Array<number>(flatItems.length + 1);
    offsets[0] = 0;
    for (let i = 0; i < flatItems.length; i++) {
      let h = rowHeight;
      const item = flatItems[i];
      if (expandedChains.has(item.node.path) && isAlias(item.node.$value)) {
        const result = resolveTokenValue(item.node.$value, item.node.$type || 'unknown', allTokensFlat);
        const stepCount = 1 + (result?.chain?.length ?? 0);
        h += Math.max(stepCount * CHAIN_STEP_HEIGHT, VIRTUAL_CHAIN_EXPAND_HEIGHT);
      } else if (expandedChains.has(item.node.path)) {
        h += VIRTUAL_CHAIN_EXPAND_HEIGHT;
      }
      offsets[i + 1] = offsets[i] + h;
    }
    return offsets;
  }, [flatItems, expandedChains, rowHeight, allTokensFlat]);

  // Sync refs so filter callbacks can read latest values without stale closure issues
  flatItemsRef.current = flatItems;
  itemOffsetsRef.current = itemOffsets;

  // Scroll virtual list to bring the highlighted token into view
  useLayoutEffect(() => {
    if (!highlightedToken || viewMode !== 'tree' || !virtualListRef.current) return;
    const idx = flatItems.findIndex(item => item.node.path === highlightedToken);
    if (idx < 0) return;
    const containerH = virtualListRef.current.clientHeight;
    const targetScrollTop = Math.max(0, itemOffsets[idx] - containerH / 2 + rowHeight / 2);
    virtualListRef.current.scrollTop = targetScrollTop;
    setVirtualScrollTop(targetScrollTop);
  }, [highlightedToken, flatItems, itemOffsets, viewMode, rowHeight, virtualListRef]);

  // Restore scroll anchor after filter changes so the first visible item stays visible
  useLayoutEffect(() => {
    if (!isFilterChangeRef.current) return;
    isFilterChangeRef.current = false;
    const anchorPath = scrollAnchorPathRef.current;
    scrollAnchorPathRef.current = null;
    if (!virtualListRef.current) return;
    if (anchorPath) {
      const idx = flatItems.findIndex(item => item.node.path === anchorPath);
      if (idx >= 0) {
        const targetScrollTop = itemOffsets[idx];
        virtualListRef.current.scrollTop = targetScrollTop;
        setVirtualScrollTop(targetScrollTop);
        return;
      }
    }
    // Anchor not in filtered list — scroll to top of results
    virtualListRef.current.scrollTop = 0;
    setVirtualScrollTop(0);
  }, [flatItems, itemOffsets, isFilterChangeRef, scrollAnchorPathRef, virtualListRef]);

  // Scroll the virtual list to a group header row
  const handleJumpToGroup = useCallback((groupPath: string) => {
    const idx = flatItems.findIndex(item => item.node.path === groupPath);
    if (idx >= 0 && virtualListRef.current) {
      const targetScrollTop = Math.max(0, itemOffsets[idx]);
      virtualListRef.current.scrollTop = targetScrollTop;
      setVirtualScrollTop(targetScrollTop);
    }
  }, [flatItems, itemOffsets, virtualListRef]);

  const handleTabToNext = useCallback((currentPath: string, columnId: string | null, direction: 1 | -1) => {
    const items = flatItemsRef.current;
    const offsets = itemOffsetsRef.current;
    const leafItems = items.filter(i => !(i.node as TokenNode).isGroup);
    const currentIdx = leafItems.findIndex(i => i.node.path === currentPath);
    if (currentIdx === -1) return;
    const nextIdx = currentIdx + direction;
    if (nextIdx < 0 || nextIdx >= leafItems.length) return;
    const nextPath = leafItems[nextIdx].node.path;
    // Scroll into view if needed
    const globalIdx = items.findIndex(i => i.node.path === nextPath);
    if (globalIdx >= 0 && virtualListRef.current) {
      const containerH = virtualListRef.current.clientHeight;
      const itemTop = offsets[globalIdx];
      const itemBottom = offsets[globalIdx + 1] ?? itemTop + 24;
      const scrollTop = virtualListRef.current.scrollTop;
      if (itemTop < scrollTop) {
        virtualListRef.current.scrollTop = itemTop;
        setVirtualScrollTop(itemTop);
      } else if (itemBottom > scrollTop + containerH) {
        const newTop = itemBottom - containerH;
        virtualListRef.current.scrollTop = newTop;
        setVirtualScrollTop(newTop);
      }
    }
    setPendingTabEdit({ path: nextPath, columnId });
  }, [flatItemsRef, itemOffsetsRef, virtualListRef]);

  return {
    virtualScrollTop,
    setVirtualScrollTop,
    flatItems,
    itemOffsets,
    pendingTabEdit,
    setPendingTabEdit,
    handleClearPendingTabEdit,
    handleJumpToGroup,
    handleTabToNext,
  };
}
