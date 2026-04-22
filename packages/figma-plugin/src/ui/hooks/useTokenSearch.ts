import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { TokenNode } from './useTokens';
import type { TokenMapEntry } from '../../shared/types';
import type { TokenGenerator } from './useGenerators';
import { STORAGE_KEY_BUILDERS, STORAGE_KEYS, lsGet, lsSet, lsGetJson, lsSetJson, ssGet, ssSet } from '../shared/storage';
import { ALL_TOKEN_TYPES } from '../shared/tokenTypeCategories';

export interface FilterPreset {
  id: string;
  name: string;
  query: string;
}
import {
  flattenLeafNodes, filterTokenNodes, filterByDuplicatePaths,
  collectAllGroupPaths, flattenLeafNodesWithAncestors,
  findGroupByPath, parseStructuredQuery, QUERY_QUALIFIERS,
  getActiveQueryToken, getQualifierDefinitionForToken, getQueryQualifierValues,
  normalizeHasQualifier, removeQueryQualifierValues, setQueryQualifierValues,
  replaceQueryToken,
} from '../components/tokenListUtils';
import { stableStringify } from '../shared/utils';
import { apiFetch } from '../shared/apiFetch';
import { isAbortError } from '../shared/utils';

export interface UseTokenSearchParams {
  collectionId: string;
  tokens: TokenNode[];
  collectionIds: string[];
  serverUrl: string;
  onOpenCommandPaletteWithQuery?: (q: string) => void;
  virtualScrollTopRef: React.MutableRefObject<number>;
  flatItemsRef: React.MutableRefObject<Array<{ node: { path: string } }>>;
  itemOffsetsRef: React.MutableRefObject<number[]>;
  scrollAnchorPathRef: React.MutableRefObject<string | null>;
  isFilterChangeRef: React.MutableRefObject<boolean>;
  expandedPaths: Set<string>;
  starredPaths: Set<string>;
  sortedTokens: TokenNode[];
  recentlyTouchedPaths: Set<string>;
  // Additional filtering state from component
  showIssuesOnly?: boolean;
  showRecentlyTouched?: boolean;
  showStarredOnly?: boolean;
  inspectMode?: boolean;
  zoomRootPath?: string | null;
  lintPaths?: Set<string>;
  boundTokenPaths?: Set<string>;
  unusedTokenPaths?: Set<string> | undefined;
  derivedTokenPaths?: Map<string, TokenGenerator>;
}

