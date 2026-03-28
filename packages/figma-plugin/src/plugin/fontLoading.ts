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

const DEFAULT_WEIGHT_STYLES: Record<number, string> = {
  100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular',
  500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black',
};

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

export async function resolveStyleForWeight(family: string, weight: number | string): Promise<string> {
  const targetWeight = typeof weight === 'number' ? weight : parseInt(weight, 10);
  try {
    const allFonts = await figma.listAvailableFontsAsync();
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
  } catch {
    return weightToFontStyleFallback(targetWeight);
  }
}
