import { isWideGamutColor, swatchBgColor, getSrgbFallback } from '../shared/colorUtils';
import {
  buildGradientCss,
  formatBorderSummary,
  formatShadowSummary,
  getTypographyFontFamily,
} from '../shared/compositeTokenUtils';
import {
  formatUnitTokenValue,
  readDimensionTokenValue,
  readDurationTokenValue,
} from '../shared/tokenValueParsing';

/**
 * Inline type-aware preview glyph for a single token value.
 *
 * Two visual categories — kept consistent so rows line up:
 *
 *   Canvas previews   — boxed (rounded + border + bg) because the content needs a
 *                       surface to read against. Width is `size × 4/3` (wide) for
 *                       text- and gradient-like canvases, or `size × size` (square)
 *                       for color, shadow inset, and asset thumbnails.
 *                       Types: color, typography, fontFamily, fontWeight, gradient,
 *                               border, shadow, asset.
 *
 *   Indicator previews — unboxed (no border/bg), always `size × size` square.
 *                       The shape itself (bar, ring, curve, glyph) carries the
 *                       meaning; an outer box would just add chrome.
 *                       Types: dimension, number, duration, percentage, cubicBezier,
 *                               strokeStyle, boolean, string, composition, fallback.
 *
 *   The single exception is `transition`, which is a wide indicator: its bezier
 *   curve needs horizontal room to read as a timeline.
 *
 *  The `size` prop is the preview height. All SVG radii, paddings and child
 *  element sizes scale off it so the preview works at 12px (resolution chain),
 *  16px (token row cells) and 24px+ (inspectors).
 */
interface ValuePreviewProps {
  type?: string;
  value?: any;
  /** Preview height in px. Default 24 (inspector/panel size); token row cells pass 16. */
  size?: number;
}

const WIDE_RATIO = 4 / 3;
const BOX_CLS = 'rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]';

/**
 * Types whose preview encodes the value itself (color swatch, typography in
 * the real font, dimension bar scaled to value, etc.) and is therefore worth
 * repeating per mode. Types not in this set render a glyph that doesn't vary
 * across modes — callers should show a single row-level indicator instead.
 */
const VALUE_BEARING_PREVIEW_TYPES = new Set([
  'color', 'typography', 'fontFamily', 'fontWeight', 'shadow', 'gradient',
  'border', 'asset', 'dimension', 'number', 'duration', 'percentage',
  'cubicBezier', 'transition', 'boolean', 'strokeStyle',
]);

