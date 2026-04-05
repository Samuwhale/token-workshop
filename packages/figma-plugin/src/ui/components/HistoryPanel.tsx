import { useState, useEffect, useCallback } from 'react';
import { Spinner } from './Spinner';
import { SkeletonTimelineRow } from './Skeleton';
import { ConfirmModal } from './ConfirmModal';
import { OpIcon } from './RecentActionsSource';
import { apiFetch } from '../shared/apiFetch';
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

function TypePill({ kind }: { kind: 'action' | 'commit' | 'snapshot' | 'local' }) {
  const styles: Record<string, string> = {
    local: 'bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-tertiary)]',
    action: 'bg-[color-mix(in_srgb,var(--color-figma-accent)_14%,transparent)] text-[var(--color-figma-accent)]',
    commit: 'bg-[color-mix(in_srgb,#a855f7_14%,transparent)] text-[#a855f7]',
    snapshot: 'bg-[color-mix(in_srgb,var(--color-figma-success)_14%,transparent)] text-[var(--color-figma-success)]',
  };
  const labels: Record<string, string> = { local: 'Local', action: 'Action', commit: 'Commit', snapshot: 'Snapshot' };
  return (
    <span className={`shrink-0 text-[9px] font-semibold uppercase tracking-wide px-1 py-0.5 rounded ${styles[kind]}`}>
      {labels[kind]}
    </span>
  );
}

