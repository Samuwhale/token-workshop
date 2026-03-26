/**
 * Token Generator types — definitions for live token group generators.
 *
 * A TokenGenerator describes a relationship between an optional source token
 * and a group of derived tokens that are automatically regenerated whenever
 * the source token changes. Standalone generators (zIndexScale, opacityScale,
 * customScale without a base) have no source token.
 */

export type GeneratorType =
  | 'colorRamp'
  | 'typeScale'
  | 'spacingScale'
  | 'opacityScale'
  | 'borderRadiusScale'
  | 'zIndexScale'
  | 'customScale';

// ---------------------------------------------------------------------------
// Color Ramp
// ---------------------------------------------------------------------------

export interface ColorRampConfig {
  /** Step numbers to generate, e.g. [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] */
  steps: number[];
  /** L* (CIELAB) value for the lightest generated step (1–100). Default: 97 */
  lightEnd: number;
  /** L* (CIELAB) value for the darkest generated step (1–100). Default: 8 */
  darkEnd: number;
  /**
   * Chroma multiplier (0.1–3.0). Values > 1 make colours more vivid;
   * values < 1 desaturate. Default: 1.0
   */
  chromaBoost: number;
  /**
   * When true, one step is pinned so it reproduces the source color exactly.
   * The step to pin is specified by `sourceStep`.
   */
  includeSource: boolean;
  /** Step number to pin to the exact source color when `includeSource` is true. */
  sourceStep?: number;
}

// ---------------------------------------------------------------------------
// Type Scale
// ---------------------------------------------------------------------------

export interface TypeScaleStep {
  /** Human-readable name, e.g. "xs", "sm", "base", "lg", "xl", "2xl" */
  name: string;
  /**
   * Exponent relative to the base step (which has exponent 0).
   * Negative values produce smaller sizes; positive values produce larger ones.
   */
  exponent: number;
}

export interface TypeScaleConfig {
  steps: TypeScaleStep[];
  /**
   * Scale ratio applied per exponent level.
   * e.g. 1.25 = Major Third, 1.333 = Perfect Fourth, 1.618 = Golden Ratio
   */
  ratio: number;
  unit: 'px' | 'rem';
  /** Name of the step whose exponent is 0 (matches the source token's value). Default: "base" */
  baseStep: string;
  /** Number of decimal places to round each generated value to. Default: 1 */
  roundTo: number;
}

// ---------------------------------------------------------------------------
// Spacing Scale
// ---------------------------------------------------------------------------

export interface SpacingStep {
  /** Name for this step, e.g. "1", "2", "4", "8" or "xs", "sm" */
  name: string;
  /** Multiplier applied to the source dimension value to get this step's value */
  multiplier: number;
}

export interface SpacingScaleConfig {
  steps: SpacingStep[];
  unit: 'px' | 'rem';
}

// ---------------------------------------------------------------------------
// Opacity Scale
// ---------------------------------------------------------------------------

export interface OpacityScaleConfig {
  /** Each step maps a name to an opacity percentage (0–100) */
  steps: Array<{ name: string; value: number }>;
}

// ---------------------------------------------------------------------------
// Border Radius Scale
// ---------------------------------------------------------------------------

export interface BorderRadiusStep {
  name: string;
  /** Multiplier applied to source value. Ignored if `exactValue` is set. */
  multiplier: number;
  /** Override to a specific pixel value (e.g. 0 for "none", 9999 for "full") */
  exactValue?: number;
}

export interface BorderRadiusScaleConfig {
  steps: BorderRadiusStep[];
  unit: 'px' | 'rem';
}

// ---------------------------------------------------------------------------
// Z-Index Scale
// ---------------------------------------------------------------------------

export interface ZIndexScaleConfig {
  /** Each step maps a semantic name to an explicit z-index number */
  steps: Array<{ name: string; value: number }>;
}

// ---------------------------------------------------------------------------
// Custom Scale
// ---------------------------------------------------------------------------

export interface CustomScaleStep {
  /** Human-readable name for this step */
  name: string;
  /**
   * Signed index relative to the base step (index 0 = base value).
   * Negative = below base, positive = above.
   */
  index: number;
  /** Optional per-step multiplier, available as `multiplier` in the formula */
  multiplier?: number;
}

