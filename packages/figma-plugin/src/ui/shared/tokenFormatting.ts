/**
 * Unified token value formatting for display.
 *
 * Single source of truth that replaces the six independent implementations that
 * previously existed in ComparePanel, CrossThemeComparePanel, tokenListUtils,
 * generatorShared, changeHelpers, and selectionInspectorUtils.
 */

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type DimensionLike = { value: unknown; unit?: string };

function isDimensionLike(v: unknown): v is DimensionLike {
  if (typeof v !== 'object' || v === null) return false;
  return 'value' in (v as object) && 'unit' in (v as object);
}

function fmtDimension(v: DimensionLike, defaultUnit = 'px'): string {
  return `${v.value}${v.unit ?? defaultUnit}`;
}

function fmtDimensionOrScalar(v: unknown, defaultUnit = 'px'): string {
  if (isDimensionLike(v)) return fmtDimension(v, defaultUnit);
  return String(v);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface FormatTokenValueOptions {
  /**
   * String returned when value is null or undefined.
   * @default '—'
   */
  emptyPlaceholder?: string;
}

/**
 * Format a DTCG token value for human-readable display.
 *
 * Handles all common DTCG token types: color, dimension, duration, typography,
 * shadow, gradient, border. Falls back to truncated JSON for unknown objects.
 *
 * @param type   DTCG token $type (e.g. 'color', 'dimension', 'typography')
 * @param value  The token's $value
 * @param options
 */
export function formatTokenValueForDisplay(
  type: string | undefined,
  value: unknown,
  options: FormatTokenValueOptions = {},
): string {
  const empty = options.emptyPlaceholder ?? '—';

  if (value === undefined || value === null) return empty;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;

  // Structured object handling
  if (typeof value === 'object') {
    // Dimension-like: { value, unit } — handle before type-specific logic so
    // dimension/duration tokens stored as objects are always formatted correctly.
    if (isDimensionLike(value)) {
      const defaultUnit = type === 'duration' ? 'ms' : 'px';
      return fmtDimension(value, defaultUnit);
    }

    if (type === 'typography') {
      const v = value as Record<string, unknown>;
      const parts: string[] = [];
      if (v.fontFamily) {
        parts.push(Array.isArray(v.fontFamily) ? String(v.fontFamily[0]) : String(v.fontFamily));
      }
      if (v.fontSize != null) {
        parts.push(isDimensionLike(v.fontSize) ? fmtDimension(v.fontSize) : `${v.fontSize}px`);
      }
      if (v.fontWeight != null) parts.push(String(v.fontWeight));
      if (v.lineHeight != null) {
        const lh = v.lineHeight;
        parts.push(`/${isDimensionLike(lh) ? fmtDimension(lh, '') : lh}`);
      }
      return parts.join(' ') || empty;
    }

    if (type === 'shadow') {
      const arr = Array.isArray(value) ? value : [value];
      const prefix = arr.length > 1 ? `×${arr.length} ` : '';
      const s = arr[0] as Record<string, unknown>;
      if (s && typeof s === 'object') {
        // Support both offsetX/offsetY and x/y property names
        const x = s.offsetX != null ? fmtDimensionOrScalar(s.offsetX) : String(s.x ?? '0');
        const y = s.offsetY != null ? fmtDimensionOrScalar(s.offsetY) : String(s.y ?? '0');
        const blur = s.blur != null ? fmtDimensionOrScalar(s.blur) : String(s.blurRadius ?? '0');
        const color = typeof s.color === 'string' ? ` ${s.color}` : '';
        return `${prefix}${x} ${y} ${blur}${color}`;
      }
      return 'Shadow';
    }

    if (type === 'gradient') {
      const v = value as Record<string, unknown>;
      if (v.gradientType) return String(v.gradientType);
      if (Array.isArray(v.stops)) return `${v.stops.length} stops`;
      return 'Gradient';
    }

    if (type === 'border') {
      const v = value as Record<string, unknown>;
      const w = v.width != null
        ? (isDimensionLike(v.width) ? fmtDimension(v.width) : String(v.width))
        : '';
      const style = v.style ? String(v.style) : '';
      return [w, style].filter(Boolean).join(' ') || 'Border';
    }

    // Unknown object type — truncate JSON
    const s = JSON.stringify(value);
    return s.length > 50 ? `${s.slice(0, 50)}…` : s;
  }

  return String(value);
}
