import { getPluginMessageFromEvent, postPluginMessage } from '../../shared/utils';
import { getErrorMessage } from '../shared/utils';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { apiFetch, createFetchSignal } from '../shared/apiFetch';
import type { TokenMapEntry } from '../../shared/types';
import { STORAGE_KEYS, lsGetJson, lsSetJson } from '../shared/storage';
import {
  deserializeTokenCollections,
  type SelectedModes,
  type SerializedTokenCollection,
  type TokenCollection,
} from '@tokenmanager/core';
import { applyModeSelectionsToTokens } from '../shared/collectionModeUtils';

export function useCollectionSwitcher(
  serverUrl: string,
  connected: boolean,
  tokenRevision: number,
  allTokensFlat: Record<string, TokenMapEntry>,
  pathToCollectionId: Record<string, string>,
) {
  const [collections, setCollections] = useState<TokenCollection[]>([]);
  const [collectionsError, setCollectionsError] = useState<string | null>(null);
  const [selectedModes, setSelectedModesState] = useState<SelectedModes>(() =>
    lsGetJson<SelectedModes>(STORAGE_KEYS.ACTIVE_MODES, {})
  );
  const selectedModesRef = useRef(selectedModes);
  selectedModesRef.current = selectedModes;
  const setSelectedModes = useCallback((map: SelectedModes) => {
    lsSetJson(STORAGE_KEYS.ACTIVE_MODES, map);
    postPluginMessage({ type: 'set-active-themes', themes: map });
    setSelectedModesState(map);
  }, []);

  // Hover preview state: preview a collection mode without committing it.
  const [hoverPreviewModes, setHoverPreviewModes] = useState<SelectedModes>({});

  // Whether Figma clientStorage has responded with the per-file selected modes.
  // Used to guard against fetchCollectionsInner pruning against a stale localStorage value
  // before the real Figma value arrives.
  const figmaSelectedModesReadyRef = useRef(false);
  // Collections received before Figma clientStorage responded; pruned once it arrives.
  const pendingCollectionsForPruneRef = useRef<TokenCollection[] | null>(null);

  // Load per-file selected modes from clientStorage on mount.
  useEffect(() => {
    if (!postPluginMessage({ type: 'get-active-themes' })) {
      figmaSelectedModesReadyRef.current = true;
      return;
    }

    const handler = (e: MessageEvent) => {
      const msg = getPluginMessageFromEvent<{ type?: string; themes?: SelectedModes }>(e);
      if (msg?.type === 'active-themes-loaded') {
        figmaSelectedModesReadyRef.current = true;
        const figmaSelectedModes: SelectedModes = msg.themes ?? {};
        // Write through so localStorage and the plugin stay in sync with the Figma value.
        setSelectedModes(figmaSelectedModes);
        // If fetchCollectionsInner already completed, run the deferred prune now using
        // the Figma-loaded value (not the stale localStorage value).
        const pending = pendingCollectionsForPruneRef.current;
        if (pending !== null) {
          pendingCollectionsForPruneRef.current = null;
          const next: SelectedModes = {};
          for (const col of pending) {
            if (figmaSelectedModes[col.id] && col.modes.some(o => o.name === figmaSelectedModes[col.id])) {
              next[col.id] = figmaSelectedModes[col.id];
            }
          }
          setSelectedModes(next);
        }
        window.removeEventListener('message', handler);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [setSelectedModes]);

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
    apiFetch<{ collections?: SerializedTokenCollection[] }>(`${serverUrl}/api/collections`, { signal: createFetchSignal(signal) })
      .then(data => {
        if (signal.aborted) return;
        const all = deserializeTokenCollections(data.collections ?? []);
        setCollections(all);
        if (!figmaSelectedModesReadyRef.current) {
          // Figma clientStorage hasn't responded yet. Defer the prune so we don't clobber
          // the real per-file modes with a stale localStorage value.
          pendingCollectionsForPruneRef.current = all;
          return;
        }
        // Remove selected entries whose collection or option no longer exists.
        const prev = selectedModesRef.current;
        const next: SelectedModes = {};
        for (const col of all) {
          if (prev[col.id] && col.modes.some(o => o.name === prev[col.id])) {
            next[col.id] = prev[col.id];
          }
        }
        setSelectedModes(next);
      })
      .catch(err => {
        if (signal.aborted) return;
        setCollectionsError(getErrorMessage(err, 'Failed to load collections'));
      });
  }, [connected, serverUrl, setSelectedModes]);

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
  // Hover preview selections override committed selected modes for the hovered collection.
  const modeResolvedTokensFlat = useMemo(() => {
    const effectiveModes = { ...selectedModes, ...hoverPreviewModes };
    return applyModeSelectionsToTokens(
      allTokensFlat,
      collections,
      effectiveModes,
      pathToCollectionId,
    );
  }, [selectedModes, hoverPreviewModes, collections, allTokensFlat, pathToCollectionId]);

  return {
    collections,
    setCollections,
    selectedModes,
    setSelectedModes,
    hoverPreviewModes,
    setHoverPreviewModes,
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
