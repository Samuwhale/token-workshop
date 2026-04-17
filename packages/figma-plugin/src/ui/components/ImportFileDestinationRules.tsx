import {
  useImportDestinationContext,
  useImportReviewContext,
  useImportSourceContext,
} from './ImportPanelContext';
import { COLLECTION_NAME_RE } from '../shared/utils';

export function ImportFileDestinationRules() {
  const { tokens, continueToPreview, handleBack } = useImportSourceContext();
  const {
    targetCollectionId,
    collectionIds,
    collectionsError,
    newCollectionInputVisible,
    newCollectionDraft,
    newCollectionError,
    canContinueToPreview,
    setNewCollectionInputVisible,
    setNewCollectionDraft,
    setNewCollectionError,
    commitNewCollection,
    cancelNewCollection,
    setTargetCollectionIdAndPersist,
    fetchCollections,
  } = useImportDestinationContext();
  const { clearConflictState } = useImportReviewContext();

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleBack}
        className="flex items-center gap-1.5 text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors self-start"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 2L3 5l3 3" />
        </svg>
        Back
      </button>

      {newCollectionInputVisible ? (
        <div className="flex flex-col gap-1.5">
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
              aria-invalid={newCollectionError ? true : undefined}
              className={`flex-1 rounded border bg-[var(--color-figma-bg)] px-2 py-1 text-[11px] text-[var(--color-figma-text)] outline-none ${newCollectionError ? 'border-[var(--color-figma-error,#e53935)]' : 'border-[var(--color-figma-accent)]'}`}
            />
            <button
              onClick={commitNewCollection}
              disabled={!newCollectionDraft.trim() || !!newCollectionError}
              className="rounded bg-[var(--color-figma-accent)] px-2 py-1 text-[10px] font-medium text-white hover:opacity-90 disabled:opacity-40"
            >
              Create
            </button>
            <button
              onClick={cancelNewCollection}
              className="rounded border border-[var(--color-figma-border)] px-2 py-1 text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
            >
              Cancel
            </button>
          </div>
          {newCollectionError && (
            <p role="alert" className="text-[10px] text-[var(--color-figma-error,#e53935)]">
              {newCollectionError}
            </p>
          )}
          {!newCollectionError &&
            newCollectionDraft.trim() &&
            collectionIds.includes(newCollectionDraft.trim()) && (
            <p className="text-[10px] text-[var(--color-figma-warning,#e8a100)]">
              Collection already exists — tokens will merge into it.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <label className="shrink-0 text-[10px] text-[var(--color-figma-text-secondary)]">
              Target collection
            </label>
            <select
              value={targetCollectionId}
              onChange={(e) => {
                clearConflictState();
                if (e.target.value === '__new__') {
                  setNewCollectionInputVisible(true);
                } else {
                  setTargetCollectionIdAndPersist(e.target.value);
                }
              }}
              className="flex-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[11px] text-[var(--color-figma-text)] outline-none"
            >
              {collectionIds.map((collectionId) => (
                <option key={collectionId} value={collectionId}>
                  {collectionId}
                </option>
              ))}
              {!collectionIds.includes(targetCollectionId) && targetCollectionId && (
                <option value={targetCollectionId}>
                  {targetCollectionId} (new)
                </option>
              )}
              <option value="__new__">+ New collection…</option>
            </select>
          </div>
          {collectionsError && (
            <p className="text-[10px] text-[var(--color-figma-error,#e53935)]">
              Could not load collections.{' '}
              <button type="button" onClick={fetchCollections} className="underline hover:opacity-80">
                Retry
              </button>
            </p>
          )}
        </div>
      )}

      <button
        onClick={continueToPreview}
        disabled={!canContinueToPreview}
        className="w-full rounded bg-[var(--color-figma-accent)] px-3 py-1.5 text-[11px] font-medium text-white hover:opacity-90 disabled:opacity-40"
      >
        Continue to preview {tokens.length > 0 ? `(${tokens.length} token${tokens.length === 1 ? '' : 's'})` : ''}
      </button>
    </div>
  );
}
