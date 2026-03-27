import { useState, useEffect, useCallback, useRef } from 'react';
import { flattenTokenGroup } from '@tokenmanager/core';
import type { TokenMapEntry } from '../../shared/types';
import { STORAGE_KEYS, lsGet, lsSet } from '../shared/storage';

export interface TokenNode {
  path: string;
  name: string;
  $type?: string;
  $value?: any;
  $description?: string;
  $extensions?: Record<string, unknown>;
  children?: TokenNode[];
  isGroup: boolean;
}

export function useTokens(serverUrl: string, connected: boolean) {
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

  const refreshTokens = useCallback(async () => {
    if (!connected) return;
    const gen = ++fetchGenRef.current;
    try {
      const setsRes = await fetch(`${serverUrl}/api/sets`, { signal: AbortSignal.timeout(5000) });
      if (!setsRes.ok) return;
      const setsData = await setsRes.json();
      const allSets: string[] = setsData.sets || [];
      if (gen !== fetchGenRef.current) return;
      setSets(allSets);
      setSetDescriptions(setsData.descriptions || {});
      setSetCollectionNames(setsData.collectionNames || {});
      setSetModeNames(setsData.modeNames || {});

      if (allSets.length > 0) {
        const current = activeSet || allSets[0];
        if (!activeSet) setActiveSet(current);

        const tokensRes = await fetch(`${serverUrl}/api/tokens/${current}`, { signal: AbortSignal.timeout(5000) });
        if (!tokensRes.ok) return;
        const tokensData = await tokensRes.json();
        if (gen !== fetchGenRef.current) return;
        setTokens(buildTree(tokensData.tokens || {}));

        if (gen !== fetchGenRef.current) return;
        setSetTokenCounts(setsData.counts || {});
      }
    } catch (err) {
      console.error('Failed to fetch tokens:', err);
    }
  }, [serverUrl, connected, activeSet]);

  useEffect(() => {
    refreshTokens();
  }, [refreshTokens]);

  return { sets, setSets, activeSet, setActiveSet, tokens, setTokenCounts, setDescriptions, setCollectionNames, setModeNames, refreshTokens };
}

export async function fetchAllTokensFlat(serverUrl: string): Promise<Record<string, TokenMapEntry>> {
  const setsRes = await fetch(`${serverUrl}/api/sets`, { signal: AbortSignal.timeout(5000) });
  if (!setsRes.ok) throw new Error(`Failed to fetch sets: ${setsRes.statusText}`);
  const setsData = await setsRes.json();
  const setNames: string[] = setsData.sets || [];

  const map: Record<string, TokenMapEntry> = {};

  for (const setName of setNames) {
    const res = await fetch(`${serverUrl}/api/tokens/${setName}`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) continue;
    const data = await res.json();
    for (const [path, token] of flattenTokenGroup(data.tokens || {})) {
      map[path] = { $value: token.$value, $type: token.$type || 'unknown' };
    }
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

  const flat: Record<string, TokenMapEntry> = {};
  const pathToSet: Record<string, string> = {};
  const perSetFlat: Record<string, Record<string, TokenMapEntry>> = {};

  for (const setName of setNames) {
    const res = await fetch(`${serverUrl}/api/tokens/${setName}`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) continue;
    const data = await res.json();
    const setMap: Record<string, TokenMapEntry> = {};
    for (const [path, token] of flattenTokenGroup(data.tokens || {})) {
      const entry: TokenMapEntry = { $value: token.$value, $type: token.$type || 'unknown' };
      setMap[path] = entry;
      flat[path] = entry;
      if (!(path in pathToSet)) pathToSet[path] = setName; // first set wins
    }
    perSetFlat[setName] = setMap;
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