export function previewIsValueBearing(type?: string): boolean {
  return !!type && VALUE_BEARING_PREVIEW_TYPES.has(type);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function dimensionLabel(val: any): string {
  if (val === null || val === undefined) {
    return '';
  }
  return formatUnitTokenValue(val, { type: 'dimension' });
}

function durationLabel(val: any): string {
  if (val === null || val === undefined) {
    return '';
  }
  return formatUnitTokenValue(val, { type: 'duration' });
}

/** sqrt-scale so 8/16/32/64/128/256px each produce a visibly distinct bar width. */
function dimensionBarPct(num: number, unit: string): number {
  const abs = Math.abs(num);
  const px = unit === 'rem' || unit === 'em' ? abs * 16 : abs;
  // sqrt(px)/16: 16→0.25, 64→0.5, 144→0.75, 256→1.0
  const scaled = Math.sqrt(Math.min(px, 256)) / 16;
  return Math.max(0.08, Math.min(scaled, 1));
}

function InvalidMeasurePreview({
  size,
  title,
}: {
  size: number;
  title: string;
}) {
  const glyph = Math.max(8, Math.round(size * 0.6));
  return (
    <div
      className="shrink-0 flex items-center justify-center text-[var(--color-figma-text-tertiary)]"
      style={{ width: size, height: size }}
      title={title}
    >
      <svg
        width={glyph}
        height={glyph}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M6 12h12" />
        <path d="M9 8l-3 4 3 4" />
        <path d="M15 8l3 4-3 4" />
      </svg>
    </div>
  );
}

// ── Component ───────────────────────────────────────────────────────────────

export function ValuePreview({ type, value, size = 24 }: ValuePreviewProps) {
  const squareStyle = { width: size, height: size };
  const wideStyle = { width: Math.round(size * WIDE_RATIO), height: size };

  // Broken/unresolved alias — warning glyph (applies regardless of $type).
  if (typeof value === 'string' && value.startsWith('{')) {
    const glyph = Math.round(size * 0.75);
    return (
      <div
        className="shrink-0 flex items-center justify-center text-[var(--color-figma-warning)]"
        style={squareStyle}
        title={`Unresolved reference: ${value}`}
      >
        <svg width={glyph} height={glyph} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </div>
    );
  }

  // ── Color (canvas, square) ────────────────────────────────────────────────
  if (type === 'color' && typeof value === 'string') {
    const wg = isWideGamutColor(value);
    const fallback = wg ? getSrgbFallback(value) : null;
    return (
      <div className="relative shrink-0 flex items-center gap-1">
        <div
          className={`${BOX_CLS} shrink-0`}
          style={{ ...squareStyle, backgroundColor: swatchBgColor(value) }}
          title={value + (wg ? `\nsRGB fallback: ${fallback}` : '')}
        />
        {wg && (
          <span className="px-1 py-px rounded text-[var(--font-size-xs)] font-bold leading-none bg-[var(--color-figma-warning)]/15 text-[var(--color-figma-warning)] border border-[var(--color-figma-warning)]/30 shrink-0" title={`Wide-gamut · sRGB fallback: ${fallback}`}>
            P3
          </span>
        )}
      </div>
    );
  }

  // ── Typography (canvas, wide) ─────────────────────────────────────────────
  if (type === 'typography' && typeof value === 'object' && value !== null) {
    // DTCG allows fontFamily to be either a string or an array of fallbacks.
    const fontFamily = getTypographyFontFamily(value) || 'inherit';
    const fontWeight = value.fontWeight || 400;
    const fontSize = readDimensionTokenValue(value.fontSize);
    const rawSize = fontSize?.value ?? 0;
    // log-ish scale so 8/16/24/48 render visibly different while fitting the box
    const scaledFontSize = rawSize > 0
      ? Math.min(size - 2, Math.max(8, Math.round(7 + Math.log2(Math.max(rawSize, 1)) * 1.3)))
      : Math.max(8, size - 4);
    const fontStyle = value.fontStyle || 'normal';
    const textDecoration = value.textDecoration || 'none';
    const sizeStr = dimensionLabel(value.fontSize);
    const lhStr = value.lineHeight ? dimensionLabel(value.lineHeight) : '';
    const titleParts = [fontFamily, sizeStr, lhStr ? `/${lhStr}` : '', `wt ${fontWeight}`];
    if (fontStyle !== 'normal') titleParts.push(fontStyle);
    return (
      <div
        className={`${BOX_CLS} shrink-0 flex items-center justify-center overflow-hidden text-[var(--color-figma-text)]`}
        title={titleParts.filter(Boolean).join(' ')}
        style={{
          ...wideStyle,
          fontFamily,
          fontWeight,
          fontSize: `${scaledFontSize}px`,
          fontStyle,
          textDecoration,
          lineHeight: 1,
        }}
      >
        Aa
      </div>
    );
  }

  // ── Shadow (canvas, square) — offsets/blur/spread scaled to fit preview ──
  if (type === 'shadow' && typeof value === 'object' && value !== null) {
    const shadows = Array.isArray(value) ? value : [value];
    const objs = shadows.filter((s): s is Record<string, any> => s !== null && typeof s === 'object');
    if (objs.length > 0) {
      // Scale so the largest magnitude fits within ~40% of the preview height
      const magnitudes: number[] = [];
      for (const s of objs) {
        for (const key of ['offsetX', 'offsetY', 'blur', 'spread']) {
          magnitudes.push(Math.abs(readDimensionTokenValue(s[key])?.value ?? 0));
        }
      }
      const maxMag = Math.max(1, ...magnitudes);
      const scale = (size * 0.4) / maxMag;

      const scaledCss = objs.map(s => {
        const ox = (readDimensionTokenValue(s.offsetX)?.value ?? 0) * scale;
        const oy = (readDimensionTokenValue(s.offsetY)?.value ?? 0) * scale;
        const blur = Math.max(0, (readDimensionTokenValue(s.blur)?.value ?? 0) * scale);
        const spread = (readDimensionTokenValue(s.spread)?.value ?? 0) * scale;
        const color = typeof s.color === 'string' ? s.color : '#00000040';
        const inset = s.type === 'innerShadow' ? 'inset ' : '';
        return `${inset}${ox.toFixed(2)}px ${oy.toFixed(2)}px ${blur.toFixed(2)}px ${spread.toFixed(2)}px ${color}`;
      });

      const realTitle = objs.map(s => {
        const ox = dimensionLabel(s.offsetX) || '0px';
        const oy = dimensionLabel(s.offsetY) || '0px';
        const b = dimensionLabel(s.blur) || '0px';
        const sp = dimensionLabel(s.spread) || '0px';
        const color = typeof s.color === 'string' ? s.color : '';
        const inset = s.type === 'innerShadow' ? 'inset ' : '';
        return `${inset}${ox} ${oy} ${b} ${sp} ${color}`.trim();
      }).join(', ');

      return (
        <div
          className="shrink-0 flex items-center justify-center"
          style={squareStyle}
          title={formatShadowSummary(value) || realTitle}
        >
          <div
            className={BOX_CLS}
            style={{
              width: Math.round(size * 0.55),
              height: Math.round(size * 0.55),
              boxShadow: scaledCss.join(', '),
            }}
          />
        </div>
      );
    }
  }

  // ── Font Family (canvas, wide) ────────────────────────────────────────────
  if (type === 'fontFamily') {
    const fam = Array.isArray(value)
      ? value.map(f => String(f)).join(', ')
      : typeof value === 'string' ? value : '';
    if (fam) {
      return (
        <div
          className={`${BOX_CLS} shrink-0 flex items-center justify-center overflow-hidden text-[var(--color-figma-text)]`}
          title={fam}
          style={{ ...wideStyle, fontFamily: fam, fontSize: '11px', lineHeight: 1 }}
        >
          Aa
        </div>
      );
    }
  }

  // ── Font Weight (canvas, wide) ────────────────────────────────────────────
  if (type === 'fontWeight') {
    const w = typeof value === 'number' ? value : parseInt(String(value), 10) || 400;
    return (
      <div
        className={`${BOX_CLS} shrink-0 flex items-center justify-center overflow-hidden text-[var(--color-figma-text)]`}
        title={String(w)}
        style={{ ...wideStyle, fontWeight: w, fontSize: '11px', lineHeight: 1 }}
      >
        Aa
      </div>
    );
  }

  // ── Gradient (canvas, wide) — honors `type` and sorts stops ──────────────
  if (type === 'gradient') {
    const gradientCss = buildGradientCss(value);
    if (gradientCss) {
      return (
        <div
          className={`${BOX_CLS} shrink-0`}
          style={{ ...wideStyle, background: gradientCss }}
          title={gradientCss}
        />
      );
    }
  }

  // ── Dimension (indicator, unboxed bar, sqrt scale) ───────────────────────
  if (type === 'dimension') {
    const parsed = readDimensionTokenValue(value);
    if (!parsed) {
      return (
        <InvalidMeasurePreview
          size={size}
          title={dimensionLabel(value) || String(value ?? '')}
        />
      );
    }
    const { value: num, unit } = parsed;
    const pct = dimensionBarPct(num, unit);
    return (
      <div className="shrink-0 flex items-center" style={squareStyle} title={dimensionLabel(value)}>
        <div
          className="rounded-sm"
          style={{
            width: `${Math.round(pct * 100)}%`,
            height: Math.max(2, Math.round(size * 0.4)),
            minWidth: 2,
            backgroundColor: 'var(--color-figma-accent)',
            opacity: 0.55,
          }}
        />
      </div>
    );
  }

  // ── Duration (indicator, unboxed ring scales with size) ──────────────────
  if (type === 'duration') {
    const parsed = readDurationTokenValue(value);
    if (!parsed) {
      return (
        <InvalidMeasurePreview
          size={size}
          title={durationLabel(value) || String(value ?? '')}
        />
      );
    }
    const { value: num, unit } = parsed;
    const maxRef = unit === 's' ? 2 : 2000;
    const pct = Math.min(Math.max(num / maxRef, 0.05), 1);
    const r = Math.max(3, (size - 4) / 2);
    const cx = size / 2;
    const cy = size / 2;
    const angle = pct * 360;
    const rad = (angle - 90) * (Math.PI / 180);
    const x2 = cx + r * Math.cos(rad);
    const y2 = cy + r * Math.sin(rad);
    const largeArc = angle > 180 ? 1 : 0;
    const arcPath = angle >= 360
      ? `M${cx},${cy - r} A${r},${r} 0 1 1 ${cx - 0.01},${cy - r}`
      : `M${cx},${cy - r} A${r},${r} 0 ${largeArc} 1 ${x2},${y2}`;
    return (
      <div className="shrink-0" style={squareStyle} title={durationLabel(value)}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-figma-border)" strokeWidth="1.25" />
          <path d={arcPath} fill="none" stroke="var(--color-figma-accent)" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  // ── Number (indicator, unboxed bar — no opacity heuristic) ───────────────
  if (type === 'number') {
    const numericVal = typeof value === 'number' ? value : parseFloat(String(value)) || 0;
    // sqrt(|n|)/2 — 0.25→0.25, 1→0.5, 4→1, 16→1(clamp). Covers both fractional
    // (ratios, multipliers) and integer (counts, z-index) ranges visibly.
    const pct = Math.max(0.08, Math.min(Math.sqrt(Math.abs(numericVal)) / 2, 1));
    return (
      <div className="shrink-0 flex items-center" style={squareStyle} title={String(numericVal)}>
        <div
          className="rounded-sm"
          style={{
            width: `${Math.round(pct * 100)}%`,
            height: Math.max(2, Math.round(size * 0.4)),
            minWidth: 2,
            backgroundColor: 'var(--color-figma-text-tertiary)',
            opacity: 0.55,
          }}
        />
      </div>
    );
  }

  // ── Border (canvas, wide) — line drawn in real color/style/width ─────────
  if (type === 'border' && typeof value === 'object' && value !== null) {
    const { color: borderColor, width: borderWidth, style: borderStyle } = value as Record<string, any>;
    const colorStr = typeof borderColor === 'string' ? swatchBgColor(borderColor) : 'var(--color-figma-text)';
    const parsedWidth = readDimensionTokenValue(borderWidth);
    const bwNum =
      parsedWidth?.value ??
      (typeof borderWidth === 'number' ? borderWidth : Number.parseFloat(String(borderWidth)));
    const widthStr = dimensionLabel(borderWidth) || '1px';
    const styleStr = typeof borderStyle === 'string' ? borderStyle : 'solid';
    const previewWidth = Math.max(1, Math.min(bwNum || 1, 4));
    const label = `${widthStr} ${styleStr} ${typeof borderColor === 'string' ? borderColor : ''}`.trim();
    return (
      <div
        className={`${BOX_CLS} shrink-0 flex items-center justify-center overflow-hidden`}
        style={wideStyle}
        title={formatBorderSummary(value) || label}
      >
        <div style={{ width: '80%', borderBottom: `${previewWidth}px ${styleStr} ${colorStr}` }} />
      </div>
    );
  }

  // ── Cubic Bezier (indicator, unboxed curve) ──────────────────────────────
  if (type === 'cubicBezier' && Array.isArray(value) && value.length === 4) {
    const [x1, y1, x2, y2] = value.map(Number);
    return (
      <div className="shrink-0" style={squareStyle} title={`cubic-bezier(${value.join(', ')})`}>
        {renderBezierCurve(size, size, x1, y1, x2, y2)}
      </div>
    );
  }

  // ── Stroke Style (indicator, unboxed dashes) ─────────────────────────────
  if (type === 'strokeStyle') {
    const style = typeof value === 'string' ? value : 'solid';
    return (
      <div
        className="shrink-0 flex items-center justify-center"
        style={squareStyle}
        title={style}
      >
        <div style={{ width: '85%', borderBottom: `2px ${style} var(--color-figma-text-secondary)` }} />
      </div>
    );
  }

  // ── Asset (canvas, square) ────────────────────────────────────────────────
  if (type === 'asset' && typeof value === 'string' && value.length > 0) {
    return (
      <div className={`${BOX_CLS} shrink-0 overflow-hidden bg-[var(--color-figma-bg-secondary)]`} style={squareStyle}>
        <img src={value} alt="" className="w-full h-full object-cover" aria-hidden="true" />
      </div>
    );
  }

  // ── Transition (wide indicator) — bezier shape + duration/delay in title ─
  if (type === 'transition' && typeof value === 'object' && value !== null) {
    const v = value as { duration?: any; delay?: any; timingFunction?: number[] };
    const tf = Array.isArray(v.timingFunction) && v.timingFunction.length === 4
      ? v.timingFunction.map(Number)
      : [0.25, 0.1, 0.25, 1];
    const durLabel = v.duration ? durationLabel(v.duration) : '';
    const delayLabel = v.delay ? durationLabel(v.delay) : '';
    const title = [
      durLabel || 'no duration',
      delayLabel && delayLabel !== '0ms' ? `delay ${delayLabel}` : '',
      `bezier(${tf.join(', ')})`,
    ].filter(Boolean).join(' · ');
    const w = Math.round(size * WIDE_RATIO);
    return (
      <div className="shrink-0" style={wideStyle} title={title}>
        {renderBezierCurve(w, size, tf[0], tf[1], tf[2], tf[3])}
      </div>
    );
  }

  // ── Composition (indicator, unboxed {n} glyph) ───────────────────────────
  if (type === 'composition' && typeof value === 'object' && value !== null) {
    const count = Object.keys(value).filter(k => !k.startsWith('$')).length;
    return (
      <div
        className="shrink-0 flex items-center justify-center text-[var(--color-figma-text-secondary)] font-mono"
        style={squareStyle}
        title={`${count} propert${count === 1 ? 'y' : 'ies'}`}
      >
        <span style={{ fontSize: Math.round(size * 0.62), lineHeight: 1, fontWeight: 500 }}>
          {'{'}{count}{'}'}
        </span>
      </div>
    );
  }

  // ── Boolean (indicator, unboxed check/x) ─────────────────────────────────
  if (type === 'boolean') {
    const boolVal = value === true || value === 'true';
    const glyph = Math.round(size * 0.8);
    return (
      <div
        className={`shrink-0 flex items-center justify-center ${boolVal ? 'text-[var(--color-figma-success)]' : 'text-[var(--color-figma-text-tertiary)]'}`}
        style={squareStyle}
        title={String(boolVal)}
      >
        <svg width={glyph} height={glyph} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {boolVal
            ? <path d="M20 6L9 17l-5-5" />
            : <path d="M18 6L6 18M6 6l12 12" />}
        </svg>
      </div>
    );
  }

  // ── String (indicator, unboxed quote glyph) ──────────────────────────────
  if (type === 'string' && typeof value === 'string') {
    return (
      <div
        className="shrink-0 flex items-center justify-center text-[var(--color-figma-text-tertiary)]"
        style={squareStyle}
        title={value}
      >
        <span style={{ fontSize: Math.round(size * 0.9), lineHeight: 1, fontWeight: 600, letterSpacing: 0 }}>
          &ldquo;&rdquo;
        </span>
      </div>
    );
  }

  // ── Percentage (indicator, unboxed ring scales with size) ────────────────
  if (type === 'percentage') {
    const numVal = typeof value === 'number' ? value : parseFloat(String(value)) || 0;
    const pct = Math.min(Math.max(numVal / 100, 0), 1);
    const r = Math.max(3, (size - 4) / 2);
    const cx = size / 2;
    const cy = size / 2;
    const circumference = 2 * Math.PI * r;
    const dashOffset = circumference * (1 - pct);
    return (
      <div className="shrink-0" style={squareStyle} title={`${numVal}%`}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-figma-border)" strokeWidth="1.25" />
          <circle
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke="var(--color-figma-accent)"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        </svg>
      </div>
    );
  }

  // ── Fallback — surface the $type name so unknown tokens aren't invisible ─
  if (type) {
    const label = type.length <= 4 ? type : type.slice(0, 3);
    return (
      <div
        className="shrink-0 flex items-center justify-center text-[var(--color-figma-text-tertiary)] font-mono"
        style={squareStyle}
        title={`Unknown type: ${type}`}
      >
        <span style={{ fontSize: Math.round(size * 0.45), lineHeight: 1 }}>{label}</span>
      </div>
    );
  }

  return <div className="shrink-0" style={squareStyle} />;
}

// ── Internal SVG helpers ────────────────────────────────────────────────────

function renderBezierCurve(width: number, height: number, x1: number, y1: number, x2: number, y2: number) {
  const pad = 2;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const sx = pad;
  const sy = pad + h;
  const ex = pad + w;
  const ey = pad;
  const cx1 = pad + x1 * w;
  const cy1 = pad + (1 - y1) * h;
  const cx2 = pad + x2 * w;
  const cy2 = pad + (1 - y2) * h;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <line x1={sx} y1={sy} x2={ex} y2={ey} stroke="var(--color-figma-border)" strokeWidth="1" strokeDasharray="2 2" />
      <path
        d={`M${sx},${sy} C${cx1},${cy1} ${cx2},${cy2} ${ex},${ey}`}
        fill="none"
        stroke="var(--color-figma-accent)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
