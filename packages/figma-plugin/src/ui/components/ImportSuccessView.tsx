import { useImportResultContext } from "./ImportPanelContext";

export function ImportSuccessView() {
  const {
    successMessage,
    failedImportPaths,
    failedImportBatches,
    failedImportGroups,
    succeededImportCount,
    lastImport,
    lastImportReviewSummary,
    undoing,
    retrying,
    copyFeedback,
    handleUndoImport,
    handleRetryFailed,
    handleCopyFailedPaths,
    openImportNextStep,
    clearSuccessState,
    importNextStepRecommendations,
  } = useImportResultContext();

  const hasFailedWrites = failedImportPaths.length > 0;
  const statusColor = hasFailedWrites
    ? "var(--color-figma-warning)"
    : "var(--color-figma-success)";

  const viewTokensRecommendation = importNextStepRecommendations.find(
    (r) => r.target.kind === "workspace" && r.target.topTab === "library" && r.target.subTab === "tokens",
  );

  return (
    <div className="flex flex-col items-center gap-3 py-6">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="9" stroke={statusColor} strokeWidth="1.5" />
        {hasFailedWrites ? (
          <>
            <path d="M10 5.5v5" stroke={statusColor} strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="10" cy="13.5" r="0.8" fill={statusColor} />
          </>
        ) : (
          <path d="M6 10l3 3 5-5" stroke={statusColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>

      <div role="status" aria-live="polite" className="text-body font-medium text-center" style={{ color: statusColor }}>
        {successMessage}
      </div>

      {lastImportReviewSummary && (
        <div className="text-secondary text-[var(--color-figma-text-secondary)] text-center">
          {lastImportReviewSummary.destinationLabel}
          {" — "}
          {[
            lastImportReviewSummary.newCount > 0 && `${lastImportReviewSummary.newCount} imported`,
            lastImportReviewSummary.overwriteCount > 0 && `${lastImportReviewSummary.overwriteCount} updated`,
            lastImportReviewSummary.mergeCount > 0 && `${lastImportReviewSummary.mergeCount} merged`,
            lastImportReviewSummary.keepExistingCount > 0 && `${lastImportReviewSummary.keepExistingCount} kept`,
          ].filter(Boolean).join(", ")}
        </div>
      )}

      {hasFailedWrites && (
        <div className="w-full rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-2">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-2 text-secondary">
              <span className="text-[var(--color-figma-success)] font-medium">{succeededImportCount} ok</span>
              <span className="text-[var(--color-figma-error)] font-medium">{failedImportPaths.length} failed</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleCopyFailedPaths} className="text-secondary text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]">
                {copyFeedback ? "Copied" : "Copy"}
              </button>
              {failedImportBatches.length > 0 && (
                <button onClick={handleRetryFailed} disabled={retrying} className="text-secondary text-[var(--color-figma-accent)] hover:underline disabled:opacity-50">
                  {retrying ? "Retrying..." : "Retry"}
                </button>
              )}
            </div>
          </div>
          {failedImportGroups.length > 0 ? (
            failedImportGroups.map(group => (
              <div key={group.collectionId} className="mt-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-secondary font-medium text-[var(--color-figma-text)]">{group.collectionId}</span>
                  <span className="text-secondary text-[var(--color-figma-text-tertiary)]">{group.paths.length}</span>
                </div>
                <ul className="mt-0.5 text-secondary text-[var(--color-figma-text-secondary)] space-y-0.5">
                  {group.paths.slice(0, 3).map(path => (
                    <li key={`${group.collectionId}:${path}`} className="font-mono truncate" title={path}>{path}</li>
                  ))}
                  {group.paths.length > 3 && <li className="italic">...{group.paths.length - 3} more</li>}
                </ul>
              </div>
            ))
          ) : (
            <ul className="text-secondary text-[var(--color-figma-text-secondary)] space-y-0.5">
              {failedImportPaths.slice(0, 5).map(path => (
                <li key={path} className="font-mono truncate" title={path}>{path}</li>
              ))}
              {failedImportPaths.length > 5 && <li className="italic">...{failedImportPaths.length - 5} more</li>}
            </ul>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        {viewTokensRecommendation && (
          <button
            onClick={() => openImportNextStep(viewTokensRecommendation)}
            className="rounded bg-[var(--color-figma-accent)] px-3 py-1.5 text-secondary font-medium text-white hover:opacity-90"
          >
            View tokens
          </button>
        )}
        <button onClick={clearSuccessState} className="text-secondary text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]">
          Import more
        </button>
        {lastImport && (
          <button onClick={handleUndoImport} disabled={undoing} className="text-secondary text-[var(--color-figma-error)] hover:underline disabled:opacity-50">
            {undoing ? "Undoing..." : "Undo"}
          </button>
        )}
      </div>
    </div>
  );
}
