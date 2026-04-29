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
    'group relative z-[1] flex-shrink-0 bg-transparent outline-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-figma-accent)]';
  const orientation = isVertical
    ? '-my-1 h-3 w-full cursor-row-resize'
    : '-mx-1 h-full w-3 cursor-col-resize';
  const railClass = isVertical
    ? 'h-px w-full'
    : 'h-full w-px';
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
    >
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span
          aria-hidden="true"
          className={`${railClass} rounded-full bg-[var(--color-figma-border)] transition-colors group-hover:bg-[var(--color-figma-accent)] group-focus-visible:bg-[var(--color-figma-accent)]`}
        />
      </span>
    </div>
  );
}
