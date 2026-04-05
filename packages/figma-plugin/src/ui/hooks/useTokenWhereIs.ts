import { useState, useCallback, useRef } from 'react';
import { apiFetch } from '../shared/apiFetch';
import { isAbortError } from '../shared/utils';

export interface WhereIsResult {
  setName: string;
  $type: string;
  $value: unknown;
  $description?: string;
  isAlias: boolean;
  isDifferentFromFirst: boolean;
}

export interface UseTokenWhereIsParams {
  serverUrl: string;
}

export function useTokenWhereIs({ serverUrl }: UseTokenWhereIsParams) {
  const [whereIsPath, setWhereIsPath] = useState<string | null>(null);
  const [whereIsResults, setWhereIsResults] = useState<WhereIsResult[] | null>(null);
  const [whereIsLoading, setWhereIsLoading] = useState(false);
  const whereIsAbortRef = useRef<AbortController | null>(null);

  const handleFindInAllSets = useCallback((path: string) => {
    whereIsAbortRef.current?.abort();
    setWhereIsPath(path);
    setWhereIsResults(null);
    setWhereIsLoading(true);
    const ctrl = new AbortController();
    whereIsAbortRef.current = ctrl;
    apiFetch<{ path: string; definitions: WhereIsResult[] }>(
      `${serverUrl}/api/tokens/where?path=${encodeURIComponent(path)}`,
      { signal: ctrl.signal },
    ).then(data => {
      setWhereIsResults(data.definitions);
      setWhereIsLoading(false);
    }).catch(err => {
      if (isAbortError(err)) return;
      console.error('[useTokenWhereIs] Find in all sets failed:', err);
      setWhereIsLoading(false);
      setWhereIsResults([]);
    });
  }, [serverUrl]);

  return {
    whereIsPath,
    setWhereIsPath,
    whereIsResults,
    setWhereIsResults,
    whereIsLoading,
    setWhereIsLoading,
    whereIsAbortRef,
    handleFindInAllSets,
  };
}
