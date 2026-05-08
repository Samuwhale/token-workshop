import type { DimensionValue, ShadowTokenValue } from '../shared/types.js';

const HEX_COLOR_PATTERN = /^[0-9a-fA-F]+$/;
const CSS_NUMBER_SOURCE = String.raw`[-+]?(?:\d+\.?\d*|\.\d+)`;
const CSS_CHANNEL_SOURCE = String.raw`(${CSS_NUMBER_SOURCE})(%?)`;
const RGB_COLOR_RE = new RegExp(
  String.raw`^rgba?\(\s*${CSS_CHANNEL_SOURCE}\s*[,/\s]\s*${CSS_CHANNEL_SOURCE}\s*[,/\s]\s*${CSS_CHANNEL_SOURCE}\s*(?:[,/]\s*${CSS_CHANNEL_SOURCE})?\s*\)$`,
  'i',
);
const HSL_COLOR_RE = new RegExp(
  String.raw`^hsla?\(\s*(${CSS_NUMBER_SOURCE})\s*[,/\s]\s*(${CSS_NUMBER_SOURCE})%?\s*[,/\s]\s*(${CSS_NUMBER_SOURCE})%?\s*(?:[,/]\s*${CSS_CHANNEL_SOURCE})?\s*\)$`,
  'i',
);
const OKLCH_COLOR_RE = new RegExp(
  String.raw`^oklch\(\s*${CSS_CHANNEL_SOURCE}\s+(?:,?\s*)(${CSS_NUMBER_SOURCE})\s+(?:,?\s*)(${CSS_NUMBER_SOURCE})\s*(?:/\s*${CSS_CHANNEL_SOURCE})?\s*\)$`,
  'i',
);
const OKLAB_COLOR_RE = new RegExp(
  String.raw`^oklab\(\s*${CSS_CHANNEL_SOURCE}\s+(?:,?\s*)(${CSS_NUMBER_SOURCE})\s+(?:,?\s*)(${CSS_NUMBER_SOURCE})\s*(?:/\s*${CSS_CHANNEL_SOURCE})?\s*\)$`,
  'i',
);
const CSS_COLOR_FUNCTION_RE = new RegExp(
  String.raw`^color\(\s*(display-p3|srgb)\s+(${CSS_NUMBER_SOURCE})\s+(${CSS_NUMBER_SOURCE})\s+(${CSS_NUMBER_SOURCE})\s*(?:/\s*${CSS_CHANNEL_SOURCE})?\s*\)$`,
  'i',
);

