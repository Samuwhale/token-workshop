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

  const nextStepRecommendations = importNextStepRecommendations.slice(0, 2);

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
        <div className="text-secondary text-[color:var(--color-figma-text-secondary)] text-center">
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

      {nextStepRecommendations.length > 0 ? (
        <div className="flex flex-col items-center gap-1 text-center">
          <div className="text-secondary font-medium text-[color:var(--color-figma-text)]">
            Next step
          </div>
          <div className="text-secondary text-[color:var(--color-figma-text-secondary)]">
            {nextStepRecommendations[0]?.rationale}
          </div>
        </div>
      ) : null}

      {hasFailedWrites && (
        <div className="w-full max-w-[560px] rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-2">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-2 text-secondary">
              <span className="text-[color:var(--color-figma-text-success)] font-medium">{succeededImportCount} ok</span>
              <span className="text-[color:var(--color-figma-text-error)] font-medium">{failedImportPaths.length} failed</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleCopyFailedPaths} className="text-secondary text-[color:var(--color-figma-text-secondary)] hover:text-[color:var(--color-figma-text)]">
                {copyFeedback ? "Copied" : "Copy"}
              </button>
              {failedImportBatches.length > 0 && (
                <button onClick={handleRetryFailed} disabled={retrying} className="text-secondary text-[color:var(--color-figma-text-accent)] hover:underline disabled:opacity-50">
                  {retrying ? "Retrying..." : "Retry"}
                </button>
              )}
            </div>
          </div>
          {failedImportGroups.length > 0 ? (
            failedImportGroups.map(group => (
              <div key={group.collectionId} className="mt-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-secondary font-medium text-[color:var(--color-figma-text)]">{group.collectionId}</span>
                  <span className="text-secondary text-[color:var(--color-figma-text-tertiary)]">{group.paths.length}</span>
                </div>
                <ul className="mt-0.5 text-secondary text-[color:var(--color-figma-text-secondary)] space-y-0.5">
                  {group.paths.slice(0, 3).map(path => (
                    <li key={`${group.collectionId}:${path}`} className="font-mono [overflow-wrap:anywhere]" title={path}>{path}</li>
                  ))}
                  {group.paths.length > 3 && <li className="italic">...{group.paths.length - 3} more</li>}
                </ul>
              </div>
            ))
          ) : (
            <ul className="text-secondary text-[color:var(--color-figma-text-secondary)] space-y-0.5">
              {failedImportPaths.slice(0, 5).map(path => (
                <li key={path} className="font-mono [overflow-wrap:anywhere]" title={path}>{path}</li>
              ))}
              {failedImportPaths.length > 5 && <li className="italic">...{failedImportPaths.length - 5} more</li>}
            </ul>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-2">
        {nextStepRecommendations.map((recommendation, index) => (
          <button
            key={`${recommendation.label}:${index}`}
            onClick={() => openImportNextStep(recommendation)}
            className={
              index === 0
                ? "rounded bg-[var(--color-figma-action-bg)] px-3 py-1.5 text-secondary font-medium text-[color:var(--color-figma-text-onbrand)] hover:opacity-90"
                : "rounded border border-[var(--color-figma-border)] px-3 py-1.5 text-secondary text-[color:var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
            }
            title={recommendation.rationale}
          >
            {index === 0 ? `Review in ${recommendation.label}` : recommendation.label}
          </button>
        ))}
        <button onClick={clearSuccessState} className="text-secondary text-[color:var(--color-figma-text-secondary)] hover:text-[color:var(--color-figma-text)]">
          Import more
        </button>
        {lastImport && (
          <button onClick={handleUndoImport} disabled={undoing} className="text-secondary text-[color:var(--color-figma-text-error)] hover:underline disabled:opacity-50">
            {undoing ? "Undoing..." : "Undo"}
          </button>
        )}
      </div>
    </div>
  );
}
