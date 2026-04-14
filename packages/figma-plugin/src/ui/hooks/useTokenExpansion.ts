import { useState, useCallback, useEffect, useRef } from 'react';
import type { TokenNode } from './useTokens';
import { collectGroupPathsByDepth, collectAllGroupPaths } from '../components/tokenListUtils';
import { lsGetJson, lsSetJson } from '../shared/storage';

export interface UseTokenExpansionParams {
  setName: string;
  tokens: TokenNode[];
  highlightedToken?: string | null;
  onClearHighlight?: () => void;
}

export function useTokenExpansion({
  setName,
  tokens,
  highlightedToken,
  onClearHighlight,
}: UseTokenExpansionParams) {
  const setNameRef = useRef(setName);
  setNameRef.current = setName;
  const initializedForSet = useRef<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [expandedChains, setExpandedChains] = useState<Set<string>>(new Set());

  // Initialize from localStorage on set change
  useEffect(() => {
    if (tokens.length === 0) {
      initializedForSet.current = null;
      setExpandedPaths(new Set());
      return;
    }
    if (initializedForSet.current === setName) return;
    initializedForSet.current = setName;
    const fallback = collectGroupPathsByDepth(tokens, 2);
    const stored = lsGetJson<string[]>(`token-expand:${setName}`, fallback);
    setExpandedPaths(new Set(stored));
  }, [setName, tokens]);

  // Persist to localStorage
  useEffect(() => {
    if (initializedForSet.current !== setNameRef.current) return;
    lsSetJson(`token-expand:${setNameRef.current}`, [...expandedPaths]);
  }, [expandedPaths]);

  // Expand ancestors when highlightedToken changes
  useEffect(() => {
    if (!highlightedToken) return;
    const parts = highlightedToken.split('.');
    const toExpand: string[] = [];
    for (let i = 1; i < parts.length; i++) {
      toExpand.push(parts.slice(0, i).join('.'));
    }
    // Also expand the target path itself — this is a no-op for leaf tokens
    // but expands groups so their children are visible when navigated to
    toExpand.push(highlightedToken);
    setExpandedPaths(prev => {
      const next = new Set(prev);
      toExpand.forEach(a => next.add(a));
      return next;
    });
    const timer = setTimeout(() => onClearHighlight?.(), 3000);
    return () => clearTimeout(timer);
  }, [highlightedToken, onClearHighlight]);

  const handleToggleExpand = useCallback((path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const handleExpandAll = useCallback(() => {
    setExpandedPaths(new Set(collectAllGroupPaths(tokens)));
  }, [tokens]);

  const handleCollapseAll = useCallback(() => {
    setExpandedPaths(new Set());
  }, []);

  const handleToggleChain = useCallback((path: string) => {
    setExpandedChains(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  }, []);

  return {
    initializedForSet,
    setNameRef,
    expandedPaths,
    setExpandedPaths,
    expandedChains,
    setExpandedChains,
    handleToggleExpand,
    handleExpandAll,
    handleCollapseAll,
    handleToggleChain,
  };
}
