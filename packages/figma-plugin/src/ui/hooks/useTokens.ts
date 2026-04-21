import { useState, useEffect, useCallback, useRef } from 'react';
import { getTokenLifecycle, isDTCGToken } from '@tokenmanager/core';
import type {
  DTCGGroup,
  TokenValue,
  TokenReference,
  SerializedTokenCollection,
  TokenCollection,
} from '@tokenmanager/core';
import { deserializeTokenCollections } from '@tokenmanager/core';
import type { TokenMapEntry } from '../../shared/types';
import { STORAGE_KEYS, lsGet, lsRemove, lsSet } from '../shared/storage';
import { apiFetch, isNetworkError, createFetchSignal, combineAbortSignals } from '../shared/apiFetch';
import { isAbortError } from '../shared/utils';

export interface CollectionSummary extends SerializedTokenCollection {
  tokenCount?: number;
}

interface CollectionStateSnapshot {
  collections: TokenCollection[];
  collectionTokenCounts: Record<string, number>;
  collectionDescriptions: Record<string, string>;
}

function buildCollectionStateSnapshot(
  collectionSummaries: CollectionSummary[],
): CollectionStateSnapshot {
  return {
    collections: deserializeTokenCollections(collectionSummaries),
    collectionTokenCounts: Object.fromEntries(
      collectionSummaries.map((collection) => [
        collection.id,
        collection.tokenCount ?? 0,
      ]),
    ),
    collectionDescriptions: Object.fromEntries(
      collectionSummaries.map((collection) => [
        collection.id,
        collection.description ?? "",
      ]),
    ),
  };
}

/** Flatten a DTCG group into TokenMapEntry records, preserving each leaf's DTCG key as `$name`. */
function flattenWithNames(group: DTCGGroup, prefix = '', parentType?: string): Array<[string, TokenMapEntry]> {
  const out: Array<[string, TokenMapEntry]> = [];
  const inheritedType = group.$type ?? parentType;
  for (const [key, value] of Object.entries(group)) {
    if (key.startsWith('$')) continue;
    if (value === undefined || value === null) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (isDTCGToken(value)) {
      const $type = value.$type ?? inheritedType ?? 'unknown';
      const rawScopes = value.$extensions?.['com.figma.scopes'];
      const $scopes = Array.isArray(rawScopes) ? rawScopes as string[] : undefined;
      const lifecycle = getTokenLifecycle(value);
      const $lifecycle = lifecycle === 'published' ? undefined : lifecycle;
      out.push([path, {
        $value: value.$value as TokenValue | TokenReference,
        $type,
        $name: key,
        ...(value.$description ? { $description: value.$description } : {}),
        ...(value.$extensions ? { $extensions: value.$extensions } : {}),
        ...($scopes ? { $scopes } : {}),
        ...($lifecycle ? { $lifecycle } : {}),
      }]);
    } else if (typeof value === 'object' && !Array.isArray(value)) {
      out.push(...flattenWithNames(value as DTCGGroup, path, inheritedType));
    }
  }
  return out;
}

export interface TokenNode {
  path: string;
  name: string;
  $type?: string;
  $value?: TokenValue | TokenReference;
  $description?: string;
  $extensions?: Record<string, unknown>;
  $scopes?: string[];
  $lifecycle?: 'draft' | 'published' | 'deprecated';
  children?: TokenNode[];
  isGroup: boolean;
}

