import { useState } from 'react';
import {
  useImportDestinationContext,
  useImportReviewContext,
  useImportSourceContext,
} from './ImportPanelContext';
import { ImportConflictResolver } from './ImportConflictResolver';
import { renderConflictValue } from './importPanelHelpers';

const MAX_PREVIEW_CONFLICTS = 60;

export function ImportStylesFooter() {
  const { targetCollectionId } = useImportDestinationContext();
  const { selectedTokens, tokens } = useImportSourceContext();
  const {
    existingPathsFetching,
    existingTokenMapError,
    existingTokenMap,
    previewNewCount,
    previewOverwriteCount,
    conflictPaths,
    importing,
    importProgress,
    checkingConflicts,
    handleImportStyles,
  } = useImportReviewContext();

  const [previewConflictsExpanded, setPreviewConflictsExpanded] = useState(false);
  const [showAllPreviewConflicts, setShowAllPreviewConflicts] = useState(false);

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
    <div className="p-3 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] flex flex-col gap-1.5">
      <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
        Into <span className="font-mono text-[var(--color-figma-text)]">{targetCollectionId}</span>
      </div>

      {/* Preview summary */}
      {tokens.length > 0 && (existingPathsFetching || previewNewCount !== null || existingTokenMapError !== null) && (
        <div className="flex items-center gap-2 text-[10px]">
          {existingPathsFetching ? (
            <span className="text-[var(--color-figma-text-secondary)]">Checking existing tokens...</span>
          ) : existingTokenMapError !== null ? (
            <span className="text-[var(--color-figma-warning,#e8a100)]" title={existingTokenMapError}>
              Conflict detection unavailable
            </span>
          ) : previewNewCount !== null && previewOverwriteCount !== null && (
            <>
              {previewNewCount > 0 && (
                <span className="text-[var(--color-figma-success,#16a34a)]">{previewNewCount} new</span>
              )}
              {previewNewCount > 0 && previewOverwriteCount > 0 && (
                <span className="text-[var(--color-figma-border)]">&middot;</span>
              )}
              {previewOverwriteCount > 0 && (
                <span className="text-[var(--color-figma-warning,#e8a100)]">
                  {previewOverwriteCount} conflict{previewOverwriteCount !== 1 ? 's' : ''}
                </span>
              )}
              {previewNewCount === 0 && previewOverwriteCount === 0 && (
                <span className="text-[var(--color-figma-text-secondary)]">No tokens selected</span>
              )}
            </>
          )}
        </div>
      )}

      {/* Pre-import conflict diff */}
      {conflictPaths === null && conflictingPreviewTokens !== null && conflictingPreviewTokens.length > 0 && !importing && (
        <>
          <button
            type="button"
            onClick={() => setPreviewConflictsExpanded(v => !v)}
            className="flex items-center gap-1 text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
          >
            <svg
              width="8" height="8" viewBox="0 0 8 8" fill="currentColor"
              className={`transition-transform ${previewConflictsExpanded ? 'rotate-90' : ''}`}
            >
              <path d="M2 1l4 3-4 3V1z" />
            </svg>
            {previewConflictsExpanded ? 'Hide' : 'Show'} {previewOverwriteCount} conflict{previewOverwriteCount !== 1 ? 's' : ''}
          </button>

          {previewConflictsExpanded && (
            <div className="max-h-[180px] overflow-y-auto rounded border border-[var(--color-figma-border)] divide-y divide-[var(--color-figma-border)]">
              {conflictingPreviewTokens.map(({ incoming, existing }) => (
                <div key={incoming.path} className="px-2 py-1 bg-[var(--color-figma-bg)]">
                  <span className="text-[10px] font-mono text-[var(--color-figma-text)] truncate block mb-0.5" title={incoming.path}>
                    {incoming.path}
                  </span>
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
              {hiddenPreviewCount > 0 && (
                <div className="px-2 py-1 text-center bg-[var(--color-figma-bg)]">
                  <button type="button" onClick={() => setShowAllPreviewConflicts(true)} className="text-[10px] text-[var(--color-figma-accent)] hover:underline">
                    Show {hiddenPreviewCount} more...
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Conflict resolver or import button */}
      {conflictPaths !== null && conflictPaths.length > 0 ? (
        <ImportConflictResolver />
      ) : (
        <button
          onClick={handleImportStyles}
          disabled={selectedTokens.size === 0 || importing || checkingConflicts}
          className="w-full px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          {checkingConflicts
            ? 'Checking for conflicts...'
            : importing
              ? importProgress
                ? `Importing ${importProgress.done}/${importProgress.total}...`
                : 'Importing...'
              : hasPreviewConflicts
                ? `Review ${previewConflictCount} conflict${previewConflictCount !== 1 ? 's' : ''}`
                : `Import ${selectedTokens.size} token${selectedTokens.size !== 1 ? 's' : ''}`}
        </button>
      )}

      {/* Progress bar */}
      {importing && importProgress && importProgress.total > 0 && conflictPaths === null && (
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
