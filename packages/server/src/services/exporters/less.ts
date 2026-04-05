import { buildWithStyleDictionary } from './utils.js';
import type { PlatformExporter, ExporterContext } from './types.js';

export const lessExporter: PlatformExporter = {
  id: 'less',
  label: 'Less Variables',
  fileExtension: '.less',
  usesCssTokens: true,
  format: (ctx: ExporterContext) =>
    buildWithStyleDictionary(ctx, 'less', 'css', 'variables.less', 'less/variables', 'tokens-css.json'),
};
