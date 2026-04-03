import { useCallback, useMemo, useState } from 'react';
import type { TokenMapEntry } from '../../shared/types';
import { isAlias, resolveTokenValue } from '../../shared/resolveAlias';
import { stableStringify } from '../shared/utils';
import { formatTokenValueForDisplay } from '../shared/tokenFormatting';
import { exportCsvFile, copyToClipboard } from '../shared/comparisonUtils';

interface ComparePanelProps {
  selectedPaths: Set<string>;
  allTokensFlat: Record<string, TokenMapEntry>;
  onClose: () => void;
}

/** Format a token value for display. */
function fmtValue(value: any, type: string): string {
  return formatTokenValueForDisplay(type, value);
}

/** Extract all property keys from a value object. */
function getPropertyKeys(value: any): string[] {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) return ['$value'];
  return Object.keys(value).sort();
}

/** Format a single property value. */
function fmtProp(value: any, key: string): string {
  if (key === '$value') return typeof value === 'object' ? JSON.stringify(value) : String(value ?? '—');
  const v = value?.[key];
  if (v === undefined || v === null) return '—';
  if (typeof v === 'object' && 'value' in v) return `${v.value}${v.unit ?? ''}`;
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}

function ColorSwatch({ hex }: { hex: string }) {
  const bg = typeof hex === 'string' ? hex.slice(0, 7) : undefined;
  if (!bg || !/^#[0-9a-fA-F]{3,8}$/.test(hex)) return null;
  return (
    <div
      className="w-3 h-3 rounded-sm border border-white/20 ring-1 ring-[var(--color-figma-border)] shrink-0 inline-block align-middle mr-1"
      style={{ backgroundColor: bg }}
      aria-hidden="true"
    />
  );
}

interface ResolvedToken {
  path: string;
  name: string;
  type: string;
  rawValue: any;
  resolvedValue: any;
  isAlias: boolean;
  aliasRef?: string;
}

export function ComparePanel({ selectedPaths, allTokensFlat, onClose }: ComparePanelProps) {
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

  // Determine if tokens share a common type and have structured (object) values
  const allSameType = tokens.length > 0 && tokens.every(t => t.type === tokens[0].type);
  const hasStructuredValues = tokens.some(t => typeof t.resolvedValue === 'object' && t.resolvedValue !== null && !Array.isArray(t.resolvedValue));

  // Collect all property keys across tokens for structured comparison
  const propertyKeys = useMemo(() => {
    if (!hasStructuredValues) return ['$value'];
    const keys = new Set<string>();
    for (const t of tokens) {
      for (const k of getPropertyKeys(t.resolvedValue)) keys.add(k);
    }
    return [...keys].sort();
  }, [tokens, hasStructuredValues]);

  // For each row (property), check if values differ across tokens
  const rowDiffs = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const key of propertyKeys) {
      const values = tokens.map(t => {
        if (key === '$value') return stableStringify(t.resolvedValue);
        return stableStringify(t.resolvedValue?.[key]);
      });
      map[key] = values.length > 1 && new Set(values).size > 1;
    }
    return map;
  }, [tokens, propertyKeys]);

  const anyDiff = Object.values(rowDiffs).some(Boolean);

  // Whether alias references differ across tokens
  const aliasDiffers = tokens.some(t => t.isAlias) &&
    new Set(tokens.map(t => t.aliasRef ?? '')).size > 1;

  // Whether scopes differ across tokens
  const scopesDiffer = useMemo(() => {
    const scopeVals = tokens.map(t => {
      const entry = allTokensFlat[t.path];
      return stableStringify(entry?.$scopes ?? []);
    });
    return new Set(scopeVals).size > 1;
  }, [tokens, allTokensFlat]);

  const [showDiffsOnly, setShowDiffsOnly] = useState(false);

  // --- Copy / Export helpers ---
  const [copied, setCopied] = useState(false);

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
      rows.push(['value', ...tokens.map(t => fmtValue(t.resolvedValue, t.type))]);
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
    await copyToClipboard(tsv, () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [buildRows]);

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

            {/* Alias row — show if any token is an alias (and diffs exist or diffs-only is off) */}
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
                              <ColorSwatch hex={val} />
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
                  const formatted = fmtValue(t.resolvedValue, t.type);
                  const isColor = t.type === 'color' && typeof t.resolvedValue === 'string';
                  return (
                    <td key={t.path} className={`px-3 py-1.5 border-b border-r border-[var(--color-figma-border)] font-mono ${rowDiffs['$value'] ? 'text-[var(--color-figma-text)]' : 'text-[var(--color-figma-text-secondary)]'}`}>
                      <span className="flex items-center gap-1">
                        {isColor && <ColorSwatch hex={t.resolvedValue as string} />}
                        {formatted}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ) : null}

            {/* Scopes row if any token has scopes (filtered by diffs-only) */}
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
