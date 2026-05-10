import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { CROSS_COLLECTION_SEARCH_HAS_CANONICAL_SET } from '@token-workshop/core';
import type { TokenNode } from './useTokens';
import type { TokenMapEntry } from '../../shared/types';
import {
  SESSION_STORAGE_KEYS,
  STORAGE_KEY_BUILDERS,
  lsGet,
  lsSet,
  ssGet,
  ssSet,
} from '../shared/storage';
import { ALL_TOKEN_TYPES, getTokenTypeLabel } from '../shared/tokenTypeCategories';
import {
  flattenLeafNodes, filterTokenNodes, filterByDuplicatePaths,
  collectAllGroupPaths, flattenLeafNodesWithAncestors,
  findGroupByPath, parseStructuredQuery, QUERY_QUALIFIERS,
  getActiveQueryToken, getQualifierDefinitionForToken, getQueryQualifierValues,
  normalizeHasQualifier, setQueryQualifierValues, findUnsupportedStructuredTokens,
  getTokenSearchableValueStrings,
} from '../components/tokenListUtils';
import { isAbortError } from '../shared/utils';
import { apiFetch } from '../shared/apiFetch';

function buildCrossCollectionHasValues(
  parsedHasValues: string[],
  refFilter: 'all' | 'aliases' | 'direct',
  showDuplicates: boolean,
): string[] | undefined {
  const merged = new Set(parsedHasValues);
  if (refFilter === 'aliases') {
    merged.add('alias');
  } else if (refFilter === 'direct') {
    merged.add('direct');
  }
  if (showDuplicates) {
    merged.add('duplicate');
  }
  return merged.size > 0 ? [...merged] : undefined;
}

function buildCrossCollectionTypes(
  parsedTypes: string[],
  typeFilter: string,
): string[] | null | undefined {
  if (!typeFilter) {
    return parsedTypes.length > 0 ? parsedTypes : undefined;
  }
  const normalizedTypeFilter = typeFilter.toLowerCase();
  if (parsedTypes.length === 0) {
    return [normalizedTypeFilter];
  }
  const matchesTypeFilter = parsedTypes.some(
    (typeValue) =>
      normalizedTypeFilter === typeValue ||
      normalizedTypeFilter.includes(typeValue),
  );
  return matchesTypeFilter ? [normalizedTypeFilter] : null;
}

function getHasFilterLabel(value: string): string {
  switch (value) {
    case 'alias':
      return 'References';
    case 'direct':
      return 'Literal values';
    case 'duplicate':
      return 'Shared values';
    case 'description':
      return 'Has description';
    case 'extension':
      return 'Has extensions';
    case 'managed':
      return 'Generated tokens';
    case 'unused':
      return 'Unused tokens';
    default:
      return value;
  }
}

export interface UseTokenSearchParams {
  collectionId: string;
  tokens: TokenNode[];
  serverUrl: string;
  virtualScrollTopRef: React.MutableRefObject<number>;
  flatItemsRef: React.MutableRefObject<Array<{ node: { path: string } }>>;
  itemOffsetsRef: React.MutableRefObject<number[]>;
  scrollAnchorPathRef: React.MutableRefObject<string | null>;
  isFilterChangeRef: React.MutableRefObject<boolean>;
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
}

