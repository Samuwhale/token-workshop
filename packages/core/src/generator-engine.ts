/**
 * Generator engine — pure computation functions for each generator type.
 */

import type {
  ColorRampConfig,
  TypeScaleConfig,
  SpacingScaleConfig,
  OpacityScaleConfig,
  BorderRadiusScaleConfig,
  ZIndexScaleConfig,
  CustomScaleConfig,
  AccessibleColorPairConfig,
  DarkModeInversionConfig,
  ResponsiveScaleConfig,
  ContrastCheckConfig,
  GeneratedTokenResult,
} from './generator-types.js';
import { validateStepName } from './generator-types.js';
import { hexToLab, labToHex, wcagLuminance } from './color-math.js';
import { evalExpr, substituteVars } from './eval-expr.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Evaluate a cubic bezier curve at a given x value.
 * The curve is defined by control points (0,0), (cx1,cy1), (cx2,cy2), (1,1).
 * Uses Newton-Raphson with bisection fallback to solve x -> t, then evaluates y(t).
 */
function evaluateCubicBezier(x: number, cx1: number, cy1: number, cx2: number, cy2: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  // Bezier x(t) = 3(1-t)^2*t*cx1 + 3(1-t)*t^2*cx2 + t^3
  const xAt = (t: number) => {
    const t1 = 1 - t;
    return 3 * t1 * t1 * t * cx1 + 3 * t1 * t * t * cx2 + t * t * t;
  };
  // dx/dt
  const dxAt = (t: number) => {
    const t1 = 1 - t;
    return 3 * t1 * t1 * cx1 + 6 * t1 * t * (cx2 - cx1) + 3 * t * t * (1 - cx2);
  };

  // Newton-Raphson to find t for given x
  let t = x; // initial guess
  for (let i = 0; i < 8; i++) {
    const err = xAt(t) - x;
    if (Math.abs(err) < 1e-7) break;
    const d = dxAt(t);
    if (Math.abs(d) < 1e-7) break;
    t -= err / d;
  }

  // Bisection fallback if Newton went out of range
  if (t < 0 || t > 1) {
    let lo = 0, hi = 1;
    t = x;
    for (let i = 0; i < 20; i++) {
      const val = xAt(t);
      if (Math.abs(val - x) < 1e-7) break;
      if (val < x) lo = t; else hi = t;
      t = (lo + hi) / 2;
    }
  }

  // Evaluate y(t)
  const t1 = 1 - t;
  return 3 * t1 * t1 * t * cy1 + 3 * t1 * t * t * cy2 + t * t * t;
}

/** Clamp non-finite values (Infinity, -Infinity, NaN) to a fallback. */
function sanitizeNumber(
  value: number,
  fallback: number,
): { value: number; warning?: string } {
  if (Number.isNaN(value)) {
    return { value: fallback, warning: `Formula produced NaN — fell back to ${fallback}` };
  }
  if (!Number.isFinite(value)) {
    return { value: fallback, warning: `Formula produced ${value > 0 ? 'Infinity' : '-Infinity'} — fell back to ${fallback}` };
  }
  return { value };
}

// ---------------------------------------------------------------------------
// Color Ramp
// ---------------------------------------------------------------------------

/**
 * Generate a perceptual color ramp from a single source hex color.
 *
 * Uses CIELAB interpolation: hue (a*, b*) is preserved from the source while
 * lightness (L*) sweeps from `lightEnd` to `darkEnd`. A bell-shaped chroma
 * factor keeps colors vivid in the mid-tones and desaturated at the extremes.
 */
export function runColorRampGenerator(
  sourceHex: string,
  config: ColorRampConfig,
  targetGroup: string,
): GeneratedTokenResult[] {
  // Validate step names before generating
  for (const step of config.steps) {
    validateStepName(String(step));
  }

  const lab = hexToLab(sourceHex);
  if (!lab) throw new Error(`Invalid hex color for colorRamp generator: "${sourceHex}"`);
  const [, bA, bB] = lab;

  const { steps, lightEnd, darkEnd, chromaBoost, includeSource, sourceStep } = config;
  const n = steps.length;

  return steps.map((step, i) => {
    const stepStr = String(step);
    const fullPath = `${targetGroup}.${stepStr}`;

    // Pin to exact source color if requested
    if (includeSource && sourceStep !== undefined && step === sourceStep) {
      return { stepName: stepStr, path: fullPath, type: 'color', value: sourceHex };
    }

    const t = n > 1 ? i / (n - 1) : 0.5;
    // Use bezier curve if provided, otherwise legacy power curve
    const eased = config.lightnessCurve
      ? evaluateCubicBezier(t, config.lightnessCurve[0], config.lightnessCurve[1], config.lightnessCurve[2], config.lightnessCurve[3])
      : Math.pow(t, 0.85);
    const L = lightEnd - eased * (lightEnd - darkEnd);
    // Bell-shaped chroma factor: peaks around t≈0.4, tapers to near-zero at both ends
    const chromaFactor = Math.min(1, 4.5 * t * (1 - t) * 1.5) * chromaBoost;
    const a = bA * chromaFactor;
    const b = bB * chromaFactor;

    return { stepName: stepStr, path: fullPath, type: 'color', value: labToHex(L, a, b) };
  });
}

