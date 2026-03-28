import type { ColorValue, GradientValue, TypographyValue, ShadowValue, DimensionValue } from '@tokenmanager/core';
import { parseColor, rgbToHex, parseDimValue, shadowTokenToEffects } from './colorUtils.js';
import { fontStyleToWeight, resolveStyleForWeight } from './fontLoading.js';

// ---------------------------------------------------------------------------
// Token shapes flowing into applyStyles — these carry a `path` field added by
// the caller (not part of the DTCG spec itself).
// ---------------------------------------------------------------------------

interface BaseStyleToken {
  path: string;
}

interface ColorStyleToken extends BaseStyleToken {
  $type: 'color';
  $value: ColorValue;
}

interface GradientStyleToken extends BaseStyleToken {
  $type: 'gradient';
  $value: GradientValue;
}

interface TypographyStyleToken extends BaseStyleToken {
  $type: 'typography';
  $value: TypographyValue;
}

interface ShadowStyleToken extends BaseStyleToken {
  $type: 'shadow';
  $value: ShadowValue | ShadowValue[];
}

export type StyleToken = ColorStyleToken | GradientStyleToken | TypographyStyleToken | ShadowStyleToken;

// ---------------------------------------------------------------------------
// Cached style lists — fetched once per applyStyles() call.
// ---------------------------------------------------------------------------

