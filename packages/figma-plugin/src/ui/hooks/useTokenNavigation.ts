import { useState, useCallback, useEffect } from 'react';
import type { TokenNode } from './useTokens';

interface NavHistoryEntry {
  path: string | null;
  set: string;
}

export function useTokenNavigation(
  pathToSet: Record<string, string>,
  activeSet: string,
  setActiveSet: (set: string) => void,
  tokens: TokenNode[],
  onAliasNotFound?: (aliasPath: string) => void,
) {
  const [highlightedToken, setHighlightedToken] = useState<string | null>(null);
  const [pendingHighlight, setPendingHighlight] = useState<string | null>(null);
  // Explicit target set for cross-set navigation where pathToSet may map the path to a different set
  // (pathToSet uses "first set wins", so shared paths in non-first sets would never match otherwise)
  const [pendingHighlightSet, setPendingHighlightSet] = useState<string | null>(null);
  const [createFromEmpty, setCreateFromEmpty] = useState(false);
  const [navHistory, setNavHistory] = useState<NavHistoryEntry[]>([]);

  // Reset createFromEmpty when switching sets
  useEffect(() => {
    if (createFromEmpty) setCreateFromEmpty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSet]);

  // Apply pending highlight after switching sets
  useEffect(() => {
    // Use explicit target set if available (cross-set navigation); fall back to pathToSet lookup
    const targetSet = pendingHighlightSet ?? pathToSet[pendingHighlight ?? ''];
    if (pendingHighlight && targetSet === activeSet) {
      setHighlightedToken(pendingHighlight);
      setPendingHighlight(null);
      setPendingHighlightSet(null);
    }
  }, [tokens, pendingHighlight, pendingHighlightSet, activeSet, pathToSet]);

  const handleNavigateToAlias = useCallback((aliasPath: string, fromPath?: string) => {
    // Push current position to history before navigating
    setNavHistory(prev => [...prev, { path: fromPath ?? null, set: activeSet }]);

    if (pathToSet[aliasPath]) {
      const targetSet = pathToSet[aliasPath];
      if (targetSet === activeSet) {
        setHighlightedToken(aliasPath);
      } else {
        setPendingHighlight(aliasPath);
        setActiveSet(targetSet);
      }
    } else {
      onAliasNotFound?.(aliasPath);
    }
  }, [pathToSet, activeSet, setActiveSet, onAliasNotFound]);

  const handleNavigateBack = useCallback(() => {
    if (navHistory.length === 0) return;
    const entry = navHistory[navHistory.length - 1];
    setNavHistory(prev => prev.slice(0, -1));

    if (entry.set !== activeSet) {
      // Cross-set back navigation: switch set and highlight the source token
      if (entry.path) {
        setPendingHighlight(entry.path);
        setPendingHighlightSet(entry.set);
      }
      setActiveSet(entry.set);
    } else {
      setHighlightedToken(entry.path);
    }
  }, [navHistory, activeSet, setActiveSet]);

  // Use this when navigating to a token in a specific set (not derived from pathToSet)
  const setPendingHighlightForSet = useCallback((path: string, targetSet: string) => {
    setPendingHighlight(path);
    setPendingHighlightSet(targetSet);
  }, []);

  return {
    highlightedToken,
    setHighlightedToken,
    pendingHighlight,
    setPendingHighlight,
    setPendingHighlightForSet,
    createFromEmpty,
    setCreateFromEmpty,
    handleNavigateToAlias,
    handleNavigateBack,
    navHistory,
  };
}
