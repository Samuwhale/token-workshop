function normalizeFontStyleName(style: string): string {
  return style.toLowerCase().replace(/[\s_-]+/g, '');
}

export function styleHasItalic(style: string): boolean {
  const normalized = normalizeFontStyleName(style);
  return normalized.includes('italic') || normalized.includes('oblique');
}

export function fontStyleToWeight(style: string): number {
  const s = normalizeFontStyleName(style);
  if (s.includes('thin') || s.includes('hairline')) return 100;
  if (s.includes('extralight') || s.includes('ultralight')) return 200;
  if (s.includes('light')) return 300;
  if (s.includes('medium')) return 500;
  if (s.includes('semibold') || s.includes('demibold') || s.includes('demi')) return 600;
  if (s.includes('extrabold') || s.includes('ultrabold')) return 800;
  if (s.includes('bold')) return 700;
  if (s.includes('black') || s.includes('heavy')) return 900;
  if (s.includes('book') || s.includes('roman') || s.includes('normal') || s.includes('regular')) return 400;
  return 400;
}

function weightToFontStyleFallback(weight: number, italic = false): string {
  let base = 'Regular';
  if (weight <= 100) base = 'Thin';
  else if (weight <= 200) base = 'Extra Light';
  else if (weight <= 300) base = 'Light';
  else if (weight <= 400) base = 'Regular';
  else if (weight <= 500) base = 'Medium';
  else if (weight <= 600) base = 'Semi Bold';
  else if (weight <= 700) base = 'Bold';
  else if (weight <= 800) base = 'Extra Bold';
  else base = 'Black';

  if (!italic) return base;
  return base === 'Regular' ? 'Italic' : `${base} Italic`;
}

let cachedFontsPromise: Promise<Font[]> | null = null;

export function invalidateFontCache(): void {
  cachedFontsPromise = null;
}

function getAvailableFonts(): Promise<Font[]> {
  if (!cachedFontsPromise) {
    cachedFontsPromise = figma.listAvailableFontsAsync().catch((err) => {
      cachedFontsPromise = null;
      throw err;
    });
  }
  return cachedFontsPromise!;
}

/** Returns deduplicated sorted list of font family names available in Figma. */
export async function getAvailableFontFamilies(): Promise<string[]> {
  const fonts = await getAvailableFonts();
  const seen = new Set<string>();
  for (const f of fonts) {
    seen.add(f.fontName.family);
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b));
}

/**
 * Returns font families and the numeric weights available for each family.
 * Weights are derived from font style names via fontStyleToWeight.
 */
export async function getAvailableFontData(): Promise<{ families: string[]; weightsByFamily: Record<string, number[]> }> {
  const fonts = await getAvailableFonts();
  const weightSets = new Map<string, Set<number>>();
  for (const f of fonts) {
    const family = f.fontName.family;
    if (!weightSets.has(family)) weightSets.set(family, new Set());
    weightSets.get(family)!.add(fontStyleToWeight(f.fontName.style));
  }
  const families = Array.from(weightSets.keys()).sort((a, b) => a.localeCompare(b));
  const weightsByFamily: Record<string, number[]> = {};
  for (const [family, weights] of weightSets) {
    weightsByFamily[family] = Array.from(weights).sort((a, b) => a - b);
  }
  return { families, weightsByFamily };
}

export async function resolveFontStyle(
  family: string,
  options: { weight?: number | string; fontStyle?: string } = {},
): Promise<string> {
  const requestedStyle = options.fontStyle?.trim();
  const hasRequestedStyle = typeof requestedStyle === 'string' && requestedStyle.length > 0;
  const parsedWeight = options.weight == null
    ? fontStyleToWeight(requestedStyle ?? 'Regular')
    : typeof options.weight === 'number'
      ? options.weight
      : Number.parseInt(options.weight, 10);
  const targetWeight = Number.isFinite(parsedWeight) ? parsedWeight : 400;
  const preferItalic = hasRequestedStyle ? styleHasItalic(requestedStyle!) : false;

  try {
    const allFonts = await getAvailableFonts();
    const familyFonts = allFonts.filter((font) => font.fontName.family === family);
    if (familyFonts.length === 0) {
      return hasRequestedStyle
        ? requestedStyle!
        : weightToFontStyleFallback(targetWeight, preferItalic);
    }

    if (hasRequestedStyle) {
      const exactMatch = familyFonts.find(
        (font) => normalizeFontStyleName(font.fontName.style) === normalizeFontStyleName(requestedStyle!),
      );
      if (exactMatch) {
        return exactMatch.fontName.style;
      }
    }

    let bestStyle = familyFonts[0].fontName.style;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const font of familyFonts) {
      const style = font.fontName.style;
      const weightScore = Math.abs(fontStyleToWeight(style) - targetWeight);
      const italicPenalty = hasRequestedStyle && styleHasItalic(style) !== preferItalic ? 1000 : 0;
      const score = italicPenalty + weightScore;

      if (score < bestScore) {
        bestScore = score;
        bestStyle = style;
        if (score === 0) break;
      }
    }

    return bestStyle;
  } catch (e) {
    console.debug('[fontLoading] font style lookup failed, using fallback:', e);
    if (hasRequestedStyle) {
      return requestedStyle!;
    }
    return weightToFontStyleFallback(targetWeight, preferItalic);
  }
}

export async function resolveStyleForWeight(family: string, weight: number | string): Promise<string> {
  return resolveFontStyle(family, { weight });
}
