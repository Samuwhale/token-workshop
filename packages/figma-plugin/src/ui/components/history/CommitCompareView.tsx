import { useState, useEffect, useCallback } from 'react';
import { Spinner } from '../Spinner';
import { apiFetch } from '../../shared/apiFetch';
import { isAbortError } from '../../shared/utils';
import { formatRelativeTime } from '../../shared/changeHelpers';
import { ChangesByCollectionList } from './ChangesByCollectionList';
import type { CommitEntry, TokenChange } from './types';

interface ServerTokenChange {
  path: string;
  collectionId: string;
  type: string;
  status: 'added' | 'modified' | 'removed';
  before?: unknown;
  after?: unknown;
}

export function CommitCompareView({
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
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    apiFetch<{ changes?: ServerTokenChange[]; fileCount?: number }>(
      `${serverUrl}/api/sync/compare?from=${encodeURIComponent(commitA.hash)}&to=${encodeURIComponent(commitB.hash)}`,
      { signal: controller.signal }
    ).then(data => {
      if (controller.signal.aborted) return;
      const c = (data.changes ?? []).map((change): TokenChange => ({
        path: change.path,
        collectionId: change.collectionId,
        type: change.type,
        status: change.status,
        before: change.before,
        after: change.after,
      }));
      setChanges(c);
      const sections: Record<string, boolean> = {};
      const collectionIds = new Set(c.map((change) => change.collectionId));
      for (const collectionId of collectionIds) sections[collectionId] = true;
      setOpenSections(sections);
    }).catch(err => {
      if (isAbortError(err)) return;
      setError(String((err as Error).message || err));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => { controller.abort(); };
  }, [serverUrl, commitA.hash, commitB.hash]);

  const toggleSection = useCallback((key: string) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex flex-wrap items-center gap-2 px-3 py-2 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-body text-[var(--color-figma-accent)] hover:underline shrink-0"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <span className="text-secondary text-[var(--color-figma-text-tertiary)] truncate min-w-0">
          Comparing commits
        </span>
      </div>

      {/* Commit A / B info cards */}
      <div className="shrink-0 grid grid-cols-1 gap-px bg-[var(--color-figma-border)] border-b border-[var(--color-figma-border)] md:grid-cols-2">
        <div className="px-3 py-2 bg-[var(--color-figma-bg)] space-y-0.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-secondary font-bold px-1 py-0.5 rounded bg-[color-mix(in_srgb,var(--color-figma-accent)_20%,transparent)] text-[var(--color-figma-accent)]">A</span>
            <span className="text-secondary font-mono text-[var(--color-figma-text-tertiary)]">{commitA.hash.slice(0, 7)}</span>
          </div>
          <p className="text-secondary font-medium text-[var(--color-figma-text)] leading-snug break-words" title={commitA.message}>{commitA.message}</p>
          <p className="text-secondary text-[var(--color-figma-text-tertiary)]">{formatRelativeTime(new Date(commitA.date))}</p>
        </div>
        <div className="px-3 py-2 bg-[var(--color-figma-bg)] space-y-0.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-secondary font-bold px-1 py-0.5 rounded bg-[color-mix(in_srgb,var(--color-figma-success)_20%,transparent)] text-[var(--color-figma-success)]">B</span>
            <span className="text-secondary font-mono text-[var(--color-figma-text-tertiary)]">{commitB.hash.slice(0, 7)}</span>
          </div>
          <p className="text-secondary font-medium text-[var(--color-figma-text)] leading-snug break-words" title={commitB.message}>{commitB.message}</p>
          <p className="text-secondary text-[var(--color-figma-text-tertiary)]">{formatRelativeTime(new Date(commitB.date))}</p>
        </div>
      </div>

      {/* Diff content */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {loading && (
          <div className="flex items-center justify-center py-3 gap-2">
            <Spinner size="md" className="text-[var(--color-figma-accent)]" />
            <p className="text-body text-[var(--color-figma-text-secondary)]">Computing diff…</p>
          </div>
        )}
        {!loading && error && (
          <div className="flex flex-col items-center justify-center py-3 gap-2 text-center">
            <p className="text-body text-[var(--color-figma-text-secondary)]">{error}</p>
          </div>
        )}
        {!loading && !error && changes !== null && changes.length === 0 && (
          <div className="flex items-center justify-center py-3">
            <p className="text-body text-[var(--color-figma-text-tertiary)]">No token differences between these two commits.</p>
          </div>
        )}
        {!loading && !error && changes !== null && changes.length > 0 && (
          <ChangesByCollectionList
            changes={changes}
            openSections={openSections}
            onToggleSection={toggleSection}
            showSummaryBar
          />
        )}
      </div>
    </div>
  );
}
