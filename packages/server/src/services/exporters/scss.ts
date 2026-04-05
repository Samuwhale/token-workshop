import { buildWithStyleDictionary } from './utils.js';
import type { PlatformExporter, ExporterContext } from './types.js';

export const scssExporter: PlatformExporter = {
  id: 'scss',
  label: 'SCSS Variables',
  fileExtension: '.scss',
  usesCssTokens: true,
  format: (ctx: ExporterContext) =>
    buildWithStyleDictionary(ctx, 'scss', 'css', '_variables.scss', 'scss/variables', 'tokens-css.json'),
};
