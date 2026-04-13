import { NoticeCountBadge } from "../../shared/noticeSystem";
import type { ThemeIssueSummary } from "../../shared/themeWorkflow";

interface ThemeIssueEntryCardProps {
  issue: ThemeIssueSummary;
  actionLabel?: string;
  onAction: () => void;
}

export function ThemeIssueEntryCard({
  issue,
  actionLabel,
  onAction,
}: ThemeIssueEntryCardProps) {
  const issueSeverity: "error" | "warning" =
    issue.kind === "stale-set" ? "error" : "warning";
  const toneClass =
    issue.kind === "stale-set"
      ? "border-[var(--color-figma-error)]/30 bg-[var(--color-figma-error)]/10"
      : issue.kind === "missing-override"
        ? "border-violet-500/25 bg-violet-500/8"
        : "border-[var(--color-figma-warning)]/30 bg-[var(--color-figma-warning)]/8";

  return (
    <div className={`rounded border px-2.5 py-2 ${toneClass}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-semibold text-[var(--color-figma-text)]">
              {issue.title}
            </span>
            <NoticeCountBadge
              severity={
                issue.kind === "missing-override" ? "info" : issueSeverity
              }
              count={issue.count}
              className="min-w-[18px] px-1.5 font-semibold"
            />
          </div>
          <div className="mt-1 text-[10px] text-[var(--color-figma-text-secondary)]">
            {issue.dimensionName} / {issue.optionName}
          </div>
          <div className="mt-1 text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
            {issue.summary}
          </div>
          <div className="mt-1 text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
            Next: {issue.recommendedNextAction}
          </div>
        </div>
        <button
          type="button"
          onClick={onAction}
          className="shrink-0 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[10px] font-medium text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
        >
          {actionLabel ?? issue.actionLabel}
        </button>
      </div>
    </div>
  );
}
