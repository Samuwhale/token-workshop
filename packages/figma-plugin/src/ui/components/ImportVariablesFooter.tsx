import { useImportPanel } from './ImportPanelContext';

export function ImportVariablesFooter() {
  const {
    varConflictPreview,
    checkingVarConflicts,
    totalEnabledSets,
    totalEnabledTokens,
    importing,
    importProgress,
    handleImportVariables,
  } = useImportPanel();

  return (
    <div className="p-3 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] flex flex-col gap-2">
      {/* Conflict preview summary */}
      {(checkingVarConflicts || varConflictPreview !== null) && (
        <div className="flex items-center gap-2 text-[10px] py-0.5">
          {checkingVarConflicts ? (
            <span className="text-[var(--color-figma-text-secondary)]">Checking existing tokens…</span>
          ) : varConflictPreview && (
            <>
              {varConflictPreview.newCount > 0 && (
                <span className="flex items-center gap-1 text-[var(--color-figma-success,#16a34a)]">
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M4 1v6M1 4h6" />
                  </svg>
                  {varConflictPreview.newCount} new
                </span>
              )}
              {varConflictPreview.newCount > 0 && varConflictPreview.overwriteCount > 0 && (
                <span className="text-[var(--color-figma-border)]">·</span>
              )}
              {varConflictPreview.overwriteCount > 0 && (
                <span className="flex items-center gap-1 text-[var(--color-figma-warning,#e8a100)]">
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M4 1v4M4 6.5v.5" />
                  </svg>
                  {varConflictPreview.overwriteCount} will overwrite
                </span>
              )}
              {varConflictPreview.newCount === 0 && varConflictPreview.overwriteCount === 0 && totalEnabledSets > 0 && (
                <span className="text-[var(--color-figma-text-secondary)]">No tokens selected</span>
              )}
            </>
          )}
        </div>
      )}

      {/* Import button(s) */}
      {varConflictPreview !== null && varConflictPreview.overwriteCount > 0 && !importing ? (
        <div className="flex flex-col gap-1.5">
          <button
            onClick={() => handleImportVariables('overwrite')}
            disabled={totalEnabledSets === 0}
            className="w-full px-3 py-2 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            Import & overwrite ({totalEnabledTokens} token{totalEnabledTokens !== 1 ? 's' : ''})
          </button>
          <button
            onClick={() => handleImportVariables('merge')}
            disabled={totalEnabledSets === 0}
            className="w-full px-3 py-1.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] font-medium hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 transition-colors"
          >
            Import & merge ({varConflictPreview.newCount} new + {varConflictPreview.overwriteCount} value updates)
          </button>
          <button
            onClick={() => handleImportVariables('skip')}
            disabled={totalEnabledSets === 0}
            className="w-full px-3 py-1.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] font-medium hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 transition-colors"
          >
            Import & keep existing ({varConflictPreview.newCount} new only)
          </button>
        </div>
      ) : (
        <button
          onClick={() => handleImportVariables('overwrite')}
          disabled={totalEnabledSets === 0 || importing}
          className="w-full px-3 py-2 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          {importing
            ? importProgress
              ? `Importing set ${importProgress.done}/${importProgress.total}…`
              : 'Importing…'
            : `Import ${totalEnabledTokens} token${totalEnabledTokens !== 1 ? 's' : ''} into ${totalEnabledSets} set${totalEnabledSets !== 1 ? 's' : ''}`}
        </button>
      )}
      {importing && importProgress && importProgress.total > 0 && (
        <div className="w-full h-1.5 rounded-full bg-[var(--color-figma-border)] overflow-hidden">
          <div
            className="h-full rounded-full bg-[var(--color-figma-accent)] transition-all duration-300"
            style={{ width: `${Math.round((importProgress.done / importProgress.total) * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}
