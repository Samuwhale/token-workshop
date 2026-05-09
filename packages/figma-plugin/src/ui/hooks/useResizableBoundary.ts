import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { lsGet, lsSet } from '../shared/storage';

export type ResizeAxis = 'x' | 'y';
export type ResizeMode = 'px' | 'ratio';

interface SnapRule {
  below: number;
  to: number;
}

interface UseResizableBoundaryOptions {
  storageKey: string;
  defaultSize: number;
  min: number;
  max: number;
  axis: ResizeAxis;
  mode: ResizeMode;
  /** Pixel step per arrow-key press (for `px` mode) or ratio step (for `ratio` mode). */
  keyboardStep?: number;
  /** When dragging past `below` in px mode, commit `to` as the value (e.g. snap to collapsed). */
  snap?: SnapRule;
  /**
   * Controls which edge of the container the pointer position is measured against.
   * 'start' means position is measured from the container's start (left for x, top for y) —
   * use this when the resized pane is the FIRST child in the container.
   * 'end' means distance from the container's end — use when the resized pane is the LAST child.
   */
  measureFrom?: 'start' | 'end';
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function readInitial(storageKey: string, defaultSize: number, min: number, max: number): number {
  const raw = lsGet(storageKey);
  if (raw === null) return defaultSize;
  const n = parseFloat(raw);
  if (Number.isNaN(n)) return defaultSize;
  return clamp(n, min, max);
}

function pointerRatioWithinRect(rect: DOMRect, axis: ResizeAxis, measureFrom: 'start' | 'end', event: MouseEvent): number {
  const length = axis === 'x' ? rect.width : rect.height;
  if (length <= 0) return 0;

  const pointer = axis === 'x' ? event.clientX : event.clientY;
  const start = axis === 'x' ? rect.left : rect.top;
  const end = axis === 'x' ? rect.right : rect.bottom;
  const distance = measureFrom === 'start' ? pointer - start : end - pointer;
  return distance / length;
}

export interface ResizableBoundary {
  /** Current size (px when mode === 'px', ratio 0..1 when mode === 'ratio'). */
  size: number;
  /** Ref to attach to the container whose dimensions drive ratio calculations (ratio mode only). */
  containerRef: React.RefObject<HTMLDivElement>;
  /** Mouse-down handler for the divider element. */
  onMouseDown: (e: React.MouseEvent) => void;
  /** Key-down handler for the divider element. Arrow keys nudge, Home/End jump to min/max. */
  onKeyDown: (e: React.KeyboardEvent) => void;
  /** Percentage (0..100) for aria-valuenow. */
  ariaValueNow: number;
  /** True while a pointer drag is in progress — useful to suppress CSS transitions. */
  isDragging: boolean;
  /** Imperatively set size (clamped, persisted). */
  setSize: (next: number) => void;
}

export function useResizableBoundary(options: UseResizableBoundaryOptions): ResizableBoundary {
  const {
    storageKey,
    defaultSize,
    min,
    max,
    axis,
    mode,
    keyboardStep,
    snap,
    measureFrom = 'start',
  } = options;

  const step = keyboardStep ?? (mode === 'ratio' ? 0.02 : 16);

  const [size, setSizeState] = useState<number>(() => readInitial(storageKey, defaultSize, min, max));
  const [isDragging, setIsDragging] = useState(false);
  const sizeRef = useRef(size);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    sizeRef.current = size;
  }, [size]);

  useEffect(() => () => {
    dragCleanupRef.current?.();
  }, []);

  const commit = useCallback((next: number) => {
    const clamped = clamp(next, min, max);
    const finalValue = snap && clamped < snap.below ? snap.to : clamped;
    sizeRef.current = finalValue;
    setSizeState(finalValue);
    return finalValue;
  }, [min, max, snap]);

  const setSize = useCallback((next: number) => {
    const finalValue = commit(next);
    lsSet(storageKey, String(finalValue));
  }, [commit, storageKey]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (mode === 'ratio' && !container) return;
    dragCleanupRef.current?.();

    const startRect = container?.getBoundingClientRect();
    const startSize = sizeRef.current;
    const startClient = axis === 'x' ? e.clientX : e.clientY;

    const onMove = (me: MouseEvent) => {
      if (mode === 'ratio') {
        if (!startRect) return;
        commit(pointerRatioWithinRect(startRect, axis, measureFrom, me));
      } else {
        const pointer = axis === 'x' ? me.clientX : me.clientY;
        const delta = pointer - startClient;
        const raw = measureFrom === 'start' ? startSize + delta : startSize - delta;
        commit(raw);
      }
    };
    const detach = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setIsDragging(false);
      if (dragCleanupRef.current === detach) {
        dragCleanupRef.current = null;
      }
    };
    const onUp = () => {
      detach();
      lsSet(storageKey, String(sizeRef.current));
    };
    dragCleanupRef.current = detach;
    setIsDragging(true);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [axis, mode, measureFrom, commit, storageKey]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    const forward = axis === 'x' ? 'ArrowRight' : 'ArrowDown';
    const backward = axis === 'x' ? 'ArrowLeft' : 'ArrowUp';
    let delta = 0;
    if (e.key === forward) delta = step;
    else if (e.key === backward) delta = -step;
    else if (e.key === 'Home') delta = min - sizeRef.current;
    else if (e.key === 'End') delta = max - sizeRef.current;
    else return;
    e.preventDefault();
    setSize(sizeRef.current + delta);
  }, [axis, step, min, max, setSize]);

  const ariaValueNow = useMemo(() => {
    if (mode === 'ratio') return Math.round(size * 100);
    const span = max - min;
    if (span <= 0) return 0;
    return Math.round(((size - min) / span) * 100);
  }, [size, mode, min, max]);

  return { size, containerRef, onMouseDown, onKeyDown, ariaValueNow, isDragging, setSize };
}
