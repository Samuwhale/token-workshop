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
import type { TokensLibraryContextualSurface } from '../shared/navigationTypes';

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
  createPresentation?: 'launcher' | 'editor';
};

export type PreviewingToken = { path: string; name?: string; set: string };
export type EditingGenerator = { id: string };
export type EditorContextualSurfaceTarget =
  | { surface: null }
  | { surface: 'token-editor'; token: EditingToken }
  | { surface: 'generator-editor'; generator: EditingGenerator }
  | { surface: 'token-preview'; token: PreviewingToken }
  | { surface: 'compare'; mode: 'tokens'; paths: Set<string>; refreshThemeOptions?: boolean }
  | { surface: 'compare'; mode: 'cross-theme'; path: string; refreshThemeOptions?: boolean };

export interface TokensContextualSurfaceState {
  activeSurface: TokensLibraryContextualSurface | null;
  preservesLibraryBrowseContext: boolean;
}

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
  tokensContextualSurfaceState: TokensContextualSurfaceState;
  switchContextualSurface: (target: EditorContextualSurfaceTarget) => void;
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

  const switchContextualSurface = useCallback((target: EditorContextualSurfaceTarget) => {
    setEditingToken(null);
    setEditingGenerator(null);
    setPreviewingToken(null);
    setShowTokensCompare(false);

    if (target.surface === null) return;

    if (target.surface === 'token-editor') {
      setEditingToken(target.token);
      return;
    }

    if (target.surface === 'generator-editor') {
      setEditingGenerator(target.generator);
      return;
    }

    if (target.surface === 'token-preview') {
      setPreviewingToken(target.token);
      return;
    }

    if (target.mode === 'tokens') {
      setTokensCompareMode('tokens');
      setTokensComparePaths(target.paths);
      setTokensComparePath('');
    } else {
      setTokensCompareMode('cross-theme');
      setTokensComparePath(target.path);
      setTokensComparePaths(new Set());
    }

    if (target.refreshThemeOptions ?? true) {
      setTokensCompareThemeKey((themeKey) => themeKey + 1);
    }

    setShowTokensCompare(true);
  }, [
    setEditingGenerator,
    setEditingToken,
    setPreviewingToken,
    setShowTokensCompare,
    setTokensCompareMode,
    setTokensComparePath,
    setTokensComparePaths,
    setTokensCompareThemeKey,
  ]);

  const activeSurface = useMemo<TokensLibraryContextualSurface | null>(() => {
    if (editingToken) return 'token-editor';
    if (editingGenerator) return 'generator-editor';
    if (previewingToken) return 'token-preview';
    if (showTokensCompare) return 'compare';
    return null;
  }, [editingToken, editingGenerator, previewingToken, showTokensCompare]);

  const tokensContextualSurfaceState = useMemo<TokensContextualSurfaceState>(() => ({
    activeSurface,
    preservesLibraryBrowseContext: activeSurface !== null,
  }), [activeSurface]);

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
    tokensContextualSurfaceState,
    switchContextualSurface,
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
    tokensContextualSurfaceState,
    switchContextualSurface,
    setAliasNotFoundHandler,
  ]);

  return (
    <EditorContext.Provider value={value}>
      {children}
    </EditorContext.Provider>
  );
}
