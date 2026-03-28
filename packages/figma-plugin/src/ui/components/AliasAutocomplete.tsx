import { useEffect, useMemo, useRef, useState } from 'react';
import type { TokenMapEntry } from '../../shared/types';
import { TOKEN_TYPE_BADGE_CLASS } from '../../shared/types';
import { fuzzyScore } from '../shared/fuzzyMatch';

interface AliasAutocompleteProps {
  query: string; // text typed after '{'
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToSet?: Record<string, string>;
  filterType?: string;
  onSelect: (path: string) => void;
  onClose: () => void;
}

const MAX_RESULTS = 24;

/** Format a token value as a short preview string. */
function formatValuePreview(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object') {
    // Composite tokens (typography, shadow, etc.) — show key fields concisely
    const obj = value as Record<string, unknown>;
    const parts: string[] = [];
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith('$')) continue; // skip $type, $description, etc.
      if (typeof v === 'string' || typeof v === 'number') parts.push(String(v));
      if (parts.length >= 3) break;
    }
    return parts.join(' / ') || '';
  }
  return String(value);
}

export function AliasAutocomplete({
  query,
  allTokensFlat,
  pathToSet = {},
  filterType,
  onSelect,
  onClose,
}: AliasAutocompleteProps) {
  const [activeIdx, setActiveIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const { entries, totalCount } = useMemo(() => {
    const q = query.trim();
    if (!q) {
      const all = Object.entries(allTokensFlat)
        .filter(([, entry]) => !filterType || entry.$type === filterType);
      return { entries: all.slice(0, MAX_RESULTS), totalCount: all.length };
    }
    const scored: [string, TokenMapEntry, number][] = [];
    for (const [path, entry] of Object.entries(allTokensFlat)) {
      if (filterType && entry.$type !== filterType) continue;
      const score = fuzzyScore(q, path);
      if (score >= 0) scored.push([path, entry, score]);
    }
    scored.sort((a, b) => b[2] - a[2]);
    return {
      entries: scored.slice(0, MAX_RESULTS).map(([p, e]) => [p, e] as [string, TokenMapEntry]),
      totalCount: scored.length,
    };
  }, [allTokensFlat, query, filterType]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx(i => Math.min(i + 1, entries.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (entries[activeIdx]) onSelect(entries[activeIdx][0]);
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [entries, activeIdx, onSelect, onClose]);

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${activeIdx}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  if (entries.length === 0) {
    return (
      <div className="absolute z-50 mt-1 left-0 right-0 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-lg py-2 px-3 text-[10px] text-[var(--color-figma-text-secondary)]">
        No matching tokens
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      className="absolute z-50 mt-1 left-0 right-0 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-lg overflow-y-auto max-h-48"
    >
      {entries.map(([path, entry], idx) => (
        <button
          key={path}
          data-idx={idx}
          onMouseDown={e => { e.preventDefault(); onSelect(path); }}
          onMouseEnter={() => setActiveIdx(idx)}
          className={`w-full flex items-center gap-2 px-2 py-1.5 text-left transition-colors ${idx === activeIdx ? 'bg-[var(--color-figma-bg-hover)]' : ''} ${entry.$lifecycle === 'deprecated' ? 'opacity-50' : ''}`}
        >
          {/* Value preview */}
          {entry.$type === 'color' && typeof entry.$value === 'string' ? (
            <div
              className="w-3 h-3 rounded-sm border border-[var(--color-figma-border)] shrink-0"
              style={{ backgroundColor: entry.$value }}
            />
          ) : (
            <div className="w-3 h-3 shrink-0" />
          )}

          {/* Path */}
          <span className={`flex-1 text-[10px] text-[var(--color-figma-text)] truncate ${entry.$lifecycle === 'deprecated' ? 'line-through' : ''}`}>{path}</span>

          {/* Resolved value */}
          {formatValuePreview(entry.$value) && (
            <span className="text-[10px] text-[var(--color-figma-text-secondary)] truncate max-w-[120px] shrink-0" title={formatValuePreview(entry.$value)}>
              {formatValuePreview(entry.$value)}
            </span>
          )}

          {/* Type badge */}
          <span className={`text-[8px] px-1 py-0.5 rounded font-medium uppercase shrink-0 ${TOKEN_TYPE_BADGE_CLASS[entry.$type ?? ''] ?? 'token-type-string'}`}>
            {entry.$type}
          </span>

          {/* Lifecycle badge */}
          {entry.$lifecycle === 'draft' && (
            <span className="text-[8px] px-1 py-0.5 rounded font-medium shrink-0 bg-amber-500/15 text-amber-700 dark:text-amber-400">draft</span>
          )}
          {entry.$lifecycle === 'deprecated' && (
            <span className="text-[8px] px-1 py-0.5 rounded font-medium shrink-0 bg-gray-300/40 text-gray-500 dark:text-gray-400">deprecated</span>
          )}

          {/* Set name */}
          {pathToSet[path] && (
            <span className="text-[8px] text-[var(--color-figma-text-secondary)] shrink-0">
              {pathToSet[path]}
            </span>
          )}
        </button>
      ))}
      {totalCount > MAX_RESULTS && (
        <div className="px-2 py-1 text-[9px] text-[var(--color-figma-text-secondary)] border-t border-[var(--color-figma-border)] text-center">
          Showing {MAX_RESULTS} of {totalCount} matches — refine your search
        </div>
      )}
    </div>
  );
}
