import { useState, useCallback, useEffect } from 'react';
import type { TokenNode } from './useTokens';

export function useTokenNavigation(
  pathToSet: Record<string, string>,
  activeSet: string,
  setActiveSet: (set: string) => void,
  tokens: TokenNode[],
) {
  const [highlightedToken, setHighlightedToken] = useState<string | null>(null);
  const [pendingHighlight, setPendingHighlight] = useState<string | null>(null);
  const [createFromEmpty, setCreateFromEmpty] = useState(false);

  // Reset createFromEmpty when switching sets
  useEffect(() => {
    if (createFromEmpty) setCreateFromEmpty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSet]);

  // Apply pending highlight after switching sets
  useEffect(() => {
    if (pendingHighlight && pathToSet[pendingHighlight] === activeSet) {
      setHighlightedToken(pendingHighlight);
      setPendingHighlight(null);
    }
  }, [tokens, pendingHighlight, activeSet, pathToSet]);

  const handleNavigateToAlias = useCallback((aliasPath: string) => {
    if (pathToSet[aliasPath]) {
      const targetSet = pathToSet[aliasPath];
      if (targetSet === activeSet) {
        setHighlightedToken(aliasPath);
      } else {
        setPendingHighlight(aliasPath);
        setActiveSet(targetSet);
      }
    }
  }, [pathToSet, activeSet, setActiveSet]);

  return {
    highlightedToken,
    setHighlightedToken,
    pendingHighlight,
    setPendingHighlight,
    createFromEmpty,
    setCreateFromEmpty,
    handleNavigateToAlias,
  };
}
