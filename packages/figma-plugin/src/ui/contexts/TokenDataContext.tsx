/**
 * TokenDataContext — split into three focused sub-contexts to minimise
 * cascade re-renders:
 *
 *   CollectionStateContext — canonical client owner for collection identity
 *                            and collection metadata
 *   TokenFlatMapContext    — flat token maps derived from the fetch cycle
 *                            plus mode-resolved token views
 *   GeneratorContext          — generator list and ownership indexes
 *
 * `TokenDataProvider` stacks the three providers. Consumers should read the
 * narrowest hook they need.
 */

import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { TokenCollection } from '@tokenmanager/core';
import { useConnectionContext } from './ConnectionContext';
import { useCollectionState } from '../hooks/useTokens';
import type { TokenNode } from '../hooks/useTokens';
import type { CollectionSummary } from '../hooks/useTokens';
import { useTokenDataLoading } from '../hooks/useTokenDataLoading';
import { useGenerators } from '../hooks/useGenerators';
import type { TokenGenerator } from '../hooks/useGenerators';
import type { TokenMapEntry } from '../../shared/types';

export interface CollectionStateContextValue {
  collections: TokenCollection[];
  setCollections: React.Dispatch<React.SetStateAction<TokenCollection[]>>;
  currentCollectionId: string;
  setCurrentCollectionId: (collectionId: string) => void;
  currentCollectionTokens: TokenNode[];
  collectionRevision: number;
  collectionTokenCounts: Record<string, number>;
  collectionDescriptions: Record<string, string>;
  collectionsError: string | null;
  refreshCollections: () => void;
  syncCollectionSummariesToState: (collectionSummaries: CollectionSummary[]) => void;
  addCollectionToState: (collectionId: string) => Promise<void>;
  removeCollectionFromState: (collectionId: string) => void;
  renameCollectionInState: (oldCollectionId: string, newCollectionId: string) => void;
  updateCollectionMetadataInState: (collectionId: string, description: string) => void;
  fetchTokensForCollection: (collectionId: string) => Promise<void>;
}

export interface TokenFlatMapContextValue {
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToCollectionId: Record<string, string>;
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>;
  filteredCollectionCount: number | null;
  setFilteredCollectionCount: (count: number | null) => void;
  syncSnapshot: Record<string, string>;
  tokensLoading: boolean;
  tokensError: string | null;
  modeResolvedTokensFlat: Record<string, TokenMapEntry>;
}

export interface GeneratorContextValue {
  generators: TokenGenerator[];
  generatorsLoading: boolean;
  refreshGenerators: () => void;
  generatorsBySource: Map<string, TokenGenerator[]>;
  generatorsByTargetGroup: Map<string, TokenGenerator>;
  derivedTokenPaths: Map<string, TokenGenerator>;
}

const CollectionStateContext = createContext<CollectionStateContextValue | null>(null);
const TokenFlatMapContext = createContext<TokenFlatMapContextValue | null>(null);
const GeneratorContext = createContext<GeneratorContextValue | null>(null);

export function useCollectionStateContext(): CollectionStateContextValue {
  const context = useContext(CollectionStateContext);
  if (!context) throw new Error('useCollectionStateContext must be used inside TokenDataProvider');
  return context;
}

export function useTokenFlatMapContext(): TokenFlatMapContextValue {
  const context = useContext(TokenFlatMapContext);
  if (!context) throw new Error('useTokenFlatMapContext must be used inside TokenDataProvider');
  return context;
}

export function useGeneratorContext(): GeneratorContextValue {
  const context = useContext(GeneratorContext);
  if (!context) throw new Error('useGeneratorContext must be used inside TokenDataProvider');
  return context;
}

