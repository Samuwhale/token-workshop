import type { ReactNode } from "react";
import type { WorkspaceSection } from "../shared/navigationTypes";
import type { NavigationHandoff } from "../contexts/NavigationContext";
import type { NoticeSeverity } from "../shared/noticeSystem";
import { NoticePill } from "../shared/noticeSystem";

interface WorkspacePill {
  label: string;
  tone: NoticeSeverity;
}

interface WorkspacePrimaryAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

interface WorkspaceSummaryHeaderProps {
  workspaceLabel?: string | null;
  title: string;
  sections?: WorkspaceSection[];
  activeSectionId?: string | null;
  onSelectSection?: (section: WorkspaceSection) => void;
  statusPills: WorkspacePill[];
  primaryAction?: WorkspacePrimaryAction | null;
  contextualControls?: ReactNode;
  handoff?: NavigationHandoff | null;
  onReturnHandoff?: () => void;
}

function describeHandoffOrigin(handoff: NavigationHandoff): string {
  if (handoff.origin.secondarySurfaceLabel) {
    return handoff.origin.secondarySurfaceLabel;
  }

  if (handoff.origin.sectionLabel) {
    return `${handoff.origin.workspaceLabel} · ${handoff.origin.sectionLabel}`;
  }

  return handoff.origin.workspaceLabel;
}

export function WorkspaceSummaryHeader({
  workspaceLabel,
  title,
  sections,
  activeSectionId,
  onSelectSection,
  statusPills,
  primaryAction,
  contextualControls,
  handoff,
  onReturnHandoff,
}: WorkspaceSummaryHeaderProps) {
  const hasSections = Boolean(sections && sections.length > 1);
  const hasStatus = statusPills.length > 0;

  return (
    <div className="border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
      {handoff && onReturnHandoff && (
        <div className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-accent)]/5 px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--color-figma-accent)]/80">
                Handoff
              </div>
              <div className="mt-1 text-[11px] font-medium text-[var(--color-figma-text)]">
                From {describeHandoffOrigin(handoff)}
              </div>
              <div className="mt-1 text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">
                {handoff.reason}
              </div>
            </div>
            <button
              onClick={onReturnHandoff}
              className="shrink-0 rounded-full border border-[var(--color-figma-accent)]/30 bg-[var(--color-figma-bg)] px-3 py-1.5 text-[10px] font-medium text-[var(--color-figma-accent)] transition-colors hover:bg-[var(--color-figma-accent)]/8"
            >
              <span aria-hidden="true">&larr; </span>
              {handoff.returnLabel}
            </button>
          </div>
        </div>
      )}
      <div className="flex flex-col gap-2 px-3 py-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {workspaceLabel && (
              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--color-figma-text-tertiary)]">
                <span>Workspace</span>
                <span className="rounded-full border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-0.5 text-[9px] tracking-[0.08em] text-[var(--color-figma-text-secondary)]">
                  {workspaceLabel}
                </span>
              </div>
            )}
            <div className="truncate text-[13px] font-semibold text-[var(--color-figma-text)]">
              {title}
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
                className="inline-flex shrink-0 items-center gap-3 overflow-x-auto"
                role="tablist"
                aria-label={`${workspaceLabel ?? title} sections`}
              >
                {sections.map((section) => {
                  const isActive = section.id === activeSectionId;
                  return (
                    <button
                      key={`${section.topTab}:${section.subTab}`}
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => onSelectSection(section)}
                      title={
                        section.transition?.usage ??
                        section.summaryTitle ??
                        section.label
                      }
                      className={`relative shrink-0 border-b-2 pb-1 text-[10px] font-medium outline-none transition-colors focus-visible:rounded-[6px] focus-visible:ring-2 focus-visible:ring-[var(--color-figma-accent)]/30 ${
                        isActive
                          ? "border-[var(--color-figma-accent)] text-[var(--color-figma-text)]"
                          : "border-transparent text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]"
                      }`}
                    >
                      {section.label}
                    </button>
                  );
                })}
              </div>
            )}

            {hasStatus && (
              <div className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
                {statusPills.map((pill, index) => (
                  <NoticePill
                    key={`${pill.label}-${index}`}
                    severity={pill.tone}
                  >
                    {pill.label}
                  </NoticePill>
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
