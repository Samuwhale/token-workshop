/**
 * Shared color math utilities — sRGB ↔ linear ↔ XYZ ↔ CIELAB, WCAG contrast.
 * Also exports stableStringify for deterministic JSON serialisation.
 */

/** JSON.stringify with keys sorted recursively, so key-insertion-order differences never produce different strings. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return JSON.stringify(value);
  }
  const keys = Object.keys(value as object).sort();
  const parts = keys.map(k => JSON.stringify(k) + ':' + stableStringify((value as Record<string, unknown>)[k]));
  return '{' + parts.join(',') + '}';
}

// sRGB linearization (IEC 61966-2-1)
function toLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function fromLinear(c: number): number {
  const v = Math.max(0, Math.min(1, c));
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

// ---------------------------------------------------------------------------
// Hex parsing
// ---------------------------------------------------------------------------

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace('#', '');
  if (h.length !== 6 && h.length !== 8) return null;
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}

// ---------------------------------------------------------------------------
// XYZ / CIELAB conversions
// ---------------------------------------------------------------------------

export function rgbToLab(r: number, g: number, b: number): { L: number; a: number; b: number } {
  const R = toLinear(r), G = toLinear(g), B = toLinear(b);
  // linear sRGB → XYZ D65
  const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const Y = (0.2126729 * R + 0.7151522 * G + 0.0721750 * B) / 1.0;
  const Z = (0.0193339 * R + 0.1191920 * G + 0.9503041 * B) / 1.08883;
  const f = (t: number) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  return { L: 116 * f(Y) - 16, a: 500 * (f(X) - f(Y)), b: 200 * (f(Y) - f(Z)) };
}

export function hexToLab(hex: string): [number, number, number] | null {
  const clean = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  const r = toLinear(parseInt(clean.slice(0, 2), 16) / 255);
  const g = toLinear(parseInt(clean.slice(2, 4), 16) / 255);
  const b = toLinear(parseInt(clean.slice(4, 6), 16) / 255);
  const X = 0.4124 * r + 0.3576 * g + 0.1805 * b;
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = 0.0193 * r + 0.1192 * g + 0.9505 * b;
  const f = (t: number) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  const fx = f(X / 0.95047), fy = f(Y / 1.00000), fz = f(Z / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function labToHex(L: number, a: number, b: number): string {
  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;
  const f3 = (t: number) => t > 0.206897 ? t * t * t : (t - 16 / 116) / 7.787;
  const X = f3(fx) * 0.95047;
  const Y = f3(fy) * 1.00000;
  const Z = f3(fz) * 1.08883;
  const lr = fromLinear( 3.2406 * X - 1.5372 * Y - 0.4986 * Z);
  const lg = fromLinear(-0.9689 * X + 1.8758 * Y + 0.0415 * Z);
  const lb = fromLinear( 0.0557 * X - 0.2040 * Y + 1.0570 * Z);
  const h = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
  return `#${h(lr)}${h(lg)}${h(lb)}`;
}

// ---------------------------------------------------------------------------
// Derived helpers
// ---------------------------------------------------------------------------

export function colorDeltaE(hexA: string, hexB: string): number | null {
  const rgbA = hexToRgb(hexA);
  const rgbB = hexToRgb(hexB);
  if (!rgbA || !rgbB) return null;
  const labA = rgbToLab(rgbA.r, rgbA.g, rgbA.b);
  const labB = rgbToLab(rgbB.r, rgbB.g, rgbB.b);
  return Math.sqrt((labA.L - labB.L) ** 2 + (labA.a - labB.a) ** 2 + (labA.b - labB.b) ** 2);
}

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
  const l1 = hexToLuminance(hex1);
  const l2 = hexToLuminance(hex2);
  if (l1 === null || l2 === null) return null;
  const [lighter, darker] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (lighter + 0.05) / (darker + 0.05);
}
