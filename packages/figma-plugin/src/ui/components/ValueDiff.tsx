
import { stableStringify } from "../shared/utils";

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
  return [family, size, weight].filter(Boolean).join(' / ') || '—';
}

function shadowToCss(s: Record<string, any>): string {
  const { color = '#00000040', offsetX, offsetY, blur, spread } = s;
  const ox = typeof offsetX === 'object' ? `${offsetX.value}${offsetX.unit}` : (offsetX ?? '0px');
  const oy = typeof offsetY === 'object' ? `${offsetY.value}${offsetY.unit}` : (offsetY ?? '4px');
  const b = typeof blur === 'object' ? `${blur.value}${blur.unit}` : (blur ?? '8px');
  const sp = typeof spread === 'object' ? `${spread.value}${spread.unit}` : (spread ?? '0px');
  return `${ox} ${oy} ${b} ${sp} ${color}`;
}

function formatShadow(v: any): string {
  const shadows = Array.isArray(v) ? v : [v];
  return shadows
    .filter((s): s is Record<string, any> => s !== null && typeof s === 'object')
    .map(s => {
      const ox = typeof s.offsetX === 'object' ? `${s.offsetX.value}${s.offsetX.unit}` : (s.offsetX ?? '0');
      const oy = typeof s.offsetY === 'object' ? `${s.offsetY.value}${s.offsetY.unit}` : (s.offsetY ?? '0');
      const b = typeof s.blur === 'object' ? `${s.blur.value}${s.blur.unit}` : (s.blur ?? '0');
      const color = s.color ?? '#000';
      return `${ox} ${oy} ${b} ${color}`;
    })
    .join(', ') || '—';
}

function formatBorder(v: any): string {
  if (typeof v !== 'object' || v === null) return '—';
  const w = typeof v.width === 'object' ? `${v.width.value}${v.width.unit}` : (v.width ?? '');
  return [w, v.style, v.color].filter(Boolean).join(' ') || '—';
}

function formatGradient(v: any): string {
  if (typeof v === 'string') return v.length > 40 ? v.slice(0, 40) + '…' : v;
  if (Array.isArray(v)) return `${v.length} stops`;
  return '—';
}

function gradientToCss(v: any): string | null {
  if (typeof v === 'string' && v.includes('gradient')) return v;
  if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object' && 'color' in v[0]) {
    const stops = (v as Array<{ color: string; position?: number }>)
      .map(s => `${s.color}${s.position != null ? ` ${Math.round(s.position * 100)}%` : ''}`)
      .join(', ');
    return `linear-gradient(to right, ${stops})`;
  }
  return null;
}

function ShadowPreviewSwatch({ value }: { value: any }) {
  const shadows = Array.isArray(value) ? value : [value];
  const parts = shadows
    .filter((s): s is Record<string, any> => s !== null && typeof s === 'object')
    .map(shadowToCss);
  if (parts.length === 0) return null;
  return (
    <div
      className="w-5 h-5 rounded shrink-0 bg-[var(--color-figma-bg)]"
      style={{ boxShadow: parts.join(', ') }}
      aria-hidden="true"
    />
  );
}

function BorderPreviewSwatch({ value }: { value: any }) {
  if (typeof value !== 'object' || value === null) return null;
  const w = typeof value.width === 'object' ? `${value.width.value}${value.width.unit}` : (value.width ?? '1px');
  const style = value.style ?? 'solid';
  const color = value.color ?? '#000';
  return (
    <div
      className="w-5 h-5 rounded shrink-0 bg-[var(--color-figma-bg)]"
      style={{ border: `${w} ${style} ${color}` }}
      aria-hidden="true"
    />
  );
}

function GradientPreviewSwatch({ value }: { value: any }) {
  const css = gradientToCss(value);
  if (!css) return null;
  return (
    <div
      className="w-6 h-4 rounded border border-[var(--color-figma-border)] shrink-0"
      style={{ background: css }}
      aria-hidden="true"
    />
  );
}

function TypoPreviewSwatch({ value }: { value: any }) {
  if (typeof value !== 'object' || value === null) return null;
  const fontFamily = value.fontFamily || 'inherit';
  const fontWeight = value.fontWeight || 400;
  return (
    <div
      className="w-6 h-4 rounded border border-[var(--color-figma-border)] shrink-0 flex items-center justify-center overflow-hidden bg-[var(--color-figma-bg)]"
      style={{ fontFamily, fontWeight, fontSize: '9px', lineHeight: 1 }}
      aria-hidden="true"
    >
      Aa
    </div>
  );
}

