import { useState, useEffect, useCallback } from 'react';
import { swatchBgColor } from '../shared/colorUtils';
import { apiFetch } from '../shared/apiFetch';

interface SnapshotSummary {
  id: string;
  label: string;
  timestamp: string;
  tokenCount: number;
  setCount: number;
}

interface TokenDiff {
  path: string;
  set: string;
  status: 'added' | 'modified' | 'removed';
  before?: { $value: unknown; $type?: string };
  after?: { $value: unknown; $type?: string };
}

interface SnapshotPanelProps {
  serverUrl: string;
  connected: boolean;
}

function formatRelative(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatValue(value: unknown, type?: string): string {
  if (value == null) return '—';
  if (typeof value === 'string') {
    return value.length > 40 ? value.slice(0, 40) + '…' : value;
  }
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object') {
    const s = JSON.stringify(value);
    return s.length > 50 ? s.slice(0, 50) + '…' : s;
  }
  return String(value);
}

function ColorSwatch({ value }: { value: unknown }) {
  if (typeof value !== 'string') return null;
  return (
    <span
      className="inline-block w-3 h-3 rounded-sm border border-[var(--color-figma-border)] shrink-0 align-middle mr-1"
      style={{ backgroundColor: swatchBgColor(value) }}
      aria-hidden="true"
    />
  );
}

function statusDot(status: 'added' | 'modified' | 'removed') {
  if (status === 'added') return 'bg-[var(--color-figma-success)]';
  if (status === 'removed') return 'bg-[var(--color-figma-error)]';
  return 'bg-[var(--color-figma-warning)]';
}

function statusLabel(status: 'added' | 'modified' | 'removed') {
  if (status === 'added') return 'Added';
  if (status === 'removed') return 'Removed';
  return 'Changed';
}

