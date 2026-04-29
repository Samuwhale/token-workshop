import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { dispatchToast } from '../shared/toastBus';
import type { TokenMapEntry } from '../../shared/types';
import type { TokenCollection, TokenValue } from '@tokenmanager/core';
import { flattenTokenGroup } from '@tokenmanager/core';
import { isAlias, resolveTokenValue } from '../../shared/resolveAlias';
import { stableStringify } from '../shared/utils';
import { formatTokenValueForDisplay } from '../shared/tokenFormatting';
import { swatchBgColor } from '../shared/colorUtils';
import { resolveModeOption, exportCsvFile, copyToClipboard } from '../shared/comparisonUtils';
import { nodeParentPath, formatDisplayPath } from './tokenListUtils';
import { apiFetch } from '../shared/apiFetch';

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

function useCopyFeedback(onError?: () => void): [boolean, (text: string) => Promise<void>] {
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  const triggerCopy = useCallback(async (text: string) => {
    await copyToClipboard(
      text,
      () => {
        setCopied(true);
        if (copiedTimerRef.current !== null) {
          window.clearTimeout(copiedTimerRef.current);
        }
        copiedTimerRef.current = window.setTimeout(() => {
          setCopied(false);
          copiedTimerRef.current = null;
        }, 1500);
      },
      onError,
    );
  }, [onError]);
  return [copied, triggerCopy];
}

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

/** Flat list of all options across collections, used by ModePairsMode. */
type FlatOption = {
  label: string;
  key: string;
  collectionId: string;
  optionName: string;
};

function buildFlatOptions(collections: TokenCollection[]): FlatOption[] {
  const result: FlatOption[] = [];
  for (const collection of collections) {
    for (const opt of collection.modes) {
      result.push({
        label:
          collections.length > 1
            ? `${collection.id} / ${opt.name}`
            : opt.name,
        key: `${collection.id}:${opt.name}`,
        collectionId: collection.id,
        optionName: opt.name,
      });
    }
  }
  return result;
}

