import { useMemo, useState, useCallback } from 'react';
import type { TokenMapEntry } from '../../shared/types';
import { resolveAllAliases } from '../../shared/resolveAlias';
import { stableStringify } from '../shared/utils';
import { nodeParentPath, formatDisplayPath } from './tokenListUtils';
import type { ThemeOption, ThemeDimension } from '@tokenmanager/core';

interface ThemeCompareProps {
  dimensions: ThemeDimension[];
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToSet: Record<string, string>;
  /** Navigate to an existing token for editing (switches to tokens tab + highlights) */
  onEditToken?: (set: string, path: string) => void;
  /** Open the token editor in create mode with pre-filled values */
  onCreateToken?: (path: string, set: string, type: string, value?: string) => void;
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

function resolveForOption(
  option: FlatOption | null,
  allTokensFlat: Record<string, TokenMapEntry>,
  pathToSet: Record<string, string>,
): Record<string, TokenMapEntry> {
  if (!option) return resolveAllAliases(allTokensFlat);
  const merged: Record<string, TokenMapEntry> = {};
  for (const [setName, status] of Object.entries(option.sets)) {
    if (status !== 'source') continue;
    for (const [path, entry] of Object.entries(allTokensFlat)) {
      if (pathToSet[path] === setName) merged[path] = entry;
    }
  }
  for (const [setName, status] of Object.entries(option.sets)) {
    if (status !== 'enabled') continue;
    for (const [path, entry] of Object.entries(allTokensFlat)) {
      if (pathToSet[path] === setName) merged[path] = entry;
    }
  }
  return resolveAllAliases(merged);
}

function formatThemeValue(value: any, type: string): string {
  if (value === undefined || value === null) return '—';
  if (type === 'dimension' && typeof value === 'object' && 'value' in value) {
    return `${value.value}${value.unit ?? 'px'}`;
  }
  if (type === 'typography' && typeof value === 'object') {
    const family = Array.isArray(value.fontFamily) ? value.fontFamily[0] : (value.fontFamily ?? '');
    const size = typeof value.fontSize === 'object'
      ? `${value.fontSize?.value ?? ''}${value.fontSize?.unit ?? 'px'}`
      : value.fontSize ? `${value.fontSize}px` : '';
    const weight = value.fontWeight ?? '';
    return [family, size, weight].filter(Boolean).join(' ') || '—';
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
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

export function ThemeCompare({ dimensions, allTokensFlat, pathToSet, onEditToken, onCreateToken }: ThemeCompareProps) {
  const [optionKeyA, setOptionKeyA] = useState<string>('');
  const [optionKeyB, setOptionKeyB] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const flatOptions = useMemo(() => buildFlatOptions(dimensions), [dimensions]);

  const resolvedA = useMemo(() => {
    if (!optionKeyA) return null;
    const opt = flatOptions.find(o => o.key === optionKeyA) ?? null;
    return resolveForOption(opt, allTokensFlat, pathToSet);
  }, [optionKeyA, flatOptions, allTokensFlat, pathToSet]);

  const resolvedB = useMemo(() => {
    if (!optionKeyB) return null;
    const opt = flatOptions.find(o => o.key === optionKeyB) ?? null;
    return resolveForOption(opt, allTokensFlat, pathToSet);
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

  const buildTsv = useCallback((rows: typeof filteredDiffs) => {
    const header = ['Token Path', 'Type', labelA, labelB].join('\t');
    const lines = rows.map(d =>
      [d.path, d.type, formatThemeValue(d.valueA, d.type), formatThemeValue(d.valueB, d.type)].join('\t')
    );
    return [header, ...lines].join('\n');
  }, [labelA, labelB]);

  const handleCopy = useCallback(async () => {
    const text = buildTsv(filteredDiffs);
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 1500);
    } catch {
      parent.postMessage({ pluginMessage: { type: 'notify', message: 'Clipboard access denied' } }, '*');
    }
  }, [buildTsv, filteredDiffs]);

  const handleExportCsv = useCallback(() => {
    const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const header = [labelA, labelB, 'Token Path', 'Type'].map(escape).join(',');
    const lines = filteredDiffs.map(d =>
      [
        escape(formatThemeValue(d.valueA, d.type)),
        escape(formatThemeValue(d.valueB, d.type)),
        escape(d.path),
        escape(d.type),
      ].join(',')
    );
    const csv = [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `theme-compare-${labelA.replace(/\W+/g, '_')}-vs-${labelB.replace(/\W+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredDiffs, labelA, labelB]);

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
              const fmtA = formatThemeValue(diff.valueA, diff.type);
              const fmtB = formatThemeValue(diff.valueB, diff.type);
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
