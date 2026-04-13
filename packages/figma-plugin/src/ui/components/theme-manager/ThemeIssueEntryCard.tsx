import type { ThemeIssueSummary } from "../../shared/themeWorkflow";

interface ThemeIssueEntryCardProps {
  issue: ThemeIssueSummary;
  actionLabel?: string;
  onAction: () => void;
  onViewTokens?: (issue: ThemeIssueSummary) => void;
}

export function ThemeIssueEntryCard({
  issue,
  actionLabel,
  onAction,
  onViewTokens,
}: ThemeIssueEntryCardProps) {
  const issueSeverity: "error" | "warning" =
    issue.kind === "stale-set" ? "error" : "warning";
  const accentClass =
    issue.kind === "stale-set"
      ? "bg-[var(--color-figma-error)]"
      : issue.kind === "missing-override"
        ? "bg-[var(--color-figma-accent)]"
        : "bg-[var(--color-figma-warning)]";
  const issueCountLabel = `${issue.count} ${issue.count === 1 ? "issue" : "issues"}`;

  return (
    <div className="flex items-start gap-2.5 py-2.5">
      <span
        aria-hidden="true"
        className={`mt-1 h-2 w-2 shrink-0 rounded-full ${accentClass}`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-[10px] font-semibold text-[var(--color-figma-text)]">
                {issue.title}
              </span>
              <span
                className={
                  issue.kind === "missing-override"
                    ? "text-[10px] text-[var(--color-figma-accent)]"
                    : issueSeverity === "error"
                      ? "text-[10px] text-[var(--color-figma-error)]"
                      : "text-[10px] text-[var(--color-figma-warning)]"
                }
              >
                {issueCountLabel}
              </span>
            </div>
            <div className="mt-1 text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
              <span className="text-[var(--color-figma-text)]">
                {issue.dimensionName} / {issue.optionName}
              </span>
              <span className="mx-1 text-[var(--color-figma-text-tertiary)]">·</span>
              <span>{issue.summary}</span>
            </div>
          </div>
          <span className="flex shrink-0 items-center gap-2">
            {onViewTokens && (issue.kind === "missing-override" || issue.kind === "coverage-gap") && (
              <button
                type="button"
                onClick={() => onViewTokens(issue)}
                className="text-[10px] font-medium text-[var(--color-figma-accent)] hover:underline"
              >
                View tokens
              </button>
            )}
            <button
              type="button"
              onClick={onAction}
              className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[10px] font-medium text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
              title={issue.recommendedNextAction}
            >
              {actionLabel ?? issue.actionLabel}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
