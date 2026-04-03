import { useState, useEffect, useRef, useMemo } from 'react';
import { STORAGE_KEYS, lsGetJson, lsSet } from '../shared/storage';
import { swatchBgColor } from '../shared/colorUtils';
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
  generatorName?: string;
}

export interface GroupEntry {
  path: string;
  childCount: number;
  sets: string[];
}

interface CommandPaletteProps {
  commands: Command[];
  tokens?: TokenEntry[];
  allSetTokens?: TokenEntry[];
  pinnedTokens?: TokenEntry[];
  recentTokens?: TokenEntry[];
  onGoToToken?: (path: string) => void;
  onGoToGroup?: (path: string) => void;
  onCopyTokenPath?: (path: string) => void;
  onCopyTokenCssVar?: (path: string) => void;
  onCopyTokenRef?: (path: string) => void;
  onCopyTokenValue?: (value: string) => void;
  onDuplicateToken?: (path: string) => void;
  onClose: () => void;
  initialQuery?: string;
}

// ---------------------------------------------------------------------------
// Token search result row
// ---------------------------------------------------------------------------

function tokenCssVar(path: string) {
  return `var(--${path.replace(/\./g, '-')})`;
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
      if ((h === 'generated' || h === 'gen') && !t.generatorName) return false;
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
    // generator: qualifier
    if (parsed.generators.length > 0) {
      if (!t.generatorName) return false;
      const gn = t.generatorName.toLowerCase();
      if (!parsed.generators.some(g => gn === g || gn.includes(g))) return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CommandPalette({ commands, tokens = [], allSetTokens, pinnedTokens, recentTokens, onGoToToken, onGoToGroup, onCopyTokenPath, onCopyTokenCssVar, onCopyTokenRef, onCopyTokenValue, onDuplicateToken, onClose, initialQuery = '' }: CommandPaletteProps) {
  const [query, setQuery] = useState(initialQuery);
  const [activeIdx, setActiveIdx] = useState(0);
  const [visibleCount, setVisibleCount] = useState(100);
  const [showAllQualifiers, setShowAllQualifiers] = useState(false);
  const [searchAllSets, setSearchAllSets] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [recent] = useState<RecentEntry[]>(() => loadRecent());

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Reset visible count when query changes
  useEffect(() => {
    setVisibleCount(100);
  }, [query]);

  // Token search mode: query starts with ">"
  const isTokenMode = query.startsWith('>');
  const tokenQuery = isTokenMode ? query.slice(1).trim() : '';

  // Active token list: all-sets or current-set
  const activeTokenList = searchAllSets && allSetTokens ? allSetTokens : tokens;

  const MAX_TOKEN_BROWSE = 100;

  // Derive unique group paths from tokens
  const groups: GroupEntry[] = useMemo(() => {
    if (!activeTokenList.length) return [];
    const groupMap = new Map<string, { count: number; sets: Set<string> }>();
    for (const t of activeTokenList) {
      const parts = t.path.split('.');
      // Build every ancestor group path (all but the leaf)
      for (let i = 1; i < parts.length; i++) {
        const gp = parts.slice(0, i).join('.');
        let entry = groupMap.get(gp);
        if (!entry) { entry = { count: 0, sets: new Set() }; groupMap.set(gp, entry); }
        entry.count++;
        if (t.set) entry.sets.add(t.set);
      }
    }
    return Array.from(groupMap.entries())
      .map(([path, { count, sets }]) => ({ path, childCount: count, sets: Array.from(sets) }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }, [activeTokenList]);

  // Parse structured qualifiers from the token query
  const parsedTokenQuery = useMemo(() => parseStructuredQuery(tokenQuery), [tokenQuery]);
  const hasQualifiers = parsedTokenQuery.types.length > 0 || parsedTokenQuery.has.length > 0
    || parsedTokenQuery.values.length > 0 || parsedTokenQuery.paths.length > 0
    || parsedTokenQuery.names.length > 0 || parsedTokenQuery.descs.length > 0
    || parsedTokenQuery.generators.length > 0;

  // Check if query uses a group: qualifier
  const isGroupQuery = tokenQuery.toLowerCase().startsWith('group:');
  const groupQueryText = isGroupQuery ? tokenQuery.slice(6).trim().toLowerCase() : '';

  const { filteredTokens, totalTokenMatches } = useMemo(() => {
    if (!isTokenMode || !activeTokenList.length || isGroupQuery) return { filteredTokens: [], totalTokenMatches: 0 };

    // Apply structural qualifiers first
    const base = hasQualifiers ? filterTokensStructured(activeTokenList, parsedTokenQuery) : activeTokenList;

    const freeText = parsedTokenQuery.text;
    if (!freeText && !hasQualifiers) {
      // No query at all — browse mode
      return { filteredTokens: base.slice(0, visibleCount), totalTokenMatches: base.length };
    }
    if (!freeText) {
      // Qualifiers only, no free text
      return { filteredTokens: base.slice(0, visibleCount), totalTokenMatches: base.length };
    }
    // Free text fuzzy matching on the qualifier-filtered set
    const matched = base
      .map(t => ({ t, score: fuzzyScore(freeText, t.path) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ t }) => t);
    return { filteredTokens: matched.slice(0, visibleCount), totalTokenMatches: matched.length };
  }, [isTokenMode, activeTokenList, parsedTokenQuery, hasQualifiers, isGroupQuery, visibleCount]);

  // Group search results
  const { filteredGroups, totalGroupMatches } = useMemo(() => {
    if (!isTokenMode || !groups.length) return { filteredGroups: [], totalGroupMatches: 0 };

    if (isGroupQuery) {
      // Explicit group: qualifier — filter groups only
      if (!groupQueryText) return { filteredGroups: groups.slice(0, visibleCount), totalGroupMatches: groups.length };
      const matched = groups
        .map(g => ({ g, score: fuzzyScore(groupQueryText, g.path) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .map(({ g }) => g);
      return { filteredGroups: matched.slice(0, visibleCount), totalGroupMatches: matched.length };
    }

    // Auto-detect: when free text matches groups, include top matches alongside tokens
    const freeText = parsedTokenQuery.text;
    if (!freeText || hasQualifiers) return { filteredGroups: [], totalGroupMatches: 0 };
    const matched = groups
      .map(g => ({ g, score: fuzzyScore(freeText, g.path) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score);
    // Show up to 5 group matches at the top when not using explicit group: qualifier
    const top = matched.slice(0, 5).map(({ g }) => g);
    return { filteredGroups: top, totalGroupMatches: matched.length };
  }, [isTokenMode, groups, isGroupQuery, groupQueryText, parsedTokenQuery.text, hasQualifiers, visibleCount]);

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

  // Token quick-access sections for no-query mode
  const dedupedRecentTokens = useMemo(() => {
    if (!recentTokens?.length) return [];
    if (!pinnedTokens?.length) return recentTokens;
    const pinnedSet = new Set(pinnedTokens.map(t => t.path));
    return recentTokens.filter(t => !pinnedSet.has(t.path));
  }, [recentTokens, pinnedTokens]);

  const noQueryPinnedTokens = useMemo(() => {
    if (isTokenMode || query.trim()) return [];
    return pinnedTokens ?? [];
  }, [isTokenMode, query, pinnedTokens]);

  const noQueryRecentTokens = useMemo(() => {
    if (isTokenMode || query.trim()) return [];
    return dedupedRecentTokens;
  }, [isTokenMode, query, dedupedRecentTokens]);

  // Flat list for keyboard nav — must match the visual rendering order exactly
  type FlatItem = { kind: 'command'; cmd: Command } | { kind: 'token'; token: TokenEntry } | { kind: 'group'; group: GroupEntry };
  const flatList: FlatItem[] = useMemo(() => {
    if (isTokenMode) {
      const items: FlatItem[] = [];
      for (const g of filteredGroups) items.push({ kind: 'group', group: g });
      for (const t of filteredTokens) items.push({ kind: 'token', token: t });
      return items;
    }
    // No-query mode: pinned and recent token items come before commands
    const items: FlatItem[] = [];
    for (const t of noQueryPinnedTokens) items.push({ kind: 'token', token: t });
    for (const t of noQueryRecentTokens) items.push({ kind: 'token', token: t });
    const cmdList = sectionFlatItems ?? filteredCommands;
    for (const cmd of cmdList) items.push({ kind: 'command', cmd });
    return items;
  }, [isTokenMode, filteredTokens, filteredGroups, filteredCommands, sectionFlatItems, noQueryPinnedTokens, noQueryRecentTokens]);

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

  const executeGroup = (group: GroupEntry) => {
    onGoToGroup?.(group.path);
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
      else if (item.kind === 'group') executeGroup(item.group);
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
            placeholder={isTokenMode
              ? (searchAllSets ? 'Search all sets… (type:color, has:ref, path:brand)' : 'Search tokens… (type:color, has:ref, path:brand)')
              : 'Search commands… (type > for tokens)'}
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

        {/* Qualifier hint chips — persistent reference row */}
        {isTokenMode && (
          <div className="px-3 py-1 border-b border-[var(--color-figma-border)] flex gap-1.5 flex-wrap items-center">
            <span className="text-[9px] text-[var(--color-figma-text-secondary)] shrink-0 self-center opacity-60 mr-0.5">filters:</span>
            {(showAllQualifiers ? QUERY_QUALIFIERS : QUERY_QUALIFIERS.slice(0, 6)).map(q => (
              <button
                key={q.qualifier}
                className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors shrink-0"
                onClick={() => setQuery('>' + q.qualifier + (q.qualifier.endsWith(':') ? '' : ' '))}
                title={q.desc}
              >
                {q.qualifier}{q.example ? q.example.slice(q.qualifier.length) : ''}
              </button>
            ))}
            <button
              className="text-[10px] px-1.5 py-0.5 rounded text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors shrink-0 opacity-60 hover:opacity-100"
              onClick={() => setShowAllQualifiers(v => !v)}
              title={showAllQualifiers ? 'Show fewer qualifiers' : `Show all ${QUERY_QUALIFIERS.length} qualifiers`}
            >
              {showAllQualifiers ? 'fewer' : `+${QUERY_QUALIFIERS.length - 6} more`}
            </button>
            {allSetTokens && (
              <button
                className={`ml-auto text-[10px] px-1.5 py-0.5 rounded border transition-colors shrink-0 font-medium ${
                  searchAllSets
                    ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]'
                    : 'border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'
                }`}
                onClick={() => { setSearchAllSets(v => !v); setVisibleCount(100); }}
                title={searchAllSets ? 'Searching all sets — click to search active set only' : 'Search across all token sets'}
              >
                {searchAllSets ? 'All sets' : 'All sets'}
              </button>
            )}
          </div>
        )}

        {/* Results */}
        <div ref={listRef} className="overflow-y-auto flex-1" role="listbox" aria-label="Commands">
          {/* Token search mode */}
          {isTokenMode && (
            <>
              {(hasQualifiers || parsedTokenQuery.text || isGroupQuery) && (filteredTokens.length > 0 || filteredGroups.length > 0) && (
                <div className="px-3 py-1 text-[10px] text-[var(--color-figma-text-secondary)] border-b border-[var(--color-figma-border)] flex items-center gap-1.5">
                  {isGroupQuery
                    ? <>{totalGroupMatches} group{totalGroupMatches !== 1 ? 's' : ''} matched</>
                    : <>{totalTokenMatches} token{totalTokenMatches !== 1 ? 's' : ''} matched{filteredGroups.length > 0 && <> + {totalGroupMatches} group{totalGroupMatches !== 1 ? 's' : ''}</>}</>
                  }
                  {searchAllSets && <span className="text-[var(--color-figma-accent)] opacity-70">across all sets</span>}
                </div>
              )}
              {filteredTokens.length === 0 && filteredGroups.length === 0 && (
                <div className="px-3 py-6 text-center text-[11px] text-[var(--color-figma-text-secondary)]">
                  {tokenQuery
                    ? `No tokens or groups match "${tokenQuery}"${!searchAllSets && allSetTokens ? ' in this set' : ''}`
                    : `Type a token path to search${searchAllSets ? ' across all sets' : ''} (or group: for groups)`}
                  {tokenQuery && !searchAllSets && allSetTokens && (
                    <div className="mt-1.5">
                      <button
                        className="text-[10px] text-[var(--color-figma-accent)] hover:underline"
                        onClick={() => { setSearchAllSets(true); setVisibleCount(100); }}
                      >
                        Search all sets
                      </button>
                    </div>
                  )}
                </div>
              )}
              {/* Group results */}
              {filteredGroups.length > 0 && !isGroupQuery && (
                <div className="px-3 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-figma-text-secondary)]">
                  Groups
                </div>
              )}
              {filteredGroups.map((group, idx) => {
                const flatIdx = idx; // groups come first in flatList
                return (
                  <button
                    key={'g:' + group.path}
                    role="option"
                    aria-selected={flatIdx === activeIdx}
                    data-palette-item
                    className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${flatIdx === activeIdx ? 'bg-[var(--color-figma-accent)] text-white' : 'text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'}`}
                    onMouseEnter={() => setActiveIdx(flatIdx)}
                    onClick={() => executeGroup(group)}
                  >
                    <span className={`text-[10px] px-1 py-0.5 rounded shrink-0 font-medium ${flatIdx === activeIdx ? 'bg-white/20 text-white' : 'bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]'}`}>
                      group
                    </span>
                    <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                    </svg>
                    <span className="text-[11px] font-mono truncate">{group.path}</span>
                    <span className={`text-[10px] shrink-0 ml-auto ${flatIdx === activeIdx ? 'text-white/60' : 'text-[var(--color-figma-text-secondary)]'}`}>
                      {group.childCount} token{group.childCount !== 1 ? 's' : ''}
                    </span>
                  </button>
                );
              })}
              {/* Token results */}
              {filteredTokens.length > 0 && filteredGroups.length > 0 && !isGroupQuery && (
                <div className="px-3 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-figma-text-secondary)]">
                  Tokens
                </div>
              )}
              {filteredTokens.map((token, idx) => {
                const flatIdx = filteredGroups.length + idx; // tokens come after groups
                return (
                <div key={token.path} className="flex items-center gap-0" data-palette-item>
                  <button
                    role="option"
                    aria-selected={flatIdx === activeIdx}
                    className={`flex-1 text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${flatIdx === activeIdx ? 'bg-[var(--color-figma-accent)] text-white' : 'text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'}`}
                    onMouseEnter={() => setActiveIdx(flatIdx)}
                    onClick={() => executeToken(token)}
                  >
                    <span className={`text-[10px] px-1 py-0.5 rounded shrink-0 font-medium ${flatIdx === activeIdx ? 'bg-white/20 text-white' : 'bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]'}`}>
                      {token.type}
                    </span>
                    {token.type === 'color' && typeof token.value === 'string' && token.value ? (
                      <span
                        className="w-3 h-3 rounded-full shrink-0 border border-black/10"
                        style={{ backgroundColor: swatchBgColor(token.value) }}
                        title={token.value}
                      />
                    ) : token.value != null && token.value !== '' && token.type !== 'color' ? (
                      <span className={`text-[10px] shrink-0 font-mono ${flatIdx === activeIdx ? 'text-white/70' : 'text-[var(--color-figma-text-secondary)]'}`} title={token.value}>
                        {token.value.length > 20 ? token.value.slice(0, 20) + '…' : token.value}
                      </span>
                    ) : null}
                    <span className="text-[11px] font-mono truncate">{token.path}</span>
                    {token.set && (
                      <span className={`text-[10px] px-1 py-0.5 rounded shrink-0 font-medium ml-auto ${flatIdx === activeIdx ? 'bg-white/20 text-white/70' : 'bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]'}`}>
                        {token.set}
                      </span>
                    )}
                  </button>
                  {onCopyTokenPath && (
                    <button
                      tabIndex={-1}
                      title={`Copy path: ${token.path}`}
                      className={`px-2 py-1.5 text-[10px] shrink-0 transition-colors ${flatIdx === activeIdx ? 'text-white/70 hover:text-white' : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]'}`}
                      onClick={(e) => { e.stopPropagation(); onCopyTokenPath(token.path); onClose(); }}
                    >
                      Path
                    </button>
                  )}
                  {onCopyTokenRef && (
                    <button
                      tabIndex={-1}
                      title={`Copy DTCG alias: {${token.path}}`}
                      className={`px-2 py-1.5 text-[10px] shrink-0 transition-colors ${flatIdx === activeIdx ? 'text-white/70 hover:text-white' : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]'}`}
                      onClick={(e) => { e.stopPropagation(); onCopyTokenRef(token.path); onClose(); }}
                    >
                      {'{ref}'}
                    </button>
                  )}
                  {onCopyTokenValue && token.value != null && (
                    <button
                      tabIndex={-1}
                      title={`Copy raw value: ${token.value}`}
                      className={`px-2 py-1.5 text-[10px] shrink-0 transition-colors ${flatIdx === activeIdx ? 'text-white/70 hover:text-white' : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]'}`}
                      onClick={(e) => { e.stopPropagation(); onCopyTokenValue(token.value!); onClose(); }}
                    >
                      Val
                    </button>
                  )}
                  {onCopyTokenCssVar && (
                    <button
                      tabIndex={-1}
                      title={`Copy CSS var: ${tokenCssVar(token.path)}`}
                      className={`px-2 py-1.5 text-[10px] shrink-0 transition-colors ${flatIdx === activeIdx ? 'text-white/70 hover:text-white' : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]'}`}
                      onClick={(e) => { e.stopPropagation(); onCopyTokenCssVar(token.path); onClose(); }}
                    >
                      CSS
                    </button>
                  )}
                  {onDuplicateToken && (
                    <button
                      tabIndex={-1}
                      title={`Duplicate token: ${token.path}`}
                      className={`px-2 py-1.5 text-[10px] shrink-0 transition-colors ${flatIdx === activeIdx ? 'text-white/70 hover:text-white' : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]'}`}
                      onClick={(e) => { e.stopPropagation(); onDuplicateToken(token.path); onClose(); }}
                    >
                      Dup
                    </button>
                  )}
                </div>
                );
              })}
              {(() => {
                const total = isGroupQuery ? totalGroupMatches : totalTokenMatches;
                const shown = isGroupQuery ? filteredGroups.length : filteredTokens.length;
                if (total <= shown) return null;
                return (
                  <div className="px-3 py-2 flex items-center justify-between border-t border-[var(--color-figma-border)]">
                    <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                      {shown} of {total} shown
                    </span>
                    <button
                      className="text-[10px] text-[var(--color-figma-accent)] hover:underline"
                      onClick={() => setVisibleCount(c => c + 100)}
                    >
                      Load 100 more
                    </button>
                  </div>
                );
              })()}
            </>
          )}

          {/* Pinned tokens quick-access (no query) */}
          {noQueryPinnedTokens.length > 0 && (
            <div>
              <div className="px-3 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-figma-text-secondary)] flex items-center gap-1.5">
                <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M16 3H8a1 1 0 00-1 1v7.586l-2.707 2.707A1 1 0 005 16h14a1 1 0 00.707-1.707L17 11.586V4a1 1 0 00-1-1z"/><rect x="10" y="16" width="4" height="5" rx="1"/></svg>
                Pinned Tokens
              </div>
              {noQueryPinnedTokens.map((token, idx) => {
                const flatIdx = idx;
                return (
                  <button
                    key={'pin:' + token.path}
                    role="option"
                    aria-selected={flatIdx === activeIdx}
                    data-palette-item
                    className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${flatIdx === activeIdx ? 'bg-[var(--color-figma-accent)] text-white' : 'text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'}`}
                    onMouseEnter={() => setActiveIdx(flatIdx)}
                    onClick={() => executeToken(token)}
                  >
                    <span className={`text-[10px] px-1 py-0.5 rounded shrink-0 font-medium ${flatIdx === activeIdx ? 'bg-white/20 text-white' : 'bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]'}`}>
                      {token.type}
                    </span>
                    {token.type === 'color' && token.value ? (
                      <span className="w-3 h-3 rounded-full shrink-0 border border-black/10" style={{ backgroundColor: swatchBgColor(token.value) }} />
                    ) : null}
                    <span className="text-[11px] font-mono truncate flex-1">{token.path}</span>
                    {token.set && (
                      <span className={`text-[10px] px-1 py-0.5 rounded shrink-0 font-medium ${flatIdx === activeIdx ? 'bg-white/20 text-white/70' : 'bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]'}`}>
                        {token.set}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Recently edited tokens quick-access (no query) */}
          {noQueryRecentTokens.length > 0 && (
            <div>
              <div className="px-3 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-figma-text-secondary)] flex items-center gap-1.5">
                <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                Recently Edited
              </div>
              {noQueryRecentTokens.map((token, idx) => {
                const flatIdx = noQueryPinnedTokens.length + idx;
                return (
                  <button
                    key={'rec:' + token.path}
                    role="option"
                    aria-selected={flatIdx === activeIdx}
                    data-palette-item
                    className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${flatIdx === activeIdx ? 'bg-[var(--color-figma-accent)] text-white' : 'text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'}`}
                    onMouseEnter={() => setActiveIdx(flatIdx)}
                    onClick={() => executeToken(token)}
                  >
                    <span className={`text-[10px] px-1 py-0.5 rounded shrink-0 font-medium ${flatIdx === activeIdx ? 'bg-white/20 text-white' : 'bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]'}`}>
                      {token.type}
                    </span>
                    {token.type === 'color' && token.value ? (
                      <span className="w-3 h-3 rounded-full shrink-0 border border-black/10" style={{ backgroundColor: swatchBgColor(token.value) }} />
                    ) : null}
                    <span className="text-[11px] font-mono truncate flex-1">{token.path}</span>
                    {token.set && (
                      <span className={`text-[10px] px-1 py-0.5 rounded shrink-0 font-medium ${flatIdx === activeIdx ? 'bg-white/20 text-white/70' : 'bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]'}`}>
                        {token.set}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Grouped sections (no query) */}
          {!isTokenMode && sections && (() => {
            let runningIdx = noQueryPinnedTokens.length + noQueryRecentTokens.length;
            return sections.map(section => (
              <div key={section.header}>
                <div className="px-3 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-figma-text-secondary)]">
                  {section.header}
                </div>
                {section.items.map(cmd => {
                  const flatIdx = runningIdx++;
                  return (
                    <button
                      key={section.header + ':' + cmd.id}
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
            ));
          })()}

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
              <span>↵ go to token/group</span>
              {searchAllSets
                ? <span className="text-[var(--color-figma-accent)] opacity-80">searching all sets</span>
                : <span className="opacity-60">type: has: value: path: name: group:</span>
              }
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
