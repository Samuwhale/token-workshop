import { getErrorMessage } from '../shared/utils';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { TokenMapEntry } from '../../shared/types';
import { resolveAllAliases } from '../../shared/resolveAlias';
import { STORAGE_KEYS, lsGetJson, lsSetJson } from '../shared/storage';
import type { ThemeOption, ThemeDimension } from '@tokenmanager/core';

export function useThemeSwitcher(
  serverUrl: string,
  connected: boolean,
  tokens: unknown[],
  allTokensFlat: Record<string, TokenMapEntry>,
  pathToSet: Record<string, string>,
) {
  const [dimensions, setDimensions] = useState<ThemeDimension[]>([]);
  const [themesError, setThemesError] = useState<string | null>(null);
  const [activeThemes, setActiveThemesState] = useState<Record<string, string>>(() =>
    lsGetJson<Record<string, string>>(STORAGE_KEYS.ACTIVE_THEMES, {})
  );
  const setActiveThemes = (map: Record<string, string>) => {
    lsSetJson(STORAGE_KEYS.ACTIVE_THEMES, map);
    parent.postMessage({ pluginMessage: { type: 'set-active-themes', themes: map } }, '*');
    setActiveThemesState(map);
  };

  // Preview state: hover over an option to see its values without committing
  const [previewThemes, setPreviewThemes] = useState<Record<string, string>>({});

  // Load per-file active themes from clientStorage on mount
  useEffect(() => {
    parent.postMessage({ pluginMessage: { type: 'get-active-themes' } }, '*');
    const handler = (e: MessageEvent) => {
      const msg = e.data?.pluginMessage;
      if (msg?.type === 'active-themes-loaded') {
        setActiveThemesState(msg.themes ?? {});
        window.removeEventListener('message', handler);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const [openDimDropdown, setOpenDimDropdown] = useState<string | null>(null);
  const dimDropdownRef = useRef<HTMLDivElement>(null);
  const [dimBarExpanded, setDimBarExpanded] = useState(false);

  // Fetch dimensions — abort stale requests when tokens/connection changes
  const abortRef = useRef<AbortController | null>(null);

  const fetchThemesInner = useCallback((signal: AbortSignal) => {
    if (!connected) return;
    setThemesError(null);
    fetch(`${serverUrl}/api/themes`, { signal })
      .then(r => {
        if (!r.ok) throw new Error(`Server returned ${r.status}`);
        return r.json();
      })
      .then(data => {
        if (signal.aborted) return;
        const all: ThemeDimension[] = data.dimensions || [];
        setDimensions(all);
        // Remove active entries whose dimension or option no longer exists
        setActiveThemesState(prev => {
          const next: Record<string, string> = {};
          for (const dim of all) {
            if (prev[dim.id] && dim.options.some(o => o.name === prev[dim.id])) {
              next[dim.id] = prev[dim.id];
            }
          }
          // Persist cleaned map to localStorage + Figma clientStorage
          lsSetJson(STORAGE_KEYS.ACTIVE_THEMES, next);
          parent.postMessage({ pluginMessage: { type: 'set-active-themes', themes: next } }, '*');
          return next;
        });
      })
      .catch(err => {
        if (signal.aborted) return;
        setThemesError(getErrorMessage(err, 'Failed to load themes'));
      });
  }, [connected, serverUrl]);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    fetchThemesInner(controller.signal);
    return () => controller.abort();
  }, [fetchThemesInner, tokens]);

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

  // Compute theme-resolved allTokensFlat from all active/preview dimension options
  // Preview overrides active for the specific dimension being hovered
  const themedAllTokensFlat = useMemo(() => {
    const effectiveThemes = { ...activeThemes, ...previewThemes };
    const activeEntries = Object.keys(effectiveThemes);
    if (activeEntries.length === 0) return allTokensFlat;

    // Collect all set names referenced by any dimension option (themed sets)
    const themedSets = new Set<string>();
    for (const dim of dimensions) {
      for (const option of dim.options) {
        for (const setName of Object.keys(option.sets)) {
          themedSets.add(setName);
        }
      }
    }

    // Base layer: tokens from sets not assigned to any dimension
    const merged: Record<string, TokenMapEntry> = {};
    for (const [path, entry] of Object.entries(allTokensFlat)) {
      const set = pathToSet[path];
      if (!set || !themedSets.has(set)) merged[path] = entry;
    }

    // Iterate dimensions in order; for each, apply the effective option's source then enabled sets
    for (const dim of dimensions) {
      const activeOptionName = effectiveThemes[dim.id];
      if (!activeOptionName) continue;
      const option = dim.options.find(o => o.name === activeOptionName);
      if (!option) continue;
      // Source sets first (foundation layer)
      for (const [setName, status] of Object.entries(option.sets)) {
        if (status !== 'source') continue;
        for (const [path, entry] of Object.entries(allTokensFlat)) {
          if (pathToSet[path] === setName) merged[path] = entry;
        }
      }
      // Enabled sets override
      for (const [setName, status] of Object.entries(option.sets)) {
        if (status !== 'enabled') continue;
        for (const [path, entry] of Object.entries(allTokensFlat)) {
          if (pathToSet[path] === setName) merged[path] = entry;
        }
      }
    }
    if (Object.keys(merged).length === 0) return allTokensFlat;
    return resolveAllAliases(merged);
  }, [activeThemes, previewThemes, dimensions, allTokensFlat, pathToSet]);

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
