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
  onSuccess?: (message: string) => void;
}

export function useThemeBulkOps({
  serverUrl,
  sets,
  dimensions,
  setDimensions,
  debouncedFetchDimensions,
  setError,
  onSuccess,
}: UseThemeBulkOpsParams) {
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());

  // Copy-from state
  const [copyFromNewOption, setCopyFromNewOption] = useState<Record<string, string>>({});

  // Mutation queue: serializes set-state mutations so concurrent calls don't
  // interleave optimistic updates or capture stale rollback snapshots.
  const mutationChainRef = useRef<Promise<void>>(Promise.resolve());
  const pendingMutationsRef = useRef(0);
  const dimensionsRef = useRef(dimensions);
  const committedDimensionsRef = useRef(dimensions);

  // Prevents setState calls on unmounted component after in-flight mutations complete.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  useEffect(() => {
    if (pendingMutationsRef.current > 0) return;
    dimensionsRef.current = dimensions;
    committedDimensionsRef.current = dimensions;
  }, [dimensions]);

  // Generic mutation helper: applies an optimistic update, calls the API, rolls back on error.
  // Chains onto mutationChainRef so concurrent calls run sequentially without interleaving.
  const enqueueMutation = useCallback((config: {
    plan: (baseDimensions: ThemeDimension[]) => {
      apiCall: () => Promise<void>;
      nextDimensions: ThemeDimension[];
      savingKeys?: string[];
      successMessage?: string;
    } | null;
    errorMsg: string;
    label: string;
  }) => {
    const { plan, errorMsg, label } = config;
    pendingMutationsRef.current += 1;
    const task = async () => {
      const rollbackDimensions = committedDimensionsRef.current;
      let keys: string[] = [];
      try {
        const mutation = plan(dimensionsRef.current);
        if (!mutation) return;
        const {
          apiCall,
          nextDimensions,
          savingKeys = [],
          successMessage,
        } = mutation;
        keys = savingKeys;
        if (keys.length) setSavingKeys(prev => { const n = new Set(prev); keys.forEach(k => n.add(k)); return n; });
        dimensionsRef.current = nextDimensions;
        setDimensions(nextDimensions);
        await apiCall();
        committedDimensionsRef.current = nextDimensions;
        if (successMessage && mountedRef.current) {
          onSuccess?.(successMessage);
        }
        if (mountedRef.current) debouncedFetchDimensions();
      } catch (err) {
        if (!mountedRef.current) return;
        dimensionsRef.current = rollbackDimensions;
        setDimensions(rollbackDimensions);
        setError(err instanceof ApiError ? err.message : getErrorMessage(err, errorMsg));
      } finally {
        pendingMutationsRef.current -= 1;
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
  }, [debouncedFetchDimensions, onSuccess, setDimensions, setError]);

  // --- Set state toggle (single option, single set) ---

  const handleSetState = useCallback((dimId: string, optionName: string, setName: string, targetState: ThemeRoleState) => {
    const saveKey = `${dimId}/${optionName}/${setName}`;
    enqueueMutation({
      plan: baseDimensions => {
        const dim = baseDimensions.find(d => d.id === dimId);
        const opt = dim?.options.find(o => o.name === optionName);
        if (!dim || !opt) return null;
        const updatedSets = { ...opt.sets, [setName]: targetState };
        return {
          savingKeys: [saveKey],
          nextDimensions: baseDimensions.map(d =>
            d.id === dimId
              ? { ...d, options: d.options.map(o => o.name === optionName ? { ...o, sets: updatedSets } : o) }
              : d,
          ),
          apiCall: () => apiFetch(`${serverUrl}/api/themes/dimensions/${encodeURIComponent(dimId)}/options`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: optionName, sets: updatedSets }),
          }),
        };
      },
      errorMsg: 'Failed to save',
      label: 'handleSetState',
    });
  }, [enqueueMutation, serverUrl]);

  // --- Bulk set-status across all options in a dimension ---

  const handleBulkSetState = useCallback((dimId: string, setName: string, targetState: ThemeRoleState) => {
    enqueueMutation({
      plan: baseDimensions => {
        const dim = baseDimensions.find(d => d.id === dimId);
        if (!dim) return null;
        const optionUpdates = dim.options.map(opt => ({
          name: opt.name,
          sets: { ...opt.sets, [setName]: targetState },
        }));
        return {
          savingKeys: optionUpdates.map(opt => `${dimId}/${opt.name}/${setName}`),
          nextDimensions: baseDimensions.map(d =>
            d.id === dimId
              ? {
                  ...d,
                  options: d.options.map(option => {
                    const updated = optionUpdates.find(opt => opt.name === option.name);
                    return updated ? { ...option, sets: updated.sets } : option;
                  }),
                }
              : d,
          ),
          apiCall: () => Promise.all(optionUpdates.map(opt => apiFetch(
            `${serverUrl}/api/themes/dimensions/${encodeURIComponent(dimId)}/options`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: opt.name, sets: opt.sets }),
            },
          ))).then(() => undefined),
        };
      },
      errorMsg: 'Failed to bulk-update',
      label: 'handleBulkSetState',
    });
  }, [enqueueMutation, serverUrl]);

  // --- Bulk assign all sets in an option to a single state ---

  const handleBulkSetAllInOption = useCallback((dimId: string, optionName: string, targetState: ThemeRoleState) => {
    enqueueMutation({
      plan: baseDimensions => {
        const dim = baseDimensions.find(d => d.id === dimId);
        if (!dim || !dim.options.find(o => o.name === optionName)) return null;
        const updatedSets: Record<string, ThemeRoleState> = {};
        sets.forEach(setName => { updatedSets[setName] = targetState; });
        return {
          nextDimensions: baseDimensions.map(d =>
            d.id === dimId
              ? { ...d, options: d.options.map(o => o.name === optionName ? { ...o, sets: updatedSets } : o) }
              : d,
          ),
          apiCall: () => apiFetch(`${serverUrl}/api/themes/dimensions/${encodeURIComponent(dimId)}/options`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: optionName, sets: updatedSets }),
          }),
        };
      },
      errorMsg: 'Failed to bulk-assign sets',
      label: 'handleBulkSetAllInOption',
    });
  }, [enqueueMutation, serverUrl, sets]);

  // --- Copy assignments from one option to another (replaces target's sets) ---

  const handleCopyAssignmentsFrom = useCallback((dimId: string, targetOptionName: string, sourceOptionName: string) => {
    enqueueMutation({
      plan: baseDimensions => {
        const dim = baseDimensions.find(d => d.id === dimId);
        const source = dim?.options.find(o => o.name === sourceOptionName);
        if (!dim || !source || !dim.options.find(o => o.name === targetOptionName)) return null;
        const copiedSets = { ...source.sets };
        return {
          nextDimensions: baseDimensions.map(d =>
            d.id === dimId
              ? { ...d, options: d.options.map(o => o.name === targetOptionName ? { ...o, sets: copiedSets } : o) }
              : d,
          ),
          successMessage: `Copied assignments from "${sourceOptionName}" to "${targetOptionName}"`,
          apiCall: () => apiFetch(`${serverUrl}/api/themes/dimensions/${encodeURIComponent(dimId)}/options`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: targetOptionName, sets: copiedSets }),
          }),
        };
      },
      errorMsg: 'Failed to copy assignments',
      label: 'handleCopyAssignmentsFrom',
    });
  }, [enqueueMutation, serverUrl]);

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
