export function fontStyleToWeight(style: string): number {
  const s = style.toLowerCase();
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

function weightToFontStyleFallback(weight: number): string {
  if (weight <= 100) return 'Thin';
  if (weight <= 200) return 'ExtraLight';
  if (weight <= 300) return 'Light';
  if (weight <= 400) return 'Regular';
  if (weight <= 500) return 'Medium';
  if (weight <= 600) return 'SemiBold';
  if (weight <= 700) return 'Bold';
  if (weight <= 800) return 'ExtraBold';
  return 'Black';
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
  return cachedFontsPromise;
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

export async function resolveStyleForWeight(family: string, weight: number | string): Promise<string> {
  const targetWeight = typeof weight === 'number' ? weight : parseInt(weight, 10);
  try {
    const allFonts = await getAvailableFonts();
    const familyFonts = allFonts.filter(f => f.fontName.family === family);
    if (familyFonts.length === 0) return weightToFontStyleFallback(targetWeight);
    // Map each available style to its weight, find the closest
    let bestStyle = familyFonts[0].fontName.style;
    let bestDist = Infinity;
    for (const f of familyFonts) {
      const w = fontStyleToWeight(f.fontName.style);
      const dist = Math.abs(w - targetWeight);
      if (dist < bestDist) {
        bestDist = dist;
        bestStyle = f.fontName.style;
        if (dist === 0) break;
      }
    }
    return bestStyle;
  } catch (e) {
    console.debug('[fontLoading] font style lookup failed, using fallback:', e);
    return weightToFontStyleFallback(targetWeight);
  }
}
