import { swatchBgColor } from '../shared/colorUtils';
import {
  buildBoxShadowCss,
  buildGradientCss,
  formatDimensionCss,
  formatDurationCss,
  getTypographyFontFamily,
} from '../shared/compositeTokenUtils';

const COMPLEX_PREVIEW_TYPES = new Set(['typography', 'shadow', 'gradient', 'border', 'cubicBezier', 'transition', 'composition']);
export { COMPLEX_PREVIEW_TYPES };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function TypographyPreview({ value }: { value: Record<string, unknown> }) {
  const fontFamily = getTypographyFontFamily(value) || 'inherit';
  const fontWeight = typeof value.fontWeight === 'number' || typeof value.fontWeight === 'string'
    ? value.fontWeight
    : 400;
  const fontSize = formatDimensionCss(value.fontSize, '16px');
  const lineHeight = value.lineHeight
    ? (typeof value.lineHeight === 'number' && value.lineHeight <= 4
        ? String(value.lineHeight)
        : formatDimensionCss(value.lineHeight, 'normal'))
    : 'normal';
  const letterSpacing = value.letterSpacing ? formatDimensionCss(value.letterSpacing, 'normal') : 'normal';

  const props = [fontFamily, `${fontSize}/${lineHeight}`, `wt ${fontWeight}`];
  if (typeof value.fontStyle === 'string') props.push(value.fontStyle);

  return (
    <div>
      <div
        className="text-[var(--color-figma-text)] overflow-hidden mb-1"
        style={{
          fontFamily,
          fontWeight,
          fontSize,
          lineHeight,
          letterSpacing,
          fontStyle: typeof value.fontStyle === 'string' ? value.fontStyle : 'normal',
          textDecoration: typeof value.textDecoration === 'string' ? value.textDecoration : 'none',
          textTransform: typeof value.textTransform === 'string' ? value.textTransform : 'none',
          maxHeight: '3.5em',
        }}
      >
        The quick brown fox jumps over the lazy dog
      </div>
      <div className="text-secondary text-[var(--color-figma-text-tertiary)] truncate">
        {props.join(' · ')}
      </div>
    </div>
  );
}

function ShadowPreview({ value }: { value: unknown }) {
  const css = buildBoxShadowCss(value);
  if (!css) return null;
  return (
    <div className="flex items-center justify-center py-2">
      <div
        className="w-24 h-14 rounded-lg bg-[var(--color-figma-bg)]"
        style={{ boxShadow: css }}
      />
    </div>
  );
}

function GradientPreview({ value }: { value: unknown }) {
  const css = buildGradientCss(value);
  if (!css) return null;
  return (
    <div
      className="w-full h-8 rounded-md border border-[var(--color-figma-border)]"
      style={{ background: css }}
    />
  );
}

function CubicBezierPreview({ value }: { value: number[] }) {
  const [x1, y1, x2, y2] = value.map(Number);
  const w = 200;
  const h = 120;
  const pad = 16;
  const gw = w - pad * 2;
  const gh = h - pad * 2;
  const sx = pad;
  const sy = pad + gh;
  const ex = pad + gw;
  const ey = pad;
  const cx1 = pad + x1 * gw;
  const cy1 = pad + (1 - y1) * gh;
  const cx2 = pad + x2 * gw;
  const cy2 = pad + (1 - y2) * gh;

  return (
    <div>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
        {/* Grid */}
        <rect x={pad} y={pad} width={gw} height={gh} fill="none" stroke="var(--color-figma-border)" strokeWidth="1" strokeDasharray="4 4" />
        {/* Diagonal reference */}
        <line x1={sx} y1={sy} x2={ex} y2={ey} stroke="var(--color-figma-border)" strokeWidth="1" />
        {/* Control point lines */}
        <line x1={sx} y1={sy} x2={cx1} y2={cy1} stroke="var(--color-figma-text-tertiary)" strokeWidth="1" strokeDasharray="3 3" />
        <line x1={ex} y1={ey} x2={cx2} y2={cy2} stroke="var(--color-figma-text-tertiary)" strokeWidth="1" strokeDasharray="3 3" />
        {/* The bezier curve */}
        <path
          d={`M${sx},${sy} C${cx1},${cy1} ${cx2},${cy2} ${ex},${ey}`}
          fill="none"
          stroke="var(--color-figma-accent)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        {/* Control points */}
        <circle cx={cx1} cy={cy1} r="3" fill="var(--color-figma-accent)" opacity="0.6" />
        <circle cx={cx2} cy={cy2} r="3" fill="var(--color-figma-accent)" opacity="0.6" />
        {/* Endpoints */}
        <circle cx={sx} cy={sy} r="3" fill="var(--color-figma-text-secondary)" />
        <circle cx={ex} cy={ey} r="3" fill="var(--color-figma-text-secondary)" />
      </svg>
      <div className="text-secondary text-[var(--color-figma-text-tertiary)] mt-0.5">
        cubic-bezier({value.join(', ')})
      </div>
    </div>
  );
}

