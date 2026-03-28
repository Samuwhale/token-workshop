import { swatchBgColor } from '../shared/colorUtils';

const COMPLEX_PREVIEW_TYPES = new Set(['typography', 'shadow', 'gradient', 'border']);
export { COMPLEX_PREVIEW_TYPES };

function dimensionToCss(val: any, fallback: string): string {
  if (typeof val === 'object' && val !== null && 'value' in val) {
    return `${val.value}${val.unit || 'px'}`;
  }
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return `${val}px`;
  return fallback;
}

function buildBoxShadowCss(value: any): string | null {
  const shadows = Array.isArray(value) ? value : [value];
  const parts = shadows
    .filter((s): s is Record<string, any> => s !== null && typeof s === 'object')
    .map(s => {
      const { color = '#00000040', offsetX, offsetY, blur, spread, type } = s;
      const ox = dimensionToCss(offsetX, '0px');
      const oy = dimensionToCss(offsetY, '4px');
      const b = dimensionToCss(blur, '8px');
      const sp = dimensionToCss(spread, '0px');
      const inset = type === 'innerShadow' ? 'inset ' : '';
      return `${inset}${ox} ${oy} ${b} ${sp} ${color}`;
    });
  return parts.length > 0 ? parts.join(', ') : null;
}

function buildGradientCss(value: any): string | null {
  if (typeof value === 'string' && value.includes('gradient')) return value;
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && 'color' in value[0]) {
    const stops = (value as Array<{ color: string; position?: number }>)
      .map(s => `${s.color}${s.position != null ? ` ${Math.round(s.position * 100)}%` : ''}`)
      .join(', ');
    return `linear-gradient(to right, ${stops})`;
  }
  return null;
}

function TypographyPreview({ value }: { value: Record<string, any> }) {
  const fontFamily = value.fontFamily || 'inherit';
  const fontWeight = value.fontWeight || 400;
  const fontSize = dimensionToCss(value.fontSize, '16px');
  const lineHeight = value.lineHeight
    ? (typeof value.lineHeight === 'number' && value.lineHeight <= 4
        ? String(value.lineHeight)
        : dimensionToCss(value.lineHeight, 'normal'))
    : 'normal';
  const letterSpacing = value.letterSpacing ? dimensionToCss(value.letterSpacing, 'normal') : 'normal';

  const props = [fontFamily, `${fontSize}/${lineHeight}`, `wt ${fontWeight}`];
  if (value.fontStyle) props.push(value.fontStyle);

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
          fontStyle: value.fontStyle || 'normal',
          textDecoration: value.textDecoration || 'none',
          textTransform: value.textTransform || 'none',
          maxHeight: '3.5em',
        }}
      >
        The quick brown fox jumps over the lazy dog
      </div>
      <div className="text-[9px] text-[var(--color-figma-text-tertiary)] truncate">
        {props.join(' · ')}
      </div>
    </div>
  );
}

function ShadowPreview({ value }: { value: any }) {
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

function GradientPreview({ value }: { value: any }) {
  const css = buildGradientCss(value);
  if (!css) return null;
  return (
    <div
      className="w-full h-8 rounded-md border border-[var(--color-figma-border)]"
      style={{ background: css }}
    />
  );
}

function BorderPreview({ value }: { value: Record<string, any> }) {
  const colorStr = typeof value.color === 'string' ? swatchBgColor(value.color) : 'var(--color-figma-text)';
  const widthStr = dimensionToCss(value.width, '1px');
  const styleStr = typeof value.style === 'string' ? value.style : 'solid';
  const border = `${widthStr} ${styleStr} ${colorStr}`;

  return (
    <div className="flex items-center gap-3">
      <div
        className="w-20 h-14 rounded-lg bg-[var(--color-figma-bg)]"
        style={{ border }}
      />
      <div className="text-[9px] text-[var(--color-figma-text-tertiary)]">
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

export function ComplexTypePreviewCard({ type, value }: { type: string; value: any }) {
  if (typeof value !== 'object' || value === null) {
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

  if (!content) return null;

  return (
    <div className="absolute left-4 right-4 bottom-full z-30 pointer-events-none" style={{ marginBottom: 2 }}>
      <div className="rounded-lg shadow-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] p-2.5 max-w-[280px]">
        {content}
      </div>
    </div>
  );
}
