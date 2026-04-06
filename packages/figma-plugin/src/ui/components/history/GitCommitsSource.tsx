import { useState, useEffect, useCallback, useRef } from 'react';
import { Spinner } from '../Spinner';
import { apiFetch } from '../../shared/apiFetch';
import { isAbortError } from '../../shared/utils';
import { summarizeChanges, statusColor, formatRelativeTime } from '../../shared/changeHelpers';
import { ChangesBySetList } from './ChangesBySetList';
import type { CommitEntry, CommitDetail, UndoSlot, TokenChange } from './types';

export function GitCommitsSource({ serverUrl, onPushUndo, onRefreshTokens, filterTokenPath, initialSelectedHash, initialSelectedCommit, onBack, skipListFetch }: {
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
  const [tokenFilterMap, setTokenFilterMap] = useState<Map<string, TokenChange> | null>(null);
  const [filterLoading, setFilterLoading] = useState(false);
  const [commitSearch, setCommitSearch] = useState('');
  const [debouncedCommitSearch, setDebouncedCommitSearch] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [commitOffset, setCommitOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedCommitSearch(commitSearch), 300);
    return () => clearTimeout(timer);
  }, [commitSearch]);

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
      const data = await apiFetch<{ data?: CommitEntry[]; hasMore?: boolean }>(`${serverUrl}/api/sync/log?limit=50${searchParam}`, { signal: controller.signal });
      setCommits(data.data || []);
      setHasMore(data.hasMore ?? false);
    } catch (err) {
      if (isAbortError(err)) return;
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
      const data = await apiFetch<{ data?: CommitEntry[]; hasMore?: boolean }>(
        `${serverUrl}/api/sync/log?limit=50&offset=${nextOffset}${searchParam}`
      );
      setCommits(prev => [...prev, ...(data.data ?? [])]);
      setHasMore(data.hasMore ?? false);
      setCommitOffset(nextOffset);
    } catch (err) {
      console.warn('[GitCommitsSource] load more commits failed:', err);
      setError(String((err as Error).message || err));
    } finally {
      setLoadingMore(false);
    }
  }, [serverUrl, loadingMore, commitOffset, debouncedCommitSearch]);

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

  useEffect(() => {
    if (initialSelectedHash) {
      fetchDetail(initialSelectedHash);
    }
     
    // Safe: mount-only. `initialSelectedHash` is an "initial value" prop.
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

  if (loading && commits.length === 0) {
    return (
      <div className="flex items-center justify-center flex-1">
        <p className="text-[11px] text-[var(--color-figma-text-secondary)]">Loading history…</p>
      </div>
    );
  }

  if (error && commits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 p-6 gap-3 text-center">
        <p className="text-[11px] text-[var(--color-figma-text-secondary)]">{error}</p>
        <button
          onClick={() => void fetchCommits()}
          className="px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)]"
        >
          Retry
        </button>
      </div>
    );
  }

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
            <ChangesBySetList
              changes={detail.changes}
              openSections={openSections}
              onToggleSection={toggleSection}
              renderRowActions={(change) => (
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
              )}
            />
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

  const debouncing = filterTokenPath !== debouncedFilterPath;
  if (filterTokenPath && (filterLoading || debouncing)) {
    return (
      <div className="flex items-center justify-center flex-1 gap-2">
        <Spinner size="md" className="text-[var(--color-figma-accent)]" />
        <p className="text-[11px] text-[var(--color-figma-text-secondary)]">Searching history…</p>
      </div>
    );
  }

  const filteredCommits = filterTokenPath && tokenFilterMap
    ? commits.filter(c => tokenFilterMap.has(c.hash))
    : null;

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
              className="flex-1 min-w-0 bg-transparent text-[10px] text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-tertiary)]"
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
                      <span
                        className="text-[10px] font-medium uppercase tracking-wide shrink-0 px-1 py-0.5 rounded"
                        style={{
                          color: tokenChange.status === 'added' ? 'var(--color-figma-success)' : tokenChange.status === 'removed' ? 'var(--color-figma-error)' : 'var(--color-figma-accent)',
                          backgroundColor: `color-mix(in srgb, ${tokenChange.status === 'added' ? 'var(--color-figma-success)' : tokenChange.status === 'removed' ? 'var(--color-figma-error)' : 'var(--color-figma-accent)'} 12%, transparent)`,
                        }}
                      >
                        {tokenChange.status}
                      </span>
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
