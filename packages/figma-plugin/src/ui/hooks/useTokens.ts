import { useState, useEffect, useCallback, useRef } from 'react';
import { isDTCGToken } from '@tokenmanager/core';
import type { DTCGGroup, TokenValue, TokenReference } from '@tokenmanager/core';
import type { TokenMapEntry } from '../../shared/types';
import { STORAGE_KEYS, lsGet, lsSet, lsRemove } from '../shared/storage';
import { apiFetch, isNetworkError, createFetchSignal } from '../shared/apiFetch';
import { isAbortError } from '../shared/utils';

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
      const rawLifecycle = (value.$extensions?.['tokenmanager'] as Record<string, unknown> | undefined)?.['lifecycle'];
      const $lifecycle = (rawLifecycle === 'draft' || rawLifecycle === 'deprecated') ? rawLifecycle : undefined;
      out.push([path, {
        $value: value.$value as TokenValue | TokenReference,
        $type,
        $name: key,
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

export function useTokens(
  serverUrl: string,
  connected: boolean,
  onNetworkError?: () => void,
  getDisconnectSignal?: () => AbortSignal,
) {
  const [sets, setSets] = useState<string[]>([]);
  const [activeSet, setActiveSetState] = useState<string>(() => lsGet(STORAGE_KEYS.ACTIVE_SET, ''));
  const setActiveSet = (s: string) => {
    if (s) lsSet(STORAGE_KEYS.ACTIVE_SET, s);
    else lsRemove(STORAGE_KEYS.ACTIVE_SET);
    setActiveSetState(s);
  };
  const [tokens, setTokens] = useState<TokenNode[]>([]);
  const [tokenRevision, setTokenRevision] = useState(0);
  const [fetchError, setFetchError] = useState<string | null>(null);
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
  // Aborted on unmount so in-flight fetches don't call setState on a dead component.
  const unmountControllerRef = useRef(new AbortController());

  useEffect(() => {
    const controller = unmountControllerRef.current;
    return () => { controller.abort(); };
  }, []);

  const refreshTokens = useCallback(async () => {
    if (!connected) return;
    const gen = ++fetchGenRef.current;
    const unmountSig = unmountControllerRef.current.signal;
    const disconnectSig = getDisconnectSignal?.();
    const disconnectCombined = disconnectSig ? AbortSignal.any([disconnectSig, unmountSig]) : unmountSig;
    const signal = createFetchSignal(disconnectCombined);
    try {
      const setsData = await apiFetch<{ sets: string[]; descriptions?: Record<string, string>; collectionNames?: Record<string, string>; modeNames?: Record<string, string>; counts?: Record<string, number> }>(`${serverUrl}/api/sets`, { signal });
      const allSets: string[] = setsData.sets || [];
      if (gen !== fetchGenRef.current || signal.aborted) return;
      setSets(allSets);
      setSetDescriptions(setsData.descriptions || {});
      setSetCollectionNames(setsData.collectionNames || {});
      setSetModeNames(setsData.modeNames || {});
      setSetTokenCounts(setsData.counts || {});

      setFetchError(null);

      if (allSets.length === 0) {
        if (activeSetRef.current) {
          internalSetChangeRef.current = true;
          setActiveSet('');
        }
        setTokens([]);
        setTokenRevision(r => r + 1);
        return;
      }

      const current = allSets.includes(activeSetRef.current)
        ? activeSetRef.current
        : allSets[0];
      if (current !== activeSetRef.current) {
        internalSetChangeRef.current = true;
        setActiveSet(current);
      }

      const tokensData = await apiFetch<{ tokens: DTCGGroup }>(`${serverUrl}/api/tokens/${encodeURIComponent(current)}`, { signal });
      if (gen !== fetchGenRef.current || signal.aborted) return;
      setTokens(buildTree(tokensData.tokens || {}));
      setTokenRevision(r => r + 1);
    } catch (err) {
      if (isAbortError(err)) return;
      const isNetworkErr = isNetworkError(err);
      if (isNetworkErr) onNetworkError?.();
      else setFetchError(err instanceof Error ? err.message : 'Failed to fetch tokens');
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
  }, [activeSet, refreshTokens]);

  /** Add a new set to local state without re-fetching from server. */
  const addSetToState = useCallback((name: string, count = 0) => {
    setSets(prev => prev.includes(name) ? prev : [...prev, name]);
    setSetTokenCounts(prev => ({ ...prev, [name]: count }));
  }, []);

  /** Remove a set from all local state maps without re-fetching. */
  const removeSetFromState = useCallback((name: string) => {
    setSets(prev => prev.filter(s => s !== name));
    setSetTokenCounts(prev => { const next = { ...prev }; delete next[name]; return next; });
    setSetDescriptions(prev => { const next = { ...prev }; delete next[name]; return next; });
    setSetCollectionNames(prev => { const next = { ...prev }; delete next[name]; return next; });
    setSetModeNames(prev => { const next = { ...prev }; delete next[name]; return next; });
  }, []);

  /** Rename a set across all local state maps without re-fetching. */
  const renameSetInState = useCallback((oldName: string, newName: string) => {
    setSets(prev => prev.map(s => s === oldName ? newName : s));
    setSetTokenCounts(prev => { const next = { ...prev }; if (oldName in next) { next[newName] = next[oldName]; delete next[oldName]; } return next; });
    setSetDescriptions(prev => { const next = { ...prev }; if (oldName in next) { next[newName] = next[oldName] ?? ''; delete next[oldName]; } return next; });
    setSetCollectionNames(prev => { const next = { ...prev }; if (oldName in next) { next[newName] = next[oldName] ?? ''; delete next[oldName]; } return next; });
    setSetModeNames(prev => { const next = { ...prev }; if (oldName in next) { next[newName] = next[oldName] ?? ''; delete next[oldName]; } return next; });
  }, []);

  /** Update only the metadata fields for a set without re-fetching. */
  const updateSetMetadataInState = useCallback((name: string, description: string, collectionName: string, modeName: string) => {
    setSetDescriptions(prev => ({ ...prev, [name]: description }));
    setSetCollectionNames(prev => ({ ...prev, [name]: collectionName }));
    setSetModeNames(prev => ({ ...prev, [name]: modeName }));
  }, []);

  /** Fetch tokens for a specific set without re-fetching the sets list. */
  const fetchTokensForSet = useCallback(async (setName: string) => {
    if (!connected) return;
    if (!setName) {
      setTokens([]);
      setTokenRevision(r => r + 1);
      setFetchError(null);
      return;
    }
    const gen = ++fetchGenRef.current;
    const unmountSig = unmountControllerRef.current.signal;
    const disconnectSig = getDisconnectSignal?.();
    const disconnectCombined = disconnectSig ? AbortSignal.any([disconnectSig, unmountSig]) : unmountSig;
    const signal = createFetchSignal(disconnectCombined);
    try {
      const tokensData = await apiFetch<{ tokens: DTCGGroup }>(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}`, { signal });
      if (gen !== fetchGenRef.current || signal.aborted) return;
      setTokens(buildTree(tokensData.tokens || {}));
      setTokenRevision(r => r + 1);
      setFetchError(null);
    } catch (err) {
      if (isAbortError(err)) return;
      const isNetworkErr = isNetworkError(err);
      if (isNetworkErr) onNetworkError?.();
      else setFetchError(err instanceof Error ? err.message : 'Failed to fetch tokens');
      console.error('Failed to fetch tokens for set:', setName, err);
    }
  }, [serverUrl, connected, onNetworkError, getDisconnectSignal]);

  return { sets, setSets, activeSet, setActiveSet, tokens, tokenRevision, fetchError, setTokenCounts, setDescriptions, setCollectionNames, setModeNames, refreshTokens, addSetToState, removeSetFromState, renameSetInState, updateSetMetadataInState, fetchTokensForSet };
}

async function fetchAllSets(serverUrl: string, signal?: AbortSignal): Promise<{
  flat: Record<string, TokenMapEntry>;
  pathToSet: Record<string, string>;
  perSetFlat: Record<string, Record<string, TokenMapEntry>>;
}> {
  const baseSignal = signal
    ? AbortSignal.any([AbortSignal.timeout(5000), signal])
    : AbortSignal.timeout(5000);
  const setsData = await apiFetch<{ sets: string[] }>(`${serverUrl}/api/sets`, { signal: baseSignal });
  const setNames: string[] = setsData.sets || [];

  const results = await Promise.allSettled(
    setNames.map(async (setName) => {
      const perSetSignal = signal
        ? AbortSignal.any([AbortSignal.timeout(5000), signal])
        : AbortSignal.timeout(5000);
      const data = await apiFetch<{ tokens: DTCGGroup }>(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}`, { signal: perSetSignal });
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

export async function fetchAllTokensFlat(serverUrl: string, signal?: AbortSignal): Promise<Record<string, TokenMapEntry>> {
  return (await fetchAllSets(serverUrl, signal)).flat;
}

export async function fetchAllTokensFlatWithSets(serverUrl: string, signal?: AbortSignal): Promise<{
  flat: Record<string, TokenMapEntry>;
  pathToSet: Record<string, string>;
  perSetFlat: Record<string, Record<string, TokenMapEntry>>;
}> {
  return fetchAllSets(serverUrl, signal);
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
      const grp = value as import('@tokenmanager/core').DTCGGroup;
      const rawScopes = grp.$extensions?.['com.figma.scopes'];
      const tokenManager = grp.$extensions?.['tokenmanager'] as Record<string, unknown> | undefined;
      const lifecycle = tokenManager?.lifecycle;
      nodes.push({
        path,
        name: key,
        $type: grp.$type,
        $description: grp.$description,
        $extensions: grp.$extensions,
        $scopes: Array.isArray(rawScopes) ? rawScopes.filter((scope): scope is string => typeof scope === 'string') : undefined,
        $lifecycle: lifecycle === 'draft' || lifecycle === 'deprecated' || lifecycle === 'published' ? lifecycle : undefined,
        isGroup: true,
        children: buildTree(grp, path),
      });
    }
  }
  return nodes;
}
