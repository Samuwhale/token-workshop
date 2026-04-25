/**
 * Token Generator types — definitions for live token group generators.
 *
 * A TokenGenerator describes a relationship between an optional source token
 * and a group of derived tokens that are automatically regenerated whenever
 * the source token changes. Standalone generators (zIndexScale, opacityScale,
 * customScale without a base) have no source token.
 */

import type { TokenType } from './types.js';
import type { DimensionUnit } from './constants.js';
import { getCollectionIdsForPath } from './collection-paths.js';

export type GeneratorType =
  | 'colorRamp'
  | 'typeScale'
  | 'spacingScale'
  | 'opacityScale'
  | 'borderRadiusScale'
  | 'zIndexScale'
  | 'shadowScale'
  | 'customScale'
  | 'darkModeInversion';

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
   * Cubic bezier control points for lightness distribution curve.
   * Format: [cx1, cy1, cx2, cy2] where (0,0) is start and (1,1) is end.
   * When absent, uses the default power curve (t^0.85).
   */
  lightnessCurve?: [number, number, number, number];
  /**
   * When true, one step is pinned so it reproduces the source color exactly.
   * The step to pin is specified by `sourceStep`.
   */
  includeSource: boolean;
  /** Step number to pin to the exact source color when `includeSource` is true. */
  sourceStep?: number;
  /**
   * Maps config field names to token paths for runtime resolution.
   * When a field has a tokenRef, the server resolves the token value and uses it
   * instead of the stored literal value when the generator runs.
   */
  $tokenRefs?: {
    lightEnd?: string;
    darkEnd?: string;
    chromaBoost?: string;
  };
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
  unit: DimensionUnit;
  /** Name of the step whose exponent is 0 (matches the source token's value). Default: "base" */
  baseStep: string;
  /** Number of decimal places to round each generated value to. Default: 1 */
  roundTo: number;
  /**
   * Maps config field names to token paths for runtime resolution.
   */
  $tokenRefs?: {
    ratio?: string;
  };
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
  unit: DimensionUnit;
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
  unit: DimensionUnit;
}

// ---------------------------------------------------------------------------
// Z-Index Scale
// ---------------------------------------------------------------------------

export interface ZIndexScaleConfig {
  /** Each step maps a semantic name to an explicit z-index number */
  steps: Array<{ name: string; value: number }>;
}

// ---------------------------------------------------------------------------
// Shadow Scale
// ---------------------------------------------------------------------------

export interface ShadowScaleStep {
  /** Human-readable name, e.g. "sm", "md", "lg", "xl", "2xl" */
  name: string;
  /** Horizontal offset in px (typically 0 for elevation shadows) */
  offsetX: number;
  /** Vertical offset in px */
  offsetY: number;
  /** Blur radius in px */
  blur: number;
  /** Spread radius in px (can be negative) */
  spread: number;
  /** Alpha opacity of the shadow color (0–1) */
  opacity: number;
}

export interface ShadowScaleConfig {
  steps: ShadowScaleStep[];
  /** Base shadow color as a 6-char hex (without alpha), e.g. "#000000". Default: "#000000" */
  color: string;
  /**
   * Maps config field names to token paths for runtime resolution.
   */
  $tokenRefs?: {
    color?: string;
  };
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
  outputType: TokenType;
  /** Unit appended for dimension outputs */
  unit?: DimensionUnit;
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
  /**
   * Maps config field names to token paths for runtime resolution.
   */
  $tokenRefs?: {
    chromaBoost?: string;
  };
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
  | ShadowScaleConfig
  | CustomScaleConfig
  | DarkModeInversionConfig;

export interface SemanticTokenMapping {
  semantic: string;
  step: string;
}

export interface GeneratorSemanticLayer {
  prefix: string;
  mappings: SemanticTokenMapping[];
  patternId?: string | null;
}

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
  /**
   * Collection that owns `sourceToken` when the same path exists in multiple collections.
   * When absent, source resolution falls back to the first matching collection.
   */
  sourceCollectionId?: string;
  /**
   * Inline base value used when no sourceToken is bound.
   * For color generators: a hex string (e.g. "#6366F1").
   * For dimension generators: a { value, unit } object (e.g. { value: 16, unit: "px" }).
   */
  inlineValue?: unknown;
  /** Name of the collection where derived tokens will be written */
  targetCollection: string;
  /**
   * Dot-delimited group prefix for all derived tokens,
   * e.g. "colors.brand" → tokens become "colors.brand.50", "colors.brand.100", …
   */
  targetGroup: string;
  config: GeneratorConfig;
  semanticLayer?: GeneratorSemanticLayer;
  /**
   * Absolute token paths that were explicitly detached from this generator.
   * Detached outputs stay manual and are skipped on future runs.
   */
  detachedPaths?: string[];
  /**
   * Per-step value overrides. Key = step name.
   * locked: true  → value survives regeneration
   * locked: false → one-time edit, cleared on next regeneration
   */
  overrides?: Record<string, { value: unknown; locked: boolean }>;
  /**
   * When false, the generator is disabled and will be skipped during auto-run cascades
   * triggered by source token changes. Manual re-runs still work.
   * Defaults to true (enabled) when absent.
   */
  enabled?: boolean;
  createdAt: string;
  updatedAt: string;
  /** ISO timestamp of the last successful run. Absent if the generator has never been run. */
  lastRunAt?: string;
  /**
   * Value of the source token at the time of the last successful run.
   * Compared against the current source token value to detect staleness.
   * Absent if the generator has never been run or has no source token.
   */
  lastRunSourceValue?: unknown;
  /**
   * Error from the most recent auto-run attempt.
   * Set when the generator failed or was blocked by an upstream failure.
   * Cleared on the next successful run. Persisted to disk so a server restart
   * does not reset error state and show stale "healthy" status in the UI.
   */
  lastRunError?: {
    message: string;
    /** ISO timestamp of when the error occurred. */
    at: string;
    /** Present when the generator was blocked by an upstream failure, not a direct failure.
     *  Contains the name of the upstream generator whose failure caused this skip. */
    blockedBy?: string;
  };
}

