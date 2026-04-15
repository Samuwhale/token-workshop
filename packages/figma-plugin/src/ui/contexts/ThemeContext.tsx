/**
 * ThemeContext — split into two focused sub-contexts to minimise cascade
 * re-renders caused by unrelated state changes:
 *
 *   ThemeSwitcherContext — theme switching UI state, preview/active theme
 *                          selections, and the derived themedAllTokensFlat memo.
 *                          `previewThemes` changes on every hover, so this
 *                          context is intentionally isolated from resolver state.
 *   ResolverContext      — DTCG resolver config and output previews.
 *                          Exposes the ResolverState interface directly so callers
 *                          can use `const resolverState = useResolverContext()`.
 *
 * `ThemeProvider` is a thin wrapper that stacks both providers. Resolver state
 * stays downstream from theme authoring; it never replaces the canonical
 * token-plus-mode view exposed by ThemeSwitcherContext.
 */

import { createContext, useContext, useMemo } from 'react';
import type { RefObject, ReactNode } from 'react';
import { useConnectionContext } from './ConnectionContext';
import { useTokenSetsContext, useTokenFlatMapContext } from './TokenDataContext';
import { useThemeSwitcher } from '../hooks/useThemeSwitcher';
import { useResolvers } from '../hooks/useResolvers';
import type {
  ResolverMeta,
  ResolverModifierMeta,
  ResolverSelectionOrigin,
} from '../hooks/useResolvers';
import type { TokenMapEntry } from '../../shared/types';
import type { ThemeDimension, ResolverFile } from '@tokenmanager/core';
import type { UndoSlot } from '../hooks/useUndo';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Resolver state is exposed directly from useResolverContext(). */
export interface ResolverState {
  resolvers: ResolverMeta[];
  resolverLoadErrors: Record<string, { message: string; at: string }>;
  activeResolver: string | null;
  selectionOrigin: ResolverSelectionOrigin;
  setActiveResolver: (name: string | null) => void;
  resolverInput: Record<string, string>;
  setResolverInput: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  resolvedTokens: Record<string, TokenMapEntry> | null;
  activeModifiers: Record<string, ResolverModifierMeta>;
  resolverError: string | null;
  loading: boolean;
  resolversLoading: boolean;
  fetchResolvers: () => void;
  convertFromThemes: (name?: string) => Promise<unknown>;
  deleteResolver: (name: string) => Promise<void>;
  getResolverFile: (name: string) => Promise<ResolverFile>;
  updateResolver: (name: string, file: ResolverFile) => Promise<void>;
  /** Register the undo push handler — call from App.tsx after mount. */
  setPushUndo: (fn: ((slot: UndoSlot) => void) | undefined) => void;
}

export interface ThemeSwitcherContextValue {
  // ---- useThemeSwitcher ---------------------------------------------------
  dimensions: ThemeDimension[];
  setDimensions: React.Dispatch<React.SetStateAction<ThemeDimension[]>>;
  activeThemes: Record<string, string>;
  setActiveThemes: (map: Record<string, string>) => void;
  previewThemes: Record<string, string>;
  setPreviewThemes: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  openDimDropdown: string | null;
  setOpenDimDropdown: React.Dispatch<React.SetStateAction<string | null>>;
  dimBarExpanded: boolean;
  setDimBarExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  dimDropdownRef: RefObject<HTMLDivElement>;
  themesError: string | null;
  retryThemes: () => void;

  // ---- Derived memos -------------------------------------------------------
  /** Tokens resolved through the active theme selections only. */
  themedAllTokensFlat: Record<string, TokenMapEntry>;
}

// ---------------------------------------------------------------------------
// Contexts and hooks
// ---------------------------------------------------------------------------

const ResolverContext = createContext<ResolverState | null>(null);
const ThemeSwitcherContext = createContext<ThemeSwitcherContextValue | null>(null);

export function useResolverContext(): ResolverState {
  const ctx = useContext(ResolverContext);
  if (!ctx) throw new Error('useResolverContext must be used inside ThemeProvider');
  return ctx;
}

