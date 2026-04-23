import { AlertCircle, AlertTriangle, Check, Info } from "lucide-react";
import type { HealthView } from "./types";
import type { HealthStatus } from "../../hooks/useHealthSignals";

interface ReviewRow {
  id: string;
  label: string;
  description: string;
  count: number;
  severity: HealthStatus;
  actionLabel: string;
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
  scopeLabel?: string;
}

function StatusIcon({ status }: { status: HealthStatus }) {
  if (status === "critical") {
    return <AlertCircle size={14} strokeWidth={2.25} aria-hidden />;
  }
  if (status === "warning") {
    return <AlertTriangle size={14} strokeWidth={2.25} aria-hidden />;
  }
  return <Check size={14} strokeWidth={2.25} aria-hidden />;
}

function statusColor(status: HealthStatus): string {
  if (status === "critical") return "text-[var(--color-figma-error)]";
  if (status === "warning") return "text-[var(--color-figma-warning)]";
  return "text-[var(--color-figma-success)]";
}

function formatCheckedAt(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Checked just now";
  if (diffMin === 1) return "Checked 1 min ago";
  if (diffMin < 60) return `Checked ${diffMin} min ago`;
  return `Checked ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

function ReviewSection({
  title,
  description,
  rows,
  emptyLabel,
}: {
  title: string;
  description: string;
  rows: ReviewRow[];
  emptyLabel: string;
}) {
  return (
    <section>
      <div className="mb-2 px-1">
        <h3 className="text-body font-semibold text-[var(--color-figma-text)]">
          {title}
        </h3>
        <p className="mt-0.5 text-secondary text-[var(--color-figma-text-secondary)]">
          {description}
        </p>
      </div>
      <div className="rounded-xl bg-[var(--color-figma-bg-secondary)] p-1.5">
        {rows.length === 0 ? (
          <div className="rounded-lg px-3 py-4 text-secondary text-[var(--color-figma-text-secondary)]">
            {emptyLabel}
          </div>
        ) : (
          <div className="space-y-1">
            {rows.map((row) => {
              const toneClass =
                row.severity === "critical"
                  ? "text-[var(--color-figma-error)]"
                  : row.severity === "warning"
                    ? "text-[var(--color-figma-warning)]"
                    : "text-[var(--color-figma-success)]";
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={row.onOpen}
                  disabled={row.disabled}
                  className={`flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors ${
                    row.disabled
                      ? "cursor-default opacity-60"
                      : "hover:bg-[var(--color-figma-bg)]"
                  }`}
                >
                  <span className={`mt-0.5 shrink-0 ${toneClass}`}>
                    <StatusIcon status={row.severity} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-body font-medium text-[var(--color-figma-text)]">
                        {row.label}
                      </span>
                      <span className={`text-secondary ${toneClass}`}>
                        {row.pending ? "Checking…" : `${row.count}`}
                      </span>
                    </span>
                    <span className="mt-1 block text-secondary leading-[1.45] text-[var(--color-figma-text-secondary)]">
                      {row.description}
                    </span>
                  </span>
                  <span className="shrink-0 text-secondary text-[var(--color-figma-text-tertiary)]">
                    {row.actionLabel}
                  </span>
                </button>
              );
            })}
          </div>
        )}
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
  scopeLabel,
}: HealthDashboardProps) {
  if (!connected) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
        <Info size={20} strokeWidth={1.5} className="text-[var(--color-figma-text-secondary)]" aria-hidden />
        <p className="text-body text-[var(--color-figma-text-secondary)]">
          Connect to check review items.
        </p>
      </div>
    );
  }

  const openView = (view: HealthView) => () => onNavigateToView(view);
  const fixNextRows: ReviewRow[] = [
    {
      id: "issues",
      label: "Validation issues",
      description:
        issueCount > 0
          ? "Broken aliases, invalid values, and structure problems that block reliable authoring."
          : "No active validation issues in this scope.",
      count: issueCount,
      severity: issueStatus,
      actionLabel: issueCount > 0 ? "Review" : "All clear",
      onOpen: openView("issues"),
    },
    {
      id: "generators",
      label: "Generated groups",
      description:
        generatorIssueCount > 0
          ? "Generated groups need reruns or configuration cleanup."
          : "Generated groups are aligned with their sources.",
      count: generatorIssueCount,
      severity: generatorStatus,
      actionLabel: generatorIssueCount > 0 ? "Review" : "All clear",
      disabled: !onNavigateToGenerators,
      onOpen: () => {
        onNavigateToGenerators?.();
      },
    },
    {
      id: "deprecated",
      label: "Deprecated references",
      description:
        deprecatedCount > 0
          ? "Some tokens still point at values that should be replaced before handoff."
          : "No deprecated references found.",
      count: deprecatedCount,
      severity: deprecatedCount > 0 ? ("warning" as HealthStatus) : ("healthy" as HealthStatus),
      actionLabel: deprecatedCount > 0 ? "Replace" : "All clear",
      onOpen: openView("deprecated"),
    },
  ].filter((row) => row.count > 0 || row.id === "issues");

  const cleanupRows: ReviewRow[] = [
    {
      id: "unused",
      label: "Unused tokens",
      description:
        unusedCount > 0
          ? "Candidates for pruning or reusing elsewhere in the system."
          : "No unused tokens detected.",
      count: unusedCount,
      severity: unusedCount > 0 ? ("warning" as HealthStatus) : ("healthy" as HealthStatus),
      actionLabel: unusedCount > 0 ? "Clean up" : "All clear",
      pending: !unusedReady,
      onOpen: openView("unused"),
    },
    {
      id: "alias-opportunities",
      label: "Suggested aliases",
      description:
        aliasOpportunitiesCount > 0
          ? "Repeated literal values can be promoted into shared primitives."
          : "No alias opportunities found.",
      count: aliasOpportunitiesCount,
      severity: aliasOpportunitiesCount > 0 ? ("warning" as HealthStatus) : ("healthy" as HealthStatus),
      actionLabel: aliasOpportunitiesCount > 0 ? "Promote" : "All clear",
      onOpen: openView("alias-opportunities"),
    },
    {
      id: "duplicates",
      label: "Duplicates",
      description:
        duplicateCount > 0
          ? "Multiple tokens appear to describe the same underlying value."
          : "No duplicate values in this scope.",
      count: duplicateCount,
      severity: duplicateCount > 0 ? ("warning" as HealthStatus) : ("healthy" as HealthStatus),
      actionLabel: duplicateCount > 0 ? "Review" : "All clear",
      onOpen: openView("duplicates"),
    },
  ];

  if (hiddenCount > 0) {
    cleanupRows.push({
      id: "hidden",
      label: "Suppressed items",
      description: "Review ignored findings before they disappear from routine maintenance.",
      count: hiddenCount,
      severity: "healthy",
      actionLabel: "Open",
      onOpen: openView("hidden"),
    });
  }

  const statusLabel =
    validationError
      ? "Review check failed"
      : validationLoading && !validationLastRefreshed
        ? "Checking review items"
        : totalIssueCount === 0
          ? "All clear"
          : `${totalIssueCount} item${totalIssueCount === 1 ? "" : "s"} need attention`;

  return (
    <div className="flex h-full flex-col overflow-y-auto px-4 py-4" style={{ scrollbarWidth: "thin" }}>
      {scopeLabel ? (
        <div className="mb-3 text-secondary text-[var(--color-figma-text-tertiary)]">
          Reviewing {scopeLabel}
        </div>
      ) : null}

      <div className="mb-5 rounded-xl bg-[var(--color-figma-bg-secondary)] px-4 py-4">
        <div className="flex items-start gap-3">
          <span className={`mt-0.5 shrink-0 ${statusColor(overallStatus)}`}>
            <StatusIcon status={overallStatus} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-semibold leading-[1.2] text-[var(--color-figma-text)]">
              {statusLabel}
            </h3>
            <p className="mt-1 text-secondary leading-[1.45] text-[var(--color-figma-text-secondary)]">
              {validationError
                ? "The review pass could not complete. Try checking again."
                : totalIssueCount === 0
                  ? "Nothing urgent is blocking this collection right now."
                  : "Start with the highest-risk issues first, then clean up duplicates and unused tokens."}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-secondary text-[var(--color-figma-text-tertiary)]">
              {validationLastRefreshed ? <span>{formatCheckedAt(validationLastRefreshed)}</span> : null}
              {validationLoading ? <span>Checking…</span> : null}
              {validationIsStale && !validationLoading && !validationError ? <span>Outdated</span> : null}
              {!validationLoading && !validationError ? <span>{fixNextRows.reduce((sum, row) => sum + row.count, 0)} fix next</span> : null}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        <ReviewSection
          title="Fix next"
          description="Resolve the issues most likely to break authoring, handoff, or trust."
          rows={fixNextRows}
          emptyLabel="No urgent issues are blocking this collection."
        />
        <ReviewSection
          title="Clean up"
          description="Improve clarity and maintainability after the blocking work is clear."
          rows={cleanupRows}
          emptyLabel="No cleanup opportunities were found."
        />
      </div>
    </div>
  );
}
