/**
 * Pure helper functions and constants for the token recipe system.
 *
 * Extracted from TokenRecipeDialog to break a circular dependency:
 *   useRecipeDialog → TokenRecipeDialog → useRecipeDialog
 */
import type {
  RecipeType,
  RecipeConfig,
} from '../../hooks/useRecipes';

import { DEFAULT_COLOR_RAMP_CONFIG } from './ColorRampRecipe';
import { DEFAULT_TYPE_SCALE_CONFIG } from './TypeScaleRecipe';
import { DEFAULT_SPACING_SCALE_CONFIG } from './SpacingScaleRecipe';
import { DEFAULT_OPACITY_SCALE_CONFIG } from './OpacityScaleRecipe';
import { DEFAULT_BORDER_RADIUS_CONFIG } from './BorderRadiusRecipe';
import { DEFAULT_Z_INDEX_CONFIG } from './ZIndexRecipe';
import { DEFAULT_CUSTOM_CONFIG } from './CustomScaleRecipe';
import { DEFAULT_CONTRAST_CHECK_CONFIG } from './ContrastCheckRecipe';
import { DEFAULT_SHADOW_SCALE_CONFIG } from './ShadowScaleRecipe';

// ---------------------------------------------------------------------------
// Auto-detect helper
// ---------------------------------------------------------------------------

export function detectRecipeType(sourceTokenType: string, sourceTokenValue: any): RecipeType {
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

export function autoName(sourceTokenPath: string | undefined, type: RecipeType): string {
  // Use just the type label — the target group provides the context
  if (sourceTokenPath) {
    const parts = sourceTokenPath.split('.');
    const shortName = parts.length > 1 ? parts[parts.length - 2] : parts[0];
    return `${shortName.charAt(0).toUpperCase() + shortName.slice(1)} ${TYPE_LABELS[type]}`;
  }
  return TYPE_LABELS[type];
}

export function defaultConfigForType(type: RecipeType): RecipeConfig {
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
export const VALUE_REQUIRED_TYPES: RecipeType[] = ['colorRamp', 'typeScale', 'spacingScale', 'borderRadiusScale', 'accessibleColorPair', 'darkModeInversion'];
// Types that work standalone (no value at all)
export const STANDALONE_TYPES: RecipeType[] = ['opacityScale', 'zIndexScale', 'shadowScale', 'contrastCheck'];
// Types that work either way
export const FLEXIBLE_TYPES: RecipeType[] = ['customScale'];

/** Human-readable labels for every recipe type. Canonical source of truth. */
export const TYPE_LABELS: Record<RecipeType, string> = {
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

/** Primary recipe types shown by default */
export const PRIMARY_TYPES: RecipeType[] = [
  'colorRamp', 'typeScale', 'spacingScale', 'borderRadiusScale',
  'opacityScale', 'zIndexScale', 'shadowScale', 'customScale',
];
/** Advanced/niche recipe types shown in a collapsible section */
export const ADVANCED_TYPES: RecipeType[] = [
  'accessibleColorPair', 'darkModeInversion', 'contrastCheck',
];

export const ALL_TYPES: RecipeType[] = [...PRIMARY_TYPES, ...ADVANCED_TYPES];

// ---------------------------------------------------------------------------
// Designer-friendly descriptions (Phase 1B: intent-based type selector)
// ---------------------------------------------------------------------------

/** One-line descriptions for each recipe type, written for designers. */
export const TYPE_DESCRIPTIONS: Record<RecipeType, string> = {
  colorRamp: 'Create a full color palette from a single base color',
  typeScale: 'Create a harmonious font size progression using a ratio',
  spacingScale: 'Build consistent spacing values from a base unit',
  opacityScale: 'Define a set of opacity levels for layering effects',
  borderRadiusScale: 'Create rounded corner values from small to large',
  zIndexScale: 'Set up stacking order values for layered components',
  shadowScale: 'Create elevation levels with progressive shadow depth',
  customScale: 'Write a custom formula to create any numeric scale',
  accessibleColorPair: 'Create foreground + background colors that meet WCAG contrast',
  darkModeInversion: 'Create a dark mode version of a color with perceptual accuracy',
  contrastCheck: 'Check WCAG contrast ratios for a set of color pairs',
};

