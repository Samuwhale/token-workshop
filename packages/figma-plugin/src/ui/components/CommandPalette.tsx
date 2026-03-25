import { useState, useEffect, useRef, useMemo } from 'react';

// ---------------------------------------------------------------------------
// Fuzzy match — simple character-subsequence scoring
// ---------------------------------------------------------------------------

function fuzzyScore(query: string, target: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  let score = 0;
  let lastMatch = -1;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += lastMatch === ti - 1 ? 2 : 1; // bonus for consecutive
      lastMatch = ti;
      qi++;
    }
  }
  return qi === q.length ? score : 0;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Command {
  id: string;
  label: string;
  description?: string;
  handler: () => void;
}

interface CommandPaletteProps {
  commands: Command[];
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CommandPalette({ commands, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    return commands
      .map(cmd => ({
        cmd,
        score: Math.max(
          fuzzyScore(query, cmd.label),
          cmd.description ? fuzzyScore(query, cmd.description) : 0,
        ),
      }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ cmd }) => cmd);
  }, [query, commands]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  const execute = (cmd: Command) => {
    onClose();
    cmd.handler();
  };

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
      const cmd = filtered[activeIdx];
      if (cmd) execute(cmd);
    }
  };

  // Scroll active item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const active = list.children[activeIdx] as HTMLElement | undefined;
    active?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

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
        aria-label="Command palette"
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
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search commands…"
            aria-label="Search commands"
            aria-autocomplete="list"
            className="flex-1 bg-transparent outline-none text-[12px] text-[var(--color-figma-text)] placeholder-[var(--color-figma-text-secondary)]"
          />
          <kbd className="text-[9px] text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] rounded px-1 py-0.5">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="overflow-y-auto flex-1" role="listbox" aria-label="Commands">
          {filtered.length === 0 && (
            <div className="px-3 py-6 text-center text-[11px] text-[var(--color-figma-text-secondary)]">No commands match "{query}"</div>
          )}
          {filtered.map((cmd, idx) => (
            <button
              key={cmd.id}
              role="option"
              aria-selected={idx === activeIdx}
              className={`w-full text-left px-3 py-2 flex flex-col gap-0 transition-colors ${idx === activeIdx ? 'bg-[var(--color-figma-accent)] text-white' : 'text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'}`}
              onMouseEnter={() => setActiveIdx(idx)}
              onClick={() => execute(cmd)}
            >
              <span className="text-[11px] font-medium">{cmd.label}</span>
              {cmd.description && (
                <span className={`text-[10px] ${idx === activeIdx ? 'text-white/70' : 'text-[var(--color-figma-text-secondary)]'}`}>
                  {cmd.description}
                </span>
              )}
            </button>
          ))}
        </div>

        {filtered.length > 0 && (
          <div className="px-3 py-1.5 border-t border-[var(--color-figma-border)] flex gap-3 text-[9px] text-[var(--color-figma-text-secondary)]">
            <span>↑↓ navigate</span>
            <span>↵ select</span>
            <span>ESC close</span>
          </div>
        )}
      </div>
    </div>
  );
}
