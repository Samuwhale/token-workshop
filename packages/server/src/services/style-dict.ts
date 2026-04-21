import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import type { TokenGroup } from '@tokenmanager/core';
import type { CssExportOptions, ExportPlatform, ExportResult, ExportTokensResult } from './exporters/index.js';
import { EXPORTERS } from './exporters/index.js';
import { deepMergeInto, resolveGradientStopAliases, injectFormulaCalc, buildFlatValueMap, buildFlatTokenList } from './exporters/utils.js';

export async function exportTokens(
  tokens: Record<string, TokenGroup>,
  platforms: ExportPlatform[],
  outputDir?: string,
  cssOptions?: CssExportOptions,
): Promise<ExportTokensResult> {
  const isTemp = !outputDir;
  const tmpDir = outputDir || path.join(os.tmpdir(), `tokenmanager-export-${Date.now()}`);
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    // Deep-merge all collections so that shared top-level group keys are combined
    // rather than the second collection silently overwriting the first.
    const merged: Record<string, any> = {};
    const warnings: string[] = [];
    for (const [collectionId, tokenGroup] of Object.entries(tokens)) {
      const collectionConflicts: string[] = [];
      deepMergeInto(merged, tokenGroup as Record<string, any>, collectionConflicts);
      for (const tokenPath of collectionConflicts) {
        const msg = `Token "${tokenPath}" is defined in multiple collections; value from collection "${collectionId}" will be used`;
        console.warn(`[export] ${msg}`);
        warnings.push(msg);
      }
    }

    // Pre-resolve alias references inside gradient stop color fields.
    const resolvedMerged = resolveGradientStopAliases(merged);

    // Write the base token file (used by non-CSS SD platforms).
    const tokenFile = path.join(tmpDir, 'tokens.json');
    await fs.writeFile(`${tokenFile}.tmp`, JSON.stringify(resolvedMerged, null, 2));
    await fs.rename(`${tokenFile}.tmp`, tokenFile);

    // Write the CSS-optimized token file (formula → calc()) only when needed.
    const needsCssTokens = platforms.some(p => EXPORTERS.get(p)?.usesCssTokens);
    const cssTokenFile = path.join(tmpDir, 'tokens-css.json');
    if (needsCssTokens) {
      const cssOptimized = injectFormulaCalc(resolvedMerged);
      await fs.writeFile(`${cssTokenFile}.tmp`, JSON.stringify(cssOptimized, null, 2));
      await fs.rename(`${cssTokenFile}.tmp`, cssTokenFile);
    }

    // Build the flat token list for pure/custom exporters (tailwind, css-in-js).
    const flatMap = buildFlatValueMap(resolvedMerged);
    const flatTokens = buildFlatTokenList(resolvedMerged, flatMap);

    const ctx = { tmpDir, flatTokens, cssOptions };

    // Run each requested platform exporter.
    const results: ExportResult[] = [];
    for (const platform of platforms) {
      const exporter = EXPORTERS.get(platform);
      if (!exporter) continue;
      try {
        const files = await exporter.format(ctx);
        results.push({ platform, files });
      } catch (err) {
        results.push({ platform, files: [], error: String(err) });
      }
    }

    return { results, warnings };
  } finally {
    if (isTemp) {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {
        // Non-fatal — temp cleanup failure should not break the export result
      });
    }
  }
}
