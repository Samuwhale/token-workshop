export type { ExportPlatform, ExportResult, ExportTokensResult, CssExportOptions, FlatToken, ExporterContext, PlatformExporter } from './types.js';

import type { ExportPlatform, PlatformExporter } from './types.js';

import { cssExporter } from './css.js';
import { scssExporter } from './scss.js';
import { lessExporter } from './less.js';
import { dartExporter } from './dart.js';
import { iosSwiftExporter } from './ios-swift.js';
import { androidExporter } from './android.js';
import { jsonExporter } from './json.js';
import { typescriptExporter } from './typescript.js';
import { tailwindExporter } from './tailwind.js';
import { cssInJsExporter } from './css-in-js.js';

/** All registered platform exporters, keyed by platform id. */
export const EXPORTERS = new Map<ExportPlatform, PlatformExporter>([
  ['css', cssExporter],
  ['scss', scssExporter],
  ['less', lessExporter],
  ['dart', dartExporter],
  ['ios-swift', iosSwiftExporter],
  ['android', androidExporter],
  ['json', jsonExporter],
  ['typescript', typescriptExporter],
  ['tailwind', tailwindExporter],
  ['css-in-js', cssInJsExporter],
]);