export interface GeneratorManagedOutput {
  collectionId: string;
  path: string;
  stepName: string;
  key: string;
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

export function createGeneratorOwnershipKey(
  collectionId: string,
  path: string,
): string {
  return `${collectionId}\u0000${path}`;
}

export function getGeneratorSourceCollectionIds(params: {
  sourceTokenPath?: string;
  sourceCollectionId?: string;
  pathToCollectionId?: Record<string, string>;
  collectionIdsByPath?: Record<string, string[]>;
}): string[] {
  const sourceTokenPath = params.sourceTokenPath?.trim();
  if (!sourceTokenPath) {
    return [];
  }

  const explicitCollectionId = params.sourceCollectionId?.trim();
  if (explicitCollectionId) {
    return [explicitCollectionId];
  }

  return getCollectionIdsForPath({
    path: sourceTokenPath,
    pathToCollectionId: params.pathToCollectionId,
    collectionIdsByPath: params.collectionIdsByPath,
  });
}

export function getGeneratorSourceCollectionId(params: {
  sourceTokenPath?: string;
  sourceCollectionId?: string;
  pathToCollectionId?: Record<string, string>;
  collectionIdsByPath?: Record<string, string[]>;
}): string | undefined {
  return getGeneratorSourceCollectionIds(params)[0];
}

export function createGeneratorSourceKeys(params: {
  sourceTokenPath?: string;
  sourceCollectionId?: string;
  pathToCollectionId?: Record<string, string>;
  collectionIdsByPath?: Record<string, string[]>;
}): string[] {
  const sourceTokenPath = params.sourceTokenPath?.trim();
  if (!sourceTokenPath) {
    return [];
  }

  const sourceCollectionIds = getGeneratorSourceCollectionIds(params);
  if (sourceCollectionIds.length === 0) {
    return [createGeneratorOwnershipKey("", sourceTokenPath)];
  }

  return sourceCollectionIds.map((collectionId) =>
    createGeneratorOwnershipKey(collectionId, sourceTokenPath),
  );
}

export function createGeneratorSourceKey(params: {
  sourceTokenPath?: string;
  sourceCollectionId?: string;
  pathToCollectionId?: Record<string, string>;
  collectionIdsByPath?: Record<string, string[]>;
}): string | undefined {
  return createGeneratorSourceKeys(params)[0];
}

export function hasGeneratorSourceKeyMatch(params: {
  sourceTokenPath?: string;
  sourceCollectionId?: string;
  targetSourceKeys: ReadonlySet<string>;
  pathToCollectionId?: Record<string, string>;
  collectionIdsByPath?: Record<string, string[]>;
}): boolean {
  if (params.targetSourceKeys.size === 0) {
    return false;
  }

  return createGeneratorSourceKeys(params).some((key) =>
    params.targetSourceKeys.has(key),
  );
}

export function getGeneratorConfigTokenRefs(
  config: GeneratorConfig | Record<string, unknown>,
): Record<string, string> {
  const configRecord = config as Record<string, unknown>;
  const refs = configRecord.$tokenRefs;
  if (!refs || typeof refs !== "object" || Array.isArray(refs)) {
    return {};
  }

  const normalizedRefs: Record<string, string> = {};
  for (const [field, value] of Object.entries(refs)) {
    if (typeof value !== "string") {
      continue;
    }
    const tokenPath = value.trim();
    if (!tokenPath) {
      continue;
    }
    normalizedRefs[field] = tokenPath;
  }
  return normalizedRefs;
}

export function getGeneratorStepNames(
  config: GeneratorConfig | Record<string, unknown>,
): string[] {
  const configRecord = config as Record<string, unknown>;
  if (Array.isArray(configRecord.steps)) {
    return configRecord.steps.map((step) =>
      typeof step === "object" && step !== null && "name" in step
        ? String((step as { name: unknown }).name)
        : String(step),
    );
  }
  if (
    typeof configRecord.backgroundStep === "string" &&
    typeof configRecord.foregroundStep === "string"
  ) {
    return [configRecord.backgroundStep, configRecord.foregroundStep];
  }
  if (typeof configRecord.stepName === "string") {
    return [configRecord.stepName];
  }
  return [];
}

export function getGeneratorManagedOutputs(
  generator: Pick<
    TokenGenerator,
    | "config"
    | "detachedPaths"
    | "targetGroup"
    | "targetCollection"
  >,
): GeneratorManagedOutput[] {
  const detachedPathSet = new Set(generator.detachedPaths ?? []);
  const stepNames = getGeneratorStepNames(generator.config);
  return stepNames.flatMap((stepName) => {
    const path = `${generator.targetGroup}.${stepName}`;
    if (detachedPathSet.has(path)) {
      return [];
    }
    return [
      {
        collectionId: generator.targetCollection,
        path,
        stepName,
        key: createGeneratorOwnershipKey(generator.targetCollection, path),
      },
    ];
  });
}

export function getGeneratorManagedOutputPaths(
  generator: Pick<
    TokenGenerator,
    | "config"
    | "detachedPaths"
    | "targetGroup"
    | "targetCollection"
  >,
): string[] {
  return [...new Set(getGeneratorManagedOutputs(generator).map((output) => output.path))];
}

export interface GeneratorGraphOutput extends GeneratorManagedOutput {
  kind: "step" | "semantic";
  /** Semantic name (without the layer prefix) when kind === "semantic". */
  semantic?: string;
}

export function getGeneratorOutputsForGraph(
  generator: Pick<
    TokenGenerator,
    | "config"
    | "detachedPaths"
    | "targetGroup"
    | "targetCollection"
    | "semanticLayer"
  >,
): GeneratorGraphOutput[] {
  const outputs = new Map<string, GeneratorGraphOutput>();
  for (const output of getGeneratorManagedOutputs(generator)) {
    outputs.set(output.key, { ...output, kind: "step" });
  }
  const layer = generator.semanticLayer;
  if (!layer || layer.mappings.length === 0) {
    return [...outputs.values()];
  }
  const detached = new Set(generator.detachedPaths ?? []);
  for (const mapping of layer.mappings) {
    const path = `${layer.prefix}.${mapping.semantic}`;
    if (detached.has(path)) continue;
    const output: GeneratorGraphOutput = {
      collectionId: generator.targetCollection,
      path,
      stepName: mapping.step,
      semantic: mapping.semantic,
      key: createGeneratorOwnershipKey(generator.targetCollection, path),
      kind: "semantic",
    };
    outputs.set(output.key, output);
  }
  return [...outputs.values()];
}

// ---------------------------------------------------------------------------
// Generated token output
// ---------------------------------------------------------------------------

export interface GeneratedTokenResult {
  /** Step name, e.g. "100", "sm", "2" */
  stepName: string;
  /** Full token path: `${targetGroup}.${stepName}` */
  path: string;
  /** DTCG token $type */
  type: TokenType;
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

export const DEFAULT_DARK_MODE_INVERSION_CONFIG: DarkModeInversionConfig = {
  stepName: 'dark',
  chromaBoost: 1.0,
};

export const DEFAULT_SHADOW_SCALE_CONFIG: ShadowScaleConfig = {
  color: '#000000',
  steps: [
    { name: 'sm',  offsetX: 0, offsetY: 1,  blur: 2,  spread: 0,  opacity: 0.05 },
    { name: 'md',  offsetX: 0, offsetY: 4,  blur: 6,  spread: -1, opacity: 0.1  },
    { name: 'lg',  offsetX: 0, offsetY: 10, blur: 15, spread: -3, opacity: 0.1  },
    { name: 'xl',  offsetX: 0, offsetY: 20, blur: 25, spread: -5, opacity: 0.1  },
    { name: '2xl', offsetX: 0, offsetY: 25, blur: 50, spread: -12, opacity: 0.25 },
  ],
};
