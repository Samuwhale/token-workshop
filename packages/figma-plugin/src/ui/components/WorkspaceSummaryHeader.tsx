import type { ReactNode } from 'react';
import type { WorkspaceSection } from '../shared/navigationTypes';

type WorkspacePillTone = 'neutral' | 'accent' | 'warning' | 'danger' | 'success';

interface WorkspacePill {
  label: string;
  tone: WorkspacePillTone;
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
              className="shrink-0 rounded-full bg-[var(--color-figma-accent)] px-3 py-1.5 text-[10px] font-medium text-white transition-colors hover:bg-[var(--color-figma-accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
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
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors ${
                        isActive
                          ? 'bg-[var(--color-figma-accent)] text-white'
                          : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]'
                      }`}
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
                {statusPills.map((pill, index) => (
                  <span
                    key={`${pill.label}-${index}`}
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-medium ${pillToneClasses[pill.tone]}`}
                  >
                    {pill.label}
                  </span>
                ))}
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
