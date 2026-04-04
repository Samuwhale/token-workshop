import { useState, useCallback, useEffect, useRef, useMemo, useLayoutEffect } from 'react';
import { Spinner } from './Spinner';
import type { TokenNode } from '../hooks/useTokens';
import { isAlias, extractAliasPath, resolveTokenValue, resolveAllAliases } from '../../shared/resolveAlias';
import { TOKEN_TYPE_BADGE_CLASS } from '../../shared/types';
import type { NodeCapabilities, TokenMapEntry } from '../../shared/types';
import { BatchEditor } from './BatchEditor';
import { stableStringify, getErrorMessage, tokenPathToUrlSegment } from '../shared/utils';
import { apiFetch, ApiError } from '../shared/apiFetch';
import { STORAGE_KEY, STORAGE_KEYS, lsGet, lsSet } from '../shared/storage';
import { useSettingsListener } from './SettingsPanel';
import type { SortOrder } from './tokenListUtils';
import {
  formatDisplayPath, nodeParentPath, flattenVisible,
  pruneDeletedPaths, filterByDuplicatePaths, filterTokenNodes,
  sortTokenNodes, collectGroupPathsByDepth, collectAllGroupPaths,
  flattenLeafNodes, findGroupByPath,
  buildZoomBreadcrumb, getDefaultValue,
  hasStructuredQualifiers, parseStructuredQuery, QUERY_QUALIFIERS,
} from './tokenListUtils';
import type { TokenGenerator } from '../hooks/useGenerators';
import type { LintViolation } from '../hooks/useLint';
import type { TokenListProps, DeleteConfirm, PromoteRow, MultiModeValue, Density, AffectedRef } from './tokenListTypes';
import { VIRTUAL_CHAIN_EXPAND_HEIGHT, VIRTUAL_OVERSCAN, DENSITY_ROW_HEIGHT } from './tokenListTypes';
import { validateJsonRefs, valuesEqual, parseInlineValue, inferTypeFromValue, highlightMatch, generateNameSuggestions, valuePlaceholderForType, valueFormatHint } from './tokenListHelpers';
import { ValuePreview } from './ValuePreview';
import { TokenTreeNode } from './TokenTreeNode';
import { TokenTreeProvider } from './TokenTreeContext';
import type { TokenTreeContextType } from './tokenListTypes';
import { TokenListModals } from './TokenListModals';
import { TokenTableView } from './TokenTableView';
import { useRecentlyTouched } from '../hooks/useRecentlyTouched';
import { usePinnedTokens } from '../hooks/usePinnedTokens';
import { useTokenCreate } from '../hooks/useTokenCreate';
import { useTableCreate } from '../hooks/useTableCreate';
import { useFindReplace } from '../hooks/useFindReplace';
import { useDragDrop } from '../hooks/useDragDrop';
import { useGroupOperations } from '../hooks/useGroupOperations';
import { useTokenPromotion } from '../hooks/useTokenPromotion';
import { useTokenCrud } from '../hooks/useTokenCrud';
import { useFigmaMessage } from '../hooks/useFigmaMessage';
import { extractSyncApplyResult } from '../hooks/useTokenSyncBase';

const TOKEN_TYPE_COLORS: Record<string, string> = {
  color:      '#e85d4a',
  dimension:  '#4a9ee8',
  spacing:    '#5bc4a0',
  typography: '#a77de8',
  fontFamily: '#c47de8',
  fontSize:   '#e8a77d',
  fontWeight: '#7de8c4',
  lineHeight: '#e8c47d',
  number:     '#7db8e8',
  string:     '#aae87d',
  shadow:     '#e87dc4',
  border:     '#e8e07d',
};
const TOKEN_TYPE_COLOR_FALLBACK = '#8888aa';

