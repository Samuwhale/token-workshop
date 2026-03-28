import { useState, useRef, useEffect, useMemo } from 'react';
import type { TokenMapEntry } from '../../shared/types';
import { fuzzyScore } from '../shared/fuzzyMatch';

interface RemapAutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  tokenMap: Record<string, TokenMapEntry>;
}

const MAX_SUGGESTIONS = 16;

export function RemapAutocompleteInput({
  value,
  onChange,
  placeholder,
  tokenMap,
}: RemapAutocompleteInputProps) {
  const [focused, setFocused] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(() => {
    const q = value.trim();
    if (!q) return [];
    const scored: [string, TokenMapEntry, number][] = [];
    for (const [path, entry] of Object.entries(tokenMap)) {
      const score = fuzzyScore(q, path);
      if (score >= 0) scored.push([path, entry, score]);
    }
    scored.sort((a, b) => b[2] - a[2]);
    return scored.slice(0, MAX_SUGGESTIONS).map(([p, e]) => [p, e] as [string, TokenMapEntry]);
  }, [tokenMap, value]);

  const showDropdown = focused && value.trim().length > 0 && suggestions.length > 0;

  useEffect(() => {
    setSelectedIdx(-1);
  }, [value]);

  // Scroll active item into view
  useEffect(() => {
    if (selectedIdx >= 0) {
      const el = listRef.current?.querySelector(`[data-ridx="${selectedIdx}"]`) as HTMLElement | null;
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIdx]);

  const selectItem = (path: string) => {
    onChange(path);
    setFocused(false);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = selectedIdx >= 0 ? suggestions[selectedIdx] : suggestions[0];
      if (target) selectItem(target[0]);
    } else if (e.key === 'Escape') {
      setFocused(false);
    }
  };

  return (
    <div className="relative flex-1 min-w-0">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          // Delay to allow mousedown on suggestions
          setTimeout(() => setFocused(false), 150);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full px-1.5 py-0.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[9px] font-mono outline-none focus:border-[var(--color-figma-accent)]"
      />
      {showDropdown && (
        <div
          ref={listRef}
          className="absolute z-50 mt-0.5 left-0 right-0 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-lg overflow-y-auto max-h-[140px]"
        >
          {suggestions.map(([path, entry], idx) => {
            const isSelected = idx === selectedIdx;
            return (
              <button
                key={path}
                data-ridx={idx}
                onMouseDown={e => { e.preventDefault(); selectItem(path); }}
                onMouseEnter={() => setSelectedIdx(idx)}
                className={`w-full flex items-center gap-1.5 px-1.5 py-1 text-left transition-colors ${isSelected ? 'bg-[var(--color-figma-bg-hover)]' : ''}`}
              >
                {entry.$type === 'color' && typeof entry.$value === 'string' && entry.$value.startsWith('#') ? (
                  <div
                    className="w-2.5 h-2.5 rounded-sm border border-[var(--color-figma-border)] shrink-0"
                    style={{ backgroundColor: entry.$value }}
                  />
                ) : (
                  <div className="w-2.5 h-2.5 shrink-0 flex items-center justify-center">
                    <div className="w-1 h-1 rounded-full bg-[var(--color-figma-text-secondary)]/40" />
                  </div>
                )}
                <span className="flex-1 text-[9px] font-mono text-[var(--color-figma-text)] truncate">{path}</span>
                <span className="text-[7px] text-[var(--color-figma-text-secondary)] shrink-0">{entry.$type}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
