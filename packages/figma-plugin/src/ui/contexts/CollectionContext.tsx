/**
 * CollectionContext — owns collection-specific UI state that is intentionally
 * separate from the canonical collection authoring state in TokenDataContext.
 *
 *   ResolverContext     — DTCG resolver config and output previews
 */

import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useConnectionContext } from './ConnectionContext';
import { useResolvers } from '../hooks/useResolvers';
import type {
  ResolverMeta,
  ResolverModifierMeta,
  ResolverSelectionOrigin,
} from '../hooks/useResolvers';
import type { TokenMapEntry } from '../../shared/types';
import type { ResolverFile } from '@tokenmanager/core';
import type { UndoSlot } from '../hooks/useUndo';

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
  setPushUndo: (fn: ((slot: UndoSlot) => void) | undefined) => void;
}

const ResolverContext = createContext<ResolverState | null>(null);

export function useResolverContext(): ResolverState {
  const context = useContext(ResolverContext);
  if (!context) throw new Error('useResolverContext must be used inside CollectionProvider');
  return context;
}

function ResolverProvider({
  children,
  serverUrl,
  connected,
}: {
  children: ReactNode;
  serverUrl: string;
  connected: boolean;
}) {
  const resolverState = useResolvers(serverUrl, connected);

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

export function CollectionProvider({ children }: { children: ReactNode }) {
  const { serverUrl, connected } = useConnectionContext();

  return (
    <ResolverProvider serverUrl={serverUrl} connected={connected}>
      {children}
    </ResolverProvider>
  );
}
