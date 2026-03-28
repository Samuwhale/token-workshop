/**
 * Universal CSS Color Module 4 parser and serializer.
 *
 * Handles hex, rgb(), hsl(), oklch(), oklab(), color(display-p3 ...), color(srgb ...),
 * and named CSS colors.
 *
 * Internal intermediate representation is OKLAB for perceptual uniformity.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ColorSpace = 'srgb' | 'display-p3' | 'oklch' | 'oklab' | 'hsl';

export interface ParsedColor {
  /** The color space this color is natively expressed in */
  space: ColorSpace;
  /** Space-specific coordinates:
   *  srgb/display-p3: [r, g, b] 0-1
   *  oklch: [L, C, H] L: 0-1, C: 0-0.4+, H: 0-360
   *  oklab: [L, a, b] L: 0-1, a/b: ~-0.4 to 0.4
   *  hsl: [H, S, L] H: 0-360, S: 0-100, L: 0-100
   */
  coords: [number, number, number];
  alpha: number;
}

// ---------------------------------------------------------------------------
// sRGB linearization — imported from the single source of truth in color-math
// ---------------------------------------------------------------------------

import { srgbToLinear as toLinear, srgbFromLinear as fromLinear } from './color-math.js';

// ---------------------------------------------------------------------------
// OKLAB / OKLCh math (Bjorn Ottosson)
// ---------------------------------------------------------------------------

/** Linear sRGB → OKLAB */
export function linearSrgbToOklab(r: number, g: number, b: number): { L: number; a: number; b: number } {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return {
    L: 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  };
}

/** OKLAB → Linear sRGB */
export function oklabToLinearSrgb(L: number, a: number, b: number): { r: number; g: number; b: number } {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  return {
    r:  4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  };
}

