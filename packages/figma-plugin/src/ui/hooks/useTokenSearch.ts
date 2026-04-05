import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { TokenNode } from './useTokens';
import type { TokenMapEntry } from '../../shared/types';
import type { TokenGenerator } from './useGenerators';
import type { LintViolation } from './useLint';
import { STORAGE_KEY, STORAGE_KEYS, lsGet, lsSet, lsGetJson, lsSetJson } from '../shared/storage';

export interface FilterPreset {
  id: string;
  name: string;
  query: string;
}
import {
  flattenLeafNodes, filterTokenNodes, filterByDuplicatePaths,
  findGroupByPath, parseStructuredQuery, hasStructuredQualifiers, QUERY_QUALIFIERS,
} from '../components/tokenListUtils';
import { stableStringify } from '../shared/utils';
import { apiFetch } from '../shared/apiFetch';
import { isAbortError } from '../shared/utils';

export interface UseTokenSearchParams {
  setName: string;
  tokens: TokenNode[];
  sets: string[];
  serverUrl: string;
  onOpenCommandPaletteWithQuery?: (q: string) => void;
  virtualScrollTopRef: React.MutableRefObject<number>;
  flatItemsRef: React.MutableRefObject<Array<{ node: { path: string } }>>;
  itemOffsetsRef: React.MutableRefObject<number[]>;
  scrollAnchorPathRef: React.MutableRefObject<string | null>;
  isFilterChangeRef: React.MutableRefObject<boolean>;
  expandedPaths: Set<string>;
  pinnedPaths: Set<string>;
  sortedTokens: TokenNode[];
  recentlyTouched: { paths: Set<string>; timestamps: Map<string, number> };
  // Additional filtering state from component
  showIssuesOnly?: boolean;
  showRecentlyTouched?: boolean;
  showPinnedOnly?: boolean;
  inspectMode?: boolean;
  zoomRootPath?: string | null;
  lintPaths?: Set<string>;
  boundTokenPaths?: Set<string>;
  unusedTokenPaths?: Set<string> | undefined;
  derivedTokenPaths?: Map<string, TokenGenerator>;
}

