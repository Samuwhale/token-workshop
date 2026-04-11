import { type ReactNode, useEffect, useState } from 'react';
import type { WorkspaceSection } from '../shared/navigationTypes';
import { shellControlClass } from '../shared/shellControlStyles';

type WorkspacePillTone = 'neutral' | 'accent' | 'warning' | 'danger' | 'success';

interface WorkspacePill {
  label: string;
  tone: WorkspacePillTone;
  /** Explicit priority (lower = more important). Defaults to tone-based ranking. */
  priority?: number;
}

const MAX_VISIBLE_PILLS = 4;

/** Default priority by tone: blocking/errors first, then actionable, then informational. */
const tonePriority: Record<WorkspacePillTone, number> = {
  danger: 0,
  warning: 1,
  accent: 2,
  success: 3,
  neutral: 4,
};

/** Pills that restate visually obvious state and should be deprioritized. */
const deprioritizedLabels = new Set([
  'Live preview open',
  'Coverage review',
  'Compare mode',
  'Resolver mode',
]);

function rankPills(pills: WorkspacePill[]): WorkspacePill[] {
  return [...pills].sort((a, b) => {
    const aDepri = deprioritizedLabels.has(a.label) ? 1 : 0;
    const bDepri = deprioritizedLabels.has(b.label) ? 1 : 0;
    if (aDepri !== bDepri) return aDepri - bDepri;
    const aPri = a.priority ?? tonePriority[a.tone];
    const bPri = b.priority ?? tonePriority[b.tone];
    return aPri - bPri;
  });
}

interface WorkspacePrimaryAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

interface WorkspaceSummaryHeaderProps {
  title: string;
  guidance: string;
  sections?: WorkspaceSection[];
  activeSectionId?: string | null;
  onSelectSection?: (section: WorkspaceSection) => void;
  statusPills: WorkspacePill[];
  primaryAction?: WorkspacePrimaryAction | null;
  contextualControls?: ReactNode;
}

const pillToneClasses: Record<WorkspacePillTone, string> = {
  neutral: 'border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)]',
  accent: 'border-[var(--color-figma-accent)]/25 bg-[var(--color-figma-accent)]/8 text-[var(--color-figma-accent)]',
  warning: 'border-amber-400/30 bg-amber-400/10 text-amber-700',
  danger: 'border-red-500/25 bg-red-500/10 text-red-500',
  success: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600',
};

export function WorkspaceSummaryHeader({
  title,
  guidance,
  sections,
  activeSectionId,
  onSelectSection,
  statusPills,
  primaryAction,
  contextualControls,
}: WorkspaceSummaryHeaderProps) {
  const hasSections = Boolean(sections && sections.length > 1);
  const hasStatus = statusPills.length > 0;

  const [overflowExpanded, setOverflowExpanded] = useState(false);

  // Collapse overflow when pills change (e.g. workspace switch)
  useEffect(() => {
    setOverflowExpanded(false);
  }, [statusPills]);

  const ranked = hasStatus ? rankPills(statusPills) : [];
  const needsOverflow = ranked.length > MAX_VISIBLE_PILLS && !overflowExpanded;
  const visiblePills = needsOverflow ? ranked.slice(0, MAX_VISIBLE_PILLS) : ranked;
  const overflowCount = ranked.length - MAX_VISIBLE_PILLS;

  return (
    <div className="border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
      <div className="flex flex-col gap-2 px-3 py-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-figma-text-tertiary)]">
              Current workspace
            </div>
            <div className="mt-1 truncate text-[13px] font-semibold text-[var(--color-figma-text)]">
              {title}
            </div>
            <div className="mt-1 text-[11px] text-[var(--color-figma-text-secondary)]">
              {guidance}
            </div>
          </div>

          {primaryAction && (
            <button
              onClick={primaryAction.onClick}
              disabled={primaryAction.disabled}
              className="shrink-0 rounded-full bg-[var(--color-figma-accent)] px-3 py-1.5 text-[10px] font-medium text-white transition-[background-color,transform,opacity,box-shadow] duration-150 ease-out outline-none hover:bg-[var(--color-figma-accent-hover)] focus-visible:ring-2 focus-visible:ring-[var(--color-figma-accent)]/35 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40"
            >
              {primaryAction.label}
            </button>
          )}
        </div>

        {(hasSections || hasStatus) && (
          <div className="flex items-center gap-3 overflow-x-auto pb-0.5">
            {hasSections && sections && onSelectSection && (
              <div
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] p-1"
                role="tablist"
                aria-label={`${title} sections`}
              >
                <span className="pl-2 pr-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-figma-text-tertiary)]">
                  Sections
                </span>
                {sections.map(section => {
                  const isActive = section.id === activeSectionId;
                  return (
                    <button
                      key={`${section.topTab}:${section.subTab}`}
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => onSelectSection(section)}
                      className={shellControlClass({ active: isActive, size: 'sm', shape: 'pill' })}
                    >
                      {section.label}
                    </button>
                  );
                })}
              </div>
            )}

            {hasStatus && (
              <div className="inline-flex min-w-0 items-center gap-1.5">
                <span className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-figma-text-tertiary)]">
                  Status
                </span>
                {visiblePills.map((pill, index) => (
                  <span
                    key={`${pill.label}-${index}`}
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-medium ${pillToneClasses[pill.tone]}`}
                  >
                    {pill.label}
                  </span>
                ))}
                {needsOverflow && (
                  <button
                    onClick={() => setOverflowExpanded(true)}
                    className="shrink-0 rounded-full border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2.5 py-1 text-[10px] font-medium text-[var(--color-figma-text-secondary)] transition-colors duration-100 hover:bg-[var(--color-figma-bg-secondary)] hover:text-[var(--color-figma-text)]"
                  >
                    +{overflowCount} more
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {contextualControls ? (
        <div className="border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
          {contextualControls}
        </div>
      ) : null}
    </div>
  );
}