// Named CSS colors → 6-digit hex (no #)
const CSS_NAMED_COLORS: Record<string, string> = {
  aliceblue:'f0f8ff',antiquewhite:'faebd7',aqua:'00ffff',aquamarine:'7fffd4',azure:'f0ffff',
  beige:'f5f5dc',bisque:'ffe4c4',black:'000000',blanchedalmond:'ffebcd',blue:'0000ff',
  blueviolet:'8a2be2',brown:'a52a2a',burlywood:'deb887',cadetblue:'5f9ea0',chartreuse:'7fff00',
  chocolate:'d2691e',coral:'ff7f50',cornflowerblue:'6495ed',cornsilk:'fff8dc',crimson:'dc143c',
  cyan:'00ffff',darkblue:'00008b',darkcyan:'008b8b',darkgoldenrod:'b8860b',darkgray:'a9a9a9',
  darkgreen:'006400',darkgrey:'a9a9a9',darkkhaki:'bdb76b',darkmagenta:'8b008b',
  darkolivegreen:'556b2f',darkorange:'ff8c00',darkorchid:'9932cc',darkred:'8b0000',
  darksalmon:'e9967a',darkseagreen:'8fbc8f',darkslateblue:'483d8b',darkslategray:'2f4f4f',
  darkslategrey:'2f4f4f',darkturquoise:'00ced1',darkviolet:'9400d3',deeppink:'ff1493',
  deepskyblue:'00bfff',dimgray:'696969',dimgrey:'696969',dodgerblue:'1e90ff',firebrick:'b22222',
  floralwhite:'fffaf0',forestgreen:'228b22',fuchsia:'ff00ff',gainsboro:'dcdcdc',
  ghostwhite:'f8f8ff',gold:'ffd700',goldenrod:'daa520',gray:'808080',green:'008000',
  greenyellow:'adff2f',grey:'808080',honeydew:'f0fff0',hotpink:'ff69b4',indianred:'cd5c5c',
  indigo:'4b0082',ivory:'fffff0',khaki:'f0e68c',lavender:'e6e6fa',lavenderblush:'fff0f5',
  lawngreen:'7cfc00',lemonchiffon:'fffacd',lightblue:'add8e6',lightcoral:'f08080',
  lightcyan:'e0ffff',lightgoldenrodyellow:'fafad2',lightgray:'d3d3d3',lightgreen:'90ee90',
  lightgrey:'d3d3d3',lightpink:'ffb6c1',lightsalmon:'ffa07a',lightseagreen:'20b2aa',
  lightskyblue:'87cefa',lightslategray:'778899',lightslategrey:'778899',lightsteelblue:'b0c4de',
  lightyellow:'ffffe0',lime:'00ff00',limegreen:'32cd32',linen:'faf0e6',magenta:'ff00ff',
  maroon:'800000',mediumaquamarine:'66cdaa',mediumblue:'0000cd',mediumorchid:'ba55d3',
  mediumpurple:'9370db',mediumseagreen:'3cb371',mediumslateblue:'7b68ee',
  mediumspringgreen:'00fa9a',mediumturquoise:'48d1cc',mediumvioletred:'c71585',
  midnightblue:'191970',mintcream:'f5fffa',mistyrose:'ffe4e1',moccasin:'ffe4b5',
  navajowhite:'ffdead',navy:'000080',oldlace:'fdf5e6',olive:'808000',olivedrab:'6b8e23',
  orange:'ffa500',orangered:'ff4500',orchid:'da70d6',palegoldenrod:'eee8aa',palegreen:'98fb98',
  paleturquoise:'afeeee',palevioletred:'db7093',papayawhip:'ffefd5',peachpuff:'ffdab9',
  peru:'cd853f',pink:'ffc0cb',plum:'dda0dd',powderblue:'b0e0e6',purple:'800080',
  rebeccapurple:'663399',red:'ff0000',rosybrown:'bc8f8f',royalblue:'4169e1',
  saddlebrown:'8b4513',salmon:'fa8072',sandybrown:'f4a460',seagreen:'2e8b57',seashell:'fff5ee',
  sienna:'a0522d',silver:'c0c0c0',skyblue:'87ceeb',slateblue:'6a5acd',slategray:'708090',
  slategrey:'708090',snow:'fffafa',springgreen:'00ff7f',steelblue:'4682b4',tan:'d2b48c',
  teal:'008080',thistle:'d8bfd8',tomato:'ff6347',turquoise:'40e0d0',violet:'ee82ee',
  wheat:'f5deb3',white:'ffffff',whitesmoke:'f5f5f5',yellow:'ffff00',yellowgreen:'9acd32',
  transparent:'000000',
};

export function parseHexRaw(hex: string): { rgb: RGB; a: number } | null {
  const clean = hex.trim();
  if (!HEX_COLOR_PATTERN.test(clean)) {
    return null;
  }
  if (clean.length === 6 || clean.length === 8) {
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;
    const a = clean.length === 8 ? parseInt(clean.slice(6, 8), 16) / 255 : 1;
    return { rgb: { r, g, b }, a };
  }
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16) / 255;
    const g = parseInt(clean[1] + clean[1], 16) / 255;
    const b = parseInt(clean[2] + clean[2], 16) / 255;
    return { rgb: { r, g, b }, a: 1 };
  }
  if (clean.length === 4) {
    const r = parseInt(clean[0] + clean[0], 16) / 255;
    const g = parseInt(clean[1] + clean[1], 16) / 255;
    const b = parseInt(clean[2] + clean[2], 16) / 255;
    const a = parseInt(clean[3] + clean[3], 16) / 255;
    return { rgb: { r, g, b }, a };
  }
  return null;
}

