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

export function getSingleObviousRecipeType(
  sourceTokenType: string | undefined,
  sourceTokenPath?: string,
  sourceTokenName?: string,
  sourceTokenValue?: unknown,
): RecipeType | undefined {
  switch (sourceTokenType) {
    case 'color':
      return 'colorRamp';
    case 'fontSize':
      return 'typeScale';
    case 'dimension': {
      const label = `${sourceTokenPath ?? ''}.${sourceTokenName ?? ''}`.toLowerCase();
      if (/(font|type|text|heading|body|display|title)/.test(label)) {
        return 'typeScale';
      }
      if (/(space|spacing|gap|padding|margin|inset|offset)/.test(label)) {
        return 'spacingScale';
      }
      return sourceTokenValue === undefined
        ? undefined
        : detectRecipeType(sourceTokenType, sourceTokenValue);
    }
    case 'number':
      return sourceTokenValue === undefined
        ? undefined
        : detectRecipeType(sourceTokenType, sourceTokenValue);
    default:
      return undefined;
  }
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
    case 'darkModeInversion': return { stepName: 'inverted', chromaBoost: 0 };
  }
}

export function defaultInlineValueForType(type: RecipeType): unknown {
  switch (type) {
    case 'colorRamp':
    case 'darkModeInversion':
      return '#ffffff';
    case 'typeScale':
    case 'spacingScale':
    case 'borderRadiusScale':
      return { value: 16, unit: 'px' };
    default:
      return undefined;
  }
}

export function isInlineValueCompatibleWithType(type: RecipeType, value: unknown): boolean {
  switch (type) {
    case 'colorRamp':
    case 'darkModeInversion':
      return typeof value === 'string' && value.trim().length > 0;
    case 'typeScale':
    case 'spacingScale':
    case 'borderRadiusScale':
      return (
        typeof value === 'object' &&
        value !== null &&
        'value' in (value as Record<string, unknown>) &&
        Number.isFinite(Number((value as { value: unknown }).value))
      );
    default:
      return true;
  }
}

// Types that require a source token
/** Types that need a value (from source token OR inline input) */
export const VALUE_REQUIRED_TYPES: RecipeType[] = ['colorRamp', 'typeScale', 'spacingScale', 'borderRadiusScale', 'darkModeInversion'];
// Types that work standalone (no value at all)
export const STANDALONE_TYPES: RecipeType[] = ['opacityScale', 'zIndexScale', 'shadowScale'];
// Types that work either way
export const FLEXIBLE_TYPES: RecipeType[] = ['customScale'];

/** Human-readable labels for every recipe type. Canonical source of truth. */
export const TYPE_LABELS: Record<RecipeType, string> = {
  colorRamp: 'Palette',
  typeScale: 'Type Scale',
  spacingScale: 'Spacing Scale',
  opacityScale: 'Opacity Scale',
  borderRadiusScale: 'Radius Scale',
  zIndexScale: 'Layer Order Scale',
  shadowScale: 'Shadow Scale',
  customScale: 'Custom Scale',
  darkModeInversion: 'Dark Mode Variant',
};

/** Primary recipe types shown by default */
export const PRIMARY_TYPES: RecipeType[] = [
  'colorRamp', 'typeScale', 'spacingScale', 'borderRadiusScale',
  'opacityScale', 'zIndexScale', 'shadowScale', 'customScale',
];
/** Advanced/niche recipe types shown in a collapsible section */
export const ADVANCED_TYPES: RecipeType[] = [
  'darkModeInversion',
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
  darkModeInversion: 'Create a dark mode version of a color with perceptual accuracy',
};
