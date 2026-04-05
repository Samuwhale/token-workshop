import { buildWithStyleDictionary } from './utils.js';
import type { PlatformExporter, ExporterContext } from './types.js';

export const iosSwiftExporter: PlatformExporter = {
  id: 'ios-swift',
  label: 'iOS / Swift',
  fileExtension: '.swift',
  usesCssTokens: false,
  format: (ctx: ExporterContext) =>
    buildWithStyleDictionary(ctx, 'ios-swift', 'ios-swift', 'Tokens.swift', 'ios-swift/class.swift', undefined, {
      buildDir: 'ios',
      extraFileConfig: { className: 'Tokens' },
    }),
};