export function useThemeSwitcherContext(): ThemeSwitcherContextValue {
  const ctx = useContext(ThemeSwitcherContext);
  if (!ctx) throw new Error('useThemeSwitcherContext must be used inside ThemeProvider');
  return ctx;
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

function ResolverProvider({ children, serverUrl, connected }: {
  children: ReactNode;
  serverUrl: string;
  connected: boolean;
}) {
  const resolverState = useResolvers(serverUrl, connected);

  // useResolvers already returns a stable reference for its callbacks —
  // wrap the whole object in a memo keyed on each field so consumers
  // only re-render when something they actually care about changes.
  const value = useMemo<ResolverState>(
    () => ({
      resolvers: resolverState.resolvers,
      resolverLoadErrors: resolverState.resolverLoadErrors,
      activeResolver: resolverState.activeResolver,
      selectionOrigin: resolverState.selectionOrigin,
      setActiveResolver: resolverState.setActiveResolver,
      resolverInput: resolverState.resolverInput,
      setResolverInput: resolverState.setResolverInput,
      resolvedTokens: resolverState.resolvedTokens,
      activeModifiers: resolverState.activeModifiers,
      resolverError: resolverState.resolverError,
      loading: resolverState.loading,
      resolversLoading: resolverState.resolversLoading,
      fetchResolvers: resolverState.fetchResolvers,
      convertFromThemes: resolverState.convertFromThemes,
      deleteResolver: resolverState.deleteResolver,
      getResolverFile: resolverState.getResolverFile,
      updateResolver: resolverState.updateResolver,
      setPushUndo: resolverState.setPushUndo,
    }),
    [
      resolverState.resolvers,
      resolverState.resolverLoadErrors,
      resolverState.activeResolver,
      resolverState.selectionOrigin,
      resolverState.setActiveResolver,
      resolverState.resolverInput,
      resolverState.setResolverInput,
      resolverState.resolvedTokens,
      resolverState.activeModifiers,
      resolverState.resolverError,
      resolverState.loading,
      resolverState.resolversLoading,
      resolverState.fetchResolvers,
      resolverState.convertFromThemes,
      resolverState.deleteResolver,
      resolverState.getResolverFile,
      resolverState.updateResolver,
      resolverState.setPushUndo,
    ],
  );

  return (
    <ResolverContext.Provider value={value}>
      {children}
    </ResolverContext.Provider>
  );
}

function ThemeSwitcherProvider({ children, serverUrl, connected }: {
  children: ReactNode;
  serverUrl: string;
  connected: boolean;
}) {
  const { tokenRevision } = useTokenSetsContext();
  const { allTokensFlat, pathToSet } = useTokenFlatMapContext();

  const {
    dimensions, setDimensions,
    activeThemes, setActiveThemes,
    previewThemes, setPreviewThemes,
    openDimDropdown, setOpenDimDropdown,
    dimBarExpanded, setDimBarExpanded,
    dimDropdownRef,
    themedAllTokensFlat: themeOnlyTokensFlat,
    themesError, retryThemes,
  } = useThemeSwitcher(serverUrl, connected, tokenRevision, allTokensFlat, pathToSet);

  const value = useMemo<ThemeSwitcherContextValue>(
    () => ({
      dimensions, setDimensions,
      activeThemes, setActiveThemes,
      previewThemes, setPreviewThemes,
      openDimDropdown, setOpenDimDropdown,
      dimBarExpanded, setDimBarExpanded,
      dimDropdownRef, themesError, retryThemes,
      themedAllTokensFlat: themeOnlyTokensFlat,
    }),
    [
      dimensions, setDimensions,
      activeThemes, setActiveThemes,
      previewThemes, setPreviewThemes,
      openDimDropdown, setOpenDimDropdown,
      dimBarExpanded, setDimBarExpanded,
      dimDropdownRef, themesError, retryThemes,
      themeOnlyTokensFlat,
    ],
  );

  return (
    <ThemeSwitcherContext.Provider value={value}>
      {children}
    </ThemeSwitcherContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Public wrapper — stacks both providers (ResolverProvider first so
// ThemeSwitcherProvider can read from it)
// ---------------------------------------------------------------------------

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { serverUrl, connected } = useConnectionContext();

  return (
    <ResolverProvider serverUrl={serverUrl} connected={connected}>
      <ThemeSwitcherProvider serverUrl={serverUrl} connected={connected}>
        {children}
      </ThemeSwitcherProvider>
    </ResolverProvider>
  );
}
