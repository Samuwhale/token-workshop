import React from 'react';

/**
 * Base skeleton block — a pulsing placeholder rectangle.
 * Use `className` to set width, height, and rounding.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-[var(--color-figma-border)] ${className ?? ''}`}
      aria-hidden="true"
    />
  );
}

/** Single text-line placeholder. `width` defaults to full width. */
export function SkeletonLine({ className }: { className?: string }) {
  return <Skeleton className={`h-[10px] ${className ?? 'w-full'}`} />;
}

/**
 * Skeleton for a timeline row (HistoryPanel style):
 * colored dot | title line | timestamp line
 */
export function SkeletonTimelineRow({ titleWidth = 'w-2/3' }: { titleWidth?: string }) {
  return (
    <div className="flex items-start gap-2 px-3 py-[7px]" aria-hidden="true">
      {/* type dot */}
      <div className="w-2 h-2 mt-0.5 shrink-0 rounded-full animate-pulse bg-[var(--color-figma-border)]" />
      <div className="flex-1 flex flex-col gap-1.5 min-w-0">
        <SkeletonLine className={titleWidth} />
        <SkeletonLine className="w-1/4 h-[8px]" />
      </div>
    </div>
  );
}

/**
 * Skeleton for an import list row (ImportPanel style):
 * icon | name | type badge
 */
export function SkeletonImportRow({ nameWidth = 'w-1/2' }: { nameWidth?: string }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5" aria-hidden="true">
      <Skeleton className="h-3 w-3 rounded shrink-0" />
      <SkeletonLine className={`flex-1 ${nameWidth}`} />
      <Skeleton className="h-[14px] w-10 rounded shrink-0" />
    </div>
  );
}

/**
 * Skeleton for a token flow / dependency graph row:
 * node block — arrow — node block
 */
export function SkeletonFlowRow({ wide = false }: { wide?: boolean }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2" aria-hidden="true">
      <Skeleton className={`h-[22px] rounded ${wide ? 'w-28' : 'w-20'}`} />
      <Skeleton className="h-[6px] w-6 rounded-full" />
      <Skeleton className="h-[22px] flex-1 rounded" />
    </div>
  );
}
