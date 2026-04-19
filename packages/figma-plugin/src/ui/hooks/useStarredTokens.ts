import { useState, useCallback } from 'react';
import type { StarredToken } from '../shared/starredTokens';
import {
  getStarredTokens,
  moveStarredToken,
  toggleStarredToken,
  removeStarredTokens,
  renameStarredToken,
  removeStarredTokensForCollection,
  renameStarredTokensForCollection,
} from '../shared/starredTokens';

export interface StarredTokensState {
  /** All starred tokens */
  tokens: StarredToken[];
  /** Toggle star on a token; returns new starred state */
  toggleStar: (path: string, collectionId: string) => boolean;
  /** Remove multiple starred tokens from one collection. */
  removeMany: (paths: string[], collectionId: string) => void;
  /** Rename a starred token (on rename) */
  rename: (oldPath: string, newPath: string, collectionId: string) => void;
  /** Move a starred token across collections without changing its star state. */
  move: (
    oldPath: string,
    newPath: string,
    oldCollectionId: string,
    newCollectionId: string,
  ) => void;
  /** Remove all starred tokens for a deleted collection. */
  removeForCollection: (collectionId: string) => void;
  /** Update collection id for a renamed collection. */
  renameCollection: (oldName: string, newName: string) => void;
}

export function useStarredTokens(): StarredTokensState {
  const [tokens, setTokens] = useState<StarredToken[]>(() => getStarredTokens());

  const toggleStar = useCallback((path: string, collectionId: string): boolean => {
    const result = toggleStarredToken(path, collectionId);
    setTokens(getStarredTokens());
    return result;
  }, []);

  const removeMany = useCallback((paths: string[], collectionId: string) => {
    removeStarredTokens(paths, collectionId);
    setTokens(getStarredTokens());
  }, []);

  const rename = useCallback((oldPath: string, newPath: string, collectionId: string) => {
    renameStarredToken(oldPath, newPath, collectionId);
    setTokens(getStarredTokens());
  }, []);

  const move = useCallback((
    oldPath: string,
    newPath: string,
    oldCollectionId: string,
    newCollectionId: string,
  ) => {
    moveStarredToken(oldPath, newPath, oldCollectionId, newCollectionId);
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

  return {
    tokens,
    toggleStar,
    removeMany,
    rename,
    move,
    removeForCollection,
    renameCollection,
  };
}
