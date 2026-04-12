import { useState, useCallback, useRef, useEffect } from 'react';
import type { ThemeCoverageSetTokens, ThemeDimension } from '@tokenmanager/core';
import { buildThemeCoverage, flattenTokenGroup } from '@tokenmanager/core';
import { apiFetch } from '../shared/apiFetch';
import { getErrorMessage } from '../shared/utils';
import type { CoverageMap, MissingOverridesMap } from '../components/themeManagerTypes';
import type { UndoSlot } from './useUndo';
import { useThemeDimensionsCrud } from './useThemeDimensionsCrud';
import type { UseThemeDimensionsCrudReturn } from './useThemeDimensionsCrud';

export interface UseThemeDimensionsParams {
  serverUrl: string;
  connected: boolean;
  sets: string[];
  onPushUndo?: (slot: UndoSlot) => void;
  onSuccess?: (msg: string) => void;
}

export interface UseThemeDimensionsReturn extends UseThemeDimensionsCrudReturn {
  // Core data
  dimensions: ThemeDimension[];
  setDimensions: React.Dispatch<React.SetStateAction<ThemeDimension[]>>;
  loading: boolean;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  fetchWarnings: string | null;
  /** Dismiss the fetch-warnings banner. */
  clearFetchWarnings: () => void;
  // Coverage data (computed during fetch)
  coverage: CoverageMap;
  missingOverrides: MissingOverridesMap;
  // Derived UI state
  optionSetOrders: Record<string, Record<string, string[]>>;
  setOptionSetOrders: React.Dispatch<React.SetStateAction<Record<string, Record<string, string[]>>>>;
  selectedOptions: Record<string, string>;
  setSelectedOptions: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setTokenValues: Record<string, Record<string, any>>;
  setTokenTypesRef: React.MutableRefObject<Record<string, Record<string, string>>>;
  // Fetch
  fetchDimensions: () => Promise<void>;
  debouncedFetchDimensions: () => void;
}

export function useThemeDimensions({
  serverUrl,
  connected,
  sets,
  onPushUndo,
  onSuccess,
}: UseThemeDimensionsParams): UseThemeDimensionsReturn {
  const [dimensions, setDimensions] = useState<ThemeDimension[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchWarnings, setFetchWarnings] = useState<string | null>(null);
  const [coverage, setCoverage] = useState<CoverageMap>({});
  const [missingOverrides, setMissingOverrides] = useState<MissingOverridesMap>({});
  const [optionSetOrders, setOptionSetOrders] = useState<Record<string, Record<string, string[]>>>({});
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [setTokenValues, setSetTokenValues] = useState<Record<string, Record<string, any>>>({});
  const setTokenTypesRef = useRef<Record<string, Record<string, string>>>({});

  const debounceFetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);

  const clearFetchWarnings = useCallback(() => setFetchWarnings(null), []);

  // --- Fetch: dimensions + token values + coverage computation ---
  // Coverage computation lives here (not in useThemeDimensionsCrud) to keep CRUD concerns separate.

  const fetchDimensions = useCallback(async () => {
    if (!connected) { setLoading(false); return; }
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    try {
      const data = await apiFetch<{ dimensions?: ThemeDimension[] }>(
        `${serverUrl}/api/themes`,
        { signal: controller.signal },
      );
      const allDimensions: ThemeDimension[] = data.dimensions || [];
      setDimensions(allDimensions);

      setOptionSetOrders(prev => {
        const next = { ...prev };
        for (const dim of allDimensions) {
          if (!next[dim.id]) next[dim.id] = {};
          for (const opt of dim.options) {
            if (!next[dim.id][opt.name]) {
              const optSetKeys = Object.keys(opt.sets).filter(s => sets.includes(s));
              const rest = sets.filter(s => !optSetKeys.includes(s));
              next[dim.id][opt.name] = [...optSetKeys, ...rest];
            }
          }
        }
        return next;
      });

      setSelectedOptions(prev => {
        const next = { ...prev };
        for (const dim of allDimensions) {
          if (!next[dim.id] && dim.options.length > 0) next[dim.id] = dim.options[0].name;
          if (next[dim.id] && !dim.options.some(o => o.name === next[dim.id])) {
            next[dim.id] = dim.options[0]?.name || '';
          }
        }
        return next;
      });

      // Fetch token values per set (needed for coverage and live preview)
      const tokenValues: Record<string, Record<string, any>> = {};
      const tokenTypes: Record<string, Record<string, string>> = {};
      const flattenedSetTokens: Record<string, ThemeCoverageSetTokens> = {};
      const failedSets: string[] = [];
      await Promise.all(sets.map(async (s) => {
        try {
          const d = await apiFetch<{ tokens?: Record<string, any> }>(
            `${serverUrl}/api/tokens/${encodeURIComponent(s)}`,
            { signal: controller.signal },
          );
          const map: Record<string, any> = {};
          const typeMap: Record<string, string> = {};
          for (const [path, token] of flattenTokenGroup(d.tokens || {})) {
            map[path] = token.$value;
            if (token.$type) typeMap[path] = token.$type;
          }
          tokenValues[s] = map;
          tokenTypes[s] = typeMap;
          flattenedSetTokens[s] = { values: map, types: typeMap };
        } catch (err) {
          console.warn('[ThemeManager] failed to fetch token set:', s, err);
          failedSets.push(s);
        }
      }));
      setSetTokenValues(tokenValues);
      setTokenTypesRef.current = tokenTypes;
      if (failedSets.length > 0) {
        setFetchWarnings(
          `Could not load ${failedSets.length === 1 ? `set "${failedSets[0]}"` : `${failedSets.length} sets (${failedSets.join(', ')})`} — coverage data may be incomplete`,
        );
      } else {
        setFetchWarnings(null);
      }

      const coverageResult = buildThemeCoverage({
        dimensions: allDimensions,
        setTokens: flattenedSetTokens,
        fillSearchOrder: sets,
      });
      setCoverage(coverageResult.coverage);
      setMissingOverrides(coverageResult.missingOverrides);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(getErrorMessage(err));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [serverUrl, connected, sets]);

  const debouncedFetchDimensions = useCallback(() => {
    if (debounceFetchTimer.current) clearTimeout(debounceFetchTimer.current);
    debounceFetchTimer.current = setTimeout(() => {
      debounceFetchTimer.current = null;
      fetchDimensions();
    }, 600);
  }, [fetchDimensions]);

  useEffect(() => () => {
    if (debounceFetchTimer.current) clearTimeout(debounceFetchTimer.current);
    fetchAbortRef.current?.abort();
  }, []);

  // CRUD operations: create/rename/delete/duplicate with encapsulated form state
  const crud = useThemeDimensionsCrud({
    serverUrl,
    connected,
    dimensions,
    setDimensions,
    fetchDimensions,
    debouncedFetchDimensions,
    setError,
    onPushUndo,
    onSuccess,
  });

  return {
    ...crud,
    dimensions,
    setDimensions,
    loading,
    error,
    setError,
    fetchWarnings,
    clearFetchWarnings,
    coverage,
    missingOverrides,
    optionSetOrders,
    setOptionSetOrders,
    selectedOptions,
    setSelectedOptions,
    setTokenValues,
    setTokenTypesRef,
    fetchDimensions,
    debouncedFetchDimensions,
  };
}
