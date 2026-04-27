/**
 * EditorContext — owns token details state (tokenDetails) and
 * the token-navigation state (highlightedToken, createFromEmpty, alias
 * navigation history). Extracted from App.tsx so PanelRouter and other
 * consumers can access this state without receiving it as props.
 *
 * The alias-not-found handler is late-bound via setAliasNotFoundHandler so
 * App.tsx can wire in its toast callback after useToastStack initialises.
 */

import { createContext, useContext, useState, useCallback, useRef, useMemo } from 'react';
import type { ReactNode, Dispatch, SetStateAction } from 'react';
import type { CompareMode } from '../components/UnifiedComparePanel';
import { useCollectionStateContext, useTokenFlatMapContext } from './TokenDataContext';
import { useCompareState } from '../hooks/useCompareState';
import { useTokenNavigation } from '../hooks/useTokenNavigation';
import type { CollectionPathResolutionReason } from '@tokenmanager/core';
import type { TokenContextNavigationHistoryEntry } from '../shared/navigationTypes';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TokenDetailsTarget = {
  path: string;
  name?: string;
  collectionId: string;
  mode: "inspect" | "edit";
  origin?: string;
  isCreate?: boolean;
  initialType?: string;
  initialValue?: string;
  backLabel?: string;
  requiresWorkingCollectionForEdit?: boolean;
  navigationHistory?: TokenContextNavigationHistoryEntry[];
  onBackToOrigin?: (() => void) | null;
  onMakeWorkingCollection?: (() => void) | null;
};

export type InspectingCollection = { collectionId: string };
export type EditorContextualSurfaceTarget =
  | { surface: null }
  | { surface: "collection-details"; collection: InspectingCollection }
  | { surface: "token-details"; token: TokenDetailsTarget }
  | { surface: "generate-tokens" }
  | { surface: 'compare'; mode: 'tokens'; paths: Set<string>; refreshCompareModeConfig?: boolean }
  | { surface: 'compare'; mode: 'cross-collection'; path: string; refreshCompareModeConfig?: boolean }
  | { surface: 'color-analysis' }
  | { surface: 'import' };

export type TokensLibraryEditorSurface =
  | "collection-details"
  | "token-details"
  | "generate-tokens";

export type TokensLibraryMaintenanceSurface =
  | "compare"
  | "color-analysis"
  | "import";

export interface TokensContextualSurfaceState {
  editorSurface: TokensLibraryEditorSurface | null;
  maintenanceSurface: TokensLibraryMaintenanceSurface | null;
}

