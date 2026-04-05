import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { flattenTokenGroup } from '@tokenmanager/core';
import { apiFetch, ApiError } from '../shared/apiFetch';
import {
  type ImportToken,
  type CollectionData,
  modeKey,
  defaultSetName,
} from '../components/importPanelTypes';

export interface UseImportConflictsParams {
  serverUrl: string;
  tokens: ImportToken[];
  selectedTokens: Set<string>;
  targetSet: string;
  targetSetRef: React.RefObject<string>;
  sets: string[];
  collectionData: CollectionData[];
  modeEnabled: Record<string, boolean>;
  modeSetNames: Record<string, string>;
}

export function useImportConflicts({
  serverUrl,
  tokens,
  selectedTokens,
  targetSet,
  targetSetRef,
  sets,
  collectionData,
  modeEnabled,
  modeSetNames,
}: UseImportConflictsParams) {
  const [conflictPaths, setConflictPaths] = useState<string[] | null>(null);
  const [conflictExistingValues, setConflictExistingValues] = useState<Map<string, { $type: string; $value: unknown }> | null>(null);
  const [conflictDecisions, setConflictDecisions] = useState<Map<string, 'accept' | 'merge' | 'reject'>>(new Map());
  const [conflictSearch, setConflictSearch] = useState('');
  const [conflictStatusFilter, setConflictStatusFilter] = useState<'all' | 'accept' | 'merge' | 'reject'>('all');
  const [conflictTypeFilter, setConflictTypeFilter] = useState<string>('all');
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  const [existingTokenMap, setExistingTokenMap] = useState<Map<string, { $type: string; $value: unknown }> | null>(null);
  const [existingPathsFetching, setExistingTokenMapFetching] = useState(false);
  const [existingTokenMapError, setExistingTokenMapError] = useState<string | null>(null);
  const [varConflictPreview, setVarConflictPreview] = useState<{ newCount: number; overwriteCount: number } | null>(null);
  const [varConflictDetails, setVarConflictDetails] = useState<{ path: string; setName: string; existing: { $type: string; $value: unknown }; incoming: ImportToken }[] | null>(null);
  const [varConflictDetailsExpanded, setVarConflictDetailsExpanded] = useState(false);
  const [checkingVarConflicts, setCheckingVarConflicts] = useState(false);

  const existingPathsCacheRef = useRef<{ set: string; tokens: Map<string, { $type: string; $value: unknown }> } | null>(null);
  const varConflictFetchIdRef = useRef(0);

  const clearConflictState = useCallback(() => {
    setConflictPaths(null);
    setConflictExistingValues(null);
    setConflictDecisions(new Map());
    setConflictSearch('');
    setConflictStatusFilter('all');
    setConflictTypeFilter('all');
  }, []);

  const resetExistingPathsCache = useCallback(() => {
    existingPathsCacheRef.current = null;
    setExistingTokenMap(null);
  }, []);

  const prefetchExistingPaths = useCallback((setName: string) => {
    if (existingPathsCacheRef.current?.set === setName) {
      setExistingTokenMap(existingPathsCacheRef.current.tokens);
      setExistingTokenMapError(null);
      return;
    }
    setExistingTokenMapFetching(true);
    setExistingTokenMapError(null);
    apiFetch<{ tokens?: Record<string, unknown> }>(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}`)
      .then(data => {
        const flat = flattenTokenGroup(data.tokens ?? {});
        const map = new Map<string, { $type: string; $value: unknown }>();
        for (const [path, tok] of flat) {
          map.set(path, { $type: (tok as any).$type ?? 'unknown', $value: (tok as any).$value });
        }
        return map;
      })
      .then(toks => {
        existingPathsCacheRef.current = { set: setName, tokens: toks };
        setExistingTokenMap(toks);
      })
      .catch(err => {
        if (err instanceof ApiError && err.status === 404) {
          const empty = new Map<string, { $type: string; $value: unknown }>();
          existingPathsCacheRef.current = { set: setName, tokens: empty };
          setExistingTokenMap(empty);
          setExistingTokenMapError(null);
        } else {
          setExistingTokenMap(null);
          setExistingTokenMapError(err instanceof Error ? err.message : 'Failed to load existing tokens');
        }
      })
      .finally(() => setExistingTokenMapFetching(false));
  }, [serverUrl]);

  // Pre-fetch existing tokens when tokens first load
  useEffect(() => {
    if (tokens.length > 0) {
      prefetchExistingPaths(targetSetRef.current ?? targetSet);
    }
  }, [tokens, prefetchExistingPaths, targetSetRef, targetSet]);

  // Re-run preview when target set changes while tokens are loaded
  useEffect(() => {
    clearConflictState();
    if (tokens.length > 0) {
      existingPathsCacheRef.current = null;
      prefetchExistingPaths(targetSet);
    }
  }, [targetSet, tokens.length, prefetchExistingPaths, clearConflictState]);

  // Pre-fetch conflict counts and per-token details for Variables import preview
  useEffect(() => {
    if (collectionData.length === 0) {
      setVarConflictPreview(null);
      setVarConflictDetails(null);
      setVarConflictDetailsExpanded(false);
      return;
    }
    const allModes = collectionData.flatMap(col =>
      col.modes
        .filter(m => modeEnabled[modeKey(col.name, m.modeId)])
        .map(m => ({
          mode: m,
          setName: modeSetNames[modeKey(col.name, m.modeId)] || defaultSetName(col.name, m.modeName, col.modes.length),
        }))
    );
    if (allModes.length === 0) {
      setVarConflictPreview({ newCount: 0, overwriteCount: 0 });
      setVarConflictDetails([]);
      return;
    }
    const setsToCheck = allModes.filter(({ setName }) => sets.includes(setName));
    if (setsToCheck.length === 0) {
      const totalTokens = allModes.reduce((acc, { mode }) => acc + mode.tokens.length, 0);
      setVarConflictPreview({ newCount: totalTokens, overwriteCount: 0 });
      setVarConflictDetails([]);
      return;
    }
    const fetchId = ++varConflictFetchIdRef.current;
    setCheckingVarConflicts(true);
    (async () => {
      try {
        let overwriteCount = 0;
        const details: { path: string; setName: string; existing: { $type: string; $value: unknown }; incoming: ImportToken }[] = [];
        for (const { mode, setName } of setsToCheck) {
          if (fetchId !== varConflictFetchIdRef.current) return;
          const data = await apiFetch<{ tokens?: Record<string, unknown> }>(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}`);
          if (fetchId !== varConflictFetchIdRef.current) return;
          const flat = flattenTokenGroup(data.tokens ?? {});
          for (const t of mode.tokens) {
            if (flat.has(t.path)) {
              const ex = flat.get(t.path);
              details.push({
                path: t.path,
                setName,
                existing: { $type: (ex as any)?.$type ?? 'unknown', $value: (ex as any)?.$value },
                incoming: t,
              });
              overwriteCount++;
            }
          }
        }
        if (fetchId !== varConflictFetchIdRef.current) return;
        const totalTokens = allModes.reduce((acc, { mode }) => acc + mode.tokens.length, 0);
        setVarConflictPreview({ newCount: totalTokens - overwriteCount, overwriteCount });
        setVarConflictDetails(details);
        // Auto-expand when conflicts are found so users see the diff immediately
        if (details.length > 0) setVarConflictDetailsExpanded(true);
      } catch {
        if (fetchId === varConflictFetchIdRef.current) {
          setVarConflictPreview(null);
          setVarConflictDetails(null);
        }
      } finally {
        if (fetchId === varConflictFetchIdRef.current) setCheckingVarConflicts(false);
      }
    })();
  }, [collectionData, modeEnabled, modeSetNames, sets, serverUrl]);

  const previewNewCount = useMemo(
    () => existingTokenMap !== null ? [...selectedTokens].filter(p => !existingTokenMap.has(p)).length : null,
    [existingTokenMap, selectedTokens]
  );
  const previewOverwriteCount = useMemo(
    () => existingTokenMap !== null ? [...selectedTokens].filter(p => existingTokenMap.has(p)).length : null,
    [existingTokenMap, selectedTokens]
  );

  return {
    conflictPaths,
    setConflictPaths,
    conflictExistingValues,
    setConflictExistingValues,
    conflictDecisions,
    setConflictDecisions,
    conflictSearch,
    setConflictSearch,
    conflictStatusFilter,
    setConflictStatusFilter,
    conflictTypeFilter,
    setConflictTypeFilter,
    checkingConflicts,
    setCheckingConflicts,
    existingTokenMap,
    setExistingTokenMap,
    existingPathsFetching,
    existingTokenMapError,
    varConflictPreview,
    varConflictDetails,
    varConflictDetailsExpanded,
    setVarConflictDetailsExpanded,
    checkingVarConflicts,
    existingPathsCacheRef,
    clearConflictState,
    resetExistingPathsCache,
    prefetchExistingPaths,
    previewNewCount,
    previewOverwriteCount,
  };
}
