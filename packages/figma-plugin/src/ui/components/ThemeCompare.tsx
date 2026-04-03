import { useMemo, useState, useCallback } from 'react';
import type { TokenMapEntry } from '../../shared/types';
import { stableStringify } from '../shared/utils';
import { formatTokenValueForDisplay } from '../shared/tokenFormatting';
import { resolveThemeOption, exportCsvFile, copyToClipboard } from '../shared/comparisonUtils';
import { nodeParentPath, formatDisplayPath } from './tokenListUtils';
import { apiFetch } from '../shared/apiFetch';
import type { ThemeOption, ThemeDimension } from '@tokenmanager/core';

interface ThemeCompareProps {
  dimensions: ThemeDimension[];
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToSet: Record<string, string>;
  /** Navigate to an existing token for editing (switches to tokens tab + highlights) */
  onEditToken?: (set: string, path: string) => void;
  /** Open the token editor in create mode with pre-filled values */
  onCreateToken?: (path: string, set: string, type: string, value?: string) => void;
  /** Pre-select option A on mount (key format: "{dimId}:{optionName}") */
  initialOptionKeyA?: string;
  /** Pre-select option B on mount (key format: "{dimId}:{optionName}") */
  initialOptionKeyB?: string;
  /** Server URL for direct batch token creation */
  serverUrl?: string;
  /** Called after tokens are batch-created so the caller can refresh */
  onTokensCreated?: () => void;
}

// Flat list of all options across all dimensions for the compare selectors
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


function ColorSwatch({ hex }: { hex: string }) {
  const bg = hex.slice(0, 7);
  return (
    <div
      className="w-3.5 h-3.5 rounded-sm border border-white/20 ring-1 ring-[var(--color-figma-border)] shrink-0"
      style={{ backgroundColor: bg }}
      aria-hidden="true"
    />
  );
}

export function ThemeCompare({ dimensions, allTokensFlat, pathToSet, onEditToken, onCreateToken, initialOptionKeyA, initialOptionKeyB, serverUrl, onTokensCreated }: ThemeCompareProps) {
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

  // Build a lookup: for each option, which set would be the best target for creating a token?
  // Prefer the first 'enabled' set, falling back to 'source'.
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
      valueA: any;
      valueB: any;
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

  const [copyFeedback, setCopyFeedback] = useState(false);
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
    const text = buildTsv(filteredDiffs);
    await copyToClipboard(
      text,
      () => { setCopyFeedback(true); setTimeout(() => setCopyFeedback(false), 1500); },
      () => parent.postMessage({ pluginMessage: { type: 'notify', message: 'Clipboard access denied' } }, '*'),
    );
  }, [buildTsv, filteredDiffs]);

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

  // Missing tokens in each option (from currently filtered view)
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
              const parent = nodeParentPath(diff.path, diff.name);
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
                    {parent && (
                      <span className="text-[10px] text-[var(--color-figma-text-tertiary)] truncate">{parent}.</span>
                    )}
                    <span className="text-[10px] font-medium text-[var(--color-figma-text)] truncate" title={formatDisplayPath(diff.path, diff.name)}>{leaf}</span>
                    <span className="ml-auto text-[8px] uppercase tracking-wide text-[var(--color-figma-text-tertiary)] shrink-0 px-1 py-0.5 rounded bg-[var(--color-figma-bg-secondary)]">
                      {diff.type}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Theme A value */}
                    <div className="flex-1 flex items-center gap-1.5 min-w-0 px-1.5 py-1 rounded bg-[var(--color-figma-bg-secondary)]">
                      <span className="text-[8px] font-medium text-[var(--color-figma-text-tertiary)] shrink-0 w-3">A</span>
                      {hexA && <ColorSwatch hex={hexA} />}
                      <span className="text-[10px] font-mono text-[var(--color-figma-text-secondary)] truncate" title={fmtA}>
                        {absentInA ? <em className="not-italic text-[var(--color-figma-text-tertiary)]">absent</em> : fmtA}
                      </span>
                    </div>
                    {/* Arrow */}
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--color-figma-text-tertiary)]">
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                    {/* Theme B value */}
                    <div className="flex-1 flex items-center gap-1.5 min-w-0 px-1.5 py-1 rounded bg-[var(--color-figma-bg-secondary)]">
                      <span className="text-[8px] font-medium text-[var(--color-figma-text-tertiary)] shrink-0 w-3">B</span>
                      {hexB && <ColorSwatch hex={hexB} />}
                      <span className="text-[10px] font-mono text-[var(--color-figma-text)] truncate" title={fmtB}>
                        {absentInB ? <em className="not-italic text-[var(--color-figma-text-tertiary)]">absent</em> : fmtB}
                      </span>
                    </div>
                  </div>
                  {/* Inline actions — visible on hover */}
                  {(onEditToken || onCreateToken) && (
                    <div className="flex items-center gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      {/* Actions for side A */}
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
                      {/* Actions for side B */}
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
