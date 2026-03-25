import { useEffect, useRef, useState } from 'react';
import type { TokenMapEntry } from '../../shared/types';

interface AliasAutocompleteProps {
  query: string; // text typed after '{'
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToSet?: Record<string, string>;
  filterType?: string;
  onSelect: (path: string) => void;
  onClose: () => void;
}

const MAX_RESULTS = 24;

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

  const q = query.toLowerCase();
  const entries = Object.entries(allTokensFlat)
    .filter(([path, entry]) => {
      if (filterType && entry.$type !== filterType) return false;
      return !q || path.toLowerCase().includes(q);
    })
    .slice(0, MAX_RESULTS);

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
          className={`w-full flex items-center gap-2 px-2 py-1.5 text-left transition-colors ${idx === activeIdx ? 'bg-[var(--color-figma-bg-hover)]' : ''}`}
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
          <span className="flex-1 text-[10px] text-[var(--color-figma-text)] truncate">{path}</span>

          {/* Type badge */}
          <span className={`text-[8px] px-1 py-0.5 rounded font-medium uppercase shrink-0 token-type-${entry.$type}`}>
            {entry.$type}
          </span>

          {/* Set name */}
          {pathToSet[path] && (
            <span className="text-[8px] text-[var(--color-figma-text-secondary)] shrink-0">
              {pathToSet[path]}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
