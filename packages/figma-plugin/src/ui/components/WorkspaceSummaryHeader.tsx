import type { ReactNode } from "react";
import type { WorkspaceSection } from "../shared/navigationTypes";
import type { NavigationHandoff } from "../contexts/NavigationContext";
import type { NoticeSeverity } from "../shared/noticeSystem";

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
  /** Title shown only for secondary surfaces (Import, Settings, etc.) */
  title?: string | null;
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
  const hasContent = hasSections || hasStatus || Boolean(primaryAction) || Boolean(title);

  if (!hasContent && !handoff && !contextualControls) {
    return null;
  }

  return (
    <div className="border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
      {handoff && onReturnHandoff && (
        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-figma-border)] px-3 py-1.5">
          <span className="min-w-0 truncate text-[10px] text-[var(--color-figma-text-secondary)]" title={handoff.reason}>
            From {describeHandoffOrigin(handoff)}
          </span>
          <button
            onClick={onReturnHandoff}
            className="shrink-0 rounded border border-[var(--color-figma-border)] px-2 py-1 text-[10px] font-medium text-[var(--color-figma-accent)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
          >
            &larr; {handoff.returnLabel}
          </button>
        </div>
      )}

      {hasContent && (
        <div className="flex items-center justify-between gap-3 px-3 py-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-3 overflow-x-auto">
            {title && !hasSections && (
              <span className="shrink-0 text-[11px] font-semibold text-[var(--color-figma-text)]">
                {title}
              </span>
            )}

            {hasSections && sections && onSelectSection && (
              <div
                className="inline-flex shrink-0 items-center gap-1.5"
                role="tablist"
                aria-label={`${title ?? "Workspace"} sections`}
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
                      className={`inline-flex shrink-0 items-center gap-2 rounded-[10px] border px-2.5 py-1.5 text-[10px] font-medium outline-none transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-150 ease-out focus-visible:ring-2 focus-visible:ring-[var(--color-figma-accent)]/30 active:translate-y-px ${
                        isActive
                          ? "border-[var(--color-figma-accent)]/30 bg-[var(--color-figma-accent)]/12 text-[var(--color-figma-text)] shadow-sm"
                          : "border-[var(--color-figma-border)]/70 bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-border)] hover:text-[var(--color-figma-text)]"
                      }`}
                    >
                      <span>{section.label}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {hasStatus && (
              <div className="inline-flex min-w-0 flex-wrap items-center gap-1.5 text-[10px] text-[var(--color-figma-text-secondary)]">
                {statusPills.map((pill, index) => (
                  <span key={`${pill.label}-${index}`}>
                    {pill.label}
                  </span>
                ))}
              </div>
            )}
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
      )}

      {contextualControls ? (
        <div className="border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
          {contextualControls}
        </div>
      ) : null}
    </div>
  );
}
