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
import { useCollectionStateContext, useTokenFlatMapContext } from './TokenDataContext';
import { useCompareState } from '../hooks/useCompareState';
import { useTokenNavigation } from '../hooks/useTokenNavigation';
import type {
  TokensLibraryContextualSurface,
  TokensLibraryGeneratedGroupEditorTarget,
} from '../shared/navigationTypes';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EditingToken = {
  path: string;
  name?: string;
  currentCollectionId: string;
  isCreate?: boolean;
  initialType?: string;
  initialValue?: string;
};

export type PreviewingToken = { path: string; name?: string; currentCollectionId: string };
export type EditingGeneratedGroup = TokensLibraryGeneratedGroupEditorTarget;
export type InspectingCollection = { collectionId: string };
export type EditorContextualSurfaceTarget =
  | { surface: null }
  | { surface: "collection-details"; collection: InspectingCollection }
  | { surface: 'token-editor'; token: EditingToken }
  | { surface: 'generated-group-editor'; generatedGroup: EditingGeneratedGroup }
  | { surface: 'token-preview'; token: PreviewingToken }
  | { surface: 'compare'; mode: 'tokens'; paths: Set<string>; refreshCompareModeConfig?: boolean }
  | { surface: 'compare'; mode: 'cross-collection'; path: string; refreshCompareModeConfig?: boolean }
  | { surface: 'color-analysis' }
  | { surface: 'import' }
  | { surface: 'health' }
  | { surface: 'history'; filterPath?: string };

export interface TokensContextualSurfaceState {
  activeSurface: TokensLibraryContextualSurface | null;
  preservesLibraryBrowseContext: boolean;
}

export interface EditorContextValue {
  editingToken: EditingToken | null;
  setEditingToken: Dispatch<SetStateAction<EditingToken | null>>;
  editingGeneratedGroup: EditingGeneratedGroup | null;
  setEditingGeneratedGroup: Dispatch<SetStateAction<EditingGeneratedGroup | null>>;
  previewingToken: PreviewingToken | null;
  setPreviewingToken: Dispatch<SetStateAction<PreviewingToken | null>>;
  inspectingCollection: InspectingCollection | null;
  setInspectingCollection: Dispatch<SetStateAction<InspectingCollection | null>>;
  highlightedToken: string | null;
  setHighlightedToken: (path: string | null) => void;
  createFromEmpty: boolean;
  setCreateFromEmpty: (v: boolean) => void;
  setPendingHighlight: Dispatch<SetStateAction<string | null>>;
  setPendingHighlightForCollection: (path: string, targetCollectionId: string) => void;
  handleNavigateToAlias: (path: string, fromPath?: string) => void;
  handleNavigateToAliasWithoutHistory: (path: string) => void;
  handleNavigateBack: () => void;
  consumeNavigateBack: () => { path: string | null; collectionId: string } | null;
  navHistoryLength: number;
  showTokensCompare: boolean;
  setShowTokensCompare: Dispatch<SetStateAction<boolean>>;
  tokensCompareMode: CompareMode;
  setTokensCompareMode: Dispatch<SetStateAction<CompareMode>>;
  tokensComparePaths: Set<string>;
  setTokensComparePaths: Dispatch<SetStateAction<Set<string>>>;
  tokensComparePath: string;
  setTokensComparePath: Dispatch<SetStateAction<string>>;
  tokensCompareModeKey: number;
  setTokensCompareModeKey: Dispatch<SetStateAction<number>>;
  tokensCompareDefaultA: string;
  tokensCompareDefaultB: string;
  showImport: boolean;
  setShowImport: Dispatch<SetStateAction<boolean>>;
  showHealth: boolean;
  setShowHealth: Dispatch<SetStateAction<boolean>>;
  showHistory: boolean;
  setShowHistory: Dispatch<SetStateAction<boolean>>;
  historyFilterPath: string | null;
  setHistoryFilterPath: Dispatch<SetStateAction<string | null>>;
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
  const {
    currentCollectionId,
    setCurrentCollectionId,
    currentCollectionTokens: tokens,
  } = useCollectionStateContext();
  const { pathToCollectionId } = useTokenFlatMapContext();

