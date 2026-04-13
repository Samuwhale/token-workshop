import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { Spinner } from './Spinner';
import { SkeletonTimelineRow } from './Skeleton';
import { OpIcon } from './RecentActionsSource';
import { apiFetch } from '../shared/apiFetch';
import { dispatchToast } from '../shared/toastBus';
import {
  formatRelativeTime,
} from '../shared/changeHelpers';
import type {
  CommitEntry,
  SnapshotSummary,
  OperationEntry,
  HistoryPanelProps,
} from './history/types';
import { defaultSnapshotLabel } from './history/types';
import { GitCommitsSource } from './history/GitCommitsSource';
import { CommitCompareView } from './history/CommitCompareView';
import { SnapshotsSource } from './history/SnapshotsSource';
import { RollbackPreviewModal } from './history/RollbackPreviewModal';
import { FeedbackPlaceholder } from './FeedbackPlaceholder';
import { InlineBanner } from './InlineBanner';

function TypePill({ kind }: { kind: 'action' | 'commit' | 'snapshot' | 'local' }) {
  const styles: Record<string, string> = {
    local: 'bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-tertiary)]',
    action: 'bg-[color-mix(in_srgb,var(--color-figma-accent)_14%,transparent)] text-[var(--color-figma-accent)]',
    commit: 'bg-[color-mix(in_srgb,#a855f7_14%,transparent)] text-[#a855f7]',
    snapshot: 'bg-[color-mix(in_srgb,var(--color-figma-success)_14%,transparent)] text-[var(--color-figma-success)]',
  };
  const labels: Record<string, string> = { local: 'This session', action: 'Saved edit', commit: 'Git', snapshot: 'Snapshot' };
  return (
    <span className={`shrink-0 text-[9px] font-semibold uppercase tracking-wide px-1 py-0.5 rounded ${styles[kind]}`}>
      {labels[kind]}
    </span>
  );
}

