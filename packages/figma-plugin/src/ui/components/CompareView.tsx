import { useCallback, useMemo, useState } from 'react';
import type { TokenMapEntry } from '../../shared/types';
import type { ThemeDimension } from '@tokenmanager/core';
import { isAlias, resolveTokenValue } from '../../shared/resolveAlias';
import { stableStringify } from '../shared/utils';
import { formatTokenValueForDisplay } from '../shared/tokenFormatting';
import { swatchBgColor } from '../shared/colorUtils';
import { resolveThemeOption, exportCsvFile, copyToClipboard } from '../shared/comparisonUtils';
import { nodeParentPath, formatDisplayPath } from './tokenListUtils';
import { apiFetch } from '../shared/apiFetch';

// ──────────────────────────────────────────────────────────────────────────────
// Shared primitives
// ──────────────────────────────────────────────────────────────────────────────

function ColorSwatch({ value }: { value: string }) {
  if (typeof value !== 'string' || value === '') return null;
  if (value.startsWith('#') && !/^#[0-9a-fA-F]{3,8}$/.test(value)) return null;
  return (
    <div
      className="w-3 h-3 rounded-sm border border-white/20 ring-1 ring-[var(--color-figma-border)] shrink-0 inline-block align-middle mr-1"
      style={{ backgroundColor: swatchBgColor(value) }}
      aria-hidden="true"
    />
  );
}

/** Copy-to-clipboard with "Copied!" feedback. Optional onError for notification side-effects. */
function useCopyFeedback(onError?: () => void): [boolean, (text: string) => Promise<void>] {
  const [copied, setCopied] = useState(false);
  const triggerCopy = useCallback(async (text: string) => {
    await copyToClipboard(
      text,
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      onError,
    );
  }, [onError]);
  return [copied, triggerCopy];
}

// ──────────────────────────────────────────────────────────────────────────────
// Module-level helpers (used by specific modes)
// ──────────────────────────────────────────────────────────────────────────────

/** Extract all property keys from a composite value object. */
function getPropertyKeys(value: unknown): string[] {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) return ['$value'];
  return Object.keys(value as object).sort();
}

/** Format a single property value within a composite token. */
function fmtProp(value: unknown, key: string): string {
  if (key === '$value') return typeof value === 'object' ? JSON.stringify(value) : String(value ?? '—');
  const v = (value as Record<string, unknown>)?.[key];
  if (v === undefined || v === null) return '—';
  if (typeof v === 'object' && 'value' in (v as object)) {
    const obj = v as { value: unknown; unit?: unknown };
    return `${obj.value}${obj.unit ?? ''}`;
  }
  if (Array.isArray(v)) return (v as unknown[]).join(', ');
  return String(v);
}

/** Flat list of all options across dimensions, used by ThemeOptionsMode. */
type FlatOption = { label: string; key: string; sets: Record<string, 'enabled' | 'disabled' | 'source'> };

function buildFlatOptions(dimensions: ThemeDimension[]): FlatOption[] {
  const result: FlatOption[] = [];
  for (const dim of dimensions) {
    for (const opt of dim.options) {
      result.push({
        label: dimensions.length > 1 ? `${dim.name} / ${opt.name}` : opt.name,
        key: `${dim.id}:${opt.name}`,
        sets: opt.sets,
      });
    }
  }
  return result;
}

// ──────────────────────────────────────────────────────────────────────────────
// Mode 1 – Token values (multiple selected tokens, side-by-side properties)
// ──────────────────────────────────────────────────────────────────────────────

interface ResolvedToken {
  path: string;
  name: string;
  type: string;
  rawValue: unknown;
  resolvedValue: unknown;
  isAlias: boolean;
  aliasRef?: string;
}

interface TokenValuesModeProps {
  selectedPaths: Set<string>;
  allTokensFlat: Record<string, TokenMapEntry>;
  onClose: () => void;
}