function parseFiniteFloat(raw: string | undefined): number | null {
  if (raw === undefined) {
    return null;
  }
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : null;
}

function parseAlphaChannel(valueRaw: string | undefined, unitRaw: string | undefined): number {
  const value = parseFiniteFloat(valueRaw);
  if (value === null) {
    return 1;
  }
  return unitRaw === '%' ? value / 100 : value;
}

// Intentional duplicate of core's hslToSrgb — the plugin sandbox runs in a separate
// Figma runtime and cannot import from @token-workshop/core.
function hslToRgbValues(h: number, s: number, l: number): { r: number; g: number; b: number } {
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

export function parseColor(value: string): { rgb: RGB; a: number } | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();

  // Hex colors
  if (trimmed.startsWith('#')) {
    return parseHexRaw(trimmed.slice(1));
  }

  // rgb() / rgba()
  const rgbMatch = trimmed.match(RGB_COLOR_RE);
  if (rgbMatch) {
    let r = parseFiniteFloat(rgbMatch[1]);
    let g = parseFiniteFloat(rgbMatch[3]);
    let b = parseFiniteFloat(rgbMatch[5]);
    if (r === null || g === null || b === null) {
      return null;
    }
    if (rgbMatch[2] === '%') r = r / 100; else r = r / 255;
    if (rgbMatch[4] === '%') g = g / 100; else g = g / 255;
    if (rgbMatch[6] === '%') b = b / 100; else b = b / 255;
    const a = parseAlphaChannel(rgbMatch[7], rgbMatch[8]);
    return { rgb: { r: Math.max(0, Math.min(1, r)), g: Math.max(0, Math.min(1, g)), b: Math.max(0, Math.min(1, b)) }, a: Math.max(0, Math.min(1, a)) };
  }

  // hsl() / hsla()
  const hslMatch = trimmed.match(HSL_COLOR_RE);
  if (hslMatch) {
    const hue = parseFiniteFloat(hslMatch[1]);
    const saturation = parseFiniteFloat(hslMatch[2]);
    const lightness = parseFiniteFloat(hslMatch[3]);
    if (hue === null || saturation === null || lightness === null) {
      return null;
    }
    const h = hue % 360;
    const s = Math.max(0, Math.min(100, saturation));
    const l = Math.max(0, Math.min(100, lightness));
    const a = parseAlphaChannel(hslMatch[4], hslMatch[5]);
    const rgb = hslToRgbValues(h, s, l);
    return { rgb, a: Math.max(0, Math.min(1, a)) };
  }

  // oklch()
  const oklchMatch = trimmed.match(OKLCH_COLOR_RE);
  if (oklchMatch) {
    let L = parseFiniteFloat(oklchMatch[1]);
    const C = parseFiniteFloat(oklchMatch[3]);
    const H = parseFiniteFloat(oklchMatch[4]);
    if (L === null || C === null || H === null) {
      return null;
    }
    if (oklchMatch[2] === '%') L = L / 100;
    const a = parseAlphaChannel(oklchMatch[5], oklchMatch[6]);
    const srgb = oklchToSrgb(L, C, H);
    return { rgb: srgb, a: Math.max(0, Math.min(1, a)) };
  }

  // oklab()
  const oklabMatch = trimmed.match(OKLAB_COLOR_RE);
  if (oklabMatch) {
    let L = parseFiniteFloat(oklabMatch[1]);
    const oa = parseFiniteFloat(oklabMatch[3]);
    const ob = parseFiniteFloat(oklabMatch[4]);
    if (L === null || oa === null || ob === null) {
      return null;
    }
    if (oklabMatch[2] === '%') L = L / 100;
    const alpha = parseAlphaChannel(oklabMatch[5], oklabMatch[6]);
    const srgb = oklabToSrgbDirect(L, oa, ob);
    return { rgb: srgb, a: Math.max(0, Math.min(1, alpha)) };
  }

  // color(display-p3 r g b) / color(srgb r g b)
  const colorMatch = trimmed.match(CSS_COLOR_FUNCTION_RE);
  if (colorMatch) {
    const space = colorMatch[1].toLowerCase();
    const c0 = parseFiniteFloat(colorMatch[2]);
    const c1 = parseFiniteFloat(colorMatch[3]);
    const c2 = parseFiniteFloat(colorMatch[4]);
    if (c0 === null || c1 === null || c2 === null) {
      return null;
    }
    const a = parseAlphaChannel(colorMatch[5], colorMatch[6]);
    if (space === 'display-p3') {
      const srgb = p3ToSrgbDirect(c0, c1, c2);
      return { rgb: srgb, a: Math.max(0, Math.min(1, a)) };
    }
    return { rgb: { r: clamp01(c0), g: clamp01(c1), b: clamp01(c2) }, a: Math.max(0, Math.min(1, a)) };
  }

  // Named CSS colors
  const named = CSS_NAMED_COLORS[trimmed.toLowerCase()];
  if (named) {
    if (trimmed.toLowerCase() === 'transparent') {
      return { rgb: { r: 0, g: 0, b: 0 }, a: 0 };
    }
    return parseHexRaw(named);
  }

  return null;
}