// ---------------------------------------------------------------------------
// Type Scale
// ---------------------------------------------------------------------------

/**
 * Generate a typographic scale from a source font-size token.
 *
 * Each step is computed as: `sourceValue × ratio^(step.exponent - baseExponent)`
 */
export function runTypeScaleGenerator(
  sourceValue: { value: number; unit: string },
  config: TypeScaleConfig,
  targetGroup: string,
): GeneratedTokenResult[] {
  const { steps, ratio, unit, baseStep, roundTo } = config;

  // Validate step names before generating
  for (const step of steps) {
    validateStepName(step.name);
  }

  const baseStepDef = steps.find(s => s.name === baseStep);
  const baseExponent = baseStepDef?.exponent ?? 0;

  return steps.map(step => {
    const relativeExponent = step.exponent - baseExponent;
    const rawValue = sourceValue.value * Math.pow(ratio, relativeExponent);
    const { value: safeValue, warning } = sanitizeNumber(rawValue, sourceValue.value);
    const rounded = parseFloat(safeValue.toFixed(roundTo));

    return {
      stepName: step.name,
      path: `${targetGroup}.${step.name}`,
      type: 'dimension',
      value: { value: rounded, unit: unit || sourceValue.unit },
      ...(warning ? { warning } : {}),
    };
  });
}

// ---------------------------------------------------------------------------
// Spacing Scale
// ---------------------------------------------------------------------------

/**
 * Generate a spacing scale from a source dimension token.
 *
 * Each step value = `sourceValue × step.multiplier`.
 */
export function runSpacingScaleGenerator(
  sourceValue: { value: number; unit: string },
  config: SpacingScaleConfig,
  targetGroup: string,
): GeneratedTokenResult[] {
  const { steps, unit } = config;

  // Validate step names before generating
  for (const step of steps) {
    validateStepName(step.name);
  }

  return steps.map(step => {
    const raw = sourceValue.value * step.multiplier;
    const rounded = parseFloat(raw.toFixed(4));

    return {
      stepName: step.name,
      path: `${targetGroup}.${step.name}`,
      type: 'dimension',
      value: { value: rounded, unit: unit || sourceValue.unit },
    };
  });
}

// ---------------------------------------------------------------------------
// Opacity Scale
// ---------------------------------------------------------------------------

/**
 * Generate an opacity scale (independent of source token value).
 * Values are stored as fractions (0–1) per the DTCG `number` type.
 */
export function runOpacityScaleGenerator(
  config: OpacityScaleConfig,
  targetGroup: string,
): GeneratedTokenResult[] {
  // Validate step names before generating
  for (const step of config.steps) {
    validateStepName(step.name);
  }

  return config.steps.map(step => {
    const clamped = Math.min(1, Math.max(0, step.value / 100));
    return {
      stepName: step.name,
      path: `${targetGroup}.${step.name}`,
      type: 'number',
      value: parseFloat(clamped.toFixed(4)),
    };
  });
}

// ---------------------------------------------------------------------------
// Border Radius Scale
// ---------------------------------------------------------------------------

/**
 * Generate a border radius scale from a source dimension token.
 *
 * Steps with `exactValue` use that fixed pixel value directly.
 * Other steps compute `sourceValue × step.multiplier`.
 */
export function runBorderRadiusScaleGenerator(
  sourceValue: { value: number; unit: string },
  config: BorderRadiusScaleConfig,
  targetGroup: string,
): GeneratedTokenResult[] {
  const { steps, unit } = config;

  // Validate step names before generating
  for (const step of steps) {
    validateStepName(step.name);
  }

  return steps.map(step => {
    const rawValue =
      step.exactValue !== undefined
        ? step.exactValue
        : sourceValue.value * step.multiplier;
    const rounded = parseFloat(rawValue.toFixed(4));

    return {
      stepName: step.name,
      path: `${targetGroup}.${step.name}`,
      type: 'dimension',
      value: { value: rounded, unit: unit || sourceValue.unit },
    };
  });
}

