/**
 * Recipe engine — pure computation functions for each recipe type.
 */

import type {
  ColorRampConfig,
  TypeScaleConfig,
  SpacingScaleConfig,
  OpacityScaleConfig,
  BorderRadiusScaleConfig,
  ZIndexScaleConfig,
  ShadowScaleConfig,
  CustomScaleConfig,
  AccessibleColorPairConfig,
  DarkModeInversionConfig,
  GeneratedTokenResult,
} from './recipe-types.js';
import { validateStepName } from './recipe-types.js';
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
export function runColorRampRecipe(
  sourceHex: string,
  config: ColorRampConfig,
  targetGroup: string,
): GeneratedTokenResult[] {
  // Validate step names before generating
  for (const step of config.steps) {
    validateStepName(String(step));
  }

  const lab = hexToLab(sourceHex);
  if (!lab) throw new Error(`Invalid hex color for colorRamp recipe: "${sourceHex}"`);
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
export function runTypeScaleRecipe(
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
  if (!baseStepDef) {
    throw new Error(
      `Type scale recipe: baseStep "${baseStep}" does not match any step name. ` +
        `Available steps: ${steps.map(s => s.name).join(', ')}.`,
    );
  }
  const baseExponent = baseStepDef.exponent;

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
export function runSpacingScaleRecipe(
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
    const { value: safeValue, warning } = sanitizeNumber(raw, sourceValue.value);
    const rounded = parseFloat(safeValue.toFixed(4));

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
// Opacity Scale
// ---------------------------------------------------------------------------

/**
 * Generate an opacity scale (independent of source token value).
 * Values are stored as fractions (0–1) per the DTCG `number` type.
 */
export function runOpacityScaleRecipe(
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
export function runBorderRadiusScaleRecipe(
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
    const { value: safeValue, warning } = sanitizeNumber(rawValue, sourceValue.value);
    const rounded = parseFloat(safeValue.toFixed(4));

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
// Z-Index Scale
// ---------------------------------------------------------------------------

/**
 * Generate a z-index scale (standalone, no source token).
 * Values are stored as DTCG `number` type.
 */
export function runZIndexScaleRecipe(
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
// Shadow Scale
// ---------------------------------------------------------------------------

/**
 * Generate an elevation/shadow scale (standalone, no source token).
 *
 * Each step produces a DTCG `shadow` token. The shadow color is the
 * configured base color with the step's opacity applied as alpha.
 */
export function runShadowScaleRecipe(
  config: ShadowScaleConfig,
  targetGroup: string,
): GeneratedTokenResult[] {
  const { steps, color } = config;

  // Validate step names before generating
  for (const step of steps) {
    validateStepName(step.name);
  }

  // Strip '#' and take first 6 hex digits as base color
  const base6 = color.replace('#', '').slice(0, 6).padStart(6, '0');

  return steps.map(step => {
    const warnings: string[] = [];

    const { value: safeOpacity, warning: wOp } = sanitizeNumber(step.opacity, 0);
    if (wOp) warnings.push(`opacity: ${wOp}`);
    const { value: safeOffsetX, warning: wX } = sanitizeNumber(step.offsetX, 0);
    if (wX) warnings.push(`offsetX: ${wX}`);
    const { value: safeOffsetY, warning: wY } = sanitizeNumber(step.offsetY, 0);
    if (wY) warnings.push(`offsetY: ${wY}`);
    const { value: safeBlur, warning: wB } = sanitizeNumber(step.blur, 0);
    if (wB) warnings.push(`blur: ${wB}`);
    const { value: safeSpread, warning: wS } = sanitizeNumber(step.spread, 0);
    if (wS) warnings.push(`spread: ${wS}`);

    const alpha = Math.round(Math.max(0, Math.min(1, safeOpacity)) * 255);
    const alphaHex = alpha.toString(16).padStart(2, '0');
    const shadowColor = `#${base6}${alphaHex}`;
    const warning = warnings.length ? warnings.join('; ') : undefined;

    return {
      stepName: step.name,
      path: `${targetGroup}.${step.name}`,
      type: 'shadow' as const,
      value: {
        color: shadowColor,
        offsetX: { value: safeOffsetX, unit: 'px' },
        offsetY: { value: safeOffsetY, unit: 'px' },
        blur:    { value: safeBlur,    unit: 'px' },
        spread:  { value: safeSpread,  unit: 'px' },
      },
      ...(warning ? { warning } : {}),
    };
  });
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
export function runCustomScaleRecipe(
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
export function runAccessibleColorPairRecipe(
  sourceHex: string,
  config: AccessibleColorPairConfig,
  targetGroup: string,
): GeneratedTokenResult[] {
  // Validate step names before generating
  validateStepName(config.backgroundStep);
  validateStepName(config.foregroundStep);

  const bgLum = wcagLuminance(sourceHex);
  if (bgLum === null) throw new Error(`Invalid hex color for accessibleColorPair recipe: "${sourceHex}"`);

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
export function runDarkModeInversionRecipe(
  sourceHex: string,
  config: DarkModeInversionConfig,
  targetGroup: string,
): GeneratedTokenResult[] {
  // Validate step name before generating
  validateStepName(config.stepName);

  const lab = hexToLab(sourceHex);
  if (!lab) throw new Error(`Invalid hex color for darkModeInversion recipe: "${sourceHex}"`);
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
// Override application
// ---------------------------------------------------------------------------

/**
 * Apply recipe-level overrides to computed results.
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
