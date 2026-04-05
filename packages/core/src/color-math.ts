/**
 * CIELAB color math (sRGB ↔ XYZ D65 ↔ CIELAB).
 *
 * Shared module used by both the generator engine and color modifier.
 */

/** sRGB → linear (IEC 61966-2-1). */
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** linear → sRGB (IEC 61966-2-1), clamped to [0, 1]. */
export function srgbFromLinear(c: number): number {
  const v = Math.max(0, Math.min(1, c));
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

// Internal aliases for brevity within this module
const toLinear = srgbToLinear;
const fromLinear = srgbFromLinear;

/** Expand shorthand hex (3/4 chars) to full form (6/8 chars). */
function expandHex(h: string): string {
  if (h.length === 3 || h.length === 4) {
    return [...h].map(c => c + c).join('');
  }
  return h;
}

/** Expand shorthand hex (#abc → #aabbcc, #abcd → #aabbccdd) and lowercase. */
export function normalizeHex(hex: string): string {
  const h = hex.replace('#', '').toLowerCase();
  if (h.length === 3) return '#' + h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (h.length === 4) return '#' + h[0] + h[0] + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
  return '#' + h;
}

/** Parse hex string to {r, g, b, a} with values in 0-1 range. Handles 3/4/6/8 char hex. Alpha defaults to 1 when absent. */
export function hexToRgb(hex: string): { r: number; g: number; b: number; a: number } | null {
  const h = expandHex(hex.replace('#', ''));
  if (h.length !== 6 && h.length !== 8) return null;
  if (!/^[0-9a-fA-F]+$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
    a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
  };
}

/** Convert 0-1 sRGB values to hex string. */
export function rgbToHex(r: number, g: number, b: number): string {
  const h = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Convert 0-1 sRGB values to CIELAB {L, a, b} via XYZ D65. */
export function rgbToLab(r: number, g: number, b: number): { L: number; a: number; b: number } {
  const R = toLinear(r), G = toLinear(g), B = toLinear(b);
  const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const Y = (0.2126729 * R + 0.7151522 * G + 0.0721750 * B) / 1.0;
  const Z = (0.0193339 * R + 0.1191920 * G + 0.9503041 * B) / 1.08883;
  const f = (t: number) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  return { L: 116 * f(Y) - 16, a: 500 * (f(X) - f(Y)), b: 200 * (f(Y) - f(Z)) };
}

export function hexToLab(hex: string): [number, number, number] | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const lab = rgbToLab(rgb.r, rgb.g, rgb.b);
  return [lab.L, lab.a, lab.b];
}

/** CIE Lab L/a/b → sRGB [r, g, b] (0–1) via D65 XYZ. L is 0–100, a/b are ~−125 to 125. */
export function labToSrgb(L: number, a: number, b: number): [number, number, number] {
  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;
  const f3 = (t: number) => (t > 0.206897 ? t * t * t : (t - 16 / 116) / 7.787);
  const X = f3(fx) * 0.95047;
  const Y = f3(fy);
  const Z = f3(fz) * 1.08883;
  return [
    fromLinear(3.2406 * X - 1.5372 * Y - 0.4986 * Z),
    fromLinear(-0.9689 * X + 1.8758 * Y + 0.0415 * Z),
    fromLinear(0.0557 * X - 0.2040 * Y + 1.0570 * Z),
  ];
}

export function labToHex(L: number, a: number, b: number): string {
  return rgbToHex(...labToSrgb(L, a, b));
}

/**
 * Compute the WCAG relative luminance of a hex color.
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
export function wcagLuminance(hex: string): number | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const r = toLinear(rgb.r), g = toLinear(rgb.g), b = toLinear(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** CIE76 ΔE between two hex colors (Euclidean distance in CIELAB). */
export function colorDeltaE(hexA: string, hexB: string): number | null {
  const labA = hexToLab(hexA);
  const labB = hexToLab(hexB);
  if (!labA || !labB) return null;
  return Math.sqrt((labA[0] - labB[0]) ** 2 + (labA[1] - labB[1]) ** 2 + (labA[2] - labB[2]) ** 2);
}

/** Rebuild hex string from 6-char base + alpha (0-255). Returns null if hex is invalid. */
export function setHexAlpha(hex: string, alpha: number): string | null {
  const clean = expandHex(hex.replace('#', '')).slice(0, 6);
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  const a = Math.round(Math.max(0, Math.min(255, alpha)));
  return `#${clean}${a.toString(16).padStart(2, '0')}`;
}
