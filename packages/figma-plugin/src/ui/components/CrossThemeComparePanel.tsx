import { useMemo, useState, useCallback } from 'react';
import type { TokenMapEntry } from '../../shared/types';
import type { ThemeDimension } from '@tokenmanager/core';
import { isAlias } from '../../shared/resolveAlias';
import { swatchBgColor } from '../shared/colorUtils';
import { formatTokenValueForDisplay } from '../shared/tokenFormatting';
import { resolveThemeOption, copyToClipboard } from '../shared/comparisonUtils';
import { apiFetch } from '../shared/apiFetch';

interface CrossThemeComparePanelProps {
  tokenPath: string;
  /** Unthemed raw token map (before any theme resolution) */
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToSet: Record<string, string>;
  dimensions: ThemeDimension[];
  onClose: () => void;
  /** Server URL for direct batch token creation */
  serverUrl?: string;
  /** Called after tokens are batch-created so the caller can refresh */
  onTokensCreated?: () => void;
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
  return formatTokenValueForDisplay(type, value);
}


export function CrossThemeComparePanel({
  tokenPath,
  allTokensFlat,
  pathToSet,
  dimensions,
  onClose,
  serverUrl,
  onTokensCreated,
}: CrossThemeComparePanelProps) {
  const [copied, setCopied] = useState(false);
  const [creatingMissing, setCreatingMissing] = useState(false);
  const [createResult, setCreateResult] = useState<string | null>(null);

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
        const resolved = resolveThemeOption(option, allTokensFlat, pathToSet, themedSets);
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
    await copyToClipboard(tsv, () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [results, tokenType]);

  const missingResults = useMemo(() => results.filter(r => r.missing), [results]);

  const handleCreateMissingOverrides = useCallback(async () => {
    if (!serverUrl || missingResults.length === 0) return;
    const baseEntry = allTokensFlat[tokenPath];
    if (!baseEntry) return;

    // Determine target set for each missing option; collect unique sets
    const targetSets = new Set<string>();
    for (const r of missingResults) {
      const dim = dimensions.find(d => d.id === r.dimId);
      const opt = dim?.options.find(o => o.name === r.optionName);
      if (!opt) continue;
      const enabled = Object.entries(opt.sets).filter(([, s]) => s === 'enabled').map(([n]) => n);
      const targetSet = enabled[0] ?? Object.entries(opt.sets).filter(([, s]) => s === 'source').map(([n]) => n)[0];
      if (targetSet) targetSets.add(targetSet);
    }

    if (targetSets.size === 0) return;

    setCreatingMissing(true);
    setCreateResult(null);
    let totalCreated = 0;
    try {
      for (const set of targetSets) {
        const tokens = [{ path: tokenPath, $type: baseEntry.$type, $value: baseEntry.$value }];
        await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(set)}/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tokens, strategy: 'overwrite' }),
        });
        totalCreated++;
      }
      setCreateResult(`Created in ${totalCreated} set${totalCreated !== 1 ? 's' : ''}`);
      setTimeout(() => setCreateResult(null), 3000);
      onTokensCreated?.();
    } catch {
      setCreateResult('Failed');
      setTimeout(() => setCreateResult(null), 3000);
    } finally {
      setCreatingMissing(false);
    }
  }, [serverUrl, missingResults, allTokensFlat, tokenPath, dimensions, onTokensCreated]);

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
          {serverUrl && missingResults.length > 0 && (
            <>
              {createResult && (
                <span className="text-[10px] text-[var(--color-figma-text-secondary)]">{createResult}</span>
              )}
              <button
                onClick={handleCreateMissingOverrides}
                disabled={creatingMissing}
                title={`Create overrides for ${missingResults.length} missing option${missingResults.length !== 1 ? 's' : ''}`}
                className="text-[10px] px-2 py-0.5 rounded font-medium bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/20 disabled:opacity-50 transition-colors"
              >
                {creatingMissing ? 'Creating…' : `+ ${missingResults.length} missing`}
              </button>
            </>
          )}
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