export function useCollectionState(
  serverUrl: string,
  connected: boolean,
  onNetworkError?: () => void,
  getDisconnectSignal?: () => AbortSignal,
) {
  const [collections, setCollections] = useState<TokenCollection[]>([]);
  const [currentCollectionId, setCurrentCollectionIdState] = useState<string>(() => lsGet(STORAGE_KEYS.CURRENT_COLLECTION_ID, ''));
  const setCurrentCollectionId = useCallback((collectionId: string) => {
    if (collectionId) lsSet(STORAGE_KEYS.CURRENT_COLLECTION_ID, collectionId);
    else lsRemove(STORAGE_KEYS.CURRENT_COLLECTION_ID);
    setCurrentCollectionIdState(collectionId);
  }, []);
  const [currentCollectionTokens, setCurrentCollectionTokens] = useState<TokenNode[]>([]);
  const [collectionRevision, setCollectionRevision] = useState(0);
  const [collectionsError, setCollectionsError] = useState<string | null>(null);
  const [collectionTokenCounts, setCollectionTokenCounts] = useState<Record<string, number>>({});
  const [collectionDescriptions, setCollectionDescriptions] = useState<Record<string, string>>({});
  const fetchGenRef = useRef(0);
  const currentCollectionIdRef = useRef(currentCollectionId);
  currentCollectionIdRef.current = currentCollectionId;
  const internalCollectionChangeRef = useRef(false);
  const mountedRef = useRef(false);
  const unmountControllerRef = useRef(new AbortController());

  useEffect(() => {
    const controller = unmountControllerRef.current;
    return () => { controller.abort(); };
  }, []);

  const fetchCollectionSummaries = useCallback(async (
    signalOverride?: AbortSignal,
  ): Promise<CollectionSummary[]> => {
    const unmountSignal = unmountControllerRef.current.signal;
    const disconnectSignal = getDisconnectSignal?.();
    const combinedDisconnectSignal = combineAbortSignals([
      disconnectSignal,
      unmountSignal,
      signalOverride,
    ]);
    const signal = createFetchSignal(combinedDisconnectSignal);

    const collectionsData = await apiFetch<{ collections?: CollectionSummary[] }>(
      `${serverUrl}/api/collections`,
      { signal },
    );
    return collectionsData.collections ?? [];
  }, [getDisconnectSignal, serverUrl]);

  const fetchTokensForCollection = useCallback(async (collectionId: string) => {
    if (!connected) return;
    if (!collectionId) {
      setCurrentCollectionTokens([]);
      setCollectionRevision((revision) => revision + 1);
      setCollectionsError(null);
      return;
    }

    const generation = ++fetchGenRef.current;
    const unmountSignal = unmountControllerRef.current.signal;
    const disconnectSignal = getDisconnectSignal?.();
    const combinedDisconnectSignal = combineAbortSignals([
      disconnectSignal,
      unmountSignal,
    ]) ?? unmountSignal;
    const signal = createFetchSignal(combinedDisconnectSignal);

    try {
      const tokensData = await apiFetch<{ tokens: DTCGGroup }>(
        `${serverUrl}/api/tokens/${encodeURIComponent(collectionId)}`,
        { signal },
      );
      if (generation !== fetchGenRef.current || signal.aborted) return;
      setCurrentCollectionTokens(buildTree(tokensData.tokens || {}));
      setCollectionRevision((revision) => revision + 1);
      setCollectionsError(null);
    } catch (error) {
      if (isAbortError(error)) return;
      const networkError = isNetworkError(error);
      if (networkError) onNetworkError?.();
      else setCollectionsError(error instanceof Error ? error.message : 'Failed to fetch tokens');
      console.error('Failed to fetch tokens for collection:', collectionId, error);
    }
  }, [serverUrl, connected, onNetworkError, getDisconnectSignal]);

  const applyCollectionStateSnapshot = useCallback((
    snapshot: CollectionStateSnapshot,
  ) => {
    const {
      collections: nextCollections,
      collectionTokenCounts: nextCollectionTokenCounts,
      collectionDescriptions: nextCollectionDescriptions,
    } = snapshot;
    setCollections(nextCollections);
    setCollectionTokenCounts(nextCollectionTokenCounts);
    setCollectionDescriptions(nextCollectionDescriptions);
  }, []);

  const syncCollectionSummariesToState = useCallback((
    collectionSummaries: CollectionSummary[],
  ) => {
    applyCollectionStateSnapshot(buildCollectionStateSnapshot(collectionSummaries));
  }, [applyCollectionStateSnapshot]);

  const refreshCollections = useCallback(async () => {
    if (!connected) return;

    const generation = ++fetchGenRef.current;
    const unmountSignal = unmountControllerRef.current.signal;
    const disconnectSignal = getDisconnectSignal?.();
    const combinedDisconnectSignal = combineAbortSignals([
      disconnectSignal,
      unmountSignal,
    ]) ?? unmountSignal;
    const signal = createFetchSignal(combinedDisconnectSignal);

    try {
      const collectionSummaries = await fetchCollectionSummaries(signal);
      if (generation !== fetchGenRef.current || signal.aborted) return;
      const snapshot = buildCollectionStateSnapshot(collectionSummaries);
      const { collections: nextCollections } = snapshot;
      applyCollectionStateSnapshot(snapshot);
      setCollectionsError(null);

      if (nextCollections.length === 0) {
        if (currentCollectionIdRef.current) {
          internalCollectionChangeRef.current = true;
          setCurrentCollectionId('');
        }
        setCurrentCollectionTokens([]);
        setCollectionRevision((revision) => revision + 1);
        return;
      }

      const nextCurrentCollectionId = nextCollections.some((collection) => collection.id === currentCollectionIdRef.current)
        ? currentCollectionIdRef.current
        : nextCollections[0]!.id;

      if (nextCurrentCollectionId !== currentCollectionIdRef.current) {
        internalCollectionChangeRef.current = true;
        setCurrentCollectionId(nextCurrentCollectionId);
      }

      const tokensData = await apiFetch<{ tokens: DTCGGroup }>(
        `${serverUrl}/api/tokens/${encodeURIComponent(nextCurrentCollectionId)}`,
        { signal },
      );
      if (generation !== fetchGenRef.current || signal.aborted) return;
      setCurrentCollectionTokens(buildTree(tokensData.tokens || {}));
      setCollectionRevision((revision) => revision + 1);
    } catch (error) {
      if (isAbortError(error)) return;
      const networkError = isNetworkError(error);
      if (networkError) onNetworkError?.();
      else setCollectionsError(error instanceof Error ? error.message : 'Failed to fetch collections');
      console.error('Failed to fetch collections:', error);
    }
  }, [
    connected,
    fetchCollectionSummaries,
    getDisconnectSignal,
    onNetworkError,
    serverUrl,
    setCurrentCollectionId,
    applyCollectionStateSnapshot,
  ]);

  useEffect(() => {
    refreshCollections();
  }, [refreshCollections]);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (internalCollectionChangeRef.current) {
      internalCollectionChangeRef.current = false;
      return;
    }
    void fetchTokensForCollection(currentCollectionId);
  }, [currentCollectionId, fetchTokensForCollection]);

  const addCollectionToState = useCallback(async (collectionId: string) => {
    if (!collectionId.trim()) {
      throw new Error("Collection id is required");
    }

    const collectionSummaries = await fetchCollectionSummaries();
    const matchingCollection = collectionSummaries.find(
      (collection) => collection.id === collectionId,
    );
    if (!matchingCollection) {
      throw new Error(`Collection "${collectionId}" was not found after it was created`);
    }

    syncCollectionSummariesToState(collectionSummaries);
  }, [fetchCollectionSummaries, syncCollectionSummariesToState]);

  const removeCollectionFromState = useCallback((collectionId: string) => {
    setCollections((previousCollections) => previousCollections.filter((collection) => collection.id !== collectionId));
    setCollectionTokenCounts((previousCounts) => {
      const nextCounts = { ...previousCounts };
      delete nextCounts[collectionId];
      return nextCounts;
    });
    setCollectionDescriptions((previousDescriptions) => {
      const nextDescriptions = { ...previousDescriptions };
      delete nextDescriptions[collectionId];
      return nextDescriptions;
    });
  }, []);

  const renameCollectionInState = useCallback((oldCollectionId: string, newCollectionId: string) => {
    setCollections((previousCollections) => previousCollections.map((collection) => (
      collection.id === oldCollectionId
        ? { ...collection, id: newCollectionId }
        : collection
    )));
    setCollectionTokenCounts((previousCounts) => {
      const nextCounts = { ...previousCounts };
      if (oldCollectionId in nextCounts) {
        nextCounts[newCollectionId] = nextCounts[oldCollectionId];
        delete nextCounts[oldCollectionId];
      }
      return nextCounts;
    });
    setCollectionDescriptions((previousDescriptions) => {
      const nextDescriptions = { ...previousDescriptions };
      if (oldCollectionId in nextDescriptions) {
        nextDescriptions[newCollectionId] = nextDescriptions[oldCollectionId] ?? '';
        delete nextDescriptions[oldCollectionId];
      }
      return nextDescriptions;
    });
  }, []);

  const updateCollectionMetadataInState = useCallback((collectionId: string, description: string) => {
    setCollectionDescriptions((previousDescriptions) => ({ ...previousDescriptions, [collectionId]: description }));
  }, []);

  return {
    collections,
    setCollections,
    currentCollectionId,
    setCurrentCollectionId,
    currentCollectionTokens,
    collectionRevision,
    collectionTokenCounts,
    collectionDescriptions,
    collectionsError,
    refreshCollections,
    syncCollectionSummariesToState,
    addCollectionToState,
    removeCollectionFromState,
    renameCollectionInState,
    updateCollectionMetadataInState,
    fetchTokensForCollection,
  };
}