function TokenValuesMode({ selectedPaths, allTokensFlat, onClose }: TokenValuesModeProps) {
  const tokens = useMemo(() => {
    const result: ResolvedToken[] = [];
    for (const path of selectedPaths) {
      const entry = allTokensFlat[path];
      if (!entry) continue;
      const name = path.split('.').pop() ?? path;
      const aliasCheck = isAlias(entry.$value);
      let resolved = entry.$value;
      let aliasRef: string | undefined;
      if (aliasCheck) {
        aliasRef = typeof entry.$value === 'string' ? entry.$value.replace(/^\{|\}$/g, '') : undefined;
        const res = resolveTokenValue(entry.$value, allTokensFlat);
        if (res && !res.error) resolved = res.value;
      }
      result.push({ path, name, type: entry.$type, rawValue: entry.$value, resolvedValue: resolved, isAlias: aliasCheck, aliasRef });
    }
    return result.sort((a, b) => a.path.localeCompare(b.path));
  }, [selectedPaths, allTokensFlat]);

  const allSameType = tokens.length > 0 && tokens.every(t => t.type === tokens[0].type);
  const hasStructuredValues = tokens.some(t => typeof t.resolvedValue === 'object' && t.resolvedValue !== null && !Array.isArray(t.resolvedValue));

  const propertyKeys = useMemo(() => {
    if (!hasStructuredValues) return ['$value'];
    const keys = new Set<string>();
    for (const t of tokens) {
      for (const k of getPropertyKeys(t.resolvedValue)) keys.add(k);
    }
    return [...keys].sort();
  }, [tokens, hasStructuredValues]);

  const rowDiffs = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const key of propertyKeys) {
      const values = tokens.map(t => {
        if (key === '$value') return stableStringify(t.resolvedValue);
        return stableStringify((t.resolvedValue as Record<string, unknown>)?.[key]);
      });
      map[key] = values.length > 1 && new Set(values).size > 1;
    }
    return map;
  }, [tokens, propertyKeys]);

  const anyDiff = Object.values(rowDiffs).some(Boolean);

  const aliasDiffers = tokens.some(t => t.isAlias) &&
    new Set(tokens.map(t => t.aliasRef ?? '')).size > 1;

  const scopesDiffer = useMemo(() => {
    const scopeVals = tokens.map(t => {
      const entry = allTokensFlat[t.path];
      return stableStringify(entry?.$scopes ?? []);
    });
    return new Set(scopeVals).size > 1;
  }, [tokens, allTokensFlat]);

  const [showDiffsOnly, setShowDiffsOnly] = useState(false);

  const [copied, triggerCopy] = useCopyFeedback();

  const buildRows = useCallback((): string[][] => {
    const header = ['Property', ...tokens.map(t => t.path)];
    const rows: string[][] = [header];

    if (!allSameType) {
      rows.push(['type', ...tokens.map(t => t.type)]);
    }
    if (tokens.some(t => t.isAlias)) {
      rows.push(['alias', ...tokens.map(t => (t.isAlias ? `{${t.aliasRef}}` : ''))]);
    }

    if (hasStructuredValues) {
      for (const key of propertyKeys) {
        rows.push([key, ...tokens.map(t => fmtProp(t.resolvedValue, key))]);
      }
    } else {
      rows.push(['value', ...tokens.map(t => formatTokenValueForDisplay(t.type, t.resolvedValue))]);
    }

    const hasScopes = tokens.some(t => {
      const entry = allTokensFlat[t.path];
      return entry?.$scopes && entry.$scopes.length > 0;
    });
    if (hasScopes) {
      rows.push(['scopes', ...tokens.map(t => {
        const entry = allTokensFlat[t.path];
        return entry?.$scopes?.join(', ') ?? '';
      })]);
    }

    return rows;
  }, [tokens, allSameType, hasStructuredValues, propertyKeys, allTokensFlat]);

  const handleCopy = useCallback(async () => {
    const tsv = buildRows().map(r => r.join('\t')).join('\n');
    await triggerCopy(tsv);
  }, [buildRows, triggerCopy]);

  const handleExportCsv = useCallback(() => {
    exportCsvFile(`token-compare-${tokens.length}-tokens.csv`, buildRows());
  }, [buildRows, tokens.length]);

  if (tokens.length === 0) {
    return (
      <div className="px-3 py-2 text-[10px] text-[var(--color-figma-text-secondary)] border-b border-[var(--color-figma-border)]">
        No token data found for selected paths.
        <button onClick={onClose} className="ml-2 underline">Close</button>
      </div>
    );
  }

  if (tokens.length === 1) {
    return (
      <div className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-semibold text-[var(--color-figma-text)]">Compare tokens</span>
          <button
            onClick={onClose}
            className="text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
          >
            Close
          </button>
        </div>
        <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
          <span className="font-medium text-[var(--color-figma-text)]">{tokens[0].name}</span> selected — click additional tokens to compare side by side.
        </p>
      </div>
    );
  }

  return (
    <div className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] max-h-[280px] overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-[var(--color-figma-text)]">
            Compare {tokens.length} tokens
          </span>
          {allSameType && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]">
              {tokens[0].type}
            </span>
          )}
          {!anyDiff && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-600">
              All identical
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowDiffsOnly(v => !v)}
            disabled={!anyDiff}
            className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
              showDiffsOnly
                ? 'bg-yellow-500/20 text-yellow-700 hover:bg-yellow-500/30'
                : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
            title={anyDiff ? 'Show only rows where values differ' : 'No differences to filter'}
          >
            Diffs only
          </button>
          <button
            onClick={handleCopy}
            className="text-[10px] px-2 py-0.5 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            title="Copy comparison as tab-separated table"
          >
            {copied ? 'Copied!' : 'Copy table'}
          </button>
          <button
            onClick={handleExportCsv}
            className="text-[10px] px-2 py-0.5 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            title="Download comparison as CSV"
          >
            Export CSV
          </button>
          <button
            onClick={onClose}
            className="text-[10px] px-2 py-0.5 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* Comparison table */}
      <div className="overflow-x-auto">
        <table className="w-full text-[10px] border-collapse">
          <thead>
            <tr className="bg-[var(--color-figma-bg-secondary)]">
              <th className="text-left px-3 py-1.5 font-medium text-[var(--color-figma-text-secondary)] border-b border-r border-[var(--color-figma-border)] sticky left-0 bg-[var(--color-figma-bg-secondary)] z-[5] min-w-[80px]">
                Property
              </th>
              {tokens.map(t => (
                <th
                  key={t.path}
                  className="text-left px-3 py-1.5 font-medium text-[var(--color-figma-text)] border-b border-r border-[var(--color-figma-border)] min-w-[120px] max-w-[200px]"
                  title={t.path}
                >
                  <div className="truncate">{t.name}</div>
                  {t.path !== t.name && (
                    <div className="truncate text-[10px] text-[var(--color-figma-text-tertiary)] font-normal">{t.path}</div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Type row */}
            {!allSameType && (
              <tr className={rowDiffs['$type'] !== false ? 'bg-yellow-500/8' : ''}>
                <td className="px-3 py-1.5 font-medium text-[var(--color-figma-text-secondary)] border-b border-r border-[var(--color-figma-border)] sticky left-0 bg-[var(--color-figma-bg)] z-[5]">
                  type
                </td>
                {tokens.map(t => (
                  <td key={t.path} className="px-3 py-1.5 border-b border-r border-[var(--color-figma-border)]">
                    <span className="px-1 py-0.5 rounded bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]">
                      {t.type}
                    </span>
                  </td>
                ))}
              </tr>
            )}

            {/* Alias row */}
            {tokens.some(t => t.isAlias) && (!showDiffsOnly || aliasDiffers) && (
              <tr>
                <td className="px-3 py-1.5 font-medium text-[var(--color-figma-text-secondary)] border-b border-r border-[var(--color-figma-border)] sticky left-0 bg-[var(--color-figma-bg)] z-[5]">
                  alias
                </td>
                {tokens.map(t => (
                  <td key={t.path} className="px-3 py-1.5 border-b border-r border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] italic">
                    {t.isAlias ? `{${t.aliasRef}}` : '—'}
                  </td>
                ))}
              </tr>
            )}

            {/* Value rows */}
            {hasStructuredValues ? (
              propertyKeys.filter(key => !showDiffsOnly || rowDiffs[key]).map(key => {
                const isDiff = rowDiffs[key];
                return (
                  <tr key={key} className={isDiff ? 'bg-yellow-500/8' : ''}>
                    <td className={`px-3 py-1.5 font-medium border-b border-r border-[var(--color-figma-border)] sticky left-0 z-[5] ${isDiff ? 'text-[var(--color-figma-text)] bg-yellow-500/8' : 'text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-bg)]'}`}>
                      {key}
                      {isDiff && <span className="ml-1 text-yellow-600">*</span>}
                    </td>
                    {tokens.map(t => {
                      const val = fmtProp(t.resolvedValue, key);
                      return (
                        <td key={t.path} className={`px-3 py-1.5 border-b border-r border-[var(--color-figma-border)] font-mono ${isDiff ? 'text-[var(--color-figma-text)]' : 'text-[var(--color-figma-text-secondary)]'}`}>
                          {key === 'color' ? (
                            <span className="flex items-center gap-1">
                              <ColorSwatch value={val} />
                              {val}
                            </span>
                          ) : key === 'fontFamily' ? (
                            <span style={{ fontFamily: val }} title={val}>{val}</span>
                          ) : val}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            ) : (!showDiffsOnly || rowDiffs['$value']) ? (
              <tr className={rowDiffs['$value'] ? 'bg-yellow-500/8' : ''}>
                <td className={`px-3 py-1.5 font-medium border-b border-r border-[var(--color-figma-border)] sticky left-0 z-[5] ${rowDiffs['$value'] ? 'text-[var(--color-figma-text)] bg-yellow-500/8' : 'text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-bg)]'}`}>
                  value
                  {rowDiffs['$value'] && <span className="ml-1 text-yellow-600">*</span>}
                </td>
                {tokens.map(t => {
                  const formatted = formatTokenValueForDisplay(t.type, t.resolvedValue);
                  const isColor = t.type === 'color' && typeof t.resolvedValue === 'string';
                  return (
                    <td key={t.path} className={`px-3 py-1.5 border-b border-r border-[var(--color-figma-border)] font-mono ${rowDiffs['$value'] ? 'text-[var(--color-figma-text)]' : 'text-[var(--color-figma-text-secondary)]'}`}>
                      <span className="flex items-center gap-1">
                        {isColor && <ColorSwatch value={t.resolvedValue as string} />}
                        {formatted}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ) : null}

            {/* Scopes row */}
            {tokens.some(t => {
              const entry = allTokensFlat[t.path];
              return entry?.$scopes && entry.$scopes.length > 0;
            }) && (!showDiffsOnly || scopesDiffer) && (
              <tr>
                <td className="px-3 py-1.5 font-medium text-[var(--color-figma-text-secondary)] border-b border-r border-[var(--color-figma-border)] sticky left-0 bg-[var(--color-figma-bg)] z-[5]">
                  scopes
                </td>
                {tokens.map(t => {
                  const entry = allTokensFlat[t.path];
                  const scopes = entry?.$scopes;
                  return (
                    <td key={t.path} className="px-3 py-1.5 border-b border-r border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)]">
                      {scopes && scopes.length > 0 ? scopes.join(', ') : '—'}
                    </td>
                  );
                })}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Mode 2 – Token × themes (one token, value for every theme option)
// ──────────────────────────────────────────────────────────────────────────────

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

interface CrossThemeModeProps {
  tokenPath: string;
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToSet: Record<string, string>;
  dimensions: ThemeDimension[];
  onClose: () => void;
  serverUrl?: string;
  onTokensCreated?: () => void;
}

function CrossThemeMode({
  tokenPath,
  allTokensFlat,
  pathToSet,
  dimensions,
  onClose,
  serverUrl,
  onTokensCreated,
}: CrossThemeModeProps) {
  const [copied, triggerCopy] = useCopyFeedback();
  const [creatingMissing, setCreatingMissing] = useState(false);
  const [createResult, setCreateResult] = useState<string | null>(null);

  const themedSets = useMemo(() => {
    const sets = new Set<string>();
    for (const dim of dimensions) {
      for (const option of dim.options) {
        for (const setName of Object.keys(option.sets)) sets.add(setName);
      }
    }
    return sets;
  }, [dimensions]);

  const results = useMemo((): OptionResult[] => {
    const out: OptionResult[] = [];
    for (const dim of dimensions) {
      for (const option of dim.options) {
        const resolved = resolveThemeOption(option, allTokensFlat, pathToSet, themedSets);
        const entry = resolved[tokenPath];
        const rawEntry = allTokensFlat[tokenPath];
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

  const tokenType = allTokensFlat[tokenPath]?.$type ?? '';
  const tokenName = tokenPath.split('.').pop() ?? tokenPath;

  const handleCopyTsv = useCallback(async () => {
    const rows: string[][] = [['Dimension', 'Option', 'Value']];
    for (const r of results) {
      rows.push([r.dimName, r.optionName, r.missing ? '(not set)' : formatTokenValueForDisplay(tokenType, r.resolvedValue)]);
    }
    await triggerCopy(rows.map(r => r.join('\t')).join('\n'));
  }, [results, tokenType, triggerCopy]);

  const missingResults = useMemo(() => results.filter(r => r.missing), [results]);

  const handleCreateMissingOverrides = useCallback(async () => {
    if (!serverUrl || missingResults.length === 0) return;
    const baseEntry = allTokensFlat[tokenPath];
    if (!baseEntry) return;

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
            <div className="flex items-center gap-2 px-3 py-1 bg-[var(--color-figma-bg-secondary)] border-b border-[var(--color-figma-border)]">
              <span className="text-[10px] font-semibold text-[var(--color-figma-text)]">{dim.name}</span>
              {stats.allSame && !stats.anyMissing && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-600">Identical</span>
              )}
              {stats.anyMissing && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-600">Some missing</span>
              )}
            </div>

            <table className="w-full text-[10px] border-collapse">
              <tbody>
                {dimResults.map(r => {
                  const formatted = r.missing ? '(not set)' : formatTokenValueForDisplay(tokenType, r.resolvedValue);
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
                            {isColor && <ColorSwatch value={r.resolvedValue as string} />}
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

// ──────────────────────────────────────────────────────────────────────────────
// Mode 3 – Theme options A vs B (diff list)
// ──────────────────────────────────────────────────────────────────────────────

interface ThemeOptionsModeProps {
  dimensions: ThemeDimension[];
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToSet: Record<string, string>;
  onEditToken?: (set: string, path: string) => void;
  onCreateToken?: (path: string, set: string, type: string, value?: string) => void;
  initialOptionKeyA?: string;
  initialOptionKeyB?: string;
  serverUrl?: string;
  onTokensCreated?: () => void;
}

function ThemeOptionsMode({ dimensions, allTokensFlat, pathToSet, onEditToken, onCreateToken, initialOptionKeyA, initialOptionKeyB, serverUrl, onTokensCreated }: ThemeOptionsModeProps) {
  const [optionKeyA, setOptionKeyA] = useState<string>(initialOptionKeyA ?? '');
  const [optionKeyB, setOptionKeyB] = useState<string>(initialOptionKeyB ?? '');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const flatOptions = useMemo(() => buildFlatOptions(dimensions), [dimensions]);

  const resolvedA = useMemo(() => {
    if (!optionKeyA) return null;
    const opt = flatOptions.find(o => o.key === optionKeyA) ?? null;
    return resolveThemeOption(opt, allTokensFlat, pathToSet);
  }, [optionKeyA, flatOptions, allTokensFlat, pathToSet]);

  const resolvedB = useMemo(() => {
    if (!optionKeyB) return null;
    const opt = flatOptions.find(o => o.key === optionKeyB) ?? null;
    return resolveThemeOption(opt, allTokensFlat, pathToSet);
  }, [optionKeyB, flatOptions, allTokensFlat, pathToSet]);

  const targetSetForOption = useCallback((optionKey: string): string | null => {
    const opt = flatOptions.find(o => o.key === optionKey);
    if (!opt) return null;
    const enabled = Object.entries(opt.sets).filter(([, s]) => s === 'enabled').map(([n]) => n);
    if (enabled.length > 0) return enabled[0];
    const source = Object.entries(opt.sets).filter(([, s]) => s === 'source').map(([n]) => n);
    return source[0] ?? null;
  }, [flatOptions]);

  const diffs = useMemo(() => {
    if (!resolvedA || !resolvedB) return [];
    const allPaths = new Set([...Object.keys(resolvedA), ...Object.keys(resolvedB)]);
    const result: Array<{
      path: string;
      name: string;
      type: string;
      valueA: unknown;
      valueB: unknown;
      setA: string | null;
      setB: string | null;
    }> = [];
    for (const path of allPaths) {
      const entA = resolvedA[path];
      const entB = resolvedB[path];
      const valA = entA?.$value;
      const valB = entB?.$value;
      if (stableStringify(valA) !== stableStringify(valB)) {
        result.push({
          path,
          name: entA?.$name ?? entB?.$name ?? path.split('.').pop()!,
          type: entA?.$type ?? entB?.$type ?? 'unknown',
          valueA: valA,
          valueB: valB,
          setA: pathToSet[path] ?? null,
          setB: pathToSet[path] ?? null,
        });
      }
    }
    return result.sort((a, b) => a.path.localeCompare(b.path));
  }, [resolvedA, resolvedB, pathToSet]);

  const availableTypes = useMemo(() => {
    const types = new Set(diffs.map(d => d.type));
    return Array.from(types).sort();
  }, [diffs]);

  const filteredDiffs = useMemo(() => {
    let result = typeFilter === 'all' ? diffs : diffs.filter(d => d.type === typeFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(d => d.path.toLowerCase().includes(q));
    }
    return result;
  }, [diffs, typeFilter, searchQuery]);

  const canCompare = optionKeyA && optionKeyB && optionKeyA !== optionKeyB;

  const labelA = flatOptions.find(o => o.key === optionKeyA)?.label ?? 'A';
  const labelB = flatOptions.find(o => o.key === optionKeyB)?.label ?? 'B';

  const handleCopyError = useCallback(() => {
    parent.postMessage({ pluginMessage: { type: 'notify', message: 'Clipboard access denied' } }, '*');
  }, []);
  const [copyFeedback, triggerCopy] = useCopyFeedback(handleCopyError);

  const [bulkCreating, setBulkCreating] = useState<'A' | 'B' | null>(null);
  const [bulkCreateResult, setBulkCreateResult] = useState<string | null>(null);

  const buildTsv = useCallback((rows: typeof filteredDiffs) => {
    const header = ['Token Path', 'Type', labelA, labelB].join('\t');
    const lines = rows.map(d =>
      [d.path, d.type, formatTokenValueForDisplay(d.type, d.valueA), formatTokenValueForDisplay(d.type, d.valueB)].join('\t')
    );
    return [header, ...lines].join('\n');
  }, [labelA, labelB]);

  const handleCopy = useCallback(async () => {
    await triggerCopy(buildTsv(filteredDiffs));
  }, [buildTsv, filteredDiffs, triggerCopy]);

  const handleExportCsv = useCallback(() => {
    const header = [labelA, labelB, 'Token Path', 'Type'];
    const rows = filteredDiffs.map(d => [
      formatTokenValueForDisplay(d.type, d.valueA),
      formatTokenValueForDisplay(d.type, d.valueB),
      d.path,
      d.type,
    ]);
    exportCsvFile(
      `theme-compare-${labelA.replace(/\W+/g, '_')}-vs-${labelB.replace(/\W+/g, '_')}.csv`,
      [header, ...rows],
    );
  }, [filteredDiffs, labelA, labelB]);

  const missingInA = useMemo(
    () => filteredDiffs.filter(d => d.valueA === undefined),
    [filteredDiffs],
  );
  const missingInB = useMemo(
    () => filteredDiffs.filter(d => d.valueB === undefined),
    [filteredDiffs],
  );

  const handleCreateMissing = useCallback(async (side: 'A' | 'B') => {
    if (!serverUrl) return;
    const isA = side === 'A';
    const targetSet = isA ? targetSetForOption(optionKeyA) : targetSetForOption(optionKeyB);
    if (!targetSet) return;
    const missing = isA ? missingInA : missingInB;
    if (missing.length === 0) return;

    setBulkCreating(side);
    setBulkCreateResult(null);
    try {
      const tokens = missing.map(d => ({
        path: d.path,
        $type: d.type,
        $value: isA ? d.valueB : d.valueA,
      }));
      await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(targetSet)}/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens, strategy: 'overwrite' }),
      });
      setBulkCreateResult(`Created ${tokens.length} token${tokens.length !== 1 ? 's' : ''}`);
      setTimeout(() => setBulkCreateResult(null), 3000);
      onTokensCreated?.();
    } catch {
      setBulkCreateResult('Failed');
      setTimeout(() => setBulkCreateResult(null), 3000);
    } finally {
      setBulkCreating(null);
    }
  }, [serverUrl, optionKeyA, optionKeyB, missingInA, missingInB, targetSetForOption, onTokensCreated]);

  return (
    <div className="flex flex-col h-full">
      {/* Theme selectors */}
      <div className="shrink-0 px-3 py-2 border-b border-[var(--color-figma-border)] space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--color-figma-text-secondary)] w-8 shrink-0">A</span>
          <select
            value={optionKeyA}
            onChange={e => setOptionKeyA(e.target.value)}
            className="flex-1 px-1.5 py-0.5 rounded text-[10px] bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] outline-none cursor-pointer"
          >
            <option value="">Select a theme option…</option>
            {flatOptions.map(o => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--color-figma-text-secondary)] w-8 shrink-0">B</span>
          <select
            value={optionKeyB}
            onChange={e => setOptionKeyB(e.target.value)}
            className="flex-1 px-1.5 py-0.5 rounded text-[10px] bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] outline-none cursor-pointer"
          >
            <option value="">Select a theme option…</option>
            {flatOptions.map(o => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Results */}
      {!canCompare ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[10px] text-[var(--color-figma-text-tertiary)] text-center px-4">
            {flatOptions.length < 2
              ? 'You need at least two theme options to compare.'
              : 'Select two different options above to see how they differ.'}
          </p>
        </div>
      ) : diffs.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[10px] text-[var(--color-figma-text-tertiary)] text-center px-4">
            These themes produce identical resolved values.
          </p>
        </div>
      ) : (
        <>
          {/* Summary + filter bar */}
          <div className="shrink-0 px-3 pt-1.5 pb-1 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] space-y-1.5">
            <input
              type="search"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Filter by token path…"
              aria-label="Filter by token path"
              className="w-full px-1.5 py-0.5 rounded text-[10px] bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-tertiary)] outline-none"
            />
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                {filteredDiffs.length === diffs.length
                  ? `${diffs.length} differing token${diffs.length !== 1 ? 's' : ''}`
                  : `${filteredDiffs.length} of ${diffs.length}`}
              </span>
              {serverUrl && (missingInA.length > 0 || missingInB.length > 0) && (
                <>
                  {missingInA.length > 0 && (
                    <button
                      onClick={() => handleCreateMissing('A')}
                      disabled={bulkCreating !== null}
                      title={`Create ${missingInA.length} token${missingInA.length !== 1 ? 's' : ''} missing from ${labelA} (using ${labelB}'s values)`}
                      className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/20 disabled:opacity-50 transition-colors"
                    >
                      {bulkCreating === 'A' ? 'Creating…' : `+ ${missingInA.length} missing in A`}
                    </button>
                  )}
                  {missingInB.length > 0 && (
                    <button
                      onClick={() => handleCreateMissing('B')}
                      disabled={bulkCreating !== null}
                      title={`Create ${missingInB.length} token${missingInB.length !== 1 ? 's' : ''} missing from ${labelB} (using ${labelA}'s values)`}
                      className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/20 disabled:opacity-50 transition-colors"
                    >
                      {bulkCreating === 'B' ? 'Creating…' : `+ ${missingInB.length} missing in B`}
                    </button>
                  )}
                  {bulkCreateResult && (
                    <span className="text-[10px] text-[var(--color-figma-text-secondary)]">{bulkCreateResult}</span>
                  )}
                </>
              )}
              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={handleCopy}
                  title="Copy diff as tab-separated text"
                  className="px-1.5 py-0.5 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                >
                  <span aria-live="polite">{copyFeedback ? 'Copied!' : 'Copy'}</span>
                </button>
                <button
                  onClick={handleExportCsv}
                  title="Export diff as CSV"
                  className="px-1.5 py-0.5 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                >
                  CSV
                </button>
                <span className="w-px h-3 bg-[var(--color-figma-border)] mx-0.5" />
                <button
                  onClick={() => setTypeFilter('all')}
                  className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                    typeFilter === 'all'
                      ? 'bg-[var(--color-figma-accent)] text-white'
                      : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
                  }`}
                >
                  All
                </button>
                {availableTypes.map(t => (
                  <button
                    key={t}
                    onClick={() => setTypeFilter(t)}
                    className={`px-1.5 py-0.5 rounded text-[10px] capitalize transition-colors ${
                      typeFilter === t
                        ? 'bg-[var(--color-figma-accent)] text-white'
                        : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Diff list */}
          <div className="flex-1 overflow-y-auto">
            {filteredDiffs.map(diff => {
              const isColor = diff.type === 'color';
              const hexA = isColor && typeof diff.valueA === 'string' ? diff.valueA : null;
              const hexB = isColor && typeof diff.valueB === 'string' ? diff.valueB : null;
              const fmtA = formatTokenValueForDisplay(diff.type, diff.valueA);
              const fmtB = formatTokenValueForDisplay(diff.type, diff.valueB);
              const leaf = diff.name;
              const par = nodeParentPath(diff.path, diff.name);
              const absentInA = diff.valueA === undefined;
              const absentInB = diff.valueB === undefined;
              const targetA = targetSetForOption(optionKeyA);
              const targetB = targetSetForOption(optionKeyB);
              return (
                <div
                  key={diff.path}
                  className="group px-3 py-2 border-b border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                >
                  <div className="flex items-baseline gap-1 mb-1.5">
                    {par && (
                      <span className="text-[10px] text-[var(--color-figma-text-tertiary)] truncate">{par}.</span>
                    )}
                    <span className="text-[10px] font-medium text-[var(--color-figma-text)] truncate" title={formatDisplayPath(diff.path, diff.name)}>{leaf}</span>
                    <span className="ml-auto text-[8px] uppercase tracking-wide text-[var(--color-figma-text-tertiary)] shrink-0 px-1 py-0.5 rounded bg-[var(--color-figma-bg-secondary)]">
                      {diff.type}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-1.5 min-w-0 px-1.5 py-1 rounded bg-[var(--color-figma-bg-secondary)]">
                      <span className="text-[8px] font-medium text-[var(--color-figma-text-tertiary)] shrink-0 w-3">A</span>
                      {hexA && <ColorSwatch value={hexA} />}
                      <span className="text-[10px] font-mono text-[var(--color-figma-text-secondary)] truncate" title={fmtA}>
                        {absentInA ? <em className="not-italic text-[var(--color-figma-text-tertiary)]">absent</em> : fmtA}
                      </span>
                    </div>
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--color-figma-text-tertiary)]">
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                    <div className="flex-1 flex items-center gap-1.5 min-w-0 px-1.5 py-1 rounded bg-[var(--color-figma-bg-secondary)]">
                      <span className="text-[8px] font-medium text-[var(--color-figma-text-tertiary)] shrink-0 w-3">B</span>
                      {hexB && <ColorSwatch value={hexB} />}
                      <span className="text-[10px] font-mono text-[var(--color-figma-text)] truncate" title={fmtB}>
                        {absentInB ? <em className="not-italic text-[var(--color-figma-text-tertiary)]">absent</em> : fmtB}
                      </span>
                    </div>
                  </div>
                  {(onEditToken || onCreateToken) && (
                    <div className="flex items-center gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      {absentInA && onCreateToken && targetA && (
                        <button
                          onClick={() => onCreateToken(diff.path, targetA, diff.type, diff.valueB !== undefined ? (typeof diff.valueB === 'string' ? diff.valueB : JSON.stringify(diff.valueB)) : undefined)}
                          className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/20 transition-colors"
                          title={`Create token in ${targetA} (copy B's value)`}
                        >
                          + Create in A
                        </button>
                      )}
                      {!absentInA && onEditToken && diff.setA && (
                        <button
                          onClick={() => onEditToken(diff.setA!, diff.path)}
                          className="px-1.5 py-0.5 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                          title={`Edit token in ${diff.setA}`}
                        >
                          Edit A
                        </button>
                      )}
                      {absentInB && onCreateToken && targetB && (
                        <button
                          onClick={() => onCreateToken(diff.path, targetB, diff.type, diff.valueA !== undefined ? (typeof diff.valueA === 'string' ? diff.valueA : JSON.stringify(diff.valueA)) : undefined)}
                          className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/20 transition-colors"
                          title={`Create token in ${targetB} (copy A's value)`}
                        >
                          + Create in B
                        </button>
                      )}
                      {!absentInB && onEditToken && diff.setB && (
                        <button
                          onClick={() => onEditToken(diff.setB!, diff.path)}
                          className="px-1.5 py-0.5 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                          title={`Edit token in ${diff.setB}`}
                        >
                          Edit B
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// CompareView – main export (mode selector + routing)
// ──────────────────────────────────────────────────────────────────────────────

export type CompareMode = 'tokens' | 'cross-theme' | 'theme-options';

interface CompareViewProps {
  mode: CompareMode;
  onModeChange: (mode: CompareMode) => void;

  tokenPaths: Set<string>;
  onClearTokenPaths: () => void;

  tokenPath: string;
  onClearTokenPath: () => void;

  allTokensFlat: Record<string, TokenMapEntry>;
  pathToSet: Record<string, string>;
  dimensions: ThemeDimension[];

  themeOptionsKey: number;
  themeOptionsDefaultA: string;
  themeOptionsDefaultB: string;

  onEditToken: (set: string, path: string) => void;
  onCreateToken: (path: string, set: string, type: string, value?: string) => void;

  onGoToTokens: () => void;

  serverUrl?: string;
  onTokensCreated?: () => void;
}

const MODES: { id: CompareMode; label: string }[] = [
  { id: 'tokens', label: 'Token values' },
  { id: 'cross-theme', label: 'Token × themes' },
  { id: 'theme-options', label: 'Theme options' },
];

export function CompareView({
  mode,
  onModeChange,
  tokenPaths,
  onClearTokenPaths,
  tokenPath,
  onClearTokenPath,
  allTokensFlat,
  pathToSet,
  dimensions,
  themeOptionsKey,
  themeOptionsDefaultA,
  themeOptionsDefaultB,
  onEditToken,
  onCreateToken,
  onGoToTokens,
  serverUrl,
  onTokensCreated,
}: CompareViewProps) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Mode selector */}
      <div className="shrink-0 flex items-center gap-1 px-2 py-1.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
        <span className="text-[10px] text-[var(--color-figma-text-secondary)] mr-1">Compare:</span>
        {MODES.map(m => (
          <button
            key={m.id}
            onClick={() => onModeChange(m.id)}
            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
              mode === m.id
                ? 'bg-[var(--color-figma-accent)] text-white'
                : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div className="flex-1 overflow-hidden">
        {mode === 'tokens' && (
          tokenPaths.size < 2 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
              <p className="text-[11px] text-[var(--color-figma-text-secondary)]">
                Select 2 or more tokens in the Tokens tab and click <strong>Compare</strong> to see a side-by-side value comparison.
              </p>
              <button
                onClick={onGoToTokens}
                className="px-3 py-1 rounded text-[11px] font-medium bg-[var(--color-figma-accent)] text-white hover:opacity-90 transition-opacity"
              >
                Go to Tokens
              </button>
            </div>
          ) : (
            <TokenValuesMode
              selectedPaths={tokenPaths}
              allTokensFlat={allTokensFlat}
              onClose={onClearTokenPaths}
            />
          )
        )}

        {mode === 'cross-theme' && (
          tokenPath === '' || dimensions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
              {dimensions.length === 0 ? (
                <p className="text-[11px] text-[var(--color-figma-text-secondary)]">
                  No theme dimensions are configured. Set up themes first.
                </p>
              ) : (
                <p className="text-[11px] text-[var(--color-figma-text-secondary)]">
                  Right-click any token in the Tokens tab and choose <strong>Compare across themes</strong> to see how its value changes across each theme option.
                </p>
              )}
              <button
                onClick={onGoToTokens}
                className="px-3 py-1 rounded text-[11px] font-medium bg-[var(--color-figma-accent)] text-white hover:opacity-90 transition-opacity"
              >
                Go to Tokens
              </button>
            </div>
          ) : (
            <CrossThemeMode
              tokenPath={tokenPath}
              allTokensFlat={allTokensFlat}
              pathToSet={pathToSet}
              dimensions={dimensions}
              onClose={onClearTokenPath}
              serverUrl={serverUrl}
              onTokensCreated={onTokensCreated}
            />
          )
        )}

        {mode === 'theme-options' && (
          <ThemeOptionsMode
            key={themeOptionsKey}
            dimensions={dimensions}
            allTokensFlat={allTokensFlat}
            pathToSet={pathToSet}
            initialOptionKeyA={themeOptionsDefaultA}
            initialOptionKeyB={themeOptionsDefaultB}
            onEditToken={onEditToken}
            onCreateToken={onCreateToken}
            serverUrl={serverUrl}
            onTokensCreated={onTokensCreated}
          />
        )}
      </div>
    </div>
  );
}
