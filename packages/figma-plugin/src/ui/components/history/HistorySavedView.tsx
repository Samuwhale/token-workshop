import { useState, useCallback, useEffect } from 'react';
import { SkeletonTimelineRow } from '../Skeleton';
import { apiFetch } from '../../shared/apiFetch';
import { formatRelativeTime } from '../../shared/changeHelpers';
import { FeedbackPlaceholder } from '../FeedbackPlaceholder';
import { LONG_TEXT_CLASSES } from '../../shared/longTextStyles';
import { SnapshotsSource } from './SnapshotsSource';
import { Button } from '../../primitives';
import type {
  SnapshotSummary,
  UndoSlot,
} from './types';

export interface HistorySavedViewProps {
  serverUrl: string;
  connected: boolean;
  onPushUndo?: (slot: UndoSlot) => void;
  onRefreshTokens?: () => void;
  collectionFilter?: string;
  filterTokenPath?: string;
  refreshKey?: number;
}

export function HistorySavedView({
  serverUrl,
  connected,
  onPushUndo,
  onRefreshTokens,
  collectionFilter,
  filterTokenPath,
  refreshKey = 0,
}: HistorySavedViewProps) {
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [checkpointToolsOpen, setCheckpointToolsOpen] = useState(false);

  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);
  const [selectedSnapshotLabel, setSelectedSnapshotLabel] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchSnapshots = useCallback(async () => {
    if (!connected) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ snapshots: SnapshotSummary[] }>(`${serverUrl}/api/snapshots`);
      setSnapshots(data.snapshots ?? []);
    } catch (err) {
      setError((err as Error).message || 'Failed to load checkpoints');
    } finally {
      setLoading(false);
    }
  }, [serverUrl, connected]);

  useEffect(() => { fetchSnapshots(); }, [fetchSnapshots, refreshKey]);

  if (checkpointToolsOpen) {
    return (
      <SnapshotsSource
        serverUrl={serverUrl}
        onPushUndo={onPushUndo}
        onRefreshTokens={onRefreshTokens}
        collectionFilter={collectionFilter}
        filterTokenPath={filterTokenPath}
        initialPairCompareMode
        onBack={() => {
          setCheckpointToolsOpen(false);
          fetchSnapshots();
        }}
      />
    );
  }

  if (selectedSnapshotId) {
    return (
      <SnapshotsSource
        serverUrl={serverUrl}
        onPushUndo={onPushUndo}
        onRefreshTokens={onRefreshTokens}
        collectionFilter={collectionFilter}
        filterTokenPath={filterTokenPath}
        initialComparingId={selectedSnapshotId}
        initialComparingLabel={selectedSnapshotLabel ?? undefined}
        onBack={() => { setSelectedSnapshotId(null); setSelectedSnapshotLabel(null); fetchSnapshots(); }}
      />
    );
  }

  const query = debouncedSearch.trim().toLowerCase();
  const filteredSnapshots = snapshots.filter(s => !query || s.label.toLowerCase().includes(query));

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 flex items-center gap-2 px-3 py-1.5">
        <div className="tm-panel-search flex-1">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[color:var(--color-figma-text-tertiary)]" aria-hidden="true">
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search checkpoints…"
            aria-label="Search checkpoints"
            className="tm-panel-search__input text-secondary"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="shrink-0 text-[color:var(--color-figma-text-tertiary)] hover:text-[color:var(--color-figma-text)] transition-colors" aria-label="Clear search">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          )}
        </div>
        {snapshots.length >= 2 ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setCheckpointToolsOpen(true)}
            title="Compare two saved checkpoints"
          >
            Compare checkpoints
          </Button>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div aria-label="Loading…" aria-busy="true">
            {['w-3/4', 'w-1/2', 'w-2/3'].map((w, i) => <SkeletonTimelineRow key={i} titleWidth={w} />)}
          </div>
        ) : error ? (
          <FeedbackPlaceholder variant="error" title="Failed to load checkpoints" description={error} primaryAction={{ label: 'Retry', onClick: fetchSnapshots }} align="start" />
        ) : filteredSnapshots.length === 0 ? (
          <FeedbackPlaceholder
            variant="empty"
            size="section"
            title={snapshots.length === 0 ? 'No checkpoints yet' : 'No matches'}
            description={snapshots.length === 0 ? 'Save a checkpoint before large changes to restore later.' : 'Try a different search.'}
            align="start"
          />
        ) : (
          filteredSnapshots.map(snapshot => (
            <button
              key={snapshot.id}
              onClick={() => { setSelectedSnapshotId(snapshot.id); setSelectedSnapshotLabel(snapshot.label); }}
              className="group flex w-full items-start gap-2 border-b border-[var(--color-figma-border)] px-3 py-2 text-left transition-colors hover:bg-[var(--color-figma-bg-hover)] focus-visible:outline-none focus-visible:bg-[var(--color-figma-bg-hover)]"
            >
              <div className="mt-0.5 shrink-0">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[color:var(--color-figma-text-tertiary)]" aria-hidden="true">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <span className={`block text-secondary font-medium ${LONG_TEXT_CLASSES.textPrimary}`}>
                  {snapshot.label}
                </span>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span className="text-secondary text-[color:var(--color-figma-text-tertiary)]">{snapshot.tokenCount} tokens</span>
                  <span className="text-secondary text-[color:var(--color-figma-text-tertiary)]">· {formatRelativeTime(new Date(snapshot.timestamp))}</span>
                </div>
              </div>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-1 shrink-0 text-[color:var(--color-figma-text-tertiary)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
