import {
  useImportDestinationContext,
  useImportReviewContext,
  useImportSourceContext,
} from './ImportPanelContext';
import { getSourceDefinition } from './importPanelTypes';
import { SET_NAME_RE } from '../shared/utils';

export function ImportFileDestinationRules() {
  const { source, tokens, continueToPreview } = useImportSourceContext();
  const {
    targetSet,
    sets,
    setsError,
    newSetInputVisible,
    newSetDraft,
    newSetError,
    canContinueToPreview,
    setNewSetInputVisible,
    setNewSetDraft,
    setNewSetError,
    commitNewSet,
    cancelNewSet,
    setTargetSetAndPersist,
    fetchSets,
  } = useImportDestinationContext();
  const { clearConflictState } = useImportReviewContext();

  const sourceDefinition = getSourceDefinition(source);
  const destinationLabel = sourceDefinition?.destinationDescription
    ?? (source === 'styles'
      ? 'Send the selected styles into one existing set or create a new one before reviewing conflicts.'
      : 'Choose the token set that should receive this import before reviewing the parsed tokens.');

  return (
    <div className="flex flex-col gap-2 rounded-[14px] border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-3">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-figma-text-tertiary)]">
          Destination rules
        </div>
        <div className="mt-0.5 text-[11px] text-[var(--color-figma-text-secondary)]">
          {destinationLabel}
        </div>
      </div>

      {newSetInputVisible ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-1.5">
            <input
              autoFocus
              type="text"
              value={newSetDraft}
              onChange={(e) => {
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
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitNewSet();
                if (e.key === 'Escape') cancelNewSet();
              }}
              placeholder="New set name…"
              aria-invalid={newSetError ? true : undefined}
              className={`flex-1 rounded border bg-[var(--color-figma-bg)] px-2 py-1.5 text-[11px] text-[var(--color-figma-text)] outline-none ${newSetError ? 'border-[var(--color-figma-error,#e53935)]' : 'border-[var(--color-figma-accent)]'}`}
            />
            <button
              onClick={commitNewSet}
              disabled={!newSetDraft.trim() || !!newSetError}
              className="rounded bg-[var(--color-figma-accent)] px-2 py-1.5 text-[10px] font-medium text-white hover:opacity-90 disabled:opacity-40"
            >
              Create
            </button>
            <button
              onClick={cancelNewSet}
              className="rounded border border-[var(--color-figma-border)] px-2 py-1.5 text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
            >
              Cancel
            </button>
          </div>
          {newSetError && (
            <p role="alert" className="text-[10px] text-[var(--color-figma-error,#e53935)]">
              {newSetError}
            </p>
          )}
          {!newSetError && newSetDraft.trim() && sets.includes(newSetDraft.trim()) && (
            <p className="text-[10px] text-[var(--color-figma-warning,#e8a100)]">
              Set already exists. The incoming tokens will merge into it.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <label className="shrink-0 text-[10px] text-[var(--color-figma-text-secondary)]">
              Target set
            </label>
            <select
              value={targetSet}
              onChange={(e) => {
                clearConflictState();
                if (e.target.value === '__new__') {
                  setNewSetInputVisible(true);
                } else {
                  setTargetSetAndPersist(e.target.value);
                }
              }}
              className="flex-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5 text-[11px] text-[var(--color-figma-text)] outline-none"
            >
              {sets.map((setName) => (
                <option key={setName} value={setName}>
                  {setName}
                </option>
              ))}
              {!sets.includes(targetSet) && targetSet && (
                <option value={targetSet}>
                  {targetSet} (new)
                </option>
              )}
              <option value="__new__">+ New set…</option>
            </select>
          </div>
          {setsError ? (
            <p className="text-[10px] text-[var(--color-figma-error,#e53935)]">
              Could not load sets.{' '}
              <button type="button" onClick={fetchSets} className="underline hover:opacity-80">
                Retry
              </button>
            </p>
          ) : (
            <p className="text-[10px] text-[var(--color-figma-text-tertiary)]">
              Pick an existing set or{' '}
              <button
                type="button"
                onClick={() => setNewSetInputVisible(true)}
                className="underline hover:text-[var(--color-figma-text-secondary)]"
              >
                create a new set
              </button>
              {' '}for this import.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1">
        <button
          onClick={continueToPreview}
          disabled={!canContinueToPreview}
          className="w-full rounded bg-[var(--color-figma-accent)] px-3 py-2 text-[11px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          Continue to preview {tokens.length > 0 ? `(${tokens.length} token${tokens.length === 1 ? '' : 's'})` : ''}
        </button>
        {!canContinueToPreview && (
          <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
            Finish choosing a valid destination before reviewing the parsed import.
          </p>
        )}
      </div>
    </div>
  );
}
