import { useState, useRef, useEffect, useCallback } from 'react';
import type { ThemeDimension } from '@tokenmanager/core';
import { apiFetch, ApiError } from '../shared/apiFetch';
import { getErrorMessage } from '../shared/utils';
import { THEME_ROLE_STATES, type ThemeRoleState } from '../components/themeManagerTypes';

export interface UseThemeBulkOpsParams {
  serverUrl: string;
  sets: string[];
  dimensions: ThemeDimension[];
  setDimensions: React.Dispatch<React.SetStateAction<ThemeDimension[]>>;
  debouncedFetchDimensions: () => void;
  setError: (msg: string | null) => void;
}

export function useThemeBulkOps({
  serverUrl,
  sets,
  dimensions,
  setDimensions,
  debouncedFetchDimensions,
  setError,
}: UseThemeBulkOpsParams) {
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());

  // Copy-from state
  const [copyFromNewOption, setCopyFromNewOption] = useState<Record<string, string>>({});

  // Mutation queue: serializes set-state mutations so concurrent calls don't
  // interleave optimistic updates or capture stale rollback snapshots.
  const mutationChainRef = useRef<Promise<void>>(Promise.resolve());

  // Prevents setState calls on unmounted component after in-flight mutations complete.
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // Generic mutation helper: applies an optimistic update, calls the API, rolls back on error.
  // Chains onto mutationChainRef so concurrent calls run sequentially without interleaving.
  const enqueueMutation = useCallback((config: {
    optimisticUpdate: (prev: ThemeDimension[]) => ThemeDimension[];
    apiCall: () => Promise<void>;
    errorMsg: string;
    label: string;
    savingKeys?: string[];
  }) => {
    const { optimisticUpdate, apiCall, errorMsg, label, savingKeys: keys = [] } = config;
    const previousDimensions = dimensions;
    const task = async () => {
      if (keys.length) setSavingKeys(prev => { const n = new Set(prev); keys.forEach(k => n.add(k)); return n; });
      setDimensions(optimisticUpdate);
      try {
        await apiCall();
        if (mountedRef.current) debouncedFetchDimensions();
      } catch (err) {
        if (!mountedRef.current) return;
        setDimensions(previousDimensions);
        setError(err instanceof ApiError ? err.message : getErrorMessage(err, errorMsg));
      } finally {
        if (keys.length && mountedRef.current) {
          setSavingKeys(prev => { const n = new Set(prev); keys.forEach(k => n.delete(k)); return n; });
        }
      }
    };
    const next = mutationChainRef.current.then(task);
    mutationChainRef.current = next.catch((err) => {
      console.error(`[ThemeManager] mutation chain error (${label}):`, err);
      setError(getErrorMessage(err, 'Unexpected mutation error'));
    });
  }, [debouncedFetchDimensions, dimensions, setDimensions, setError]);

  // --- Set state toggle (single option, single set) ---

  const handleSetState = useCallback((dimId: string, optionName: string, setName: string, targetState: ThemeRoleState) => {
    const dim = dimensions.find(d => d.id === dimId);
    if (!dim) return;
    const opt = dim.options.find(o => o.name === optionName);
    if (!opt) return;
    const updatedSets = { ...opt.sets, [setName]: targetState };
    const saveKey = `${dimId}/${optionName}/${setName}`;
    enqueueMutation({
      savingKeys: [saveKey],
      optimisticUpdate: prev => prev.map(d =>
        d.id === dimId
          ? { ...d, options: d.options.map(o => o.name === optionName ? { ...o, sets: updatedSets } : o) }
          : d,
      ),
      apiCall: () => apiFetch(`${serverUrl}/api/themes/dimensions/${encodeURIComponent(dimId)}/options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: optionName, sets: updatedSets }),
      }),
      errorMsg: 'Failed to save',
      label: 'handleSetState',
    });
  }, [dimensions, enqueueMutation, serverUrl]);

  // --- Bulk set-status across all options in a dimension ---

  const handleBulkSetState = useCallback((dimId: string, setName: string, targetState: ThemeRoleState) => {
    const dim = dimensions.find(d => d.id === dimId);
    if (!dim) return;
    const bulkKeys = dim.options.map(o => `${dimId}/${o.name}/${setName}`);
    enqueueMutation({
      savingKeys: bulkKeys,
      optimisticUpdate: prev => prev.map(d =>
        d.id === dimId
          ? { ...d, options: d.options.map(o => ({ ...o, sets: { ...o.sets, [setName]: targetState } })) }
          : d,
      ),
      apiCall: () => Promise.all(dim.options.map(opt => {
        const updatedSets = { ...opt.sets, [setName]: targetState };
        return apiFetch(`${serverUrl}/api/themes/dimensions/${encodeURIComponent(dimId)}/options`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: opt.name, sets: updatedSets }),
        });
      })).then(() => undefined),
      errorMsg: 'Failed to bulk-update',
      label: 'handleBulkSetState',
    });
  }, [dimensions, enqueueMutation, serverUrl]);

  // --- Bulk assign all sets in an option to a single state ---

  const handleBulkSetAllInOption = useCallback((dimId: string, optionName: string, targetState: ThemeRoleState) => {
    const dim = dimensions.find(d => d.id === dimId);
    if (!dim) return;
    if (!dim.options.find(o => o.name === optionName)) return;
    const updatedSets: Record<string, ThemeRoleState> = {};
    sets.forEach(s => { updatedSets[s] = targetState; });
    enqueueMutation({
      optimisticUpdate: prev => prev.map(d =>
        d.id === dimId
          ? { ...d, options: d.options.map(o => o.name === optionName ? { ...o, sets: updatedSets } : o) }
          : d,
      ),
      apiCall: () => apiFetch(`${serverUrl}/api/themes/dimensions/${encodeURIComponent(dimId)}/options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: optionName, sets: updatedSets }),
      }),
      errorMsg: 'Failed to bulk-assign sets',
      label: 'handleBulkSetAllInOption',
    });
  }, [dimensions, enqueueMutation, serverUrl, sets]);

  // --- Copy assignments from one option to another (replaces target's sets) ---

  const handleCopyAssignmentsFrom = useCallback((dimId: string, targetOptionName: string, sourceOptionName: string) => {
    const dim = dimensions.find(d => d.id === dimId);
    if (!dim) return;
    const source = dim.options.find(o => o.name === sourceOptionName);
    if (!source) return;
    const copiedSets = { ...source.sets };
    enqueueMutation({
      optimisticUpdate: prev => prev.map(d =>
        d.id === dimId
          ? { ...d, options: d.options.map(o => o.name === targetOptionName ? { ...o, sets: copiedSets } : o) }
          : d,
      ),
      apiCall: () => apiFetch(`${serverUrl}/api/themes/dimensions/${encodeURIComponent(dimId)}/options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: targetOptionName, sets: copiedSets }),
      }),
      errorMsg: 'Failed to copy assignments',
      label: 'handleCopyAssignmentsFrom',
    });
  }, [dimensions, enqueueMutation, serverUrl]);

  const getCopySourceOptions = useCallback((dimId: string, optionName: string): string[] => {
    const dim = dimensions.find(d => d.id === dimId);
    if (!dim) return [];
    return dim.options.filter(option => option.name !== optionName).map(option => option.name);
  }, [dimensions]);

  const getSetRoleCounts = useCallback((dimId: string, setName: string): Record<ThemeRoleState, number> => {
    const dim = dimensions.find(d => d.id === dimId);
    const counts: Record<ThemeRoleState, number> = {
      disabled: 0,
      source: 0,
      enabled: 0,
    };
    if (!dim) return counts;
    for (const option of dim.options) {
      const status = (option.sets[setName] ?? 'disabled') as ThemeRoleState;
      counts[status] += 1;
    }
    return counts;
  }, [dimensions]);

  return {
    roleStates: THEME_ROLE_STATES,
    savingKeys,
    copyFromNewOption,
    setCopyFromNewOption,
    handleSetState,
    handleBulkSetState,
    handleBulkSetAllInOption,
    handleCopyAssignmentsFrom,
    getCopySourceOptions,
    getSetRoleCounts,
  };
}
