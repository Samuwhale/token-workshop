import { severityStyles } from './noticeSystem';
import { LONG_TEXT_CLASSES } from './longTextStyles';
import {
  CONTROL_DISABLED_CLASSES,
  CONTROL_FOCUS_ACCENT,
  CONTROL_INPUT_BASE_CLASSES,
  CONTROL_INPUT_DEFAULT_STATE_CLASSES,
} from './controlClasses';

/**
 * Unified authoring surface classes for all token/generator creation and editing screens.
 * Single source of truth for form controls, labels, sections, summaries, and footer buttons.
 */
export const AUTHORING = {
  // --- Controls ---
  /** Width-free input base — use when the parent controls width (e.g. flex-1, w-16) */
  inputBase:
    `min-h-[28px] px-2 py-1.5 ${CONTROL_INPUT_BASE_CLASSES} ${CONTROL_INPUT_DEFAULT_STATE_CLASSES} ${CONTROL_DISABLED_CLASSES}`,
  input:
    `w-full min-h-[28px] px-2 py-1.5 ${CONTROL_INPUT_BASE_CLASSES} ${CONTROL_INPUT_DEFAULT_STATE_CLASSES} ${CONTROL_DISABLED_CLASSES}`,
  inputMono:
    `w-full min-h-[28px] px-2 py-1.5 font-mono ${CONTROL_INPUT_BASE_CLASSES} ${CONTROL_INPUT_DEFAULT_STATE_CLASSES} ${CONTROL_DISABLED_CLASSES}`,
  /** Width-free mono input base — use when the parent controls width */
  inputMonoBase:
    `min-h-[28px] px-2 py-1.5 font-mono ${CONTROL_INPUT_BASE_CLASSES} ${CONTROL_INPUT_DEFAULT_STATE_CLASSES} ${CONTROL_DISABLED_CLASSES}`,
  select:
    `w-full min-h-[28px] px-2 py-1.5 ${CONTROL_INPUT_BASE_CLASSES} ${CONTROL_INPUT_DEFAULT_STATE_CLASSES} ${CONTROL_DISABLED_CLASSES}`,

  // --- Labels ---
  label: 'text-secondary font-medium text-[color:var(--color-figma-text-secondary)]',

  // --- Layout ---
  fieldStack: 'flex flex-col gap-1',
  section: 'flex flex-col gap-2',
  sectionCard:
    'flex flex-col gap-2 border-t border-[var(--color-figma-border)] pt-3',

  // --- Title blocks ---
  titleBlock: 'flex flex-col gap-1',
  title: 'text-body font-semibold text-[color:var(--color-figma-text)]',
  description: 'text-secondary leading-relaxed text-[color:var(--color-figma-text-secondary)]',

  // --- Summary cards ---
  summaryCard:
    'flex flex-col gap-1.5 pl-3 py-0.5 min-w-0',
  summaryRow:
    'flex flex-wrap items-start gap-x-2 gap-y-1 text-secondary text-[color:var(--color-figma-text-secondary)]',
  summaryLabel:
    'shrink-0 font-medium text-[color:var(--color-figma-text-secondary)]',
  summaryValue: LONG_TEXT_CLASSES.textPrimary,
  summaryMono: LONG_TEXT_CLASSES.monoPrimary,

  // --- Footer buttons ---
  footerBtnSecondary:
    `inline-flex min-h-8 min-w-0 items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-transparent px-3 py-1.5 text-body font-medium text-[color:var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[color:var(--color-figma-text)] disabled:border-transparent disabled:bg-transparent ${CONTROL_DISABLED_CLASSES} ${CONTROL_FOCUS_ACCENT}`,
  footerBtnPrimary:
    `inline-flex min-h-8 w-full min-w-0 items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-transparent bg-[var(--color-figma-action-bg)] px-3 py-1.5 text-body font-medium text-[color:var(--color-figma-text-onbrand)] transition-colors hover:bg-[var(--color-figma-action-bg-hover)] disabled:border-transparent disabled:bg-[var(--surface-group-quiet)] disabled:text-[color:var(--color-figma-text-tertiary)] ${CONTROL_FOCUS_ACCENT}`,

  // --- Feedback ---
  error: 'text-secondary text-[color:var(--color-figma-text-error)] break-words',

  // --- Footer links ---
  footerLink:
    'text-secondary text-[color:var(--color-figma-text-secondary)] hover:text-[color:var(--color-figma-text)] transition-colors',

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
