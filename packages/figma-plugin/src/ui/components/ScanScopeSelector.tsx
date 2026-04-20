import type { ScanScope } from '../../shared/types';

const OPTIONS: { value: ScanScope; label: string }[] = [
  { value: 'page', label: 'Page' },
  { value: 'selection', label: 'Selection' },
  { value: 'all-pages', label: 'All pages' },
];

interface ScanScopeSelectorProps {
  value: ScanScope;
  onChange: (scope: ScanScope) => void;
  /** When true, wraps the button group with a "Scope:" label. Default: false. */
  showLabel?: boolean;
}

/**
 * Segmented button group for selecting a scan scope (page / selection / all-pages).
 * Used in CanvasAnalysisPanel's shared toolbar and by individual panels when
 * standalone (not nested inside CanvasAnalysisPanel).
 */
export function ScanScopeSelector({ value, onChange, showLabel = false }: ScanScopeSelectorProps) {
  const buttons = (
    <div className="flex rounded overflow-hidden border border-[var(--color-figma-border)] text-secondary">
      {OPTIONS.map(({ value: s, label }) => (
        <button
          key={s}
          onClick={() => onChange(s)}
          className={`px-2 py-1 transition-colors ${
            value === s
              ? 'bg-[var(--color-figma-accent)] text-white'
              : 'bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'
          }`}
          aria-pressed={value === s}
        >
          {label}
        </button>
      ))}
    </div>
  );

  if (!showLabel) return buttons;

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-secondary text-[var(--color-figma-text-secondary)] shrink-0">Scope:</span>
      {buttons}
    </div>
  );
}
