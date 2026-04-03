/**
 * useResolvers — manages DTCG v2025.10 resolver configs and resolution.
 *
 * Fetches resolver list from the server, lets the user select a resolver
 * and modifier inputs, then resolves tokens and returns them as a flat
 * TokenMapEntry record for display alongside existing theme-based tokens.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getErrorMessage } from '../shared/utils';
import { apiFetch } from '../shared/apiFetch';
import type { TokenMapEntry } from '../../shared/types';
import type { TokenValue, TokenReference } from '@tokenmanager/core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResolverMeta {
  name: string;
  description?: string;
  modifiers: Record<string, { contexts: string[]; default?: string }>;
}

export interface ResolverModifierMeta {
  description?: string;
  contexts: string[];
  default?: string;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useResolvers(serverUrl: string, connected: boolean) {
  const [resolvers, setResolvers] = useState<ResolverMeta[]>([]);
  const [activeResolver, setActiveResolverState] = useState<string | null>(null);
  const [resolverInput, setResolverInput] = useState<Record<string, string>>({});
  const [resolvedTokens, setResolvedTokens] = useState<Record<string, TokenMapEntry> | null>(null);
  const [resolverError, setResolverError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  // -----------------------------------------------------------------------
  // Fetch resolver list
  // -----------------------------------------------------------------------
  const fetchResolvers = useCallback(() => {
    if (!connected) return;
    apiFetch<{ resolvers: ResolverMeta[] }>(`${serverUrl}/api/resolvers`)
      .then(data => {
        setResolvers(data.resolvers ?? []);
      })
      .catch(err => {
        setResolverError(getErrorMessage(err, 'Failed to load resolvers'));
      });
  }, [connected, serverUrl]);

  useEffect(() => {
    fetchResolvers();
  }, [fetchResolvers]);

  // -----------------------------------------------------------------------
  // Select active resolver
  // -----------------------------------------------------------------------
  const setActiveResolver = useCallback((name: string | null) => {
    setActiveResolverState(name);
    if (name) {
      // Set default inputs from the resolver metadata
      const meta = resolvers.find(r => r.name === name);
      if (meta) {
        const defaults: Record<string, string> = {};
        for (const [modName, mod] of Object.entries(meta.modifiers)) {
          defaults[modName] = mod.default ?? mod.contexts[0] ?? '';
        }
        setResolverInput(defaults);
      }
    } else {
      setResolverInput({});
      setResolvedTokens(null);
    }
  }, [resolvers]);

  // -----------------------------------------------------------------------
  // Resolve tokens when active resolver or input changes
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!activeResolver || !connected) {
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
        signal: controller.signal,
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
  // Create resolver from themes (migration)
  // -----------------------------------------------------------------------
  const convertFromThemes = useCallback(async (name?: string) => {
    const result = await apiFetch(`${serverUrl}/api/resolvers/from-themes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name || 'theme-resolver' }),
    });
    fetchResolvers();
    return result;
  }, [serverUrl, fetchResolvers]);

  // -----------------------------------------------------------------------
  // Delete resolver
  // -----------------------------------------------------------------------
  const deleteResolver = useCallback(async (name: string) => {
    await apiFetch(`${serverUrl}/api/resolvers/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    });
    if (activeResolver === name) {
      setActiveResolverState(null);
      setResolvedTokens(null);
    }
    fetchResolvers();
  }, [serverUrl, activeResolver, fetchResolvers]);

  // -----------------------------------------------------------------------
  // Fetch full resolver file (for editing)
  // -----------------------------------------------------------------------
  const getResolverFile = useCallback(async (name: string): Promise<import('@tokenmanager/core').ResolverFile> => {
    const data = await apiFetch<{ name: string } & import('@tokenmanager/core').ResolverFile>(
      `${serverUrl}/api/resolvers/${encodeURIComponent(name)}`,
    );
    // Strip the outer `name` field (resolver identifier from params) before returning file body
    const { name: _n, ...file } = data;
    void _n;
    return file as import('@tokenmanager/core').ResolverFile;
  }, [serverUrl]);

  // -----------------------------------------------------------------------
  // Update resolver (PUT full file)
  // -----------------------------------------------------------------------
  const updateResolver = useCallback(async (name: string, file: import('@tokenmanager/core').ResolverFile) => {
    await apiFetch(`${serverUrl}/api/resolvers/${encodeURIComponent(name)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(file),
    });
    fetchResolvers();
  }, [serverUrl, fetchResolvers]);

  return {
    resolvers,
    activeResolver,
    setActiveResolver,
    resolverInput,
    setResolverInput,
    resolvedTokens,
    activeModifiers,
    resolverError,
    loading,
    fetchResolvers,
    convertFromThemes,
    deleteResolver,
    getResolverFile,
    updateResolver,
  };
}
