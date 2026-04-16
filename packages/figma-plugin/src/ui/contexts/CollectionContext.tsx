/**
 * CollectionContext — split into two focused sub-contexts to minimise cascade
 * re-renders caused by unrelated state changes:
 *
 *   CollectionSwitcherContext — collection/mode selection UI state, preview/active
 *                          selections, and the derived modeResolvedTokensFlat memo.
 *                          `previewModes` changes on every hover, so this
 *                          context is intentionally isolated from resolver state.
 *   ResolverContext      — DTCG resolver config and output previews.
 *                          Exposes the ResolverState interface directly so callers
 *                          can use `const resolverState = useResolverContext()`.
 *
 * `CollectionProvider` is a thin wrapper that stacks both providers. Resolver state
 * stays separate from the canonical collection-and-mode view exposed by
 * CollectionSwitcherContext.
 */

import { createContext, useContext, useMemo } from 'react';
import type { RefObject, ReactNode } from 'react';
import { useConnectionContext } from './ConnectionContext';
import { useTokenSetsContext, useTokenFlatMapContext } from './TokenDataContext';
import { useCollectionSwitcher } from '../hooks/useCollectionSwitcher';
import { useResolvers } from '../hooks/useResolvers';
import type {
  ResolverMeta,
  ResolverModifierMeta,
  ResolverSelectionOrigin,
} from '../hooks/useResolvers';
import type { TokenMapEntry } from '../../shared/types';
import type { CollectionDefinition, ResolverFile } from '@tokenmanager/core';
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
  deleteResolver: (name: string) => Promise<void>;
  getResolverFile: (name: string) => Promise<ResolverFile>;
  updateResolver: (name: string, file: ResolverFile) => Promise<void>;
  /** Register the undo push handler — call from App.tsx after mount. */
  setPushUndo: (fn: ((slot: UndoSlot) => void) | undefined) => void;
}

export interface CollectionSwitcherContextValue {
  // ---- useCollectionSwitcher ------------------------------------------------
  collections: CollectionDefinition[];
  setCollections: React.Dispatch<React.SetStateAction<CollectionDefinition[]>>;
  activeModes: Record<string, string>;
  setActiveModes: (map: Record<string, string>) => void;
  previewModes: Record<string, string>;
  setPreviewModes: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  openCollectionDropdown: string | null;
  setOpenCollectionDropdown: React.Dispatch<React.SetStateAction<string | null>>;
  collectionBarExpanded: boolean;
  setCollectionBarExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  collectionDropdownRef: RefObject<HTMLDivElement>;
  collectionsError: string | null;
  retryCollections: () => void;

  // ---- Derived memos -------------------------------------------------------
  /** Tokens resolved through the active collection/mode selections only. */
  modeResolvedTokensFlat: Record<string, TokenMapEntry>;
}

// ---------------------------------------------------------------------------
// Contexts and hooks
// ---------------------------------------------------------------------------

const ResolverContext = createContext<ResolverState | null>(null);
const CollectionSwitcherContext = createContext<CollectionSwitcherContextValue | null>(null);

export function useResolverContext(): ResolverState {
  const ctx = useContext(ResolverContext);
  if (!ctx) throw new Error('useResolverContext must be used inside CollectionProvider');
  return ctx;
}

export function useCollectionSwitcherContext(): CollectionSwitcherContextValue {
  const ctx = useContext(CollectionSwitcherContext);
  if (!ctx) throw new Error('useCollectionSwitcherContext must be used inside CollectionProvider');
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

function CollectionSwitcherProvider({ children, serverUrl, connected }: {
  children: ReactNode;
  serverUrl: string;
  connected: boolean;
}) {
  const { tokenRevision } = useTokenSetsContext();
  const { allTokensFlat, pathToSet } = useTokenFlatMapContext();

  const {
    collections, setCollections,
    activeModes, setActiveModes,
    previewModes, setPreviewModes,
    openCollectionDropdown, setOpenCollectionDropdown,
    collectionBarExpanded, setCollectionBarExpanded,
    collectionDropdownRef,
    modeResolvedTokensFlat: modeOnlyTokensFlat,
    collectionsError, retryCollections,
  } = useCollectionSwitcher(
    serverUrl,
    connected,
    tokenRevision,
    allTokensFlat,
    pathToSet,
  );

  const value = useMemo<CollectionSwitcherContextValue>(
    () => ({
      collections, setCollections,
      activeModes, setActiveModes,
      previewModes, setPreviewModes,
      openCollectionDropdown, setOpenCollectionDropdown,
      collectionBarExpanded, setCollectionBarExpanded,
      collectionDropdownRef, collectionsError, retryCollections,
      modeResolvedTokensFlat: modeOnlyTokensFlat,
    }),
    [
      collections, setCollections,
      activeModes, setActiveModes,
      previewModes, setPreviewModes,
      openCollectionDropdown, setOpenCollectionDropdown,
      collectionBarExpanded, setCollectionBarExpanded,
      collectionDropdownRef, collectionsError, retryCollections,
      modeOnlyTokensFlat,
    ],
  );

  return (
    <CollectionSwitcherContext.Provider value={value}>
      {children}
    </CollectionSwitcherContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Public wrapper — stacks both providers (ResolverProvider first so
// CollectionSwitcherProvider can read from it)
// ---------------------------------------------------------------------------

export function CollectionProvider({ children }: { children: ReactNode }) {
  const { serverUrl, connected } = useConnectionContext();

  return (
    <ResolverProvider serverUrl={serverUrl} connected={connected}>
      <CollectionSwitcherProvider serverUrl={serverUrl} connected={connected}>
        {children}
      </CollectionSwitcherProvider>
    </ResolverProvider>
  );
}
