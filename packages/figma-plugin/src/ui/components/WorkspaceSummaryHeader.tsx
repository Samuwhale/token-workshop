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
  currentLabel?: string | null;
  currentDepthLabel?: string | null;
  title: string;
  description?: string | null;
  workflowSummary?: ReactNode;
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
  currentLabel,
  currentDepthLabel,
  title,
  description,
  workflowSummary,
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
  const hasCurrentContext =
    Boolean(currentLabel) && currentLabel !== workspaceLabel;
  const scopeLabel = workspaceLabel
    ? "Workspace"
    : currentDepthLabel ?? "Surface";

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
            {(workspaceLabel || currentLabel) && (
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--color-figma-text-tertiary)]">
                <span>{scopeLabel}</span>
                {workspaceLabel && (
                  <span className="rounded-full border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-0.5 text-[9px] tracking-[0.08em] text-[var(--color-figma-text-secondary)]">
                    {workspaceLabel}
                  </span>
                )}
                {hasCurrentContext && (
                  <>
                    <span aria-hidden="true" className="text-[11px]">
                      /
                    </span>
                    <span className="rounded-full border border-[var(--color-figma-accent)]/20 bg-[var(--color-figma-accent)]/8 px-2 py-0.5 text-[9px] tracking-[0.08em] text-[var(--color-figma-text)]">
                      {currentLabel}
                    </span>
                  </>
                )}
                {hasCurrentContext &&
                  currentDepthLabel &&
                  currentDepthLabel !== "Workspace" && (
                    <span className="rounded-full border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-0.5 text-[9px] tracking-[0.08em] text-[var(--color-figma-text-secondary)]">
                      {currentDepthLabel}
                    </span>
                  )}
              </div>
            )}
            <div className="truncate text-[13px] font-semibold text-[var(--color-figma-text)]">
              {title}
            </div>
            {description ? (
              <p className="mt-1 text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">
                {description}
              </p>
            ) : null}
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
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="text-[9px] font-medium uppercase tracking-[0.12em] text-[var(--color-figma-text-tertiary)]">
                  Sections
                </div>
                <div
                  className="inline-flex shrink-0 items-center gap-1.5 overflow-x-auto"
                  role="tablist"
                  aria-label={`${workspaceLabel ?? currentLabel ?? title} sections`}
                >
                  {sections.map((section) => {
                    const isActive = section.id === activeSectionId;
                    const isContextual =
                      section.transition?.kind === "contextual-sub-screen";
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
                        className={`inline-flex shrink-0 items-center gap-2 rounded-[10px] border px-2.5 py-1.5 text-[10px] font-medium outline-none transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-150 ease-out focus-visible:ring-2 focus-visible:ring-[var(--color-figma-accent)]/30 active:translate-y-px ${
                          isActive
                            ? "border-[var(--color-figma-accent)]/30 bg-[var(--color-figma-accent)]/12 text-[var(--color-figma-text)] shadow-sm"
                            : "border-[var(--color-figma-border)]/70 bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-border)] hover:text-[var(--color-figma-text)]"
                        }`}
                      >
                        <span>{section.label}</span>
                        {isContextual && (
                          <span className="rounded-full border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-1.5 py-0.5 text-[8px] uppercase tracking-[0.08em] text-[var(--color-figma-text-tertiary)]">
                            Context
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
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

        {workflowSummary ? (
          <div className="rounded-[10px] border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2.5 py-2">
            {workflowSummary}
          </div>
        ) : null}
      </div>

      {contextualControls ? (
        <div className="border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
          {contextualControls}
        </div>
      ) : null}
    </div>
  );
}
