/**
 * ThemeContext — owns theme-switching, DTCG resolver, and the derived
 * `themedAllTokensFlat` / `setThemeStatusMap` memos.
 *
 * Extracts these hooks/memos from App.tsx so that theme-hover state changes
 * (previewThemes on every hover event) and resolver resolution don't cascade
 * through unrelated domains. Consumers call `useThemeContext()` to subscribe.
 */

import { createContext, useContext, useMemo } from 'react';
import type { RefObject, ReactNode } from 'react';
import { useConnectionContext } from './ConnectionContext';
import { useTokenDataContext } from './TokenDataContext';
import { useThemeSwitcher } from '../hooks/useThemeSwitcher';
import { useResolvers } from '../hooks/useResolvers';
import type { ResolverMeta } from '../hooks/useResolvers';
import type { TokenMapEntry } from '../../shared/types';
import type { ThemeDimension } from '@tokenmanager/core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResolverState {
  resolvers: ResolverMeta[];
  resolverLoadErrors: Record<string, { message: string; at: string }>;
  activeResolver: string | null;
  setActiveResolver: (name: string | null) => void;
  resolverInput: Record<string, string>;
  setResolverInput: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  resolvedTokens: Record<string, TokenMapEntry> | null;
  activeModifiers: Record<string, string>;
  resolverError: string | null;
  loading: boolean;
  resolversLoading: boolean;
  fetchResolvers: () => void;
  convertFromThemes: () => Promise<void>;
  deleteResolver: (name: string) => Promise<void>;
  getResolverFile: (name: string) => Promise<string>;
  updateResolver: (name: string, yaml: string) => Promise<void>;
}

export interface ThemeContextValue {
  // ---- useThemeSwitcher ---------------------------------------------------
  dimensions: ThemeDimension[];
  setDimensions: React.Dispatch<React.SetStateAction<ThemeDimension[]>>;
  activeThemes: Record<string, string>;
  setActiveThemes: (map: Record<string, string>) => void;
  previewThemes: Record<string, string>;
  setPreviewThemes: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  openDimDropdown: string | null;
  setOpenDimDropdown: React.Dispatch<React.SetStateAction<string | null>>;
  dimBarExpanded: boolean;
  setDimBarExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  dimDropdownRef: RefObject<HTMLDivElement>;
  themesError: string | null;
  retryThemes: () => void;

  // ---- useResolvers -------------------------------------------------------
  resolverState: ResolverState;

  // ---- Derived memos ------------------------------------------------------
  /** Tokens resolved through active themes and (if active) resolver override. */
  themedAllTokensFlat: Record<string, TokenMapEntry>;
  /** Per-set theme status: 'enabled' | 'source' | 'disabled'. */
  setThemeStatusMap: Record<string, 'enabled' | 'source' | 'disabled'>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useThemeContext must be used inside ThemeProvider');
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { serverUrl, connected } = useConnectionContext();
  const { tokenRevision, allTokensFlat, pathToSet } = useTokenDataContext();

  const {
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
    themedAllTokensFlat: themeOnlyTokensFlat,
    themesError,
    retryThemes,
  } = useThemeSwitcher(serverUrl, connected, tokenRevision, allTokensFlat, pathToSet);

  const resolverState = useResolvers(serverUrl, connected);

  // When a resolver is active and has resolved tokens, use those; otherwise
  // fall back to the theme-switched tokens.
  const themedAllTokensFlat = useMemo(() => {
    if (
      resolverState.activeResolver &&
      resolverState.resolvedTokens &&
      Object.keys(resolverState.resolvedTokens).length > 0
    ) {
      return resolverState.resolvedTokens;
    }
    return themeOnlyTokensFlat;
  }, [resolverState.activeResolver, resolverState.resolvedTokens, themeOnlyTokensFlat]);

  // Compute per-set theme status from active dimension options
  // (enabled > source > disabled precedence).
  const setThemeStatusMap = useMemo((): Record<string, 'enabled' | 'source' | 'disabled'> => {
    const result: Record<string, 'enabled' | 'source' | 'disabled'> = {};
    if (dimensions.length === 0) return result;
    for (const dim of dimensions) {
      const activeOptionName = activeThemes[dim.id];
      if (!activeOptionName) continue;
      const option = dim.options.find(o => o.name === activeOptionName);
      if (!option) continue;
      for (const [setName, status] of Object.entries(option.sets)) {
        const existing = result[setName];
        if (!existing || status === 'enabled' || (status === 'source' && existing === 'disabled')) {
          result[setName] = status as 'enabled' | 'source' | 'disabled';
        }
      }
    }
    return result;
  }, [dimensions, activeThemes]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      dimensions, setDimensions,
      activeThemes, setActiveThemes,
      previewThemes, setPreviewThemes,
      openDimDropdown, setOpenDimDropdown,
      dimBarExpanded, setDimBarExpanded,
      dimDropdownRef, themesError, retryThemes,
      resolverState,
      themedAllTokensFlat,
      setThemeStatusMap,
    }),
    [
      dimensions, setDimensions,
      activeThemes, setActiveThemes,
      previewThemes, setPreviewThemes,
      openDimDropdown, setOpenDimDropdown,
      dimBarExpanded, setDimBarExpanded,
      dimDropdownRef, themesError, retryThemes,
      resolverState,
      themedAllTokensFlat,
      setThemeStatusMap,
    ],
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}