function RecoverySection({
  title,
  countLabel,
  action,
  children,
}: {
  title: string;
  countLabel?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-[var(--color-figma-border)]">
      <div className="flex items-start gap-3 px-3 py-3 bg-[color-mix(in_srgb,var(--color-figma-bg-secondary)_78%,transparent)]">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-[11px] font-semibold text-[var(--color-figma-text)]">{title}</h2>
            {countLabel ? (
              <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-[var(--color-figma-bg)] text-[var(--color-figma-text-tertiary)]">
                {countLabel}
              </span>
            ) : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

function RecoverySubsection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="border-t border-[var(--color-figma-border)] first:border-t-0">
      <div className="px-3 py-2 bg-[color-mix(in_srgb,var(--color-figma-bg-secondary)_42%,transparent)]">
        <p className="text-[9px] font-semibold uppercase tracking-wide text-[var(--color-figma-text-tertiary)]">{title}</p>
      </div>
      {children}
    </div>
  );
}

function getSetMetadataChanges(op: OperationEntry) {
  if (op.metadata?.kind !== 'set-metadata' || !Array.isArray(op.metadata.changes)) {
    return [];
  }
  return op.metadata.changes;
}

function formatMetadataValue(value?: string) {
  return value && value.length > 0 ? value : 'cleared';
}

function formatSnapshotWorkspaceCounts(snapshot: SnapshotSummary) {
  const parts: string[] = [];
  if (snapshot.dimensionCount > 0) {
    parts.push(`${snapshot.dimensionCount} ${snapshot.dimensionCount === 1 ? 'mode' : 'modes'}`);
  }
  if (snapshot.resolverCount > 0) {
    parts.push(`${snapshot.resolverCount} ${snapshot.resolverCount === 1 ? 'resolver' : 'resolvers'}`);
  }
  if (snapshot.generatorCount > 0) {
    parts.push(`${snapshot.generatorCount} ${snapshot.generatorCount === 1 ? 'recipe' : 'recipes'}`);
  }
  return parts.join(' · ');
}

export function HistoryPanel({ serverUrl, connected, onPushUndo, onRefreshTokens, filterTokenPath, onClearFilter, recentOperations, totalOperations, hasMoreOperations, onLoadMoreOperations, onRollback, undoDescriptions, redoableOpIds, onServerRedo, executeUndo, canUndo: _canUndo }: HistoryPanelProps) {
  // Timeline data
  const [timelineCommits, setTimelineCommits] = useState<CommitEntry[]>([]);
  const [timelineSnapshots, setTimelineSnapshots] = useState<SnapshotSummary[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(true);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [hasMoreCommits, setHasMoreCommits] = useState(false);
  const [commitOffset, setCommitOffset] = useState(0);
  const [loadingMoreCommits, setLoadingMoreCommits] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [timelineSearch, setTimelineSearch] = useState('');
  const [debouncedTimelineSearch, setDebouncedTimelineSearch] = useState('');
  const [undoingToEntry, setUndoingToEntry] = useState<number | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedTimelineSearch(timelineSearch), 300);
    return () => clearTimeout(timer);
  }, [timelineSearch]);

  // Navigation state — controls which sub-view is rendered
  const [selectedCommitHash, setSelectedCommitHash] = useState<string | null>(null);
  const [selectedCommitEntry, setSelectedCommitEntry] = useState<CommitEntry | null>(null);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);
  const [selectedSnapshotLabel, setSelectedSnapshotLabel] = useState<string | null>(null);

  // Compare mode
  const [compareMode, setCompareMode] = useState(false);
  const [compareA, setCompareA] = useState<CommitEntry | null>(null);
  const [compareB, setCompareB] = useState<CommitEntry | null>(null);
  const [showCompare, setShowCompare] = useState(false);

  // Rollback confirm
  const [confirmOp, setConfirmOp] = useState<OperationEntry | null>(null);
  const [rollingBack, setRollingBack] = useState<string | null>(null);
  const [redoing, setRedoing] = useState<string | null>(null);

  // Inline save-snapshot toolbar
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [saveLabel, setSaveLabel] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchTimeline = useCallback(async (search = '') => {
    if (!connected) return;
    setTimelineLoading(true);
    setTimelineError(null);
    setCommitOffset(0);
    try {
      const searchParam = search ? `&search=${encodeURIComponent(search)}` : '';
      const [commitsData, snapshotsData] = await Promise.all([
        apiFetch<{ data?: CommitEntry[]; hasMore?: boolean }>(`${serverUrl}/api/sync/log?limit=50${searchParam}`),
        apiFetch<{ snapshots: SnapshotSummary[] }>(`${serverUrl}/api/snapshots`),
      ]);
      setTimelineCommits(commitsData.data ?? []);
      setHasMoreCommits(commitsData.hasMore ?? false);
      setTimelineSnapshots(snapshotsData.snapshots ?? []);
    } catch (err) {
      console.warn('[HistoryPanel] timeline fetch failed:', err);
      setTimelineError((err as Error).message || 'Failed to load history');
    } finally {
      setTimelineLoading(false);
    }
  }, [serverUrl, connected]);

  useEffect(() => {
    fetchTimeline(debouncedTimelineSearch);
  }, [fetchTimeline, debouncedTimelineSearch]);

  const handleLoadMoreCommits = useCallback(async () => {
    if (!connected || loadingMoreCommits) return;
    setLoadingMoreCommits(true);
    setLoadMoreError(null);
    const nextOffset = commitOffset + 50;
    try {
      const searchParam = debouncedTimelineSearch ? `&search=${encodeURIComponent(debouncedTimelineSearch)}` : '';
      const data = await apiFetch<{ data?: CommitEntry[]; hasMore?: boolean }>(
        `${serverUrl}/api/sync/log?limit=50&offset=${nextOffset}${searchParam}`
      );
      setTimelineCommits(prev => [...prev, ...(data.data ?? [])]);
      setHasMoreCommits(data.hasMore ?? false);
      setCommitOffset(nextOffset);
    } catch (err) {
      console.warn('[HistoryPanel] load more commits failed:', err);
      setLoadMoreError((err as Error).message || 'Failed to load more commits');
    } finally {
      setLoadingMoreCommits(false);
    }
  }, [serverUrl, connected, loadingMoreCommits, commitOffset, debouncedTimelineSearch]);

  const handleRollback = useCallback(async (opId: string) => {
    setRollingBack(opId);
    setConfirmOp(null);
    try {
      await onRollback?.(opId);
      dispatchToast('Rollback applied successfully', 'success');
    } catch (err) {
      dispatchToast((err as Error).message || 'Rollback failed', 'error');
    } finally {
      setRollingBack(null);
    }
  }, [onRollback]);

  const handleRedo = useCallback(async (opId: string) => {
    if (!onServerRedo) return;
    setRedoing(opId);
    try {
      await onServerRedo(opId);
      dispatchToast('Redo applied successfully', 'success');
    } catch (err) {
      dispatchToast((err as Error).message || 'Redo failed', 'error');
    } finally {
      setRedoing(null);
    }
  }, [onServerRedo]);

  const handleUndoToEntry = useCallback(async (stepsToUndo: number) => {
    if (!executeUndo) return;
    setUndoingToEntry(stepsToUndo);
    try {
      for (let i = 0; i < stepsToUndo; i++) {
        await executeUndo();
      }
      dispatchToast(`Undid ${stepsToUndo} action${stepsToUndo !== 1 ? 's' : ''}`, 'success');
    } catch (err) {
      dispatchToast((err as Error).message || 'Undo failed', 'error');
    } finally {
      setUndoingToEntry(null);
    }
  }, [executeUndo]);

  const handleSaveSnapshot = async () => {
    const label = saveLabel.trim() || `Snapshot ${new Date().toLocaleString()}`;
    setSaving(true);
    try {
      await apiFetch(`${serverUrl}/api/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      });
      setSaveLabel('');
      setShowSaveInput(false);
      await fetchTimeline(debouncedTimelineSearch);
      dispatchToast(`Snapshot "${label}" saved`, 'success');
    } catch (err) {
      dispatchToast((err as Error).message || 'Failed to save snapshot', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!connected) {
    return (
      <FeedbackPlaceholder
        variant="disconnected"
        title="Connect to the token server"
        description="History, rollback, snapshots, and git recovery are available once the server connection is restored."
      />
    );
  }

  // Commit detail view
  if (selectedCommitHash) {
    return (
      <GitCommitsSource
        serverUrl={serverUrl}
        onPushUndo={onPushUndo}
        onRefreshTokens={onRefreshTokens}
        filterTokenPath={filterTokenPath ?? undefined}
        initialSelectedHash={selectedCommitHash}
        initialSelectedCommit={selectedCommitEntry ?? undefined}
        onBack={() => { setSelectedCommitHash(null); setSelectedCommitEntry(null); fetchTimeline(); }}
        skipListFetch
      />
    );
  }

  // Snapshot compare view
  if (selectedSnapshotId) {
    return (
      <SnapshotsSource
        serverUrl={serverUrl}
        onPushUndo={onPushUndo}
        onRefreshTokens={onRefreshTokens}
        filterTokenPath={filterTokenPath ?? undefined}
        initialComparingId={selectedSnapshotId}
        initialComparingLabel={selectedSnapshotLabel ?? undefined}
        onBack={() => { setSelectedSnapshotId(null); setSelectedSnapshotLabel(null); fetchTimeline(); }}
      />
    );
  }

  // Compare view
  if (showCompare && compareA && compareB) {
    return (
      <CommitCompareView
        serverUrl={serverUrl}
        commitA={compareA}
        commitB={compareB}
        onBack={() => {
          setShowCompare(false);
          setCompareMode(false);
          setCompareA(null);
          setCompareB(null);
        }}
      />
    );
  }

  const searchQuery = timelineSearch.trim().toLowerCase();
  const localEntries = (undoDescriptions ?? [])
    .map((description, index, descriptions) => ({
      description,
      stepsToUndo: descriptions.length - index,
    }))
    .reverse();

  const filteredLocalEntries = localEntries.filter(entry => {
    if (filterTokenPath) return false;
    if (!searchQuery) return true;
    return entry.description.toLowerCase().includes(searchQuery);
  });

  const filteredOperations = (recentOperations ?? []).filter(op => {
    if (filterTokenPath && !op.affectedPaths.includes(filterTokenPath)) return false;
    if (!searchQuery) return true;
    const metadataChanges = getSetMetadataChanges(op);
    return op.description.toLowerCase().includes(searchQuery) ||
      op.setName.toLowerCase().includes(searchQuery) ||
      op.affectedPaths.some(path => path.toLowerCase().includes(searchQuery)) ||
      metadataChanges.some(change =>
        change.label.toLowerCase().includes(searchQuery) ||
        (change.before ?? '').toLowerCase().includes(searchQuery) ||
        (change.after ?? '').toLowerCase().includes(searchQuery)
      );
  });

  const filteredCommits = timelineCommits.filter(commit => {
    if (!searchQuery) return true;
    return commit.message.toLowerCase().includes(searchQuery) ||
      commit.author.toLowerCase().includes(searchQuery) ||
      commit.hash.toLowerCase().includes(searchQuery);
  });

  const filteredSnapshots = timelineSnapshots.filter(snapshot => {
    if (!searchQuery) return true;
    return snapshot.label.toLowerCase().includes(searchQuery);
  });

  const hasAnyEntries = localEntries.length > 0 ||
    (recentOperations?.length ?? 0) > 0 ||
    timelineCommits.length > 0 ||
    timelineSnapshots.length > 0;
  const visibleEntryCount = filteredLocalEntries.length + filteredOperations.length + filteredCommits.length + filteredSnapshots.length;
  const isEmpty = !hasAnyEntries && !timelineError;
  const isFilteredEmpty = hasAnyEntries && visibleEntryCount === 0 && !timelineError;
  const handleClearFilters = () => {
    setTimelineSearch('');
    onClearFilter?.();
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Rollback preview modal — shows diff before executing */}
      {confirmOp && (
        <RollbackPreviewModal
          serverUrl={serverUrl}
          opId={confirmOp.id}
          opDescription={confirmOp.description}
          onConfirm={() => handleRollback(confirmOp.id)}
          onCancel={() => setConfirmOp(null)}
        />
      )}

      {/* Token filter banner */}
      {filterTokenPath && (
        <InlineBanner
          variant="info"
          layout="strip"
          size="sm"
          className="bg-[color-mix(in_srgb,var(--color-figma-accent)_8%,transparent)]"
          icon={(
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
          )}
          onDismiss={onClearFilter}
          dismissMode="icon"
        >
          <span className="block text-[10px] text-[var(--color-figma-text-secondary)]">
            Filtering: <span className="font-mono text-[var(--color-figma-text)] truncate">{filterTokenPath}</span>
          </span>
        </InlineBanner>
      )}

      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--color-figma-text-tertiary)]" aria-hidden="true">
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={timelineSearch}
            onChange={e => setTimelineSearch(e.target.value)}
            placeholder="Search recovery options…"
            aria-label="Search history"
            className="flex-1 min-w-0 bg-transparent text-[10px] text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-tertiary)]"
          />
          {timelineSearch && (
            <button
              onClick={() => setTimelineSearch('')}
              className="shrink-0 text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text)] transition-colors"
              aria-label="Clear search"
            >
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        {timelineSearch && (
          <button
            onClick={() => setTimelineSearch('')}
            className="shrink-0 text-[10px] text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text)] transition-colors"
            title="Clear search"
          >
            Clear
          </button>
        )}
        <button
          onClick={() => fetchTimeline(debouncedTimelineSearch)}
          className="shrink-0 text-[10px] text-[var(--color-figma-accent)] hover:underline"
        >
          Refresh
        </button>
      </div>

      {/* Recovery surfaces */}
      <div className="flex-1 overflow-y-auto">
        {timelineLoading && !hasAnyEntries && (
          <div aria-label="Loading history…" aria-busy="true">
            {[
              'w-3/4', 'w-1/2', 'w-2/3', 'w-5/8', 'w-3/5',
            ].map((w, i) => (
              <SkeletonTimelineRow key={i} titleWidth={w} />
            ))}
          </div>
        )}

        {!timelineLoading && timelineError && (
          <FeedbackPlaceholder
            variant="error"
            title="Failed to load history"
            description={timelineError}
            primaryAction={{ label: 'Retry', onClick: () => fetchTimeline(debouncedTimelineSearch) }}
          />
        )}

        {!timelineLoading && isEmpty && (
          <FeedbackPlaceholder
            variant="empty"
            title="No history yet"
            description="Recovery options will appear here once you make edits, save a snapshot, or sync with git."
          />
        )}

        {!timelineLoading && isFilteredEmpty && (
          <FeedbackPlaceholder
            variant="no-results"
            title="No results"
            description="Try another history search or clear the token filter to see more recovery options."
            secondaryAction={{ label: 'Clear filters', onClick: handleClearFilters }}
          />
        )}

        {!timelineLoading && !timelineError && !isEmpty && !isFilteredEmpty && (
          <>
            <RecoverySection
              title="Undo recent edits"
              countLabel={`${filteredLocalEntries.length + filteredOperations.length} option${filteredLocalEntries.length + filteredOperations.length !== 1 ? 's' : ''}`}
            >
              <RecoverySubsection
                title="This session"
              >
                {filteredLocalEntries.length > 0 ? filteredLocalEntries.map(({ description, stepsToUndo }) => {
                  const isTop = stepsToUndo === 1;
                  const isUndoingThis = undoingToEntry !== null && undoingToEntry >= stepsToUndo;
                  const isBusy = undoingToEntry !== null;
                  return (
                    <div key={`local-${stepsToUndo}`} className="flex items-start gap-2 px-3 py-2 border-t border-[var(--color-figma-border)] first:border-t-0 hover:bg-[var(--color-figma-bg-hover)] transition-colors group">
                      <div className="mt-0.5 shrink-0">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-tertiary)]" aria-hidden="true">
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <TypePill kind="local" />
                          <span className="text-[10px] truncate min-w-0 text-[var(--color-figma-text)]">{description}</span>
                        </div>
                        <p className="text-[9px] text-[var(--color-figma-text-tertiary)] mt-0.5">
                          Not persisted yet
                        </p>
                      </div>
                      <div className="shrink-0 mt-0.5 flex items-center gap-1">
                        {executeUndo && (
                          <button
                            onClick={() => handleUndoToEntry(stepsToUndo)}
                            disabled={isBusy}
                            title={isTop ? 'Undo this action (⌘Z)' : `Undo this and ${stepsToUndo - 1} newer action${stepsToUndo > 2 ? 's' : ''}`}
                            className="text-[9px] px-1.5 py-0.5 rounded font-medium transition-colors opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 bg-[color-mix(in_srgb,var(--color-figma-accent)_12%,transparent)] text-[var(--color-figma-accent)] hover:bg-[color-mix(in_srgb,var(--color-figma-accent)_20%,transparent)] disabled:opacity-30"
                          >
                            {isUndoingThis ? (
                              <span className="flex items-center gap-1"><Spinner size="xs" />Undoing…</span>
                            ) : isTop ? 'Undo' : `Undo ${stepsToUndo}`}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                }) : (
                  <FeedbackPlaceholder
                    variant={filterTokenPath ? 'no-results' : 'empty'}
                    size="section"
                    title={filterTokenPath ? 'Session undo is hidden while filtering to one token.' : 'No session undo available.'}
                    description={filterTokenPath ? 'Local undo cannot be scoped to a single token path, so only saved edits remain visible here.' : 'Make an edit in this window to see quick undo options.'}
                  />
                )}
              </RecoverySubsection>

              <RecoverySubsection
                title="Saved server edits"
              >
                {filteredOperations.length > 0 ? filteredOperations.map((op) => {
                  const isError = op.type.includes('error');
                  const metadataChanges = getSetMetadataChanges(op);
                  const isSetMetadata = metadataChanges.length > 0;
                  const impactLabel = isSetMetadata
                    ? `${metadataChanges.length} metadata field${metadataChanges.length !== 1 ? 's' : ''}`
                    : `${op.affectedPaths.length} path${op.affectedPaths.length !== 1 ? 's' : ''}`;
                  return (
                    <div key={`action-${op.id}`} className="flex items-start gap-2 px-3 py-2 border-t border-[var(--color-figma-border)] first:border-t-0 hover:bg-[var(--color-figma-bg-hover)] transition-colors group">
                      <div className="mt-0.5 shrink-0">
                        <OpIcon type={op.type} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <TypePill kind="action" />
                          <span className={`text-[10px] truncate min-w-0 ${op.rolledBack ? 'text-[var(--color-figma-text-tertiary)] line-through' : isError ? 'text-[var(--color-figma-warning,#f59e0b)]' : 'text-[var(--color-figma-text)]'}`}>
                            {op.description}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">{op.setName}</span>
                          <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">· {impactLabel}</span>
                          <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">· {formatRelativeTime(new Date(op.timestamp))}</span>
                        </div>
                        {isSetMetadata && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {metadataChanges.map((change) => (
                              <span
                                key={`${op.id}-${change.field}`}
                                className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]"
                                title={`${change.label}: ${formatMetadataValue(change.before)} → ${formatMetadataValue(change.after)}`}
                              >
                                {change.label}: {formatMetadataValue(change.before)} → {formatMetadataValue(change.after)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 mt-0.5 flex items-center gap-1">
                        {isError ? (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-[color-mix(in_srgb,var(--color-figma-warning,#f59e0b)_12%,transparent)] text-[var(--color-figma-warning,#f59e0b)]">
                            Failed
                          </span>
                        ) : op.rolledBack ? (
                          <>
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-tertiary)]">
                              Rolled back
                            </span>
                            {redoableOpIds?.has(op.id) && onServerRedo && (
                              <button
                                onClick={() => handleRedo(op.id)}
                                disabled={redoing !== null || rollingBack !== null}
                                title="Redo this operation"
                                className="text-[9px] px-1.5 py-0.5 rounded font-medium transition-colors opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 bg-[color-mix(in_srgb,var(--color-figma-accent)_12%,transparent)] text-[var(--color-figma-accent)] hover:bg-[color-mix(in_srgb,var(--color-figma-accent)_20%,transparent)] disabled:opacity-30"
                              >
                                {redoing === op.id ? (
                                  <span className="flex items-center gap-1"><Spinner size="xs" />Redoing…</span>
                                ) : 'Redo'}
                              </button>
                            )}
                          </>
                        ) : (
                          <button
                            onClick={() => setConfirmOp(op)}
                            disabled={rollingBack !== null}
                            className="text-[9px] px-1.5 py-0.5 rounded font-medium transition-colors opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 bg-[color-mix(in_srgb,var(--color-figma-accent)_12%,transparent)] text-[var(--color-figma-accent)] hover:bg-[color-mix(in_srgb,var(--color-figma-accent)_20%,transparent)] disabled:opacity-30"
                          >
                            {rollingBack === op.id ? (
                              <span className="flex items-center gap-1"><Spinner size="xs" />Rolling back…</span>
                            ) : 'Rollback'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                }) : (
                  <FeedbackPlaceholder
                    variant={filterTokenPath ? 'no-results' : 'empty'}
                    size="section"
                    title="No saved edits match right now."
                    description={filterTokenPath ? 'Try another token path or clear the filter to see more rollback targets.' : 'Saved edits appear here after a server-side change is recorded.'}
                  />
                )}

                {hasMoreOperations && onLoadMoreOperations && (
                  <div className="px-3 py-2 border-t border-[var(--color-figma-border)]">
                    <button
                      onClick={onLoadMoreOperations}
                      className="w-full text-[10px] py-1.5 rounded font-medium transition-colors bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
                    >
                      Load more saved edits{totalOperations != null ? ` (${totalOperations - (recentOperations?.length ?? 0)} remaining)` : ''}
                    </button>
                  </div>
                )}
              </RecoverySubsection>
            </RecoverySection>

            <RecoverySection
              title="Restore snapshot"
              countLabel={`${filteredSnapshots.length} snapshot${filteredSnapshots.length !== 1 ? 's' : ''}`}
              action={showSaveInput ? (
                <div className="flex items-center gap-1.5 min-w-0 max-w-[240px]">
                  <input
                    className="w-[120px] min-w-0 px-2 py-1 text-[10px] rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-tertiary)] focus:focus-visible:border-[var(--color-figma-accent)]"
                    placeholder="Snapshot label"
                    value={saveLabel}
                    onChange={e => setSaveLabel(e.target.value)}
                    aria-label="Snapshot label"
                    onFocus={e => e.target.select()}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleSaveSnapshot();
                      if (e.key === 'Escape') { setShowSaveInput(false); setSaveLabel(''); }
                    }}
                    autoFocus
                  />
                  <button
                    onClick={handleSaveSnapshot}
                    disabled={saving}
                    className="shrink-0 px-2 py-1 rounded bg-[var(--color-figma-accent)] text-white text-[10px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50 transition-colors"
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    onClick={() => { setShowSaveInput(false); setSaveLabel(''); }}
                    className="shrink-0 px-2 py-1 rounded text-[10px] text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text)] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    const lastOp = recentOperations?.[0];
                    setSaveLabel(defaultSnapshotLabel(lastOp?.description));
                    setShowSaveInput(true);
                  }}
                  className="flex items-center gap-1 text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
                  title="Save the current workspace as a snapshot"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                    <polyline points="17 21 17 13 7 13 7 21" />
                    <polyline points="7 3 7 8 15 8" />
                  </svg>
                  Save checkpoint
                </button>
              )}
            >
              {filteredSnapshots.length > 0 ? filteredSnapshots.map((snapshot) => (
                <button
                  key={`snapshot-${snapshot.id}`}
                  onClick={() => { setSelectedSnapshotId(snapshot.id); setSelectedSnapshotLabel(snapshot.label); }}
                  className="w-full text-left flex items-start gap-2 px-3 py-2 border-t border-[var(--color-figma-border)] first:border-t-0 hover:bg-[var(--color-figma-bg-hover)] transition-colors group"
                >
                  <div className="mt-0.5 shrink-0">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-tertiary)]" aria-hidden="true">
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                      <polyline points="17 21 17 13 7 13 7 21" />
                      <polyline points="7 3 7 8 15 8" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <TypePill kind="snapshot" />
                      <span className="text-[10px] font-medium text-[var(--color-figma-text)] truncate min-w-0">{snapshot.label}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">{snapshot.tokenCount} tokens</span>
                      {formatSnapshotWorkspaceCounts(snapshot) ? (
                        <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">· {formatSnapshotWorkspaceCounts(snapshot)}</span>
                      ) : null}
                      <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">· {formatRelativeTime(new Date(snapshot.timestamp))}</span>
                    </div>
                  </div>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-1 text-[var(--color-figma-text-tertiary)] opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity" aria-hidden="true">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </button>
              )) : (
                <FeedbackPlaceholder
                  variant="no-results"
                  size="section"
                  title="No snapshots match right now."
                  description="Save a checkpoint before a larger change so you can restore the whole workspace, not just token files, later."
                />
              )}
            </RecoverySection>

            <RecoverySection
              title="Return to git commit"
              countLabel={`${filteredCommits.length} commit${filteredCommits.length !== 1 ? 's' : ''}`}
              action={(
                <button
                  onClick={() => {
                    setCompareMode(mode => {
                      if (mode) {
                        setCompareA(null);
                        setCompareB(null);
                      }
                      return !mode;
                    });
                  }}
                  className={`shrink-0 flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded transition-colors ${
                    compareMode
                      ? 'bg-[color-mix(in_srgb,var(--color-figma-accent)_14%,transparent)] text-[var(--color-figma-accent)]'
                      : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]'
                  }`}
                  title={compareMode ? 'Exit compare mode' : 'Compare two commits'}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M18 20V10M12 20V4M6 20v-6" />
                  </svg>
                  Compare
                </button>
              )}
            >
              {compareMode && (
                <div className="flex items-center gap-2 px-3 py-1.5 border-t border-[var(--color-figma-border)] bg-[color-mix(in_srgb,var(--color-figma-accent)_6%,transparent)]">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--color-figma-accent)]" aria-hidden="true">
                    <path d="M18 20V10M12 20V4M6 20v-6" />
                  </svg>
                  {!compareA ? (
                    <span className="flex-1 text-[10px] text-[var(--color-figma-text-secondary)]">
                      Pick <span className="font-semibold text-[var(--color-figma-accent)]">Set A</span> on the first commit you want to compare.
                    </span>
                  ) : !compareB ? (
                    <span className="flex-1 text-[10px] text-[var(--color-figma-text-secondary)]">
                      <span className="font-mono text-[var(--color-figma-text)]">{compareA.hash.slice(0, 7)}</span> is Set A. Choose <span className="font-semibold text-[var(--color-figma-success)]">Set B</span> to open the diff.
                    </span>
                  ) : (
                    <span className="flex-1 text-[10px] text-[var(--color-figma-text-secondary)]">
                      Comparing <span className="font-mono text-[var(--color-figma-text)]">{compareA.hash.slice(0, 7)}</span> → <span className="font-mono text-[var(--color-figma-text)]">{compareB.hash.slice(0, 7)}</span>
                    </span>
                  )}
                  {compareA && compareB && (
                    <button
                      onClick={() => setShowCompare(true)}
                      className="shrink-0 text-[10px] font-medium px-2 py-0.5 rounded bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] transition-colors"
                    >
                      View diff
                    </button>
                  )}
                </div>
              )}

              {filteredCommits.length > 0 ? filteredCommits.map((commit) => {
                if (compareMode) {
                  const isA = compareA?.hash === commit.hash;
                  const isB = compareB?.hash === commit.hash;
                  const isSelected = isA || isB;
                  const canSetA = !isA;
                  const canSetB = compareA !== null && !isB && !isA;
                  return (
                    <div
                      key={`commit-${commit.hash}`}
                      className={`flex items-start gap-2 px-3 py-2 border-t border-[var(--color-figma-border)] first:border-t-0 transition-colors group ${isSelected ? 'bg-[color-mix(in_srgb,var(--color-figma-accent)_6%,transparent)]' : 'hover:bg-[var(--color-figma-bg-hover)]'}`}
                    >
                      <div className="mt-0.5 shrink-0">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-tertiary)]" aria-hidden="true">
                          <circle cx="12" cy="12" r="4" /><line x1="1.05" y1="12" x2="7" y2="12" /><line x1="17.01" y1="12" x2="22.96" y2="12" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {isA && (
                            <span className="shrink-0 text-[9px] font-bold px-1 py-0.5 rounded bg-[color-mix(in_srgb,var(--color-figma-accent)_20%,transparent)] text-[var(--color-figma-accent)]">A</span>
                          )}
                          {isB && (
                            <span className="shrink-0 text-[9px] font-bold px-1 py-0.5 rounded bg-[color-mix(in_srgb,var(--color-figma-success)_20%,transparent)] text-[var(--color-figma-success)]">B</span>
                          )}
                          <TypePill kind="commit" />
                          <span className="text-[10px] font-medium text-[var(--color-figma-text)] truncate min-w-0">{commit.message}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">{commit.author}</span>
                          <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">· {formatRelativeTime(new Date(commit.date))}</span>
                          <span className="text-[9px] font-mono text-[var(--color-figma-text-tertiary)]">{commit.hash.slice(0, 7)}</span>
                        </div>
                      </div>
                      <div className="shrink-0 flex items-center gap-1">
                        {canSetA && (
                          <button
                            onClick={() => setCompareA(commit)}
                            className="text-[9px] px-1.5 py-0.5 rounded font-medium transition-colors bg-[color-mix(in_srgb,var(--color-figma-accent)_12%,transparent)] text-[var(--color-figma-accent)] hover:bg-[color-mix(in_srgb,var(--color-figma-accent)_20%,transparent)]"
                          >
                            {compareA === null ? 'Set A' : 'Swap A'}
                          </button>
                        )}
                        {canSetB && (
                          <button
                            onClick={() => {
                              setCompareB(commit);
                              setShowCompare(true);
                            }}
                            className="text-[9px] px-1.5 py-0.5 rounded font-medium transition-colors bg-[color-mix(in_srgb,var(--color-figma-success)_12%,transparent)] text-[var(--color-figma-success)] hover:bg-[color-mix(in_srgb,var(--color-figma-success)_20%,transparent)]"
                          >
                            Set B
                          </button>
                        )}
                        {isA && !isB && (
                          <button
                            onClick={() => setCompareA(null)}
                            className="text-[9px] px-1 py-0.5 rounded transition-colors text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text)]"
                            title="Clear A"
                            aria-label="Clear A"
                          >
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                }
                return (
                  <button
                    key={`commit-${commit.hash}`}
                    onClick={() => { setSelectedCommitHash(commit.hash); setSelectedCommitEntry(commit); }}
                    className="w-full text-left flex items-start gap-2 px-3 py-2 border-t border-[var(--color-figma-border)] first:border-t-0 hover:bg-[var(--color-figma-bg-hover)] transition-colors group"
                  >
                    <div className="mt-0.5 shrink-0">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-tertiary)]" aria-hidden="true">
                        <circle cx="12" cy="12" r="4" /><line x1="1.05" y1="12" x2="7" y2="12" /><line x1="17.01" y1="12" x2="22.96" y2="12" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <TypePill kind="commit" />
                        <span className="text-[10px] font-medium text-[var(--color-figma-text)] truncate min-w-0">{commit.message}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">{commit.author}</span>
                        <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">· {formatRelativeTime(new Date(commit.date))}</span>
                        <span className="text-[9px] font-mono text-[var(--color-figma-text-tertiary)] opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">{commit.hash.slice(0, 7)}</span>
                      </div>
                    </div>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-1 text-[var(--color-figma-text-tertiary)] opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity" aria-hidden="true">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </button>
                );
              }) : (
                <FeedbackPlaceholder
                  variant="no-results"
                  size="section"
                  title="No git commits match right now."
                  description="Sync with git to browse revisions and open the right version to restore."
                />
              )}

              {(hasMoreCommits || loadMoreError) && (
                <div className="px-3 py-2 border-t border-[var(--color-figma-border)] flex flex-col gap-1.5">
                  {loadMoreError && (
                    <p className="text-[10px] text-center text-[var(--color-figma-text-tertiary)]">{loadMoreError}</p>
                  )}
                  <button
                    onClick={handleLoadMoreCommits}
                    disabled={loadingMoreCommits}
                    className="w-full text-[10px] py-1.5 rounded font-medium transition-colors bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {loadingMoreCommits ? (
                      <><Spinner size="xs" />Loading…</>
                    ) : loadMoreError ? (
                      'Retry'
                    ) : (
                      'Load more commits'
                    )}
                  </button>
                </div>
              )}
            </RecoverySection>
          </>
        )}
      </div>
    </div>
  );
}
