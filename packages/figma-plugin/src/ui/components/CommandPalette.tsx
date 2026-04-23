import { useState, useEffect, useRef, useMemo } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { STORAGE_KEYS, lsGetJson, lsSet } from '../shared/storage';
import { swatchBgColor } from '../shared/colorUtils';
import type { CommandPaletteToken } from '../shared/commandPaletteTokens';
import {
  parseStructuredQuery,
  QUERY_QUALIFIERS,
  getQualifierCompletions,
  tokenMatchesScopeCategories,
} from './tokenListUtils';
import type { ParsedQuery } from './tokenListUtils';
import { fuzzyScore } from '../shared/fuzzyMatch';

// ---------------------------------------------------------------------------
// Recent actions — persist to localStorage
// ---------------------------------------------------------------------------

const RECENT_MAX = 5;
const COMMAND_SECTION_ORDER = ['Tokens', 'Collections', 'Views', 'Apply', 'Modes', 'Review', 'History', 'Export', 'Help'] as const;

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

export type TokenEntry = CommandPaletteToken;

export interface GroupEntry {
  path: string;
  childCount: number;
  sets: string[];
}

interface CommandPaletteProps {
  commands: Command[];
  tokens?: TokenEntry[];
  allSetTokens?: TokenEntry[];
  starredTokens?: TokenEntry[];
  recentTokens?: TokenEntry[];
  onGoToToken?: (token: TokenEntry) => void;
  onGoToGroup?: (path: string) => void;
  onCopyTokenPath?: (path: string) => void;
  onCopyTokenCssVar?: (path: string) => void;
  onCopyTokenRef?: (path: string) => void;
  onCopyTokenValue?: (value: string) => void;
  onDuplicateToken?: (token: TokenEntry) => void;
  onRenameToken?: (token: TokenEntry) => void;
  onDeleteToken?: (token: TokenEntry) => void;
  onMoveToken?: (token: TokenEntry) => void;
  onClose: () => void;
  initialQuery?: string;
}

