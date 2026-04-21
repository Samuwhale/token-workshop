import type React from 'react';
import type { ResizeAxis } from '../hooks/useResizableBoundary';

interface ResizeDividerProps {
  axis: ResizeAxis;
  ariaLabel: string;
  ariaValueNow: number;
  ariaValueMin?: number;
  ariaValueMax?: number;
  onMouseDown: (e: React.MouseEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

export function ResizeDivider({
  axis,
  ariaLabel,
  ariaValueNow,
  ariaValueMin = 0,
  ariaValueMax = 100,
  onMouseDown,
  onKeyDown,
}: ResizeDividerProps) {
  const isVertical = axis === 'y';
  const base =
    'flex-shrink-0 bg-[var(--color-figma-border)] hover:bg-[var(--color-figma-accent)] focus-visible:bg-[var(--color-figma-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-figma-accent)] transition-colors';
  const orientation = isVertical
    ? 'h-1 w-full cursor-row-resize'
    : 'w-1 h-full cursor-col-resize';
  return (
    <div
      role="separator"
      aria-orientation={isVertical ? 'horizontal' : 'vertical'}
      aria-valuenow={ariaValueNow}
      aria-valuemin={ariaValueMin}
      aria-valuemax={ariaValueMax}
      aria-label={ariaLabel}
      tabIndex={0}
      className={`${orientation} ${base}`}
      onMouseDown={onMouseDown}
      onKeyDown={onKeyDown}
    />
  );
}
