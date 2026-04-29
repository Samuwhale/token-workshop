
import { stableStringify } from "../shared/utils";
import { formatTokenValueForDisplay } from "../shared/tokenFormatting";
import {
  buildBoxShadowCss,
  buildGradientCss,
  formatBorderSummary,
  formatDimensionCss,
  formatGradientSummary,
  formatShadowSummary,
  getTypographyFontFamily,
} from "../shared/compositeTokenUtils";
import {
  readDimensionTokenValue,
  readDurationTokenValue,
  tryConvertDurationTokenValueToMilliseconds,
} from "../shared/tokenValueParsing";

interface ValueDiffProps {
  type: string;
  before: unknown;
  after: unknown;
}

const ArrowRight = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-[color:var(--color-figma-text-secondary)] shrink-0">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

function formatMeasure(value: unknown, type: 'dimension' | 'duration'): string {
  return formatTokenValueForDisplay(type, value, { emptyPlaceholder: '' });
}

function formatDelta(value: number, unit: string): string {
  const rounded = Math.round(value * 1000) / 1000;
  return `${rounded > 0 ? '+' : ''}${rounded}${unit}`;
}

function formatTypo(value: unknown): string {
  return formatTokenValueForDisplay('typography', value);
}

function parseNumericValue(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function ShadowPreviewSwatch({ value }: { value: unknown }) {
  const css = buildBoxShadowCss(value);
  if (!css) return null;
  return (
    <div
      className="w-5 h-5 rounded shrink-0 bg-[var(--color-figma-bg)]"
      style={{ boxShadow: css }}
      aria-hidden="true"
    />
  );
}

function BorderPreviewSwatch({ value }: { value: unknown }) {
  if (!isRecord(value)) return null;
  const w = formatDimensionCss(value.width, '1px');
  const style = typeof value.style === 'string' ? value.style : 'solid';
  const color = typeof value.color === 'string' ? value.color : '#000';
  return (
    <div
      className="w-5 h-5 rounded shrink-0 bg-[var(--color-figma-bg)]"
      style={{ border: `${w} ${style} ${color}` }}
      aria-hidden="true"
    />
  );
}

function GradientPreviewSwatch({ value }: { value: unknown }) {
  const css = buildGradientCss(value);
  if (!css) return null;
  return (
    <div
      className="w-6 h-4 rounded border border-[var(--color-figma-border)] shrink-0"
      style={{ background: css }}
      aria-hidden="true"
    />
  );
}

function TypoPreviewSwatch({ value }: { value: unknown }) {
  if (!isRecord(value)) return null;
  const fontFamily = getTypographyFontFamily(value) || 'inherit';
  const fontWeight =
    typeof value.fontWeight === 'number' || typeof value.fontWeight === 'string'
      ? value.fontWeight
      : 400;
  return (
    <div
      className="w-6 h-4 rounded border border-[var(--color-figma-border)] shrink-0 flex items-center justify-center overflow-hidden bg-[var(--color-figma-bg)]"
      style={{ fontFamily, fontWeight, fontSize: '11px', lineHeight: 1 }}
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
        <span className="text-secondary text-[color:var(--color-figma-text-secondary)] shrink-0">Before</span>
        <div className="flex items-center gap-1.5 min-w-0">
          {b6 && (
            <div
              className="w-4 h-4 rounded-sm border border-white/30 ring-1 ring-[var(--color-figma-border)] shrink-0"
              style={{ backgroundColor: b6 }}
              aria-hidden="true"
            />
          )}
          <span className="text-secondary font-mono text-[color:var(--color-figma-text-secondary)] truncate">
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
          <span className="text-secondary font-mono text-[color:var(--color-figma-text)] truncate">
            {typeof after === 'string' ? after : '—'}
          </span>
        </div>
      </div>
    );
  }

  if (type === 'dimension') {
    const beforeLabel = formatMeasure(before, 'dimension');
    const afterLabel = formatMeasure(after, 'dimension');
    const beforeMeasure = readDimensionTokenValue(before);
    const afterMeasure = readDimensionTokenValue(after);
    const deltaValue =
      beforeMeasure &&
      afterMeasure &&
      beforeMeasure.unit === afterMeasure.unit &&
      beforeMeasure.value !== afterMeasure.value
        ? afterMeasure.value - beforeMeasure.value
        : null;
    const deltaStr =
      deltaValue !== null && afterMeasure
        ? formatDelta(deltaValue, afterMeasure.unit)
        : null;
    return (
      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)]">
        <span className="text-secondary text-[color:var(--color-figma-text-secondary)] shrink-0">Before</span>
        <span className="text-secondary font-mono text-[color:var(--color-figma-text-secondary)]">{beforeLabel}</span>
        <ArrowRight />
        <span className="text-secondary font-mono text-[color:var(--color-figma-text)]">{afterLabel}</span>
        {deltaStr && deltaValue !== null && (
          <span className={`ml-auto text-secondary font-mono shrink-0 ${deltaValue > 0 ? 'text-[color:var(--color-figma-success)]' : 'text-[color:var(--color-figma-error)]'}`}>
            {deltaStr}
          </span>
        )}
      </div>
    );
  }

  if (type === 'duration') {
    const beforeLabel = formatMeasure(before, 'duration');
    const afterLabel = formatMeasure(after, 'duration');
    const afterDuration = readDurationTokenValue(after);
    const beforeMs = tryConvertDurationTokenValueToMilliseconds(before);
    const afterMs = tryConvertDurationTokenValueToMilliseconds(after);
    const deltaMs =
      beforeMs !== null && afterMs !== null ? afterMs - beforeMs : null;
    const deltaValue =
      afterDuration && deltaMs !== null
        ? (afterDuration.unit === 's' ? deltaMs / 1000 : deltaMs)
        : null;
    const deltaStr = deltaValue !== null && deltaMs !== null && deltaMs !== 0 && afterDuration
      ? formatDelta(deltaValue, afterDuration.unit)
      : null;
    return (
      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)]">
        <span className="text-secondary text-[color:var(--color-figma-text-secondary)] shrink-0">Before</span>
        <span className="text-secondary font-mono text-[color:var(--color-figma-text-secondary)]">{beforeLabel}</span>
        <ArrowRight />
        <span className="text-secondary font-mono text-[color:var(--color-figma-text)]">{afterLabel}</span>
        {deltaStr && deltaMs !== null && (
          <span className={`ml-auto text-secondary font-mono shrink-0 ${deltaMs > 0 ? 'text-[color:var(--color-figma-success)]' : 'text-[color:var(--color-figma-error)]'}`}>
            {deltaStr}
          </span>
        )}
      </div>
    );
  }

  if (type === 'number') {
    const beforeNum = parseNumericValue(before);
    const afterNum = parseNumericValue(after);
    const delta = Math.round((afterNum - beforeNum) * 1000) / 1000;
    const deltaStr = delta !== 0 ? `${delta > 0 ? '+' : ''}${delta}` : null;
    return (
      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)]">
        <span className="text-secondary text-[color:var(--color-figma-text-secondary)] shrink-0">Before</span>
        <span className="text-secondary font-mono text-[color:var(--color-figma-text-secondary)]">{String(before ?? '')}</span>
        <ArrowRight />
        <span className="text-secondary font-mono text-[color:var(--color-figma-text)]">{String(after ?? '')}</span>
        {deltaStr && (
          <span className={`ml-auto text-secondary font-mono shrink-0 ${delta > 0 ? 'text-[color:var(--color-figma-success)]' : 'text-[color:var(--color-figma-error)]'}`}>
            {deltaStr}
          </span>
        )}
      </div>
    );
  }

  if (type === 'typography') {
    const beforeLabel = formatTypo(before);
    const afterLabel = formatTypo(after);
    const beforeFamily = getTypographyFontFamily(before);
    const afterFamily = getTypographyFontFamily(after);
    return (
      <div className="flex flex-col gap-1 px-2 py-1.5 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)]">
        <span className="text-secondary text-[color:var(--color-figma-text-secondary)]">Before → After</span>
        <div className="flex items-center gap-2 min-w-0">
          <TypoPreviewSwatch value={before} />
          <span
            className="text-body text-[color:var(--color-figma-text-secondary)] line-through truncate max-w-[40%]"
            style={{ fontFamily: beforeFamily || 'inherit' }}
            title={beforeLabel}
          >
            {beforeLabel}
          </span>
          <ArrowRight />
          <TypoPreviewSwatch value={after} />
          <span
            className="text-body text-[color:var(--color-figma-text)] truncate max-w-[40%]"
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
        <span className="text-secondary text-[color:var(--color-figma-text-secondary)] shrink-0">Before</span>
        <div className="flex items-center gap-1.5 min-w-0">
          <ShadowPreviewSwatch value={before} />
          <span className="text-secondary font-mono text-[color:var(--color-figma-text-secondary)] truncate" title={formatShadowSummary(before)}>{formatShadowSummary(before)}</span>
        </div>
        <ArrowRight />
        <div className="flex items-center gap-1.5 min-w-0">
          <ShadowPreviewSwatch value={after} />
          <span className="text-secondary font-mono text-[color:var(--color-figma-text)] truncate" title={formatShadowSummary(after)}>{formatShadowSummary(after)}</span>
        </div>
      </div>
    );
  }

  if (type === 'border') {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)]">
        <span className="text-secondary text-[color:var(--color-figma-text-secondary)] shrink-0">Before</span>
        <div className="flex items-center gap-1.5 min-w-0">
          <BorderPreviewSwatch value={before} />
          <span className="text-secondary font-mono text-[color:var(--color-figma-text-secondary)] truncate" title={formatBorderSummary(before)}>{formatBorderSummary(before)}</span>
        </div>
        <ArrowRight />
        <div className="flex items-center gap-1.5 min-w-0">
          <BorderPreviewSwatch value={after} />
          <span className="text-secondary font-mono text-[color:var(--color-figma-text)] truncate" title={formatBorderSummary(after)}>{formatBorderSummary(after)}</span>
        </div>
      </div>
    );
  }

  if (type === 'gradient') {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)]">
        <span className="text-secondary text-[color:var(--color-figma-text-secondary)] shrink-0">Before</span>
        <div className="flex items-center gap-1.5 min-w-0">
          <GradientPreviewSwatch value={before} />
          <span className="text-secondary font-mono text-[color:var(--color-figma-text-secondary)] truncate">{formatGradientSummary(before)}</span>
        </div>
        <ArrowRight />
        <div className="flex items-center gap-1.5 min-w-0">
          <GradientPreviewSwatch value={after} />
          <span className="text-secondary font-mono text-[color:var(--color-figma-text)] truncate">{formatGradientSummary(after)}</span>
        </div>
      </div>
    );
  }

  // Fallback for string, boolean, composition, etc.
  const beforeDisplay = typeof before === 'object' ? JSON.stringify(before) : String(before ?? '');
  const afterDisplay = typeof after === 'object' ? JSON.stringify(after) : String(after ?? '');
  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)]">
      <span className="text-secondary text-[color:var(--color-figma-text-secondary)] shrink-0">Before</span>
      <span className="text-secondary font-mono text-[color:var(--color-figma-text-secondary)] truncate max-w-[80px]" title={beforeDisplay}>
        {beforeDisplay}
      </span>
      <ArrowRight />
      <span className="text-secondary font-mono text-[color:var(--color-figma-text)] truncate max-w-[80px]" title={afterDisplay}>
        {afterDisplay}
      </span>
    </div>
  );
}
