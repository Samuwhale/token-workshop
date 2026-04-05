import { useState } from 'react';
import { useImportPanel } from './ImportPanelContext';
import { ImportConflictResolver } from './ImportConflictResolver';
import { renderConflictValue } from './importPanelHelpers';
import { SET_NAME_RE } from '../shared/utils';

const MAX_PREVIEW_CONFLICTS = 60;

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
    existingTokenMap,
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

  const [previewConflictsExpanded, setPreviewConflictsExpanded] = useState(false);

  // Compute conflicting tokens for the pre-import preview
  const conflictingPreviewTokens =
    existingTokenMap !== null && previewOverwriteCount !== null && previewOverwriteCount > 0
      ? tokens
          .filter(t => selectedTokens.has(t.path) && existingTokenMap.has(t.path))
          .slice(0, MAX_PREVIEW_CONFLICTS)
          .map(incoming => ({ incoming, existing: existingTokenMap.get(incoming.path)! }))
      : null;
  const hiddenPreviewCount =
    conflictingPreviewTokens !== null
      ? Math.max(0, (previewOverwriteCount ?? 0) - MAX_PREVIEW_CONFLICTS)
      : 0;

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
              onChange={e => {
                const val = e.target.value;
                setNewSetDraft(val);
                const trimmed = val.trim();
                if (!trimmed) {
                  setNewSetError(null);
                } else if (!SET_NAME_RE.test(trimmed)) {
                  setNewSetError('Use letters, numbers, - _ (/ for folders)');
                } else {
                  setNewSetError(null);
                }
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') commitNewSet();
                if (e.key === 'Escape') cancelNewSet();
              }}
              placeholder="New set name…"
              aria-invalid={newSetError ? true : undefined}
              className={`flex-1 px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] text-[11px] outline-none ${newSetError ? 'border-[var(--color-figma-error,#e53935)]' : 'border-[var(--color-figma-accent)]'}`}
            />
            <button
              onClick={commitNewSet}
              disabled={!newSetDraft.trim() || !!newSetError}
              className="px-2 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[10px] font-medium hover:opacity-90 disabled:opacity-40"
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
          {newSetError && <p role="alert" className="text-[10px] text-[var(--color-figma-error,#e53935)]">{newSetError}</p>}
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

      {/* Pre-import conflict diff — collapsed toggle showing current vs. incoming values */}
      {conflictPaths === null && conflictingPreviewTokens !== null && conflictingPreviewTokens.length > 0 && !importing && (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setPreviewConflictsExpanded(v => !v)}
            className="flex items-center gap-1 text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
          >
            <svg
              width="8" height="8" viewBox="0 0 8 8" fill="currentColor"
              className={previewConflictsExpanded ? 'rotate-90' : ''}
              style={{ transition: 'transform 150ms' }}
            >
              <path d="M2 1l4 3-4 3V1z" />
            </svg>
            {previewConflictsExpanded ? 'Hide' : 'Show'} {previewOverwriteCount} conflicting token{previewOverwriteCount !== 1 ? 's' : ''}
          </button>

          {previewConflictsExpanded && (
            <div className="max-h-[200px] overflow-y-auto rounded border border-[var(--color-figma-border)] divide-y divide-[var(--color-figma-border)]">
              {conflictingPreviewTokens.map(({ incoming, existing }) => (
                <div key={incoming.path} className="px-2 py-1.5 bg-[var(--color-figma-bg)]">
                  <span className="text-[10px] font-mono text-[var(--color-figma-text)] truncate block mb-0.5" title={incoming.path}>
                    {incoming.path}
                  </span>
                  <div className="flex flex-col gap-0.5 ml-1 text-[10px] font-mono">
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="text-[var(--color-figma-error,#e53935)] shrink-0 w-3">&minus;</span>
                      <span className="text-[var(--color-figma-text-secondary)] truncate flex items-center gap-1">
                        {renderConflictValue(existing.$type, existing.$value)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="text-[var(--color-figma-success,#16a34a)] shrink-0 w-3">+</span>
                      <span className="text-[var(--color-figma-text)] truncate flex items-center gap-1">
                        {renderConflictValue(incoming.$type, incoming.$value)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              {hiddenPreviewCount > 0 && (
                <div className="px-2 py-1.5 text-[10px] text-[var(--color-figma-text-tertiary)] text-center bg-[var(--color-figma-bg)]">
                  and {hiddenPreviewCount} more…
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Action row — conflict resolver or simple import button */}
      {conflictPaths !== null && conflictPaths.length > 0 ? (
        <ImportConflictResolver />
      ) : (
        <div className="flex flex-col gap-1">
          <button
            onClick={handleImportStyles}
            disabled={selectedTokens.size === 0 || importing || checkingConflicts}
            title={selectedTokens.size === 0 ? 'Select at least one token to import' : undefined}
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
          {!importing && !checkingConflicts && selectedTokens.size === 0 && tokens.length > 0 && (
            <p className="text-[10px] text-[var(--color-figma-text-secondary)] text-center">Select at least one token above to import</p>
          )}
        </div>
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