export function ValueDiff({ type, before, after }: ValueDiffProps) {
  if (stableStringify(before) === stableStringify(after)) return null;

  if (type === 'color') {
    const b6 = typeof before === 'string' ? before.slice(0, 7) : null;
    const a6 = typeof after === 'string' ? after.slice(0, 7) : null;
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)]">
        <span className="text-secondary text-[var(--color-figma-text-secondary)] shrink-0">Before</span>
        <div className="flex items-center gap-1.5 min-w-0">
          {b6 && (
            <div
              className="w-4 h-4 rounded-sm border border-white/30 ring-1 ring-[var(--color-figma-border)] shrink-0"
              style={{ backgroundColor: b6 }}
              aria-hidden="true"
            />
          )}
          <span className="text-secondary font-mono text-[var(--color-figma-text-secondary)] truncate">
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
          <span className="text-secondary font-mono text-[var(--color-figma-text)] truncate">
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
        <span className="text-secondary text-[var(--color-figma-text-secondary)] shrink-0">Before</span>
        <span className="text-secondary font-mono text-[var(--color-figma-text-secondary)]">{beforeLabel}</span>
        <ArrowRight />
        <span className="text-secondary font-mono text-[var(--color-figma-text)]">{afterLabel}</span>
        {deltaStr && (
          <span className={`ml-auto text-secondary font-mono shrink-0 ${delta > 0 ? 'text-[var(--color-figma-success)]' : 'text-[var(--color-figma-error)]'}`}>
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
        <span className="text-secondary text-[var(--color-figma-text-secondary)] shrink-0">Before</span>
        <span className="text-secondary font-mono text-[var(--color-figma-text-secondary)]">{String(before ?? '')}</span>
        <ArrowRight />
        <span className="text-secondary font-mono text-[var(--color-figma-text)]">{String(after ?? '')}</span>
        {deltaStr && (
          <span className={`ml-auto text-secondary font-mono shrink-0 ${delta > 0 ? 'text-[var(--color-figma-success)]' : 'text-[var(--color-figma-error)]'}`}>
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
        <span className="text-secondary text-[var(--color-figma-text-secondary)]">Before → After</span>
        <div className="flex items-center gap-2 min-w-0">
          <TypoPreviewSwatch value={before} />
          <span
            className="text-body text-[var(--color-figma-text-secondary)] line-through truncate max-w-[40%]"
            style={{ fontFamily: beforeFamily || 'inherit' }}
            title={beforeLabel}
          >
            {beforeLabel}
          </span>
          <ArrowRight />
          <TypoPreviewSwatch value={after} />
          <span
            className="text-body text-[var(--color-figma-text)] truncate max-w-[40%]"
            style={{ fontFamily: afterFamily || 'inherit' }}
            title={afterLabel}
          >
            {afterLabel}
          </span>
        </div>
      </div>
    );
  }

  if (type === 'shadow') {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)]">
        <span className="text-secondary text-[var(--color-figma-text-secondary)] shrink-0">Before</span>
        <div className="flex items-center gap-1.5 min-w-0">
          <ShadowPreviewSwatch value={before} />
          <span className="text-secondary font-mono text-[var(--color-figma-text-secondary)] truncate" title={formatShadow(before)}>{formatShadow(before)}</span>
        </div>
        <ArrowRight />
        <div className="flex items-center gap-1.5 min-w-0">
          <ShadowPreviewSwatch value={after} />
          <span className="text-secondary font-mono text-[var(--color-figma-text)] truncate" title={formatShadow(after)}>{formatShadow(after)}</span>
        </div>
      </div>
    );
  }

  if (type === 'border') {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)]">
        <span className="text-secondary text-[var(--color-figma-text-secondary)] shrink-0">Before</span>
        <div className="flex items-center gap-1.5 min-w-0">
          <BorderPreviewSwatch value={before} />
          <span className="text-secondary font-mono text-[var(--color-figma-text-secondary)] truncate" title={formatBorder(before)}>{formatBorder(before)}</span>
        </div>
        <ArrowRight />
        <div className="flex items-center gap-1.5 min-w-0">
          <BorderPreviewSwatch value={after} />
          <span className="text-secondary font-mono text-[var(--color-figma-text)] truncate" title={formatBorder(after)}>{formatBorder(after)}</span>
        </div>
      </div>
    );
  }

  if (type === 'gradient') {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)]">
        <span className="text-secondary text-[var(--color-figma-text-secondary)] shrink-0">Before</span>
        <div className="flex items-center gap-1.5 min-w-0">
          <GradientPreviewSwatch value={before} />
          <span className="text-secondary font-mono text-[var(--color-figma-text-secondary)] truncate">{formatGradient(before)}</span>
        </div>
        <ArrowRight />
        <div className="flex items-center gap-1.5 min-w-0">
          <GradientPreviewSwatch value={after} />
          <span className="text-secondary font-mono text-[var(--color-figma-text)] truncate">{formatGradient(after)}</span>
        </div>
      </div>
    );
  }

  // Fallback for string, boolean, composition, etc.
  const beforeDisplay = typeof before === 'object' ? JSON.stringify(before) : String(before ?? '');
  const afterDisplay = typeof after === 'object' ? JSON.stringify(after) : String(after ?? '');
  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)]">
      <span className="text-secondary text-[var(--color-figma-text-secondary)] shrink-0">Before</span>
      <span className="text-secondary font-mono text-[var(--color-figma-text-secondary)] truncate max-w-[80px]" title={beforeDisplay}>
        {beforeDisplay}
      </span>
      <ArrowRight />
      <span className="text-secondary font-mono text-[var(--color-figma-text)] truncate max-w-[80px]" title={afterDisplay}>
        {afterDisplay}
      </span>
    </div>
  );
}
