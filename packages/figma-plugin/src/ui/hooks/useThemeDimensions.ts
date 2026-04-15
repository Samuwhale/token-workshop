import { useState, useCallback, useRef, useEffect } from 'react';
import type { ThemeDimension } from '@tokenmanager/core';
import { flattenTokenGroup } from '@tokenmanager/core';
import { apiFetch } from '../shared/apiFetch';
import { getErrorMessage } from '../shared/utils';
import type { UndoSlot } from './useUndo';
import { useThemeDimensionsCrud } from './useThemeDimensionsCrud';
import type { UseThemeDimensionsCrudReturn } from './useThemeDimensionsCrud';
import {
  buildThemeModeCoverage,
  type ThemeModeCoverageMap,
} from '../shared/themeModeUtils';
import type { TokenMapEntry } from '../../shared/types';

export interface UseThemeDimensionsParams {
  serverUrl: string;
  connected: boolean;
  sets: string[];
  setError: (message: string | null) => void;
  onPushUndo?: (slot: UndoSlot) => void;
  onSuccess?: (msg: string) => void;
}

export interface UseThemeDimensionsReturn extends UseThemeDimensionsCrudReturn {
  dimensions: ThemeDimension[];
  setDimensions: React.Dispatch<React.SetStateAction<ThemeDimension[]>>;
  loading: boolean;
  fetchWarnings: string | null;
  clearFetchWarnings: () => void;
  coverage: ThemeModeCoverageMap;
  fetchDimensions: () => Promise<void>;
  debouncedFetchDimensions: () => void;
}

export function useThemeDimensions({
  serverUrl,
  connected,
  sets,
  setError,
  onPushUndo,
  onSuccess,
}: UseThemeDimensionsParams): UseThemeDimensionsReturn {
  const [dimensions, setDimensions] = useState<ThemeDimension[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchWarnings, setFetchWarnings] = useState<string | null>(null);
  const [coverage, setCoverage] = useState<ThemeModeCoverageMap>({});

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
      const perSetFlat: Record<string, Record<string, TokenMapEntry>> = {};
      const failedSets: string[] = [];
      await Promise.all(sets.map(async (s) => {
        try {
          const d = await apiFetch<{ tokens?: Record<string, any> }>(
            `${serverUrl}/api/tokens/${encodeURIComponent(s)}`,
            { signal: controller.signal },
          );
          const entryMap: Record<string, TokenMapEntry> = {};
          for (const [path, token] of flattenTokenGroup(d.tokens || {})) {
            const entry = token as TokenMapEntry;
            entryMap[path] = {
              $value: entry.$value,
              $type: entry.$type ?? "unknown",
              ...(entry.$extensions ? { $extensions: entry.$extensions } : {}),
            };
          }
          perSetFlat[s] = entryMap;
        } catch (err) {
          console.warn('[ThemeManager] failed to fetch token set:', s, err);
          failedSets.push(s);
        }
      }));
      if (failedSets.length > 0) {
        setFetchWarnings(
          `Could not load ${failedSets.length === 1 ? `set "${failedSets[0]}"` : `${failedSets.length} sets (${failedSets.join(', ')})`} — coverage data may be incomplete`,
        );
      } else {
        setFetchWarnings(null);
      }

      const coverageResult = buildThemeModeCoverage({
        dimensions: allDimensions,
        perSetFlat,
      });
      setCoverage(coverageResult);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(getErrorMessage(err));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [connected, serverUrl, setError, sets]);

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
    fetchWarnings,
    clearFetchWarnings,
    coverage,
    fetchDimensions,
    debouncedFetchDimensions,
  };
}
