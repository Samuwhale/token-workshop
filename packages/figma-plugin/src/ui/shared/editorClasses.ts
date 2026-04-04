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
  if (hasError) return 'border-[var(--color-figma-error)] focus-visible:border-[var(--color-figma-error)]';
  if (hasWarning) return 'border-amber-400 focus-visible:border-amber-400';
  return 'border-[var(--color-figma-border)] focus-visible:border-[var(--color-figma-accent)]';
}
