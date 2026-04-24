/**
 * TokenPicker — Universal token selection component.
 *
 * Consolidates the editor's token-linking UI into a single consistent component.
 *
 * Modes:
 * - "dropdown" — Inline searchable dropdown
 * - "field"    — Shows a linked badge or trigger button; opens search on click
 */
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { TokenMapEntry } from '../../shared/types';
import { tokenTypeBadgeClass } from '../../shared/types';
import { fuzzyScore } from '../shared/fuzzyMatch';
import { isAlias, resolveTokenValue } from '../../shared/resolveAlias';
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

export interface TokenPickerFieldProps extends Omit<TokenPickerProps, 'onClose'> {
  /** Currently linked token path, or undefined if not linked. */
  value: string | undefined;
  /** Collection that owns the linked token when the path is ambiguous. */
  selectedCollectionId?: string;
  /** Called when the user clears the linked token. */
  onClear: () => void;
  /** Label shown above the field. */
  label?: string;
  /** Compact display (no label, smaller). */
  compact?: boolean;
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

function resolveEntry(
  entry: TokenMapEntry,
  allTokensFlat: Record<string, TokenMapEntry>,
  scopedTokens?: Record<string, TokenMapEntry>,
): TokenMapEntry {
  if (!isAlias(entry.$value)) return entry;
  const result = resolveTokenValue(
    entry.$value,
    entry.$type,
    scopedTokens ?? allTokensFlat,
  );
  if (result.value != null) {
    return { ...entry, $value: result.value, $type: result.$type };
  }
  if (scopedTokens != null) {
    const fallback = resolveTokenValue(entry.$value, entry.$type, allTokensFlat);
    if (fallback.value != null) {
      return { ...entry, $value: fallback.value, $type: fallback.$type };
    }
  }
  return entry;
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
    <div className="flex flex-col rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-lg overflow-hidden">
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
          className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-body outline-none focus-visible:border-[var(--color-figma-accent)] placeholder:text-[var(--color-figma-text-secondary)]/50"
        />
      </div>

      {/* Results */}
      <div ref={listRef} className="overflow-y-auto max-h-52">
        {entries.length === 0 && (
          <div className="py-3 px-3 text-body text-[var(--color-figma-text-secondary)] text-center">
            No matching tokens
          </div>
        )}
        {hasRecent && !query.trim() && (
          <div className="px-2 py-1 text-secondary font-medium text-[var(--color-figma-text-tertiary)]">
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
              className={`w-full flex items-center gap-2 px-2 py-1.5 text-left transition-colors ${
                idx === activeIdx ? 'bg-[var(--color-figma-bg-hover)]' : ''
              } ${entry.$lifecycle === 'deprecated' ? 'opacity-50' : ''}`}
            >
              {/* Color swatch */}
              {isColor ? (
                <div
                  className="w-4 h-4 rounded-sm border border-[var(--color-figma-border)] shrink-0"
                  style={{ backgroundColor: swatchBgColor(resolved.$value as string) }}
                />
              ) : (
                <div className="w-4 h-4 shrink-0" />
              )}

              {/* Path */}
              <span
                className={`flex-1 text-body text-[var(--color-figma-text)] truncate ${
                  entry.$lifecycle === 'deprecated' ? 'line-through' : ''
                }`}
              >
                {path}
              </span>

              {/* Resolved value preview */}
              {previewValue && (
                <span
                  className="text-secondary text-[var(--color-figma-text-secondary)] truncate max-w-[100px] shrink-0"
                  title={isAliasToken ? `${rawPreview} → ${previewValue}` : previewValue}
                >
                  {previewValue}
                </span>
              )}

              {/* Type badge */}
              <span
                className={`text-[8px] px-1 py-0.5 rounded font-medium shrink-0 ${tokenTypeBadgeClass(entry.$type)}`}
              >
                {entry.$type}
              </span>

              {/* Lifecycle badges */}
              {entry.$lifecycle === 'draft' && (
                <span className="text-[8px] px-1 py-0.5 rounded font-medium shrink-0 bg-[var(--color-figma-warning)]/15 text-[var(--color-figma-warning)]">
                  draft
                </span>
              )}
              {entry.$lifecycle === 'deprecated' && (
                <span className="text-[8px] px-1 py-0.5 rounded font-medium shrink-0 bg-[var(--color-figma-text-tertiary)]/20 text-[var(--color-figma-text-secondary)]">
                  deprecated
                </span>
              )}

              {/* Set name */}
              {candidate.isAmbiguousPath && candidate.collectionId && (
                <span className="text-[8px] text-[var(--color-figma-text-secondary)] shrink-0">
                  {candidate.collectionId}
                </span>
              )}
            </button>
          );
        })}
        {totalCount > MAX_RESULTS && (
          <div className="px-2 py-1.5 text-secondary text-[var(--color-figma-text-tertiary)] text-center">
            Showing {MAX_RESULTS} of {totalCount} — refine your search
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TokenPickerField — The field-level component (linked badge or trigger)
// ---------------------------------------------------------------------------

/**
 * A self-contained token picker field.
 *
 * When no token is linked: shows a search trigger button.
 * When a token is linked: shows a badge with the token path, resolved value,
 * and color swatch (if applicable), plus a clear button.
 *
 * Clicking the trigger or the badge opens/toggles the dropdown.
 */
export function TokenPickerField({
  value,
  selectedCollectionId,
  onSelect,
  onClear,
  allTokensFlat,
  pathToCollectionId,
  filterType,
  includeDeprecated,
  excludePaths,
  label,
  compact,
  placeholder,
  autoFocus,
}: TokenPickerFieldProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { perCollectionFlat } = useTokenFlatMapContext();

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSelect = useCallback(
    (
      path: string,
      resolvedValue: unknown,
      entry: TokenMapEntry,
      selection?: ScopedTokenCandidate,
    ) => {
      setOpen(false);
      onSelect(path, resolvedValue, entry, selection);
    },
    [onSelect],
  );

  // Resolve the linked token for display
  const linkedEntry =
    value == null
      ? undefined
      : (selectedCollectionId
          ? perCollectionFlat?.[selectedCollectionId]?.[value]
          : undefined) ?? allTokensFlat[value];
  const linkedResolved = useMemo(() => {
    if (!linkedEntry) return undefined;
    return resolveEntry(
      linkedEntry,
      allTokensFlat,
      selectedCollectionId
        ? perCollectionFlat?.[selectedCollectionId]
        : undefined,
    );
  }, [allTokensFlat, linkedEntry, perCollectionFlat, selectedCollectionId]);

  const linkedValueStr = linkedResolved
    ? formatValuePreview(linkedResolved.$value)
    : '';
  const linkedIsColor =
    linkedResolved?.$type === 'color' &&
    typeof linkedResolved.$value === 'string';

  return (
    <div ref={wrapperRef} className="flex flex-col gap-1.5">
      {/* Label row */}
      {label && !compact && (
        <div className="flex items-center gap-1.5">
          <label className="flex-1 text-body text-[var(--color-figma-text-secondary)]">
            {label}
          </label>
        </div>
      )}

      {/* Linked state: token badge */}
      {value && linkedEntry ? (
        <div className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-accent)]/40 min-w-0 group">
          {linkedIsColor && (
            <div
              className="w-4 h-4 rounded-sm border border-[var(--color-figma-border)] shrink-0"
              style={{
                backgroundColor: swatchBgColor(linkedResolved!.$value as string),
              }}
            />
          )}
          <span
            className="flex-1 text-body font-mono text-[var(--color-figma-accent)] truncate cursor-default"
            title={value}
          >
            {value}
          </span>
          {linkedValueStr && (
            <span className="text-secondary text-[var(--color-figma-text-secondary)] shrink-0 font-mono truncate max-w-[80px]">
              {linkedValueStr}
            </span>
          )}
          {/* Swap button */}
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            title="Change linked token"
            aria-label="Change linked token"
            className="p-1 rounded text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-bg-hover)] transition-colors shrink-0 opacity-0 group-hover:opacity-100"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
            </svg>
          </button>
          {/* Clear button */}
          <button
            type="button"
            onClick={onClear}
            title="Unlink token"
            aria-label="Unlink token"
            className="p-1 rounded text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)] hover:bg-[var(--color-figma-bg-hover)] transition-colors shrink-0"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      ) : (
        /* Unlinked state: trigger button */
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className={`flex items-center gap-1.5 px-2 py-1.5 rounded border border-dashed border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)] transition-colors text-left ${
            compact ? 'text-secondary' : 'text-body'
          }`}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
          </svg>
          {placeholder ?? 'Pick a token…'}
        </button>
      )}

      {/* Dropdown */}
      {open && (
        <div className="relative z-50">
          <div className="absolute left-0 right-0 top-0">
            <TokenPickerDropdown
              allTokensFlat={allTokensFlat}
              pathToCollectionId={pathToCollectionId}
              filterType={filterType}
              includeDeprecated={includeDeprecated}
              excludePaths={excludePaths}
              onSelect={handleSelect}
              onClose={() => setOpen(false)}
              placeholder={placeholder}
              autoFocus={autoFocus ?? true}
            />
          </div>
        </div>
      )}
    </div>
  );
}
