/**
 * Shared color utilities — UI-specific helpers that build on @tokenmanager/core.
 *
 * Color math primitives (hexToRgb, rgbToHex, rgbToLab, colorDeltaE, normalizeHex,
 * srgbToLinear, srgbFromLinear) live in @tokenmanager/core. Import them directly
 * from core — do NOT re-export through this file (vite-plugin-singlefile TDZ risk).
 */

import {
  srgbToLinear as toLinear,
  srgbFromLinear as fromLinear,
  normalizeHex,
  hexToRgb,
  rgbToHex,
  rgbToLab,
  hexToLab,
  labToHex,
} from '@tokenmanager/core';

// ---------------------------------------------------------------------------
// HSL conversions
// ---------------------------------------------------------------------------

/** sRGB (0-1 each) → HSL. H in 0-360, S/L in 0-100. */
function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s: s * 100, l: l * 100 };
}

/** HSL (H 0-360, S 0-100, L 0-100) → sRGB (0-1 each). */
export function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const S = s / 100, L = l / 100;
  if (S === 0) return { r: L, g: L, b: L };
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = L < 0.5 ? L * (1 + S) : L + S - L * S;
  const p = 2 * L - q;
  const H = h / 360;
  return { r: hue2rgb(p, q, H + 1 / 3), g: hue2rgb(p, q, H), b: hue2rgb(p, q, H - 1 / 3) };
}

export function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  return rgbToHsl(rgb.r, rgb.g, rgb.b);
}

export function hslToHex(h: number, s: number, l: number): string {
  const { r, g, b } = hslToRgb(h, s, l);
  return rgbToHex(r, g, b);
}

// ---------------------------------------------------------------------------
// Format display / parse helpers (for multi-format color input)
// ---------------------------------------------------------------------------

export type ColorFormat = 'hex' | 'rgb' | 'hsl' | 'oklch' | 'p3';

/** Display a color value in the chosen format. Handles both hex and CSS Color 4 strings. */
export function formatHexAs(colorStr: string, format: ColorFormat): string {
  // For hex input, use legacy fast path for hex/rgb/hsl
  if (colorStr.startsWith('#')) {
    const clean = colorStr.slice(0, 7); // strip alpha for display
    if (format === 'hex') return clean;
    const rgb = hexToRgb(clean);
    if (!rgb) return clean;
    if (format === 'rgb') {
      return `rgb(${Math.round(rgb.r * 255)}, ${Math.round(rgb.g * 255)}, ${Math.round(rgb.b * 255)})`;
    }
    if (format === 'hsl') {
      const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
      return `hsl(${Math.round(hsl.h)}, ${Math.round(hsl.s)}%, ${Math.round(hsl.l)}%)`;
    }
    // oklch/p3 need core parser
    return formatWideGamut(colorStr, format);
  }
  // Non-hex input (CSS Color 4 string): use core parser for all formats
  return formatWideGamut(colorStr, format);
}

function formatWideGamut(colorStr: string, format: ColorFormat): string {
  try {
    const { parseAnyColor, toOklch, toDisplayP3, toSrgb, serializeColor, toHex } = require('@tokenmanager/core');
    const parsed = parseAnyColor(colorStr);
    if (!parsed) return colorStr;
    switch (format) {
      case 'hex': return toHex(parsed);
      case 'rgb': {
        const srgb = toSrgb(parsed);
        return `rgb(${Math.round(srgb.coords[0] * 255)}, ${Math.round(srgb.coords[1] * 255)}, ${Math.round(srgb.coords[2] * 255)})`;
      }
      case 'hsl': {
        const srgb = toSrgb(parsed);
        const hsl = rgbToHsl(srgb.coords[0], srgb.coords[1], srgb.coords[2]);
        return `hsl(${Math.round(hsl.h)}, ${Math.round(hsl.s)}%, ${Math.round(hsl.l)}%)`;
      }
      case 'oklch': return serializeColor(toOklch(parsed));
      case 'p3': return serializeColor(toDisplayP3(parsed));
    }
  } catch {
    return colorStr;
  }
}

/**
 * Parse a color string in any supported format.
 * Returns the canonical CSS string: hex for sRGB colors, CSS Color 4 syntax for wide-gamut.
 * Returns null if the input is not a valid color.
 */
