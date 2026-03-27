import { useState, useRef, useCallback } from 'react';
import type React from 'react';

export function usePreviewSplit() {
  const [showPreviewSplit, setShowPreviewSplitState] = useState(() => {
    try { return localStorage.getItem('tm_preview_split') === '1'; } catch { return false; }
  });
  const setShowPreviewSplit = useCallback((v: boolean | ((prev: boolean) => boolean)) => {
    setShowPreviewSplitState(prev => {
      const next = typeof v === 'function' ? v(prev) : v;
      try { localStorage.setItem('tm_preview_split', next ? '1' : '0'); } catch {}
      return next;
    });
  }, []);
  const [splitRatio, setSplitRatioState] = useState(() => {
    try {
      const s = localStorage.getItem('tm_preview_split_ratio');
      const n = s ? parseFloat(s) : 0.5;
      return isNaN(n) ? 0.5 : Math.max(0.2, Math.min(0.8, n));
    } catch { return 0.5; }
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
      try { localStorage.setItem('tm_preview_split_ratio', String(splitRatioRef.current)); } catch {}
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  return { showPreviewSplit, setShowPreviewSplit, splitRatio, splitContainerRef, handleSplitDragStart };
}
