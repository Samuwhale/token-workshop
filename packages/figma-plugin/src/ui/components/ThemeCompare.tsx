import { useMemo, useState } from 'react';
import type { TokenMapEntry } from '../../shared/types';
import { resolveAllAliases } from '../../shared/resolveAlias';
import { stableStringify } from '../shared/utils';
import { nodeParentPath, formatDisplayPath } from './tokenListUtils';
import type { ThemeOption, ThemeDimension } from '@tokenmanager/core';

interface ThemeCompareProps {
  dimensions: ThemeDimension[];
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToSet: Record<string, string>;
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

function formatValue(value: any, type: string): string {
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

export function ThemeCompare({ dimensions, allTokensFlat, pathToSet }: ThemeCompareProps) {
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

  const diffs = useMemo(() => {
    if (!resolvedA || !resolvedB) return [];
    const allPaths = new Set([...Object.keys(resolvedA), ...Object.keys(resolvedB)]);
    const result: Array<{
      path: string;
      name: string;
      type: string;
      valueA: any;
      valueB: any;
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
        });
      }
    }
    return result.sort((a, b) => a.path.localeCompare(b.path));
  }, [resolvedA, resolvedB]);

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
                onClick={() => setTypeFilter('all')}
                className={`px-1.5 py-0.5 rounded text-[9px] transition-colors ${
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
                  className={`px-1.5 py-0.5 rounded text-[9px] capitalize transition-colors ${
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
              const labelA = formatValue(diff.valueA, diff.type);
              const labelB = formatValue(diff.valueB, diff.type);
              const leaf = diff.name;
              const parent = nodeParentPath(diff.path, diff.name);
              return (
                <div
                  key={diff.path}
                  className="px-3 py-2 border-b border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                >
                  <div className="flex items-baseline gap-1 mb-1.5">
                    {parent && (
                      <span className="text-[9px] text-[var(--color-figma-text-tertiary)] truncate">{parent}.</span>
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
                      <span className="text-[9px] font-mono text-[var(--color-figma-text-secondary)] truncate" title={labelA}>
                        {diff.valueA === undefined ? <em className="not-italic text-[var(--color-figma-text-tertiary)]">absent</em> : labelA}
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
                      <span className="text-[9px] font-mono text-[var(--color-figma-text)] truncate" title={labelB}>
                        {diff.valueB === undefined ? <em className="not-italic text-[var(--color-figma-text-tertiary)]">absent</em> : labelB}
                      </span>
                    </div>
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
