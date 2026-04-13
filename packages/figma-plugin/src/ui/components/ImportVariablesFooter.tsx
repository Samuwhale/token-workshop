import { useState } from 'react';
import {
  useImportDestinationContext,
  useImportReviewContext,
} from './ImportPanelContext';
import { renderConflictValue } from './importPanelHelpers';
import { Spinner } from './Spinner';

const MAX_VISIBLE_CONFLICTS = 60;

export function ImportVariablesFooter() {
  const {
    hasAmbiguousCollectionImport,
    ambiguousCollectionImportCount,
    totalEnabledSets,
    totalEnabledTokens,
    hasInvalidModeSetNames,
  } = useImportDestinationContext();
  const {
    varConflictPreview,
    varConflictDetails,
    varConflictDetailsExpanded,
    setVarConflictDetailsExpanded,
    checkingVarConflicts,
    importing,
    importProgress,
    handleImportVariables,
    reviewActionCopy,
  } = useImportReviewContext();

  const hasInvalidSetNames = hasInvalidModeSetNames;

  const [showAllConflicts, setShowAllConflicts] = useState(false);

  const hasConflicts = varConflictPreview !== null && varConflictPreview.overwriteCount > 0;
  const hasBlockingDestinationCollisions = hasAmbiguousCollectionImport;
  const visibleDetails = varConflictDetails
    ? showAllConflicts ? varConflictDetails : varConflictDetails.slice(0, MAX_VISIBLE_CONFLICTS)
    : null;
  const hiddenCount = varConflictDetails && !showAllConflicts
    ? Math.max(0, varConflictDetails.length - MAX_VISIBLE_CONFLICTS)
    : 0;
  const recommendedConflictAction = reviewActionCopy.merge;
  const importDisabledMessage = hasInvalidSetNames
    ? 'Fix invalid set names above before importing'
    : hasBlockingDestinationCollisions
      ? ambiguousCollectionImportCount === 1
        ? 'Resolve 1 duplicate destination path before importing'
        : `Resolve ${ambiguousCollectionImportCount} duplicate destination paths before importing`
      : totalEnabledSets === 0
        ? 'Enable at least one mode above to import'
        : null;

  return (
    <div className="p-3 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] flex flex-col gap-2">
      {/* Conflict preview summary */}
      {(checkingVarConflicts || varConflictPreview !== null) && (
        <div className="flex items-center gap-2 text-[10px] py-0.5">
          {checkingVarConflicts ? (
            <>
              <Spinner size="xs" className="text-[var(--color-figma-text-secondary)]" />
              <span className="text-[var(--color-figma-text-secondary)]">Checking destination collisions…</span>
            </>
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
                  {varConflictPreview.overwriteCount} conflict{varConflictPreview.overwriteCount !== 1 ? 's' : ''} to review
                </span>
              )}
              {varConflictPreview.newCount === 0 && varConflictPreview.overwriteCount === 0 && totalEnabledSets > 0 && (
                <span className="text-[var(--color-figma-text-secondary)]">No conflicts detected</span>
              )}
            </>
          )}
        </div>
      )}

      {hasBlockingDestinationCollisions && !importing && (
        <div className="rounded border border-[var(--color-figma-warning,#e8a100)]/40 bg-[var(--color-figma-warning,#f59e0b)]/10 px-2.5 py-2">
          <div className="text-[10px] font-medium text-[var(--color-figma-text)]">
            Duplicate destination paths block this import
          </div>
          <div className="mt-1 text-[10px] text-[var(--color-figma-text-secondary)]">
            Two or more enabled modes target the same destination set and token path. Change one of those destination mappings or disable an overlapping mode before importing.
          </div>
        </div>
      )}

      {hasConflicts && varConflictPreview && !importing && !hasBlockingDestinationCollisions && (
        <div className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2.5 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[10px] font-medium text-[var(--color-figma-text)]">
              Recommended next step: {recommendedConflictAction.buttonLabel.toLowerCase()}
            </div>
            <span className="rounded px-1.5 py-0.5 text-[9px] font-medium bg-[var(--color-figma-accent)]/12 text-[var(--color-figma-accent)]">
              Recommended
            </span>
          </div>
          <div className="mt-1 text-[10px] text-[var(--color-figma-text-secondary)]">
            Import {varConflictPreview.newCount} new token{varConflictPreview.newCount !== 1 ? 's' : ''} and update {varConflictPreview.overwriteCount} conflict{varConflictPreview.overwriteCount !== 1 ? 's' : ''}. {recommendedConflictAction.consequence}
          </div>
        </div>
      )}

      {/* Per-token conflict diff preview */}
      {hasConflicts && varConflictDetails !== null && varConflictDetails.length > 0 && !importing && (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setVarConflictDetailsExpanded(v => !v)}
            className="flex items-center gap-1 text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
          >
            <svg
              width="8" height="8" viewBox="0 0 8 8" fill="currentColor"
              className={varConflictDetailsExpanded ? 'rotate-90' : ''}
              style={{ transition: 'transform 150ms' }}
            >
              <path d="M2 1l4 3-4 3V1z" />
            </svg>
            {varConflictDetailsExpanded ? 'Hide' : 'Show'} {varConflictDetails.length} token{varConflictDetails.length !== 1 ? 's' : ''} that need review
          </button>

          {varConflictDetailsExpanded && (
            <div className="max-h-[200px] overflow-y-auto rounded border border-[var(--color-figma-border)] divide-y divide-[var(--color-figma-border)]">
              {visibleDetails!.map(({ path, setName, existing, incoming, kind, existingLabel, incomingLabel, note }) => (
                <div key={`${setName}:${path}`} className="px-2 py-1.5 bg-[var(--color-figma-bg)]">
                  <div className="flex items-start justify-between gap-1 mb-0.5">
                    <span className="text-[10px] font-mono text-[var(--color-figma-text)] truncate flex-1 min-w-0" title={path}>
                      {path}
                    </span>
                    <div className="flex items-center gap-1 shrink-0 ml-1">
                      {kind === 'incoming-duplicate' && (
                        <span className="rounded px-1 py-0.5 text-[8px] font-medium bg-[var(--color-figma-warning,#f59e0b)]/12 text-[var(--color-figma-warning,#e8a100)]">
                          duplicate
                        </span>
                      )}
                      {varConflictDetails.length > 1 && (
                        <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">{setName}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-0.5 ml-1 text-[10px] font-mono">
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="text-[var(--color-figma-error,#e53935)] shrink-0 w-3">&minus;</span>
                      <span className="text-[var(--color-figma-text-secondary)] truncate flex items-center gap-1">
                        {existingLabel && (
                          <span className="text-[9px] uppercase tracking-wide text-[var(--color-figma-text-tertiary)]">
                            {existingLabel}
                          </span>
                        )}
                        {renderConflictValue(existing.$type, existing.$value)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="text-[var(--color-figma-success,#16a34a)] shrink-0 w-3">+</span>
                      <span className="text-[var(--color-figma-text)] truncate flex items-center gap-1">
                        {incomingLabel && (
                          <span className="text-[9px] uppercase tracking-wide text-[var(--color-figma-text-tertiary)]">
                            {incomingLabel}
                          </span>
                        )}
                        {renderConflictValue(incoming.$type, incoming.$value)}
                      </span>
                    </div>
                  </div>
                  {note && (
                    <div className="ml-4 mt-1 text-[9px] text-[var(--color-figma-text-secondary)]">
                      {note}
                    </div>
                  )}
                </div>
              ))}
              {hiddenCount > 0 && (
                <div className="px-2 py-1.5 text-center bg-[var(--color-figma-bg)]">
                  <button
                    type="button"
                    onClick={() => setShowAllConflicts(true)}
                    className="text-[10px] text-[var(--color-figma-accent)] hover:underline"
                  >
                    Show {hiddenCount} more…
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Import button(s) */}
      {varConflictPreview !== null && varConflictPreview.overwriteCount > 0 && !importing && !hasBlockingDestinationCollisions ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-0.5">
            <button
              onClick={() => handleImportVariables('merge')}
              disabled={totalEnabledSets === 0 || hasInvalidSetNames}
              title={hasInvalidSetNames ? 'Fix invalid set names above before importing' : totalEnabledSets === 0 ? 'Enable at least one mode to import' : undefined}
              className="w-full px-3 py-2 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              {reviewActionCopy.merge.buttonLabel} and import ({varConflictPreview.newCount} new + {varConflictPreview.overwriteCount} updates)
            </button>
            <p className="text-[10px] text-[var(--color-figma-text-tertiary)] px-1">
              {reviewActionCopy.merge.consequence}
            </p>
          </div>
          <div className="flex flex-col gap-0.5">
            <button
              onClick={() => handleImportVariables('overwrite')}
              disabled={totalEnabledSets === 0 || hasInvalidSetNames}
              title={hasInvalidSetNames ? 'Fix invalid set names above before importing' : totalEnabledSets === 0 ? 'Enable at least one mode to import' : undefined}
              className="w-full px-3 py-1.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] font-medium hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 transition-colors"
            >
              {reviewActionCopy.overwrite.buttonLabel} and import ({totalEnabledTokens} token{totalEnabledTokens !== 1 ? 's' : ''})
            </button>
            <p className="text-[10px] text-[var(--color-figma-text-tertiary)] px-1">
              {reviewActionCopy.overwrite.consequence}
            </p>
          </div>
          <div className="flex flex-col gap-0.5">
            <button
              onClick={() => handleImportVariables('skip')}
              disabled={totalEnabledSets === 0 || hasInvalidSetNames}
              title={hasInvalidSetNames ? 'Fix invalid set names above before importing' : totalEnabledSets === 0 ? 'Enable at least one mode to import' : undefined}
              className="w-full px-3 py-1.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] font-medium hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 transition-colors"
            >
              {reviewActionCopy.skip.buttonLabel} ({varConflictPreview.newCount} new only)
            </button>
            <p className="text-[10px] text-[var(--color-figma-text-tertiary)] px-1">
              {reviewActionCopy.skip.consequence}
            </p>
          </div>
          {hasInvalidSetNames && (
            <p className="text-[10px] text-[var(--color-figma-error,#e53935)] text-center">Fix invalid set names above before importing</p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <button
            onClick={() => handleImportVariables('overwrite')}
            disabled={totalEnabledSets === 0 || importing || hasInvalidSetNames || hasBlockingDestinationCollisions}
            title={importDisabledMessage ?? undefined}
            className="w-full px-3 py-2 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {importing
              ? importProgress
                ? `Importing set ${importProgress.done}/${importProgress.total}…`
                : 'Importing…'
              : hasBlockingDestinationCollisions
                ? 'Resolve destination collisions to import'
                : `Import ${totalEnabledTokens} token${totalEnabledTokens !== 1 ? 's' : ''} into ${totalEnabledSets} set${totalEnabledSets !== 1 ? 's' : ''}`}
          </button>
          {!importing && totalEnabledSets === 0 && !hasInvalidSetNames && !hasBlockingDestinationCollisions && (
            <p className="text-[10px] text-[var(--color-figma-text-secondary)] text-center">Enable at least one mode above to import</p>
          )}
          {!importing && hasInvalidSetNames && (
            <p className="text-[10px] text-[var(--color-figma-error,#e53935)] text-center">Fix invalid set names above before importing</p>
          )}
          {!importing && hasBlockingDestinationCollisions && !hasInvalidSetNames && (
            <p className="text-[10px] text-[var(--color-figma-error,#e53935)] text-center">
              {importDisabledMessage}
            </p>
          )}
        </div>
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
