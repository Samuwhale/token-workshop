import type { ReactNode } from "react";
import type { WorkspaceSection } from "../shared/navigationTypes";
import type { ReturnBreadcrumb } from "../contexts/NavigationContext";
import type { NoticeSeverity } from "../shared/noticeSystem";
import { NoticePill } from "../shared/noticeSystem";
import { shellControlClass } from "../shared/shellControlStyles";

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
  title: string;
  sections?: WorkspaceSection[];
  activeSectionId?: string | null;
  onSelectSection?: (section: WorkspaceSection) => void;
  statusPills: WorkspacePill[];
  primaryAction?: WorkspacePrimaryAction | null;
  contextualControls?: ReactNode;
  returnBreadcrumb?: ReturnBreadcrumb | null;
  onReturnBreadcrumb?: () => void;
}

export function WorkspaceSummaryHeader({
  title,
  sections,
  activeSectionId,
  onSelectSection,
  statusPills,
  primaryAction,
  contextualControls,
  returnBreadcrumb,
  onReturnBreadcrumb,
}: WorkspaceSummaryHeaderProps) {
  const hasSections = Boolean(sections && sections.length > 1);
  const hasStatus = statusPills.length > 0;

  return (
    <div className="border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
      {returnBreadcrumb && onReturnBreadcrumb && (
        <button
          onClick={onReturnBreadcrumb}
          className="flex w-full items-center gap-1.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-accent)]/5 px-3 py-1.5 text-[11px] font-medium text-[var(--color-figma-accent)] transition-colors hover:bg-[var(--color-figma-accent)]/10"
        >
          <span aria-hidden="true">&larr;</span>
          {returnBreadcrumb.label}
        </button>
      )}
      <div className="flex flex-col gap-2 px-3 py-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
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
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] p-1"
                role="tablist"
                aria-label={`${title} sections`}
              >
                {sections.map((section) => {
                  const isActive = section.id === activeSectionId;
                  return (
                    <button
                      key={`${section.topTab}:${section.subTab}`}
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => onSelectSection(section)}
                      className={shellControlClass({
                        active: isActive,
                        size: "sm",
                        shape: "pill",
                      })}
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
