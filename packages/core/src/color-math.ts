/**
 * CIELAB color math (sRGB ↔ XYZ D65 ↔ CIELAB).
 *
 * Shared module used by both the generator engine and color modifier.
 */

function toLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function fromLinear(c: number): number {
  const v = Math.max(0, Math.min(1, c));
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

export function hexToLab(hex: string): [number, number, number] | null {
  const clean = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(clean)) return null;
  const r = toLinear(parseInt(clean.slice(0, 2), 16) / 255);
  const g = toLinear(parseInt(clean.slice(2, 4), 16) / 255);
  const b = toLinear(parseInt(clean.slice(4, 6), 16) / 255);
  const X = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const Y = (0.2126729 * r + 0.7151522 * g + 0.0721750 * b) / 1.00000;
  const Z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

export function labToHex(L: number, a: number, b: number): string {
  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;
  const f3 = (t: number) => (t > 0.206897 ? t * t * t : (t - 16 / 116) / 7.787);
  const X = f3(fx) * 0.95047;
  const Y = f3(fy) * 1.00000;
  const Z = f3(fz) * 1.08883;
  const lr = fromLinear(3.2406 * X - 1.5372 * Y - 0.4986 * Z);
  const lg = fromLinear(-0.9689 * X + 1.8758 * Y + 0.0415 * Z);
  const lb = fromLinear(0.0557 * X - 0.2040 * Y + 1.0570 * Z);
  const h = (v: number) =>
    Math.round(Math.max(0, Math.min(1, v)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${h(lr)}${h(lg)}${h(lb)}`;
}

/**
 * Compute the WCAG relative luminance of a hex color.
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
export function wcagLuminance(hex: string): number | null {
  const clean = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  const r = toLinear(parseInt(clean.slice(0, 2), 16) / 255);
  const g = toLinear(parseInt(clean.slice(2, 4), 16) / 255);
  const b = toLinear(parseInt(clean.slice(4, 6), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Extract alpha byte from 8-char hex (0-255). Returns 255 if 6-char. */
export function hexAlpha(hex: string): number {
  const clean = hex.replace('#', '');
  if (clean.length === 8) return parseInt(clean.slice(6, 8), 16);
  return 255;
}

/** Rebuild hex string from 6-char base + alpha (0-255). */
export function setHexAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '').slice(0, 6);
  const a = Math.round(Math.max(0, Math.min(255, alpha)));
  return `#${clean}${a.toString(16).padStart(2, '0')}`;
}
