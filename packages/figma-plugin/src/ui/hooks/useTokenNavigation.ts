import { useState, useCallback, useEffect } from 'react';
import type { TokenNode } from './useTokens';
import {
  resolveCollectionIdForPath,
  type CollectionPathResolutionReason,
} from '../shared/collectionPathLookup';

interface NavHistoryEntry {
  path: string | null;
  collectionId: string;
}

export function useTokenNavigation(
  pathToCollectionId: Record<string, string>,
  collectionIdsByPath: Record<string, string[]>,
  currentCollectionId: string,
  setCurrentCollectionId: (collectionId: string) => void,
  tokens: TokenNode[],
  onAliasNotFound?: (
    aliasPath: string,
    reason: CollectionPathResolutionReason,
  ) => void,
) {
  const [highlightedToken, setHighlightedToken] = useState<string | null>(null);
  const [pendingHighlight, setPendingHighlight] = useState<string | null>(null);
  // Explicit target collection for cross-collection navigation where pathToCollectionId
  // may map the path to a different collection (pathToCollectionId uses
  // "first collection wins", so shared paths in non-first collections would
  // never match otherwise).
  const [pendingHighlightCollectionId, setPendingHighlightCollectionId] = useState<string | null>(null);
  const [createFromEmpty, setCreateFromEmpty] = useState(false);
  const [navHistory, setNavHistory] = useState<NavHistoryEntry[]>([]);

  const navigateToAliasTarget = useCallback(
    (aliasPath: string) => {
      const resolution = resolveCollectionIdForPath({
        path: aliasPath,
        pathToCollectionId,
        collectionIdsByPath,
      });
      const targetCollectionId = resolution.collectionId;
      if (!targetCollectionId) {
        onAliasNotFound?.(aliasPath, resolution.reason);
        return;
      }

      if (targetCollectionId === currentCollectionId) {
        setHighlightedToken(aliasPath);
        return;
      }

      setPendingHighlight(aliasPath);
      setPendingHighlightCollectionId(targetCollectionId);
      setCurrentCollectionId(targetCollectionId);
    },
    [
      collectionIdsByPath,
      currentCollectionId,
      onAliasNotFound,
      pathToCollectionId,
      setCurrentCollectionId,
    ],
  );

  // Reset createFromEmpty when switching collections
  useEffect(() => {
    setCreateFromEmpty(false);
  }, [currentCollectionId, setCreateFromEmpty]);

  // Apply pending highlight after switching collections
  useEffect(() => {
    const targetCollectionId = pendingHighlightCollectionId ?? (
      pendingHighlight
        ? resolveCollectionIdForPath({
            path: pendingHighlight,
            pathToCollectionId,
            collectionIdsByPath,
          }).collectionId
        : undefined
    );
    if (pendingHighlight && targetCollectionId === currentCollectionId) {
      setHighlightedToken(pendingHighlight);
      setPendingHighlight(null);
      setPendingHighlightCollectionId(null);
    }
  }, [
    collectionIdsByPath,
    currentCollectionId,
    pathToCollectionId,
    pendingHighlight,
    pendingHighlightCollectionId,
    tokens,
  ]);

  const handleNavigateToAlias = useCallback((aliasPath: string, fromPath?: string) => {
    // Push current position to history before navigating
    setNavHistory(prev => [...prev, { path: fromPath ?? null, collectionId: currentCollectionId }]);
    navigateToAliasTarget(aliasPath);
  }, [currentCollectionId, navigateToAliasTarget]);

  const handleNavigateToAliasWithoutHistory = useCallback((aliasPath: string) => {
    navigateToAliasTarget(aliasPath);
  }, [navigateToAliasTarget]);

  const handleNavigateBack = useCallback(() => {
    if (navHistory.length === 0) return;
    const entry = navHistory[navHistory.length - 1];
    setNavHistory(prev => prev.slice(0, -1));

    if (entry.collectionId !== currentCollectionId) {
      // Cross-collection back navigation: switch collection and highlight the source token
      if (entry.path) {
        setPendingHighlight(entry.path);
        setPendingHighlightCollectionId(entry.collectionId);
      }
      setCurrentCollectionId(entry.collectionId);
    } else {
      setHighlightedToken(entry.path);
    }
  }, [navHistory, currentCollectionId, setCurrentCollectionId]);

  // Use this when navigating to a token in a specific collection, rather than
  // deriving the target collection from pathToCollectionId.
  const setPendingHighlightForCollection = useCallback((path: string, targetCollectionId: string) => {
    setPendingHighlight(path);
    setPendingHighlightCollectionId(targetCollectionId);
  }, []);

  return {
    highlightedToken,
    setHighlightedToken,
    pendingHighlight,
    setPendingHighlight,
    setPendingHighlightForCollection,
    createFromEmpty,
    setCreateFromEmpty,
    handleNavigateToAlias,
    handleNavigateToAliasWithoutHistory,
    handleNavigateBack,
    navHistory,
  };
}
