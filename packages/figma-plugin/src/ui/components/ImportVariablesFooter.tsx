import { useState } from 'react';
import {
  useImportDestinationContext,
  useImportReviewContext,
} from './ImportPanelContext';
import { renderConflictValue } from './importPanelHelpers';
import { Spinner } from './Spinner';

const MAX_VISIBLE_CONFLICTS = 60;

type Strategy = 'merge' | 'overwrite' | 'skip';

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

  const [showAllConflicts, setShowAllConflicts] = useState(false);
  const [strategy, setStrategy] = useState<Strategy>('merge');

  const hasConflicts = varConflictPreview !== null && varConflictPreview.overwriteCount > 0;
  const hasBlockingCollisions = hasAmbiguousCollectionImport;
  const visibleDetails = varConflictDetails
    ? showAllConflicts ? varConflictDetails : varConflictDetails.slice(0, MAX_VISIBLE_CONFLICTS)
    : null;
  const hiddenCount = varConflictDetails && !showAllConflicts
    ? Math.max(0, varConflictDetails.length - MAX_VISIBLE_CONFLICTS)
    : 0;

  const canImport = totalEnabledSets > 0 && !hasInvalidModeSetNames && !hasBlockingCollisions && !importing;
  const importTokenCount = strategy === 'skip' && varConflictPreview
    ? varConflictPreview.newCount
    : totalEnabledTokens;

  return (
    <div className="p-3 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] flex flex-col gap-1.5">
      {/* Conflict check status */}
      {checkingVarConflicts && (
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-figma-text-secondary)]">
          <Spinner size="xs" className="text-[var(--color-figma-text-secondary)]" />
          Checking for conflicts...
        </div>
      )}

      {/* Conflict summary */}
      {!checkingVarConflicts && varConflictPreview !== null && (
        <div className="flex items-center gap-2 text-[10px]">
          {varConflictPreview.newCount > 0 && (
            <span className="text-[var(--color-figma-success,#16a34a)]">
              {varConflictPreview.newCount} new
            </span>
          )}
          {varConflictPreview.overwriteCount > 0 && (
            <>
              {varConflictPreview.newCount > 0 && <span className="text-[var(--color-figma-border)]">&middot;</span>}
              <span className="text-[var(--color-figma-warning,#e8a100)]">
                {varConflictPreview.overwriteCount} conflict{varConflictPreview.overwriteCount !== 1 ? 's' : ''}
              </span>
            </>
          )}
          {varConflictPreview.newCount === 0 && varConflictPreview.overwriteCount === 0 && totalEnabledSets > 0 && (
            <span className="text-[var(--color-figma-text-secondary)]">No conflicts</span>
          )}
        </div>
      )}

      {/* Blocking collision warning */}
      {hasBlockingCollisions && !importing && (
        <div className="text-[10px] text-[var(--color-figma-error,#e53935)]">
          {ambiguousCollectionImportCount} duplicate destination path{ambiguousCollectionImportCount !== 1 ? 's' : ''} — fix above to import.
        </div>
      )}

      {/* Conflict details toggle */}
      {hasConflicts && varConflictDetails !== null && varConflictDetails.length > 0 && !importing && (
        <>
          <button
            type="button"
            onClick={() => setVarConflictDetailsExpanded(v => !v)}
            className="flex items-center gap-1 text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
          >
            <svg
              width="8" height="8" viewBox="0 0 8 8" fill="currentColor"
              className={`transition-transform ${varConflictDetailsExpanded ? 'rotate-90' : ''}`}
            >
              <path d="M2 1l4 3-4 3V1z" />
            </svg>
            {varConflictDetailsExpanded ? 'Hide' : 'Show'} {varConflictDetails.length} conflict{varConflictDetails.length !== 1 ? 's' : ''}
          </button>

          {varConflictDetailsExpanded && (
            <div className="max-h-[180px] overflow-y-auto rounded border border-[var(--color-figma-border)] divide-y divide-[var(--color-figma-border)]">
              {visibleDetails!.map(({ path, setName, existing, incoming, kind }) => (
                <div key={`${setName}:${path}`} className="px-2 py-1 bg-[var(--color-figma-bg)]">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span className="text-[10px] font-mono text-[var(--color-figma-text)] truncate flex-1" title={path}>{path}</span>
                    {kind === 'incoming-duplicate' && (
                      <span className="rounded px-1 py-0.5 text-[8px] font-medium bg-[var(--color-figma-warning,#f59e0b)]/12 text-[var(--color-figma-warning,#e8a100)]">dup</span>
                    )}
                  </div>
                  <div className="flex flex-col gap-0.5 text-[10px] font-mono">
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
              {hiddenCount > 0 && (
                <div className="px-2 py-1 text-center bg-[var(--color-figma-bg)]">
                  <button type="button" onClick={() => setShowAllConflicts(true)} className="text-[10px] text-[var(--color-figma-accent)] hover:underline">
                    Show {hiddenCount} more...
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Strategy selector — only when conflicts exist */}
      {hasConflicts && !importing && !hasBlockingCollisions && (
        <div className="flex rounded border border-[var(--color-figma-border)] overflow-hidden">
          {(['merge', 'overwrite', 'skip'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStrategy(s)}
              className={`flex-1 py-1 text-[10px] font-medium transition-colors ${
                strategy === s
                  ? 'bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]'
                  : 'bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
              }`}
            >
              {reviewActionCopy[s].label}
            </button>
          ))}
        </div>
      )}

      {/* Import button */}
      <button
        onClick={() => handleImportVariables(hasConflicts ? strategy : 'overwrite')}
        disabled={!canImport}
        className="w-full px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
      >
        {importing
          ? importProgress
            ? `Importing ${importProgress.done}/${importProgress.total}...`
            : 'Importing...'
          : `Import ${importTokenCount} token${importTokenCount !== 1 ? 's' : ''} into ${totalEnabledSets} set${totalEnabledSets !== 1 ? 's' : ''}`}
      </button>

      {/* Error messages */}
      {!importing && hasInvalidModeSetNames && (
        <p className="text-[10px] text-[var(--color-figma-error,#e53935)] text-center">Fix invalid set names above</p>
      )}
      {!importing && totalEnabledSets === 0 && !hasInvalidModeSetNames && !hasBlockingCollisions && (
        <p className="text-[10px] text-[var(--color-figma-text-secondary)] text-center">Enable at least one mode to import</p>
      )}

      {/* Progress bar */}
      {importing && importProgress && importProgress.total > 0 && (
        <div className="w-full h-1 rounded-full bg-[var(--color-figma-border)] overflow-hidden">
          <div
            className="h-full rounded-full bg-[var(--color-figma-accent)] transition-all duration-300"
            style={{ width: `${Math.round((importProgress.done / importProgress.total) * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}
