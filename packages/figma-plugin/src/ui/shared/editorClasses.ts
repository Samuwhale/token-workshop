import { severityStyles } from './noticeSystem';
import type { NoticeSeverity } from './noticeSystem';

export const inputClass = 'w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)]';
export const labelClass = 'text-[10px] text-[var(--color-figma-text-secondary)] mb-0.5';

/**
 * Returns the border + focus-visible border classes for a form field based on
 * its validation state.  Use in combination with the base `inputClass` constant:
 *
 *   className={`${inputClass} ${fieldBorderClass(!!error, !!warning)}`}
 *
 * Note: `inputClass` already contains `border-[var(--color-figma-border)]` and
 * `focus-visible:border-[var(--color-figma-accent)]` which this function
 * overrides when the field is in an error or warning state.
 */
export function fieldBorderClass(hasError?: boolean, hasWarning?: boolean): string {
  if (hasError) return severityStyles('error').fieldBorder;
  if (hasWarning) return severityStyles('warning').fieldBorder;
  return 'border-[var(--color-figma-border)] focus-visible:border-[var(--color-figma-accent)]';
}

/**
 * Same as `fieldBorderClass` but accepts a `NoticeSeverity` directly instead
 * of boolean flags, for callers that already know the active severity.
 */
export function fieldBorderClassForSeverity(severity?: NoticeSeverity): string {
  if (!severity) return 'border-[var(--color-figma-border)] focus-visible:border-[var(--color-figma-accent)]';
  const border = severityStyles(severity).fieldBorder;
  return border || 'border-[var(--color-figma-border)] focus-visible:border-[var(--color-figma-accent)]';
}
