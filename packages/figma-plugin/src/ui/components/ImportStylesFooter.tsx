import { useState } from 'react';
import { useImportPanel } from './ImportPanelContext';
import { ImportConflictResolver } from './ImportConflictResolver';
import { renderConflictValue } from './importPanelHelpers';

const MAX_PREVIEW_CONFLICTS = 60;

export function ImportStylesFooter() {
  const {
    targetSet,
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
    reviewActionCopy,
    handleImportStyles,
  } = useImportPanel();

  const [previewConflictsExpanded, setPreviewConflictsExpanded] = useState(false);
  const [showAllPreviewConflicts, setShowAllPreviewConflicts] = useState(false);

  // Compute conflicting tokens for the pre-import preview
  const allConflictingPreviewTokens =
    existingTokenMap !== null && previewOverwriteCount !== null && previewOverwriteCount > 0
      ? tokens
          .filter(t => selectedTokens.has(t.path) && existingTokenMap.has(t.path))
          .map(incoming => ({ incoming, existing: existingTokenMap.get(incoming.path)! }))
      : null;
  const conflictingPreviewTokens = allConflictingPreviewTokens !== null
    ? showAllPreviewConflicts
      ? allConflictingPreviewTokens
      : allConflictingPreviewTokens.slice(0, MAX_PREVIEW_CONFLICTS)
    : null;
  const hiddenPreviewCount =
    allConflictingPreviewTokens !== null && !showAllPreviewConflicts
      ? Math.max(0, allConflictingPreviewTokens.length - MAX_PREVIEW_CONFLICTS)
      : 0;
  const previewConflictCount = previewOverwriteCount ?? 0;
  const hasPreviewConflicts = conflictPaths === null && previewConflictCount > 0;

  return (
    <div className="p-3 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] flex flex-col gap-2">
      <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
        Destination set: <span className="font-mono text-[var(--color-figma-text)]">{targetSet}</span>
      </div>

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
                  {previewOverwriteCount} conflict{previewOverwriteCount !== 1 ? 's' : ''} to review
                </span>
              )}
              {previewNewCount === 0 && previewOverwriteCount === 0 && (
                <span className="text-[var(--color-figma-text-secondary)]">No tokens selected</span>
              )}
            </>
          )}
        </div>
      )}

      {hasPreviewConflicts && !importing && (
        <div className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2.5 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[10px] font-medium text-[var(--color-figma-text)]">
              Recommended next step: review {previewConflictCount} conflict{previewConflictCount !== 1 ? 's' : ''}
            </div>
            <span className="rounded px-1.5 py-0.5 text-[9px] font-medium bg-[var(--color-figma-accent)]/12 text-[var(--color-figma-accent)]">
              {reviewActionCopy.merge.label} recommended
            </span>
          </div>
          <div className="mt-1 text-[10px] text-[var(--color-figma-text-secondary)]">
            {reviewActionCopy.merge.label} keeps existing notes and metadata. {reviewActionCopy.overwrite.label} replaces the current value, and {reviewActionCopy.skip.label.toLowerCase()} skips the conflict while still importing {previewNewCount ?? 0} new token{previewNewCount === 1 ? '' : 's'}.
          </div>
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
            {previewConflictsExpanded ? 'Hide' : 'Show'} {previewOverwriteCount} token{previewOverwriteCount !== 1 ? 's' : ''} that need review
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
                <div className="px-2 py-1.5 text-center bg-[var(--color-figma-bg)]">
                  <button
                    type="button"
                    onClick={() => setShowAllPreviewConflicts(true)}
                    className="text-[10px] text-[var(--color-figma-accent)] hover:underline"
                  >
                    Show {hiddenPreviewCount} more…
                  </button>
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
                : hasPreviewConflicts
                  ? `Review ${previewConflictCount} conflict${previewConflictCount !== 1 ? 's' : ''} before import`
                  : `Import ${selectedTokens.size} new token${selectedTokens.size !== 1 ? 's' : ''} to "${targetSet}"`}
          </button>
          {!importing && !checkingConflicts && selectedTokens.size === 0 && tokens.length > 0 && (
            <p className="text-[10px] text-[var(--color-figma-text-secondary)] text-center">Select at least one token above to import</p>
          )}
          {hasPreviewConflicts && !checkingConflicts && (
            <p className="text-[10px] text-[var(--color-figma-text-secondary)] text-center">
              Review decides whether each conflict should {reviewActionCopy.overwrite.label.toLowerCase()}, {reviewActionCopy.merge.label.toLowerCase()}, or {reviewActionCopy.skip.label.toLowerCase()}.
            </p>
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
