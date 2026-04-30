/**
 * TokenPicker — Universal token selection component.
 *
 * Consolidates the editor's token-linking UI into a single consistent component.
 *
 */
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { TokenMapEntry } from '../../shared/types';
import { tokenTypeBadgeClass } from '../../shared/types';
import { fuzzyScore } from '../shared/fuzzyMatch';
import { isAlias } from '../../shared/resolveAlias';
import { addRecentToken } from '../shared/recentTokens';
import { swatchBgColor } from '../shared/colorUtils';
import { useTokenFlatMapContext } from '../contexts/TokenDataContext';
import {
  buildScopedTokenCandidates,
  getRecentScopedTokenCandidates,
  type ScopedTokenCandidate,
} from '../shared/scopedTokenCandidates';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface TokenPickerProps {
  /** All tokens available for selection. */
  allTokensFlat: Record<string, TokenMapEntry>;
  /** Maps token path → set name (shown as secondary info). */
  pathToCollectionId?: Record<string, string>;
  /** Filter to only tokens of this type (e.g. 'color', 'dimension'). */
  filterType?: string;
  /** When false, hide deprecated tokens from the result list. */
  includeDeprecated?: boolean;
  /** Called when a token is selected. */
  onSelect: (
    path: string,
    resolvedValue: unknown,
    entry: TokenMapEntry,
    selection?: ScopedTokenCandidate,
  ) => void;
  /** Called when the picker is dismissed without selection. */
  onClose?: () => void;
  /** Exclude these paths from results (e.g. exclude self). */
  excludePaths?: string[];
  /** Placeholder text for the search input. */
  placeholder?: string;
  /** Auto-focus the search input on mount. */
  autoFocus?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAX_RESULTS = 24;

function formatValuePreview(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const parts: string[] = [];
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith('$')) continue;
      if (typeof v === 'string' || typeof v === 'number') parts.push(String(v));
      if (parts.length >= 3) break;
    }
    return parts.join(' / ') || '';
  }
  return String(value);
}

// ---------------------------------------------------------------------------
// TokenPickerDropdown — The searchable list (core primitive)
// ---------------------------------------------------------------------------

/**
 * A positioned dropdown list of tokens with search, recent tokens, type
 * filtering, and visual previews. This is the shared core used by all modes.
 */
