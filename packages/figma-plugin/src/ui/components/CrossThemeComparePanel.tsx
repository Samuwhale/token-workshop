import { useMemo, useState, useCallback } from 'react';
import type { TokenMapEntry } from '../../shared/types';
import type { ThemeDimension } from '@tokenmanager/core';
import { resolveAllAliases, isAlias } from '../../shared/resolveAlias';
import { swatchBgColor } from '../shared/colorUtils';

interface CrossThemeComparePanelProps {
  tokenPath: string;
  /** Unthemed raw token map (before any theme resolution) */
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToSet: Record<string, string>;
  dimensions: ThemeDimension[];
  onClose: () => void;
}

interface OptionResult {
  dimId: string;
  dimName: string;
  optionName: string;
  entry: TokenMapEntry | undefined;
  resolvedValue: unknown;
  isAliasToken: boolean;
  aliasRef?: string;
  missing: boolean;
}

/** Format a token value for compact display. */
function fmtValue(value: unknown, type: string): string {
  if (value === undefined || value === null) return '—';
  if (type === 'color' && typeof value === 'string') return value;
  if ((type === 'dimension' || type === 'duration') && typeof value === 'object' && value !== null && 'value' in value) {
    const v = value as { value: unknown; unit?: string };
    return `${v.value}${v.unit ?? (type === 'dimension' ? 'px' : 'ms')}`;
  }
  if (type === 'typography' && typeof value === 'object' && value !== null) {
    const v = value as Record<string, unknown>;
    const parts: string[] = [];
    if (v.fontFamily) parts.push(Array.isArray(v.fontFamily) ? String(v.fontFamily[0]) : String(v.fontFamily));
    if (v.fontSize) {
      parts.push(typeof v.fontSize === 'object' && v.fontSize !== null && 'value' in v.fontSize
        ? `${(v.fontSize as { value: unknown; unit?: string }).value}${(v.fontSize as { value: unknown; unit?: string }).unit ?? 'px'}`
        : `${v.fontSize}px`);
    }
    if (v.fontWeight) parts.push(String(v.fontWeight));
    return parts.join(' ') || '—';
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function resolveForOption(
  option: { sets: Record<string, string> },
  allTokensFlat: Record<string, TokenMapEntry>,
  pathToSet: Record<string, string>,
  themedSets: Set<string>,
): Record<string, TokenMapEntry> {
  // Base layer: tokens NOT assigned to any dimension
  const merged: Record<string, TokenMapEntry> = {};
  for (const [path, entry] of Object.entries(allTokensFlat)) {
    const set = pathToSet[path];
    if (!set || !themedSets.has(set)) merged[path] = entry;
  }
  // Source sets first (foundation)
  for (const [setName, status] of Object.entries(option.sets)) {
    if (status !== 'source') continue;
    for (const [path, entry] of Object.entries(allTokensFlat)) {
      if (pathToSet[path] === setName) merged[path] = entry;
    }
  }
  // Enabled sets override
  for (const [setName, status] of Object.entries(option.sets)) {
    if (status !== 'enabled') continue;
    for (const [path, entry] of Object.entries(allTokensFlat)) {
      if (pathToSet[path] === setName) merged[path] = entry;
    }
  }
  return resolveAllAliases(merged);
}

export function CrossThemeComparePanel({
  tokenPath,
  allTokensFlat,
  pathToSet,
  dimensions,
  onClose,
}: CrossThemeComparePanelProps) {
  const [copied, setCopied] = useState(false);

  // Collect all set names used by any dimension option
  const themedSets = useMemo(() => {
    const sets = new Set<string>();
    for (const dim of dimensions) {
      for (const option of dim.options) {
        for (const setName of Object.keys(option.sets)) sets.add(setName);
      }
    }
    return sets;
  }, [dimensions]);

  // For each dimension × option, compute resolved value for the token
  const results = useMemo((): OptionResult[] => {
    const out: OptionResult[] = [];
    for (const dim of dimensions) {
      for (const option of dim.options) {
        const resolved = resolveForOption(option, allTokensFlat, pathToSet, themedSets);
        const entry = resolved[tokenPath];
        const rawEntry = allTokensFlat[tokenPath]; // for alias detection before resolution
        const aliasCheck = rawEntry ? isAlias(rawEntry.$value) : false;
        let aliasRef: string | undefined;
        if (aliasCheck && rawEntry) {
          aliasRef = typeof rawEntry.$value === 'string' ? rawEntry.$value.replace(/^\{|\}$/g, '') : undefined;
        }
        out.push({
          dimId: dim.id,
          dimName: dim.name,
          optionName: option.name,
          entry,
          resolvedValue: entry?.$value,
          isAliasToken: aliasCheck,
          aliasRef,
          missing: !entry,
        });
      }
    }
    return out;
  }, [dimensions, allTokensFlat, pathToSet, themedSets, tokenPath]);

  // Detect if all values are identical (per dimension)
  const dimStats = useMemo(() => {
    const map = new Map<string, { allSame: boolean; anyMissing: boolean }>();
    for (const dim of dimensions) {
      const dimResults = results.filter(r => r.dimId === dim.id);
      const vals = dimResults.map(r => JSON.stringify(r.resolvedValue));
      map.set(dim.id, {
        allSame: new Set(vals).size <= 1,
        anyMissing: dimResults.some(r => r.missing),
      });
    }
    return map;
  }, [dimensions, results]);

  // Token type from the base flat map
  const tokenType = allTokensFlat[tokenPath]?.$type ?? '';
  const tokenName = tokenPath.split('.').pop() ?? tokenPath;

  const handleCopyTsv = useCallback(async () => {
    const rows: string[][] = [['Dimension', 'Option', 'Value']];
    for (const r of results) {
      rows.push([r.dimName, r.optionName, r.missing ? '(not set)' : fmtValue(r.resolvedValue, tokenType)]);
    }
    const tsv = rows.map(r => r.join('\t')).join('\n');
    await navigator.clipboard.writeText(tsv);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [results, tokenType]);

  if (dimensions.length === 0) {
    return (
      <div className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-semibold text-[var(--color-figma-text)]">Compare across themes</span>
          <button onClick={onClose} className="text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]">Close</button>
        </div>
        <p className="text-[10px] text-[var(--color-figma-text-secondary)]">No theme dimensions found. Add dimensions in the Themes tab to compare token values across options.</p>
      </div>
    );
  }

  return (
    <div className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] max-h-[320px] overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] sticky top-0 z-10">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] font-semibold text-[var(--color-figma-text)] truncate" title={tokenPath}>
            {tokenName}
          </span>
          {tokenType && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] shrink-0">
              {tokenType}
            </span>
          )}
          <span className="text-[10px] text-[var(--color-figma-text-tertiary)] shrink-0">across themes</span>
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          <button
            onClick={handleCopyTsv}
            className="text-[10px] px-2 py-0.5 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            title="Copy as tab-separated table"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            onClick={onClose}
            className="text-[10px] px-2 py-0.5 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* Per-dimension sections */}
      {dimensions.map(dim => {
        const stats = dimStats.get(dim.id)!;
        const dimResults = results.filter(r => r.dimId === dim.id);
        return (
          <div key={dim.id}>
            {/* Dimension header */}
            <div className="flex items-center gap-2 px-3 py-1 bg-[var(--color-figma-bg-secondary)] border-b border-[var(--color-figma-border)]">
              <span className="text-[10px] font-semibold text-[var(--color-figma-text)]">{dim.name}</span>
              {stats.allSame && !stats.anyMissing && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-600">Identical</span>
              )}
              {stats.anyMissing && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-600">Some missing</span>
              )}
            </div>

            {/* Option rows */}
            <table className="w-full text-[10px] border-collapse">
              <tbody>
                {dimResults.map(r => {
                  const formatted = r.missing ? '(not set)' : fmtValue(r.resolvedValue, tokenType);
                  const isColor = tokenType === 'color' && typeof r.resolvedValue === 'string';
                  return (
                    <tr key={r.optionName} className="border-b border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)]">
                      <td className="px-3 py-1.5 text-[var(--color-figma-text-secondary)] w-1/3 max-w-[120px]">
                        {r.optionName}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-[var(--color-figma-text)]">
                        {r.missing ? (
                          <span className="italic text-[var(--color-figma-text-tertiary)]">(not set)</span>
                        ) : (
                          <span className="flex items-center gap-1.5">
                            {isColor && (
                              <span
                                className="w-3 h-3 rounded-sm border border-white/20 ring-1 ring-[var(--color-figma-border)] shrink-0 inline-block"
                                style={{ backgroundColor: swatchBgColor(r.resolvedValue as string) }}
                                aria-hidden="true"
                              />
                            )}
                            <span className="truncate" title={formatted}>{formatted}</span>
                            {r.isAliasToken && r.aliasRef && (
                              <span className="text-[var(--color-figma-text-tertiary)] italic shrink-0">
                                ← {`{${r.aliasRef}}`}
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
