import type { HealthView } from "./types";

type HealthStatus = "healthy" | "warning" | "critical";

interface CategoryRow {
  id: HealthView;
  label: string;
  count: number;
  severity: HealthStatus;
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
  unusedCount: number;
  deprecatedCount: number;
  consolidateCount: number;
  duplicateCount: number;
  ignoredCount: number;

  onNavigateToView: (view: HealthView) => void;
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

function categorySeverity(count: number, isError: boolean): HealthStatus {
  if (count === 0) return "healthy";
  return isError ? "critical" : "warning";
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
  unusedCount,
  deprecatedCount,
  consolidateCount,
  duplicateCount,
  ignoredCount,
  onNavigateToView,
}: HealthDashboardProps) {
  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center px-4">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-secondary)]" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <p className="text-[11px] text-[var(--color-figma-text-secondary)]">
          Connect to run audit
        </p>
      </div>
    );
  }

  const categories: CategoryRow[] = [
    { id: "issues", label: "Issues", count: issueCount, severity: categorySeverity(issueCount, true) },
    { id: "unused", label: "Unused", count: unusedCount, severity: categorySeverity(unusedCount, false) },
    { id: "deprecated", label: "Deprecated", count: deprecatedCount, severity: categorySeverity(deprecatedCount, false) },
    { id: "consolidate", label: "Consolidate", count: consolidateCount, severity: categorySeverity(consolidateCount, false) },
    { id: "duplicates", label: "Duplicates", count: duplicateCount, severity: categorySeverity(duplicateCount, false) },
  ];

  if (ignoredCount > 0) {
    categories.push({ id: "ignored", label: "Ignored", count: ignoredCount, severity: "healthy" });
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto px-3 py-3" style={{ scrollbarWidth: "thin" }}>
      <div className="flex items-center gap-2.5 mb-4">
        <span className={statusColor(overallStatus)}>
          <StatusIcon status={overallStatus} />
        </span>
        <div className="flex-1 min-w-0">
          <span className="text-[12px] font-semibold text-[var(--color-figma-text)]">
            {totalIssueCount === 0 ? "All clear" : `${totalIssueCount} issue${totalIssueCount !== 1 ? "s" : ""}`}
          </span>
          <div className="flex items-center gap-1.5 mt-0.5">
            {validationLoading && (
              <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">Auditing…</span>
            )}
            {validationError && !validationLoading && (
              <span className="text-[10px] text-[var(--color-figma-error)]">Audit failed</span>
            )}
            {validationIsStale && !validationLoading && !validationError && (
              <span className="text-[10px] text-[var(--color-figma-warning)]">Outdated</span>
            )}
            {validationLastRefreshed && !validationLoading && !validationError && (
              <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">
                Checked {formatCheckedAt(validationLastRefreshed)}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-0.5">
        {categories.map((cat) => {
          const isZero = cat.count === 0;
          return (
            <button
              key={cat.id}
              onClick={() => onNavigateToView(cat.id)}
              className="flex items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-[var(--color-figma-bg-hover)] group"
            >
              <span className={`shrink-0 ${isZero ? "text-[var(--color-figma-text-tertiary)]" : statusColor(cat.severity)}`}>
                <svg width="7" height="7" viewBox="0 0 8 8" aria-hidden="true">
                  <circle cx="4" cy="4" r="4" fill="currentColor" />
                </svg>
              </span>
              <span className={`flex-1 text-[11px] ${isZero ? "text-[var(--color-figma-text-tertiary)]" : "text-[var(--color-figma-text)] font-medium"}`}>
                {cat.label}
              </span>
              <span className={`text-[11px] tabular-nums ${isZero ? "text-[var(--color-figma-text-tertiary)]" : "text-[var(--color-figma-text-secondary)]"}`}>
                {isZero ? "All clear" : cat.count}
              </span>
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--color-figma-text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          );
        })}
      </div>
    </div>
  );
}