export function parseColorInput(input: string): string | null {
  const trimmed = input.trim();
  // hex — fast path
  if (trimmed.startsWith('#')) {
    const clean = normalizeHex(trimmed);
    if (/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(clean)) return clean.slice(0, 7);
    return null;
  }
  // rgb(r, g, b) — fast path
  const rgbMatch = trimmed.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
  if (rgbMatch) {
    const [, rs, gs, bs] = rgbMatch;
    const r = parseInt(rs, 10), g = parseInt(gs, 10), b = parseInt(bs, 10);
    if (r > 255 || g > 255 || b > 255) return null;
    return rgbToHex(r / 255, g / 255, b / 255);
  }
  // hsl(h, s%, l%) — fast path
  const hslMatch = trimmed.match(/^hsl\(\s*(\d{1,3})\s*,\s*(\d{1,3})%\s*,\s*(\d{1,3})%\s*\)$/i);
  if (hslMatch) {
    const [, hs, ss, ls] = hslMatch;
    const h = parseInt(hs, 10), s = parseInt(ss, 10), l = parseInt(ls, 10);
    if (h > 360 || s > 100 || l > 100) return null;
    return hslToHex(h, s, l);
  }
  // CSS Color 4 — oklch(), oklab(), color(display-p3 ...), hwb(), lab(), lch()
  try {
    const { parseAnyColor, serializeColor } = require('@tokenmanager/core');
    const parsed = parseAnyColor(trimmed);
    if (parsed) return serializeColor(parsed);
  } catch {
    // core not available
  }
  return null;
}

// ---------------------------------------------------------------------------
// LCH (Cylindrical CIELAB) conversions
// ---------------------------------------------------------------------------

