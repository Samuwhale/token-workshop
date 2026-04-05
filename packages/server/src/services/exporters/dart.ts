import { buildWithStyleDictionary } from './utils.js';
import type { PlatformExporter, ExporterContext } from './types.js';

export const dartExporter: PlatformExporter = {
  id: 'dart',
  label: 'Dart / Flutter',
  fileExtension: '.dart',
  usesCssTokens: false,
  format: (ctx: ExporterContext) =>
    buildWithStyleDictionary(ctx, 'dart', 'flutter', 'tokens.dart', 'flutter/class.dart'),
};
