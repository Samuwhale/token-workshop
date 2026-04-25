import type { PlatformExporter, ExporterContext, FlatToken } from './types.js';
import { setNested, serializeJsValue } from './utils.js';

/** Maps DTCG $type values to Tailwind CSS theme section keys. */
const TAILWIND_THEME_KEYS: Record<string, string> = {
  color: 'colors',
  spacing: 'spacing',
  dimension: 'spacing',
  fontFamily: 'fontFamily',
  fontSize: 'fontSize',
  fontWeight: 'fontWeight',
  lineHeight: 'lineHeight',
  letterSpacing: 'letterSpacing',
  borderRadius: 'borderRadius',
  borderWidth: 'borderWidth',
  opacity: 'opacity',
  boxShadow: 'boxShadow',
  duration: 'transitionDuration',
  cubicBezier: 'transitionTimingFunction',
};

/**
 * Generate a Tailwind CSS v3 config file from a flat token list.
 * Tokens are grouped by $type and placed in the appropriate theme.extend section.
 * Tokens with unrecognized $type are skipped.
 */
function generateTailwindConfig(tokens: FlatToken[]): string {
  const themeExtend: Record<string, unknown> = {};
  for (const token of tokens) {
    const tailwindKey = token.type ? TAILWIND_THEME_KEYS[token.type] : undefined;
    if (!tailwindKey) continue;
    if (!(tailwindKey in themeExtend)) themeExtend[tailwindKey] = {};
    setNested(
      themeExtend[tailwindKey] as Record<string, unknown>,
      token.path.split('.'),
      token.value,
    );
  }
  const themeContent = serializeJsValue({ extend: themeExtend }, 2);
  return `/** @type {import('tailwindcss').Config} */\nmodule.exports = {\n  theme: ${themeContent},\n};\n`;
}

export const tailwindExporter: PlatformExporter = {
  id: 'tailwind',
  label: 'Tailwind CSS Config',
  fileExtension: '.js',
  usesCssTokens: false,

  async format(ctx: ExporterContext): Promise<Array<{ path: string; content: string }>> {
    const content = generateTailwindConfig(ctx.flatTokens);
    return [{ path: 'tailwind.config.js', content }];
  },
};
