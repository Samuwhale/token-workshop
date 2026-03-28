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
  if (hex.length === 6 || hex.length === 8) {
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
    return { rgb: { r, g, b }, a };
  }
  if (hex.length === 3) {
    const r = parseInt(hex[0] + hex[0], 16) / 255;
    const g = parseInt(hex[1] + hex[1], 16) / 255;
    const b = parseInt(hex[2] + hex[2], 16) / 255;
    return { rgb: { r, g, b }, a: 1 };
  }
  if (hex.length === 4) {
    const r = parseInt(hex[0] + hex[0], 16) / 255;
    const g = parseInt(hex[1] + hex[1], 16) / 255;
    const b = parseInt(hex[2] + hex[2], 16) / 255;
    const a = parseInt(hex[3] + hex[3], 16) / 255;
    return { rgb: { r, g, b }, a };
  }
  return null;
}

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
  const rgbMatch = trimmed.match(/^rgba?\(\s*([\d.]+)(%?)\s*[,/\s]\s*([\d.]+)(%?)\s*[,/\s]\s*([\d.]+)(%?)\s*(?:[,/]\s*([\d.]+)(%?))?\s*\)$/i);
  if (rgbMatch) {
    let r = parseFloat(rgbMatch[1]);
    let g = parseFloat(rgbMatch[3]);
    let b = parseFloat(rgbMatch[5]);
    if (rgbMatch[2] === '%') r = r / 100; else r = r / 255;
    if (rgbMatch[4] === '%') g = g / 100; else g = g / 255;
    if (rgbMatch[6] === '%') b = b / 100; else b = b / 255;
    let a = 1;
    if (rgbMatch[7] !== undefined) {
      a = parseFloat(rgbMatch[7]);
      if (rgbMatch[8] === '%') a = a / 100;
    }
    return { rgb: { r: Math.max(0, Math.min(1, r)), g: Math.max(0, Math.min(1, g)), b: Math.max(0, Math.min(1, b)) }, a: Math.max(0, Math.min(1, a)) };
  }

  // hsl() / hsla()
  const hslMatch = trimmed.match(/^hsla?\(\s*([\d.]+)\s*[,/\s]\s*([\d.]+)%?\s*[,/\s]\s*([\d.]+)%?\s*(?:[,/]\s*([\d.]+)(%?))?\s*\)$/i);
  if (hslMatch) {
    const h = parseFloat(hslMatch[1]) % 360;
    const s = Math.max(0, Math.min(100, parseFloat(hslMatch[2])));
    const l = Math.max(0, Math.min(100, parseFloat(hslMatch[3])));
    let a = 1;
    if (hslMatch[4] !== undefined) {
      a = parseFloat(hslMatch[4]);
      if (hslMatch[5] === '%') a = a / 100;
    }
    const rgb = hslToRgbValues(h, s, l);
    return { rgb, a: Math.max(0, Math.min(1, a)) };
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

export function rgbToHex(color: RGB | RGBA, alpha = 1): string {
  const r = Math.round(color.r * 255).toString(16).padStart(2, '0');
  const g = Math.round(color.g * 255).toString(16).padStart(2, '0');
  const b = Math.round(color.b * 255).toString(16).padStart(2, '0');
  if (alpha < 1) {
    const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
    return `#${r}${g}${b}${a}`;
  }
  return `#${r}${g}${b}`;
}

export function parseDimValue(dim: any): number {
  if (typeof dim === 'number') return dim;
  if (typeof dim === 'string') {
    const parsed = parseFloat(dim);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof dim === 'object' && dim.value != null) return dim.value;
  return 0;
}
