import { useState, useEffect, useRef, useMemo } from 'react';
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
  const [activeThemes, setActiveThemesState] = useState<Record<string, string>>(() =>
    lsGetJson<Record<string, string>>(STORAGE_KEYS.ACTIVE_THEMES, {})
  );
  const setActiveThemes = (map: Record<string, string>) => {
    lsSetJson(STORAGE_KEYS.ACTIVE_THEMES, map);
    parent.postMessage({ pluginMessage: { type: 'set-active-themes', themes: map } }, '*');
    setActiveThemesState(map);
  };

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

  // Fetch dimensions
  useEffect(() => {
    if (!connected) return;
    fetch(`${serverUrl}/api/themes`, { signal: AbortSignal.timeout(5000) })
      .then(r => r.json())
      .then(data => {
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
          return next;
        });
      })
      .catch(() => {});
  }, [connected, serverUrl, tokens]);

  // Close dimension dropdown on outside click
  useEffect(() => {
    if (!openDimDropdown) return;
    const handler = (e: MouseEvent) => {
      if (dimDropdownRef.current && !dimDropdownRef.current.contains(e.target as Node)) setOpenDimDropdown(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openDimDropdown]);

  // Compute theme-resolved allTokensFlat from all active dimension options
  const themedAllTokensFlat = useMemo(() => {
    const activeEntries = Object.keys(activeThemes);
    if (activeEntries.length === 0) return allTokensFlat;
    const merged: Record<string, TokenMapEntry> = {};
    // Iterate dimensions in order; for each, apply the active option's source then enabled sets
    for (const dim of dimensions) {
      const activeOptionName = activeThemes[dim.id];
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
  }, [activeThemes, dimensions, allTokensFlat, pathToSet]);

  return {
    dimensions,
    setDimensions,
    activeThemes,
    setActiveThemes,
    openDimDropdown,
    setOpenDimDropdown,
    dimBarExpanded,
    setDimBarExpanded,
    dimDropdownRef,
    themedAllTokensFlat,
  };
}
