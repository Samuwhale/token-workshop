import type { ReactNode } from 'react';
import { LONG_TEXT_CLASSES } from '../../shared/longTextStyles';
import { AUTHORING } from '../../shared/editorClasses';
import { PREVIEW_MAX, formatBatchValue } from './transforms';

export function PreviewPath({ path, className }: { path: string; className?: string }) {
  return (
    <span className={`${LONG_TEXT_CLASSES.monoTertiary}${className ? ` ${className}` : ''}`} title={path}>
      {path}
    </span>
  );
}

export function PreviewCard({
  children,
  count,
  expanded,
  onToggleExpand,
  label,
}: {
  children: ReactNode;
  count: number;
  expanded?: boolean;
  onToggleExpand?: () => void;
  label?: string;
}) {
  return (
    <div className={AUTHORING.previewCard}>
      {label && (
        <div className="text-secondary font-medium text-[var(--color-figma-text-secondary)] pb-0.5">
          {label}
        </div>
      )}
      {children}
      {count > PREVIEW_MAX && onToggleExpand && (
        <button
          type="button"
          onClick={onToggleExpand}
          className="text-secondary text-[var(--color-figma-accent)] hover:underline text-left"
        >
          {expanded ? 'Show less' : `and ${count - PREVIEW_MAX} more…`}
        </button>
      )}
    </div>
  );
}

export function ValueTransition({ from, to }: { from: unknown; to: unknown }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className={LONG_TEXT_CLASSES.monoSecondary}>{formatBatchValue(from)}</span>
      <span className="text-[var(--color-figma-text-tertiary)] shrink-0">→</span>
      <span className={`${LONG_TEXT_CLASSES.monoPrimary} font-medium`}>{formatBatchValue(to)}</span>
    </div>
  );
}

export function ColorTransition({ from, to }: { from: unknown; to: unknown }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span
        className="w-3 h-3 rounded-sm shrink-0 border border-[var(--color-figma-border)]"
        style={{ backgroundColor: String(from) }}
        title={String(from)}
      />
      <span className="text-[var(--color-figma-text-tertiary)] shrink-0">→</span>
      <span
        className="w-3 h-3 rounded-sm shrink-0 border border-[var(--color-figma-border)]"
        style={{ backgroundColor: String(to) }}
        title={String(to)}
      />
      <span className={`${LONG_TEXT_CLASSES.monoPrimary} font-medium`}>{String(to)}</span>
    </div>
  );
}

export function ActionFeedback({ feedback }: { feedback: { ok: boolean; msg: string } | null }) {
  if (!feedback) return null;
  return (
    <span className={feedback.ok ? 'text-[var(--color-figma-text-secondary)]' : 'text-[var(--color-figma-error)]'}>
      {feedback.msg}
    </span>
  );
}