export function useTokenSearch({
  setName,
  tokens,
  sets,
  serverUrl,
  onOpenCommandPaletteWithQuery,
  virtualScrollTopRef,
  flatItemsRef,
  itemOffsetsRef,
  scrollAnchorPathRef,
  isFilterChangeRef,
  expandedPaths,
  pinnedPaths,
  sortedTokens,
  recentlyTouched,
  showIssuesOnly = false,
  showRecentlyTouched = false,
  showPinnedOnly = false,
  inspectMode = false,
  zoomRootPath = null,
  lintPaths = new Set(),
  boundTokenPaths = new Set(),
  unusedTokenPaths,
  derivedTokenPaths,
}: UseTokenSearchParams) {
  const searchRef = useRef<HTMLInputElement>(null);
  const qualifierHintsRef = useRef<HTMLDivElement>(null);
  const qualifierHelpRef = useRef<HTMLDivElement>(null);

  const [searchQuery, setSearchQueryState] = useState(() => {
    try { return sessionStorage.getItem('token-search') || ''; } catch (e) { console.debug('[useTokenSearch] storage read search query:', e); return ''; }
  });
  const [typeFilter, setTypeFilterState] = useState<string>('');
  const [refFilter, setRefFilterState] = useState<'all' | 'aliases' | 'direct'>(() => {
    try { return (sessionStorage.getItem('token-ref-filter') as 'all' | 'aliases' | 'direct') || 'all'; } catch (e) { console.debug('[useTokenSearch] storage read ref filter:', e); return 'all'; }
  });

  useEffect(() => {
    setTypeFilterState(lsGet(STORAGE_KEY.tokenTypeFilter(setName), ''));
  }, [setName]);

  const saveScrollAnchor = useCallback(() => {
    const top = virtualScrollTopRef.current;
    const items = flatItemsRef.current;
    const offsets = itemOffsetsRef.current;
    let firstIdx = 0;
    while (firstIdx < items.length && offsets[firstIdx + 1] <= top) firstIdx++;
    scrollAnchorPathRef.current = items[firstIdx]?.node.path ?? null;
    isFilterChangeRef.current = true;
  }, [virtualScrollTopRef, flatItemsRef, itemOffsetsRef, scrollAnchorPathRef, isFilterChangeRef]);

  const setSearchQuery = useCallback((v: string) => {
    // Delegate to command palette when the query contains structured qualifiers
    if (v && hasStructuredQualifiers(v) && onOpenCommandPaletteWithQuery) {
      onOpenCommandPaletteWithQuery(v);
      // Clear in-tree search so the tree shows unfiltered
      setSearchQueryState('');
      try { sessionStorage.removeItem('token-search'); } catch (e) { console.debug('[useTokenSearch] storage clear search query:', e); }
      return;
    }
    saveScrollAnchor();
    setSearchQueryState(v);
    try { sessionStorage.setItem('token-search', v); } catch (e) { console.debug('[useTokenSearch] storage write search query:', e); }
  }, [saveScrollAnchor, onOpenCommandPaletteWithQuery]);

  const setTypeFilter = useCallback((v: string) => {
    saveScrollAnchor();
    setTypeFilterState(v);
    lsSet(STORAGE_KEY.tokenTypeFilter(setName), v);
  }, [saveScrollAnchor, setName]);

  const setRefFilter = useCallback((v: 'all' | 'aliases' | 'direct') => {
    saveScrollAnchor();
    setRefFilterState(v);
    try { sessionStorage.setItem('token-ref-filter', v); } catch (e) { console.debug('[useTokenSearch] storage write ref filter:', e); }
  }, [saveScrollAnchor]);

  const [showDuplicates, setShowDuplicatesState] = useState(() => {
    try { return sessionStorage.getItem('token-duplicates') === '1'; } catch (e) { console.debug('[useTokenSearch] storage read duplicates flag:', e); return false; }
  });
  const setShowDuplicates = useCallback((v: boolean) => {
    setShowDuplicatesState(v);
    try { sessionStorage.setItem('token-duplicates', v ? '1' : '0'); } catch (e) { console.debug('[useTokenSearch] storage write duplicates flag:', e); }
  }, []);

  const [crossSetSearch, setCrossSetSearch] = useState(false);

  // Filter presets — persisted globally in localStorage
  const [filterPresets, setFilterPresets] = useState<FilterPreset[]>(() =>
    lsGetJson<FilterPreset[]>(STORAGE_KEYS.FILTER_PRESETS, [])
  );
  const [showPresetDropdown, setShowPresetDropdown] = useState(false);
  const [presetNameInput, setPresetNameInput] = useState('');
  const presetDropdownRef = useRef<HTMLDivElement>(null);

  const saveFilterPreset = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed || !searchQuery.trim()) return;
    const preset: FilterPreset = { id: Date.now().toString(), name: trimmed, query: searchQuery.trim() };
    setFilterPresets(prev => {
      const next = [...prev, preset];
      lsSetJson(STORAGE_KEYS.FILTER_PRESETS, next);
      return next;
    });
    setPresetNameInput('');
  }, [searchQuery]);

  const deleteFilterPreset = useCallback((id: string) => {
    setFilterPresets(prev => {
      const next = prev.filter(p => p.id !== id);
      lsSetJson(STORAGE_KEYS.FILTER_PRESETS, next);
      return next;
    });
  }, []);

  const applyFilterPreset = useCallback((preset: FilterPreset) => {
    setSearchQuery(preset.query);
    setShowPresetDropdown(false);
  }, [setSearchQuery]);

  const [showQualifierHints, setShowQualifierHints] = useState(false);
  const [showQualifierHelp, setShowQualifierHelp] = useState(false);
  const [hintIndex, setHintIndex] = useState(0);

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
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);

  // Debounced tokens reference for the expensive duplicate-value computation.
  const [debouncedTokens, setDebouncedTokens] = useState(tokens);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedTokens(tokens), 300);
    return () => clearTimeout(timer);
  }, [tokens]);

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
      apiFetch<{ data: Array<{ setName: string; path: string; name: string; $type: string; $value: unknown; $description?: string }>; total: number }>(`${serverUrl}/api/tokens/search?${params}`, { signal: ctrl.signal })
        .then(data => {
          const mapped = data.data.map(r => ({
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
          if (isAbortError(err)) return;
          console.error('Cross-set search failed:', err);
        });
    }, 150);

    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [crossSetSearch, searchQuery, serverUrl, crossSetOffset]);

  const filtersActive = searchQuery !== '' || typeFilter !== '' || refFilter !== 'all' || showDuplicates || showIssuesOnly || showRecentlyTouched || showPinnedOnly;

  // Count of active non-search filters (for compact filter indicator)
  const activeFilterCount = (typeFilter !== '' ? 1 : 0) + (refFilter !== 'all' ? 1 : 0) + (showDuplicates ? 1 : 0) + (showIssuesOnly ? 1 : 0) + (showRecentlyTouched ? 1 : 0) + (showPinnedOnly ? 1 : 0);

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

  // availableTypes MUST be declared before qualifierHints to avoid TDZ crash
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

  // displayedTokens: derived from search/filter state and component-level state
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
    if (inspectMode && boundTokenPaths.size > 0) result = filterByDuplicatePaths(result, boundTokenPaths);
    if (showRecentlyTouched) {
      if (recentlyTouched.paths.size > 0) result = filterByDuplicatePaths(result, recentlyTouched.paths);
      else result = [];
    }
    if (showPinnedOnly) {
      if (pinnedPaths.size > 0) result = filterByDuplicatePaths(result, pinnedPaths);
      else result = [];
    }
    return result;
  }, [sortedTokens, zoomRootPath, searchQuery, typeFilter, refFilter, filtersActive, showDuplicates, duplicateValuePaths, showIssuesOnly, lintPaths, inspectMode, boundTokenPaths, showRecentlyTouched, recentlyTouched.paths, showPinnedOnly, pinnedPaths, derivedTokenPaths, unusedTokenPaths]);

  // Memoized flat leaf list for displayedTokens — avoids repeated O(n) walks per render
  const displayedLeafNodes = useMemo(() => flattenLeafNodes(displayedTokens), [displayedTokens]);

  return {
    // State
    searchQuery,
    setSearchQueryState,
    typeFilter,
    setTypeFilterState,
    refFilter,
    setRefFilterState,
    showDuplicates,
    setShowDuplicatesState,
    crossSetSearch,
    setCrossSetSearch,
    filterPresets,
    showPresetDropdown,
    setShowPresetDropdown,
    presetNameInput,
    setPresetNameInput,
    presetDropdownRef,
    saveFilterPreset,
    deleteFilterPreset,
    applyFilterPreset,
    showQualifierHints,
    setShowQualifierHints,
    showQualifierHelp,
    setShowQualifierHelp,
    hintIndex,
    setHintIndex,
    placeholderIdx,
    searchFocused,
    setSearchFocused,
    filterDrawerOpen,
    setFilterDrawerOpen,
    debouncedTokens,
    crossSetResults,
    crossSetTotal,
    crossSetOffset,
    setCrossSetOffset,
    // Refs
    searchRef,
    qualifierHintsRef,
    qualifierHelpRef,
    crossSetAbortRef,
    // Callbacks
    saveScrollAnchor,
    setSearchQuery,
    setTypeFilter,
    setRefFilter,
    setShowDuplicates,
    // Computed
    filtersActive,
    activeFilterCount,
    duplicateValuePaths,
    duplicateCounts,
    availableTypes,
    qualifierHints,
    searchHighlight,
    PLACEHOLDER_EXAMPLES,
    displayedTokens,
    displayedLeafNodes,
  };
}
