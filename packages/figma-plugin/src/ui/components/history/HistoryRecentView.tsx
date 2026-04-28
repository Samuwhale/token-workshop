import { useState } from 'react';
import { Spinner } from '../Spinner';
import { OpIcon } from '../RecentActionsSource';
import { formatRelativeTime } from '../../shared/changeHelpers';
import { FeedbackPlaceholder } from '../FeedbackPlaceholder';
import { RollbackPreviewModal } from './RollbackPreviewModal';
import type { OperationEntry } from './types';

function getFieldChanges(op: OperationEntry) {
  if (!Array.isArray(op.metadata?.changes)) return [];
  return op.metadata.changes;
}

function formatMetadataValue(value?: string) {
  return value && value.length > 0 ? value : 'cleared';
}

function operationTouchesCollection(
  op: OperationEntry,
  collectionId: string | null | undefined,
) {
  if (!collectionId) return true;
  if (op.metadata?.targetCollectionId === collectionId || op.metadata?.collectionId === collectionId) {
    return true;
  }
  return op.resourceId
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .includes(collectionId);
}

function operationSubtitle(op: OperationEntry): string {
  if (op.metadata?.generatorName) {
    const collection = op.metadata.targetCollectionId || op.metadata.collectionId;
    return collection ? `${op.metadata.generatorName} · ${collection}` : op.metadata.generatorName;
  }
  return op.resourceId;
}

export interface HistoryRecentViewProps {
  serverUrl: string;
  collectionFilter?: string | null;
  filterTokenPath?: string | null;
  onClearFilter?: () => void;
  recentOperations?: OperationEntry[];
  totalOperations?: number;
  hasMoreOperations?: boolean;
  onLoadMoreOperations?: () => void;
  onRollback?: (opId: string) => void;
  undoDescriptions?: string[];
  redoableOpIds?: Set<string>;
  onServerRedo?: (opId: string) => void;
  executeUndo?: () => Promise<void>;
}