function TransitionPreview({ value }: { value: Record<string, unknown> }) {
  const dur = value.duration ? formatDurationCss(value.duration, '300ms') : '300ms';
  const delay = value.delay ? formatDurationCss(value.delay, '0ms') : '0ms';
  const easing = Array.isArray(value.timingFunction)
    ? `cubic-bezier(${value.timingFunction.join(', ')})`
    : typeof value.timingFunction === 'string' ? value.timingFunction : 'ease';
  return (
    <div className="text-secondary text-[var(--color-figma-text-secondary)] space-y-1">
      <div className="flex items-center gap-2">
        <span className="text-[var(--color-figma-text-tertiary)]">Duration</span>
        <span className="text-[var(--color-figma-text)]">{dur}</span>
      </div>
      {delay !== '0ms' && delay !== '0s' && (
        <div className="flex items-center gap-2">
          <span className="text-[var(--color-figma-text-tertiary)]">Delay</span>
          <span className="text-[var(--color-figma-text)]">{delay}</span>
        </div>
      )}
      <div className="flex items-center gap-2">
        <span className="text-[var(--color-figma-text-tertiary)]">Easing</span>
        <span className="text-[var(--color-figma-text)]">{easing}</span>
      </div>
      {Array.isArray(value.timingFunction) && value.timingFunction.length === 4 && (
        <CubicBezierPreview value={value.timingFunction} />
      )}
    </div>
  );
}

function CompositionPreview({ value }: { value: Record<string, unknown> }) {
  const entries = Object.entries(value).filter(([k]) => !k.startsWith('$'));
  return (
    <div className="text-secondary space-y-0.5">
      {entries.map(([key, val]) => (
        <div key={key} className="flex items-center gap-2">
          <span
            className="text-[var(--color-figma-text-tertiary)] truncate max-w-[80px]"
            title={key}
          >
            {key}
          </span>
          <span
            className="text-[var(--color-figma-text)] truncate"
            title={typeof val === 'object' ? JSON.stringify(val) : String(val)}
          >
            {typeof val === 'object' ? JSON.stringify(val) : String(val)}
          </span>
        </div>
      ))}
    </div>
  );
}

function BorderPreview({ value }: { value: Record<string, unknown> }) {
  const colorStr = typeof value.color === 'string' ? swatchBgColor(value.color) : 'var(--color-figma-text)';
  const widthStr = formatDimensionCss(value.width, '1px');
  const styleStr = typeof value.style === 'string' ? value.style : 'solid';
  const border = `${widthStr} ${styleStr} ${colorStr}`;

  return (
    <div className="flex items-center gap-3">
      <div
        className="w-20 h-14 rounded-lg bg-[var(--color-figma-bg)]"
        style={{ border }}
      />
      <div className="text-secondary text-[var(--color-figma-text-tertiary)]">
        {widthStr} {styleStr}
        {typeof value.color === 'string' && (
          <div className="flex items-center gap-1 mt-0.5">
            <div className="w-2.5 h-2.5 rounded-sm border border-[var(--color-figma-border)]" style={{ backgroundColor: swatchBgColor(value.color) }} />
            <span>{value.color}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function ComplexTypePreviewCard({ type, value }: { type: string; value: unknown }) {
  if (!isRecord(value)) {
    // Gradient can be a CSS string
    if (type === 'gradient' && typeof value === 'string') {
      return (
        <div className="absolute left-4 right-4 bottom-full z-30 pointer-events-none" style={{ marginBottom: 2 }}>
          <div className="rounded-lg shadow-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] p-2.5 max-w-[280px]">
            <GradientPreview value={value} />
          </div>
        </div>
      );
    }
    return null;
  }

  let content: React.ReactNode = null;
  if (type === 'typography') content = <TypographyPreview value={value} />;
  else if (type === 'shadow') content = <ShadowPreview value={value} />;
  else if (type === 'gradient') content = <GradientPreview value={value} />;
  else if (type === 'border') content = <BorderPreview value={value} />;
  else if (type === 'cubicBezier' && Array.isArray(value) && value.length === 4) content = <CubicBezierPreview value={value} />;
  else if (type === 'transition') content = <TransitionPreview value={value} />;
  else if (type === 'composition') content = <CompositionPreview value={value} />;

  if (!content) return null;

  return (
    <div className="absolute left-4 right-4 bottom-full z-30 pointer-events-none" style={{ marginBottom: 2 }}>
      <div className="rounded-lg shadow-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] p-2.5 max-w-[280px]">
        {content}
      </div>
    </div>
  );
}
