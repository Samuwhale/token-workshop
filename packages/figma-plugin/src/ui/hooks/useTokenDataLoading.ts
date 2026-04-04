import { useState, useEffect, useRef } from 'react';
import { fetchAllTokensFlatWithSets } from './useTokens';
import { resolveAllAliases } from '../../shared/resolveAlias';
import { isNetworkError } from '../shared/apiFetch';
import { stableStringify } from '../shared/utils';
import type { TokenMapEntry } from '../../shared/types';

interface UseTokenDataLoadingParams {
  serverUrl: string;
  connected: boolean;
  /** Increments each time useTokens successfully rebuilds the tree — lightweight trigger for re-fetch */
  tokenRevision: number;
  markDisconnected: () => void;
}

export function useTokenDataLoading({ serverUrl, connected, tokenRevision, markDisconnected }: UseTokenDataLoadingParams) {
  const [allTokensFlat, setAllTokensFlat] = useState<Record<string, TokenMapEntry>>({});
  const [pathToSet, setPathToSet] = useState<Record<string, string>>({});
  const [perSetFlat, setPerSetFlat] = useState<Record<string, Record<string, TokenMapEntry>>>({});
  const [filteredSetCount, setFilteredSetCount] = useState<number | null>(null);
  const [syncSnapshot, setSyncSnapshot] = useState<Record<string, string>>({});
  const [tokensLoading, setTokensLoading] = useState(false);
  const [tokensError, setTokensError] = useState<string | null>(null);
  const flatFetchGenRef = useRef(0);
  const allTokensFlatRef = useRef(allTokensFlat);
  allTokensFlatRef.current = allTokensFlat;

  // Fetch flat tokens on connect / token-change
  useEffect(() => {
    if (connected) {
      const gen = ++flatFetchGenRef.current;
      const controller = new AbortController();
      setTokensLoading(true);
      fetchAllTokensFlatWithSets(serverUrl, controller.signal).then(({ flat, pathToSet: pts, perSetFlat: psf }) => {
        if (gen !== flatFetchGenRef.current) return; // stale response
        setAllTokensFlat(resolveAllAliases(flat));
        setPathToSet(pts);
        setPerSetFlat(psf);
        setTokensError(null);
        setTokensLoading(false);
      }).catch(err => {
        if (gen !== flatFetchGenRef.current) return;
        if (err instanceof Error && err.name === 'AbortError') return;
        if (isNetworkError(err)) markDisconnected();
        console.error('Failed to fetch tokens flat:', err);
        setTokensError(err instanceof Error ? err.message : 'Failed to load tokens');
        setTokensLoading(false);
      });
      return () => controller.abort();
    } else {
      setTokensLoading(false);
    }
  }, [connected, serverUrl, tokenRevision, markDisconnected]);

  // Listen for variables-applied and capture a sync snapshot
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data?.pluginMessage;
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

  return {
    allTokensFlat,
    pathToSet,
    perSetFlat,
    filteredSetCount, setFilteredSetCount,
    syncSnapshot,
    tokensLoading,
    tokensError,
  };
}