/** OKLAB → OKLCh */
export function oklabToOklch(L: number, a: number, b: number): { L: number; C: number; H: number } {
  const C = Math.sqrt(a * a + b * b);
  let H = (Math.atan2(b, a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { L, C, H };
}

/** OKLCh → OKLAB */
export function oklchToOklab(L: number, C: number, H: number): { L: number; a: number; b: number } {
  const rad = (H * Math.PI) / 180;
  return { L, a: C * Math.cos(rad), b: C * Math.sin(rad) };
}

// ---------------------------------------------------------------------------
// Display P3 matrices (through XYZ D65)
// ---------------------------------------------------------------------------

/** Linear Display P3 → OKLAB (via XYZ D65 → LMS) */
function linearP3ToOklab(r: number, g: number, b: number): { L: number; a: number; b: number } {
  // P3 linear → XYZ D65
  const X = 0.4865709 * r + 0.2656677 * g + 0.1982173 * b;
  const Y = 0.2289746 * r + 0.6917385 * g + 0.0792869 * b;
  const Z = 0.0000000 * r + 0.0451134 * g + 1.0439444 * b;
  // XYZ → LMS
  const l = 0.8189330101 * X + 0.3618667424 * Y - 0.1288597137 * Z;
  const m = 0.0329845436 * X + 0.9293118715 * Y + 0.0361456387 * Z;
  const s = 0.0482003018 * X + 0.2643662691 * Y + 0.6338517070 * Z;
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  return {
    L: 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  };
}

/** OKLAB → Linear Display P3 */
function oklabToLinearP3(L: number, a: number, b: number): { r: number; g: number; b: number } {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  // LMS → XYZ D65
  const X =  1.2270138511 * l - 0.5577999807 * m + 0.2812561490 * s;
  const Y = -0.0405801784 * l + 1.1122568696 * m - 0.0716766787 * s;
  const Z = -0.0763812845 * l - 0.4214819784 * m + 1.5861632204 * s;
  // XYZ → P3 linear
  return {
    r:  2.4934969 * X - 0.9313836 * Y - 0.4027108 * Z,
    g: -0.8294890 * X + 1.7626641 * Y + 0.0236247 * Z,
    b:  0.0358458 * X - 0.0761724 * Y + 0.9568845 * Z,
  };
}

// ---------------------------------------------------------------------------
// HSL conversions
// ---------------------------------------------------------------------------

function hslToSrgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
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

function srgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
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

// ---------------------------------------------------------------------------
// Gamut checking and mapping
// ---------------------------------------------------------------------------

/** Convert a ParsedColor to OKLAB intermediate. */
function toOklab(color: ParsedColor): { L: number; a: number; b: number } {
  const [c0, c1, c2] = color.coords;
  switch (color.space) {
    case 'srgb':
      return linearSrgbToOklab(toLinear(c0), toLinear(c1), toLinear(c2));
    case 'display-p3':
      return linearP3ToOklab(toLinear(c0), toLinear(c1), toLinear(c2));
    case 'oklch':
      return oklchToOklab(c0, c1, c2);
    case 'oklab':
      return { L: c0, a: c1, b: c2 };
    case 'hsl': {
      const rgb = hslToSrgb(c0, c1, c2);
      return linearSrgbToOklab(toLinear(rgb.r), toLinear(rgb.g), toLinear(rgb.b));
    }
  }
}

/** Check if an OKLAB color is within sRGB gamut. */
function oklabInSrgb(L: number, a: number, b: number): boolean {
  const rgb = oklabToLinearSrgb(L, a, b);
  const EPS = 0.001;
  return rgb.r >= -EPS && rgb.r <= 1 + EPS &&
         rgb.g >= -EPS && rgb.g <= 1 + EPS &&
         rgb.b >= -EPS && rgb.b <= 1 + EPS;
}

/** Check if a ParsedColor exceeds sRGB gamut. */
export function exceedsSrgb(color: ParsedColor): boolean {
  if (color.space === 'srgb' || color.space === 'hsl') return false;
  const lab = toOklab(color);
  return !oklabInSrgb(lab.L, lab.a, lab.b);
}

/**
 * Gamut-map an OKLAB color into sRGB by reducing OKLCh chroma.
 * Uses CSS Color 4 gamut mapping algorithm (binary search on chroma).
 */
function gamutMapToSrgb(L: number, a: number, b: number): { L: number; a: number; b: number } {
  if (oklabInSrgb(L, a, b)) return { L, a, b };
  const lch = oklabToOklch(L, a, b);
  let lo = 0, hi = lch.C;
  // Binary search for max chroma that fits sRGB
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2;
    const test = oklchToOklab(lch.L, mid, lch.H);
    if (oklabInSrgb(test.L, test.a, test.b)) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return oklchToOklab(lch.L, lo, lch.H);
}

// ---------------------------------------------------------------------------
// Public conversion API
// ---------------------------------------------------------------------------

/** Convert any ParsedColor to OKLCh. */
export function toOklch(color: ParsedColor): ParsedColor {
  const lab = toOklab(color);
  const lch = oklabToOklch(lab.L, lab.a, lab.b);
  return { space: 'oklch', coords: [lch.L, lch.C, lch.H], alpha: color.alpha };
}

/** Convert any ParsedColor to OKLAB. */
export function toOklabColor(color: ParsedColor): ParsedColor {
  const lab = toOklab(color);
  return { space: 'oklab', coords: [lab.L, lab.a, lab.b], alpha: color.alpha };
}

/** Convert any ParsedColor to sRGB (gamut-mapped if needed). */
export function toSrgb(color: ParsedColor): ParsedColor {
  const lab = toOklab(color);
  const mapped = gamutMapToSrgb(lab.L, lab.a, lab.b);
  const lin = oklabToLinearSrgb(mapped.L, mapped.a, mapped.b);
  return {
    space: 'srgb',
    coords: [
      Math.max(0, Math.min(1, fromLinear(lin.r))),
      Math.max(0, Math.min(1, fromLinear(lin.g))),
      Math.max(0, Math.min(1, fromLinear(lin.b))),
    ],
    alpha: color.alpha,
  };
}

/** Convert any ParsedColor to Display P3. */
export function toDisplayP3(color: ParsedColor): ParsedColor {
  const lab = toOklab(color);
  const lin = oklabToLinearP3(lab.L, lab.a, lab.b);
  return {
    space: 'display-p3',
    coords: [
      Math.max(0, Math.min(1, fromLinear(lin.r))),
      Math.max(0, Math.min(1, fromLinear(lin.g))),
      Math.max(0, Math.min(1, fromLinear(lin.b))),
    ],
    alpha: color.alpha,
  };
}

/** Convert any ParsedColor to #RRGGBB or #RRGGBBAA hex (gamut-mapped to sRGB). */
export function toHex(color: ParsedColor): string {
  const srgb = toSrgb(color);
  const [r, g, b] = srgb.coords;
  const h = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  const hex6 = `#${h(r)}${h(g)}${h(b)}`;
  if (color.alpha < 1) {
    return hex6 + h(color.alpha);
  }
  return hex6;
}

/**
 * Compute WCAG 2.x relative luminance from any ParsedColor.
 * Gamut-maps to sRGB first if needed.
 */
export function parsedColorLuminance(color: ParsedColor): number {
  const srgb = toSrgb(color);
  const [r, g, b] = srgb.coords;
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** Serialize a ParsedColor to its canonical CSS string. */
export function serializeColor(color: ParsedColor): string {
  const [c0, c1, c2] = color.coords;
  const alphaStr = color.alpha < 1 ? ` / ${round(color.alpha, 3)}` : '';
  switch (color.space) {
    case 'srgb': {
      if (color.alpha >= 1) {
        const h = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
        return `#${h(c0)}${h(c1)}${h(c2)}`;
      }
      return `rgb(${Math.round(c0 * 255)} ${Math.round(c1 * 255)} ${Math.round(c2 * 255)}${alphaStr})`;
    }
    case 'display-p3':
      return `color(display-p3 ${round(c0, 4)} ${round(c1, 4)} ${round(c2, 4)}${alphaStr})`;
    case 'oklch':
      return `oklch(${round(c0, 4)} ${round(c1, 4)} ${round(c2, 2)}${alphaStr})`;
    case 'oklab':
      return `oklab(${round(c0, 4)} ${round(c1, 4)} ${round(c2, 4)}${alphaStr})`;
    case 'hsl':
      return `hsl(${Math.round(c0)} ${Math.round(c1)}% ${Math.round(c2)}%${alphaStr})`;
  }
}

function round(n: number, d: number): string {
  return Number(n.toFixed(d)).toString();
}

// ---------------------------------------------------------------------------
// CSS Named Colors → sRGB hex
// ---------------------------------------------------------------------------

const NAMED_COLORS: Record<string, string> = {
  aliceblue: '#f0f8ff', antiquewhite: '#faebd7', aqua: '#00ffff', aquamarine: '#7fffd4',
  azure: '#f0ffff', beige: '#f5f5dc', bisque: '#ffe4c4', black: '#000000',
  blanchedalmond: '#ffebcd', blue: '#0000ff', blueviolet: '#8a2be2', brown: '#a52a2a',
  burlywood: '#deb887', cadetblue: '#5f9ea0', chartreuse: '#7fff00', chocolate: '#d2691e',
  coral: '#ff7f50', cornflowerblue: '#6495ed', cornsilk: '#fff8dc', crimson: '#dc143c',
  cyan: '#00ffff', darkblue: '#00008b', darkcyan: '#008b8b', darkgoldenrod: '#b8860b',
  darkgray: '#a9a9a9', darkgreen: '#006400', darkgrey: '#a9a9a9', darkkhaki: '#bdb76b',
  darkmagenta: '#8b008b', darkolivegreen: '#556b2f', darkorange: '#ff8c00', darkorchid: '#9932cc',
  darkred: '#8b0000', darksalmon: '#e9967a', darkseagreen: '#8fbc8f', darkslateblue: '#483d8b',
  darkslategray: '#2f4f4f', darkslategrey: '#2f4f4f', darkturquoise: '#00ced1', darkviolet: '#9400d3',
  deeppink: '#ff1493', deepskyblue: '#00bfff', dimgray: '#696969', dimgrey: '#696969',
  dodgerblue: '#1e90ff', firebrick: '#b22222', floralwhite: '#fffaf0', forestgreen: '#228b22',
  fuchsia: '#ff00ff', gainsboro: '#dcdcdc', ghostwhite: '#f8f8ff', gold: '#ffd700',
  goldenrod: '#daa520', gray: '#808080', green: '#008000', greenyellow: '#adff2f',
  grey: '#808080', honeydew: '#f0fff0', hotpink: '#ff69b4', indianred: '#cd5c5c',
  indigo: '#4b0082', ivory: '#fffff0', khaki: '#f0e68c', lavender: '#e6e6fa',
  lavenderblush: '#fff0f5', lawngreen: '#7cfc00', lemonchiffon: '#fffacd', lightblue: '#add8e6',
  lightcoral: '#f08080', lightcyan: '#e0ffff', lightgoldenrodyellow: '#fafad2', lightgray: '#d3d3d3',
  lightgreen: '#90ee90', lightgrey: '#d3d3d3', lightpink: '#ffb6c1', lightsalmon: '#ffa07a',
  lightseagreen: '#20b2aa', lightskyblue: '#87cefa', lightslategray: '#778899', lightslategrey: '#778899',
  lightsteelblue: '#b0c4de', lightyellow: '#ffffe0', lime: '#00ff00', limegreen: '#32cd32',
  linen: '#faf0e6', magenta: '#ff00ff', maroon: '#800000', mediumaquamarine: '#66cdaa',
  mediumblue: '#0000cd', mediumorchid: '#ba55d3', mediumpurple: '#9370db', mediumseagreen: '#3cb371',
  mediumslateblue: '#7b68ee', mediumspringgreen: '#00fa9a', mediumturquoise: '#48d1cc',
  mediumvioletred: '#c71585', midnightblue: '#191970', mintcream: '#f5fffa', mistyrose: '#ffe4e1',
  moccasin: '#ffe4b5', navajowhite: '#ffdead', navy: '#000080', oldlace: '#fdf5e6',
  olive: '#808000', olivedrab: '#6b8e23', orange: '#ffa500', orangered: '#ff4500',
  orchid: '#da70d6', palegoldenrod: '#eee8aa', palegreen: '#98fb98', paleturquoise: '#afeeee',
  palevioletred: '#db7093', papayawhip: '#ffefd5', peachpuff: '#ffdab9', peru: '#cd853f',
  pink: '#ffc0cb', plum: '#dda0dd', powderblue: '#b0e0e6', purple: '#800080',
  rebeccapurple: '#663399', red: '#ff0000', rosybrown: '#bc8f8f', royalblue: '#4169e1',
  saddlebrown: '#8b4513', salmon: '#fa8072', sandybrown: '#f4a460', seagreen: '#2e8b57',
  seashell: '#fff5ee', sienna: '#a0522d', silver: '#c0c0c0', skyblue: '#87ceeb',
  slateblue: '#6a5acd', slategray: '#708090', slategrey: '#708090', snow: '#fffafa',
  springgreen: '#00ff7f', steelblue: '#4682b4', tan: '#d2b48c', teal: '#008080',
  thistle: '#d8bfd8', tomato: '#ff6347', turquoise: '#40e0d0', violet: '#ee82ee',
  wheat: '#f5deb3', white: '#ffffff', whitesmoke: '#f5f5f5', yellow: '#ffff00',
  yellowgreen: '#9acd32', transparent: '#00000000',
};

// ---------------------------------------------------------------------------
// Universal parser
// ---------------------------------------------------------------------------

/** Parse a number that may have % suffix. Returns raw number for no %, value/100 for %. */
function parseNum(s: string): number | null {
  const trimmed = s.trim();
  if (trimmed.endsWith('%')) {
    const n = parseFloat(trimmed.slice(0, -1));
    return isNaN(n) ? null : n / 100;
  }
  const n = parseFloat(trimmed);
  return isNaN(n) ? null : n;
}

/** Parse a raw number (no % handling). */
function parseRawNum(s: string): number | null {
  const n = parseFloat(s.trim());
  return isNaN(n) ? null : n;
}

function parseHexStr(hex: string): ParsedColor | null {
  let h = hex.replace('#', '').toLowerCase();
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  else if (h.length === 4) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
  if (h.length !== 6 && h.length !== 8) return null;
  if (!/^[0-9a-f]+$/.test(h)) return null;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return { space: 'srgb', coords: [r, g, b], alpha: a };
}

/**
 * Parse any CSS color string into a ParsedColor.
 * Supports: hex, rgb(), hsl(), oklch(), oklab(), color(display-p3 ...), color(srgb ...), named colors.
 */
export function parseAnyColor(input: string): ParsedColor | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;

  // Hex
  if (trimmed.startsWith('#')) {
    return parseHexStr(trimmed);
  }

  // Named color
  if (NAMED_COLORS[trimmed]) {
    return parseHexStr(NAMED_COLORS[trimmed]);
  }

  // Function-style: rgb(), hsl(), oklch(), oklab(), color()
  const funcMatch = trimmed.match(/^([a-z-]+)\s*\((.+)\)$/);
  if (!funcMatch) return null;
  const [, func, argsStr] = funcMatch;
  // Normalize arg separators: allow both comma and space syntax
  // Split on / for alpha, then split channels
  const [channelStr, alphaStr] = argsStr.split('/');
  const alpha = alphaStr ? parseNum(alphaStr.trim()) ?? 1 : 1;
  // Split channels on commas or whitespace
  const channels = channelStr.trim().split(/[\s,]+/).filter(Boolean);

  switch (func) {
    case 'rgb':
    case 'rgba': {
      if (channels.length < 3) return null;
      // channels can be 0-255 or 0-100%
      const r = channels[0].endsWith('%') ? (parseRawNum(channels[0].slice(0, -1))! / 100) : (parseRawNum(channels[0])! / 255);
      const g = channels[1].endsWith('%') ? (parseRawNum(channels[1].slice(0, -1))! / 100) : (parseRawNum(channels[1])! / 255);
      const b = channels[2].endsWith('%') ? (parseRawNum(channels[2].slice(0, -1))! / 100) : (parseRawNum(channels[2])! / 255);
      // Legacy rgba(r, g, b, a) — 4th channel as alpha
      let a = alpha;
      if (channels.length >= 4 && !alphaStr) {
        a = parseNum(channels[3]) ?? 1;
      }
      if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
      return { space: 'srgb', coords: [clamp01(r), clamp01(g), clamp01(b)], alpha: clamp01(a) };
    }

    case 'hsl':
    case 'hsla': {
      if (channels.length < 3) return null;
      const h = parseRawNum(channels[0].replace('deg', ''));
      const s = parseRawNum(channels[1].replace('%', ''));
      const l = parseRawNum(channels[2].replace('%', ''));
      let a = alpha;
      if (channels.length >= 4 && !alphaStr) {
        a = parseNum(channels[3]) ?? 1;
      }
      if (h === null || s === null || l === null) return null;
      return { space: 'hsl', coords: [((h % 360) + 360) % 360, clamp(s, 0, 100), clamp(l, 0, 100)], alpha: clamp01(a) };
    }

    case 'oklch': {
      if (channels.length < 3) return null;
      // L: 0-1 or 0-100%, C: 0-0.4+, H: 0-360
      const L = channels[0].endsWith('%') ? parseRawNum(channels[0].slice(0, -1))! / 100 : parseRawNum(channels[0]);
      const C = parseRawNum(channels[1]);
      const H = parseRawNum(channels[2].replace('deg', ''));
      if (L === null || C === null || H === null) return null;
      return { space: 'oklch', coords: [clamp(L, 0, 1), Math.max(0, C), ((H % 360) + 360) % 360], alpha: clamp01(alpha) };
    }

    case 'oklab': {
      if (channels.length < 3) return null;
      const L = channels[0].endsWith('%') ? parseRawNum(channels[0].slice(0, -1))! / 100 : parseRawNum(channels[0]);
      const a2 = parseRawNum(channels[1]);
      const b2 = parseRawNum(channels[2]);
      if (L === null || a2 === null || b2 === null) return null;
      return { space: 'oklab', coords: [clamp(L, 0, 1), a2, b2], alpha: clamp01(alpha) };
    }

    case 'color': {
      if (channels.length < 4) return null; // colorspace + 3 channels
      const colorspace = channels[0];
      const c0 = parseRawNum(channels[1]);
      const c1 = parseRawNum(channels[2]);
      const c2 = parseRawNum(channels[3]);
      if (c0 === null || c1 === null || c2 === null) return null;
      if (colorspace === 'display-p3') {
        return { space: 'display-p3', coords: [clamp01(c0), clamp01(c1), clamp01(c2)], alpha: clamp01(alpha) };
      }
      if (colorspace === 'srgb') {
        return { space: 'srgb', coords: [clamp01(c0), clamp01(c1), clamp01(c2)], alpha: clamp01(alpha) };
      }
      return null; // unsupported color space
    }

    case 'hwb': {
      if (channels.length < 3) return null;
      const h = parseRawNum(channels[0].replace('deg', ''));
      const w = parseRawNum(channels[1].replace('%', ''));
      const bk = parseRawNum(channels[2].replace('%', ''));
      if (h === null || w === null || bk === null) return null;
      // HWB → sRGB
      const wn = w / 100, bn = bk / 100;
      const sum = wn + bn;
      const wf = sum > 1 ? wn / sum : wn;
      const bf = sum > 1 ? bn / sum : bn;
      const hsl = hslToSrgb(((h % 360) + 360) % 360, 100, 50);
      const r = hsl.r * (1 - wf - bf) + wf;
      const g = hsl.g * (1 - wf - bf) + wf;
      const b2 = hsl.b * (1 - wf - bf) + wf;
      return { space: 'srgb', coords: [clamp01(r), clamp01(g), clamp01(b2)], alpha: clamp01(alpha) };
    }

    case 'lab': {
      // CIE Lab — convert to sRGB via XYZ. Approximate via OKLAB for simplicity.
      if (channels.length < 3) return null;
      const L = channels[0].endsWith('%') ? parseRawNum(channels[0].slice(0, -1))! : parseRawNum(channels[0]);
      const a2 = parseRawNum(channels[1]);
      const b2 = parseRawNum(channels[2]);
      if (L === null || a2 === null || b2 === null) return null;
      // CIE Lab L is 0-100, a/b are ~-125 to 125
      // Convert to XYZ then to sRGB
      const fy = (L + 16) / 116;
      const fx = a2 / 500 + fy;
      const fz = fy - b2 / 200;
      const f3 = (t: number) => (t > 0.206897 ? t * t * t : (t - 16 / 116) / 7.787);
      const X = f3(fx) * 0.95047;
      const Y = f3(fy);
      const Z = f3(fz) * 1.08883;
      const r = fromLinear(3.2406 * X - 1.5372 * Y - 0.4986 * Z);
      const g = fromLinear(-0.9689 * X + 1.8758 * Y + 0.0415 * Z);
      const b3 = fromLinear(0.0557 * X - 0.2040 * Y + 1.0570 * Z);
      return { space: 'srgb', coords: [clamp01(r), clamp01(g), clamp01(b3)], alpha: clamp01(alpha) };
    }

    case 'lch': {
      // CIE LCH → Lab → XYZ → sRGB
      if (channels.length < 3) return null;
      const L = parseRawNum(channels[0]);
      const C = parseRawNum(channels[1]);
      const H = parseRawNum(channels[2].replace('deg', ''));
      if (L === null || C === null || H === null) return null;
      const rad = (H * Math.PI) / 180;
      const a2 = C * Math.cos(rad);
      const b2 = C * Math.sin(rad);
      // Lab → XYZ → sRGB
      const fy = (L + 16) / 116;
      const fx = a2 / 500 + fy;
      const fz = fy - b2 / 200;
      const f3 = (t: number) => (t > 0.206897 ? t * t * t : (t - 16 / 116) / 7.787);
      const X = f3(fx) * 0.95047;
      const Y = f3(fy);
      const Z = f3(fz) * 1.08883;
      const r = fromLinear(3.2406 * X - 1.5372 * Y - 0.4986 * Z);
      const g = fromLinear(-0.9689 * X + 1.8758 * Y + 0.0415 * Z);
      const b3 = fromLinear(0.0557 * X - 0.2040 * Y + 1.0570 * Z);
      return { space: 'srgb', coords: [clamp01(r), clamp01(g), clamp01(b3)], alpha: clamp01(alpha) };
    }
  }

  return null;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// ---------------------------------------------------------------------------
// Convenience: check if a color string is wide-gamut
// ---------------------------------------------------------------------------

/**
 * Returns true if the color string represents a color outside sRGB gamut.
 * Returns false for unparseable strings or sRGB colors.
 */
export function isWideGamut(colorStr: string): boolean {
  const parsed = parseAnyColor(colorStr);
  if (!parsed) return false;
  return exceedsSrgb(parsed);
}

/**
 * Returns the sRGB hex fallback for any color string.
 * Returns the original string if it's already sRGB hex, or null if unparseable.
 */
export function srgbFallbackHex(colorStr: string): string | null {
  const parsed = parseAnyColor(colorStr);
  if (!parsed) return null;
  return toHex(parsed);
}

/**
 * Get a CSS string that any browser can render for this color.
 * For sRGB colors, returns as-is. For wide-gamut, returns the original string
 * (modern browsers support it). Use srgbFallbackHex() for the fallback.
 */
export function cssColorString(colorStr: string): string {
  return colorStr; // modern browsers handle CSS Color 4 natively
}
