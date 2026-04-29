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

  const selectedCount = selectedTokens.size;
  const hasPreviewConflicts = conflictPaths === null && (previewOverwriteCount ?? 0) > 0;
  const previewConflictCount = previewOverwriteCount ?? 0;
  const importDisabled = selectedCount === 0 || importing || checkingConflicts;

  // Once conflicts have been fetched, swap the footer for the resolver flow.
  if (conflictPaths !== null && conflictPaths.length > 0) {
    return (
      <div className="border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-3">
        <ImportConflictResolver />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-3">
      {newCollectionInputVisible ? (
        <div className="flex flex-col gap-1">
          <div className="tm-panel-inline-form">
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
              className={`tm-panel-inline-form__field rounded border bg-[var(--color-figma-bg)] px-2 py-1 text-body text-[var(--color-figma-text)] outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-figma-accent)] ${newCollectionError ? 'border-[var(--color-figma-error)]' : 'border-[var(--color-figma-accent)]'}`}
            />
            <div className="tm-panel-inline-form__actions">
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
          </div>
          {newCollectionError && (
            <p role="alert" className="text-secondary text-[var(--color-figma-error)]">
              {newCollectionError}
            </p>
          )}
          {!newCollectionError && (
            <p className="text-secondary text-[var(--color-figma-text-tertiary)]">
              Use <code className="font-mono">/</code> only when that name is already part of your system structure.
            </p>
          )}
        </div>
      ) : (
        <div className="tm-panel-inline-form">
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
            className="tm-panel-inline-form__field rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-body text-[var(--color-figma-text)] outline-none focus-visible:border-[var(--color-figma-accent)]"
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
        <p className="text-secondary text-[var(--color-figma-error)]">
          Could not load collections.{' '}
          <button type="button" onClick={fetchCollections} className="underline hover:opacity-80">Retry</button>
        </p>
      )}

      {tokens.length > 0 && (existingPathsFetching || previewNewCount !== null || existingTokenMapError !== null) && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-secondary">
          <div className="flex min-w-0 flex-[1_1_220px] flex-wrap items-center gap-2">
            {existingPathsFetching ? (
              <span className="text-[var(--color-figma-text-secondary)]">Checking existing tokens...</span>
            ) : existingTokenMapError !== null ? (
              <span className="text-[var(--color-figma-warning)]">Conflict detection unavailable</span>
            ) : previewNewCount !== null && previewOverwriteCount !== null && (
              <>
                {previewNewCount > 0 && (
                  <span className="text-[var(--color-figma-success)]">{previewNewCount} new</span>
                )}
                {previewNewCount > 0 && previewOverwriteCount > 0 && (
                  <span className="text-[var(--color-figma-border)]">&middot;</span>
                )}
                {previewOverwriteCount > 0 && (
                  <span className="text-[var(--color-figma-warning)]">
                    {previewOverwriteCount} existing
                  </span>
                )}
              </>
            )}
          </div>
          {hasPreviewConflicts && (
            <button
              onClick={handleImportStyles}
              className="min-w-0 text-secondary text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]"
            >
              Open conflict review&hellip;
            </button>
          )}
        </div>
      )}

      <button
        onClick={handleImportStyles}
        disabled={importDisabled}
        className="w-full rounded bg-[var(--color-figma-accent)] px-3 py-1.5 text-body font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40 whitespace-normal leading-tight text-center"
      >
        {checkingConflicts
          ? 'Checking for conflicts...'
          : importing
            ? importProgress
              ? `Importing ${importProgress.done}/${importProgress.total}...`
              : 'Importing...'
            : hasPreviewConflicts
              ? `Review ${previewConflictCount} conflict${previewConflictCount === 1 ? "" : "s"} before import`
              : `Import ${selectedCount} token${selectedCount !== 1 ? 's' : ''}`}
      </button>

      {hasPreviewConflicts && (
        <button
          type="button"
          onClick={() => executeImport("overwrite")}
          disabled={importDisabled}
          className="w-full rounded px-3 py-1.5 text-body text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] disabled:opacity-40"
        >
          Replace {previewConflictCount} existing token{previewConflictCount === 1 ? "" : "s"}
        </button>
      )}

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