export interface EditorContextValue {
  tokenDetails: TokenDetailsTarget | null;
  setTokenDetails: Dispatch<SetStateAction<TokenDetailsTarget | null>>;
  inspectingCollection: InspectingCollection | null;
  setInspectingCollection: Dispatch<SetStateAction<InspectingCollection | null>>;
  highlightedToken: string | null;
  setHighlightedToken: (path: string | null) => void;
  createFromEmpty: boolean;
  setCreateFromEmpty: (v: boolean) => void;
  setPendingHighlightForCollection: (path: string, targetCollectionId: string) => void;
  handleNavigateToAlias: (path: string, fromPath?: string) => void;
  handleNavigateToAliasWithoutHistory: (path: string) => void;
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
  tokensCompareModeKey: number;
  setTokensCompareModeKey: Dispatch<SetStateAction<number>>;
  tokensCompareDefaultA: string;
  tokensCompareDefaultB: string;
  showImport: boolean;
  setShowImport: Dispatch<SetStateAction<boolean>>;
  tokensContextualSurfaceState: TokensContextualSurfaceState;
  switchContextualSurface: (target: EditorContextualSurfaceTarget) => void;
  /** Close only the maintenance surface (compare, color-analysis, import). Leaves the pinned editor intact. */
  closeMaintenanceSurface: () => void;
  /**
   * Dismiss every contextual tool that does not survive a Library section change:
   * compare, color-analysis, import, and collection-details.
   * The pinned token details surface (`tokenDetails`) is preserved on purpose so authors
   * keep context while moving between Tokens, Health, and History.
   */
  dismissContextualTools: () => void;
  /**
   * Wire in the alias-not-found toast handler after the provider mounts.
   * App.tsx calls this once inside a useEffect after useToastStack is ready.
   */
  setAliasNotFoundHandler: (
    fn: (
      aliasPath: string,
      reason: CollectionPathResolutionReason,
    ) => void,
  ) => void;
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
    workingCollectionId: currentCollectionId,
    setWorkingCollectionId: setCurrentCollectionId,
    currentCollectionTokens: tokens,
  } = useCollectionStateContext();
  const { pathToCollectionId, collectionIdsByPath } = useTokenFlatMapContext();

  const [tokenDetails, setTokenDetails] = useState<TokenDetailsTarget | null>(null);
  const [inspectingCollection, setInspectingCollection] = useState<InspectingCollection | null>(null);
  const [showTokensCompare, setShowTokensCompare] = useState(false);
  const [showColorAnalysis, setShowColorAnalysis] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showGenerateTokens, setShowGenerateTokens] = useState(false);
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
  const onAliasNotFoundRef = useRef<
    (path: string, reason: CollectionPathResolutionReason) => void
  >(() => {});
  const setAliasNotFoundHandler = useCallback((
    fn: (
      aliasPath: string,
      reason: CollectionPathResolutionReason,
    ) => void,
  ) => {
    onAliasNotFoundRef.current = fn;
  }, []);
  const handleAliasNotFound = useCallback((
    path: string,
    reason: CollectionPathResolutionReason,
  ) => {
    onAliasNotFoundRef.current(path, reason);
  }, []);

  const {
    highlightedToken,
    setHighlightedToken,
    setPendingHighlightForCollection,
    createFromEmpty,
    setCreateFromEmpty,
    handleNavigateToAlias,
    handleNavigateToAliasWithoutHistory,
    handleNavigateBack,
    navHistory,
  } = useTokenNavigation(
    pathToCollectionId,
    collectionIdsByPath,
    currentCollectionId,
    setCurrentCollectionId,
    tokens,
    handleAliasNotFound,
  );

  const clearEditorFamily = useCallback(() => {
    setTokenDetails(null);
    setInspectingCollection(null);
    setShowGenerateTokens(false);
  }, []);

  const clearMaintenanceFamily = useCallback(() => {
    setShowTokensCompare(false);
    setShowColorAnalysis(false);
    setShowImport(false);
  }, []);

  const closeMaintenanceSurface = useCallback(() => {
    clearMaintenanceFamily();
  }, [clearMaintenanceFamily]);

  const dismissContextualTools = useCallback(() => {
    clearMaintenanceFamily();
    setInspectingCollection(null);
  }, [clearMaintenanceFamily]);

  const switchContextualSurface = useCallback((target: EditorContextualSurfaceTarget) => {
    if (target.surface === null) {
      clearEditorFamily();
      clearMaintenanceFamily();
      return;
    }

    if (target.surface === "token-details") {
      clearMaintenanceFamily();
      setInspectingCollection(null);
      setShowGenerateTokens(false);
      setTokenDetails(target.token);
      return;
    }

    if (target.surface === "generate-tokens") {
      clearMaintenanceFamily();
      setInspectingCollection(null);
      setTokenDetails(null);
      setShowGenerateTokens(true);
      return;
    }

    if (target.surface === "collection-details") {
      clearEditorFamily();
    } else {
      clearMaintenanceFamily();
      setTokenDetails(null);
    }

    if (target.surface === "collection-details") {
      setInspectingCollection(target.collection);
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
    clearEditorFamily,
    clearMaintenanceFamily,
    setTokensCompareMode,
    setTokensComparePath,
    setTokensComparePaths,
    setTokensCompareModeKey,
  ]);

  const editorSurface = useMemo<TokensLibraryEditorSurface | null>(() => {
    if (inspectingCollection) return "collection-details";
    if (tokenDetails) return "token-details";
    if (showGenerateTokens) return "generate-tokens";
    return null;
  }, [inspectingCollection, showGenerateTokens, tokenDetails]);

  const maintenanceSurface = useMemo<TokensLibraryMaintenanceSurface | null>(() => {
    if (showTokensCompare) return "compare";
    if (showColorAnalysis) return "color-analysis";
    if (showImport) return "import";
    return null;
  }, [showTokensCompare, showColorAnalysis, showImport]);

  const tokensContextualSurfaceState = useMemo<TokensContextualSurfaceState>(() => ({
    editorSurface,
    maintenanceSurface,
  }), [editorSurface, maintenanceSurface]);

  const value = useMemo<EditorContextValue>(() => ({
    tokenDetails,
    setTokenDetails,
    inspectingCollection,
    setInspectingCollection,
    highlightedToken,
    setHighlightedToken,
    createFromEmpty,
    setCreateFromEmpty,
    setPendingHighlightForCollection,
    handleNavigateToAlias,
    handleNavigateToAliasWithoutHistory,
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
    tokensCompareModeKey,
    setTokensCompareModeKey,
    tokensCompareDefaultA,
    tokensCompareDefaultB,
    showImport,
    setShowImport,
    tokensContextualSurfaceState,
    switchContextualSurface,
    closeMaintenanceSurface,
    dismissContextualTools,
    setAliasNotFoundHandler,
  }), [
    tokenDetails,
    inspectingCollection,
    highlightedToken,
    createFromEmpty,
    setCreateFromEmpty,
    setHighlightedToken,
    setPendingHighlightForCollection,
    handleNavigateToAlias,
    handleNavigateToAliasWithoutHistory,
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
    tokensCompareModeKey,
    setTokensCompareModeKey,
    tokensCompareDefaultA,
    tokensCompareDefaultB,
    showImport,
    tokensContextualSurfaceState,
    switchContextualSurface,
    closeMaintenanceSurface,
    dismissContextualTools,
    setAliasNotFoundHandler,
  ]);

  return (
    <EditorContext.Provider value={value}>
      {children}
    </EditorContext.Provider>
  );
}
