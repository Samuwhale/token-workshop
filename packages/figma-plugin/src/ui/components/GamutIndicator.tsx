import { isWideGamutColor, getSrgbFallback, swatchBgColor } from '../shared/colorUtils';

/**
 * Gamut indicator badge — shows when a color exceeds sRGB.
 * Displays a small "P3" badge with the sRGB fallback swatch on hover.
 */
export function GamutIndicator({ color, showFallback = false }: { color: string; showFallback?: boolean }) {
  if (!isWideGamutColor(color)) return null;

  const fallback = getSrgbFallback(color);

  return (
    <span className="inline-flex items-center gap-0.5 shrink-0" title={`Wide-gamut color — outside sRGB.\nFallback: ${fallback ?? 'N/A'}`}>
      <span className="px-1 py-px rounded text-[8px] font-bold leading-none bg-[var(--color-figma-warning)]/15 text-[var(--color-figma-warning)] border border-[var(--color-figma-warning)]/30">
        P3
      </span>
      {showFallback && fallback && (
        <span className="inline-flex items-center gap-0.5 text-[9px] text-[var(--color-figma-text-tertiary)]">
          <span
            className="w-3 h-3 rounded-sm border border-[var(--color-figma-border)] shrink-0"
            style={{ backgroundColor: fallback }}
            title={`sRGB fallback: ${fallback}`}
          />
        </span>
      )}
    </span>
  );
}

/**
 * Inline color swatch with gamut indicator.
 * Replaces raw `backgroundColor: hex.slice(0,7)` patterns with wide-gamut-aware rendering.
 */
export function ColorSwatch({
  color,
  size = 'md',
  className = '',
  showGamut = true,
  onClick,
}: {
  color: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showGamut?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}) {
  const sizeClass = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-8 h-8' : 'w-6 h-6';
  const bgColor = swatchBgColor(color);
  const wideGamut = showGamut && isWideGamutColor(color);

  return (
    <span className={`inline-flex items-center gap-1 shrink-0 ${className}`}>
      <span
        className={`${sizeClass} rounded border border-[var(--color-figma-border)] shrink-0 ${onClick ? 'cursor-pointer hover:ring-1 hover:ring-[var(--color-figma-accent)]' : ''}`}
        style={{ backgroundColor: bgColor }}
        title={color}
        onClick={onClick}
      />
      {wideGamut && (
        <GamutIndicator color={color} />
      )}
    </span>
  );
}
