import { isWideGamutColor, getSrgbFallback } from '../shared/colorUtils';

/**
 * Gamut indicator badge — shows when a color exceeds sRGB.
 * Displays a small "P3" badge with the sRGB fallback swatch on hover.
 */
export function GamutIndicator({ color, showFallback = false }: { color: string; showFallback?: boolean }) {
  if (!isWideGamutColor(color)) return null;

  const fallback = getSrgbFallback(color);

  return (
    <span className="inline-flex items-center gap-0.5 shrink-0" title={`Wide-gamut color — outside sRGB.\nFallback: ${fallback ?? 'N/A'}`}>
      <span className="px-1 py-px rounded text-[var(--font-size-xs)] font-bold leading-none bg-[var(--color-figma-warning)]/15 text-[var(--color-figma-warning)] border border-[var(--color-figma-warning)]/30">
        P3
      </span>
      {showFallback && fallback && (
        <span className="inline-flex items-center gap-0.5 text-secondary text-[var(--color-figma-text-tertiary)]">
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
