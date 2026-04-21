import { useCallback, useState } from 'react';
import { STORAGE_KEYS, lsGet, lsSet } from '../shared/storage';
import { useResizableBoundary } from './useResizableBoundary';

export function usePreviewSplit() {
  const [showPreviewSplit, setShowPreviewSplitState] = useState(() => lsGet(STORAGE_KEYS.PREVIEW_SPLIT) === '1');
  const setShowPreviewSplit = useCallback((v: boolean | ((prev: boolean) => boolean)) => {
    setShowPreviewSplitState(prev => {
      const next = typeof v === 'function' ? v(prev) : v;
      lsSet(STORAGE_KEYS.PREVIEW_SPLIT, next ? '1' : '0');
      return next;
    });
  }, []);

  const boundary = useResizableBoundary({
    storageKey: STORAGE_KEYS.PREVIEW_SPLIT_RATIO,
    defaultSize: 0.5,
    min: 0.2,
    max: 0.8,
    axis: 'y',
    mode: 'ratio',
  });

  return {
    showPreviewSplit,
    setShowPreviewSplit,
    splitRatio: boundary.size,
    splitValueNow: boundary.ariaValueNow,
    splitContainerRef: boundary.containerRef,
    handleSplitDragStart: boundary.onMouseDown,
    handleSplitKeyDown: boundary.onKeyDown,
  };
}