export interface CustomScaleConfig {
  /** DTCG $type for generated tokens, e.g. "dimension", "number", "color" */
  outputType: string;
  /** Unit appended for dimension outputs */
  unit?: 'px' | 'rem' | 'em' | '%';
  steps: CustomScaleStep[];
  /**
   * Arithmetic formula evaluated per step.
   * Available variables: base, index, multiplier, prev
   * Examples: "base * multiplier", "base + index * 10", "prev + 8"
   */
  formula: string;
  /** Decimal places to round numeric results to. Default: 2 */
  roundTo: number;
}

// ---------------------------------------------------------------------------
// Union
// ---------------------------------------------------------------------------

export type GeneratorConfig =
  | ColorRampConfig
  | TypeScaleConfig
  | SpacingScaleConfig
  | OpacityScaleConfig
  | BorderRadiusScaleConfig
  | ZIndexScaleConfig
  | CustomScaleConfig;

// ---------------------------------------------------------------------------
// Generator definition
// ---------------------------------------------------------------------------

export interface TokenGenerator {
  id: string;
  type: GeneratorType;
  /** Human-readable label, e.g. "Brand Color Ramp" */
  name: string;
  /**
   * Dot-delimited path of the source token, e.g. "colors.brand.primary".
   * Optional for standalone generators (zIndexScale, opacityScale, customScale).
   */
  sourceToken?: string;
  /** Name of the token set where derived tokens will be written */
  targetSet: string;
  /**
   * Dot-delimited group prefix for all derived tokens,
   * e.g. "colors.brand" → tokens become "colors.brand.50", "colors.brand.100", …
   */
  targetGroup: string;
  config: GeneratorConfig;
  /**
   * Per-step value overrides. Key = step name.
   * locked: true  → value survives regeneration
   * locked: false → one-time edit, cleared on next regeneration
   */
  overrides?: Record<string, { value: unknown; locked: boolean }>;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Generated token output
// ---------------------------------------------------------------------------

export interface GeneratedTokenResult {
  /** Step name, e.g. "100", "sm", "2" */
  stepName: string;
  /** Full token path: `${targetGroup}.${stepName}` */
  path: string;
  /** DTCG token $type string */
  type: string;
  /** Token $value (ready to write into .tokens.json) */
  value: unknown;
  /** True if this step's value came from a pinned override rather than computation */
  isOverridden?: boolean;
}

// ---------------------------------------------------------------------------
// Generator templates (replaces ScaffoldingWizard presets)
// ---------------------------------------------------------------------------

export interface GeneratorTemplate {
  id: string;
  label: string;
  description: string;
  /** Suggested group prefix, e.g. "spacing" or "borderRadius" */
  defaultPrefix: string;
  generatorType: GeneratorType;
  config: GeneratorConfig;
  /** Whether this template requires a source token to generate values */
  requiresSource: boolean;
}

// ---------------------------------------------------------------------------
// Default configurations (exported for use in UI)
// ---------------------------------------------------------------------------

export const DEFAULT_COLOR_RAMP_CONFIG: ColorRampConfig = {
  steps: [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950],
  lightEnd: 97,
  darkEnd: 8,
  chromaBoost: 1.0,
  includeSource: false,
};

export const DEFAULT_TYPE_SCALE_CONFIG: TypeScaleConfig = {
  steps: [
    { name: 'xs',   exponent: -2 },
    { name: 'sm',   exponent: -1 },
    { name: 'base', exponent:  0 },
    { name: 'lg',   exponent:  1 },
    { name: 'xl',   exponent:  2 },
    { name: '2xl',  exponent:  3 },
    { name: '3xl',  exponent:  4 },
  ],
  ratio: 1.25,
  unit: 'rem',
  baseStep: 'base',
  roundTo: 3,
};

export const DEFAULT_SPACING_SCALE_CONFIG: SpacingScaleConfig = {
  steps: [
    { name: '0.5',  multiplier: 0.5  },
    { name: '1',    multiplier: 1    },
    { name: '1.5',  multiplier: 1.5  },
    { name: '2',    multiplier: 2    },
    { name: '3',    multiplier: 3    },
    { name: '4',    multiplier: 4    },
    { name: '5',    multiplier: 5    },
    { name: '6',    multiplier: 6    },
    { name: '8',    multiplier: 8    },
    { name: '10',   multiplier: 10   },
    { name: '12',   multiplier: 12   },
    { name: '16',   multiplier: 16   },
    { name: '20',   multiplier: 20   },
    { name: '24',   multiplier: 24   },
  ],
  unit: 'px',
};

export const DEFAULT_OPACITY_SCALE_CONFIG: OpacityScaleConfig = {
  steps: [
    { name: '0',    value: 0   },
    { name: '5',    value: 5   },
    { name: '10',   value: 10  },
    { name: '20',   value: 20  },
    { name: '30',   value: 30  },
    { name: '40',   value: 40  },
    { name: '50',   value: 50  },
    { name: '60',   value: 60  },
    { name: '70',   value: 70  },
    { name: '80',   value: 80  },
    { name: '90',   value: 90  },
    { name: '95',   value: 95  },
    { name: '100',  value: 100 },
  ],
};

export const DEFAULT_BORDER_RADIUS_SCALE_CONFIG: BorderRadiusScaleConfig = {
  steps: [
    { name: 'none', multiplier: 0,  exactValue: 0    },
    { name: 'sm',   multiplier: 0.5                  },
    { name: 'md',   multiplier: 1                    },
    { name: 'lg',   multiplier: 2                    },
    { name: 'xl',   multiplier: 3                    },
    { name: '2xl',  multiplier: 4                    },
    { name: 'full', multiplier: 0,  exactValue: 9999 },
  ],
  unit: 'px',
};

export const DEFAULT_Z_INDEX_SCALE_CONFIG: ZIndexScaleConfig = {
  steps: [
    { name: 'below',    value: -1  },
    { name: 'base',     value: 0   },
    { name: 'raised',   value: 10  },
    { name: 'dropdown', value: 100 },
    { name: 'sticky',   value: 200 },
    { name: 'overlay',  value: 300 },
    { name: 'modal',    value: 400 },
    { name: 'toast',    value: 500 },
  ],
};

export const DEFAULT_CUSTOM_SCALE_CONFIG: CustomScaleConfig = {
  outputType: 'number',
  steps: [
    { name: 'sm',   index: -2, multiplier: 0.5  },
    { name: 'md',   index:  0, multiplier: 1    },
    { name: 'lg',   index:  2, multiplier: 2    },
  ],
  formula: 'base * multiplier',
  roundTo: 2,
};

// ---------------------------------------------------------------------------
// Quick-start templates (replace ScaffoldingWizard presets)
// ---------------------------------------------------------------------------

export const GENERATOR_TEMPLATES: GeneratorTemplate[] = [
  {
    id: 'spacing',
    label: 'Spacing scale',
    description: 'Multiplier-based spacing scale derived from a base unit',
    defaultPrefix: 'spacing',
    generatorType: 'spacingScale',
    requiresSource: true,
    config: DEFAULT_SPACING_SCALE_CONFIG,
  },
  {
    id: 'border-radius',
    label: 'Border radius scale',
    description: 'Rounded corner tokens from none to full, derived from a base radius',
    defaultPrefix: 'borderRadius',
    generatorType: 'borderRadiusScale',
    requiresSource: true,
    config: DEFAULT_BORDER_RADIUS_SCALE_CONFIG,
  },
  {
    id: 'typography',
    label: 'Typography scale',
    description: 'Font size scale using a ratio, derived from a base font size',
    defaultPrefix: 'fontSize',
    generatorType: 'typeScale',
    requiresSource: true,
    config: DEFAULT_TYPE_SCALE_CONFIG,
  },
  {
    id: 'z-index',
    label: 'Z-index layers',
    description: 'Semantic z-index layers (standalone, no source token needed)',
    defaultPrefix: 'zIndex',
    generatorType: 'zIndexScale',
    requiresSource: false,
    config: DEFAULT_Z_INDEX_SCALE_CONFIG,
  },
  {
    id: 'opacity',
    label: 'Opacity scale',
    description: 'Full opacity ramp from 0–100% (standalone, no source token needed)',
    defaultPrefix: 'opacity',
    generatorType: 'opacityScale',
    requiresSource: false,
    config: DEFAULT_OPACITY_SCALE_CONFIG,
  },
  {
    id: 'color-ramp',
    label: 'Color ramp',
    description: 'Perceptual 11-step color ramp derived from a source color token',
    defaultPrefix: 'colors',
    generatorType: 'colorRamp',
    requiresSource: true,
    config: DEFAULT_COLOR_RAMP_CONFIG,
  },
];
