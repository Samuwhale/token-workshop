import { buildWithStyleDictionary } from './utils.js';
import type { PlatformExporter, ExporterContext } from './types.js';

export const jsonExporter: PlatformExporter = {
  id: 'json',
  label: 'JSON',
  fileExtension: '.json',
  usesCssTokens: false,
  format: (ctx: ExporterContext) =>
    buildWithStyleDictionary(ctx, 'json', 'js', 'tokens.json', 'json/flat'),
};
