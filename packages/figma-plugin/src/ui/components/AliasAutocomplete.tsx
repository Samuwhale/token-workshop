import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TokenMapEntry } from '../../shared/types';
import { tokenTypeBadgeClass } from '../../shared/types';
import { fuzzyScore } from '../shared/fuzzyMatch';
import { isAlias } from '../../shared/resolveAlias';
import { addRecentToken } from '../shared/recentTokens';
import { useTokenFlatMapContext } from '../contexts/TokenDataContext';
import {
  buildScopedTokenCandidates,
  getRecentScopedTokenCandidates,
  type ScopedTokenCandidate,
} from '../shared/scopedTokenCandidates';

interface AliasAutocompleteProps {
  query: string; // text typed after '{'
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToCollectionId?: Record<string, string>;
  filterType?: string;
  onSelect: (path: string, selection?: ScopedTokenCandidate) => void;
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
  const { perCollectionFlat, collectionIdsByPath } = useTokenFlatMapContext();
  const [activeIdx, setActiveIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Track selections for recent tokens
  const handleSelect = useCallback((candidate: ScopedTokenCandidate) => {
    if (candidate.collectionId) {
      addRecentToken(candidate.path, candidate.collectionId);
    }
    onSelect(candidate.path, candidate);
  }, [onSelect]);

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
    if (!q) {
      const recentEntries: ScopedTokenCandidate[] = [];
      for (const candidate of getRecentScopedTokenCandidates(candidates)) {
        if (
          candidate.isAmbiguousPath ||
          (filterType && candidate.entry.$type !== filterType)
        ) {
          continue;
        }
        recentEntries.push(candidate);
        if (recentEntries.length >= 6) break;
      }
      const recentSet = new Set(recentEntries.map((candidate) => candidate.key));
      const all = candidates
        .filter(
          (candidate) =>
            !candidate.isAmbiguousPath &&
            (!filterType || candidate.entry.$type === filterType) &&
            !recentSet.has(candidate.key),
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
      if (
        candidate.isAmbiguousPath ||
        (filterType && candidate.entry.$type !== filterType)
      ) {
        continue;
      }
      const score = fuzzyScore(q, candidate.path);
      if (score >= 0) scored.push([candidate, score]);
    }
    scored.sort((a, b) => b[1] - a[1]);
    return {
      entries: scored.slice(0, MAX_RESULTS).map(([candidate]) => candidate),
      totalCount: scored.length,
      hasRecent: false,
    };
  }, [candidates, query, filterType]);

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
        if (entries[activeIdx]) handleSelect(entries[activeIdx]);
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
      <div className="absolute z-50 mt-1 left-0 right-0 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-lg py-2 px-3 text-secondary text-[var(--color-figma-text-secondary)]">
        No matching tokens with a unique path
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      className="absolute z-50 mt-1 left-0 right-0 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-lg overflow-y-auto max-h-48"
    >
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
        return (
        <button
          key={candidate.key}
          data-idx={idx}
          onMouseDown={e => { e.preventDefault(); handleSelect(candidate); }}
          onMouseEnter={() => setActiveIdx(idx)}
          className={`w-full px-2 py-1.5 text-left transition-colors ${idx === activeIdx ? 'bg-[var(--color-figma-bg-hover)]' : ''} ${entry.$lifecycle === 'deprecated' ? 'opacity-50' : ''}`}
        >
          <div className="grid min-w-0 grid-cols-[12px_minmax(0,1fr)] gap-x-2 gap-y-0.5">
            {resolved.$type === 'color' && typeof resolved.$value === 'string' ? (
              <div
                className="mt-0.5 h-3 w-3 rounded-sm border border-[var(--color-figma-border)]"
                style={{ backgroundColor: resolved.$value }}
              />
            ) : (
              <div className="h-3 w-3" />
            )}
            <span className={`min-w-0 text-secondary text-[var(--color-figma-text)] truncate ${entry.$lifecycle === 'deprecated' ? 'line-through' : ''}`}>{path}</span>
            <div />
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-secondary text-[var(--color-figma-text-secondary)]">
              {previewValue ? (
                <span
                  className="min-w-0 truncate"
                  title={isAliasToken ? `${rawPreview} → ${previewValue}` : previewValue}
                >
                  {isAliasToken && rawPreview !== previewValue ? (
                    <span className="opacity-50">{rawPreview.replace(/^\{|\}$/g, '')}&nbsp;→&nbsp;</span>
                  ) : null}
                  {previewValue}
                </span>
              ) : null}
              <span className={`shrink-0 rounded px-1 py-0.5 text-[8px] font-medium uppercase ${tokenTypeBadgeClass(entry.$type)}`}>
                {entry.$type}
              </span>
              {entry.$lifecycle === 'draft' && (
                <span className="shrink-0 rounded bg-[var(--color-figma-warning)]/15 px-1 py-0.5 text-[8px] font-medium text-[var(--color-figma-warning)]">draft</span>
              )}
              {entry.$lifecycle === 'deprecated' && (
                <span className="shrink-0 rounded bg-[var(--color-figma-text-tertiary)]/20 px-1 py-0.5 text-[8px] font-medium text-[var(--color-figma-text-secondary)]">deprecated</span>
              )}
            </div>
          </div>
        </button>
        );
      })}
      {totalCount > MAX_RESULTS && (
        <div className="px-2 py-1 text-secondary text-[var(--color-figma-text-secondary)] border-t border-[var(--color-figma-border)] text-center">
          Showing {MAX_RESULTS} of {totalCount} matches — refine your search
        </div>
      )}
    </div>
  );
}