function DiffRow({ diff }: { diff: TokenDiff }) {
  const [expanded, setExpanded] = useState(false);
  const type = diff.before?.$type ?? diff.after?.$type ?? '';
  const isColor = type === 'color';
  const beforeVal = diff.before?.$value;
  const afterVal = diff.after?.$value;

  return (
    <div className="border-b border-[var(--color-figma-border)] last:border-0">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--color-figma-bg-hover)] group"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot(diff.status)}`} aria-hidden="true" />
        <span className="text-[11px] text-[var(--color-figma-text)] font-mono truncate flex-1 min-w-0" title={diff.path}>
          {diff.path}
        </span>
        <span className="text-[10px] text-[var(--color-figma-text-tertiary)] shrink-0 ml-1">{diff.set}</span>
        <span className={`text-[9px] font-medium uppercase tracking-wide shrink-0 px-1 rounded ${
          diff.status === 'added' ? 'text-[var(--color-figma-success)] bg-[var(--color-figma-success)]/10'
          : diff.status === 'removed' ? 'text-[var(--color-figma-error)] bg-[var(--color-figma-error)]/10'
          : 'text-[var(--color-figma-warning)] bg-[var(--color-figma-warning)]/10'
        }`}>
          {statusLabel(diff.status)}
        </span>
        <svg
          width="8" height="8" viewBox="0 0 8 8" fill="currentColor"
          className={`shrink-0 text-[var(--color-figma-text-tertiary)] transition-transform ${expanded ? 'rotate-90' : ''}`}
          aria-hidden="true"
        >
          <path d="M2 1l4 3-4 3V1z" />
        </svg>
      </button>
      {expanded && (
        <div className="px-3 pb-2 flex flex-col gap-1">
          {diff.status !== 'added' && (
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[9px] uppercase tracking-wide text-[var(--color-figma-text-tertiary)] shrink-0 w-12">Saved</span>
              <span className="flex items-center gap-1 text-[10px] font-mono text-[var(--color-figma-text-secondary)] truncate">
                {isColor && <ColorSwatch value={beforeVal} />}
                {formatValue(beforeVal, type)}
              </span>
            </div>
          )}
          {diff.status !== 'removed' && (
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[9px] uppercase tracking-wide text-[var(--color-figma-text-tertiary)] shrink-0 w-12">Now</span>
              <span className="flex items-center gap-1 text-[10px] font-mono text-[var(--color-figma-text)] truncate">
                {isColor && <ColorSwatch value={afterVal} />}
                {formatValue(afterVal, type)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type View = 'list' | 'compare';

export function SnapshotPanel({ serverUrl, connected }: SnapshotPanelProps) {
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [comparing, setComparing] = useState<string | null>(null);
  const [diffs, setDiffs] = useState<TokenDiff[] | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [labelInput, setLabelInput] = useState('');
  const [showLabelInput, setShowLabelInput] = useState(false);
  const [view, setView] = useState<View>('list');
  const [ticker, setTicker] = useState(0);

  // Refresh relative timestamps every 30s
  useEffect(() => {
    const id = setInterval(() => setTicker(t => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const loadSnapshots = useCallback(async () => {
    if (!connected) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(serverUrl, '/api/snapshots');
      const data = await res.json() as { snapshots: SnapshotSummary[] };
      setSnapshots(data.snapshots ?? []);
    } catch {
      setError('Could not load snapshots');
    } finally {
      setLoading(false);
    }
  }, [serverUrl, connected]);

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
      await apiFetch(serverUrl, '/api/snapshots', {
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
    setDiffs(null);
    setView('compare');
    setError(null);
    try {
      const res = await apiFetch(serverUrl, `/api/snapshots/${id}/diff`);
      const data = await res.json() as { diffs: TokenDiff[] };
      setDiffs(data.diffs ?? []);
    } catch {
      setError('Failed to load comparison');
      setView('list');
    } finally {
      setDiffLoading(false);
    }
  };

  const handleRevert = async () => {
    if (!comparing) return;
    setReverting(true);
    setError(null);
    try {
      await apiFetch(serverUrl, `/api/snapshots/${comparing}/restore`, { method: 'POST' });
      showSuccess('Reverted to saved state');
      setView('list');
      setComparing(null);
      setDiffs(null);
    } catch {
      setError('Failed to revert');
    } finally {
      setReverting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setError(null);
    try {
      await apiFetch(serverUrl, `/api/snapshots/${id}`, { method: 'DELETE' });
      if (comparing === id) {
        setView('list');
        setComparing(null);
        setDiffs(null);
      }
      await loadSnapshots();
    } catch {
      setError('Failed to delete snapshot');
    }
  };

  const handleKeepChanges = () => {
    setView('list');
    setComparing(null);
    setDiffs(null);
    showSuccess('Changes kept');
  };

  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
        <p className="text-[11px] text-[var(--color-figma-text-secondary)]">Connect to the token server to use snapshots.</p>
      </div>
    );
  }

  // ── Compare view ────────────────────────────────────────────────────────────
  if (view === 'compare' && comparing) {
    const snapshot = snapshots.find(s => s.id === comparing);
    const added = diffs?.filter(d => d.status === 'added').length ?? 0;
    const modified = diffs?.filter(d => d.status === 'modified').length ?? 0;
    const removed = diffs?.filter(d => d.status === 'removed').length ?? 0;
    const noChanges = diffs?.length === 0;

    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-figma-border)] shrink-0">
          <button
            className="flex items-center gap-1 text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
            onClick={() => { setView('list'); setComparing(null); setDiffs(null); }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
            Snapshots
          </button>
          <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">/</span>
          <span className="text-[10px] text-[var(--color-figma-text)] truncate flex-1 min-w-0" title={snapshot?.label}>
            {snapshot?.label ?? 'Compare'}
          </span>
        </div>

        {/* Summary bar */}
        {!diffLoading && diffs && (
          <div className="flex items-center gap-3 px-3 py-2 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] shrink-0">
            {noChanges ? (
              <span className="text-[10px] text-[var(--color-figma-text-secondary)]">No changes since this snapshot.</span>
            ) : (
              <>
                {added > 0 && (
                  <span className="text-[10px] text-[var(--color-figma-success)]">+{added} added</span>
                )}
                {modified > 0 && (
                  <span className="text-[10px] text-[var(--color-figma-warning)]">{modified} changed</span>
                )}
                {removed > 0 && (
                  <span className="text-[10px] text-[var(--color-figma-error)]">−{removed} removed</span>
                )}
              </>
            )}
          </div>
        )}

        {/* Diff list */}
        <div className="flex-1 overflow-y-auto min-h-0">
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
          {!diffLoading && diffs && diffs.length > 0 && diffs.map((d, i) => (
            <DiffRow key={`${d.set}/${d.path}/${i}`} diff={d} />
          ))}
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

  // ── List view ──────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden">
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
            Save this state
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
        {error && (
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
                    {/* ticker used to force re-render for relative time */}
                    {formatRelative(s.timestamp)}{ticker >= 0 ? '' : ''} · {s.tokenCount} tokens · {s.setCount} {s.setCount === 1 ? 'set' : 'sets'}
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
