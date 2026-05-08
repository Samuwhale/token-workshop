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
import { clampListIndex } from '../shared/listNavigation';
import { formatTokenValuePreview } from '../shared/tokenValuePreview';
import { getCollectionDisplayName } from '../shared/libraryCollections';

interface AliasAutocompleteProps {
  query: string; // text typed after '{'
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToCollectionId?: Record<string, string>;
  preferredCollectionId?: string;
  collectionDisplayNames?: Record<string, string>;
  filterType?: string;
  onSelect: (path: string, selection?: ScopedTokenCandidate) => void;
  onClose: () => void;
}

const MAX_RESULTS = 24;
const MAX_AMBIGUOUS_RESULTS = 6;

export function AliasAutocomplete({
  query,
  allTokensFlat,
  pathToCollectionId = {},
  preferredCollectionId,
  collectionDisplayNames,
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

  const { entries, totalCount, hasRecent, ambiguousEntries } = useMemo(() => {
    const q = query.trim();
    if (!q) {
      const recentEntries: ScopedTokenCandidate[] = [];
      for (const candidate of getRecentScopedTokenCandidates(candidates, {
        collectionId: preferredCollectionId,
      })) {
        if (
          (candidate.isAmbiguousPath &&
            candidate.collectionId !== preferredCollectionId) ||
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
            (!candidate.isAmbiguousPath ||
              candidate.collectionId === preferredCollectionId) &&
            (!filterType || candidate.entry.$type === filterType) &&
            !recentSet.has(candidate.key),
        )
        .sort((a, b) => {
          const aPreferred = a.collectionId === preferredCollectionId ? 1 : 0;
          const bPreferred = b.collectionId === preferredCollectionId ? 1 : 0;
          return bPreferred - aPreferred;
        });
      const remaining = all.slice(0, MAX_RESULTS - recentEntries.length);
      return {
        entries: [...recentEntries, ...remaining],
        totalCount: all.length + recentEntries.length,
        hasRecent: recentEntries.length > 0,
        ambiguousEntries: [],
      };
    }
    const scored: Array<[ScopedTokenCandidate, number]> = [];
    const ambiguousScored: Array<[ScopedTokenCandidate, number]> = [];
    for (const candidate of candidates) {
      if (filterType && candidate.entry.$type !== filterType) {
        continue;
      }
      const score = fuzzyScore(q, candidate.path);
      if (score < 0) {
        continue;
      }
      if (
        candidate.isAmbiguousPath &&
        candidate.collectionId !== preferredCollectionId
      ) {
        ambiguousScored.push([candidate, score]);
      } else {
        const preferredBoost =
          candidate.collectionId === preferredCollectionId ? 1000 : 0;
        scored.push([candidate, score + preferredBoost]);
      }
    }
    scored.sort((a, b) => b[1] - a[1]);
    ambiguousScored.sort((a, b) => b[1] - a[1]);
    const selectablePaths = new Set(
      scored.map(([candidate]) => candidate.path),
    );
    const seenAmbiguousPaths = new Set<string>();
    const ambiguousMatches: ScopedTokenCandidate[] = [];
    for (const [candidate] of ambiguousScored) {
      if (
        seenAmbiguousPaths.has(candidate.path) ||
        selectablePaths.has(candidate.path)
      ) {
        continue;
      }
      seenAmbiguousPaths.add(candidate.path);
      ambiguousMatches.push(candidate);
      if (ambiguousMatches.length >= MAX_AMBIGUOUS_RESULTS) {
        break;
      }
    }
    return {
      entries: scored.slice(0, MAX_RESULTS).map(([candidate]) => candidate),
      totalCount: scored.length,
      hasRecent: false,
      ambiguousEntries: ambiguousMatches,
    };
  }, [candidates, query, filterType, preferredCollectionId]);

  const getAmbiguousCollectionLabel = useCallback(
    (path: string): string => {
      const collectionIds =
        collectionIdsByPath[path] ??
        candidates
          .filter((candidate) => candidate.path === path)
          .map((candidate) => candidate.collectionId)
          .filter(Boolean);
      const uniqueIds = [...new Set(collectionIds)];
      if (uniqueIds.length === 0) {
        return "multiple collections";
      }
      const labels = uniqueIds.map((collectionId) =>
        getCollectionDisplayName(collectionId, collectionDisplayNames),
      );
      if (uniqueIds.length <= 3) {
        return labels.join(", ");
      }
      return `${labels.slice(0, 3).join(", ")} and ${uniqueIds.length - 3} more`;
    },
    [candidates, collectionDisplayNames, collectionIdsByPath],
  );

  const getCollectionLabel = useCallback(
    (collectionId: string): string =>
      getCollectionDisplayName(collectionId, collectionDisplayNames),
    [collectionDisplayNames],
  );

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx(i => clampListIndex(i + 1, entries.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx(i => clampListIndex(i - 1, entries.length));
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

  if (entries.length === 0 && ambiguousEntries.length === 0) {
    return (
      <div className="absolute z-50 mt-1 left-0 right-0 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-[var(--shadow-popover)] py-2 px-3 text-secondary text-[color:var(--color-figma-text-secondary)]">
        No matching {filterType ? `${filterType} ` : ""}tokens. Create the target token first, or keep typing to find another reference.
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      className="absolute z-50 mt-1 left-0 right-0 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-[var(--shadow-popover)] overflow-y-auto max-h-48"
    >
      {hasRecent && !query.trim() && (
        <div className="px-2 py-1 text-secondary font-medium text-[color:var(--color-figma-text-tertiary)]">
          Recent
        </div>
      )}
      {entries.length === 0 && ambiguousEntries.length > 0 ? (
        <div className="px-2 py-2 text-secondary text-[color:var(--color-figma-text-secondary)]">
          Matching paths exist in more than one collection. References need a token path that belongs to one collection.
        </div>
      ) : null}
      {entries.map((candidate, idx) => {
        const { path, entry, resolvedEntry: resolved } = candidate;
        const isAliasToken = isAlias(entry.$value);
        const previewValue = formatTokenValuePreview(resolved.$value);
        const rawPreview = isAliasToken ? formatTokenValuePreview(entry.$value) : '';
        const showCollectionContext =
          candidate.isAmbiguousPath ||
          Boolean(
            candidate.collectionId &&
            preferredCollectionId &&
            candidate.collectionId !== preferredCollectionId,
          );
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
            <span className={`min-w-0 text-secondary text-[color:var(--color-figma-text)] truncate ${entry.$lifecycle === 'deprecated' ? 'line-through' : ''}`}>{path}</span>
            <div />
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-secondary text-[color:var(--color-figma-text-secondary)]">
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
              <span className={`shrink-0 rounded px-1 py-0.5 text-[var(--font-size-xs)] font-medium uppercase ${tokenTypeBadgeClass(entry.$type)}`}>
                {entry.$type}
              </span>
              {entry.$lifecycle === 'draft' && (
                <span className="shrink-0 rounded bg-[var(--color-figma-warning)]/15 px-1 py-0.5 text-[var(--font-size-xs)] font-medium text-[color:var(--color-figma-text-warning)]">draft</span>
              )}
              {entry.$lifecycle === 'deprecated' && (
                <span className="shrink-0 rounded bg-[var(--color-figma-text-tertiary)]/20 px-1 py-0.5 text-[var(--font-size-xs)] font-medium text-[color:var(--color-figma-text-secondary)]">deprecated</span>
              )}
              {showCollectionContext ? (
                <span className="min-w-0 truncate text-[color:var(--color-figma-text-tertiary)]">
                  in {getCollectionLabel(candidate.collectionId)}
                </span>
              ) : null}
            </div>
          </div>
        </button>
        );
      })}
      {ambiguousEntries.length > 0 ? (
        <div className="border-t border-[var(--color-figma-border)] py-1">
          <div className="px-2 py-1 text-secondary font-medium text-[color:var(--color-figma-text-tertiary)]">
            Needs a unique path
          </div>
          {ambiguousEntries.map((candidate) => (
            <div
              key={`ambiguous:${candidate.path}`}
              className="px-2 py-1.5 text-left opacity-70"
              aria-disabled="true"
            >
              <div className="grid min-w-0 grid-cols-[12px_minmax(0,1fr)] gap-x-2 gap-y-0.5">
                <div className="h-3 w-3" />
                <span className="min-w-0 truncate text-secondary text-[color:var(--color-figma-text)]">
                  {candidate.path}
                </span>
                <div />
                <span className="min-w-0 text-secondary text-[color:var(--color-figma-text-secondary)]">
                  Exists in {getAmbiguousCollectionLabel(candidate.path)}. Rename one target or choose a same-collection token.
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {totalCount > MAX_RESULTS && (
        <div className="px-2 py-1 text-secondary text-[color:var(--color-figma-text-secondary)] border-t border-[var(--color-figma-border)] text-center">
          Showing {MAX_RESULTS} of {totalCount} matches — refine your search
        </div>
      )}
    </div>
  );
}
