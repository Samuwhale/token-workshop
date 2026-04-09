/**
 * EditorContext — owns token editing state (editingToken, previewingToken) and
 * the token-navigation state (highlightedToken, createFromEmpty, alias
 * navigation history). Extracted from App.tsx so PanelRouter and other
 * consumers can access this state without receiving it as props.
 *
 * The alias-not-found handler is late-bound via setAliasNotFoundHandler so
 * App.tsx can wire in its toast callback after useToastStack initialises.
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { ReactNode, Dispatch, SetStateAction } from 'react';
import type { CompareMode } from '../components/UnifiedComparePanel';
import { useTokenSetsContext, useTokenFlatMapContext } from './TokenDataContext';
import { useCompareState } from '../hooks/useCompareState';
import { useTokenNavigation } from '../hooks/useTokenNavigation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EditingToken = {
  path: string;
  name?: string;
  set: string;
  isCreate?: boolean;
  initialType?: string;
  initialValue?: string;
};

export type PreviewingToken = { path: string; name?: string; set: string };
export type EditingGenerator = { id: string };
export type TokensContextualSurface = 'compare' | 'token-editor' | 'generator-editor' | 'token-preview';

export interface EditorContextValue {
  editingToken: EditingToken | null;
  setEditingToken: Dispatch<SetStateAction<EditingToken | null>>;
  editingGenerator: EditingGenerator | null;
  setEditingGenerator: Dispatch<SetStateAction<EditingGenerator | null>>;
  previewingToken: PreviewingToken | null;
  setPreviewingToken: Dispatch<SetStateAction<PreviewingToken | null>>;
  highlightedToken: string | null;
  setHighlightedToken: (path: string | null) => void;
  createFromEmpty: boolean;
  setCreateFromEmpty: (v: boolean) => void;
  setPendingHighlight: Dispatch<SetStateAction<string | null>>;
  setPendingHighlightForSet: (path: string, targetSet: string) => void;
  handleNavigateToAlias: (path: string, fromPath?: string) => void;
  handleNavigateBack: () => void;
  navHistoryLength: number;
  showTokensCompare: boolean;
  setShowTokensCompare: Dispatch<SetStateAction<boolean>>;
  tokensCompareMode: CompareMode;
  setTokensCompareMode: Dispatch<SetStateAction<CompareMode>>;
  tokensComparePaths: Set<string>;
  setTokensComparePaths: Dispatch<SetStateAction<Set<string>>>;
  tokensComparePath: string;
  setTokensComparePath: Dispatch<SetStateAction<string>>;
  tokensCompareThemeKey: number;
  setTokensCompareThemeKey: Dispatch<SetStateAction<number>>;
  tokensCompareDefaultA: string;
  tokensCompareDefaultB: string;
  activeTokensContextualSurface: TokensContextualSurface | null;
  /**
   * Wire in the alias-not-found toast handler after the provider mounts.
   * App.tsx calls this once inside a useEffect after useToastStack is ready.
   */
  setAliasNotFoundHandler: (fn: (aliasPath: string) => void) => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const EditorContext = createContext<EditorContextValue | null>(null);

export function useEditorContext(): EditorContextValue {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error('useEditorContext must be used inside EditorProvider');
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function EditorProvider({ children }: { children: ReactNode }) {
  const { activeSet, setActiveSet, tokens } = useTokenSetsContext();
  const { pathToSet } = useTokenFlatMapContext();

  const [editingToken, setEditingToken] = useState<EditingToken | null>(null);
  const [editingGenerator, setEditingGenerator] = useState<EditingGenerator | null>(null);
  const [previewingToken, setPreviewingToken] = useState<PreviewingToken | null>(null);
  const [showTokensCompare, setShowTokensCompare] = useState(false);
  const {
    compareMode: tokensCompareMode,
    setCompareMode: setTokensCompareMode,
    compareTokenPaths: tokensComparePaths,
    setCompareTokenPaths: setTokensComparePaths,
    compareTokenPath: tokensComparePath,
    setCompareTokenPath: setTokensComparePath,
    compareThemeKey: tokensCompareThemeKey,
    setCompareThemeKey: setTokensCompareThemeKey,
    compareThemeDefaultA: tokensCompareDefaultA,
    compareThemeDefaultB: tokensCompareDefaultB,
  } = useCompareState();

  // Late-bound alias-not-found handler so App.tsx can inject the toast callback
  // without creating a circular context dependency.
  const onAliasNotFoundRef = useRef<(path: string) => void>(() => {});
  const setAliasNotFoundHandler = useCallback((fn: (aliasPath: string) => void) => {
    onAliasNotFoundRef.current = fn;
  }, []);
  const handleAliasNotFound = useCallback((path: string) => {
    onAliasNotFoundRef.current(path);
  }, []);

  const {
    highlightedToken,
    setHighlightedToken,
    setPendingHighlight,
    setPendingHighlightForSet,
    createFromEmpty,
    setCreateFromEmpty,
    handleNavigateToAlias,
    handleNavigateBack,
    navHistory,
  } = useTokenNavigation(pathToSet, activeSet, setActiveSet, tokens, handleAliasNotFound);

  useEffect(() => {
    if (!showTokensCompare) return;
    if (editingToken || editingGenerator || previewingToken) {
      setShowTokensCompare(false);
    }
  }, [showTokensCompare, editingToken, editingGenerator, previewingToken]);

  const activeTokensContextualSurface = useMemo<TokensContextualSurface | null>(() => {
    if (editingToken) return 'token-editor';
    if (editingGenerator) return 'generator-editor';
    if (previewingToken) return 'token-preview';
    if (showTokensCompare) return 'compare';
    return null;
  }, [editingToken, editingGenerator, previewingToken, showTokensCompare]);

  const value = useMemo<EditorContextValue>(() => ({
    editingToken,
    setEditingToken,
    editingGenerator,
    setEditingGenerator,
    previewingToken,
    setPreviewingToken,
    highlightedToken,
    setHighlightedToken,
    createFromEmpty,
    setCreateFromEmpty,
    setPendingHighlight,
    setPendingHighlightForSet,
    handleNavigateToAlias,
    handleNavigateBack,
    navHistoryLength: navHistory.length,
    showTokensCompare,
    setShowTokensCompare,
    tokensCompareMode,
    setTokensCompareMode,
    tokensComparePaths,
    setTokensComparePaths,
    tokensComparePath,
    setTokensComparePath,
    tokensCompareThemeKey,
    setTokensCompareThemeKey,
    tokensCompareDefaultA,
    tokensCompareDefaultB,
    activeTokensContextualSurface,
    setAliasNotFoundHandler,
  }), [
    editingToken,
    editingGenerator,
    previewingToken,
    highlightedToken,
    createFromEmpty,
    setCreateFromEmpty,
    setHighlightedToken,
    setPendingHighlight,
    setPendingHighlightForSet,
    handleNavigateToAlias,
    handleNavigateBack,
    navHistory.length,
    showTokensCompare,
    setShowTokensCompare,
    tokensCompareMode,
    setTokensCompareMode,
    tokensComparePaths,
    setTokensComparePaths,
    tokensComparePath,
    setTokensComparePath,
    tokensCompareThemeKey,
    setTokensCompareThemeKey,
    tokensCompareDefaultA,
    tokensCompareDefaultB,
    activeTokensContextualSurface,
    setAliasNotFoundHandler,
  ]);

  return (
    <EditorContext.Provider value={value}>
      {children}
    </EditorContext.Provider>
  );
}
