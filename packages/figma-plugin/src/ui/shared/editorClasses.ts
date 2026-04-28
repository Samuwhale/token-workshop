import { severityStyles } from './noticeSystem';
import { LONG_TEXT_CLASSES } from './longTextStyles';

/**
 * Unified authoring surface classes for all token/generator creation and editing screens.
 * Single source of truth for form controls, labels, sections, summaries, and footer buttons.
 */
export const AUTHORING = {
  // --- Controls ---
  /** Width-free input base — use when the parent controls width (e.g. flex-1, w-16) */
  inputBase:
    'min-h-[28px] px-2 py-1.5 rounded-md bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-body focus-visible:border-[var(--color-figma-accent)]',
  input:
    'w-full min-h-[28px] px-2 py-1.5 rounded-md bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-body focus-visible:border-[var(--color-figma-accent)]',
  inputMono:
    'w-full min-h-[28px] px-2 py-1.5 rounded-md bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-body font-mono focus-visible:border-[var(--color-figma-accent)]',
  /** Width-free mono input base — use when the parent controls width */
  inputMonoBase:
    'min-h-[28px] px-2 py-1.5 rounded-md bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-body font-mono focus-visible:border-[var(--color-figma-accent)]',
  select:
    'w-full min-h-[28px] px-2 py-1.5 rounded-md bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-body focus-visible:border-[var(--color-figma-accent)]',

  // --- Labels ---
  label: 'text-secondary font-medium text-[var(--color-figma-text-secondary)]',

  // --- Layout ---
  fieldStack: 'flex flex-col gap-1',
  section: 'flex flex-col gap-2',
  sectionCard:
    'flex flex-col gap-2 border-t border-[var(--color-figma-border)] pt-3',

  // --- Title blocks ---
  titleBlock: 'flex flex-col gap-1',
  title: 'text-body font-semibold text-[var(--color-figma-text)]',
  description: 'text-secondary leading-relaxed text-[var(--color-figma-text-secondary)]',

  // --- Summary cards ---
  summaryCard:
    'flex flex-col gap-1.5 pl-3 py-0.5 min-w-0',
  summaryRow:
    'flex flex-wrap items-start gap-x-2 gap-y-1 text-secondary text-[var(--color-figma-text-secondary)]',
  summaryLabel:
    'shrink-0 font-medium text-[var(--color-figma-text-secondary)]',
  summaryValue: LONG_TEXT_CLASSES.textPrimary,
  summaryMono: LONG_TEXT_CLASSES.monoPrimary,

  // --- Footer buttons ---
  footerBtnSecondary:
    'px-3 py-1.5 rounded-md text-body text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] transition-colors',
  footerBtnPrimary:
    'w-full px-3 py-1.5 rounded-md bg-[var(--color-figma-accent)] text-white text-body font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50 transition-colors',

  // --- Feedback ---
  error: 'text-secondary text-[var(--color-figma-error)] break-words',

  // --- Footer links ---
  footerLink:
    'text-secondary text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors',

  // --- Preview ---
  /** Compact preview container for before/after grids and similar lists */
  previewCard:
    'rounded-md border border-[var(--color-figma-border)]/80 bg-[var(--color-figma-bg)] px-2 py-1.5 space-y-1',
  /** Larger preview container for visual previews (color ramps, dimension bars, etc.) */
  previewSurface:
    'rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] p-2.5',

} as const;

const DEFAULT_FIELD_BORDER_CLASS =
  'border-[var(--color-figma-border)] focus-visible:border-[var(--color-figma-accent)]';

/**
 * Returns the border + focus-visible border classes for a form field based on
 * its validation state. Use with the canonical AUTHORING input styles:
 *
 *   className={`${AUTHORING.input} ${fieldBorderClass(!!error, !!warning)}`}
 */
export function fieldBorderClass(hasError?: boolean, hasWarning?: boolean): string {
  if (hasError) return severityStyles('error').fieldBorder;
  if (hasWarning) return severityStyles('warning').fieldBorder;
  return DEFAULT_FIELD_BORDER_CLASS;
}
