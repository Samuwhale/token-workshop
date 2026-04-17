import { useState, useEffect } from 'react';
import { apiFetch } from '../shared/apiFetch';
import { tokenPathToUrlSegment, isAbortError } from '../shared/utils';

interface UseTokenDependentsParams {
  serverUrl: string;
  collectionId: string;
  tokenPath: string;
  isCreateMode: boolean;
}

export function useTokenDependents({
  serverUrl,
  collectionId,
  tokenPath,
  isCreateMode,
}: UseTokenDependentsParams) {
  const [dependents, setDependents] = useState<Array<{ path: string; collectionId: string }>>([]);
  const [dependentsLoading, setDependentsLoading] = useState(false);

  const encodedTokenPath = tokenPathToUrlSegment(tokenPath);

  useEffect(() => {
    if (isCreateMode) return;
    const controller = new AbortController();
    const fetchDependents = async () => {
      setDependentsLoading(true);
      try {
        const data = await apiFetch<{ dependents?: Array<{ path: string; collectionId: string }> }>(
          `${serverUrl}/api/tokens/${encodeURIComponent(collectionId)}/dependents/${encodedTokenPath}`,
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
  }, [serverUrl, collectionId, tokenPath, isCreateMode, encodedTokenPath]);

  return { dependents, dependentsLoading };
}
