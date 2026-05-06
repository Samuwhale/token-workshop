import { useState } from 'react';
import { CheckCircle2, ChevronLeft } from 'lucide-react';
import {
  useImportDestinationContext,
  useImportReviewContext,
  useImportSourceContext,
} from './ImportPanelContext';
import { renderConflictValue } from './importPanelHelpers';
import { defaultCollectionName, modeKey } from './importPanelTypes';
import { Spinner } from './Spinner';

type Strategy = 'merge' | 'overwrite' | 'skip';

export function ImportVariablesSummary() {
  const { collectionData, handleBack, source } = useImportSourceContext();
  const {
    collectionIds,
    modeEnabled,
    modeCollectionNames,
    totalEnabledCollections,
    totalEnabledTokens,
    hasInvalidModeCollectionNames,
    hasAmbiguousCollectionImport,
    ambiguousCollectionImportCount,
    setModeCollectionNames,
  } = useImportDestinationContext();
  const {
    varConflictPreview,
    checkingVarConflicts,
    importing,
    importProgress,
    handleImportVariables,
    reviewActionCopy,
    varConflictDetails,
    varConflictDetailsExpanded,
    setVarConflictDetailsExpanded,
  } = useImportReviewContext();

  const [strategy, setStrategy] = useState<Strategy>('merge');
  const [editingCollection, setEditingCollection] = useState<string | null>(null);

  const hasConflicts = varConflictPreview !== null && varConflictPreview.overwriteCount > 0;
  const hasBlockingCollisions = hasAmbiguousCollectionImport;
  const visibleConflictDetails = varConflictDetails ?? [];

  const canImport =
    totalEnabledCollections > 0 &&
    !hasInvalidModeCollectionNames &&
    !hasBlockingCollisions &&
    !importing;

  const importTokenCount = strategy === 'skip' && varConflictPreview
    ? varConflictPreview.newCount
    : totalEnabledTokens;
  const isTokensStudioImport = source === 'tokens-studio';

  const collectionSummaries = collectionData.map(col => {
    const enabledModes = col.modes.filter(mode => {
      const key = modeKey(col.name, mode.modeId);
      return modeEnabled[key] ?? true;
    });
    const tokenCount = enabledModes.reduce((sum, m) => sum + m.tokens.length, 0);
    const firstModeKey = modeKey(col.name, col.modes[0]?.modeId ?? '');
    const suggestedDestination = defaultCollectionName(col.name);
    const explicitDestination = modeCollectionNames[firstModeKey]?.trim() ?? '';
    const exactMatchDestination =
      collectionIds.includes(col.name)
        ? col.name
        : collectionIds.includes(suggestedDestination)
          ? suggestedDestination
          : '';
    const destinationName = explicitDestination || exactMatchDestination || suggestedDestination;
    const modeNames = enabledModes.map(m => m.modeName);
    return {
      name: col.name,
      destinationName: destinationName.trim(),
      modeCount: col.modes.length,
      enabledModeCount: enabledModes.length,
      tokenCount,
      modeNames,
      firstModeKey,
    };
  }).filter(s => s.enabledModeCount > 0);

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={handleBack}
        className="flex items-center gap-1.5 text-secondary text-[color:var(--color-figma-text-secondary)] hover:text-[color:var(--color-figma-text)] transition-colors self-start"
      >
        <ChevronLeft size={12} strokeWidth={1.75} aria-hidden />
        Back
      </button>

      <div>
        <div className="text-body font-medium text-[color:var(--color-figma-text)]">
          {isTokensStudioImport ? 'Review Tokens Studio collections' : 'Review Figma variable collections'}
        </div>
        <div className="mt-0.5 text-secondary text-[color:var(--color-figma-text-secondary)]">
          {isTokensStudioImport
            ? 'Each Tokens Studio group imports as a Token Workshop collection.'
            : 'Each Figma collection stays a Token Workshop collection. Its modes import as mode values on the same tokens.'}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {collectionSummaries.map(summary => (
          <div
            key={summary.name}
            className="rounded border border-[var(--color-figma-border)] px-3 py-2"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex min-w-0 flex-[999_1_220px] items-start gap-2">
                <CheckCircle2
                  size={12}
                  strokeWidth={1.75}
                  className="mt-0.5 shrink-0 text-[color:var(--color-figma-text-success)]"
                  aria-hidden
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="text-secondary text-[color:var(--color-figma-text-tertiary)]">
                    {summary.name} {"->"} destination collection
                  </div>
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
                      className="flex-1 min-w-0 rounded border border-[var(--color-figma-accent)] bg-[var(--color-figma-bg)] px-2 py-1 text-body font-medium text-[color:var(--color-figma-text)] outline-none"
                    />
                  ) : (
                    <button
                      type="button"
                      className="flex min-h-[30px] w-full min-w-0 items-center rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-left text-body text-[color:var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
                      onClick={() => {
                        setEditingCollection(summary.name);
                      }}
                      title="Rename destination collection"
                    >
                      <span className="block min-w-0 [overflow-wrap:anywhere]">
                        {summary.destinationName}
                      </span>
                    </button>
                  )}
                </div>
              </div>
              <span className="shrink-0 text-secondary text-[color:var(--color-figma-text-secondary)]">
                {summary.tokenCount} tokens
              </span>
            </div>
            {summary.modeCount > 1 && (
              <div className="mt-1 [overflow-wrap:anywhere] text-secondary text-[color:var(--color-figma-text-tertiary)]">
                {summary.modeNames.join(', ')}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer area */}
      <div className="flex flex-col gap-2 border-t border-[var(--color-figma-border)] pt-2">
        {checkingVarConflicts && (
          <div className="flex items-center gap-2 text-secondary text-[color:var(--color-figma-text-secondary)]">
            <Spinner size="xs" className="text-[color:var(--color-figma-text-secondary)]" />
            Checking for conflicts...
          </div>
        )}

        {!checkingVarConflicts && varConflictPreview !== null && (
          <div className="flex flex-wrap items-center gap-2 text-secondary">
            {varConflictPreview.newCount > 0 && (
              <span className="text-[color:var(--color-figma-text-success)]">
                {varConflictPreview.newCount} new
              </span>
            )}
            {varConflictPreview.overwriteCount > 0 && (
              <>
                {varConflictPreview.newCount > 0 && <span className="text-[color:var(--color-figma-border)]">&middot;</span>}
                <span className="text-[color:var(--color-figma-text-warning)]">
                  {varConflictPreview.overwriteCount} conflict{varConflictPreview.overwriteCount !== 1 ? 's' : ''}
                </span>
              </>
            )}
          </div>
        )}

        {hasBlockingCollisions && !importing && (
          <div className="text-secondary text-[color:var(--color-figma-text-error)]">
            {ambiguousCollectionImportCount} duplicate destination path{ambiguousCollectionImportCount !== 1 ? 's' : ''} — rename a collection above.
          </div>
        )}

        {hasConflicts && !importing && !hasBlockingCollisions && (
          <>
            <div className="flex flex-wrap gap-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] p-1">
              {(['merge', 'overwrite', 'skip'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setStrategy(s)}
                  className={`flex-1 basis-[96px] rounded px-2 py-1 text-secondary font-medium transition-colors ${
                    strategy === s
                      ? 'bg-[var(--color-figma-accent)]/10 text-[color:var(--color-figma-text-accent)]'
                      : 'bg-transparent text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
                  }`}
                >
                  {reviewActionCopy[s].label}
                </button>
              ))}
            </div>
            <div className="text-secondary leading-relaxed text-[color:var(--color-figma-text-secondary)]">
              {reviewActionCopy[strategy].consequence}
            </div>

            {visibleConflictDetails.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => setVarConflictDetailsExpanded((expanded) => !expanded)}
                  className="self-start text-secondary font-medium text-[color:var(--color-figma-text-accent)] transition-colors hover:underline"
                  aria-expanded={varConflictDetailsExpanded}
                >
                  {varConflictDetailsExpanded ? 'Hide' : 'Review'} {visibleConflictDetails.length} matching token{visibleConflictDetails.length === 1 ? '' : 's'}
                </button>
                {varConflictDetailsExpanded ? (
                  <div className="max-h-[220px] overflow-y-auto rounded border border-[var(--color-figma-border)]" style={{ scrollbarWidth: 'thin' }}>
                    {visibleConflictDetails.map((detail, index) => (
                      <div
                        key={`${detail.collectionId}-${detail.path}-${index}`}
                        className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2.5 py-2 last:border-b-0"
                      >
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="min-w-0 break-all font-mono text-secondary font-medium text-[color:var(--color-figma-text)]">
                            {detail.path}
                          </span>
                          <span className="text-secondary text-[color:var(--color-figma-text-tertiary)]">
                            {detail.collectionId}
                          </span>
                        </div>
                        {detail.note ? (
                          <div className="mt-0.5 text-secondary text-[color:var(--color-figma-text-warning)]">
                            {detail.note}
                          </div>
                        ) : null}
                        <div className="mt-1 grid gap-1.5 sm:grid-cols-2">
                          <div className="min-w-0 rounded bg-[var(--color-figma-bg-secondary)] px-2 py-1.5">
                            <div className="text-[var(--font-size-xs)] font-medium text-[color:var(--color-figma-text-tertiary)]">
                              {detail.existingLabel ?? 'Current token'}
                            </div>
                            <div className="mt-0.5 flex min-w-0 items-center gap-1 truncate font-mono text-secondary text-[color:var(--color-figma-text-secondary)]">
                              {renderConflictValue(detail.existing.$type, detail.existing.$value)}
                            </div>
                          </div>
                          <div className="min-w-0 rounded bg-[var(--color-figma-accent)]/8 px-2 py-1.5">
                            <div className="text-[var(--font-size-xs)] font-medium text-[color:var(--color-figma-text-tertiary)]">
                              {detail.incomingLabel ?? 'Incoming import'}
                            </div>
                            <div className="mt-0.5 flex min-w-0 items-center gap-1 truncate font-mono text-secondary text-[color:var(--color-figma-text)]">
                              {renderConflictValue(detail.incoming.$type, detail.incoming.$value)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        )}

        <button
          onClick={() => handleImportVariables(hasConflicts ? strategy : 'merge')}
          disabled={!canImport}
          className="w-full rounded bg-[var(--color-figma-action-bg)] px-3 py-1.5 text-body font-medium text-[color:var(--color-figma-text-onbrand)] transition-opacity hover:opacity-90 disabled:opacity-40 whitespace-normal leading-tight text-center"
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