export function useTokenSearch({
  collectionId,
  tokens,
  serverUrl,
  virtualScrollTopRef,
  flatItemsRef,
  itemOffsetsRef,
  scrollAnchorPathRef,
  isFilterChangeRef,
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
}: UseTokenSearchParams) {
  const searchRef = useRef<HTMLInputElement>(null);
  const qualifierHintsRef = useRef<HTMLDivElement>(null);
  const searchStorageKey = STORAGE_KEY_BUILDERS.tokenSearchQuery(collectionId);

  const [searchQuery, setSearchQueryState] = useState(() => {
    return ssGet(searchStorageKey, '');
  });
  const [typeFilter, setTypeFilterState] = useState<string>('');
  const [refFilter, setRefFilterState] = useState<'all' | 'aliases' | 'direct'>(() => {
    const stored = ssGet(SESSION_STORAGE_KEYS.TOKEN_REF_FILTER);
    return stored === 'aliases' || stored === 'direct' || stored === 'all' ? stored : 'all';
  });

  useEffect(() => {
    setSearchQueryState(ssGet(searchStorageKey, ''));
    setTypeFilterState(lsGet(STORAGE_KEY_BUILDERS.tokenTypeFilter(collectionId), ''));
  }, [collectionId, searchStorageKey]);

  const [crossCollectionSearch, setCrossCollectionSearchState] = useState(false);

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
    ssSet(searchStorageKey, v);
  }, [saveScrollAnchor, searchStorageKey]);

  const setTypeFilter = useCallback((v: string) => {
    saveScrollAnchor();
    setTypeFilterState(v);
    lsSet(STORAGE_KEY_BUILDERS.tokenTypeFilter(collectionId), v);
  }, [saveScrollAnchor, collectionId]);

  const setRefFilter = useCallback((v: 'all' | 'aliases' | 'direct') => {
    saveScrollAnchor();
    setRefFilterState(v);
    ssSet(SESSION_STORAGE_KEYS.TOKEN_REF_FILTER, v);
  }, [saveScrollAnchor]);

  const [showDuplicates, setShowDuplicatesState] = useState(() => {
    return ssGet(SESSION_STORAGE_KEYS.TOKEN_DUPLICATES) === '1';
  });
  const setShowDuplicates = useCallback((v: boolean) => {
    saveScrollAnchor();
    setShowDuplicatesState(v);
    ssSet(SESSION_STORAGE_KEYS.TOKEN_DUPLICATES, v ? '1' : '0');
  }, [saveScrollAnchor]);

  const setCrossCollectionSearch = useCallback((v: boolean) => {
    saveScrollAnchor();
    setCrossCollectionSearchState(v);
  }, [saveScrollAnchor]);

  const [showQualifierHints, setShowQualifierHints] = useState(false);
  const [hintIndex, setHintIndex] = useState(0);

  // Debounced tokens reference for the expensive duplicate-value computation.
  const [debouncedTokens, setDebouncedTokens] = useState(tokens);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedTokens(tokens), 300);
    return () => clearTimeout(timer);
  }, [tokens]);

  // Cross-collection search: debounced server-side search across all collections
  const [crossCollectionResults, setCrossCollectionResults] = useState<Array<{ collectionId: string; path: string; entry: TokenMapEntry }> | null>(null);
  const [crossCollectionTotal, setCrossCollectionTotal] = useState<number>(0);
  const [crossCollectionLoading, setCrossCollectionLoading] = useState(false);
  const [crossCollectionError, setCrossCollectionError] = useState<string | null>(null);
  const [crossCollectionOffset, setCrossCollectionOffset] = useState<number>(0);
  const [crossCollectionRequestKey, setCrossCollectionRequestKey] = useState(0);
  const lastCrossCollectionCriteriaKeyRef = useRef<string | null>(null);
  const crossCollectionAbortRef = useRef<AbortController | null>(null);
  const CROSS_COLLECTION_PAGE_SIZE = 200;

  const abortCrossCollectionSearch = useCallback(() => {
    crossCollectionAbortRef.current?.abort();
    crossCollectionAbortRef.current = null;
  }, []);

  const resetCrossCollectionState = useCallback((
    results: Array<{ collectionId: string; path: string; entry: TokenMapEntry }> | null,
    error: string | null,
  ) => {
    setCrossCollectionOffset(0);
    setCrossCollectionResults(results);
    setCrossCollectionTotal(0);
    setCrossCollectionLoading(false);
    setCrossCollectionError(error);
  }, []);

  const retryCrossCollectionSearch = useCallback(() => {
    if (
      !crossCollectionSearch ||
      (searchQuery.trim() === "" &&
        typeFilter === "" &&
        refFilter === "all" &&
        !showDuplicates)
    ) {
      return;
    }
    setCrossCollectionRequestKey((key) => key + 1);
  }, [crossCollectionSearch, refFilter, searchQuery, showDuplicates, typeFilter]);

  const crossCollectionCriteriaKey = useMemo(
    () =>
      JSON.stringify({
        query: searchQuery.trim(),
        typeFilter,
        refFilter,
        showDuplicates,
      }),
    [refFilter, searchQuery, showDuplicates, typeFilter],
  );

  const hasCrossCollectionCriteria = useMemo(
    () =>
      searchQuery.trim() !== "" ||
      typeFilter !== "" ||
      refFilter !== "all" ||
      showDuplicates,
    [refFilter, searchQuery, showDuplicates, typeFilter],
  );

  useEffect(() => {
    if (!crossCollectionSearch || !hasCrossCollectionCriteria) {
      lastCrossCollectionCriteriaKeyRef.current = null;
      abortCrossCollectionSearch();
      // When cross-collection mode is active but no usable criteria, keep showing the
      // normal tree instead of an empty cross-collection result state.
      resetCrossCollectionState(null, null);
      return;
    }
    const unsupportedTokens = findUnsupportedStructuredTokens(searchQuery);
    if (unsupportedTokens.length > 0) {
      lastCrossCollectionCriteriaKeyRef.current = crossCollectionCriteriaKey;
      abortCrossCollectionSearch();
      resetCrossCollectionState(
        [],
        `Search all collections does not use ${unsupportedTokens.join(', ')}. Remove ${
          unsupportedTokens.length === 1 ? 'that filter' : 'those filters'
        } or search this collection.`,
      );
      return;
    }
    const parsed = parseStructuredQuery(searchQuery);
    const mergedHasValues = buildCrossCollectionHasValues(
      parsed.has,
      refFilter,
      showDuplicates,
    );
    const unsupportedHasValues = Array.from(
      new Set(
        (mergedHasValues ?? [])
          .map((value) => normalizeHasQualifier(value))
          .filter(
            (value): value is NonNullable<typeof value> =>
              value !== null &&
              !CROSS_COLLECTION_SEARCH_HAS_CANONICAL_SET.has(value),
          ),
      ),
    );
    if (unsupportedHasValues.length > 0) {
      lastCrossCollectionCriteriaKeyRef.current = crossCollectionCriteriaKey;
      abortCrossCollectionSearch();
      resetCrossCollectionState(
        [],
        `That token state filter only works inside one collection: ${unsupportedHasValues
          .map((value) => `has:${value}`)
          .join(', ')}.`,
      );
      return;
    }
    const requestedTypes = buildCrossCollectionTypes(parsed.types, typeFilter);
    if (requestedTypes === null) {
      lastCrossCollectionCriteriaKeyRef.current = crossCollectionCriteriaKey;
      abortCrossCollectionSearch();
      resetCrossCollectionState([], null);
      return;
    }
    const criteriaChanged =
      lastCrossCollectionCriteriaKeyRef.current !== null &&
      lastCrossCollectionCriteriaKeyRef.current !== crossCollectionCriteriaKey;
    if (criteriaChanged && crossCollectionOffset > 0) {
      lastCrossCollectionCriteriaKeyRef.current = crossCollectionCriteriaKey;
      abortCrossCollectionSearch();
      setCrossCollectionResults(null);
      setCrossCollectionTotal(0);
      setCrossCollectionLoading(false);
      setCrossCollectionError(null);
      setCrossCollectionOffset(0);
      return;
    }
    lastCrossCollectionCriteriaKeyRef.current = crossCollectionCriteriaKey;
    const params = new URLSearchParams();
    if (parsed.text) params.set('q', parsed.text);
    if (requestedTypes && requestedTypes.length > 0) {
      params.set('type', requestedTypes.join(','));
    }
    if (mergedHasValues && mergedHasValues.length > 0) {
      params.set('has', mergedHasValues.join(','));
    }
    if (parsed.values.length) params.set('value', parsed.values.join(','));
    if (parsed.descs.length) params.set('desc', parsed.descs.join(','));
    if (parsed.paths.length) params.set('path', parsed.paths.join(','));
    if (parsed.names.length) params.set('name', parsed.names.join(','));
    if (parsed.scopes.length) params.set('scope', parsed.scopes.join(','));
    params.set('limit', String(CROSS_COLLECTION_PAGE_SIZE));
    if (crossCollectionOffset > 0) params.set('offset', String(crossCollectionOffset));

    const isPaginating = crossCollectionOffset > 0;
    abortCrossCollectionSearch();
    const ctrl = new AbortController();
    crossCollectionAbortRef.current = ctrl;
    setCrossCollectionLoading(true);
    setCrossCollectionError(null);
    if (!isPaginating) {
      setCrossCollectionResults(null);
      setCrossCollectionTotal(0);
    }

    const timer = setTimeout(() => {
      apiFetch<{ data: Array<{ collectionId: string; path: string; name: string; $type: string; $value: unknown; $description?: string }>; total: number }>(`${serverUrl}/api/tokens/search?${params}`, { signal: ctrl.signal })
        .then(data => {
          if (crossCollectionAbortRef.current !== ctrl) return;
          const mapped = data.data.map(r => ({
            collectionId: r.collectionId,
            path: r.path,
            entry: {
              $value: r.$value as TokenMapEntry["$value"],
              $type: r.$type,
              $name: r.name,
            },
          }));
          setCrossCollectionTotal(data.total);
          if (isPaginating) {
            setCrossCollectionResults(prev => [...(prev ?? []), ...mapped]);
          } else {
            setCrossCollectionResults(mapped);
          }
          setCrossCollectionError(null);
          setCrossCollectionLoading(false);
        })
        .catch(err => {
          if (isAbortError(err)) return;
          if (crossCollectionAbortRef.current !== ctrl) return;
          console.error('Cross-collection search failed:', err);
          if (!isPaginating) {
            setCrossCollectionResults([]);
            setCrossCollectionTotal(0);
          }
          setCrossCollectionError(err instanceof Error ? err.message : 'Search failed.');
          setCrossCollectionLoading(false);
        });
    }, 150);

    return () => {
      clearTimeout(timer);
      ctrl.abort();
      if (crossCollectionAbortRef.current === ctrl) {
        crossCollectionAbortRef.current = null;
      }
    };
  }, [
    abortCrossCollectionSearch,
    crossCollectionCriteriaKey,
    crossCollectionOffset,
    crossCollectionRequestKey,
    crossCollectionSearch,
    hasCrossCollectionCriteria,
    refFilter,
    resetCrossCollectionState,
    searchQuery,
    serverUrl,
    showDuplicates,
    typeFilter,
  ]);

  const crossCollectionUnsupportedFiltersActive =
    !crossCollectionSearch &&
    (showIssuesOnly || showRecentlyTouched || showStarredOnly || inspectMode);
  const filtersActive =
    searchQuery !== '' ||
    typeFilter !== '' ||
    refFilter !== 'all' ||
    showDuplicates ||
    crossCollectionUnsupportedFiltersActive;

  // Count of active non-search filters (for compact filter indicator)
  const activeFilterCount =
    (typeFilter !== '' ? 1 : 0) +
    (refFilter !== 'all' ? 1 : 0) +
    (showDuplicates ? 1 : 0) +
    (!crossCollectionSearch && showIssuesOnly ? 1 : 0) +
    (!crossCollectionSearch && showRecentlyTouched ? 1 : 0) +
    (!crossCollectionSearch && showStarredOnly ? 1 : 0) +
    (!crossCollectionSearch && inspectMode ? 1 : 0);

  // Compute duplicate value info from all tokens in the current collection
  const { duplicateValuePaths, duplicateCounts } = useMemo(() => {
    const valueMap = new Map<string, Set<string>>(); // serialized value → paths
    const collectLeaves = (nodes: TokenNode[]) => {
      for (const n of nodes) {
        if (!n.isGroup) {
          for (const key of getTokenSearchableValueStrings(n, collectionId)) {
            if (!valueMap.has(key)) valueMap.set(key, new Set());
            valueMap.get(key)!.add(n.path);
          }
        }
        if (n.children) collectLeaves(n.children);
      }
    };
    collectLeaves(debouncedTokens);
    const paths = new Set<string>();
    const counts = new Map<string, number>(); // serialized value → count
    for (const [key, ps] of valueMap) {
      if (ps.size > 1) {
        ps.forEach(p => paths.add(p));
        counts.set(key, ps.size);
      }
    }
    return { duplicateValuePaths: paths, duplicateCounts: counts };
  }, [collectionId, debouncedTokens]);

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

  const parsedSearchQuery = useMemo(() => parseStructuredQuery(searchQuery), [searchQuery]);
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
        .filter(
          (def) =>
            !crossCollectionSearch || def.qualifier !== 'has:unused',
        )
        .filter(def => def.qualifier.slice(4).startsWith(partialValue));
      return matches.map(def => ({
        id: def.qualifier,
        label: def.qualifier,
        desc: def.desc,
        replacement: def.qualifier,
        kind: 'replacement' as const,
      }));
    }

    return [{
      id: `${qualifierDef.key}-hint`,
      label: activeToken,
      desc: qualifierDef.valueHint ?? qualifierDef.desc,
      kind: 'hint' as const,
    }];
  }, [activeQueryToken.token, crossCollectionSearch, qualifierTypeOptions]);

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

  const addQueryQualifierValue = useCallback((
    qualifier: 'type' | 'has' | 'value' | 'desc' | 'path' | 'name' | 'group' | 'scope',
    value: string,
  ) => {
    const normalizedValue = value.trim().toLowerCase();
    if (!normalizedValue) return;
    const currentValues = getQueryQualifierValues(searchQuery, qualifier);
    if (currentValues.includes(normalizedValue)) return;
    setSearchQuery(setQueryQualifierValues(searchQuery, qualifier, [...currentValues, normalizedValue]));
  }, [searchQuery, setSearchQuery]);

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
    for (const value of parsedSearchQuery.types) {
      chips.push({
        token: `type:${value}`,
        label: getTokenTypeLabel(value),
      });
    }
    for (const value of selectedHasQualifiers) {
      chips.push({
        token: `has:${value}`,
        label: getHasFilterLabel(value),
      });
    }
    for (const value of parsedSearchQuery.values) {
      chips.push({ token: `value:${value}`, label: `Value: ${value}` });
    }
    for (const value of parsedSearchQuery.descs) {
      chips.push({ token: `desc:${value}`, label: `Description: ${value}` });
    }
    for (const value of parsedSearchQuery.paths) {
      chips.push({ token: `path:${value}`, label: `Path: ${value}` });
    }
    for (const value of parsedSearchQuery.names) {
      chips.push({ token: `name:${value}`, label: `Name: ${value}` });
    }
    for (const value of parsedSearchQuery.scopes) {
      chips.push({
        token: `scope:${value}`,
        label: `Can apply to ${value}`,
      });
    }
    return chips;
  }, [parsedSearchQuery, selectedHasQualifiers]);

  const searchTooltip = 'Search names, paths, descriptions, and visible mode values. Use Filters to narrow results.';

  // displayedTokens: derived from search/filter state and component-level state
  const displayedTokens = useMemo(() => {
    // Apply zoom: if a zoom root is set, extract that subtree's children
    let baseTokens = sortedTokens;
    if (zoomRootPath) {
      const zoomNode = findGroupByPath(sortedTokens, zoomRootPath);
      baseTokens = zoomNode?.children ?? [];
    }
    let result = filtersActive ? filterTokenNodes(baseTokens, collectionId, searchQuery, typeFilter, refFilter, duplicateValuePaths, unusedTokenPaths) : baseTokens;
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
  }, [sortedTokens, zoomRootPath, collectionId, searchQuery, typeFilter, refFilter, filtersActive, showDuplicates, duplicateValuePaths, showIssuesOnly, lintPaths, inspectMode, boundTokenPaths, showRecentlyTouched, recentlyTouchedPaths, showStarredOnly, starredPaths, unusedTokenPaths]);

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
    typeFilter,
    refFilter,
    showDuplicates,
    crossCollectionSearch,
    hasCrossCollectionCriteria,
    setCrossCollectionSearch,
    showQualifierHints,
    setShowQualifierHints,
    hintIndex,
    setHintIndex,
    crossCollectionLoading,
    crossCollectionError,
    crossCollectionResults,
    crossCollectionTotal,
    setCrossCollectionOffset,
    // Refs
    searchRef,
    qualifierHintsRef,
    CROSS_COLLECTION_PAGE_SIZE,
    // Callbacks
    setSearchQuery,
    setTypeFilter,
    setRefFilter,
    setShowDuplicates,
    addQueryQualifierValue,
    removeQueryToken,
    retryCrossCollectionSearch,
    // Computed
    filtersActive,
    activeFilterCount,
    duplicateCounts,
    availableTypes,
    qualifierHints,
    activeQueryToken,
    structuredFilterChips,
    searchHighlight,
    searchTooltip,
    displayedTokens,
    displayedLeafNodes,
    displayedGroupPaths,
    displayedLeafNodesWithAncestors,
  };
}
