import { useEffect, useMemo, useRef, useState } from 'react';
import type { BindableProperty, NodeCapabilities } from '../../shared/types';
import { PROPERTY_LABELS } from '../../shared/types';

interface PropertyPickerProps {
  properties: BindableProperty[];
  capabilities: NodeCapabilities | null;
  onSelect: (property: BindableProperty) => void;
  onClose: () => void;
  anchorRect?: { top: number; left: number };
}

const CAPABILITY_FILTER: Partial<Record<BindableProperty, keyof NodeCapabilities>> = {
  fill: 'hasFills',
  stroke: 'hasStrokes',
  paddingTop: 'hasAutoLayout',
  paddingRight: 'hasAutoLayout',
  paddingBottom: 'hasAutoLayout',
  paddingLeft: 'hasAutoLayout',
  itemSpacing: 'hasAutoLayout',
  typography: 'isText',
  shadow: 'hasEffects',
};

/** Minimum number of capability-filtered properties before the search input is shown. */
const SEARCH_THRESHOLD = 6;

export function PropertyPicker({ properties, capabilities, onSelect, onClose, anchorRect }: PropertyPickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(0);

  // Properties filtered by node capabilities
  const capFiltered = useMemo(
    () =>
      properties.filter(prop => {
        if (!capabilities) return true;
        const cap = CAPABILITY_FILTER[prop];
        return !cap || capabilities[cap];
      }),
    [properties, capabilities],
  );

  const showSearch = capFiltered.length >= SEARCH_THRESHOLD;

  // Further filter by search query
  const filtered = useMemo(() => {
    if (!query) return capFiltered;
    const q = query.toLowerCase();
    return capFiltered.filter(prop => PROPERTY_LABELS[prop].toLowerCase().includes(q));
  }, [capFiltered, query]);

  // Reset highlight when filtered list changes
  useEffect(() => {
    setHighlightIdx(0);
  }, [filtered.length]);

  // Auto-focus the search input when shown
  useEffect(() => {
    if (showSearch) {
      inputRef.current?.focus();
    }
  }, [showSearch]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx(i => (i + 1) % filtered.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx(i => (i - 1 + filtered.length) % filtered.length);
    } else if (e.key === 'Enter' && filtered.length > 0) {
      e.preventDefault();
      onSelect(filtered[highlightIdx]);
    }
  };

  const clampedAnchor = anchorRect
    ? {
        top: Math.max(8, Math.min(anchorRect.top, window.innerHeight - 80)),
        left: Math.max(8, Math.min(anchorRect.left, window.innerWidth - 156)),
      }
    : undefined;

  if (capFiltered.length === 0) {
    return (
      <div
        ref={ref}
        className="fixed z-50 max-w-[calc(100vw-16px)] bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] rounded shadow-lg p-2 text-secondary text-[var(--color-figma-text-secondary)]"
        style={clampedAnchor}
      >
        No applicable properties for this layer
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] rounded shadow-lg py-1 min-w-[140px] max-w-[calc(100vw-16px)]"
      style={clampedAnchor}
      onKeyDown={handleKeyDown}
    >
      <div className="px-2 py-1 text-secondary text-[var(--color-figma-text-secondary)] font-medium">
        Apply to property
      </div>
      {showSearch && (
        <div className="px-2 pb-1">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Filter properties\u2026"
            aria-label="Filter properties"
            className="w-full px-1.5 py-1 text-body bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] rounded text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-tertiary)] focus-visible:border-[var(--color-figma-accent)]"
          />
        </div>
      )}
      {filtered.length === 0 ? (
        <div className="px-2 py-1.5 text-secondary text-[var(--color-figma-text-secondary)]">
          No matching properties
        </div>
      ) : (
        filtered.map((prop, idx) => (
          <button
            key={prop}
            onClick={() => onSelect(prop)}
            className={`w-full text-left px-2 py-1.5 text-body text-[var(--color-figma-text)] transition-colors ${
              idx === highlightIdx
                ? 'bg-[var(--color-figma-bg-selected)] text-[var(--color-figma-text-onselected)]'
                : 'hover:bg-[var(--color-figma-bg-hover)]'
            }`}
          >
            {PROPERTY_LABELS[prop]}
          </button>
        ))
      )}
    </div>
  );
}
