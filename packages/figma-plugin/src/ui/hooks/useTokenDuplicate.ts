import { useCallback } from 'react';
import type { TokenMapEntry } from '../../shared/types';
import { ApiError } from '../shared/apiFetch';
import {
  createToken,
  createTokenCloneBody,
  getNextTokenCopyPath,
} from '../shared/tokenMutations';

export interface UseTokenDuplicateParams {
  connected: boolean;
  serverUrl: string;
  collectionId: string;
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
  collectionId,
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
    const newPath = getNextTokenCopyPath(path, allTokensFlat);
    onSetOperationLoading('Creating copy…');
    try {
      await createToken(
        serverUrl,
        collectionId,
        newPath,
        createTokenCloneBody(token),
      );
      onRefresh();
      onRecordTouch(newPath);
      onNewPath(newPath);
    } catch (err) {
      onError?.(err instanceof ApiError ? err.message : "Couldn't create copy: network error");
    } finally {
      onSetOperationLoading(null);
    }
  }, [connected, serverUrl, collectionId, allTokensFlat, onRefresh, onRecordTouch, onSetOperationLoading, onNewPath, onError]);

  return { handleDuplicateToken };
}
