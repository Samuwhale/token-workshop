import { AlertCircle, AlertTriangle, Check, SlidersHorizontal } from "lucide-react";
import type { HealthView } from "./types";
import type { HealthStatus } from "../../hooks/useHealthSignals";

interface ReviewRow {
  id: string;
  label: string;
  count: number;
  severity: HealthStatus;
  pending?: boolean;
  disabled?: boolean;
  onOpen: () => void;
}

export interface HealthDashboardProps {
  connected: boolean;
  overallStatus: HealthStatus;
  totalIssueCount: number;
  validationLoading: boolean;
  validationLastRefreshed: Date | null;
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
  if (status === "critical") return <AlertCircle size={14} strokeWidth={2.25} aria-hidden />;
  if (status === "warning") return <AlertTriangle size={14} strokeWidth={2.25} aria-hidden />;
  return <Check size={14} strokeWidth={2.25} aria-hidden />;
}

function statusColor(status: HealthStatus): string {
  if (status === "critical") return "text-[var(--color-figma-error)]";
  if (status === "warning") return "text-[var(--color-figma-warning)]";
  return "text-[var(--color-figma-success)]";
}

function formatCheckedAt(date: Date): string {
  const diffMin = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin === 1) return "1 min ago";
  if (diffMin < 60) return `${diffMin} min ago`;
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function ReviewSection({
  title,
  rows,
}: {
  title: string;
  rows: ReviewRow[];
}) {
  if (rows.length === 0) return null;
  return (
    <section>
      <h3 className="px-1 pb-1.5 text-secondary font-medium text-[var(--color-figma-text-secondary)]">
        {title}
      </h3>
      <div>
        {rows.map((row) => {
          const tone =
            row.severity === "critical"
              ? "text-[var(--color-figma-error)]"
              : row.severity === "warning"
                ? "text-[var(--color-figma-warning)]"
                : "text-[var(--color-figma-text-tertiary)]";
          return (
            <button
              key={row.id}
              type="button"
              onClick={row.onOpen}
              disabled={row.disabled}
              className={`flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left transition-colors ${
                row.disabled
                  ? "cursor-default opacity-60"
                  : "hover:bg-[var(--color-figma-bg-hover)]"
              }`}
            >
              <span className={`shrink-0 ${tone}`}>
                <StatusIcon status={row.severity} />
              </span>
              <span className="min-w-0 flex-1 truncate text-body text-[var(--color-figma-text)]">
                {row.label}
              </span>
              <span className={`shrink-0 tabular-nums text-secondary ${tone}`}>
                {row.pending ? "…" : row.count}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function HealthDashboard({
  connected,
  overallStatus,
  totalIssueCount,
  validationLoading,
  validationLastRefreshed,
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
      <div className="flex h-full items-center justify-center px-4 text-center">
        <p className="text-body text-[var(--color-figma-text-secondary)]">
          Connect to check review items.
        </p>
      </div>
    );
  }

  const openView = (view: HealthView) => () => onNavigateToView(view);
  const sevFromCount = (count: number): HealthStatus =>
    count > 0 ? "warning" : "healthy";

  const fixNextRows: ReviewRow[] = [
    {
      id: "issues",
      label: "Validation issues",
      count: issueCount,
      severity: issueStatus,
      onOpen: openView("issues"),
    },
    {
      id: "generators",
      label: "Generated groups",
      count: generatorIssueCount,
      severity: generatorStatus,
      disabled: !onNavigateToGenerators,
      onOpen: () => onNavigateToGenerators?.(),
    },
    {
      id: "deprecated",
      label: "Deprecated references",
      count: deprecatedCount,
      severity: sevFromCount(deprecatedCount),
      onOpen: openView("deprecated"),
    },
  ].filter((row) => row.count > 0 || row.id === "issues");

  const cleanupRows: ReviewRow[] = [
    {
      id: "unused",
      label: "Unused tokens",
      count: unusedCount,
      severity: sevFromCount(unusedCount),
      pending: !unusedReady,
      onOpen: openView("unused"),
    },
    {
      id: "alias-opportunities",
      label: "Suggested aliases",
      count: aliasOpportunitiesCount,
      severity: sevFromCount(aliasOpportunitiesCount),
      onOpen: openView("alias-opportunities"),
    },
    {
      id: "duplicates",
      label: "Duplicates",
      count: duplicateCount,
      severity: sevFromCount(duplicateCount),
      onOpen: openView("duplicates"),
    },
  ];

  if (hiddenCount > 0) {
    cleanupRows.push({
      id: "hidden",
      label: "Hidden",
      count: hiddenCount,
      severity: "healthy",
      onOpen: openView("hidden"),
    });
  }

  const statusLabel = validationError
    ? "Check failed"
    : validationLoading && !validationLastRefreshed
      ? "Checking…"
      : totalIssueCount === 0
        ? "All clear"
        : `${totalIssueCount} item${totalIssueCount === 1 ? "" : "s"} need attention`;

  return (
    <div className="flex h-full flex-col overflow-y-auto px-4 py-4" style={{ scrollbarWidth: "thin" }}>
      <div className="mb-5 flex items-center gap-2">
        <span className={`shrink-0 ${statusColor(overallStatus)}`}>
          <StatusIcon status={overallStatus} />
        </span>
        <h2 className="text-body font-semibold text-[var(--color-figma-text)]">
          {statusLabel}
        </h2>
        {validationLastRefreshed && !validationLoading && !validationError ? (
          <span className="ml-auto text-secondary text-[var(--color-figma-text-tertiary)]">
            {formatCheckedAt(validationLastRefreshed)}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-4">
        <ReviewSection title="Fix next" rows={fixNextRows} />
        <ReviewSection title="Clean up" rows={cleanupRows} />
      </div>

      <div className="mt-auto pt-6">
        <button
          type="button"
          onClick={openView("rules")}
          className="flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left transition-colors hover:bg-[var(--color-figma-bg-hover)]"
        >
          <span className="shrink-0 text-[var(--color-figma-text-tertiary)]">
            <SlidersHorizontal size={14} strokeWidth={2.25} aria-hidden />
          </span>
          <span className="min-w-0 flex-1 truncate text-body text-[var(--color-figma-text)]">
            Rules
          </span>
        </button>
      </div>
    </div>
  );
}
