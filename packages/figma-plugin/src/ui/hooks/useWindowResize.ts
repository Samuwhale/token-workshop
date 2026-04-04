import { useRef, useCallback } from 'react';

const RESIZE_MIN_W = 320;
const RESIZE_MIN_H = 400;
const RESIZE_MAX_W = 1200;
const RESIZE_MAX_H = 1000;

export function useWindowResize() {
  const dragState = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      startW: window.innerWidth,
      startH: window.innerHeight,
    };

    const onMove = (ev: MouseEvent) => {
      if (!dragState.current) return;
      const { startX, startY, startW, startH } = dragState.current;
      const w = Math.min(RESIZE_MAX_W, Math.max(RESIZE_MIN_W, startW + (ev.clientX - startX)));
      const h = Math.min(RESIZE_MAX_H, Math.max(RESIZE_MIN_H, startH + (ev.clientY - startY)));
      parent.postMessage({ pluginMessage: { type: 'resize', width: Math.round(w), height: Math.round(h) } }, '*');
    };

    const onUp = () => {
      dragState.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  return onMouseDown;
}
