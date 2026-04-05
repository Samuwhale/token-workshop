export type ExportPlatform =
  | 'css'
  | 'scss'
  | 'less'
  | 'dart'
  | 'ios-swift'
  | 'android'
  | 'json'
  | 'typescript'
  | 'tailwind'
  | 'css-in-js';

export interface ExportResult {
  platform: ExportPlatform;
  files: { path: string; content: string }[];
  /** Set when the platform export failed; files will be empty. */
  error?: string;
}

export interface ExportTokensResult {
  results: ExportResult[];
  warnings: string[];
}

export interface CssExportOptions {
  selector?: string;
}

/** A flat token resolved from the DTCG tree. */
export type FlatToken = { path: string; value: unknown; type?: string };

/**
 * Context passed to every exporter's format() call.
 *
 * - tmpDir      — shared temp directory containing tokens.json and (when needed)
 *                 tokens-css.json; SD-based exporters build into subdirs here.
 * - flatTokens  — resolved flat token list; used by pure/custom exporters.
 * - cssOptions  — optional CSS selector override; only css.ts inspects this.
 */
export interface ExporterContext {
  tmpDir: string;
  flatTokens: FlatToken[];
  cssOptions?: CssExportOptions;
}

/**
 * Common interface for all platform exporters.
 *
 * Fields:
 *   id              — matches ExportPlatform; used as the key in results
 *   label           — human-readable name shown in UI / logs
 *   fileExtension   — primary output file extension (informational, e.g. ".css")
 *   usesCssTokens   — when true the orchestrator writes tokens-css.json
 *                     (formula → calc() injected) before calling format()
 *   format()        — always async; returns the list of { path, content }
 *                     pairs that make up this platform's output
 */
export interface PlatformExporter {
  readonly id: ExportPlatform;
  readonly label: string;
  readonly fileExtension: string;
  readonly usesCssTokens: boolean;
  format(ctx: ExporterContext): Promise<Array<{ path: string; content: string }>>;
}
