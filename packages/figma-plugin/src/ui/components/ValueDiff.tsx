interface ValueDiffProps {
  type: string;
  before: any;
  after: any;
}

const ArrowRight = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-[var(--color-figma-text-secondary)] shrink-0">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

function formatDim(v: any): string {
  if (typeof v === 'object' && v !== null && 'value' in v) {
    return `${v.value}${v.unit ?? 'px'}`;
  }
  return String(v ?? '');
}

function formatTypo(v: any): string {
  if (typeof v !== 'object' || v === null) return String(v ?? '—');
  const family = Array.isArray(v.fontFamily) ? v.fontFamily[0] : (v.fontFamily ?? '');
  const size = typeof v.fontSize === 'object'
    ? `${v.fontSize?.value ?? ''}${v.fontSize?.unit ?? 'px'}`
    : v.fontSize ? `${v.fontSize}px` : '';
  const weight = v.fontWeight ?? '';
  return [family, size, weight].filter(Boolean).join(' ') || '—';
}

export function ValueDiff({ type, before, after }: ValueDiffProps) {
  if (JSON.stringify(before) === JSON.stringify(after)) return null;

  if (type === 'color') {
    const b6 = typeof before === 'string' ? before.slice(0, 7) : null;
    const a6 = typeof after === 'string' ? after.slice(0, 7) : null;
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)]">
        <span className="text-[9px] text-[var(--color-figma-text-secondary)] uppercase tracking-wide shrink-0">Before</span>
        <div className="flex items-center gap-1.5 min-w-0">
          {b6 && (
            <div
              className="w-4 h-4 rounded-sm border border-white/30 ring-1 ring-[var(--color-figma-border)] shrink-0"
              style={{ backgroundColor: b6 }}
              aria-hidden="true"
            />
          )}
          <span className="text-[9px] font-mono text-[var(--color-figma-text-secondary)] truncate">
            {typeof before === 'string' ? before : '—'}
          </span>
        </div>
        <ArrowRight />
        <div className="flex items-center gap-1.5 min-w-0">
          {a6 && (
            <div
              className="w-4 h-4 rounded-sm border border-white/30 ring-1 ring-[var(--color-figma-border)] shrink-0"
              style={{ backgroundColor: a6 }}
              aria-hidden="true"
            />
          )}
          <span className="text-[9px] font-mono text-[var(--color-figma-text)] truncate">
            {typeof after === 'string' ? after : '—'}
          </span>
        </div>
      </div>
    );
  }

  if (type === 'dimension') {
    const beforeLabel = formatDim(before);
    const afterLabel = formatDim(after);
    const beforeNum = typeof before === 'object' ? (parseFloat(before?.value) || 0) : (parseFloat(before) || 0);
    const afterNum = typeof after === 'object' ? (parseFloat(after?.value) || 0) : (parseFloat(after) || 0);
    const unit = (typeof after === 'object' && after?.unit) || 'px';
    const delta = Math.round((afterNum - beforeNum) * 1000) / 1000;
    const deltaStr = delta !== 0 ? `${delta > 0 ? '+' : ''}${delta}${unit}` : null;
    return (
      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)]">
        <span className="text-[9px] text-[var(--color-figma-text-secondary)] uppercase tracking-wide shrink-0">Before</span>
        <span className="text-[10px] font-mono text-[var(--color-figma-text-secondary)]">{beforeLabel}</span>
        <ArrowRight />
        <span className="text-[10px] font-mono text-[var(--color-figma-text)]">{afterLabel}</span>
        {deltaStr && (
          <span className={`ml-auto text-[9px] font-mono shrink-0 ${delta > 0 ? 'text-[var(--color-figma-success)]' : 'text-[var(--color-figma-error)]'}`}>
            {deltaStr}
          </span>
        )}
      </div>
    );
  }

  if (type === 'number') {
    const beforeNum = parseFloat(before) || 0;
    const afterNum = parseFloat(after) || 0;
    const delta = Math.round((afterNum - beforeNum) * 1000) / 1000;
    const deltaStr = delta !== 0 ? `${delta > 0 ? '+' : ''}${delta}` : null;
    return (
      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)]">
        <span className="text-[9px] text-[var(--color-figma-text-secondary)] uppercase tracking-wide shrink-0">Before</span>
        <span className="text-[10px] font-mono text-[var(--color-figma-text-secondary)]">{String(before ?? '')}</span>
        <ArrowRight />
        <span className="text-[10px] font-mono text-[var(--color-figma-text)]">{String(after ?? '')}</span>
        {deltaStr && (
          <span className={`ml-auto text-[9px] font-mono shrink-0 ${delta > 0 ? 'text-[var(--color-figma-success)]' : 'text-[var(--color-figma-error)]'}`}>
            {deltaStr}
          </span>
        )}
      </div>
    );
  }

  if (type === 'typography') {
    const beforeLabel = formatTypo(before);
    const afterLabel = formatTypo(after);
    const beforeFamily = Array.isArray(before?.fontFamily) ? before.fontFamily[0] : (before?.fontFamily ?? '');
    const afterFamily = Array.isArray(after?.fontFamily) ? after.fontFamily[0] : (after?.fontFamily ?? '');
    return (
      <div className="flex flex-col gap-1 px-2 py-1.5 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)]">
        <span className="text-[9px] text-[var(--color-figma-text-secondary)] uppercase tracking-wide">Before → After</span>
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="text-[11px] text-[var(--color-figma-text-secondary)] line-through truncate max-w-[50%]"
            style={{ fontFamily: beforeFamily || 'inherit' }}
            title={beforeLabel}
          >
            {beforeLabel}
          </span>
          <ArrowRight />
          <span
            className="text-[11px] text-[var(--color-figma-text)] truncate max-w-[50%]"
            style={{ fontFamily: afterFamily || 'inherit' }}
            title={afterLabel}
          >
            {afterLabel}
          </span>
        </div>
      </div>
    );
  }

  // Fallback for string, boolean, shadow, border, gradient, etc.
  const beforeDisplay = typeof before === 'object' ? JSON.stringify(before) : String(before ?? '');
  const afterDisplay = typeof after === 'object' ? JSON.stringify(after) : String(after ?? '');
  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)]">
      <span className="text-[9px] text-[var(--color-figma-text-secondary)] uppercase tracking-wide shrink-0">Before</span>
      <span className="text-[10px] font-mono text-[var(--color-figma-text-secondary)] truncate max-w-[80px]" title={beforeDisplay}>
        {beforeDisplay}
      </span>
      <ArrowRight />
      <span className="text-[10px] font-mono text-[var(--color-figma-text)] truncate max-w-[80px]" title={afterDisplay}>
        {afterDisplay}
      </span>
    </div>
  );
}
