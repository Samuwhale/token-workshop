import { useState, useEffect, useCallback, useRef } from 'react';
import { swatchBgColor } from '../shared/colorUtils';
import { ValueDiff } from './ValueDiff';
import { apiFetch } from '../shared/apiFetch';

/* ── Shared types ──────────────────────────────────────────────────────── */

type ChangeStatus = 'added' | 'modified' | 'removed';

interface TokenChange {
  path: string;
  set: string;
  type: string;
  status: ChangeStatus;
  before?: any;
  after?: any;
}

/* ── Shared helpers ────────────────────────────────────────────────────── */

function formatRelativeTime(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

function statusColor(status: ChangeStatus): string {
  switch (status) {
    case 'added': return 'var(--color-figma-success)';
    case 'modified': return 'var(--color-figma-warning)';
    case 'removed': return 'var(--color-figma-error)';
  }
}

function statusLabel(status: ChangeStatus): string {
  switch (status) {
    case 'added': return 'Added';
    case 'modified': return 'Changed';
    case 'removed': return 'Removed';
  }
}

function summarizeChanges(changes: TokenChange[]): { added: number; modified: number; removed: number } {
  let added = 0, modified = 0, removed = 0;
  for (const c of changes) {
    if (c.status === 'added') added++;
    else if (c.status === 'modified') modified++;
    else removed++;
  }
  return { added, modified, removed };
}

function formatTokenValue(type: string, value: any): string {
  if (value == null) return '—';
  if (type === 'color' && typeof value === 'string') return value;
  if (typeof value === 'object') {
    const s = JSON.stringify(value);
    return s.length > 50 ? s.slice(0, 50) + '…' : s;
  }
  return String(value);
}

/* ── Shared UI components ──────────────────────────────────────────────── */

function ColorSwatch({ color }: { color: string }) {
  return (
    <div
      className="w-3.5 h-3.5 rounded-sm border border-white/30 ring-1 ring-[var(--color-figma-border)] shrink-0 inline-block"
      style={{ backgroundColor: swatchBgColor(color) }}
      aria-hidden="true"
    />
  );
}

function Section({ title, open, onToggle, badge, children }: {
  title: string;
  open: boolean;
  onToggle: () => void;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded border border-[var(--color-figma-border)] overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 bg-[var(--color-figma-bg-secondary)] text-left hover:bg-[var(--color-figma-bg-hover)] transition-colors"
      >
        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform shrink-0 ${open ? 'rotate-90' : ''}`}>
          <path d="M2 1l4 3-4 3V1z" />
        </svg>
        <span className="text-[11px] font-semibold text-[var(--color-figma-text)]">{title}</span>
        {badge}
      </button>
      {open && <div className="border-t border-[var(--color-figma-border)]">{children}</div>}
    </section>
  );
}

function ChangeSummaryBadges({ added, modified, removed }: { added: number; modified: number; removed: number }) {
  return (
    <span className="flex items-center gap-1.5 ml-auto text-[10px] font-mono">
      {added > 0 && <span style={{ color: 'var(--color-figma-success)' }}>+{added}</span>}
      {modified > 0 && <span style={{ color: 'var(--color-figma-warning)' }}>~{modified}</span>}
      {removed > 0 && <span style={{ color: 'var(--color-figma-error)' }}>-{removed}</span>}
      {added === 0 && modified === 0 && removed === 0 && (
        <span className="text-[var(--color-figma-text-tertiary)]">no token changes</span>
      )}
    </span>
  );
}

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

type HistorySource = 'commits' | 'snapshots';

/* ── Main Panel ─────────────────────────────────────────────────────────── */

interface UndoSlot {
  description: string;
  restore: () => Promise<void>;
}

interface HistoryPanelProps {
  serverUrl: string;
  connected: boolean;
  onPushUndo?: (slot: UndoSlot) => void;
  onRefreshTokens?: () => void;
}

export function HistoryPanel({ serverUrl, connected, onPushUndo, onRefreshTokens }: HistoryPanelProps) {
  const [source, setSource] = useState<HistorySource>('commits');

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

      {/* Source content */}
      {source === 'commits' ? (
        <GitCommitsSource
          serverUrl={serverUrl}
          onPushUndo={onPushUndo}
          onRefreshTokens={onRefreshTokens}
        />
      ) : (
        <SnapshotsSource serverUrl={serverUrl} />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Git Commits source
   ══════════════════════════════════════════════════════════════════════════ */

function GitCommitsSource({ serverUrl, onPushUndo, onRefreshTokens }: {
  serverUrl: string;
  onPushUndo?: (slot: UndoSlot) => void;
  onRefreshTokens?: () => void;
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
  const abortRef = useRef<AbortController | null>(null);

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
      const result = await apiFetch<{ restored: number; operationId: string; paths: string[] }>(`${serverUrl}/api/sync/log/${hash}/restore`, {
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
      <div className="flex flex-col flex-1 overflow-hidden">
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
                  onClick={() => restoreFromCommit(selectedHash!)}
                  disabled={restoring !== null}
                  className="shrink-0 px-2.5 py-1 rounded text-[10px] font-medium bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-50 transition-colors flex items-center gap-1"
                  title="Revert all token changes in this commit"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                  </svg>
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
                                restoreFromCommit(selectedHash!, [{ path: change.path, set: change.set }]);
                              }}
                              disabled={restoring !== null}
                              className="shrink-0 ml-auto opacity-0 group-hover/row:opacity-100 pointer-events-none group-hover/row:pointer-events-auto transition-opacity px-1.5 py-0.5 rounded text-[9px] font-medium bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-50"
                              title={`Restore ${change.path} to its previous value`}
                            >
                              {restoring === change.path ? 'Restoring…' : 'Restore'}
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
      </div>
    );
  }

  // Timeline view
  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
        <span className="text-[11px] font-semibold text-[var(--color-figma-text)]">{commits.length} commits</span>
        <button
          onClick={fetchCommits}
          className="text-[10px] text-[var(--color-figma-accent)] hover:underline"
        >
          Refresh
        </button>
      </div>

      {/* Commit list */}
      <div className="flex-1 overflow-y-auto">
        {commits.map((commit, idx) => (
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
              </div>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-1 text-[var(--color-figma-text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Snapshots source
   ══════════════════════════════════════════════════════════════════════════ */

function SnapshotsSource({ serverUrl }: { serverUrl: string }) {
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
    } catch {
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
    } catch {
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
    } catch {
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
      await apiFetch(`${serverUrl}/api/snapshots/${comparing}/restore`, { method: 'POST' });
      showSuccess('Reverted to saved state');
      setComparing(null);
      setChanges(null);
    } catch {
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
    } catch {
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
    const summary = changes ? summarizeChanges(changes) : { added: 0, modified: 0, removed: 0 };
    const noChanges = changes?.length === 0;

    // Group changes by set
    const bySet = new Map<string, TokenChange[]>();
    if (changes) {
      for (const c of changes) {
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
        {!diffLoading && changes && (
          <div className="flex items-center gap-3 px-3 py-2 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] shrink-0">
            {noChanges ? (
              <span className="text-[10px] text-[var(--color-figma-text-secondary)]">No changes since this snapshot.</span>
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
              <p className="text-[11px] text-[var(--color-figma-text-secondary)]">No changes since this snapshot.</p>
            </div>
          )}
          {!diffLoading && changes && changes.length > 0 && (
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
