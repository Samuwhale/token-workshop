import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Spinner } from '../Spinner';
import { useGitSync } from '../../hooks/useGitSync';
import { swatchBgColor } from '../../shared/colorUtils';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { GitSubPanel } from './GitSubPanel';
import { GitCommitsSource } from '../history/GitCommitsSource';
import { CommitCompareView } from '../history/CommitCompareView';
import { FeedbackPlaceholder } from '../FeedbackPlaceholder';
import { formatRelativeTime } from '../../shared/changeHelpers';
import { apiFetch } from '../../shared/apiFetch';
import type { CommitEntry, UndoSlot } from '../history/types';
import type { GitPreview, TokenChange } from '../../hooks/useGitDiff';

type RepositoryConfirmAction = 'git-push' | 'git-pull' | 'git-commit' | 'apply-diff' | null;

interface GitRepositoryPanelProps {
  serverUrl: string;
  connected: boolean;
  onPushUndo?: (slot: UndoSlot) => void;
  onRefreshTokens?: () => void;
  embedded?: boolean;
}

export function GitRepositoryPanel({
  serverUrl,
  connected,
  onPushUndo,
  onRefreshTokens,
  embedded = false,
}: GitRepositoryPanelProps) {
  const git = useGitSync({ serverUrl, connected });
  const [confirmAction, setConfirmAction] = useState<RepositoryConfirmAction>(null);

  // Right column state: timeline list → commit detail → compare view
  const [selectedCommitHash, setSelectedCommitHash] = useState<string | null>(null);
  const [selectedCommitEntry, setSelectedCommitEntry] = useState<CommitEntry | null>(null);
  const [compareA, setCompareA] = useState<CommitEntry | null>(null);
  const [compareB, setCompareB] = useState<CommitEntry | null>(null);
  const [showCompare, setShowCompare] = useState(false);

  const handleSelectCommit = useCallback((hash: string, entry?: CommitEntry) => {
    setSelectedCommitHash(hash);
    setSelectedCommitEntry(entry ?? null);
  }, []);

  const handleBackFromDetail = useCallback(() => {
    setSelectedCommitHash(null);
    setSelectedCommitEntry(null);
  }, []);

  const handleBackFromCompare = useCallback(() => {
    setShowCompare(false);
    setCompareA(null);
    setCompareB(null);
  }, []);

  if (!connected) {
    return (
      <FeedbackPlaceholder
        variant="disconnected"
        title="Connect to the token server"
        description="Connect to save and share versions."
      />
    );
  }

  const rightColumn = (() => {
    if (showCompare && compareA && compareB) {
      return (
        <CommitCompareView
          serverUrl={serverUrl}
          commitA={compareA}
          commitB={compareB}
          onBack={handleBackFromCompare}
        />
      );
    }

    if (selectedCommitHash) {
      return (
        <GitCommitsSource
          serverUrl={serverUrl}
          onPushUndo={onPushUndo}
          onRefreshTokens={onRefreshTokens}
          initialSelectedHash={selectedCommitHash}
          initialSelectedCommit={selectedCommitEntry ?? undefined}
          onBack={handleBackFromDetail}
          skipListFetch
        />
      );
    }

    return (
      <RepositoryTimeline
        serverUrl={serverUrl}
        onSelectCommit={handleSelectCommit}
        compareA={compareA}
        compareB={compareB}
        onSetCompareA={setCompareA}
        onSetCompareB={(commit) => {
          setCompareB(commit);
          setShowCompare(true);
        }}
        onClearCompareA={() => setCompareA(null)}
      />
    );
  })();

  return (
    <>
      <div className="flex h-full min-h-0 flex-col overflow-y-auto">
        <GitSubPanel git={git} diffFilter="" onRequestConfirm={setConfirmAction} />
        <div
          className={`flex-1 min-h-[200px] ${
            embedded ? "" : "border-t border-[var(--color-figma-border)]"
          }`}
        >
          {rightColumn}
        </div>
      </div>

      {confirmAction === 'git-pull' && (
        <GitPreviewModal
          title="Get updates"
          subtitle="Incoming changes from your team."
          confirmLabel="Get updates"
          preview={git.pullPreview}
          loading={git.pullPreviewLoading}
          fetchPreview={git.fetchPullPreview}
          onCancel={() => {
            setConfirmAction(null);
            git.clearPullPreview();
          }}
          onConfirm={async () => {
            setConfirmAction(null);
            git.clearPullPreview();
            await git.doAction('pull');
          }}
        />
      )}

      {confirmAction === 'git-push' && (
        <GitPreviewModal
          title={`Share changes${git.gitStatus?.branch ? ` (${git.gitStatus.branch})` : ''}`}
          subtitle="Your changes to share with the team."
          confirmLabel="Share"
          preview={git.pushPreview}
          loading={git.pushPreviewLoading}
          fetchPreview={git.fetchPushPreview}
          onCancel={() => {
            setConfirmAction(null);
            git.clearPushPreview();
          }}
          onConfirm={async () => {
            setConfirmAction(null);
            git.clearPushPreview();
            await git.doAction('push');
          }}
        />
      )}

      {confirmAction === 'git-commit' && (
        <CommitPreviewModal
          selectedFiles={[...git.selectedFiles]}
          allChanges={git.allChanges}
          commitMsg={git.commitMsg}
          tokenPreview={git.tokenPreview}
          tokenPreviewLoading={git.tokenPreviewLoading}
          fetchTokenPreview={git.fetchTokenPreview}
          onCancel={() => setConfirmAction(null)}
          onConfirm={async () => {
            setConfirmAction(null);
            await git.doAction('commit', { message: git.commitMsg, files: [...git.selectedFiles] });
            git.setCommitMsg('');
          }}
        />
      )}

      {confirmAction === 'apply-diff' && (
        <ApplyRepositoryDiffModal
          diffChoices={git.diffChoices}
          onCancel={() => setConfirmAction(null)}
          onConfirm={async () => {
            setConfirmAction(null);
            await git.applyDiff();
          }}
        />
      )}
    </>
  );
}


