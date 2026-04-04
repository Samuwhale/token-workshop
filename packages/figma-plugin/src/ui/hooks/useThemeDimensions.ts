import { useState, useCallback, useRef, useEffect } from 'react';
import type { ThemeDimension } from '@tokenmanager/core';
import { flattenTokenGroup } from '@tokenmanager/core';
import { apiFetch, ApiError } from '../shared/apiFetch';
import { getErrorMessage } from '../shared/utils';
import type { CoverageMap, CoverageToken, MissingOverrideToken, MissingOverridesMap } from '../components/themeManagerTypes';
import type { UndoSlot } from './useUndo';

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function makeErrorMsg(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : getErrorMessage(err, fallback);
}

export interface UseThemeDimensionsParams {
  serverUrl: string;
  connected: boolean;
  sets: string[];
  onPushUndo?: (slot: UndoSlot) => void;
  onSuccess?: (msg: string) => void;
}

export interface UseThemeDimensionsReturn {
  // Core data
  dimensions: ThemeDimension[];
  setDimensions: React.Dispatch<React.SetStateAction<ThemeDimension[]>>;
  loading: boolean;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  fetchWarnings: string | null;
  setFetchWarnings: React.Dispatch<React.SetStateAction<string | null>>;
  // Coverage data (computed during fetch)
  coverage: CoverageMap;
  missingOverrides: MissingOverridesMap;
  // Derived UI state
  optionSetOrders: Record<string, Record<string, string[]>>;
  setOptionSetOrders: React.Dispatch<React.SetStateAction<Record<string, Record<string, string[]>>>>;
  selectedOptions: Record<string, string>;
  setSelectedOptions: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setTokenValues: Record<string, Record<string, any>>;
  setTokenTypesRef: React.MutableRefObject<Record<string, Record<string, string>>>;
  newlyCreatedDim: string | null;
  setNewlyCreatedDim: React.Dispatch<React.SetStateAction<string | null>>;
  // Fetch
  fetchDimensions: () => Promise<void>;
  debouncedFetchDimensions: () => void;
  // Create dimension
  newDimName: string;
  setNewDimName: React.Dispatch<React.SetStateAction<string>>;
  showCreateDim: boolean;
  setShowCreateDim: React.Dispatch<React.SetStateAction<boolean>>;
  createDimError: string | null;
  setCreateDimError: React.Dispatch<React.SetStateAction<string | null>>;
  isCreatingDim: boolean;
  handleCreateDimension: () => Promise<void>;
  // Rename dimension
  renameDim: string | null;
  renameValue: string;
  setRenameValue: React.Dispatch<React.SetStateAction<string>>;
  renameError: string | null;
  isRenamingDim: boolean;
  startRenameDim: (id: string, currentName: string) => void;
  cancelRenameDim: () => void;
  executeRenameDim: () => Promise<void>;
  // Delete dimension
  dimensionDeleteConfirm: string | null;
  setDimensionDeleteConfirm: React.Dispatch<React.SetStateAction<string | null>>;
  isDeletingDim: boolean;
  executeDeleteDimension: (id: string) => Promise<void>;
}

