/**
 * Pure helper functions and constants for the token generator system.
 *
 * Extracted from TokenGeneratorDialog to break a circular dependency:
 *   useGeneratorDialog → TokenGeneratorDialog → useGeneratorDialog
 */
import type {
  GeneratorType,
  GeneratorConfig,
} from '../../hooks/useGenerators';

import { DEFAULT_COLOR_RAMP_CONFIG } from './ColorRampGenerator';
import { DEFAULT_TYPE_SCALE_CONFIG } from './TypeScaleGenerator';
import { DEFAULT_SPACING_SCALE_CONFIG } from './SpacingScaleGenerator';
import { DEFAULT_OPACITY_SCALE_CONFIG } from './OpacityScaleGenerator';
import { DEFAULT_BORDER_RADIUS_CONFIG } from './BorderRadiusGenerator';
import { DEFAULT_Z_INDEX_CONFIG } from './ZIndexGenerator';
import { DEFAULT_CUSTOM_CONFIG } from './CustomScaleGenerator';
import { DEFAULT_CONTRAST_CHECK_CONFIG } from './ContrastCheckGenerator';
import { DEFAULT_SHADOW_SCALE_CONFIG } from './ShadowScaleGenerator';

// ---------------------------------------------------------------------------
// Auto-detect helper
// ---------------------------------------------------------------------------

export function detectGeneratorType(sourceTokenType: string, sourceTokenValue: any): GeneratorType {
  if (sourceTokenType === 'color') return 'colorRamp';
  if (sourceTokenType === 'number') return 'opacityScale';
  if (sourceTokenType === 'dimension' || sourceTokenType === 'fontSize') {
    let numVal = 0;
    if (typeof sourceTokenValue === 'number') numVal = sourceTokenValue;
    else if (typeof sourceTokenValue === 'string') {
      numVal = parseFloat(sourceTokenValue) || 0;
    } else if (sourceTokenValue && typeof sourceTokenValue === 'object') {
      numVal = parseFloat(sourceTokenValue.value) || 0;
    }
    return numVal < 50 ? 'typeScale' : 'spacingScale';
  }
  return 'colorRamp';
}

export function suggestTargetGroup(sourceTokenPath: string, sourceTokenName?: string): string {
  if (sourceTokenName) {
    if (sourceTokenPath.length <= sourceTokenName.length) return sourceTokenPath;
    return sourceTokenPath.slice(0, sourceTokenPath.length - sourceTokenName.length - 1);
  }
  const parts = sourceTokenPath.split('.');
  if (parts.length <= 1) return sourceTokenPath;
  return parts.slice(0, -1).join('.');
}

export function autoName(sourceTokenPath: string | undefined, type: GeneratorType): string {
  // Use just the type label — the target group provides the context
  if (sourceTokenPath) {
    const parts = sourceTokenPath.split('.');
    const shortName = parts.length > 1 ? parts[parts.length - 2] : parts[0];
    return `${shortName.charAt(0).toUpperCase() + shortName.slice(1)} ${TYPE_LABELS[type]}`;
  }
  return TYPE_LABELS[type];
}

