import { useState, useRef, useCallback, useEffect } from 'react';
import type React from 'react';
import { STORAGE_KEYS, lsGet, lsSet } from '../shared/storage';

const SPLIT_MIN = 0.2;
const SPLIT_MAX = 0.8;
const KEYBOARD_STEP = 0.02;

function clampRatio(n: number): number {
  return Math.max(SPLIT_MIN, Math.min(SPLIT_MAX, n));
}

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
    return isNaN(n) ? 0.5 : clampRatio(n);
  });
  const splitRatioRef = useRef(splitRatio);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    splitRatioRef.current = splitRatio;
  }, [splitRatio]);

  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
    };
  }, []);

  const handleSplitDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const container = splitContainerRef.current;
    if (!container) return;
    dragCleanupRef.current?.();
    const onMove = (me: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      if (rect.height <= 0) {
        return;
      }
      const ratio = clampRatio((me.clientY - rect.top) / rect.height);
      splitRatioRef.current = ratio;
      setSplitRatioState(ratio);
    };
    const detach = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (dragCleanupRef.current === detach) {
        dragCleanupRef.current = null;
      }
    };
    const onUp = () => {
      detach();
      lsSet(STORAGE_KEYS.PREVIEW_SPLIT_RATIO, String(splitRatioRef.current));
    };
    dragCleanupRef.current = detach;
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  const handleSplitKeyDown = useCallback((e: React.KeyboardEvent) => {
    let delta = 0;
    if (e.key === 'ArrowUp' || e.key === 'Up') delta = -KEYBOARD_STEP;
    else if (e.key === 'ArrowDown' || e.key === 'Down') delta = KEYBOARD_STEP;
    else if (e.key === 'Home') { delta = SPLIT_MIN - splitRatioRef.current; }
    else if (e.key === 'End') { delta = SPLIT_MAX - splitRatioRef.current; }
    else return;
    e.preventDefault();
    const ratio = clampRatio(splitRatioRef.current + delta);
    splitRatioRef.current = ratio;
    setSplitRatioState(ratio);
    lsSet(STORAGE_KEYS.PREVIEW_SPLIT_RATIO, String(ratio));
  }, []);

  const splitValueNow = Math.round(splitRatio * 100);

  return { showPreviewSplit, setShowPreviewSplit, splitRatio, splitValueNow, splitContainerRef, handleSplitDragStart, handleSplitKeyDown };
}
