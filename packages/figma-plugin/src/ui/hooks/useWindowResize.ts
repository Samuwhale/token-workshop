import { useRef, useCallback, useEffect } from 'react';
import { postPluginMessage } from '../../shared/utils';

const RESIZE_MIN_W = 720;
const RESIZE_MIN_H = 520;
const RESIZE_MAX_W = 1500;
const RESIZE_MAX_H = 1000;

export function useWindowResize() {
  const dragState = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);
  const moveHandlerRef = useRef<((event: MouseEvent) => void) | null>(null);
  const upHandlerRef = useRef<(() => void) | null>(null);

  const detachListeners = useCallback(() => {
    if (moveHandlerRef.current) {
      document.removeEventListener('mousemove', moveHandlerRef.current);
      moveHandlerRef.current = null;
    }
    if (upHandlerRef.current) {
      document.removeEventListener('mouseup', upHandlerRef.current);
      upHandlerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      dragState.current = null;
      detachListeners();
    };
  }, [detachListeners]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    detachListeners();
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
      postPluginMessage({ type: 'resize', width: Math.round(w), height: Math.round(h) });
    };

    const onUp = () => {
      dragState.current = null;
      detachListeners();
    };

    moveHandlerRef.current = onMove;
    upHandlerRef.current = onUp;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [detachListeners]);

  return onMouseDown;
}
