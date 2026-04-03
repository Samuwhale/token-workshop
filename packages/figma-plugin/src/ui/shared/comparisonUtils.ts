/**
 * Shared utilities for token comparison across ComparePanel, CrossThemeComparePanel,
 * and ThemeCompare. Extracts duplicated resolution, diff, export, and clipboard logic.
 */

import type { TokenMapEntry } from '../../shared/types';
import { resolveAllAliases } from '../../shared/resolveAlias';

// ---------------------------------------------------------------------------
// Token resolution
// ---------------------------------------------------------------------------

/**
 * Merge and resolve tokens for a theme option (source sets first, then enabled
 * sets override). Returns a fully-resolved flat token map.
 *
 * @param option      Theme option with a `sets` map. Pass null to resolve all
 *                    tokens in allTokensFlat without theme filtering.
 * @param allTokensFlat  Unresolved flat token map (all sets combined).
 * @param pathToSet   Maps token path → owning set name.
 * @param themedSets  When provided, tokens whose set is NOT in this set are
 *                    included as a base layer before source/enabled sets are
 *                    applied (i.e. "non-themed" tokens as foundation).
 */
export function resolveThemeOption(
  option: { sets: Record<string, string> } | null,
  allTokensFlat: Record<string, TokenMapEntry>,
  pathToSet: Record<string, string>,
  themedSets?: Set<string>,
): Record<string, TokenMapEntry> {
  if (!option) return resolveAllAliases(allTokensFlat);

  const merged: Record<string, TokenMapEntry> = {};

  // Optional base layer: tokens not owned by any themed set
  if (themedSets) {
    for (const [path, entry] of Object.entries(allTokensFlat)) {
      const set = pathToSet[path];
      if (!set || !themedSets.has(set)) merged[path] = entry;
    }
  }

  // Source sets (foundation)
  for (const [setName, status] of Object.entries(option.sets)) {
    if (status !== 'source') continue;
    for (const [path, entry] of Object.entries(allTokensFlat)) {
      if (pathToSet[path] === setName) merged[path] = entry;
    }
  }

  // Enabled sets (override)
  for (const [setName, status] of Object.entries(option.sets)) {
    if (status !== 'enabled') continue;
    for (const [path, entry] of Object.entries(allTokensFlat)) {
      if (pathToSet[path] === setName) merged[path] = entry;
    }
  }

  return resolveAllAliases(merged);
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

/**
 * Build an RFC 4180-compliant CSV string from a 2-D array of cells and trigger
 * a browser download.
 *
 * @param filename  Suggested filename for the download (e.g. "compare.csv").
 * @param rows      First row is treated as the header.
 */
export function exportCsvFile(filename: string, rows: string[][]): void {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const csv = rows.map(r => r.map(esc).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Clipboard copy
// ---------------------------------------------------------------------------

/**
 * Write text to the clipboard. Calls onSuccess on success (e.g. to flip a
 * "Copied!" feedback state) and onError on failure. Logs a warning and
 * optionally relays an error notification to the Figma plugin host on failure.
 *
 * @param text       Text to copy.
 * @param onSuccess  Called when the copy succeeds.
 * @param onError    Called when the copy fails (receives the caught error).
 */
export async function copyToClipboard(
  text: string,
  onSuccess?: () => void,
  onError?: (err: unknown) => void,
): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    onSuccess?.();
  } catch (err) {
    console.warn('[clipboard] write failed:', err);
    onError?.(err);
  }
}