// ---------------------------------------------------------------------------
// OKLCh/OKLAB → sRGB conversion (self-contained for plugin sandbox)
// ---------------------------------------------------------------------------

function clamp01(v: number): number { return Math.max(0, Math.min(1, v)); }

function finiteOrNull(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

function fromLinearSrgb(c: number): number {
  const v = Math.max(0, Math.min(1, c));
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

function oklabToSrgbDirect(L: number, a: number, b: number): RGB {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  const r = fromLinearSrgb( 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const g = fromLinearSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const b2 = fromLinearSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s);
  return { r: clamp01(r), g: clamp01(g), b: clamp01(b2) };
}

function oklchToSrgb(L: number, C: number, H: number): RGB {
  const rad = (H * Math.PI) / 180;
  return oklabToSrgbDirect(L, C * Math.cos(rad), C * Math.sin(rad));
}

function toLinearP3(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function p3ToSrgbDirect(pr: number, pg: number, pb: number): RGB {
  const R = toLinearP3(pr), G = toLinearP3(pg), B = toLinearP3(pb);
  const X = 0.4865709 * R + 0.2656677 * G + 0.1982173 * B;
  const Y = 0.2289746 * R + 0.6917385 * G + 0.0792869 * B;
  const Z = 0.0000000 * R + 0.0451134 * G + 1.0439444 * B;
  const r = fromLinearSrgb( 3.2406 * X - 1.5372 * Y - 0.4986 * Z);
  const g = fromLinearSrgb(-0.9689 * X + 1.8758 * Y + 0.0415 * Z);
  const b = fromLinearSrgb( 0.0557 * X - 0.2040 * Y + 1.0570 * Z);
  return { r: clamp01(r), g: clamp01(g), b: clamp01(b) };
}

export function rgbToHex(color: RGB | RGBA, alpha = 1): string {
  const r = finiteOrNull(color.r);
  const g = finiteOrNull(color.g);
  const b = finiteOrNull(color.b);
  const a = finiteOrNull(alpha);
  if (r === null || g === null || b === null || a === null) {
    return '#000000';
  }
  const toChannel = (value: number) => Math.round(clamp01(value) * 255).toString(16).padStart(2, '0');
  const red = toChannel(r);
  const green = toChannel(g);
  const blue = toChannel(b);
  if (a < 1) {
    const alphaChannel = toChannel(a);
    return `#${red}${green}${blue}${alphaChannel}`;
  }
  return `#${red}${green}${blue}`;
}

export function parseDimValue(dim: string | number | DimensionValue | null | undefined): number {
  if (typeof dim === 'number') return dim;
  if (typeof dim === 'string') {
    const parsed = parseFloat(dim);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (dim != null && typeof dim === 'object' && 'value' in dim) return dim.value;
  return 0;
}

/** Convert a DTCG shadow token value (single or array) to Figma DropShadowEffect[]. */
export function shadowTokenToEffects(value: ShadowTokenValue | ShadowTokenValue[]): DropShadowEffect[] {
  const shadows = Array.isArray(value) ? value : [value];
  return shadows.map((s) => {
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
}