interface StyleCache {
  paintStyles: PaintStyle[];
  textStyles: TextStyle[];
  effectStyles: EffectStyle[];
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function applyStyles(tokens: StyleToken[], correlationId?: string) {
  // Fetch all local styles once upfront instead of per-token.
  const cache: StyleCache = {
    paintStyles: await figma.getLocalPaintStylesAsync(),
    textStyles: await figma.getLocalTextStylesAsync(),
    effectStyles: await figma.getLocalEffectStylesAsync(),
  };

  let successCount = 0;
  const failures: { path: string; error: string }[] = [];
  for (const token of tokens) {
    try {
      if (token.$type === 'color') {
        applyPaintStyle(token, cache);
      } else if (token.$type === 'gradient') {
        applyGradientPaintStyle(token, cache);
      } else if (token.$type === 'typography') {
        await applyTextStyle(token, cache);
      } else if (token.$type === 'shadow') {
        applyEffectStyle(token, cache);
      }
      successCount++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed to apply style for ${token.path}:`, error);
      failures.push({ path: token.path, error: message });
    }
  }
  figma.ui.postMessage({
    type: 'styles-applied',
    count: successCount,
    total: tokens.length,
    failures,
    correlationId,
  });
}

// ---------------------------------------------------------------------------
// Style name helper — tokens use dot-separated paths, Figma uses slashes
// ---------------------------------------------------------------------------

function tokenPathToStyleName(path: string): string {
  return path.replace(/\./g, '/');
}

// ---------------------------------------------------------------------------
// Per-type style applicators
// ---------------------------------------------------------------------------

function applyPaintStyle(token: ColorStyleToken, cache: StyleCache): void {
  const name = tokenPathToStyleName(token.path);
  let style = cache.paintStyles.find(s => s.name === name);
  if (!style) {
    style = figma.createPaintStyle();
    style.name = name;
    cache.paintStyles.push(style);
  }
  const color = parseColor(token.$value as string);
  if (color) {
    style.paints = [{ type: 'SOLID', color: color.rgb, opacity: color.a }];
  }
  style.setPluginData('tokenPath', token.path);
}

function applyGradientPaintStyle(token: GradientStyleToken, cache: StyleCache): void {
  const name = tokenPathToStyleName(token.path);
  let style = cache.paintStyles.find(s => s.name === name);
  if (!style) {
    style = figma.createPaintStyle();
    style.name = name;
    cache.paintStyles.push(style);
  }
  const stops = Array.isArray(token.$value) ? token.$value : [];
  const gradientStops: ColorStop[] = stops
    .map(stop => {
      const color = parseColor(stop.color as string);
      if (!color) return null;
      return { position: stop.position, color: { ...color.rgb, a: color.a } } as ColorStop;
    })
    .filter((s): s is ColorStop => s !== null);
  if (gradientStops.length >= 2) {
    style.paints = [{
      type: 'GRADIENT_LINEAR',
      gradientTransform: [[1, 0, 0], [0, 1, 0]],
      gradientStops,
      opacity: 1,
    } as GradientPaint];
  }
  style.setPluginData('tokenPath', token.path);
}

async function applyTextStyle(token: TypographyStyleToken, cache: StyleCache): Promise<void> {
  const name = tokenPathToStyleName(token.path);
  let style = cache.textStyles.find(s => s.name === name);
  if (!style) {
    style = figma.createTextStyle();
    style.name = name;
    cache.textStyles.push(style);
  }
  const val = token.$value;
  if (val.fontFamily) {
    const family = Array.isArray(val.fontFamily) ? val.fontFamily[0] : val.fontFamily;
    const fontStyle = val.fontWeight ? await resolveStyleForWeight(family, val.fontWeight) : 'Regular';
    await figma.loadFontAsync({ family, style: fontStyle });
    style.fontName = { family, style: fontStyle };
  } else if (val.fontSize || val.lineHeight || val.letterSpacing) {
    // Must load the existing font before modifying any text style properties
    await figma.loadFontAsync(style.fontName);
  }
  if (val.fontSize) {
    style.fontSize = typeof val.fontSize === 'object' ? (val.fontSize as DimensionValue).value : val.fontSize;
  }
  if (val.lineHeight) {
    if (typeof val.lineHeight === 'number') {
      // DTCG spec: unitless lineHeight is a multiplier (1.5 = 150%)
      style.lineHeight = { unit: 'PERCENT', value: val.lineHeight * 100 };
    } else if (val.lineHeight.unit === 'px') {
      style.lineHeight = { unit: 'PIXELS', value: val.lineHeight.value };
    } else if (val.lineHeight.unit === '%') {
      style.lineHeight = { unit: 'PERCENT', value: val.lineHeight.value };
    }
  }
  if (val.letterSpacing) {
    style.letterSpacing = {
      unit: 'PIXELS',
      value: typeof val.letterSpacing === 'object' ? (val.letterSpacing as DimensionValue).value : val.letterSpacing,
    };
  }
  style.setPluginData('tokenPath', token.path);
}

function applyEffectStyle(token: ShadowStyleToken, cache: StyleCache): void {
  const name = tokenPathToStyleName(token.path);
  let style = cache.effectStyles.find(s => s.name === name);
  if (!style) {
    style = figma.createEffectStyle();
    style.name = name;
    cache.effectStyles.push(style);
  }
  style.effects = shadowTokenToEffects(token.$value);
  style.setPluginData('tokenPath', token.path);
}

// ---------------------------------------------------------------------------
// Read styles from Figma (reverse direction)
// ---------------------------------------------------------------------------

interface ReadColorToken {
  path: string;
  $type: 'color';
  $value: string;
  _warning?: string;
}

interface ReadTypographyToken {
  path: string;
  $type: 'typography';
  $value: {
    fontFamily: string;
    fontSize: { value: number; unit: 'px' };
    fontWeight: number;
    lineHeight: { value: number; unit: 'px' } | number | 'auto';
    letterSpacing: { value: number; unit: 'px' };
    fontStyle: 'italic' | 'normal';
  };
}

interface ReadShadowToken {
  path: string;
  $type: 'shadow';
  $value: Array<{
    color: string;
    offsetX: { value: number; unit: 'px' };
    offsetY: { value: number; unit: 'px' };
    blur: { value: number; unit: 'px' };
    spread: { value: number; unit: 'px' };
    type: 'innerShadow' | 'dropShadow';
  }>;
}

type ReadStyleToken = ReadColorToken | ReadTypographyToken | ReadShadowToken;

export async function readFigmaStyles(correlationId?: string) {
  const tokens: ReadStyleToken[] = [];

  const paintStyles = await figma.getLocalPaintStylesAsync();
  for (const style of paintStyles) {
    if (style.paints.length === 0) continue;
    const visiblePaints = style.paints.filter(p => p.visible !== false);
    if (visiblePaints.length === 0) continue;

    const warnings: string[] = [];
    let hex: string | null = null;

    // Try to find a solid paint first
    const solidPaint = visiblePaints.find(p => p.type === 'SOLID') as SolidPaint | undefined;
    if (solidPaint) {
      hex = rgbToHex(solidPaint.color, solidPaint.opacity ?? 1);
    } else {
      // Fall back to first gradient stop
      const gradPaint = visiblePaints.find(p =>
        p.type === 'GRADIENT_LINEAR' || p.type === 'GRADIENT_RADIAL' ||
        p.type === 'GRADIENT_ANGULAR' || p.type === 'GRADIENT_DIAMOND'
      ) as GradientPaint | undefined;
      if (gradPaint && gradPaint.gradientStops.length > 0) {
        const stop = gradPaint.gradientStops[0];
        hex = rgbToHex(stop.color, stop.color.a ?? 1);
        warnings.push('Gradient converted to first stop color');
      }
    }

    if (!hex) continue;

    // Check for skipped paints
    const solidCount = visiblePaints.filter(p => p.type === 'SOLID').length;
    const gradientCount = visiblePaints.filter(p =>
      p.type === 'GRADIENT_LINEAR' || p.type === 'GRADIENT_RADIAL' ||
      p.type === 'GRADIENT_ANGULAR' || p.type === 'GRADIENT_DIAMOND'
    ).length;

    if (solidCount > 1) {
      warnings.push(`${solidCount - 1} additional solid fill(s) skipped`);
    }
    if (solidPaint && gradientCount > 0) {
      warnings.push(`${gradientCount} gradient fill(s) skipped`);
    } else if (!solidPaint && gradientCount > 1) {
      warnings.push(`${gradientCount - 1} additional gradient fill(s) skipped`);
    }
    const imgCount = visiblePaints.filter(p => p.type === 'IMAGE').length;
    if (imgCount > 0) {
      warnings.push(`${imgCount} image fill(s) skipped`);
    }

    const token: ReadColorToken = {
      path: style.name.replace(/\//g, '.'),
      $type: 'color',
      $value: hex,
    };
    if (warnings.length > 0) {
      token._warning = warnings.join('; ');
    }
    tokens.push(token);
  }

  const textStyles = await figma.getLocalTextStylesAsync();
  for (const style of textStyles) {
    tokens.push({
      path: style.name.replace(/\//g, '.'),
      $type: 'typography',
      $value: {
        fontFamily: style.fontName.family,
        fontSize: { value: style.fontSize, unit: 'px' },
        fontWeight: fontStyleToWeight(style.fontName.style),
        lineHeight: style.lineHeight.unit === 'PIXELS'
          ? { value: style.lineHeight.value, unit: 'px' }
          : style.lineHeight.unit === 'PERCENT'
          ? style.lineHeight.value / 100
          : 'auto',
        letterSpacing: { value: style.letterSpacing.value, unit: 'px' },
        fontStyle: style.fontName.style.toLowerCase().includes('italic') ? 'italic' : 'normal',
      },
    });
  }

  const effectStyles = await figma.getLocalEffectStylesAsync();
  for (const style of effectStyles) {
    const shadows = style.effects.filter(e => e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW');
    if (shadows.length > 0) {
      tokens.push({
        path: style.name.replace(/\//g, '.'),
        $type: 'shadow',
        $value: shadows.map(s => {
          const shadow = s as DropShadowEffect;
          return {
            color: rgbToHex(shadow.color, shadow.color.a),
            offsetX: { value: shadow.offset.x, unit: 'px' as const },
            offsetY: { value: shadow.offset.y, unit: 'px' as const },
            blur: { value: shadow.radius, unit: 'px' as const },
            spread: { value: shadow.spread || 0, unit: 'px' as const },
            type: s.type === 'INNER_SHADOW' ? 'innerShadow' as const : 'dropShadow' as const,
          };
        }),
      });
    }
  }

  figma.ui.postMessage({ type: 'styles-read', tokens, correlationId });
}
