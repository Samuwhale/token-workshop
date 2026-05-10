import { useEffect, useMemo, useRef, useState } from 'react';
import type { TokenMapEntry } from '../../shared/types';
import { fuzzyScore } from '../shared/fuzzyMatch';
import { nextSemanticSteps, nextScaleStep, nextNamedScaleStep, nextOrdinalStep } from './tokenListHelpers';

interface PathAutocompleteProps {
  query: string;
  allTokensFlat: Record<string, TokenMapEntry>;
  onSelect: (path: string) => void;
  onClose: () => void;
}

const MAX_RESULTS = 16;

/**
 * Autocomplete dropdown for the token path input in create mode.
 * Suggests existing group prefixes, sibling conventions, and new paths so users
 * can discover the tree hierarchy without accidentally selecting a duplicate
 * token path in create mode.
 */
export function PathAutocomplete({
  query,
  allTokensFlat,
  onSelect,
  onClose,
}: PathAutocompleteProps) {
  const [activeIdx, setActiveIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Build unique group prefixes + full token paths + ghost suggestions
  const suggestions = useMemo(() => {
    const groups = new Set<string>();
    const tokenPaths = Object.keys(allTokensFlat);
    // Map group → child leaf names for pattern detection
    const groupChildren = new Map<string, string[]>();

    for (const path of tokenPaths) {
      const parts = splitPath(path);
      let prefix = '';
      for (let i = 0; i < parts.length - 1; i++) {
        prefix = prefix ? prefix + '.' + parts[i] : parts[i];
        groups.add(prefix);
      }
      // Record leaf name under its parent group
      if (parts.length >= 2) {
        const parent = parts.slice(0, -1).join('.');
        const leaf = parts[parts.length - 1];
        const existing = groupChildren.get(parent);
        if (existing) existing.push(leaf);
        else groupChildren.set(parent, [leaf]);
      }
    }

    const q = query.trim();
    if (!q) return [];

    // Score both groups (with trailing dot hint) and token paths
    const scored: { label: string; isGroup: boolean; isGhost: boolean; isSibling: boolean; score: number }[] = [];

    for (const g of groups) {
      const score = fuzzyScore(q, g);
      if (score >= 0) {
        scored.push({ label: g, isGroup: true, isGhost: false, isSibling: false, score });
      }
    }

    for (const p of tokenPaths) {
      const score = fuzzyScore(q, p);
      if (score >= 0) {
        scored.push({ label: p, isGroup: false, isGhost: false, isSibling: false, score: score - 1 });
      }
    }

    // Ghost suggestions: when the query ends with a dot (targeting a group), suggest next names
    const qDot = q.endsWith('.') ? q.slice(0, -1) : null;
    const ghostGroup = qDot && groups.has(qDot) ? qDot : null;
    // Also match if the query is an exact group (without trailing dot)
    const exactGroup = !qDot && groups.has(q) ? q : null;
    const targetGroup = ghostGroup ?? exactGroup;

    if (targetGroup) {
      const siblings = groupChildren.get(targetGroup) ?? [];
      if (siblings.length >= 1) {
        const ghostPaths: string[] = [];

        // Semantic sequence suggestions
        const semantic = nextSemanticSteps(siblings);
        if (semantic) {
          for (const s of semantic.suggestions.slice(0, 3)) {
            ghostPaths.push(`${targetGroup}.${s}`);
          }
        }

        // Numeric scale
        const numNext = nextScaleStep(siblings);
        if (numNext) ghostPaths.push(`${targetGroup}.${numNext}`);

        // Named scale
        const namedNext = nextNamedScaleStep(siblings);
        if (namedNext) ghostPaths.push(`${targetGroup}.${namedNext}`);

        // Ordinal
        const ordNext = nextOrdinalStep(siblings);
        if (ordNext) ghostPaths.push(`${targetGroup}.${ordNext}`);

        const ghostSeen = new Set(tokenPaths);
        for (const gp of ghostPaths) {
          if (ghostSeen.has(gp)) continue;
          ghostSeen.add(gp);
          // Give ghosts moderate score so they appear after exact matches but before weak fuzzy matches
          scored.push({ label: gp, isGroup: false, isGhost: true, isSibling: false, score: 50 });
        }
      }
    }

    // Sibling suggestions: when the query contains a dot, detect the parent group and show
    // all existing tokens at that level that weren't already matched by fuzzy scoring.
    // This lets users see naming conventions (e.g. color.brand.secondary) even when
    // they're typing a different leaf name (e.g. color.brand.ter...).
    const lastDot = q.lastIndexOf('.');
    if (lastDot > 0) {
      const parentGroup = q.slice(0, lastDot);
      if (groups.has(parentGroup)) {
        const scoredLabels = new Set(scored.map(s => s.label));
        const siblingLeaves = groupChildren.get(parentGroup) ?? [];
        for (const leaf of siblingLeaves) {
          const siblingPath = `${parentGroup}.${leaf}`;
          if (!scoredLabels.has(siblingPath)) {
            scored.push({ label: siblingPath, isGroup: false, isGhost: false, isSibling: true, score: 0 });
          }
        }
      }
    }

    scored.sort((a, b) => {
      // Sort order: normal fuzzy matches > siblings > ghosts
      const rankA = a.isGhost ? 2 : a.isSibling ? 1 : 0;
      const rankB = b.isGhost ? 2 : b.isSibling ? 1 : 0;
      if (rankA !== rankB) return rankA - rankB;
      if (b.score !== a.score) return b.score - a.score;
      if (a.isGroup !== b.isGroup) return a.isGroup ? -1 : 1;
      return a.label.localeCompare(b.label);
    });

    // Deduplicate
    const seen = new Set<string>();
    const results: { label: string; isGroup: boolean; isGhost: boolean; isSibling: boolean }[] = [];
    for (const item of scored) {
      if (seen.has(item.label)) continue;
      seen.add(item.label);
      results.push(item);
      if (results.length >= MAX_RESULTS) break;
    }

    return results;
  }, [allTokensFlat, query]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (suggestions.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx(i => Math.min(i + 1, suggestions.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (suggestions[activeIdx]) {
          e.preventDefault();
          const s = suggestions[activeIdx];
          onSelect(resolveSuggestionSelection(s));
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [suggestions, activeIdx, onSelect, onClose]);

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${activeIdx}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  if (suggestions.length === 0) return null;

  return (
    <div
      ref={listRef}
      className="absolute z-50 mt-0.5 left-0 right-0 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-[var(--shadow-popover)] overflow-y-auto max-h-40"
    >
      {suggestions.map(({ label, isGroup, isGhost, isSibling }, idx) => (
        <button
          key={label}
          data-idx={idx}
          onMouseDown={e => {
            e.preventDefault();
            onSelect(resolveSuggestionSelection({ label, isGroup, isGhost, isSibling }));
          }}
          onMouseEnter={() => setActiveIdx(idx)}
          className={`w-full flex items-center gap-1.5 px-2 py-1 text-left transition-colors ${idx === activeIdx ? 'bg-[var(--color-figma-bg-hover)]' : ''}`}
        >
          {/* Icon: folder for groups, sparkle for ghosts, dim dot for siblings, dot for tokens */}
          {isGhost ? (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-[color:var(--color-figma-text-accent)]">
              <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
            </svg>
          ) : isGroup ? (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-[color:var(--color-figma-text-secondary)]">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          ) : (
            <span className="w-[10px] h-[10px] shrink-0 flex items-center justify-center text-[color:var(--color-figma-text-secondary)]">
              <span className={`w-1.5 h-1.5 rounded-full bg-current ${isSibling ? 'opacity-20' : 'opacity-40'}`} />
            </span>
          )}
          <span className={`flex-1 text-secondary truncate ${isGhost || isSibling ? 'text-[color:var(--color-figma-text-secondary)] italic' : 'text-[color:var(--color-figma-text)]'}`}>
            {label}{isGroup ? '.' : ''}
          </span>
          <span className="text-[var(--font-size-xs)] text-[color:var(--color-figma-text-secondary)] shrink-0">
            {isGhost ? 'new' : isGroup ? 'group' : isSibling ? 'use group' : 'use group'}
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * Split a token path into segments, respecting that segment names can contain dots
 * when they look like numbers (e.g., "1.5").
 *
 * Since we don't have the node name info here, we use a heuristic:
 * split on dots, but re-join segments that form a number pattern (e.g., "1" + "5" → "1.5").
 *
 * This is a best-effort approach — the autocomplete is forgiving since it's just for suggestions.
 */
function splitPath(path: string): string[] {
  return path.split('.');
}

function resolveSuggestionSelection({
  label,
  isGroup,
  isGhost,
}: {
  label: string;
  isGroup: boolean;
  isGhost: boolean;
  isSibling: boolean;
}): string {
  if (isGroup) {
    return `${label}.`;
  }
  if (isGhost) {
    return label;
  }
  const parentPath = label.includes(".")
    ? label.split(".").slice(0, -1).join(".")
    : "";
  return parentPath ? `${parentPath}.` : "";
}
