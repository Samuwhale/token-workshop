import type { HealthView } from "./types";
import type { HealthStatus } from "../../hooks/useHealthSignals";

interface CategoryRow {
  id: string;
  label: string;
  count: number;
  countLabel: string;
  pending?: boolean;
  disabled?: boolean;
  severity: HealthStatus;
  onOpen: () => void;
}

export interface HealthDashboardProps {
  connected: boolean;
  overallStatus: HealthStatus;
  totalIssueCount: number;
  validationLoading: boolean;
  validationLastRefreshed: Date | null;
  validationIsStale: boolean;
  validationError: string | null;

  issueCount: number;
  issueStatus: HealthStatus;
  generatorIssueCount: number;
  generatorStatus: HealthStatus;
  unusedReady: boolean;
  unusedCount: number;
  deprecatedCount: number;
  aliasOpportunitiesCount: number;
  duplicateCount: number;
  hiddenCount: number;

  onNavigateToView: (view: HealthView) => void;
  onNavigateToGenerators?: () => void;
}

function StatusIcon({ status }: { status: HealthStatus }) {
  if (status === "critical") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    );
  }
  if (status === "warning") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function statusColor(status: HealthStatus): string {
  if (status === "critical") return "text-[var(--color-figma-error)]";
  if (status === "warning") return "text-[var(--color-figma-warning)]";
  return "text-[var(--color-figma-success)]";
}

function formatCheckedAt(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin === 1) return "1 min ago";
  if (diffMin < 60) return `${diffMin} min ago`;
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function HealthDashboard({
  connected,
  overallStatus,
  totalIssueCount,
  validationLoading,
  validationLastRefreshed,
  validationIsStale,
  validationError,
  issueCount,
  issueStatus,
  generatorIssueCount,
  generatorStatus,
  unusedReady,
  unusedCount,
  deprecatedCount,
  aliasOpportunitiesCount,
  duplicateCount,
  hiddenCount,
  onNavigateToView,
  onNavigateToGenerators,
}: HealthDashboardProps) {
  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center px-4">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-secondary)]" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <p className="text-body text-[var(--color-figma-text-secondary)]">
          Connect to check health
        </p>
      </div>
    );
  }

  const openView = (view: HealthView) => () => onNavigateToView(view);
  const summaryTitle =
    validationError
      ? "Health check failed"
      : validationLoading && !validationLastRefreshed
        ? "Checking health"
        : !unusedReady && totalIssueCount === 0
      ? "Checking usage"
      : totalIssueCount === 0
        ? "All clear"
        : `${totalIssueCount} issue${totalIssueCount !== 1 ? "s" : ""}`;
  const categories: CategoryRow[] = [
    { id: "issues", label: "Issues", count: issueCount, countLabel: issueCount === 0 ? "All clear" : String(issueCount), severity: issueStatus, onOpen: openView("issues") },
    {
      id: "generators",
      label: "Generators",
      count: generatorIssueCount,
      countLabel: generatorIssueCount === 0 ? "All clear" : String(generatorIssueCount),
      disabled: !onNavigateToGenerators,
      severity: generatorStatus,
      onOpen: () => onNavigateToGenerators?.(),
    },
    { id: "unused", label: "Unused", count: unusedCount, countLabel: unusedReady ? (unusedCount === 0 ? "All clear" : String(unusedCount)) : "Checking…", pending: !unusedReady, severity: unusedCount > 0 ? "warning" : "healthy", onOpen: openView("unused") },
    { id: "deprecated", label: "Deprecated", count: deprecatedCount, countLabel: deprecatedCount === 0 ? "All clear" : String(deprecatedCount), severity: deprecatedCount > 0 ? "warning" : "healthy", onOpen: openView("deprecated") },
    { id: "alias-opportunities", label: "Alias opportunities", count: aliasOpportunitiesCount, countLabel: aliasOpportunitiesCount === 0 ? "All clear" : String(aliasOpportunitiesCount), severity: aliasOpportunitiesCount > 0 ? "warning" : "healthy", onOpen: openView("alias-opportunities") },
    { id: "duplicates", label: "Duplicates", count: duplicateCount, countLabel: duplicateCount === 0 ? "All clear" : String(duplicateCount), severity: duplicateCount > 0 ? "warning" : "healthy", onOpen: openView("duplicates") },
  ];

  if (hiddenCount > 0) {
    categories.push({ id: "hidden", label: "Hidden", count: hiddenCount, countLabel: String(hiddenCount), severity: "healthy", onOpen: openView("hidden") });
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto px-3 py-3" style={{ scrollbarWidth: "thin" }}>
      <div className="flex items-center gap-2.5 mb-4">
        <span className={statusColor(overallStatus)}>
          <StatusIcon status={overallStatus} />
        </span>
        <div className="flex-1 min-w-0">
          <span className="text-subheading font-semibold text-[var(--color-figma-text)]">
            {summaryTitle}
          </span>
          <div className="flex items-center gap-1.5 mt-0.5">
            {validationLoading && (
              <span className="text-secondary text-[var(--color-figma-text-tertiary)]">Checking…</span>
            )}
            {validationError && !validationLoading && (
              <span className="text-secondary text-[var(--color-figma-error)]">Health check failed</span>
            )}
            {validationIsStale && !validationLoading && !validationError && (
              <span className="text-secondary text-[var(--color-figma-warning)]">Outdated</span>
            )}
            {validationLastRefreshed && !validationLoading && !validationError && (
              <span className="text-secondary text-[var(--color-figma-text-tertiary)]">
                Checked {formatCheckedAt(validationLastRefreshed)}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-0.5">
        {categories.map((cat) => {
          const isZero = !cat.pending && cat.count === 0;
          return (
            <button
              key={cat.id}
              onClick={cat.onOpen}
              disabled={cat.disabled}
              className={`flex items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors ${
                cat.disabled
                  ? "cursor-default opacity-60"
                  : "hover:bg-[var(--color-figma-bg-hover)]"
              }`}
            >
              <span className={`shrink-0 ${isZero ? "text-[var(--color-figma-text-tertiary)]" : statusColor(cat.severity)}`}>
                <svg width="7" height="7" viewBox="0 0 8 8" aria-hidden="true">
                  <circle cx="4" cy="4" r="4" fill="currentColor" />
                </svg>
              </span>
              <span className={`flex-1 text-body ${isZero ? "text-[var(--color-figma-text-tertiary)]" : "text-[var(--color-figma-text)] font-medium"}`}>
                {cat.label}
              </span>
              <span className={`text-body tabular-nums ${isZero ? "text-[var(--color-figma-text-tertiary)]" : "text-[var(--color-figma-text-secondary)]"}`}>
                {cat.countLabel}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
