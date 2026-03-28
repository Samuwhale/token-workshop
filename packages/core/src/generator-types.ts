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
  | 'customScale'
  | 'accessibleColorPair'
  | 'darkModeInversion'
  | 'responsiveScale'
  | 'contrastCheck';

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
// Accessible Color Pair
// ---------------------------------------------------------------------------

export interface AccessibleColorPairConfig {
  /** WCAG contrast level to target. Default: 'AA' (4.5:1 for normal text) */
  contrastLevel: 'AA' | 'AAA';
  /** Step name for the background output token. Default: 'background' */
  backgroundStep: string;
  /** Step name for the foreground output token. Default: 'foreground' */
  foregroundStep: string;
}

// ---------------------------------------------------------------------------
// Dark Mode Inversion
// ---------------------------------------------------------------------------

export interface DarkModeInversionConfig {
  /** Step name for the inverted output token. Default: 'dark' */
  stepName: string;
  /**
   * Chroma multiplier applied to the inverted color (0.1–2.0).
   * 1.0 = preserve chroma exactly. Values > 1 boost saturation. Default: 1.0
   */
  chromaBoost: number;
}

// ---------------------------------------------------------------------------
// Responsive Scale
// ---------------------------------------------------------------------------

export interface ResponsiveScaleStep {
  /** Semantic size name, e.g. 'sm', 'base', 'lg' */
  name: string;
  /** Multiplier applied to the source dimension value to get this step's value */
  multiplier: number;
}

export interface ResponsiveScaleConfig {
  steps: ResponsiveScaleStep[];
  unit: 'px' | 'rem';
}

// ---------------------------------------------------------------------------
// Contrast Check
// ---------------------------------------------------------------------------

export interface ContrastCheckStep {
  /** Semantic name for this color (e.g. "50", "primary", "accent") */
  name: string;
  /** Hex color string to check as the foreground (or swatch) color */
  hex: string;
}

export interface ContrastCheckConfig {
  /** Background color to compute contrast against. Default: '#ffffff' */
  backgroundHex: string;
  /** Colors to check */
  steps: ContrastCheckStep[];
  /** Which WCAG levels to enforce (shown in preview and warnings). Default: ['AA', 'AAA'] */
  levels: ('AA' | 'AAA')[];
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
  | CustomScaleConfig
  | AccessibleColorPairConfig
  | DarkModeInversionConfig
  | ResponsiveScaleConfig
  | ContrastCheckConfig;

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
  /**
   * When present, the generator runs once per row using each row's input value
   * as the source, writing to the set derived from `targetSetTemplate`.
   */
  inputTable?: InputTable;
  /**
   * Template for the target set name when `inputTable` is present.
   * `{brand}` is replaced with each row's `brand` slug.
   * e.g. "brands/{brand}" → "brands/berry", "brands/mango"
   * Falls back to `targetSet` when absent.
   */
  targetSetTemplate?: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Multi-brand input table
// ---------------------------------------------------------------------------

/** A single brand row in an InputTable. */
export interface InputTableRow {
  /** Slug used to substitute `{brand}` in `targetSetTemplate`, e.g. "berry". */
  brand: string;
  /**
   * Named inputs for this row. The key matching `InputTable.inputKey` is used
   * as the generator's source value (e.g. `{ brandColor: "#8B5CF6" }`).
   */
  inputs: Record<string, unknown>;
}

/**
 * A table of brand rows. Each row runs the generator independently and writes
 * to a brand-specific token set.
 */
export interface InputTable {
  /**
   * The column name whose value is used as the generator's source value for
   * each brand row, e.g. "brandColor".
   */
  inputKey: string;
  rows: InputTableRow[];
}

// ---------------------------------------------------------------------------
// Step name validation
// ---------------------------------------------------------------------------

/**
 * Validate that a step name forms a valid DTCG token path segment.
 * Step names are combined as `${targetGroup}.${stepName}` to form token paths,
 * so they must not contain dots (path separators), slashes, the reserved `$`
 * prefix, or be empty.
 *
 * Throws an Error with a descriptive message on failure.
 */
export function validateStepName(stepName: string): void {
  if (!stepName && stepName !== '0') {
    throw new Error('Step name must not be empty');
  }
  const s = String(stepName);
  if (s === '') {
    throw new Error('Step name must not be empty');
  }
  if (s.startsWith('$')) {
    throw new Error(
      `Invalid step name "${s}": starts with reserved "$" prefix`,
    );
  }
  if (s.includes('.')) {
    throw new Error(
      `Invalid step name "${s}": contains a dot, which would create nested path segments`,
    );
  }
  if (s.includes('/') || s.includes('\\')) {
    throw new Error(
      `Invalid step name "${s}": contains a slash`,
    );
  }
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
  /** Warning message when formula evaluation failed and value fell back to base */
  warning?: string;
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

export const DEFAULT_ACCESSIBLE_COLOR_PAIR_CONFIG: AccessibleColorPairConfig = {
  contrastLevel: 'AA',
  backgroundStep: 'background',
  foregroundStep: 'foreground',
};

export const DEFAULT_DARK_MODE_INVERSION_CONFIG: DarkModeInversionConfig = {
  stepName: 'dark',
  chromaBoost: 1.0,
};

export const DEFAULT_RESPONSIVE_SCALE_CONFIG: ResponsiveScaleConfig = {
  steps: [
    { name: 'sm',   multiplier: 0.75 },
    { name: 'base', multiplier: 1.0  },
    { name: 'md',   multiplier: 1.25 },
    { name: 'lg',   multiplier: 1.5  },
    { name: 'xl',   multiplier: 2.0  },
  ],
  unit: 'px',
};

export const DEFAULT_CONTRAST_CHECK_CONFIG: ContrastCheckConfig = {
  backgroundHex: '#ffffff',
  steps: [],
  levels: ['AA', 'AAA'],
};

