import { useState, useEffect, useRef, useMemo } from 'react';
import { Braces, Code2, Copy, FolderInput, Pencil, Plus, Trash2, Variable } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { STORAGE_KEYS, lsGetJson, lsSet } from '../shared/storage';
import { swatchBgColor } from '../shared/colorUtils';
import type { CommandPaletteToken } from '../shared/commandPaletteTokens';
import {
  parseStructuredQuery,
  getQualifierCompletions,
  tokenMatchesScopeCategories,
} from './tokenListUtils';
import type { ParsedQuery } from './tokenListUtils';
import { fuzzyScore } from '../shared/fuzzyMatch';

// ---------------------------------------------------------------------------
// Recent actions — persist to localStorage
// ---------------------------------------------------------------------------

const RECENT_MAX = 5;
const COMMAND_SECTION_ORDER = ['Tokens', 'Collections', 'Views', 'Apply', 'Modes', 'Review', 'History', 'Publish', 'Export', 'Help'] as const;

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
  collectionLabels: string[];
}

interface CommandPaletteProps {
  commands: Command[];
  tokens?: TokenEntry[];
  allCollectionTokens?: TokenEntry[];
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
const ACTIVE_QUALIFIER_RE = /(type|has|value|desc|path|name|group|scope):(\S*)$/i;

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

export function CommandPalette({ commands, tokens = [], allCollectionTokens, starredTokens, recentTokens, onGoToToken, onGoToGroup, onCopyTokenPath, onCopyTokenCssVar, onCopyTokenRef, onCopyTokenValue, onDuplicateToken, onRenameToken, onDeleteToken, onMoveToken, onClose, initialQuery = '' }: CommandPaletteProps) {
  const [query, setQuery] = useState(initialQuery);
  const [activeIdx, setActiveIdx] = useState(0);
  const [visibleCount, setVisibleCount] = useState(100);
  const [searchAllCollections, setSearchAllSets] = useState(false);
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

  // Active token list: all-collections or current-collection
  const activeTokenList = searchAllCollections && allCollectionTokens ? allCollectionTokens : tokens;

  // Derive unique group paths from tokens
  const groups: GroupEntry[] = useMemo(() => {
    if (!activeTokenList.length) return [];
    const groupMap = new Map<string, { count: number; collectionLabels: Set<string> }>();
    for (const t of activeTokenList) {
      const parts = t.path.split('.');
      // Build every ancestor group path (all but the leaf)
      for (let i = 1; i < parts.length; i++) {
        const gp = parts.slice(0, i).join('.');
        let entry = groupMap.get(gp);
        if (!entry) { entry = { count: 0, collectionLabels: new Set() }; groupMap.set(gp, entry); }
        entry.count++;
        if (t.collectionLabel) entry.collectionLabels.add(t.collectionLabel);
      }
    }
    return Array.from(groupMap.entries())
      .map(([path, { count, collectionLabels }]) => ({ path, childCount: count, collectionLabels: Array.from(collectionLabels) }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }, [activeTokenList]);

  // Parse structured qualifiers from the token query
  const parsedTokenQuery = useMemo(() => parseStructuredQuery(tokenQuery), [tokenQuery]);
  const hasQualifiers = parsedTokenQuery.types.length > 0 || parsedTokenQuery.has.length > 0
    || parsedTokenQuery.values.length > 0 || parsedTokenQuery.paths.length > 0
    || parsedTokenQuery.names.length > 0 || parsedTokenQuery.descs.length > 0
    || parsedTokenQuery.scopes.length > 0;

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
    // Free text fuzzy matching on the qualifier-filtered collection
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

  const openTokenQuery = (nextQuery: string) => {
    setQuery(nextQuery);
    setShowHelp(false);
    window.setTimeout(() => inputRef.current?.focus(), 0);
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
        className="mx-3 flex w-full max-w-[560px] flex-col rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-[var(--shadow-dialog)]"
        style={{ maxHeight: '60vh' }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--color-figma-border)]">
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-[color:var(--color-figma-text-secondary)] shrink-0">
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
              ? (searchAllCollections ? 'Search all collections' : 'Search tokens')
              : 'Search actions or type > for tokens'}
            aria-label="Search commands"
            aria-autocomplete="list"
            className="min-w-0 flex-1 bg-transparent outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-figma-accent)] text-subheading text-[color:var(--color-figma-text)] placeholder-[var(--color-figma-text-secondary)]"
          />
          {isTokenMode && (
            <span className="text-secondary font-medium text-[color:var(--color-figma-text-accent)] bg-[var(--color-figma-accent)]/10 rounded px-1.5 py-0.5 shrink-0">
              TOKENS
            </span>
          )}
          {isTokenMode && (
            <button
              className={`text-secondary w-5 h-5 flex items-center justify-center rounded-full border transition-colors shrink-0 font-medium ${showHelp ? 'border-[var(--color-figma-accent)] text-[color:var(--color-figma-text-accent)] bg-[var(--color-figma-accent)]/10' : 'border-[var(--color-figma-border)] text-[color:var(--color-figma-text-secondary)] hover:text-[color:var(--color-figma-text)] hover:border-[var(--color-figma-text-secondary)]'}`}
              onClick={() => setShowHelp(v => !v)}
              title="Filter syntax help (press ? when input is empty)"
              aria-label="Toggle filter syntax help"
              aria-pressed={showHelp}
            >
              ?
            </button>
          )}
          {isTokenMode && allCollectionTokens && (
            <button
              className={`text-secondary shrink-0 rounded px-1.5 py-0.5 transition-colors ${
                searchAllCollections
                  ? 'bg-[var(--color-figma-accent)]/10 text-[color:var(--color-figma-text-accent)]'
                  : 'text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)]'
              }`}
              onClick={() => { setSearchAllSets(v => !v); setVisibleCount(100); }}
              title={searchAllCollections ? 'Searching across all collections' : 'Search only the working collection'}
            >
              {searchAllCollections ? 'All collections' : 'This collection'}
            </button>
          )}
          {copiedLabel ? (
            <span className="text-secondary font-medium text-[color:var(--color-figma-text-success)] bg-[var(--color-figma-success)]/10 rounded px-1.5 py-0.5 shrink-0 flex items-center gap-1">
              <svg aria-hidden="true" width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 6l3 3 5-5"/></svg>
              Copied {copiedLabel}
            </span>
          ) : (
            <kbd className="text-secondary text-[color:var(--color-figma-text-secondary)] bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] rounded px-1 py-0.5 shrink-0">
              ESC
            </kbd>
          )}
        </div>

        {/* Filter syntax cheatsheet — toggled by ? button or ? key */}
        {isTokenMode && showHelp && (
          <div className="bg-[var(--color-figma-bg-secondary)]/40 px-3 py-2 overflow-y-auto" style={{ maxHeight: 'min(220px, 40vh)' }}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-secondary font-semibold text-[color:var(--color-figma-text-secondary)]">Filter syntax</span>
              <button
                className="text-secondary text-[color:var(--color-figma-text-secondary)] hover:text-[color:var(--color-figma-text)] opacity-60 hover:opacity-100 transition-opacity"
                onClick={() => setShowHelp(false)}
              >
                close
              </button>
            </div>
            <div className="grid gap-1.5">
              {[
                { qual: 'type:color', desc: 'Filter by token type.', insert: '>type:' },
                { qual: 'path:brand', desc: 'Match a path prefix or segment.', insert: '>path:' },
                { qual: 'name:500', desc: 'Match only the leaf token name.', insert: '>name:' },
                { qual: 'value:#ff0000', desc: 'Find matching values.', insert: '>value:' },
                { qual: 'has:alias', desc: 'Show references only.', insert: '>has:alias ' },
                { qual: 'group:colors', desc: 'Jump straight to a group.', insert: '>group:' },
              ].map(({ qual, desc, insert }) => (
                <button
                  key={qual}
                  className="flex min-w-0 items-center gap-2 rounded px-1.5 py-1 text-left transition-colors hover:bg-[var(--color-figma-bg-hover)]"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => openTokenQuery(insert)}
                >
                  <code className="min-w-[96px] shrink-0 font-mono text-[color:var(--color-figma-text-accent)]">
                    {qual}
                  </code>
                  <span className="min-w-0 text-secondary text-[color:var(--color-figma-text-secondary)]">
                    {desc}
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-1.5 text-secondary text-[color:var(--color-figma-text-tertiary)]">
              Combine qualifiers: <code className="font-mono">type:color has:alias path:brand</code>
            </div>
          </div>
        )}

        {/* Qualifier value autocomplete chips */}
        {qualifierCompletions.length > 0 && (
          <div className="px-3 py-1 flex gap-1.5 flex-wrap items-center">
            <span className="text-secondary text-[color:var(--color-figma-text-secondary)] shrink-0 self-center opacity-60 mr-0.5">
              {activeQualifier?.qualifier}:
            </span>
            {qualifierCompletions.map(val => (
              <button
                key={val}
                className="text-secondary px-1.5 py-0.5 rounded bg-[var(--color-figma-accent)]/10 text-[color:var(--color-figma-text-accent)] hover:bg-[var(--color-figma-accent)]/20 transition-colors shrink-0 font-mono"
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
                <div className="px-3 py-1 text-secondary text-[color:var(--color-figma-text-tertiary)] flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  <span className="whitespace-nowrap">
                    {isGroupQuery
                      ? <>{totalGroupMatches} group{totalGroupMatches !== 1 ? 's' : ''} matched</>
                      : <>{totalTokenMatches} token{totalTokenMatches !== 1 ? 's' : ''} matched{filteredGroups.length > 0 && <> + {totalGroupMatches} group{totalGroupMatches !== 1 ? 's' : ''}</>}</>
                    }
                  </span>
                  {searchAllCollections && <span className="whitespace-nowrap text-[color:var(--color-figma-text-accent)] opacity-70">across all collections</span>}
                </div>
              )}
              {filteredTokens.length === 0 && filteredGroups.length === 0 && (
                <div className="px-3 py-6 text-center text-body text-[color:var(--color-figma-text-secondary)]">
                  {tokenQuery
                    ? `No tokens or groups match "${tokenQuery}"${!searchAllCollections && allCollectionTokens ? ' in this collection' : ''}`
                    : <>
                        Type a token path or open filter help.
                        <div className="mt-1.5">
                          <button
                            className="text-secondary text-[color:var(--color-figma-text-accent)] hover:underline"
                            onClick={() => setShowHelp(true)}
                          >
                            Show token filters
                          </button>
                        </div>
                      </>
                  }
                  {tokenQuery && !searchAllCollections && allCollectionTokens && (
                    <div className="mt-1.5">
                      <button
                        className="text-secondary text-[color:var(--color-figma-text-accent)] hover:underline"
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
                <div className="px-3 pt-1.5 pb-0.5 text-secondary font-medium text-[color:var(--color-figma-text-tertiary)]">
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
                    className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${flatIdx === activeIdx ? 'bg-[var(--color-figma-action-bg)] text-[color:var(--color-figma-text-onbrand)]' : 'text-[color:var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'}`}
                    onMouseEnter={() => setActiveIdx(flatIdx)}
                    onClick={() => executeGroup(group)}
                  >
                    <span className={`text-secondary px-1 py-0.5 rounded shrink-0 font-medium ${flatIdx === activeIdx ? 'bg-white/20 text-white' : 'bg-[var(--color-figma-bg-secondary)] text-[color:var(--color-figma-text-secondary)]'}`}>
                      group
                    </span>
                    <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                    </svg>
                    <span className="text-body font-mono truncate min-w-0 flex-1">{group.path}</span>
                    <span className={`text-secondary shrink-0 whitespace-nowrap ${flatIdx === activeIdx ? 'text-white/60' : 'text-[color:var(--color-figma-text-secondary)]'}`}>
                      {group.childCount} token{group.childCount !== 1 ? 's' : ''}
                    </span>
                  </button>
                );
              })}
              {/* Token results */}
              {filteredTokens.length > 0 && filteredGroups.length > 0 && !isGroupQuery && (
                <div className="px-3 pt-1.5 pb-0.5 text-secondary font-medium text-[color:var(--color-figma-text-tertiary)]">
                  Tokens
                </div>
              )}
              {filteredTokens.map((token, idx) => {
                const flatIdx = filteredGroups.length + idx; // tokens come after groups
                const isActive = flatIdx === activeIdx;
                const actionBtnClass = `p-1.5 shrink-0 transition-colors ${isActive ? 'text-white/70 hover:text-white focus:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30' : 'text-[color:var(--color-figma-text-secondary)] hover:text-[color:var(--color-figma-text)]'}`;
                const deleteBtnClass = `p-1.5 shrink-0 transition-colors ${isActive ? 'text-[color:var(--color-figma-text-error)] hover:text-[color:var(--color-figma-text-error)] focus:text-[color:var(--color-figma-text-error)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-figma-error)]/30' : 'text-[color:var(--color-figma-text-secondary)] hover:text-[color:var(--color-figma-text-error)]'}`;
                return (
                <div
                  key={tokenEntryKey(token)}
                  className={`group flex items-center gap-0 transition-colors ${isActive ? 'bg-[var(--color-figma-action-bg)]' : ''}`}
                  data-palette-item
                >
                  <button
                    role="option"
                    aria-selected={isActive}
                    className={`min-w-0 flex-1 text-left pl-3 pr-2 py-1.5 flex items-center gap-2 ${isActive ? 'text-white' : 'text-[color:var(--color-figma-text)]'}`}
                    onMouseEnter={() => setActiveIdx(flatIdx)}
                    onClick={() => executeToken(token)}
                  >
                    <span className={`text-secondary px-1 py-0.5 rounded shrink-0 font-medium ${isActive ? 'bg-white/20 text-white' : 'bg-[var(--color-figma-bg-secondary)] text-[color:var(--color-figma-text-secondary)]'}`}>
                      {token.type}
                    </span>
                    {token.type === 'color' && typeof token.value === 'string' && token.value ? (
                      <span
                        className="w-3 h-3 rounded-full shrink-0 border border-black/10"
                        style={{ backgroundColor: swatchBgColor(token.value) }}
                        title={token.value}
                      />
                    ) : token.value != null && token.value !== '' && token.type !== 'color' ? (
                      <span className={`text-secondary shrink-0 font-mono ${isActive ? 'text-white/70' : 'text-[color:var(--color-figma-text-secondary)]'}`} title={token.value}>
                        {token.value.length > 20 ? token.value.slice(0, 20) + '…' : token.value}
                      </span>
                    ) : null}
                    <span className="text-body font-mono truncate min-w-0 flex-1">{token.path}</span>
                    {searchAllCollections && token.collectionLabel && (
                      <span className={`text-secondary px-1 py-0.5 rounded shrink-0 font-medium max-w-[40%] truncate ${isActive ? 'bg-white/20 text-white/70' : 'bg-[var(--color-figma-bg-secondary)] text-[color:var(--color-figma-text-secondary)]'}`}>
                        {token.collectionLabel}
                      </span>
                    )}
                  </button>
                  <div
                    className={`flex shrink-0 items-center pr-1 transition-opacity ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}
                  >
                    {onCopyTokenPath && (
                      <button
                        tabIndex={isActive ? 0 : -1}
                        aria-label={`Copy path: ${token.path}`}
                        title={`Copy path: ${token.path}`}
                        className={actionBtnClass}
                        onClick={(e) => { e.stopPropagation(); copyWithFeedback('Path', () => onCopyTokenPath(token.path)); }}
                        onFocus={() => setActiveIdx(flatIdx)}
                        onKeyDown={handleActionButtonKeyDown}
                      >
                        <Copy size={11} strokeWidth={2} aria-hidden />
                      </button>
                    )}
                    {onCopyTokenRef && (
                      <button
                        tabIndex={isActive ? 0 : -1}
                        aria-label={`Copy DTCG alias: {${token.path}}`}
                        title={`Copy DTCG alias: {${token.path}}`}
                        className={actionBtnClass}
                        onClick={(e) => { e.stopPropagation(); copyWithFeedback('{ref}', () => onCopyTokenRef(token.path)); }}
                        onFocus={() => setActiveIdx(flatIdx)}
                        onKeyDown={handleActionButtonKeyDown}
                      >
                        <Braces size={11} strokeWidth={2} aria-hidden />
                      </button>
                    )}
                    {onCopyTokenValue && token.value != null && (
                      <button
                        tabIndex={isActive ? 0 : -1}
                        aria-label={`Copy raw value: ${token.value}`}
                        title={`Copy raw value: ${token.value}`}
                        className={actionBtnClass}
                        onClick={(e) => { e.stopPropagation(); copyWithFeedback('Val', () => onCopyTokenValue(token.value!)); }}
                        onFocus={() => setActiveIdx(flatIdx)}
                        onKeyDown={handleActionButtonKeyDown}
                      >
                        <Code2 size={11} strokeWidth={2} aria-hidden />
                      </button>
                    )}
                    {onCopyTokenCssVar && (
                      <button
                        tabIndex={isActive ? 0 : -1}
                        aria-label={`Copy CSS var: ${tokenCssVar(token.path)}`}
                        title={`Copy CSS var: ${tokenCssVar(token.path)}`}
                        className={actionBtnClass}
                        onClick={(e) => { e.stopPropagation(); copyWithFeedback('CSS', () => onCopyTokenCssVar(token.path)); }}
                        onFocus={() => setActiveIdx(flatIdx)}
                        onKeyDown={handleActionButtonKeyDown}
                      >
                        <Variable size={11} strokeWidth={2} aria-hidden />
                      </button>
                    )}
                    {onDuplicateToken && (
                      <button
                        tabIndex={isActive ? 0 : -1}
                        aria-label={`Create from this token: ${token.path}`}
                        title={`Create from this token: ${token.path}`}
                        className={actionBtnClass}
                        onClick={(e) => { e.stopPropagation(); onDuplicateToken(token); onClose(); }}
                        onFocus={() => setActiveIdx(flatIdx)}
                        onKeyDown={handleActionButtonKeyDown}
                      >
                        <Plus size={11} strokeWidth={2} aria-hidden />
                      </button>
                    )}
                    {onRenameToken && (
                      <button
                        tabIndex={isActive ? 0 : -1}
                        aria-label={`Rename token: ${token.path}`}
                        title={`Rename token: ${token.path}`}
                        className={actionBtnClass}
                        onClick={(e) => { e.stopPropagation(); onRenameToken(token); onClose(); }}
                        onFocus={() => setActiveIdx(flatIdx)}
                        onKeyDown={handleActionButtonKeyDown}
                      >
                        <Pencil size={11} strokeWidth={2} aria-hidden />
                      </button>
                    )}
                    {onMoveToken && (
                      <button
                        tabIndex={isActive ? 0 : -1}
                        aria-label={`Move to collection: ${token.path}`}
                        title={`Move to collection: ${token.path}`}
                        className={actionBtnClass}
                        onClick={(e) => { e.stopPropagation(); onMoveToken(token); onClose(); }}
                        onFocus={() => setActiveIdx(flatIdx)}
                        onKeyDown={handleActionButtonKeyDown}
                      >
                        <FolderInput size={11} strokeWidth={2} aria-hidden />
                      </button>
                    )}
                    {onDeleteToken && (
                      <button
                        tabIndex={isActive ? 0 : -1}
                        aria-label={`Delete token: ${token.path}`}
                        title={`Delete token: ${token.path}`}
                        className={deleteBtnClass}
                        onClick={(e) => { e.stopPropagation(); onDeleteToken(token); onClose(); }}
                        onFocus={() => setActiveIdx(flatIdx)}
                        onKeyDown={handleActionButtonKeyDown}
                      >
                        <Trash2 size={11} strokeWidth={2} aria-hidden />
                      </button>
                    )}
                  </div>
                </div>
                );
              })}
              {(() => {
                const total = isGroupQuery ? totalGroupMatches : totalTokenMatches;
                const shown = isGroupQuery ? filteredGroups.length : filteredTokens.length;
                if (total <= shown) return null;
                return (
                  <div className="px-3 py-2 flex items-center justify-between border-t border-[var(--color-figma-border)]">
                    <span className="text-secondary text-[color:var(--color-figma-text-secondary)]">
                      {shown} of {total} shown
                    </span>
                    <button
                      className="text-secondary text-[color:var(--color-figma-text-accent)] hover:underline"
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
              <div className="px-3 pt-2 pb-0.5 text-secondary font-medium text-[color:var(--color-figma-text-tertiary)] flex items-center gap-1.5">
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
                    className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${flatIdx === activeIdx ? 'bg-[var(--color-figma-action-bg)] text-[color:var(--color-figma-text-onbrand)]' : 'text-[color:var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'}`}
                    onMouseEnter={() => setActiveIdx(flatIdx)}
                    onClick={() => executeToken(token)}
                  >
                    <span className={`text-secondary px-1 py-0.5 rounded shrink-0 font-medium ${flatIdx === activeIdx ? 'bg-white/20 text-white' : 'bg-[var(--color-figma-bg-secondary)] text-[color:var(--color-figma-text-secondary)]'}`}>
                      {token.type}
                    </span>
                    {token.type === 'color' && token.value ? (
                      <span className="w-3 h-3 rounded-full shrink-0 border border-black/10" style={{ backgroundColor: swatchBgColor(token.value) }} />
                    ) : null}
                    <span className="text-body font-mono truncate min-w-0 flex-1">{token.path}</span>
                    {searchAllCollections && token.collectionLabel && (
                      <span className={`text-secondary px-1 py-0.5 rounded shrink-0 font-medium ${flatIdx === activeIdx ? 'bg-white/20 text-white/70' : 'bg-[var(--color-figma-bg-secondary)] text-[color:var(--color-figma-text-secondary)]'}`}>
                        {token.collectionLabel}
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
              <div className="px-3 pt-2 pb-0.5 text-secondary font-medium text-[color:var(--color-figma-text-tertiary)] flex items-center gap-1.5">
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
                    className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${flatIdx === activeIdx ? 'bg-[var(--color-figma-action-bg)] text-[color:var(--color-figma-text-onbrand)]' : 'text-[color:var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'}`}
                    onMouseEnter={() => setActiveIdx(flatIdx)}
                    onClick={() => executeToken(token)}
                  >
                    <span className={`text-secondary px-1 py-0.5 rounded shrink-0 font-medium ${flatIdx === activeIdx ? 'bg-white/20 text-white' : 'bg-[var(--color-figma-bg-secondary)] text-[color:var(--color-figma-text-secondary)]'}`}>
                      {token.type}
                    </span>
                    {token.type === 'color' && token.value ? (
                      <span className="w-3 h-3 rounded-full shrink-0 border border-black/10" style={{ backgroundColor: swatchBgColor(token.value) }} />
                    ) : null}
                    <span className="text-body font-mono truncate min-w-0 flex-1">{token.path}</span>
                    {searchAllCollections && token.collectionLabel && (
                      <span className={`text-secondary px-1 py-0.5 rounded shrink-0 font-medium ${flatIdx === activeIdx ? 'bg-white/20 text-white/70' : 'bg-[var(--color-figma-bg-secondary)] text-[color:var(--color-figma-text-secondary)]'}`}>
                        {token.collectionLabel}
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
                <div className="px-3 pt-2 pb-0.5 text-secondary font-medium text-[color:var(--color-figma-text-tertiary)]">
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
                      className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${flatIdx === activeIdx ? 'bg-[var(--color-figma-action-bg)] text-[color:var(--color-figma-text-onbrand)]' : 'text-[color:var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'}`}
                      onMouseEnter={() => setActiveIdx(flatIdx)}
                      onClick={() => executeCommand(cmd)}
                    >
                      <div className="flex min-w-0 flex-1 flex-col gap-0">
                        <span className="text-body font-medium">{cmd.label}</span>
                        {cmd.description && (
                          <span title={cmd.description} className={`text-secondary truncate ${flatIdx === activeIdx ? 'text-white/70' : 'text-[color:var(--color-figma-text-secondary)]'}`}>
                            {cmd.description}
                          </span>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {section.header === 'Recently used' && cmd.category && (
                          <span className={`text-secondary ${flatIdx === activeIdx ? 'text-white/60' : 'text-[color:var(--color-figma-text-tertiary)]'}`}>
                            {cmd.category}
                          </span>
                        )}
                        {cmd.shortcut && (
                          <kbd className={`text-secondary border rounded px-1 py-0.5 ${flatIdx === activeIdx ? 'border-white/30 bg-white/10 text-white/80' : 'border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[color:var(--color-figma-text-secondary)]'}`}>
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
                <div className="px-3 py-6 text-center text-body text-[color:var(--color-figma-text-secondary)]">
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
                  className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${idx === activeIdx ? 'bg-[var(--color-figma-action-bg)] text-[color:var(--color-figma-text-onbrand)]' : 'text-[color:var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'}`}
                  onMouseEnter={() => setActiveIdx(idx)}
                  onClick={() => executeCommand(cmd)}
                >
                  <div className="flex-1 flex flex-col gap-0 min-w-0">
                    <span className="text-body font-medium">{cmd.label}</span>
                    {cmd.description && (
                      <span title={cmd.description} className={`text-secondary truncate ${idx === activeIdx ? 'text-white/70' : 'text-[color:var(--color-figma-text-secondary)]'}`}>
                        {cmd.description}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {cmd.category && (
                      <span className={`text-secondary ${idx === activeIdx ? 'text-white/60' : 'text-[color:var(--color-figma-text-tertiary)]'}`}>
                        {cmd.category}
                      </span>
                    )}
                    {cmd.shortcut && (
                      <kbd className={`text-secondary border rounded px-1 py-0.5 ${idx === activeIdx ? 'border-white/30 bg-white/10 text-white/80' : 'border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[color:var(--color-figma-text-secondary)]'}`}>
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
        <div className="px-3 py-1.5 border-t border-[var(--color-figma-border)] flex flex-wrap gap-x-3 gap-y-0.5 text-secondary text-[color:var(--color-figma-text-secondary)]">
          {isTokenMode ? (
            <>
              <span className="whitespace-nowrap">↑↓ navigate</span>
              <span className="whitespace-nowrap">↵ go to token/group</span>
              <button
                className="min-w-0 truncate opacity-70 transition-colors hover:opacity-100 hover:text-[color:var(--color-figma-text-accent)]"
                onClick={() => setShowHelp(v => !v)}
                title="Toggle token filter help"
              >
                ? filters
              </button>
              <span className="whitespace-nowrap">ESC close</span>
            </>
          ) : (
            <>
              <span className="whitespace-nowrap">↑↓ navigate</span>
              <span className="whitespace-nowrap">↵ select</span>
              <span className="whitespace-nowrap">type &gt; for token search</span>
              <span className="whitespace-nowrap">ESC close</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
