import type { PlatformExporter, ExporterContext, FlatToken } from './types.js';
import { setNested, serializeJsValue } from './utils.js';

/**
 * Generate a CSS-in-JS theme object compatible with styled-components and Emotion.
 * All tokens are placed in a nested TypeScript const object keyed by their paths.
 */
function generateCssInJs(tokens: FlatToken[]): string {
  const themeObj: Record<string, unknown> = {};
  for (const token of tokens) {
    setNested(themeObj, token.path.split('.'), token.value);
  }
  const themeContent = serializeJsValue(themeObj, 0);
  return `export const theme = ${themeContent} as const;\n\nexport type Theme = typeof theme;\n`;
}

export const cssInJsExporter: PlatformExporter = {
  id: 'css-in-js',
  label: 'CSS-in-JS (styled-components / Emotion)',
  fileExtension: '.ts',
  usesCssTokens: false,

  async format(ctx: ExporterContext): Promise<Array<{ path: string; content: string }>> {
    const content = generateCssInJs(ctx.flatTokens);
    return [{ path: 'theme.ts', content }];
  },
};
