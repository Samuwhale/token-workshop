/**
 * DTCG token type categories used in the inline token creation form and
 * anywhere else a grouped type <select> or type picker is needed.
 *
 * Each entry has a label (optgroup heading) and a list of { value, label } pairs.
 */
export interface TokenTypeOption {
  value: string;
  label: string;
}

export interface TokenTypeCategory {
  group: string;
  options: TokenTypeOption[];
}

export const TOKEN_TYPE_CATEGORIES: TokenTypeCategory[] = [
  {
    group: 'Color',
    options: [
      { value: 'color', label: 'Color' },
      { value: 'gradient', label: 'Gradient' },
    ],
  },
  {
    group: 'Size & Layout',
    options: [
      { value: 'dimension', label: 'Dimension' },
      { value: 'percentage', label: 'Percentage' },
      { value: 'number', label: 'Number' },
    ],
  },
  {
    group: 'Typography',
    options: [
      { value: 'typography', label: 'Typography' },
      { value: 'fontFamily', label: 'Font Family' },
      { value: 'fontWeight', label: 'Font Weight' },
      { value: 'fontStyle', label: 'Font Style' },
      { value: 'lineHeight', label: 'Line Height' },
      { value: 'letterSpacing', label: 'Letter Spacing' },
      { value: 'textDecoration', label: 'Text Decoration' },
      { value: 'textTransform', label: 'Text Transform' },
    ],
  },
  {
    group: 'Animation',
    options: [
      { value: 'duration', label: 'Duration' },
      { value: 'cubicBezier', label: 'Cubic Bezier' },
      { value: 'transition', label: 'Transition' },
    ],
  },
  {
    group: 'Border & Effects',
    options: [
      { value: 'shadow', label: 'Shadow' },
      { value: 'border', label: 'Border' },
      { value: 'strokeStyle', label: 'Stroke Style' },
    ],
  },
  {
    group: 'Composite',
    options: [{ value: 'composition', label: 'Composition' }],
  },
  {
    group: 'Other',
    options: [
      { value: 'string', label: 'String' },
      { value: 'boolean', label: 'Boolean' },
      { value: 'link', label: 'Link' },
      { value: 'asset', label: 'Asset' },
      { value: 'custom', label: 'Custom' },
    ],
  },
];

/** Flat list of all token type values in category order. */
export const ALL_TOKEN_TYPES: string[] = TOKEN_TYPE_CATEGORIES.flatMap(c =>
  c.options.map(o => o.value),
);

export function isSupportedTokenType(value: string): boolean {
  return ALL_TOKEN_TYPES.includes(value);
}

export function normalizeTokenType(
  value: string | null | undefined,
  fallback = 'color',
): string {
  return value && isSupportedTokenType(value) ? value : fallback;
}
