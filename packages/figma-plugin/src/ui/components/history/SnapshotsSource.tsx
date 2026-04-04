import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '../../shared/apiFetch';
import { isAbortError } from '../../shared/utils';
import { summarizeChanges, formatRelativeTime, ChangeSummaryBadges } from '../../shared/changeHelpers';
import { ChangesBySetList } from './ChangesBySetList';
import type { SnapshotSummary, SnapshotDiff, UndoSlot, TokenChange } from './types';
import { snapshotDiffToChange, defaultSnapshotLabel } from './types';

export function SnapshotsSource({ serverUrl, onPushUndo, onRefreshTokens, filterTokenPath, initialComparingId, initialComparingLabel, onBack }: {
  serverUrl: string;
  onPushUndo?: (slot: UndoSlot) => void;
  onRefreshTokens?: () => void;
  filterTokenPath?: string;
  initialComparingId?: string;
  initialComparingLabel?: string;
  onBack?: () => void;
}) {
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [comparing, setComparing] = useState<string | null>(initialComparingId ?? null);
  const [changes, setChanges] = useState<TokenChange[] | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [reverting, setReverting] = useState(false);

  // Bug fix: split the shared error state into three isolated pieces to prevent
  // cross-contamination between list, single-compare, and pair-compare views.
  const [listError, setListError] = useState<string | null>(null);
  const [singleCompareError, setSingleCompareError] = useState<string | null>(null);
  const [pairCompareError, setPairCompareError] = useState<string | null>(null);

  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [labelInput, setLabelInput] = useState('');
  const [showLabelInput, setShowLabelInput] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [ticker, setTicker] = useState(0);

  // Snapshot-to-snapshot compare mode
  const [pairCompareMode, setPairCompareMode] = useState(false);
  const [pairA, setPairA] = useState<SnapshotSummary | null>(null);
  const [pairB, setPairB] = useState<SnapshotSummary | null>(null);
  const [showPairDiff, setShowPairDiff] = useState(false);
  const [pairDiffLoading, setPairDiffLoading] = useState(false);
  const [pairChanges, setPairChanges] = useState<TokenChange[] | null>(null);
  const [pairOpenSections, setPairOpenSections] = useState<Record<string, boolean>>({});

  // Bug fix: AbortControllers to prevent races when the user rapidly switches comparisons.
  const singleCompareAbortRef = useRef<AbortController | null>(null);
  const pairCompareAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const id = setInterval(() => setTicker(t => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const loadSnapshots = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const data = await apiFetch<{ snapshots: SnapshotSummary[] }>(`${serverUrl}/api/snapshots`);
      setSnapshots(data.snapshots ?? []);
    } catch (err) {
      console.warn('[SnapshotsSource] failed to load snapshots:', err);
      setListError('Could not load snapshots');
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
    setListError(null);
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
      console.warn('[SnapshotsSource] failed to save snapshot:', err);
      setListError('Failed to save snapshot');
    } finally {
      setSaving(false);
    }
  };

  // Bug fix: abort previous in-flight compare request before starting a new one,
  // preventing races where a slower earlier request overwrites a newer one.
  const handleCompare = useCallback(async (id: string) => {
    singleCompareAbortRef.current?.abort();
    const controller = new AbortController();
    singleCompareAbortRef.current = controller;

    setComparing(id);
    setDiffLoading(true);
    setChanges(null);
    setSingleCompareError(null);
    try {
      const data = await apiFetch<{ diffs: SnapshotDiff[] }>(
        `${serverUrl}/api/snapshots/${id}/diff`,
        { signal: controller.signal }
      );
      if (controller.signal.aborted) return;
      const unified = (data.diffs ?? []).map(snapshotDiffToChange);
      setChanges(unified);
      const sections: Record<string, boolean> = {};
      for (const c of unified) sections[c.set] = true;
      setOpenSections(sections);
    } catch (err) {
      if (isAbortError(err)) return;
      console.warn('[SnapshotsSource] failed to load comparison:', err);
      setSingleCompareError('Failed to load comparison');
      setComparing(null);
    } finally {
      if (!controller.signal.aborted) setDiffLoading(false);
    }
  }, [serverUrl]);

  // Auto-compare when mounted from the unified timeline
  useEffect(() => {
    if (initialComparingId) {
      handleCompare(initialComparingId);
    }
    return () => { singleCompareAbortRef.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // Safe: mount-only. `initialComparingId` is an "initial value" prop.
  }, []);

  // Bug fix: abort previous pair compare before starting a new one.
  const handlePairCompare = useCallback(async (a: SnapshotSummary, b: SnapshotSummary) => {
    pairCompareAbortRef.current?.abort();
    const controller = new AbortController();
    pairCompareAbortRef.current = controller;

    setShowPairDiff(true);
    setPairDiffLoading(true);
    setPairChanges(null);
    setPairCompareError(null);
    try {
      const data = await apiFetch<{ diffs: SnapshotDiff[] }>(
        `${serverUrl}/api/snapshots/${a.id}/compare/${b.id}`,
        { signal: controller.signal }
      );
      if (controller.signal.aborted) return;
      const unified = (data.diffs ?? []).map(snapshotDiffToChange);
      setPairChanges(unified);
      const sections: Record<string, boolean> = {};
      for (const c of unified) sections[c.set] = true;
      setPairOpenSections(sections);
    } catch (err) {
      if (isAbortError(err)) return;
      console.warn('[SnapshotsSource] failed to load pair comparison:', err);
      setPairCompareError('Failed to load comparison');
      setShowPairDiff(false);
    } finally {
      if (!controller.signal.aborted) setPairDiffLoading(false);
    }
  }, [serverUrl]);

  const togglePairSection = useCallback((key: string) => {
    setPairOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleRevert = async () => {
    if (!comparing) return;
    setReverting(true);
    setSingleCompareError(null);
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
      console.warn('[SnapshotsSource] failed to revert snapshot:', err);
      setSingleCompareError('Failed to revert');
    } finally {
      setReverting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setListError(null);
    try {
      await apiFetch(`${serverUrl}/api/snapshots/${id}`, { method: 'DELETE' });
      if (comparing === id) {
        setComparing(null);
        setChanges(null);
      }
      await loadSnapshots();
    } catch (err) {
      console.warn('[SnapshotsSource] failed to delete snapshot:', err);
      setListError('Failed to delete snapshot');
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

  // ── Pair diff view (snapshot A vs snapshot B) ─────────────────────────
  if (showPairDiff && pairA && pairB) {
    const displayChanges = filterTokenPath && pairChanges
      ? pairChanges.filter(c => c.path === filterTokenPath)
      : pairChanges;
    const summary = displayChanges ? summarizeChanges(displayChanges) : { added: 0, modified: 0, removed: 0 };
    const noChanges = displayChanges?.length === 0;

    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-figma-border)] shrink-0">
          <button
            className="flex items-center gap-1 text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
            onClick={() => { setShowPairDiff(false); setPairChanges(null); setPairCompareError(null); }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
            Back
          </button>
          <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">/</span>
          <span className="text-[10px] text-[var(--color-figma-text)] truncate flex-1 min-w-0" title={`${pairA.label} → ${pairB.label}`}>
            <span className="text-[var(--color-figma-accent)]">{pairA.label}</span>
            <span className="mx-1 text-[var(--color-figma-text-tertiary)]">→</span>
            <span className="text-[var(--color-figma-success)]">{pairB.label}</span>
          </span>
        </div>

        {/* Summary bar */}
        {!pairDiffLoading && displayChanges && (
          <div className="flex items-center gap-3 px-3 py-2 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] shrink-0">
            {noChanges ? (
              <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                {filterTokenPath ? 'This token was unchanged between these snapshots.' : 'No differences between these snapshots.'}
              </span>
            ) : (
              <ChangeSummaryBadges {...summary} />
            )}
          </div>
        )}

        {/* Diff list */}
        <div className="flex-1 overflow-y-auto min-h-0 p-2 space-y-2">
          {pairDiffLoading && (
            <div className="flex items-center justify-center h-24">
              <span className="text-[11px] text-[var(--color-figma-text-secondary)] animate-pulse">Loading comparison…</span>
            </div>
          )}
          {!pairDiffLoading && noChanges && (
            <div className="flex flex-col items-center justify-center h-32 gap-2 px-6 text-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-success)]" aria-hidden="true">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              <p className="text-[11px] text-[var(--color-figma-text-secondary)]">
                {filterTokenPath ? 'This token was unchanged between these snapshots.' : 'No differences between these snapshots.'}
              </p>
            </div>
          )}
          {!pairDiffLoading && displayChanges && displayChanges.length > 0 && (
            <ChangesBySetList
              changes={displayChanges}
              openSections={pairOpenSections}
              onToggleSection={togglePairSection}
            />
          )}
        </div>

        {pairCompareError && (
          <div className="shrink-0 px-3 pb-2">
            <p className="text-[10px] text-[var(--color-figma-error)]">{pairCompareError}</p>
          </div>
        )}
      </div>
    );
  }

  // ── Compare view ──────────────────────────────────────────────────────
  if (comparing) {
    const snapshot = snapshots.find(s => s.id === comparing);
    const displayChanges = filterTokenPath && changes
      ? changes.filter(c => c.path === filterTokenPath)
      : changes;
    const summary = displayChanges ? summarizeChanges(displayChanges) : { added: 0, modified: 0, removed: 0 };
    const noChanges = displayChanges?.length === 0;

    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-figma-border)] shrink-0">
          <button
            className="flex items-center gap-1 text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
            onClick={() => { if (onBack) { onBack(); } else { setComparing(null); setChanges(null); setSingleCompareError(null); } }}
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

        {/* Diff list */}
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
            <ChangesBySetList
              changes={displayChanges}
              openSections={openSections}
              onToggleSection={toggleSection}
            />
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

        {singleCompareError && (
          <div className="shrink-0 px-3 pb-2">
            <p className="text-[10px] text-[var(--color-figma-error)]">{singleCompareError}</p>
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
          <div className="flex items-center gap-2">
            <button
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-50"
              onClick={() => { setLabelInput(defaultSnapshotLabel()); setShowLabelInput(true); }}
              disabled={saving}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              Save current state
            </button>
            {snapshots.length >= 2 && (
              <button
                onClick={() => {
                  setPairCompareMode(m => {
                    if (m) { setPairA(null); setPairB(null); }
                    return !m;
                  });
                }}
                className={`shrink-0 flex items-center gap-1 px-2 py-2 rounded text-[11px] font-medium border transition-colors ${
                  pairCompareMode
                    ? 'border-[var(--color-figma-accent)] bg-[color-mix(in_srgb,var(--color-figma-accent)_12%,transparent)] text-[var(--color-figma-accent)]'
                    : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'
                }`}
                title={pairCompareMode ? 'Exit compare mode' : 'Compare two snapshots'}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 20V10M12 20V4M6 20v-6" />
                </svg>
                Compare
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <input
              className="w-full px-2 py-1.5 text-[11px] rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-tertiary)] focus:focus-visible:border-[var(--color-figma-accent)]"
              placeholder="Snapshot label"
              value={labelInput}
              onChange={e => setLabelInput(e.target.value)}
              onFocus={e => e.target.select()}
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
        {listError && (
          <p className="mt-2 text-[10px] text-[var(--color-figma-error)]">{listError}</p>
        )}
      </div>

      {/* Compare mode banner */}
      {pairCompareMode && (
        <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 bg-[color-mix(in_srgb,var(--color-figma-accent)_6%,transparent)] border-b border-[var(--color-figma-border)]">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--color-figma-accent)]" aria-hidden="true">
            <path d="M18 20V10M12 20V4M6 20v-6" />
          </svg>
          {!pairA ? (
            <span className="flex-1 text-[10px] text-[var(--color-figma-text-secondary)]">
              Click <span className="font-semibold text-[var(--color-figma-accent)]">Set A</span> on a snapshot to start comparing
            </span>
          ) : !pairB ? (
            <span className="flex-1 text-[10px] text-[var(--color-figma-text-secondary)]">
              <span className="font-medium text-[var(--color-figma-text)]">{pairA.label}</span> selected as A — click <span className="font-semibold text-[var(--color-figma-success)]">Set B</span>
            </span>
          ) : (
            <span className="flex-1 text-[10px] text-[var(--color-figma-text-secondary)] truncate min-w-0">
              <span className="text-[var(--color-figma-accent)]">{pairA.label}</span>
              <span className="mx-1">→</span>
              <span className="text-[var(--color-figma-success)]">{pairB.label}</span>
            </span>
          )}
          {pairA && pairB && (
            <button
              onClick={() => handlePairCompare(pairA, pairB)}
              className="shrink-0 text-[10px] font-medium px-2 py-0.5 rounded bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] transition-colors"
            >
              View diff
            </button>
          )}
        </div>
      )}

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
            {snapshots.map(s => {
              const isA = pairA?.id === s.id;
              const isB = pairB?.id === s.id;
              return (
                <li key={s.id} className={`group flex items-start gap-2 px-3 py-2.5 border-b border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)] last:border-0 ${isA ? 'bg-[color-mix(in_srgb,var(--color-figma-accent)_6%,transparent)]' : isB ? 'bg-[color-mix(in_srgb,var(--color-figma-success)_6%,transparent)]' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium text-[var(--color-figma-text)] truncate" title={s.label}>
                      {s.label}
                    </p>
                    <p className="text-[10px] text-[var(--color-figma-text-tertiary)] mt-0.5">
                      {formatRelativeTime(new Date(s.timestamp))}{ticker >= 0 ? '' : ''} · {s.tokenCount} tokens · {s.setCount} {s.setCount === 1 ? 'set' : 'sets'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {pairCompareMode ? (
                      <>
                        <button
                          className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors ${
                            isA
                              ? 'border-[var(--color-figma-accent)] bg-[color-mix(in_srgb,var(--color-figma-accent)_12%,transparent)] text-[var(--color-figma-accent)]'
                              : isB
                              ? 'border-transparent text-[var(--color-figma-text-tertiary)] opacity-40 cursor-not-allowed'
                              : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)] hover:bg-[color-mix(in_srgb,var(--color-figma-accent)_6%,transparent)]'
                          }`}
                          onClick={() => {
                            if (isB) return;
                            setPairA(isA ? null : s);
                            if (pairB?.id === s.id) setPairB(null);
                          }}
                          title={isA ? 'Deselect as A' : 'Set as snapshot A (before)'}
                          disabled={isB}
                        >
                          A
                        </button>
                        <button
                          className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors ${
                            isB
                              ? 'border-[var(--color-figma-success)] bg-[color-mix(in_srgb,var(--color-figma-success)_12%,transparent)] text-[var(--color-figma-success)]'
                              : isA
                              ? 'border-transparent text-[var(--color-figma-text-tertiary)] opacity-40 cursor-not-allowed'
                              : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-success)] hover:text-[var(--color-figma-success)] hover:bg-[color-mix(in_srgb,var(--color-figma-success)_6%,transparent)]'
                          }`}
                          onClick={() => {
                            if (isA) return;
                            setPairB(isB ? null : s);
                            if (pairA?.id === s.id) setPairA(null);
                          }}
                          title={isB ? 'Deselect as B' : 'Set as snapshot B (after)'}
                          disabled={isA}
                        >
                          B
                        </button>
                      </>
                    ) : (
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
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
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
