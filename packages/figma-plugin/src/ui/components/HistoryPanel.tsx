import { useState, useEffect, useCallback, useRef } from 'react';
import { Spinner } from './Spinner';
import { ValueDiff } from './ValueDiff';
import { ConfirmModal } from './ConfirmModal';
import { OpIcon } from './RecentActionsSource';
import { apiFetch } from '../shared/apiFetch';
import {
  type ChangeStatus,
  type TokenChange,
  formatRelativeTime,
  statusColor,
  statusLabel,
  summarizeChanges,
  formatTokenValue,
  ColorSwatch,
  Section,
  ChangeSummaryBadges,
} from '../shared/changeHelpers';

function StatusBadge({ status }: { status: ChangeStatus }) {
  return (
    <span
      className="text-[10px] font-medium uppercase tracking-wide shrink-0 px-1 py-0.5 rounded"
      style={{
        color: statusColor(status),
        backgroundColor: `color-mix(in srgb, ${statusColor(status)} 12%, transparent)`,
      }}
    >
      {statusLabel(status)}
    </span>
  );
}

/** Shared change row with inline diff — used by both sources */
function ChangeRow({ change, restoreButton }: { change: TokenChange; restoreButton?: React.ReactNode }) {
  return (
    <div className="px-3 py-2 space-y-1 group/row relative">
      <div className="flex items-center gap-2">
        <StatusBadge status={change.status} />
        <span className="text-[10px] font-mono text-[var(--color-figma-text)] truncate" title={change.path}>
          {change.path}
        </span>
        <span className="text-[10px] text-[var(--color-figma-text-tertiary)] shrink-0">{change.type}</span>
        {restoreButton}
      </div>

      {change.status === 'modified' && (
        <ValueDiff type={change.type} before={change.before} after={change.after} />
      )}
      {change.status === 'added' && (
        <div className="flex items-center gap-1.5 pl-1">
          {change.type === 'color' && typeof change.after === 'string' && (
            <ColorSwatch color={change.after} />
          )}
          <span className="text-[10px] font-mono text-[var(--color-figma-text-secondary)]">
            {formatTokenValue(change.type, change.after)}
          </span>
        </div>
      )}
      {change.status === 'removed' && (
        <div className="flex items-center gap-1.5 pl-1">
          {change.type === 'color' && typeof change.before === 'string' && (
            <ColorSwatch color={change.before} />
          )}
          <span className="text-[10px] font-mono text-[var(--color-figma-text-tertiary)] line-through">
            {formatTokenValue(change.type, change.before)}
          </span>
        </div>
      )}
    </div>
  );
}

/* ── Git Commits types ─────────────────────────────────────────────────── */

interface CommitEntry {
  hash: string;
  date: string;
  message: string;
  author: string;
}

interface CommitDetail {
  hash: string;
  changes: TokenChange[];
  fileCount: number;
}

/* ── Snapshot types ─────────────────────────────────────────────────────── */

interface SnapshotSummary {
  id: string;
  label: string;
  timestamp: string;
  tokenCount: number;
  setCount: number;
}

interface SnapshotDiff {
  path: string;
  set: string;
  status: ChangeStatus;
  before?: { $value: unknown; $type?: string };
  after?: { $value: unknown; $type?: string };
}

/** Convert snapshot diff to unified TokenChange */
function snapshotDiffToChange(d: SnapshotDiff): TokenChange {
  const type = (d.before as any)?.$type ?? (d.after as any)?.$type ?? '';
  return {
    path: d.path,
    set: d.set,
    type,
    status: d.status,
    before: (d.before as any)?.$value,
    after: (d.after as any)?.$value,
  };
}

/* ── Type pill ──────────────────────────────────────────────────────────── */

function TypePill({ kind }: { kind: 'action' | 'commit' | 'snapshot' }) {
  const styles: Record<string, string> = {
    action: 'bg-[color-mix(in_srgb,var(--color-figma-accent)_14%,transparent)] text-[var(--color-figma-accent)]',
    commit: 'bg-[color-mix(in_srgb,#a855f7_14%,transparent)] text-[#a855f7]',
    snapshot: 'bg-[color-mix(in_srgb,var(--color-figma-success)_14%,transparent)] text-[var(--color-figma-success)]',
  };
  const labels: Record<string, string> = { action: 'Action', commit: 'Commit', snapshot: 'Snapshot' };
  return (
    <span className={`shrink-0 text-[9px] font-semibold uppercase tracking-wide px-1 py-0.5 rounded ${styles[kind]}`}>
      {labels[kind]}
    </span>
  );
}

/* ── Main Panel ─────────────────────────────────────────────────────────── */

interface UndoSlot {
  description: string;
  restore: () => Promise<void>;
}

interface OperationEntry {
  id: string;
  timestamp: string;
  type: string;
  description: string;
  setName: string;
  affectedPaths: string[];
  rolledBack: boolean;
}

interface HistoryPanelProps {
  serverUrl: string;
  connected: boolean;
  onPushUndo?: (slot: UndoSlot) => void;
  onRefreshTokens?: () => void;
  /** When set, filter history to only entries that touched this token path */
  filterTokenPath?: string | null;
  onClearFilter?: () => void;
  /** Server operation log entries */
  recentOperations?: OperationEntry[];
  /** Total number of server operations (may exceed loaded count) */
  totalOperations?: number;
  /** Whether more server operations can be loaded */
  hasMoreOperations?: boolean;
  /** Load the next batch of server operations */
  onLoadMoreOperations?: () => void;
  /** Rollback a server operation by ID */
  onRollback?: (opId: string) => void;
  /** Descriptions of local undo stack entries (most recent last) */
  undoDescriptions?: string[];
  /** Set of original op IDs that currently have a server redo available */
  redoableOpIds?: Set<string>;
  /** Redo a previously rolled-back server operation by its original op ID */
  onServerRedo?: (opId: string) => void;
}

