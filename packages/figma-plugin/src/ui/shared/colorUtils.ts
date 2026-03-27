/**
 * Shared color math utilities — sRGB ↔ linear ↔ XYZ ↔ CIELAB, WCAG contrast.
 */

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

/** Expand shorthand hex (#abc → #aabbcc, #abcd → #aabbccdd) and lowercase. */
export function normalizeHex(hex: string): string {
  const h = hex.replace('#', '').toLowerCase();
  if (h.length === 3) return '#' + h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (h.length === 4) return '#' + h[0] + h[0] + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
  return '#' + h;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number; a?: number } | null {
  const h = hex.replace('#', '');
  if (h.length !== 6 && h.length !== 8) return null;
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
    ...(h.length === 8 && { a: parseInt(h.slice(6, 8), 16) / 255 }),
  };
}

// ---------------------------------------------------------------------------
// XYZ / CIELAB conversions
// ---------------------------------------------------------------------------

function rgbToLab(r: number, g: number, b: number): { L: number; a: number; b: number } {
  const R = toLinear(r), G = toLinear(g), B = toLinear(b);
  // linear sRGB → XYZ D65
  const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const Y = (0.2126729 * R + 0.7151522 * G + 0.0721750 * B) / 1.0;
  const Z = (0.0193339 * R + 0.1191920 * G + 0.9503041 * B) / 1.08883;
  const f = (t: number) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  return { L: 116 * f(Y) - 16, a: 500 * (f(X) - f(Y)), b: 200 * (f(Y) - f(Z)) };
}


function hexToLab(hex: string): [number, number, number] | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const lab = rgbToLab(rgb.r, rgb.g, rgb.b);
  return [lab.L, lab.a, lab.b];
}

function labToHex(L: number, a: number, b: number): string {
  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;
  const f3 = (t: number) => (t > 0.206897 ? t * t * t : (t - 16 / 116) / 7.787);
  const X = f3(fx) * 0.95047;
  const Y = f3(fy);
  const Z = f3(fz) * 1.08883;
  return rgbToHex(
    fromLinear(3.2406 * X - 1.5372 * Y - 0.4986 * Z),
    fromLinear(-0.9689 * X + 1.8758 * Y + 0.0415 * Z),
    fromLinear(0.0557 * X - 0.2040 * Y + 1.0570 * Z),
  );
}

// ---------------------------------------------------------------------------
// RGB ↔ Hex
// ---------------------------------------------------------------------------

export function rgbToHex(r: number, g: number, b: number): string {
  const h = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

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


export function countLeafNodes(group: Record<string, any>): { total: number; byType: Record<string, number> } {
  let total = 0;
  const byType: Record<string, number> = {};
  for (const [key, value] of Object.entries(group)) {
    if (key.startsWith('$')) continue;
    if (value && typeof value === 'object' && '$value' in value) {
      total++;
      const t = value.$type || 'unknown';
      byType[t] = (byType[t] || 0) + 1;
    } else if (value && typeof value === 'object') {
      const sub = countLeafNodes(value);
      total += sub.total;
      for (const [t, c] of Object.entries(sub.byType)) {
        byType[t] = (byType[t] || 0) + c;
      }
    }
  }
  return { total, byType };
}
