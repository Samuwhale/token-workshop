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
  GeneratedTokenResult,
} from './generator-types.js';
import { hexToLab, labToHex } from './color-math.js';
import { evalExpr, substituteVars } from './eval-expr.js';

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
  const lab = hexToLab(sourceHex);
  if (!lab) return [];
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
    // Slight power curve so mid-tones are more evenly spaced
    const eased = Math.pow(t, 0.85);
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

  const baseStepDef = steps.find(s => s.name === baseStep);
  const baseExponent = baseStepDef?.exponent ?? 0;

  return steps.map(step => {
    const relativeExponent = step.exponent - baseExponent;
    const rawValue = sourceValue.value * Math.pow(ratio, relativeExponent);
    const rounded = parseFloat(rawValue.toFixed(roundTo));

    return {
      stepName: step.name,
      path: `${targetGroup}.${step.name}`,
      type: 'dimension',
      value: { value: rounded, unit: unit || sourceValue.unit },
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
  return config.steps.map(step => ({
    stepName: step.name,
    path: `${targetGroup}.${step.name}`,
    type: 'number',
    value: parseFloat((step.value / 100).toFixed(4)),
  }));
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
    try {
      const substituted = substituteVars(formula, vars);
      computed = evalExpr(substituted);
    } catch {
      computed = base;
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
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Accessible Color Pair
// ---------------------------------------------------------------------------

/**
 * Compute the WCAG relative luminance of a hex color.
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
function wcagLuminance(hex: string): number {
  const clean = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}/.test(clean)) return 0;
  const toLinear = (c: number) =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const r = toLinear(parseInt(clean.slice(0, 2), 16) / 255);
  const g = toLinear(parseInt(clean.slice(2, 4), 16) / 255);
  const b = toLinear(parseInt(clean.slice(4, 6), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

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
  const bgLum = wcagLuminance(sourceHex);

  // Contrast against white: (1.0 + 0.05) / (bgLum + 0.05)
  const contrastWithWhite = 1.05 / (bgLum + 0.05);
  // Contrast against black: (bgLum + 0.05) / (0.0 + 0.05)
  const contrastWithBlack = (bgLum + 0.05) / 0.05;

  const foreground = contrastWithWhite >= contrastWithBlack ? '#ffffff' : '#000000';

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
  const lab = hexToLab(sourceHex);
  if (!lab) return [];
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
