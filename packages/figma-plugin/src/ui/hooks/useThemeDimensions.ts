import { useState, useCallback, useRef, useEffect } from 'react';
import type { ThemeDimension } from '@tokenmanager/core';
import { apiFetch } from '../shared/apiFetch';
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
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(getErrorMessage(err));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [connected, serverUrl, setError]);

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
    fetchDimensions,
    debouncedFetchDimensions,
  };
}
