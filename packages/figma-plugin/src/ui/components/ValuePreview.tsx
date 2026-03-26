export function ValuePreview({ type, value }: { type?: string; value?: any }) {
  // Unresolved alias — degrade gracefully
  if (typeof value === 'string' && value.startsWith('{')) {
    return <div className="w-5 h-5 shrink-0" />;
  }

  if (type === 'color' && typeof value === 'string') {
    return (
      <div
        className="w-5 h-5 rounded border border-[var(--color-figma-border)] shrink-0"
        style={{ backgroundColor: value }}
      />
    );
  }

  if (type === 'typography' && typeof value === 'object' && value !== null) {
    const fontFamily = value.fontFamily || 'inherit';
    const fontWeight = value.fontWeight || 400;
    const sizeVal = typeof value.fontSize === 'object' && value.fontSize !== null
      ? `${value.fontSize.value}${value.fontSize.unit}`
      : value.fontSize ? `${value.fontSize}px` : '12px';
    return (
      <div
        className="w-6 h-4 rounded border border-[var(--color-figma-border)] shrink-0 flex items-center justify-center overflow-hidden bg-[var(--color-figma-bg)]"
        title={`${fontFamily} ${sizeVal} / ${fontWeight}`}
        style={{ fontFamily, fontWeight, fontSize: '9px', lineHeight: 1 }}
      >
        Aa
      </div>
    );
  }

  if (type === 'shadow' && typeof value === 'object' && value !== null) {
    const shadow = Array.isArray(value) ? value[0] : value;
    if (shadow && typeof shadow === 'object') {
      const { color = '#00000040', offsetX, offsetY, blur, spread } = shadow;
      const ox = typeof offsetX === 'object' ? `${offsetX.value}${offsetX.unit}` : (offsetX ?? '0px');
      const oy = typeof offsetY === 'object' ? `${offsetY.value}${offsetY.unit}` : (offsetY ?? '4px');
      const b = typeof blur === 'object' ? `${blur.value}${blur.unit}` : (blur ?? '8px');
      const s = typeof spread === 'object' ? `${spread.value}${spread.unit}` : (spread ?? '0px');
      return (
        <div
          className="w-5 h-5 rounded shrink-0 bg-[var(--color-figma-bg)]"
          style={{ boxShadow: `${ox} ${oy} ${b} ${s} ${color}` }}
        />
      );
    }
  }

  if (type === 'fontFamily' && typeof value === 'string' && value) {
    return (
      <div
        className="w-8 h-4 rounded border border-[var(--color-figma-border)] shrink-0 flex items-center justify-center overflow-hidden bg-[var(--color-figma-bg)] text-[var(--color-figma-text)]"
        title={value}
        style={{ fontFamily: value, fontSize: '9px', lineHeight: 1 }}
      >
        Aa
      </div>
    );
  }

  if (type === 'fontWeight' && typeof value === 'number') {
    return (
      <div
        className="w-8 h-4 rounded border border-[var(--color-figma-border)] shrink-0 flex items-center justify-center overflow-hidden bg-[var(--color-figma-bg)] text-[var(--color-figma-text)]"
        title={String(value)}
        style={{ fontWeight: value, fontSize: '9px', lineHeight: 1 }}
      >
        Aa
      </div>
    );
  }

  if (type === 'gradient') {
    let gradientCss: string | null = null;
    if (typeof value === 'string' && value.includes('gradient')) {
      gradientCss = value;
    } else if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && 'color' in value[0]) {
      // DTCG gradient: GradientStop[] = [{color, position}, ...]
      const stops = (value as Array<{ color: string; position?: number }>)
        .map(s => `${s.color}${s.position != null ? ` ${Math.round(s.position * 100)}%` : ''}`)
        .join(', ');
      gradientCss = `linear-gradient(to right, ${stops})`;
    }
    if (gradientCss) {
      return (
        <div
          className="w-6 h-4 rounded border border-[var(--color-figma-border)] shrink-0"
          style={{ background: gradientCss }}
        />
      );
    }
  }

  return <div className="w-5 h-5 shrink-0" />;
}
