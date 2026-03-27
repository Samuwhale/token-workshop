import { useState, useRef, useCallback } from 'react';
import type React from 'react';
import { STORAGE_KEYS, lsGet, lsSet } from '../shared/storage';

export function usePreviewSplit() {
  const [showPreviewSplit, setShowPreviewSplitState] = useState(() => lsGet(STORAGE_KEYS.PREVIEW_SPLIT) === '1');
  const setShowPreviewSplit = useCallback((v: boolean | ((prev: boolean) => boolean)) => {
    setShowPreviewSplitState(prev => {
      const next = typeof v === 'function' ? v(prev) : v;
      lsSet(STORAGE_KEYS.PREVIEW_SPLIT, next ? '1' : '0');
      return next;
    });
  }, []);
  const [splitRatio, setSplitRatioState] = useState(() => {
    const s = lsGet(STORAGE_KEYS.PREVIEW_SPLIT_RATIO);
    const n = s ? parseFloat(s) : 0.5;
    return isNaN(n) ? 0.5 : Math.max(0.2, Math.min(0.8, n));
  });
  const splitRatioRef = useRef(splitRatio);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const handleSplitDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const container = splitContainerRef.current;
    if (!container) return;
    const onMove = (me: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const ratio = Math.max(0.2, Math.min(0.8, (me.clientY - rect.top) / rect.height));
      splitRatioRef.current = ratio;
      setSplitRatioState(ratio);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      lsSet(STORAGE_KEYS.PREVIEW_SPLIT_RATIO, String(splitRatioRef.current));
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  return { showPreviewSplit, setShowPreviewSplit, splitRatio, splitContainerRef, handleSplitDragStart };
}
