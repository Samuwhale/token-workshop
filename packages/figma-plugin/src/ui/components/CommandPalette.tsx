import { useState, useEffect, useRef, useMemo } from 'react';
import { STORAGE_KEYS, lsGetJson, lsSet } from '../shared/storage';
import { parseStructuredQuery, QUERY_QUALIFIERS } from './tokenListUtils';
import type { ParsedQuery } from './tokenListUtils';

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
// Recent actions — persist to localStorage
// ---------------------------------------------------------------------------

const RECENT_MAX = 5;

interface RecentEntry { id: string; label: string }

function loadRecent(): RecentEntry[] {
  return lsGetJson<RecentEntry[]>(STORAGE_KEYS.PALETTE_RECENT, []);
}

function saveRecent(entry: RecentEntry) {
  const list = loadRecent().filter(r => r.id !== entry.id);
  list.unshift(entry);
  lsSet(STORAGE_KEYS.PALETTE_RECENT, JSON.stringify(list.slice(0, RECENT_MAX)));
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Command {
  id: string;
  label: string;
  description?: string;
  category?: string;
  shortcut?: string;
  handler: () => void;
}

export interface TokenEntry {
  path: string;
  type: string;
  value?: string;
  set?: string;
  isAlias?: boolean;
  description?: string;
}

interface CommandPaletteProps {
  commands: Command[];
  tokens?: TokenEntry[];
  onGoToToken?: (path: string) => void;
  onCopyTokenPath?: (path: string) => void;
  onCopyTokenCssVar?: (path: string) => void;
  onCopyTokenValue?: (value: string) => void;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Token search result row
// ---------------------------------------------------------------------------

function tokenCssVar(path: string) {
  return `--${path.replace(/\./g, '-')}`;
}

/** Extract leaf name from a dotted path. */
function leafName(path: string): string {
  const i = path.lastIndexOf('.');
  return i < 0 ? path : path.slice(i + 1);
}

/** Apply parsed structured qualifiers to a flat token list. Returns matching tokens. */
function filterTokensStructured(tokens: TokenEntry[], parsed: ParsedQuery): TokenEntry[] {
  return tokens.filter(t => {
    // type: qualifier (OR among values)
    if (parsed.types.length > 0) {
      const tt = (t.type || '').toLowerCase();
      if (!parsed.types.some(p => tt === p || tt.includes(p))) return false;
    }
    // has: qualifiers (all must match)
    for (const h of parsed.has) {
      if ((h === 'alias' || h === 'ref') && !t.isAlias) return false;
      if (h === 'direct' && t.isAlias) return false;
      if ((h === 'description' || h === 'desc') && !t.description) return false;
    }
    // value: qualifier
    if (parsed.values.length > 0) {
      const sv = (t.value || '').toLowerCase();
      if (!parsed.values.some(v => sv.includes(v))) return false;
    }
    // path: qualifier
    if (parsed.paths.length > 0) {
      const lp = t.path.toLowerCase();
      if (!parsed.paths.some(p => lp.startsWith(p) || lp.includes(p))) return false;
    }
    // name: qualifier
    if (parsed.names.length > 0) {
      const ln = leafName(t.path).toLowerCase();
      if (!parsed.names.some(n => ln.includes(n))) return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CommandPalette({ commands, tokens = [], onGoToToken, onCopyTokenPath, onCopyTokenCssVar, onCopyTokenValue, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [recent] = useState<RecentEntry[]>(() => loadRecent());

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Token search mode: query starts with ">"
  const isTokenMode = query.startsWith('>');
  const tokenQuery = isTokenMode ? query.slice(1).trim() : '';

  const MAX_TOKEN_BROWSE = 100;

  // Parse structured qualifiers from the token query
  const parsedTokenQuery = useMemo(() => parseStructuredQuery(tokenQuery), [tokenQuery]);
  const hasQualifiers = parsedTokenQuery.types.length > 0 || parsedTokenQuery.has.length > 0
    || parsedTokenQuery.values.length > 0 || parsedTokenQuery.paths.length > 0
    || parsedTokenQuery.names.length > 0 || parsedTokenQuery.descs.length > 0;

  const { filteredTokens, totalTokenMatches } = useMemo(() => {
    if (!isTokenMode || !tokens.length) return { filteredTokens: [], totalTokenMatches: 0 };

    // Apply structural qualifiers first
    const base = hasQualifiers ? filterTokensStructured(tokens, parsedTokenQuery) : tokens;

    const freeText = parsedTokenQuery.text;
    if (!freeText && !hasQualifiers) {
      // No query at all — browse mode
      return { filteredTokens: base.slice(0, MAX_TOKEN_BROWSE), totalTokenMatches: base.length };
    }
    if (!freeText) {
      // Qualifiers only, no free text
      return { filteredTokens: base.slice(0, MAX_TOKEN_BROWSE), totalTokenMatches: base.length };
    }
    // Free text fuzzy matching on the qualifier-filtered set
    const matched = base
      .map(t => ({ t, score: fuzzyScore(freeText, t.path) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ t }) => t);
    return { filteredTokens: matched.slice(0, MAX_TOKEN_BROWSE), totalTokenMatches: matched.length };
  }, [isTokenMode, tokens, parsedTokenQuery, hasQualifiers]);

  // Normal command search
  const filteredCommands = useMemo(() => {
    if (isTokenMode) return [];
    const q = query.trim();
    if (!q) return commands;
    return commands
      .map(cmd => ({
        cmd,
        score: Math.max(
          fuzzyScore(q, cmd.label),
          cmd.description ? fuzzyScore(q, cmd.description) : 0,
        ),
      }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ cmd }) => cmd);
  }, [query, commands, isTokenMode]);

  // Flat list for keyboard nav
  const flatList: Array<{ kind: 'command'; cmd: Command } | { kind: 'token'; token: TokenEntry }> = useMemo(() => {
    if (isTokenMode) {
      return filteredTokens.map(t => ({ kind: 'token' as const, token: t }));
    }
    return filteredCommands.map(cmd => ({ kind: 'command' as const, cmd }));
  }, [isTokenMode, filteredTokens, filteredCommands]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  const executeCommand = (cmd: Command) => {
    saveRecent({ id: cmd.id, label: cmd.label });
    cmd.handler();
    onClose();
  };

  const executeToken = (token: TokenEntry) => {
    onGoToToken?.(token.path);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, flatList.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = flatList[activeIdx];
      if (!item) return;
      if (item.kind === 'command') executeCommand(item.cmd);
      else executeToken(item.token);
    }
  };

  // Scroll active item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    // find all buttons/items
    const items = list.querySelectorAll('[data-palette-item]');
    const active = items[activeIdx] as HTMLElement | undefined;
    active?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  // Build grouped command sections for no-query mode
  const sections = useMemo(() => {
    if (isTokenMode || query.trim()) return null;
    const recentCmds = recent
      .map(r => commands.find(c => c.id === r.id))
      .filter((c): c is Command => !!c);

    const categories = new Map<string, Command[]>();
    for (const cmd of filteredCommands) {
      const cat = cmd.category ?? 'General';
      if (!categories.has(cat)) categories.set(cat, []);
      categories.get(cat)!.push(cmd);
    }

    const result: Array<{ header: string; items: Command[] }> = [];
    if (recentCmds.length > 0) result.push({ header: 'Recent', items: recentCmds });
    for (const [header, items] of categories) {
      result.push({ header, items });
    }
    return result;
  }, [isTokenMode, query, filteredCommands, commands, recent]);

  // Compute flat index from sections (for keyboard nav alignment)
  const sectionFlatItems = useMemo(() => {
    if (!sections) return null;
    const flat: Command[] = [];
    for (const s of sections) flat.push(...s.items);
    return flat;
  }, [sections]);

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
            placeholder={isTokenMode ? 'Search tokens… (try type:color, has:ref, path:brand)' : 'Search commands… (type > for tokens)'}
            aria-label="Search commands"
            aria-autocomplete="list"
            className="flex-1 bg-transparent outline-none text-[12px] text-[var(--color-figma-text)] placeholder-[var(--color-figma-text-secondary)]"
          />
          {isTokenMode && (
            <span className="text-[10px] font-medium text-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 rounded px-1.5 py-0.5 shrink-0">
              TOKENS
            </span>
          )}
          <kbd className="text-[10px] text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] rounded px-1 py-0.5 shrink-0">
            ESC
          </kbd>
        </div>

        {/* Qualifier hint chips */}
        {isTokenMode && !hasQualifiers && !parsedTokenQuery.text && (
          <div className="px-3 py-1.5 border-b border-[var(--color-figma-border)] flex flex-wrap gap-1.5">
            {QUERY_QUALIFIERS.filter(q => q.example || q.qualifier.includes(':')).slice(0, 6).map(q => (
              <button
                key={q.qualifier}
                className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                onClick={() => setQuery('>' + q.qualifier + (q.qualifier.endsWith(':') ? '' : ' '))}
                title={q.desc}
              >
                {q.qualifier}{q.example ? q.example.slice(q.qualifier.length) : ''}
              </button>
            ))}
          </div>
        )}

        {/* Results */}
        <div ref={listRef} className="overflow-y-auto flex-1" role="listbox" aria-label="Commands">
          {/* Token search mode */}
          {isTokenMode && (
            <>
              {(hasQualifiers || parsedTokenQuery.text) && filteredTokens.length > 0 && (
                <div className="px-3 py-1 text-[10px] text-[var(--color-figma-text-secondary)] border-b border-[var(--color-figma-border)]">
                  {totalTokenMatches} token{totalTokenMatches !== 1 ? 's' : ''} matched
                </div>
              )}
              {filteredTokens.length === 0 && (
                <div className="px-3 py-6 text-center text-[11px] text-[var(--color-figma-text-secondary)]">
                  {tokenQuery ? `No tokens match "${tokenQuery}"` : 'Type a token path to search'}
                </div>
              )}
              {filteredTokens.map((token, idx) => (
                <div key={token.path} className="flex items-center gap-0" data-palette-item>
                  <button
                    role="option"
                    aria-selected={idx === activeIdx}
                    className={`flex-1 text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${idx === activeIdx ? 'bg-[var(--color-figma-accent)] text-white' : 'text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'}`}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => executeToken(token)}
                  >
                    <span className={`text-[10px] px-1 py-0.5 rounded shrink-0 font-medium ${idx === activeIdx ? 'bg-white/20 text-white' : 'bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]'}`}>
                      {token.type}
                    </span>
                    <span className="text-[11px] font-mono truncate">{token.path}</span>
                    {token.set && (
                      <span className={`text-[10px] px-1 py-0.5 rounded shrink-0 font-medium ml-auto ${idx === activeIdx ? 'bg-white/20 text-white/70' : 'bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]'}`}>
                        {token.set}
                      </span>
                    )}
                  </button>
                  {onCopyTokenPath && (
                    <button
                      tabIndex={-1}
                      title={`Copy path: ${token.path}`}
                      className={`px-2 py-1.5 text-[10px] shrink-0 transition-colors ${idx === activeIdx ? 'text-white/70 hover:text-white' : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]'}`}
                      onClick={(e) => { e.stopPropagation(); onCopyTokenPath(token.path); onClose(); }}
                    >
                      Path
                    </button>
                  )}
                  {onCopyTokenValue && token.value != null && (
                    <button
                      tabIndex={-1}
                      title={`Copy raw value: ${token.value}`}
                      className={`px-2 py-1.5 text-[10px] shrink-0 transition-colors ${idx === activeIdx ? 'text-white/70 hover:text-white' : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]'}`}
                      onClick={(e) => { e.stopPropagation(); onCopyTokenValue(token.value!); onClose(); }}
                    >
                      Val
                    </button>
                  )}
                  {onCopyTokenCssVar && (
                    <button
                      tabIndex={-1}
                      title={`Copy CSS var: ${tokenCssVar(token.path)}`}
                      className={`px-2 py-1.5 text-[10px] shrink-0 transition-colors ${idx === activeIdx ? 'text-white/70 hover:text-white' : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]'}`}
                      onClick={(e) => { e.stopPropagation(); onCopyTokenCssVar(token.path); onClose(); }}
                    >
                      CSS
                    </button>
                  )}
                </div>
              ))}
              {totalTokenMatches > MAX_TOKEN_BROWSE && (
                <div className="px-3 py-2 text-center text-[10px] text-[var(--color-figma-text-secondary)] border-t border-[var(--color-figma-border)]">
                  {MAX_TOKEN_BROWSE} of {totalTokenMatches} shown — refine your search
                </div>
              )}
            </>
          )}

          {/* Grouped sections (no query) */}
          {!isTokenMode && sections && (
            <>
              {sections.map(section => (
                <div key={section.header}>
                  <div className="px-3 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-figma-text-secondary)]">
                    {section.header}
                  </div>
                  {section.items.map(cmd => {
                    const flatIdx = sectionFlatItems?.indexOf(cmd) ?? -1;
                    return (
                      <button
                        key={cmd.id}
                        role="option"
                        aria-selected={flatIdx === activeIdx}
                        data-palette-item
                        className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${flatIdx === activeIdx ? 'bg-[var(--color-figma-accent)] text-white' : 'text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'}`}
                        onMouseEnter={() => setActiveIdx(flatIdx)}
                        onClick={() => executeCommand(cmd)}
                      >
                        <span className="text-[11px] font-medium flex-1">{cmd.label}</span>
                        {cmd.shortcut && (
                          <kbd className={`text-[10px] border rounded px-1 py-0.5 shrink-0 ${flatIdx === activeIdx ? 'border-white/30 bg-white/10 text-white/80' : 'border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]'}`}>
                            {cmd.shortcut}
                          </kbd>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </>
          )}

          {/* Filtered command results (with query) */}
          {!isTokenMode && !sections && (
            <>
              {filteredCommands.length === 0 && (
                <div className="px-3 py-6 text-center text-[11px] text-[var(--color-figma-text-secondary)]">
                  <div>No commands match &ldquo;{query}&rdquo;</div>
                  <div className="mt-1 text-[10px] opacity-70">Try <kbd className="font-mono bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] rounded px-1">&gt;</kbd> to search tokens by path</div>
                </div>
              )}
              {filteredCommands.map((cmd, idx) => (
                <button
                  key={cmd.id}
                  role="option"
                  aria-selected={idx === activeIdx}
                  data-palette-item
                  className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${idx === activeIdx ? 'bg-[var(--color-figma-accent)] text-white' : 'text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'}`}
                  onMouseEnter={() => setActiveIdx(idx)}
                  onClick={() => executeCommand(cmd)}
                >
                  <div className="flex-1 flex flex-col gap-0 min-w-0">
                    <span className="text-[11px] font-medium">{cmd.label}</span>
                    {cmd.description && (
                      <span title={cmd.description} className={`text-[10px] truncate ${idx === activeIdx ? 'text-white/70' : 'text-[var(--color-figma-text-secondary)]'}`}>
                        {cmd.description}
                      </span>
                    )}
                  </div>
                  {cmd.shortcut && (
                    <kbd className={`text-[10px] border rounded px-1 py-0.5 shrink-0 ${idx === activeIdx ? 'border-white/30 bg-white/10 text-white/80' : 'border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]'}`}>
                      {cmd.shortcut}
                    </kbd>
                  )}
                </button>
              ))}
            </>
          )}
        </div>

        {/* Footer hints */}
        <div className="px-3 py-1.5 border-t border-[var(--color-figma-border)] flex gap-3 text-[10px] text-[var(--color-figma-text-secondary)]">
          {isTokenMode ? (
            <>
              <span>↑↓ navigate</span>
              <span>↵ go to token</span>
              <span className="opacity-60">type: has: value: path: name:</span>
              <span>ESC close</span>
            </>
          ) : (
            <>
              <span>↑↓ navigate</span>
              <span>↵ select</span>
              <span>type &gt; to search tokens</span>
              <span>ESC close</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
