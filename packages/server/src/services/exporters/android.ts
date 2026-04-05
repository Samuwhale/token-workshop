import { buildWithStyleDictionary } from './utils.js';
import type { PlatformExporter, ExporterContext } from './types.js';

export const androidExporter: PlatformExporter = {
  id: 'android',
  label: 'Android / XML',
  fileExtension: '.xml',
  usesCssTokens: false,
  format: (ctx: ExporterContext) =>
    buildWithStyleDictionary(ctx, 'android', 'android', 'tokens.xml', 'android/resources'),
};
