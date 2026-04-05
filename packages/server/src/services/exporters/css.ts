import { buildWithStyleDictionary } from './utils.js';
import type { PlatformExporter, ExporterContext } from './types.js';

export const cssExporter: PlatformExporter = {
  id: 'css',
  label: 'CSS Variables',
  fileExtension: '.css',
  usesCssTokens: true,

  format(ctx: ExporterContext): Promise<Array<{ path: string; content: string }>> {
    const selector = ctx.cssOptions?.selector;
    const extra = selector && selector !== ':root' ? { extraFileConfig: { options: { selector } } } : undefined;
    return buildWithStyleDictionary(ctx, 'css', 'css', 'variables.css', 'css/variables', 'tokens-css.json', extra);
  },
};
