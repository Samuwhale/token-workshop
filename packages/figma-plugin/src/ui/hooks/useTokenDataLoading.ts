import { useState, useEffect, useRef } from 'react';
import { fetchAllTokensFlatWithCollections } from './useTokens';
import { resolveAllAliases } from '../../shared/resolveAlias';
import { isNetworkError } from '../shared/apiFetch';
import { stableStringify, isAbortError } from '../shared/utils';
import type { TokenMapEntry } from '../../shared/types';
import { getPluginMessageFromEvent } from '../../shared/utils';
import type { TokenCollection } from '@tokenmanager/core';

interface UseTokenDataLoadingParams {
  serverUrl: string;
  connected: boolean;
  /** Increments each time useTokens successfully rebuilds the tree — lightweight trigger for re-fetch */
  collectionRevision: number;
  markDisconnected: () => void;
  collections: TokenCollection[];
}

export function useTokenDataLoading({
  serverUrl,
  connected,
  collectionRevision,
  markDisconnected,
  collections,
}: UseTokenDataLoadingParams) {
  const [allTokensFlat, setAllTokensFlat] = useState<Record<string, TokenMapEntry>>({});
  const [pathToCollectionId, setPathToCollectionId] = useState<Record<string, string>>({});
  const [perCollectionFlat, setPerCollectionFlat] = useState<Record<string, Record<string, TokenMapEntry>>>({});
  const [filteredCollectionCount, setFilteredCollectionCount] = useState<number | null>(null);
  const [syncSnapshot, setSyncSnapshot] = useState<Record<string, string>>({});
  const [tokensLoading, setTokensLoading] = useState(false);
  const [tokensError, setTokensError] = useState<string | null>(null);
  const flatFetchGenRef = useRef(0);
  const allTokensFlatRef = useRef(allTokensFlat);
  allTokensFlatRef.current = allTokensFlat;
  const collectionIdentityKey = collections
    .map((collection) => collection.id)
    .join("\u0000");

  // Fetch flat tokens on connect / token-change
  useEffect(() => {
    if (connected) {
      const gen = ++flatFetchGenRef.current;
      const controller = new AbortController();
      setTokensLoading(true);
      fetchAllTokensFlatWithCollections(serverUrl, controller.signal).then(({ flat, pathToCollectionId: nextPathToCollectionId, perCollectionFlat: nextPerCollectionFlat }) => {
        if (gen !== flatFetchGenRef.current) return; // stale response
        setAllTokensFlat(resolveAllAliases(flat));
        setPathToCollectionId(nextPathToCollectionId);
        setPerCollectionFlat(nextPerCollectionFlat);
        setTokensError(null);
        setTokensLoading(false);
      }).catch(err => {
        if (gen !== flatFetchGenRef.current) return;
        if (isAbortError(err)) return;
        if (isNetworkError(err)) markDisconnected();
        console.error('Failed to fetch tokens flat:', err);
        setTokensError(err instanceof Error ? err.message : 'Failed to load tokens');
        setTokensLoading(false);
      });
      return () => controller.abort();
    } else {
      setTokensLoading(false);
    }
  }, [collectionIdentityKey, collectionRevision, connected, markDisconnected, serverUrl]);

  // Listen for variables-applied and capture a sync snapshot
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = getPluginMessageFromEvent<{ type?: string }>(e);
      if (msg?.type === 'variables-applied') {
        const snap: Record<string, string> = {};
        for (const [path, entry] of Object.entries(allTokensFlatRef.current)) {
          snap[path] = stableStringify(entry.$value);
        }
        setSyncSnapshot(snap);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const modeResolvedTokensFlat = resolveAllAliases(allTokensFlat);

  return {
    allTokensFlat,
    pathToCollectionId,
    perCollectionFlat,
    filteredCollectionCount,
    setFilteredCollectionCount,
    syncSnapshot,
    tokensLoading,
    tokensError,
    modeResolvedTokensFlat,
  };
}