export function useThemeDimensions({
  serverUrl,
  connected,
  sets,
  onPushUndo,
  onSuccess,
}: UseThemeDimensionsParams): UseThemeDimensionsReturn {
  const [dimensions, setDimensions] = useState<ThemeDimension[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchWarnings, setFetchWarnings] = useState<string | null>(null);
  const [coverage, setCoverage] = useState<CoverageMap>({});
  const [missingOverrides, setMissingOverrides] = useState<MissingOverridesMap>({});
  const [optionSetOrders, setOptionSetOrders] = useState<Record<string, Record<string, string[]>>>({});
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [setTokenValues, setSetTokenValues] = useState<Record<string, Record<string, any>>>({});
  const setTokenTypesRef = useRef<Record<string, Record<string, string>>>({});
  const [newlyCreatedDim, setNewlyCreatedDim] = useState<string | null>(null);

  // Create dimension
  const [newDimName, setNewDimName] = useState('');
  const [showCreateDim, setShowCreateDim] = useState(false);
  const [createDimError, setCreateDimError] = useState<string | null>(null);
  const [isCreatingDim, setIsCreatingDim] = useState(false);

  // Rename dimension
  const [renameDim, setRenameDim] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [isRenamingDim, setIsRenamingDim] = useState(false);

  // Delete dimension
  const [dimensionDeleteConfirm, setDimensionDeleteConfirm] = useState<string | null>(null);
  const [isDeletingDim, setIsDeletingDim] = useState(false);

  const debounceFetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);

  const fetchDimensions = useCallback(async () => {
    if (!connected) { setLoading(false); return; }
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    try {
      const data = await apiFetch<{ dimensions?: ThemeDimension[] }>(
        `${serverUrl}/api/themes`,
        { signal: controller.signal },
      );
      const allDimensions: ThemeDimension[] = data.dimensions || [];
      setDimensions(allDimensions);

      setOptionSetOrders(prev => {
        const next = { ...prev };
        for (const dim of allDimensions) {
          if (!next[dim.id]) next[dim.id] = {};
          for (const opt of dim.options) {
            if (!next[dim.id][opt.name]) {
              const optSetKeys = Object.keys(opt.sets).filter(s => sets.includes(s));
              const rest = sets.filter(s => !optSetKeys.includes(s));
              next[dim.id][opt.name] = [...optSetKeys, ...rest];
            }
          }
        }
        return next;
      });

      setSelectedOptions(prev => {
        const next = { ...prev };
        for (const dim of allDimensions) {
          if (!next[dim.id] && dim.options.length > 0) next[dim.id] = dim.options[0].name;
          if (next[dim.id] && !dim.options.some(o => o.name === next[dim.id])) {
            next[dim.id] = dim.options[0]?.name || '';
          }
        }
        return next;
      });

      // Compute token values per set
      const tokenValues: Record<string, Record<string, any>> = {};
      const tokenTypes: Record<string, Record<string, string>> = {};
      const failedSets: string[] = [];
      await Promise.all(sets.map(async (s) => {
        try {
          const d = await apiFetch<{ tokens?: Record<string, any> }>(
            `${serverUrl}/api/tokens/${encodeURIComponent(s)}`,
            { signal: controller.signal },
          );
          const map: Record<string, any> = {};
          const typeMap: Record<string, string> = {};
          for (const [path, token] of flattenTokenGroup(d.tokens || {})) {
            map[path] = token.$value;
            if (token.$type) typeMap[path] = token.$type;
          }
          tokenValues[s] = map;
          tokenTypes[s] = typeMap;
        } catch (err) {
          console.warn('[ThemeManager] failed to fetch token set:', s, err);
          failedSets.push(s);
        }
      }));
      setSetTokenValues(tokenValues);
      setTokenTypesRef.current = tokenTypes;
      if (failedSets.length > 0) {
        setFetchWarnings(
          `Could not load ${failedSets.length === 1 ? `set "${failedSets[0]}"` : `${failedSets.length} sets (${failedSets.join(', ')})`} — coverage data may be incomplete`,
        );
      } else {
        setFetchWarnings(null);
      }

      const isResolved = (value: any, activeValues: Record<string, any>, visited = new Set<string>()): boolean => {
        if (typeof value !== 'string') return true;
        const m = /^\{([^}]+)\}$/.exec(value);
        if (!m) return true;
        const target = m[1];
        if (visited.has(target)) return false;
        if (!(target in activeValues)) return false;
        return isResolved(activeValues[target], activeValues, new Set([...visited, target]));
      };

      const findMissingRef = (value: any, activeValues: Record<string, any>, visited = new Set<string>()): string | null => {
        if (typeof value !== 'string') return null;
        const m = /^\{([^}]+)\}$/.exec(value);
        if (!m) return null;
        const target = m[1];
        if (visited.has(target)) return null;
        if (!(target in activeValues)) return target;
        return findMissingRef(activeValues[target], activeValues, new Set([...visited, target]));
      };

      const findFillValue = (path: string): { value: unknown; type?: string } | null => {
        for (const [setName, tokens] of Object.entries(tokenValues)) {
          if (path in tokens) return { value: tokens[path], type: tokenTypes[setName]?.[path] };
        }
        return null;
      };

      const cov: CoverageMap = {};
      for (const dim of allDimensions) {
        cov[dim.id] = {};
        for (const opt of dim.options) {
          const activeValues: Record<string, any> = {};
          const tokenSetOrigin: Record<string, string> = {};
          for (const [setName, state] of Object.entries(opt.sets)) {
            if (state === 'source') {
              for (const path of Object.keys(tokenValues[setName] ?? {})) tokenSetOrigin[path] = setName;
              Object.assign(activeValues, tokenValues[setName] ?? {});
            }
          }
          for (const [setName, state] of Object.entries(opt.sets)) {
            if (state === 'enabled') {
              for (const path of Object.keys(tokenValues[setName] ?? {})) tokenSetOrigin[path] = setName;
              Object.assign(activeValues, tokenValues[setName] ?? {});
            }
          }
          const uncovered: CoverageToken[] = [];
          for (const [p, v] of Object.entries(activeValues)) {
            if (isResolved(v, activeValues)) continue;
            const missingRef = findMissingRef(v, activeValues);
            const entry: CoverageToken = { path: p, set: tokenSetOrigin[p] ?? '', missingRef: missingRef ?? undefined };
            if (missingRef) {
              const found = findFillValue(missingRef);
              if (found) { entry.fillValue = found.value; entry.fillType = found.type; }
            }
            uncovered.push(entry);
          }
          cov[dim.id][opt.name] = { uncovered };
        }
      }
      setCoverage(cov);

      // Compute missing overrides
      const moMap: MissingOverridesMap = {};
      for (const dim of allDimensions) {
        moMap[dim.id] = {};
        for (const opt of dim.options) {
          const enabledPaths = new Set<string>();
          for (const [setName, state] of Object.entries(opt.sets)) {
            if (state === 'enabled') {
              for (const path of Object.keys(tokenValues[setName] ?? {})) enabledPaths.add(path);
            }
          }
          const hasEnabledSets = enabledPaths.size > 0 || Object.values(opt.sets).some(s => s === 'enabled');
          const missing: MissingOverrideToken[] = [];
          if (hasEnabledSets) {
            for (const [setName, state] of Object.entries(opt.sets)) {
              if (state === 'source') {
                for (const [path, value] of Object.entries(tokenValues[setName] ?? {})) {
                  if (!enabledPaths.has(path)) {
                    missing.push({ path, sourceSet: setName, value, type: tokenTypes[setName]?.[path] });
                  }
                }
              }
            }
          }
          moMap[dim.id][opt.name] = { missing };
        }
      }
      setMissingOverrides(moMap);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(getErrorMessage(err));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [serverUrl, connected, sets]);

  const debouncedFetchDimensions = useCallback(() => {
    if (debounceFetchTimer.current) clearTimeout(debounceFetchTimer.current);
    debounceFetchTimer.current = setTimeout(() => {
      debounceFetchTimer.current = null;
      fetchDimensions();
    }, 600);
  }, [fetchDimensions]);

  useEffect(() => () => {
    if (debounceFetchTimer.current) clearTimeout(debounceFetchTimer.current);
    fetchAbortRef.current?.abort();
  }, []);

  // --- Create dimension ---

  const handleCreateDimension = async () => {
    const name = newDimName.trim();
    if (!name || !connected || isCreatingDim) return;
    const id = slugify(name) || name.toLowerCase().replace(/\s+/g, '-');
    if (!id || !/^[a-z0-9-]+$/.test(id)) {
      setCreateDimError('Name must contain at least one letter or number (spaces and hyphens are allowed).');
      return;
    }
    if (dimensions.some(d => d.id === id || d.name.toLowerCase() === name.toLowerCase())) {
      setCreateDimError('A dimension with that name already exists.');
      return;
    }
    setCreateDimError(null);
    setIsCreatingDim(true);
    try {
      await apiFetch(`${serverUrl}/api/themes/dimensions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name }),
      });
      setNewDimName('');
      setShowCreateDim(false);
      setNewlyCreatedDim(id);
      setDimensions(prev => [...prev, { id, name, options: [] }]);
      debouncedFetchDimensions();
      onSuccess?.(`Created dimension "${name}"`);
    } catch (err) {
      setCreateDimError(makeErrorMsg(err, 'Failed to create dimension'));
    } finally {
      setIsCreatingDim(false);
    }
  };

  // --- Rename dimension ---

  const startRenameDim = (id: string, currentName: string) => {
    setRenameDim(id);
    setRenameValue(currentName);
    setRenameError(null);
  };

  const cancelRenameDim = () => {
    setRenameDim(null);
    setRenameValue('');
    setRenameError(null);
  };

  const executeRenameDim = async () => {
    if (!renameDim || isRenamingDim) return;
    const name = renameValue.trim();
    if (!name) { setRenameError('Name cannot be empty'); return; }
    const current = dimensions.find(d => d.id === renameDim);
    if (!current) { cancelRenameDim(); return; }
    if (name === current.name) { cancelRenameDim(); return; }
    if (dimensions.some(d => d.id !== renameDim && d.name === name)) {
      setRenameError(`Dimension "${name}" already exists`);
      return;
    }
    setIsRenamingDim(true);
    try {
      await apiFetch(`${serverUrl}/api/themes/dimensions/${encodeURIComponent(renameDim)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      setDimensions(prev => prev.map(d => d.id === renameDim ? { ...d, name } : d));
      cancelRenameDim();
      debouncedFetchDimensions();
      onSuccess?.(`Renamed dimension to "${name}"`);
    } catch (err) {
      setRenameError(makeErrorMsg(err, 'Rename failed'));
    } finally {
      setIsRenamingDim(false);
    }
  };

  // --- Delete dimension ---

  const executeDeleteDimension = async (id: string) => {
    if (isDeletingDim) return;
    const snapshot = dimensions.find(d => d.id === id);
    if (!snapshot) return;
    const savedDim = JSON.parse(JSON.stringify(snapshot)) as ThemeDimension;
    setIsDeletingDim(true);
    try {
      await apiFetch(`${serverUrl}/api/themes/dimensions/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setDimensions(prev => prev.filter(d => d.id !== id));
      debouncedFetchDimensions();
      onPushUndo?.({
        description: `Deleted layer "${savedDim.name}"`,
        restore: async () => {
          try {
            await apiFetch(`${serverUrl}/api/themes/dimensions`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: savedDim.id, name: savedDim.name }),
            });
          } catch (err) {
            setError(makeErrorMsg(err, 'Failed to undo: could not recreate layer'));
            return;
          }
          for (const opt of savedDim.options) {
            try {
              await apiFetch(`${serverUrl}/api/themes/dimensions/${encodeURIComponent(savedDim.id)}/options`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: opt.name, sets: opt.sets }),
              });
            } catch (err) {
              console.warn('[ThemeManager] failed to restore option during undo:', opt.name, err);
              setError(`Undo restored layer but failed to restore option "${opt.name}"`);
            }
          }
          fetchDimensions();
        },
      });
    } catch (err) {
      setError(makeErrorMsg(err, 'Failed to delete dimension'));
    } finally {
      setIsDeletingDim(false);
    }
  };

  return {
    dimensions,
    setDimensions,
    loading,
    error,
    setError,
    fetchWarnings,
    setFetchWarnings,
    coverage,
    missingOverrides,
    optionSetOrders,
    setOptionSetOrders,
    selectedOptions,
    setSelectedOptions,
    setTokenValues,
    setTokenTypesRef,
    newlyCreatedDim,
    setNewlyCreatedDim,
    fetchDimensions,
    debouncedFetchDimensions,
    newDimName,
    setNewDimName,
    showCreateDim,
    setShowCreateDim,
    createDimError,
    setCreateDimError,
    isCreatingDim,
    handleCreateDimension,
    renameDim,
    renameValue,
    setRenameValue,
    renameError,
    isRenamingDim,
    startRenameDim,
    cancelRenameDim,
    executeRenameDim,
    dimensionDeleteConfirm,
    setDimensionDeleteConfirm,
    isDeletingDim,
    executeDeleteDimension,
  };
}
