import {
  useImportDestinationContext,
  useImportSourceContext,
} from './ImportPanelContext';
import { defaultCollectionName, modeKey } from './importPanelTypes';
import { COLLECTION_NAME_RE } from '../shared/utils';

export function ImportVariablesView() {
  const { collectionData, handleBack } = useImportSourceContext();
  const {
    modeEnabled,
    modeCollectionNames,
    collectionModeDestinationStatus,
    setModeEnabled,
    setModeCollectionNames,
  } = useImportDestinationContext();

  return (
    <>
      <div className="pb-1 border-b border-[var(--color-figma-border)]">
        <button
          onClick={handleBack}
          className="flex items-center gap-1 text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 2L3 5l3 3" />
          </svg>
          Back
        </button>
      </div>

      {collectionData.map(col => (
        <div key={col.name} className="rounded border border-[var(--color-figma-border)] overflow-hidden">
          <div className="px-2 py-1 bg-[var(--color-figma-bg-secondary)] border-b border-[var(--color-figma-border)] flex items-center gap-2">
            <span className="text-[11px] font-medium text-[var(--color-figma-text)] flex-1 truncate">
              {col.name}
            </span>
            <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
              {col.modes.reduce((a, m) => a + m.tokens.length, 0)} tokens
            </span>
          </div>

          <div className="divide-y divide-[var(--color-figma-border)]">
            {col.modes.map(mode => {
              const key = modeKey(col.name, mode.modeId);
              const enabled = modeEnabled[key] ?? true;
              const collectionId =
                modeCollectionNames[key] ??
                defaultCollectionName(col.name, mode.modeName, col.modes.length);
              const trimmedName = collectionId.trim();
              const destinationStatus = collectionModeDestinationStatus[key];
              const collectionNameError = enabled
                ? !trimmedName
                  ? 'Name cannot be empty'
                  : !COLLECTION_NAME_RE.test(trimmedName)
                    ? 'Use letters, numbers, - _ (/ for folders)'
                    : null
                : null;
              const duplicatePathError = enabled && !collectionNameError && (destinationStatus?.ambiguousPathCount ?? 0) > 0
                ? destinationStatus?.ambiguousPathCount === 1
                  ? 'Shares 1 path with another enabled mode'
                  : `Shares ${destinationStatus?.ambiguousPathCount} paths with other enabled modes`
                : null;
              const inputError = collectionNameError ?? duplicatePathError;
              const inputErrorDetail = collectionNameError
                ? collectionNameError
                : duplicatePathError
                  ? `${duplicatePathError}. Change the name or disable an overlapping mode.`
                  : null;
              const isSharedDestination = enabled && !collectionNameError && (destinationStatus?.sharedDestinationCount ?? 1) > 1;

              return (
                <div key={mode.modeId} className={`flex items-start gap-2 px-2 py-1.5 ${enabled ? '' : 'opacity-50'}`}>
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={e => setModeEnabled(prev => ({ ...prev, [key]: e.target.checked }))}
                    className="accent-[var(--color-figma-accent)] shrink-0 mt-0.5"
                  />
                  <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] font-medium shrink-0 ${enabled ? 'text-[var(--color-figma-text)]' : 'text-[var(--color-figma-text-secondary)] line-through'}`}>
                        {mode.modeName}
                      </span>
                      <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                        {mode.tokens.length}
                      </span>
                    </div>
                    <input
                      type="text"
                      value={collectionId}
                      disabled={!enabled}
                      onChange={e => setModeCollectionNames(prev => ({ ...prev, [key]: e.target.value }))}
                      className={`w-full px-1.5 py-0.5 rounded bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] text-[10px] font-mono focus-visible:outline-none disabled:opacity-50 ${inputError ? 'border-[var(--color-figma-error,#e53935)] focus-visible:border-[var(--color-figma-error,#e53935)]' : 'border-[var(--color-figma-border)] focus-visible:border-[var(--color-figma-accent)]'}`}
                      placeholder="collection-name"
                      aria-label="Collection name for mode"
                      aria-invalid={inputError ? true : undefined}
                      aria-describedby={inputError ? `err-${key}` : undefined}
                    />
                    {inputErrorDetail && (
                      <p id={`err-${key}`} role="alert" className="text-[10px] text-[var(--color-figma-error,#e53935)] leading-tight">
                        {inputErrorDetail}
                      </p>
                    )}
                    {!inputError && isSharedDestination && (
                      <p className="text-[10px] text-[var(--color-figma-text-secondary)] leading-tight">
                        All enabled modes will combine into this collection.
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}