export function TokenList({
  ctx: { setName, sets, serverUrl, connected, selectedNodes },
  data: { tokens, allTokensFlat, lintViolations = [], syncSnapshot, generators, derivedTokenPaths, cascadeDiff, tokenUsageCounts, perSetFlat, collectionMap = {}, modeMap = {}, dimensions = [], unthemedAllTokensFlat, pathToSet = {}, activeThemes = {} },
  actions: { onEdit, onPreview, onCreateNew, onRefresh, onPushUndo, onTokenCreated, onNavigateToAlias, onNavigateBack, navHistoryLength, onClearHighlight, onSyncGroup, onSyncGroupStyles, onSetGroupScopes, onGenerateScaleFromGroup, onRefreshGenerators, onToggleIssuesOnly, onFilteredCountChange, onNavigateToSet, onTokenTouched, onError, onViewTokenHistory, onNavigateToGenerator, onShowReferences, onDisplayedLeafNodesChange, onSelectionChange, onOpenCompare, onOpenCrossThemeCompare },
  defaultCreateOpen,
  highlightedToken,
  showIssuesOnly,
  editingTokenPath,
  compareHandle,
}: TokenListProps) {
  // Token create state is managed by useTokenCreate hook (called below after dependencies)
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<{ type: 'variables' | 'styles'; count: number } | null>(null);
  const [varDiffPending, setVarDiffPending] = useState<{ added: number; modified: number; unchanged: number; flat: any[] } | null>(null);
  const [varDiffLoading, setVarDiffLoading] = useState(false);
  // Loading indicator for async token operations (delete, rename, move, duplicate, reorder, etc.)
  const [operationLoading, setOperationLoading] = useState<string | null>(null);
  const [locallyDeletedPaths, setLocallyDeletedPaths] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const lastSelectedPathRef = useRef<string | null>(null);
  const varReadPendingRef = useRef<Map<string, (tokens: any[]) => void>>(new Map());
  // Drag/drop state is managed by useDragDrop hook (called below after dependencies)
  const [showBatchEditor, setShowBatchEditor] = useState(false);
  const [showScaffold, setShowScaffold] = useState(false);
  // Find/replace state is managed by useFindReplace hook (called below after dependencies)
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [copyCssFeedback, setCopyCssFeedback] = useState(false);
  const [showMoveToGroup, setShowMoveToGroup] = useState(false);
  const [moveToGroupTarget, setMoveToGroupTarget] = useState('');
  const [moveToGroupError, setMoveToGroupError] = useState('');
  const [showRecentlyTouched, setShowRecentlyTouched] = useState(false);
  const recentlyTouched = useRecentlyTouched();
  const pinnedTokens = usePinnedTokens(setName);
  const sendStyleApply = useFigmaMessage<{ count: number; total: number; failures: { path: string; error: string }[] }>({
    responseType: 'styles-applied',
    errorType: 'styles-apply-error',
    timeout: 15000,
    extractResponse: extractSyncApplyResult,
  });
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);
  const [showResolvedValues, setShowResolvedValues] = useState(false);
  const [zoomRootPath, setZoomRootPath] = useState<string | null>(null);
  const [statsBarOpen, setStatsBarOpen] = useState(() => lsGet('tm_token_stats_bar_open') === 'true');

  // Track editor saves: highlightedToken is set to saved path after TokenEditor save
  const prevHighlightRef = useRef<string | null>(null);
  useEffect(() => {
    if (highlightedToken && highlightedToken !== prevHighlightRef.current) {
      recentlyTouched.recordTouch(highlightedToken);
      onTokenTouched?.(highlightedToken);
    }
    prevHighlightRef.current = highlightedToken ?? null;
  }, [highlightedToken, recentlyTouched, onTokenTouched]);

  const generatorsBySource = useMemo(() => {
    const map = new Map<string, TokenGenerator[]>();
    for (const gen of generators ?? []) {
      if (!gen.sourceToken) continue;
      const arr = map.get(gen.sourceToken) ?? [];
      arr.push(gen);
      map.set(gen.sourceToken, arr);
    }
    return map;
  }, [generators]);

  // Expand/collapse state — persisted in localStorage per set
  const setNameRef = useRef(setName);
  setNameRef.current = setName;
  const initializedForSet = useRef<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [expandedChains, setExpandedChains] = useState<Set<string>>(new Set());
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const moreFiltersRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  // createFormRef is managed by useTokenCreate hook
  const virtualListRef = useRef<HTMLDivElement>(null);
  const [virtualScrollTop, setVirtualScrollTop] = useState(0);
  // Refs for values defined later in the component, used inside handleListKeyDown to avoid TDZ
  const displayedLeafNodesRef = useRef<TokenNode[]>([]);
  const copyTokensAsJsonRef = useRef<(nodes: TokenNode[]) => void>(() => {});
  const copyTokensAsCssVarRef = useRef<(nodes: TokenNode[]) => void>(() => {});

  // Refs for scroll-position preservation across filter changes (avoids TDZ issues with stale closures)
  const virtualScrollTopRef = useRef(0);
  const flatItemsRef = useRef<Array<{ node: { path: string } }>>([]);
  const itemOffsetsRef = useRef<number[]>([0]);
  const scrollAnchorPathRef = useRef<string | null>(null);
  const isFilterChangeRef = useRef(false);


  useEffect(() => {
    if (tokens.length === 0) return;
    if (initializedForSet.current === setName) return;
    initializedForSet.current = setName;
    setZoomRootPath(null);
    try {
      const stored = localStorage.getItem(`token-expand:${setName}`);
      if (stored !== null) {
        setExpandedPaths(new Set(JSON.parse(stored) as string[]));
      } else {
        setExpandedPaths(new Set(collectGroupPathsByDepth(tokens, 2)));
      }
    } catch (e) {
      console.debug('[TokenList] storage read/parse expanded paths:', e);
      setExpandedPaths(new Set(collectGroupPathsByDepth(tokens, 2)));
    }
  }, [setName, tokens]);

  useEffect(() => {
    if (initializedForSet.current !== setNameRef.current) return;
    try {
      localStorage.setItem(`token-expand:${setNameRef.current}`, JSON.stringify([...expandedPaths]));
    } catch (e) { console.debug('[TokenList] storage write expanded paths:', e); }
  }, [expandedPaths]);

  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      const msg = ev.data?.pluginMessage;
      if (msg?.type === 'variables-read' && msg.correlationId) {
        const resolve = varReadPendingRef.current.get(msg.correlationId);
        if (resolve) {
          varReadPendingRef.current.delete(msg.correlationId);
          resolve(msg.tokens ?? []);
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleToggleExpand = useCallback((path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const handleExpandAll = useCallback(() => {
    setExpandedPaths(new Set(collectAllGroupPaths(tokens)));
  }, [tokens]);

  const handleCollapseAll = useCallback(() => {
    setExpandedPaths(new Set());
  }, []);


  // handleListKeyDown is defined after custom hook calls (below) to avoid TDZ issues

  // Expand ancestor groups (and the target itself if it's a group) when navigating to a highlighted token
  useEffect(() => {
    if (!highlightedToken) return;
    const parts = highlightedToken.split('.');
    const toExpand: string[] = [];
    for (let i = 1; i < parts.length; i++) {
      toExpand.push(parts.slice(0, i).join('.'));
    }
    // Also expand the target path itself — this is a no-op for leaf tokens
    // but expands groups so their children are visible when navigated to
    toExpand.push(highlightedToken);
    setExpandedPaths(prev => {
      const next = new Set(prev);
      toExpand.forEach(a => next.add(a));
      return next;
    });
    const timer = setTimeout(() => onClearHighlight?.(), 3000);
    return () => clearTimeout(timer);
  }, [highlightedToken, onClearHighlight]);

  useEffect(() => {
    if (!moreFiltersOpen) return;
    const handler = (e: MouseEvent) => {
      if (moreFiltersRef.current && !moreFiltersRef.current.contains(e.target as Node)) {
        setMoreFiltersOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [moreFiltersOpen]);

  // Sort order — persisted in localStorage per-set so each set remembers its own order
  const [sortOrder, setSortOrderState] = useState<SortOrder>('default');

  useEffect(() => {
    setSortOrderState((lsGet(STORAGE_KEY.tokenSort(setName)) as SortOrder) || 'default');
  }, [setName]);

  const setSortOrder = useCallback((order: SortOrder) => {
    setSortOrderState(order);
    lsSet(STORAGE_KEY.tokenSort(setName), order);
  }, [setName]);

  // Clear optimistic deletions when the server response arrives with fresh tokens
  useEffect(() => { setLocallyDeletedPaths(new Set()); }, [tokens]);

  const sortedTokens = useMemo(() => {
    const sorted = sortTokenNodes(tokens, sortOrder);
    return locallyDeletedPaths.size > 0 ? pruneDeletedPaths(sorted, locallyDeletedPaths) : sorted;
  }, [tokens, sortOrder, locallyDeletedPaths]);

  // Filters — search/ref persisted in sessionStorage (shared across sets);
  // typeFilter persisted in localStorage per-set so each set remembers its own filter
  const [searchQuery, setSearchQueryState] = useState(() => {
    try { return sessionStorage.getItem('token-search') || ''; } catch (e) { console.debug('[TokenList] storage read search query:', e); return ''; }
  });
  const [typeFilter, setTypeFilterState] = useState<string>('');
  const [refFilter, setRefFilterState] = useState<'all' | 'aliases' | 'direct'>(() => {
    try { return (sessionStorage.getItem('token-ref-filter') as 'all' | 'aliases' | 'direct') || 'all'; } catch (e) { console.debug('[TokenList] storage read ref filter:', e); return 'all'; }
  });

  useEffect(() => {
    setTypeFilterState(lsGet(STORAGE_KEY.tokenTypeFilter(setName), ''));
  }, [setName]);

  const setSearchQuery = useCallback((v: string) => {
    const top = virtualScrollTopRef.current;
    const items = flatItemsRef.current;
    const offsets = itemOffsetsRef.current;
    let firstIdx = 0;
    while (firstIdx < items.length && offsets[firstIdx + 1] <= top) firstIdx++;
    scrollAnchorPathRef.current = items[firstIdx]?.node.path ?? null;
    isFilterChangeRef.current = true;
    setSearchQueryState(v);
    try { sessionStorage.setItem('token-search', v); } catch (e) { console.debug('[TokenList] storage write search query:', e); }
  }, []);
  const setTypeFilter = useCallback((v: string) => {
    const top = virtualScrollTopRef.current;
    const items = flatItemsRef.current;
    const offsets = itemOffsetsRef.current;
    let firstIdx = 0;
    while (firstIdx < items.length && offsets[firstIdx + 1] <= top) firstIdx++;
    scrollAnchorPathRef.current = items[firstIdx]?.node.path ?? null;
    isFilterChangeRef.current = true;
    setTypeFilterState(v);
    lsSet(STORAGE_KEY.tokenTypeFilter(setName), v);
  }, [setName]);
  const setRefFilter = useCallback((v: 'all' | 'aliases' | 'direct') => {
    const top = virtualScrollTopRef.current;
    const items = flatItemsRef.current;
    const offsets = itemOffsetsRef.current;
    let firstIdx = 0;
    while (firstIdx < items.length && offsets[firstIdx + 1] <= top) firstIdx++;
    scrollAnchorPathRef.current = items[firstIdx]?.node.path ?? null;
    isFilterChangeRef.current = true;
    setRefFilterState(v);
    try { sessionStorage.setItem('token-ref-filter', v); } catch (e) { console.debug('[TokenList] storage write ref filter:', e); }
  }, []);

  const [showDuplicates, setShowDuplicatesState] = useState(() => {
    try { return sessionStorage.getItem('token-duplicates') === '1'; } catch (e) { console.debug('[TokenList] storage read duplicates flag:', e); return false; }
  });
  const setShowDuplicates = useCallback((v: boolean) => {
    setShowDuplicatesState(v);
    try { sessionStorage.setItem('token-duplicates', v ? '1' : '0'); } catch (e) { console.debug('[TokenList] storage write duplicates flag:', e); }
  }, []);

  const [crossSetSearch, setCrossSetSearch] = useState(false);
  const [showQualifierHints, setShowQualifierHints] = useState(false);
  const [showQualifierHelp, setShowQualifierHelp] = useState(false);
  const [hintIndex, setHintIndex] = useState(0);
  const qualifierHintsRef = useRef<HTMLDivElement>(null);
  const qualifierHelpRef = useRef<HTMLDivElement>(null);

  // Cycling placeholder examples for search qualifier discoverability
  const PLACEHOLDER_EXAMPLES = useMemo(() => [
    'type:color',
    'has:alias',
    'value:#ff0000',
    'path:colors.brand',
    'name:500',
    'type:dimension',
    'has:duplicate',
    'desc:primary',
  ], []);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  useEffect(() => {
    if (searchQuery) return; // don't cycle when there's text
    const id = setInterval(() => {
      setPlaceholderIdx(i => (i + 1) % PLACEHOLDER_EXAMPLES.length);
    }, 3000);
    return () => clearInterval(id);
  }, [searchQuery, PLACEHOLDER_EXAMPLES]);
  const [searchFocused, setSearchFocused] = useState(false);

  const filtersActive = searchQuery !== '' || typeFilter !== '' || refFilter !== 'all' || showDuplicates || showIssuesOnly || showRecentlyTouched || showPinnedOnly;

  // Count of active non-search filters (for compact filter indicator)
  const activeFilterCount = (typeFilter !== '' ? 1 : 0) + (refFilter !== 'all' ? 1 : 0) + (showDuplicates ? 1 : 0) + (showIssuesOnly ? 1 : 0) + (showRecentlyTouched ? 1 : 0) + (showPinnedOnly ? 1 : 0);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);

  // Compute paths with lint violations for issues-only filter
  const lintPaths = useMemo(() => {
    const paths = new Set<string>();
    for (const v of lintViolations) paths.add(v.path);
    return paths;
  }, [lintViolations]);

  // Debounced tokens reference for the expensive duplicate-value computation.
  // Without debouncing, every keystroke in a large set triggers an O(n) walk
  // over all tokens. 300 ms idle time is imperceptible for a background stat.
  const [debouncedTokens, setDebouncedTokens] = useState(tokens);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedTokens(tokens), 300);
    return () => clearTimeout(timer);
  }, [tokens]);

  // Compute duplicate value info from all tokens in the current set
  const { duplicateValuePaths, duplicateCounts } = useMemo(() => {
    const valueMap = new Map<string, string[]>(); // serialized value → paths
    const collectLeaves = (nodes: TokenNode[]) => {
      for (const n of nodes) {
        if (!n.isGroup) {
          const key = stableStringify(n.$value);
          if (!valueMap.has(key)) valueMap.set(key, []);
          valueMap.get(key)!.push(n.path);
        }
        if (n.children) collectLeaves(n.children);
      }
    };
    collectLeaves(debouncedTokens);
    const paths = new Set<string>();
    const counts = new Map<string, number>(); // serialized value → count
    for (const [key, ps] of valueMap) {
      if (ps.length > 1) {
        ps.forEach(p => paths.add(p));
        counts.set(key, ps.length);
      }
    }
    return { duplicateValuePaths: paths, duplicateCounts: counts };
  }, [debouncedTokens]);

  // Compute the set of token paths that are "unused": zero Figma usage AND not referenced by any other token as an alias
  const unusedTokenPaths = useMemo<Set<string> | undefined>(() => {
    if (!tokenUsageCounts || Object.keys(tokenUsageCounts).length === 0) return undefined;
    // Collect all alias target paths from allTokensFlat
    const referencedPaths = new Set<string>();
    const collectRefs = (value: unknown) => {
      if (typeof value === 'string') {
        const m = value.match(/^\{([^}]+)\}$/);
        if (m) referencedPaths.add(m[1]);
      } else if (Array.isArray(value)) {
        for (const item of value) collectRefs(item);
      } else if (value && typeof value === 'object') {
        for (const v of Object.values(value as Record<string, unknown>)) collectRefs(v);
      }
    };
    for (const entry of Object.values(allTokensFlat)) collectRefs(entry.$value);
    // Tokens with 0 Figma usage count AND not referenced by another token
    const paths = new Set<string>();
    for (const path of Object.keys(allTokensFlat)) {
      if ((tokenUsageCounts[path] ?? 0) === 0 && !referencedPaths.has(path)) {
        paths.add(path);
      }
    }
    return paths.size > 0 ? paths : undefined;
  }, [tokenUsageCounts, allTokensFlat]);

  // Stats computed from allTokensFlat (cross-set) and perSetFlat for the stats bar
  const statsByType = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const entry of Object.values(allTokensFlat)) {
      const t = entry.$type || 'unknown';
      counts[t] = (counts[t] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [allTokensFlat]);

  const statsTotalTokens = useMemo(() => Object.keys(allTokensFlat).length, [allTokensFlat]);

  const statsSetTotals = useMemo(() => {
    if (!perSetFlat) return [];
    return Object.entries(perSetFlat)
      .map(([name, flat]) => ({ name, total: Object.keys(flat).length }))
      .sort((a, b) => b.total - a.total);
  }, [perSetFlat]);

  const flattenTokens = (nodes: TokenNode[]): any[] => {
    const result: any[] = [];
    const walk = (list: TokenNode[]) => {
      for (const node of list) {
        if (!node.isGroup) {
          result.push({ path: node.path, $type: node.$type, $value: node.$value, setName });
        }
        if (node.children) walk(node.children);
      }
    };
    walk(nodes);
    return result;
  };

  // Count of non-alias tokens with duplicate values — used by the promote banner
  const promotableDuplicateCount = useMemo(() => {
    const flat = flattenTokens(tokens);
    return flat.filter(t => duplicateValuePaths.has(t.path) && !isAlias(t.$value)).length;
  }, [tokens, duplicateValuePaths]);

  const availableTypes = useMemo(() => {
    const types = new Set<string>();
    const collect = (nodes: TokenNode[]) => {
      for (const n of nodes) {
        if (!n.isGroup && n.$type) types.add(n.$type);
        if (n.children) collect(n.children);
      }
    };
    collect(tokens);
    return [...types].sort();
  }, [tokens]);

  // Compute filtered qualifier hints based on what the user is currently typing.
  // Must be declared AFTER availableTypes to avoid TDZ crash.
  const qualifierHints = useMemo(() => {
    const lastWord = searchQuery.split(/\s+/).pop() || '';

    // Value completion after type: — show actual token types from the current set
    if (lastWord.startsWith('type:')) {
      const suffix = lastWord.slice(5).toLowerCase();
      const matches = suffix
        ? availableTypes.filter(t => t.toLowerCase().startsWith(suffix))
        : availableTypes;
      return matches.map(t => ({ qualifier: `type:${t}`, desc: `filter to ${t} tokens`, example: '' }));
    }

    // Value completion after has: — show recognized has: values
    if (lastWord.startsWith('has:')) {
      const suffix = lastWord.slice(4).toLowerCase();
      const hasOptions = [
        { v: 'alias', desc: 'Only reference tokens' },
        { v: 'direct', desc: 'Only direct-value tokens' },
        { v: 'duplicate', desc: 'Only tokens with duplicate values' },
        { v: 'description', desc: 'Only tokens with a description' },
        { v: 'extension', desc: 'Only tokens with extensions' },
      ];
      const matches = suffix ? hasOptions.filter(({ v }) => v.startsWith(suffix)) : hasOptions;
      return matches.map(({ v, desc }) => ({ qualifier: `has:${v}`, desc, example: '' }));
    }

    // On focus with empty query — show all qualifiers as discovery hints
    if (!lastWord) return QUERY_QUALIFIERS;

    // Partial word after unknown qualifier — hide hints
    if (lastWord.includes(':')) return [];

    // Prefix match on qualifier names
    const lw = lastWord.toLowerCase();
    return QUERY_QUALIFIERS.filter(q => q.qualifier.toLowerCase().startsWith(lw));
  }, [searchQuery, availableTypes]);

  // Inspect mode — show only tokens bound to selected layers
  const [inspectMode, setInspectMode] = useState(false);
  const [viewMode, setViewModeState] = useState<'tree' | 'table' | 'json'>('tree');

  useEffect(() => {
    const stored = lsGet(STORAGE_KEY.tokenViewMode(setName));
    setViewModeState((stored === 'table' || stored === 'json') ? stored : 'tree');
  }, [setName]);

  const setViewMode = useCallback((mode: 'tree' | 'table' | 'json') => {
    setViewModeState(mode);
    lsSet(STORAGE_KEY.tokenViewMode(setName), mode);
  }, [setName]);
  const [density, setDensityState] = useState<Density>(() => {
    const stored = lsGet(STORAGE_KEYS.DENSITY);
    return (stored === 'compact' || stored === 'comfortable') ? stored : 'default';
  });
  const setDensity = useCallback((d: Density) => {
    setDensityState(d);
    lsSet(STORAGE_KEYS.DENSITY, d);
  }, []);
  // Sync density when changed from Settings panel
  const densityRev = useSettingsListener(STORAGE_KEYS.DENSITY);
  useEffect(() => {
    if (densityRev === 0) return;
    const stored = lsGet(STORAGE_KEYS.DENSITY);
    setDensityState((stored === 'compact' || stored === 'comfortable') ? stored : 'default');
  }, [densityRev]);
  const rowHeight = DENSITY_ROW_HEIGHT[density];
  const [showScopesCol, setShowScopesCol] = useState(false);

  // Multi-mode column view — show resolved values per theme option side-by-side
  const [multiModeEnabled, setMultiModeEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem('tm_multi_mode') === '1'; } catch (e) { console.debug('[TokenList] storage read multi-mode:', e); return false; }
  });
  const [multiModeDimId, setMultiModeDimId] = useState<string | null>(null);
  const toggleMultiMode = useCallback(() => {
    setMultiModeEnabled(prev => {
      const next = !prev;
      try { localStorage.setItem('tm_multi_mode', next ? '1' : '0'); } catch (e) { console.debug('[TokenList] storage write multi-mode:', e); }
      return next;
    });
  }, []);

  // Auto-select first dimension when multi-mode is enabled and no dimension is selected
  useEffect(() => {
    if (multiModeEnabled && dimensions.length > 0 && (!multiModeDimId || !dimensions.some(d => d.id === multiModeDimId))) {
      setMultiModeDimId(dimensions[0].id);
    }
  }, [multiModeEnabled, dimensions, multiModeDimId]);

  // Compute per-option resolved token maps for the selected dimension
  const multiModeData = useMemo(() => {
    if (!multiModeEnabled || !multiModeDimId || !unthemedAllTokensFlat || dimensions.length === 0) return null;
    const dim = dimensions.find(d => d.id === multiModeDimId);
    if (!dim || dim.options.length < 2) return null;

    // Collect all themed set names (from all dimensions)
    const themedSets = new Set<string>();
    for (const d of dimensions) {
      for (const opt of d.options) {
        for (const sn of Object.keys(opt.sets)) themedSets.add(sn);
      }
    }

    const results: Array<{ optionName: string; dimId: string; resolved: Record<string, TokenMapEntry> }> = [];
    for (const option of dim.options) {
      // Base layer: tokens from non-themed sets
      const merged: Record<string, TokenMapEntry> = {};
      for (const [path, entry] of Object.entries(unthemedAllTokensFlat)) {
        const set = pathToSet[path];
        if (!set || !themedSets.has(set)) merged[path] = entry;
      }
      // Source sets
      for (const [sn, status] of Object.entries(option.sets)) {
        if (status !== 'source') continue;
        for (const [path, entry] of Object.entries(unthemedAllTokensFlat)) {
          if (pathToSet[path] === sn) merged[path] = entry;
        }
      }
      // Enabled sets (overrides)
      for (const [sn, status] of Object.entries(option.sets)) {
        if (status !== 'enabled') continue;
        for (const [path, entry] of Object.entries(unthemedAllTokensFlat)) {
          if (pathToSet[path] === sn) merged[path] = entry;
        }
      }
      results.push({ optionName: option.name, dimId: dim.id, resolved: resolveAllAliases(merged) });
    }
    return { dim, results };
  }, [multiModeEnabled, multiModeDimId, unthemedAllTokensFlat, pathToSet, dimensions]);

  // Build multiModeValues for a given token path
  const getMultiModeValues = useCallback((tokenPath: string): MultiModeValue[] | undefined => {
    if (!multiModeData || !perSetFlat) return undefined;
    const { dim, results } = multiModeData;
    return results.map(({ optionName, dimId, resolved }) => {
      const option = dim.options.find(o => o.name === optionName)!;
      // Find the best target set for edits: first enabled set that already has the token, or first enabled set
      let targetSet: string | null = null;
      const enabledSets = Object.entries(option.sets).filter(([_, s]) => s === 'enabled').map(([sn]) => sn);
      for (const sn of enabledSets) {
        if (perSetFlat[sn]?.[tokenPath]) { targetSet = sn; break; }
      }
      if (!targetSet && enabledSets.length > 0) targetSet = enabledSets[0];
      // Fall back to source sets if no enabled sets exist
      if (!targetSet) {
        const sourceSets = Object.entries(option.sets).filter(([_, s]) => s === 'source').map(([sn]) => sn);
        for (const sn of sourceSets) {
          if (perSetFlat[sn]?.[tokenPath]) { targetSet = sn; break; }
        }
        if (!targetSet && sourceSets.length > 0) targetSet = sourceSets[0];
      }
      return { optionName, dimId, resolved: resolved[tokenPath], targetSet };
    });
  }, [multiModeData, perSetFlat]);

  // Pre-compute per-group theme coverage for the coverage badge
  const themeCoverage = useMemo(() => {
    if (!dimensions || dimensions.length === 0 || !perSetFlat) return undefined;
    // Collect all themed set names (sets referenced by any dimension option)
    const themedSetNames = new Set<string>();
    for (const d of dimensions) {
      for (const opt of d.options) {
        for (const [sn, status] of Object.entries(opt.sets)) {
          if (status === 'enabled' || status === 'source') themedSetNames.add(sn);
        }
      }
    }
    if (themedSetNames.size === 0) return undefined;
    // Build set of token paths that exist in any themed set
    const themedTokenPaths = new Set<string>();
    for (const sn of themedSetNames) {
      if (perSetFlat[sn]) {
        for (const path of Object.keys(perSetFlat[sn])) themedTokenPaths.add(path);
      }
    }
    if (themedTokenPaths.size === 0) return undefined;
    // Walk token tree, computing per-group coverage
    const map = new Map<string, { themed: number; total: number }>();
    function walk(nodes: TokenNode[]): { themed: number; total: number } {
      let themed = 0, total = 0;
      for (const node of nodes) {
        if (node.isGroup && node.children) {
          const sub = walk(node.children);
          themed += sub.themed;
          total += sub.total;
          map.set(node.path, sub);
        } else if (!node.isGroup) {
          total++;
          if (themedTokenPaths.has(node.path)) themed++;
        }
      }
      return { themed, total };
    }
    walk(tokens);
    return map;
  }, [dimensions, perSetFlat, tokens]);

  // JSON editor state
  const [jsonText, setJsonText] = useState('');
  const [jsonDirty, setJsonDirty] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [jsonSaving, setJsonSaving] = useState(false);
  const [jsonBrokenRefs, setJsonBrokenRefs] = useState<string[]>([]);
  const jsonTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Load raw JSON when entering JSON view (or when setName changes in JSON view)
  useEffect(() => {
    if (viewMode !== 'json' || !connected || !serverUrl || !setName) return;
    if (jsonDirty) return; // don't clobber unsaved edits
    apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/raw`)
      .then(data => {
        const text = JSON.stringify(data, null, 2);
        setJsonText(text);
        setJsonError(null);
        setJsonBrokenRefs(validateJsonRefs(text, allTokensFlat));
      })
      .catch(() => setJsonError('Failed to load JSON'));
  }, [viewMode, setName, connected, serverUrl, jsonDirty, allTokensFlat]);

  // Sync from list view → JSON when tokens change externally (not dirty)
  useEffect(() => {
    if (viewMode !== 'json' || jsonDirty || !connected || !serverUrl || !setName) return;
    apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/raw`)
      .then(data => {
        const text = JSON.stringify(data, null, 2);
        setJsonText(text);
        setJsonBrokenRefs(validateJsonRefs(text, allTokensFlat));
      })
      .catch(err => console.warn('[TokenList] fetch raw JSON failed:', err));
  }, [tokens, viewMode, jsonDirty, connected, serverUrl, setName, allTokensFlat]);

  const boundTokenPaths = useMemo(() => {
    const paths = new Set<string>();
    for (const node of selectedNodes) {
      for (const tokenPath of Object.values(node.bindings)) {
        if (tokenPath) paths.add(tokenPath);
      }
    }
    return paths;
  }, [selectedNodes]);

  const handleHoverToken = useCallback((tokenPath: string) => {
    parent.postMessage({ pluginMessage: { type: 'highlight-layer-by-token', tokenPath } }, '*');
  }, []);

  const displayedTokens = useMemo(() => {
    // Apply zoom: if a zoom root is set, extract that subtree's children
    let baseTokens = sortedTokens;
    if (zoomRootPath) {
      const zoomNode = findGroupByPath(sortedTokens, zoomRootPath);
      baseTokens = zoomNode?.children ?? [];
    }
    let result = filtersActive ? filterTokenNodes(baseTokens, searchQuery, typeFilter, refFilter, duplicateValuePaths, derivedTokenPaths, unusedTokenPaths) : baseTokens;
    if (showDuplicates) result = filterByDuplicatePaths(result, duplicateValuePaths);
    if (showIssuesOnly && lintPaths.size > 0) result = filterByDuplicatePaths(result, lintPaths);
    if (inspectMode && selectedNodes.length > 0) result = filterByDuplicatePaths(result, boundTokenPaths);
    if (showRecentlyTouched) {
      if (recentlyTouched.paths.size > 0) result = filterByDuplicatePaths(result, recentlyTouched.paths);
      else result = [];
    }
    if (showPinnedOnly) {
      if (pinnedTokens.paths.size > 0) result = filterByDuplicatePaths(result, pinnedTokens.paths);
      else result = [];
    }
    return result;
  }, [sortedTokens, zoomRootPath, searchQuery, typeFilter, refFilter, filtersActive, showDuplicates, duplicateValuePaths, showIssuesOnly, lintPaths, inspectMode, selectedNodes.length, boundTokenPaths, showRecentlyTouched, recentlyTouched.paths, showPinnedOnly, pinnedTokens.paths, derivedTokenPaths, unusedTokenPaths]);

  // Auto-clear zoom if the zoomed group no longer exists in the tree
  useEffect(() => {
    if (zoomRootPath && !findGroupByPath(sortedTokens, zoomRootPath)) {
      setZoomRootPath(null);
    }
  }, [sortedTokens, zoomRootPath]);

  // Memoized flat leaf list for displayedTokens — avoids repeated O(n) walks per render
  const displayedLeafNodes = useMemo(() => flattenLeafNodes(displayedTokens), [displayedTokens]);
  displayedLeafNodesRef.current = displayedLeafNodes;

  // Notify parent when the visible leaf list changes (used for editor drawer navigation)
  useEffect(() => { onDisplayedLeafNodesChange?.(displayedLeafNodes); }, [displayedLeafNodes, onDisplayedLeafNodesChange]);

  // Notify parent when multi-select set changes (used by command palette bulk-delete)
  useEffect(() => { onSelectionChange?.([...selectedPaths]); }, [selectedPaths, onSelectionChange]);

  // Pinned tokens from the displayed (filtered) set — shown in a dedicated section above the list
  const pinnedDisplayedNodes = useMemo(() => {
    if (pinnedTokens.count === 0 || showPinnedOnly) return [];
    return displayedLeafNodes.filter(n => pinnedTokens.isPinned(n.path));
  }, [displayedLeafNodes, pinnedTokens, showPinnedOnly]);

  // Compute highlight terms from the parsed search query for substring highlighting
  const searchHighlight = useMemo(() => {
    if (!searchQuery) return undefined;
    const parsed = parseStructuredQuery(searchQuery);
    const nameTerms: string[] = [];
    const valueTerms: string[] = [];
    if (parsed.text) nameTerms.push(parsed.text);
    nameTerms.push(...parsed.names, ...parsed.paths);
    valueTerms.push(...parsed.values);
    // For plain text search, the term also matches values
    if (parsed.text) valueTerms.push(parsed.text);
    if (!nameTerms.length && !valueTerms.length) return undefined;
    return { nameTerms, valueTerms };
  }, [searchQuery]);

  // Cross-set search: debounced server-side search across all sets
  const [crossSetResults, setCrossSetResults] = useState<Array<{ setName: string; path: string; entry: TokenMapEntry }> | null>(null);
  const [crossSetTotal, setCrossSetTotal] = useState<number>(0);
  const [crossSetOffset, setCrossSetOffset] = useState<number>(0);
  const crossSetAbortRef = useRef<AbortController | null>(null);
  const CROSS_SET_PAGE_SIZE = 200;

  // Reset offset when query changes
  useEffect(() => {
    setCrossSetOffset(0);
  }, [crossSetSearch, searchQuery]);

  useEffect(() => {
    if (!crossSetSearch || !searchQuery.trim()) {
      setCrossSetResults(crossSetSearch ? [] : null);
      setCrossSetTotal(0);
      return;
    }
    const parsed = parseStructuredQuery(searchQuery);
    const params = new URLSearchParams();
    if (parsed.text) params.set('q', parsed.text);
    if (parsed.types.length) params.set('type', parsed.types.join(','));
    if (parsed.has.length) params.set('has', parsed.has.join(','));
    if (parsed.values.length) params.set('value', parsed.values.join(','));
    if (parsed.descs.length) params.set('desc', parsed.descs.join(','));
    if (parsed.paths.length) params.set('path', parsed.paths.join(','));
    if (parsed.names.length) params.set('name', parsed.names.join(','));
    params.set('limit', String(CROSS_SET_PAGE_SIZE));
    if (crossSetOffset > 0) params.set('offset', String(crossSetOffset));

    crossSetAbortRef.current?.abort();
    const ctrl = new AbortController();
    crossSetAbortRef.current = ctrl;

    const timer = setTimeout(() => {
      apiFetch<{ results: Array<{ setName: string; path: string; name: string; $type: string; $value: unknown; $description?: string }>; total: number }>(`${serverUrl}/api/tokens/search?${params}`, { signal: ctrl.signal })
        .then(data => {
          const mapped = data.results.map(r => ({
            setName: r.setName,
            path: r.path,
            entry: { $value: r.$value as any, $type: r.$type, $name: r.name },
          }));
          setCrossSetTotal(data.total);
          if (crossSetOffset > 0) {
            setCrossSetResults(prev => [...(prev ?? []), ...mapped]);
          } else {
            setCrossSetResults(mapped);
          }
        })
        .catch(err => {
          if (err instanceof Error && err.name === 'AbortError') return;
          console.error('Cross-set search failed:', err);
        });
    }, 150);

    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [crossSetSearch, searchQuery, serverUrl, crossSetOffset]);

  // Report filtered leaf count to parent so set tabs can show "X / Y"
  useEffect(() => {
    if (!onFilteredCountChange) return;
    onFilteredCountChange(filtersActive ? displayedLeafNodes.length : null);
  }, [displayedLeafNodes, filtersActive, onFilteredCountChange]);

  // Flat list of visible nodes for virtual scrolling (respects expand/collapse state)
  const flatItems = useMemo(() => {
    if (viewMode !== 'tree') return [];
    if (showRecentlyTouched) {
      // In recency mode, flatten and sort by timestamp (newest first)
      const leaves = flattenLeafNodes(displayedTokens);
      leaves.sort((a, b) => (recentlyTouched.timestamps.get(b.path) ?? 0) - (recentlyTouched.timestamps.get(a.path) ?? 0));
      return leaves.map(node => ({ node, depth: 0 }));
    }
    return flattenVisible(displayedTokens, expandedPaths);
  }, [displayedTokens, expandedPaths, viewMode, showRecentlyTouched, recentlyTouched.paths, recentlyTouched.timestamps]);

  // Toggle alias chain expansion for a token row
  const handleToggleChain = useCallback((path: string) => {
    setExpandedChains(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  }, []);

  // Cumulative row offsets for variable-height virtual scroll.
  // Each item is rowHeight px (density-dependent), plus dynamic chain height when its chain panel is open.
  // Chain height = 18px per resolution step (each step is a row in the debugger).
  const CHAIN_STEP_HEIGHT = 18;
  const itemOffsets = useMemo(() => {
    const offsets = new Array<number>(flatItems.length + 1);
    offsets[0] = 0;
    for (let i = 0; i < flatItems.length; i++) {
      let h = rowHeight;
      const item = flatItems[i];
      if (expandedChains.has(item.node.path) && isAlias(item.node.$value)) {
        const result = resolveTokenValue(item.node.$value, item.node.$type || 'unknown', allTokensFlat);
        // steps = 1 (self) + chain.length hops; if not an alias, result is null and we skip
        const stepCount = 1 + (result?.chain?.length ?? 0);
        h += Math.max(stepCount * CHAIN_STEP_HEIGHT, VIRTUAL_CHAIN_EXPAND_HEIGHT);
      } else if (expandedChains.has(item.node.path)) {
        h += VIRTUAL_CHAIN_EXPAND_HEIGHT;
      }
      offsets[i + 1] = offsets[i] + h;
    }
    return offsets;
  }, [flatItems, expandedChains, rowHeight, allTokensFlat]);
  // Sync refs so filter callbacks can read latest values without stale closure issues
  flatItemsRef.current = flatItems;
  itemOffsetsRef.current = itemOffsets;

  // Map of group path ('' = root) → ordered child names, reflecting actual file order
  const siblingOrderMap = useMemo(() => {
    const map = new Map<string, string[]>();
    const walk = (nodes: TokenNode[], parentPath: string) => {
      map.set(parentPath, nodes.map(n => n.name));
      for (const node of nodes) {
        if (node.isGroup && node.children) walk(node.children, node.path);
      }
    };
    walk(tokens, '');
    return map;
  }, [tokens]);

  // --- Custom hooks for extracted state groups ---
  const allGroupPaths = useMemo(() => collectAllGroupPaths(tokens), [tokens]);

  const tokenCreate = useTokenCreate({
    defaultCreateOpen,
    connected,
    serverUrl,
    setName,
    selectedNodes,
    siblingOrderMap,
    allGroupPaths,
    allTokensFlat,
    onCreateNew,
    onRefresh,
    onPushUndo,
    onTokenCreated,
    onRecordTouch: recentlyTouched.recordTouch,
  });
  const {
    showCreateForm, setShowCreateForm,
    newTokenGroup, setNewTokenGroup, newTokenName, setNewTokenName,
    newTokenPath, pathValidation, newTokenType, setNewTokenType, newTokenValue, setNewTokenValue,
    newTokenDescription, setNewTokenDescription, typeAutoInferred, setTypeAutoInferred,
    createError, setCreateError,
    createFormRef, nameInputRef, nameSuggestions, filteredGroups, groupDropdownOpen, setGroupDropdownOpen,
    groupActiveIdx, setGroupActiveIdx,
    resetCreateForm, handleOpenCreateSibling, handleCreate, handleCreateAndNew,
  } = tokenCreate;

  const tableCreate = useTableCreate({
    connected,
    serverUrl,
    setName,
    siblingOrderMap,
    onRefresh,
    onPushUndo,
    onTokenCreated,
    onRecordTouch: recentlyTouched.recordTouch,
  });
  const {
    showTableCreate,
    tableGroup, setTableGroup,
    tableRows, rowErrors, createAllError, busy: tableCreateBusy,
    hasDraft: tableCreateHasDraft,
    addRow: addTableRow, removeRow: removeTableRow, updateRow: updateTableRow,
    closeTableCreate, resetTableCreate, restoreDraft: restoreTableDraft, dismissDraft: dismissTableDraft,
    openTableCreate, handleCreateAll,
    tableSuggestions,
  } = tableCreate;

  // Scroll active group autocomplete item into view
  useEffect(() => {
    if (groupActiveIdx < 0 || !createFormRef.current) return;
    const el = createFormRef.current.querySelector(`[data-group-idx="${groupActiveIdx}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }, [groupActiveIdx]);

  const findReplace = useFindReplace({
    connected,
    serverUrl,
    setName,
    tokens,
    allSets: sets,
    perSetFlat,
    onRefresh,
    onPushUndo,
  });
  const {
    showFindReplace, setShowFindReplace,
    frFind, setFrFind, frReplace, setFrReplace,
    frIsRegex, setFrIsRegex, frScope, setFrScope, frTarget, setFrTarget,
    frTypeFilter, setFrTypeFilter, frAvailableTypes,
    frError, setFrError, frBusy,
    frRegexError, frPreview, frValuePreview, frConflictCount, frRenameCount, frValueCount,
    frAliasImpact,
    handleFindReplace, cancelFindReplace,
  } = findReplace;

  const dragDrop = useDragDrop({
    connected,
    serverUrl,
    setName,
    siblingOrderMap,
    onRefresh,
    onPushUndo,
    onError,
    onRenamePath: (oldPath, newPath) => {
      recentlyTouched.renamePath(oldPath, newPath);
      pinnedTokens.renamePin(oldPath, newPath);
    },
  });
  const {
    dragSource, dragOverGroup, dragOverGroupIsInvalid, dragOverReorder,
    handleDragStart, handleDragEnd, handleDragOverGroup,
    handleDragOverToken, handleDragLeaveToken,
    handleDropOnGroup, handleDropReorder,
  } = dragDrop;

  const groupOps = useGroupOperations({
    connected,
    serverUrl,
    setName,
    sets,
    siblingOrderMap,
    onRefresh,
    onPushUndo,
    onSetOperationLoading: setOperationLoading,
    onError,
  });
  const {
    renameGroupConfirm, setRenameGroupConfirm,
    newGroupDialogParent, setNewGroupDialogParent,
    newGroupName, setNewGroupName,
    newGroupError, setNewGroupError,
    movingGroup, setMovingGroup,
    copyingGroup, setCopyingGroup,
    moveGroupTargetSet, setMoveGroupTargetSet,
    copyGroupTargetSet, setCopyGroupTargetSet,
    executeGroupRename, handleRenameGroup,
    handleRequestMoveGroup, handleConfirmMoveGroup,
    handleRequestCopyGroup, handleConfirmCopyGroup,
    handleDuplicateGroup, handleUpdateGroupMeta,
    handleCreateGroup, handleMoveTokenInGroup,
  } = groupOps;

  const tokenCrud = useTokenCrud({
    connected,
    serverUrl,
    setName,
    sets,
    tokens,
    allTokensFlat,
    perSetFlat,
    onRefresh,
    onPushUndo,
    onRefreshGenerators,
    onSetOperationLoading: setOperationLoading,
    onSetLocallyDeletedPaths: setLocallyDeletedPaths,
    onRecordTouch: recentlyTouched.recordTouch,
    onRenamePath: (oldPath, newPath) => {
      recentlyTouched.renamePath(oldPath, newPath);
      pinnedTokens.renamePin(oldPath, newPath);
    },
    onClearSelection: () => { setSelectMode(false); setSelectedPaths(new Set()); },
    onError,
  });
  const {
    deleteConfirm, setDeleteConfirm,
    renameTokenConfirm, setRenameTokenConfirm,
    deleteError, setDeleteError,
    pendingRenameToken, setPendingRenameToken,
    movingToken, setMovingToken,
    copyingToken, setCopyingToken,
    moveTokenTargetSet, setMoveTokenTargetSet,
    copyTokenTargetSet, setCopyTokenTargetSet,
    executeTokenRename, handleRenameToken,
    requestDeleteToken, requestDeleteGroup,
    requestBulkDelete: requestBulkDeleteFromHook,
    executeDelete,
    handleDuplicateToken, handleInlineSave, handleDescriptionSave,
    handleMultiModeInlineSave, handleDetachFromGenerator,
    handleRequestMoveToken, handleConfirmMoveToken,
    handleRequestCopyToken, handleConfirmCopyToken,
  } = tokenCrud;

  const tokenPromotion = useTokenPromotion({
    connected,
    serverUrl,
    setName,
    tokens,
    allTokensFlat,
    selectedPaths,
    onRefresh,
    onClearSelection: () => { setSelectMode(false); setSelectedPaths(new Set()); },
    onError,
  });
  const {
    promoteRows, setPromoteRows,
    promoteBusy,
    handleOpenPromoteModal, handleConfirmPromote,
  } = tokenPromotion;

  // Tab navigation between inline-editable token cells (spreadsheet-style)
  const [pendingTabEdit, setPendingTabEdit] = useState<{ path: string; columnId: string | null } | null>(null);
  const handleClearPendingTabEdit = useCallback(() => setPendingTabEdit(null), []);

  const handleTabToNext = useCallback((currentPath: string, columnId: string | null, direction: 1 | -1) => {
    const items = flatItemsRef.current;
    const offsets = itemOffsetsRef.current;
    const leafItems = items.filter(i => !i.node.isGroup);
    const currentIdx = leafItems.findIndex(i => i.node.path === currentPath);
    if (currentIdx === -1) return;
    const nextIdx = currentIdx + direction;
    if (nextIdx < 0 || nextIdx >= leafItems.length) return;
    const nextPath = leafItems[nextIdx].node.path;
    // Scroll into view if needed
    const globalIdx = items.findIndex(i => i.node.path === nextPath);
    if (globalIdx >= 0 && virtualListRef.current) {
      const containerH = virtualListRef.current.clientHeight;
      const itemTop = offsets[globalIdx];
      const itemBottom = offsets[globalIdx + 1] ?? itemTop + 24;
      const scrollTop = virtualListRef.current.scrollTop;
      if (itemTop < scrollTop) {
        virtualListRef.current.scrollTop = itemTop;
        setVirtualScrollTop(itemTop);
      } else if (itemBottom > scrollTop + containerH) {
        const newTop = itemBottom - containerH;
        virtualListRef.current.scrollTop = newTop;
        setVirtualScrollTop(newTop);
      }
    }
    setPendingTabEdit({ path: nextPath, columnId });
  }, []);

  // Container-level keyboard shortcut handler for the token list
  const handleListKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';

    // Escape: close create form, exit select mode, exit zoom, or blur search
    if (e.key === 'Escape') {
      if (showCreateForm) {
        e.preventDefault();
        resetCreateForm();
        return;
      }
      if (selectMode) {
        e.preventDefault();
        setSelectMode(false);
        setSelectedPaths(new Set());
        setShowBatchEditor(false);
        return;
      }
      if (zoomRootPath) {
        e.preventDefault();
        setZoomRootPath(null);
        setVirtualScrollTop(0);
        if (virtualListRef.current) virtualListRef.current.scrollTop = 0;
        return;
      }
      return;
    }

    // Cmd/Ctrl+C: copy selected tokens as DTCG JSON
    if (e.key === 'c' && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
      if (selectMode && selectedPaths.size > 0) {
        e.preventDefault();
        const nodes = displayedLeafNodesRef.current.filter(n => selectedPaths.has(n.path));
        copyTokensAsJsonRef.current(nodes);
        return;
      }
      // Single focused token row — copy that token
      if (!isTyping) {
        const focusedPath = (document.activeElement as HTMLElement)?.dataset?.tokenPath;
        if (focusedPath) {
          const node = displayedLeafNodesRef.current.find(n => n.path === focusedPath);
          if (node) {
            e.preventDefault();
            copyTokensAsJsonRef.current([node]);
            return;
          }
        }
      }
    }

    // Cmd/Ctrl+Shift+C: copy selected tokens as CSS custom properties
    if (e.key === 'c' && (e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey) {
      if (selectMode && selectedPaths.size > 0) {
        e.preventDefault();
        const nodes = displayedLeafNodesRef.current.filter(n => selectedPaths.has(n.path));
        copyTokensAsCssVarRef.current(nodes);
        return;
      }
      // Single focused token row — copy that token
      if (!isTyping) {
        const focusedPath = (document.activeElement as HTMLElement)?.dataset?.tokenPath;
        if (focusedPath) {
          const node = displayedLeafNodesRef.current.find(n => n.path === focusedPath);
          if (node) {
            e.preventDefault();
            copyTokensAsCssVarRef.current([node]);
            return;
          }
        }
      }
    }

    // Cmd/Ctrl+] / Cmd/Ctrl+[: navigate to next/previous token in the editor (works from list when side panel is visible)
    if ((e.key === ']' || e.key === '[') && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && editingTokenPath) {
      e.preventDefault();
      const nodes = displayedLeafNodesRef.current;
      const idx = nodes.findIndex(n => n.path === editingTokenPath);
      if (idx !== -1) {
        const next = e.key === ']' ? nodes[idx + 1] : nodes[idx - 1];
        if (next) onEdit(next.path, next.name);
      }
      return;
    }

    // Don't handle shortcuts when typing in a form field
    if (isTyping) return;

    // Cmd/Ctrl+A: select all visible leaf tokens (auto-enters select mode)
    if (e.key === 'a' && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      if (!selectMode) setSelectMode(true);
      setSelectedPaths(new Set(displayedLeafNodesRef.current.map(n => n.path)));
      return;
    }

    // m: toggle multi-select mode
    if (e.key === 'm' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      if (selectMode) {
        setSelectMode(false);
        setSelectedPaths(new Set());
        setShowBatchEditor(false);
      } else {
        setSelectMode(true);
      }
      return;
    }

    // e: open/toggle batch editor when in select mode with tokens selected
    if (e.key === 'e' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      if (selectMode && selectedPaths.size > 0) {
        e.preventDefault();
        setShowBatchEditor(v => !v);
        return;
      }
    }

    // n: open create form / drawer, pre-filling path from focused group or token's parent group
    if (e.key === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      const activeEl = document.activeElement as HTMLElement;
      const groupPath = activeEl?.dataset?.groupPath;
      const tokenPath = activeEl?.dataset?.tokenPath;

      let prefixPath = '';
      if (groupPath) {
        prefixPath = groupPath;
      } else if (tokenPath) {
        const groups = Array.from(document.querySelectorAll<HTMLElement>('[data-group-path]'));
        const parentGroup = groups
          .filter(el => tokenPath.startsWith((el.dataset.groupPath ?? '') + '.'))
          .sort((a, b) => (b.dataset.groupPath?.length ?? 0) - (a.dataset.groupPath?.length ?? 0))[0];
        prefixPath = parentGroup?.dataset?.groupPath ?? '';
      }

      if (prefixPath) {
        handleOpenCreateSibling(prefixPath, 'color');
      } else if (onCreateNew) {
        onCreateNew();
      } else {
        setShowCreateForm(true);
      }
      return;
    }

    // /: focus search input
    if (e.key === '/') {
      e.preventDefault();
      searchRef.current?.focus();
      return;
    }

    // Alt+↑/↓: move focused token/group up or down within its parent group
    if (e.altKey && !e.metaKey && !e.ctrlKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      const activeEl = document.activeElement as HTMLElement;
      const nodePath = activeEl?.dataset?.tokenPath ?? activeEl?.dataset?.groupPath;
      const nodeName = activeEl?.dataset?.nodeName;
      if (nodePath && nodeName && sortOrder === 'default' && connected) {
        const direction = e.key === 'ArrowUp' ? 'up' : 'down';
        const parentPath = nodeParentPath(nodePath, nodeName) ?? '';
        const siblings = siblingOrderMap.get(parentPath) ?? [];
        const idx = siblings.indexOf(nodeName);
        const newIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (idx >= 0 && newIdx >= 0 && newIdx < siblings.length) {
          e.preventDefault();
          handleMoveTokenInGroup(nodePath, nodeName, direction);
        }
      }
      return;
    }

    // ↑/↓: navigate between visible token and group rows
    // Shift+↑/↓ in select mode: extend/shrink range selection
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-token-path],[data-group-path]'));
      if (rows.length === 0) return;
      const currentIndex = rows.findIndex(el => el === document.activeElement);
      let targetRow: HTMLElement | undefined;
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        targetRow = currentIndex > 0 ? rows[currentIndex - 1] : rows[rows.length - 1];
      } else {
        e.preventDefault();
        targetRow = currentIndex < rows.length - 1 ? rows[currentIndex + 1] : rows[0];
      }
      targetRow?.focus();
      targetRow?.scrollIntoView({ block: 'nearest' });

      // Shift+Arrow: extend/shrink range selection (auto-enters select mode)
      if (e.shiftKey && targetRow) {
        const targetPath = targetRow.dataset.tokenPath || targetRow.dataset.groupPath;
        if (targetPath) {
          if (!selectMode) setSelectMode(true);
          // Set anchor on first shift-arrow if none exists
          if (lastSelectedPathRef.current === null) {
            const currentRow = currentIndex >= 0 ? rows[currentIndex] : undefined;
            const currentPath = currentRow?.dataset.tokenPath || currentRow?.dataset.groupPath;
            if (currentPath) {
              lastSelectedPathRef.current = currentPath;
              setSelectedPaths(prev => {
                const next = new Set(prev);
                next.add(currentPath);
                return next;
              });
            }
          }
          handleTokenSelect(targetPath, { shift: true, ctrl: false });
        }
      }
    }

    // Alt+←: navigate back in alias navigation history
    if (e.altKey && !e.metaKey && !e.ctrlKey && e.key === 'ArrowLeft' && (navHistoryLength ?? 0) > 0) {
      e.preventDefault();
      onNavigateBack?.();
      return;
    }

    // Cmd/Ctrl+→: expand all groups; Cmd/Ctrl+←: collapse all groups
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      e.preventDefault();
      if (e.key === 'ArrowRight') {
        handleExpandAll();
      } else {
        handleCollapseAll();
      }
      return;
    }

    // ←/→: expand/collapse groups (standard tree keyboard pattern)
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const activeEl = document.activeElement as HTMLElement;
      const groupPath = activeEl?.dataset?.groupPath;
      const tokenPath = activeEl?.dataset?.tokenPath;

      if (groupPath) {
        const isExpanded = expandedPaths.has(groupPath);
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          if (!isExpanded) {
            handleToggleExpand(groupPath);
          } else {
            const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-token-path],[data-group-path]'));
            const idx = rows.indexOf(activeEl);
            if (idx >= 0 && idx < rows.length - 1) {
              rows[idx + 1]?.focus();
              rows[idx + 1]?.scrollIntoView({ block: 'nearest' });
            }
          }
        } else {
          e.preventDefault();
          if (isExpanded) {
            handleToggleExpand(groupPath);
          } else {
            const dotIdx = groupPath.lastIndexOf('.');
            if (dotIdx > 0) {
              const parentPath = groupPath.slice(0, dotIdx);
              const parentEl = document.querySelector<HTMLElement>(`[data-group-path="${CSS.escape(parentPath)}"]`);
              if (parentEl) {
                parentEl.focus();
                parentEl.scrollIntoView({ block: 'nearest' });
              }
            }
          }
        }
      } else if (tokenPath && e.key === 'ArrowLeft') {
        e.preventDefault();
        const dotIdx = tokenPath.lastIndexOf('.');
        if (dotIdx > 0) {
          const parentPath = tokenPath.slice(0, dotIdx);
          const parentEl = document.querySelector<HTMLElement>(`[data-group-path="${CSS.escape(parentPath)}"]`);
          if (parentEl) {
            parentEl.focus();
            parentEl.scrollIntoView({ block: 'nearest' });
          }
        }
      }
    }
  }, [showCreateForm, resetCreateForm, selectMode, selectedPaths, handleOpenCreateSibling, onCreateNew, expandedPaths, handleToggleExpand, handleExpandAll, handleCollapseAll, zoomRootPath, navHistoryLength, onNavigateBack, handleMoveTokenInGroup, siblingOrderMap, sortOrder, connected]);

  // Scroll virtual list to bring the highlighted token into view
  useLayoutEffect(() => {
    if (!highlightedToken || viewMode !== 'tree' || !virtualListRef.current) return;
    const idx = flatItems.findIndex(item => item.node.path === highlightedToken);
    if (idx < 0) return;
    const containerH = virtualListRef.current.clientHeight;
    const targetScrollTop = Math.max(0, itemOffsets[idx] - containerH / 2 + rowHeight / 2);
    virtualListRef.current.scrollTop = targetScrollTop;
    setVirtualScrollTop(targetScrollTop);
  }, [highlightedToken, flatItems, itemOffsets, viewMode]);

  // Restore scroll anchor after filter changes so the first visible item stays visible
  useLayoutEffect(() => {
    if (!isFilterChangeRef.current) return;
    isFilterChangeRef.current = false;
    const anchorPath = scrollAnchorPathRef.current;
    scrollAnchorPathRef.current = null;
    if (!virtualListRef.current) return;
    if (anchorPath) {
      const idx = flatItems.findIndex(item => item.node.path === anchorPath);
      if (idx >= 0) {
        const targetScrollTop = itemOffsets[idx];
        virtualListRef.current.scrollTop = targetScrollTop;
        setVirtualScrollTop(targetScrollTop);
        return;
      }
    }
    // Anchor not in filtered list — scroll to top of results
    virtualListRef.current.scrollTop = 0;
    setVirtualScrollTop(0);
  }, [flatItems, itemOffsets]);

  const syncChangedCount = useMemo(() => {
    if (!syncSnapshot) return 0;
    return Object.entries(allTokensFlat).filter(
      ([path, token]) => path in syncSnapshot && syncSnapshot[path] !== stableStringify(token.$value)
    ).length;
  }, [syncSnapshot, allTokensFlat]);

  // Smart alias suggestion: when the typed value matches an existing token's value, suggest using a reference
  const aliasSuggestion = useMemo<{ path: string; name: string } | null>(() => {
    if (!showCreateForm) return null;
    const raw = newTokenValue.trim();
    if (!raw) return null;
    // Don't suggest if user already typed an alias reference
    if (isAlias(raw)) return null;
    const parsed = parseInlineValue(newTokenType, raw);
    if (parsed === null) return null;
    for (const [tokenPath, entry] of Object.entries(allTokensFlat)) {
      // Skip aliases — we want to match concrete values
      if (isAlias(entry.$value)) continue;
      // Only match same-type tokens
      if (entry.$type !== newTokenType) continue;
      if (valuesEqual(parsed, entry.$value)) {
        const segments = tokenPath.split('.');
        return { path: tokenPath, name: segments[segments.length - 1] };
      }
    }
    return null;
  }, [showCreateForm, newTokenValue, newTokenType, allTokensFlat]);

  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setTypeFilter('');
    setRefFilter('all');
    setShowDuplicates(false);
    setShowRecentlyTouched(false);
    setShowPinnedOnly(false);
    if (showIssuesOnly && onToggleIssuesOnly) onToggleIssuesOnly();
  }, [setSearchQuery, setTypeFilter, setRefFilter, setShowDuplicates, showIssuesOnly, onToggleIssuesOnly]);

  // Merge capabilities from all selected nodes for the property picker
  const selectionCapabilities: NodeCapabilities | null = selectedNodes.length > 0
    ? {
        hasFills: selectedNodes.some(n => n.capabilities.hasFills),
        hasStrokes: selectedNodes.some(n => n.capabilities.hasStrokes),
        hasAutoLayout: selectedNodes.some(n => n.capabilities.hasAutoLayout),
        isText: selectedNodes.some(n => n.capabilities.isText),
        hasEffects: selectedNodes.some(n => n.capabilities.hasEffects),
      }
    : null;

  // Extract to alias state
  const [extractToken, setExtractToken] = useState<{ path: string; $type?: string; $value: any } | null>(null);
  const [extractMode, setExtractMode] = useState<'new' | 'existing'>('new');
  const [newPrimitivePath, setNewPrimitivePath] = useState('');
  const [newPrimitiveSet, setNewPrimitiveSet] = useState('');
  const [existingAlias, setExistingAlias] = useState('');
  const [existingAliasSearch, setExistingAliasSearch] = useState('');
  const [extractError, setExtractError] = useState('');

  const handleOpenExtractToAlias = useCallback((path: string, $type?: string, $value?: any) => {
    const lastSegment = path.split('.').pop() ?? 'token';
    const suggested = `primitives.${$type || 'color'}.${lastSegment}`;
    setNewPrimitivePath(suggested);
    setNewPrimitiveSet(setName);
    setExistingAlias('');
    setExistingAliasSearch('');
    setExtractMode('new');
    setExtractError('');
    setExtractToken({ path, $type, $value });
  }, [setName]);

  const handleConfirmExtractToAlias = useCallback(async () => {
    if (!extractToken || !connected) return;
    setExtractError('');

    if (extractMode === 'new') {
      if (!newPrimitivePath.trim()) { setExtractError('Enter a path for the new primitive token.'); return; }
      try {
        await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(newPrimitiveSet)}/${tokenPathToUrlSegment(newPrimitivePath.trim())}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ $type: extractToken.$type, $value: extractToken.$value }),
        });
      } catch (err) {
        setExtractError(err instanceof ApiError ? err.message : 'Failed to create primitive token.');
        return;
      }
      await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/${tokenPathToUrlSegment(extractToken.path)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ $value: `{${newPrimitivePath.trim()}}` }),
      });
    } else {
      if (!existingAlias) { setExtractError('Select an existing token to alias.'); return; }
      await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/${tokenPathToUrlSegment(extractToken.path)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ $value: `{${existingAlias}}` }),
      });
    }

    setExtractToken(null);
    onRefresh();
  }, [extractToken, extractMode, newPrimitivePath, newPrimitiveSet, existingAlias, connected, serverUrl, setName, onRefresh]);

  // requestBulkDelete wrapper — passes current selectedPaths
  const requestBulkDelete = useCallback(() => {
    requestBulkDeleteFromHook(selectedPaths);
  }, [requestBulkDeleteFromHook, selectedPaths]);

  const handleBatchMoveToGroup = useCallback(async () => {
    const target = moveToGroupTarget.trim();
    if (!target || selectedPaths.size === 0 || !connected) return;

    const renames = [...selectedPaths].map(oldPath => {
      const name = oldPath.split('.').pop()!;
      const newPath = `${target}.${name}`;
      return { oldPath, newPath };
    });

    const newPaths = renames.map(r => r.newPath);
    if (new Set(newPaths).size !== newPaths.length) {
      setMoveToGroupError('Some selected tokens have the same name — resolve conflicts before moving');
      return;
    }

    setShowMoveToGroup(false);
    setMoveToGroupError('');
    setOperationLoading(`Moving ${selectedPaths.size} token${selectedPaths.size !== 1 ? 's' : ''}…`);
    try {
      await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/batch-rename-paths`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ renames, updateAliases: true }),
      });
      setSelectedPaths(new Set());
      setSelectMode(false);
    } catch (err) {
      onError?.(err instanceof ApiError ? err.message : 'Move failed: network error');
    }
    setOperationLoading(null);
    onRefresh();
  }, [moveToGroupTarget, selectedPaths, connected, serverUrl, setName, onRefresh, onError]);

  // Handles token selection with modifier key support:
  // - ctrl/cmd-click: enter select mode and toggle the token
  // - shift-click (in select mode): range-select from last selected to current
  // - plain click (in select mode): toggle the token
  const handleTokenSelect = useCallback((path: string, modifiers?: { shift: boolean; ctrl: boolean }) => {
    const isCtrl = modifiers?.ctrl ?? false;
    const isShift = modifiers?.shift ?? false;

    if (isCtrl) {
      // Enter select mode on ctrl/cmd-click, then toggle this token
      if (!selectMode) setSelectMode(true);
      setSelectedPaths(prev => {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return next;
      });
      lastSelectedPathRef.current = path;
      return;
    }

    if (isShift && selectMode && lastSelectedPathRef.current !== null) {
      // Range-select from the anchor to the current path
      const orderedPaths = viewMode === 'tree'
        ? flatItems.filter(i => !i.node.isGroup).map(i => i.node.path)
        : displayedLeafNodes.map(n => n.path);
      const anchorIdx = orderedPaths.indexOf(lastSelectedPathRef.current);
      const targetIdx = orderedPaths.indexOf(path);
      if (anchorIdx !== -1 && targetIdx !== -1) {
        const lo = Math.min(anchorIdx, targetIdx);
        const hi = Math.max(anchorIdx, targetIdx);
        setSelectedPaths(prev => {
          const next = new Set(prev);
          for (let i = lo; i <= hi; i++) next.add(orderedPaths[i]);
          return next;
        });
        return; // Keep anchor at lastSelectedPathRef — don't update it on shift-click
      }
    }

    // Plain toggle
    setSelectedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
    lastSelectedPathRef.current = path;
  }, [selectMode, viewMode, flatItems, displayedLeafNodes]);

  const displayedLeafPaths = useMemo(
    () => crossSetResults !== null
      ? new Set(crossSetResults.map(r => r.path))
      : new Set(displayedLeafNodes.map(n => n.path)),
    [displayedLeafNodes, crossSetResults]
  );

  const selectedLeafNodes = useMemo(
    () => displayedLeafNodes.filter(n => selectedPaths.has(n.path)),
    [displayedLeafNodes, selectedPaths]
  );

  const handleSelectAll = () => {
    const allSelected = [...displayedLeafPaths].every(p => selectedPaths.has(p));
    if (allSelected) {
      setSelectedPaths(new Set());
    } else {
      setSelectedPaths(new Set(displayedLeafPaths));
    }
  };

  /** Build nested DTCG JSON from a list of token nodes and copy to clipboard. */
  const copyTokensAsJson = useCallback((nodes: TokenNode[]) => {
    if (nodes.length === 0) return;
    // Build a nested DTCG object from flat token paths
    const root: Record<string, any> = {};
    for (const node of nodes) {
      if (node.isGroup) continue;
      const segments = node.path.split('.');
      let cursor = root;
      for (let i = 0; i < segments.length - 1; i++) {
        if (!(segments[i] in cursor)) cursor[segments[i]] = {};
        cursor = cursor[segments[i]];
      }
      const leaf: Record<string, unknown> = { $value: node.$value, $type: node.$type };
      if (node.$description) leaf.$description = node.$description;
      cursor[segments[segments.length - 1]] = leaf;
    }
    const json = JSON.stringify(root, null, 2);
    navigator.clipboard.writeText(json).then(() => {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 1500);
    }).catch(err => console.warn('[TokenList] clipboard write failed:', err));
  }, []);
  copyTokensAsJsonRef.current = copyTokensAsJson;

  /** Convert token paths to CSS custom property references and copy to clipboard. */
  const copyTokensAsCssVar = useCallback((nodes: TokenNode[]) => {
    const leafNodes = nodes.filter(n => !n.isGroup);
    if (leafNodes.length === 0) return;
    const text = leafNodes
      .map(n => `var(--${n.path.replace(/\./g, '-')})`)
      .join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopyCssFeedback(true);
      setTimeout(() => setCopyCssFeedback(false), 1500);
    }).catch(err => console.warn('[TokenList] clipboard write failed:', err));
  }, []);
  copyTokensAsCssVarRef.current = copyTokensAsCssVar;

  const resolveFlat = (flat: any[]) =>
    flat.map(t => {
      if (t.$type === 'gradient' && Array.isArray(t.$value)) {
        const resolvedStops = t.$value.map((stop: { color: string; position: number }) => {
          if (isAlias(stop.color)) {
            const refPath = extractAliasPath(stop.color)!;
            const refEntry = allTokensFlat[refPath];
            if (refEntry) {
              const inner = resolveTokenValue(refEntry.$value, refEntry.$type, allTokensFlat);
              return { ...stop, color: inner.value ?? refEntry.$value };
            }
          }
          return stop;
        });
        return { ...t, $value: resolvedStops };
      }
      const resolved = resolveTokenValue(t.$value, t.$type, allTokensFlat);
      return { ...t, $value: resolved.value ?? t.$value, $type: resolved.$type };
    });

  const doApplyVariables = (flat: any[]) => {
    parent.postMessage({ pluginMessage: { type: 'apply-variables', tokens: flat, collectionMap, modeMap } }, '*');
    setApplyResult({ type: 'variables', count: flat.length });
    setTimeout(() => setApplyResult(null), 3000);
  };

  const handleApplyVariables = async () => {
    const flat = resolveFlat(flattenTokens(tokens)).map((t: any) => ({ ...t, setName }));
    setVarDiffLoading(true);
    try {
      const figmaTokens: any[] = await new Promise((resolve, reject) => {
        const cid = `tl-vars-${Date.now()}-${Math.random()}`;
        const timeout = setTimeout(() => {
          varReadPendingRef.current.delete(cid);
          reject(new Error('timeout'));
        }, 8000);
        varReadPendingRef.current.set(cid, (toks) => { clearTimeout(timeout); resolve(toks); });
        parent.postMessage({ pluginMessage: { type: 'read-variables', correlationId: cid } }, '*');
      });
      const figmaMap = new Map(figmaTokens.map((t: any) => [t.path, String(t.$value ?? '')]));
      let added = 0, modified = 0, unchanged = 0;
      for (const t of flat) {
        if (!figmaMap.has(t.path)) added++;
        else if (figmaMap.get(t.path) !== String(t.$value ?? '')) modified++;
        else unchanged++;
      }
      setVarDiffPending({ added, modified, unchanged, flat });
    } catch (err) {
      // Figma not reachable — show count-only confirmation
      console.warn('[TokenList] Figma variable diff failed:', err);
      setVarDiffPending({ added: flat.length, modified: 0, unchanged: 0, flat });
    } finally {
      setVarDiffLoading(false);
    }
  };

  const handleApplyStyles = async () => {
    setApplying(true);
    const flat = resolveFlat(flattenTokens(tokens));
    try {
      const result = await sendStyleApply('apply-styles', { tokens: flat });
      setApplyResult({ type: 'styles', count: result.count });
      if (result.failures.length > 0) {
        const failedPaths = result.failures.map(f => f.path).join(', ');
        onError?.(`${result.count}/${result.total} styles created. Failed: ${failedPaths}`);
      }
    } catch (err) {
      onError?.(getErrorMessage(err, 'Failed to apply styles'));
    } finally {
      setApplying(false);
      setTimeout(() => setApplyResult(null), 3000);
    }
  };


  const getDeleteModalProps = (): { title: string; description?: string; confirmLabel: string; pathList?: string[]; affectedRefs?: AffectedRef[] } | null => {
    if (!deleteConfirm) return null;
    if (deleteConfirm.type === 'token') {
      const name = deleteConfirm.path.split('.').pop() ?? deleteConfirm.path;
      const { orphanCount, affectedRefs } = deleteConfirm;
      const setCount = new Set(affectedRefs.map(r => r.setName)).size;
      return {
        title: `Delete "${name}"?`,
        description: orphanCount > 0
          ? `This will break ${orphanCount} alias reference${orphanCount !== 1 ? 's' : ''} in ${setCount} set${setCount !== 1 ? 's' : ''}.`
          : `Token path: ${deleteConfirm.path}`,
        confirmLabel: 'Delete',
        affectedRefs: orphanCount > 0 ? affectedRefs : undefined,
      };
    }
    if (deleteConfirm.type === 'group') {
      const { orphanCount, affectedRefs } = deleteConfirm;
      const setCount = new Set(affectedRefs.map(r => r.setName)).size;
      return {
        title: `Delete group "${deleteConfirm.name}"?`,
        description: orphanCount > 0
          ? `This will delete ${deleteConfirm.tokenCount} token${deleteConfirm.tokenCount !== 1 ? 's' : ''} and break ${orphanCount} alias reference${orphanCount !== 1 ? 's' : ''} in ${setCount} set${setCount !== 1 ? 's' : ''}.`
          : `This will delete ${deleteConfirm.tokenCount} token${deleteConfirm.tokenCount !== 1 ? 's' : ''} in this group.`,
        confirmLabel: `Delete group (${deleteConfirm.tokenCount} token${deleteConfirm.tokenCount !== 1 ? 's' : ''})`,
        affectedRefs: orphanCount > 0 ? affectedRefs : undefined,
      };
    }
    const { paths, orphanCount, affectedRefs } = deleteConfirm;
    const setCount = new Set(affectedRefs.map(r => r.setName)).size;
    return {
      title: `Delete ${paths.length} token${paths.length !== 1 ? 's' : ''}?`,
      description: orphanCount > 0
        ? `This will break ${orphanCount} alias reference${orphanCount !== 1 ? 's' : ''} in ${setCount} set${setCount !== 1 ? 's' : ''}.`
        : undefined,
      confirmLabel: `Delete ${paths.length} token${paths.length !== 1 ? 's' : ''}`,
      pathList: paths,
      affectedRefs: orphanCount > 0 ? affectedRefs : undefined,
    };
  };

  const modalProps = getDeleteModalProps();

  // Scroll the virtual list to a group header row
  const handleJumpToGroup = useCallback((groupPath: string) => {
    const idx = flatItems.findIndex(item => item.node.path === groupPath);
    if (idx >= 0 && virtualListRef.current) {
      const targetScrollTop = Math.max(0, itemOffsets[idx]);
      virtualListRef.current.scrollTop = targetScrollTop;
      setVirtualScrollTop(targetScrollTop);
    }
  }, [flatItems, itemOffsets]);

  // Collapse all groups that are descendants of the given group path,
  // keeping the ancestor chain expanded so the group header stays visible
  const handleCollapseBelow = useCallback((groupPath: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      const prefix = groupPath + '.';
      for (const p of prev) {
        if (p === groupPath || p.startsWith(prefix)) {
          next.delete(p);
        }
      }
      return next;
    });
    // Jump to the (now-collapsed) group header
    const idx = flatItems.findIndex(item => item.node.path === groupPath);
    if (idx >= 0 && virtualListRef.current) {
      const targetScrollTop = Math.max(0, itemOffsets[idx]);
      virtualListRef.current.scrollTop = targetScrollTop;
      setVirtualScrollTop(targetScrollTop);
    }
  }, [flatItems, itemOffsets]);

  const handleZoomIntoGroup = useCallback((groupPath: string) => {
    setZoomRootPath(groupPath);
    setVirtualScrollTop(0);
    if (virtualListRef.current) virtualListRef.current.scrollTop = 0;
    // Ensure the zoom target's children are visible
    setExpandedPaths(prev => { const next = new Set(prev); next.add(groupPath); return next; });
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomRootPath(null);
    setVirtualScrollTop(0);
    if (virtualListRef.current) virtualListRef.current.scrollTop = 0;
  }, []);

  const handleZoomToAncestor = useCallback((ancestorPath: string) => {
    setZoomRootPath(ancestorPath || null);
    setVirtualScrollTop(0);
    if (virtualListRef.current) virtualListRef.current.scrollTop = 0;
  }, []);

  // Virtual scroll window computation — uses itemOffsets for variable-height rows
  const virtualContainerH = virtualListRef.current?.clientHeight ?? 500;
  const totalVirtualH = itemOffsets[flatItems.length];
  // Find the first item whose bottom edge is below virtualScrollTop
  let rawStart = 0;
  while (rawStart < flatItems.length && itemOffsets[rawStart + 1] <= virtualScrollTop) rawStart++;
  // Find the first item whose top edge is past the bottom of the viewport
  let rawEnd = rawStart;
  while (rawEnd < flatItems.length && itemOffsets[rawEnd] < virtualScrollTop + virtualContainerH) rawEnd++;
  const virtualStartIdx = Math.max(0, rawStart - VIRTUAL_OVERSCAN);
  const virtualEndIdx = Math.min(flatItems.length, rawEnd + VIRTUAL_OVERSCAN);
  const virtualTopPad = itemOffsets[virtualStartIdx];
  const virtualBottomPad = Math.max(0, totalVirtualH - itemOffsets[virtualEndIdx]);

  // Breadcrumb: build ancestor path segments for the first visible item
  // Map group paths → display names from the flat items list
  const groupNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const { node } of flatItems) {
      if (node.isGroup) map.set(node.path, node.name);
    }
    return map;
  }, [flatItems]);

  const zoomBreadcrumb = useMemo(() => {
    if (!zoomRootPath) return null;
    return buildZoomBreadcrumb(zoomRootPath, sortedTokens);
  }, [zoomRootPath, sortedTokens]);

  const breadcrumbSegments = useMemo(() => {
    if (flatItems.length === 0 || rawStart >= flatItems.length) return [];
    const topItem = flatItems[rawStart];
    if (topItem.depth === 0) return [];
    // Walk up the ancestor chain from the top visible item
    const segments: Array<{ name: string; path: string }> = [];
    let currentPath = topItem.node.path;
    let currentName = topItem.node.name;
    while (currentPath.length > currentName.length) {
      const parentPath = currentPath.slice(0, currentPath.length - currentName.length - 1);
      if (!parentPath) break;
      const parentName = groupNameMap.get(parentPath);
      if (parentName) {
        segments.unshift({ name: parentName, path: parentPath });
        currentPath = parentPath;
        currentName = parentName;
      } else {
        break;
      }
    }
    return segments;
  }, [flatItems, rawStart, groupNameMap]);

  // Enter select mode with a single token pre-selected, then navigate to compare tab
  const handleCompareToken = useCallback((path: string) => {
    if (onOpenCompare) {
      onOpenCompare(new Set([path]));
    } else {
      setSelectMode(true);
      setSelectedPaths(new Set([path]));
      setShowBatchEditor(false);
    }
  }, [onOpenCompare]);

  const handleCompareAcrossThemes = useCallback((path: string) => {
    if (onOpenCrossThemeCompare) {
      onOpenCrossThemeCompare(path);
    }
  }, [onOpenCrossThemeCompare]);

  // Expose imperative compare actions to the parent via compareHandle ref
  useEffect(() => {
    if (!compareHandle) return;
    compareHandle.current = {
      openCompareMode: () => {
        setSelectMode(true);
        setShowBatchEditor(false);
      },
    };
    return () => { compareHandle.current = null; };
  }, [compareHandle]);

  const handleClearPendingRename = useCallback(() => setPendingRenameToken(null), []);

  // --- Token tree context: shared state & callbacks for all TokenTreeNode instances ---
  const treeCtx: TokenTreeContextType = useMemo(() => ({
    density,
    setName,
    selectionCapabilities,
    allTokensFlat,
    selectMode,
    expandedPaths,
    duplicateCounts,
    highlightedToken: highlightedToken ?? null,
    inspectMode,
    syncSnapshot,
    cascadeDiff,
    generatorsBySource,
    derivedTokenPaths,
    tokenUsageCounts,
    searchHighlight,
    selectedNodes,
    dragOverGroup,
    dragOverGroupIsInvalid,
    dragSource,
    dragOverReorder,
    selectedLeafNodes,
    onEdit,
    onPreview,
    onDelete: requestDeleteToken,
    onDeleteGroup: requestDeleteGroup,
    onToggleSelect: handleTokenSelect,
    onToggleExpand: handleToggleExpand,
    onNavigateToAlias,
    onCreateSibling: handleOpenCreateSibling,
    onCreateGroup: setNewGroupDialogParent,
    onRenameGroup: handleRenameGroup,
    onUpdateGroupMeta: handleUpdateGroupMeta,
    onRequestMoveGroup: handleRequestMoveGroup,
    onRequestCopyGroup: handleRequestCopyGroup,
    onRequestMoveToken: handleRequestMoveToken,
    onRequestCopyToken: handleRequestCopyToken,
    onDuplicateGroup: handleDuplicateGroup,
    onDuplicateToken: handleDuplicateToken,
    onExtractToAlias: handleOpenExtractToAlias,
    onHoverToken: handleHoverToken,
    onExtractToAliasForLint: handleOpenExtractToAlias,
    onSyncGroup,
    onSyncGroupStyles,
    onSetGroupScopes,
    onGenerateScaleFromGroup,
    onFilterByType: setTypeFilter,
    onJumpToGroup: handleJumpToGroup,
    onZoomIntoGroup: handleZoomIntoGroup,
    onInlineSave: handleInlineSave,
    onRenameToken: handleRenameToken,
    onDetachFromGenerator: handleDetachFromGenerator,
    onNavigateToGenerator,
    onToggleChain: handleToggleChain,
    onTogglePin: pinnedTokens.togglePin,
    onCompareToken: handleCompareToken,
    onViewTokenHistory,
    onShowReferences,
    onCompareAcrossThemes: dimensions.length > 0 ? handleCompareAcrossThemes : undefined,
    onDragStart: handleDragStart,
    onDragEnd: handleDragEnd,
    onDragOverGroup: handleDragOverGroup,
    onDropOnGroup: handleDropOnGroup,
    onDragOverToken: handleDragOverToken,
    onDragLeaveToken: handleDragLeaveToken,
    onDropOnToken: handleDropReorder,
    onMultiModeInlineSave: multiModeData ? handleMultiModeInlineSave : undefined,
    showResolvedValues,
    themeCoverage,
    pathToSet,
    dimensions,
    activeThemes,
    pendingRenameToken,
    clearPendingRename: handleClearPendingRename,
    pendingTabEdit,
    clearPendingTabEdit: handleClearPendingTabEdit,
    onTabToNext: handleTabToNext,
  }), [
    density, setName, selectionCapabilities, allTokensFlat, selectMode, expandedPaths,
    duplicateCounts, highlightedToken, inspectMode, syncSnapshot, cascadeDiff,
    generatorsBySource, derivedTokenPaths, tokenUsageCounts, searchHighlight,
    selectedNodes, dragOverGroup, dragOverGroupIsInvalid, dragSource,
    dragOverReorder, selectedLeafNodes, onEdit, onPreview, requestDeleteToken,
    requestDeleteGroup, handleTokenSelect, handleToggleExpand, onNavigateToAlias,
    handleOpenCreateSibling, handleRenameGroup, handleUpdateGroupMeta,
    handleRequestMoveGroup, handleRequestCopyGroup, handleRequestMoveToken, handleRequestCopyToken,
    setNewGroupDialogParent, onNavigateToGenerator, handleDuplicateGroup,
    handleDuplicateToken, handleOpenExtractToAlias, handleHoverToken,
    onSyncGroup, onSyncGroupStyles, onSetGroupScopes, onGenerateScaleFromGroup,
    setTypeFilter, handleJumpToGroup, handleInlineSave, handleRenameToken,
    handleDetachFromGenerator, handleToggleChain, handleZoomIntoGroup, pinnedTokens.togglePin,
    handleCompareToken, onViewTokenHistory, onShowReferences, handleCompareAcrossThemes, handleDragStart, handleDragEnd, handleDragOverGroup, handleDropOnGroup,
    handleDragOverToken, handleDragLeaveToken, handleDropReorder,
    multiModeData, handleMultiModeInlineSave, showResolvedValues, themeCoverage,
    pathToSet, dimensions, activeThemes, pendingRenameToken, handleClearPendingRename,
    pendingTabEdit, handleClearPendingTabEdit, handleTabToNext,
  ]);

  return (
    <div className="flex flex-col h-full" onKeyDown={handleListKeyDown}>
      {/* Toolbars — fixed above the scrollable token list */}
      <div className="flex-shrink-0">
        {/* Select mode toolbar */}
        {selectMode && (
          <div className="flex items-center gap-2 px-2 py-1.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
            <span className="text-[10px] text-[var(--color-figma-text-secondary)] flex-1">
              {selectedPaths.size} of {displayedLeafPaths.size} selected
            </span>
            <button
              onClick={handleSelectAll}
              className="px-2 py-1 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
            >
              {[...displayedLeafPaths].every(p => selectedPaths.has(p)) && displayedLeafPaths.size > 0 ? 'Deselect all' : 'Select all'}
            </button>
            {selectedPaths.size > 0 && (
              <>
                <button
                  onClick={() => setShowBatchEditor(v => !v)}
                  className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${showBatchEditor ? 'bg-[var(--color-figma-accent)] text-white' : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
                >
                  Edit {selectedPaths.size} selected
                </button>
                {selectedPaths.size >= 2 && onOpenCompare && (
                  <button
                    onClick={() => onOpenCompare(selectedPaths)}
                    className="px-2 py-1 rounded text-[10px] font-medium text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                  >
                    Compare
                  </button>
                )}
                <button
                  onClick={() => handleOpenPromoteModal()}
                  className="px-2 py-1 rounded text-[10px] font-medium text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                >
                  Link to tokens
                </button>
                <button
                  onClick={() => { setMoveToGroupTarget(''); setMoveToGroupError(''); setShowMoveToGroup(true); }}
                  disabled={!!operationLoading}
                  className="px-2 py-1 rounded text-[10px] font-medium text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors disabled:opacity-50 disabled:pointer-events-none"
                >
                  Move to group…
                </button>
                <button
                  onClick={() => {
                    const nodes = displayedLeafNodes.filter(n => selectedPaths.has(n.path));
                    copyTokensAsJson(nodes);
                  }}
                  className="px-2 py-1 rounded text-[10px] font-medium text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                >
                  <span aria-live="polite">{copyFeedback ? 'Copied!' : 'Copy JSON'}</span>
                </button>
                <button
                  onClick={() => {
                    const nodes = displayedLeafNodes.filter(n => selectedPaths.has(n.path));
                    copyTokensAsCssVar(nodes);
                  }}
                  className="px-2 py-1 rounded text-[10px] font-medium text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                >
                  <span aria-live="polite">{copyCssFeedback ? 'Copied!' : 'Copy CSS var'}</span>
                </button>
                <button
                  onClick={requestBulkDelete}
                  disabled={!!operationLoading}
                  className="px-2 py-1 rounded text-[10px] font-medium text-[var(--color-figma-error)] hover:bg-[var(--color-figma-bg-hover)] transition-colors disabled:opacity-50 disabled:pointer-events-none"
                >
                  Delete {selectedPaths.size}
                </button>
              </>
            )}
            <button
              onClick={() => { setSelectMode(false); setSelectedPaths(new Set()); setShowBatchEditor(false); }}
              className="px-2 py-1 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Batch editor panel */}
        {selectMode && showBatchEditor && selectedPaths.size > 0 && (
          <BatchEditor
            selectedPaths={selectedPaths}
            allTokensFlat={allTokensFlat}
            setName={setName}
            sets={sets}
            serverUrl={serverUrl}
            connected={connected}
            onApply={onRefresh}
            onPushUndo={onPushUndo}
          />
        )}

        {/* Navigation back button — appears after alias navigation */}
        {(navHistoryLength ?? 0) > 0 && !selectMode && (
          <div className="flex items-center gap-1 px-2 py-1 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
            <button
              onClick={onNavigateBack}
              className="flex items-center gap-1 text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
              title="Go back to previous token (Alt+←)"
              aria-label="Go back to previous token"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Back
            </button>
            {(navHistoryLength ?? 0) > 1 && (
              <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">({navHistoryLength})</span>
            )}
          </div>
        )}

        {/* Unified toolbar — view modes, search, filters, and actions in one compact bar */}
        {tokens.length > 0 && !selectMode && (
          <div className="flex flex-col border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
            {/* Row 1: View modes + expand/collapse + sort + actions */}
            <div className="flex items-center gap-0.5 px-2 py-1">
              {/* View mode segmented control */}
              <div className="flex items-center bg-[var(--color-figma-bg)] rounded border border-[var(--color-figma-border)] p-0.5">
                {(['tree', 'table', 'json'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    title={mode === 'tree' ? 'Tree view' : mode === 'table' ? 'Table view' : 'JSON editor'}
                    aria-pressed={viewMode === mode}
                    className={`px-1.5 py-1 rounded text-[10px] transition-colors capitalize ${viewMode === mode ? 'bg-[var(--color-figma-accent)] text-white font-medium' : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'}`}
                  >
                    {mode === 'json' ? '</>' : mode}
                  </button>
                ))}
              </div>

              {/* Expand/Collapse (tree view only) */}
              {viewMode === 'tree' && tokens.some(n => n.isGroup) && (
                <>
                  <div className="w-px h-3 bg-[var(--color-figma-border)] mx-0.5 shrink-0" />
                  <button
                    onClick={handleExpandAll}
                    title="Expand all groups"
                    aria-label="Expand all groups"
                    className="p-1.5 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] transition-colors"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                      <path d="M2 3.5l3 3 3-3"/>
                      <path d="M2 6.5l3 3 3-3"/>
                    </svg>
                  </button>
                  <button
                    onClick={handleCollapseAll}
                    title="Collapse all groups"
                    aria-label="Collapse all groups"
                    className="p-1.5 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] transition-colors"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                      <path d="M2 6.5l3-3 3 3"/>
                      <path d="M2 3.5l3-3 3 3"/>
                    </svg>
                  </button>
                </>
              )}

              {/* Density toggle */}
              {(viewMode === 'tree' || viewMode === 'table') && (
                <>
                  <div className="w-px h-3 bg-[var(--color-figma-border)] mx-0.5 shrink-0" />
                  <button
                    onClick={() => {
                      const cycle: Density[] = ['compact', 'default', 'comfortable'];
                      setDensity(cycle[(cycle.indexOf(density) + 1) % 3]);
                    }}
                    title={`Row density: ${density} — click to cycle`}
                    aria-label={`Row density: ${density}`}
                    className="p-1.5 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] transition-colors"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" aria-hidden="true">
                      {density === 'compact' ? (
                        <>
                          <line x1="1" y1="1.5" x2="9" y2="1.5" />
                          <line x1="1" y1="3.5" x2="9" y2="3.5" />
                          <line x1="1" y1="5.5" x2="9" y2="5.5" />
                          <line x1="1" y1="7.5" x2="9" y2="7.5" />
                        </>
                      ) : density === 'comfortable' ? (
                        <>
                          <line x1="1" y1="2" x2="9" y2="2" />
                          <line x1="1" y1="5" x2="9" y2="5" />
                          <line x1="1" y1="8" x2="9" y2="8" />
                        </>
                      ) : (
                        <>
                          <line x1="1" y1="1" x2="9" y2="1" />
                          <line x1="1" y1="3.7" x2="9" y2="3.7" />
                          <line x1="1" y1="6.3" x2="9" y2="6.3" />
                          <line x1="1" y1="9" x2="9" y2="9" />
                        </>
                      )}
                    </svg>
                  </button>
                </>
              )}

              {/* Multi-mode toggle — show per-theme columns */}
              {dimensions.length > 0 && viewMode === 'tree' && (
                <>
                  <div className="w-px h-3 bg-[var(--color-figma-border)] mx-0.5 shrink-0" />
                  <button
                    onClick={toggleMultiMode}
                    title={multiModeEnabled ? 'Hide mode columns' : 'Show values per theme mode side-by-side'}
                    aria-pressed={multiModeEnabled}
                    className={`px-1.5 py-1 rounded text-[10px] transition-colors flex items-center gap-0.5 ${multiModeEnabled ? 'bg-[var(--color-figma-accent)] text-white font-medium' : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'}`}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="3" y="3" width="7" height="18" rx="1" />
                      <rect x="14" y="3" width="7" height="18" rx="1" />
                    </svg>
                    Modes
                  </button>
                  {multiModeEnabled && dimensions.length > 1 && (
                    <select
                      value={multiModeDimId ?? ''}
                      onChange={e => setMultiModeDimId(e.target.value)}
                      className="text-[10px] bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] rounded px-1 py-0.5 text-[var(--color-figma-text)] outline-none"
                    >
                      {dimensions.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  )}
                </>
              )}

              {/* Resolve all toggle — show resolved values for alias tokens */}
              {viewMode === 'tree' && (
                <>
                  <div className="w-px h-3 bg-[var(--color-figma-border)] mx-0.5 shrink-0" />
                  <button
                    onClick={() => setShowResolvedValues(v => !v)}
                    title={showResolvedValues ? 'Show raw alias references' : 'Resolve all aliases — show final values'}
                    aria-pressed={showResolvedValues}
                    className={`px-1.5 py-1 rounded text-[10px] transition-colors flex items-center gap-0.5 ${showResolvedValues ? 'bg-[var(--color-figma-accent)] text-white font-medium' : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'}`}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                    Resolved
                  </button>
                </>
              )}

              {/* Compare button — enters multi-select mode to compare tokens */}
              {viewMode === 'tree' && (
                <>
                  <div className="w-px h-3 bg-[var(--color-figma-border)] mx-0.5 shrink-0" />
                  <button
                    onClick={() => { setSelectMode(true); setShowCompare(true); setShowBatchEditor(false); }}
                    title="Compare tokens — enter select mode to compare two or more tokens side-by-side"
                    aria-label="Compare tokens"
                    className="p-1.5 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] transition-colors"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4"/>
                      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                      <line x1="12" y1="3" x2="12" y2="21"/>
                    </svg>
                  </button>
                </>
              )}

              {/* Spacer */}
              <div className="flex-1" />

              {/* Sync changed indicator */}
              {syncSnapshot && syncChangedCount > 0 && (
                <span
                  title="Tokens edited locally since the last sync"
                  className="flex items-center gap-1 text-[10px] text-[var(--color-figma-warning)] mr-0.5"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-figma-warning)] shrink-0" />
                  {syncChangedCount}
                </span>
              )}

              {/* Lint issue count badge */}
              {lintViolations.length > 0 && (
                <button
                  onClick={onToggleIssuesOnly}
                  title={`${lintViolations.length} lint issue${lintViolations.length !== 1 ? 's' : ''} — click to filter`}
                  aria-label={`${lintViolations.length} lint issue${lintViolations.length !== 1 ? 's' : ''}`}
                  className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${showIssuesOnly ? 'bg-[var(--color-figma-error)] text-white' : 'text-[var(--color-figma-error)] bg-[var(--color-figma-error)]/10 hover:bg-[var(--color-figma-error)]/20'}`}
                >
                  <svg width="8" height="8" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
                    <path d="M5 1L0.5 9h9L5 1zM5 3.5v2.5M5 7.5v.5"/>
                  </svg>
                  {lintViolations.length}
                </button>
              )}

              {/* Sort */}
              <select
                value={sortOrder}
                onChange={e => setSortOrder(e.target.value as SortOrder)}
                aria-label="Sort order"
                className={`text-[10px] bg-transparent border-none outline-none cursor-pointer shrink-0 ${sortOrder !== 'default' ? 'text-[var(--color-figma-accent)] font-medium' : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]'}`}
              >
                <option value="default">Sort</option>
                <option value="alpha-asc">A → Z</option>
                <option value="alpha-desc">Z → A</option>
                <option value="by-type">By type</option>
                <option value="by-value">By value</option>
              </select>

              {/* Recently touched filter */}
              {recentlyTouched.count > 0 && (
                <button
                  onClick={() => setShowRecentlyTouched(v => !v)}
                  title={showRecentlyTouched ? 'Show all tokens' : `Show ${recentlyTouched.count} recently touched token${recentlyTouched.count !== 1 ? 's' : ''}`}
                  aria-label={showRecentlyTouched ? 'Show all tokens' : 'Show recently touched tokens'}
                  aria-pressed={showRecentlyTouched}
                  className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${showRecentlyTouched ? 'bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)]' : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]'}`}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" aria-hidden="true">
                    <circle cx="5" cy="5" r="4" />
                    <path d="M5 3v2.5l1.5 1" />
                  </svg>
                  {recentlyTouched.count}
                </button>
              )}

              {/* Pinned filter */}
              {pinnedTokens.count > 0 && (
                <button
                  onClick={() => setShowPinnedOnly(v => !v)}
                  title={showPinnedOnly ? 'Show all tokens' : `Show ${pinnedTokens.count} pinned token${pinnedTokens.count !== 1 ? 's' : ''}`}
                  aria-label={showPinnedOnly ? 'Show all tokens' : 'Show pinned tokens'}
                  aria-pressed={showPinnedOnly}
                  className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${showPinnedOnly ? 'bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)]' : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]'}`}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1" aria-hidden="true">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                  {pinnedTokens.count}
                </button>
              )}

              {/* Selection filter */}
              <button
                onClick={() => setInspectMode(v => !v)}
                title={inspectMode ? 'Show all tokens' : 'Show only tokens bound to selection'}
                aria-label={inspectMode ? 'Show all tokens' : 'Show only tokens bound to selection'}
                aria-pressed={inspectMode}
                className={`p-1 rounded transition-colors ${inspectMode ? 'text-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/15' : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]'}`}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" aria-hidden="true">
                  <rect x="1" y="1" width="8" height="8" rx="1" />
                  <path d="M3.5 5l1.5 1.5 2-2.5"/>
                </svg>
              </button>

              {/* Multi-select toggle */}
              <button
                onClick={() => setSelectMode(true)}
                title="Select multiple tokens (M)"
                aria-label="Select multiple tokens"
                className="flex items-center gap-1 px-1.5 py-1 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] transition-colors"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" aria-hidden="true">
                  <rect x="0.5" y="0.5" width="4" height="3.5" rx="0.5"/>
                  <path d="M1.5 2.25l0.8 0.8 1.5-1.5"/>
                  <rect x="0.5" y="5.5" width="4" height="3.5" rx="0.5"/>
                  <path d="M1.5 7.25l0.8 0.8 1.5-1.5"/>
                  <line x1="6.5" y1="2.25" x2="9.5" y2="2.25"/>
                  <line x1="6.5" y1="7.25" x2="9.5" y2="7.25"/>
                </svg>
                Select
              </button>

              {/* More actions menu */}
              <div className="relative shrink-0" ref={moreFiltersRef}>
                <button
                  title="More actions"
                  aria-label="More actions"
                  aria-haspopup="menu"
                  aria-expanded={moreFiltersOpen}
                  onClick={() => setMoreFiltersOpen(v => !v)}
                  className="p-1 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] transition-colors"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
                    <circle cx="2" cy="5" r="1"/>
                    <circle cx="5" cy="5" r="1"/>
                    <circle cx="8" cy="5" r="1"/>
                  </svg>
                </button>
                {moreFiltersOpen && (
                  <div role="menu" className="absolute right-0 top-full mt-0.5 z-50 bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] rounded shadow-lg flex flex-col py-1 min-w-[160px]">
                    <button role="menuitem" onClick={() => { setShowScaffold(true); setMoreFiltersOpen(false); }} className="px-3 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]">Use preset…</button>
                    <button role="menuitem" onClick={() => { setShowFindReplace(true); setMoreFiltersOpen(false); }} disabled={!connected} className="px-3 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40">Find &amp; Replace…</button>
                    <div className="border-t border-[var(--color-figma-border)] my-1" />
                    <button role="menuitem" onClick={() => { setMoreFiltersOpen(false); handleApplyVariables(); }} disabled={applying || varDiffLoading || tokens.length === 0} className="px-3 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40">{varDiffLoading ? 'Comparing…' : 'Apply as Variables'}</button>
                    <button role="menuitem" onClick={() => { handleApplyStyles(); setMoreFiltersOpen(false); }} disabled={applying || tokens.length === 0} className="px-3 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40">Apply as Styles</button>
                    <div className="border-t border-[var(--color-figma-border)] my-1" />
                    {refFilter === 'all' && (
                      <>
                        <button role="menuitem" onClick={() => { setRefFilter('aliases'); setMoreFiltersOpen(false); }} className="px-3 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]">Show references only</button>
                        <button role="menuitem" onClick={() => { setRefFilter('direct'); setMoreFiltersOpen(false); }} className="px-3 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]">Show direct values only</button>
                      </>
                    )}
                    {!showDuplicates && (
                      <button role="menuitem" onClick={() => { setShowDuplicates(true); setMoreFiltersOpen(false); }} className="px-3 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]">Show duplicates</button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Row 2: Search + active filters (only in non-json views) */}
            {viewMode !== 'json' && (<>
              <div className="flex items-center gap-1 px-2 pb-1">
                <div className="flex-1 min-w-0 relative">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[var(--color-figma-text-tertiary)] pointer-events-none" aria-hidden="true">
                    <circle cx="4" cy="4" r="3"/>
                    <path d="M6.5 6.5L9 9" strokeLinecap="round"/>
                  </svg>
                  <input
                    ref={searchRef}
                    type="text"
                    value={searchQuery}
                    onChange={e => {
                      setSearchQuery(e.target.value);
                      setHintIndex(0);
                    }}
                    onFocus={() => { setShowQualifierHints(true); setSearchFocused(true); }}
                    onBlur={() => { setTimeout(() => setShowQualifierHints(false), 150); setSearchFocused(false); }}
                    onKeyDown={e => {
                      if (!showQualifierHints || qualifierHints.length === 0) return;
                      if (e.key === 'ArrowDown') { e.preventDefault(); setHintIndex(i => Math.min(i + 1, qualifierHints.length - 1)); }
                      else if (e.key === 'ArrowUp') { e.preventDefault(); setHintIndex(i => Math.max(i - 1, 0)); }
                      else if (e.key === 'Tab' || (e.key === 'Enter' && qualifierHints.length > 0)) {
                        e.preventDefault();
                        const hint = qualifierHints[hintIndex];
                        if (hint) {
                          const words = searchQuery.split(/\s+/);
                          words[words.length - 1] = hint.qualifier;
                          setSearchQuery(words.join(' '));
                          setHintIndex(0);
                        }
                      }
                    }}
                    placeholder={hasStructuredQualifiers(searchQuery) ? 'Add more filters…' : `Search (/) — try ${PLACEHOLDER_EXAMPLES[placeholderIdx]}`}
                    className={`w-full pl-6 pr-2 py-1 rounded bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] text-[10px] outline-none placeholder:text-[var(--color-figma-text-tertiary)] ${hasStructuredQualifiers(searchQuery) ? 'border-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)]'} focus:border-[var(--color-figma-accent)]`}
                  />
                  {/* Qualifier autocomplete hints */}
                  {showQualifierHints && qualifierHints.length > 0 && (
                    <div ref={qualifierHintsRef} className="absolute left-0 top-full mt-0.5 w-full z-50 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                      {!searchQuery.trim() && (
                        <div className="px-2 py-1 border-b border-[var(--color-figma-border)] text-[9px] font-medium text-[var(--color-figma-text-tertiary)] uppercase tracking-wide">
                          Search qualifiers
                        </div>
                      )}
                      {qualifierHints.map((hint, i) => (
                        <button
                          key={hint.qualifier}
                          onMouseDown={e => {
                            e.preventDefault();
                            const words = searchQuery.split(/\s+/);
                            words[words.length - 1] = hint.qualifier;
                            setSearchQuery(words.join(' ').trim());
                            setHintIndex(0);
                            searchRef.current?.focus();
                          }}
                          className={`w-full text-left px-2 py-1 text-[10px] flex items-center gap-2 ${i === hintIndex ? 'bg-[var(--color-figma-bg-selected)] text-[var(--color-figma-text)]' : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
                        >
                          <span className="font-mono font-semibold text-[var(--color-figma-accent)]">{hint.qualifier}</span>
                          <span className="truncate">{hint.desc}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {/* Search qualifier help button */}
                <div className="relative shrink-0">
                  <button
                    onClick={() => setShowQualifierHelp(v => !v)}
                    onBlur={() => { setTimeout(() => setShowQualifierHelp(false), 150); }}
                    title="Search qualifiers cheat sheet"
                    aria-label="Search qualifiers cheat sheet"
                    className={`flex items-center justify-center w-5 h-5 rounded border text-[10px] font-bold cursor-pointer transition-colors ${showQualifierHelp ? 'border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-tertiary)] bg-[var(--color-figma-bg)] hover:text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-text-tertiary)]'}`}
                  >
                    ?
                  </button>
                  {showQualifierHelp && (
                    <div ref={qualifierHelpRef} className="absolute right-0 top-full mt-1 w-56 z-50 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] shadow-lg overflow-hidden">
                      <div className="px-2 py-1.5 border-b border-[var(--color-figma-border)]">
                        <span className="text-[10px] font-semibold text-[var(--color-figma-text)]">Search Qualifiers</span>
                        <span className="text-[10px] text-[var(--color-figma-text-tertiary)] ml-1">click to insert</span>
                      </div>
                      <div className="max-h-48 overflow-y-auto">
                        {QUERY_QUALIFIERS.map(hint => (
                          <button
                            key={hint.qualifier}
                            onMouseDown={e => {
                              e.preventDefault();
                              const q = searchQuery ? searchQuery + ' ' + hint.qualifier : hint.qualifier;
                              setSearchQuery(q);
                              setShowQualifierHelp(false);
                              searchRef.current?.focus();
                            }}
                            className="w-full text-left px-2 py-1 text-[10px] flex flex-col gap-0 hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                          >
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-semibold text-[var(--color-figma-accent)]">{hint.qualifier}</span>
                              <span className="text-[var(--color-figma-text-secondary)] truncate">{hint.desc}</span>
                            </div>
                            {hint.example && (
                              <span className="text-[10px] text-[var(--color-figma-text-tertiary)] font-mono ml-0.5">e.g. {hint.example}</span>
                            )}
                          </button>
                        ))}
                      </div>
                      <div className="px-2 py-1 border-t border-[var(--color-figma-border)] text-[10px] text-[var(--color-figma-text-tertiary)]">
                        Combine qualifiers: <span className="font-mono">type:color has:alias</span>
                      </div>
                    </div>
                  )}
                </div>
                <select
                  value={typeFilter}
                  onChange={e => setTypeFilter(e.target.value)}
                  title="Filter by type"
                  aria-label="Filter by type"
                  className={`shrink-0 px-1 py-1 rounded border text-[10px] outline-none cursor-pointer ${typeFilter ? 'border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-bg)]'}`}
                >
                  <option value="">Type</option>
                  {availableTypes.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                {/* Cross-set search toggle (only with multiple sets) */}
                {sets.length > 1 && (
                  <button
                    onClick={() => setCrossSetSearch(v => !v)}
                    title={crossSetSearch ? 'Search current set only' : 'Search across all sets'}
                    className={`shrink-0 px-1.5 py-1 rounded border text-[10px] outline-none cursor-pointer transition-colors ${crossSetSearch ? 'border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-bg)]'}`}
                  >
                    All sets
                  </button>
                )}
                {/* Compact filter indicator — when ≥2 non-search filters active, collapse pills into a single badge */}
                {activeFilterCount >= 2 ? (
                  <>
                    <button
                      onClick={() => setFilterDrawerOpen(v => !v)}
                      title={filterDrawerOpen ? 'Hide active filters' : 'Show active filters'}
                      aria-label={`${activeFilterCount} filters active, click to ${filterDrawerOpen ? 'hide' : 'show'} details`}
                      aria-expanded={filterDrawerOpen}
                      className="shrink-0 px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap transition-colors bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/20 flex items-center gap-1"
                    >
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                        <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>
                      </svg>
                      Filters ({activeFilterCount})
                    </button>
                    <button
                      onClick={() => { clearFilters(); setFilterDrawerOpen(false); }}
                      title="Clear all filters"
                      aria-label="Clear all filters"
                      className="flex items-center justify-center w-5 h-5 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] shrink-0"
                    >
                      <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
                        <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    </button>
                  </>
                ) : (
                  <>
                    {/* Single filter pills shown inline when ≤1 active */}
                    {refFilter !== 'all' && (
                      <button
                        onClick={() => setRefFilter('all')}
                        title="Clear reference filter"
                        className="shrink-0 px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap transition-colors bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/20"
                      >
                        {refFilter === 'aliases' ? 'Refs' : 'Direct'} ✕
                      </button>
                    )}
                    {showDuplicates && (
                      <button
                        onClick={() => setShowDuplicates(false)}
                        title="Clear duplicate filter"
                        className="shrink-0 px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap transition-colors bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/20"
                      >
                        Dups ✕
                      </button>
                    )}
                    {showIssuesOnly && (
                      <button
                        onClick={onToggleIssuesOnly}
                        title="Clear issues filter"
                        className="shrink-0 px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap transition-colors bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/20"
                      >
                        Issues ✕
                      </button>
                    )}
                    {showRecentlyTouched && (
                      <button
                        onClick={() => setShowRecentlyTouched(false)}
                        title="Clear recently touched filter"
                        className="shrink-0 px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap transition-colors bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/20"
                      >
                        Recent ✕
                      </button>
                    )}
                    {showPinnedOnly && (
                      <button
                        onClick={() => setShowPinnedOnly(false)}
                        title="Clear pinned filter"
                        className="shrink-0 px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap transition-colors bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/20"
                      >
                        Pinned ✕
                      </button>
                    )}
                    {typeFilter !== '' && (
                      <button
                        onClick={() => setTypeFilter('')}
                        title="Clear type filter"
                        className="shrink-0 px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap transition-colors bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/20"
                      >
                        {typeFilter} ✕
                      </button>
                    )}
                  </>
                )}
              </div>
              {/* Expandable filter drawer — shows individual pills when compact indicator is clicked */}
              {activeFilterCount >= 2 && filterDrawerOpen && (
                <div className="flex items-center gap-1 px-2 pb-1 flex-wrap">
                  {typeFilter !== '' && (
                    <button
                      onClick={() => setTypeFilter('')}
                      title="Clear type filter"
                      className="shrink-0 px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap transition-colors bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/20"
                    >
                      Type: {typeFilter} ✕
                    </button>
                  )}
                  {refFilter !== 'all' && (
                    <button
                      onClick={() => setRefFilter('all')}
                      title="Clear reference filter"
                      className="shrink-0 px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap transition-colors bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/20"
                    >
                      {refFilter === 'aliases' ? 'Refs' : 'Direct'} ✕
                    </button>
                  )}
                  {showDuplicates && (
                    <button
                      onClick={() => setShowDuplicates(false)}
                      title="Clear duplicate filter"
                      className="shrink-0 px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap transition-colors bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/20"
                    >
                      Dups ✕
                    </button>
                  )}
                  {showIssuesOnly && (
                    <button
                      onClick={onToggleIssuesOnly}
                      title="Clear issues filter"
                      className="shrink-0 px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap transition-colors bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/20"
                    >
                      Issues ✕
                    </button>
                  )}
                  {showRecentlyTouched && (
                    <button
                      onClick={() => setShowRecentlyTouched(false)}
                      title="Clear recently touched filter"
                      className="shrink-0 px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap transition-colors bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/20"
                    >
                      Recent ✕
                    </button>
                  )}
                  {showPinnedOnly && (
                    <button
                      onClick={() => setShowPinnedOnly(false)}
                      title="Clear pinned filter"
                      className="shrink-0 px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap transition-colors bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/20"
                    >
                      Pinned ✕
                    </button>
                  )}
                </div>
              )}
              {/* Qualifier chip bar — shown when search is focused/empty to surface discoverability */}
              {searchFocused && !searchQuery && (
                <div className="flex items-center gap-1 px-2 pb-1 flex-wrap">
                  {QUERY_QUALIFIERS.filter(q => q.example).map(q => (
                    <button
                      key={q.qualifier}
                      onMouseDown={e => {
                        e.preventDefault();
                        setSearchQuery(q.example || q.qualifier);
                        searchRef.current?.focus();
                      }}
                      className="px-1.5 py-0.5 rounded text-[9px] font-mono whitespace-nowrap transition-colors border border-[var(--color-figma-border)] text-[var(--color-figma-text-tertiary)] bg-[var(--color-figma-bg)] hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/5"
                    >
                      {q.example || q.qualifier}
                    </button>
                  ))}
                </div>
              )}
            </>)}
          </div>
        )}
      </div>
      {/* Token stats bar — collapsible summary of token counts by type and set */}
      {statsTotalTokens > 0 && (
        <div className="shrink-0 border-b border-[var(--color-figma-border)]">
          <button
            onClick={() => { setStatsBarOpen(v => { lsSet('tm_token_stats_bar_open', String(!v)); return !v; }); }}
            className="w-full flex items-center gap-2 px-3 py-1 text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            aria-expanded={statsBarOpen}
            aria-label="Token statistics"
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`shrink-0 transition-transform ${statsBarOpen ? 'rotate-90' : ''}`} aria-hidden="true">
              <path d="M2 1l4 3-4 3V1z" />
            </svg>
            <span className="font-medium text-[var(--color-figma-text)]">{statsTotalTokens}</span>
            <span>token{statsTotalTokens !== 1 ? 's' : ''}</span>
            {statsByType.length > 0 && !statsBarOpen && (
              <div className="flex-1 ml-1 h-1.5 rounded-full overflow-hidden flex gap-px min-w-0 max-w-[120px]">
                {statsByType.map(([type, count]) => (
                  <div
                    key={type}
                    style={{ width: `${(count / statsTotalTokens) * 100}%`, backgroundColor: TOKEN_TYPE_COLORS[type] ?? TOKEN_TYPE_COLOR_FALLBACK }}
                    title={`${type}: ${count}`}
                    className="shrink-0"
                  />
                ))}
              </div>
            )}
            {!statsBarOpen && (
              <span className="ml-auto text-[9px] text-[var(--color-figma-text-tertiary)]">
                {statsByType.slice(0, 3).map(([t, c]) => `${c} ${t}`).join(' · ')}
                {statsByType.length > 3 ? ' …' : ''}
              </span>
            )}
          </button>
          {statsBarOpen && (
            <div className="px-3 pb-2 flex flex-col gap-2">
              {/* Type breakdown */}
              <div>
                <div className="h-2 rounded-full overflow-hidden flex gap-px mb-1.5">
                  {statsByType.map(([type, count]) => (
                    <div
                      key={type}
                      style={{ width: `${(count / statsTotalTokens) * 100}%`, backgroundColor: TOKEN_TYPE_COLORS[type] ?? TOKEN_TYPE_COLOR_FALLBACK }}
                      title={`${type}: ${count}`}
                    />
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                  {statsByType.map(([type, count]) => (
                    <span key={type} className="flex items-center gap-1 text-[10px] text-[var(--color-figma-text-secondary)]">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: TOKEN_TYPE_COLORS[type] ?? TOKEN_TYPE_COLOR_FALLBACK }} aria-hidden="true" />
                      <span className="font-medium text-[var(--color-figma-text)]">{count}</span>
                      {type}
                    </span>
                  ))}
                </div>
              </div>
              {/* Per-set breakdown (only when multiple sets) */}
              {statsSetTotals.length > 1 && (
                <div className="flex flex-col gap-0.5">
                  {statsSetTotals.map(({ name, total }) => (
                    <div key={name} className="flex items-center gap-2 text-[10px]">
                      <span className="text-[var(--color-figma-text-secondary)] truncate flex-1" title={name}>{name}</span>
                      <div className="h-1 rounded-full bg-[var(--color-figma-bg-hover)] overflow-hidden w-16 shrink-0">
                        <div
                          className="h-full rounded-full bg-[var(--color-figma-accent)]"
                          style={{ width: `${Math.round((total / statsTotalTokens) * 100)}%` }}
                        />
                      </div>
                      <span className="text-[var(--color-figma-text)] font-medium w-6 text-right shrink-0">{total}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {/* Promote duplicates callout — shown when the duplicates filter is active */}
      {showDuplicates && promotableDuplicateCount > 0 && (
        <div role="status" aria-live="polite" className="flex items-center gap-2 px-3 py-1.5 bg-[var(--color-figma-bg-secondary)] border-b border-[var(--color-figma-border)] text-[11px]">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--color-figma-accent)]" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
          </svg>
          <span className="flex-1 text-[var(--color-figma-text-secondary)]">
            {promotableDuplicateCount} token{promotableDuplicateCount !== 1 ? 's' : ''} share duplicate values
          </span>
          <button
            onClick={() => handleOpenPromoteModal(duplicateValuePaths)}
            className="shrink-0 px-2 py-0.5 rounded text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-bg-hover)] font-medium transition-colors"
          >
            Promote all to aliases
          </button>
        </div>
      )}
      {/* Operation loading banner */}
      {operationLoading && (
        <div role="status" aria-live="polite" className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[11px] text-[var(--color-figma-text-secondary)]">
          <Spinner size="sm" />
          <span>{operationLoading}</span>
        </div>
      )}
      {/* Delete error banner */}
      {deleteError && (
        <div role="alert" className="flex items-center gap-2 px-3 py-1.5 bg-[var(--color-figma-error)] text-white text-[11px]">
          <span className="flex-1">Delete failed: {deleteError}</span>
          <button onClick={() => setDeleteError(null)} aria-label="Dismiss error" className="opacity-70 hover:opacity-100 font-bold text-[13px] leading-none">&times;</button>
        </div>
      )}
      {/* Scrollable token content with virtual scroll */}
      <div
        ref={virtualListRef}
        className="flex-1 overflow-y-auto"
        onScroll={e => { const top = e.currentTarget.scrollTop; virtualScrollTopRef.current = top; setVirtualScrollTop(top); }}
      >
      <TokenTreeProvider value={treeCtx}>
        {/* Multi-mode column headers */}
        {multiModeData && viewMode === 'tree' && (
          <div className="sticky top-0 z-20 flex items-center border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
            <div className="flex-1 min-w-0 px-2 py-1 text-[10px] font-medium text-[var(--color-figma-text-secondary)]">
              Token
            </div>
            {multiModeData.results.map(r => (
              <div key={r.optionName} className="w-[80px] shrink-0 px-1 py-1 text-[10px] font-medium text-[var(--color-figma-text-secondary)] text-center truncate border-l border-[var(--color-figma-border)]" title={r.optionName}>
                {r.optionName}
              </div>
            ))}
          </div>
        )}
        {/* Pinned tokens section */}
        {pinnedDisplayedNodes.length > 0 && viewMode === 'tree' && (
          <div className="border-b border-[var(--color-figma-border)]">
            <div className="flex items-center gap-1 px-2 py-1 bg-[var(--color-figma-bg-secondary)] border-b border-[var(--color-figma-border)]">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1" className="text-[var(--color-figma-accent)]" aria-hidden="true">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
              <span className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">
                Pinned ({pinnedDisplayedNodes.length})
              </span>
            </div>
            {pinnedDisplayedNodes.map(node => (
              <TokenTreeNode
                key={`pinned-${node.path}`}
                node={node}
                depth={0}
                isSelected={selectedPaths.has(node.path)}
                skipChildren
                showFullPath
                isPinned={true}
                multiModeValues={multiModeData ? getMultiModeValues(node.path) : undefined}
              />
            ))}
          </div>
        )}
        {crossSetResults !== null ? (
          /* Cross-set search results */
          crossSetResults.length === 0 ? (
            <div className="py-8 text-center text-[10px] text-[var(--color-figma-text-tertiary)]">
              <p>No tokens found across all sets</p>
              {searchQuery && (() => {
                const q = searchQuery.trim();
                const qLower = q.toLowerCase();
                const matchingType = availableTypes.find(t => t.toLowerCase() === qLower)
                  || availableTypes.find(t => t.toLowerCase().startsWith(qLower));
                if (matchingType && typeFilter !== matchingType) {
                  return (
                    <button
                      onClick={() => { setSearchQuery(''); setTypeFilter(matchingType); }}
                      className="mt-2 inline-flex items-center gap-1 px-2 py-1 rounded border border-[var(--color-figma-border)] hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)] transition-colors"
                    >
                      Filter by type: {matchingType} <span aria-hidden="true">&rarr;</span>
                    </button>
                  );
                }
                return null;
              })()}
            </div>
          ) : (
            <div>
              {sets
                .filter(sn => crossSetResults.some(r => r.setName === sn))
                .map(sn => {
                  const setResults = crossSetResults.filter(r => r.setName === sn);
                  return (
                    <div key={sn}>
                      <div className="px-2 py-1 text-[10px] font-medium text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-bg-secondary)] border-b border-[var(--color-figma-border)] sticky top-0 z-10">
                        {sn} <span className="font-normal opacity-60">({setResults.length})</span>
                      </div>
                      {setResults.map(r => (
                        <button
                          key={r.path}
                          onClick={() => onNavigateToSet?.(r.setName, r.path)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-[var(--color-figma-bg-hover)] border-b border-[var(--color-figma-border)]/50"
                        >
                          {r.entry.$type === 'color' && typeof r.entry.$value === 'string' && r.entry.$value.startsWith('#') && (
                            <span className="shrink-0 w-3 h-3 rounded-sm border border-[var(--color-figma-border)]" style={{ background: r.entry.$value }} />
                          )}
                          <span className="flex-1 min-w-0 font-mono text-[10px] text-[var(--color-figma-text)] truncate" title={r.path}>{highlightMatch(r.path, searchHighlight?.nameTerms ?? [])}</span>
                          <span className={`shrink-0 text-[8px] px-1 py-0.5 rounded ${TOKEN_TYPE_BADGE_CLASS[r.entry.$type] ?? 'bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]'}`}>{r.entry.$type}</span>
                        </button>
                      ))}
                    </div>
                  );
                })}
              {crossSetTotal > crossSetResults.length && (
                <div className="px-3 py-2 flex items-center justify-between border-t border-[var(--color-figma-border)]">
                  <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                    {crossSetResults.length} of {crossSetTotal} shown
                  </span>
                  <button
                    className="text-[10px] text-[var(--color-figma-accent)] hover:underline"
                    onClick={() => setCrossSetOffset(crossSetResults.length)}
                  >
                    Load {Math.min(CROSS_SET_PAGE_SIZE, crossSetTotal - crossSetResults.length)} more
                  </button>
                </div>
              )}
            </div>
          )
        ) : inspectMode && selectedNodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-[var(--color-figma-text-secondary)]">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M13 12H3"/>
            </svg>
            <p className="mt-2 text-[11px] font-medium">Select a layer to inspect</p>
            <p className="text-[10px] mt-0.5">Tokens bound to the selected layer will appear here</p>
          </div>
        ) : viewMode === 'json' ? (
          /* JSON editor — raw DTCG JSON, works for both empty and non-empty sets */
          <div className="h-full flex flex-col">
            <textarea
              ref={jsonTextareaRef}
              value={jsonText}
              onChange={e => {
                const val = e.target.value;
                setJsonText(val);
                setJsonDirty(true);
                try {
                  JSON.parse(val);
                  setJsonError(null);
                  setJsonBrokenRefs(validateJsonRefs(val, allTokensFlat));
                } catch (err) {
                  setJsonError(getErrorMessage(err, 'Invalid JSON'));
                  setJsonBrokenRefs([]);
                }
              }}
              onKeyDown={async e => {
                if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                  e.preventDefault();
                  if (jsonError || jsonSaving || !connected || !jsonText.trim()) return;
                  setJsonSaving(true);
                  try {
                    const parsed = JSON.parse(jsonText);
                    await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(parsed),
                    });
                    setJsonDirty(false);
                    onRefresh();
                  } catch (err) {
                    setJsonError(err instanceof ApiError ? err.message : 'Invalid JSON — cannot save');
                  } finally {
                    setJsonSaving(false);
                  }
                }
              }}
              placeholder={'{\n  "color": {\n    "primary": {\n      "$value": "#3b82f6",\n      "$type": "color"\n    }\n  }\n}'}
              spellCheck={false}
              className="flex-1 p-3 font-mono text-[10px] bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] outline-none resize-none leading-relaxed placeholder:text-[var(--color-figma-text-tertiary)]"
              style={{ minHeight: 0 }}
            />
            <div className="shrink-0 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 flex flex-col gap-1">
              {jsonError && (
                <p className="text-[10px] text-[var(--color-figma-error)] font-mono leading-tight">{jsonError}</p>
              )}
              {jsonBrokenRefs.length > 0 && !jsonError && (
                <div className="text-[10px] text-[var(--color-figma-warning)] flex flex-wrap gap-1 items-center">
                  <span className="font-medium shrink-0">Broken refs:</span>
                  {jsonBrokenRefs.map(r => (
                    <span key={r} className="font-mono bg-[var(--color-figma-warning)]/10 rounded px-1">{'{' + r + '}'}</span>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">
                  {tokens.length === 0 ? 'Paste DTCG JSON to import tokens' : jsonDirty ? 'Unsaved changes' : 'Up to date'}
                </span>
                <div className="flex gap-1">
                  {jsonDirty && tokens.length > 0 && (
                    <button
                      onClick={() => {
                        setJsonDirty(false);
                        apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/raw`)
                          .then(data => {
                            const text = JSON.stringify(data, null, 2);
                            setJsonText(text);
                            setJsonError(null);
                            setJsonBrokenRefs(validateJsonRefs(text, allTokensFlat));
                          })
                          .catch(err => console.warn('[TokenList] reload raw JSON failed:', err));
                      }}
                      className="px-2 py-0.5 rounded text-[10px] border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                    >
                      Revert
                    </button>
                  )}
                  <button
                    onClick={async () => {
                      if (jsonError || !jsonText.trim()) return;
                      setJsonSaving(true);
                      try {
                        const parsed = JSON.parse(jsonText);
                        await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}`, {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(parsed),
                        });
                        setJsonDirty(false);
                        onRefresh();
                      } catch (err) {
                        setJsonError(err instanceof ApiError ? err.message : 'Invalid JSON — cannot save');
                      } finally {
                        setJsonSaving(false);
                      }
                    }}
                    disabled={!!jsonError || jsonSaving || !connected || !jsonText.trim()}
                    className="px-2 py-0.5 rounded text-[10px] transition-colors bg-[var(--color-figma-accent)] text-white disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
                  >
                    {jsonSaving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : tokens.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 px-5 gap-4 text-center">
            {/* Icon + heading */}
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-[var(--color-figma-bg-secondary)] flex items-center justify-center text-[var(--color-figma-text-secondary)]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
                </svg>
              </div>
              <div>
                <p className="text-[12px] font-medium text-[var(--color-figma-text)]">This set is empty</p>
                <p className="text-[10px] text-[var(--color-figma-text-secondary)] mt-0.5">Get started by adding tokens</p>
              </div>
            </div>

            {/* Quick-start actions */}
            <div className="flex flex-col gap-1.5 w-full max-w-[240px]">
              <button
                onClick={() => setShowScaffold(true)}
                disabled={!connected}
                className="flex flex-col items-start gap-0.5 px-3 py-2 rounded border border-[var(--color-figma-border)] text-left text-[var(--color-figma-text)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                <div className="flex items-center gap-2">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="2.5" cy="6" r="1.5" />
                    <path d="M4 6h4" />
                    <circle cx="9.5" cy="6" r="1.5" />
                    <circle cx="6" cy="2.5" r="1.5" />
                  </svg>
                  <span className="text-[11px] font-medium">Use a preset</span>
                </div>
                <p className="text-[10px] text-[var(--color-figma-text-secondary)] leading-snug pl-[20px]">
                  Color ramp, spacing scale, typography, and more
                </p>
              </button>

              <button
                onClick={() => onCreateNew ? onCreateNew() : setShowCreateForm(true)}
                disabled={!connected}
                className="flex items-center gap-2 px-3 py-2 rounded border border-[var(--color-figma-border)] text-left text-[var(--color-figma-text)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M6 1v10M1 6h10" />
                </svg>
                <span className="text-[11px] font-medium">Create a token manually</span>
              </button>

              <button
                onClick={() => setNewGroupDialogParent('')}
                disabled={!connected}
                className="flex items-center gap-2 px-3 py-2 rounded border border-[var(--color-figma-border)] text-left text-[var(--color-figma-text)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1.5 3.5h3L6 2h4.5v8h-9z" />
                </svg>
                <span className="text-[11px] font-medium">Create a group</span>
              </button>
            </div>
          </div>
        ) : viewMode === 'table' ? (
          <TokenTableView
            leafNodes={displayedLeafNodes}
            allTokensFlat={allTokensFlat}
            onEdit={onEdit}
            onInlineSave={handleInlineSave}
            onDescriptionSave={handleDescriptionSave}
            connected={connected}
            highlightedToken={highlightedToken ?? null}
            filtersActive={filtersActive}
            onClearFilters={clearFilters}
            selectMode={selectMode}
            selectedPaths={selectedPaths}
            onToggleSelect={handleTokenSelect}
            density={density}
          />
        ) : displayedTokens.length === 0 && filtersActive ? (
          <div className="flex flex-col items-center justify-center py-12 text-[var(--color-figma-text-secondary)]">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
              <path d="M8 11h6M11 8v6" />
            </svg>
            <p className="mt-2 text-[11px] font-medium">No tokens match your filters</p>

            {/* Smart suggestions based on query shape */}
            {searchQuery && (() => {
              const q = searchQuery.trim();
              const qLower = q.toLowerCase();
              const suggestions: { label: string; icon: string; action: () => void }[] = [];

              // Path-like query (contains dots) → offer to create token at that path
              const looksLikePath = q.includes('.') && /^[a-zA-Z0-9._-]+$/.test(q);
              if (looksLikePath && connected) {
                suggestions.push({
                  label: `Create token at "${formatDisplayPath(q, q.split('.').pop() || q)}"`,
                  icon: 'create',
                  action: () => {
                    if (onCreateNew) {
                      onCreateNew(q);
                    } else {
                      const lastDot = q.lastIndexOf('.');
                      if (lastDot >= 0) {
                        setNewTokenGroup(q.slice(0, lastDot));
                        setNewTokenName(q.slice(lastDot + 1));
                      } else {
                        setNewTokenGroup('');
                        setNewTokenName(q);
                      }
                      setShowCreateForm(true);
                    }
                  },
                });
              }

              // Non-path plain name → still offer create
              if (!looksLikePath && connected && /^[a-zA-Z0-9_-]+$/.test(q)) {
                suggestions.push({
                  label: `Create token "${q}"`,
                  icon: 'create',
                  action: () => {
                    if (onCreateNew) {
                      onCreateNew(q);
                    } else {
                      setNewTokenGroup('');
                      setNewTokenName(q);
                      setShowCreateForm(true);
                    }
                  },
                });
              }

              // Type-like query → offer to filter by matching type
              const matchingType = availableTypes.find(t => t.toLowerCase() === qLower)
                || availableTypes.find(t => t.toLowerCase().startsWith(qLower));
              if (matchingType && typeFilter !== matchingType) {
                suggestions.push({
                  label: `Filter by type: ${matchingType}`,
                  icon: 'filter',
                  action: () => {
                    setSearchQuery('');
                    setTypeFilter(matchingType);
                  },
                });
              }

              // Value-like query (hex color, number) → suggest value: qualifier
              const looksLikeValue = /^#[0-9a-fA-F]{3,8}$/.test(q) || /^\d+(\.\d+)?(px|rem|em|%)?$/.test(q);
              if (looksLikeValue) {
                suggestions.push({
                  label: `Search by value: ${q}`,
                  icon: 'value',
                  action: () => setSearchQuery(`value:${q}`),
                });
              }

              // Qualifier hint → if query partially matches a qualifier keyword
              if (!q.includes(':')) {
                const matchingQualifiers = QUERY_QUALIFIERS.filter(qf =>
                  qf.qualifier.toLowerCase().startsWith(qLower) && qf.qualifier.toLowerCase() !== qLower
                );
                for (const mq of matchingQualifiers.slice(0, 2)) {
                  suggestions.push({
                    label: `Try qualifier: ${mq.qualifier} — ${mq.desc}`,
                    icon: 'hint',
                    action: () => setSearchQuery(mq.example || mq.qualifier),
                  });
                }
              }

              if (suggestions.length === 0) return null;

              return (
                <div className="mt-3 flex flex-col gap-1 w-full max-w-[240px]">
                  <p className="text-[9px] uppercase tracking-wider text-[var(--color-figma-text-tertiary)] mb-0.5">Suggestions</p>
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={s.action}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[10px] text-left bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)] transition-colors"
                    >
                      {s.icon === 'create' && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                      )}
                      {s.icon === 'filter' && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" /></svg>
                      )}
                      {s.icon === 'value' && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
                      )}
                      {s.icon === 'hint' && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 6L4 12l4 6M16 6l4 6-4 6M13 4l-2 16" /></svg>
                      )}
                      <span className="truncate">{s.label}</span>
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="ml-auto shrink-0 opacity-40" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
                    </button>
                  ))}
                </div>
              );
            })()}

            <button
              onClick={clearFilters}
              className="mt-3 px-3 py-1 rounded text-[10px] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/20 transition-colors"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="py-1">
            {zoomBreadcrumb ? (
              <div className="sticky top-0 z-10 flex items-center gap-0.5 px-2 py-1.5 bg-[var(--color-figma-bg-secondary)] border-b border-[var(--color-figma-border)] text-[10px]">
                <button
                  onClick={handleZoomOut}
                  className="flex items-center gap-0.5 text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] mr-1"
                  title="Exit focus mode (Esc)"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M19 12H5M12 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={handleZoomOut}
                  className="text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:underline"
                >
                  Root
                </button>
                {zoomBreadcrumb.map((seg, i) => (
                  <span key={seg.path} className="flex items-center gap-0.5">
                    <span className="opacity-40 mx-0.5">›</span>
                    {i < zoomBreadcrumb.length - 1 ? (
                      <button
                        className="text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:underline truncate max-w-[120px]"
                        title={seg.path}
                        onClick={() => handleZoomToAncestor(seg.path)}
                      >
                        {seg.name}
                      </button>
                    ) : (
                      <span className="font-medium text-[var(--color-figma-text)] truncate max-w-[120px]" title={seg.path}>
                        {seg.name}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            ) : breadcrumbSegments.length > 0 ? (
              <div className="sticky top-0 z-10 flex items-center gap-0.5 px-2 py-1 bg-[var(--color-figma-bg-secondary)] border-b border-[var(--color-figma-border)] text-[10px] text-[var(--color-figma-text-secondary)] group/breadcrumb">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-40 mr-0.5">
                  <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
                </svg>
                {breadcrumbSegments.map((seg, i) => (
                  <span key={seg.path} className="flex items-center gap-0.5">
                    {i > 0 && <span className="opacity-40 mx-0.5">›</span>}
                    {i < breadcrumbSegments.length - 1 ? (
                      <button
                        className="hover:text-[var(--color-figma-text)] hover:underline truncate max-w-[120px]"
                        title={`Jump to ${seg.path}`}
                        onClick={() => handleJumpToGroup(seg.path)}
                      >
                        {seg.name}
                      </button>
                    ) : (
                      <span className="font-medium text-[var(--color-figma-text)] truncate max-w-[120px]" title={seg.path}>
                        {seg.name}
                      </span>
                    )}
                  </span>
                ))}
                <button
                  className="ml-auto flex items-center gap-0.5 opacity-0 group-hover/breadcrumb:opacity-100 transition-opacity text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] shrink-0"
                  title="Collapse all groups below and jump to this group"
                  onClick={() => handleCollapseBelow(breadcrumbSegments[breadcrumbSegments.length - 1].path)}
                >
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M18 15l-6-6-6 6" />
                  </svg>
                  <span>Collapse</span>
                </button>
              </div>
            ) : null}
            <div style={{ height: virtualTopPad }} aria-hidden="true" />
            {flatItems.slice(virtualStartIdx, virtualEndIdx).map(({ node, depth }) => {
              const moveEnabled = sortOrder === 'default' && connected;
              const parentPath = moveEnabled ? (nodeParentPath(node.path, node.name) ?? '') : '';
              const siblings = moveEnabled ? (siblingOrderMap.get(parentPath) ?? []) : [];
              const sibIdx = moveEnabled ? siblings.indexOf(node.name) : -1;
              return (
              <TokenTreeNode
                key={node.path}
                node={node}
                depth={depth}
                skipChildren
                isSelected={node.isGroup ? false : selectedPaths.has(node.path)}
                lintViolations={lintViolations.filter(v => v.path === node.path)}
                chainExpanded={expandedChains.has(node.path)}
                showFullPath={showRecentlyTouched || showPinnedOnly}
                isPinned={pinnedTokens.isPinned(node.path)}
                onMoveUp={moveEnabled && sibIdx > 0 ? () => handleMoveTokenInGroup(node.path, node.name, 'up') : undefined}
                onMoveDown={moveEnabled && sibIdx >= 0 && sibIdx < siblings.length - 1 ? () => handleMoveTokenInGroup(node.path, node.name, 'down') : undefined}
                multiModeValues={multiModeData ? getMultiModeValues(node.path) : undefined}
              />
              );
            })}
            <div style={{ height: virtualBottomPad }} aria-hidden="true" />
          </div>
        )}
      </TokenTreeProvider>
      </div>

      {/* Create form */}
      {showCreateForm && (
        <div ref={createFormRef} className="p-3 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
          <div className="flex flex-col gap-2">
            {/* Active set indicator */}
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)]">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-[var(--color-figma-text-secondary)]">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              <span className="text-[10px] text-[var(--color-figma-text-secondary)]">Creating in:</span>
              <span className="text-[10px] font-medium text-[var(--color-figma-text)] truncate">{setName}</span>
            </div>
            {/* Group picker */}
            <div className="relative">
              <label className="block text-[10px] text-[var(--color-figma-text-tertiary)] mb-0.5">Group</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Root (none)"
                  value={newTokenGroup}
                  onChange={e => { setNewTokenGroup(e.target.value); setGroupDropdownOpen(true); setCreateError(''); }}
                  onFocus={() => setGroupDropdownOpen(true)}
                  onBlur={() => { setTimeout(() => setGroupDropdownOpen(false), 150); }}
                  className="w-full px-2 py-1.5 pr-6 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)]"
                  onKeyDown={e => {
                    if (e.key === 'Escape') { setGroupDropdownOpen(false); (e.target as HTMLInputElement).blur(); return; }
                    if (groupDropdownOpen && filteredGroups.length > 0) {
                      if (e.key === 'ArrowDown') { e.preventDefault(); setGroupActiveIdx(i => Math.min(i + 1, filteredGroups.length - 1)); return; }
                      if (e.key === 'ArrowUp') { e.preventDefault(); setGroupActiveIdx(i => Math.max(i - 1, -1)); return; }
                      if ((e.key === 'Tab' || e.key === 'Enter') && groupActiveIdx >= 0 && filteredGroups[groupActiveIdx]) {
                        e.preventDefault();
                        setNewTokenGroup(filteredGroups[groupActiveIdx]);
                        setGroupDropdownOpen(false);
                        return;
                      }
                    }
                    if (e.key === 'Enter') { e.shiftKey ? handleCreateAndNew() : handleCreate(); }
                  }}
                />
                <svg className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--color-figma-text-tertiary)]" width="8" height="8" viewBox="0 0 8 8" fill="currentColor" aria-hidden="true"><path d="M1 2.5l3 3 3-3" /></svg>
              </div>
              {groupDropdownOpen && filteredGroups.length > 0 && (
                <div className="absolute z-50 left-0 right-0 mt-0.5 max-h-[140px] overflow-y-auto rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-lg">
                  <button
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => { setNewTokenGroup(''); setGroupDropdownOpen(false); }}
                    className={`w-full text-left px-2 py-1 text-[11px] hover:bg-[var(--color-figma-bg-hover)] transition-colors ${!newTokenGroup.trim() ? 'text-[var(--color-figma-accent)] font-medium' : 'text-[var(--color-figma-text-tertiary)] italic'}`}
                  >
                    (root)
                  </button>
                  {filteredGroups.map((gp, idx) => {
                    const isActive = idx === groupActiveIdx;
                    const isExact = gp === newTokenGroup.trim();
                    const terms = newTokenGroup.trim() ? newTokenGroup.trim().split(/[\s.]+/).filter(Boolean) : [];
                    return (
                      <button
                        key={gp}
                        type="button"
                        data-group-idx={idx}
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => { setNewTokenGroup(gp); setGroupDropdownOpen(false); }}
                        onMouseEnter={() => setGroupActiveIdx(idx)}
                        className={`w-full flex items-center gap-1.5 text-left px-2 py-1 text-[11px] transition-colors ${isActive ? 'bg-[var(--color-figma-bg-hover)]' : ''} ${isExact ? 'text-[var(--color-figma-accent)] font-medium' : 'text-[var(--color-figma-text)]'}`}
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-[var(--color-figma-text-secondary)]">
                          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                        </svg>
                        <span className="flex-1 truncate">{terms.length > 0 ? highlightMatch(gp, terms) : gp}</span>
                      </button>
                    );
                  })}
                  {newTokenGroup.trim() && !allGroupPaths.includes(newTokenGroup.trim()) && (
                    <button
                      type="button"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => { setGroupDropdownOpen(false); }}
                      className="w-full text-left px-2 py-1 text-[11px] text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                    >
                      + Create &ldquo;{newTokenGroup.trim()}&rdquo;
                    </button>
                  )}
                </div>
              )}
            </div>
            {/* Token name */}
            <div>
              <div className="flex items-baseline gap-1 mb-0.5">
                <label className="text-[10px] text-[var(--color-figma-text-tertiary)]">Name</label>
                {(() => {
                  const siblings = siblingOrderMap.get(newTokenGroup.trim());
                  if (!siblings || siblings.length === 0) return null;
                  const display = siblings.length <= 5
                    ? siblings.join(', ')
                    : siblings.slice(0, 4).join(', ') + `, +${siblings.length - 4} more`;
                  return (
                    <span className="text-[9px] text-[var(--color-figma-text-tertiary)] truncate" title={siblings.join(', ')}>
                      siblings: {display}
                    </span>
                  );
                })()}
              </div>
              <input
                type="text"
                placeholder={(() => {
                  // Dynamic placeholder based on sibling patterns
                  if (nameSuggestions.length > 0) {
                    const first = nameSuggestions[0];
                    const leafName = first.value.includes('.') ? first.value.slice(first.value.lastIndexOf('.') + 1) : first.value;
                    return `e.g. ${leafName}`;
                  }
                  return 'Token name (e.g. 500, base, primary)';
                })()}
                ref={nameInputRef}
                value={newTokenName}
                onChange={e => { setNewTokenName(e.target.value); setCreateError(''); }}
                className={`w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)] ${createError || pathValidation.error ? 'border-[var(--color-figma-error)]' : pathValidation.warning ? 'border-amber-400' : 'border-[var(--color-figma-border)]'}`}
                onKeyDown={e => { if (e.key === 'Enter') { e.shiftKey ? handleCreateAndNew() : handleCreate(); } }}
                autoFocus
              />
              {newTokenPath && (
                <div className="mt-0.5 text-[10px] text-[var(--color-figma-text-tertiary)]">
                  Path: <span className="text-[var(--color-figma-text-secondary)]">{newTokenPath}</span>
                </div>
              )}
              {pathValidation.error && (
                <p className="mt-0.5 text-[10px] text-[var(--color-figma-error)]" role="alert">{pathValidation.error}</p>
              )}
              {pathValidation.warning && (
                <p className="mt-0.5 text-[10px] text-amber-600 dark:text-amber-400">&#9888; {pathValidation.warning}</p>
              )}
              {pathValidation.info && (
                <p className="mt-0.5 text-[10px] text-[var(--color-figma-text-tertiary)]">&#8505; {pathValidation.info}</p>
              )}
            </div>
            {createError && <p className="text-[10px] text-[var(--color-figma-error)]" role="alert">{createError}</p>}
            {nameSuggestions.length > 0 && (
              <div className="flex flex-wrap gap-1">
                <span className="text-[10px] text-[var(--color-figma-text-tertiary)] self-center mr-0.5">Suggest:</span>
                {nameSuggestions.map(s => {
                  // Suggestions return full paths; extract just the leaf name
                  const leafName = s.value.includes('.') ? s.value.slice(s.value.lastIndexOf('.') + 1) : s.value;
                  return (
                    <button
                      key={s.value}
                      type="button"
                      title={s.source}
                      onClick={() => { setNewTokenName(leafName); setCreateError(''); }}
                      className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)] transition-colors cursor-pointer"
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex items-center gap-1.5">
              {newTokenValue.trim() && (
                <ValuePreview type={newTokenType} value={parseInlineValue(newTokenType, newTokenValue.trim())} />
              )}
              <input
                type="text"
                placeholder={valuePlaceholderForType(newTokenType)}
                value={newTokenValue}
                onChange={e => {
                  const val = e.target.value;
                  setNewTokenValue(val);
                  const inferred = inferTypeFromValue(val);
                  if (inferred) {
                    setNewTokenType(inferred);
                    setTypeAutoInferred(true);
                  } else if (typeAutoInferred && !val.trim()) {
                    setTypeAutoInferred(false);
                  }
                }}
                className="flex-1 min-w-0 px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)]"
                onKeyDown={e => { if (e.key === 'Enter') { e.shiftKey ? handleCreateAndNew() : handleCreate(); } }}
              />
            </div>
            {!newTokenValue.trim() && valueFormatHint(newTokenType) && (
              <p className="text-[9px] leading-snug text-[var(--color-figma-text-tertiary)] -mt-0.5 px-0.5">{valueFormatHint(newTokenType)}</p>
            )}
            {aliasSuggestion && (
              <button
                type="button"
                onClick={() => setNewTokenValue(`{${aliasSuggestion.path}}`)}
                className="w-full flex items-center gap-1.5 px-2 py-1 rounded border border-dashed border-[var(--color-figma-accent)] bg-[var(--color-figma-accent-bg,transparent)] text-[10px] text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)] hover:text-white transition-colors cursor-pointer text-left"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                <span>Use reference instead &rarr; <strong>{`{${formatDisplayPath(aliasSuggestion.path, aliasSuggestion.name)}}`}</strong></span>
              </button>
            )}
            <input
              type="text"
              placeholder="Description (optional)"
              value={newTokenDescription}
              onChange={e => setNewTokenDescription(e.target.value)}
              className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)]"
              onKeyDown={e => { if (e.key === 'Enter') { e.shiftKey ? handleCreateAndNew() : handleCreate(); } }}
            />
            <select
              value={newTokenType}
              onChange={e => { setNewTokenType(e.target.value); setTypeAutoInferred(false); }}
              className={`w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] text-[11px] outline-none ${typeAutoInferred ? 'border-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)]'}`}
            >
              <option value="color">Color</option>
              <option value="dimension">Dimension</option>
              <option value="typography">Typography</option>
              <option value="shadow">Shadow</option>
              <option value="border">Border</option>
              <option value="gradient">Gradient</option>
              <option value="duration">Duration</option>
              <option value="fontFamily">Font Family</option>
              <option value="fontWeight">Font Weight</option>
              <option value="strokeStyle">Stroke Style</option>
              <option value="number">Number</option>
              <option value="string">String</option>
              <option value="boolean">Boolean</option>
            </select>
            <div className="flex gap-1.5">
              <button
                onClick={handleCreate}
                disabled={!newTokenName.trim() || !!pathValidation.error}
                title={!newTokenName.trim() ? 'Enter a token name first' : pathValidation.error ? pathValidation.error : 'Create token (Enter)'}
                className="flex-1 px-2 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
              >
                Create
              </button>
              <button
                onClick={handleCreateAndNew}
                disabled={!newTokenName.trim() || !!pathValidation.error}
                title={!newTokenName.trim() ? 'Enter a token name first' : pathValidation.error ? pathValidation.error : 'Create and start a new token in the same group (Shift+Enter)'}
                className="flex-1 px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] text-[11px] font-medium hover:bg-[var(--color-figma-accent)] hover:text-white disabled:opacity-40 whitespace-nowrap"
              >
                & New
              </button>
              {onCreateNew && (
                <button
                  onClick={() => {
                    const path = newTokenPath.trim();
                    onCreateNew(path || undefined, newTokenType, newTokenValue.trim() || undefined);
                    resetCreateForm();
                  }}
                  title="Open full editor with more fields (references, scopes, extensions, modes)"
                  className="px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] text-[11px] hover:bg-[var(--color-figma-bg-hover)]"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 3h6v6M14 10l6.1-6.1M9 21H3v-6M10 14l-6.1 6.1"/></svg>
                </button>
              )}
              <button
                onClick={resetCreateForm}
                className="px-3 py-1.5 rounded bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] text-[11px] hover:bg-[var(--color-figma-bg-hover)]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table create mode */}
      {showTableCreate && (
        <div className="p-3 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
          <div className="flex flex-col gap-2">
            {/* Draft recovery banner */}
            {tableCreateHasDraft && (
              <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-accent)] text-[11px]">
                <span className="flex-1 text-[var(--color-figma-text)]">You have unsaved bulk-create data. Restore it?</span>
                <button
                  type="button"
                  onClick={restoreTableDraft}
                  className="px-2 py-0.5 rounded bg-[var(--color-figma-accent)] text-white text-[10px] font-medium hover:bg-[var(--color-figma-accent-hover)]"
                >
                  Restore
                </button>
                <button
                  type="button"
                  onClick={dismissTableDraft}
                  className="px-2 py-0.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] text-[10px] hover:bg-[var(--color-figma-bg-hover)]"
                >
                  Discard
                </button>
              </div>
            )}
            {/* Active set indicator */}
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)]">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-[var(--color-figma-text-secondary)]">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              <span className="text-[10px] text-[var(--color-figma-text-secondary)]">Bulk create in:</span>
              <span className="text-[10px] font-medium text-[var(--color-figma-text)] truncate">{setName}</span>
            </div>
            {/* Group picker */}
            <div>
              <label className="block text-[10px] text-[var(--color-figma-text-tertiary)] mb-0.5" htmlFor="table-create-group">Group</label>
              <input
                id="table-create-group"
                type="text"
                list="table-create-groups-list"
                placeholder="Root (none)"
                value={tableGroup}
                onChange={e => setTableGroup(e.target.value)}
                aria-label="Token group for bulk create"
                className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)]"
              />
              <datalist id="table-create-groups-list">
                {allGroupPaths.map(g => <option key={g} value={g} />)}
              </datalist>
            </div>
            {/* Smart name suggestions for table create */}
            {tableSuggestions.length > 0 && (
              <div className="flex flex-wrap gap-1">
                <span className="text-[10px] text-[var(--color-figma-text-tertiary)] self-center mr-0.5">Suggest:</span>
                {tableSuggestions.map(s => {
                  const leafName = s.value.includes('.') ? s.value.slice(s.value.lastIndexOf('.') + 1) : s.value;
                  return (
                    <button
                      key={s.value}
                      type="button"
                      title={s.source}
                      onClick={() => {
                        // Fill the next empty row, or add a new row
                        const emptyRow = tableRows.find(r => !r.name.trim());
                        if (emptyRow) {
                          updateTableRow(emptyRow.id, 'name', leafName);
                        } else {
                          addTableRow();
                          // We need to set it after the row is added
                          requestAnimationFrame(() => {
                            const inputs = document.querySelectorAll<HTMLInputElement>('[data-table-name-input]');
                            const last = inputs[inputs.length - 1];
                            if (last) { last.value = leafName; last.dispatchEvent(new Event('input', { bubbles: true })); }
                          });
                        }
                      }}
                      className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)] transition-colors cursor-pointer"
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            )}
            {/* Token rows */}
            <div>
              {/* Column headers */}
              <div className="grid gap-1 mb-1 px-0.5" style={{ gridTemplateColumns: 'minmax(0,1fr) 76px minmax(0,1fr) 18px' }}>
                <span className="text-[9px] font-medium text-[var(--color-figma-text-tertiary)] uppercase tracking-wide">Name</span>
                <span className="text-[9px] font-medium text-[var(--color-figma-text-tertiary)] uppercase tracking-wide">Type</span>
                <span className="text-[9px] font-medium text-[var(--color-figma-text-tertiary)] uppercase tracking-wide">Value</span>
                <span />
              </div>
              {tableRows.map((row, idx) => (
                <div key={row.id} className="mb-1">
                  <div className="grid gap-1 items-center" style={{ gridTemplateColumns: 'minmax(0,1fr) 76px minmax(0,1fr) 18px' }}>
                    <input
                      type="text"
                      placeholder="name"
                      value={row.name}
                      onChange={e => updateTableRow(row.id, 'name', e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleCreateAll();
                      }}
                      data-table-name-input="true"
                      aria-label={`Token ${idx + 1} name`}
                      // eslint-disable-next-line jsx-a11y/no-autofocus
                      autoFocus={idx === 0}
                      className={`w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)] ${rowErrors[row.id] ? 'border-[var(--color-figma-error)]' : 'border-[var(--color-figma-border)]'}`}
                    />
                    <select
                      value={row.type}
                      onChange={e => updateTableRow(row.id, 'type', e.target.value)}
                      aria-label={`Token ${idx + 1} type`}
                      className="w-full px-1 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)]"
                    >
                      <option value="color">Color</option>
                      <option value="dimension">Dimension</option>
                      <option value="number">Number</option>
                      <option value="string">String</option>
                      <option value="boolean">Boolean</option>
                      <option value="duration">Duration</option>
                      <option value="fontFamily">Font Family</option>
                      <option value="fontWeight">Font Weight</option>
                      <option value="typography">Typography</option>
                      <option value="shadow">Shadow</option>
                      <option value="border">Border</option>
                      <option value="gradient">Gradient</option>
                      <option value="strokeStyle">Stroke Style</option>
                    </select>
                    <input
                      type="text"
                      placeholder="value"
                      value={row.value}
                      onChange={e => {
                        const val = e.target.value;
                        updateTableRow(row.id, 'value', val);
                        const inferred = inferTypeFromValue(val);
                        if (inferred) updateTableRow(row.id, 'type', inferred);
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Tab' && !e.shiftKey && idx === tableRows.length - 1) {
                          e.preventDefault();
                          addTableRow();
                          requestAnimationFrame(() => {
                            const inputs = document.querySelectorAll<HTMLInputElement>('[data-table-name-input]');
                            inputs[inputs.length - 1]?.focus();
                          });
                        }
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleCreateAll();
                      }}
                      aria-label={`Token ${idx + 1} value`}
                      className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)]"
                    />
                    <button
                      type="button"
                      onClick={() => removeTableRow(row.id)}
                      tabIndex={-1}
                      aria-label={`Remove row ${idx + 1}`}
                      className="w-[18px] h-[18px] flex items-center justify-center rounded text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-error)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                    >
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" aria-hidden="true"><path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/></svg>
                    </button>
                  </div>
                  {rowErrors[row.id] && (
                    <p className="mt-0.5 text-[10px] text-[var(--color-figma-error)] pl-0.5" role="alert">{rowErrors[row.id]}</p>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => addTableRow()}
                className="mt-0.5 w-full px-2 py-1 rounded border border-dashed border-[var(--color-figma-border)] text-[var(--color-figma-text-tertiary)] text-[10px] hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)] transition-colors"
              >
                + Add Row
              </button>
            </div>
            {createAllError && (
              <p className="text-[10px] text-[var(--color-figma-error)]" role="alert">{createAllError}</p>
            )}
            <div className="flex gap-1.5">
              <button
                onClick={handleCreateAll}
                disabled={tableCreateBusy || !connected || tableRows.every(r => !r.name.trim())}
                title={tableRows.every(r => !r.name.trim()) ? 'Enter at least one token name' : 'Create all tokens (Ctrl+Enter)'}
                className="flex-1 px-2 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
              >
                {tableCreateBusy
                  ? 'Creating…'
                  : `Create ${tableRows.filter(r => r.name.trim()).length > 0 ? tableRows.filter(r => r.name.trim()).length + ' ' : ''}Token${tableRows.filter(r => r.name.trim()).length !== 1 ? 's' : ''}`}
              </button>
              <button
                onClick={closeTableCreate}
                className="px-3 py-1.5 rounded bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] text-[11px] hover:bg-[var(--color-figma-bg-hover)]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom actions — streamlined primary actions only */}
      {!showCreateForm && !showTableCreate && (
        <div className="px-2 py-1.5 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] flex items-center gap-1.5">
          <button
            onClick={() => { onCreateNew ? onCreateNew() : setShowCreateForm(true); }}
            disabled={!connected}
            title="Create a new token (N)"
            className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
          >
            + New Token
          </button>
          <button
            onClick={() => { resetCreateForm(); openTableCreate(); }}
            disabled={!connected}
            title="Create multiple tokens at once in a spreadsheet-like table (Tab between cells)"
            className="px-2.5 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] text-[10px] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40"
          >
            Bulk
          </button>
          <button
            onClick={() => { setNewGroupDialogParent(''); setNewGroupName(''); setNewGroupError(''); }}
            disabled={!connected}
            title="Create an empty group to organize tokens"
            className="px-2.5 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] text-[10px] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40"
          >
            New Group
          </button>
          {applyResult && (
            <span role="status" aria-live="polite" className="text-[10px] text-[var(--color-figma-accent)] ml-auto shrink-0">
              Applied {applyResult.count} {applyResult.type === 'variables' ? 'variables' : 'styles'}
            </span>
          )}
        </div>
      )}

      <TokenListModals
        showScaffold={showScaffold}
        onSetShowScaffold={setShowScaffold}
        serverUrl={serverUrl}
        setName={setName}
        sets={sets}
        onRefresh={onRefresh}
        allTokensFlat={allTokensFlat}
        connected={connected}
        deleteConfirm={deleteConfirm}
        modalProps={modalProps}
        executeDelete={executeDelete}
        onSetDeleteConfirm={setDeleteConfirm}
        newGroupDialogParent={newGroupDialogParent}
        newGroupName={newGroupName}
        newGroupError={newGroupError}
        onSetNewGroupName={setNewGroupName}
        onSetNewGroupError={setNewGroupError}
        handleCreateGroup={handleCreateGroup}
        onSetNewGroupDialogParent={setNewGroupDialogParent}
        renameTokenConfirm={renameTokenConfirm}
        executeTokenRename={executeTokenRename}
        onSetRenameTokenConfirm={setRenameTokenConfirm}
        renameGroupConfirm={renameGroupConfirm}
        executeGroupRename={executeGroupRename}
        onSetRenameGroupConfirm={setRenameGroupConfirm}
        varDiffPending={varDiffPending}
        doApplyVariables={doApplyVariables}
        onSetVarDiffPending={setVarDiffPending}
        extractToken={extractToken}
        extractMode={extractMode}
        onSetExtractMode={setExtractMode}
        newPrimitivePath={newPrimitivePath}
        onSetNewPrimitivePath={setNewPrimitivePath}
        newPrimitiveSet={newPrimitiveSet}
        onSetNewPrimitiveSet={setNewPrimitiveSet}
        existingAlias={existingAlias}
        onSetExistingAlias={setExistingAlias}
        existingAliasSearch={existingAliasSearch}
        onSetExistingAliasSearch={setExistingAliasSearch}
        extractError={extractError}
        onSetExtractError={setExtractError}
        handleConfirmExtractToAlias={handleConfirmExtractToAlias}
        onSetExtractToken={setExtractToken}
        showFindReplace={showFindReplace}
        frFind={frFind}
        frReplace={frReplace}
        frIsRegex={frIsRegex}
        frScope={frScope}
        frTarget={frTarget}
        frError={frError}
        frBusy={frBusy}
        frRegexError={frRegexError}
        frPreview={frPreview}
        frValuePreview={frValuePreview}
        frConflictCount={frConflictCount}
        frRenameCount={frRenameCount}
        frValueCount={frValueCount}
        frAliasImpact={frAliasImpact}
        onSetFrFind={setFrFind}
        onSetFrReplace={setFrReplace}
        onSetFrIsRegex={setFrIsRegex}
        frTypeFilter={frTypeFilter}
        frAvailableTypes={frAvailableTypes}
        onSetFrScope={setFrScope}
        onSetFrTarget={setFrTarget}
        onSetFrTypeFilter={setFrTypeFilter}
        onSetFrError={setFrError}
        onSetShowFindReplace={setShowFindReplace}
        handleFindReplace={handleFindReplace}
        cancelFindReplace={cancelFindReplace}
        promoteRows={promoteRows}
        promoteBusy={promoteBusy}
        onSetPromoteRows={setPromoteRows}
        handleConfirmPromote={handleConfirmPromote}
        movingToken={movingToken}
        movingGroup={movingGroup}
        moveTargetSet={movingGroup ? moveGroupTargetSet : moveTokenTargetSet}
        onSetMoveTargetSet={movingGroup ? setMoveGroupTargetSet : setMoveTokenTargetSet}
        onSetMovingToken={setMovingToken}
        onSetMovingGroup={setMovingGroup}
        handleConfirmMoveToken={handleConfirmMoveToken}
        handleConfirmMoveGroup={handleConfirmMoveGroup}
        copyingToken={copyingToken}
        copyingGroup={copyingGroup}
        copyTargetSet={copyingGroup ? copyGroupTargetSet : copyTokenTargetSet}
        onSetCopyTargetSet={copyingGroup ? setCopyGroupTargetSet : setCopyTokenTargetSet}
        onSetCopyingToken={setCopyingToken}
        onSetCopyingGroup={setCopyingGroup}
        handleConfirmCopyToken={handleConfirmCopyToken}
        handleConfirmCopyGroup={handleConfirmCopyGroup}
        showMoveToGroup={showMoveToGroup}
        moveToGroupTarget={moveToGroupTarget}
        moveToGroupError={moveToGroupError}
        selectedMoveCount={selectedPaths.size}
        onSetShowMoveToGroup={setShowMoveToGroup}
        onSetMoveToGroupTarget={setMoveToGroupTarget}
        onSetMoveToGroupError={setMoveToGroupError}
        handleBatchMoveToGroup={handleBatchMoveToGroup}
      />
    </div>
  );
}
