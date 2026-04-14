export interface SemanticPattern {
  id: string;
  label: string;
  applicableTo: string[]; // recipe types
  mappings: Array<{ semantic: string; step: string }>;
}

export const SEMANTIC_PATTERNS: SemanticPattern[] = [
  {
    id: 'action',
    label: 'Action states',
    applicableTo: ['colorRamp'],
    mappings: [
      { semantic: 'action.default', step: '500' },
      { semantic: 'action.hover', step: '600' },
      { semantic: 'action.active', step: '700' },
      { semantic: 'action.disabled', step: '300' },
    ],
  },
  {
    id: 'surface',
    label: 'Surface levels',
    applicableTo: ['colorRamp'],
    mappings: [
      { semantic: 'surface.default', step: '50' },
      { semantic: 'surface.subtle', step: '100' },
      { semantic: 'surface.strong', step: '200' },
    ],
  },
  {
    id: 'text',
    label: 'Text colors',
    applicableTo: ['colorRamp'],
    mappings: [
      { semantic: 'text.default', step: '900' },
      { semantic: 'text.subtle', step: '600' },
      { semantic: 'text.disabled', step: '400' },
      { semantic: 'text.inverse', step: '50' },
    ],
  },
  {
    id: 'border',
    label: 'Border colors',
    applicableTo: ['colorRamp'],
    mappings: [
      { semantic: 'border.default', step: '300' },
      { semantic: 'border.strong', step: '500' },
      { semantic: 'border.subtle', step: '200' },
    ],
  },
  {
    id: 'spacing-components',
    label: 'Component spacing',
    applicableTo: ['spacingScale'],
    mappings: [
      { semantic: 'component.padding.sm', step: '2' },
      { semantic: 'component.padding.md', step: '4' },
      { semantic: 'component.padding.lg', step: '6' },
      { semantic: 'component.gap.sm', step: '2' },
      { semantic: 'component.gap.md', step: '4' },
    ],
  },
  {
    id: 'radius-components',
    label: 'Component radii',
    applicableTo: ['borderRadiusScale'],
    mappings: [
      { semantic: 'component.radius.sm', step: 'sm' },
      { semantic: 'component.radius.md', step: 'md' },
      { semantic: 'component.radius.lg', step: 'lg' },
      { semantic: 'component.radius.pill', step: 'full' },
    ],
  },
  {
    id: 'type-size',
    label: 'Text sizes',
    applicableTo: ['typeScale'],
    mappings: [
      { semantic: 'text.size.caption', step: 'xs' },
      { semantic: 'text.size.body', step: 'base' },
      { semantic: 'text.size.heading', step: '2xl' },
      { semantic: 'text.size.display', step: '3xl' },
    ],
  },
];
