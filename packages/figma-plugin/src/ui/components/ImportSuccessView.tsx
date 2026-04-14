import { useState } from "react";
import {
  AUDIT_WORKSPACE_GUIDE,
  PRIMARY_WORKSPACE_SEQUENCE,
  PRIMARY_WORKSPACE_SEQUENCE_LABEL,
} from "../shared/navigationTypes";
import {
  IMPORT_REVIEW_ACTION_COPY,
  useImportResultContext,
  useImportSourceContext,
} from "./ImportPanelContext";

export function ImportSuccessView() {
  const [showSkippedDetails, setShowSkippedDetails] = useState(false);
  const { fileImportValidation } = useImportSourceContext();
  const {
    successMessage,
    failedImportPaths,
    failedImportBatches,
    failedImportGroups,
    failedImportStrategy,
    succeededImportCount,
    lastImport,
    lastImportReviewSummary,
    importNextStepRecommendations,
    undoing,
    retrying,
    copyFeedback,
    handleUndoImport,
    handleRetryFailed,
    handleCopyFailedPaths,
    openImportNextStep,
    clearSuccessState,
  } = useImportResultContext();
  const hasParseWarnings =
    !!fileImportValidation &&
    (fileImportValidation.status === "partial" ||
      fileImportValidation.skippedCount > 0 ||
      fileImportValidation.issues.length > 0);
  const showRetryGuidance = hasParseWarnings && failedImportPaths.length > 0;
  const hasFailedWrites = failedImportPaths.length > 0;
  const statusColor = hasFailedWrites
    ? "var(--color-figma-warning,#e8a100)"
    : "var(--color-figma-success)";
  const failureStrategyLabel = IMPORT_REVIEW_ACTION_COPY[failedImportStrategy].label;

  return (
    <div className="flex flex-col items-center justify-center gap-2 py-3">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="9" stroke={statusColor} strokeWidth="1.5" />
        {hasFailedWrites ? (
          <>
            <path
              d="M10 5.5v5"
              stroke={statusColor}
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <circle cx="10" cy="13.5" r="0.8" fill={statusColor} />
          </>
        ) : (
          <path
            d="M6 10l3 3 5-5"
            stroke={statusColor}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
      <div
        role="status"
        aria-live="polite"
        className="text-[11px] font-medium text-center"
        style={{ color: statusColor }}
      >
        {successMessage}
      </div>
      {lastImportReviewSummary && (
        <div className="w-full mt-1 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] p-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[10px] font-medium text-[var(--color-figma-text)]">
              Review applied to{" "}
              {lastImportReviewSummary.destinationLabel}
            </div>
            <span
              className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium ${
                hasFailedWrites
                  ? "bg-[var(--color-figma-warning,#e8a100)]/15 text-[var(--color-figma-warning,#e8a100)]"
                  : "bg-[var(--color-figma-success)]/15 text-[var(--color-figma-success)]"
              }`}
            >
              {hasFailedWrites ? "Needs follow-up" : "Applied"}
            </span>
          </div>
          <div className="mt-1 text-[10px] text-[var(--color-figma-text-secondary)]">
            {lastImportReviewSummary.newCount} new
            {lastImportReviewSummary.overwriteCount > 0 &&
              ` · ${lastImportReviewSummary.overwriteCount} overwrite`}
            {lastImportReviewSummary.mergeCount > 0 &&
              ` · ${lastImportReviewSummary.mergeCount} merge`}
            {lastImportReviewSummary.keepExistingCount > 0 &&
              ` · ${lastImportReviewSummary.keepExistingCount} keep existing`}
          </div>
          <div className="mt-1 text-[10px] text-[var(--color-figma-text-secondary)]">
            Next:{" "}
            {hasFailedWrites
              ? "Retry failed writes below, or copy paths to continue."
              : "Import more or undo to revise."}
          </div>
        </div>
      )}
      <div className="w-full mt-1 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] p-2">
        <div className="text-[10px] font-medium text-[var(--color-figma-text)]">
          Workflow
        </div>
        <div className="mt-1 text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">
          Follow the workspace order: {PRIMARY_WORKSPACE_SEQUENCE_LABEL}.{" "}
          {AUDIT_WORKSPACE_GUIDE.label} is available at every stage.
        </div>
        <div className="mt-2 flex flex-col gap-1.5">
          {PRIMARY_WORKSPACE_SEQUENCE.map((workspace) => (
            <div key={workspace.id} className="flex items-start gap-2">
              <span className="inline-flex min-w-[58px] items-center justify-center rounded-full border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.08em] text-[var(--color-figma-text)]">
                {workspace.stepNumber}. {workspace.label}
              </span>
              <span className="text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">
                {workspace.role}
              </span>
            </div>
          ))}
          <div className="flex items-start gap-2 rounded border border-dashed border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5">
            <span className="inline-flex min-w-[58px] items-center justify-center rounded-full border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.08em] text-[var(--color-figma-text)]">
              {AUDIT_WORKSPACE_GUIDE.label}
            </span>
            <span className="text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">
              {AUDIT_WORKSPACE_GUIDE.role}
            </span>
          </div>
        </div>
      </div>
      {importNextStepRecommendations.length > 0 && (
        <div className="w-full mt-1 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] p-2">
          <div className="text-[10px] font-medium text-[var(--color-figma-text)]">
            Next steps
          </div>
          <div className="mt-1 text-[10px] text-[var(--color-figma-text-secondary)]">
            Continue in the workspace that fits this import.
          </div>
          <div className="mt-2 flex flex-col gap-2">
            {importNextStepRecommendations
              .slice(0, 3)
              .map((recommendation, index) => (
                <button
                  key={`${recommendation.label}-${index}`}
                  onClick={() => openImportNextStep(recommendation)}
                  className={`rounded border px-2 py-1.5 text-left transition-colors ${
                    index === 0
                      ? "border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/8 hover:bg-[var(--color-figma-accent)]/12"
                      : "border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] hover:bg-[var(--color-figma-bg-secondary)]"
                  }`}
                >
                  <div className="text-[10px] font-medium text-[var(--color-figma-text)]">
                    {index === 0
                      ? `Continue in ${recommendation.label}`
                      : `Open ${recommendation.label}`}
                  </div>
                  <div className="mt-0.5 text-[10px] text-[var(--color-figma-text-secondary)]">
                    {recommendation.rationale}
                  </div>
                </button>
              ))}
          </div>
        </div>
      )}
      {fileImportValidation && (
        <div className="w-full mt-1 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] p-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[10px] font-medium text-[var(--color-figma-text)]">
              {fileImportValidation.summary}
            </div>
            <span
              className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium ${
                fileImportValidation.status === "partial"
                  ? "bg-[var(--color-figma-warning,#e8a100)]/15 text-[var(--color-figma-warning,#e8a100)]"
                  : "bg-[var(--color-figma-success)]/15 text-[var(--color-figma-success)]"
              }`}
            >
              {fileImportValidation.status === "partial"
                ? "Partial parse"
                : "Parsed"}
            </span>
          </div>
          <div className="mt-1 text-[10px] text-[var(--color-figma-text-secondary)]">
            {fileImportValidation.detail}
          </div>
          <div className="mt-1 text-[10px] text-[var(--color-figma-text-secondary)]">
            Next: {fileImportValidation.nextAction}
          </div>
          {fileImportValidation.issues.length > 0 && (
            <div className="mt-2 space-y-1">
              {fileImportValidation.issues.map((issue) => (
                <div
                  key={`${issue.severity}-${issue.message}`}
                  className={`text-[10px] ${
                    issue.severity === "warning"
                      ? "text-[var(--color-figma-warning,#e8a100)]"
                      : "text-[var(--color-figma-error)]"
                  }`}
                >
                  {issue.message}
                </div>
              ))}
            </div>
          )}
          {fileImportValidation.skippedCount > 0 && (
            <div className="mt-2 rounded border border-[var(--color-figma-border)] overflow-hidden">
              <button
                onClick={() => setShowSkippedDetails((prev) => !prev)}
                className="w-full flex items-center justify-between px-2 py-1.5 text-left hover:bg-[var(--color-figma-bg)] transition-colors"
                aria-expanded={showSkippedDetails}
              >
                <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                  <span className="text-[var(--color-figma-warning,#e8a100)] font-medium">
                    {fileImportValidation.skippedCount}
                  </span>{" "}
                  skipped
                </span>
                <svg
                  width="8"
                  height="8"
                  viewBox="0 0 8 8"
                  fill="currentColor"
                  className={`text-[var(--color-figma-text-secondary)] transition-transform ${showSkippedDetails ? "rotate-90" : ""}`}
                  aria-hidden="true"
                >
                  <path d="M2 1l4 3-4 3V1z" />
                </svg>
              </button>
              {showSkippedDetails && (
                <div className="max-h-36 overflow-y-auto divide-y divide-[var(--color-figma-border)] border-t border-[var(--color-figma-border)]">
                  {fileImportValidation.skippedEntries.map((entry, index) => (
                    <div
                      key={`${entry.path}-${index}`}
                      className="px-2 py-1.5 flex flex-col gap-0.5"
                    >
                      <span className="font-mono text-[var(--color-figma-text)] text-[9px]">
                        {entry.path}
                      </span>
                      <span className="text-[9px] text-[var(--color-figma-text-secondary)]">
                        {entry.reason}
                        {entry.originalExpression && (
                          <>
                            {" "}
                            —{" "}
                            <code className="font-mono text-[var(--color-figma-text)]">
                              {entry.originalExpression.length > 48
                                ? entry.originalExpression.slice(0, 48) + "…"
                                : entry.originalExpression}
                            </code>
                          </>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {showRetryGuidance && (
            <div className="mt-2 text-[10px] text-[var(--color-figma-text-secondary)]">
              Retry re-sends parsed tokens only. Skipped entries stay excluded until the source file is fixed.
            </div>
          )}
        </div>
      )}
      {hasFailedWrites && (
        <div className="w-full mt-1 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] p-2">
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-[var(--color-figma-success)] font-medium">
                  ✓ {succeededImportCount} succeeded
                </span>
                <span className="text-[10px] text-[var(--color-figma-error)] font-medium">
                  ✗ {failedImportPaths.length} failed
                </span>
              </div>
              <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
                Strategy: {failureStrategyLabel}. Retry failed writes below.
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyFailedPaths}
                title="Copy failed paths"
                className="text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
              >
                {copyFeedback ? "✓ Copied" : "Copy paths"}
              </button>
              {failedImportBatches.length > 0 && (
                <button
                  onClick={handleRetryFailed}
                  disabled={retrying}
                  className="text-[10px] text-[var(--color-figma-accent)] hover:underline disabled:opacity-50"
                >
                  {retrying ? "Retrying…" : "Retry failed"}
                </button>
              )}
            </div>
          </div>
          <div className="space-y-2">
            {failedImportGroups.length > 0 ? (
              failedImportGroups.map((group) => (
                <div
                  key={group.setName}
                  className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-medium text-[var(--color-figma-text)]">
                      {group.setName}
                    </span>
                    <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">
                      {group.paths.length} failed path
                      {group.paths.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <ul className="mt-1 text-[10px] text-[var(--color-figma-text-secondary)] space-y-0.5">
                    {group.paths.slice(0, 3).map((path) => (
                      <li
                        key={`${group.setName}:${path}`}
                        className="font-mono truncate"
                        title={path}
                      >
                        {path}
                      </li>
                    ))}
                    {group.paths.length > 3 && (
                      <li className="italic">
                        …and {group.paths.length - 3} more in this set
                      </li>
                    )}
                  </ul>
                </div>
              ))
            ) : (
              <ul className="text-[10px] text-[var(--color-figma-text-secondary)] space-y-0.5">
                {failedImportPaths.slice(0, 5).map((path) => (
                  <li key={path} className="font-mono truncate" title={path}>
                    {path}
                  </li>
                ))}
                {failedImportPaths.length > 5 && (
                  <li className="italic">
                    …and {failedImportPaths.length - 5} more
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>
      )}
      <div className="flex items-center gap-3 mt-1">
        {lastImport && (
          <button
            onClick={handleUndoImport}
            disabled={undoing}
            className="text-[10px] text-[var(--color-figma-error)] hover:underline disabled:opacity-50"
          >
            {undoing ? "Undoing…" : "Undo import"}
          </button>
        )}
        <button
          onClick={clearSuccessState}
          className="text-[10px] text-[var(--color-figma-accent)] hover:underline"
        >
          Import more
        </button>
      </div>
    </div>
  );
}
