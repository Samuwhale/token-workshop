import { getPluginMessageFromEvent, postPluginMessage } from '../../shared/utils';
import { getErrorMessage } from '../shared/utils';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { apiFetch, createFetchSignal } from '../shared/apiFetch';
import type { TokenMapEntry } from '../../shared/types';
import { STORAGE_KEYS, lsGetJson, lsSetJson } from '../shared/storage';
import type { CollectionDefinition } from '@tokenmanager/core';
import { applyModeSelectionsToTokens } from '../shared/collectionModeUtils';

export function useCollectionSwitcher(
  serverUrl: string,
  connected: boolean,
  tokenRevision: number,
  allTokensFlat: Record<string, TokenMapEntry>,
  pathToSet: Record<string, string>,
) {
  const [collections, setCollections] = useState<CollectionDefinition[]>([]);
  const [collectionsError, setCollectionsError] = useState<string | null>(null);
  const [activeModes, setActiveModesState] = useState<Record<string, string>>(() =>
    lsGetJson<Record<string, string>>(STORAGE_KEYS.ACTIVE_MODES, {})
  );
  const activeModesRef = useRef(activeModes);
  activeModesRef.current = activeModes;
  const setActiveModes = useCallback((map: Record<string, string>) => {
    lsSetJson(STORAGE_KEYS.ACTIVE_MODES, map);
    postPluginMessage({ type: 'set-active-themes', themes: map });
    setActiveModesState(map);
  }, []);

  // Preview state: hover over an option to see its values without committing
  const [previewModes, setPreviewModes] = useState<Record<string, string>>({});

  // Whether Figma clientStorage has responded with the per-file active modes.
  // Used to guard against fetchCollectionsInner pruning against a stale localStorage value
  // before the real Figma value arrives.
  const figmaModesReadyRef = useRef(false);
  // Collections received before Figma clientStorage responded; pruned once it arrives.
  const pendingCollectionsForPruneRef = useRef<CollectionDefinition[] | null>(null);

  // Load per-file active modes from clientStorage on mount
  useEffect(() => {
    if (!postPluginMessage({ type: 'get-active-themes' })) {
      figmaModesReadyRef.current = true;
      return;
    }

    const handler = (e: MessageEvent) => {
      const msg = getPluginMessageFromEvent<{ type?: string; themes?: Record<string, string> }>(e);
      if (msg?.type === 'active-themes-loaded') {
        figmaModesReadyRef.current = true;
        const figmaModes: Record<string, string> = msg.themes ?? {};
        // Write through so localStorage and the plugin stay in sync with the Figma value.
        setActiveModes(figmaModes);
        // If fetchCollectionsInner already completed, run the deferred prune now using
        // the Figma-loaded value (not the stale localStorage value).
        const pending = pendingCollectionsForPruneRef.current;
        if (pending !== null) {
          pendingCollectionsForPruneRef.current = null;
          const next: Record<string, string> = {};
          for (const col of pending) {
            if (figmaModes[col.id] && col.options.some(o => o.name === figmaModes[col.id])) {
              next[col.id] = figmaModes[col.id];
            }
          }
          setActiveModes(next);
        }
        window.removeEventListener('message', handler);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [setActiveModes]);

  const [openCollectionDropdown, setOpenCollectionDropdown] = useState<string | null>(null);
  const collectionDropdownRef = useRef<HTMLDivElement>(null);
  const [collectionBarExpanded, setCollectionBarExpanded] = useState(false);

  // Fetch collections — abort stale requests when tokens/connection changes
  const abortRef = useRef<AbortController | null>(null);

  const fetchCollectionsInner = useCallback((signal: AbortSignal) => {
    if (!connected) {
      pendingCollectionsForPruneRef.current = null;
      setCollections([]);
      setCollectionsError(null);
      return;
    }
    setCollectionsError(null);
    apiFetch<{ collections?: CollectionDefinition[] }>(`${serverUrl}/api/collections`, { signal: createFetchSignal(signal) })
      .then(data => {
        if (signal.aborted) return;
        const all: CollectionDefinition[] = data.collections || [];
        setCollections(all);
        if (!figmaModesReadyRef.current) {
          // Figma clientStorage hasn't responded yet. Defer the prune so we don't clobber
          // the real per-file modes with a stale localStorage value.
          pendingCollectionsForPruneRef.current = all;
          return;
        }
        // Remove active entries whose collection or option no longer exists
        const prev = activeModesRef.current;
        const next: Record<string, string> = {};
        for (const col of all) {
          if (prev[col.id] && col.options.some(o => o.name === prev[col.id])) {
            next[col.id] = prev[col.id];
          }
        }
        setActiveModes(next);
      })
      .catch(err => {
        if (signal.aborted) return;
        setCollectionsError(getErrorMessage(err, 'Failed to load collections'));
      });
  }, [connected, serverUrl, setActiveModes]);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    fetchCollectionsInner(controller.signal);
    return () => controller.abort();
  }, [fetchCollectionsInner, tokenRevision]);

  const fetchCollections = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    fetchCollectionsInner(controller.signal);
  }, [fetchCollectionsInner]);

  // Close collection dropdown on outside click
  useEffect(() => {
    if (!openCollectionDropdown) return;
    const handler = (e: MouseEvent) => {
      if (collectionDropdownRef.current && !collectionDropdownRef.current.contains(e.target as Node)) setOpenCollectionDropdown(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openCollectionDropdown]);

  // Compute mode-resolved allTokensFlat from token-level mode values.
  // Preview selections override the committed view for the hovered collection.
  const modeResolvedTokensFlat = useMemo(() => {
    const effectiveModes = { ...activeModes, ...previewModes };
    return applyModeSelectionsToTokens(
      allTokensFlat,
      collections,
      effectiveModes,
      pathToSet,
    );
  }, [activeModes, previewModes, collections, allTokensFlat, pathToSet]);

  return {
    collections,
    setCollections,
    activeModes,
    setActiveModes,
    previewModes,
    setPreviewModes,
    openCollectionDropdown,
    setOpenCollectionDropdown,
    collectionBarExpanded,
    setCollectionBarExpanded,
    collectionDropdownRef,
    modeResolvedTokensFlat,
    collectionsError,
    retryCollections: fetchCollections,
  };
}