async function fetchAllCollections(serverUrl: string, signal?: AbortSignal): Promise<{
  flat: Record<string, TokenMapEntry>;
  pathToCollectionId: Record<string, string>;
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>;
}> {
  const collectionsData = await apiFetch<{ collections?: CollectionSummary[] }>(`${serverUrl}/api/collections`, {
    signal: createFetchSignal(signal, 5000),
  });
  const collectionIds = (collectionsData.collections ?? []).map((collection) => collection.id);

  const results = await Promise.allSettled(
    collectionIds.map(async (collectionId) => {
      const data = await apiFetch<{ tokens: DTCGGroup }>(`${serverUrl}/api/tokens/${encodeURIComponent(collectionId)}`, {
        signal: createFetchSignal(signal, 5000),
      });
      return { collectionId, tokens: data.tokens || {} };
    }),
  );

  const failed: string[] = [];
  const flat: Record<string, TokenMapEntry> = {};
  const pathToCollectionId: Record<string, string> = {};
  const perCollectionFlat: Record<string, Record<string, TokenMapEntry>> = {};

  for (let index = 0; index < results.length; index++) {
    const result = results[index];
    if (result.status === 'rejected') {
      if (isAbortError(result.reason)) {
        throw result.reason;
      }
      failed.push(collectionIds[index]);
      console.error(`Failed to fetch token collection "${collectionIds[index]}":`, result.reason);
      continue;
    }

    const { collectionId, tokens } = result.value;
    const collectionMap: Record<string, TokenMapEntry> = {};
    for (const [path, entry] of flattenWithNames(tokens)) {
      collectionMap[path] = entry;
      if (path in flat) {
        continue;
      }

      // Keep the global token index aligned with pathToCollectionId.
      // Shared token paths can exist across collections, but callers that
      // consume the global flat map already rely on the first collection win.
      flat[path] = entry;
      pathToCollectionId[path] = collectionId;
    }
    perCollectionFlat[collectionId] = collectionMap;
  }

  if (failed.length > 0) {
    throw new Error(`Failed to fetch token collection${failed.length > 1 ? 's' : ''}: ${failed.join(', ')}`);
  }

  return { flat, pathToCollectionId, perCollectionFlat };
}

