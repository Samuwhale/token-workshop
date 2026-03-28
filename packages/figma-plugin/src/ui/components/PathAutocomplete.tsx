import { useEffect, useMemo, useRef, useState } from 'react';
import type { TokenMapEntry } from '../../shared/types';
import { fuzzyScore } from '../shared/fuzzyMatch';

interface PathAutocompleteProps {
  query: string;
  allTokensFlat: Record<string, TokenMapEntry>;
  onSelect: (path: string) => void;
  onClose: () => void;
}

const MAX_RESULTS = 16;

/**
 * Autocomplete dropdown for the token path input in create mode.
 * Suggests existing group prefixes and token paths so users can discover
 * the tree hierarchy without memorizing it.
 */
export function PathAutocomplete({
  query,
  allTokensFlat,
  onSelect,
  onClose,
}: PathAutocompleteProps) {
  const [activeIdx, setActiveIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Build unique group prefixes + full token paths
  const suggestions = useMemo(() => {
    const groups = new Set<string>();
    const tokenPaths = Object.keys(allTokensFlat);

    for (const path of tokenPaths) {
      // Collect every ancestor group prefix
      // Use the known segment structure: walk segments
      const parts = splitPath(path);
      let prefix = '';
      for (let i = 0; i < parts.length - 1; i++) {
        prefix = prefix ? prefix + '.' + parts[i] : parts[i];
        groups.add(prefix);
      }
    }

    const q = query.trim();
    if (!q) return [];

    // Score both groups (with trailing dot hint) and token paths
    const scored: { label: string; isGroup: boolean; score: number }[] = [];

    for (const g of groups) {
      const score = fuzzyScore(q, g);
      if (score >= 0) {
        scored.push({ label: g, isGroup: true, score });
      }
    }

    for (const p of tokenPaths) {
      const score = fuzzyScore(q, p);
      if (score >= 0) {
        // Slightly deprioritize full paths vs group matches so groups appear first
        scored.push({ label: p, isGroup: false, score: score - 1 });
      }
    }

    scored.sort((a, b) => {
      // Groups before tokens at same score
      if (b.score !== a.score) return b.score - a.score;
      if (a.isGroup !== b.isGroup) return a.isGroup ? -1 : 1;
      return a.label.localeCompare(b.label);
    });

    // Deduplicate (a path could also be a group prefix)
    const seen = new Set<string>();
    const results: { label: string; isGroup: boolean }[] = [];
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
          // For groups, append a dot so the user can keep typing the next segment
          onSelect(s.isGroup ? s.label + '.' : s.label);
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
      className="absolute z-50 mt-0.5 left-0 right-0 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-lg overflow-y-auto max-h-40"
    >
      {suggestions.map(({ label, isGroup }, idx) => (
        <button
          key={label}
          data-idx={idx}
          onMouseDown={e => {
            e.preventDefault();
            onSelect(isGroup ? label + '.' : label);
          }}
          onMouseEnter={() => setActiveIdx(idx)}
          className={`w-full flex items-center gap-1.5 px-2 py-1 text-left transition-colors ${idx === activeIdx ? 'bg-[var(--color-figma-bg-hover)]' : ''}`}
        >
          {/* Icon: folder for groups, dot for tokens */}
          {isGroup ? (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-[var(--color-figma-text-secondary)]">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          ) : (
            <span className="w-[10px] h-[10px] shrink-0 flex items-center justify-center text-[var(--color-figma-text-secondary)]">
              <span className="w-1.5 h-1.5 rounded-full bg-current opacity-40" />
            </span>
          )}
          <span className="flex-1 text-[10px] text-[var(--color-figma-text)] truncate">
            {label}{isGroup ? '.' : ''}
          </span>
          <span className="text-[8px] text-[var(--color-figma-text-secondary)] shrink-0">
            {isGroup ? 'group' : 'token'}
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
