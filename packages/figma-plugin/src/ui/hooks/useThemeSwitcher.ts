import { getPluginMessageFromEvent, postPluginMessage } from '../../shared/utils';
import { getErrorMessage } from '../shared/utils';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { apiFetch, createFetchSignal } from '../shared/apiFetch';
import type { TokenMapEntry } from '../../shared/types';
import { STORAGE_KEYS, lsGetJson, lsSetJson } from '../shared/storage';
import type { ThemeDimension } from '@tokenmanager/core';
import { applyThemeSelectionsToTokens } from '../shared/themeModeUtils';

export function useThemeSwitcher(
  serverUrl: string,
  connected: boolean,
  tokenRevision: number,
  allTokensFlat: Record<string, TokenMapEntry>,
  pathToSet: Record<string, string>,
) {
  const [dimensions, setDimensions] = useState<ThemeDimension[]>([]);
  const [themesError, setThemesError] = useState<string | null>(null);
  const [activeThemes, setActiveThemesState] = useState<Record<string, string>>(() =>
    lsGetJson<Record<string, string>>(STORAGE_KEYS.ACTIVE_THEMES, {})
  );
  const activeThemesRef = useRef(activeThemes);
  activeThemesRef.current = activeThemes;
  const setActiveThemes = useCallback((map: Record<string, string>) => {
    lsSetJson(STORAGE_KEYS.ACTIVE_THEMES, map);
    postPluginMessage({ type: 'set-active-themes', themes: map });
    setActiveThemesState(map);
  }, []);

  // Preview state: hover over an option to see its values without committing
  const [previewThemes, setPreviewThemes] = useState<Record<string, string>>({});

  // Whether Figma clientStorage has responded with the per-file active themes.
  // Used to guard against fetchThemesInner pruning against a stale localStorage value
  // before the real Figma value arrives.
  const figmaThemesReadyRef = useRef(false);
  // Dimensions received before Figma clientStorage responded; pruned once it arrives.
  const pendingDimensionsForPruneRef = useRef<ThemeDimension[] | null>(null);

  // Load per-file active themes from clientStorage on mount
  useEffect(() => {
    if (!postPluginMessage({ type: 'get-active-themes' })) {
      figmaThemesReadyRef.current = true;
      return;
    }

    const handler = (e: MessageEvent) => {
      const msg = getPluginMessageFromEvent<{ type?: string; themes?: Record<string, string> }>(e);
      if (msg?.type === 'active-themes-loaded') {
        figmaThemesReadyRef.current = true;
        const figmaThemes: Record<string, string> = msg.themes ?? {};
        // Write through so localStorage and the plugin stay in sync with the Figma value.
        setActiveThemes(figmaThemes);
        // If fetchThemesInner already completed, run the deferred prune now using
        // the Figma-loaded value (not the stale localStorage value).
        const pending = pendingDimensionsForPruneRef.current;
        if (pending !== null) {
          pendingDimensionsForPruneRef.current = null;
          const next: Record<string, string> = {};
          for (const dim of pending) {
            if (figmaThemes[dim.id] && dim.options.some(o => o.name === figmaThemes[dim.id])) {
              next[dim.id] = figmaThemes[dim.id];
            }
          }
          setActiveThemes(next);
        }
        window.removeEventListener('message', handler);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [setActiveThemes]);

  const [openDimDropdown, setOpenDimDropdown] = useState<string | null>(null);
  const dimDropdownRef = useRef<HTMLDivElement>(null);
  const [dimBarExpanded, setDimBarExpanded] = useState(false);

  // Fetch dimensions — abort stale requests when tokens/connection changes
  const abortRef = useRef<AbortController | null>(null);

  const fetchThemesInner = useCallback((signal: AbortSignal) => {
    if (!connected) return;
    setThemesError(null);
    apiFetch<{ dimensions?: ThemeDimension[] }>(`${serverUrl}/api/themes`, { signal: createFetchSignal(signal) })
      .then(data => {
        if (signal.aborted) return;
        const all: ThemeDimension[] = data.dimensions || [];
        setDimensions(all);
        if (!figmaThemesReadyRef.current) {
          // Figma clientStorage hasn't responded yet. Defer the prune so we don't clobber
          // the real per-file themes with a stale localStorage value.
          pendingDimensionsForPruneRef.current = all;
          return;
        }
        // Remove active entries whose dimension or option no longer exists
        const prev = activeThemesRef.current;
        const next: Record<string, string> = {};
        for (const dim of all) {
          if (prev[dim.id] && dim.options.some(o => o.name === prev[dim.id])) {
            next[dim.id] = prev[dim.id];
          }
        }
        setActiveThemes(next);
      })
      .catch(err => {
        if (signal.aborted) return;
        setThemesError(getErrorMessage(err, 'Failed to load themes'));
      });
  }, [connected, serverUrl, setActiveThemes]);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    fetchThemesInner(controller.signal);
    return () => controller.abort();
  }, [fetchThemesInner, tokenRevision]);

  const fetchThemes = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    fetchThemesInner(controller.signal);
  }, [fetchThemesInner]);

  // Close dimension dropdown on outside click
  useEffect(() => {
    if (!openDimDropdown) return;
    const handler = (e: MouseEvent) => {
      if (dimDropdownRef.current && !dimDropdownRef.current.contains(e.target as Node)) setOpenDimDropdown(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openDimDropdown]);

  // Compute theme-resolved allTokensFlat from token-level mode values.
  // Preview selections override the committed view for the hovered dimension.
  const themedAllTokensFlat = useMemo(() => {
    const effectiveThemes = { ...activeThemes, ...previewThemes };
    return applyThemeSelectionsToTokens(allTokensFlat, dimensions, effectiveThemes);
  }, [activeThemes, previewThemes, dimensions, allTokensFlat]);

  return {
    dimensions,
    setDimensions,
    activeThemes,
    setActiveThemes,
    previewThemes,
    setPreviewThemes,
    openDimDropdown,
    setOpenDimDropdown,
    dimBarExpanded,
    setDimBarExpanded,
    dimDropdownRef,
    themedAllTokensFlat,
    themesError,
    retryThemes: fetchThemes,
  };
}
