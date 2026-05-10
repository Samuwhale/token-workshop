import {
  useImportDestinationContext,
  useImportReviewContext,
  useImportSourceContext,
} from './ImportPanelContext';
import { ImportConflictResolver } from './ImportConflictResolver';
import { Button } from '../primitives';
import { COLLECTION_NAME_RE } from '../shared/utils';

function formatCollectionOptionLabel(collectionId: string): string {
  return collectionId.split('/').filter(Boolean).at(-1) ?? collectionId;
}

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
    clearConflictState,
  } = useImportReviewContext();

  const selectedCount = selectedTokens.size;
  const hasPreviewConflicts = conflictPaths === null && (previewOverwriteCount ?? 0) > 0;
  const previewConflictCount = previewOverwriteCount ?? 0;
  const importWithoutConflictCheck = existingTokenMapError !== null;
  const importDisabled = selectedCount === 0 || importing || checkingConflicts;
  const collectionFieldId = 'import-preview-target-collection';
  const newCollectionFieldId = 'import-preview-new-collection';
  const previewStatusTitle = existingPathsFetching
    ? 'Checking current library'
    : existingTokenMapError !== null
      ? 'Could not compare with current tokens'
      : previewNewCount !== null && previewOverwriteCount !== null
        ? [
            `${previewNewCount} new`,
            previewOverwriteCount > 0
              ? `${previewOverwriteCount} match${previewOverwriteCount === 1 ? '' : 'es'}`
              : null,
          ]
            .filter(Boolean)
            .join(' · ')
        : null;
  const previewStatusDetail =
    existingTokenMapError !== null
      ? 'Import may replace tokens with the same path.'
      : previewOverwriteCount && previewOverwriteCount > 0
        ? 'Review matches before you import.'
        : null;

  // Once conflicts have been fetched, swap the footer for the resolver flow.
  if (conflictPaths !== null && conflictPaths.length > 0) {
    return (
      <div className="tm-import-preview-footer border-t border-[var(--color-figma-border)]">
        <ImportConflictResolver />
      </div>
    );
  }

  return (
    <div className="tm-import-preview-footer border-t border-[var(--color-figma-border)]">
      {newCollectionInputVisible ? (
        <div className="flex flex-col gap-1">
          <label
            htmlFor={newCollectionFieldId}
            className="text-secondary font-medium text-[color:var(--color-figma-text-secondary)]"
          >
            New collection
          </label>
          <div className="tm-panel-inline-form">
            <input
              id={newCollectionFieldId}
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
                  setNewCollectionError('Use letters, numbers, -, _, and /.');
                } else {
                  setNewCollectionError(null);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitNewCollection();
                if (e.key === 'Escape') cancelNewCollection();
              }}
              placeholder="Collection name"
              className={`tm-panel-inline-form__field rounded border bg-[var(--color-figma-bg)] px-2 py-1 text-body text-[color:var(--color-figma-text)] outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-figma-accent)] ${newCollectionError ? 'border-[var(--color-figma-error)]' : 'border-[var(--color-figma-accent)]'}`}
              aria-invalid={newCollectionError ? 'true' : undefined}
            />
            <div className="tm-panel-inline-form__actions">
              <Button
                onClick={commitNewCollection}
                disabled={!newCollectionDraft.trim() || !!newCollectionError}
                variant="primary"
                size="sm"
              >
                Create
              </Button>
              <Button onClick={cancelNewCollection} variant="secondary" size="sm">
                Cancel
              </Button>
            </div>
          </div>
          {newCollectionError && (
            <p role="alert" className="text-secondary text-[color:var(--color-figma-text-error)]">
              {newCollectionError}
            </p>
          )}
          {!newCollectionError && (
            <p className="text-secondary text-[color:var(--color-figma-text-tertiary)]">
              Use <code className="font-mono">/</code> only for an existing folder path.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <label
            htmlFor={collectionFieldId}
            className="text-secondary font-medium text-[color:var(--color-figma-text-secondary)]"
          >
            Collection
          </label>
          <div className="tm-panel-inline-form">
            <select
              id={collectionFieldId}
              value={targetCollectionId}
              onChange={(e) => {
                if (e.target.value === '__new__') {
                  setNewCollectionInputVisible(true);
                } else {
                  clearConflictState();
                  setTargetCollectionIdAndPersist(e.target.value);
                }
              }}
              className="tm-panel-inline-form__field rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-body text-[color:var(--color-figma-text)] outline-none focus-visible:border-[var(--color-figma-accent)]"
            >
              {collectionIds.map((id) => {
                const label = formatCollectionOptionLabel(id);
                return (
                  <option key={id} value={id}>
                    {label === id ? id : `${label} (${id})`}
                  </option>
                );
              })}
              {!collectionIds.includes(targetCollectionId) && targetCollectionId && (
                <option value={targetCollectionId}>{targetCollectionId} (new)</option>
              )}
              <option value="__new__">+ New collection…</option>
            </select>
          </div>
        </div>
      )}

      {collectionsError && (
        <p className="text-secondary text-[color:var(--color-figma-text-error)]">
          Could not load collections.{' '}
          <button type="button" onClick={fetchCollections} className="underline hover:opacity-80">Retry</button>
        </p>
      )}

      {tokens.length > 0 && (existingPathsFetching || previewNewCount !== null || existingTokenMapError !== null) && (
        <div className="tm-import-preview-footer__status" aria-live="polite">
          <div className="tm-import-preview-footer__status-copy">
            <p className="tm-import-preview-footer__status-title">
              {selectedCount} selected
              {previewStatusTitle ? ` · ${previewStatusTitle}` : ''}
            </p>
            {previewStatusDetail ? (
              <p className="tm-import-preview-footer__status-detail">
                {previewStatusDetail}
              </p>
            ) : null}
          </div>
          {hasPreviewConflicts && (
            <Button
              onClick={handleImportStyles}
              variant="ghost"
              size="sm"
              wrap
            >
              Review matches
            </Button>
          )}
        </div>
      )}

      <Button
        onClick={handleImportStyles}
        disabled={importDisabled}
        variant="primary"
        wrap
        className="w-full"
      >
        {checkingConflicts
          ? 'Checking matches...'
          : importing
            ? importProgress
              ? `Importing ${importProgress.done}/${importProgress.total}...`
              : 'Importing...'
            : hasPreviewConflicts
              ? `Review ${previewConflictCount} matching token${previewConflictCount === 1 ? "" : "s"}`
              : importWithoutConflictCheck
                ? `Import ${selectedCount} without compare`
              : `Import ${selectedCount} token${selectedCount !== 1 ? 's' : ''}`}
      </Button>

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
