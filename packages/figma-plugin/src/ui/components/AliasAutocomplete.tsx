import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TokenMapEntry } from '../../shared/types';
import { TOKEN_TYPE_BADGE_CLASS } from '../../shared/types';
import { fuzzyScore } from '../shared/fuzzyMatch';
import { isAlias, resolveTokenValue } from '../../shared/resolveAlias';
import { getRecentTokenPaths, addRecentToken } from '../shared/recentTokens';

interface AliasAutocompleteProps {
  query: string; // text typed after '{'
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToCollectionId?: Record<string, string>;
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
  pathToCollectionId = {},
  filterType,
  onSelect,
  onClose,
}: AliasAutocompleteProps) {
  const [activeIdx, setActiveIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Track selections for recent tokens
  const handleSelect = useCallback((path: string) => {
    const collectionId = pathToCollectionId[path];
    if (collectionId) {
      addRecentToken(path, collectionId);
    }
    onSelect(path);
  }, [onSelect, pathToCollectionId]);

  const { entries, totalCount, hasRecent } = useMemo(() => {
    const q = query.trim();
    type Entry = [string, TokenMapEntry, TokenMapEntry];
    const resolve = (entry: TokenMapEntry): TokenMapEntry => {
      if (!isAlias(entry.$value)) return entry;
      const result = resolveTokenValue(entry.$value, entry.$type, allTokensFlat);
      if (result.value != null) {
        return { ...entry, $value: result.value, $type: result.$type };
      }
      return entry;
    };
    if (!q) {
      // Show recent tokens first, then all tokens
      const recent = getRecentTokenPaths({ pathToCollectionId });
      const recentEntries: Entry[] = [];
      for (const p of recent) {
        const entry = allTokensFlat[p];
        if (!entry) continue;
        if (filterType && entry.$type !== filterType) continue;
        recentEntries.push([p, entry, resolve(entry)]);
        if (recentEntries.length >= 6) break;
      }
      const recentSet = new Set(recentEntries.map(e => e[0]));
      const all = Object.entries(allTokensFlat)
        .filter(([p, entry]) => (!filterType || entry.$type === filterType) && !recentSet.has(p));
      const remaining = all.slice(0, MAX_RESULTS - recentEntries.length).map(([p, e]) => [p, e, resolve(e)] as Entry);
      return {
        entries: [...recentEntries, ...remaining],
        totalCount: all.length + recentEntries.length,
        hasRecent: recentEntries.length > 0,
      };
    }
    const scored: [string, TokenMapEntry, number][] = [];
    for (const [path, entry] of Object.entries(allTokensFlat)) {
      if (filterType && entry.$type !== filterType) continue;
      const score = fuzzyScore(q, path);
      if (score >= 0) scored.push([path, entry, score]);
    }
    scored.sort((a, b) => b[2] - a[2]);
    return {
      entries: scored.slice(0, MAX_RESULTS).map(([p, e]) => [p, e, resolve(e)] as Entry),
      totalCount: scored.length,
      hasRecent: false,
    };
  }, [allTokensFlat, query, filterType, pathToCollectionId]);

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
        if (entries[activeIdx]) handleSelect(entries[activeIdx][0]);
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [entries, activeIdx, handleSelect, onClose]);

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
      {hasRecent && !query.trim() && (
        <div className="px-2 py-1 text-[10px] text-[var(--color-figma-text-tertiary)] font-medium uppercase tracking-wider border-b border-[var(--color-figma-border)]">
          Recent
        </div>
      )}
      {entries.map(([path, entry, resolved], idx) => {
        const isAliasToken = isAlias(entry.$value);
        const previewValue = formatValuePreview(resolved.$value);
        const rawPreview = isAliasToken ? formatValuePreview(entry.$value) : '';
        return (
        <button
          key={path}
          data-idx={idx}
          onMouseDown={e => { e.preventDefault(); handleSelect(path); }}
          onMouseEnter={() => setActiveIdx(idx)}
          className={`w-full flex items-center gap-2 px-2 py-1.5 text-left transition-colors ${idx === activeIdx ? 'bg-[var(--color-figma-bg-hover)]' : ''} ${entry.$lifecycle === 'deprecated' ? 'opacity-50' : ''}`}
        >
          {/* Value preview swatch — use resolved color */}
          {resolved.$type === 'color' && typeof resolved.$value === 'string' ? (
            <div
              className="w-3 h-3 rounded-sm border border-[var(--color-figma-border)] shrink-0"
              style={{ backgroundColor: resolved.$value }}
            />
          ) : (
            <div className="w-3 h-3 shrink-0" />
          )}

          {/* Path */}
          <span className={`flex-1 text-[10px] text-[var(--color-figma-text)] truncate ${entry.$lifecycle === 'deprecated' ? 'line-through' : ''}`}>{path}</span>

          {/* Resolved value — show final value; if it's an alias show alias source in muted text */}
          {previewValue && (
            <span
              className="text-[10px] text-[var(--color-figma-text-secondary)] truncate max-w-[120px] shrink-0"
              title={isAliasToken ? `${rawPreview} → ${previewValue}` : previewValue}
            >
              {isAliasToken && rawPreview !== previewValue ? (
                <span className="opacity-50">{rawPreview.replace(/^\{|\}$/g, '')}&nbsp;→&nbsp;</span>
              ) : null}
              {previewValue}
            </span>
          )}

          {/* Type badge */}
          <span className={`text-[8px] px-1 py-0.5 rounded font-medium uppercase shrink-0 ${TOKEN_TYPE_BADGE_CLASS[entry.$type ?? ''] ?? 'token-type-string'}`}>
            {entry.$type}
          </span>

          {/* Lifecycle badge */}
          {entry.$lifecycle === 'draft' && (
            <span className="text-[8px] px-1 py-0.5 rounded font-medium shrink-0 bg-[var(--color-figma-warning)]/15 text-[var(--color-figma-warning)]">draft</span>
          )}
          {entry.$lifecycle === 'deprecated' && (
            <span className="text-[8px] px-1 py-0.5 rounded font-medium shrink-0 bg-[var(--color-figma-text-tertiary)]/20 text-[var(--color-figma-text-secondary)]">deprecated</span>
          )}

          {/* Set name */}
          {pathToCollectionId[path] && (
            <span className="text-[8px] text-[var(--color-figma-text-secondary)] shrink-0">
              {pathToCollectionId[path]}
            </span>
          )}
        </button>
        );
      })}
      {totalCount > MAX_RESULTS && (
        <div className="px-2 py-1 text-[10px] text-[var(--color-figma-text-secondary)] border-t border-[var(--color-figma-border)] text-center">
          Showing {MAX_RESULTS} of {totalCount} matches — refine your search
        </div>
      )}
    </div>
  );
}
