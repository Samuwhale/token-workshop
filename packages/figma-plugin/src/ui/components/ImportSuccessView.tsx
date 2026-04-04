import { useImportPanel } from './ImportPanelContext';

export function ImportSuccessView() {
  const {
    successMessage,
    failedImportPaths,
    failedImportBatches,
    succeededImportCount,
    lastImport,
    undoing,
    retrying,
    copyFeedback,
    handleUndoImport,
    handleRetryFailed,
    handleCopyFailedPaths,
    clearSuccessState,
  } = useImportPanel();

  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="9" stroke="var(--color-figma-success)" strokeWidth="1.5" />
        <path d="M6 10l3 3 5-5" stroke="var(--color-figma-success)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div role="status" aria-live="polite" className="text-[11px] text-[var(--color-figma-success)] font-medium text-center">{successMessage}</div>
      {failedImportPaths.length > 0 && (
        <div className="w-full mt-1 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] p-2">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-[var(--color-figma-success)] font-medium">
                ✓ {succeededImportCount} succeeded
              </span>
              <span className="text-[10px] text-[var(--color-figma-error)] font-medium">
                ✗ {failedImportPaths.length} failed
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyFailedPaths}
                title="Copy all failed paths to clipboard"
                className="text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
              >
                {copyFeedback ? '✓ Copied' : 'Copy paths'}
              </button>
              {failedImportBatches.length > 0 && (
                <button
                  onClick={handleRetryFailed}
                  disabled={retrying}
                  className="text-[10px] text-[var(--color-figma-accent)] hover:underline disabled:opacity-50"
                >
                  {retrying ? 'Retrying…' : 'Retry failed'}
                </button>
              )}
            </div>
          </div>
          <ul className="text-[10px] text-[var(--color-figma-text-secondary)] space-y-0.5">
            {failedImportPaths.slice(0, 5).map(p => (
              <li key={p} className="font-mono truncate" title={p}>{p}</li>
            ))}
            {failedImportPaths.length > 5 && (
              <li className="italic">…and {failedImportPaths.length - 5} more</li>
            )}
          </ul>
        </div>
      )}
      <div className="flex items-center gap-3 mt-1">
        {lastImport && (
          <button
            onClick={handleUndoImport}
            disabled={undoing}
            className="text-[10px] text-[var(--color-figma-error)] hover:underline disabled:opacity-50"
          >
            {undoing ? 'Undoing…' : 'Undo import'}
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
