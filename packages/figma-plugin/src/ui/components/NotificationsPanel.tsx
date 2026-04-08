import type { NotificationEntry } from '../hooks/useToastStack';

interface NotificationsPanelProps {
  history: NotificationEntry[];
  onClear: () => void;
}

function formatTime(ts: number): string {
  const date = new Date(ts);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return formatTime(ts);
}

export function NotificationsPanel({ history, onClear }: NotificationsPanelProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[11px] font-medium text-[var(--color-figma-text)]">Notifications</h2>
            <p className="mt-1 text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">
              Review the recent toast history from imports, sync, validation, and server-side actions.
            </p>
          </div>
          {history.length > 0 && (
            <button
              onClick={onClear}
              className="shrink-0 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[10px] font-medium text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {history.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-[11px] text-[var(--color-figma-text-tertiary)]">
          No notifications yet.
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {history.map(entry => (
            <div
              key={entry.id}
              className="flex items-start gap-3 border-b border-[var(--color-figma-border)] px-3 py-2.5 last:border-b-0"
            >
              {entry.variant === 'error' ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--color-figma-error)]">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 shrink-0 text-green-500">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-[11px] leading-relaxed text-[var(--color-figma-text)] break-words">{entry.message}</div>
                <div className="mt-1 text-[10px] text-[var(--color-figma-text-tertiary)]" title={formatTime(entry.timestamp)}>
                  {timeAgo(entry.timestamp)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
