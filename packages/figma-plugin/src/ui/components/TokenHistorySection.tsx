import { useState, useCallback, useRef } from 'react';
import { Spinner } from './Spinner';
import { apiFetch } from '../shared/apiFetch';
import { getErrorMessage } from '../shared/utils';

export interface HistoryEntryData {
  id: string;
  timestamp: string;
  type: string;
  description: string;
  collectionId: string;
  rolledBack: boolean;
  before: { $value?: unknown; $type?: string } | null;
  after: { $value?: unknown; $type?: string } | null;
}

export function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function HistoryValueChip({ token, type, dim }: { token: { $value?: unknown; $type?: string } | null; type: string; dim: boolean }) {
  if (token == null) {
    return <span className="text-[10px] font-mono text-[var(--color-figma-text-tertiary)] italic">none</span>;
  }
  const val = token.$value;
  const t = token.$type ?? type;
  const label = typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val ?? '—');
  return (
    <span className={`flex items-center gap-1 text-[10px] font-mono truncate max-w-[120px] ${dim ? 'text-[var(--color-figma-text-secondary)] line-through opacity-60' : 'text-[var(--color-figma-text)]'}`} title={label}>
      {t === 'color' && typeof val === 'string' && (
        <span
          className="inline-block w-3 h-3 rounded-sm border border-white/20 ring-1 ring-[var(--color-figma-border)] shrink-0"
          style={{ backgroundColor: val.slice(0, 7) }}
          aria-hidden="true"
        />
      )}
      {label}
    </span>
  );
}

export function TokenHistorySection({ tokenPath, serverUrl, tokenType, onRollback }: {
  tokenPath: string;
  serverUrl: string;
  tokenType: string;
  onRollback?: (opId: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<HistoryEntryData[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rollingBack, setRollingBack] = useState<string | null>(null);
  const fetched = useRef(false);

  const load = useCallback(async (offset = 0) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ path: tokenPath, limit: '20', offset: String(offset) });
      const data = await apiFetch<{ data: HistoryEntryData[]; total: number; hasMore: boolean }>(
        `${serverUrl}/api/operations/token-history?${qs}`,
      );
      if (offset === 0) {
        setEntries(data.data);
      } else {
        setEntries(prev => [...prev, ...data.data]);
      }
      setTotal(data.total);
      setHasMore(data.hasMore);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [tokenPath, serverUrl]);

  const handleToggle = useCallback(() => {
    setOpen(o => {
      if (!o && !fetched.current) {
        fetched.current = true;
        load(0);
      }
      return !o;
    });
  }, [load]);

  const handleRollback = useCallback(async (id: string) => {
    if (!onRollback) return;
    setRollingBack(id);
    try {
      await onRollback(id);
      // Refresh history after rollback
      fetched.current = false;
      await load(0);
      fetched.current = true;
    } finally {
      setRollingBack(null);
    }
  }, [onRollback, load]);

  return (
    <div className="border-t border-[var(--color-figma-border)]">
      <button
        type="button"
        onClick={handleToggle}
        className="flex items-center gap-1.5 w-full px-3 py-2 text-left hover:bg-[var(--color-figma-bg-hover)] transition-colors"
        aria-expanded={open}
      >
        <svg
          width="8" height="8" viewBox="0 0 8 8" fill="currentColor" aria-hidden="true"
          className={`shrink-0 text-[var(--color-figma-text-secondary)] transition-transform ${open ? 'rotate-90' : ''}`}
        >
          <path d="M2 1l4 3-4 3V1z" />
        </svg>
        <span className="text-[11px] font-medium text-[var(--color-figma-text-secondary)]">History</span>
        {total > 0 && (
          <span className="ml-auto text-[10px] text-[var(--color-figma-text-tertiary)]">{total} change{total !== 1 ? 's' : ''}</span>
        )}
      </button>

      {open && (
        <div className="px-3 pb-3">
          {loading && entries.length === 0 && (
            <div className="flex items-center gap-2 py-2">
              <Spinner size="sm" />
              <span className="text-[11px] text-[var(--color-figma-text-secondary)]">Loading history…</span>
            </div>
          )}
          {error && (
            <div className="text-[11px] text-[var(--color-figma-error)] py-1">{error}</div>
          )}
          {!loading && !error && entries.length === 0 && (
            <div className="text-[11px] text-[var(--color-figma-text-tertiary)] py-1 italic">No recorded changes for this token.</div>
          )}
          {entries.length > 0 && (
            <ol className="flex flex-col gap-2">
              {entries.map(entry => {
                const beforeVal = entry.before?.$value;
                const afterVal = entry.after?.$value;
                const effectiveType = entry.before?.$type ?? entry.after?.$type ?? tokenType;
                const unchanged = JSON.stringify(beforeVal) === JSON.stringify(afterVal);
                return (
                  <li key={entry.id} className={`flex flex-col gap-1 text-[10px] ${entry.rolledBack ? 'opacity-50' : ''}`}>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <time
                        dateTime={entry.timestamp}
                        title={new Date(entry.timestamp).toLocaleString()}
                        className="text-[10px] text-[var(--color-figma-text-tertiary)] shrink-0"
                      >
                        {formatRelativeTime(entry.timestamp)}
                      </time>
                      <span className="text-[10px] text-[var(--color-figma-text-secondary)] truncate flex-1 min-w-0" title={entry.description}>
                        {entry.description}
                      </span>
                      {entry.rolledBack && (
                        <span className="shrink-0 px-1 py-px rounded text-[9px] font-medium bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-tertiary)] border border-[var(--color-figma-border)] leading-none">
                          rolled back
                        </span>
                      )}
                      {onRollback && !entry.rolledBack && (
                        <button
                          type="button"
                          onClick={() => handleRollback(entry.id)}
                          disabled={rollingBack === entry.id}
                          className="shrink-0 px-1 py-px rounded text-[9px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] border border-transparent hover:border-[var(--color-figma-border)] disabled:opacity-50 leading-none"
                          title="Undo this change"
                        >
                          {rollingBack === entry.id ? '…' : 'Undo'}
                        </button>
                      )}
                    </div>
                    {!unchanged && (
                      <div className="flex items-center gap-1.5 pl-1">
                        <HistoryValueChip token={entry.before} type={effectiveType} dim={true} />
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-[var(--color-figma-text-tertiary)] shrink-0">
                          <path d="M5 12h14M13 6l6 6-6 6" />
                        </svg>
                        <HistoryValueChip token={entry.after} type={effectiveType} dim={false} />
                      </div>
                    )}
                    {unchanged && (
                      <div className="pl-1 text-[10px] text-[var(--color-figma-text-tertiary)] italic">metadata/type change</div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
          {hasMore && (
            <button
              type="button"
              onClick={() => load(entries.length)}
              disabled={loading}
              className="mt-2 text-[10px] text-[var(--color-figma-accent)] hover:underline disabled:opacity-50"
            >
              {loading ? 'Loading…' : 'Load more'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
