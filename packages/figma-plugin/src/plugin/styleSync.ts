import { parseColor, rgbToHex, parseDimValue } from './colorUtils.js';
import { fontStyleToWeight, resolveStyleForWeight } from './fontLoading.js';

export async function applyStyles(tokens: any[]) {
  for (const token of tokens) {
    try {
      if (token.$type === 'color') {
        await applyPaintStyle(token);
      } else if (token.$type === 'gradient') {
        await applyGradientPaintStyle(token);
      } else if (token.$type === 'typography') {
        await applyTextStyle(token);
      } else if (token.$type === 'shadow') {
        await applyEffectStyle(token);
      }
    } catch (error) {
      console.error(`Failed to apply style for ${token.path}:`, error);
    }
  }
  figma.ui.postMessage({ type: 'styles-applied', count: tokens.length });
}

async function applyPaintStyle(token: any) {
  const styles = await figma.getLocalPaintStylesAsync();
  let style = styles.find(s => s.name === token.path.replace(/\./g, '/'));
  if (!style) {
    style = figma.createPaintStyle();
    style.name = token.path.replace(/\./g, '/');
  }
  const color = parseColor(token.$value);
  if (color) {
    style.paints = [{ type: 'SOLID', color: color.rgb, opacity: color.a }];
  }
  style.setPluginData('tokenPath', token.path);
}

async function applyGradientPaintStyle(token: any) {
  const styles = await figma.getLocalPaintStylesAsync();
  let style = styles.find(s => s.name === token.path.replace(/\./g, '/'));
  if (!style) {
    style = figma.createPaintStyle();
    style.name = token.path.replace(/\./g, '/');
  }
  const stops: Array<{ color: string; position: number }> = Array.isArray(token.$value) ? token.$value : [];
  const gradientStops: ColorStop[] = stops
    .map(stop => {
      const color = parseColor(stop.color);
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

async function applyTextStyle(token: any) {
  const styles = await figma.getLocalTextStylesAsync();
  let style = styles.find(s => s.name === token.path.replace(/\./g, '/'));
  if (!style) {
    style = figma.createTextStyle();
    style.name = token.path.replace(/\./g, '/');
  }
  const val = token.$value;
  if (val.fontFamily) {
    const family = Array.isArray(val.fontFamily) ? val.fontFamily[0] : val.fontFamily;
    const fontStyle = val.fontWeight ? await resolveStyleForWeight(family, val.fontWeight) : (val.fontStyle || 'Regular');
    await figma.loadFontAsync({ family, style: fontStyle });
    style.fontName = { family, style: fontStyle };
  }
  if (val.fontSize) style.fontSize = typeof val.fontSize === 'object' ? val.fontSize.value : val.fontSize;
  if (val.lineHeight) {
    if (typeof val.lineHeight === 'number') {
      style.lineHeight = { unit: 'PERCENT', value: val.lineHeight * 100 };
    } else if (val.lineHeight.unit === 'px') {
      style.lineHeight = { unit: 'PIXELS', value: val.lineHeight.value };
    }
  }
  if (val.letterSpacing) {
    style.letterSpacing = { unit: 'PIXELS', value: typeof val.letterSpacing === 'object' ? val.letterSpacing.value : val.letterSpacing };
  }
  style.setPluginData('tokenPath', token.path);
}

async function applyEffectStyle(token: any) {
  const styles = await figma.getLocalEffectStylesAsync();
  let style = styles.find(s => s.name === token.path.replace(/\./g, '/'));
  if (!style) {
    style = figma.createEffectStyle();
    style.name = token.path.replace(/\./g, '/');
  }
  const shadows = Array.isArray(token.$value) ? token.$value : [token.$value];
  style.effects = shadows.map((s: any) => {
    const color = parseColor(s.color);
    return {
      type: s.type === 'innerShadow' ? 'INNER_SHADOW' : 'DROP_SHADOW',
      color: color ? { ...color.rgb, a: color.a } : { r: 0, g: 0, b: 0, a: 0.25 },
      offset: { x: parseDimValue(s.offsetX), y: parseDimValue(s.offsetY) },
      radius: parseDimValue(s.blur),
      spread: parseDimValue(s.spread),
      visible: true,
      blendMode: 'NORMAL',
    } as DropShadowEffect;
  });
  style.setPluginData('tokenPath', token.path);
}

export async function readFigmaStyles(correlationId?: string) {
  const tokens: any[] = [];

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

    const token: any = {
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
            offsetX: { value: shadow.offset.x, unit: 'px' },
            offsetY: { value: shadow.offset.y, unit: 'px' },
            blur: { value: shadow.radius, unit: 'px' },
            spread: { value: shadow.spread || 0, unit: 'px' },
            type: s.type === 'INNER_SHADOW' ? 'innerShadow' : 'dropShadow',
          };
        }),
      });
    }
  }

  figma.ui.postMessage({ type: 'styles-read', tokens, correlationId });
}
