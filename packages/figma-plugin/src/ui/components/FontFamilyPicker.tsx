import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { inputClass } from '../shared/editorClasses';

interface FontFamilyPickerProps {
  value: string;
  onChange: (v: string) => void;
  availableFonts: string[];
  autoFocus?: boolean;
  placeholder?: string;
  className?: string;
}

const MAX_VISIBLE = 80;

/**
 * Searchable font family combobox with live preview.
 * When availableFonts is empty (standalone mode), falls back to a plain text input.
 */
export function FontFamilyPicker({ value, onChange, availableFonts, autoFocus, placeholder, className }: FontFamilyPickerProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Use query while editing, otherwise show current value
  const displayValue = open ? query : (value || '');

  const filtered = useMemo(() => {
    if (!availableFonts.length) return [];
    const q = query.toLowerCase().trim();
    if (!q) return availableFonts.slice(0, MAX_VISIBLE);
    const exact: string[] = [];
    const startsWith: string[] = [];
    const contains: string[] = [];
    for (const f of availableFonts) {
      const lower = f.toLowerCase();
      if (lower === q) exact.push(f);
      else if (lower.startsWith(q)) startsWith.push(f);
      else if (lower.includes(q)) contains.push(f);
      if (exact.length + startsWith.length + contains.length >= MAX_VISIBLE) break;
    }
    return [...exact, ...startsWith, ...contains];
  }, [availableFonts, query]);

  // Reset highlight when filter changes
  useEffect(() => {
    setHighlightIdx(0);
  }, [filtered.length, query]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!open || !listRef.current) return;
    const item = listRef.current.children[highlightIdx] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [highlightIdx, open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const selectFont = useCallback((family: string) => {
    onChange(family);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  }, [onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!open || !filtered.length) {
      if (e.key === 'ArrowDown' && availableFonts.length) {
        e.preventDefault();
        setQuery(value || '');
        setOpen(true);
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIdx(i => Math.min(i + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIdx(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filtered[highlightIdx]) {
          selectFont(filtered[highlightIdx]);
        } else if (query.trim()) {
          // Allow custom font name
          selectFont(query.trim());
        }
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        setQuery('');
        break;
      case 'Tab':
        setOpen(false);
        setQuery('');
        break;
    }
  }, [open, filtered, highlightIdx, selectFont, query, value, availableFonts.length]);

  // Plain text fallback when no fonts available
  if (!availableFonts.length) {
    return (
      <input
        type="text"
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder || 'Inter, system-ui, sans-serif'}
        autoFocus={autoFocus}
        className={className || inputClass}
      />
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          onChange={e => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            setQuery(value || '');
            setOpen(true);
          }}
          onBlur={() => {
            // Delay to allow click on dropdown item
            setTimeout(() => {
              if (!containerRef.current?.contains(document.activeElement)) {
                setOpen(false);
                setQuery('');
              }
            }, 150);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || 'Search fonts…'}
          autoFocus={autoFocus}
          className={className || inputClass}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
        />
        {/* Small chevron indicator */}
        <svg
          className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--color-figma-text-secondary)]"
          width="8" height="8" viewBox="0 0 8 8" fill="currentColor"
        >
          <path d="M1 2.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {open && filtered.length > 0 && (
        <div
          ref={listRef}
          className="absolute z-50 left-0 right-0 mt-0.5 max-h-[200px] overflow-y-auto rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] shadow-lg"
          role="listbox"
        >
          {filtered.map((family, i) => (
            <button
              key={family}
              type="button"
              role="option"
              aria-selected={i === highlightIdx}
              className={`w-full text-left px-2 py-1.5 text-body flex items-center gap-2 cursor-pointer transition-colors ${
                i === highlightIdx
                  ? 'bg-[var(--color-figma-accent)] text-white'
                  : family === value
                    ? 'bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-text)]'
                    : 'text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'
              }`}
              onMouseEnter={() => setHighlightIdx(i)}
              onMouseDown={e => {
                e.preventDefault(); // Prevent blur
                selectFont(family);
              }}
            >
              <span
                className="shrink-0 w-[28px] text-center text-subheading leading-none overflow-hidden"
                style={{ fontFamily: family }}
                aria-hidden="true"
              >
                Aa
              </span>
              <span className="truncate">{family}</span>
              {family === value && (
                <svg className="ml-auto shrink-0" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              )}
            </button>
          ))}
          {filtered.length >= MAX_VISIBLE && (
            <div className="px-2 py-1 text-secondary text-[var(--color-figma-text-tertiary)] text-center">
              Type to narrow results…
            </div>
          )}
        </div>
      )}

      {open && query.trim() && filtered.length === 0 && (
        <div className="absolute z-50 left-0 right-0 mt-0.5 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] shadow-lg p-2">
          <div className="text-secondary text-[var(--color-figma-text-secondary)] mb-1">No matching fonts</div>
          <button
            type="button"
            className="w-full text-left px-2 py-1 text-body rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text)]"
            onMouseDown={e => {
              e.preventDefault();
              selectFont(query.trim());
            }}
          >
            Use "<span style={{ fontFamily: query.trim() }}>{query.trim()}</span>"
          </button>
        </div>
      )}
    </div>
  );
}
