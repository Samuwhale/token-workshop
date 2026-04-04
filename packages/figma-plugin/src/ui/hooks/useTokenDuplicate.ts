import { useCallback } from 'react';
import type { TokenNode } from './useTokens';
import type { TokenMapEntry } from '../../shared/types';
import { apiFetch, ApiError } from '../shared/apiFetch';
import { tokenPathToUrlSegment } from '../shared/utils';
import { findLeafByPath } from '../components/tokenListUtils';

export interface UseTokenDuplicateParams {
  connected: boolean;
  serverUrl: string;
  setName: string;
  tokens: TokenNode[];
  allTokensFlat: Record<string, TokenMapEntry>;
  onRefresh: () => void;
  onRecordTouch: (path: string) => void;
  onSetOperationLoading: (msg: string | null) => void;
  onNewPath: (path: string) => void;
  onError?: (msg: string) => void;
}

export function useTokenDuplicate({
  connected,
  serverUrl,
  setName,
  tokens,
  allTokensFlat,
  onRefresh,
  onRecordTouch,
  onSetOperationLoading,
  onNewPath,
  onError,
}: UseTokenDuplicateParams) {
  const handleDuplicateToken = useCallback(async (path: string) => {
    if (!connected) return;
    const token = allTokensFlat[path];
    if (!token) return;
    // Use the full TokenNode to access $description and $extensions (not in TokenMapEntry).
    const tokenNode = findLeafByPath(tokens, path);
    const baseCopy = `${path}-copy`;
    let newPath = baseCopy;
    let i = 2;
    while (allTokensFlat[newPath]) {
      newPath = `${baseCopy}-${i++}`;
    }
    onSetOperationLoading('Duplicating token…');
    try {
      const body: Record<string, unknown> = { $type: token.$type, $value: token.$value };
      if (tokenNode?.$description) body.$description = tokenNode.$description;
      if (tokenNode?.$extensions) body.$extensions = tokenNode.$extensions;
      await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/${tokenPathToUrlSegment(newPath)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      onRefresh();
      onRecordTouch(newPath);
      onNewPath(newPath);
    } catch (err) {
      onError?.(err instanceof ApiError ? err.message : 'Duplicate failed: network error');
    } finally {
      onSetOperationLoading(null);
    }
  }, [connected, serverUrl, setName, allTokensFlat, tokens, onRefresh, onRecordTouch, onSetOperationLoading, onNewPath, onError]);

  return { handleDuplicateToken };
}