/* ── RepositoryTimeline ─────────────────────────────────────────────────── */

function RepositoryTimeline({
  serverUrl,
  onSelectCommit,
  compareA,
  compareB,
  onSetCompareA,
  onSetCompareB,
  onClearCompareA,
}: {
  serverUrl: string;
  onSelectCommit: (hash: string, entry?: CommitEntry) => void;
  compareA: CommitEntry | null;
  compareB: CommitEntry | null;
  onSetCompareA: (commit: CommitEntry) => void;
  onSetCompareB: (commit: CommitEntry) => void;
  onClearCompareA: () => void;
}) {
  const [commits, setCommits] = useState<CommitEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [compareMode, setCompareMode] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchCommits = useCallback(async (searchQuery = '') => {
    setLoading(true);
    setError(null);
    setOffset(0);
    try {
      const searchParam = searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : '';
      const data = await apiFetch<{ data?: CommitEntry[]; hasMore?: boolean }>(`${serverUrl}/api/sync/log?limit=50${searchParam}`);
      setCommits(data.data ?? []);
      setHasMore(data.hasMore ?? false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [serverUrl]);

  useEffect(() => {
    fetchCommits(debouncedSearch);
  }, [fetchCommits, debouncedSearch]);

  const handleLoadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    const nextOffset = offset + 50;
    try {
      const searchParam = debouncedSearch ? `&search=${encodeURIComponent(debouncedSearch)}` : '';
      const data = await apiFetch<{ data?: CommitEntry[]; hasMore?: boolean }>(`${serverUrl}/api/sync/log?limit=50&offset=${nextOffset}${searchParam}`);
      setCommits(prev => [...prev, ...(data.data ?? [])]);
      setHasMore(data.hasMore ?? false);
      setOffset(nextOffset);
    } catch {
      // silently fail, user can retry
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 px-3 py-2 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-body font-semibold text-[var(--color-figma-text)]">Versions</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                setCompareMode(mode => {
                  if (mode) {
                    onClearCompareA();
                  }
                  return !mode;
                });
              }}
              className={`shrink-0 flex items-center gap-1 text-secondary font-medium px-1.5 py-0.5 rounded transition-colors ${
                compareMode
                  ? 'bg-[color-mix(in_srgb,var(--color-figma-accent)_14%,transparent)] text-[var(--color-figma-accent)]'
                  : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]'
              }`}
              title={compareMode ? 'Exit compare mode' : 'Compare two versions'}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 20V10M12 20V4M6 20v-6" />
              </svg>
              Compare
            </button>
            <button
              onClick={() => fetchCommits(debouncedSearch)}
              className="text-secondary text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors px-1.5 py-0.5"
              title="Refresh"
              aria-label="Refresh"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
              </svg>
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--color-figma-text-tertiary)]" aria-hidden="true">
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search versions…"
            aria-label="Search versions"
            className="flex-1 min-w-0 bg-transparent text-secondary text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-tertiary)]"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="shrink-0 text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text)] transition-colors"
              aria-label="Clear search"
            >
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {compareMode && (
        <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-[var(--color-figma-border)] bg-[color-mix(in_srgb,var(--color-figma-accent)_6%,transparent)]">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--color-figma-accent)]" aria-hidden="true">
            <path d="M18 20V10M12 20V4M6 20v-6" />
          </svg>
          {!compareA ? (
            <span className="flex-1 text-secondary text-[var(--color-figma-text-secondary)]">
              Pick <span className="font-semibold text-[var(--color-figma-accent)]">Set A</span> on the first commit.
            </span>
          ) : !compareB ? (
            <span className="flex-1 text-secondary text-[var(--color-figma-text-secondary)]">
              <span className="font-mono text-[var(--color-figma-text)]">{compareA.hash.slice(0, 7)}</span> is Set A. Choose <span className="font-semibold text-[var(--color-figma-success)]">Set B</span>.
            </span>
          ) : null}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-6">
            <Spinner size="md" className="text-[var(--color-figma-text-secondary)]" />
            <span className="text-secondary text-[var(--color-figma-text-secondary)]">Loading versions…</span>
          </div>
        )}

        {!loading && error && (
          <FeedbackPlaceholder
            variant="error"
            size="section"
            title="Failed to load versions"
            description={error}
            primaryAction={{ label: 'Retry', onClick: () => fetchCommits(debouncedSearch) }}
          />
        )}

        {!loading && !error && commits.length === 0 && (
          <FeedbackPlaceholder
            variant="empty"
            size="section"
            title="No versions yet"
            description="Save your changes to start tracking versions."
          />
        )}

        {!loading && !error && commits.map(commit => {
          if (compareMode) {
            const isA = compareA?.hash === commit.hash;
            const isB = compareB?.hash === commit.hash;
            const isSelected = isA || isB;
            const canSetA = !isA;
            const canSetB = compareA !== null && !isB && !isA;
            return (
              <div
                key={commit.hash}
                className={`flex items-start gap-2 px-3 py-2 border-b border-[var(--color-figma-border)] transition-colors group ${isSelected ? 'bg-[color-mix(in_srgb,var(--color-figma-accent)_6%,transparent)]' : 'hover:bg-[var(--color-figma-bg-hover)]'}`}
              >
                <div className="mt-0.5 shrink-0">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-tertiary)]" aria-hidden="true">
                    <circle cx="12" cy="12" r="4" /><line x1="1.05" y1="12" x2="7" y2="12" /><line x1="17.01" y1="12" x2="22.96" y2="12" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {isA && <span className="shrink-0 text-secondary font-bold px-1 py-0.5 rounded bg-[color-mix(in_srgb,var(--color-figma-accent)_20%,transparent)] text-[var(--color-figma-accent)]">A</span>}
                    {isB && <span className="shrink-0 text-secondary font-bold px-1 py-0.5 rounded bg-[color-mix(in_srgb,var(--color-figma-success)_20%,transparent)] text-[var(--color-figma-success)]">B</span>}
                    <span className="text-secondary font-medium text-[var(--color-figma-text)] truncate min-w-0">{commit.message}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-secondary text-[var(--color-figma-text-tertiary)]">{commit.author}</span>
                    <span className="text-secondary text-[var(--color-figma-text-tertiary)]">· {formatRelativeTime(new Date(commit.date))}</span>
                    <span className="text-secondary font-mono text-[var(--color-figma-text-tertiary)]">{commit.hash.slice(0, 7)}</span>
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-1">
                  {canSetA && (
                    <button
                      onClick={() => onSetCompareA(commit)}
                      className="text-secondary px-1.5 py-0.5 rounded font-medium transition-colors bg-[color-mix(in_srgb,var(--color-figma-accent)_12%,transparent)] text-[var(--color-figma-accent)] hover:bg-[color-mix(in_srgb,var(--color-figma-accent)_20%,transparent)]"
                    >
                      {compareA === null ? 'Set A' : 'Swap A'}
                    </button>
                  )}
                  {canSetB && (
                    <button
                      onClick={() => onSetCompareB(commit)}
                      className="text-secondary px-1.5 py-0.5 rounded font-medium transition-colors bg-[color-mix(in_srgb,var(--color-figma-success)_12%,transparent)] text-[var(--color-figma-success)] hover:bg-[color-mix(in_srgb,var(--color-figma-success)_20%,transparent)]"
                    >
                      Set B
                    </button>
                  )}
                  {isA && !isB && (
                    <button
                      onClick={onClearCompareA}
                      className="text-secondary px-1 py-0.5 rounded transition-colors text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text)]"
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
              key={commit.hash}
              onClick={() => onSelectCommit(commit.hash, commit)}
              className="w-full text-left flex items-start gap-2 px-3 py-2 border-b border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)] transition-colors group"
            >
              <div className="mt-0.5 shrink-0">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-tertiary)]" aria-hidden="true">
                  <circle cx="12" cy="12" r="4" /><line x1="1.05" y1="12" x2="7" y2="12" /><line x1="17.01" y1="12" x2="22.96" y2="12" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-secondary font-medium text-[var(--color-figma-text)] truncate min-w-0">{commit.message}</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-secondary text-[var(--color-figma-text-tertiary)]">{commit.author}</span>
                  <span className="text-secondary text-[var(--color-figma-text-tertiary)]">· {formatRelativeTime(new Date(commit.date))}</span>
                  <span className="text-secondary font-mono text-[var(--color-figma-text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity">{commit.hash.slice(0, 7)}</span>
                </div>
              </div>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-1 text-[var(--color-figma-text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          );
        })}

        {!loading && hasMore && (
          <div className="px-3 py-2 border-b border-[var(--color-figma-border)]">
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="w-full text-secondary py-1.5 rounded font-medium transition-colors bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {loadingMore ? <><Spinner size="xs" />Loading…</> : 'Load more'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}


/* ── Modal components ───────────────────────────────────────────────────── */

function GitPreviewModal({
  title,
  subtitle,
  confirmLabel,
  preview,
  loading,
  fetchPreview,
  onCancel,
  onConfirm,
}: {
  title: string;
  subtitle: string;
  confirmLabel: string;
  preview: GitPreview | null;
  loading: boolean;
  fetchPreview: () => Promise<void>;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [expandedSets, setExpandedSets] = useState<Set<string>>(new Set());
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);

  useEffect(() => {
    fetchPreview();
  }, [fetchPreview]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  const bySet = useMemo(() => {
    if (!preview?.changes) return [] as Array<{ collectionId: string; added: TokenChange[]; modified: TokenChange[]; removed: TokenChange[] }>;
    const map = new Map<string, { added: TokenChange[]; modified: TokenChange[]; removed: TokenChange[] }>();
    for (const change of preview.changes) {
      if (!map.has(change.collectionId)) map.set(change.collectionId, { added: [], modified: [], removed: [] });
      const entry = map.get(change.collectionId)!;
      if (change.status === 'added') entry.added.push(change);
      else if (change.status === 'modified') entry.modified.push(change);
      else entry.removed.push(change);
    }
    return [...map.entries()].map(([collectionId, value]) => ({ collectionId, ...value }));
  }, [preview?.changes]);

  const totalAdded = bySet.reduce((c, s) => c + s.added.length, 0);
  const totalModified = bySet.reduce((c, s) => c + s.modified.length, 0);
  const totalRemoved = bySet.reduce((c, s) => c + s.removed.length, 0);

  const toggleSet = (set: string) => {
    setExpandedSets(prev => {
      const next = new Set(prev);
      if (next.has(set)) next.delete(set); else next.add(set);
      return next;
    });
  };

  const handleConfirm = async () => {
    setBusy(true);
    try { await onConfirm(); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-figma-overlay)]" onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div ref={dialogRef} className="w-[380px] max-h-[70vh] flex flex-col rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-xl" role="dialog" aria-modal="true" aria-labelledby="git-preview-dialog-title">
        <div className="px-4 pt-4 pb-2">
          <h3 id="git-preview-dialog-title" className="text-heading font-semibold text-[var(--color-figma-text)]">{title}</h3>
          <p className="mt-1 text-secondary text-[var(--color-figma-text-secondary)]">{subtitle}</p>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-2">
          {loading && (
            <div className="flex items-center gap-2 py-4 justify-center">
              <Spinner size="md" className="text-[var(--color-figma-text-secondary)]" />
              <span className="text-secondary text-[var(--color-figma-text-secondary)]">Fetching preview…</span>
            </div>
          )}
          {!loading && preview && (
            <>
              {preview.commits.length > 0 && (
                <div className="mb-3">
                  <div className="text-secondary font-medium text-[var(--color-figma-text-secondary)] mb-1">
                    {preview.commits.length} version{preview.commits.length !== 1 ? 's' : ''}
                  </div>
                  <div className="space-y-0.5">
                    {preview.commits.map(commit => (
                      <div key={commit.hash} className="flex items-baseline gap-1.5">
                        <span className="text-secondary font-mono text-[var(--color-figma-text-tertiary)] shrink-0">{commit.hash.slice(0, 7)}</span>
                        <span className="text-secondary text-[var(--color-figma-text)] truncate">{commit.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {bySet.length === 0 && preview.commits.length === 0 ? (
                <p className="py-3 text-secondary text-[var(--color-figma-text-secondary)]">No changes to {confirmLabel.toLowerCase()}.</p>
              ) : bySet.length === 0 ? (
                <p className="py-2 text-secondary text-[var(--color-figma-text-secondary)]">No token changes.</p>
              ) : (
                <>
                  <div className="flex items-center gap-3 mb-2 text-secondary">
                    {totalAdded > 0 && <span className="text-[var(--color-figma-success)]">+{totalAdded} added</span>}
                    {totalModified > 0 && <span className="text-[var(--color-figma-warning)]">~{totalModified} modified</span>}
                    {totalRemoved > 0 && <span className="text-[var(--color-figma-error)]">−{totalRemoved} removed</span>}
                    <span className="text-[var(--color-figma-text-secondary)] ml-auto">{bySet.length} collection{bySet.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="space-y-px">
                    {bySet.map(({ collectionId, added, modified, removed }) => {
                      const isExpanded = expandedSets.has(collectionId);
                      const allChanges = [...added, ...modified, ...removed];
                      return (
                        <div key={collectionId} className="rounded border border-[var(--color-figma-border)] overflow-hidden">
                          <button className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-[var(--color-figma-bg-hover)] transition-colors" onClick={() => toggleSet(collectionId)}>
                            <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`text-[var(--color-figma-text-tertiary)] shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}><path d="M2 1l4 3-4 3V1z" /></svg>
                            <span className="text-secondary font-medium text-[var(--color-figma-text)] flex-1 truncate">{collectionId}</span>
                            <span className="flex items-center gap-2 text-secondary font-mono shrink-0">
                              {added.length > 0 && <span className="text-[var(--color-figma-success)]">+{added.length}</span>}
                              {modified.length > 0 && <span className="text-[var(--color-figma-warning)]">~{modified.length}</span>}
                              {removed.length > 0 && <span className="text-[var(--color-figma-error)]">−{removed.length}</span>}
                            </span>
                          </button>
                          {isExpanded && (
                            <div className="border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] divide-y divide-[var(--color-figma-border)]">
                              {allChanges.map(change => <ModalTokenChangeRow key={change.path} change={change} />)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}
        </div>
        <div className="px-4 pb-4 pt-2 border-t border-[var(--color-figma-border)] flex gap-2">
          <button onClick={onCancel} className="flex-1 px-3 py-1.5 rounded text-body font-medium bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors">Cancel</button>
          <button onClick={handleConfirm} disabled={loading || busy} className="flex-1 px-3 py-1.5 rounded text-body font-medium bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
            {busy && <Spinner size="sm" className="text-white" />}
            {busy ? `${confirmLabel}…` : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function CommitPreviewModal({
  selectedFiles, allChanges, commitMsg, tokenPreview, tokenPreviewLoading, fetchTokenPreview, onCancel, onConfirm,
}: {
  selectedFiles: string[];
  allChanges: { file: string; status: string }[];
  commitMsg: string;
  tokenPreview: TokenChange[] | null;
  tokenPreviewLoading: boolean;
  fetchTokenPreview: () => Promise<void>;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);

  useEffect(() => {
    if (tokenPreview === null && !tokenPreviewLoading) fetchTokenPreview();
  }, [tokenPreview, tokenPreviewLoading, fetchTokenPreview]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  const selectedSet = new Set(selectedFiles);
  const stagedChanges = allChanges.filter(c => selectedSet.has(c.file));
  const skippedCount = allChanges.length - stagedChanges.length;

  const relevantTokenChanges = useMemo(() => {
    if (!tokenPreview) return [];
    const selectedCollectionIds = new Set(selectedFiles.map(f => f.replace('.tokens.json', '')));
    return tokenPreview.filter(c => selectedCollectionIds.has(c.collectionId));
  }, [selectedFiles, tokenPreview]);

  const changesByFile = useMemo(() => {
    const map = new Map<string, TokenChange[]>();
    for (const change of relevantTokenChanges) {
      const fileName = `${change.collectionId}.tokens.json`;
      const existing = map.get(fileName);
      if (existing) existing.push(change); else map.set(fileName, [change]);
    }
    return map;
  }, [relevantTokenChanges]);

  const totalAdded = relevantTokenChanges.filter(c => c.status === 'added').length;
  const totalModified = relevantTokenChanges.filter(c => c.status === 'modified').length;
  const totalRemoved = relevantTokenChanges.filter(c => c.status === 'removed').length;

  const toggleExpand = (file: string) => {
    setExpandedFiles(prev => { const next = new Set(prev); if (next.has(file)) next.delete(file); else next.add(file); return next; });
  };

  const handleConfirm = async () => {
    setBusy(true);
    try { await onConfirm(); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-figma-overlay)]" onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div ref={dialogRef} className="w-[380px] max-h-[70vh] flex flex-col rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-xl" role="dialog" aria-modal="true" aria-labelledby="git-commit-dialog-title">
        <div className="px-4 pt-4 pb-2">
          <h3 id="git-commit-dialog-title" className="text-heading font-semibold text-[var(--color-figma-text)]">Save version</h3>
          <p className="mt-1 text-secondary text-[var(--color-figma-text-secondary)]">Review before saving.</p>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-2">
          <div className="mb-2 px-2 py-1.5 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)]">
            <div className="text-secondary text-[var(--color-figma-text-tertiary)] mb-0.5">Message</div>
            <div className="text-body text-[var(--color-figma-text)] font-medium">{commitMsg}</div>
          </div>
          <div className="mb-2">
            <div className="text-secondary font-medium text-[var(--color-figma-text-secondary)] mb-1 flex items-center justify-between">
              <span>
                {stagedChanges.length} file{stagedChanges.length !== 1 ? 's' : ''} to save
                {skippedCount > 0 && <span className="text-[var(--color-figma-text-tertiary)]"> ({skippedCount} skipped)</span>}
              </span>
              {!tokenPreviewLoading && relevantTokenChanges.length > 0 && (
                <span className="flex gap-1.5 text-secondary font-mono">
                  {totalAdded > 0 && <span className="text-[var(--color-figma-success)]">+{totalAdded}</span>}
                  {totalModified > 0 && <span className="text-[var(--color-figma-warning)]">~{totalModified}</span>}
                  {totalRemoved > 0 && <span className="text-[var(--color-figma-error)]">−{totalRemoved}</span>}
                </span>
              )}
            </div>
            <div className="max-h-52 overflow-y-auto rounded border border-[var(--color-figma-border)] divide-y divide-[var(--color-figma-border)]">
              {tokenPreviewLoading && (
                <div className="flex items-center gap-2 py-3 justify-center">
                  <Spinner size="md" className="text-[var(--color-figma-text-secondary)]" />
                  <span className="text-secondary text-[var(--color-figma-text-secondary)]">Loading token changes…</span>
                </div>
              )}
              {stagedChanges.map(change => {
                const fileTokenChanges = changesByFile.get(change.file) ?? [];
                const hasTokenChanges = fileTokenChanges.length > 0;
                const isExpanded = expandedFiles.has(change.file);
                const addedCount = fileTokenChanges.filter(i => i.status === 'added').length;
                const modifiedCount = fileTokenChanges.filter(i => i.status === 'modified').length;
                const removedCount = fileTokenChanges.filter(i => i.status === 'removed').length;
                return (
                  <div key={change.file}>
                    <div className={`flex items-center gap-1.5 px-2 py-1 ${hasTokenChanges ? 'cursor-pointer hover:bg-[var(--color-figma-bg-hover)]' : ''}`} onClick={() => hasTokenChanges && toggleExpand(change.file)}>
                      <span className={`w-3 h-3 flex items-center justify-center shrink-0 ${hasTokenChanges ? '' : 'opacity-0'}`}>
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform ${isExpanded ? 'rotate-90' : ''} text-[var(--color-figma-text-tertiary)]`}><path d="M2 1l4 3-4 3V1z" /></svg>
                      </span>
                      <span className={`text-secondary font-mono font-bold w-3 shrink-0 ${change.status === 'M' ? 'text-[var(--color-figma-warning)]' : change.status === 'A' ? 'text-[var(--color-figma-success)]' : change.status === 'D' ? 'text-[var(--color-figma-error)]' : 'text-[var(--color-figma-text-secondary)]'}`}>{change.status}</span>
                      <span className="text-secondary font-mono text-[var(--color-figma-text)] truncate flex-1 min-w-0">{change.file}</span>
                      {hasTokenChanges && (
                        <span className="flex gap-1.5 text-secondary font-mono shrink-0">
                          {addedCount > 0 && <span className="text-[var(--color-figma-success)]">+{addedCount}</span>}
                          {modifiedCount > 0 && <span className="text-[var(--color-figma-warning)]">~{modifiedCount}</span>}
                          {removedCount > 0 && <span className="text-[var(--color-figma-error)]">−{removedCount}</span>}
                        </span>
                      )}
                    </div>
                    {isExpanded && hasTokenChanges && (
                      <div className="bg-[var(--color-figma-bg-secondary)] border-t border-[var(--color-figma-border)]">
                        {fileTokenChanges.map(item => <ModalTokenChangeRow key={`${item.path}-${item.status}`} change={item} />)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          {!tokenPreviewLoading && tokenPreview !== null && relevantTokenChanges.length === 0 && stagedChanges.some(c => c.file.endsWith('.tokens.json')) && (
            <div className="text-secondary text-[var(--color-figma-text-secondary)] py-1 flex items-center gap-1.5">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-success)] shrink-0" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
              No token value changes.
            </div>
          )}
        </div>
        <div className="px-4 pb-4 pt-2 border-t border-[var(--color-figma-border)] flex gap-2">
          <button onClick={onCancel} disabled={busy} className="flex-1 px-3 py-1.5 rounded text-body font-medium bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors">Cancel</button>
          <button onClick={handleConfirm} disabled={busy} className="flex-1 px-3 py-1.5 rounded text-body font-medium bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
            {busy && <Spinner size="sm" className="text-white" />}
            {busy ? 'Saving…' : `Save ${selectedFiles.length} file${selectedFiles.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function ApplyRepositoryDiffModal({ diffChoices, onCancel, onConfirm }: {
  diffChoices: Record<string, 'push' | 'pull' | 'skip'>;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);

  const pushFiles = Object.entries(diffChoices).filter(([, c]) => c === 'push').map(([f]) => f);
  const pullFiles = Object.entries(diffChoices).filter(([, c]) => c === 'pull').map(([f]) => f);
  const skipCount = Object.values(diffChoices).filter(c => c === 'skip').length;
  const hasChanges = pushFiles.length > 0 || pullFiles.length > 0;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  const handleConfirm = async () => {
    setBusy(true);
    try { await onConfirm(); } finally { setBusy(false); }
  };

  const sections: Array<{ label: string; arrow: string; files: string[] }> = [];
  if (pushFiles.length > 0) sections.push({ label: 'Update remote', arrow: '↑', files: pushFiles });
  if (pullFiles.length > 0) sections.push({ label: 'Update local', arrow: '↓', files: pullFiles });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-figma-overlay)]" onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div ref={dialogRef} className="w-[360px] max-h-[70vh] flex flex-col rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-xl" role="dialog" aria-modal="true" aria-labelledby="git-apply-dialog-title">
        <div className="px-4 pt-4 pb-2">
          <h3 id="git-apply-dialog-title" className="text-heading font-semibold text-[var(--color-figma-text)]">Apply changes</h3>
          <p className="mt-1 text-secondary text-[var(--color-figma-text-secondary)]">Review which direction each file should go.</p>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-2">
          {!hasChanges ? (
            <p className="py-3 text-secondary text-[var(--color-figma-text-secondary)]">Nothing to apply.</p>
          ) : (
            <>
              {sections.map(section => (
                <div key={section.label} className="mb-3">
                  <div className="text-secondary font-medium text-[var(--color-figma-text-secondary)] mb-1">{section.arrow} {section.label} ({section.files.length})</div>
                  <div className="max-h-28 overflow-y-auto rounded border border-[var(--color-figma-border)] divide-y divide-[var(--color-figma-border)]">
                    {section.files.map(file => <div key={file} className="px-2 py-1 text-secondary font-mono text-[var(--color-figma-text)] truncate" title={file}>{file}</div>)}
                  </div>
                </div>
              ))}
              {skipCount > 0 && <p className="text-secondary text-[var(--color-figma-text-tertiary)]">{skipCount} file{skipCount !== 1 ? 's' : ''} skipped.</p>}
            </>
          )}
        </div>
        <div className="px-4 pb-4 pt-2 border-t border-[var(--color-figma-border)] flex gap-2">
          <button onClick={onCancel} disabled={busy} className="flex-1 px-3 py-1.5 rounded text-body font-medium bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors">Cancel</button>
          <button onClick={handleConfirm} disabled={busy || !hasChanges} className="flex-1 px-3 py-1.5 rounded text-body font-medium bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
            {busy && <Spinner size="sm" className="text-white" />}
            {busy ? 'Applying…' : 'Apply changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalTokenChangeRow({ change }: { change: TokenChange }) {
  const statusColor = change.status === 'added' ? 'text-[var(--color-figma-success)]' : change.status === 'removed' ? 'text-[var(--color-figma-error)]' : 'text-[var(--color-figma-warning)]';
  const statusChar = change.status === 'added' ? '+' : change.status === 'removed' ? '−' : '~';
  const valueToString = (value: unknown) => (typeof value === 'string' ? value : JSON.stringify(value));
  const isColor = change.type === 'color';
  const beforeValue = change.before != null ? valueToString(change.before) : undefined;
  const afterValue = change.after != null ? valueToString(change.after) : undefined;

  return (
    <div className="px-3 py-1">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className={`text-secondary font-mono font-bold w-3 shrink-0 ${statusColor}`}>{statusChar}</span>
        <span className="text-secondary font-mono text-[var(--color-figma-text)] truncate" title={change.path}>{change.path}</span>
      </div>
      {change.status === 'modified' && (
        <div className="ml-4 mt-0.5 flex flex-col gap-0.5 text-secondary font-mono">
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-[var(--color-figma-error)] shrink-0 w-3">−</span>
            {isColor && isHexColor(beforeValue) && <DiffSwatch hex={beforeValue} />}
            <span className="text-[var(--color-figma-text-secondary)] truncate" title={beforeValue}>{truncateValue(beforeValue ?? '', 40)}</span>
          </div>
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-[var(--color-figma-success)] shrink-0 w-3">+</span>
            {isColor && isHexColor(afterValue) && <DiffSwatch hex={afterValue} />}
            <span className="text-[var(--color-figma-text)] truncate" title={afterValue}>{truncateValue(afterValue ?? '', 40)}</span>
          </div>
        </div>
      )}
      {change.status === 'added' && afterValue !== undefined && (
        <div className="ml-4 mt-0.5 flex items-center gap-1 text-secondary font-mono min-w-0">
          {isColor && isHexColor(afterValue) && <DiffSwatch hex={afterValue} />}
          <span className="text-[var(--color-figma-text-secondary)] truncate" title={afterValue}>{truncateValue(afterValue, 40)}</span>
        </div>
      )}
      {change.status === 'removed' && beforeValue !== undefined && (
        <div className="ml-4 mt-0.5 flex items-center gap-1 text-secondary font-mono min-w-0">
          {isColor && isHexColor(beforeValue) && <DiffSwatch hex={beforeValue} />}
          <span className="text-[var(--color-figma-text-secondary)] line-through truncate" title={beforeValue}>{truncateValue(beforeValue, 40)}</span>
        </div>
      )}
    </div>
  );
}

function truncateValue(value: string, max = 24): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function isHexColor(value: string | undefined): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(value);
}

function DiffSwatch({ hex }: { hex: string }) {
  return (
    <span
      className="inline-block w-3 h-3 rounded-sm border border-white/20 ring-1 ring-[var(--color-figma-border)] shrink-0 align-middle"
      style={{ backgroundColor: swatchBgColor(hex) }}
      aria-hidden="true"
    />
  );
}