export function defaultConfigForType(type: GeneratorType): GeneratorConfig {
  switch (type) {
    case 'colorRamp': return { ...DEFAULT_COLOR_RAMP_CONFIG, steps: [...DEFAULT_COLOR_RAMP_CONFIG.steps] };
    case 'typeScale': return { ...DEFAULT_TYPE_SCALE_CONFIG, steps: DEFAULT_TYPE_SCALE_CONFIG.steps.map(s => ({ ...s })) };
    case 'spacingScale': return { ...DEFAULT_SPACING_SCALE_CONFIG, steps: DEFAULT_SPACING_SCALE_CONFIG.steps.map(s => ({ ...s })) };
    case 'opacityScale': return { steps: DEFAULT_OPACITY_SCALE_CONFIG.steps.map(s => ({ ...s })) };
    case 'borderRadiusScale': return { ...DEFAULT_BORDER_RADIUS_CONFIG, steps: DEFAULT_BORDER_RADIUS_CONFIG.steps.map(s => ({ ...s })) };
    case 'zIndexScale': return { steps: DEFAULT_Z_INDEX_CONFIG.steps.map(s => ({ ...s })) };
    case 'shadowScale': return { ...DEFAULT_SHADOW_SCALE_CONFIG, steps: DEFAULT_SHADOW_SCALE_CONFIG.steps.map(s => ({ ...s })) };
    case 'customScale': return { ...DEFAULT_CUSTOM_CONFIG, steps: DEFAULT_CUSTOM_CONFIG.steps.map(s => ({ ...s })) };
    case 'accessibleColorPair': return { contrastLevel: 'AA' as const, backgroundStep: 'bg', foregroundStep: 'fg' };
    case 'darkModeInversion': return { stepName: 'inverted', chromaBoost: 0 };
    case 'contrastCheck': return { ...DEFAULT_CONTRAST_CHECK_CONFIG, steps: [] };
  }
}

// Types that require a source token
/** Types that need a value (from source token OR inline input) */
export const VALUE_REQUIRED_TYPES: GeneratorType[] = ['colorRamp', 'typeScale', 'spacingScale', 'borderRadiusScale', 'accessibleColorPair', 'darkModeInversion'];
// Types that work standalone (no value at all)
export const STANDALONE_TYPES: GeneratorType[] = ['opacityScale', 'zIndexScale', 'shadowScale', 'contrastCheck'];
// Types that work either way
export const FLEXIBLE_TYPES: GeneratorType[] = ['customScale'];

/** Human-readable labels for every generator type. Canonical source of truth. */
export const TYPE_LABELS: Record<GeneratorType, string> = {
  colorRamp: 'Color Palette',
  typeScale: 'Font Size Scale',
  spacingScale: 'Spacing Scale',
  opacityScale: 'Opacity Scale',
  borderRadiusScale: 'Border Radius',
  zIndexScale: 'Z-Index',
  shadowScale: 'Shadow Scale',
  customScale: 'Custom Formula',
  accessibleColorPair: 'Contrast-Safe Pair',
  darkModeInversion: 'Dark Mode Variant',
  contrastCheck: 'Contrast Checker',
};

/** Primary generator types shown by default */
export const PRIMARY_TYPES: GeneratorType[] = [
  'colorRamp', 'typeScale', 'spacingScale', 'borderRadiusScale',
  'opacityScale', 'zIndexScale', 'shadowScale', 'customScale',
];
/** Advanced/niche generator types shown in a collapsible section */
export const ADVANCED_TYPES: GeneratorType[] = [
  'accessibleColorPair', 'darkModeInversion', 'contrastCheck',
];

export const ALL_TYPES: GeneratorType[] = [...PRIMARY_TYPES, ...ADVANCED_TYPES];

// ---------------------------------------------------------------------------
// Designer-friendly descriptions (Phase 1B: intent-based type selector)
// ---------------------------------------------------------------------------

/** One-line descriptions for each generator type, written for designers. */
export const TYPE_DESCRIPTIONS: Record<GeneratorType, string> = {
  colorRamp: 'Create a full color palette from a single base color',
  typeScale: 'Create a harmonious font size progression using a ratio',
  spacingScale: 'Build consistent spacing values from a base unit',
  opacityScale: 'Define a set of opacity levels for layering effects',
  borderRadiusScale: 'Create rounded corner values from small to large',
  zIndexScale: 'Set up stacking order values for layered components',
  shadowScale: 'Create elevation levels with progressive shadow depth',
  customScale: 'Write a custom formula to generate any numeric scale',
  accessibleColorPair: 'Create foreground + background colors that meet WCAG contrast',
  darkModeInversion: 'Create a dark mode version of a color with perceptual accuracy',
  contrastCheck: 'Check WCAG contrast ratios for a set of color pairs',
};

