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
      className={`flex items-center gap-2 py-2 ${canViewTokens ? "cursor-pointer hover:bg-[var(--color-figma-bg-hover)]" : ""}`}
      onClick={canViewTokens ? () => onViewTokens(issue) : undefined}
      onKeyDown={canViewTokens ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onViewTokens!(issue); } } : undefined}
      role={canViewTokens ? "button" : undefined}
      tabIndex={canViewTokens ? 0 : undefined}
      title={canViewTokens ? "View affected tokens" : undefined}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${accentClass}`}
      />
      <div className="min-w-0 flex-1">
        <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
          {issue.summary}
        </span>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onAction();
        }}
        className="shrink-0 text-[10px] font-medium text-[var(--color-figma-accent)] hover:underline"
        title={issue.recommendedNextAction}
      >
        {actionLabel ?? issue.actionLabel}
      </button>
    </div>
  );
}
