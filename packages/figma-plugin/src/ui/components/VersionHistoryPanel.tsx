import { useState, useEffect, useCallback, useRef } from 'react';
import { ValueDiff } from './ValueDiff';

/* ── Types ──────────────────────────────────────────────────────────────── */

interface CommitEntry {
  hash: string;
  date: string;
  message: string;
  author: string;
}

interface TokenChange {
  path: string;
  set: string;
  type: string;
  status: 'added' | 'modified' | 'removed';
  before?: any;
  after?: any;
}

interface CommitDetail {
  hash: string;
  changes: TokenChange[];
  fileCount: number;
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function formatRelativeTime(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

function statusColor(status: 'added' | 'modified' | 'removed'): string {
  switch (status) {
    case 'added': return 'var(--color-figma-success)';
    case 'modified': return 'var(--color-figma-warning)';
    case 'removed': return 'var(--color-figma-error)';
  }
}

function statusLabel(status: 'added' | 'modified' | 'removed'): string {
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
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/* ── Collapsible Section ────────────────────────────────────────────────── */

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

/* ── Color swatch for inline value previews ──────────────────────────── */

function ColorSwatch({ color }: { color: string }) {
  return (
    <div
      className="w-3.5 h-3.5 rounded-sm border border-white/30 ring-1 ring-[var(--color-figma-border)] shrink-0 inline-block"
      style={{ backgroundColor: color.slice(0, 7) }}
      aria-hidden="true"
    />
  );
}

/* ── Summary badges ───────────────────────────────────────────────────── */

function ChangeSummaryBadges({ added, modified, removed }: { added: number; modified: number; removed: number }) {
  return (
    <span className="flex items-center gap-1.5 ml-auto text-[9px] font-mono">
      {added > 0 && <span style={{ color: 'var(--color-figma-success)' }}>+{added}</span>}
      {modified > 0 && <span style={{ color: 'var(--color-figma-warning)' }}>~{modified}</span>}
      {removed > 0 && <span style={{ color: 'var(--color-figma-error)' }}>-{removed}</span>}
      {added === 0 && modified === 0 && removed === 0 && (
        <span className="text-[var(--color-figma-text-tertiary)]">no token changes</span>
      )}
    </span>
  );
}

/* ── Main Panel ──────────────────────────────────────────────────────── */

interface VersionHistoryPanelProps {
  serverUrl: string;
  connected: boolean;
}

export function VersionHistoryPanel({ serverUrl, connected }: VersionHistoryPanelProps) {
  const [commits, setCommits] = useState<CommitEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [detail, setDetail] = useState<CommitDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const abortRef = useRef<AbortController | null>(null);

  // Fetch commits
  const fetchCommits = useCallback(async () => {
    if (!connected) { setLoading(false); return; }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/api/sync/log?limit=50`, { signal: controller.signal });
      if (!res.ok) throw new Error('Failed to fetch commit log');
      const data = await res.json();
      setCommits(data.commits || []);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError(String((err as Error).message || err));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [serverUrl, connected]);

  useEffect(() => {
    fetchCommits();
    return () => { abortRef.current?.abort(); };
  }, [fetchCommits]);

  // Fetch commit detail
  const fetchDetail = useCallback(async (hash: string) => {
    setDetailLoading(true);
    setError(null);
    try {
      const res = await fetch(`${serverUrl}/api/sync/log/${hash}/tokens`);
      if (!res.ok) throw new Error('Failed to fetch commit details');
      const data = await res.json() as CommitDetail;
      setDetail(data);
      // Auto-open all set sections
      const sections: Record<string, boolean> = {};
      const sets = new Set(data.changes.map(c => c.set));
      for (const s of sets) sections[s] = true;
      setOpenSections(sections);
    } catch (err) {
      setError(String((err as Error).message || err));
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
  }, []);

  const toggleSection = useCallback((key: string) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Not connected state
  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 gap-2 text-center">
        <p className="text-[11px] text-[var(--color-figma-text-secondary)]">Connect to a server to view version history.</p>
      </div>
    );
  }

  // Loading state
  if (loading && commits.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-[11px] text-[var(--color-figma-text-secondary)]">Loading history…</p>
      </div>
    );
  }

  // Error state
  if (error && commits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 gap-3 text-center">
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
      <div className="flex flex-col items-center justify-center h-full p-6 gap-2 text-center">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-tertiary)]">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <p className="text-[11px] text-[var(--color-figma-text-secondary)]">No commits yet.</p>
        <p className="text-[10px] text-[var(--color-figma-text-tertiary)]">Commit token changes via the Publish tab to start tracking history.</p>
      </div>
    );
  }

  // Detail view
  if (selectedHash) {
    const commit = commits.find(c => c.hash === selectedHash);
    return (
      <div className="flex flex-col h-full overflow-hidden">
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
            <p className="text-[11px] font-medium text-[var(--color-figma-text)] leading-snug">{commit.message}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">{commit.author}</span>
              <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">{formatRelativeTime(new Date(commit.date))}</span>
              <span className="text-[9px] font-mono text-[var(--color-figma-text-tertiary)]">{commit.hash.slice(0, 7)}</span>
            </div>
          </div>
        )}

        {/* Changes */}
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {detailLoading ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-[11px] text-[var(--color-figma-text-secondary)]">Loading changes…</p>
            </div>
          ) : detail && detail.changes.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-[11px] text-[var(--color-figma-text-tertiary)]">No token changes in this commit.</p>
            </div>
          ) : detail ? (
            (() => {
              // Group changes by set
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
                        <div key={`${change.path}-${i}`} className="px-3 py-2 space-y-1">
                          <div className="flex items-center gap-2">
                            <span
                              className="text-[9px] font-medium uppercase tracking-wide shrink-0 px-1 py-0.5 rounded"
                              style={{
                                color: statusColor(change.status),
                                backgroundColor: `color-mix(in srgb, ${statusColor(change.status)} 12%, transparent)`,
                              }}
                            >
                              {statusLabel(change.status)}
                            </span>
                            <span className="text-[10px] font-mono text-[var(--color-figma-text)] truncate" title={change.path}>
                              {change.path}
                            </span>
                            <span className="text-[9px] text-[var(--color-figma-text-tertiary)] shrink-0">{change.type}</span>
                          </div>

                          {/* Value preview */}
                          {change.status === 'modified' && (
                            <ValueDiff type={change.type} before={change.before} after={change.after} />
                          )}
                          {change.status === 'added' && (
                            <div className="flex items-center gap-1.5 pl-1">
                              {change.type === 'color' && typeof change.after === 'string' && (
                                <ColorSwatch color={change.after} />
                              )}
                              <span className="text-[9px] font-mono text-[var(--color-figma-text-secondary)]">
                                {formatTokenValue(change.type, change.after)}
                              </span>
                            </div>
                          )}
                          {change.status === 'removed' && (
                            <div className="flex items-center gap-1.5 pl-1">
                              {change.type === 'color' && typeof change.before === 'string' && (
                                <ColorSwatch color={change.before} />
                              )}
                              <span className="text-[9px] font-mono text-[var(--color-figma-text-tertiary)] line-through">
                                {formatTokenValue(change.type, change.before)}
                              </span>
                            </div>
                          )}
                        </div>
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
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
        <span className="text-[11px] font-semibold text-[var(--color-figma-text)]">Version History</span>
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
            className={`w-full text-left px-3 py-2.5 border-b border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)] transition-colors group ${
              idx === 0 ? '' : ''
            }`}
          >
            <div className="flex items-start gap-2">
              {/* Timeline dot */}
              <div className="shrink-0 mt-1.5 flex flex-col items-center">
                <div className={`w-2 h-2 rounded-full ${idx === 0 ? 'bg-[var(--color-figma-accent)]' : 'bg-[var(--color-figma-border)]'}`} />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-[var(--color-figma-text)] leading-snug truncate">{commit.message}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">{commit.author}</span>
                  <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">{formatRelativeTime(new Date(commit.date))}</span>
                  <span className="text-[9px] font-mono text-[var(--color-figma-text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity">{commit.hash.slice(0, 7)}</span>
                </div>
              </div>

              {/* Chevron */}
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
