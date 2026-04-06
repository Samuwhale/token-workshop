import type { ColorRampConfig, SpacingScaleConfig, TypeScaleConfig, ShadowScaleConfig, DarkModeInversionConfig, AccessibleColorPairConfig, GeneratorType, GeneratorConfig } from '../hooks/useGenerators';

export interface SemanticMapping {
  semantic: string;
  step: string;
  type: 'color' | 'dimension' | 'number' | 'shadow';
}

export interface SemanticLayer {
  prefix: string;
  mappings: SemanticMapping[];
}

export interface GraphTemplate {
  id: string;
  label: string;
  description: string;
  whenToUse: string;
  stages: string[];
  generatorType: GeneratorType;
  defaultPrefix: string;
  requiresSource: boolean;
  config: GeneratorConfig;
  semanticLayers: SemanticLayer[];
}

export const GRAPH_TEMPLATES: GraphTemplate[] = [
  {
    id: 'material-color',
    label: 'Material color palette',
    description: '11-step perceptual color ramp with semantic action map',
    whenToUse: 'Use for brand primary or secondary colors — gives you action.default, action.hover, action.active, and action.disabled aliases out of the box.',
    stages: ['Source color', '11-step ramp', 'Semantic map'],
    generatorType: 'colorRamp',
    defaultPrefix: 'brand',
    requiresSource: true,
    config: {
      steps: [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950],
      lightEnd: 97,
      darkEnd: 8,
      chromaBoost: 1.0,
      includeSource: false,
    } as ColorRampConfig,
    semanticLayers: [
      {
        prefix: 'semantic',
        mappings: [
          { semantic: 'action.default', step: '500', type: 'color' },
          { semantic: 'action.hover', step: '600', type: 'color' },
          { semantic: 'action.active', step: '700', type: 'color' },
          { semantic: 'action.disabled', step: '300', type: 'color' },
        ],
      },
    ],
  },
  {
    id: 'tailwind-spacing',
    label: 'Tailwind spacing',
    description: 'Tailwind-style spacing scale with component spacing map',
    whenToUse: 'Use when starting a new project or matching a Tailwind layout — generates semantic component.padding and component.gap aliases for small, medium, and large sizes.',
    stages: ['Base unit', 'Spacing scale', 'Component map'],
    generatorType: 'spacingScale',
    defaultPrefix: 'spacing',
    requiresSource: true,
    config: {
      steps: [
        { name: '1', multiplier: 1 },
        { name: '2', multiplier: 2 },
        { name: '3', multiplier: 3 },
        { name: '4', multiplier: 4 },
        { name: '5', multiplier: 5 },
        { name: '6', multiplier: 6 },
        { name: '8', multiplier: 8 },
        { name: '10', multiplier: 10 },
        { name: '12', multiplier: 12 },
        { name: '16', multiplier: 16 },
        { name: '20', multiplier: 20 },
        { name: '24', multiplier: 24 },
      ],
      unit: 'px',
    } as SpacingScaleConfig,
    semanticLayers: [
      {
        prefix: 'component',
        mappings: [
          { semantic: 'padding.sm', step: '2', type: 'dimension' },
          { semantic: 'padding.md', step: '4', type: 'dimension' },
          { semantic: 'padding.lg', step: '6', type: 'dimension' },
          { semantic: 'gap.sm', step: '2', type: 'dimension' },
          { semantic: 'gap.md', step: '4', type: 'dimension' },
        ],
      },
    ],
  },
  {
    id: 'modular-type',
    label: 'Modular type scale',
    description: 'Base size × ratio (1.333) → 7-step type scale',
    whenToUse: 'Use to create a harmonious type scale from a single base size — steps grow by a 4:3 ratio, giving you xs through 3xl for body copy, headings, and display text.',
    stages: ['Base size', 'Type scale ×1.333'],
    generatorType: 'typeScale',
    defaultPrefix: 'fontSize',
    requiresSource: true,
    config: {
      steps: [
        { name: 'xs', exponent: -2 },
        { name: 'sm', exponent: -1 },
        { name: 'base', exponent: 0 },
        { name: 'lg', exponent: 1 },
        { name: 'xl', exponent: 2 },
        { name: '2xl', exponent: 3 },
        { name: '3xl', exponent: 4 },
      ],
      ratio: 1.333,
      unit: 'rem',
      baseStep: 'base',
      roundTo: 3,
    } as TypeScaleConfig,
    semanticLayers: [],
  },
  {
    id: 'elevation-shadow',
    label: 'Elevation shadow scale',
    description: '5-step shadow scale (sm → 2xl) with semantic component aliases',
    whenToUse: 'Use to add consistent depth to cards, modals, and dropdowns — generates semantic component.card, component.modal, and component.dropdown shadow aliases.',
    stages: ['Shadow config', '5-step scale', 'Component map'],
    generatorType: 'shadowScale',
    defaultPrefix: 'shadow',
    requiresSource: false,
    config: {
      color: '#000000',
      steps: [
        { name: 'sm',  offsetX: 0, offsetY: 1,  blur: 2,  spread: 0,  opacity: 0.05 },
        { name: 'md',  offsetX: 0, offsetY: 4,  blur: 6,  spread: -1, opacity: 0.1  },
        { name: 'lg',  offsetX: 0, offsetY: 10, blur: 15, spread: -3, opacity: 0.1  },
        { name: 'xl',  offsetX: 0, offsetY: 20, blur: 25, spread: -5, opacity: 0.1  },
        { name: '2xl', offsetX: 0, offsetY: 25, blur: 50, spread: -12, opacity: 0.25 },
      ],
    } as ShadowScaleConfig,
    semanticLayers: [
      {
        prefix: 'component',
        mappings: [
          { semantic: 'card', step: 'md', type: 'shadow' },
          { semantic: 'modal', step: 'xl', type: 'shadow' },
          { semantic: 'dropdown', step: 'lg', type: 'shadow' },
        ],
      },
    ],
  },
  {
    id: 'full-semantic-color',
    label: 'Full semantic color system',
    description: 'Brand color → ramp → semantic surfaces, text, borders & actions',
    whenToUse: 'Use when building a design system from scratch — generates a complete set of color.surface, color.text, color.border, and color.action tokens from one brand color.',
    stages: ['Brand color', 'Color ramp', 'Semantic layers'],
    generatorType: 'colorRamp',
    defaultPrefix: 'brand',
    requiresSource: true,
    config: {
      steps: [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950],
      lightEnd: 97,
      darkEnd: 8,
      chromaBoost: 1.0,
      includeSource: false,
    } as ColorRampConfig,
    semanticLayers: [
      {
        prefix: 'color',
        mappings: [
          { semantic: 'surface.page', step: '50', type: 'color' },
          { semantic: 'surface.raised', step: '100', type: 'color' },
          { semantic: 'surface.overlay', step: '200', type: 'color' },
          { semantic: 'text.primary', step: '900', type: 'color' },
          { semantic: 'text.secondary', step: '700', type: 'color' },
          { semantic: 'text.disabled', step: '400', type: 'color' },
          { semantic: 'text.inverse', step: '50', type: 'color' },
          { semantic: 'border.default', step: '200', type: 'color' },
          { semantic: 'border.strong', step: '400', type: 'color' },
          { semantic: 'action.default', step: '500', type: 'color' },
          { semantic: 'action.hover', step: '600', type: 'color' },
          { semantic: 'action.active', step: '700', type: 'color' },
          { semantic: 'action.disabled', step: '300', type: 'color' },
        ],
      },
    ],
  },
  {
    id: 'dark-mode-palette',
    label: 'Dark mode palette',
    description: 'Perceptually invert a light-mode color into its dark-mode equivalent using OKLab lightness inversion',
    whenToUse: 'Use when you already have a light-mode color token and need a matching dark-mode version — inversion preserves hue and chroma while flipping lightness, so the two palettes feel like a matched pair.',
    stages: ['Light color', 'OKLab invert', 'Dark color'],
    generatorType: 'darkModeInversion',
    defaultPrefix: 'dark',
    requiresSource: true,
    config: {
      stepName: 'inverted',
      chromaBoost: 0.15,
    } as DarkModeInversionConfig,
    semanticLayers: [
      {
        prefix: 'theme.dark',
        mappings: [
          { semantic: 'surface.page', step: 'inverted', type: 'color' },
        ],
      },
    ],
  },
  {
    id: 'accessible-color-pair',
    label: 'Accessible color pair',
    description: 'WCAG AA foreground/background pair from a brand color — guaranteed 4.5:1 contrast ratio',
    whenToUse: 'Use when you need a button, badge, or callout color with guaranteed legibility — generates a background and foreground color that meet WCAG AA contrast requirements.',
    stages: ['Brand color', 'WCAG AA check', 'fg + bg'],
    generatorType: 'accessibleColorPair',
    defaultPrefix: 'accessible',
    requiresSource: true,
    config: {
      contrastLevel: 'AA',
      backgroundStep: 'bg',
      foregroundStep: 'fg',
    } as AccessibleColorPairConfig,
    semanticLayers: [
      {
        prefix: 'semantic',
        mappings: [
          { semantic: 'text.onBrand', step: 'fg', type: 'color' },
          { semantic: 'surface.brand', step: 'bg', type: 'color' },
        ],
      },
    ],
  },
];

export function getTemplateStepCount(template: GraphTemplate): number {
  const cfg = template.config as unknown as Record<string, unknown>;
  const steps = cfg.steps;
  if (Array.isArray(steps)) return steps.length;
  return 0;
}

/** Map a DTCG token $type to the best-fit template id. */
export function templateIdForTokenType(tokenType: string | null | undefined): string {
  if (tokenType === 'color') return 'material-color';
  if (tokenType === 'dimension') return 'tailwind-spacing';
  return 'modular-type';
}
