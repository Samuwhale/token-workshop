/**
 * useResolvers — manages DTCG v2025.10 resolver configs and resolution.
 *
 * Fetches resolver list from the server, lets the user select a resolver
 * and modifier inputs, then resolves tokens and returns them as a flat
 * TokenMapEntry record for display alongside the collection-native token view.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getErrorMessage, isAbortError } from '../shared/utils';
import { apiFetch, createFetchSignal } from '../shared/apiFetch';
import { lsGet, lsSet, lsRemove, lsGetJson, lsSetJson, STORAGE_KEYS } from '../shared/storage';
import { rollbackOperation } from '../shared/tokenMutations';
import type { TokenMapEntry } from '../../shared/types';
import type { TokenValue, TokenReference } from '@token-workshop/core';
import type { UndoSlot } from './useUndo';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResolverMeta {
  name: string;
  description?: string;
  modifiers: Record<string, ResolverModifierMeta>;
  /** Collection ids referenced by this resolver's external sources. */
  referencedCollections: string[];
}

export interface ResolverModifierMeta {
  description?: string;
  contexts: string[];
  default?: string;
}

export type ResolverSelectionOrigin = 'none' | 'restored' | 'manual';

function buildResolverInput(
  meta: ResolverMeta,
  currentInput: Record<string, string> = {},
): Record<string, string> {
  const nextInput: Record<string, string> = {};
  for (const [modName, mod] of Object.entries(meta.modifiers)) {
    nextInput[modName] = currentInput[modName] ?? mod.default ?? mod.contexts[0] ?? '';
  }
  return nextInput;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useResolvers(serverUrl: string, connected: boolean) {
  const initialActiveResolver = lsGet(STORAGE_KEYS.ACTIVE_RESOLVER) ?? null;
  const [resolvers, setResolvers] = useState<ResolverMeta[]>([]);
  const [resolverLoadErrors, setResolverLoadErrors] = useState<Record<string, { message: string; at: string }>>({});
  const [activeResolver, setActiveResolverState] = useState<string | null>(
    () => initialActiveResolver,
  );
  const [selectionOrigin, setSelectionOrigin] = useState<ResolverSelectionOrigin>(
    () => (initialActiveResolver ? 'restored' : 'none'),
  );
  const [resolverInput, setResolverInput] = useState<Record<string, string>>(
    () => lsGetJson<Record<string, string>>(STORAGE_KEYS.RESOLVER_INPUT, {}),
  );
  const [resolvedTokens, setResolvedTokens] = useState<Record<string, TokenMapEntry> | null>(null);
  const [resolverError, setResolverError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resolversLoading, setResolversLoading] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  // Late-bound ref for undo — set by the consumer (App.tsx) after mount
  const pushUndoRef = useRef<((slot: UndoSlot) => void) | undefined>(undefined);
  const setPushUndo = useCallback((fn: ((slot: UndoSlot) => void) | undefined) => {
    pushUndoRef.current = fn;
  }, []);
  // Aborted on component unmount to prevent state updates on stale instances.
  const unmountAbortRef = useRef<AbortController>(new AbortController());

  useEffect(() => {
    unmountAbortRef.current = new AbortController();
    return () => unmountAbortRef.current.abort();
  }, []);

  // -----------------------------------------------------------------------
  // Persist active resolver + input to localStorage
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (activeResolver) {
      lsSet(STORAGE_KEYS.ACTIVE_RESOLVER, activeResolver);
    } else {
      lsRemove(STORAGE_KEYS.ACTIVE_RESOLVER);
    }
  }, [activeResolver]);

  useEffect(() => {
    lsSetJson(STORAGE_KEYS.RESOLVER_INPUT, resolverInput);
  }, [resolverInput]);

  // -----------------------------------------------------------------------
  // Fetch resolver list
  // -----------------------------------------------------------------------
  const fetchResolvers = useCallback(() => {
    if (!connected) return;
    const signal = createFetchSignal(unmountAbortRef.current.signal);
    setResolversLoading(true);
    apiFetch<{ resolvers: ResolverMeta[]; loadErrors?: Record<string, { message: string; at: string }> }>(`${serverUrl}/api/resolvers`, { signal })
      .then(data => {
        if (unmountAbortRef.current.signal.aborted) return;
        const nextResolvers = data.resolvers ?? [];
        setResolvers(nextResolvers);
        setResolverLoadErrors(data.loadErrors ?? {});
        if (activeResolver) {
          const activeMeta = nextResolvers.find(resolver => resolver.name === activeResolver);
          if (!activeMeta) {
            setActiveResolverState(null);
            setSelectionOrigin('none');
            setResolverInput({});
            setResolvedTokens(null);
            setResolverError(null);
          } else {
            setResolverInput(prev => buildResolverInput(activeMeta, prev));
          }
        } else {
          setResolverError(null);
        }
      })
      .catch(err => {
        if (isAbortError(err)) return;
        if (unmountAbortRef.current.signal.aborted) return;
        setResolverError(getErrorMessage(err, 'Failed to load resolvers'));
      })
      .finally(() => {
        if (!unmountAbortRef.current.signal.aborted) setResolversLoading(false);
      });
  }, [activeResolver, connected, serverUrl]);

  useEffect(() => {
    fetchResolvers();
  }, [fetchResolvers]);

  // -----------------------------------------------------------------------
  // Select active resolver
  // -----------------------------------------------------------------------
  const setActiveResolver = useCallback((name: string | null) => {
    setActiveResolverState(name);
    setSelectionOrigin(name ? 'manual' : 'none');
    if (name) {
      // Set default inputs from the resolver metadata
      const meta = resolvers.find(r => r.name === name);
      if (meta) {
        setResolverInput(buildResolverInput(meta));
      }
    } else {
      setResolverInput({});
      setResolvedTokens(null);
      setResolverError(null);
    }
  }, [resolvers]);

  // -----------------------------------------------------------------------
  // Resolve tokens when active resolver or input changes
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!activeResolver || !connected) {
      abortRef.current?.abort();
      setLoading(false);
      setResolverError(null);
      setResolvedTokens(null);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    apiFetch<{ tokens: Record<string, { $value: unknown; $type?: string; $description?: string }> }>(
      `${serverUrl}/api/resolvers/${encodeURIComponent(activeResolver)}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: resolverInput }),
        signal: createFetchSignal(controller.signal),
      })
      .then(data => {
        if (controller.signal.aborted) return;
        // Convert to TokenMapEntry format
        const entries: Record<string, TokenMapEntry> = {};
        for (const [path, token] of Object.entries(data.tokens)) {
          const name = path.includes('.') ? path.slice(path.lastIndexOf('.') + 1) : path;
          entries[path] = {
            $value: token.$value as TokenValue | TokenReference,
            $type: token.$type ?? 'unknown',
            $name: name,
          };
        }
        setResolvedTokens(entries);
        setResolverError(null);
      })
      .catch(err => {
        if (controller.signal.aborted) return;
        setResolverError(getErrorMessage(err, 'Failed to resolve tokens'));
        setResolvedTokens(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [activeResolver, resolverInput, connected, serverUrl]);

  // -----------------------------------------------------------------------
  // Modifier metadata for active resolver
  // -----------------------------------------------------------------------
  const activeModifiers = useMemo((): Record<string, ResolverModifierMeta> => {
    if (!activeResolver) return {};
    const meta = resolvers.find(r => r.name === activeResolver);
    return meta?.modifiers ?? {};
  }, [activeResolver, resolvers]);

  // -----------------------------------------------------------------------
  // Delete resolver
  // -----------------------------------------------------------------------
  const deleteResolver = useCallback(async (name: string) => {
    const result = await apiFetch<{ ok: true; operationId?: string }>(
      `${serverUrl}/api/resolvers/${encodeURIComponent(name)}`,
      { method: 'DELETE' },
    );
    if (activeResolver === name) {
      setActiveResolverState(null);
      setResolvedTokens(null);
    }
    fetchResolvers();

    if (pushUndoRef.current && result.operationId) {
      const opId = result.operationId;
      const url = serverUrl;
      pushUndoRef.current({
        description: `Deleted resolver "${name}"`,
        restore: async () => {
          await rollbackOperation(url, opId);
          fetchResolvers();
        },
      });
    }
  }, [serverUrl, activeResolver, fetchResolvers]);

  // -----------------------------------------------------------------------
  // Fetch full resolver file (for editing)
  // -----------------------------------------------------------------------
  const getResolverFile = useCallback(async (name: string): Promise<import('@token-workshop/core').ResolverFile> => {
    const data = await apiFetch<{ name: string } & import('@token-workshop/core').ResolverFile>(
      `${serverUrl}/api/resolvers/${encodeURIComponent(name)}`,
    );
    // Strip the outer `name` field (resolver identifier from params) before returning file body
    const { name: _n, ...file } = data;
    void _n;
    return file as import('@token-workshop/core').ResolverFile;
  }, [serverUrl]);

  // -----------------------------------------------------------------------
  // Update resolver (PUT full file)
  // -----------------------------------------------------------------------
  const updateResolver = useCallback(async (name: string, file: import('@token-workshop/core').ResolverFile) => {
    await apiFetch(`${serverUrl}/api/resolvers/${encodeURIComponent(name)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(file),
    });
    fetchResolvers();
  }, [serverUrl, fetchResolvers]);

  return useMemo(() => ({
    resolvers,
    resolverLoadErrors,
    activeResolver,
    selectionOrigin,
    setActiveResolver,
    resolverInput,
    setResolverInput,
    resolvedTokens,
    activeModifiers,
    resolverError,
    loading,
    resolversLoading,
    fetchResolvers,
    deleteResolver,
    getResolverFile,
    updateResolver,
    setPushUndo,
  }), [
    resolvers,
    resolverLoadErrors,
    activeResolver,
    selectionOrigin,
    setActiveResolver,
    resolverInput,
    setResolverInput,
    resolvedTokens,
    activeModifiers,
    resolverError,
    loading,
    resolversLoading,
    fetchResolvers,
    deleteResolver,
    getResolverFile,
    updateResolver,
    setPushUndo,
  ]);
}
