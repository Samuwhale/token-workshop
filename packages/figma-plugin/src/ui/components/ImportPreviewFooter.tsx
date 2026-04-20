import {
  useImportDestinationContext,
  useImportReviewContext,
  useImportSourceContext,
} from './ImportPanelContext';
import { ImportConflictResolver } from './ImportConflictResolver';
import { COLLECTION_NAME_RE } from '../shared/utils';

export function ImportPreviewFooter() {
  const { tokens, selectedTokens } = useImportSourceContext();
  const {
    targetCollectionId,
    collectionIds,
    collectionsError,
    newCollectionInputVisible,
    newCollectionDraft,
    newCollectionError,
    setNewCollectionInputVisible,
    setNewCollectionDraft,
    setNewCollectionError,
    commitNewCollection,
    cancelNewCollection,
    setTargetCollectionIdAndPersist,
    fetchCollections,
  } = useImportDestinationContext();
  const {
    existingPathsFetching,
    existingTokenMapError,
    previewNewCount,
    previewOverwriteCount,
    conflictPaths,
    importing,
    importProgress,
    checkingConflicts,
    handleImportStyles,
    executeImport,
    clearConflictState,
  } = useImportReviewContext();

  const hasPreviewConflicts = conflictPaths === null && (previewOverwriteCount ?? 0) > 0;
  const previewConflictCount = previewOverwriteCount ?? 0;

  // If conflict resolver is active (after user clicked "Review individually" and conflicts were fetched)
  if (conflictPaths !== null && conflictPaths.length > 0) {
    return (
      <div className="p-3 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
        <ImportConflictResolver />
      </div>
    );
  }

  return (
    <div className="p-3 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] flex flex-col gap-1.5">
      {/* Collection picker */}
      {newCollectionInputVisible ? (
        <div className="flex flex-col gap-1">
          <div className="flex gap-1.5">
            <input
              autoFocus
              type="text"
              value={newCollectionDraft}
              onChange={(e) => {
                const val = e.target.value;
                setNewCollectionDraft(val);
                const trimmed = val.trim();
                if (!trimmed) {
                  setNewCollectionError(null);
                } else if (!COLLECTION_NAME_RE.test(trimmed)) {
                  setNewCollectionError('Use letters, numbers, - _ (/ for folders)');
                } else {
                  setNewCollectionError(null);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitNewCollection();
                if (e.key === 'Escape') cancelNewCollection();
              }}
              placeholder="New collection name…"
              className={`flex-1 rounded border bg-[var(--color-figma-bg)] px-2 py-1 text-body text-[var(--color-figma-text)] outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-figma-accent)] ${newCollectionError ? 'border-[var(--color-figma-error,#e53935)]' : 'border-[var(--color-figma-accent)]'}`}
            />
            <button
              onClick={commitNewCollection}
              disabled={!newCollectionDraft.trim() || !!newCollectionError}
              className="rounded bg-[var(--color-figma-accent)] px-2 py-1 text-secondary font-medium text-white hover:opacity-90 disabled:opacity-40"
            >
              Create
            </button>
            <button
              onClick={cancelNewCollection}
              className="rounded border border-[var(--color-figma-border)] px-2 py-1 text-secondary text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
            >
              Cancel
            </button>
          </div>
          {newCollectionError && (
            <p role="alert" className="text-secondary text-[var(--color-figma-error,#e53935)]">
              {newCollectionError}
            </p>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <label className="shrink-0 text-secondary text-[var(--color-figma-text-secondary)]">Into</label>
          <select
            value={targetCollectionId}
            onChange={(e) => {
              if (e.target.value === '__new__') {
                setNewCollectionInputVisible(true);
              } else {
                clearConflictState();
                setTargetCollectionIdAndPersist(e.target.value);
              }
            }}
            className="flex-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-body text-[var(--color-figma-text)] outline-none focus-visible:border-[var(--color-figma-accent)]"
          >
            {collectionIds.map((id) => (
              <option key={id} value={id}>{id}</option>
            ))}
            {!collectionIds.includes(targetCollectionId) && targetCollectionId && (
              <option value={targetCollectionId}>{targetCollectionId} (new)</option>
            )}
            <option value="__new__">+ New collection…</option>
          </select>
        </div>
      )}

      {collectionsError && (
        <p className="text-secondary text-[var(--color-figma-error,#e53935)]">
          Could not load collections.{' '}
          <button type="button" onClick={fetchCollections} className="underline hover:opacity-80">Retry</button>
        </p>
      )}

      {/* Conflict summary */}
      {tokens.length > 0 && (existingPathsFetching || previewNewCount !== null || existingTokenMapError !== null) && (
        <div className="flex items-center justify-between gap-2 text-secondary">
          <div className="flex items-center gap-2">
            {existingPathsFetching ? (
              <span className="text-[var(--color-figma-text-secondary)]">Checking existing tokens...</span>
            ) : existingTokenMapError !== null ? (
              <span className="text-[var(--color-figma-warning,#e8a100)]">Conflict detection unavailable</span>
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
                    {previewOverwriteCount} existing
                  </span>
                )}
              </>
            )}
          </div>
          {hasPreviewConflicts && (
            <button
              onClick={handleImportStyles}
              className="text-secondary text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]"
            >
              Review individually&hellip;
            </button>
          )}
        </div>
      )}

      {/* Import button — uses bulk overwrite when conflicts exist */}
      <button
        onClick={() => {
          if (hasPreviewConflicts) {
            executeImport("overwrite");
          } else {
            handleImportStyles();
          }
        }}
        disabled={selectedTokens.size === 0 || importing || checkingConflicts}
        className="w-full px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-body font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
      >
        {checkingConflicts
          ? 'Checking for conflicts...'
          : importing
            ? importProgress
              ? `Importing ${importProgress.done}/${importProgress.total}...`
              : 'Importing...'
            : hasPreviewConflicts
              ? `Replace ${previewConflictCount} existing · Import ${selectedTokens.size} tokens`
              : `Import ${selectedTokens.size} token${selectedTokens.size !== 1 ? 's' : ''}`}
      </button>

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
