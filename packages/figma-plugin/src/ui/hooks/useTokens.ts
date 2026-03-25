import { useState, useEffect, useCallback, useRef } from 'react';
import type { TokenMapEntry } from '../../shared/types';

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
  const [activeSet, setActiveSetState] = useState<string>(() => {
    try { return localStorage.getItem('tm_active_set') || ''; } catch { return ''; }
  });
  const setActiveSet = (s: string) => {
    try { localStorage.setItem('tm_active_set', s); } catch {}
    setActiveSetState(s);
  };
  const [tokens, setTokens] = useState<TokenNode[]>([]);
  const [setTokenCounts, setSetTokenCounts] = useState<Record<string, number>>({});
  const [setDescriptions, setSetDescriptions] = useState<Record<string, string>>({});
  const fetchGenRef = useRef(0);

  const refreshTokens = useCallback(async () => {
    if (!connected) return;
    const gen = ++fetchGenRef.current;
    try {
      const setsRes = await fetch(`${serverUrl}/api/sets`);
      if (!setsRes.ok) return;
      const setsData = await setsRes.json();
      const allSets: string[] = setsData.sets || [];
      if (gen !== fetchGenRef.current) return;
      setSets(allSets);
      setSetDescriptions(setsData.descriptions || {});

      if (allSets.length > 0) {
        const current = activeSet || allSets[0];
        if (!activeSet) setActiveSet(current);

        const tokensRes = await fetch(`${serverUrl}/api/tokens/${current}`);
        if (!tokensRes.ok) return;
        const tokensData = await tokensRes.json();
        if (gen !== fetchGenRef.current) return;
        setTokens(buildTree(tokensData.tokens || {}));

        // Fetch counts for all sets in parallel
        const counts: Record<string, number> = {};
        await Promise.all(
          allSets.map(async (setName) => {
            if (setName === current) {
              counts[setName] = countLeafNodes(tokensData.tokens || {});
            } else {
              const res = await fetch(`${serverUrl}/api/tokens/${setName}`);
              if (!res.ok) return;
              const data = await res.json();
              counts[setName] = countLeafNodes(data.tokens || {});
            }
          })
        );
        if (gen !== fetchGenRef.current) return;
        setSetTokenCounts(counts);
      }
    } catch (err) {
      console.error('Failed to fetch tokens:', err);
    }
  }, [serverUrl, connected, activeSet]);

  useEffect(() => {
    refreshTokens();
  }, [refreshTokens]);

  return { sets, activeSet, setActiveSet, tokens, setTokenCounts, setDescriptions, refreshTokens };
}

export async function fetchAllTokensFlat(serverUrl: string): Promise<Record<string, TokenMapEntry>> {
  const setsRes = await fetch(`${serverUrl}/api/sets`);
  const setsData = await setsRes.json();
  const setNames: string[] = setsData.sets || [];

  const map: Record<string, TokenMapEntry> = {};

  for (const setName of setNames) {
    const res = await fetch(`${serverUrl}/api/tokens/${setName}`);
    const data = await res.json();
    flattenTokens(data.tokens || {}, '', map);
  }

  return map;
}

export async function fetchAllTokensFlatWithSets(serverUrl: string): Promise<{
  flat: Record<string, TokenMapEntry>;
  pathToSet: Record<string, string>;
}> {
  const setsRes = await fetch(`${serverUrl}/api/sets`);
  const setsData = await setsRes.json();
  const setNames: string[] = setsData.sets || [];

  const flat: Record<string, TokenMapEntry> = {};
  const pathToSet: Record<string, string> = {};

  for (const setName of setNames) {
    const res = await fetch(`${serverUrl}/api/tokens/${setName}`);
    const data = await res.json();
    flattenTokensWithSet(data.tokens || {}, '', setName, flat, pathToSet);
  }

  return { flat, pathToSet };
}

function flattenTokensWithSet(
  group: Record<string, any>,
  prefix: string,
  setName: string,
  flat: Record<string, TokenMapEntry>,
  pathToSet: Record<string, string>,
) {
  for (const [key, value] of Object.entries(group)) {
    if (key.startsWith('$')) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && '$value' in value) {
      flat[path] = { $value: value.$value, $type: value.$type || 'unknown' };
      if (!(path in pathToSet)) pathToSet[path] = setName; // first set wins
    } else if (value && typeof value === 'object') {
      flattenTokensWithSet(value, path, setName, flat, pathToSet);
    }
  }
}

function countLeafNodes(group: Record<string, any>): number {
  let count = 0;
  for (const [key, value] of Object.entries(group)) {
    if (key.startsWith('$')) continue;
    if (value && typeof value === 'object' && '$value' in value) {
      count++;
    } else if (value && typeof value === 'object') {
      count += countLeafNodes(value);
    }
  }
  return count;
}

function flattenTokens(group: Record<string, any>, prefix: string, out: Record<string, TokenMapEntry>) {
  for (const [key, value] of Object.entries(group)) {
    if (key.startsWith('$')) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && '$value' in value) {
      out[path] = { $value: value.$value, $type: value.$type || 'unknown' };
    } else if (value && typeof value === 'object') {
      flattenTokens(value, path, out);
    }
  }
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
        isGroup: true,
        children: buildTree(value, path),
      });
    }
  }
  return nodes;
}