function compareCommandSections(a: string, b: string): number {
  const aIndex = COMMAND_SECTION_ORDER.indexOf(a as typeof COMMAND_SECTION_ORDER[number]);
  const bIndex = COMMAND_SECTION_ORDER.indexOf(b as typeof COMMAND_SECTION_ORDER[number]);
  if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
  if (aIndex === -1) return 1;
  if (bIndex === -1) return -1;
  return aIndex - bIndex;
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

function tokenEntryKey(token: TokenEntry): string {
  return `${token.collectionId}:${token.path}`;
}

// Matches the last qualifier:partial at the end of the query (no trailing space)
const ACTIVE_QUALIFIER_RE = /(type|has|value|desc|path|name|generated|gen|group|scope):(\S*)$/i;

/** If the query ends with a qualifier:partial pattern, return it for autocomplete. */
function detectActiveQualifier(q: string): { qualifier: string; partial: string } | null {
  const m = q.match(ACTIVE_QUALIFIER_RE);
  if (!m) return null;
  return { qualifier: m[1].toLowerCase(), partial: m[2] };
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
      if ((h === 'duplicate' || h === 'dup') && !t.isDuplicate) return false;
      if ((h === 'description' || h === 'desc') && !t.description) return false;
      if ((h === 'extension' || h === 'ext') && !t.hasExtensions) return false;
      if ((h === 'generated' || h === 'gen') && !t.generatorName) return false;
      if (h === 'unused' && !t.isUnused) return false;
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
    // generated: qualifier
    if (parsed.generators.length > 0) {
      if (!t.generatorName) return false;
      const gn = t.generatorName.toLowerCase();
      if (!parsed.generators.some(g => gn === g || gn.includes(g))) return false;
    }
    // scope: qualifier — token permits application to the category's Figma field
    if (parsed.scopes.length > 0) {
      if (!tokenMatchesScopeCategories(t.scopes, parsed.scopes)) return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CommandPalette({ commands, tokens = [], allSetTokens, starredTokens, recentTokens, onGoToToken, onGoToGroup, onCopyTokenPath, onCopyTokenCssVar, onCopyTokenRef, onCopyTokenValue, onDuplicateToken, onRenameToken, onDeleteToken, onMoveToken, onClose, initialQuery = '' }: CommandPaletteProps) {
  const [query, setQuery] = useState(initialQuery);
  const [activeIdx, setActiveIdx] = useState(0);
  const [visibleCount, setVisibleCount] = useState(100);
  const [showAllQualifiers, setShowAllQualifiers] = useState(false);
  const [searchAllSets, setSearchAllSets] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [recent] = useState<RecentEntry[]>(() => loadRecent());
  useFocusTrap(dialogRef, { initialFocusRef: inputRef });

  const copyWithFeedback = (label: string, action: () => void) => {
    action();
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    setCopiedLabel(label);
    copyTimerRef.current = setTimeout(() => {
      setCopiedLabel(null);
      onClose();
    }, 1400);
  };

  // Key handler for action buttons — Escape/arrows return focus to search input
  const handleActionButtonKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      inputRef.current?.focus();
    }
  };

  // Reset visible count when query changes
  useEffect(() => {
    setVisibleCount(100);
  }, [query]);

  // Token search mode: query starts with ">"
  const isTokenMode = query.startsWith('>');
  const tokenQuery = isTokenMode ? query.slice(1).trim() : '';

  // Active token list: all-sets or current-set
  const activeTokenList = searchAllSets && allSetTokens ? allSetTokens : tokens;

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
    || parsedTokenQuery.generators.length > 0 || parsedTokenQuery.scopes.length > 0;

  // Qualifier value autocomplete — detect qualifier:partial at end of query
  const activeQualifier = useMemo(() => (isTokenMode ? detectActiveQualifier(query) : null), [isTokenMode, query]);

  const qualifierCompletions = useMemo(() => {
    if (!activeQualifier || !isTokenMode) return [];
    return getQualifierCompletions(activeQualifier.qualifier, activeQualifier.partial, activeTokenList, groups);
  }, [activeQualifier, isTokenMode, activeTokenList, groups]);

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
      .map(t => ({
        t,
        score: Math.max(
          fuzzyScore(freeText, t.path),
          t.description ? fuzzyScore(freeText, t.description) : 0,
        ),
      }))
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
    if (recentCmds.length > 0) result.push({ header: 'Recently used', items: recentCmds });
    for (const [header, items] of [...categories.entries()].sort((a, b) => compareCommandSections(a[0], b[0]))) {
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
    if (!starredTokens?.length) return recentTokens;
    const starredSet = new Set(starredTokens.map(tokenEntryKey));
    return recentTokens.filter(t => !starredSet.has(tokenEntryKey(t)));
  }, [recentTokens, starredTokens]);

  const noQueryStarredTokens = useMemo(() => {
    if (isTokenMode || query.trim()) return [];
    return starredTokens ?? [];
  }, [isTokenMode, query, starredTokens]);

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
    // No-query mode: starred and recent token items come before commands
    const items: FlatItem[] = [];
    for (const t of noQueryStarredTokens) items.push({ kind: 'token', token: t });
    for (const t of noQueryRecentTokens) items.push({ kind: 'token', token: t });
    const cmdList = sectionFlatItems ?? filteredCommands;
    for (const cmd of cmdList) items.push({ kind: 'command', cmd });
    return items;
  }, [isTokenMode, filteredTokens, filteredGroups, filteredCommands, sectionFlatItems, noQueryStarredTokens, noQueryRecentTokens]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  const applyCompletion = (value: string) => {
    if (!activeQualifier) return;
    const qPrefix = activeQualifier.qualifier + ':';
    const insertAt = query.lastIndexOf(qPrefix + activeQualifier.partial);
    const before = query.slice(0, insertAt);
    setQuery(before + qPrefix + value + ' ');
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const executeCommand = (cmd: Command) => {
    saveRecent({ id: cmd.id, label: cmd.label });
    cmd.handler();
    onClose();
  };

  const executeToken = (token: TokenEntry) => {
    onGoToToken?.(token);
    onClose();
  };

  const executeGroup = (group: GroupEntry) => {
    onGoToGroup?.(group.path);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === '?' && !query) { e.preventDefault(); setShowHelp(v => !v); return; }
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
      className="fixed inset-0 bg-[var(--color-figma-overlay)] flex items-start justify-center z-50 pt-16"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={dialogRef}
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
              ? (searchAllSets ? 'Search all collections… (type:color, has:ref, path:brand)' : 'Search tokens… (type:color, has:ref, path:brand)')
              : 'Search expert actions… (type > for tokens)'}
            aria-label="Search commands"
            aria-autocomplete="list"
            className="flex-1 bg-transparent outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-figma-accent)] text-subheading text-[var(--color-figma-text)] placeholder-[var(--color-figma-text-secondary)]"
          />
          {isTokenMode && (
            <span className="text-secondary font-medium text-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 rounded px-1.5 py-0.5 shrink-0">
              TOKENS
            </span>
          )}
          {isTokenMode && (
            <button
              className={`text-secondary w-4 h-4 flex items-center justify-center rounded-full border transition-colors shrink-0 font-medium ${showHelp ? 'border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:border-[var(--color-figma-text-secondary)]'}`}
              onClick={() => setShowHelp(v => !v)}
              title="Filter syntax help (press ? when input is empty)"
              aria-label="Toggle filter syntax help"
              aria-pressed={showHelp}
            >
              ?
            </button>
          )}
          {copiedLabel ? (
            <span className="text-secondary font-medium text-[var(--color-figma-success)] bg-[var(--color-figma-success)]/10 rounded px-1.5 py-0.5 shrink-0 flex items-center gap-1">
              <svg aria-hidden="true" width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 6l3 3 5-5"/></svg>
              Copied {copiedLabel}
            </span>
          ) : (
            <kbd className="text-secondary text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] rounded px-1 py-0.5 shrink-0">
              ESC
            </kbd>
          )}
        </div>

        {!isTokenMode && !query.trim() && (
          <div className="px-3 py-1.5 border-b border-[var(--color-figma-border)] text-secondary text-[var(--color-figma-text-secondary)]">
            Power-user actions live here. Use the workspace tabs and Utilities menu for regular navigation.
          </div>
        )}

        {/* Qualifier hint chips — persistent reference row */}
        {isTokenMode && (
          <div className="px-3 py-1 border-b border-[var(--color-figma-border)] flex gap-1.5 flex-wrap items-center">
            <span className="text-secondary text-[var(--color-figma-text-secondary)] shrink-0 self-center opacity-60 mr-0.5">filters:</span>
            {(showAllQualifiers ? QUERY_QUALIFIERS : QUERY_QUALIFIERS.slice(0, 6)).map(q => (
              <button
                key={q.qualifier}
                className="text-secondary px-1.5 py-0.5 rounded bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors shrink-0"
                onClick={() => setQuery('>' + q.qualifier + (q.qualifier.endsWith(':') ? '' : ' '))}
                title={q.desc}
              >
                {q.qualifier}{q.example ? q.example.slice(q.qualifier.length) : ''}
              </button>
            ))}
            <button
              className="text-secondary px-1.5 py-0.5 rounded text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors shrink-0 opacity-60 hover:opacity-100"
              onClick={() => setShowAllQualifiers(v => !v)}
              title={showAllQualifiers ? 'Show fewer qualifiers' : `Show all ${QUERY_QUALIFIERS.length} qualifiers`}
            >
              {showAllQualifiers ? 'fewer' : `+${QUERY_QUALIFIERS.length - 6} more`}
            </button>
            {allSetTokens && (
              <button
                className={`ml-auto text-secondary px-1.5 py-0.5 rounded border transition-colors shrink-0 font-medium ${
                  searchAllSets
                    ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]'
                    : 'border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'
                }`}
                onClick={() => { setSearchAllSets(v => !v); setVisibleCount(100); }}
                title={searchAllSets ? 'Searching across collections — click to search only the working collection' : 'Search across all token collections'}
              >
                {searchAllSets ? 'Across collections' : 'Working collection only'}
              </button>
            )}
          </div>
        )}

        {/* Filter syntax cheatsheet — toggled by ? button or ? key */}
        {isTokenMode && showHelp && (
          <div className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]/40 px-3 py-2 overflow-y-auto" style={{ maxHeight: '220px' }}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-secondary font-semibold text-[var(--color-figma-text-secondary)]">Filter syntax</span>
              <button
                className="text-secondary text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] opacity-60 hover:opacity-100 transition-opacity"
                onClick={() => setShowHelp(false)}
              >
                close
              </button>
            </div>
            {/* Group: type & value */}
            <div className="mb-2">
              <div className="mb-1 text-secondary font-medium text-[var(--color-figma-text-secondary)] opacity-60">Type &amp; content</div>
              {[
                { qual: 'type:color', desc: 'Filter by token type (color, dimension, number, string…)', insert: '>type:' },
                { qual: 'value:#ff0000', desc: 'Tokens whose value contains the given string', insert: '>value:' },
                { qual: 'desc:primary', desc: 'Tokens whose description contains the given string', insert: '>desc:' },
              ].map(({ qual, desc, insert }) => (
                <button
                  key={qual}
                  className="w-full text-left flex items-center gap-2 py-0.5 group/row hover:bg-[var(--color-figma-bg-hover)] rounded px-1 -mx-1"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => { setQuery(insert); setShowHelp(false); setTimeout(() => inputRef.current?.focus(), 0); }}
                >
                  <code className="text-secondary text-[var(--color-figma-accent)] font-mono shrink-0 w-28">{qual}</code>
                  <span className="text-secondary text-[var(--color-figma-text-secondary)] group-hover/row:text-[var(--color-figma-text)]">{desc}</span>
                </button>
              ))}
            </div>
            {/* Group: path & name */}
            <div className="mb-2">
              <div className="mb-1 text-secondary font-medium text-[var(--color-figma-text-secondary)] opacity-60">Path &amp; name</div>
              {[
                { qual: 'path:colors.brand', desc: 'Tokens whose path starts with the given prefix', insert: '>path:' },
                { qual: 'name:500', desc: 'Tokens whose leaf name contains the given string', insert: '>name:' },
                { qual: 'group:colors', desc: 'Navigate directly to a token group', insert: '>group:' },
                { qual: 'generated:brand-palette', desc: 'Tokens produced by a specific generated group', insert: '>generated:' },
              ].map(({ qual, desc, insert }) => (
                <button
                  key={qual}
                  className="w-full text-left flex items-center gap-2 py-0.5 group/row hover:bg-[var(--color-figma-bg-hover)] rounded px-1 -mx-1"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => { setQuery(insert); setShowHelp(false); setTimeout(() => inputRef.current?.focus(), 0); }}
                >
                  <code className="text-secondary text-[var(--color-figma-accent)] font-mono shrink-0 w-28">{qual}</code>
                  <span className="text-secondary text-[var(--color-figma-text-secondary)] group-hover/row:text-[var(--color-figma-text)]">{desc}</span>
                </button>
              ))}
            </div>
            {/* Group: has: */}
            <div className="mb-1.5">
              <div className="mb-1 text-secondary font-medium text-[var(--color-figma-text-secondary)] opacity-60">Presence filters (has:)</div>
              <div className="grid grid-cols-2 gap-x-3">
                {[
                  { val: 'alias', desc: 'Reference tokens only' },
                  { val: 'direct', desc: 'Direct-value tokens only' },
                  { val: 'duplicate', desc: 'Tokens sharing a value' },
                  { val: 'description', desc: 'Tokens with a description' },
                  { val: 'extension', desc: 'Tokens with extensions' },
                  { val: 'generated', desc: 'Generator-managed tokens' },
                  { val: 'unused', desc: 'No Figma usage or dependents' },
                ].map(({ val, desc }) => (
                  <button
                    key={val}
                    className="text-left flex items-center gap-1.5 py-0.5 group/row hover:bg-[var(--color-figma-bg-hover)] rounded px-1 -mx-1"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => { setQuery(`>has:${val} `); setShowHelp(false); setTimeout(() => inputRef.current?.focus(), 0); }}
                  >
                    <code className="text-secondary text-[var(--color-figma-accent)] font-mono shrink-0">has:{val}</code>
                    <span className="text-secondary text-[var(--color-figma-text-secondary)] group-hover/row:text-[var(--color-figma-text)] truncate">{desc}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="pt-1 border-t border-[var(--color-figma-border)] text-secondary text-[var(--color-figma-text-secondary)] opacity-60">
              Combine qualifiers: <code className="font-mono">type:color has:alias path:brand</code>
            </div>
          </div>
        )}

        {/* Qualifier value autocomplete chips */}
        {qualifierCompletions.length > 0 && (
          <div className="px-3 py-1 border-b border-[var(--color-figma-border)] flex gap-1.5 flex-wrap items-center">
            <span className="text-secondary text-[var(--color-figma-text-secondary)] shrink-0 self-center opacity-60 mr-0.5">
              {activeQualifier?.qualifier}:
            </span>
            {qualifierCompletions.map(val => (
              <button
                key={val}
                className="text-secondary px-1.5 py-0.5 rounded bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/20 transition-colors shrink-0 font-mono"
                onMouseDown={e => e.preventDefault()}
                onClick={() => applyCompletion(val)}
                title={`Filter: ${activeQualifier?.qualifier}:${val}`}
              >
                {val}
              </button>
            ))}
          </div>
        )}

        {/* Results */}
        <div ref={listRef} className="overflow-y-auto flex-1" role="listbox" aria-label="Commands">
          {/* Token search mode */}
          {isTokenMode && (
            <>
              {(hasQualifiers || parsedTokenQuery.text || isGroupQuery) && (filteredTokens.length > 0 || filteredGroups.length > 0) && (
                <div className="px-3 py-1 text-secondary text-[var(--color-figma-text-secondary)] border-b border-[var(--color-figma-border)] flex items-center gap-1.5">
                  {isGroupQuery
                    ? <>{totalGroupMatches} group{totalGroupMatches !== 1 ? 's' : ''} matched</>
                    : <>{totalTokenMatches} token{totalTokenMatches !== 1 ? 's' : ''} matched{filteredGroups.length > 0 && <> + {totalGroupMatches} group{totalGroupMatches !== 1 ? 's' : ''}</>}</>
                  }
                  {searchAllSets && <span className="text-[var(--color-figma-accent)] opacity-70">across all collections</span>}
                </div>
              )}
              {filteredTokens.length === 0 && filteredGroups.length === 0 && (
                <div className="px-3 py-6 text-center text-body text-[var(--color-figma-text-secondary)]">
                  {tokenQuery
                    ? `No tokens or groups match "${tokenQuery}"${!searchAllSets && allSetTokens ? ' in this collection' : ''}`
                    : <>
                        Type a token path to search{searchAllSets ? ' across all collections' : ''}
                        <div className="mt-1.5 flex flex-col items-center gap-1">
                          <div className="flex gap-1.5 flex-wrap justify-center">
                            {['type:', 'has:alias', 'value:', 'path:', 'name:'].map(q => (
                              <button
                                key={q}
                                className="text-secondary px-1.5 py-0.5 rounded bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors font-mono"
                                onClick={() => { setQuery('>' + q); setTimeout(() => inputRef.current?.focus(), 0); }}
                              >
                                {q}
                              </button>
                            ))}
                          </div>
                          <button
                            className="text-secondary text-[var(--color-figma-accent)] hover:underline opacity-70 hover:opacity-100"
                            onClick={() => setShowHelp(true)}
                          >
                            see all filters
                          </button>
                        </div>
                      </>
                  }
                  {tokenQuery && !searchAllSets && allSetTokens && (
                    <div className="mt-1.5">
                      <button
                        className="text-secondary text-[var(--color-figma-accent)] hover:underline"
                        onClick={() => { setSearchAllSets(true); setVisibleCount(100); }}
                      >
                        Search all collections
                      </button>
                    </div>
                  )}
                </div>
              )}
              {/* Group results */}
              {filteredGroups.length > 0 && !isGroupQuery && (
                <div className="px-3 pt-1.5 pb-0.5 text-secondary font-medium text-[var(--color-figma-text-tertiary)]">
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
                    <span className={`text-secondary px-1 py-0.5 rounded shrink-0 font-medium ${flatIdx === activeIdx ? 'bg-white/20 text-white' : 'bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]'}`}>
                      group
                    </span>
                    <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                    </svg>
                    <span className="text-body font-mono truncate">{group.path}</span>
                    <span className={`text-secondary shrink-0 ml-auto ${flatIdx === activeIdx ? 'text-white/60' : 'text-[var(--color-figma-text-secondary)]'}`}>
                      {group.childCount} token{group.childCount !== 1 ? 's' : ''}
                    </span>
                  </button>
                );
              })}
              {/* Token results */}
              {filteredTokens.length > 0 && filteredGroups.length > 0 && !isGroupQuery && (
                <div className="px-3 pt-1.5 pb-0.5 text-secondary font-medium text-[var(--color-figma-text-tertiary)]">
                  Tokens
                </div>
              )}
              {filteredTokens.map((token, idx) => {
                const flatIdx = filteredGroups.length + idx; // tokens come after groups
                return (
                <div key={tokenEntryKey(token)} className="flex items-center gap-0" data-palette-item>
                  <button
                    role="option"
                    aria-selected={flatIdx === activeIdx}
                    className={`flex-1 text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${flatIdx === activeIdx ? 'bg-[var(--color-figma-accent)] text-white' : 'text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'}`}
                    onMouseEnter={() => setActiveIdx(flatIdx)}
                    onClick={() => executeToken(token)}
                  >
                    <span className={`text-secondary px-1 py-0.5 rounded shrink-0 font-medium ${flatIdx === activeIdx ? 'bg-white/20 text-white' : 'bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]'}`}>
                      {token.type}
                    </span>
                    {token.type === 'color' && typeof token.value === 'string' && token.value ? (
                      <span
                        className="w-3 h-3 rounded-full shrink-0 border border-black/10"
                        style={{ backgroundColor: swatchBgColor(token.value) }}
                        title={token.value}
                      />
                    ) : token.value != null && token.value !== '' && token.type !== 'color' ? (
                      <span className={`text-secondary shrink-0 font-mono ${flatIdx === activeIdx ? 'text-white/70' : 'text-[var(--color-figma-text-secondary)]'}`} title={token.value}>
                        {token.value.length > 20 ? token.value.slice(0, 20) + '…' : token.value}
                      </span>
                    ) : null}
                    <span className="text-body font-mono truncate">{token.path}</span>
                    {token.set && (
                      <span className={`text-secondary px-1 py-0.5 rounded shrink-0 font-medium ml-auto ${flatIdx === activeIdx ? 'bg-white/20 text-white/70' : 'bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]'}`}>
                        {token.set}
                      </span>
                    )}
                  </button>
                  {onCopyTokenPath && (
                    <button
                      tabIndex={flatIdx === activeIdx ? 0 : -1}
                      title={`Copy path: ${token.path}`}
                      className={`px-2 py-1.5 text-secondary shrink-0 transition-colors ${flatIdx === activeIdx ? 'text-white/70 hover:text-white focus:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30' : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]'}`}
                      onClick={(e) => { e.stopPropagation(); copyWithFeedback('Path', () => onCopyTokenPath(token.path)); }}
                      onFocus={() => setActiveIdx(flatIdx)}
                      onKeyDown={handleActionButtonKeyDown}
                    >
                      Path
                    </button>
                  )}
                  {onCopyTokenRef && (
                    <button
                      tabIndex={flatIdx === activeIdx ? 0 : -1}
                      title={`Copy DTCG alias: {${token.path}}`}
                      className={`px-2 py-1.5 text-secondary shrink-0 transition-colors ${flatIdx === activeIdx ? 'text-white/70 hover:text-white focus:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30' : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]'}`}
                      onClick={(e) => { e.stopPropagation(); copyWithFeedback('{ref}', () => onCopyTokenRef(token.path)); }}
                      onFocus={() => setActiveIdx(flatIdx)}
                      onKeyDown={handleActionButtonKeyDown}
                    >
                      {'{ref}'}
                    </button>
                  )}
                  {onCopyTokenValue && token.value != null && (
                    <button
                      tabIndex={flatIdx === activeIdx ? 0 : -1}
                      title={`Copy raw value: ${token.value}`}
                      className={`px-2 py-1.5 text-secondary shrink-0 transition-colors ${flatIdx === activeIdx ? 'text-white/70 hover:text-white focus:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30' : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]'}`}
                      onClick={(e) => { e.stopPropagation(); copyWithFeedback('Val', () => onCopyTokenValue(token.value!)); }}
                      onFocus={() => setActiveIdx(flatIdx)}
                      onKeyDown={handleActionButtonKeyDown}
                    >
                      Val
                    </button>
                  )}
                  {onCopyTokenCssVar && (
                    <button
                      tabIndex={flatIdx === activeIdx ? 0 : -1}
                      title={`Copy CSS var: ${tokenCssVar(token.path)}`}
                      className={`px-2 py-1.5 text-secondary shrink-0 transition-colors ${flatIdx === activeIdx ? 'text-white/70 hover:text-white focus:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30' : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]'}`}
                      onClick={(e) => { e.stopPropagation(); copyWithFeedback('CSS', () => onCopyTokenCssVar(token.path)); }}
                      onFocus={() => setActiveIdx(flatIdx)}
                      onKeyDown={handleActionButtonKeyDown}
                    >
                      CSS
                    </button>
                  )}
                  {onDuplicateToken && (
                    <button
                      tabIndex={flatIdx === activeIdx ? 0 : -1}
                      title={`Create from this token: ${token.path}`}
                      className={`px-2 py-1.5 text-secondary shrink-0 transition-colors ${flatIdx === activeIdx ? 'text-white/70 hover:text-white focus:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30' : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]'}`}
                      onClick={(e) => { e.stopPropagation(); onDuplicateToken(token); onClose(); }}
                      onFocus={() => setActiveIdx(flatIdx)}
                      onKeyDown={handleActionButtonKeyDown}
                    >
                      New
                    </button>
                  )}
                  {onRenameToken && (
                    <button
                      tabIndex={flatIdx === activeIdx ? 0 : -1}
                      title={`Rename token: ${token.path}`}
                      className={`px-2 py-1.5 text-secondary shrink-0 transition-colors ${flatIdx === activeIdx ? 'text-white/70 hover:text-white focus:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30' : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]'}`}
                      onClick={(e) => { e.stopPropagation(); onRenameToken(token); onClose(); }}
                      onFocus={() => setActiveIdx(flatIdx)}
                      onKeyDown={handleActionButtonKeyDown}
                    >
                      Ren
                    </button>
                  )}
                  {onMoveToken && (
                    <button
                      tabIndex={flatIdx === activeIdx ? 0 : -1}
                      title={`Move to collection: ${token.path}`}
                      className={`px-2 py-1.5 text-secondary shrink-0 transition-colors ${flatIdx === activeIdx ? 'text-white/70 hover:text-white focus:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30' : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]'}`}
                      onClick={(e) => { e.stopPropagation(); onMoveToken(token); onClose(); }}
                      onFocus={() => setActiveIdx(flatIdx)}
                      onKeyDown={handleActionButtonKeyDown}
                    >
                      Mov
                    </button>
                  )}
                  {onDeleteToken && (
                    <button
                      tabIndex={flatIdx === activeIdx ? 0 : -1}
                      title={`Delete token: ${token.path}`}
                      className={`px-2 py-1.5 text-secondary shrink-0 transition-colors ${flatIdx === activeIdx ? 'text-[var(--color-figma-error)] hover:text-[var(--color-figma-error)] focus:text-[var(--color-figma-error)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-figma-error)]/30' : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)]'}`}
                      onClick={(e) => { e.stopPropagation(); onDeleteToken(token); onClose(); }}
                      onFocus={() => setActiveIdx(flatIdx)}
                      onKeyDown={handleActionButtonKeyDown}
                    >
                      Del
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
                    <span className="text-secondary text-[var(--color-figma-text-secondary)]">
                      {shown} of {total} shown
                    </span>
                    <button
                      className="text-secondary text-[var(--color-figma-accent)] hover:underline"
                      onClick={() => setVisibleCount(c => c + 100)}
                    >
                      Load 100 more
                    </button>
                  </div>
                );
              })()}
            </>
          )}

          {/* Starred tokens quick-access (no query) */}
          {noQueryStarredTokens.length > 0 && (
            <div>
              <div className="px-3 pt-2 pb-0.5 text-secondary font-medium text-[var(--color-figma-text-tertiary)] flex items-center gap-1.5">
                <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                Starred
              </div>
              {noQueryStarredTokens.map((token, idx) => {
                const flatIdx = idx;
                return (
                  <button
                    key={'star:' + tokenEntryKey(token)}
                    role="option"
                    aria-selected={flatIdx === activeIdx}
                    data-palette-item
                    className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${flatIdx === activeIdx ? 'bg-[var(--color-figma-accent)] text-white' : 'text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'}`}
                    onMouseEnter={() => setActiveIdx(flatIdx)}
                    onClick={() => executeToken(token)}
                  >
                    <span className={`text-secondary px-1 py-0.5 rounded shrink-0 font-medium ${flatIdx === activeIdx ? 'bg-white/20 text-white' : 'bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]'}`}>
                      {token.type}
                    </span>
                    {token.type === 'color' && token.value ? (
                      <span className="w-3 h-3 rounded-full shrink-0 border border-black/10" style={{ backgroundColor: swatchBgColor(token.value) }} />
                    ) : null}
                    <span className="text-body font-mono truncate flex-1">{token.path}</span>
                    {token.set && (
                      <span className={`text-secondary px-1 py-0.5 rounded shrink-0 font-medium ${flatIdx === activeIdx ? 'bg-white/20 text-white/70' : 'bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]'}`}>
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
              <div className="px-3 pt-2 pb-0.5 text-secondary font-medium text-[var(--color-figma-text-tertiary)] flex items-center gap-1.5">
                <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                Recently Edited
              </div>
              {noQueryRecentTokens.map((token, idx) => {
                const flatIdx = noQueryStarredTokens.length + idx;
                return (
                  <button
                    key={'rec:' + tokenEntryKey(token)}
                    role="option"
                    aria-selected={flatIdx === activeIdx}
                    data-palette-item
                    className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${flatIdx === activeIdx ? 'bg-[var(--color-figma-accent)] text-white' : 'text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'}`}
                    onMouseEnter={() => setActiveIdx(flatIdx)}
                    onClick={() => executeToken(token)}
                  >
                    <span className={`text-secondary px-1 py-0.5 rounded shrink-0 font-medium ${flatIdx === activeIdx ? 'bg-white/20 text-white' : 'bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]'}`}>
                      {token.type}
                    </span>
                    {token.type === 'color' && token.value ? (
                      <span className="w-3 h-3 rounded-full shrink-0 border border-black/10" style={{ backgroundColor: swatchBgColor(token.value) }} />
                    ) : null}
                    <span className="text-body font-mono truncate flex-1">{token.path}</span>
                    {token.set && (
                      <span className={`text-secondary px-1 py-0.5 rounded shrink-0 font-medium ${flatIdx === activeIdx ? 'bg-white/20 text-white/70' : 'bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]'}`}>
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
            let runningIdx = noQueryStarredTokens.length + noQueryRecentTokens.length;
            return sections.map(section => (
              <div key={section.header}>
                <div className="px-3 pt-2 pb-0.5 text-secondary font-medium text-[var(--color-figma-text-tertiary)]">
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
                      <div className="flex min-w-0 flex-1 flex-col gap-0">
                        <span className="text-body font-medium">{cmd.label}</span>
                        {cmd.description && (
                          <span title={cmd.description} className={`text-secondary truncate ${flatIdx === activeIdx ? 'text-white/70' : 'text-[var(--color-figma-text-secondary)]'}`}>
                            {cmd.description}
                          </span>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {section.header === 'Recently used' && cmd.category && (
                          <span className={`text-secondary ${flatIdx === activeIdx ? 'text-white/60' : 'text-[var(--color-figma-text-tertiary)]'}`}>
                            {cmd.category}
                          </span>
                        )}
                        {cmd.shortcut && (
                          <kbd className={`text-secondary border rounded px-1 py-0.5 ${flatIdx === activeIdx ? 'border-white/30 bg-white/10 text-white/80' : 'border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]'}`}>
                            {cmd.shortcut}
                          </kbd>
                        )}
                      </div>
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
                <div className="px-3 py-6 text-center text-body text-[var(--color-figma-text-secondary)]">
                  <div>No commands match &ldquo;{query}&rdquo;</div>
                  <div className="mt-1 text-secondary opacity-70">Try <kbd className="font-mono bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] rounded px-1">&gt;</kbd> to search tokens by path</div>
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
                    <span className="text-body font-medium">{cmd.label}</span>
                    {cmd.description && (
                      <span title={cmd.description} className={`text-secondary truncate ${idx === activeIdx ? 'text-white/70' : 'text-[var(--color-figma-text-secondary)]'}`}>
                        {cmd.description}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {cmd.category && (
                      <span className={`text-secondary ${idx === activeIdx ? 'text-white/60' : 'text-[var(--color-figma-text-tertiary)]'}`}>
                        {cmd.category}
                      </span>
                    )}
                    {cmd.shortcut && (
                      <kbd className={`text-secondary border rounded px-1 py-0.5 ${idx === activeIdx ? 'border-white/30 bg-white/10 text-white/80' : 'border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]'}`}>
                        {cmd.shortcut}
                      </kbd>
                    )}
                  </div>
                </button>
              ))}
            </>
          )}
        </div>

        {/* Footer hints */}
        <div className="px-3 py-1.5 border-t border-[var(--color-figma-border)] flex gap-3 text-secondary text-[var(--color-figma-text-secondary)]">
          {isTokenMode ? (
            <>
              <span>↑↓ navigate</span>
              <span>↵ go to token/group</span>
              {searchAllSets
                ? <span className="text-[var(--color-figma-accent)] opacity-80">searching all collections</span>
                : <button className="opacity-60 hover:opacity-100 hover:text-[var(--color-figma-accent)] transition-colors" onClick={() => setShowHelp(v => !v)} title="Toggle filter syntax help">type: has: value: path: name: group: <span className="opacity-60">(?)</span></button>
              }
              <span>ESC close</span>
            </>
          ) : (
            <>
              <span>↑↓ navigate</span>
              <span>↵ select</span>
              <span>type &gt; for token search</span>
              <span>ESC close</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
