import { useState, useEffect } from 'react';
import { apiFetch } from '../shared/apiFetch';
import { tokenPathToUrlSegment, isAbortError } from '../shared/utils';

interface UseTokenDependentsParams {
  serverUrl: string;
  setName: string;
  tokenPath: string;
  isCreateMode: boolean;
}

export function useTokenDependents({
  serverUrl,
  setName,
  tokenPath,
  isCreateMode,
}: UseTokenDependentsParams) {
  const [dependents, setDependents] = useState<Array<{ path: string; setName: string }>>([]);
  const [dependentsLoading, setDependentsLoading] = useState(false);

  const encodedTokenPath = tokenPathToUrlSegment(tokenPath);

  useEffect(() => {
    if (isCreateMode) return;
    const controller = new AbortController();
    const fetchDependents = async () => {
      setDependentsLoading(true);
      try {
        const data = await apiFetch<{ dependents?: Array<{ path: string; setName: string }> }>(
          `${serverUrl}/api/tokens/${encodeURIComponent(setName)}/dependents/${encodedTokenPath}`,
          { signal: controller.signal }
        );
        setDependents(data.dependents ?? []);
      } catch (err) {
        if (isAbortError(err)) return;
        console.warn('[TokenEditor] failed to fetch dependents:', err);
      } finally {
        setDependentsLoading(false);
      }
    };
    fetchDependents();
    return () => controller.abort();
  }, [serverUrl, setName, tokenPath, isCreateMode, encodedTokenPath]);

  return { dependents, dependentsLoading };
}
