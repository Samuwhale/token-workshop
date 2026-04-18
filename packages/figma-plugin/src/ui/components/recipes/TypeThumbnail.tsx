/**
 * Tiny SVG thumbnail for each recipe type.
 * Used in the intent-based type selector cards.
 */
import type { RecipeType } from '../../hooks/useRecipes';

export function TypeThumbnail({ type, size = 16 }: { type: RecipeType; size?: number }) {
  const s = size;
  const color = 'currentColor';

  switch (type) {
    case 'colorRamp':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="none" aria-hidden="true">
          {[0, 1, 2, 3, 4].map(i => (
            <rect key={i} x={1 + i * 3} y={2} width={2.2} height={12} rx={0.5}
              fill={color} opacity={0.15 + i * 0.2} />
          ))}
        </svg>
      );
    case 'typeScale':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x={1} y={2} width={14} height={2.5} rx={0.5} fill={color} opacity={0.9} />
          <rect x={1} y={6} width={10} height={2} rx={0.5} fill={color} opacity={0.6} />
          <rect x={1} y={10} width={7} height={1.5} rx={0.5} fill={color} opacity={0.4} />
          <rect x={1} y={13} width={5} height={1} rx={0.5} fill={color} opacity={0.25} />
        </svg>
      );
    case 'spacingScale':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x={1} y={1} width={3} height={14} rx={0.5} fill={color} opacity={0.3} />
          <rect x={5} y={3} width={3} height={10} rx={0.5} fill={color} opacity={0.5} />
          <rect x={9} y={5} width={3} height={6} rx={0.5} fill={color} opacity={0.7} />
          <rect x={13} y={7} width={2} height={2} rx={0.5} fill={color} opacity={0.9} />
        </svg>
      );
    case 'opacityScale':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx={6} cy={8} r={5} fill={color} opacity={0.15} />
          <circle cx={8} cy={8} r={4} fill={color} opacity={0.35} />
          <circle cx={10} cy={8} r={3} fill={color} opacity={0.6} />
        </svg>
      );
    case 'borderRadiusScale':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth={1.2} aria-hidden="true">
          <rect x={1} y={1} width={6} height={6} rx={0.5} opacity={0.4} />
          <rect x={9} y={1} width={6} height={6} rx={2} opacity={0.6} />
          <rect x={1} y={9} width={6} height={6} rx={3} opacity={0.8} />
          <circle cx={12} cy={12} r={3} opacity={0.9} />
        </svg>
      );
    case 'zIndexScale':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x={3} y={9} width={10} height={5} rx={1} fill={color} opacity={0.2} />
          <rect x={2} y={6} width={10} height={5} rx={1} fill={color} opacity={0.4} />
          <rect x={1} y={3} width={10} height={5} rx={1} fill={color} opacity={0.7} />
        </svg>
      );
    case 'shadowScale':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x={4} y={5} width={9} height={8} rx={1} fill={color} opacity={0.15} />
          <rect x={3} y={3} width={9} height={8} rx={1} fill={color} opacity={0.6} stroke={color} strokeWidth={0.5} />
        </svg>
      );
    case 'customScale':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth={1.2} strokeLinecap="round" aria-hidden="true">
          <path d="M2 13 C5 13, 6 3, 8 3 S11 13, 14 13" opacity={0.7} />
          <circle cx={2} cy={13} r={1} fill={color} opacity={0.5} />
          <circle cx={14} cy={13} r={1} fill={color} opacity={0.5} />
        </svg>
      );
    case 'accessibleColorPair':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx={6} cy={8} r={4.5} fill={color} opacity={0.3} />
          <circle cx={10} cy={8} r={4.5} fill={color} opacity={0.6} />
          <path d="M6.5 8.5L8 10l3-4" stroke="white" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'darkModeInversion':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx={8} cy={8} r={6} fill={color} opacity={0.15} />
          <path d="M8 2 A6 6 0 0 1 8 14 Z" fill={color} opacity={0.7} />
        </svg>
      );
  }
}