export function useTokenSearch({
  collectionId,
  tokens,
  collectionIds: _collectionIds,
  serverUrl,
  onOpenCommandPaletteWithQuery: _onOpenCommandPaletteWithQuery,
  virtualScrollTopRef,
  flatItemsRef,
  itemOffsetsRef,
  scrollAnchorPathRef,
  isFilterChangeRef,
  expandedPaths: _expandedPaths,
  starredPaths,
  sortedTokens,
  recentlyTouchedPaths,
  showIssuesOnly = false,
  showRecentlyTouched = false,
  showStarredOnly = false,
  inspectMode = false,
  zoomRootPath = null,
  lintPaths = new Set(),
  boundTokenPaths = new Set(),
  unusedTokenPaths,
  derivedTokenPaths,
}: UseTokenSearchParams) {
  const searchRef = useRef<HTMLInputElement>(null);
  const qualifierHintsRef = useRef<HTMLDivElement>(null);
  const filterPanelRef = useRef<HTMLDivElement>(null);

  const [searchQuery, setSearchQueryState] = useState(() => {
    return ssGet('token-search', '');
  });
  const [typeFilter, setTypeFilterState] = useState<string>('');
  const [refFilter, setRefFilterState] = useState<'all' | 'aliases' | 'direct'>(() => {
    const stored = ssGet('token-ref-filter');
    return stored === 'aliases' || stored === 'direct' || stored === 'all' ? stored : 'all';
  });

  useEffect(() => {
    setTypeFilterState(lsGet(STORAGE_KEY_BUILDERS.tokenTypeFilter(collectionId), ''));
  }, [collectionId]);

  // Declared before setSearchQuery to avoid TDZ — setSearchQuery references crossCollectionSearch
  const [crossCollectionSearch, setCrossCollectionSearch] = useState(false);

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
    saveScrollAnchor();
    setSearchQueryState(v);
    ssSet('token-search', v);
  }, [saveScrollAnchor]);

  const setTypeFilter = useCallback((v: string) => {
    saveScrollAnchor();
    setTypeFilterState(v);
    lsSet(STORAGE_KEY_BUILDERS.tokenTypeFilter(collectionId), v);
  }, [saveScrollAnchor, collectionId]);

  const setRefFilter = useCallback((v: 'all' | 'aliases' | 'direct') => {
    saveScrollAnchor();
    setRefFilterState(v);
    ssSet('token-ref-filter', v);
  }, [saveScrollAnchor]);

  const [showDuplicates, setShowDuplicatesState] = useState(() => {
    return ssGet('token-duplicates') === '1';
  });
  const setShowDuplicates = useCallback((v: boolean) => {
    setShowDuplicatesState(v);
    ssSet('token-duplicates', v ? '1' : '0');
  }, []);

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
  const [hintIndex, setHintIndex] = useState(0);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);

  // Debounced tokens reference for the expensive duplicate-value computation.
  const [debouncedTokens, setDebouncedTokens] = useState(tokens);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedTokens(tokens), 300);
    return () => clearTimeout(timer);
  }, [tokens]);

  // Cross-collection search: debounced server-side search across all collections
  const [crossCollectionResults, setCrossCollectionResults] = useState<Array<{ collectionId: string; path: string; entry: TokenMapEntry }> | null>(null);
  const [crossCollectionTotal, setCrossCollectionTotal] = useState<number>(0);
  const [crossCollectionOffset, setCrossCollectionOffset] = useState<number>(0);
  const crossCollectionAbortRef = useRef<AbortController | null>(null);
  const CROSS_COLLECTION_PAGE_SIZE = 200;

  // Reset offset when query changes
  useEffect(() => {
    setCrossCollectionOffset(0);
  }, [crossCollectionSearch, searchQuery]);

  useEffect(() => {
    if (!crossCollectionSearch || !searchQuery.trim()) {
      // When cross-collection mode is active but no query, return null so the normal tree renders
      // (rather than [] which would show "No tokens found across all collections")
      setCrossCollectionResults(null);
      setCrossCollectionTotal(0);
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
    params.set('limit', String(CROSS_COLLECTION_PAGE_SIZE));
    if (crossCollectionOffset > 0) params.set('offset', String(crossCollectionOffset));

    crossCollectionAbortRef.current?.abort();
    const ctrl = new AbortController();
    crossCollectionAbortRef.current = ctrl;

    const timer = setTimeout(() => {
      apiFetch<{ data: Array<{ collectionId: string; path: string; name: string; $type: string; $value: unknown; $description?: string }>; total: number }>(`${serverUrl}/api/tokens/search?${params}`, { signal: ctrl.signal })
        .then(data => {
          const mapped = data.data.map(r => ({
            collectionId: r.collectionId,
            path: r.path,
            entry: { $value: r.$value as any, $type: r.$type, $name: r.name },
          }));
          setCrossCollectionTotal(data.total);
          if (crossCollectionOffset > 0) {
            setCrossCollectionResults(prev => [...(prev ?? []), ...mapped]);
          } else {
            setCrossCollectionResults(mapped);
          }
        })
        .catch(err => {
          if (isAbortError(err)) return;
          console.error('Cross-collection search failed:', err);
        });
    }, 150);

    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [crossCollectionOffset, crossCollectionSearch, searchQuery, serverUrl]);

  const filtersActive = searchQuery !== '' || typeFilter !== '' || refFilter !== 'all' || showDuplicates || showIssuesOnly || showRecentlyTouched || showStarredOnly;

  // Count of active non-search filters (for compact filter indicator)
  const activeFilterCount = (typeFilter !== '' ? 1 : 0) + (refFilter !== 'all' ? 1 : 0) + (showDuplicates ? 1 : 0) + (showIssuesOnly ? 1 : 0) + (showRecentlyTouched ? 1 : 0) + (showStarredOnly ? 1 : 0);

  // Compute duplicate value info from all tokens in the current collection
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

  const qualifierTypeOptions = useMemo(() => {
    const merged = new Set<string>(ALL_TOKEN_TYPES);
    for (const type of availableTypes) merged.add(type);
    return [...merged].sort();
  }, [availableTypes]);

  const generatorNames = useMemo(() => {
    const names = new Set<string>();
    for (const generator of derivedTokenPaths?.values() ?? []) names.add(generator.name);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [derivedTokenPaths]);

  const parsedSearchQuery = useMemo(() => parseStructuredQuery(searchQuery), [searchQuery]);
  const selectedTypeQualifiers = useMemo(
    () => Array.from(new Set(parsedSearchQuery.types)),
    [parsedSearchQuery.types],
  );
  const selectedHasQualifiers = useMemo(
    () => Array.from(new Set(parsedSearchQuery.has.map(value => normalizeHasQualifier(value)).filter((value): value is NonNullable<typeof value> => value !== null))),
    [parsedSearchQuery.has],
  );

  const activeQueryToken = useMemo(() => getActiveQueryToken(searchQuery), [searchQuery]);

  // Compute filtered qualifier hints based on what the user is currently typing.
  // Must be declared AFTER availableTypes to avoid TDZ crash.
  const qualifierHints = useMemo(() => {
    const activeToken = activeQueryToken.token;
    if (!activeToken.includes(':')) return [];

    const qualifierDef = getQualifierDefinitionForToken(activeToken);
    if (!qualifierDef) return [];

    const [, rawValue = ''] = activeToken.split(':', 2);
    const partialValue = rawValue.toLowerCase();

    if (qualifierDef.key === 'type') {
      const matches = partialValue
        ? qualifierTypeOptions.filter(type => type.toLowerCase().startsWith(partialValue))
        : qualifierTypeOptions;
      return matches.map(type => ({
        id: `type:${type}`,
        label: `type:${type}`,
        desc: `Filter to ${type} tokens`,
        replacement: `type:${type}`,
        kind: 'replacement' as const,
      }));
    }

    if (qualifierDef.key === 'has') {
      const matches = QUERY_QUALIFIERS
        .filter(def => def.key === 'has')
        .filter(def => def.qualifier.slice(4).startsWith(partialValue));
      return matches.map(def => ({
        id: def.qualifier,
        label: def.qualifier,
        desc: def.desc,
        replacement: def.qualifier,
        kind: 'replacement' as const,
      }));
    }

    if (qualifierDef.key === 'generator') {
      const matches = partialValue
        ? generatorNames.filter(name => name.toLowerCase().startsWith(partialValue))
        : generatorNames;
      if (matches.length > 0) {
        return matches.map(name => ({
          id: `generated:${name}`,
          label: `generated:${name}`,
          desc: 'Filter by generated group name',
          replacement: `generated:${name}`,
          kind: 'replacement' as const,
        }));
      }
    }

    return [{
      id: `${qualifierDef.key}-hint`,
      label: activeToken,
      desc: qualifierDef.valueHint ?? qualifierDef.desc,
      kind: 'hint' as const,
    }];
  }, [activeQueryToken.token, generatorNames, qualifierTypeOptions]);

  // Compute highlight terms from the parsed search query for substring highlighting
  const searchHighlight = useMemo(() => {
    if (!searchQuery) return undefined;
    const parsed = parsedSearchQuery;
    const nameTerms: string[] = [];
    const valueTerms: string[] = [];
    if (parsed.text) nameTerms.push(parsed.text);
    nameTerms.push(...parsed.names, ...parsed.paths);
    valueTerms.push(...parsed.values);
    // For plain text search, the term also matches values
    if (parsed.text) valueTerms.push(parsed.text);
    if (!nameTerms.length && !valueTerms.length) return undefined;
    return { nameTerms, valueTerms };
  }, [parsedSearchQuery, searchQuery]);

  const toggleQueryQualifierValue = useCallback((
    qualifier: 'type' | 'has' | 'value' | 'desc' | 'path' | 'name' | 'generator' | 'group' | 'scope',
    value: string,
  ) => {
    const currentValues = getQueryQualifierValues(searchQuery, qualifier);
    const nextValues = currentValues.includes(value.toLowerCase())
      ? currentValues.filter(current => current !== value.toLowerCase())
      : [...currentValues, value.toLowerCase()];
    setSearchQuery(setQueryQualifierValues(searchQuery, qualifier, nextValues));
  }, [searchQuery, setSearchQuery]);

  const addQueryQualifierValue = useCallback((
    qualifier: 'type' | 'has' | 'value' | 'desc' | 'path' | 'name' | 'generator' | 'group' | 'scope',
    value: string,
  ) => {
    const normalizedValue = value.trim().toLowerCase();
    if (!normalizedValue) return;
    const currentValues = getQueryQualifierValues(searchQuery, qualifier);
    if (currentValues.includes(normalizedValue)) return;
    setSearchQuery(setQueryQualifierValues(searchQuery, qualifier, [...currentValues, normalizedValue]));
  }, [searchQuery, setSearchQuery]);

  const removeQueryQualifierValue = useCallback((
    qualifier: 'type' | 'has' | 'value' | 'desc' | 'path' | 'name' | 'generator' | 'group' | 'scope',
    value: string,
  ) => {
    const normalizedValue = value.trim().toLowerCase();
    const currentValues = getQueryQualifierValues(searchQuery, qualifier);
    const nextValues = currentValues.filter(current => current !== normalizedValue);
    setSearchQuery(setQueryQualifierValues(searchQuery, qualifier, nextValues));
  }, [searchQuery, setSearchQuery]);

  const clearQueryQualifier = useCallback((
    qualifier: 'type' | 'has' | 'value' | 'desc' | 'path' | 'name' | 'generator' | 'group' | 'scope',
  ) => {
    setSearchQuery(removeQueryQualifierValues(searchQuery, qualifier));
  }, [searchQuery, setSearchQuery]);

  const replaceActiveQueryWithQualifierValue = useCallback((
    qualifier: 'type' | 'has' | 'value' | 'desc' | 'path' | 'name' | 'generator' | 'group' | 'scope',
    value: string,
  ) => {
    const normalizedValue = value.trim().toLowerCase();
    if (!normalizedValue) return;
    const qualifierKey = qualifier === 'generator' ? 'generated' : qualifier;
    setSearchQuery(
      replaceQueryToken(
        searchQuery,
        activeQueryToken,
        `${qualifierKey}:${normalizedValue}`,
      ),
    );
  }, [activeQueryToken, searchQuery, setSearchQuery]);

  const removeQueryToken = useCallback((token: string) => {
    const next = searchQuery
      .split(/\s+/)
      .filter(part => part && part.toLowerCase() !== token.toLowerCase())
      .join(' ')
      .trim();
    setSearchQuery(next);
  }, [searchQuery, setSearchQuery]);

  const structuredFilterChips = useMemo(() => {
    const chips: Array<{ token: string; label: string }> = [];
    for (const value of parsedSearchQuery.types) chips.push({ token: `type:${value}`, label: `type:${value}` });
    for (const value of selectedHasQualifiers) chips.push({ token: `has:${value}`, label: `has:${value}` });
    for (const value of parsedSearchQuery.values) chips.push({ token: `value:${value}`, label: `value:${value}` });
    for (const value of parsedSearchQuery.descs) chips.push({ token: `desc:${value}`, label: `desc:${value}` });
    for (const value of parsedSearchQuery.paths) chips.push({ token: `path:${value}`, label: `path:${value}` });
    for (const value of parsedSearchQuery.names) chips.push({ token: `name:${value}`, label: `name:${value}` });
    for (const value of parsedSearchQuery.generators) {
      chips.push({
        token: `generated:${value}`,
        label: `generated:${value}`,
      });
    }
    for (const value of parsedSearchQuery.scopes) {
      chips.push({
        token: `scope:${value}`,
        label: `Can apply to ${value}`,
      });
    }
    return chips;
  }, [parsedSearchQuery, selectedHasQualifiers]);

  const searchTooltip = 'Search names, paths, and descriptions. Use Filters for structured search, or type qualifier prefixes like type: and has: for autocomplete.';

  // displayedTokens: derived from search/filter state and component-level state
  const displayedTokens = useMemo(() => {
    // Apply zoom: if a zoom root is set, extract that subtree's children
    let baseTokens = sortedTokens;
    if (zoomRootPath) {
      const zoomNode = findGroupByPath(sortedTokens, zoomRootPath);
      baseTokens = zoomNode?.children ?? [];
    }
    let result = filtersActive ? filterTokenNodes(baseTokens, collectionId, searchQuery, typeFilter, refFilter, duplicateValuePaths, derivedTokenPaths, unusedTokenPaths) : baseTokens;
    if (showDuplicates) result = filterByDuplicatePaths(result, duplicateValuePaths);
    if (showIssuesOnly && lintPaths.size > 0) result = filterByDuplicatePaths(result, lintPaths);
    if (inspectMode && boundTokenPaths.size > 0) result = filterByDuplicatePaths(result, boundTokenPaths);
    if (showRecentlyTouched) {
      if (recentlyTouchedPaths.size > 0) result = filterByDuplicatePaths(result, recentlyTouchedPaths);
      else result = [];
    }
    if (showStarredOnly) {
      if (starredPaths.size > 0) result = filterByDuplicatePaths(result, starredPaths);
      else result = [];
    }
    return result;
  }, [sortedTokens, zoomRootPath, collectionId, searchQuery, typeFilter, refFilter, filtersActive, showDuplicates, duplicateValuePaths, showIssuesOnly, lintPaths, inspectMode, boundTokenPaths, showRecentlyTouched, recentlyTouchedPaths, showStarredOnly, starredPaths, derivedTokenPaths, unusedTokenPaths]);

  // Memoized flat leaf list for displayedTokens — avoids repeated O(n) walks per render
  const displayedLeafNodes = useMemo(() => flattenLeafNodes(displayedTokens), [displayedTokens]);
  const displayedGroupPaths = useMemo(() => collectAllGroupPaths(displayedTokens), [displayedTokens]);
  const displayedLeafNodesWithAncestors = useMemo(
    () => flattenLeafNodesWithAncestors(displayedTokens),
    [displayedTokens],
  );

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
    crossCollectionSearch,
    setCrossCollectionSearch,
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
    hintIndex,
    setHintIndex,
    filterDrawerOpen,
    setFilterDrawerOpen,
    filterPanelOpen,
    setFilterPanelOpen,
    debouncedTokens,
    crossCollectionResults,
    crossCollectionTotal,
    crossCollectionOffset,
    setCrossCollectionOffset,
    // Refs
    searchRef,
    qualifierHintsRef,
    filterPanelRef,
    crossCollectionAbortRef,
    CROSS_COLLECTION_PAGE_SIZE,
    // Callbacks
    saveScrollAnchor,
    setSearchQuery,
    setTypeFilter,
    setRefFilter,
    setShowDuplicates,
    toggleQueryQualifierValue,
    addQueryQualifierValue,
    removeQueryQualifierValue,
    clearQueryQualifier,
    replaceActiveQueryWithQualifierValue,
    removeQueryToken,
    // Computed
    filtersActive,
    activeFilterCount,
    duplicateValuePaths,
    duplicateCounts,
    availableTypes,
    qualifierTypeOptions,
    generatorNames,
    qualifierHints,
    activeQueryToken,
    parsedSearchQuery,
    selectedTypeQualifiers,
    selectedHasQualifiers,
    structuredFilterChips,
    searchHighlight,
    searchTooltip,
    displayedTokens,
    displayedLeafNodes,
    displayedGroupPaths,
    displayedLeafNodesWithAncestors,
  };
}
