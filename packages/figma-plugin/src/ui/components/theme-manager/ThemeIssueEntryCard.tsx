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
  const accentClass =
    issue.kind === "stale-set"
      ? "bg-[var(--color-figma-error)]"
      : issue.kind === "missing-override"
        ? "bg-[var(--color-figma-accent)]"
        : "bg-[var(--color-figma-warning)]";

  const canViewTokens =
    onViewTokens &&
    (issue.kind === "missing-override" || issue.kind === "coverage-gap");

  return (
    <div
      className={`rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2.5 py-1.5 transition-colors ${
        canViewTokens
          ? "cursor-pointer hover:border-[var(--color-figma-accent)]/30 hover:bg-[var(--color-figma-bg-hover)]"
          : ""
      }`}
      onClick={canViewTokens ? () => onViewTokens(issue) : undefined}
      onKeyDown={
        canViewTokens
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onViewTokens!(issue);
              }
            }
          : undefined
      }
      role={canViewTokens ? "button" : undefined}
      tabIndex={canViewTokens ? 0 : undefined}
      title={canViewTokens ? "View affected tokens" : undefined}
    >
      <div className="flex items-start gap-2">
        <span
          aria-hidden="true"
          className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${accentClass}`}
        />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
            {issue.summary}
          </div>
          {canViewTokens && (
            <div className="mt-0.5 text-[9px] text-[var(--color-figma-text-tertiary)]">
              Open the affected tokens
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onAction();
          }}
          className="shrink-0 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-figma-accent)] transition-colors hover:border-[var(--color-figma-accent)]/40 hover:bg-[var(--color-figma-accent)]/5"
          title={issue.recommendedNextAction}
        >
          {actionLabel ?? issue.actionLabel}
        </button>
      </div>
    </div>
  );
}
