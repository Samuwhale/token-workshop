import { useImportPanel } from './ImportPanelContext';
import { defaultSetName, getSourceDefinition, modeKey } from './importPanelTypes';
import { SET_NAME_RE } from '../shared/utils';

export function ImportVariablesView() {
  const {
    collectionData,
    modeEnabled,
    modeSetNames,
    collectionModeDestinationStatus,
    sets,
    source,
    handleBack,
    setModeEnabled,
    setModeSetNames,
  } = useImportPanel();

  const sourceDefinition = getSourceDefinition(source);
  const sourceLabel = sourceDefinition?.label ?? 'Imported collections';
  const destinationDescription = sourceDefinition?.destinationDescription ?? 'Each enabled mode will be imported as a separate token set.';

  return (
    <>
      {/* Header row */}
      <div className="flex items-center gap-2 pb-1 border-b border-[var(--color-figma-border)]">
        <button
          onClick={handleBack}
          className="flex items-center gap-1.5 text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 2L3 5l3 3" />
          </svg>
          Back
        </button>
        <span className="text-[10px] text-[var(--color-figma-text-secondary)] ml-auto">
          {sourceLabel}
        </span>
      </div>

      <div className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide">
        Map to Token Sets
      </div>
      <div className="text-[10px] text-[var(--color-figma-text-secondary)] -mt-2">
        {destinationDescription}
      </div>

      {collectionData.map(col => (
        <div key={col.name} className="rounded border border-[var(--color-figma-border)] overflow-hidden">
          {/* Collection header */}
          <div className="px-3 py-1.5 bg-[var(--color-figma-bg-secondary)] border-b border-[var(--color-figma-border)] flex items-center gap-2">
            <span className="text-[10px] font-semibold text-[var(--color-figma-text-secondary)] uppercase tracking-wide flex-1 truncate">
              {col.name}
            </span>
            <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
              {col.modes.reduce((a, m) => a + m.tokens.length, 0)} tokens
            </span>
          </div>

          {/* Mode rows */}
          <div className="divide-y divide-[var(--color-figma-border)]">
            {col.modes.map(mode => {
              const key = modeKey(col.name, mode.modeId);
              const enabled = modeEnabled[key] ?? true;
              const setName = modeSetNames[key] ?? defaultSetName(col.name, mode.modeName, col.modes.length);
              const trimmedName = setName.trim();
              const destinationStatus = collectionModeDestinationStatus[key];
              const setNameError = enabled
                ? !trimmedName
                  ? 'Name cannot be empty'
                  : !SET_NAME_RE.test(trimmedName)
                    ? 'Use letters, numbers, - _ (/ for folders)'
                    : null
                : null;
              const duplicatePathError = enabled && !setNameError && (destinationStatus?.ambiguousPathCount ?? 0) > 0
                ? destinationStatus?.ambiguousPathCount === 1
                  ? 'Shares 1 token path with another enabled mode targeting this set'
                  : `Shares ${destinationStatus?.ambiguousPathCount} token paths with other enabled modes targeting this set`
                : null;
              const inputError = setNameError ?? duplicatePathError;
              const inputErrorDetail = setNameError
                ? setNameError
                : duplicatePathError
                  ? `${duplicatePathError}. Change the destination name or disable one of the overlapping modes.`
                  : null;
              const isSharedDestination = enabled && !setNameError && (destinationStatus?.sharedDestinationCount ?? 1) > 1;
              return (
                <div key={mode.modeId} className={`flex items-center gap-2 px-3 py-2 transition-colors ${enabled ? 'bg-[var(--color-figma-accent)]/5' : 'bg-transparent opacity-50'}`}>
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={e => setModeEnabled(prev => ({ ...prev, [key]: e.target.checked }))}
                    className="accent-[var(--color-figma-accent)] shrink-0"
                  />
                  <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-medium ${enabled ? 'text-[var(--color-figma-text)]' : 'text-[var(--color-figma-text-secondary)] line-through'}`}>{mode.modeName}</span>
                      <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                        {mode.tokens.length} token{mode.tokens.length !== 1 ? 's' : ''}
                      </span>
                      {enabled && !inputError && (sets.includes(trimmedName) ? (
                        <span className="text-[8px] px-1 py-0.5 rounded bg-[var(--color-figma-warning,#f59e0b)]/10 text-[var(--color-figma-warning,#e8a100)] font-medium">existing</span>
                      ) : trimmedName ? (
                        <span className="text-[8px] px-1 py-0.5 rounded bg-[var(--color-figma-success,#22c55e)]/10 text-[var(--color-figma-success,#16a34a)] font-medium">new</span>
                      ) : null)}
                      {isSharedDestination && (
                        <span className="text-[8px] px-1 py-0.5 rounded bg-[var(--color-figma-accent)]/12 text-[var(--color-figma-accent)] font-medium">
                          combined
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1 text-[10px] text-[var(--color-figma-text-secondary)]">
                        <span className="shrink-0">→</span>
                        <input
                          type="text"
                          value={setName}
                          disabled={!enabled}
                          onChange={e => setModeSetNames(prev => ({ ...prev, [key]: e.target.value }))}
                          className={`flex-1 min-w-0 px-1.5 py-0.5 rounded bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] text-[10px] focus-visible:outline-none disabled:opacity-50 font-mono ${inputError ? 'border-[var(--color-figma-error,#e53935)] focus-visible:border-[var(--color-figma-error,#e53935)]' : 'border-[var(--color-figma-border)] focus-visible:border-[var(--color-figma-accent)]'}`}
                          placeholder="set-name"
                          aria-label="Set name for mode"
                          aria-invalid={inputError ? true : undefined}
                          aria-describedby={inputError ? `err-${key}` : undefined}
                        />
                      </div>
                      {inputErrorDetail && (
                        <p id={`err-${key}`} role="alert" className="text-[10px] text-[var(--color-figma-error,#e53935)] leading-tight pl-3">
                          {inputErrorDetail}
                        </p>
                      )}
                      {!inputError && isSharedDestination && (
                        <p className="text-[10px] text-[var(--color-figma-text-secondary)] leading-tight pl-3">
                          This destination will be written once with all enabled mode tokens combined.
                        </p>
                      )}
                    </div>
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
