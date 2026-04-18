import { severityStyles } from './noticeSystem';
import type { NoticeSeverity } from './noticeSystem';
import { LONG_TEXT_CLASSES } from './longTextStyles';

/**
 * Unified authoring surface classes for all token/recipe creation and editing screens.
 * Single source of truth for form controls, labels, sections, summaries, and footer buttons.
 */
export const AUTHORING = {
  // --- Controls ---
  /** Width-free input base — use when the parent controls width (e.g. flex-1, w-16) */
  inputBase:
    'min-h-[28px] px-2 py-1.5 rounded-md bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)]',
  input:
    'w-full min-h-[28px] px-2 py-1.5 rounded-md bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)]',
  inputMono:
    'w-full min-h-[28px] px-2 py-1.5 rounded-md bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] font-mono focus-visible:border-[var(--color-figma-accent)]',
  /** Width-free mono input base — use when the parent controls width */
  inputMonoBase:
    'min-h-[28px] px-2 py-1.5 rounded-md bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] font-mono focus-visible:border-[var(--color-figma-accent)]',
  select:
    'w-full min-h-[28px] px-2 py-1.5 rounded-md bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)]',

  // --- Labels ---
  label: 'text-[10px] font-medium text-[var(--color-figma-text-secondary)]',

  // --- Layout ---
  fieldStack: 'flex flex-col gap-1',
  section: 'flex flex-col gap-2',
  sectionCard:
    'flex flex-col gap-2 border-t border-[var(--color-figma-border)] pt-3',

  // --- Title blocks ---
  titleBlock: 'flex flex-col gap-1',
  title: 'text-[11px] font-semibold text-[var(--color-figma-text)]',
  description: 'text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]',

  // --- Summary cards ---
  summaryCard:
    'flex flex-col gap-1.5 pl-3 py-0.5 min-w-0',
  summaryRow:
    'flex flex-wrap items-start gap-x-2 gap-y-1 text-[10px] text-[var(--color-figma-text-secondary)]',
  summaryLabel:
    'shrink-0 font-medium text-[var(--color-figma-text-secondary)]',
  summaryValue: LONG_TEXT_CLASSES.textPrimary,
  summaryMono: LONG_TEXT_CLASSES.monoPrimary,

  // --- Footer buttons ---
  footerBtnSecondary:
    'px-3 py-1.5 rounded-md text-[11px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] transition-colors',
  footerBtnPrimary:
    'w-full px-3 py-1.5 rounded-md bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors',

  // --- Feedback ---
  error: 'text-[10px] text-[var(--color-figma-error)] break-words',

  // --- Footer links ---
  footerLink:
    'text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors',

  // --- Preview ---
  /** Compact preview container for before/after grids and similar lists */
  previewCard:
    'rounded-md border border-[var(--color-figma-border)]/80 bg-[var(--color-figma-bg)] px-2 py-1.5 space-y-1',
  /** Larger preview container for visual previews (color ramps, dimension bars, etc.) */
  previewSurface:
    'rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] p-2.5',

  // --- Recipe authoring (CSS-class based for container-query responsive grids) ---
  /** Root wrapper — sets up container query context. Apply on the outermost recipe content element. */
  recipeRoot: 'tm-recipe-authoring',
  recipeSection: 'tm-recipe-authoring__section',
  recipeSectionCard: 'tm-recipe-authoring__section-card',
  recipeTitleBlock: 'tm-recipe-authoring__title-block',
  recipeTitle: 'tm-recipe-authoring__title',
  recipeDescription: 'tm-recipe-authoring__description',
  recipeFieldStack: 'tm-recipe-authoring__field-stack',
  recipeFieldGrid: 'tm-recipe-authoring__field-grid',
  recipeButtonGrid: 'tm-recipe-authoring__button-grid',
  recipeControl: 'tm-recipe-authoring__control',
  recipeControlMono: 'tm-recipe-authoring__control tm-recipe-authoring__control--mono',
  recipeSummaryCard: 'tm-recipe-authoring__summary-card',
  recipeSummaryRow: 'tm-recipe-authoring__summary-row',
  recipeSummaryLabel: 'tm-recipe-authoring__summary-label',
  recipeSummaryValue: 'tm-recipe-authoring__summary-value',
  recipeSummaryMono: 'tm-recipe-authoring__summary-mono',
  recipeMetricGrid: 'tm-recipe-authoring__metric-grid',
  recipeMetricCard: 'tm-recipe-authoring__metric-card',
  recipeMetricValue: 'tm-recipe-authoring__metric-value',
  recipeCardList: 'tm-recipe-authoring__card-list',
} as const;

// Backward-compatible aliases — used by 26+ value editor files
export const inputClass = AUTHORING.input;
export const labelClass = AUTHORING.label;

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
