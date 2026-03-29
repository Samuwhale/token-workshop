import { useState, useEffect, useRef } from 'react';

interface SetSwitcherProps {
  sets: string[];
  activeSet: string;
  onSelect: (set: string) => void;
  onClose: () => void;
}

function fuzzyMatch(query: string, target: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

export function SetSwitcher({ sets, activeSet, onSelect, onClose }: SetSwitcherProps) {
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(() => {
    const idx = sets.indexOf(activeSet);
    return idx >= 0 ? idx : 0;
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const filtered = query
    ? sets.filter(s => fuzzyMatch(query, s))
    : sets;

  useEffect(() => {
    // When query changes, reset to first result (or keep active set visible)
    const idx = filtered.indexOf(activeSet);
    setActiveIdx(idx >= 0 ? idx : 0);
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll active item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const items = list.querySelectorAll('[data-set-item]');
    const active = items[activeIdx] as HTMLElement | undefined;
    active?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const set = filtered[activeIdx];
      if (set) { onSelect(set); onClose(); }
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 pt-16"
      onClick={onClose}
    >
      <div
        className="bg-[var(--color-figma-bg)] rounded border border-[var(--color-figma-border)] shadow-2xl w-full mx-3 flex flex-col"
        style={{ maxHeight: '60vh' }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Switch token set"
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--color-figma-border)]">
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-[var(--color-figma-text-secondary)] shrink-0">
            <circle cx="6" cy="6" r="4" />
            <path d="M9 9l3 3" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); }}
            onKeyDown={handleKeyDown}
            placeholder="Switch to set…"
            aria-label="Filter token sets"
            className="flex-1 bg-transparent outline-none text-[12px] text-[var(--color-figma-text)] placeholder-[var(--color-figma-text-secondary)]"
          />
          <kbd className="text-[10px] text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] rounded px-1 py-0.5 shrink-0">
            ESC
          </kbd>
        </div>

        {/* Set list */}
        <div ref={listRef} className="overflow-y-auto flex-1" role="listbox" aria-label="Token sets">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-[11px] text-[var(--color-figma-text-secondary)] text-center">
              No sets match &ldquo;{query}&rdquo;
            </div>
          ) : (
            filtered.map((set, i) => {
              const isCurrent = set === activeSet;
              const isHighlighted = i === activeIdx;
              return (
                <button
                  key={set}
                  data-set-item
                  onClick={() => { onSelect(set); onClose(); }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-left text-[12px] transition-colors ${isHighlighted ? 'bg-[var(--color-figma-bg-hover)]' : 'hover:bg-[var(--color-figma-bg-hover)]'}`}
                  role="option"
                  aria-selected={isCurrent}
                >
                  <span className={isCurrent ? 'text-[var(--color-figma-accent)]' : 'text-[var(--color-figma-text)]'}>
                    {set}
                  </span>
                  {isCurrent && (
                    <span className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0">active</span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-3 py-1.5 border-t border-[var(--color-figma-border)] text-[10px] text-[var(--color-figma-text-secondary)]">
          {filtered.length === sets.length ? `${sets.length} set${sets.length !== 1 ? 's' : ''}` : `${filtered.length} of ${sets.length} sets`}
          <span className="ml-2 opacity-60">↑↓ navigate · ↵ switch</span>
        </div>
      </div>
    </div>
  );
}
