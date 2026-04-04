import { useImportPanel } from './ImportPanelContext';
import { ImportConflictResolver } from './ImportConflictResolver';

export function ImportStylesFooter() {
  const {
    targetSet,
    sets,
    setsError,
    newSetInputVisible,
    newSetDraft,
    newSetError,
    existingPathsFetching,
    existingTokenMapError,
    previewNewCount,
    previewOverwriteCount,
    conflictPaths,
    importing,
    importProgress,
    selectedTokens,
    checkingConflicts,
    tokens,
    setNewSetInputVisible,
    setNewSetDraft,
    setNewSetError,
    handleImportStyles,
    commitNewSet,
    cancelNewSet,
    clearConflictState,
    setTargetSetAndPersist,
    fetchSets,
  } = useImportPanel();

  return (
    <div className="p-3 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] flex flex-col gap-2">

      {/* Target set row */}
      {newSetInputVisible ? (
        <div className="flex flex-col gap-1">
          <div className="flex gap-1.5">
            <input
              autoFocus
              type="text"
              value={newSetDraft}
              onChange={e => { setNewSetDraft(e.target.value); setNewSetError(null); }}
              onKeyDown={e => {
                if (e.key === 'Enter') commitNewSet();
                if (e.key === 'Escape') cancelNewSet();
              }}
              placeholder="New set name…"
              className="flex-1 px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-accent)] text-[var(--color-figma-text)] text-[11px] outline-none"
            />
            <button
              onClick={commitNewSet}
              className="px-2 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[10px] font-medium hover:opacity-90"
            >
              Create
            </button>
            <button
              onClick={cancelNewSet}
              className="px-2 py-1.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] text-[10px] hover:bg-[var(--color-figma-bg-hover)]"
            >
              Cancel
            </button>
          </div>
          {newSetError && <p className="text-[10px] text-[var(--color-figma-text-danger)]">{newSetError}</p>}
          {!newSetError && newSetDraft.trim() && sets.includes(newSetDraft.trim()) && (
            <p className="text-[10px] text-[var(--color-figma-warning,#e8a100)]">Set already exists — tokens will be merged in</p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0">To</label>
            <select
              value={sets.includes(targetSet) ? targetSet : targetSet}
              onChange={e => {
                clearConflictState();
                if (e.target.value === '__new__') {
                  setNewSetInputVisible(true);
                } else {
                  setTargetSetAndPersist(e.target.value);
                }
              }}
              className="flex-1 px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none"
            >
              {sets.map(s => <option key={s} value={s}>{s}</option>)}
              {!sets.includes(targetSet) && targetSet && (
                <option value={targetSet}>{targetSet} (new)</option>
              )}
              <option value="__new__">+ New set…</option>
            </select>
          </div>
          {setsError ? (
            <p className="text-[10px] text-[var(--color-figma-text-danger,#e53935)] pl-[26px]">
              Could not load sets.{' '}
              <button type="button" onClick={fetchSets} className="underline hover:opacity-80">Retry</button>
            </p>
          ) : (
            <p className="text-[10px] text-[var(--color-figma-text-tertiary)] pl-[26px]">Pick an existing set or choose <button type="button" onClick={() => setNewSetInputVisible(true)} className="underline hover:text-[var(--color-figma-text-secondary)]">+ New set…</button> to create one</p>
          )}
        </div>
      )}

      {/* Import preview summary */}
      {tokens.length > 0 && (existingPathsFetching || previewNewCount !== null || existingTokenMapError !== null) && (
        <div className="flex items-center gap-2 text-[10px] py-0.5">
          {existingPathsFetching ? (
            <span className="text-[var(--color-figma-text-secondary)]">Checking existing tokens…</span>
          ) : existingTokenMapError !== null ? (
            <span className="flex items-center gap-1 text-[var(--color-figma-warning,#e8a100)]" title={existingTokenMapError}>
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M4 1v4M4 6.5v.5" />
              </svg>
              Conflict detection unavailable
            </span>
          ) : previewNewCount !== null && previewOverwriteCount !== null && (
            <>
              {previewNewCount > 0 && (
                <span className="flex items-center gap-1 text-[var(--color-figma-success,#16a34a)]">
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M4 1v6M1 4h6" />
                  </svg>
                  {previewNewCount} new
                </span>
              )}
              {previewNewCount > 0 && previewOverwriteCount > 0 && (
                <span className="text-[var(--color-figma-border)]">·</span>
              )}
              {previewOverwriteCount > 0 && (
                <span className="flex items-center gap-1 text-[var(--color-figma-warning,#e8a100)]">
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M4 1v4M4 6.5v.5" />
                  </svg>
                  {previewOverwriteCount} will overwrite
                </span>
              )}
              {previewNewCount === 0 && previewOverwriteCount === 0 && (
                <span className="text-[var(--color-figma-text-secondary)]">No tokens selected</span>
              )}
            </>
          )}
        </div>
      )}

      {/* Action row — conflict resolver or simple import button */}
      {conflictPaths !== null && conflictPaths.length > 0 ? (
        <ImportConflictResolver />
      ) : (
        <button
          onClick={handleImportStyles}
          disabled={selectedTokens.size === 0 || importing || checkingConflicts}
          className="w-full px-3 py-2 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
        >
          {checkingConflicts
            ? 'Checking for conflicts…'
            : importing
              ? importProgress
                ? `Importing ${importProgress.done}/${importProgress.total}…`
                : 'Importing…'
              : `Import ${selectedTokens.size} token${selectedTokens.size !== 1 ? 's' : ''} to "${targetSet}"`}
        </button>
      )}
      {importing && importProgress && importProgress.total > 0 && conflictPaths === null && (
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
