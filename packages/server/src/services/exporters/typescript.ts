import { buildWithStyleDictionary } from './utils.js';
import type { PlatformExporter, ExporterContext } from './types.js';

export const typescriptExporter: PlatformExporter = {
  id: 'typescript',
  label: 'TypeScript / ES6',
  fileExtension: '.ts',
  usesCssTokens: false,
  format: (ctx: ExporterContext) =>
    buildWithStyleDictionary(ctx, 'typescript', 'js', 'tokens.ts', 'javascript/es6', undefined, { buildDir: 'ts' }),
};