export function TokenPickerDropdown({
  allTokensFlat,
  pathToCollectionId = {},
  filterType,
  includeDeprecated = true,
  onSelect,
  onClose,
  excludePaths,
  placeholder = 'Search tokens…',
  autoFocus = true,
}: TokenPickerProps) {
  const { perCollectionFlat, collectionIdsByPath } = useTokenFlatMapContext();
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const handleSelect = useCallback(
    (candidate: ScopedTokenCandidate) => {
      if (candidate.collectionId) {
        addRecentToken(candidate.path, candidate.collectionId);
      }
      onSelect(
        candidate.path,
        candidate.resolvedEntry.$value,
        candidate.entry,
        candidate,
      );
    },
    [onSelect],
  );

  const excludeSet = useMemo(
    () => new Set(excludePaths ?? []),
    [excludePaths],
  );

  const candidates = useMemo(
    () => buildScopedTokenCandidates({
      allTokensFlat,
      pathToCollectionId,
      collectionIdsByPath,
      perCollectionFlat,
    }),
    [allTokensFlat, pathToCollectionId, collectionIdsByPath, perCollectionFlat],
  );

  const { entries, totalCount, hasRecent } = useMemo(() => {
    const q = query.trim();
    const matchesFilter = (candidate: ScopedTokenCandidate) =>
      (!filterType || candidate.entry.$type === filterType) &&
      (includeDeprecated || candidate.entry.$lifecycle !== 'deprecated');

    if (!q) {
      const recentEntries: ScopedTokenCandidate[] = [];
      for (const candidate of getRecentScopedTokenCandidates(candidates)) {
        if (excludeSet.has(candidate.path) || !matchesFilter(candidate)) continue;
        recentEntries.push(candidate);
        if (recentEntries.length >= 6) break;
      }
      const recentSet = new Set(recentEntries.map((candidate) => candidate.key));
      const all = candidates.filter(
        (candidate) =>
          matchesFilter(candidate) &&
          !recentSet.has(candidate.key) &&
          !excludeSet.has(candidate.path),
      );
      const remaining = all.slice(0, MAX_RESULTS - recentEntries.length);
      return {
        entries: [...recentEntries, ...remaining],
        totalCount: all.length + recentEntries.length,
        hasRecent: recentEntries.length > 0,
      };
    }
    const scored: Array<[ScopedTokenCandidate, number]> = [];
    for (const candidate of candidates) {
      if (!matchesFilter(candidate) || excludeSet.has(candidate.path)) continue;
      const score = fuzzyScore(q, candidate.path);
      if (score >= 0) scored.push([candidate, score]);
    }
    scored.sort((a, b) => b[1] - a[1]);
    return {
      entries: scored.slice(0, MAX_RESULTS).map(([candidate]) => candidate),
      totalCount: scored.length,
      hasRecent: false,
    };
  }, [candidates, query, filterType, includeDeprecated, excludeSet]);

  useEffect(() => { setActiveIdx(0); }, [query]);

  // Keyboard navigation
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
        if (entries[activeIdx]) handleSelect(entries[activeIdx]);
      } else if (e.key === 'Escape') {
        onClose?.();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [entries, activeIdx, handleSelect, onClose]);

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(
      `[data-idx="${activeIdx}"]`,
    ) as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  return (
    <div className="flex flex-col rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-[var(--shadow-popover)] overflow-hidden">
      {/* Search input */}
      <div className="px-2 pt-2 pb-1.5">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Escape') onClose?.();
          }}
          placeholder={placeholder}
          aria-label="Search tokens"
          className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[color:var(--color-figma-text)] text-body outline-none focus-visible:border-[var(--color-figma-accent)] placeholder:text-[color:var(--color-figma-text-secondary)]/50"
        />
      </div>

      {/* Results */}
      <div ref={listRef} className="overflow-y-auto min-h-0 max-h-[min(208px,50vh)]">
        {entries.length === 0 && (
          <div className="py-3 px-3 text-body text-[color:var(--color-figma-text-secondary)] text-center">
            No matching tokens
          </div>
        )}
        {hasRecent && !query.trim() && (
          <div className="px-2 py-1 text-secondary font-medium text-[color:var(--color-figma-text-tertiary)]">
            Recent
          </div>
        )}
        {entries.map((candidate, idx) => {
          const { path, entry, resolvedEntry: resolved } = candidate;
          const isAliasToken = isAlias(entry.$value);
          const previewValue = formatValuePreview(resolved.$value);
          const rawPreview = isAliasToken ? formatValuePreview(entry.$value) : '';
          const isColor = resolved.$type === 'color' && typeof resolved.$value === 'string';
          return (
            <button
              key={candidate.key}
              data-idx={idx}
              onMouseDown={e => { e.preventDefault(); handleSelect(candidate); }}
              onMouseEnter={() => setActiveIdx(idx)}
              className={`w-full px-2 py-1.5 text-left transition-colors ${
                idx === activeIdx ? 'bg-[var(--color-figma-bg-hover)]' : ''
              } ${entry.$lifecycle === 'deprecated' ? 'opacity-50' : ''}`}
            >
              <div className="grid min-w-0 grid-cols-[16px_minmax(0,1fr)] gap-x-2 gap-y-0.5">
                {isColor ? (
                  <div
                    className="mt-0.5 h-4 w-4 rounded-sm border border-[var(--color-figma-border)]"
                    style={{ backgroundColor: swatchBgColor(resolved.$value as string) }}
                  />
                ) : (
                  <div className="h-4 w-4" />
                )}
                <span
                  className={`min-w-0 text-body text-[color:var(--color-figma-text)] truncate ${
                    entry.$lifecycle === 'deprecated' ? 'line-through' : ''
                  }`}
                >
                  {path}
                </span>
                <div />
                <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-secondary text-[color:var(--color-figma-text-secondary)]">
                  {previewValue ? (
                    <span
                      className="min-w-0 truncate"
                      title={isAliasToken ? `${rawPreview} → ${previewValue}` : previewValue}
                    >
                      {previewValue}
                    </span>
                  ) : null}
                  <span
                    className={`shrink-0 rounded px-1 py-0.5 text-[var(--font-size-xs)] font-medium ${tokenTypeBadgeClass(entry.$type)}`}
                  >
                    {entry.$type}
                  </span>
                  {entry.$lifecycle === 'draft' && (
                    <span className="shrink-0 rounded bg-[var(--color-figma-warning)]/15 px-1 py-0.5 text-[var(--font-size-xs)] font-medium text-[color:var(--color-figma-text-warning)]">
                      draft
                    </span>
                  )}
                  {entry.$lifecycle === 'deprecated' && (
                    <span className="shrink-0 rounded bg-[var(--color-figma-text-tertiary)]/20 px-1 py-0.5 text-[var(--font-size-xs)] font-medium text-[color:var(--color-figma-text-secondary)]">
                      deprecated
                    </span>
                  )}
                  {candidate.isAmbiguousPath && candidate.collectionId && (
                    <span
                      className="min-w-0 truncate text-[var(--font-size-xs)] text-[color:var(--color-figma-text-secondary)]"
                      title={candidate.collectionId}
                    >
                      {candidate.collectionId}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
        {totalCount > MAX_RESULTS && (
          <div className="px-2 py-1.5 text-secondary text-[color:var(--color-figma-text-tertiary)] text-center">
            Showing {MAX_RESULTS} of {totalCount} — refine your search
          </div>
        )}
      </div>
    </div>
  );
}
