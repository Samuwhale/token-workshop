import { useState, useCallback, useRef, useEffect } from 'react';
import type { ThemeDimension } from '@tokenmanager/core';
import { apiFetch, createFetchSignal } from '../shared/apiFetch';
import { getErrorMessage } from '../shared/utils';
import type { UndoSlot } from './useUndo';
import { useThemeDimensionsCrud } from './useThemeDimensionsCrud';
import type { UseThemeDimensionsCrudReturn } from './useThemeDimensionsCrud';

export interface UseThemeDimensionsParams {
  serverUrl: string;
  connected: boolean;
  setError: (message: string | null) => void;
  onPushUndo?: (slot: UndoSlot) => void;
  onSuccess?: (msg: string) => void;
}

export interface UseThemeDimensionsReturn extends UseThemeDimensionsCrudReturn {
  dimensions: ThemeDimension[];
  setDimensions: React.Dispatch<React.SetStateAction<ThemeDimension[]>>;
  loading: boolean;
  fetchDimensions: () => Promise<void>;
  debouncedFetchDimensions: () => void;
}

export function useThemeDimensions({
  serverUrl,
  connected,
  setError,
  onPushUndo,
  onSuccess,
}: UseThemeDimensionsParams): UseThemeDimensionsReturn {
  const [dimensions, setDimensions] = useState<ThemeDimension[]>([]);
  const [loading, setLoading] = useState(true);

  const debounceFetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);

  const fetchDimensions = useCallback(async () => {
    if (!connected) {
      fetchAbortRef.current?.abort();
      fetchAbortRef.current = null;
      setDimensions([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    const signal = createFetchSignal(controller.signal);
    try {
      const data = await apiFetch<{ dimensions?: ThemeDimension[] }>(
        `${serverUrl}/api/themes`,
        { signal },
      );
      if (fetchAbortRef.current !== controller) return;
      const allDimensions: ThemeDimension[] = data.dimensions || [];
      setDimensions(allDimensions);
    } catch (err) {
      if (fetchAbortRef.current !== controller) return;
      setError(getErrorMessage(err, 'Failed to load themes'));
    } finally {
      if (fetchAbortRef.current === controller) {
        fetchAbortRef.current = null;
        setLoading(false);
      }
    }
  }, [connected, serverUrl, setError]);

  const debouncedFetchDimensions = useCallback(() => {
    if (debounceFetchTimer.current) clearTimeout(debounceFetchTimer.current);
    debounceFetchTimer.current = setTimeout(() => {
      debounceFetchTimer.current = null;
      void fetchDimensions();
    }, 600);
  }, [fetchDimensions]);

  useEffect(() => {
    void fetchDimensions();
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
    fetchDimensions,
    debouncedFetchDimensions,
  };
}
