/**
 * W3C Design Token Community Group (DTCG) token type constants
 * and shared default values for the Token Workshop engine.
 *
 * Spec: https://tr.designtokens.org/format/
 */

// ---------------------------------------------------------------------------
// Token Types – all 24 types defined by the DTCG spec
// ---------------------------------------------------------------------------

export const TOKEN_TYPES = {
  COLOR: 'color',
  DIMENSION: 'dimension',
  FONT_FAMILY: 'fontFamily',
  FONT_WEIGHT: 'fontWeight',
  DURATION: 'duration',
  CUBIC_BEZIER: 'cubicBezier',
  NUMBER: 'number',
  STROKE_STYLE: 'strokeStyle',
  BORDER: 'border',
  TRANSITION: 'transition',
  SHADOW: 'shadow',
  GRADIENT: 'gradient',
  TYPOGRAPHY: 'typography',
  FONT_STYLE: 'fontStyle',
  LETTER_SPACING: 'letterSpacing',
  LINE_HEIGHT: 'lineHeight',
  PERCENTAGE: 'percentage',
  STRING: 'string',
  BOOLEAN: 'boolean',
  LINK: 'link',
  TEXT_DECORATION: 'textDecoration',
  TEXT_TRANSFORM: 'textTransform',
  CUSTOM: 'custom',
  COMPOSITION: 'composition',
  ASSET: 'asset',
} as const;

/** Set of all valid token type strings for quick membership checks. */
export const TOKEN_TYPE_VALUES = new Set<string>(Object.values(TOKEN_TYPES));

/** Token types that support `$extends` inheritance (composite types with object values). */
export const COMPOSITE_TOKEN_TYPES = new Set<string>([
  TOKEN_TYPES.TYPOGRAPHY,
  TOKEN_TYPES.SHADOW,
  TOKEN_TYPES.BORDER,
  TOKEN_TYPES.TRANSITION,
  TOKEN_TYPES.COMPOSITION,
]);

// ---------------------------------------------------------------------------
// Dimension Units
// ---------------------------------------------------------------------------

export const DIMENSION_UNITS = ['px', 'rem', 'em', '%', 'vw', 'vh', 'vmin', 'vmax', 'ch', 'ex', 'cap', 'ic', 'lh', 'rlh', 'svw', 'svh', 'lvw', 'lvh', 'dvw', 'dvh'] as const;

export type DimensionUnit = (typeof DIMENSION_UNITS)[number];

// ---------------------------------------------------------------------------
// Font Weight Names (CSS spec mapping)
// ---------------------------------------------------------------------------

export const FONT_WEIGHT_NAMES: Record<string, number> = {
  thin: 100,
  hairline: 100,
  extralight: 200,
  ultralight: 200,
  light: 300,
  normal: 400,
  regular: 400,
  medium: 500,
  semibold: 600,
  demibold: 600,
  bold: 700,
  extrabold: 800,
  ultrabold: 800,
  black: 900,
  heavy: 900,
  extrablack: 950,
  ultrablack: 950,
} as const;

// ---------------------------------------------------------------------------
// Stroke Style Keywords
// ---------------------------------------------------------------------------

export const STROKE_STYLE_KEYWORDS = [
  'solid',
  'dashed',
  'dotted',
  'double',
  'groove',
  'ridge',
  'outset',
  'inset',
] as const;

export type StrokeStyleKeyword = (typeof STROKE_STYLE_KEYWORDS)[number];

// ---------------------------------------------------------------------------
// Default Values
// ---------------------------------------------------------------------------

export const DEFAULTS = {
  COLOR: '#000000',
  DIMENSION: { value: 0, unit: 'px' as const },
  FONT_FAMILY: 'sans-serif',
  FONT_WEIGHT: 400,
  DURATION: { value: 0, unit: 'ms' as const },
  CUBIC_BEZIER: [0, 0, 1, 1] as [number, number, number, number],
  NUMBER: 0,
  LINE_HEIGHT: 1.5,
  LETTER_SPACING: { value: 0, unit: 'px' as const },
  BORDER_STYLE: 'solid',
  SHADOW_TYPE: 'dropShadow' as const,
} as const;

// ---------------------------------------------------------------------------
// Reference Pattern
// ---------------------------------------------------------------------------

/** Regex that matches a DTCG alias reference, e.g. `{colors.primary.500}` */
export const REFERENCE_REGEX = /^\{([^}]+)\}$/;

/** Returns a fresh regex that matches references *within* a string (non-anchored, global).
 * A factory is used instead of a shared constant to avoid `.lastIndex` contamination
 * when callers use `.test()` or `.exec()` on the same regex instance. */
export const makeReferenceGlobalRegex = (): RegExp => /\{([^}]+)\}/g;
