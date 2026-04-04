/**
 * TokenDataContext — owns token sets, flat token maps, and generators.
 *
 * Extracts useTokens, useTokenDataLoading, and useGenerators from App.tsx so
 * that token-data changes (saves, refreshes, set switches) only cascade to
 * components that subscribe to this context. App.tsx and panel components can
 * call `useTokenDataContext()` to subscribe selectively.
 */

import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useConnectionContext } from './ConnectionContext';
import { useTokens } from '../hooks/useTokens';
import type { TokenNode } from '../hooks/useTokens';
import { useTokenDataLoading } from '../hooks/useTokenDataLoading';
import { useGenerators } from '../hooks/useGenerators';
import type { TokenGenerator } from '../hooks/useGenerators';
import type { TokenMapEntry } from '../../shared/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TokenDataContextValue {
  // ---- useTokens ----------------------------------------------------------
  sets: string[];
  setSets: React.Dispatch<React.SetStateAction<string[]>>;
  activeSet: string;
  setActiveSet: (s: string) => void;
  tokens: TokenNode[];
  tokenRevision: number;
  /** Per-set token counts, keyed by set name. */
  setTokenCounts: Record<string, number>;
  setDescriptions: Record<string, string>;
  setCollectionNames: Record<string, string>;
  setModeNames: Record<string, string>;
  refreshTokens: () => void;
  addSetToState: (name: string, count: number) => void;
  removeSetFromState: (name: string) => void;
  renameSetInState: (oldName: string, newName: string) => void;
  updateSetMetadataInState: (name: string, description: string, collectionName: string, modeName: string) => void;
  fetchTokensForSet: (name: string) => Promise<void>;

  // ---- useTokenDataLoading ------------------------------------------------
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToSet: Record<string, string>;
  perSetFlat: Record<string, Record<string, TokenMapEntry>>;
  filteredSetCount: number | null;
  setFilteredSetCount: (n: number | null) => void;
  syncSnapshot: Record<string, string>;
  tokensLoading: boolean;
  tokensError: string | null;

  // ---- useGenerators ------------------------------------------------------
  generators: TokenGenerator[];
  refreshGenerators: () => void;
  generatorsBySource: Map<string, TokenGenerator[]>;
  derivedTokenPaths: Map<string, TokenGenerator>;
}

const TokenDataContext = createContext<TokenDataContextValue | null>(null);

export function useTokenDataContext(): TokenDataContextValue {
  const ctx = useContext(TokenDataContext);
  if (!ctx) throw new Error('useTokenDataContext must be used inside TokenDataProvider');
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function TokenDataProvider({ children }: { children: ReactNode }) {
  const { serverUrl, connected, markDisconnected, getDisconnectSignal } = useConnectionContext();

  const {
    sets,
    setSets,
    activeSet,
    setActiveSet,
    tokens,
    tokenRevision,
    setTokenCounts,
    setDescriptions,
    setCollectionNames,
    setModeNames,
    refreshTokens,
    addSetToState,
    removeSetFromState,
    renameSetInState,
    updateSetMetadataInState,
    fetchTokensForSet,
  } = useTokens(serverUrl, connected, markDisconnected, getDisconnectSignal);

  const {
    allTokensFlat,
    pathToSet,
    perSetFlat,
    filteredSetCount,
    setFilteredSetCount,
    syncSnapshot,
    tokensLoading,
    tokensError,
  } = useTokenDataLoading({ serverUrl, connected, tokenRevision, markDisconnected });

  const { generators, refreshGenerators, generatorsBySource, derivedTokenPaths } = useGenerators(
    serverUrl,
    connected,
  );

  const value = useMemo<TokenDataContextValue>(
    () => ({
      sets, setSets, activeSet, setActiveSet,
      tokens, tokenRevision,
      setTokenCounts, setDescriptions, setCollectionNames, setModeNames,
      refreshTokens, addSetToState, removeSetFromState, renameSetInState,
      updateSetMetadataInState, fetchTokensForSet,
      allTokensFlat, pathToSet, perSetFlat,
      filteredSetCount, setFilteredSetCount, syncSnapshot,
      tokensLoading, tokensError,
      generators, refreshGenerators, generatorsBySource, derivedTokenPaths,
    }),
    [
      sets, setSets, activeSet, setActiveSet,
      tokens, tokenRevision,
      setTokenCounts, setDescriptions, setCollectionNames, setModeNames,
      refreshTokens, addSetToState, removeSetFromState, renameSetInState,
      updateSetMetadataInState, fetchTokensForSet,
      allTokensFlat, pathToSet, perSetFlat,
      filteredSetCount, setFilteredSetCount, syncSnapshot,
      tokensLoading, tokensError,
      generators, refreshGenerators, generatorsBySource, derivedTokenPaths,
    ],
  );

  return (
    <TokenDataContext.Provider value={value}>
      {children}
    </TokenDataContext.Provider>
  );
}
