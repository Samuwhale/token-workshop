import { isWideGamutColor, swatchBgColor, getSrgbFallback } from '../shared/colorUtils';

interface ValuePreviewProps {
  type?: string;
  value?: any;
  /** Swatch size in px (default 24) */
  size?: number;
}

/** Parse a DTCG dimension value (object {value,unit} or string "16px") into numeric + unit */
function parseDimension(val: any): { num: number; unit: string } {
  if (typeof val === 'object' && val !== null && 'value' in val) {
    return { num: Number(val.value) || 0, unit: val.unit || 'px' };
  }
  if (typeof val === 'string') {
    const m = val.match(/^(-?[\d.]+)\s*(.*)$/);
    if (m) return { num: parseFloat(m[1]) || 0, unit: m[2] || 'px' };
  }
  if (typeof val === 'number') return { num: val, unit: 'px' };
  return { num: 0, unit: 'px' };
}

function dimensionLabel(val: any): string {
  if (typeof val === 'object' && val !== null && 'value' in val) return `${val.value}${val.unit || 'px'}`;
  return String(val ?? '');
}

export function ValuePreview({ type, value, size = 24 }: ValuePreviewProps) {
  const sizeStyle = { width: size, height: size };

  // Unresolved alias — show warning icon
  if (typeof value === 'string' && value.startsWith('{')) {
    return (
      <div className="shrink-0 flex items-center justify-center text-[var(--color-figma-text-tertiary)]" style={sizeStyle} title={`Unresolved reference: ${value}`}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </div>
    );
  }

  // ── Color ──────────────────────────────────────────────────────────────
  if (type === 'color' && typeof value === 'string') {
    const wg = isWideGamutColor(value);
    const fallback = wg ? getSrgbFallback(value) : null;
    return (
      <div className="relative shrink-0 flex items-center gap-1">
        <div
          className="rounded border border-[var(--color-figma-border)] shrink-0"
          style={{ ...sizeStyle, backgroundColor: swatchBgColor(value) }}
          title={value + (wg ? `\nsRGB fallback: ${fallback}` : '')}
        />
        {wg && (
          <span className="px-1 py-px rounded text-[7px] font-bold leading-none bg-[var(--color-figma-warning)]/15 text-[var(--color-figma-warning)] border border-[var(--color-figma-warning)]/30 shrink-0" title={`Wide-gamut · sRGB fallback: ${fallback}`}>
            P3
          </span>
        )}
      </div>
    );
  }

  // ── Typography — "Aa" rendered in actual font/weight/scaled size ──────
  if (type === 'typography' && typeof value === 'object' && value !== null) {
    const fontFamily = value.fontFamily || 'inherit';
    const fontWeight = value.fontWeight || 400;
    const { num: rawSize } = parseDimension(value.fontSize);
    // Scale font size to fit the swatch: clamp between 8px and size-2px, proportional
    const scaledFontSize = rawSize > 0
      ? Math.max(8, Math.min(size - 2, rawSize * 0.65))
      : 10;
    const fontStyle = value.fontStyle || 'normal';
    const textDecoration = value.textDecoration || 'none';
    const sizeStr = dimensionLabel(value.fontSize);
    const lhStr = value.lineHeight ? dimensionLabel(value.lineHeight) : '';
    const titleParts = [fontFamily, sizeStr, lhStr ? `/${lhStr}` : '', `wt ${fontWeight}`];
    if (fontStyle !== 'normal') titleParts.push(fontStyle);
    return (
      <div
        className="rounded border border-[var(--color-figma-border)] shrink-0 flex items-center justify-center overflow-hidden bg-[var(--color-figma-bg)] text-[var(--color-figma-text)]"
        title={titleParts.filter(Boolean).join(' ')}
        style={{
          width: Math.round(size * 4 / 3),
          height: size,
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

  // ── Shadow — elevated card with real shadow ───────────────────────────
  if (type === 'shadow' && typeof value === 'object' && value !== null) {
    const shadows = Array.isArray(value) ? value : [value];
    const shadowParts = shadows
      .filter((s): s is Record<string, any> => s !== null && typeof s === 'object')
      .map(s => {
        const { color = '#00000040', offsetX, offsetY, blur, spread, type: sType } = s;
        const ox = dimensionLabel(offsetX) || '0px';
        const oy = dimensionLabel(offsetY) || '4px';
        const b = dimensionLabel(blur) || '8px';
        const sp = dimensionLabel(spread) || '0px';
        const inset = sType === 'innerShadow' ? 'inset ' : '';
        return `${inset}${ox} ${oy} ${b} ${sp} ${color}`;
      });
    if (shadowParts.length > 0) {
      return (
        <div
          className="shrink-0 flex items-center justify-center"
          style={sizeStyle}
          title={shadowParts.join(', ')}
        >
          <div
            className="rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)]"
            style={{
              width: Math.round(size * 0.7),
              height: Math.round(size * 0.7),
              boxShadow: shadowParts.join(', '),
            }}
          />
        </div>
      );
    }
  }

  // ── Font Family — "Aa" in that font ──────────────────────────────────
  if (type === 'fontFamily' && typeof value === 'string' && value) {
    return (
      <div
        className="rounded border border-[var(--color-figma-border)] shrink-0 flex items-center justify-center overflow-hidden bg-[var(--color-figma-bg)] text-[var(--color-figma-text)]"
        title={value}
        style={{ width: Math.round(size * 4 / 3), height: size, fontFamily: value, fontSize: '11px', lineHeight: 1 }}
      >
        Aa
      </div>
    );
  }

  // ── Font Weight — "Aa" at that weight ────────────────────────────────
  if (type === 'fontWeight') {
    const w = typeof value === 'number' ? value : parseInt(String(value)) || 400;
    return (
      <div
        className="rounded border border-[var(--color-figma-border)] shrink-0 flex items-center justify-center overflow-hidden bg-[var(--color-figma-bg)] text-[var(--color-figma-text)]"
        title={String(w)}
        style={{ width: Math.round(size * 4 / 3), height: size, fontWeight: w, fontSize: '11px', lineHeight: 1 }}
      >
        Aa
      </div>
    );
  }

  // ── Gradient — color bar ──────────────────────────────────────────────
  if (type === 'gradient') {
    let gradientCss: string | null = null;
    if (typeof value === 'string' && value.includes('gradient')) {
      gradientCss = value;
    } else if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && 'color' in value[0]) {
      const stops = (value as Array<{ color: string; position?: number }>)
        .map(s => `${s.color}${s.position != null ? ` ${Math.round(s.position * 100)}%` : ''}`)
        .join(', ');
      gradientCss = `linear-gradient(to right, ${stops})`;
    }
    if (gradientCss) {
      return (
        <div
          className="rounded border border-[var(--color-figma-border)] shrink-0"
          style={{ width: Math.round(size * 4 / 3), height: size, background: gradientCss }}
          title={gradientCss}
        />
      );
    }
  }

  // ── Dimension — horizontal proportional bar ───────────────────────────
  if (type === 'dimension') {
    const { num, unit } = parseDimension(value);
    const maxRef = unit === 'rem' || unit === 'em' ? 4 : 64;
    const pct = Math.min(Math.max(Math.abs(num) / maxRef, 0.08), 1);
    const label = dimensionLabel(value);
    return (
      <div
        className="rounded border border-[var(--color-figma-border)] shrink-0 flex items-center overflow-hidden bg-[var(--color-figma-bg)] px-px"
        style={sizeStyle}
        title={label}
      >
        <div
          className="rounded-sm h-2/3"
          style={{
            width: `${Math.round(pct * 100)}%`,
            minWidth: 2,
            backgroundColor: 'var(--color-figma-accent)',
            opacity: 0.6,
          }}
        />
      </div>
    );
  }

  // ── Duration — clock ring indicator ───────────────────────────────────
  if (type === 'duration') {
    const { num, unit } = parseDimension(value);
    const maxRef = unit === 's' ? 2 : 2000; // 2s or 2000ms
    const pct = Math.min(Math.max(num / maxRef, 0.05), 1);
    const label = dimensionLabel(value);
    // SVG arc for duration
    const r = 7;
    const cx = size / 2;
    const cy = size / 2;
    const angle = pct * 360;
    const rad = (angle - 90) * (Math.PI / 180);
    const x2 = cx + r * Math.cos(rad);
    const y2 = cy + r * Math.sin(rad);
    const largeArc = angle > 180 ? 1 : 0;
    const arcPath = angle >= 360
      ? `M${cx},${cy - r} A${r},${r} 0 1 1 ${cx - 0.01},${cy - r}` // full circle
      : `M${cx},${cy - r} A${r},${r} 0 ${largeArc} 1 ${x2},${y2}`;
    return (
      <div className="shrink-0 flex items-center justify-center" style={sizeStyle} title={label}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-figma-border)" strokeWidth="1.5" />
          <path d={arcPath} fill="none" stroke="var(--color-figma-accent)" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
        </svg>
      </div>
    );
  }

  // ── Number — filled bar (opacity-style for 0-1 range) ────────────────
  if (type === 'number') {
    const numericVal = typeof value === 'number' ? value : parseFloat(String(value)) || 0;
    const isOpacityLike = numericVal >= 0 && numericVal <= 1;
    if (isOpacityLike) {
      // Show as an opacity fill — checkerboard behind with a colored overlay
      return (
        <div
          className="rounded border border-[var(--color-figma-border)] shrink-0 overflow-hidden"
          style={{
            ...sizeStyle,
            background: 'repeating-conic-gradient(var(--color-figma-border) 0% 25%, var(--color-figma-bg) 0% 50%) 50% / 6px 6px',
          }}
          title={String(numericVal)}
        >
          <div
            className="w-full h-full"
            style={{ backgroundColor: 'var(--color-figma-text)', opacity: numericVal }}
          />
        </div>
      );
    }
    // Non-opacity numbers: bar chart
    const maxRef = 100;
    const pct = Math.min(Math.max(Math.abs(numericVal) / maxRef, 0.08), 1);
    return (
      <div
        className="rounded border border-[var(--color-figma-border)] shrink-0 flex items-center overflow-hidden bg-[var(--color-figma-bg)] px-px"
        style={sizeStyle}
        title={String(numericVal)}
      >
        <div
          className="rounded-sm h-2/3"
          style={{
            width: `${Math.round(pct * 100)}%`,
            minWidth: 2,
            backgroundColor: 'var(--color-figma-text-tertiary)',
            opacity: 0.6,
          }}
        />
      </div>
    );
  }

  // ── Border — line with color swatch ───────────────────────────────────
  if (type === 'border' && typeof value === 'object' && value !== null) {
    const { color: borderColor, width: borderWidth, style: borderStyle } = value as Record<string, any>;
    const colorStr = typeof borderColor === 'string' ? swatchBgColor(borderColor) : 'var(--color-figma-text)';
    const { num: bwNum } = parseDimension(borderWidth);
    const widthStr = dimensionLabel(borderWidth) || '1px';
    const styleStr = typeof borderStyle === 'string' ? borderStyle : 'solid';
    // Clamp border width for preview to 1-4px
    const previewWidth = Math.max(1, Math.min(bwNum || 1, 4));
    const label = `${widthStr} ${styleStr} ${typeof borderColor === 'string' ? borderColor : ''}`;
    return (
      <div
        className="rounded border border-[var(--color-figma-border)] shrink-0 flex items-center justify-center overflow-hidden bg-[var(--color-figma-bg)]"
        style={sizeStyle}
        title={label}
      >
        <div
          style={{
            width: '80%',
            borderBottom: `${previewWidth}px ${styleStr} ${colorStr}`,
          }}
        />
      </div>
    );
  }

  // ── Cubic Bezier — curve preview ──────────────────────────────────────
  if (type === 'cubicBezier' && Array.isArray(value) && value.length === 4) {
    const [x1, y1, x2, y2] = value.map(Number);
    // Draw the bezier curve in a small SVG
    const pad = 3;
    const w = size - pad * 2;
    const h = size - pad * 2;
    const sx = pad;
    const sy = pad + h;
    const ex = pad + w;
    const ey = pad;
    const cx1 = pad + x1 * w;
    const cy1 = pad + (1 - y1) * h;
    const cx2 = pad + x2 * w;
    const cy2 = pad + (1 - y2) * h;
    return (
      <div className="shrink-0" style={sizeStyle} title={`cubic-bezier(${value.join(', ')})`}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          {/* Grid line from start to end */}
          <line x1={sx} y1={sy} x2={ex} y2={ey} stroke="var(--color-figma-border)" strokeWidth="1" strokeDasharray="2 2" />
          {/* The bezier curve */}
          <path
            d={`M${sx},${sy} C${cx1},${cy1} ${cx2},${cy2} ${ex},${ey}`}
            fill="none"
            stroke="var(--color-figma-accent)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          {/* Endpoints */}
          <circle cx={sx} cy={sy} r="1.5" fill="var(--color-figma-text-tertiary)" />
          <circle cx={ex} cy={ey} r="1.5" fill="var(--color-figma-text-tertiary)" />
        </svg>
      </div>
    );
  }

  // ── Stroke Style — dashed/dotted line preview ─────────────────────────
  if (type === 'strokeStyle') {
    const style = typeof value === 'string' ? value : 'solid';
    return (
      <div
        className="rounded border border-[var(--color-figma-border)] shrink-0 flex items-center justify-center overflow-hidden bg-[var(--color-figma-bg)]"
        style={sizeStyle}
        title={style}
      >
        <div style={{ width: '80%', borderBottom: `2px ${style} var(--color-figma-text-secondary)` }} />
      </div>
    );
  }

  // ── Asset — image thumbnail ───────────────────────────────────────────
  if (type === 'asset' && typeof value === 'string' && value.length > 0) {
    return (
      <div className="rounded border border-[var(--color-figma-border)] shrink-0 overflow-hidden bg-[var(--color-figma-bg-secondary)]" style={sizeStyle}>
        <img src={value} alt="" className="w-full h-full object-cover" aria-hidden="true" />
      </div>
    );
  }

  // ── Transition / Composition — type icon ──────────────────────────────
  if (type === 'transition' && typeof value === 'object' && value !== null) {
    return (
      <div
        className="rounded border border-[var(--color-figma-border)] shrink-0 flex items-center justify-center overflow-hidden bg-[var(--color-figma-bg)] text-[var(--color-figma-text-tertiary)]"
        style={sizeStyle}
        title="Transition"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </div>
    );
  }

  if (type === 'composition' && typeof value === 'object' && value !== null) {
    return (
      <div
        className="rounded border border-[var(--color-figma-border)] shrink-0 flex items-center justify-center overflow-hidden bg-[var(--color-figma-bg)] text-[var(--color-figma-text-tertiary)]"
        style={sizeStyle}
        title="Composition"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
        </svg>
      </div>
    );
  }

  // ── Boolean — check/x icon ────────────────────────────────────────────
  if (type === 'boolean') {
    const boolVal = value === true || value === 'true';
    return (
      <div
        className={`rounded border border-[var(--color-figma-border)] shrink-0 flex items-center justify-center overflow-hidden ${boolVal ? 'bg-emerald-500/15 text-emerald-600' : 'bg-[var(--color-figma-bg)] text-[var(--color-figma-text-tertiary)]'}`}
        style={sizeStyle}
        title={String(boolVal)}
      >
        {boolVal ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        )}
      </div>
    );
  }

  // ── String — quote icon ───────────────────────────────────────────────
  if (type === 'string' && typeof value === 'string') {
    return (
      <div
        className="rounded border border-[var(--color-figma-border)] shrink-0 flex items-center justify-center overflow-hidden bg-[var(--color-figma-bg)] text-[var(--color-figma-text-tertiary)]"
        style={sizeStyle}
        title={value}
      >
        <span style={{ fontSize: Math.round(size * 0.55), lineHeight: 1, fontWeight: 600 }}>&ldquo;&rdquo;</span>
      </div>
    );
  }

  // ── Percentage — circular progress ring ───────────────────────────────
  if (type === 'percentage') {
    const numVal = typeof value === 'number' ? value : parseFloat(String(value)) || 0;
    const pct = Math.min(Math.max(numVal / 100, 0), 1);
    const r = 7;
    const cx = size / 2;
    const cy = size / 2;
    const circumference = 2 * Math.PI * r;
    const dashOffset = circumference * (1 - pct);
    return (
      <div className="shrink-0 flex items-center justify-center" style={sizeStyle} title={`${numVal}%`}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-figma-border)" strokeWidth="1.5" />
          <circle
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke="var(--color-figma-accent)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            opacity="0.7"
          />
        </svg>
      </div>
    );
  }

  // ── Fallback — empty spacer ───────────────────────────────────────────
  return <div className="shrink-0" style={sizeStyle} />;
}