export function HistoryPanel({ serverUrl, connected, onPushUndo, onRefreshTokens, filterTokenPath, onClearFilter, recentOperations, totalOperations, hasMoreOperations, onLoadMoreOperations, onRollback, undoDescriptions, redoableOpIds, onServerRedo }: HistoryPanelProps) {
  // Timeline data fetched inside this panel
  const [timelineCommits, setTimelineCommits] = useState<CommitEntry[]>([]);
  const [timelineSnapshots, setTimelineSnapshots] = useState<SnapshotSummary[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(true);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [hasMoreCommits, setHasMoreCommits] = useState(false);
  const [commitOffset, setCommitOffset] = useState(0);
  const [loadingMoreCommits, setLoadingMoreCommits] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [commitSearch, setCommitSearch] = useState('');
  const [debouncedCommitSearch, setDebouncedCommitSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedCommitSearch(commitSearch), 300);
    return () => clearTimeout(timer);
  }, [commitSearch]);

  // Navigation state
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

  // Inline save-snapshot
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [saveLabel, setSaveLabel] = useState('');
  const [saving, setSaving] = useState(false);

  // Local undo stack visibility
  const [localOpen, setLocalOpen] = useState(true);

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
        apiFetch<{ commits?: CommitEntry[]; hasMore?: boolean }>(`${serverUrl}/api/sync/log?limit=50${searchParam}`),
        apiFetch<{ snapshots: SnapshotSummary[] }>(`${serverUrl}/api/snapshots`),
      ]);
      setTimelineCommits(commitsData.commits ?? []);
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
    fetchTimeline(debouncedCommitSearch);
  }, [fetchTimeline, debouncedCommitSearch]);

  const handleLoadMoreCommits = useCallback(async () => {
    if (!connected || loadingMoreCommits) return;
    setLoadingMoreCommits(true);
    setLoadMoreError(null);
    const nextOffset = commitOffset + 50;
    try {
      const searchParam = debouncedCommitSearch ? `&search=${encodeURIComponent(debouncedCommitSearch)}` : '';
      const data = await apiFetch<{ commits?: CommitEntry[]; hasMore?: boolean }>(
        `${serverUrl}/api/sync/log?limit=50&offset=${nextOffset}${searchParam}`
      );
      setTimelineCommits(prev => [...prev, ...(data.commits ?? [])]);
      setHasMoreCommits(data.hasMore ?? false);
      setCommitOffset(nextOffset);
    } catch (err) {
      console.warn('[HistoryPanel] load more commits failed:', err);
      setLoadMoreError((err as Error).message || 'Failed to load more commits');
    } finally {
      setLoadingMoreCommits(false);
    }
  }, [serverUrl, connected, loadingMoreCommits, commitOffset, debouncedCommitSearch]);

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
      await fetchTimeline();
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
    | { kind: 'snapshot'; ts: number; data: SnapshotSummary };

  const allEntries: TimelineItem[] = [
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

  const hasLocal = (undoDescriptions ?? []).length > 0;
  const isEmpty = allEntries.length === 0 && !hasLocal && !timelineError;

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
              className="flex-1 min-w-0 px-2 py-1 text-[10px] rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-tertiary)] focus:outline-none focus:border-[var(--color-figma-accent)]"
              placeholder="Snapshot label (optional)"
              value={saveLabel}
              onChange={e => setSaveLabel(e.target.value)}
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
              onClick={() => setShowSaveInput(true)}
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
                value={commitSearch}
                onChange={e => setCommitSearch(e.target.value)}
                placeholder="Search commits…"
                className="flex-1 min-w-0 bg-transparent text-[10px] text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-tertiary)] focus:outline-none"
              />
              {commitSearch && (
                <button
                  onClick={() => setCommitSearch('')}
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
              onClick={() => fetchTimeline(debouncedCommitSearch)}
              className="shrink-0 text-[10px] text-[var(--color-figma-accent)] hover:underline"
            >
              Refresh
            </button>
          </>
        )}
      </div>

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
                <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide px-1 py-0.5 rounded bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-tertiary)]">Local</span>
                <div className="min-w-0">
                  <p className="text-[10px] text-[var(--color-figma-text)]">This session · <span className="font-medium">⌘Z / Ctrl+Z</span></p>
                  <p className="text-[9px] text-[var(--color-figma-text-tertiary)] leading-tight">In-memory undo stack. Fast and immediate but lost on page refresh. Best for: "I just made a mistake moments ago."</p>
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
        {/* Local undo stack */}
        {hasLocal && (
          <div className="border-b border-[var(--color-figma-border)]">
            <button
              onClick={() => setLocalOpen(o => !o)}
              className="w-full flex items-center gap-1.5 px-3 py-2 text-left hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            >
              <svg
                width="8" height="8" viewBox="0 0 8 8" fill="currentColor"
                className={`shrink-0 text-[var(--color-figma-text-tertiary)] transition-transform ${localOpen ? 'rotate-90' : ''}`}
                aria-hidden="true"
              >
                <path d="M2 1l4 3-4 3V1z" />
              </svg>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-figma-text-secondary)]">
                This session
              </span>
              <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">
                ({undoDescriptions!.length})
              </span>
            </button>
            {localOpen && (
              <div className="pb-1">
                {[...(undoDescriptions!)].reverse().map((desc, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-1.5">
                    <span className="flex-1 text-[10px] text-[var(--color-figma-text)] truncate min-w-0">{desc}</span>
                    {i === 0 && (
                      <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-[color-mix(in_srgb,var(--color-figma-accent)_12%,transparent)] text-[var(--color-figma-accent)] font-medium">
                        Undo available
                      </span>
                    )}
                    <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-tertiary)]">
                      Local
                    </span>
                  </div>
                ))}
                <p className="px-3 py-1 text-[9px] text-[var(--color-figma-text-tertiary)] italic">
                  Local actions are undoable with ⌘Z but lost on refresh.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Loading state */}
        {timelineLoading && allEntries.length === 0 && (
          <div className="flex items-center justify-center py-8 gap-2">
            <Spinner size="md" className="text-[var(--color-figma-accent)]" />
            <p className="text-[11px] text-[var(--color-figma-text-secondary)]">Loading history…</p>
          </div>
        )}

        {/* Error state */}
        {!timelineLoading && timelineError && (
          <div className="flex flex-col items-center justify-center p-6 gap-2 text-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-tertiary)] opacity-60" aria-hidden="true">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p className="text-[11px] text-[var(--color-figma-text-secondary)]">Failed to load history</p>
            <p className="text-[10px] text-[var(--color-figma-text-tertiary)]">{timelineError}</p>
            <button
              onClick={() => fetchTimeline(debouncedCommitSearch)}
              className="mt-1 px-3 py-1 rounded text-[10px] font-medium bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty state */}
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

        {/* Merged timeline entries */}
        {allEntries.map((entry) => {
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

/* ══════════════════════════════════════════════════════════════════════════
   Git Commits source
   ══════════════════════════════════════════════════════════════════════════ */

function GitCommitsSource({ serverUrl, onPushUndo, onRefreshTokens, filterTokenPath, initialSelectedHash, initialSelectedCommit, onBack, skipListFetch }: {
  serverUrl: string;
  onPushUndo?: (slot: UndoSlot) => void;
  onRefreshTokens?: () => void;
  filterTokenPath?: string;
  initialSelectedHash?: string;
  initialSelectedCommit?: CommitEntry;
  onBack?: () => void;
  skipListFetch?: boolean;
}) {
  const [commits, setCommits] = useState<CommitEntry[]>(initialSelectedCommit ? [initialSelectedCommit] : []);
  const [loading, setLoading] = useState(!skipListFetch);
  const [error, setError] = useState<string | null>(null);
  const [selectedHash, setSelectedHash] = useState<string | null>(initialSelectedHash ?? null);
  const [detail, setDetail] = useState<CommitDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [restoring, setRestoring] = useState<string | null>(null);
  const [pendingRestore, setPendingRestore] = useState<{
    hash: string;
    tokens?: Array<{ path: string; set: string }>;
    label: string;
    summary: { added: number; modified: number; removed: number; total: number };
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Per-token filter: map from commit hash → change for that token (after eager fetch)
  const [tokenFilterMap, setTokenFilterMap] = useState<Map<string, TokenChange> | null>(null);
  const [filterLoading, setFilterLoading] = useState(false);
  // Commit message search + pagination
  const [commitSearch, setCommitSearch] = useState('');
  const [debouncedCommitSearch, setDebouncedCommitSearch] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [commitOffset, setCommitOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedCommitSearch(commitSearch), 300);
    return () => clearTimeout(timer);
  }, [commitSearch]);

  // Debounce filterTokenPath so rapid changes (e.g. keystroke-by-keystroke input)
  // don't fire a separate batch of API requests for each intermediate value.
  const [debouncedFilterPath, setDebouncedFilterPath] = useState(filterTokenPath);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedFilterPath(filterTokenPath), 300);
    return () => clearTimeout(timer);
  }, [filterTokenPath]);

  const fetchCommits = useCallback(async (search = '') => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    setCommitOffset(0);
    try {
      const searchParam = search ? `&search=${encodeURIComponent(search)}` : '';
      const data = await apiFetch<{ commits?: CommitEntry[]; hasMore?: boolean }>(`${serverUrl}/api/sync/log?limit=50${searchParam}`, { signal: controller.signal });
      setCommits(data.commits || []);
      setHasMore(data.hasMore ?? false);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError(String((err as Error).message || err));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [serverUrl]);

  useEffect(() => {
    if (skipListFetch) return;
    fetchCommits(debouncedCommitSearch);
    return () => { abortRef.current?.abort(); };
  }, [fetchCommits, skipListFetch, debouncedCommitSearch]);

  const handleLoadMoreCommits = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    setError(null);
    const nextOffset = commitOffset + 50;
    try {
      const searchParam = debouncedCommitSearch ? `&search=${encodeURIComponent(debouncedCommitSearch)}` : '';
      const data = await apiFetch<{ commits?: CommitEntry[]; hasMore?: boolean }>(
        `${serverUrl}/api/sync/log?limit=50&offset=${nextOffset}${searchParam}`
      );
      setCommits(prev => [...prev, ...(data.commits ?? [])]);
      setHasMore(data.hasMore ?? false);
      setCommitOffset(nextOffset);
    } catch (err) {
      console.warn('[HistoryPanel] load more commits failed:', err);
      setError(String((err as Error).message || err));
    } finally {
      setLoadingMore(false);
    }
  }, [serverUrl, loadingMore, commitOffset, debouncedCommitSearch]);

  // When debouncedFilterPath changes, eagerly fetch all commit details to build filter map
  useEffect(() => {
    if (!debouncedFilterPath || commits.length === 0) {
      setTokenFilterMap(null);
      return;
    }
    let cancelled = false;
    setFilterLoading(true);
    Promise.all(
      commits.map(async (commit) => {
        try {
          const data = await apiFetch<{ changes?: TokenChange[] }>(`${serverUrl}/api/sync/log/${commit.hash}/tokens`);
          const match = (data.changes ?? []).find(c => c.path === debouncedFilterPath);
          return { hash: commit.hash, change: match ?? null };
        } catch {
          return { hash: commit.hash, change: null };
        }
      })
    ).then(results => {
      if (cancelled) return;
      const map = new Map<string, TokenChange>();
      for (const { hash, change } of results) {
        if (change) map.set(hash, change);
      }
      setTokenFilterMap(map);
      setFilterLoading(false);
    });
    return () => { cancelled = true; };
  }, [debouncedFilterPath, commits, serverUrl]);

  const fetchDetail = useCallback(async (hash: string) => {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const data = await apiFetch<{ hash?: string; changes?: TokenChange[]; fileCount?: number }>(`${serverUrl}/api/sync/log/${hash}/tokens`);
      if (!data || !Array.isArray(data.changes)) {
        throw new Error('Invalid response: expected an object with a "changes" array');
      }
      const parsed: CommitDetail = {
        hash: typeof data.hash === 'string' ? data.hash : hash,
        changes: data.changes,
        fileCount: typeof data.fileCount === 'number' ? data.fileCount : 0,
      };
      setDetail(parsed);
      const sections: Record<string, boolean> = {};
      const sets = new Set(parsed.changes.map((c: TokenChange) => c.set));
      for (const s of sets) sections[s] = true;
      setOpenSections(sections);
    } catch (err) {
      setDetailError(String((err as Error).message || err));
    } finally {
      setDetailLoading(false);
    }
  }, [serverUrl]);

  // Auto-fetch detail when mounted from the unified timeline
  useEffect(() => {
    if (initialSelectedHash) {
      fetchDetail(initialSelectedHash);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // Safe: mount-only. `initialSelectedHash` is an "initial value" prop — it sets the starting
    // state and should not trigger re-fetches if the parent re-renders. `fetchDetail` is a stable
    // useCallback; omitting it avoids re-runs if its deps (serverUrl) ever change on mount.
  }, []);

  const handleSelectCommit = useCallback((hash: string) => {
    setSelectedHash(hash);
    fetchDetail(hash);
  }, [fetchDetail]);

  const handleBack = useCallback(() => {
    if (onBack) {
      onBack();
      return;
    }
    setSelectedHash(null);
    setDetail(null);
    setDetailError(null);
  }, [onBack]);

  const toggleSection = useCallback((key: string) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const restoreFromCommit = useCallback(async (
    hash: string,
    tokens?: Array<{ path: string; set: string }>,
  ) => {
    const key = tokens && tokens.length === 1 ? tokens[0].path : 'all';
    setRestoring(key);
    try {
      const result = await apiFetch<{ ok: true; restored: number; operationId: string; paths: string[] }>(`${serverUrl}/api/sync/log/${hash}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens }),
      });

      if (onPushUndo && result.operationId) {
        const opId = result.operationId;
        const desc = tokens && tokens.length === 1
          ? `Restore ${tokens[0].path}`
          : `Restore ${result.restored} tokens from ${hash.slice(0, 7)}`;
        onPushUndo({
          description: desc,
          restore: async () => {
            await apiFetch(`${serverUrl}/api/operations/${opId}/rollback`, { method: 'POST' });
            onRefreshTokens?.();
          },
        });
      }

      onRefreshTokens?.();
    } catch (err) {
      setError(String((err as Error).message || err));
    } finally {
      setRestoring(null);
    }
  }, [serverUrl, onPushUndo, onRefreshTokens]);

  /** Show confirmation dialog before restoring */
  const requestRestore = useCallback((
    hash: string,
    tokens?: Array<{ path: string; set: string }>,
  ) => {
    if (!detail) return;
    const relevantChanges = tokens
      ? detail.changes.filter(c => tokens.some(t => t.path === c.path && t.set === c.set))
      : detail.changes;
    const summary = summarizeChanges(relevantChanges);
    const total = relevantChanges.length;
    const label = tokens && tokens.length === 1
      ? tokens[0].path
      : `${total} token${total !== 1 ? 's' : ''} from ${hash.slice(0, 7)}`;
    setPendingRestore({ hash, tokens, label, summary: { ...summary, total } });
  }, [detail]);

  const confirmRestore = useCallback(() => {
    if (!pendingRestore) return;
    setPendingRestore(null);
    restoreFromCommit(pendingRestore.hash, pendingRestore.tokens);
  }, [pendingRestore, restoreFromCommit]);

  const cancelRestore = useCallback(() => {
    setPendingRestore(null);
  }, []);

  // Loading state
  if (loading && commits.length === 0) {
    return (
      <div className="flex items-center justify-center flex-1">
        <p className="text-[11px] text-[var(--color-figma-text-secondary)]">Loading history…</p>
      </div>
    );
  }

  // Error state
  if (error && commits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 p-6 gap-3 text-center">
        <p className="text-[11px] text-[var(--color-figma-text-secondary)]">{error}</p>
        <button
          onClick={fetchCommits}
          className="px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)]"
        >
          Retry
        </button>
      </div>
    );
  }

  // Empty state
  if (!loading && commits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 px-5 py-8 text-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] flex items-center justify-center">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-secondary)]" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-[12px] font-semibold text-[var(--color-figma-text)]">No commits yet</p>
          <p className="text-[11px] text-[var(--color-figma-text-secondary)] leading-relaxed max-w-[240px]">
            Commit changes in the Publish tab to start tracking version history.
          </p>
        </div>
      </div>
    );
  }

  // Detail view
  if (selectedHash) {
    const commit = commits.find(c => c.hash === selectedHash);
    return (
      <div className="relative flex flex-col flex-1 overflow-hidden">
        {/* Header */}
        <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
          <button
            onClick={handleBack}
            className="flex items-center gap-1 text-[11px] text-[var(--color-figma-accent)] hover:underline"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back
          </button>
        </div>

        {/* Commit info */}
        {commit && (
          <div className="shrink-0 px-3 py-2 border-b border-[var(--color-figma-border)]">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-[var(--color-figma-text)] leading-snug">{commit.message}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">{commit.author}</span>
                  <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">{formatRelativeTime(new Date(commit.date))}</span>
                  <span className="text-[10px] font-mono text-[var(--color-figma-text-tertiary)]">{commit.hash.slice(0, 7)}</span>
                </div>
              </div>
              {detail && detail.changes.length > 0 && (
                <button
                  onClick={() => requestRestore(selectedHash!)}
                  disabled={restoring !== null}
                  className="shrink-0 px-2.5 py-1 rounded text-[10px] font-medium bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-50 transition-colors flex items-center gap-1"
                  title="Revert all token changes in this commit"
                >
                  {restoring === 'all' ? (
                    <Spinner />
                  ) : (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                      <path d="M3 3v5h5" />
                    </svg>
                  )}
                  {restoring === 'all' ? 'Restoring…' : 'Restore all'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Changes */}
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {detailLoading ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-[11px] text-[var(--color-figma-text-secondary)]">Loading changes…</p>
            </div>
          ) : detailError ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <p className="text-[11px] text-[var(--color-figma-text-secondary)]">{detailError}</p>
              <button
                onClick={() => fetchDetail(selectedHash!)}
                className="px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)]"
              >
                Retry
              </button>
            </div>
          ) : detail && detail.changes.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-[11px] text-[var(--color-figma-text-tertiary)]">No token changes in this commit.</p>
            </div>
          ) : detail && restoring ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Spinner size="xl" className="text-[var(--color-figma-accent)]" />
              <p className="text-[11px] text-[var(--color-figma-text-secondary)]">
                Restoring {restoring === 'all' ? 'all tokens' : restoring}…
              </p>
            </div>
          ) : detail ? (
            (() => {
              const bySet = new Map<string, TokenChange[]>();
              for (const change of detail.changes) {
                if (!bySet.has(change.set)) bySet.set(change.set, []);
                bySet.get(change.set)!.push(change);
              }

              return Array.from(bySet.entries()).map(([setName, changes]) => {
                const summary = summarizeChanges(changes);
                return (
                  <Section
                    key={setName}
                    title={setName}
                    open={openSections[setName] ?? true}
                    onToggle={() => toggleSection(setName)}
                    badge={<ChangeSummaryBadges {...summary} />}
                  >
                    <div className="divide-y divide-[var(--color-figma-border)]">
                      {changes.map((change, i) => (
                        <ChangeRow
                          key={`${change.path}-${i}`}
                          change={change}
                          restoreButton={
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                requestRestore(selectedHash!, [{ path: change.path, set: change.set }]);
                              }}
                              disabled={restoring !== null}
                              className="shrink-0 ml-auto opacity-0 group-hover/row:opacity-100 pointer-events-none group-hover/row:pointer-events-auto transition-opacity px-1.5 py-0.5 rounded text-[9px] font-medium bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-50"
                              title={`Restore ${change.path} to its previous value`}
                            >
                              {restoring === change.path ? (
                                <span className="flex items-center gap-1">
                                  <Spinner size="xs" />
                                  Restoring…
                                </span>
                              ) : 'Restore'}
                            </button>
                          }
                        />
                      ))}
                    </div>
                  </Section>
                );
              });
            })()
          ) : null}
        </div>

        {/* Restore confirmation dialog */}
        {pendingRestore && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/30">
            <div className="bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] rounded-lg shadow-xl mx-4 max-w-[280px] w-full overflow-hidden">
              <div className="px-4 pt-4 pb-3">
                <p className="text-[12px] font-semibold text-[var(--color-figma-text)]">Confirm restore</p>
                <p className="text-[11px] text-[var(--color-figma-text-secondary)] mt-1.5 leading-relaxed">
                  {pendingRestore.summary.total === 1
                    ? 'This will overwrite 1 token:'
                    : `This will overwrite ${pendingRestore.summary.total} tokens:`}
                </p>
                <div className="flex items-center gap-3 mt-2">
                  {pendingRestore.summary.modified > 0 && (
                    <span className="text-[10px] font-medium" style={{ color: statusColor('modified') }}>
                      {pendingRestore.summary.modified} modified
                    </span>
                  )}
                  {pendingRestore.summary.added > 0 && (
                    <span className="text-[10px] font-medium" style={{ color: statusColor('added') }}>
                      {pendingRestore.summary.added} added
                    </span>
                  )}
                  {pendingRestore.summary.removed > 0 && (
                    <span className="text-[10px] font-medium" style={{ color: statusColor('removed') }}>
                      {pendingRestore.summary.removed} removed
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-2 px-4 pb-4">
                <button
                  onClick={cancelRestore}
                  className="flex-1 px-3 py-1.5 rounded border border-[var(--color-figma-border)] text-[11px] font-medium text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmRestore}
                  className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] transition-colors"
                >
                  Restore
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Per-token filter mode: loading state while debouncing or eagerly fetching diffs
  const debouncing = filterTokenPath !== debouncedFilterPath;
  if (filterTokenPath && (filterLoading || debouncing)) {
    return (
      <div className="flex items-center justify-center flex-1 gap-2">
        <Spinner size="md" className="text-[var(--color-figma-accent)]" />
        <p className="text-[11px] text-[var(--color-figma-text-secondary)]">Searching history…</p>
      </div>
    );
  }

  // Per-token filter mode: computed filtered list
  const filteredCommits = filterTokenPath && tokenFilterMap
    ? commits.filter(c => tokenFilterMap.has(c.hash))
    : null;

  // Timeline view
  const displayCommits = filteredCommits ?? commits;
  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex flex-col border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-[11px] font-semibold text-[var(--color-figma-text)]">
            {filterTokenPath
              ? `${displayCommits.length} of ${commits.length} commit${commits.length !== 1 ? 's' : ''}`
              : `${commits.length} commit${commits.length !== 1 ? 's' : ''}${hasMore ? '+' : ''}`}
          </span>
          <button
            onClick={() => fetchCommits(debouncedCommitSearch)}
            className="text-[10px] text-[var(--color-figma-accent)] hover:underline"
          >
            Refresh
          </button>
        </div>
        {!filterTokenPath && (
          <div className="flex items-center gap-1.5 px-3 pb-2">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--color-figma-text-tertiary)]" aria-hidden="true">
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={commitSearch}
              onChange={e => setCommitSearch(e.target.value)}
              placeholder="Search commits…"
              className="flex-1 min-w-0 bg-transparent text-[10px] text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-tertiary)] focus:outline-none"
            />
            {commitSearch && (
              <button
                onClick={() => setCommitSearch('')}
                className="shrink-0 text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text)] transition-colors"
                aria-label="Clear search"
              >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Empty filter result */}
      {filterTokenPath && tokenFilterMap && displayCommits.length === 0 && (
        <div className="flex flex-col items-center justify-center flex-1 px-5 py-8 text-center gap-3">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-tertiary)]" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <p className="text-[11px] text-[var(--color-figma-text-secondary)]">
            No commits found that changed this token.
          </p>
        </div>
      )}

      {/* Empty search result */}
      {!filterTokenPath && !loading && commits.length === 0 && debouncedCommitSearch && (
        <div className="flex flex-col items-center justify-center flex-1 px-5 py-8 text-center gap-3">
          <p className="text-[11px] text-[var(--color-figma-text-secondary)]">No commits match "{debouncedCommitSearch}".</p>
          <button
            onClick={() => setCommitSearch('')}
            className="text-[10px] text-[var(--color-figma-accent)] hover:underline"
          >
            Clear search
          </button>
        </div>
      )}

      {/* Commit list */}
      <div className="flex-1 overflow-y-auto">
        {displayCommits.map((commit, idx) => {
          const tokenChange = tokenFilterMap?.get(commit.hash);
          return (
            <button
              key={commit.hash}
              onClick={() => handleSelectCommit(commit.hash)}
              className="w-full text-left px-3 py-2.5 border-b border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)] transition-colors group"
            >
              <div className="flex items-start gap-2">
                <div className="shrink-0 mt-1.5 flex flex-col items-center">
                  <div className={`w-2 h-2 rounded-full ${idx === 0 ? 'bg-[var(--color-figma-accent)]' : 'bg-[var(--color-figma-border)]'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium text-[var(--color-figma-text)] leading-snug truncate">{commit.message}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">{commit.author}</span>
                    <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">{formatRelativeTime(new Date(commit.date))}</span>
                    <span className="text-[10px] font-mono text-[var(--color-figma-text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity">{commit.hash.slice(0, 7)}</span>
                  </div>
                  {tokenChange && (
                    <div className="mt-1 flex items-center gap-1.5">
                      <StatusBadge status={tokenChange.status} />
                      {tokenChange.status === 'modified' && (
                        <span className="text-[10px] font-mono text-[var(--color-figma-text-tertiary)] truncate">
                          {formatTokenValue(tokenChange.type, tokenChange.before)} → {formatTokenValue(tokenChange.type, tokenChange.after)}
                        </span>
                      )}
                      {tokenChange.status === 'added' && (
                        <span className="text-[10px] font-mono text-[var(--color-figma-text-secondary)] truncate">
                          {formatTokenValue(tokenChange.type, tokenChange.after)}
                        </span>
                      )}
                      {tokenChange.status === 'removed' && (
                        <span className="text-[10px] font-mono text-[var(--color-figma-text-tertiary)] line-through truncate">
                          {formatTokenValue(tokenChange.type, tokenChange.before)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-1 text-[var(--color-figma-text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </div>
            </button>
          );
        })}

        {/* Load more commits / load more error */}
        {!filterTokenPath && (hasMore || (error && commits.length > 0)) && (
          <div className="px-3 py-3 flex flex-col gap-1.5">
            {error && commits.length > 0 && (
              <p className="text-[10px] text-center text-[var(--color-figma-text-tertiary)]">{error}</p>
            )}
            {(hasMore || (error && commits.length > 0)) && (
              <button
                onClick={handleLoadMoreCommits}
                disabled={loadingMore}
                className="w-full text-[10px] py-1.5 rounded font-medium transition-colors bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {loadingMore ? (
                  <><Spinner size="xs" />Loading…</>
                ) : error ? (
                  'Retry'
                ) : (
                  'Load more commits'
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Commit Compare View — side-by-side diff between two arbitrary commits
   ══════════════════════════════════════════════════════════════════════════ */

function CommitCompareView({
  serverUrl,
  commitA,
  commitB,
  onBack,
}: {
  serverUrl: string;
  commitA: CommitEntry;
  commitB: CommitEntry;
  onBack: () => void;
}) {
  const [changes, setChanges] = useState<TokenChange[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiFetch<{ changes?: TokenChange[]; fileCount?: number }>(
      `${serverUrl}/api/sync/compare?from=${encodeURIComponent(commitA.hash)}&to=${encodeURIComponent(commitB.hash)}`
    ).then(data => {
      if (cancelled) return;
      const c = data.changes ?? [];
      setChanges(c);
      const sections: Record<string, boolean> = {};
      const sets = new Set(c.map(ch => ch.set));
      for (const s of sets) sections[s] = true;
      setOpenSections(sections);
    }).catch(err => {
      if (cancelled) return;
      setError(String((err as Error).message || err));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [serverUrl, commitA.hash, commitB.hash]);

  const toggleSection = useCallback((key: string) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-[11px] text-[var(--color-figma-accent)] hover:underline shrink-0"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <span className="text-[10px] text-[var(--color-figma-text-tertiary)] truncate min-w-0">
          Comparing commits
        </span>
      </div>

      {/* Commit A / B info cards */}
      <div className="shrink-0 grid grid-cols-2 gap-px bg-[var(--color-figma-border)] border-b border-[var(--color-figma-border)]">
        <div className="px-3 py-2 bg-[var(--color-figma-bg)] space-y-0.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-[color-mix(in_srgb,var(--color-figma-accent)_20%,transparent)] text-[var(--color-figma-accent)]">A</span>
            <span className="text-[10px] font-mono text-[var(--color-figma-text-tertiary)]">{commitA.hash.slice(0, 7)}</span>
          </div>
          <p className="text-[10px] font-medium text-[var(--color-figma-text)] leading-snug truncate" title={commitA.message}>{commitA.message}</p>
          <p className="text-[9px] text-[var(--color-figma-text-tertiary)]">{formatRelativeTime(new Date(commitA.date))}</p>
        </div>
        <div className="px-3 py-2 bg-[var(--color-figma-bg)] space-y-0.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-[color-mix(in_srgb,var(--color-figma-success)_20%,transparent)] text-[var(--color-figma-success)]">B</span>
            <span className="text-[10px] font-mono text-[var(--color-figma-text-tertiary)]">{commitB.hash.slice(0, 7)}</span>
          </div>
          <p className="text-[10px] font-medium text-[var(--color-figma-text)] leading-snug truncate" title={commitB.message}>{commitB.message}</p>
          <p className="text-[9px] text-[var(--color-figma-text-tertiary)]">{formatRelativeTime(new Date(commitB.date))}</p>
        </div>
      </div>

      {/* Diff content */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {loading && (
          <div className="flex items-center justify-center py-8 gap-2">
            <Spinner size="md" className="text-[var(--color-figma-accent)]" />
            <p className="text-[11px] text-[var(--color-figma-text-secondary)]">Computing diff…</p>
          </div>
        )}
        {!loading && error && (
          <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
            <p className="text-[11px] text-[var(--color-figma-text-secondary)]">{error}</p>
          </div>
        )}
        {!loading && !error && changes !== null && changes.length === 0 && (
          <div className="flex items-center justify-center py-8">
            <p className="text-[11px] text-[var(--color-figma-text-tertiary)]">No token differences between these two commits.</p>
          </div>
        )}
        {!loading && !error && changes !== null && changes.length > 0 && (() => {
          const summary = summarizeChanges(changes);
          const bySet = new Map<string, TokenChange[]>();
          for (const change of changes) {
            if (!bySet.has(change.set)) bySet.set(change.set, []);
            bySet.get(change.set)!.push(change);
          }
          return (
            <>
              {/* Summary bar */}
              <div className="flex items-center gap-2 px-1 py-1">
                <ChangeSummaryBadges {...summary} />
                <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">across {bySet.size} set{bySet.size !== 1 ? 's' : ''}</span>
              </div>
              {Array.from(bySet.entries()).map(([setName, setChanges]) => {
                const setSummary = summarizeChanges(setChanges);
                return (
                  <Section
                    key={setName}
                    title={setName}
                    open={openSections[setName] ?? true}
                    onToggle={() => toggleSection(setName)}
                    badge={<ChangeSummaryBadges {...setSummary} />}
                  >
                    <div className="divide-y divide-[var(--color-figma-border)]">
                      {setChanges.map((change, i) => (
                        <ChangeRow key={`${change.path}-${i}`} change={change} />
                      ))}
                    </div>
                  </Section>
                );
              })}
            </>
          );
        })()}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Snapshots source
   ══════════════════════════════════════════════════════════════════════════ */

function SnapshotsSource({ serverUrl, onPushUndo, onRefreshTokens, filterTokenPath, initialComparingId, initialComparingLabel, onBack }: { serverUrl: string; onPushUndo?: (slot: UndoSlot) => void; onRefreshTokens?: () => void; filterTokenPath?: string; initialComparingId?: string; initialComparingLabel?: string; onBack?: () => void; }) {
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [comparing, setComparing] = useState<string | null>(initialComparingId ?? null);
  const [changes, setChanges] = useState<TokenChange[] | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [labelInput, setLabelInput] = useState('');
  const [showLabelInput, setShowLabelInput] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [ticker, setTicker] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTicker(t => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const loadSnapshots = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ snapshots: SnapshotSummary[] }>(`${serverUrl}/api/snapshots`);
      setSnapshots(data.snapshots ?? []);
    } catch (err) {
      console.warn('[HistoryPanel] failed to load snapshots:', err);
      setError('Could not load snapshots');
    } finally {
      setLoading(false);
    }
  }, [serverUrl]);

  useEffect(() => {
    if (!initialComparingId) {
      loadSnapshots();
    }
  }, [loadSnapshots, initialComparingId]);

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const handleSave = async () => {
    const label = labelInput.trim() || `Snapshot ${new Date().toLocaleString()}`;
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`${serverUrl}/api/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      });
      setLabelInput('');
      setShowLabelInput(false);
      showSuccess('State saved');
      await loadSnapshots();
    } catch (err) {
      console.warn('[HistoryPanel] failed to save snapshot:', err);
      setError('Failed to save snapshot');
    } finally {
      setSaving(false);
    }
  };

  const handleCompare = useCallback(async (id: string) => {
    setComparing(id);
    setDiffLoading(true);
    setChanges(null);
    setError(null);
    try {
      const data = await apiFetch<{ diffs: SnapshotDiff[] }>(`${serverUrl}/api/snapshots/${id}/diff`);
      const unified = (data.diffs ?? []).map(snapshotDiffToChange);
      setChanges(unified);
      // Auto-open all set sections
      const sections: Record<string, boolean> = {};
      for (const c of unified) sections[c.set] = true;
      setOpenSections(sections);
    } catch (err) {
      console.warn('[HistoryPanel] failed to load comparison:', err);
      setError('Failed to load comparison');
      setComparing(null);
    } finally {
      setDiffLoading(false);
    }
  }, [serverUrl]);

  // Auto-compare when mounted from the unified timeline
  useEffect(() => {
    if (initialComparingId) {
      handleCompare(initialComparingId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // Safe: mount-only. `initialComparingId` is an "initial value" prop — it sets the starting
    // state and should not trigger re-compares if the parent re-renders. `handleCompare` is a
    // stable useCallback; omitting it avoids re-runs if its deps (serverUrl) change on mount.
  }, []);

  const handleRevert = async () => {
    if (!comparing) return;
    setReverting(true);
    setError(null);
    try {
      const result = await apiFetch<{ ok: true; restoredSets: string[]; operationId?: string }>(
        `${serverUrl}/api/snapshots/${comparing}/restore`,
        { method: 'POST' },
      );

      if (onPushUndo && result.operationId) {
        const opId = result.operationId;
        onPushUndo({
          description: `Revert to snapshot`,
          restore: async () => {
            await apiFetch(`${serverUrl}/api/operations/${opId}/rollback`, { method: 'POST' });
            onRefreshTokens?.();
          },
        });
      }

      onRefreshTokens?.();
      showSuccess('Reverted to saved state');
      setComparing(null);
      setChanges(null);
    } catch (err) {
      console.warn('[HistoryPanel] failed to revert snapshot:', err);
      setError('Failed to revert');
    } finally {
      setReverting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setError(null);
    try {
      await apiFetch(`${serverUrl}/api/snapshots/${id}`, { method: 'DELETE' });
      if (comparing === id) {
        setComparing(null);
        setChanges(null);
      }
      await loadSnapshots();
    } catch (err) {
      console.warn('[HistoryPanel] failed to delete snapshot:', err);
      setError('Failed to delete snapshot');
    }
  };

  const handleKeepChanges = () => {
    if (onBack) {
      onBack();
      return;
    }
    setComparing(null);
    setChanges(null);
    showSuccess('Changes kept');
  };

  const toggleSection = useCallback((key: string) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // ── Compare view ──────────────────────────────────────────────────────
  if (comparing) {
    const snapshot = snapshots.find(s => s.id === comparing);
    // When filtering by token path, only show that token's change
    const displayChanges = filterTokenPath && changes
      ? changes.filter(c => c.path === filterTokenPath)
      : changes;
    const summary = displayChanges ? summarizeChanges(displayChanges) : { added: 0, modified: 0, removed: 0 };
    const noChanges = displayChanges?.length === 0;

    // Group changes by set
    const bySet = new Map<string, TokenChange[]>();
    if (displayChanges) {
      for (const c of displayChanges) {
        if (!bySet.has(c.set)) bySet.set(c.set, []);
        bySet.get(c.set)!.push(c);
      }
    }

    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-figma-border)] shrink-0">
          <button
            className="flex items-center gap-1 text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
            onClick={() => { if (onBack) { onBack(); } else { setComparing(null); setChanges(null); } }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
            Back
          </button>
          <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">/</span>
          <span className="text-[10px] text-[var(--color-figma-text)] truncate flex-1 min-w-0" title={snapshot?.label ?? initialComparingLabel}>
            {snapshot?.label ?? initialComparingLabel ?? 'Compare'}
          </span>
        </div>

        {/* Summary bar */}
        {!diffLoading && displayChanges && (
          <div className="flex items-center gap-3 px-3 py-2 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] shrink-0">
            {noChanges ? (
              <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                {filterTokenPath ? 'This token was unchanged at this snapshot.' : 'No changes since this snapshot.'}
              </span>
            ) : (
              <ChangeSummaryBadges {...summary} />
            )}
          </div>
        )}

        {/* Diff list — now grouped by set with shared ChangeRow */}
        <div className="flex-1 overflow-y-auto min-h-0 p-2 space-y-2">
          {diffLoading && (
            <div className="flex items-center justify-center h-24">
              <span className="text-[11px] text-[var(--color-figma-text-secondary)] animate-pulse">Loading comparison…</span>
            </div>
          )}
          {!diffLoading && noChanges && (
            <div className="flex flex-col items-center justify-center h-32 gap-2 px-6 text-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-success)]" aria-hidden="true">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              <p className="text-[11px] text-[var(--color-figma-text-secondary)]">
                {filterTokenPath ? 'This token was unchanged at this snapshot.' : 'No changes since this snapshot.'}
              </p>
            </div>
          )}
          {!diffLoading && displayChanges && displayChanges.length > 0 && (
            Array.from(bySet.entries()).map(([setName, setChanges]) => {
              const setSummary = summarizeChanges(setChanges);
              return (
                <Section
                  key={setName}
                  title={setName}
                  open={openSections[setName] ?? true}
                  onToggle={() => toggleSection(setName)}
                  badge={<ChangeSummaryBadges {...setSummary} />}
                >
                  <div className="divide-y divide-[var(--color-figma-border)]">
                    {setChanges.map((change, i) => (
                      <ChangeRow key={`${change.path}-${i}`} change={change} />
                    ))}
                  </div>
                </Section>
              );
            })
          )}
        </div>

        {/* Actions */}
        <div className="shrink-0 border-t border-[var(--color-figma-border)] p-3 flex gap-2">
          <button
            className="flex-1 px-3 py-1.5 rounded border border-[var(--color-figma-border)] text-[11px] font-medium text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            onClick={handleKeepChanges}
          >
            Keep changes
          </button>
          <button
            className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-50"
            onClick={handleRevert}
            disabled={reverting}
          >
            {reverting ? 'Reverting…' : 'Revert to saved'}
          </button>
        </div>

        {error && (
          <div className="shrink-0 px-3 pb-2">
            <p className="text-[10px] text-[var(--color-figma-error)]">{error}</p>
          </div>
        )}
      </div>
    );
  }

  // ── List view ──────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Save bar */}
      <div className="shrink-0 p-3 border-b border-[var(--color-figma-border)]">
        {!showLabelInput ? (
          <button
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-50"
            onClick={() => setShowLabelInput(true)}
            disabled={saving}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
            Save current state
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            <input
              className="w-full px-2 py-1.5 text-[11px] rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-tertiary)] focus:outline-none focus:border-[var(--color-figma-accent)]"
              placeholder="Label (optional)"
              value={labelInput}
              onChange={e => setLabelInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') { setShowLabelInput(false); setLabelInput(''); } }}
              autoFocus
            />
            <div className="flex gap-2">
              <button
                className="flex-1 px-2 py-1.5 rounded border border-[var(--color-figma-border)] text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                onClick={() => { setShowLabelInput(false); setLabelInput(''); }}
              >
                Cancel
              </button>
              <button
                className="flex-1 px-2 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-50"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        )}

        {successMsg && (
          <p className="mt-2 text-[10px] text-[var(--color-figma-success)] text-center">{successMsg}</p>
        )}
        {error && !comparing && (
          <p className="mt-2 text-[10px] text-[var(--color-figma-error)]">{error}</p>
        )}
      </div>

      {/* Snapshots list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading && (
          <div className="flex items-center justify-center h-24">
            <span className="text-[11px] text-[var(--color-figma-text-secondary)] animate-pulse">Loading…</span>
          </div>
        )}

        {!loading && snapshots.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-6 py-10 text-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-tertiary)]" aria-hidden="true">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
            <p className="text-[11px] text-[var(--color-figma-text-secondary)]">
              Save your current token state before making changes. Come back to compare or revert anytime.
            </p>
          </div>
        )}

        {!loading && snapshots.length > 0 && (
          <ul>
            {snapshots.map(s => (
              <li key={s.id} className="group flex items-start gap-2 px-3 py-2.5 border-b border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)] last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium text-[var(--color-figma-text)] truncate" title={s.label}>
                    {s.label}
                  </p>
                  <p className="text-[10px] text-[var(--color-figma-text-tertiary)] mt-0.5">
                    {formatRelativeTime(new Date(s.timestamp))}{ticker >= 0 ? '' : ''} · {s.tokenCount} tokens · {s.setCount} {s.setCount === 1 ? 'set' : 'sets'}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    className="px-2 py-1 rounded text-[10px] font-medium border border-[var(--color-figma-border)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-secondary)] transition-colors"
                    onClick={() => handleCompare(s.id)}
                    title="Compare with current state"
                  >
                    Compare
                  </button>
                  <button
                    className="px-1.5 py-1 rounded text-[10px] text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10 transition-colors"
                    onClick={() => handleDelete(s.id)}
                    title="Delete snapshot"
                    aria-label="Delete snapshot"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
