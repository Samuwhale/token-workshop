import { useState, useEffect, useCallback } from 'react';
import type { TokenMapEntry } from '../../shared/types';

export interface TokenNode {
  path: string;
  name: string;
  $type?: string;
  $value?: any;
  $description?: string;
  children?: TokenNode[];
  isGroup: boolean;
}

export function useTokens(serverUrl: string, connected: boolean) {
  const [sets, setSets] = useState<string[]>([]);
  const [activeSet, setActiveSet] = useState<string>('');
  const [tokens, setTokens] = useState<TokenNode[]>([]);

  const refreshTokens = useCallback(async () => {
    if (!connected) return;
    try {
      // Fetch sets
      const setsRes = await fetch(`${serverUrl}/api/sets`);
      const setsData = await setsRes.json();
      setSets(setsData.sets || []);

      if (setsData.sets?.length > 0) {
        const current = activeSet || setsData.sets[0];
        if (!activeSet) setActiveSet(current);

        // Fetch tokens for active set
        const tokensRes = await fetch(`${serverUrl}/api/tokens/${current}`);
        const tokensData = await tokensRes.json();
        setTokens(buildTree(tokensData.tokens || {}));
      }
    } catch (err) {
      console.error('Failed to fetch tokens:', err);
    }
  }, [serverUrl, connected, activeSet]);

  useEffect(() => {
    refreshTokens();
  }, [refreshTokens]);

  return { sets, activeSet, setActiveSet, tokens, refreshTokens };
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