/** CIELAB → LCH. L 0-100, C 0-~150, H 0-360. */
function labToLch(L: number, a: number, b: number): { L: number; C: number; H: number } {
  const C = Math.sqrt(a * a + b * b);
  let H = (Math.atan2(b, a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { L, C, H };
}

/** LCH → CIELAB. */
function lchToLab(L: number, C: number, H: number): { L: number; a: number; b: number } {
  const rad = (H * Math.PI) / 180;
  return { L, a: C * Math.cos(rad), b: C * Math.sin(rad) };
}

export function hexToLch(hex: string): { L: number; C: number; H: number } | null {
  const lab = hexToLab(hex);
  if (!lab) return null;
  return labToLch(lab[0], lab[1], lab[2]);
}

export function lchToHex(L: number, C: number, H: number): string {
  const { L: lL, a, b } = lchToLab(L, C, H);
  return labToHex(lL, a, b);
}

// ---------------------------------------------------------------------------
// Display P3 conversions (through XYZ D65)
// ---------------------------------------------------------------------------

/** sRGB (0-1 gamma) → Display P3 (0-1 gamma). Values outside 0-1 = out of P3 gamut. */
export function srgbToP3(r: number, g: number, b: number): { r: number; g: number; b: number } {
  // sRGB linear → XYZ D65
  const R = toLinear(r), G = toLinear(g), B = toLinear(b);
  const X = 0.4124564 * R + 0.3575761 * G + 0.1804375 * B;
  const Y = 0.2126729 * R + 0.7151522 * G + 0.0721750 * B;
  const Z = 0.0193339 * R + 0.1191920 * G + 0.9503041 * B;
  // XYZ D65 → Display P3 linear (inverse of P3-to-XYZ matrix)
  const pr =  2.4934969 * X - 0.9313836 * Y - 0.4027108 * Z;
  const pg = -0.8294890 * X + 1.7626641 * Y + 0.0236247 * Z;
  const pb =  0.0358458 * X - 0.0761724 * Y + 0.9568845 * Z;
  // P3 uses the same transfer function as sRGB
  return { r: fromLinear(pr), g: fromLinear(pg), b: fromLinear(pb) };
}

/** Display P3 (0-1 gamma) → sRGB (0-1 gamma). Values outside 0-1 = out of sRGB gamut. */
export function p3ToSrgb(r: number, g: number, b: number): { r: number; g: number; b: number } {
  // P3 linear (same transfer function as sRGB)
  const R = toLinear(r), G = toLinear(g), B = toLinear(b);
  // P3 linear → XYZ D65
  const X = 0.4865709 * R + 0.2656677 * G + 0.1982173 * B;
  const Y = 0.2289746 * R + 0.6917385 * G + 0.0792869 * B;
  const Z = 0.0000000 * R + 0.0451134 * G + 1.0439444 * B;
  // XYZ D65 → sRGB linear
  const sr = fromLinear( 3.2406 * X - 1.5372 * Y - 0.4986 * Z);
  const sg = fromLinear(-0.9689 * X + 1.8758 * Y + 0.0415 * Z);
  const sb = fromLinear( 0.0557 * X - 0.2040 * Y + 1.0570 * Z);
  return { r: sr, g: sg, b: sb };
}

/** Check if a P3 color (0-1 each) is within sRGB gamut. */
export function isP3InSrgbGamut(pr: number, pg: number, pb: number): boolean {
  const { r, g, b } = p3ToSrgb(pr, pg, pb);
  return r >= -0.001 && r <= 1.001 && g >= -0.001 && g <= 1.001 && b >= -0.001 && b <= 1.001;
}

// ---------------------------------------------------------------------------
// Derived helpers
// ---------------------------------------------------------------------------

/** CIE L* (perceptual lightness, 0–100) from a hex color. */
export function hexToLstar(hex: string): number | null {
  const Y = hexToLuminance(hex);
  if (Y === null) return null;
  const f = (t: number) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  return 116 * f(Y) - 16;
}

// ---------------------------------------------------------------------------
// WCAG contrast utilities
// ---------------------------------------------------------------------------

export function hexToLuminance(hex: string): number | null {
  const clean = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{3,8}$/.test(clean)) return null;
  const full = clean.length === 3
    ? clean.split('').map(c => c + c).join('')
    : clean.slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function wcagContrast(hex1: string, hex2: string): number | null {
  const l1 = colorLuminance(hex1);
  const l2 = colorLuminance(hex2);
  if (l1 === null || l2 === null) return null;
  const [lighter, darker] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Get WCAG relative luminance for any CSS color string.
 * Falls back to hex parsing for backwards compat, uses core parser for CSS Color 4.
 */
export function colorLuminance(colorStr: string): number | null {
  // Fast path for hex
  const hexLum = hexToLuminance(colorStr);
  if (hexLum !== null) return hexLum;
  // CSS Color 4 — use core parser
  try {
    const { parseAnyColor, parsedColorLuminance } = require('@tokenmanager/core');
    const parsed = parseAnyColor(colorStr);
    if (parsed) return parsedColorLuminance(parsed);
  } catch {
    // core not available
  }
  return null;
}

// ---------------------------------------------------------------------------
// Wide-gamut helpers
// ---------------------------------------------------------------------------

/**
 * Get a CSS value suitable for `backgroundColor` style property.
 * Handles both hex (strips alpha for `.slice(0,7)` compat) and CSS Color 4 strings.
 */
export function swatchBgColor(colorStr: string): string {
  if (typeof colorStr !== 'string') return '#000000';
  // Hex: strip alpha for swatch display
  if (colorStr.startsWith('#')) return colorStr.slice(0, 7);
  // CSS Color 4: browsers render these natively
  return colorStr;
}

/**
 * Check if a color string exceeds sRGB gamut.
 * Returns false for hex colors and unparseable strings.
 */
export function isWideGamutColor(colorStr: string): boolean {
  if (!colorStr || typeof colorStr !== 'string') return false;
  // Hex is always sRGB
  if (colorStr.startsWith('#')) return false;
  try {
    const { isWideGamut } = require('@tokenmanager/core');
    return isWideGamut(colorStr);
  } catch {
    return false;
  }
}

/**
 * Get sRGB hex fallback for any color string.
 */
export function getSrgbFallback(colorStr: string): string | null {
  if (!colorStr || typeof colorStr !== 'string') return null;
  if (colorStr.startsWith('#')) return colorStr.slice(0, 7);
  try {
    const { srgbFallbackHex } = require('@tokenmanager/core');
    return srgbFallbackHex(colorStr);
  } catch {
    return null;
  }
}