// ---------------------------------------------------------------------------
// Z-Index Scale
// ---------------------------------------------------------------------------

/**
 * Generate a z-index scale (standalone, no source token).
 * Values are stored as DTCG `number` type.
 */
export function runZIndexScaleGenerator(
  config: ZIndexScaleConfig,
  targetGroup: string,
): GeneratedTokenResult[] {
  // Validate step names before generating
  for (const step of config.steps) {
    validateStepName(step.name);
  }

  return config.steps.map(step => ({
    stepName: step.name,
    path: `${targetGroup}.${step.name}`,
    type: 'number',
    value: step.value,
  }));
}

// ---------------------------------------------------------------------------
// Custom Scale
// ---------------------------------------------------------------------------

/**
 * Generate a custom scale using a user-defined formula.
 *
 * Variables available in the formula:
 * - `base`       — resolved source value (0 if no source token)
 * - `index`      — signed step index relative to base (0 = base step)
 * - `multiplier` — per-step multiplier (defaults to 1 if not set)
 * - `prev`       — value computed for the previous step (same as base for first step)
 */
export function runCustomScaleGenerator(
  sourceValue: number | undefined,
  config: CustomScaleConfig,
  targetGroup: string,
): GeneratedTokenResult[] {
  const { steps, formula, roundTo, outputType, unit } = config;
  const base = sourceValue ?? 0;

  // Validate step names before generating
  for (const step of steps) {
    validateStepName(step.name);
  }

  // Sort steps by index so `prev` is always available
  const sorted = [...steps].sort((a, b) => a.index - b.index);

  let prev = base;
  const results: GeneratedTokenResult[] = [];

  for (const step of sorted) {
    const vars: Record<string, number> = {
      base,
      index: step.index,
      multiplier: step.multiplier ?? 1,
      prev,
    };

    let computed: number;
    let warning: string | undefined;
    try {
      const substituted = substituteVars(formula, vars);
      computed = evalExpr(substituted);
      const sanitized = sanitizeNumber(computed, base);
      computed = sanitized.value;
      if (sanitized.warning) warning = sanitized.warning;
    } catch (err) {
      computed = base;
      warning = `Formula error: ${err instanceof Error ? err.message : String(err)} — fell back to base (${base})`;
    }

    const rounded = parseFloat(computed.toFixed(roundTo));
    prev = rounded;

    const value =
      outputType === 'dimension' && unit
        ? { value: rounded, unit }
        : rounded;

    results.push({
      stepName: step.name,
      path: `${targetGroup}.${step.name}`,
      type: outputType,
      value,
      ...(warning ? { warning } : {}),
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Accessible Color Pair
// ---------------------------------------------------------------------------

/**
 * Generate a background + foreground color pair where the foreground meets
 * the configured WCAG contrast level against the background.
 *
 * Foreground is chosen from black or white — whichever achieves the higher
 * contrast ratio. Both are always valid for WCAG AA (4.5:1) and AAA (7:1)
 * for the vast majority of background colors.
 */
export function runAccessibleColorPairGenerator(
  sourceHex: string,
  config: AccessibleColorPairConfig,
  targetGroup: string,
): GeneratedTokenResult[] {
  // Validate step names before generating
  validateStepName(config.backgroundStep);
  validateStepName(config.foregroundStep);

  const bgLum = wcagLuminance(sourceHex);
  if (bgLum === null) throw new Error(`Invalid hex color for accessibleColorPair generator: "${sourceHex}"`);

  // Contrast against white: (1.0 + 0.05) / (bgLum + 0.05)
  const contrastWithWhite = 1.05 / (bgLum + 0.05);
  // Contrast against black: (bgLum + 0.05) / (0.0 + 0.05)
  const contrastWithBlack = (bgLum + 0.05) / 0.05;

  const foreground = contrastWithWhite >= contrastWithBlack ? '#ffffff' : '#000000';
  const achievedContrast = Math.max(contrastWithWhite, contrastWithBlack);
  const threshold = config.contrastLevel === 'AAA' ? 7.0 : 4.5;

  return [
    {
      stepName: config.backgroundStep,
      path: `${targetGroup}.${config.backgroundStep}`,
      type: 'color',
      value: sourceHex,
    },
    {
      stepName: config.foregroundStep,
      path: `${targetGroup}.${config.foregroundStep}`,
      type: 'color',
      value: foreground,
      isOverridden: achievedContrast < threshold,
    },
  ];
}

// ---------------------------------------------------------------------------
// Dark Mode Inversion
// ---------------------------------------------------------------------------

/**
 * Generate a perceptual dark-mode equivalent of a source color by inverting
 * its CIELAB L* value (100 - L*) while preserving hue and chroma.
 *
 * This produces a dark-mode color that is perceptually symmetric to the
 * source: a light background becomes a dark background, a vibrant accent
 * remains vibrant, etc.
 */
export function runDarkModeInversionGenerator(
  sourceHex: string,
  config: DarkModeInversionConfig,
  targetGroup: string,
): GeneratedTokenResult[] {
  // Validate step name before generating
  validateStepName(config.stepName);

  const lab = hexToLab(sourceHex);
  if (!lab) throw new Error(`Invalid hex color for darkModeInversion generator: "${sourceHex}"`);
  const [L, a, b] = lab;

  const invertedL = 100 - L;
  const invertedHex = labToHex(invertedL, a * config.chromaBoost, b * config.chromaBoost);

  return [{
    stepName: config.stepName,
    path: `${targetGroup}.${config.stepName}`,
    type: 'color',
    value: invertedHex,
  }];
}

// ---------------------------------------------------------------------------
// Responsive Scale
// ---------------------------------------------------------------------------

/**
 * Generate a set of responsive size tokens (sm/base/md/lg/xl) from a source
 * dimension token. Each step value = `sourceValue × step.multiplier`.
 *
 * This is the semantic-naming counterpart to `spacingScale`: where a spacing
 * scale uses numeric multipliers (0.5, 1, 2, …), a responsive scale uses
 * intent-named steps (sm, base, md, lg, xl).
 */
export function runResponsiveScaleGenerator(
  sourceValue: { value: number; unit: string },
  config: ResponsiveScaleConfig,
  targetGroup: string,
): GeneratedTokenResult[] {
  // Validate step names before generating
  for (const step of config.steps) {
    validateStepName(step.name);
  }

  return config.steps.map(step => {
    const raw = sourceValue.value * step.multiplier;
    const rounded = parseFloat(raw.toFixed(4));
    return {
      stepName: step.name,
      path: `${targetGroup}.${step.name}`,
      type: 'dimension',
      value: { value: rounded, unit: config.unit || sourceValue.unit },
    };
  });
}

// ---------------------------------------------------------------------------
// Contrast Check
// ---------------------------------------------------------------------------

/**
 * Compute WCAG contrast ratio for each step color against the background.
 *
 * Outputs one `number` token per step containing the contrast ratio (e.g. 4.54).
 * The `isOverridden` flag is set to true when the step fails AA (ratio < 4.5),
 * so callers can use it as a failure indicator without an extra pass.
 */
export function runContrastCheckGenerator(
  config: ContrastCheckConfig,
  targetGroup: string,
): GeneratedTokenResult[] {
  const { backgroundHex, steps, levels } = config;

  // Validate step names before generating
  for (const step of steps) {
    validateStepName(step.name);
  }

  const bgLum = wcagLuminance(backgroundHex);
  // Use the strictest configured level as the failure threshold.
  // levels includes 'AAA' → 7.0:1; levels includes only 'AA' → 4.5:1; default → 4.5:1
  const failThreshold = levels?.includes('AAA') ? 7.0 : 4.5;

  return steps.map(step => {
    const fgLum = wcagLuminance(step.hex);
    let ratio: number | null = null;
    if (fgLum !== null && bgLum !== null) {
      const [lighter, darker] = fgLum > bgLum ? [fgLum, bgLum] : [bgLum, fgLum];
      ratio = parseFloat(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
    }

    return {
      stepName: step.name,
      path: `${targetGroup}.${step.name}`,
      type: 'number',
      value: ratio ?? 1,
      // Re-use isOverridden as a "contrast failure" flag so the UI can show warnings
      // without adding a new field to GeneratedTokenResult
      isOverridden: ratio === null || ratio < failThreshold,
    };
  });
}

// ---------------------------------------------------------------------------
// Override application
// ---------------------------------------------------------------------------

/**
 * Apply generator-level overrides to computed results.
 * Steps with `locked: true` have their value replaced with the override.
 * Steps with `locked: false` have the override applied once, then cleared
 * (caller is responsible for removing the override after use).
 */
export function applyOverrides(
  results: GeneratedTokenResult[],
  overrides?: Record<string, { value: unknown; locked: boolean }>,
): GeneratedTokenResult[] {
  if (!overrides) return results;
  return results.map(result => {
    const override = overrides[result.stepName];
    if (!override) return result;
    return { ...result, value: override.value, isOverridden: true };
  });
}