export function HistoryRecentView({
  serverUrl,
  collectionFilter,
  filterTokenPath,
  onClearFilter,
  recentOperations,
  totalOperations,
  hasMoreOperations,
  onLoadMoreOperations,
  onRollback,
  undoDescriptions,
  redoableOpIds,
  onServerRedo,
  executeUndo,
}: HistoryRecentViewProps) {
  const [confirmOp, setConfirmOp] = useState<OperationEntry | null>(null);
  const [rollingBack, setRollingBack] = useState<string | null>(null);
  const [redoing, setRedoing] = useState<string | null>(null);
  const [undoingToEntry, setUndoingToEntry] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const handleRollback = async (opId: string) => {
    setRollingBack(opId);
    setConfirmOp(null);
    try {
      await onRollback?.(opId);
    } finally {
      setRollingBack(null);
    }
  };

  const handleRedo = async (opId: string) => {
    if (!onServerRedo) return;
    setRedoing(opId);
    try { await onServerRedo(opId); }
    finally { setRedoing(null); }
  };

  const handleUndoToEntry = async (stepsToUndo: number) => {
    if (!executeUndo) return;
    setUndoingToEntry(stepsToUndo);
    try {
      for (let i = 0; i < stepsToUndo; i++) await executeUndo();
    } finally {
      setUndoingToEntry(null);
    }
  };

  const query = searchQuery.trim().toLowerCase();

  const localEntries = (undoDescriptions ?? [])
    .map((description, index, descriptions) => ({
      description,
      stepsToUndo: descriptions.length - index,
    }))
    .reverse();

  const filteredLocal = localEntries.filter(entry => {
    if (filterTokenPath || collectionFilter) return false;
    if (!query) return true;
    return entry.description.toLowerCase().includes(query);
  });

  const filteredOps = (recentOperations ?? []).filter(op => {
    if (!operationTouchesCollection(op, collectionFilter)) return false;
    if (filterTokenPath && !op.affectedPaths.includes(filterTokenPath)) return false;
    if (!query) return true;
    const metadataChanges = getFieldChanges(op);
    return op.description.toLowerCase().includes(query) ||
      op.resourceId.toLowerCase().includes(query) ||
      op.affectedPaths.some(path => path.toLowerCase().includes(query)) ||
      metadataChanges.some(change =>
        change.label.toLowerCase().includes(query) ||
        (change.before ?? '').toLowerCase().includes(query) ||
        (change.after ?? '').toLowerCase().includes(query)
      );
  });

  const isEmpty = filteredLocal.length === 0 && filteredOps.length === 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {confirmOp && (
        <RollbackPreviewModal
          serverUrl={serverUrl}
          opId={confirmOp.id}
          opDescription={confirmOp.description}
          onConfirm={() => handleRollback(confirmOp.id)}
          onCancel={() => setConfirmOp(null)}
        />
      )}

      <div className="shrink-0 flex items-center gap-2 px-3 py-1.5">
        <div className="flex items-center gap-1 flex-1 min-w-0 rounded bg-[var(--color-figma-bg-secondary)] px-2">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--color-figma-text-tertiary)]" aria-hidden="true">
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search activity"
            aria-label="Search activity"
            className="flex-1 min-w-0 bg-transparent py-1 text-secondary text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-tertiary)]"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="shrink-0 text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text)] transition-colors" aria-label="Clear search">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          )}
        </div>
      </div>

      {filterTokenPath && onClearFilter ? (
        <div className="shrink-0 flex items-center gap-2 px-3 pb-1.5 text-secondary text-[var(--color-figma-text-secondary)]">
          <span className="truncate">{filterTokenPath}</span>
          <button
            type="button"
            onClick={onClearFilter}
            className="shrink-0 text-[var(--color-figma-accent)] hover:underline"
          >
            Clear
          </button>
        </div>
      ) : null}

      {/* Body */}
      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
        {isEmpty ? (
          <FeedbackPlaceholder
            variant={filterTokenPath || searchQuery || collectionFilter ? 'no-results' : 'empty'}
            title={filterTokenPath || searchQuery || collectionFilter ? 'No results' : 'No recent activity'}
            description={filterTokenPath || searchQuery || collectionFilter ? 'Try a different search or clear filters.' : 'Make an edit to see changes here.'}
            secondaryAction={filterTokenPath || searchQuery || collectionFilter ? { label: 'Clear filters', onClick: () => { setSearchQuery(''); onClearFilter?.(); } } : undefined}
          />
        ) : (
          <>
            {filteredLocal.map(({ description, stepsToUndo }) => {
              const isTop = stepsToUndo === 1;
              const isUndoingThis = undoingToEntry !== null && undoingToEntry >= stepsToUndo;
              const isBusy = undoingToEntry !== null;
              return (
                <div key={`local-${stepsToUndo}`} className="flex items-start gap-2 px-3 py-2 border-b border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)] transition-colors group">
                  <div className="mt-0.5 shrink-0">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-tertiary)]" aria-hidden="true"><circle cx="12" cy="12" r="3" /></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-secondary min-w-0 break-words text-[var(--color-figma-text)]">{description}</div>
                  </div>
                  <div className="shrink-0 mt-0.5 flex flex-wrap items-center justify-end gap-1">
                    {executeUndo && (
                      <button
                        onClick={() => handleUndoToEntry(stepsToUndo)}
                        disabled={isBusy}
                        title={isTop ? 'Undo this action' : `Undo this and ${stepsToUndo - 1} newer action${stepsToUndo > 2 ? 's' : ''}`}
                        className="text-secondary px-1.5 py-0.5 rounded font-medium transition-colors opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 bg-[color-mix(in_srgb,var(--color-figma-accent)_12%,transparent)] text-[var(--color-figma-accent)] hover:bg-[color-mix(in_srgb,var(--color-figma-accent)_20%,transparent)] disabled:opacity-30"
                      >
                        {isUndoingThis ? <span className="flex items-center gap-1"><Spinner size="xs" />Undoing…</span> : isTop ? 'Undo' : `Undo ${stepsToUndo}`}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {filteredOps.map((op) => {
              const isError = op.type.includes('error');
              const metadataChanges = getFieldChanges(op);
              const isSetMetadata = metadataChanges.length > 0;
	              const subtitle = operationSubtitle(op);
	              const impactLabel = isSetMetadata
                ? `${metadataChanges.length} metadata field${metadataChanges.length !== 1 ? 's' : ''}`
                : `${op.affectedPaths.length} path${op.affectedPaths.length !== 1 ? 's' : ''}`;
              return (
                <div key={`action-${op.id}`} className="flex items-start gap-2 px-3 py-2 border-b border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)] transition-colors group">
                  <div className="mt-0.5 shrink-0"><OpIcon type={op.type} /></div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-secondary min-w-0 break-words ${op.rolledBack ? 'text-[var(--color-figma-text-tertiary)] line-through' : isError ? 'text-[var(--color-figma-warning)]' : 'text-[var(--color-figma-text)]'}`}>
                      {op.description}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
	                      <span className="min-w-0 max-w-full truncate text-secondary text-[var(--color-figma-text-tertiary)]" title={subtitle}>
	                        {subtitle}
                      </span>
                      <span className="text-secondary text-[var(--color-figma-text-tertiary)]">· {impactLabel}</span>
                      <span className="text-secondary text-[var(--color-figma-text-tertiary)]">· {formatRelativeTime(new Date(op.timestamp))}</span>
                    </div>
                    {isSetMetadata && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {metadataChanges.map((change) => (
                          <span key={`${op.id}-${change.field}`} className="text-secondary px-1.5 py-0.5 rounded bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]" title={`${change.label}: ${formatMetadataValue(change.before)} → ${formatMetadataValue(change.after)}`}>
                            {change.label}: {formatMetadataValue(change.before)} → {formatMetadataValue(change.after)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 mt-0.5 flex flex-wrap items-center justify-end gap-1">
                    {isError ? (
                      <span className="text-secondary px-1.5 py-0.5 rounded bg-[color-mix(in_srgb,var(--color-figma-warning)_12%,transparent)] text-[var(--color-figma-warning)]">Failed</span>
                    ) : op.rolledBack ? (
                      <>
                        <span className="text-secondary px-1.5 py-0.5 rounded bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-tertiary)]">Rolled back</span>
                        {redoableOpIds?.has(op.id) && onServerRedo && (
                          <button onClick={() => handleRedo(op.id)} disabled={redoing !== null || rollingBack !== null} className="text-secondary px-1.5 py-0.5 rounded font-medium transition-colors opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 bg-[color-mix(in_srgb,var(--color-figma-accent)_12%,transparent)] text-[var(--color-figma-accent)] hover:bg-[color-mix(in_srgb,var(--color-figma-accent)_20%,transparent)] disabled:opacity-30">
                            {redoing === op.id ? <span className="flex items-center gap-1"><Spinner size="xs" />Redoing…</span> : 'Redo'}
                          </button>
                        )}
                      </>
                    ) : (
                      <button onClick={() => setConfirmOp(op)} disabled={rollingBack !== null} className="text-secondary px-1.5 py-0.5 rounded font-medium transition-colors opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 bg-[color-mix(in_srgb,var(--color-figma-accent)_12%,transparent)] text-[var(--color-figma-accent)] hover:bg-[color-mix(in_srgb,var(--color-figma-accent)_20%,transparent)] disabled:opacity-30">
                        {rollingBack === op.id ? <span className="flex items-center gap-1"><Spinner size="xs" />Rolling back…</span> : 'Rollback'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {hasMoreOperations && onLoadMoreOperations && (
              <div className="px-3 py-2 border-b border-[var(--color-figma-border)]">
                <button onClick={onLoadMoreOperations} className="w-full text-secondary py-1.5 rounded font-medium transition-colors bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]">
                  Load more saved edits{totalOperations != null ? ` (${totalOperations - (recentOperations?.length ?? 0)} remaining)` : ''}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