// Mode 1 – Token values (multiple selected tokens, side-by-side properties)

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
        const res = resolveTokenValue(entry.$value, entry.$type ?? 'unknown', allTokensFlat);
        if (res && !res.error && res.value != null) resolved = res.value as TokenValue;
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
      <div className="px-3 py-2 text-secondary text-[var(--color-figma-text-secondary)] border-b border-[var(--color-figma-border)]">
        No token data for selected paths.
        <button onClick={onClose} className="ml-2 underline">Close</button>
      </div>
    );
  }

  if (tokens.length === 1) {
    return (
      <div className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-body font-semibold text-[var(--color-figma-text)]">Compare tokens</span>
          <button
            onClick={onClose}
            className="text-secondary text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
          >
            Close
          </button>
        </div>
        <p className="text-secondary text-[var(--color-figma-text-secondary)]">
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
          <span className="text-body font-semibold text-[var(--color-figma-text)]">
            Compare {tokens.length} tokens
          </span>
          {allSameType && (
            <span className="text-secondary px-1.5 py-0.5 rounded bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]">
              {tokens[0].type}
            </span>
          )}
          {!anyDiff && (
            <span className="text-secondary px-1.5 py-0.5 rounded bg-[var(--color-figma-success)]/15 text-[var(--color-figma-success)]">
              All identical
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowDiffsOnly(v => !v)}
            disabled={!anyDiff}
            className={`text-secondary px-2 py-0.5 rounded transition-colors ${
              showDiffsOnly
                ? 'bg-[var(--color-figma-warning)]/20 text-[var(--color-figma-warning)] hover:bg-[var(--color-figma-warning)]/30'
                : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
            title={anyDiff ? 'Show only rows where values differ' : 'No differences to filter'}
          >
            Diffs only
          </button>
          <button
            onClick={handleCopy}
            className="text-secondary px-2 py-0.5 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            title="Copy comparison as tab-separated table"
          >
            {copied ? 'Copied!' : 'Copy table'}
          </button>
          <button
            onClick={handleExportCsv}
            className="text-secondary px-2 py-0.5 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            title="Download comparison as CSV"
          >
            Export CSV
          </button>
          <button
            onClick={onClose}
            className="text-secondary px-2 py-0.5 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* Comparison table */}
      <div className="overflow-x-auto">
        <table className="w-full text-secondary border-collapse">
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
                    <div className="truncate text-secondary text-[var(--color-figma-text-tertiary)] font-normal">{t.path}</div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Type row */}
            {!allSameType && (
              <tr className={rowDiffs['$type'] !== false ? 'bg-[var(--color-figma-warning)]/8' : ''}>
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
                  <tr key={key} className={isDiff ? 'bg-[var(--color-figma-warning)]/8' : ''}>
                    <td className={`px-3 py-1.5 font-medium border-b border-r border-[var(--color-figma-border)] sticky left-0 z-[5] ${isDiff ? 'text-[var(--color-figma-text)] bg-[var(--color-figma-warning)]/8' : 'text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-bg)]'}`}>
                      {key}
                      {isDiff && <span className="ml-1 text-[var(--color-figma-warning)]">*</span>}
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
              <tr className={rowDiffs['$value'] ? 'bg-[var(--color-figma-warning)]/8' : ''}>
                <td className={`px-3 py-1.5 font-medium border-b border-r border-[var(--color-figma-border)] sticky left-0 z-[5] ${rowDiffs['$value'] ? 'text-[var(--color-figma-text)] bg-[var(--color-figma-warning)]/8' : 'text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-bg)]'}`}>
                  value
                  {rowDiffs['$value'] && <span className="ml-1 text-[var(--color-figma-warning)]">*</span>}
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

// Mode 2 – Token × collection modes (one token, value for every mode option)

interface OptionResult {
  collectionId: string;
  collectionName: string;
  optionName: string;
  entry: TokenMapEntry | undefined;
  resolvedValue: unknown;
  isAliasToken: boolean;
  aliasRef?: string;
  missing: boolean;
}

interface CrossCollectionModeProps {
  tokenPath: string;
  allTokensFlat: Record<string, TokenMapEntry>;
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>;
  collections: TokenCollection[];
  pathToCollectionId: Record<string, string>;
  onClose: () => void;
}

function CrossCollectionMode({
  tokenPath,
  allTokensFlat,
  perCollectionFlat,
  collections,
  pathToCollectionId,
  onClose,
}: CrossCollectionModeProps) {
  const [copied, triggerCopy] = useCopyFeedback();

  const results = useMemo((): OptionResult[] => {
    const out: OptionResult[] = [];
    for (const collection of collections) {
      for (const option of collection.modes) {
        const resolved = resolveModeOption(
          { collectionId: collection.id, optionName: option.name },
          collections,
          allTokensFlat,
          pathToCollectionId,
          perCollectionFlat,
        );
        const entry = resolved[tokenPath];
        const rawEntry =
          perCollectionFlat[collection.id]?.[tokenPath] ?? allTokensFlat[tokenPath];
        const aliasCheck = rawEntry ? isAlias(rawEntry.$value) : false;
        let aliasRef: string | undefined;
        if (aliasCheck && rawEntry) {
          aliasRef = typeof rawEntry.$value === 'string' ? rawEntry.$value.replace(/^\{|\}$/g, '') : undefined;
        }
        out.push({
          collectionId: collection.id,
          collectionName: collection.id,
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
  }, [collections, allTokensFlat, pathToCollectionId, perCollectionFlat, tokenPath]);

  const collectionStats = useMemo(() => {
    const map = new Map<string, { allSame: boolean; anyMissing: boolean }>();
    for (const collection of collections) {
      const collectionResults = results.filter(
        (result) => result.collectionId === collection.id,
      );
      const vals = collectionResults.map((result) =>
        JSON.stringify(result.resolvedValue),
      );
      map.set(collection.id, {
        allSame: new Set(vals).size <= 1,
        anyMissing: collectionResults.some((result) => result.missing),
      });
    }
    return map;
  }, [collections, results]);

  const tokenType = allTokensFlat[tokenPath]?.$type ?? '';
  const tokenName = tokenPath.split('.').pop() ?? tokenPath;

  const handleCopyTsv = useCallback(async () => {
    const rows: string[][] = [["Collection", "Mode", "Value"]];
    for (const r of results) {
      rows.push([
        r.collectionName,
        r.optionName,
        r.missing
          ? "(not set)"
          : formatTokenValueForDisplay(tokenType, r.resolvedValue),
      ]);
    }
    await triggerCopy(rows.map(r => r.join('\t')).join('\n'));
  }, [results, tokenType, triggerCopy]);

  if (collections.length === 0) {
    return (
      <div className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-body font-semibold text-[var(--color-figma-text)]">Compare across modes</span>
          <button onClick={onClose} className="text-secondary text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]">Close</button>
        </div>
        <p className="text-secondary text-[var(--color-figma-text-secondary)]">No modes found. Add modes in the Modes workspace to compare across options.</p>
      </div>
    );
  }

  return (
    <div className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] max-h-[320px] overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] sticky top-0 z-10">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-body font-semibold text-[var(--color-figma-text)] truncate" title={tokenPath}>
            {tokenName}
          </span>
          {tokenType && (
            <span className="text-secondary px-1.5 py-0.5 rounded bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] shrink-0">
              {tokenType}
            </span>
          )}
          <span className="text-secondary text-[var(--color-figma-text-tertiary)] shrink-0">across modes</span>
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          <button
            onClick={handleCopyTsv}
            className="text-secondary px-2 py-0.5 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            title="Copy as tab-separated table"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            onClick={onClose}
            className="text-secondary px-2 py-0.5 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* Per-collection sections */}
      {collections.map((collection) => {
        const stats = collectionStats.get(collection.id)!;
        const collectionResults = results.filter(
          (result) => result.collectionId === collection.id,
        );
        return (
          <div key={collection.id}>
            <div className="flex items-center gap-2 px-3 py-1 bg-[var(--color-figma-bg-secondary)] border-b border-[var(--color-figma-border)]">
              <span className="text-secondary font-semibold text-[var(--color-figma-text)]">
                {collection.id}
              </span>
              {stats.allSame && !stats.anyMissing && (
                <span className="text-secondary px-1.5 py-0.5 rounded bg-[var(--color-figma-success)]/15 text-[var(--color-figma-success)]">Identical</span>
              )}
              {stats.anyMissing && (
                <span className="text-secondary px-1.5 py-0.5 rounded bg-[var(--color-figma-warning)]/15 text-[var(--color-figma-warning)]">Some missing</span>
              )}
            </div>

            <table className="w-full text-secondary border-collapse">
              <tbody>
                {collectionResults.map(r => {
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

// Mode 3 – Mode pairs A vs B (diff list)

interface ModePairsModeProps {
  collections: TokenCollection[];
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToCollectionId: Record<string, string>;
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>;
  onEditToken?: (collectionId: string, path: string) => void;
  initialOptionKeyA?: string;
  initialOptionKeyB?: string;
}

function ModePairsMode({
  collections,
  allTokensFlat,
  pathToCollectionId,
  perCollectionFlat,
  onEditToken,
  initialOptionKeyA,
  initialOptionKeyB,
}: ModePairsModeProps) {
  const [optionKeyA, setOptionKeyA] = useState<string>(initialOptionKeyA ?? '');
  const [optionKeyB, setOptionKeyB] = useState<string>(initialOptionKeyB ?? '');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const flatOptions = useMemo(() => buildFlatOptions(collections), [collections]);

  const resolvedA = useMemo(() => {
    if (!optionKeyA) return null;
    const opt = flatOptions.find(o => o.key === optionKeyA) ?? null;
    return resolveModeOption(
      opt
        ? { collectionId: opt.collectionId, optionName: opt.optionName }
        : null,
      collections,
      allTokensFlat,
      pathToCollectionId,
      perCollectionFlat,
    );
  }, [
    optionKeyA,
    flatOptions,
    collections,
    allTokensFlat,
    pathToCollectionId,
    perCollectionFlat,
  ]);

  const resolvedB = useMemo(() => {
    if (!optionKeyB) return null;
    const opt = flatOptions.find(o => o.key === optionKeyB) ?? null;
    return resolveModeOption(
      opt
        ? { collectionId: opt.collectionId, optionName: opt.optionName }
        : null,
      collections,
      allTokensFlat,
      pathToCollectionId,
      perCollectionFlat,
    );
  }, [
    optionKeyB,
    flatOptions,
    collections,
    allTokensFlat,
    pathToCollectionId,
    perCollectionFlat,
  ]);

  const selectedOptionA = useMemo(
    () => flatOptions.find((option) => option.key === optionKeyA) ?? null,
    [flatOptions, optionKeyA],
  );
  const selectedOptionB = useMemo(
    () => flatOptions.find((option) => option.key === optionKeyB) ?? null,
    [flatOptions, optionKeyB],
  );

  const diffs = useMemo(() => {
    if (!resolvedA || !resolvedB || !selectedOptionA || !selectedOptionB) {
      return [];
    }
    const allPaths = new Set([...Object.keys(resolvedA), ...Object.keys(resolvedB)]);
    const result: Array<{
      path: string;
      name: string;
      type: string;
      valueA: unknown;
      valueB: unknown;
      collectionA: string | null;
      collectionB: string | null;
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
          collectionA: entA ? selectedOptionA.collectionId : null,
          collectionB: entB ? selectedOptionB.collectionId : null,
        });
      }
    }
    return result.sort((a, b) => a.path.localeCompare(b.path));
  }, [resolvedA, resolvedB, selectedOptionA, selectedOptionB]);

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
    dispatchToast('Clipboard access denied', 'error');
  }, []);
  const [copyFeedback, triggerCopy] = useCopyFeedback(handleCopyError);

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
      `mode-compare-${labelA.replace(/\W+/g, '_')}-vs-${labelB.replace(/\W+/g, '_')}.csv`,
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

  return (
    <div className="flex flex-col h-full">
      {/* Mode variant selectors */}
      <div className="shrink-0 px-3 py-2 border-b border-[var(--color-figma-border)] space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-secondary text-[var(--color-figma-text-secondary)] w-8 shrink-0">A</span>
          <select
            value={optionKeyA}
            onChange={e => setOptionKeyA(e.target.value)}
            aria-label="Compare option A"
            className="flex-1 px-1.5 py-0.5 rounded text-secondary bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] outline-none focus-visible:border-[var(--color-figma-accent)] cursor-pointer"
          >
            <option value="">Select an option…</option>
            {flatOptions.map(o => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-secondary text-[var(--color-figma-text-secondary)] w-8 shrink-0">B</span>
          <select
            value={optionKeyB}
            onChange={e => setOptionKeyB(e.target.value)}
            aria-label="Compare option B"
            className="flex-1 px-1.5 py-0.5 rounded text-secondary bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] outline-none focus-visible:border-[var(--color-figma-accent)] cursor-pointer"
          >
            <option value="">Select an option…</option>
            {flatOptions.map(o => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Results */}
      {!canCompare ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-secondary text-[var(--color-figma-text-tertiary)] text-center px-4">
            {flatOptions.length < 2
              ? 'You need at least two options to compare.'
              : 'Select two different options above to see how they differ.'}
          </p>
        </div>
      ) : diffs.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-secondary text-[var(--color-figma-text-tertiary)] text-center px-4">
            These modes produce identical resolved values.
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
              className="w-full px-1.5 py-0.5 rounded text-secondary bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-tertiary)] outline-none focus-visible:border-[var(--color-figma-accent)]"
            />
            <div className="flex items-center gap-2">
              <span className="text-secondary text-[var(--color-figma-text-secondary)]">
                {filteredDiffs.length === diffs.length
                  ? `${diffs.length} differing token${diffs.length !== 1 ? 's' : ''}`
                  : `${filteredDiffs.length} of ${diffs.length}`}
              </span>
              {(missingInA.length > 0 || missingInB.length > 0) && (
                <span className="text-secondary text-[var(--color-figma-text-secondary)]">
                  {missingInA.length + missingInB.length} unresolved diff{missingInA.length + missingInB.length === 1 ? '' : 's'}
                </span>
              )}
              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={handleCopy}
                  title="Copy diff as tab-separated text"
                  className="px-1.5 py-0.5 rounded text-secondary text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                >
                  <span aria-live="polite">{copyFeedback ? 'Copied!' : 'Copy'}</span>
                </button>
                <button
                  onClick={handleExportCsv}
                  title="Export diff as CSV"
                  className="px-1.5 py-0.5 rounded text-secondary text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                >
                  CSV
                </button>
                <span className="w-px h-3 bg-[var(--color-figma-border)] mx-0.5" />
                <button
                  onClick={() => setTypeFilter('all')}
                  className={`px-1.5 py-0.5 rounded text-secondary transition-colors ${
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
                    className={`px-1.5 py-0.5 rounded text-secondary capitalize transition-colors ${
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
              return (
                <div
                  key={diff.path}
                  className="group px-3 py-2 border-b border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                >
                  <div className="flex items-baseline gap-1 mb-1.5">
                    {par && (
                      <span className="text-secondary text-[var(--color-figma-text-tertiary)] truncate">{par}.</span>
                    )}
                    <span className="text-secondary font-medium text-[var(--color-figma-text)] truncate" title={formatDisplayPath(diff.path, diff.name)}>{leaf}</span>
                    <span className="ml-auto text-[var(--font-size-xs)] text-[var(--color-figma-text-tertiary)] shrink-0 px-1 py-0.5 rounded bg-[var(--color-figma-bg-secondary)]">
                      {diff.type}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-1.5 min-w-0 px-1.5 py-1 rounded bg-[var(--color-figma-bg-secondary)]">
                      <span className="text-[var(--font-size-xs)] font-medium text-[var(--color-figma-text-tertiary)] shrink-0 w-3">A</span>
                      {hexA && <ColorSwatch value={hexA} />}
                      <span className="text-secondary font-mono text-[var(--color-figma-text-secondary)] truncate" title={fmtA}>
                        {absentInA ? <em className="not-italic text-[var(--color-figma-text-tertiary)]">absent</em> : fmtA}
                      </span>
                    </div>
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--color-figma-text-tertiary)]">
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                    <div className="flex-1 flex items-center gap-1.5 min-w-0 px-1.5 py-1 rounded bg-[var(--color-figma-bg-secondary)]">
                      <span className="text-[var(--font-size-xs)] font-medium text-[var(--color-figma-text-tertiary)] shrink-0 w-3">B</span>
                      {hexB && <ColorSwatch value={hexB} />}
                      <span className="text-secondary font-mono text-[var(--color-figma-text)] truncate" title={fmtB}>
                        {absentInB ? <em className="not-italic text-[var(--color-figma-text-tertiary)]">absent</em> : fmtB}
                      </span>
                    </div>
                  </div>
                  {onEditToken && (
                    <div className="flex items-center gap-1 mt-1.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                      {!absentInA && onEditToken && diff.collectionA && (
                        <button
                          onClick={() => onEditToken(diff.collectionA!, diff.path)}
                          className="px-1.5 py-0.5 rounded text-secondary text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                          title={`Edit token in ${diff.collectionA}`}
                        >
                          Edit A
                        </button>
                      )}
                      {!absentInB && onEditToken && diff.collectionB && (
                        <button
                          onClick={() => onEditToken(diff.collectionB!, diff.path)}
                          className="px-1.5 py-0.5 rounded text-secondary text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                          title={`Edit token in ${diff.collectionB}`}
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

// Mode 4 – Collection diff (compare two token collections side-by-side)

type CollectionDiffStatus = 'only-a' | 'only-b' | 'changed';

interface CollectionDiffRow {
  path: string;
  name: string;
  type: string;
  status: CollectionDiffStatus;
  valueA: unknown;
  valueB: unknown;
}

interface CollectionDiffModeProps {
  collectionIds: string[];
  serverUrl?: string;
  onEditToken: (collectionId: string, path: string) => void;
  onCreateToken: (path: string, collectionId: string, type: string, value?: string) => void;
  onTokensCreated?: () => void;
}

function CollectionDiffMode({ collectionIds, serverUrl, onEditToken, onCreateToken, onTokensCreated }: CollectionDiffModeProps) {
  const [collectionA, setCollectionA] = useState<string>(collectionIds[0] ?? '');
  const [collectionB, setCollectionB] = useState<string>(collectionIds[1] ?? '');
  const [flatA, setFlatA] = useState<Record<string, { $value: unknown; $type: string }> | null>(null);
  const [flatB, setFlatB] = useState<Record<string, { $value: unknown; $type: string }> | null>(null);
  const [loadingA, setLoadingA] = useState(false);
  const [loadingB, setLoadingB] = useState(false);
  const [statusFilter, setStatusFilter] = useState<CollectionDiffStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [bulkCreating, setBulkCreating] = useState<'A' | 'B' | null>(null);
  const [bulkResult, setBulkResult] = useState<string | null>(null);

  const handleCopyError = useCallback(() => {
    dispatchToast('Clipboard access denied', 'error');
  }, []);
  const [copyFeedback, triggerCopy] = useCopyFeedback(handleCopyError);

  useEffect(() => {
    if (!collectionA || !serverUrl) { setFlatA(null); return; }
    let cancelled = false;
    setLoadingA(true);
    apiFetch<{ tokens?: object }>(`${serverUrl}/api/tokens/${encodeURIComponent(collectionA)}`)
      .then((data) => {
        if (cancelled) return;
        const flat: Record<string, { $value: unknown; $type: string }> = {};
        for (const [path, token] of flattenTokenGroup((data.tokens ?? {}) as Parameters<typeof flattenTokenGroup>[0])) {
          flat[path] = { $value: token.$value, $type: token.$type ?? 'unknown' };
        }
        setFlatA(flat);
      })
      .catch(() => { if (!cancelled) setFlatA(null); })
      .finally(() => { if (!cancelled) setLoadingA(false); });
    return () => { cancelled = true; };
  }, [collectionA, serverUrl]);

  useEffect(() => {
    if (!collectionB || !serverUrl) { setFlatB(null); return; }
    let cancelled = false;
    setLoadingB(true);
    apiFetch<{ tokens?: object }>(`${serverUrl}/api/tokens/${encodeURIComponent(collectionB)}`)
      .then((data) => {
        if (cancelled) return;
        const flat: Record<string, { $value: unknown; $type: string }> = {};
        for (const [path, token] of flattenTokenGroup((data.tokens ?? {}) as Parameters<typeof flattenTokenGroup>[0])) {
          flat[path] = { $value: token.$value, $type: token.$type ?? 'unknown' };
        }
        setFlatB(flat);
      })
      .catch(() => { if (!cancelled) setFlatB(null); })
      .finally(() => { if (!cancelled) setLoadingB(false); });
    return () => { cancelled = true; };
  }, [collectionB, serverUrl]);

  const diffs = useMemo((): CollectionDiffRow[] => {
    if (!flatA || !flatB) return [];
    const allPaths = new Set([...Object.keys(flatA), ...Object.keys(flatB)]);
    const result: CollectionDiffRow[] = [];
    for (const path of allPaths) {
      const tA = flatA[path];
      const tB = flatB[path];
      const type = tA?.$type ?? tB?.$type ?? 'unknown';
      const name = path.split('.').pop()!;
      if (!tA) {
        result.push({ path, name, type, status: 'only-b', valueA: undefined, valueB: tB!.$value });
      } else if (!tB) {
        result.push({ path, name, type, status: 'only-a', valueA: tA.$value, valueB: undefined });
      } else if (stableStringify(tA.$value) !== stableStringify(tB.$value)) {
        result.push({ path, name, type, status: 'changed', valueA: tA.$value, valueB: tB.$value });
      }
    }
    return result.sort((a, b) => a.path.localeCompare(b.path));
  }, [flatA, flatB]);

  const availableTypes = useMemo(() => {
    const types = new Set(diffs.map(d => d.type));
    return Array.from(types).sort();
  }, [diffs]);

  const filteredDiffs = useMemo(() => {
    let result = diffs;
    if (statusFilter !== 'all') result = result.filter(d => d.status === statusFilter);
    if (typeFilter !== 'all') result = result.filter(d => d.type === typeFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(d => d.path.toLowerCase().includes(q));
    }
    return result;
  }, [diffs, statusFilter, typeFilter, searchQuery]);

  const onlyInA = useMemo(() => diffs.filter(d => d.status === 'only-a'), [diffs]);
  const onlyInB = useMemo(() => diffs.filter(d => d.status === 'only-b'), [diffs]);
  const changed = useMemo(() => diffs.filter(d => d.status === 'changed'), [diffs]);

  const canCompare = collectionA && collectionB && collectionA !== collectionB;

  const buildTsv = useCallback((rows: CollectionDiffRow[]) => {
    const header = ['Token Path', 'Type', 'Status', collectionA || 'A', collectionB || 'B'].join('\t');
    const lines = rows.map(d =>
      [d.path, d.type, d.status, formatTokenValueForDisplay(d.type, d.valueA), formatTokenValueForDisplay(d.type, d.valueB)].join('\t')
    );
    return [header, ...lines].join('\n');
  }, [collectionA, collectionB]);

  const handleCopy = useCallback(async () => {
    await triggerCopy(buildTsv(filteredDiffs));
  }, [buildTsv, filteredDiffs, triggerCopy]);

  const handleExportCsv = useCallback(() => {
    const header = [collectionA || 'A', collectionB || 'B', 'Token Path', 'Type', 'Status'];
    const rows = filteredDiffs.map(d => [
      formatTokenValueForDisplay(d.type, d.valueA),
      formatTokenValueForDisplay(d.type, d.valueB),
      d.path,
      d.type,
      d.status,
    ]);
    exportCsvFile(
      `collection-diff-${(collectionA || 'a').replace(/\W+/g, '_')}-vs-${(collectionB || 'b').replace(/\W+/g, '_')}.csv`,
      [header, ...rows],
    );
  }, [filteredDiffs, collectionA, collectionB]);

  const handleCopyMissing = useCallback(async (side: 'A' | 'B') => {
    if (!serverUrl) return;
    const targetCollectionId = side === 'A' ? collectionA : collectionB;
    const missing = side === 'A' ? onlyInB : onlyInA;
    if (!targetCollectionId || missing.length === 0) return;
    setBulkCreating(side);
    setBulkResult(null);
    try {
      const tokens = missing.map(d => ({
        path: d.path,
        $type: d.type,
        $value: side === 'A' ? d.valueB : d.valueA,
      }));
      await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(targetCollectionId)}/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens, strategy: 'overwrite' }),
      });
      setBulkResult(`Created ${tokens.length} token${tokens.length !== 1 ? 's' : ''}`);
      setTimeout(() => setBulkResult(null), 3000);
      onTokensCreated?.();
    } catch {
      setBulkResult('Failed');
      setTimeout(() => setBulkResult(null), 3000);
    } finally {
      setBulkCreating(null);
    }
  }, [serverUrl, collectionA, collectionB, onlyInA, onlyInB, onTokensCreated]);

  return (
    <div className="flex flex-col h-full">
      {/* Collection selectors */}
      <div className="shrink-0 px-3 py-2 border-b border-[var(--color-figma-border)] space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-secondary text-[var(--color-figma-text-secondary)] w-8 shrink-0">A</span>
          <select
            value={collectionA}
            onChange={e => setCollectionA(e.target.value)}
            className="flex-1 px-1.5 py-0.5 rounded text-secondary bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] outline-none focus-visible:border-[var(--color-figma-accent)] cursor-pointer"
          >
            <option value="">Select a collection…</option>
            {collectionIds.map((collectionId) => (
              <option key={collectionId} value={collectionId}>{collectionId}</option>
            ))}
          </select>
          {loadingA && <span className="text-secondary text-[var(--color-figma-text-tertiary)]">Loading…</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-secondary text-[var(--color-figma-text-secondary)] w-8 shrink-0">B</span>
          <select
            value={collectionB}
            onChange={e => setCollectionB(e.target.value)}
            className="flex-1 px-1.5 py-0.5 rounded text-secondary bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] outline-none focus-visible:border-[var(--color-figma-accent)] cursor-pointer"
          >
            <option value="">Select a collection…</option>
            {collectionIds.map((collectionId) => (
              <option key={collectionId} value={collectionId}>{collectionId}</option>
            ))}
          </select>
          {loadingB && <span className="text-secondary text-[var(--color-figma-text-tertiary)]">Loading…</span>}
        </div>
      </div>

      {/* Results */}
      {!canCompare ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-secondary text-[var(--color-figma-text-tertiary)] text-center px-4">
            {collectionIds.length < 2
              ? 'At least two collections are needed to compare.'
              : 'Select two different collections to compare.'}
          </p>
        </div>
      ) : (loadingA || loadingB) ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-secondary text-[var(--color-figma-text-tertiary)]">Loading…</p>
        </div>
      ) : diffs.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-secondary text-[var(--color-figma-text-tertiary)] text-center px-4">
            These collections are identical.
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
              className="w-full px-1.5 py-0.5 rounded text-secondary bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-tertiary)] outline-none focus-visible:border-[var(--color-figma-accent)]"
            />
            <div className="flex items-center gap-1 flex-wrap">
              {/* Status filter pills */}
              {([['all', `All (${diffs.length})`], ['only-a', `Only in A (${onlyInA.length})`], ['only-b', `Only in B (${onlyInB.length})`], ['changed', `Different (${changed.length})`]] as [CollectionDiffStatus | 'all', string][]).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setStatusFilter(id)}
                  className={`px-1.5 py-0.5 rounded text-secondary transition-colors ${
                    statusFilter === id
                      ? 'bg-[var(--color-figma-accent)] text-white'
                      : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
                  }`}
                >
                  {label}
                </button>
              ))}
              <div className="ml-auto flex items-center gap-1 shrink-0">
                <button
                  onClick={handleCopy}
                  title="Copy diff as tab-separated text"
                  className="px-1.5 py-0.5 rounded text-secondary text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                >
                  <span aria-live="polite">{copyFeedback ? 'Copied!' : 'Copy'}</span>
                </button>
                <button
                  onClick={handleExportCsv}
                  title="Export diff as CSV"
                  className="px-1.5 py-0.5 rounded text-secondary text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                >
                  CSV
                </button>
              </div>
            </div>
            {/* Type filter + bulk actions row */}
            <div className="flex items-center gap-1 flex-wrap">
              <button
                onClick={() => setTypeFilter('all')}
                className={`px-1.5 py-0.5 rounded text-secondary transition-colors ${
                  typeFilter === 'all'
                    ? 'bg-[var(--color-figma-accent)] text-white'
                    : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
                }`}
              >
                All types
              </button>
              {availableTypes.map(t => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`px-1.5 py-0.5 rounded text-secondary capitalize transition-colors ${
                    typeFilter === t
                      ? 'bg-[var(--color-figma-accent)] text-white'
                      : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
                  }`}
                >
                  {t}
                </button>
              ))}
              {serverUrl && onlyInB.length > 0 && (
                <button
                  onClick={() => handleCopyMissing('A')}
                  disabled={bulkCreating !== null}
                  title={`Copy ${onlyInB.length} token${onlyInB.length !== 1 ? 's' : ''} from B into A`}
                  className="ml-auto px-1.5 py-0.5 rounded text-secondary font-medium bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/20 disabled:opacity-50 transition-colors"
                >
                  {bulkCreating === 'A' ? 'Copying…' : `+ ${onlyInB.length} missing in A`}
                </button>
              )}
              {serverUrl && onlyInA.length > 0 && (
                <button
                  onClick={() => handleCopyMissing('B')}
                  disabled={bulkCreating !== null}
                  title={`Copy ${onlyInA.length} token${onlyInA.length !== 1 ? 's' : ''} from A into B`}
                  className={`px-1.5 py-0.5 rounded text-secondary font-medium bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/20 disabled:opacity-50 transition-colors ${!serverUrl || onlyInB.length > 0 ? '' : 'ml-auto'}`}
                >
                  {bulkCreating === 'B' ? 'Copying…' : `+ ${onlyInA.length} missing in B`}
                </button>
              )}
              {bulkResult && (
                <span className="text-secondary text-[var(--color-figma-text-secondary)]">{bulkResult}</span>
              )}
            </div>
            {filteredDiffs.length !== diffs.length && (
              <p className="text-secondary text-[var(--color-figma-text-secondary)]">
                Showing {filteredDiffs.length} of {diffs.length} differences
              </p>
            )}
          </div>

          {/* Diff list */}
          <div className="flex-1 overflow-y-auto">
            {filteredDiffs.map(diff => {
              const isColor = diff.type === 'color';
              const hexA = isColor && typeof diff.valueA === 'string' ? diff.valueA : null;
              const hexB = isColor && typeof diff.valueB === 'string' ? diff.valueB : null;
              const fmtA = diff.valueA !== undefined ? formatTokenValueForDisplay(diff.type, diff.valueA) : null;
              const fmtB = diff.valueB !== undefined ? formatTokenValueForDisplay(diff.type, diff.valueB) : null;
              const par = nodeParentPath(diff.path, diff.name);
              const statusColor = diff.status === 'only-a'
                ? 'bg-[var(--color-figma-diff-a)]/10 text-[var(--color-figma-diff-a)]'
                : diff.status === 'only-b'
                ? 'bg-[var(--color-figma-diff-b)]/10 text-[var(--color-figma-diff-b)]'
                : 'bg-[var(--color-figma-warning)]/10 text-[var(--color-figma-warning)]';
              const statusLabel = diff.status === 'only-a' ? 'only A' : diff.status === 'only-b' ? 'only B' : 'changed';
              return (
                <div
                  key={diff.path}
                  className="group px-3 py-2 border-b border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                >
                  <div className="flex items-baseline gap-1 mb-1.5">
                    {par && (
                      <span className="text-secondary text-[var(--color-figma-text-tertiary)] truncate">{par}.</span>
                    )}
                    <span className="text-secondary font-medium text-[var(--color-figma-text)] truncate" title={formatDisplayPath(diff.path, diff.name)}>{diff.name}</span>
                    <span className={`ml-auto text-[var(--font-size-xs)] shrink-0 px-1 py-0.5 rounded ${statusColor}`}>
                      {statusLabel}
                    </span>
                    <span className="text-[var(--font-size-xs)] text-[var(--color-figma-text-tertiary)] shrink-0 px-1 py-0.5 rounded bg-[var(--color-figma-bg-secondary)]">
                      {diff.type}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={`flex-1 flex items-center gap-1.5 min-w-0 px-1.5 py-1 rounded ${diff.status === 'only-b' ? 'opacity-40' : 'bg-[var(--color-figma-bg-secondary)]'}`}>
                      <span className="text-[var(--font-size-xs)] font-medium text-[var(--color-figma-text-tertiary)] shrink-0 w-3">A</span>
                      {hexA && <ColorSwatch value={hexA} />}
                      <span className="text-secondary font-mono text-[var(--color-figma-text-secondary)] truncate">
                        {fmtA ?? <em className="not-italic text-[var(--color-figma-text-tertiary)]">absent</em>}
                      </span>
                    </div>
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--color-figma-text-tertiary)]">
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                    <div className={`flex-1 flex items-center gap-1.5 min-w-0 px-1.5 py-1 rounded ${diff.status === 'only-a' ? 'opacity-40' : 'bg-[var(--color-figma-bg-secondary)]'}`}>
                      <span className="text-[var(--font-size-xs)] font-medium text-[var(--color-figma-text-tertiary)] shrink-0 w-3">B</span>
                      {hexB && <ColorSwatch value={hexB} />}
                      <span className="text-secondary font-mono text-[var(--color-figma-text)] truncate">
                        {fmtB ?? <em className="not-italic text-[var(--color-figma-text-tertiary)]">absent</em>}
                      </span>
                    </div>
                  </div>
                  {/* Hover actions */}
                  <div className="flex items-center gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {diff.status === 'only-b' && onCreateToken && (
                      <button
                        onClick={() => onCreateToken(diff.path, collectionA, diff.type, diff.valueB !== undefined ? (typeof diff.valueB === 'string' ? diff.valueB : JSON.stringify(diff.valueB)) : undefined)}
                        className="px-1.5 py-0.5 rounded text-secondary font-medium bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/20 transition-colors"
                        title={`Create token in ${collectionA} (copy B's value)`}
                      >
                        + Create in A
                      </button>
                    )}
                    {diff.status === 'only-a' && onCreateToken && (
                      <button
                        onClick={() => onCreateToken(diff.path, collectionB, diff.type, diff.valueA !== undefined ? (typeof diff.valueA === 'string' ? diff.valueA : JSON.stringify(diff.valueA)) : undefined)}
                        className="px-1.5 py-0.5 rounded text-secondary font-medium bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/20 transition-colors"
                        title={`Create token in ${collectionB} (copy A's value)`}
                      >
                        + Create in B
                      </button>
                    )}
                    {diff.status !== 'only-b' && onEditToken && (
                      <button
                        onClick={() => onEditToken(collectionA, diff.path)}
                        className="px-1.5 py-0.5 rounded text-secondary text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                        title={`Edit in ${collectionA}`}
                      >
                        Edit A
                      </button>
                    )}
                    {diff.status !== 'only-a' && onEditToken && (
                      <button
                        onClick={() => onEditToken(collectionB, diff.path)}
                        className="px-1.5 py-0.5 rounded text-secondary text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                        title={`Edit in ${collectionB}`}
                      >
                        Edit B
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// CompareView – main export (mode selector + routing)

export type CompareMode = 'tokens' | 'cross-collection' | 'mode-options' | 'collection-diff';

interface CompareViewProps {
  mode: CompareMode;
  onModeChange: (mode: CompareMode) => void;

  tokenPaths: Set<string>;
  onClearTokenPaths: () => void;

  tokenPath: string;
  onClearTokenPath: () => void;

  allTokensFlat: Record<string, TokenMapEntry>;
  pathToCollectionId: Record<string, string>;
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>;
  collections: TokenCollection[];
  collectionIds: string[];

  modeOptionsKey: number;
  modeOptionsDefaultA: string;
  modeOptionsDefaultB: string;

  onEditToken: (collectionId: string, path: string) => void;
  onCreateToken: (path: string, collectionId: string, type: string, value?: string) => void;

  onGoToTokens: () => void;

  serverUrl?: string;
  onTokensCreated?: () => void;
}

const MODES: { id: CompareMode; label: string }[] = [
  { id: 'tokens', label: 'Token values' },
  { id: 'cross-collection', label: 'Token × modes' },
  { id: 'mode-options', label: 'Mode pairs' },
  { id: 'collection-diff', label: 'Collection diff' },
];

export function CompareView({
  mode,
  onModeChange,
  tokenPaths,
  onClearTokenPaths,
  tokenPath,
  onClearTokenPath,
  allTokensFlat,
  pathToCollectionId,
  perCollectionFlat,
  collections,
  collectionIds,
  modeOptionsKey,
  modeOptionsDefaultA,
  modeOptionsDefaultB,
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
        <span className="text-secondary text-[var(--color-figma-text-secondary)] mr-1">Compare:</span>
        {MODES.map(m => (
          <button
            key={m.id}
            onClick={() => onModeChange(m.id)}
            className={`px-2 py-0.5 rounded text-secondary font-medium transition-colors ${
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
            <div className="flex flex-col items-center justify-center h-full gap-2 px-3 text-center">
              <p className="text-body text-[var(--color-figma-text-secondary)]">
                Select 2 or more tokens in the Tokens tab and click <strong>Compare</strong> to see a side-by-side value comparison.
              </p>
              <button
                onClick={onGoToTokens}
                className="px-3 py-1 rounded text-body font-medium bg-[var(--color-figma-accent)] text-white hover:opacity-90 transition-opacity"
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

        {mode === 'cross-collection' && (
          tokenPath === '' || collections.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 px-3 text-center">
              {collections.length === 0 ? (
                <p className="text-body text-[var(--color-figma-text-secondary)]">
                  No modes are configured. Set up modes first.
                </p>
              ) : (
                <p className="text-body text-[var(--color-figma-text-secondary)]">
                  Right-click any token in the Tokens tab and choose <strong>Compare across modes</strong> to see how its value changes across each option.
                </p>
              )}
              <button
                onClick={onGoToTokens}
                className="px-3 py-1 rounded text-body font-medium bg-[var(--color-figma-accent)] text-white hover:opacity-90 transition-opacity"
              >
                Go to Tokens
              </button>
            </div>
          ) : (
            <CrossCollectionMode
              tokenPath={tokenPath}
              allTokensFlat={allTokensFlat}
              perCollectionFlat={perCollectionFlat}
              collections={collections}
              pathToCollectionId={pathToCollectionId}
              onClose={onClearTokenPath}
            />
          )
        )}

        {mode === 'mode-options' && (
          <ModePairsMode
            key={modeOptionsKey}
            collections={collections}
            allTokensFlat={allTokensFlat}
            pathToCollectionId={pathToCollectionId}
            perCollectionFlat={perCollectionFlat}
            initialOptionKeyA={modeOptionsDefaultA}
            initialOptionKeyB={modeOptionsDefaultB}
            onEditToken={onEditToken}
          />
        )}

        {mode === 'collection-diff' && (
          <CollectionDiffMode
            collectionIds={collectionIds}
            serverUrl={serverUrl}
            onEditToken={onEditToken}
            onCreateToken={onCreateToken}
            onTokensCreated={onTokensCreated}
          />
        )}
      </div>
    </div>
  );
}
