import { useState, useEffect, useCallback, useRef } from 'react';
import { ValueDiff } from './ValueDiff';
import { RecentActionsSource } from './RecentActionsSource';
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

/* ── Source tab type ────────────────────────────────────────────────────── */

type HistorySource = 'actions' | 'commits' | 'snapshots';

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
  /** Rollback a server operation by ID */
  onRollback?: (opId: string) => void;
  /** Descriptions of local undo stack entries (most recent last) */
  undoDescriptions?: string[];
}

export function HistoryPanel({ serverUrl, connected, onPushUndo, onRefreshTokens, filterTokenPath, onClearFilter, recentOperations, onRollback, undoDescriptions }: HistoryPanelProps) {
  const [source, setSource] = useState<HistorySource>('actions');

  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 gap-2 text-center">
        <p className="text-[11px] text-[var(--color-figma-text-secondary)]">Connect to a server to view history.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Source tab bar */}
      <div className="shrink-0 flex border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
        {([
          { id: 'actions' as const, label: 'Recent Actions' },
          { id: 'commits' as const, label: 'Git Commits' },
          { id: 'snapshots' as const, label: 'Snapshots' },
        ]).map(tab => (
          <button
            key={tab.id}
            onClick={() => setSource(tab.id)}
            className={`flex-1 px-3 py-2 text-[11px] font-medium transition-colors ${
              source === tab.id
                ? 'text-[var(--color-figma-text)] border-b-2 border-[var(--color-figma-accent)]'
                : 'text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

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

      {/* Source content */}
      {source === 'actions' ? (
        <RecentActionsSource
          recentOperations={recentOperations ?? []}
          onRollback={onRollback ?? (() => {})}
          undoDescriptions={undoDescriptions ?? []}
          onSwitchTab={setSource}
        />
      ) : source === 'commits' ? (
        <GitCommitsSource
          serverUrl={serverUrl}
          onPushUndo={onPushUndo}
          onRefreshTokens={onRefreshTokens}
          filterTokenPath={filterTokenPath ?? undefined}
        />
      ) : (
        <SnapshotsSource serverUrl={serverUrl} onPushUndo={onPushUndo} onRefreshTokens={onRefreshTokens} filterTokenPath={filterTokenPath ?? undefined} />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Git Commits source
   ══════════════════════════════════════════════════════════════════════════ */

function GitCommitsSource({ serverUrl, onPushUndo, onRefreshTokens, filterTokenPath }: {
  serverUrl: string;
  onPushUndo?: (slot: UndoSlot) => void;
  onRefreshTokens?: () => void;
  filterTokenPath?: string;
}) {
  const [commits, setCommits] = useState<CommitEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
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

  // Debounce filterTokenPath so rapid changes (e.g. keystroke-by-keystroke input)
  // don't fire a separate batch of API requests for each intermediate value.
  const [debouncedFilterPath, setDebouncedFilterPath] = useState(filterTokenPath);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedFilterPath(filterTokenPath), 300);
    return () => clearTimeout(timer);
  }, [filterTokenPath]);

  const fetchCommits = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ commits?: CommitEntry[] }>(`${serverUrl}/api/sync/log?limit=50`, { signal: controller.signal });
      setCommits(data.commits || []);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError(String((err as Error).message || err));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [serverUrl]);

  useEffect(() => {
    fetchCommits();
    return () => { abortRef.current?.abort(); };
  }, [fetchCommits]);

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

  const handleSelectCommit = useCallback((hash: string) => {
    setSelectedHash(hash);
    fetchDetail(hash);
  }, [fetchDetail]);

  const handleBack = useCallback(() => {
    setSelectedHash(null);
    setDetail(null);
    setDetailError(null);
  }, []);

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
                    <svg className="animate-spin" width="10" height="10" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="22 10" />
                    </svg>
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
              <svg className="animate-spin text-[var(--color-figma-accent)]" width="20" height="20" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="22 10" />
              </svg>
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
                                  <svg className="animate-spin" width="8" height="8" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                                    <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="22 10" />
                                  </svg>
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
        <svg className="animate-spin text-[var(--color-figma-accent)]" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="22 10" />
        </svg>
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
      <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
        <span className="text-[11px] font-semibold text-[var(--color-figma-text)]">
          {filterTokenPath
            ? `${displayCommits.length} of ${commits.length} commit${commits.length !== 1 ? 's' : ''}`
            : `${commits.length} commit${commits.length !== 1 ? 's' : ''}`}
        </span>
        <button
          onClick={fetchCommits}
          className="text-[10px] text-[var(--color-figma-accent)] hover:underline"
        >
          Refresh
        </button>
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
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Snapshots source
   ══════════════════════════════════════════════════════════════════════════ */

function SnapshotsSource({ serverUrl, onPushUndo, onRefreshTokens, filterTokenPath }: { serverUrl: string; onPushUndo?: (slot: UndoSlot) => void; onRefreshTokens?: () => void; filterTokenPath?: string }) {
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [comparing, setComparing] = useState<string | null>(null);
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
    loadSnapshots();
  }, [loadSnapshots]);

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

  const handleCompare = async (id: string) => {
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
  };

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
            onClick={() => { setComparing(null); setChanges(null); }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
            Back
          </button>
          <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">/</span>
          <span className="text-[10px] text-[var(--color-figma-text)] truncate flex-1 min-w-0" title={snapshot?.label}>
            {snapshot?.label ?? 'Compare'}
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
