import { useState, useCallback, useMemo } from 'react';
import type { StarredToken } from '../shared/starredTokens';
import {
  getStarredTokens,
  toggleStarredToken,
  removeStarredToken,
  renameStarredToken,
  removeStarredTokensForSet,
  renameStarredTokensForSet,
  isTokenStarred,
} from '../shared/starredTokens';

export interface StarredTokensState {
  /** All starred tokens */
  tokens: StarredToken[];
  /** Number of starred tokens */
  count: number;
  /** Toggle star on a token; returns new starred state */
  toggleStar: (path: string, setName: string) => boolean;
  /** Check if a token is starred */
  isStarred: (path: string, setName: string) => boolean;
  /** Remove a starred token (on delete) */
  remove: (path: string, setName: string) => void;
  /** Rename a starred token (on rename) */
  rename: (oldPath: string, newPath: string, setName: string) => void;
  /** Remove all starred tokens for a deleted set */
  removeForSet: (setName: string) => void;
  /** Update set name for a renamed set */
  renameSet: (oldName: string, newName: string) => void;
  /** Clear all starred tokens */
  clear: () => void;
}

export function useStarredTokens(): StarredTokensState {
  const [tokens, setTokens] = useState<StarredToken[]>(() => getStarredTokens());

  const toggleStar = useCallback((path: string, setName: string): boolean => {
    const result = toggleStarredToken(path, setName);
    setTokens(getStarredTokens());
    return result;
  }, []);

  const isStarred = useCallback((path: string, setName: string): boolean => {
    return isTokenStarred(path, setName);
  }, []);

  const remove = useCallback((path: string, setName: string) => {
    removeStarredToken(path, setName);
    setTokens(getStarredTokens());
  }, []);

  const rename = useCallback((oldPath: string, newPath: string, setName: string) => {
    renameStarredToken(oldPath, newPath, setName);
    setTokens(getStarredTokens());
  }, []);

  const removeForSet = useCallback((setName: string) => {
    removeStarredTokensForSet(setName);
    setTokens(getStarredTokens());
  }, []);

  const renameSet = useCallback((oldName: string, newName: string) => {
    renameStarredTokensForSet(oldName, newName);
    setTokens(getStarredTokens());
  }, []);

  const clear = useCallback(() => {
    setTokens([]);
  }, []);

  const count = useMemo(() => tokens.length, [tokens]);

  return { tokens, count, toggleStar, isStarred, remove, rename, removeForSet, renameSet, clear };
}
