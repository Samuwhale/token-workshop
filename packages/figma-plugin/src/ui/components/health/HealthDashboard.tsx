import { AlertCircle, AlertTriangle, Check, SlidersHorizontal } from "lucide-react";
import { StatusRow } from "../../primitives";
import type { HealthView } from "./types";
import type { HealthStatus } from "../../hooks/useHealthSignals";

interface ReviewRow {
  id: string;
  label: string;
  description: string;
  count: number;
  severity: HealthStatus;
  pending?: boolean;
  disabled?: boolean;
  onOpen: () => void;
}

export interface HealthDashboardProps {
  connected: boolean;
  scopeLabel: string;
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
  if (status === "critical") return "text-[color:var(--color-figma-text-error)]";
  if (status === "warning") return "text-[color:var(--color-figma-text-warning)]";
  return "text-[color:var(--color-figma-text-success)]";
}

function statusTone(status: HealthStatus): "success" | "warning" | "danger" | "neutral" {
  if (status === "critical") return "danger";
  if (status === "warning") return "warning";
  if (status === "healthy") return "success";
  return "neutral";
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
  description,
  rows,
}: {
  title: string;
  description: string;
  rows: ReviewRow[];
}) {
  if (rows.length === 0) return null;
  return (
    <section className="tm-health-section">
      <div className="tm-health-section__header">
        <h3 className="text-body font-semibold text-[color:var(--color-figma-text)]">
          {title}
        </h3>
        <p className="mt-0.5 text-secondary text-[color:var(--color-figma-text-secondary)]">
          {description}
        </p>
      </div>
      <div className="tm-health-section__rows">
        {rows.map((row) => (
          <StatusRow
            key={row.id}
            tone={statusTone(row.severity)}
            label={row.label}
            description={row.description}
            value={row.pending ? "…" : row.count}
            icon={<StatusIcon status={row.severity} />}
            disabled={row.disabled}
            onClick={row.onOpen}
          />
        ))}
      </div>
    </section>
  );
}

export function HealthDashboard({
  connected,
  scopeLabel,
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
        <p className="text-body text-[color:var(--color-figma-text-secondary)]">
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
      description:
        issueCount > 0
          ? "Fix rule failures and invalid token values."
          : validationLoading
            ? "Checking token rules."
            : "No token rule issues found.",
      count: issueCount,
      severity: issueStatus,
      onOpen: openView("issues"),
    },
    {
      id: "generators",
      label: "Generator updates",
      description: "Save, preview, or apply generated outputs.",
      count: generatorIssueCount,
      severity: generatorStatus,
      disabled: !onNavigateToGenerators,
      onOpen: () => onNavigateToGenerators?.(),
    },
    {
      id: "deprecated",
      label: "Deprecated references",
      description: "Replace active references to retired tokens.",
      count: deprecatedCount,
      severity: sevFromCount(deprecatedCount),
      onOpen: openView("deprecated"),
    },
  ].filter((row) => row.count > 0 || row.id === "issues");

  const cleanupRows: ReviewRow[] = [
    {
      id: "unused",
      label: "Unused tokens",
      description: unusedReady
        ? "Review tokens not found on the Figma canvas."
        : "Scanning Figma usage.",
      count: unusedCount,
      severity: sevFromCount(unusedCount),
      pending: !unusedReady,
      onOpen: openView("unused"),
    },
    {
      id: "alias-opportunities",
      label: "Suggested aliases",
      description: "Promote repeated values into shared tokens.",
      count: aliasOpportunitiesCount,
      severity: sevFromCount(aliasOpportunitiesCount),
      onOpen: openView("alias-opportunities"),
    },
    {
      id: "duplicates",
      label: "Duplicates",
      description: "Merge matching values that can share one token.",
      count: duplicateCount,
      severity: sevFromCount(duplicateCount),
      onOpen: openView("duplicates"),
    },
  ];

  if (hiddenCount > 0) {
    cleanupRows.push({
      id: "hidden",
      label: "Hidden",
      description: "Restore issues hidden from Review.",
      count: hiddenCount,
      severity: "healthy",
      onOpen: openView("hidden"),
    });
  }

  const statusTitle = validationError
    ? "Check failed"
    : validationLoading && !validationLastRefreshed
      ? "Checking library"
      : totalIssueCount === 0
        ? "Ready to publish"
        : "Review needs attention";
  const statusDetail = validationError
    ? validationError
    : totalIssueCount === 0
      ? `${scopeLabel} No blocking review items found.`
      : `${totalIssueCount} item${totalIssueCount === 1 ? "" : "s"} need attention. Start with Fix next, then clean up library hygiene.`;

  return (
    <div className="tm-health-dashboard" style={{ scrollbarWidth: "thin" }}>
      <div className="tm-health-summary">
        <span className={`shrink-0 ${statusColor(overallStatus)}`}>
          <StatusIcon status={overallStatus} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-body font-semibold text-[color:var(--color-figma-text)]">
            {statusTitle}
          </h2>
          <p className="mt-0.5 text-secondary text-[color:var(--color-figma-text-secondary)]">
            {statusDetail}
          </p>
        </div>
        {validationLastRefreshed && !validationLoading && !validationError ? (
          <span className="shrink-0 text-secondary text-[color:var(--color-figma-text-tertiary)]">
            {formatCheckedAt(validationLastRefreshed)}
          </span>
        ) : null}
      </div>

      <div className="tm-health-sections">
        <ReviewSection
          title="Fix next"
          description="Items that can block confident handoff or publish."
          rows={fixNextRows}
        />
        <ReviewSection
          title="Clean up"
          description="Helpful library maintenance after blockers are clear."
          rows={cleanupRows}
        />
      </div>

      <div className="tm-health-rules">
        <StatusRow
          tone="neutral"
          label="Rules"
          icon={<SlidersHorizontal size={14} strokeWidth={2.25} aria-hidden />}
          onClick={openView("rules")}
        />
      </div>
    </div>
  );
}
