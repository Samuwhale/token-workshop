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
  const typeLabels: Record<GeneratorType, string> = {
    colorRamp: 'Color Ramp',
    typeScale: 'Type Scale',
    spacingScale: 'Spacing Scale',
    opacityScale: 'Opacity Scale',
    borderRadiusScale: 'Border Radius Scale',
    zIndexScale: 'Z-Index Scale',
    customScale: 'Custom Scale',
    accessibleColorPair: 'Accessible Color Pair',
    darkModeInversion: 'Dark Mode Inversion',
    responsiveScale: 'Responsive Scale',
    contrastCheck: 'Contrast Check',
  };
  if (sourceTokenPath) return `${sourceTokenPath} ${typeLabels[type]}`;
  return typeLabels[type];
}

export function defaultConfigForType(type: GeneratorType): GeneratorConfig {
  switch (type) {
    case 'colorRamp': return { ...DEFAULT_COLOR_RAMP_CONFIG, steps: [...DEFAULT_COLOR_RAMP_CONFIG.steps] };
    case 'typeScale': return { ...DEFAULT_TYPE_SCALE_CONFIG, steps: DEFAULT_TYPE_SCALE_CONFIG.steps.map(s => ({ ...s })) };
    case 'spacingScale': return { ...DEFAULT_SPACING_SCALE_CONFIG, steps: DEFAULT_SPACING_SCALE_CONFIG.steps.map(s => ({ ...s })) };
    case 'opacityScale': return { steps: DEFAULT_OPACITY_SCALE_CONFIG.steps.map(s => ({ ...s })) };
    case 'borderRadiusScale': return { ...DEFAULT_BORDER_RADIUS_CONFIG, steps: DEFAULT_BORDER_RADIUS_CONFIG.steps.map(s => ({ ...s })) };
    case 'zIndexScale': return { steps: DEFAULT_Z_INDEX_CONFIG.steps.map(s => ({ ...s })) };
    case 'customScale': return { ...DEFAULT_CUSTOM_CONFIG, steps: DEFAULT_CUSTOM_CONFIG.steps.map(s => ({ ...s })) };
    case 'accessibleColorPair': return { contrastLevel: 'AA' as const, backgroundStep: 'bg', foregroundStep: 'fg' };
    case 'darkModeInversion': return { stepName: 'inverted', chromaBoost: 0 };
    case 'responsiveScale': return { steps: [{ name: 'sm', multiplier: 0.875 }, { name: 'lg', multiplier: 1.25 }], unit: 'rem' as const };
    case 'contrastCheck': return { ...DEFAULT_CONTRAST_CHECK_CONFIG, steps: [] };
  }
}

// Types that require a source token
export const SOURCE_REQUIRED_TYPES: GeneratorType[] = ['colorRamp', 'typeScale', 'spacingScale', 'borderRadiusScale', 'accessibleColorPair', 'darkModeInversion', 'responsiveScale'];
// Types that work standalone (no source)
export const STANDALONE_TYPES: GeneratorType[] = ['opacityScale', 'zIndexScale', 'contrastCheck'];
// Types that work either way
export const FLEXIBLE_TYPES: GeneratorType[] = ['customScale'];

export const ALL_TYPES: GeneratorType[] = [
  'colorRamp', 'typeScale', 'spacingScale', 'borderRadiusScale',
  'accessibleColorPair', 'darkModeInversion', 'responsiveScale',
  'opacityScale', 'zIndexScale', 'customScale', 'contrastCheck',
];
