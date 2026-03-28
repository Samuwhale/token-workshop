import { useState, useEffect, useCallback, useRef } from 'react';
import { isDTCGToken } from '@tokenmanager/core';
import type { DTCGGroup, TokenValue, TokenReference } from '@tokenmanager/core';
import type { TokenMapEntry } from '../../shared/types';
import { STORAGE_KEYS, lsGet, lsSet } from '../shared/storage';
import { isNetworkError } from '../shared/apiFetch';

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
      out.push([path, { $value: value.$value as TokenValue | TokenReference, $type, $name: key, ...($scopes ? { $scopes } : {}) }]);
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
  children?: TokenNode[];
  isGroup: boolean;
}

export function useTokens(
  serverUrl: string,
  connected: boolean,
  onNetworkError?: () => void,
  getDisconnectSignal?: () => AbortSignal,
) {
  const [sets, setSets] = useState<string[]>([]);
  const [activeSet, setActiveSetState] = useState<string>(() => lsGet(STORAGE_KEYS.ACTIVE_SET, ''));
  const setActiveSet = (s: string) => {
    lsSet(STORAGE_KEYS.ACTIVE_SET, s);
    setActiveSetState(s);
  };
  const [tokens, setTokens] = useState<TokenNode[]>([]);
  const [setTokenCounts, setSetTokenCounts] = useState<Record<string, number>>({});
  const [setDescriptions, setSetDescriptions] = useState<Record<string, string>>({});
  const [setCollectionNames, setSetCollectionNames] = useState<Record<string, string>>({});
  const [setModeNames, setSetModeNames] = useState<Record<string, string>>({});
  const fetchGenRef = useRef(0);
  const activeSetRef = useRef(activeSet);
  activeSetRef.current = activeSet;
  // Tracks activeSet changes initiated internally by refreshTokens (initial set selection)
  // so the activeSet-change effect can skip the redundant re-fetch.
  const internalSetChangeRef = useRef(false);

  const refreshTokens = useCallback(async () => {
    if (!connected) return;
    const gen = ++fetchGenRef.current;
    const disconnectSig = getDisconnectSignal?.();
    const signal = (disconnectSig != null)
      ? AbortSignal.any([AbortSignal.timeout(5000), disconnectSig])
      : AbortSignal.timeout(5000);
    try {
      const setsRes = await fetch(`${serverUrl}/api/sets`, { signal });
      if (!setsRes.ok) return;
      const setsData = await setsRes.json();
      const allSets: string[] = setsData.sets || [];
      if (gen !== fetchGenRef.current) return;
      setSets(allSets);
      setSetDescriptions(setsData.descriptions || {});
      setSetCollectionNames(setsData.collectionNames || {});
      setSetModeNames(setsData.modeNames || {});

      if (allSets.length > 0) {
        const current = activeSetRef.current || allSets[0];
        if (!activeSetRef.current) {
          internalSetChangeRef.current = true;
          setActiveSet(current);
        }

        const tokensRes = await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(current)}`, { signal });
        if (!tokensRes.ok) return;
        const tokensData = await tokensRes.json();
        if (gen !== fetchGenRef.current) return;
        setTokens(buildTree(tokensData.tokens || {}));

        if (gen !== fetchGenRef.current) return;
        setSetTokenCounts(setsData.counts || {});
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      const isNetworkErr = isNetworkError(err);
      if (isNetworkErr) onNetworkError?.();
      console.error('Failed to fetch tokens:', err);
    }
  }, [serverUrl, connected, onNetworkError, getDisconnectSignal]);

  useEffect(() => {
    refreshTokens();
  }, [refreshTokens]);

  // Re-fetch when activeSet changes externally (user switches tab).
  // Skip: initial mount (handled by refreshTokens effect above) and
  // changes caused by refreshTokens itself (initial set selection).
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (internalSetChangeRef.current) {
      internalSetChangeRef.current = false;
      return;
    }
    refreshTokens();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSet]);

  return { sets, setSets, activeSet, setActiveSet, tokens, setTokenCounts, setDescriptions, setCollectionNames, setModeNames, refreshTokens };
}

export async function fetchAllTokensFlat(serverUrl: string): Promise<Record<string, TokenMapEntry>> {
  const setsRes = await fetch(`${serverUrl}/api/sets`, { signal: AbortSignal.timeout(5000) });
  if (!setsRes.ok) throw new Error(`Failed to fetch sets: ${setsRes.statusText}`);
  const setsData = await setsRes.json();
  const setNames: string[] = setsData.sets || [];

  const results = await Promise.allSettled(
    setNames.map(async (setName) => {
      const res = await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`${setName}: ${res.statusText}`);
      const data = await res.json();
      return data.tokens || {};
    })
  );

  const failed: string[] = [];
  const map: Record<string, TokenMapEntry> = {};
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'rejected') {
      failed.push(setNames[i]);
      console.error(`Failed to fetch token set "${setNames[i]}":`, result.reason);
    } else {
      for (const [path, entry] of flattenWithNames(result.value)) {
        map[path] = entry;
      }
    }
  }

  if (failed.length > 0) {
    throw new Error(`Failed to fetch token set${failed.length > 1 ? 's' : ''}: ${failed.join(', ')}`);
  }

  return map;
}

export async function fetchAllTokensFlatWithSets(serverUrl: string): Promise<{
  flat: Record<string, TokenMapEntry>;
  pathToSet: Record<string, string>;
  perSetFlat: Record<string, Record<string, TokenMapEntry>>;
}> {
  const setsRes = await fetch(`${serverUrl}/api/sets`, { signal: AbortSignal.timeout(5000) });
  if (!setsRes.ok) throw new Error(`Failed to fetch sets: ${setsRes.statusText}`);
  const setsData = await setsRes.json();
  const setNames: string[] = setsData.sets || [];

  const results = await Promise.allSettled(
    setNames.map(async (setName) => {
      const res = await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`${setName}: ${res.statusText}`);
      const data = await res.json();
      return { setName, tokens: data.tokens || {} };
    })
  );

  const failed: string[] = [];
  const flat: Record<string, TokenMapEntry> = {};
  const pathToSet: Record<string, string> = {};
  const perSetFlat: Record<string, Record<string, TokenMapEntry>> = {};

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'rejected') {
      failed.push(setNames[i]);
      console.error(`Failed to fetch token set "${setNames[i]}":`, result.reason);
    } else {
      const { setName, tokens } = result.value;
      const setMap: Record<string, TokenMapEntry> = {};
      for (const [path, entry] of flattenWithNames(tokens)) {
        setMap[path] = entry;
        flat[path] = entry;
        if (!(path in pathToSet)) pathToSet[path] = setName; // first set wins
      }
      perSetFlat[setName] = setMap;
    }
  }

  if (failed.length > 0) {
    throw new Error(`Failed to fetch token set${failed.length > 1 ? 's' : ''}: ${failed.join(', ')}`);
  }

  return { flat, pathToSet, perSetFlat };
}


function buildTree(group: Record<string, any>, prefix = ''): TokenNode[] {
  const nodes: TokenNode[] = [];
  for (const [key, value] of Object.entries(group)) {
    if (key.startsWith('$')) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && '$value' in value) {
      nodes.push({
        path,
        name: key,
        $type: value.$type,
        $value: value.$value,
        $description: value.$description,
        $extensions: value.$extensions,
        isGroup: false,
      });
    } else if (value && typeof value === 'object') {
      nodes.push({
        path,
        name: key,
        $type: value.$type,
        $description: value.$description,
        isGroup: true,
        children: buildTree(value, path),
      });
    }
  }
  return nodes;
}