  const [editingToken, setEditingToken] = useState<EditingToken | null>(null);
  const [editingGeneratedGroup, setEditingGeneratedGroup] = useState<EditingGeneratedGroup | null>(null);
  const [previewingToken, setPreviewingToken] = useState<PreviewingToken | null>(null);
  const [inspectingCollection, setInspectingCollection] = useState<InspectingCollection | null>(null);
  const [showTokensCompare, setShowTokensCompare] = useState(false);
  const [showColorAnalysis, setShowColorAnalysis] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showHealth, setShowHealth] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyFilterPath, setHistoryFilterPath] = useState<string | null>(null);
  const {
    compareMode: tokensCompareMode,
    setCompareMode: setTokensCompareMode,
    compareTokenPaths: tokensComparePaths,
    setCompareTokenPaths: setTokensComparePaths,
    compareTokenPath: tokensComparePath,
    setCompareTokenPath: setTokensComparePath,
    compareModeKey: tokensCompareModeKey,
    setCompareModeKey: setTokensCompareModeKey,
    compareModeDefaultA: tokensCompareDefaultA,
    compareModeDefaultB: tokensCompareDefaultB,
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
    setPendingHighlightForCollection,
    createFromEmpty,
    setCreateFromEmpty,
    handleNavigateToAlias,
    handleNavigateToAliasWithoutHistory,
    handleNavigateBack,
    consumeNavigateBack,
    navHistory,
  } = useTokenNavigation(pathToCollectionId, currentCollectionId, setCurrentCollectionId, tokens, handleAliasNotFound);

  useEffect(() => {
    if (!showTokensCompare && !showColorAnalysis && !showImport && !showHealth && !showHistory) return;
    if (editingToken || editingGeneratedGroup || previewingToken || inspectingCollection) {
      setShowTokensCompare(false);
      setShowColorAnalysis(false);
      setShowImport(false);
      setShowHealth(false);
      setShowHistory(false);
    }
  }, [showTokensCompare, showColorAnalysis, showImport, showHealth, showHistory, editingToken, editingGeneratedGroup, previewingToken, inspectingCollection]);

  const switchContextualSurface = useCallback((target: EditorContextualSurfaceTarget) => {
    setEditingToken(null);
    setEditingGeneratedGroup(null);
    setPreviewingToken(null);
    setInspectingCollection(null);
    setShowTokensCompare(false);
    setShowColorAnalysis(false);
    setShowImport(false);
    setShowHealth(false);
    setShowHistory(false);
    setHistoryFilterPath(null);

    if (target.surface === null) return;

    if (target.surface === "collection-details") {
      setInspectingCollection(target.collection);
      return;
    }

    if (target.surface === 'token-editor') {
      setEditingToken(target.token);
      return;
    }

    if (target.surface === 'generated-group-editor') {
      setEditingGeneratedGroup(target.generatedGroup);
      return;
    }

    if (target.surface === 'token-preview') {
      setPreviewingToken(target.token);
      return;
    }

    if (target.surface === 'color-analysis') {
      setShowColorAnalysis(true);
      return;
    }

    if (target.surface === 'import') {
      setShowImport(true);
      return;
    }

    if (target.surface === 'health') {
      setShowHealth(true);
      return;
    }

    if (target.surface === 'history') {
      setShowHistory(true);
      if (target.filterPath) {
        setHistoryFilterPath(target.filterPath);
      }
      return;
    }

    if (target.mode === 'tokens') {
      setTokensCompareMode('tokens');
      setTokensComparePaths(target.paths);
      setTokensComparePath('');
    } else {
      setTokensCompareMode('cross-collection');
      setTokensComparePath(target.path);
      setTokensComparePaths(new Set());
    }

    if (target.refreshCompareModeConfig ?? true) {
      setTokensCompareModeKey((prev) => prev + 1);
    }

    setShowTokensCompare(true);
  }, [
    setEditingGeneratedGroup,
    setEditingToken,
    setInspectingCollection,
    setPreviewingToken,
    setShowTokensCompare,
    setTokensCompareMode,
    setTokensComparePath,
    setTokensComparePaths,
    setTokensCompareModeKey,
  ]);

  const activeSurface = useMemo<TokensLibraryContextualSurface | null>(() => {
    if (inspectingCollection) return "collection-details";
    if (editingToken) return 'token-editor';
    if (editingGeneratedGroup) return 'generated-group-editor';
    if (previewingToken) return 'token-preview';
    if (showTokensCompare) return 'compare';
    if (showColorAnalysis) return 'color-analysis';
    if (showImport) return 'import';
    if (showHealth) return 'health';
    if (showHistory) return 'history';
    return null;
  }, [inspectingCollection, editingToken, editingGeneratedGroup, previewingToken, showTokensCompare, showColorAnalysis, showImport, showHealth, showHistory]);

  const tokensContextualSurfaceState = useMemo<TokensContextualSurfaceState>(() => ({
    activeSurface,
    preservesLibraryBrowseContext: activeSurface !== null,
  }), [activeSurface]);

  const value = useMemo<EditorContextValue>(() => ({
    editingToken,
    setEditingToken,
    editingGeneratedGroup,
    setEditingGeneratedGroup,
    previewingToken,
    setPreviewingToken,
    inspectingCollection,
    setInspectingCollection,
    highlightedToken,
    setHighlightedToken,
    createFromEmpty,
    setCreateFromEmpty,
    setPendingHighlight,
    setPendingHighlightForCollection,
    handleNavigateToAlias,
    handleNavigateToAliasWithoutHistory,
    handleNavigateBack,
    consumeNavigateBack,
    navHistoryLength: navHistory.length,
    showTokensCompare,
    setShowTokensCompare,
    tokensCompareMode,
    setTokensCompareMode,
    tokensComparePaths,
    setTokensComparePaths,
    tokensComparePath,
    setTokensComparePath,
    tokensCompareModeKey,
    setTokensCompareModeKey,
    tokensCompareDefaultA,
    tokensCompareDefaultB,
    showImport,
    setShowImport,
    showHealth,
    setShowHealth,
    showHistory,
    setShowHistory,
    historyFilterPath,
    setHistoryFilterPath,
    tokensContextualSurfaceState,
    switchContextualSurface,
    setAliasNotFoundHandler,
  }), [
    editingToken,
    editingGeneratedGroup,
    previewingToken,
    inspectingCollection,
    highlightedToken,
    createFromEmpty,
    setCreateFromEmpty,
    setHighlightedToken,
    setPendingHighlight,
    setPendingHighlightForCollection,
    handleNavigateToAlias,
    handleNavigateToAliasWithoutHistory,
    handleNavigateBack,
    consumeNavigateBack,
    navHistory.length,
    showTokensCompare,
    setShowTokensCompare,
    tokensCompareMode,
    setTokensCompareMode,
    tokensComparePaths,
    setTokensComparePaths,
    tokensComparePath,
    setTokensComparePath,
    tokensCompareModeKey,
    setTokensCompareModeKey,
    tokensCompareDefaultA,
    tokensCompareDefaultB,
    showImport,
    showHealth,
    showHistory,
    historyFilterPath,
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
