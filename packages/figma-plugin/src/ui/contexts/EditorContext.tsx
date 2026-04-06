/**
 * EditorContext — owns token editing state (editingToken, previewingToken) and
 * the token-navigation state (highlightedToken, createFromEmpty, alias
 * navigation history). Extracted from App.tsx so PanelRouter and other
 * consumers can access this state without receiving it as props.
 *
 * The alias-not-found handler is late-bound via setAliasNotFoundHandler so
 * App.tsx can wire in its toast callback after useToastStack initialises.
 */

import { createContext, useContext, useState, useCallback, useRef, useMemo } from 'react';
import type { ReactNode, Dispatch, SetStateAction } from 'react';
import { useTokenSetsContext, useTokenFlatMapContext } from './TokenDataContext';
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

export interface EditorContextValue {
  editingToken: EditingToken | null;
  setEditingToken: Dispatch<SetStateAction<EditingToken | null>>;
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
  const [previewingToken, setPreviewingToken] = useState<PreviewingToken | null>(null);

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

  const value = useMemo<EditorContextValue>(() => ({
    editingToken,
    setEditingToken,
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
    setAliasNotFoundHandler,
  }), [
    editingToken,
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
    setAliasNotFoundHandler,
  ]);

  return (
    <EditorContext.Provider value={value}>
      {children}
    </EditorContext.Provider>
  );
}
