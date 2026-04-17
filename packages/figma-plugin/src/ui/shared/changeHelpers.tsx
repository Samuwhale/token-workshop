import { swatchBgColor } from './colorUtils';
import { formatTokenValueForDisplay } from './tokenFormatting';

/* ── Types ────────────────────────────────────────────────────────────── */

export type ChangeStatus = 'added' | 'modified' | 'removed';

export interface TokenChange {
  path: string;
  collectionId: string;
  type: string;
  status: ChangeStatus;
  before?: any;
  after?: any;
  changedFields?: string[];
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

export function formatRelativeTime(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

export function statusColor(status: ChangeStatus): string {
  switch (status) {
    case 'added': return 'var(--color-figma-success)';
    case 'modified': return 'var(--color-figma-warning)';
    case 'removed': return 'var(--color-figma-error)';
  }
}

export function statusLabel(status: ChangeStatus): string {
  switch (status) {
    case 'added': return 'Added';
    case 'modified': return 'Changed';
    case 'removed': return 'Removed';
  }
}

export function summarizeChanges(changes: TokenChange[]): { added: number; modified: number; removed: number } {
  let added = 0, modified = 0, removed = 0;
  for (const c of changes) {
    if (c.status === 'added') added++;
    else if (c.status === 'modified') modified++;
    else removed++;
  }
  return { added, modified, removed };
}

export function formatTokenValue(type: string, value: any): string {
  return formatTokenValueForDisplay(type, value);
}

/* ── Shared UI components ─────────────────────────────────────────────── */

export function ColorSwatch({ color }: { color: string }) {
  return (
    <div
      className="w-3.5 h-3.5 rounded-sm border border-white/30 ring-1 ring-[var(--color-figma-border)] shrink-0 inline-block"
      style={{ backgroundColor: swatchBgColor(color) }}
      aria-hidden="true"
    />
  );
}

export function Section({ title, open, onToggle, badge, children }: {
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

export function ChangeSummaryBadges({ added, modified, removed }: { added: number; modified: number; removed: number }) {
  return (
    <span className="flex items-center gap-1.5 ml-auto text-[10px] font-mono">
      {added > 0 && <span style={{ color: 'var(--color-figma-success)' }}>+{added}</span>}
      {modified > 0 && <span style={{ color: 'var(--color-figma-warning)' }}>~{modified}</span>}
      {removed > 0 && <span style={{ color: 'var(--color-figma-error)' }}>-{removed}</span>}
      {added === 0 && modified === 0 && removed === 0 && (
        <span className="text-[var(--color-figma-text-tertiary)]">no token changes</span>
      )}
    </span>
  );
}
