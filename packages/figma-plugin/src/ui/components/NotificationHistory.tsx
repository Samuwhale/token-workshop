import { useEffect, useRef } from 'react';
import type { NotificationEntry } from '../hooks/useToastStack';

interface NotificationHistoryProps {
  history: NotificationEntry[];
  onClear: () => void;
  onClose: () => void;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return formatTime(ts);
}

export function NotificationHistory({ history, onClear, onClose }: NotificationHistoryProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-0.5 w-64 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-lg z-50 overflow-hidden"
    >
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
        <span className="text-[11px] font-medium text-[var(--color-figma-text)]">Notifications</span>
        {history.length > 0 && (
          <button
            onClick={onClear}
            className="text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
          >
            Clear
          </button>
        )}
      </div>
      {history.length === 0 ? (
        <div className="px-3 py-4 text-center text-[11px] text-[var(--color-figma-text-tertiary)]">
          No notifications yet
        </div>
      ) : (
        <div className="max-h-64 overflow-y-auto">
          {history.map(entry => (
            <div
              key={entry.id}
              className="flex items-start gap-2 px-3 py-2 border-b border-[var(--color-figma-border)] last:border-b-0 hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            >
              {entry.variant === 'error' ? (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 mt-0.5 text-red-400">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" />
                </svg>
              ) : (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 mt-0.5 text-green-400">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-[var(--color-figma-text)] break-words line-clamp-2">{entry.message}</div>
                <div className="text-[10px] text-[var(--color-figma-text-tertiary)] mt-0.5" title={formatTime(entry.timestamp)}>{timeAgo(entry.timestamp)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