export async function fetchAllTokensFlat(serverUrl: string, signal?: AbortSignal): Promise<Record<string, TokenMapEntry>> {
  return (await fetchAllCollections(serverUrl, signal)).flat;
}

export async function fetchAllTokensFlatWithCollections(serverUrl: string, signal?: AbortSignal): Promise<{
  flat: Record<string, TokenMapEntry>;
  pathToCollectionId: Record<string, string>;
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>;
}> {
  return fetchAllCollections(serverUrl, signal);
}

function buildTree(group: DTCGGroup, prefix = ''): TokenNode[] {
  const nodes: TokenNode[] = [];
  for (const [key, value] of Object.entries(group)) {
    if (key.startsWith('$')) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && '$value' in value) {
      const token = value as import('@tokenmanager/core').DTCGToken;
      const rawScopes = token.$extensions?.['com.figma.scopes'];
      const tokenManager = token.$extensions?.['tokenmanager'] as Record<string, unknown> | undefined;
      const lifecycle = tokenManager?.lifecycle;
      nodes.push({
        path,
        name: key,
        $type: token.$type,
        $value: token.$value as import('@tokenmanager/core').TokenValue | undefined,
        $description: token.$description,
        $extensions: token.$extensions as Record<string, unknown> | undefined,
        $scopes: Array.isArray(rawScopes) ? rawScopes.filter((scope): scope is string => typeof scope === 'string') : undefined,
        $lifecycle: lifecycle === 'draft' || lifecycle === 'deprecated' || lifecycle === 'published' ? lifecycle : undefined,
        isGroup: false,
      });
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      const tokenGroup = value as import('@tokenmanager/core').DTCGGroup;
      const rawScopes = tokenGroup.$extensions?.['com.figma.scopes'];
      const tokenManager = tokenGroup.$extensions?.['tokenmanager'] as Record<string, unknown> | undefined;
      const lifecycle = tokenManager?.lifecycle;
      nodes.push({
        path,
        name: key,
        $type: tokenGroup.$type,
        $description: tokenGroup.$description,
        $extensions: tokenGroup.$extensions,
        $scopes: Array.isArray(rawScopes) ? rawScopes.filter((scope): scope is string => typeof scope === 'string') : undefined,
        $lifecycle: lifecycle === 'draft' || lifecycle === 'deprecated' || lifecycle === 'published' ? lifecycle : undefined,
        isGroup: true,
        children: buildTree(tokenGroup, path),
      });
    }
  }
  return nodes;
}
