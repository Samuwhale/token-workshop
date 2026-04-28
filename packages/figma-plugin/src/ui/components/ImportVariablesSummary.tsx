import { useState } from 'react';
import {
  useImportDestinationContext,
  useImportReviewContext,
  useImportSourceContext,
} from './ImportPanelContext';
import { defaultCollectionName, modeKey } from './importPanelTypes';
import { Spinner } from './Spinner';

type Strategy = 'merge' | 'overwrite' | 'skip';

export function ImportVariablesSummary() {
  const { collectionData, handleBack } = useImportSourceContext();
  const {
    collectionIds,
    modeEnabled,
    modeCollectionNames,
    totalEnabledCollections,
    totalEnabledTokens,
    hasInvalidModeCollectionNames,
    hasAmbiguousCollectionImport,
    ambiguousCollectionImportCount,
    hasUnresolvedModeDestinations,
    unresolvedModeDestinationCount,
    setModeCollectionNames,
  } = useImportDestinationContext();
  const {
    varConflictPreview,
    checkingVarConflicts,
    importing,
    importProgress,
    handleImportVariables,
    reviewActionCopy,
  } = useImportReviewContext();

  const [strategy, setStrategy] = useState<Strategy>('merge');
  const [editingCollection, setEditingCollection] = useState<string | null>(null);

  const hasConflicts = varConflictPreview !== null && varConflictPreview.overwriteCount > 0;
  const hasBlockingCollisions = hasAmbiguousCollectionImport;

  const canImport =
    totalEnabledCollections > 0 &&
    !hasInvalidModeCollectionNames &&
    !hasBlockingCollisions &&
    !hasUnresolvedModeDestinations &&
    !importing;

  const importTokenCount = strategy === 'skip' && varConflictPreview
    ? varConflictPreview.newCount
    : totalEnabledTokens;

  // Build summary per Figma collection
  const collectionSummaries = collectionData.map(col => {
    const enabledModes = col.modes.filter(mode => {
      const key = modeKey(col.name, mode.modeId);
      return modeEnabled[key] ?? true;
    });
    const tokenCount = enabledModes.reduce((sum, m) => sum + m.tokens.length, 0);
    const firstModeKey = modeKey(col.name, col.modes[0]?.modeId ?? '');
    const suggestedDestination = defaultCollectionName(
      col.name,
      col.modes[0]?.modeName ?? '',
      col.modes.length,
    );
    const explicitDestination = modeCollectionNames[firstModeKey]?.trim() ?? '';
    const exactMatchDestination =
      collectionIds.includes(col.name)
        ? col.name
        : collectionIds.includes(suggestedDestination)
          ? suggestedDestination
          : '';
    const destinationName = explicitDestination || exactMatchDestination || suggestedDestination;
    const modeNames = enabledModes.map(m => m.modeName);
    const requiresExplicitDestination = enabledModes.some((mode) => {
      const key = modeKey(col.name, mode.modeId);
      const explicitName = modeCollectionNames[key]?.trim() ?? '';
      if (explicitName) {
        return false;
      }
      const suggestedName = defaultCollectionName(col.name, mode.modeName, col.modes.length);
      return !collectionIds.includes(col.name) && !collectionIds.includes(suggestedName);
    });

    return {
      name: col.name,
      destinationName: destinationName.trim(),
      suggestedDestination,
      modeCount: col.modes.length,
      enabledModeCount: enabledModes.length,
      tokenCount,
      modeNames,
      firstModeKey,
      requiresExplicitDestination,
    };
  }).filter(s => s.enabledModeCount > 0);

  // Detect destination name collisions between different Figma collections
  const destinationCounts = new Map<string, number>();
  for (const s of collectionSummaries) {
    destinationCounts.set(s.destinationName, (destinationCounts.get(s.destinationName) ?? 0) + 1);
  }
  const hasNameCollisions = [...destinationCounts.values()].some(c => c > 1);

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={handleBack}
        className="flex items-center gap-1.5 text-secondary text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors self-start"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 2L3 5l3 3" />
        </svg>
        Back
      </button>

      <div className="flex flex-col gap-2">
        {collectionSummaries.map(summary => (
          <div
            key={summary.name}
            className="rounded border border-[var(--color-figma-border)] px-3 py-2"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex min-w-0 flex-[999_1_220px] items-start gap-2">
                <svg width="10" height="10" viewBox="0 0 16 16" fill="var(--color-figma-success)" aria-hidden="true">
                  <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0Zm3.5 5.5L7 10 4.5 7.5l1-1L7 8l3.5-3.5 1 1Z" />
                </svg>
                {editingCollection === summary.name ? (
                  <input
                    autoFocus
                    type="text"
                    value={modeCollectionNames[summary.firstModeKey] ?? summary.destinationName}
                    onChange={e => {
                      const newNames = { ...modeCollectionNames };
                      for (const mode of collectionData.find(c => c.name === summary.name)?.modes ?? []) {
                        newNames[modeKey(summary.name, mode.modeId)] = e.target.value;
                      }
                      setModeCollectionNames(prev => ({ ...prev, ...newNames }));
                    }}
                    onBlur={() => setEditingCollection(null)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setEditingCollection(null); }}
                    className="flex-1 min-w-0 px-1.5 py-0.5 rounded border border-[var(--color-figma-accent)] bg-[var(--color-figma-bg)] text-body font-medium text-[var(--color-figma-text)] outline-none"
                  />
                ) : (
                  <span
                    className={`min-w-0 break-words cursor-pointer text-body hover:text-[var(--color-figma-accent)] ${
                      summary.requiresExplicitDestination
                        ? 'text-[var(--color-figma-text-secondary)]'
                        : 'font-medium text-[var(--color-figma-text)]'
                    }`}
                    onClick={() => {
                      if (summary.requiresExplicitDestination) {
                        const sourceCollection = collectionData.find(
                          (collection) => collection.name === summary.name,
                        );
                        if (sourceCollection) {
                          const nextNames = { ...modeCollectionNames };
                          for (const mode of sourceCollection.modes) {
                            nextNames[modeKey(summary.name, mode.modeId)] = summary.suggestedDestination;
                          }
                          setModeCollectionNames((previous) => ({
                            ...previous,
                            ...nextNames,
                          }));
                        }
                      }
                      setEditingCollection(summary.name);
                    }}
                    title={summary.requiresExplicitDestination ? 'Choose a destination collection' : 'Click to rename'}
                  >
                    {summary.requiresExplicitDestination ? 'Choose destination' : summary.destinationName}
                  </span>
                )}
              </div>
              <span className="shrink-0 text-secondary text-[var(--color-figma-text-secondary)]">
                {summary.tokenCount} tokens
              </span>
            </div>
            {summary.modeCount > 1 && (
              <div className="mt-1 break-words text-secondary text-[var(--color-figma-text-tertiary)]">
                {summary.modeNames.join(', ')}
              </div>
            )}
            {summary.requiresExplicitDestination && (
              <div className="mt-1 text-secondary text-[var(--color-figma-warning)]">
                Choose an existing collection or create "{summary.suggestedDestination}" to continue.
              </div>
            )}
            {hasNameCollisions && destinationCounts.get(summary.destinationName)! > 1 && (
              <div className="mt-1 text-secondary text-[var(--color-figma-error)]">
                Destination name conflicts with another collection — click to rename
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer area */}
      <div className="flex flex-col gap-2 border-t border-[var(--color-figma-border)] pt-2">
        {checkingVarConflicts && (
          <div className="flex items-center gap-2 text-secondary text-[var(--color-figma-text-secondary)]">
            <Spinner size="xs" className="text-[var(--color-figma-text-secondary)]" />
            Checking for conflicts...
          </div>
        )}

        {!checkingVarConflicts && varConflictPreview !== null && (
          <div className="flex flex-wrap items-center gap-2 text-secondary">
            {varConflictPreview.newCount > 0 && (
              <span className="text-[var(--color-figma-success)]">
                {varConflictPreview.newCount} new
              </span>
            )}
            {varConflictPreview.overwriteCount > 0 && (
              <>
                {varConflictPreview.newCount > 0 && <span className="text-[var(--color-figma-border)]">&middot;</span>}
                <span className="text-[var(--color-figma-warning)]">
                  {varConflictPreview.overwriteCount} conflict{varConflictPreview.overwriteCount !== 1 ? 's' : ''}
                </span>
              </>
            )}
          </div>
        )}

        {hasBlockingCollisions && !importing && (
          <div className="text-secondary text-[var(--color-figma-error)]">
            {ambiguousCollectionImportCount} duplicate destination path{ambiguousCollectionImportCount !== 1 ? 's' : ''} — rename a collection above.
          </div>
        )}

        {hasUnresolvedModeDestinations && !importing && (
          <div className="text-secondary text-[var(--color-figma-error)]">
            {unresolvedModeDestinationCount} destination{unresolvedModeDestinationCount !== 1 ? 's' : ''} still need an explicit collection mapping.
          </div>
        )}

        {hasConflicts && !importing && !hasBlockingCollisions && (
          <div className="flex flex-wrap gap-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] p-1">
            {(['merge', 'overwrite', 'skip'] as const).map(s => (
              <button
                key={s}
                onClick={() => setStrategy(s)}
                className={`flex-1 basis-[96px] rounded px-2 py-1 text-secondary font-medium transition-colors ${
                  strategy === s
                    ? 'bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]'
                    : 'bg-transparent text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
                }`}
              >
                {reviewActionCopy[s].label}
              </button>
            ))}
          </div>
        )}

        <button
          onClick={() => handleImportVariables(hasConflicts ? strategy : 'overwrite')}
          disabled={!canImport}
          className="w-full rounded bg-[var(--color-figma-accent)] px-3 py-1.5 text-body font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40 whitespace-normal leading-tight text-center"
        >
          {importing
            ? importProgress
              ? `Importing ${importProgress.done}/${importProgress.total}...`
              : 'Importing...'
            : `Import ${importTokenCount} token${importTokenCount !== 1 ? 's' : ''} into ${totalEnabledCollections} collection${totalEnabledCollections !== 1 ? 's' : ''}`}
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
    </div>
  );
}