function CollectionStateProvider({
  children,
  serverUrl,
  connected,
  markDisconnected,
  getDisconnectSignal,
}: {
  children: ReactNode;
  serverUrl: string;
  connected: boolean;
  markDisconnected: () => void;
  getDisconnectSignal: () => AbortSignal;
}) {
  const collectionState = useCollectionState(
    serverUrl,
    connected,
    markDisconnected,
    getDisconnectSignal,
  );

  const value = useMemo<CollectionStateContextValue>(
    () => ({
      collections: collectionState.collections,
      setCollections: collectionState.setCollections,
      currentCollectionId: collectionState.currentCollectionId,
      setCurrentCollectionId: collectionState.setCurrentCollectionId,
      currentCollectionTokens: collectionState.currentCollectionTokens,
      collectionRevision: collectionState.collectionRevision,
      collectionTokenCounts: collectionState.collectionTokenCounts,
      collectionDescriptions: collectionState.collectionDescriptions,
      collectionsError: collectionState.collectionsError,
      refreshCollections: collectionState.refreshCollections,
      syncCollectionSummariesToState: collectionState.syncCollectionSummariesToState,
      addCollectionToState: collectionState.addCollectionToState,
      removeCollectionFromState: collectionState.removeCollectionFromState,
      renameCollectionInState: collectionState.renameCollectionInState,
      updateCollectionMetadataInState: collectionState.updateCollectionMetadataInState,
      fetchTokensForCollection: collectionState.fetchTokensForCollection,
    }),
    [
      collectionState.collections,
      collectionState.setCollections,
      collectionState.currentCollectionId,
      collectionState.setCurrentCollectionId,
      collectionState.currentCollectionTokens,
      collectionState.collectionRevision,
      collectionState.collectionTokenCounts,
      collectionState.collectionDescriptions,
      collectionState.collectionsError,
      collectionState.refreshCollections,
      collectionState.syncCollectionSummariesToState,
      collectionState.addCollectionToState,
      collectionState.removeCollectionFromState,
      collectionState.renameCollectionInState,
      collectionState.updateCollectionMetadataInState,
      collectionState.fetchTokensForCollection,
    ],
  );

  return (
    <CollectionStateContext.Provider value={value}>
      {children}
    </CollectionStateContext.Provider>
  );
}

function TokenFlatMapProvider({
  children,
  serverUrl,
  connected,
  markDisconnected,
}: {
  children: ReactNode;
  serverUrl: string;
  connected: boolean;
  markDisconnected: () => void;
}) {
  const {
    collectionRevision,
    collections,
  } = useCollectionStateContext();

  const tokenData = useTokenDataLoading({
    serverUrl,
    connected,
    collectionRevision,
    markDisconnected,
    collections,
  });

  const value = useMemo<TokenFlatMapContextValue>(
    () => ({
      allTokensFlat: tokenData.allTokensFlat,
      pathToCollectionId: tokenData.pathToCollectionId,
      perCollectionFlat: tokenData.perCollectionFlat,
      filteredCollectionCount: tokenData.filteredCollectionCount,
      setFilteredCollectionCount: tokenData.setFilteredCollectionCount,
      syncSnapshot: tokenData.syncSnapshot,
      tokensLoading: tokenData.tokensLoading,
      tokensError: tokenData.tokensError,
      modeResolvedTokensFlat: tokenData.modeResolvedTokensFlat,
    }),
    [
      tokenData.allTokensFlat,
      tokenData.pathToCollectionId,
      tokenData.perCollectionFlat,
      tokenData.filteredCollectionCount,
      tokenData.setFilteredCollectionCount,
      tokenData.syncSnapshot,
      tokenData.tokensLoading,
      tokenData.tokensError,
      tokenData.modeResolvedTokensFlat,
    ],
  );

  return (
    <TokenFlatMapContext.Provider value={value}>
      {children}
    </TokenFlatMapContext.Provider>
  );
}

function GeneratorProvider({
  children,
  serverUrl,
  connected,
}: {
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

export function TokenDataProvider({ children }: { children: ReactNode }) {
  const { serverUrl, connected, markDisconnected, getDisconnectSignal } = useConnectionContext();

  return (
    <CollectionStateProvider
      serverUrl={serverUrl}
      connected={connected}
      markDisconnected={markDisconnected}
      getDisconnectSignal={getDisconnectSignal}
    >
      <TokenFlatMapProvider
        serverUrl={serverUrl}
        connected={connected}
        markDisconnected={markDisconnected}
      >
        <GeneratorProvider serverUrl={serverUrl} connected={connected}>
          {children}
        </GeneratorProvider>
      </TokenFlatMapProvider>
    </CollectionStateProvider>
  );
}
