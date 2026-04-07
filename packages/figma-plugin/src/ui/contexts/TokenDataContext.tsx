/**
 * TokenDataContext — split into three focused sub-contexts to minimise
 * cascade re-renders:
 *
 *   TokenSetsContext     — set management, metadata, and mutation callbacks
 *                          (slow-changing; only re-renders on user actions)
 *   TokenFlatMapContext  — flat token maps derived from the fetch cycle
 *                          (medium-frequency; re-fetched on tokenRevision bumps)
 *   GeneratorContext     — generator list and derived token paths
 *                          (independent polling; doesn't cause token-set re-renders)
 *
 * `TokenDataProvider` is a thin wrapper that stacks all three providers.
 * Consumers call the focused hook they need (e.g. `useTokenFlatMapContext()`)
 * so they only re-render when that slice actually changes.
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

export interface TokenSetsContextValue {
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
  fetchError: string | null;
  addSetToState: (name: string, count: number) => void;
  removeSetFromState: (name: string) => void;
  renameSetInState: (oldName: string, newName: string) => void;
  updateSetMetadataInState: (name: string, description: string, collectionName: string, modeName: string) => void;
  fetchTokensForSet: (name: string) => Promise<void>;
}

export interface TokenFlatMapContextValue {
  // ---- useTokenDataLoading ------------------------------------------------
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToSet: Record<string, string>;
  perSetFlat: Record<string, Record<string, TokenMapEntry>>;
  filteredSetCount: number | null;
  setFilteredSetCount: (n: number | null) => void;
  syncSnapshot: Record<string, string>;
  tokensLoading: boolean;
  tokensError: string | null;
}

export interface GeneratorContextValue {
  // ---- useGenerators ------------------------------------------------------
  generators: TokenGenerator[];
  generatorsLoading: boolean;
  refreshGenerators: () => void;
  generatorsBySource: Map<string, TokenGenerator[]>;
  generatorsByTargetGroup: Map<string, TokenGenerator>;
  derivedTokenPaths: Map<string, TokenGenerator>;
}

// ---------------------------------------------------------------------------
// Contexts and hooks
// ---------------------------------------------------------------------------

const TokenSetsContext = createContext<TokenSetsContextValue | null>(null);
const TokenFlatMapContext = createContext<TokenFlatMapContextValue | null>(null);
const GeneratorContext = createContext<GeneratorContextValue | null>(null);

export function useTokenSetsContext(): TokenSetsContextValue {
  const ctx = useContext(TokenSetsContext);
  if (!ctx) throw new Error('useTokenSetsContext must be used inside TokenDataProvider');
  return ctx;
}

export function useTokenFlatMapContext(): TokenFlatMapContextValue {
  const ctx = useContext(TokenFlatMapContext);
  if (!ctx) throw new Error('useTokenFlatMapContext must be used inside TokenDataProvider');
  return ctx;
}

export function useGeneratorContext(): GeneratorContextValue {
  const ctx = useContext(GeneratorContext);
  if (!ctx) throw new Error('useGeneratorContext must be used inside TokenDataProvider');
  return ctx;
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

function TokenSetsProvider({ children, serverUrl, connected, markDisconnected, getDisconnectSignal }: {
  children: ReactNode;
  serverUrl: string;
  connected: boolean;
  markDisconnected: () => void;
  getDisconnectSignal: () => AbortSignal;
}) {
  const {
    sets, setSets, activeSet, setActiveSet, tokens, tokenRevision,
    fetchError, setTokenCounts, setDescriptions, setCollectionNames, setModeNames,
    refreshTokens, addSetToState, removeSetFromState, renameSetInState,
    updateSetMetadataInState, fetchTokensForSet,
  } = useTokens(serverUrl, connected, markDisconnected, getDisconnectSignal);

  const value = useMemo<TokenSetsContextValue>(
    () => ({
      sets, setSets, activeSet, setActiveSet,
      tokens, tokenRevision,
      fetchError,
      setTokenCounts, setDescriptions, setCollectionNames, setModeNames,
      refreshTokens, addSetToState, removeSetFromState, renameSetInState,
      updateSetMetadataInState, fetchTokensForSet,
    }),
    [
      sets, setSets, activeSet, setActiveSet,
      tokens, tokenRevision,
      fetchError,
      setTokenCounts, setDescriptions, setCollectionNames, setModeNames,
      refreshTokens, addSetToState, removeSetFromState, renameSetInState,
      updateSetMetadataInState, fetchTokensForSet,
    ],
  );

  return (
    <TokenSetsContext.Provider value={value}>
      {children}
    </TokenSetsContext.Provider>
  );
}

function TokenFlatMapProvider({ children, serverUrl, connected, markDisconnected }: {
  children: ReactNode;
  serverUrl: string;
  connected: boolean;
  markDisconnected: () => void;
}) {
  const { tokenRevision } = useTokenSetsContext();

  const {
    allTokensFlat, pathToSet, perSetFlat,
    filteredSetCount, setFilteredSetCount,
    syncSnapshot, tokensLoading, tokensError,
  } = useTokenDataLoading({ serverUrl, connected, tokenRevision, markDisconnected });

  const value = useMemo<TokenFlatMapContextValue>(
    () => ({
      allTokensFlat, pathToSet, perSetFlat,
      filteredSetCount, setFilteredSetCount, syncSnapshot,
      tokensLoading, tokensError,
    }),
    [
      allTokensFlat, pathToSet, perSetFlat,
      filteredSetCount, setFilteredSetCount, syncSnapshot,
      tokensLoading, tokensError,
    ],
  );

  return (
    <TokenFlatMapContext.Provider value={value}>
      {children}
    </TokenFlatMapContext.Provider>
  );
}

function GeneratorProvider({ children, serverUrl, connected }: {
  children: ReactNode;
  serverUrl: string;
  connected: boolean;
}) {
  const { generators, loading: generatorsLoading, refreshGenerators, generatorsBySource, generatorsByTargetGroup, derivedTokenPaths } = useGenerators(
    serverUrl,
    connected,
  );

  const value = useMemo<GeneratorContextValue>(
    () => ({ generators, generatorsLoading, refreshGenerators, generatorsBySource, generatorsByTargetGroup, derivedTokenPaths }),
    [generators, generatorsLoading, refreshGenerators, generatorsBySource, generatorsByTargetGroup, derivedTokenPaths],
  );

  return (
    <GeneratorContext.Provider value={value}>
      {children}
    </GeneratorContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Public wrapper — stacks the three providers
// ---------------------------------------------------------------------------

export function TokenDataProvider({ children }: { children: ReactNode }) {
  const { serverUrl, connected, markDisconnected, getDisconnectSignal } = useConnectionContext();

  return (
    <TokenSetsProvider serverUrl={serverUrl} connected={connected} markDisconnected={markDisconnected} getDisconnectSignal={getDisconnectSignal}>
      <TokenFlatMapProvider serverUrl={serverUrl} connected={connected} markDisconnected={markDisconnected}>
        <GeneratorProvider serverUrl={serverUrl} connected={connected}>
          {children}
        </GeneratorProvider>
      </TokenFlatMapProvider>
    </TokenSetsProvider>
  );
}
