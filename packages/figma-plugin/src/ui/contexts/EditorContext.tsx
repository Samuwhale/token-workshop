/**
 * EditorContext — owns token editing state (editingToken) and
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
import type { TokensLibraryGeneratedGroupEditorTarget } from '../shared/navigationTypes';

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

export type InspectingToken = {
  path: string;
  name?: string;
  currentCollectionId: string;
};

export type EditingGeneratedGroup = TokensLibraryGeneratedGroupEditorTarget;
export type InspectingCollection = { collectionId: string };
export type EditorContextualSurfaceTarget =
  | { surface: null }
  | { surface: "collection-details"; collection: InspectingCollection }
  | { surface: 'token-inspector'; token: InspectingToken }
  | { surface: 'token-editor'; token: EditingToken }
  | { surface: 'generated-group-editor'; generatedGroup: EditingGeneratedGroup }
  | { surface: 'compare'; mode: 'tokens'; paths: Set<string>; refreshCompareModeConfig?: boolean }
  | { surface: 'compare'; mode: 'cross-collection'; path: string; refreshCompareModeConfig?: boolean }
  | { surface: 'color-analysis' }
  | { surface: 'import' };

export type TokensLibraryEditorSurface =
  | "collection-details"
  | "token-inspector"
  | "token-editor"
  | "generated-group-editor";

export type TokensLibraryMaintenanceSurface =
  | "compare"
  | "color-analysis"
  | "import";

export interface TokensContextualSurfaceState {
  editorSurface: TokensLibraryEditorSurface | null;
  maintenanceSurface: TokensLibraryMaintenanceSurface | null;
}

export interface EditorContextValue {
  editingToken: EditingToken | null;
  setEditingToken: Dispatch<SetStateAction<EditingToken | null>>;
  inspectingToken: InspectingToken | null;
  setInspectingToken: Dispatch<SetStateAction<InspectingToken | null>>;
  editingGeneratedGroup: EditingGeneratedGroup | null;
  setEditingGeneratedGroup: Dispatch<SetStateAction<EditingGeneratedGroup | null>>;
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
  /** Filter path carried into the Library > History section when opened for a specific token. */
  historyFilterPath: string | null;
  setHistoryFilterPath: Dispatch<SetStateAction<string | null>>;
  tokensContextualSurfaceState: TokensContextualSurfaceState;
  switchContextualSurface: (target: EditorContextualSurfaceTarget) => void;
  /** Close only the maintenance surface (compare, color-analysis, import). Leaves the pinned editor intact. */
  closeMaintenanceSurface: () => void;
  /**
   * Dismiss every contextual tool that does not survive a Library section change:
   * compare, color-analysis, import, generated-group editor, collection-details.
   * The pinned token editor (`editingToken`) is preserved on purpose so authors
   * keep context while moving between Tokens, Health, and History.
   */
  dismissContextualTools: () => void;
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
  const [inspectingToken, setInspectingToken] = useState<InspectingToken | null>(null);
  const [editingGeneratedGroup, setEditingGeneratedGroup] = useState<EditingGeneratedGroup | null>(null);
  const [inspectingCollection, setInspectingCollection] = useState<InspectingCollection | null>(null);
  const [showTokensCompare, setShowTokensCompare] = useState(false);
  const [showColorAnalysis, setShowColorAnalysis] = useState(false);
  const [showImport, setShowImport] = useState(false);
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

  const clearEditorFamily = useCallback(() => {
    setEditingToken(null);
    setInspectingToken(null);
    setEditingGeneratedGroup(null);
    setInspectingCollection(null);
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
    setEditingGeneratedGroup(null);
    setInspectingCollection(null);
  }, [clearMaintenanceFamily]);

  const switchContextualSurface = useCallback((target: EditorContextualSurfaceTarget) => {
    if (target.surface === null) {
      clearEditorFamily();
      clearMaintenanceFamily();
      return;
    }

    // The inspector is a pinned peek that lives beneath the editor in the same
    // slot: opening the editor preserves the underlying inspector so back-from-
    // editor reveals the inspector again. Every other editor surface clears it.
    if (target.surface === 'token-editor') {
      clearMaintenanceFamily();
      setInspectingCollection(null);
      setEditingGeneratedGroup(null);
      setEditingToken(target.token);
      return;
    }

    if (target.surface === 'token-inspector') {
      clearMaintenanceFamily();
      setEditingToken(null);
      setInspectingCollection(null);
      setEditingGeneratedGroup(null);
      setInspectingToken(target.token);
      return;
    }

    if (
      target.surface === "collection-details" ||
      target.surface === "generated-group-editor"
    ) {
      clearEditorFamily();
    } else {
      clearMaintenanceFamily();
      setInspectingToken(null);
    }

    if (target.surface === "collection-details") {
      setInspectingCollection(target.collection);
      return;
    }

    if (target.surface === 'generated-group-editor') {
      setEditingGeneratedGroup(target.generatedGroup);
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
    if (editingToken) return "token-editor";
    if (inspectingToken) return "token-inspector";
    if (editingGeneratedGroup) return "generated-group-editor";
    return null;
  }, [inspectingCollection, editingToken, inspectingToken, editingGeneratedGroup]);

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
    editingToken,
    setEditingToken,
    inspectingToken,
    setInspectingToken,
    editingGeneratedGroup,
    setEditingGeneratedGroup,
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
    historyFilterPath,
    setHistoryFilterPath,
    tokensContextualSurfaceState,
    switchContextualSurface,
    closeMaintenanceSurface,
    dismissContextualTools,
    setAliasNotFoundHandler,
  }), [
    editingToken,
    inspectingToken,
    editingGeneratedGroup,
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
    historyFilterPath,
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
