export const VALUE_FORMAT_HINTS: Record<string, string> = {
  color: '#hex, rgb(), oklch(), color(display-p3 ...)',
  dimension: 'Number + unit (px, rem, em, %)',
  number: 'Numeric value or fx expression',
  string: 'Any text value',
  boolean: 'true / false',
  fontFamily: 'Font name(s), comma-separated',
  fontWeight: '100-900 (Thin -> Black)',
  duration: 'Time value in ms or s',
  shadow: 'Color, offset X/Y, blur, spread',
  border: 'Color, width, style',
  gradient: 'Color stops with positions',
  typography: 'Font family, size, weight, line height, letter spacing',
  composition: 'Key-value pairs of design properties',
  asset: 'URL to an image or file',
  strokeStyle: 'solid, dashed, dotted, double, ...',
  cubicBezier: '[x1, y1, x2, y2] easing curve',
  transition: 'Duration, delay, and timing function',
  fontStyle: 'normal, italic, or oblique',
  lineHeight: 'Unitless multiplier (1.5) or dimension (24px)',
  letterSpacing: 'Dimension value (e.g. 0.5px, 0.02em)',
  percentage: 'Numeric percentage value',
  link: 'URL (https://...)',
  textDecoration: 'none, underline, overline, line-through',
  textTransform: 'none, uppercase, lowercase, capitalize',
  custom: 'Any value: JSON object, string, or number',
};

export function valueFormatHint(type: string): string | null {
  return VALUE_FORMAT_HINTS[type] ?? null;
}