export function HistoryPanel({ serverUrl, connected, onPushUndo, onRefreshTokens, filterTokenPath, onClearFilter, recentOperations, totalOperations, hasMoreOperations, onLoadMoreOperations, onRollback, undoDescriptions, redoableOpIds, onServerRedo, executeUndo, canUndo }: HistoryPanelProps) {
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
  const [activeTypeFilters, setActiveTypeFilters] = useState<Set<'action' | 'commit' | 'snapshot' | 'local'>>(
    new Set(['action', 'commit', 'snapshot', 'local'])
  );
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

  // Legend visibility
  const [showLegend, setShowLegend] = useState(false);

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
    } finally {
      setRollingBack(null);
    }
  }, [onRollback]);

  const handleRedo = useCallback(async (opId: string) => {
    if (!onServerRedo) return;
    setRedoing(opId);
    try {
      await onServerRedo(opId);
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
    } finally {
      setSaving(false);
    }
  };

  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 gap-2 text-center">
        <p className="text-[11px] text-[var(--color-figma-text-secondary)]">Connect to a server to view history.</p>
      </div>
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

  // Build merged timeline
  type TimelineItem =
    | { kind: 'action'; ts: number; data: OperationEntry }
    | { kind: 'commit'; ts: number; data: CommitEntry }
    | { kind: 'snapshot'; ts: number; data: SnapshotSummary }
    | { kind: 'local'; ts: number; data: { description: string; stepsToUndo: number } };

  const localEntries = undoDescriptions ?? [];
  // Assign synthetic timestamps: most recent local entry gets now, older ones slightly earlier
  const now = Date.now();
  const allEntries: TimelineItem[] = [
    ...localEntries.map((desc, i) => ({
      kind: 'local' as const,
      ts: now - (localEntries.length - 1 - i) * 100,
      data: { description: desc, stepsToUndo: localEntries.length - i },
    })),
    ...(recentOperations ?? []).map(op => ({
      kind: 'action' as const,
      ts: new Date(op.timestamp).getTime(),
      data: op,
    })),
    ...timelineCommits.map(c => ({
      kind: 'commit' as const,
      ts: new Date(c.date).getTime(),
      data: c,
    })),
    ...timelineSnapshots.map(s => ({
      kind: 'snapshot' as const,
      ts: new Date(s.timestamp).getTime(),
      data: s,
    })),
  ].sort((a, b) => b.ts - a.ts);

  const searchQuery = timelineSearch.trim().toLowerCase();
  const filteredEntries = allEntries.filter(entry => {
    if (!activeTypeFilters.has(entry.kind)) return false;
    if (!searchQuery) return true;
    if (entry.kind === 'local') {
      return entry.data.description.toLowerCase().includes(searchQuery);
    }
    if (entry.kind === 'action') {
      const op = entry.data;
      return op.description.toLowerCase().includes(searchQuery) ||
        op.setName.toLowerCase().includes(searchQuery) ||
        op.affectedPaths.some(p => p.toLowerCase().includes(searchQuery));
    }
    if (entry.kind === 'commit') {
      const c = entry.data;
      return c.message.toLowerCase().includes(searchQuery) ||
        c.author.toLowerCase().includes(searchQuery) ||
        c.hash.toLowerCase().includes(searchQuery);
    }
    // snapshot
    return (entry.data as SnapshotSummary).label.toLowerCase().includes(searchQuery);
  });

  const isFiltering = searchQuery.length > 0 || activeTypeFilters.size < 4;
  const isEmpty = allEntries.length === 0 && !timelineError;
  const isFilteredEmpty = !isEmpty && filteredEntries.length === 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Rollback confirm modal */}
      {confirmOp && (
        <ConfirmModal
          title="Roll back operation?"
          description={`"${confirmOp.description}" affected ${confirmOp.affectedPaths.length} path${confirmOp.affectedPaths.length !== 1 ? 's' : ''}. This will restore tokens to their state before this operation.`}
          confirmLabel="Roll Back"
          danger
          onConfirm={() => handleRollback(confirmOp.id)}
          onCancel={() => setConfirmOp(null)}
        />
      )}

      {/* Token filter banner */}
      {filterTokenPath && (
        <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 bg-[color-mix(in_srgb,var(--color-figma-accent)_8%,transparent)] border-b border-[var(--color-figma-border)]">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--color-figma-accent)]" aria-hidden="true">
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <span className="text-[10px] text-[var(--color-figma-text-secondary)] flex-1 min-w-0">
            Filtering: <span className="font-mono text-[var(--color-figma-text)] truncate">{filterTokenPath}</span>
          </span>
          {onClearFilter && (
            <button
              onClick={onClearFilter}
              className="shrink-0 text-[10px] text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text)] transition-colors"
              title="Clear filter"
              aria-label="Clear filter"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
        {showSaveInput ? (
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <input
              className="flex-1 min-w-0 px-2 py-1 text-[10px] rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-tertiary)] focus:focus-visible:border-[var(--color-figma-accent)]"
              placeholder="Snapshot label"
              value={saveLabel}
              onChange={e => setSaveLabel(e.target.value)}
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
          <>
            <button
              onClick={() => {
                const lastOp = recentOperations?.[0];
                setSaveLabel(defaultSnapshotLabel(lastOp?.description));
                setShowSaveInput(true);
              }}
              className="flex items-center gap-1 text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
              title="Save current token state as a snapshot"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              Save state
            </button>
            <div className="flex items-center gap-1 flex-1 min-w-0 mx-2">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--color-figma-text-tertiary)]" aria-hidden="true">
                <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                type="text"
                value={timelineSearch}
                onChange={e => setTimelineSearch(e.target.value)}
                placeholder="Search history…"
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
            <button
              onClick={() => {
                setCompareMode(m => {
                  if (m) { setCompareA(null); setCompareB(null); }
                  return !m;
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
            <button
              onClick={() => setShowLegend(v => !v)}
              title={showLegend ? 'Hide legend' : 'What do Rollback, Restore, and git Revert mean?'}
              aria-label={showLegend ? 'Hide legend' : 'What do Rollback, Restore, and git Revert mean?'}
              aria-pressed={showLegend}
              className={`shrink-0 flex items-center justify-center w-5 h-5 rounded transition-colors ${
                showLegend
                  ? 'bg-[color-mix(in_srgb,var(--color-figma-accent)_14%,transparent)] text-[var(--color-figma-accent)]'
                  : 'text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text)]'
              }`}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4M12 8h.01" />
              </svg>
            </button>
            <button
              onClick={() => fetchTimeline(debouncedTimelineSearch)}
              className="shrink-0 text-[10px] text-[var(--color-figma-accent)] hover:underline"
            >
              Refresh
            </button>
          </>
        )}
      </div>

      {/* Type filter bar */}
      {!showSaveInput && (
        <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 border-b border-[var(--color-figma-border)]">
          <span className="text-[9px] text-[var(--color-figma-text-tertiary)] shrink-0">Show:</span>
          {(['local', 'action', 'commit', 'snapshot'] as const).map(kind => {
            const active = activeTypeFilters.has(kind);
            const styles: Record<string, string> = {
              local: active
                ? 'bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] border-[var(--color-figma-border-selected,var(--color-figma-border))]'
                : 'bg-transparent text-[var(--color-figma-text-tertiary)] border-[var(--color-figma-border)] hover:text-[var(--color-figma-text)]',
              action: active
                ? 'bg-[color-mix(in_srgb,var(--color-figma-accent)_14%,transparent)] text-[var(--color-figma-accent)] border-[color-mix(in_srgb,var(--color-figma-accent)_30%,transparent)]'
                : 'bg-transparent text-[var(--color-figma-text-tertiary)] border-[var(--color-figma-border)] hover:text-[var(--color-figma-text)]',
              commit: active
                ? 'bg-[color-mix(in_srgb,#a855f7_14%,transparent)] text-[#a855f7] border-[color-mix(in_srgb,#a855f7_30%,transparent)]'
                : 'bg-transparent text-[var(--color-figma-text-tertiary)] border-[var(--color-figma-border)] hover:text-[var(--color-figma-text)]',
              snapshot: active
                ? 'bg-[color-mix(in_srgb,var(--color-figma-success)_14%,transparent)] text-[var(--color-figma-success)] border-[color-mix(in_srgb,var(--color-figma-success)_30%,transparent)]'
                : 'bg-transparent text-[var(--color-figma-text-tertiary)] border-[var(--color-figma-border)] hover:text-[var(--color-figma-text)]',
            };
            const labels: Record<string, string> = { local: 'Local', action: 'Action', commit: 'Commit', snapshot: 'Snapshot' };
            return (
              <button
                key={kind}
                onClick={() => {
                  setActiveTypeFilters(prev => {
                    const next = new Set(prev);
                    if (next.has(kind)) {
                      next.delete(kind);
                    } else {
                      next.add(kind);
                    }
                    return next;
                  });
                }}
                className={`text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border transition-colors ${styles[kind]}`}
                aria-pressed={active}
                title={active ? `Hide ${labels[kind]}s` : `Show ${labels[kind]}s`}
              >
                {labels[kind]}
              </button>
            );
          })}
          {isFiltering && (
            <button
              onClick={() => { setTimelineSearch(''); setActiveTypeFilters(new Set(['action', 'commit', 'snapshot', 'local'])); }}
              className="ml-auto text-[9px] text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text)] transition-colors"
              title="Clear all filters"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Compare mode banner */}
      {compareMode && (
        <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 bg-[color-mix(in_srgb,var(--color-figma-accent)_6%,transparent)] border-b border-[var(--color-figma-border)]">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--color-figma-accent)]" aria-hidden="true">
            <path d="M18 20V10M12 20V4M6 20v-6" />
          </svg>
          {!compareA ? (
            <span className="flex-1 text-[10px] text-[var(--color-figma-text-secondary)]">
              Click <span className="font-semibold text-[var(--color-figma-accent)]">Set A</span> on a commit to start comparing
            </span>
          ) : !compareB ? (
            <span className="flex-1 text-[10px] text-[var(--color-figma-text-secondary)]">
              <span className="font-mono text-[var(--color-figma-text)]">{compareA.hash.slice(0, 7)}</span> selected as A — now click <span className="font-semibold text-[var(--color-figma-success)]">Set B</span>
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

      {/* Legend */}
      {showLegend && (
        <div className="shrink-0 border-b border-[var(--color-figma-border)] bg-[color-mix(in_srgb,var(--color-figma-bg-secondary)_60%,transparent)]">
          <div className="px-3 pt-2 pb-1">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-[var(--color-figma-text-tertiary)] mb-1.5">Recovery mechanisms</p>
            <div className="space-y-1.5">
              <div className="flex items-start gap-2">
                <TypePill kind="action" />
                <div className="min-w-0">
                  <p className="text-[10px] text-[var(--color-figma-text)]">Server action log · <span className="font-medium">Rollback</span></p>
                  <p className="text-[9px] text-[var(--color-figma-text-tertiary)] leading-tight">Precisely reverses one server-side edit without affecting others. Works across sessions. Best for: "I just made an edit I want to undo."</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <TypePill kind="commit" />
                <div className="min-w-0">
                  <p className="text-[10px] text-[var(--color-figma-text)]">Git commits · <span className="font-medium">git Revert</span></p>
                  <p className="text-[9px] text-[var(--color-figma-text-tertiary)] leading-tight">Restores tokens to the state at a specific git commit. Creates a new commit — preserves history. Best for: "I want to go back to a specific saved version."</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <TypePill kind="snapshot" />
                <div className="min-w-0">
                  <p className="text-[10px] text-[var(--color-figma-text)]">Manual snapshots · <span className="font-medium">Restore</span></p>
                  <p className="text-[9px] text-[var(--color-figma-text-tertiary)] leading-tight">Replaces all tokens with the snapshot's full state. Persists across sessions but not in git. Best for: "I saved a checkpoint before a big change."</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <TypePill kind="local" />
                <div className="min-w-0">
                  <p className="text-[10px] text-[var(--color-figma-text)]">This session · <span className="font-medium">Undo button / ⌘Z</span></p>
                  <p className="text-[9px] text-[var(--color-figma-text-tertiary)] leading-tight">In-memory undo stack. Fast and immediate but lost on page refresh. Click "Undo" to undo the most recent, or "Undo N" to undo multiple actions at once. Best for: "I just made a mistake moments ago."</p>
                </div>
              </div>
            </div>
          </div>
          <button
            onClick={() => setShowLegend(false)}
            className="w-full py-1 text-[9px] text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text)] transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto">
        {timelineLoading && allEntries.length === 0 && (
          <div aria-label="Loading history…" aria-busy="true">
            {[
              'w-3/4', 'w-1/2', 'w-2/3', 'w-5/8', 'w-3/5',
            ].map((w, i) => (
              <SkeletonTimelineRow key={i} titleWidth={w} />
            ))}
          </div>
        )}

        {!timelineLoading && timelineError && (
          <div className="flex flex-col items-center justify-center p-6 gap-2 text-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-tertiary)] opacity-60" aria-hidden="true">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p className="text-[11px] text-[var(--color-figma-text-secondary)]">Failed to load history</p>
            <p className="text-[10px] text-[var(--color-figma-text-tertiary)]">{timelineError}</p>
            <button
              onClick={() => fetchTimeline(debouncedTimelineSearch)}
              className="mt-1 px-3 py-1 rounded text-[10px] font-medium bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {!timelineLoading && isEmpty && (
          <div className="flex flex-col items-center justify-center h-full p-6 gap-2 text-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-tertiary)] opacity-40" aria-hidden="true">
              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
            </svg>
            <p className="text-[11px] text-[var(--color-figma-text-secondary)]">No history yet.</p>
            <p className="text-[10px] text-[var(--color-figma-text-tertiary)]">
              Edits, git commits, and saved states will appear here.
            </p>
          </div>
        )}

        {!timelineLoading && isFilteredEmpty && (
          <div className="flex flex-col items-center justify-center py-8 px-6 gap-2 text-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-tertiary)] opacity-40" aria-hidden="true">
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
            </svg>
            <p className="text-[11px] text-[var(--color-figma-text-secondary)]">No results.</p>
            <button
              onClick={() => { setTimelineSearch(''); setActiveTypeFilters(new Set(['action', 'commit', 'snapshot', 'local'])); }}
              className="text-[10px] text-[var(--color-figma-accent)] hover:underline"
            >
              Clear filters
            </button>
          </div>
        )}

        {/* Merged timeline entries */}
        {filteredEntries.map((entry) => {
          if (entry.kind === 'local') {
            const { description, stepsToUndo } = entry.data;
            const isTop = stepsToUndo === 1;
            const isUndoingThis = undoingToEntry !== null && undoingToEntry >= stepsToUndo;
            const isBusy = undoingToEntry !== null;
            return (
              <div key={`local-${stepsToUndo}`} className="flex items-start gap-2 px-3 py-2 border-b border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)] transition-colors group">
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
                    This session · not persisted
                  </p>
                </div>
                <div className="shrink-0 mt-0.5 flex items-center gap-1">
                  {executeUndo && (
                    <button
                      onClick={() => handleUndoToEntry(stepsToUndo)}
                      disabled={isBusy}
                      title={isTop ? 'Undo this action (⌘Z)' : `Undo this and ${stepsToUndo - 1} newer action${stepsToUndo > 2 ? 's' : ''}`}
                      className="text-[9px] px-1.5 py-0.5 rounded font-medium transition-colors opacity-0 group-hover:opacity-100 bg-[color-mix(in_srgb,var(--color-figma-accent)_12%,transparent)] text-[var(--color-figma-accent)] hover:bg-[color-mix(in_srgb,var(--color-figma-accent)_20%,transparent)] disabled:opacity-30"
                    >
                      {isUndoingThis ? (
                        <span className="flex items-center gap-1"><Spinner size="xs" />Undoing…</span>
                      ) : isTop ? 'Undo' : `Undo ${stepsToUndo}`}
                    </button>
                  )}
                </div>
              </div>
            );
          }

          if (entry.kind === 'action') {
            const op = entry.data;
            const isError = op.type.includes('error');
            return (
              <div key={`action-${op.id}`} className="flex items-start gap-2 px-3 py-2 border-b border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)] transition-colors group">
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
                    <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">· {op.affectedPaths.length} path{op.affectedPaths.length !== 1 ? 's' : ''}</span>
                    <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">· {formatRelativeTime(new Date(op.timestamp))}</span>
                  </div>
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
                          className="text-[9px] px-1.5 py-0.5 rounded font-medium transition-colors opacity-0 group-hover:opacity-100 bg-[color-mix(in_srgb,var(--color-figma-accent)_12%,transparent)] text-[var(--color-figma-accent)] hover:bg-[color-mix(in_srgb,var(--color-figma-accent)_20%,transparent)] disabled:opacity-30"
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
                      className="text-[9px] px-1.5 py-0.5 rounded font-medium transition-colors opacity-0 group-hover:opacity-100 bg-[color-mix(in_srgb,var(--color-figma-accent)_12%,transparent)] text-[var(--color-figma-accent)] hover:bg-[color-mix(in_srgb,var(--color-figma-accent)_20%,transparent)] disabled:opacity-30"
                    >
                      {rollingBack === op.id ? (
                        <span className="flex items-center gap-1"><Spinner size="xs" />Rolling back…</span>
                      ) : 'Rollback'}
                    </button>
                  )}
                </div>
              </div>
            );
          }

          if (entry.kind === 'commit') {
            const commit = entry.data;
            if (compareMode) {
              const isA = compareA?.hash === commit.hash;
              const isB = compareB?.hash === commit.hash;
              const isSelected = isA || isB;
              const canSetA = !isA;
              const canSetB = compareA !== null && !isB && !isA;
              return (
                <div
                  key={`commit-${commit.hash}`}
                  className={`flex items-start gap-2 px-3 py-2 border-b border-[var(--color-figma-border)] transition-colors group ${isSelected ? 'bg-[color-mix(in_srgb,var(--color-figma-accent)_6%,transparent)]' : 'hover:bg-[var(--color-figma-bg-hover)]'}`}
                >
                  <div className="mt-0.5 shrink-0">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-tertiary)]" aria-hidden="true">
                      <circle cx="12" cy="12" r="4" /><line x1="1.05" y1="12" x2="7" y2="12" /><line x1="17.01" y1="12" x2="22.96" y2="12" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
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
                className="w-full text-left flex items-start gap-2 px-3 py-2 border-b border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)] transition-colors group"
              >
                <div className="mt-0.5 shrink-0">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-tertiary)]" aria-hidden="true">
                    <circle cx="12" cy="12" r="4" /><line x1="1.05" y1="12" x2="7" y2="12" /><line x1="17.01" y1="12" x2="22.96" y2="12" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <TypePill kind="commit" />
                    <span className="text-[10px] font-medium text-[var(--color-figma-text)] truncate min-w-0">{commit.message}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">{commit.author}</span>
                    <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">· {formatRelativeTime(new Date(commit.date))}</span>
                    <span className="text-[9px] font-mono text-[var(--color-figma-text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity">{commit.hash.slice(0, 7)}</span>
                  </div>
                </div>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-1 text-[var(--color-figma-text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            );
          }

          // snapshot entry
          const snapshot = entry.data;
          return (
            <button
              key={`snapshot-${snapshot.id}`}
              onClick={() => { setSelectedSnapshotId(snapshot.id); setSelectedSnapshotLabel(snapshot.label); }}
              className="w-full text-left flex items-start gap-2 px-3 py-2 border-b border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)] transition-colors group"
            >
              <div className="mt-0.5 shrink-0">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-tertiary)]" aria-hidden="true">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                  <polyline points="17 21 17 13 7 13 7 21" />
                  <polyline points="7 3 7 8 15 8" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <TypePill kind="snapshot" />
                  <span className="text-[10px] font-medium text-[var(--color-figma-text)] truncate min-w-0">{snapshot.label}</span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">{snapshot.tokenCount} tokens</span>
                  <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">· {formatRelativeTime(new Date(snapshot.timestamp))}</span>
                </div>
              </div>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-1 text-[var(--color-figma-text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          );
        })}

        {/* Load more commits */}
        {(hasMoreCommits || loadMoreError) && (
          <div className="px-3 py-2 border-b border-[var(--color-figma-border)] flex flex-col gap-1.5">
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

        {/* Load more server operations */}
        {hasMoreOperations && onLoadMoreOperations && (
          <div className="px-3 py-2">
            <button
              onClick={onLoadMoreOperations}
              className="w-full text-[10px] py-1.5 rounded font-medium transition-colors bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
            >
              Load more actions{totalOperations != null ? ` (${totalOperations - (recentOperations?.length ?? 0)} remaining)` : ''}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
