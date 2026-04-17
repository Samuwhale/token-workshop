import { useState, useCallback, useMemo } from 'react';
import type { StarredToken } from '../shared/starredTokens';
import {
  getStarredTokens,
  toggleStarredToken,
  removeStarredToken,
  renameStarredToken,
  removeStarredTokensForCollection,
  renameStarredTokensForCollection,
  isTokenStarred,
} from '../shared/starredTokens';

export interface StarredTokensState {
  /** All starred tokens */
  tokens: StarredToken[];
  /** Number of starred tokens */
  count: number;
  /** Toggle star on a token; returns new starred state */
  toggleStar: (path: string, collectionId: string) => boolean;
  /** Check if a token is starred */
  isStarred: (path: string, collectionId: string) => boolean;
  /** Remove a starred token (on delete) */
  remove: (path: string, collectionId: string) => void;
  /** Rename a starred token (on rename) */
  rename: (oldPath: string, newPath: string, collectionId: string) => void;
  /** Remove all starred tokens for a deleted collection. */
  removeForCollection: (collectionId: string) => void;
  /** Update collection id for a renamed collection. */
  renameCollection: (oldName: string, newName: string) => void;
  /** Clear all starred tokens */
  clear: () => void;
}

export function useStarredTokens(): StarredTokensState {
  const [tokens, setTokens] = useState<StarredToken[]>(() => getStarredTokens());

  const toggleStar = useCallback((path: string, collectionId: string): boolean => {
    const result = toggleStarredToken(path, collectionId);
    setTokens(getStarredTokens());
    return result;
  }, []);

  const isStarred = useCallback((path: string, collectionId: string): boolean => {
    return isTokenStarred(path, collectionId);
  }, []);

  const remove = useCallback((path: string, collectionId: string) => {
    removeStarredToken(path, collectionId);
    setTokens(getStarredTokens());
  }, []);

  const rename = useCallback((oldPath: string, newPath: string, collectionId: string) => {
    renameStarredToken(oldPath, newPath, collectionId);
    setTokens(getStarredTokens());
  }, []);

  const removeForCollection = useCallback((collectionId: string) => {
    removeStarredTokensForCollection(collectionId);
    setTokens(getStarredTokens());
  }, []);

  const renameCollection = useCallback((oldName: string, newName: string) => {
    renameStarredTokensForCollection(oldName, newName);
    setTokens(getStarredTokens());
  }, []);

  const clear = useCallback(() => {
    setTokens([]);
  }, []);

  const count = useMemo(() => tokens.length, [tokens]);

  return {
    tokens,
    count,
    toggleStar,
    isStarred,
    remove,
    rename,
    removeForCollection,
    renameCollection,
    clear,
  };
}
