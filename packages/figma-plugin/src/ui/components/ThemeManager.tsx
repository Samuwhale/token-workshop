import { getErrorMessage } from '../shared/utils';
import { Spinner } from './Spinner';
import { ConfirmModal } from './ConfirmModal';
import { apiFetch, ApiError } from '../shared/apiFetch';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { flattenTokenGroup } from '@tokenmanager/core';
import type { ThemeOption, ThemeDimension } from '@tokenmanager/core';
import type { UndoSlot } from '../hooks/useUndo';
import type { ResolverContentProps } from './ResolverPanel';
import { ResolverContent } from './ResolverPanel';

const STATE_LABELS: Record<string, string> = {
  disabled: 'Excluded',
  source: 'Base',
  enabled: 'Override',
};

const STATE_DESCRIPTIONS: Record<string, string> = {
  disabled: 'Tokens from this set are not used in this option',
  source: 'Provides default token values — overridden by Override sets',
  enabled: 'Highest priority — these tokens override Base set values',
};

interface ThemeManagerProps {
  serverUrl: string;
  connected: boolean;
  sets: string[];
  onDimensionsChange?: (dimensions: ThemeDimension[]) => void;
  onNavigateToToken?: (set: string, tokenPath: string) => void;
  onCreateToken?: (tokenPath: string, set: string) => void;
  onPushUndo?: (slot: UndoSlot) => void;
  /** Resolver state — when provided, enables the Advanced mode toggle */
  resolverState?: ResolverContentProps;
}

type CoverageToken = {
  path: string;
  set: string;
  /** The first alias target that cannot be resolved in the active sets */
  missingRef?: string;
  /** A concrete value found in another set that can fill the gap */
  fillValue?: unknown;
  /** $type for the fill token */
  fillType?: string;
};
type CoverageMap = Record<string, Record<string, { uncovered: CoverageToken[] }>>;

type AutoFillPendingItem = { path: string; $value: unknown; $type?: string };
type AutoFillPreview =
  | { mode: 'single-option'; dimId: string; optionName: string; targetSet: string; tokens: AutoFillPendingItem[] }
  | { mode: 'all-options'; dimId: string; perSetBatch: Record<string, AutoFillPendingItem[]>; totalCount: number };


function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function ThemeManager({ serverUrl, connected, sets, onDimensionsChange, onNavigateToToken, onCreateToken, onPushUndo, resolverState }: ThemeManagerProps) {
  const [themeMode, setThemeMode] = useState<'simple' | 'advanced'>('simple');
  const [dimensions, setDimensions] = useState<ThemeDimension[]>([]);

  useEffect(() => { onDimensionsChange?.(dimensions); }, [dimensions, onDimensionsChange]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchWarnings, setFetchWarnings] = useState<string | null>(null);

  // Create dimension
  const [newDimName, setNewDimName] = useState('');
  const [showCreateDim, setShowCreateDim] = useState(false);
  const [createDimError, setCreateDimError] = useState<string | null>(null);

  // Rename dimension
  const [renameDim, setRenameDim] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);

  // Rename option
  const [renameOption, setRenameOption] = useState<{ dimId: string; optionName: string } | null>(null);
  const [renameOptionValue, setRenameOptionValue] = useState('');
  const [renameOptionError, setRenameOptionError] = useState<string | null>(null);

  // (delete confirm removed — deletes are immediate with undo toast)

  // Add option per dimension
  const [newOptionNames, setNewOptionNames] = useState<Record<string, string>>({});
  const [showAddOption, setShowAddOption] = useState<Record<string, boolean>>({});
  const [addOptionErrors, setAddOptionErrors] = useState<Record<string, string>>({});
  const addOptionInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Coverage gaps
  const [coverage, setCoverage] = useState<CoverageMap>({});
  const [expandedCoverage, setExpandedCoverage] = useState<Set<string>>(new Set());
  const [expandedStale, setExpandedStale] = useState<Set<string>>(new Set());
  const [showMissingOnly, setShowMissingOnly] = useState<Set<string>>(new Set());

  // Per-option set ordering
  const [optionSetOrders, setOptionSetOrders] = useState<Record<string, Record<string, string[]>>>({});

  // Bulk set-status context menu
  const [bulkMenu, setBulkMenu] = useState<{ x: number; y: number; dimId: string; setName: string } | null>(null);
  const bulkMenuRef = useRef<HTMLDivElement | null>(null);
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());

  // Newly created dimension for auto-scroll
  const [newlyCreatedDim, setNewlyCreatedDim] = useState<string | null>(null);

  // Debounced fetchDimensions
  const debounceFetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // AbortController for in-flight fetchDimensions — cancelled on re-fetch or unmount
  const fetchAbortRef = useRef<AbortController | null>(null);

  // Mutation queue: serializes handleSetState / handleBulkSetState so concurrent
  // calls don't interleave optimistic updates or capture stale rollback snapshots.
  const mutationChainRef = useRef<Promise<void>>(Promise.resolve());

  // --- New stacking UI state ---
  // Selected option tab per dimension
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  // Token values per set (for live preview)
  const [setTokenValues, setSetTokenValues] = useState<Record<string, Record<string, any>>>({});
  // Token types per set (for auto-fill)
  const setTokenTypesRef = useRef<Record<string, Record<string, string>>>({});
  // Auto-fill in-progress state
  const [fillingKeys, setFillingKeys] = useState<Set<string>>(new Set());
  // Auto-fill confirmation preview
  const [autoFillPreview, setAutoFillPreview] = useState<AutoFillPreview | null>(null);
  // Live preview panel
  const [showPreview, setShowPreview] = useState(false);
  const [previewSearch, setPreviewSearch] = useState('');
  // Collapsed "Excluded" sections per dimension
  const [collapsedDisabled, setCollapsedDisabled] = useState<Set<string>>(new Set());
  // Dimension/option search filter
  const [dimSearch, setDimSearch] = useState('');
  const dimSearchRef = useRef<HTMLInputElement | null>(null);

  // Compare two options
  const [showCompare, setShowCompare] = useState(false);
  const [compareOptA, setCompareOptA] = useState<{ dimId: string; optionName: string } | null>(null);
  const [compareOptB, setCompareOptB] = useState<{ dimId: string; optionName: string } | null>(null);
  const [compareSearch, setCompareSearch] = useState('');
  const [compareDiffsOnly, setCompareDiffsOnly] = useState(true);

  // Drag-and-drop reorder state
  const [draggingDimId, setDraggingDimId] = useState<string | null>(null);
  const [dragOverDimId, setDragOverDimId] = useState<string | null>(null);
  const [draggingOpt, setDraggingOpt] = useState<{ dimId: string; optionName: string } | null>(null);
  const [dragOverOpt, setDragOverOpt] = useState<{ dimId: string; optionName: string } | null>(null);

  // "Copy from" state — for seeding a new option from an existing one, and for replacing an existing option's assignments
  const [copyFromNewOption, setCopyFromNewOption] = useState<Record<string, string>>({});
  const [showCopyFromMenu, setShowCopyFromMenu] = useState<{ dimId: string; optionName: string } | null>(null);
  const copyFromMenuRef = useRef<HTMLDivElement | null>(null);

  const fetchDimensions = useCallback(async () => {
    if (!connected) { setLoading(false); return; }
    // Cancel any in-flight fetch to avoid racing setState calls
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    try {
      const data = await apiFetch<{ dimensions?: ThemeDimension[] }>(`${serverUrl}/api/themes`, { signal: controller.signal });
      const allDimensions: ThemeDimension[] = data.dimensions || [];
      setDimensions(allDimensions);

      // Initialise per-option set orders
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

      // Auto-select first option for dimensions without a selection
      setSelectedOptions(prev => {
        const next = { ...prev };
        for (const dim of allDimensions) {
          if (!next[dim.id] && dim.options.length > 0) {
            next[dim.id] = dim.options[0].name;
          }
          // Fix stale selection
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
          const d = await apiFetch<{ tokens?: Record<string, any> }>(`${serverUrl}/api/tokens/${encodeURIComponent(s)}`, { signal: controller.signal });
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
        setFetchWarnings(`Could not load ${failedSets.length === 1 ? `set "${failedSets[0]}"` : `${failedSets.length} sets (${failedSets.join(', ')})`} — coverage data may be incomplete`);
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

      /** Find the first alias target in a reference chain that's missing from activeValues */
      const findMissingRef = (value: any, activeValues: Record<string, any>, visited = new Set<string>()): string | null => {
        if (typeof value !== 'string') return null;
        const m = /^\{([^}]+)\}$/.exec(value);
        if (!m) return null;
        const target = m[1];
        if (visited.has(target)) return null; // circular — no single missing ref
        if (!(target in activeValues)) return target; // this is the missing one
        return findMissingRef(activeValues[target], activeValues, new Set([...visited, target]));
      };

      /** Search all loaded sets for a concrete value at the given path */
      const findFillValue = (path: string): { value: unknown; type?: string } | null => {
        for (const [setName, tokens] of Object.entries(tokenValues)) {
          if (path in tokens) {
            return { value: tokens[path], type: tokenTypes[setName]?.[path] };
          }
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
              for (const path of Object.keys(tokenValues[setName] ?? {})) {
                tokenSetOrigin[path] = setName;
              }
              Object.assign(activeValues, tokenValues[setName] ?? {});
            }
          }
          for (const [setName, state] of Object.entries(opt.sets)) {
            if (state === 'enabled') {
              for (const path of Object.keys(tokenValues[setName] ?? {})) {
                tokenSetOrigin[path] = setName;
              }
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
              if (found) {
                entry.fillValue = found.value;
                entry.fillType = found.type;
              }
            }
            uncovered.push(entry);
          }
          cov[dim.id][opt.name] = { uncovered };
        }
      }
      setCoverage(cov);
      const keysWithGaps = new Set<string>();
      for (const dim of allDimensions) {
        for (const opt of dim.options) {
          if ((cov[dim.id]?.[opt.name]?.uncovered.length ?? 0) > 0) {
            keysWithGaps.add(`${dim.id}:${opt.name}`);
          }
        }
      }
      setExpandedCoverage(keysWithGaps);
    } catch (err) {
      if (controller.signal.aborted) return; // superseded by a newer fetch
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

  useEffect(() => { fetchDimensions(); }, [fetchDimensions]);

  // --- Create dimension ---

  const handleCreateDimension = async () => {
    const name = newDimName.trim();
    if (!name || !connected) return;
    const id = slugify(name) || name.toLowerCase().replace(/\s+/g, '-');
    if (!id || !/^[a-z0-9-]+$/.test(id)) {
      setCreateDimError('Name must contain at least one letter or number (spaces and hyphens are allowed).');
      return;
    }
    if (dimensions.some(d => d.id === id || d.name.toLowerCase() === name.toLowerCase())) {
      setCreateDimError(`A dimension with that name already exists.`);
      return;
    }
    setCreateDimError(null);
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
    } catch (err) {
      setCreateDimError(err instanceof ApiError ? err.message : getErrorMessage(err, 'Failed to create dimension'));
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
    if (!renameDim) return;
    const name = renameValue.trim();
    if (!name) { setRenameError('Name cannot be empty'); return; }
    const current = dimensions.find(d => d.id === renameDim);
    if (!current) { cancelRenameDim(); return; }
    if (name === current.name) { cancelRenameDim(); return; }
    if (dimensions.some(d => d.id !== renameDim && d.name === name)) {
      setRenameError(`Dimension "${name}" already exists`);
      return;
    }
    try {
      await apiFetch(`${serverUrl}/api/themes/dimensions/${encodeURIComponent(renameDim)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      setDimensions(prev => prev.map(d => d.id === renameDim ? { ...d, name } : d));
      cancelRenameDim();
      debouncedFetchDimensions();
    } catch (err) {
      setRenameError(err instanceof ApiError ? err.message : getErrorMessage(err, 'Rename failed'));
    }
  };

  // --- Rename option ---

  const startRenameOption = (dimId: string, optionName: string) => {
    setRenameOption({ dimId, optionName });
    setRenameOptionValue(optionName);
    setRenameOptionError(null);
  };

  const cancelRenameOption = () => {
    setRenameOption(null);
    setRenameOptionValue('');
    setRenameOptionError(null);
  };

  const executeRenameOption = async () => {
    if (!renameOption) return;
    const name = renameOptionValue.trim();
    if (!name) { setRenameOptionError('Name cannot be empty'); return; }
    if (name === renameOption.optionName) { cancelRenameOption(); return; }
    const dim = dimensions.find(d => d.id === renameOption.dimId);
    if (!dim) { cancelRenameOption(); return; }
    if (dim.options.some(o => o.name === name)) {
      setRenameOptionError(`Option "${name}" already exists`);
      return;
    }
    try {
      await apiFetch(
        `${serverUrl}/api/themes/dimensions/${encodeURIComponent(renameOption.dimId)}/options/${encodeURIComponent(renameOption.optionName)}`,
        { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) },
      );
      setDimensions(prev => prev.map(d =>
        d.id === renameOption.dimId
          ? { ...d, options: d.options.map(o => o.name === renameOption.optionName ? { ...o, name } : o) }
          : d,
      ));
      setOptionSetOrders(prev => {
        const next = { ...prev };
        if (next[renameOption.dimId]?.[renameOption.optionName]) {
          next[renameOption.dimId] = { ...next[renameOption.dimId], [name]: next[renameOption.dimId][renameOption.optionName] };
          delete next[renameOption.dimId][renameOption.optionName];
        }
        return next;
      });
      // Update selected option if it was the renamed one
      setSelectedOptions(prev => {
        if (prev[renameOption.dimId] === renameOption.optionName) {
          return { ...prev, [renameOption.dimId]: name };
        }
        return prev;
      });
      cancelRenameOption();
      debouncedFetchDimensions();
    } catch (err) {
      setRenameOptionError(err instanceof ApiError ? err.message : getErrorMessage(err, 'Rename failed'));
    }
  };

  // --- Delete dimension ---

  const executeDeleteDimension = async (id: string) => {
    // Snapshot the full dimension (with all options) for undo
    const snapshot = dimensions.find(d => d.id === id);
    if (!snapshot) return;
    const savedDim = JSON.parse(JSON.stringify(snapshot)) as ThemeDimension;
    try {
      await apiFetch(`${serverUrl}/api/themes/dimensions/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setDimensions(prev => prev.filter(d => d.id !== id));
      debouncedFetchDimensions();

      // Push undo slot to recreate the dimension + all its options
      onPushUndo?.({
        description: `Deleted layer "${savedDim.name}"`,
        restore: async () => {
          // Recreate the dimension
          try {
            await apiFetch(`${serverUrl}/api/themes/dimensions`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: savedDim.id, name: savedDim.name }),
            });
          } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Failed to undo: could not recreate layer');
            return;
          }
          // Recreate each option
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
      setError(err instanceof ApiError ? err.message : getErrorMessage(err, 'Failed to delete dimension'));
    }
  };

  // --- Add option ---

  const handleAddOption = async (dimId: string) => {
    const name = (newOptionNames[dimId] || '').trim();
    if (!name || !connected) return;
    const dim = dimensions.find(d => d.id === dimId);
    if (!dim) return;
    if (dim.options.some(o => o.name === name)) {
      setAddOptionErrors(prev => ({ ...prev, [dimId]: `Option "${name}" already exists in this dimension.` }));
      return;
    }
    setAddOptionErrors(prev => ({ ...prev, [dimId]: '' }));
    // Seed from a copy-from source if one is selected, otherwise start all disabled
    const copyFromName = copyFromNewOption[dimId] || '';
    const sourceOpt = copyFromName ? dim.options.find(o => o.name === copyFromName) : null;
    const initialSets: Record<string, 'disabled' | 'enabled' | 'source'> = {};
    if (sourceOpt) {
      sets.forEach(s => { initialSets[s] = (sourceOpt.sets[s] as 'disabled' | 'enabled' | 'source') || 'disabled'; });
    } else {
      sets.forEach(s => { initialSets[s] = 'disabled'; });
    }
    try {
      await apiFetch(`${serverUrl}/api/themes/dimensions/${encodeURIComponent(dimId)}/options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, sets: initialSets }),
      });
      setNewOptionNames(prev => ({ ...prev, [dimId]: '' }));
      setCopyFromNewOption(prev => ({ ...prev, [dimId]: '' }));
      setDimensions(prev => prev.map(d =>
        d.id === dimId ? { ...d, options: [...d.options, { name, sets: initialSets }] } : d,
      ));
      // Auto-select newly added option
      setSelectedOptions(prev => ({ ...prev, [dimId]: name }));
      debouncedFetchDimensions();
      setTimeout(() => addOptionInputRefs.current[dimId]?.focus(), 0);
    } catch (err) {
      setAddOptionErrors(prev => ({ ...prev, [dimId]: err instanceof ApiError ? err.message : getErrorMessage(err, 'Failed to add option') }));
    }
  };

  // --- Duplicate option ---

  const handleDuplicateOption = async (dimId: string, optionName: string) => {
    const dim = dimensions.find(d => d.id === dimId);
    if (!dim || !connected) return;
    const opt = dim.options.find(o => o.name === optionName);
    if (!opt) return;
    let newName = `${optionName} copy`;
    let counter = 2;
    while (dim.options.some(o => o.name === newName)) {
      newName = `${optionName} copy ${counter++}`;
    }
    try {
      await apiFetch(`${serverUrl}/api/themes/dimensions/${encodeURIComponent(dimId)}/options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, sets: { ...opt.sets } }),
      });
      setDimensions(prev => prev.map(d =>
        d.id === dimId ? { ...d, options: [...d.options, { name: newName, sets: { ...opt.sets } }] } : d,
      ));
      setSelectedOptions(prev => ({ ...prev, [dimId]: newName }));
      debouncedFetchDimensions();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : getErrorMessage(err, 'Failed to duplicate option'));
    }
  };

  // --- Move option (reorder) ---

  const handleMoveOption = async (dimId: string, optionName: string, direction: 'up' | 'down') => {
    const dim = dimensions.find(d => d.id === dimId);
    if (!dim || !connected) return;
    const idx = dim.options.findIndex(o => o.name === optionName);
    if (idx === -1) return;
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= dim.options.length) return;
    const reordered = [...dim.options];
    [reordered[idx], reordered[newIdx]] = [reordered[newIdx], reordered[idx]];
    setDimensions(prev => prev.map(d => d.id === dimId ? { ...d, options: reordered } : d));
    try {
      await apiFetch(
        `${serverUrl}/api/themes/dimensions/${encodeURIComponent(dimId)}/options-order`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ options: reordered.map(o => o.name) }),
        },
      );
    } catch (err) {
      console.warn('[ThemeManager] failed to reorder options:', err);
      fetchDimensions();
    }
  };

  // --- Move dimension (reorder) ---

  const handleMoveDimension = async (dimId: string, direction: 'up' | 'down') => {
    if (!connected) return;
    const idx = dimensions.findIndex(d => d.id === dimId);
    if (idx === -1) return;
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= dimensions.length) return;
    const reordered = [...dimensions];
    [reordered[idx], reordered[newIdx]] = [reordered[newIdx], reordered[idx]];
    setDimensions(reordered);
    try {
      await apiFetch(
        `${serverUrl}/api/themes/dimensions-order`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dimensionIds: reordered.map(d => d.id) }),
        },
      );
    } catch (err) {
      console.warn('[ThemeManager] failed to reorder dimensions:', err);
      fetchDimensions();
    }
  };

  // --- Drag-and-drop dimension reorder ---

  const handleDimDragStart = (e: React.DragEvent, dimId: string) => {
    e.dataTransfer.effectAllowed = 'move';
    setDraggingDimId(dimId);
  };

  const handleDimDragOver = (e: React.DragEvent, dimId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dimId !== dragOverDimId) setDragOverDimId(dimId);
  };

  const handleDimDrop = async (targetDimId: string) => {
    if (!draggingDimId || draggingDimId === targetDimId) {
      setDraggingDimId(null);
      setDragOverDimId(null);
      return;
    }
    const fromIdx = dimensions.findIndex(d => d.id === draggingDimId);
    const toIdx = dimensions.findIndex(d => d.id === targetDimId);
    if (fromIdx === -1 || toIdx === -1) { setDraggingDimId(null); setDragOverDimId(null); return; }
    const reordered = [...dimensions];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    setDimensions(reordered);
    setDraggingDimId(null);
    setDragOverDimId(null);
    try {
      await apiFetch(`${serverUrl}/api/themes/dimensions-order`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dimensionIds: reordered.map(d => d.id) }),
      });
    } catch (err) {
      console.warn('[ThemeManager] failed to reorder dimensions:', err);
      fetchDimensions();
    }
  };

  const handleDimDragEnd = () => { setDraggingDimId(null); setDragOverDimId(null); };

  // --- Drag-and-drop option reorder ---

  const handleOptDragStart = (e: React.DragEvent, dimId: string, optionName: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.stopPropagation();
    setDraggingOpt({ dimId, optionName });
  };

  const handleOptDragOver = (e: React.DragEvent, dimId: string, optionName: string) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverOpt?.dimId !== dimId || dragOverOpt?.optionName !== optionName) {
      setDragOverOpt({ dimId, optionName });
    }
  };

  const handleOptDrop = async (e: React.DragEvent, targetDimId: string, targetOptionName: string) => {
    e.stopPropagation();
    if (!draggingOpt || draggingOpt.dimId !== targetDimId || draggingOpt.optionName === targetOptionName) {
      setDraggingOpt(null);
      setDragOverOpt(null);
      return;
    }
    const dim = dimensions.find(d => d.id === targetDimId);
    if (!dim) { setDraggingOpt(null); setDragOverOpt(null); return; }
    const fromIdx = dim.options.findIndex(o => o.name === draggingOpt.optionName);
    const toIdx = dim.options.findIndex(o => o.name === targetOptionName);
    if (fromIdx === -1 || toIdx === -1) { setDraggingOpt(null); setDragOverOpt(null); return; }
    const reordered = [...dim.options];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    setDimensions(prev => prev.map(d => d.id === targetDimId ? { ...d, options: reordered } : d));
    setDraggingOpt(null);
    setDragOverOpt(null);
    try {
      await apiFetch(`${serverUrl}/api/themes/dimensions/${encodeURIComponent(targetDimId)}/options-order`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ options: reordered.map(o => o.name) }),
      });
    } catch (err) {
      console.warn('[ThemeManager] failed to reorder options:', err);
      fetchDimensions();
    }
  };

  const handleOptDragEnd = () => { setDraggingOpt(null); setDragOverOpt(null); };

  // --- Delete option ---

  const executeDeleteOption = async (dimId: string, optionName: string) => {
    // Snapshot the option for undo
    const dim = dimensions.find(d => d.id === dimId);
    const snapshot = dim?.options.find(o => o.name === optionName);
    if (!snapshot) return;
    const savedOpt = JSON.parse(JSON.stringify(snapshot)) as ThemeOption;
    const dimName = dim!.name;
    try {
      await apiFetch(
        `${serverUrl}/api/themes/dimensions/${encodeURIComponent(dimId)}/options/${encodeURIComponent(optionName)}`,
        { method: 'DELETE' },
      );
      setDimensions(prev => prev.map(d =>
        d.id === dimId ? { ...d, options: d.options.filter(o => o.name !== optionName) } : d,
      ));
      debouncedFetchDimensions();

      // Push undo slot to recreate the option
      onPushUndo?.({
        description: `Deleted option "${optionName}" from "${dimName}"`,
        restore: async () => {
          await apiFetch(`${serverUrl}/api/themes/dimensions/${encodeURIComponent(dimId)}/options`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: savedOpt.name, sets: savedOpt.sets }),
          });
          fetchDimensions();
        },
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : getErrorMessage(err, 'Failed to delete option'));
    }
  };

  // --- Auto-fill from source ---

  /** Find the first override (enabled) set for a given option, to write fill tokens into */
  const getOverrideSet = (dimId: string, optionName: string): string | null => {
    const dim = dimensions.find(d => d.id === dimId);
    const opt = dim?.options.find(o => o.name === optionName);
    if (!opt) return null;
    const entry = Object.entries(opt.sets).find(([, s]) => s === 'enabled');
    return entry?.[0] ?? null;
  };

  /** Auto-fill a single uncovered token by creating its missing reference in the override set */
  const handleAutoFillSingle = async (dimId: string, optionName: string, item: CoverageToken) => {
    if (!item.missingRef || item.fillValue === undefined) return;
    const targetSet = getOverrideSet(dimId, optionName);
    if (!targetSet) {
      setError('No override set available. Assign a set as Override first.');
      return;
    }
    const fillKey = `${dimId}:${optionName}:${item.path}`;
    setFillingKeys(prev => { const n = new Set(prev); n.add(fillKey); return n; });
    try {
      const tokenPath = item.missingRef.split('.').map(encodeURIComponent).join('/');
      const body: Record<string, unknown> = { $value: item.fillValue };
      if (item.fillType) body.$type = item.fillType;
      await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(targetSet)}/${tokenPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      debouncedFetchDimensions();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : getErrorMessage(err, 'Failed to auto-fill token'));
    } finally {
      setFillingKeys(prev => { const n = new Set(prev); n.delete(fillKey); return n; });
    }
  };

  /** Auto-fill all uncovered tokens that have a known fill value — shows a preview modal first */
  const handleAutoFillAll = (dimId: string, optionName: string) => {
    const items = coverage[dimId]?.[optionName]?.uncovered ?? [];
    const fillable = items.filter(i => i.missingRef && i.fillValue !== undefined);
    if (fillable.length === 0) return;
    const targetSet = getOverrideSet(dimId, optionName);
    if (!targetSet) {
      setError('No override set available. Assign a set as Override first.');
      return;
    }
    // De-duplicate by missingRef — multiple tokens may reference the same missing path
    const seen = new Set<string>();
    const tokens: Array<{ path: string; $value: unknown; $type?: string }> = [];
    for (const item of fillable) {
      if (!item.missingRef || seen.has(item.missingRef)) continue;
      seen.add(item.missingRef);
      const t: { path: string; $value: unknown; $type?: string } = { path: item.missingRef, $value: item.fillValue };
      if (item.fillType) t.$type = item.fillType;
      tokens.push(t);
    }
    setAutoFillPreview({ mode: 'single-option', dimId, optionName, targetSet, tokens });
  };

  /** Execute the auto-fill for a single option after confirmation */
  const executeAutoFillAll = async (preview: Extract<AutoFillPreview, { mode: 'single-option' }>) => {
    const { dimId, optionName, targetSet, tokens } = preview;
    const fillKey = `${dimId}:${optionName}:__all__`;
    setFillingKeys(prev => { const n = new Set(prev); n.add(fillKey); return n; });
    setAutoFillPreview(null);
    try {
      await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(targetSet)}/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens, strategy: 'skip' }),
      });
      debouncedFetchDimensions();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : getErrorMessage(err, 'Failed to auto-fill tokens'));
    } finally {
      setFillingKeys(prev => { const n = new Set(prev); n.delete(fillKey); return n; });
    }
  };

  /** Auto-fill all uncovered tokens across ALL options within a dimension — shows a preview modal first */
  const handleAutoFillAllOptions = (dimId: string) => {
    const dim = dimensions.find(d => d.id === dimId);
    if (!dim) return;
    const dimCov = coverage[dimId];
    if (!dimCov) return;

    // Collect per-set batch payloads: { targetSet -> token[] }
    const perSetBatch: Record<string, Array<{ path: string; $value: unknown; $type?: string }>> = {};
    let totalCount = 0;
    for (const opt of dim.options) {
      const items = dimCov[opt.name]?.uncovered ?? [];
      const fillable = items.filter(i => i.missingRef && i.fillValue !== undefined);
      if (fillable.length === 0) continue;
      const targetSet = getOverrideSet(dimId, opt.name);
      if (!targetSet) continue;
      // De-duplicate by missingRef within each target set
      if (!perSetBatch[targetSet]) perSetBatch[targetSet] = [];
      const seenInSet = new Set(perSetBatch[targetSet].map(t => t.path));
      for (const item of fillable) {
        if (!item.missingRef || seenInSet.has(item.missingRef)) continue;
        seenInSet.add(item.missingRef);
        const t: { path: string; $value: unknown; $type?: string } = { path: item.missingRef, $value: item.fillValue };
        if (item.fillType) t.$type = item.fillType;
        perSetBatch[targetSet].push(t);
        totalCount++;
      }
    }
    if (totalCount === 0) {
      setError('No override sets available. Assign sets as Override first.');
      return;
    }
    setAutoFillPreview({ mode: 'all-options', dimId, perSetBatch, totalCount });
  };

  /** Execute the auto-fill for all options after confirmation */
  const executeAutoFillAllOptions = async (preview: Extract<AutoFillPreview, { mode: 'all-options' }>) => {
    const { dimId, perSetBatch } = preview;
    const fillKey = `${dimId}:__all_options__`;
    setFillingKeys(prev => { const n = new Set(prev); n.add(fillKey); return n; });
    setAutoFillPreview(null);
    try {
      await Promise.all(
        Object.entries(perSetBatch).map(([targetSet, tokens]) =>
          apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(targetSet)}/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tokens, strategy: 'skip' }),
          })
        )
      );
      debouncedFetchDimensions();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : getErrorMessage(err, 'Failed to auto-fill tokens'));
    } finally {
      setFillingKeys(prev => { const n = new Set(prev); n.delete(fillKey); return n; });
    }
  };

  // --- Set state toggle ---

  const handleSetState = (dimId: string, optionName: string, setName: string, targetState: string) => {
    const task = async () => {
      const dim = dimensions.find(d => d.id === dimId);
      if (!dim) return;
      const opt = dim.options.find(o => o.name === optionName);
      if (!opt) return;
      const updatedSets = { ...opt.sets, [setName]: targetState as 'enabled' | 'disabled' | 'source' };
      const previousDimensions = dimensions;
      const saveKey = `${dimId}/${optionName}/${setName}`;
      setSavingKeys(prev => { const n = new Set(prev); n.add(saveKey); return n; });
      setDimensions(prev => prev.map(d =>
        d.id === dimId
          ? { ...d, options: d.options.map(o => o.name === optionName ? { ...o, sets: updatedSets } : o) }
          : d,
      ));
      try {
        await apiFetch(`${serverUrl}/api/themes/dimensions/${encodeURIComponent(dimId)}/options`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: optionName, sets: updatedSets }),
        });
        debouncedFetchDimensions();
      } catch (err) {
        setDimensions(previousDimensions);
        setError(err instanceof ApiError ? err.message : getErrorMessage(err, 'Failed to save'));
      } finally {
        setSavingKeys(prev => { const n = new Set(prev); n.delete(saveKey); return n; });
      }
    };
    const next = mutationChainRef.current.then(task);
    mutationChainRef.current = next.catch((err) => {
      console.error('[ThemeManager] mutation chain error (handleSetState):', err);
      setError(getErrorMessage(err, 'Unexpected mutation error'));
    });
  };

  // --- Copy assignments from one option to another (replaces target's sets) ---

  const handleCopyAssignmentsFrom = (dimId: string, targetOptionName: string, sourceOptionName: string) => {
    setShowCopyFromMenu(null);
    const task = async () => {
      const dim = dimensions.find(d => d.id === dimId);
      if (!dim) return;
      const source = dim.options.find(o => o.name === sourceOptionName);
      if (!source) return;
      const previousDimensions = dimensions;
      setDimensions(prev => prev.map(d =>
        d.id === dimId
          ? { ...d, options: d.options.map(o => o.name === targetOptionName ? { ...o, sets: { ...source.sets } } : o) }
          : d,
      ));
      try {
        await apiFetch(`${serverUrl}/api/themes/dimensions/${encodeURIComponent(dimId)}/options`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: targetOptionName, sets: { ...source.sets } }),
        });
        debouncedFetchDimensions();
      } catch (err) {
        setDimensions(previousDimensions);
        setError(err instanceof ApiError ? err.message : getErrorMessage(err, 'Failed to copy assignments'));
      }
    };
    const next = mutationChainRef.current.then(task);
    mutationChainRef.current = next.catch((err) => {
      console.error('[ThemeManager] mutation chain error (handleCopyAssignmentsFrom):', err);
      setError(getErrorMessage(err, 'Unexpected mutation error'));
    });
  };

  // --- Bulk assign all sets in an option to a single state ---

  const handleBulkSetAllInOption = (dimId: string, optionName: string, targetState: 'enabled' | 'disabled' | 'source') => {
    const task = async () => {
      const dim = dimensions.find(d => d.id === dimId);
      if (!dim) return;
      const opt = dim.options.find(o => o.name === optionName);
      if (!opt) return;
      const updatedSets: Record<string, 'enabled' | 'disabled' | 'source'> = {};
      sets.forEach(s => { updatedSets[s] = targetState; });
      const previousDimensions = dimensions;
      setDimensions(prev => prev.map(d =>
        d.id === dimId
          ? { ...d, options: d.options.map(o => o.name === optionName ? { ...o, sets: updatedSets } : o) }
          : d,
      ));
      try {
        await apiFetch(`${serverUrl}/api/themes/dimensions/${encodeURIComponent(dimId)}/options`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: optionName, sets: updatedSets }),
        });
        debouncedFetchDimensions();
      } catch (err) {
        setDimensions(previousDimensions);
        setError(err instanceof ApiError ? err.message : getErrorMessage(err, 'Failed to bulk-assign sets'));
      }
    };
    const next = mutationChainRef.current.then(task);
    mutationChainRef.current = next.catch((err) => {
      console.error('[ThemeManager] mutation chain error (handleBulkSetAllInOption):', err);
      setError(getErrorMessage(err, 'Unexpected bulk mutation error'));
    });
  };

  // --- Bulk set-status across all options in a dimension ---

  const handleBulkSetState = (dimId: string, setName: string, targetState: 'enabled' | 'disabled' | 'source') => {
    setBulkMenu(null);
    const task = async () => {
      const dim = dimensions.find(d => d.id === dimId);
      if (!dim) return;
      const previousDimensions = dimensions;
      const bulkKeys = dim.options.map(o => `${dimId}/${o.name}/${setName}`);
      setSavingKeys(prev => { const n = new Set(prev); bulkKeys.forEach(k => n.add(k)); return n; });
      setDimensions(prev => prev.map(d =>
        d.id === dimId
          ? { ...d, options: d.options.map(o => ({ ...o, sets: { ...o.sets, [setName]: targetState } })) }
          : d,
      ));
      try {
        await Promise.all(dim.options.map(opt => {
          const updatedSets = { ...opt.sets, [setName]: targetState };
          return apiFetch(`${serverUrl}/api/themes/dimensions/${encodeURIComponent(dimId)}/options`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: opt.name, sets: updatedSets }),
          });
        }));
        debouncedFetchDimensions();
      } catch (err) {
        setDimensions(previousDimensions);
        setError(err instanceof ApiError ? err.message : getErrorMessage(err, 'Failed to bulk-update'));
      } finally {
        setSavingKeys(prev => { const n = new Set(prev); bulkKeys.forEach(k => n.delete(k)); return n; });
      }
    };
    const next = mutationChainRef.current.then(task);
    mutationChainRef.current = next.catch((err) => {
      console.error('[ThemeManager] mutation chain error (handleBulkSetState):', err);
      setError(getErrorMessage(err, 'Unexpected bulk mutation error'));
    });
  };

  // Close bulk menu on outside click or Escape
  useEffect(() => {
    if (!bulkMenu) return;
    const close = () => setBulkMenu(null);
    requestAnimationFrame(() => {
      const first = bulkMenuRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
      first?.focus();
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { close(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const items = Array.from(bulkMenuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
        if (!items.length) return;
        const idx = items.indexOf(document.activeElement as HTMLElement);
        const next = e.key === 'ArrowDown'
          ? items[(idx + 1) % items.length]
          : items[(idx - 1 + items.length) % items.length];
        next?.focus();
      }
    };
    document.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', onKey); };
  }, [bulkMenu]);

  // Close copy-from menu on outside click or Escape
  useEffect(() => {
    if (!showCopyFromMenu) return;
    const close = () => setShowCopyFromMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', onKey); };
  }, [showCopyFromMenu]);

  // --- Live preview: compute resolved token values for current selections ---

  const previewTokens = useMemo(() => {
    if (!showPreview || dimensions.length === 0) return [];

    // Merge tokens according to the stacking model
    const merged: Record<string, { value: any; set: string; layer: string }> = {};

    // Apply dimensions bottom to top (last dimension = lowest priority, first = highest)
    for (let i = dimensions.length - 1; i >= 0; i--) {
      const dim = dimensions[i];
      const optName = selectedOptions[dim.id];
      const opt = dim.options.find(o => o.name === optName);
      if (!opt) continue;

      // Base sets first (can be overridden)
      for (const [setName, status] of Object.entries(opt.sets)) {
        if (status !== 'source') continue;
        const tokens = setTokenValues[setName];
        if (!tokens) continue;
        for (const [path, value] of Object.entries(tokens)) {
          merged[path] = { value, set: setName, layer: `${dim.name} / Base` };
        }
      }
      // Override sets (take priority)
      for (const [setName, status] of Object.entries(opt.sets)) {
        if (status !== 'enabled') continue;
        const tokens = setTokenValues[setName];
        if (!tokens) continue;
        for (const [path, value] of Object.entries(tokens)) {
          merged[path] = { value, set: setName, layer: `${dim.name} / Override` };
        }
      }
    }

    // Resolve aliases
    const resolveAlias = (value: any, depth = 0): any => {
      if (depth > 10 || typeof value !== 'string') return value;
      const m = /^\{([^}]+)\}$/.exec(value);
      if (!m) return value;
      const target = m[1];
      if (merged[target]) return resolveAlias(merged[target].value, depth + 1);
      return value;
    };

    let entries = Object.entries(merged).map(([path, info]) => ({
      path,
      rawValue: info.value,
      resolvedValue: resolveAlias(info.value),
      set: info.set,
      layer: info.layer,
    }));

    if (previewSearch) {
      const term = previewSearch.toLowerCase();
      entries = entries.filter(e =>
        e.path.toLowerCase().includes(term) ||
        e.set.toLowerCase().includes(term) ||
        String(e.resolvedValue).toLowerCase().includes(term)
      );
    }

    return entries.slice(0, 50);
  }, [showPreview, dimensions, selectedOptions, setTokenValues, previewSearch]);

  // --- Compare two options: resolved diff rows ---

  const compareRows = useMemo(() => {
    if (!showCompare || !compareOptA || !compareOptB) return [];
    const dimA = dimensions.find(d => d.id === compareOptA.dimId);
    const dimB = dimensions.find(d => d.id === compareOptB.dimId);
    const optA = dimA?.options.find(o => o.name === compareOptA.optionName);
    const optB = dimB?.options.find(o => o.name === compareOptB.optionName);
    if (!optA || !optB) return [];

    const resolveForOpt = (opt: ThemeOption): Record<string, any> => {
      const merged: Record<string, any> = {};
      for (const [s, st] of Object.entries(opt.sets)) {
        if (st === 'source') Object.assign(merged, setTokenValues[s] ?? {});
      }
      for (const [s, st] of Object.entries(opt.sets)) {
        if (st === 'enabled') Object.assign(merged, setTokenValues[s] ?? {});
      }
      const resolve = (v: any, depth = 0): any => {
        if (depth > 10 || typeof v !== 'string') return v;
        const m = /^\{([^}]+)\}$/.exec(v);
        if (!m) return v;
        const t = m[1];
        return t in merged ? resolve(merged[t], depth + 1) : v;
      };
      const out: Record<string, any> = {};
      for (const [p, v] of Object.entries(merged)) out[p] = resolve(v);
      return out;
    };

    const tokensA = resolveForOpt(optA);
    const tokensB = resolveForOpt(optB);
    const allPaths = new Set([...Object.keys(tokensA), ...Object.keys(tokensB)]);

    const rows: Array<{ path: string; a: any; b: any; isDiff: boolean }> = [];
    for (const path of allPaths) {
      const a = tokensA[path];
      const b = tokensB[path];
      const isDiff = JSON.stringify(a) !== JSON.stringify(b);
      rows.push({ path, a, b, isDiff });
    }

    rows.sort((x, y) => {
      if (x.isDiff !== y.isDiff) return x.isDiff ? -1 : 1;
      return x.path.localeCompare(y.path);
    });

    let result = rows;
    if (compareDiffsOnly) result = rows.filter(r => r.isDiff);
    if (compareSearch) {
      const term = compareSearch.toLowerCase();
      result = result.filter(r =>
        r.path.toLowerCase().includes(term) ||
        String(r.a ?? '').toLowerCase().includes(term) ||
        String(r.b ?? '').toLowerCase().includes(term)
      );
    }
    return result;
  }, [showCompare, compareOptA, compareOptB, dimensions, setTokenValues, compareDiffsOnly, compareSearch]);

  // --- Per-option diff counts vs currently selected option ---
  const optionDiffCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const resolveOpt = (opt: ThemeOption): Record<string, any> => {
      const merged: Record<string, any> = {};
      for (const [s, st] of Object.entries(opt.sets)) {
        if (st === 'source') Object.assign(merged, setTokenValues[s] ?? {});
      }
      for (const [s, st] of Object.entries(opt.sets)) {
        if (st === 'enabled') Object.assign(merged, setTokenValues[s] ?? {});
      }
      const resolve = (v: any, depth = 0): any => {
        if (depth > 10 || typeof v !== 'string') return v;
        const m = /^\{([^}]+)\}$/.exec(v);
        if (!m) return v;
        const t = m[1];
        return t in merged ? resolve(merged[t], depth + 1) : v;
      };
      const out: Record<string, any> = {};
      for (const [p, v] of Object.entries(merged)) out[p] = resolve(v);
      return out;
    };
    for (const dim of dimensions) {
      if (dim.options.length < 2) continue;
      const selOptName = selectedOptions[dim.id] || dim.options[0]?.name || '';
      const selOpt = dim.options.find(o => o.name === selOptName);
      if (!selOpt) continue;
      const selTokens = resolveOpt(selOpt);
      for (const opt of dim.options) {
        if (opt.name === selOptName) continue;
        const optTokens = resolveOpt(opt);
        const allPaths = new Set([...Object.keys(optTokens), ...Object.keys(selTokens)]);
        let diff = 0;
        for (const path of allPaths) {
          if (JSON.stringify(optTokens[path]) !== JSON.stringify(selTokens[path])) diff++;
        }
        counts[`${dim.id}/${opt.name}`] = diff;
      }
    }
    return counts;
  }, [dimensions, selectedOptions, setTokenValues]);

  // --- Render helpers ---

  const renderSetRow = (dim: ThemeDimension, opt: ThemeOption, setName: string, status: string) => {
    const isSaving = savingKeys.has(`${dim.id}/${opt.name}/${setName}`);
    const saveKey = `${dim.id}/${opt.name}/${setName}`;
    return (
      <div
        key={setName}
        className={`group/setrow flex items-center gap-1.5 px-2 py-0.5 transition-colors hover:bg-[var(--color-figma-bg-hover)] ${isSaving ? 'opacity-50 pointer-events-none' : ''}`}
        onContextMenu={e => {
          e.preventDefault();
          const x = Math.min(e.clientX, window.innerWidth - 180);
          const y = Math.min(e.clientY, window.innerHeight - 120);
          setBulkMenu({ x, y, dimId: dim.id, setName });
        }}
      >
        <span className="text-[10px] text-[var(--color-figma-text)] flex-1 truncate" title={setName}>{setName}</span>
        <div className="flex rounded overflow-hidden border border-[var(--color-figma-border)] text-[10px] font-medium">
          {(['disabled', 'source', 'enabled'] as const).map(s => (
            <button
              key={s}
              onClick={() => { if (status !== s) handleSetState(dim.id, opt.name, setName, s); }}
              className={`px-1.5 py-0.5 transition-colors ${
                status === s
                  ? s === 'source'
                    ? 'bg-[var(--color-figma-accent)]/20 text-[var(--color-figma-accent)]'
                    : s === 'enabled'
                    ? 'bg-[var(--color-figma-success)]/20 text-[var(--color-figma-success)]'
                    : 'bg-[var(--color-figma-border)]/60 text-[var(--color-figma-text-secondary)]'
                  : 'text-[var(--color-figma-text-tertiary)] hover:bg-[var(--color-figma-bg-hover)]'
              }`}
              title={STATE_DESCRIPTIONS[s]}
              aria-pressed={status === s}
            >
              {STATE_LABELS[s]}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderValuePreview = (value: any) => {
    if (typeof value === 'string') {
      // Color preview
      if (/^#[0-9a-fA-F]{6,8}$/.test(value)) {
        return (
          <span className="flex items-center gap-1">
            <span
              className="inline-block w-3 h-3 rounded border border-[var(--color-figma-border)]"
              style={{ backgroundColor: value }}
            />
            <span className="font-mono text-[10px]">{value}</span>
          </span>
        );
      }
      // Alias reference
      if (/^\{[^}]+\}$/.test(value)) {
        return <span className="font-mono text-[10px] text-[var(--color-figma-warning)]">{value}</span>;
      }
    }
    return <span className="font-mono text-[10px]">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>;
  };

  if (!connected) {
    return (
      <div className="flex items-center justify-center py-12 text-[var(--color-figma-text-secondary)] text-[11px]">
        Connect to server to manage themes
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-[var(--color-figma-text-secondary)] text-[11px]">
        <Spinner size="md" className="text-[var(--color-figma-accent)]" />
        Loading themes...
      </div>
    );
  }

  // Filter dimensions (and their options) by search query
  const filteredDimensions = useMemo(() => {
    const q = dimSearch.trim().toLowerCase();
    if (!q) return dimensions;
    return dimensions.filter(dim => {
      if (dim.name.toLowerCase().includes(q)) return true;
      return dim.options.some(o => o.name.toLowerCase().includes(q));
    });
  }, [dimensions, dimSearch]);

  // Advanced mode: render the resolver UI instead of the theme dimension grid
  if (themeMode === 'advanced' && resolverState) {
    return (
      <div className="flex flex-col h-full">
        {/* Mode toggle bar */}
        <div className="shrink-0 px-3 py-1.5 border-b border-[var(--color-figma-border)] flex items-center justify-between bg-[var(--color-figma-bg-secondary)]">
          <div className="flex items-center gap-1">
            {(['simple', 'advanced'] as const).map(m => (
              <button
                key={m}
                onClick={() => setThemeMode(m)}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors capitalize ${
                  themeMode === m
                    ? 'bg-[var(--color-figma-accent)] text-white'
                    : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">DTCG Resolvers</span>
        </div>
        <div className="flex-1 overflow-hidden">
          <ResolverContent {...resolverState} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Mode toggle bar — only shown when resolver state is available */}
      {resolverState && (
        <div className="shrink-0 px-3 py-1.5 border-b border-[var(--color-figma-border)] flex items-center justify-between bg-[var(--color-figma-bg-secondary)]">
          <div className="flex items-center gap-1">
            {(['simple', 'advanced'] as const).map(m => (
              <button
                key={m}
                onClick={() => setThemeMode(m)}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors capitalize ${
                  themeMode === m
                    ? 'bg-[var(--color-figma-accent)] text-white'
                    : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          {resolverState.resolvers.length > 0 && (
            <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">
              {resolverState.resolvers.length} resolver{resolverState.resolvers.length !== 1 ? 's' : ''} available
            </span>
          )}
        </div>
      )}
      {error && (
        <div role="alert" className="mx-3 mt-2 px-2 py-1.5 rounded bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)] text-[10px] flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-2 text-[var(--color-figma-error)] hover:opacity-70 flex-shrink-0">
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      )}
      {fetchWarnings && (
        <div role="status" className="mx-3 mt-2 px-2 py-1.5 rounded bg-[var(--color-figma-warning)]/10 text-[var(--color-figma-warning)] text-[10px] flex items-center justify-between">
          <span>{fetchWarnings}</span>
          <button onClick={() => setFetchWarnings(null)} className="ml-2 text-[var(--color-figma-warning)] hover:opacity-70 flex-shrink-0">
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {dimensions.length === 0 && !showCreateDim ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center px-5 py-8 text-center gap-4">
            {/* Icon */}
            <div className="w-10 h-10 rounded-xl bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-secondary)]" aria-hidden="true">
                <rect x="3" y="3" width="18" height="6" rx="1.5" />
                <rect x="3" y="12" width="18" height="6" rx="1.5" opacity="0.5" />
              </svg>
            </div>

            {/* Heading + description */}
            <div className="flex flex-col gap-1">
              <p className="text-[12px] font-semibold text-[var(--color-figma-text)]">No theme layers yet</p>
              <p className="text-[11px] text-[var(--color-figma-text-secondary)] leading-relaxed max-w-[240px]">
                Themes let you switch entire sets of tokens at once — light/dark mode, brand variants, or density levels — without duplicating values.
              </p>
            </div>

            {/* How themes work */}
            <div className="w-full max-w-[260px]">
              <p className="text-[10px] text-[var(--color-figma-text-tertiary)] uppercase tracking-wide font-medium text-left mb-2">How themes work</p>
              <div className="flex items-start gap-0 w-full">
                <div className="flex-1 flex flex-col items-center gap-1 min-w-0">
                  <div className="w-6 h-6 rounded-full bg-[var(--color-figma-bg-secondary)] flex items-center justify-center text-[var(--color-figma-text-secondary)]">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2L2 7l10 5 10-5-10-5z" />
                      <path d="M2 17l10 5 10-5" />
                    </svg>
                  </div>
                  <p className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium leading-tight text-center">Add layers</p>
                  <p className="text-[8px] text-[var(--color-figma-text-tertiary)] leading-tight text-center">Dimensions</p>
                </div>
                <svg width="10" height="10" viewBox="0 0 8 8" fill="var(--color-figma-text-tertiary)" className="mt-2 shrink-0"><path d="M2 1l4 3-4 3V1z" /></svg>
                <div className="flex-1 flex flex-col items-center gap-1 min-w-0">
                  <div className="w-6 h-6 rounded-full bg-[var(--color-figma-bg-secondary)] flex items-center justify-center text-[var(--color-figma-text-secondary)]">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <path d="M3 9h18M9 21V9" />
                    </svg>
                  </div>
                  <p className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium leading-tight text-center">Map sets</p>
                  <p className="text-[8px] text-[var(--color-figma-text-tertiary)] leading-tight text-center">Per option</p>
                </div>
                <svg width="10" height="10" viewBox="0 0 8 8" fill="var(--color-figma-text-tertiary)" className="mt-2 shrink-0"><path d="M2 1l4 3-4 3V1z" /></svg>
                <div className="flex-1 flex flex-col items-center gap-1 min-w-0">
                  <div className="w-6 h-6 rounded-full bg-[var(--color-figma-bg-secondary)] flex items-center justify-center text-[var(--color-figma-text-secondary)]">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                    </svg>
                  </div>
                  <p className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium leading-tight text-center">Switch</p>
                  <p className="text-[8px] text-[var(--color-figma-text-tertiary)] leading-tight text-center">Instantly</p>
                </div>
              </div>
            </div>

            {/* Quick start */}
            <div className="w-full max-w-[260px] flex flex-col gap-1.5">
              <p className="text-[10px] text-[var(--color-figma-text-tertiary)] uppercase tracking-wide font-medium text-left">Quick start</p>
              {([
                ['Color Mode', 'Light / Dark'],
                ['Brand', 'Default / Premium'],
                ['Density', 'Regular / Compact'],
              ] as const).map(([name, example]) => (
                <button
                  key={name}
                  onClick={() => { setNewDimName(name); setShowCreateDim(true); }}
                  className="flex items-center justify-between px-2.5 py-1.5 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-left hover:border-[var(--color-figma-accent)] hover:bg-[var(--color-figma-bg-hover)] transition-colors group"
                >
                  <span className="text-[11px] font-medium text-[var(--color-figma-text)] group-hover:text-[var(--color-figma-accent)]">{name}</span>
                  <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">{example}</span>
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowCreateDim(true)}
              className="text-[10px] text-[var(--color-figma-accent)] hover:underline"
            >
              or create a custom layer
            </button>
          </div>
        ) : (
          <div className="flex flex-col">
            {/* Stack header */}
            <div className="px-3 py-2 flex items-center justify-between border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
              <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-figma-text-tertiary)] uppercase tracking-wide font-medium">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
                Layer Stack
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    setShowPreview(p => {
                      const next = !p;
                      if (next) setShowCompare(false);
                      return next;
                    });
                  }}
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
                    showPreview
                      ? 'bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)]'
                      : 'text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
                  }`}
                  title="Toggle live token preview"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  Preview
                </button>
                <button
                  onClick={() => {
                    setShowCompare(prev => {
                      const next = !prev;
                      if (next) {
                        setShowPreview(false);
                        // Auto-select defaults when opening for the first time
                        if (!compareOptA && !compareOptB) {
                          const firstDimWithTwo = dimensions.find(d => d.options.length >= 2);
                          if (firstDimWithTwo) {
                            setCompareOptA({ dimId: firstDimWithTwo.id, optionName: firstDimWithTwo.options[0].name });
                            setCompareOptB({ dimId: firstDimWithTwo.id, optionName: firstDimWithTwo.options[1].name });
                          } else if (dimensions.length >= 2 && dimensions[0].options.length > 0 && dimensions[1].options.length > 0) {
                            setCompareOptA({ dimId: dimensions[0].id, optionName: dimensions[0].options[0].name });
                            setCompareOptB({ dimId: dimensions[1].id, optionName: dimensions[1].options[0].name });
                          }
                        }
                      }
                      return next;
                    });
                  }}
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
                    showCompare
                      ? 'bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)]'
                      : 'text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
                  }`}
                  title="Compare resolved values between two theme options"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4" />
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                    <path d="M9 12h6" />
                  </svg>
                  Compare
                </button>
              </div>
            </div>

            {/* Dimension search filter */}
            {dimensions.length > 2 && (
              <div className="px-3 py-1.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]/50">
                <div className="relative">
                  <svg className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[var(--color-figma-text-tertiary)]" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" />
                  </svg>
                  <input
                    ref={dimSearchRef}
                    type="text"
                    value={dimSearch}
                    onChange={e => setDimSearch(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Escape') { setDimSearch(''); dimSearchRef.current?.blur(); } }}
                    placeholder="Filter dimensions / options…"
                    className="w-full pl-6 pr-6 py-1 rounded text-[11px] bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-tertiary)] focus:outline-none focus:border-[var(--color-figma-accent)]"
                  />
                  {dimSearch && (
                    <button
                      onClick={() => { setDimSearch(''); dimSearchRef.current?.focus(); }}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)]"
                      title="Clear search"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Priority hint */}
            {dimensions.length > 1 && (
              <div className="px-3 py-1 text-[10px] text-[var(--color-figma-text-tertiary)] bg-[var(--color-figma-bg-secondary)]/50 border-b border-[var(--color-figma-border)] flex items-center gap-1">
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
                Higher priority
                <span className="flex-1 border-b border-dotted border-[var(--color-figma-border)] mx-1" />
                Lower priority
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M5 12l7 7 7-7" /></svg>
              </div>
            )}

            {/* Dimension layer cards */}
            <div className="flex flex-col">
              {filteredDimensions.map((dim) => {
                const selectedOpt = selectedOptions[dim.id] || dim.options[0]?.name || '';
                const opt = dim.options.find(o => o.name === selectedOpt);
                const optSets = opt ? (optionSetOrders[dim.id]?.[opt.name] || sets) : sets;
                const dimIdx = dimensions.indexOf(dim);
                const layerNum = dimensions.length - dimIdx;

                // Group sets by status
                const overrideSets = optSets.filter(s => opt?.sets[s] === 'enabled');
                const foundationSets = optSets.filter(s => opt?.sets[s] === 'source');
                const disabledSets = optSets.filter(s => !opt?.sets[s] || opt?.sets[s] === 'disabled');
                const isDisabledCollapsed = collapsedDisabled.has(dim.id);

                const covKey = `${dim.id}:${selectedOpt}`;
                const hasUncovered = (coverage[dim.id]?.[selectedOpt]?.uncovered.length ?? 0) > 0;
                const staleSetNames = opt
                  ? Object.entries(opt.sets).filter(([s, status]) => !sets.includes(s) && status !== 'disabled').map(([s]) => s)
                  : [];

                // Cross-option gap totals for this dimension
                const dimCov = coverage[dim.id] ?? {};
                const optionsWithGaps = dim.options.filter(o => (dimCov[o.name]?.uncovered.length ?? 0) > 0);
                const totalDimGaps = optionsWithGaps.reduce((sum, o) => sum + (dimCov[o.name]?.uncovered.length ?? 0), 0);
                const totalDimFillable = optionsWithGaps.reduce((sum, o) => {
                  const items = dimCov[o.name]?.uncovered ?? [];
                  return sum + items.filter(i => i.missingRef && i.fillValue !== undefined).length;
                }, 0);
                const multiOptionGaps = optionsWithGaps.length > 1;
                const isFillAllOptionsInProgress = fillingKeys.has(`${dim.id}:__all_options__`);

                return (
                  <div
                    key={dim.id}
                    ref={dim.id === newlyCreatedDim ? (el) => { if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } : undefined}
                    draggable
                    onDragStart={e => handleDimDragStart(e, dim.id)}
                    onDragOver={e => handleDimDragOver(e, dim.id)}
                    onDrop={() => handleDimDrop(dim.id)}
                    onDragEnd={handleDimDragEnd}
                    className={`border-b border-[var(--color-figma-border)] transition-opacity ${draggingDimId === dim.id ? 'opacity-40' : ''} ${dragOverDimId === dim.id && draggingDimId !== dim.id ? 'ring-2 ring-inset ring-[var(--color-figma-accent)]/50' : ''}`}
                  >
                    {/* Layer header */}
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--color-figma-bg-secondary)] group">
                      {/* Drag grip handle */}
                      {dimensions.length > 1 && (
                        <span
                          className="cursor-grab active:cursor-grabbing text-[var(--color-figma-text-tertiary)] opacity-0 group-hover:opacity-60 hover:!opacity-100 flex-shrink-0 select-none"
                          title="Drag to reorder layer"
                          aria-hidden="true"
                        >
                          <svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor">
                            <circle cx="2" cy="2" r="1.2" /><circle cx="6" cy="2" r="1.2" />
                            <circle cx="2" cy="6" r="1.2" /><circle cx="6" cy="6" r="1.2" />
                            <circle cx="2" cy="10" r="1.2" /><circle cx="6" cy="10" r="1.2" />
                          </svg>
                        </span>
                      )}
                      {/* Layer number badge */}
                      <span className="flex items-center justify-center w-4 h-4 rounded bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] text-[10px] font-bold flex-shrink-0" title={`Layer ${layerNum} — ${dimIdx === 0 ? 'highest' : dimIdx === dimensions.length - 1 ? 'lowest' : ''} priority`}>
                        {layerNum}
                      </span>

                      {renameDim === dim.id ? (
                        <div className="flex flex-col gap-1 flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={renameValue}
                              onChange={e => { setRenameValue(e.target.value); setRenameError(null); }}
                              onKeyDown={e => { if (e.key === 'Enter') executeRenameDim(); else if (e.key === 'Escape') cancelRenameDim(); }}
                              className={`flex-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] outline-none focus:border-[var(--color-figma-accent)] ${renameError ? 'border-[var(--color-figma-error)]' : 'border-[var(--color-figma-border)]'}`}
                              autoFocus
                            />
                            <button onClick={executeRenameDim} disabled={!renameValue.trim()} className="px-1.5 py-0.5 rounded bg-[var(--color-figma-accent)] text-white text-[10px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40">Save</button>
                            <button onClick={cancelRenameDim} className="px-1.5 py-0.5 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]">Cancel</button>
                          </div>
                          {renameError && <p role="alert" className="text-[10px] text-[var(--color-figma-error)]">{renameError}</p>}
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-1 flex-1 min-w-0">
                            <span className="text-[11px] font-medium text-[var(--color-figma-text)] truncate" title={dim.name}>{dim.name}</span>
                            <button
                              onClick={() => startRenameDim(dim.id, dim.name)}
                              className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] flex-shrink-0"
                              title="Rename layer" aria-label="Rename layer"
                            >
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                          </div>
                          {dimensions.length > 1 && (
                            <div className="flex items-center gap-0 flex-shrink-0 opacity-0 group-hover:opacity-100">
                              <button
                                onClick={() => handleMoveDimension(dim.id, 'up')}
                                disabled={dimIdx === 0}
                                className="p-0.5 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] disabled:opacity-25 disabled:pointer-events-none"
                                title="Move layer up (higher priority)" aria-label="Move layer up"
                              >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 15l-6-6-6 6" /></svg>
                              </button>
                              <button
                                onClick={() => handleMoveDimension(dim.id, 'down')}
                                disabled={dimIdx === dimensions.length - 1}
                                className="p-0.5 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] disabled:opacity-25 disabled:pointer-events-none"
                                title="Move layer down (lower priority)" aria-label="Move layer down"
                              >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
                              </button>
                            </div>
                          )}
                          <button
                            onClick={() => executeDeleteDimension(dim.id)}
                            className="p-1 rounded hover:bg-[var(--color-figma-error)]/20 text-[var(--color-figma-error)] text-[10px] flex-shrink-0 opacity-0 group-hover:opacity-100"
                            title="Delete layer" aria-label="Delete layer"
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                            </svg>
                          </button>
                        </>
                      )}
                    </div>

                    {/* Option tabs */}
                    {dim.options.length > 0 && (
                      <div className="flex items-center gap-0 px-2 pt-1 pb-0 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] overflow-x-auto">
                        {dim.options.map((o, oIdx) => {
                          const optMatches = dimSearch.trim() !== '' && o.name.toLowerCase().includes(dimSearch.trim().toLowerCase());
                          const optMissingCount = coverage[dim.id]?.[o.name]?.uncovered.length ?? 0;
                          const isSelected = selectedOpt === o.name;
                          const diffCount = isSelected ? 0 : (optionDiffCounts[`${dim.id}/${o.name}`] ?? 0);
                          const isBeingDragged = draggingOpt?.dimId === dim.id && draggingOpt?.optionName === o.name;
                          const isDragTarget = dragOverOpt?.dimId === dim.id && dragOverOpt?.optionName === o.name && draggingOpt?.optionName !== o.name;
                          return (
                          <button
                            key={o.name}
                            draggable={dim.options.length > 1}
                            onDragStart={e => handleOptDragStart(e, dim.id, o.name)}
                            onDragOver={e => handleOptDragOver(e, dim.id, o.name)}
                            onDrop={e => handleOptDrop(e, dim.id, o.name)}
                            onDragEnd={handleOptDragEnd}
                            onClick={() => setSelectedOptions(prev => ({ ...prev, [dim.id]: o.name }))}
                            className={`relative px-2.5 py-1 text-[10px] font-medium rounded-t transition-colors flex-shrink-0 flex items-center gap-1 ${
                              isSelected
                                ? 'text-[var(--color-figma-accent)] bg-[var(--color-figma-bg-secondary)]'
                                : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'
                            }${optMatches ? ' ring-1 ring-[var(--color-figma-accent)]/40 rounded' : ''}${isBeingDragged ? ' opacity-40' : ''}${isDragTarget ? ' ring-2 ring-[var(--color-figma-accent)]/60' : ''}${dim.options.length > 1 ? ' cursor-grab active:cursor-grabbing' : ''}`}
                          >
                            {o.name}
                            {!isSelected && diffCount > 0 && (
                              <span
                                className="inline-flex items-center justify-center min-w-[14px] h-[14px] px-0.5 rounded-full text-[9px] font-bold leading-none bg-[var(--color-figma-text-tertiary)]/20 text-[var(--color-figma-text-tertiary)]"
                                title={`${diffCount} token${diffCount !== 1 ? 's' : ''} differ from ${selectedOpt}`}
                              >
                                {diffCount}
                              </span>
                            )}
                            {optMissingCount > 0 && (
                              <span
                                className="inline-flex items-center justify-center min-w-[14px] h-[14px] px-0.5 rounded-full text-[9px] font-bold leading-none bg-[var(--color-figma-warning)]/20 text-[var(--color-figma-warning)]"
                                title={`${optMissingCount} missing token${optMissingCount !== 1 ? 's' : ''}`}
                              >
                                {optMissingCount}
                              </span>
                            )}
                            {isSelected && (
                              <span className="absolute bottom-0 left-1 right-1 h-[2px] bg-[var(--color-figma-accent)] rounded-t" />
                            )}
                          </button>
                          );
                        })}
                        {/* Add option inline */}
                        {showAddOption[dim.id] ? null : (
                          <button
                            onClick={() => setShowAddOption(prev => ({ ...prev, [dim.id]: true }))}
                            className="px-1.5 py-1 text-[10px] text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)] flex-shrink-0"
                            title="Add option"
                          >
                            +
                          </button>
                        )}
                      </div>
                    )}

                    {/* Add option input (when no options exist or user clicked +) */}
                    {(showAddOption[dim.id] || dim.options.length === 0) && (
                      <div className="px-3 py-1.5 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
                        <div className="flex items-center gap-1">
                          <input
                            ref={el => { addOptionInputRefs.current[dim.id] = el; }}
                            type="text"
                            value={newOptionNames[dim.id] || ''}
                            onChange={e => { setNewOptionNames(prev => ({ ...prev, [dim.id]: e.target.value })); setAddOptionErrors(prev => ({ ...prev, [dim.id]: '' })); }}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleAddOption(dim.id);
                              if (e.key === 'Escape') { setShowAddOption(prev => ({ ...prev, [dim.id]: false })); setNewOptionNames(prev => ({ ...prev, [dim.id]: '' })); setCopyFromNewOption(prev => ({ ...prev, [dim.id]: '' })); }
                            }}
                            placeholder={dim.options.length === 0 ? 'First option (e.g. Light, Dark)' : 'Option name'}
                            className={`flex-1 px-1.5 py-0.5 rounded text-[10px] bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] outline-none focus:border-[var(--color-figma-accent)] ${addOptionErrors[dim.id] ? 'border-[var(--color-figma-error)]' : 'border-[var(--color-figma-border)]'}`}
                            autoFocus
                          />
                          <button onClick={() => handleAddOption(dim.id)} disabled={!newOptionNames[dim.id]?.trim()} className="px-1.5 py-0.5 rounded bg-[var(--color-figma-accent)] text-white text-[10px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40">Add</button>
                          {dim.options.length > 0 && (
                            <button onClick={() => { setShowAddOption(prev => ({ ...prev, [dim.id]: false })); setNewOptionNames(prev => ({ ...prev, [dim.id]: '' })); setCopyFromNewOption(prev => ({ ...prev, [dim.id]: '' })); }} className="px-1.5 py-0.5 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]">Cancel</button>
                          )}
                        </div>
                        {/* Copy-from selector — only shown when there are existing options to copy from */}
                        {dim.options.length > 0 && (
                          <div className="flex items-center gap-1 mt-1">
                            <span className="text-[9px] text-[var(--color-figma-text-tertiary)] flex-shrink-0">Copy assignments from:</span>
                            <select
                              value={copyFromNewOption[dim.id] || ''}
                              onChange={e => setCopyFromNewOption(prev => ({ ...prev, [dim.id]: e.target.value }))}
                              className="flex-1 px-1 py-0.5 rounded text-[9px] bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] outline-none focus:border-[var(--color-figma-accent)]"
                            >
                              <option value="">None (start empty)</option>
                              {dim.options.map(o => (
                                <option key={o.name} value={o.name}>{o.name}</option>
                              ))}
                            </select>
                          </div>
                        )}
                        {addOptionErrors[dim.id] && <p role="alert" className="text-[10px] text-[var(--color-figma-error)] mt-1">{addOptionErrors[dim.id]}</p>}
                      </div>
                    )}

                    {/* Cross-option fill banner */}
                    {multiOptionGaps && totalDimFillable > 0 && (
                      <div className="flex items-center justify-between px-3 py-1.5 border-t border-[var(--color-figma-warning)]/25 bg-[var(--color-figma-warning)]/5">
                        <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-figma-warning)]">
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                          <span>{totalDimGaps} gaps across {optionsWithGaps.length} options</span>
                        </div>
                        <button
                          onClick={() => handleAutoFillAllOptions(dim.id)}
                          disabled={isFillAllOptionsInProgress}
                          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50 transition-colors"
                          title={`Auto-fill ${totalDimFillable} missing token${totalDimFillable !== 1 ? 's' : ''} across all options`}
                        >
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                          {isFillAllOptionsInProgress ? 'Filling…' : `Fill all options (${totalDimFillable})`}
                        </button>
                      </div>
                    )}

                    {/* Selected option content */}
                    {opt && (
                      <div className="bg-[var(--color-figma-bg-secondary)]">
                        {/* Option actions bar */}
                        <div className="flex items-center justify-between px-3 py-1 border-t border-[var(--color-figma-border)]">
                          {renameOption?.dimId === dim.id && renameOption?.optionName === opt.name ? (
                            <div className="flex flex-col gap-1 flex-1">
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={renameOptionValue}
                                  onChange={e => { setRenameOptionValue(e.target.value); setRenameOptionError(null); }}
                                  onKeyDown={e => { if (e.key === 'Enter') executeRenameOption(); else if (e.key === 'Escape') cancelRenameOption(); }}
                                  className={`flex-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] outline-none focus:border-[var(--color-figma-accent)] ${renameOptionError ? 'border-[var(--color-figma-error)]' : 'border-[var(--color-figma-border)]'}`}
                                  autoFocus
                                />
                                <button onClick={executeRenameOption} disabled={!renameOptionValue.trim()} className="px-1.5 py-0.5 rounded bg-[var(--color-figma-accent)] text-white text-[10px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40">Save</button>
                                <button onClick={cancelRenameOption} className="px-1.5 py-0.5 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]">Cancel</button>
                              </div>
                              {renameOptionError && <p role="alert" className="text-[10px] text-[var(--color-figma-error)]">{renameOptionError}</p>}
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center gap-1">
                                {hasUncovered && (
                                  <button
                                    onClick={() => setExpandedCoverage(prev => { const next = new Set(prev); next.has(covKey) ? next.delete(covKey) : next.add(covKey); return next; })}
                                    className="flex items-center gap-1 px-1 py-0.5 rounded text-[10px] font-medium bg-[var(--color-figma-warning)]/15 text-[var(--color-figma-warning)] border border-[var(--color-figma-warning)]/40 hover:bg-[var(--color-figma-warning)]/25 transition-colors"
                                    title={`${coverage[dim.id][selectedOpt].uncovered.length} tokens have no value in active sets`}
                                  >
                                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                                    {coverage[dim.id][selectedOpt].uncovered.length} gaps
                                  </button>
                                )}
                                {staleSetNames.length > 0 && (
                                  <button
                                    onClick={() => setExpandedStale(prev => { const next = new Set(prev); next.has(covKey) ? next.delete(covKey) : next.add(covKey); return next; })}
                                    className="flex items-center gap-1 px-1 py-0.5 rounded text-[10px] font-medium bg-[var(--color-figma-error)]/15 text-[var(--color-figma-error)] border border-[var(--color-figma-error)]/40 hover:bg-[var(--color-figma-error)]/25 transition-colors"
                                    title={`${staleSetNames.length} set${staleSetNames.length !== 1 ? 's' : ''} referenced here no longer exist`}
                                  >
                                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                                    {staleSetNames.length} stale
                                  </button>
                                )}
                              </div>
                              <div className="flex items-center gap-0.5">
                                {dim.options.length > 1 && (
                                  <>
                                    <button onClick={() => handleMoveOption(dim.id, opt.name, 'up')} disabled={dim.options.indexOf(opt) === 0} className="p-1.5 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] disabled:opacity-25 disabled:pointer-events-none" title="Move option left" aria-label="Move option left">
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
                                    </button>
                                    <button onClick={() => handleMoveOption(dim.id, opt.name, 'down')} disabled={dim.options.indexOf(opt) === dim.options.length - 1} className="p-1.5 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] disabled:opacity-25 disabled:pointer-events-none" title="Move option right" aria-label="Move option right">
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
                                    </button>
                                  </>
                                )}
                                <button onClick={() => startRenameOption(dim.id, opt.name)} className="p-1.5 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]" title="Rename option" aria-label="Rename option">
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                                  </svg>
                                </button>
                                <button onClick={() => handleDuplicateOption(dim.id, opt.name)} className="p-1.5 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]" title="Duplicate option" aria-label="Duplicate option">
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                                  </svg>
                                </button>
                                {/* Copy assignments from another option — only shown when there are other options */}
                                {dim.options.length > 1 && (
                                  <div className="relative">
                                    <button
                                      onClick={e => { e.stopPropagation(); setShowCopyFromMenu(prev => prev?.dimId === dim.id && prev?.optionName === opt.name ? null : { dimId: dim.id, optionName: opt.name }); }}
                                      className="p-1.5 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]"
                                      title="Copy assignments from another option"
                                      aria-label="Copy assignments from another option"
                                    >
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/>
                                        <path d="M9 2h6a1 1 0 011 1v2a1 1 0 01-1 1H9a1 1 0 01-1-1V3a1 1 0 011-1z"/>
                                        <path d="M8 14l4-4 4 4" strokeWidth="1.5"/>
                                      </svg>
                                    </button>
                                    {showCopyFromMenu?.dimId === dim.id && showCopyFromMenu?.optionName === opt.name && (
                                      <div
                                        ref={copyFromMenuRef}
                                        className="absolute right-0 top-full mt-0.5 z-50 min-w-[140px] bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] rounded shadow-lg py-0.5"
                                        onClick={e => e.stopPropagation()}
                                      >
                                        <div className="px-2 py-1 text-[9px] font-medium text-[var(--color-figma-text-tertiary)] border-b border-[var(--color-figma-border)] mb-0.5">Copy assignments from:</div>
                                        {dim.options.filter(o => o.name !== opt.name).map(sourceOpt => (
                                          <button
                                            key={sourceOpt.name}
                                            onClick={() => handleCopyAssignmentsFrom(dim.id, opt.name, sourceOpt.name)}
                                            className="w-full text-left px-2 py-1 text-[10px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] truncate"
                                            role="menuitem"
                                          >
                                            {sourceOpt.name}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                                <button onClick={() => executeDeleteOption(dim.id, opt.name)} className="p-1.5 rounded hover:bg-[var(--color-figma-error)]/20 text-[var(--color-figma-error)]" title="Delete option" aria-label="Delete option">
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                                  </svg>
                                </button>
                              </div>
                            </>
                          )}
                        </div>

                        {/* Set groups */}
                        {sets.length > 0 && (
                          <div className="border-t border-[var(--color-figma-border)]">
                            {/* Batch assignment toolbar — set all sets to one state at once */}
                            {sets.length > 1 && (
                              <div className="px-3 py-1 flex items-center gap-1.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
                                <span className="text-[9px] text-[var(--color-figma-text-tertiary)] flex-shrink-0">Set all:</span>
                                <button
                                  onClick={() => handleBulkSetAllInOption(dim.id, opt.name, 'source')}
                                  className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] border border-[var(--color-figma-accent)]/20 hover:bg-[var(--color-figma-accent)]/20 transition-colors"
                                  title="Set all token sets to Base (source)"
                                >
                                  Base
                                </button>
                                <button
                                  onClick={() => handleBulkSetAllInOption(dim.id, opt.name, 'enabled')}
                                  className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-[var(--color-figma-success)]/10 text-[var(--color-figma-success)] border border-[var(--color-figma-success)]/20 hover:bg-[var(--color-figma-success)]/20 transition-colors"
                                  title="Set all token sets to Override (enabled)"
                                >
                                  Override
                                </button>
                                <button
                                  onClick={() => handleBulkSetAllInOption(dim.id, opt.name, 'disabled')}
                                  className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-tertiary)] border border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                                  title="Set all token sets to Excluded (disabled)"
                                >
                                  Excluded
                                </button>
                              </div>
                            )}
                            {/* Override section */}
                            {overrideSets.length > 0 && (
                              <div>
                                <div className="px-3 py-0.5 flex items-center gap-1 text-[10px] font-medium text-[var(--color-figma-success)] bg-[var(--color-figma-success)]/5">
                                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
                                  Override ({overrideSets.length})
                                  <span className="text-[var(--color-figma-text-tertiary)] font-normal ml-1">highest priority</span>
                                </div>
                                {overrideSets.map(s => renderSetRow(dim, opt, s, 'enabled'))}
                              </div>
                            )}

                            {/* Base section */}
                            {foundationSets.length > 0 && (
                              <div>
                                <div className="px-3 py-0.5 flex items-center gap-1 text-[10px] font-medium text-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/5">
                                  <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="3" opacity="0.3" /></svg>
                                  Base ({foundationSets.length})
                                  <span className="text-[var(--color-figma-text-tertiary)] font-normal ml-1">default values</span>
                                </div>
                                {foundationSets.map(s => renderSetRow(dim, opt, s, 'source'))}
                              </div>
                            )}

                            {/* Excluded section — collapsed by default */}
                            {disabledSets.length > 0 && (
                              <div>
                                <button
                                  onClick={() => setCollapsedDisabled(prev => {
                                    const next = new Set(prev);
                                    next.has(dim.id) ? next.delete(dim.id) : next.add(dim.id);
                                    return next;
                                  })}
                                  className="w-full px-3 py-0.5 flex items-center gap-1 text-[10px] font-medium text-[var(--color-figma-text-tertiary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors text-left"
                                >
                                  <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform ${isDisabledCollapsed ? '' : 'rotate-90'}`} aria-hidden="true"><path d="M2 1l4 3-4 3V1z" /></svg>
                                  Excluded ({disabledSets.length})
                                </button>
                                {!isDisabledCollapsed && disabledSets.map(s => renderSetRow(dim, opt, s, 'disabled'))}
                              </div>
                            )}

                            {/* All sets are in one group — show empty hint */}
                            {overrideSets.length === 0 && foundationSets.length === 0 && disabledSets.length > 0 && !isDisabledCollapsed && (
                              <div className="px-3 py-2 text-[10px] text-[var(--color-figma-text-tertiary)] italic">
                                No sets assigned yet. Expand &ldquo;Excluded&rdquo; and assign sets as Base or Override.
                              </div>
                            )}
                          </div>
                        )}

                        {/* Coverage gaps */}
                        {expandedCoverage.has(covKey) && (coverage[dim.id]?.[selectedOpt]?.uncovered.length ?? 0) > 0 && (() => {
                          const uncoveredItems = coverage[dim.id][selectedOpt].uncovered;
                          const fillableItems = uncoveredItems.filter(i => i.missingRef && i.fillValue !== undefined);
                          const unfillableItems = uncoveredItems.filter(i => !i.missingRef || i.fillValue === undefined);
                          const isFillAllInProgress = fillingKeys.has(`${dim.id}:${selectedOpt}:__all__`);

                          const renderCoverageRow = (item: CoverageToken, canFill: boolean) => {
                            const isFilling = fillingKeys.has(`${dim.id}:${selectedOpt}:${item.path}`);
                            return (
                              <div key={item.path} className="flex items-center gap-1.5 group/fill py-0.5" role="listitem">
                                {/* Status chip */}
                                {canFill ? (
                                  <span className="flex-shrink-0 inline-flex items-center gap-0.5 px-1 py-px rounded text-[8px] font-semibold bg-emerald-500/15 text-emerald-600" title="Can be auto-filled from another set">
                                    <svg width="7" height="7" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 5.5l2.5 2.5L8 3" /></svg>
                                    Fillable
                                  </span>
                                ) : (
                                  <span className="flex-shrink-0 inline-flex items-center gap-0.5 px-1 py-px rounded text-[8px] font-semibold bg-red-500/15 text-red-600" title="No fill value available — requires manual fix">
                                    <svg width="7" height="7" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2.5 2.5l5 5M7.5 2.5l-5 5" /></svg>
                                    Manual
                                  </span>
                                )}
                                {onNavigateToToken && item.set ? (
                                  <button
                                    onClick={() => onNavigateToToken(item.set, item.path)}
                                    className="flex-1 text-left text-[10px] text-[var(--color-figma-text)] font-mono truncate hover:underline cursor-pointer"
                                    title={`Navigate to ${item.path} in set "${item.set}"${item.missingRef ? `\nMissing: {${item.missingRef}}` : ''}`}
                                  >
                                    {item.path}
                                  </button>
                                ) : (
                                  <div className="flex-1 text-[10px] text-[var(--color-figma-text-secondary)] font-mono truncate" title={item.missingRef ? `Missing: {${item.missingRef}}` : undefined}>{item.path}</div>
                                )}
                                {canFill && (
                                  <button
                                    onClick={() => handleAutoFillSingle(dim.id, selectedOpt, item)}
                                    disabled={isFilling}
                                    className="flex-shrink-0 opacity-40 group-hover/fill:opacity-100 pointer-events-none group-hover/fill:pointer-events-auto px-1 py-0.5 rounded text-[9px] font-medium bg-[var(--color-figma-accent)]/80 text-white hover:bg-[var(--color-figma-accent)] disabled:opacity-50 transition-opacity"
                                    title={`Create ${item.missingRef} in override set`}
                                  >
                                    {isFilling ? '…' : 'Fill'}
                                  </button>
                                )}
                                {!canFill && onCreateToken && (
                                  <button
                                    onClick={() => {
                                      const createPath = item.missingRef ?? item.path;
                                      onCreateToken(createPath, item.set);
                                    }}
                                    className="flex-shrink-0 opacity-40 group-hover/fill:opacity-100 pointer-events-none group-hover/fill:pointer-events-auto px-1 py-0.5 rounded text-[9px] font-medium bg-[var(--color-figma-bg-tertiary)] text-[var(--color-figma-text)] border border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)] transition-opacity"
                                    title={item.missingRef ? `Create token "${item.missingRef}" to resolve missing alias` : `Create token "${item.path}" in set "${item.set}"`}
                                  >
                                    Create
                                  </button>
                                )}
                              </div>
                            );
                          };

                          return (
                          <div className="border-t border-[var(--color-figma-warning)]/25 bg-[var(--color-figma-warning)]/5 px-3 py-2">
                            {/* Header */}
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="text-[10px] font-medium text-[var(--color-figma-warning)]">
                                Missing values ({uncoveredItems.length})
                              </div>
                              {fillableItems.length > 0 && (
                                <button
                                  onClick={() => handleAutoFillAll(dim.id, selectedOpt)}
                                  disabled={isFillAllInProgress}
                                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                                  title={`Auto-fill ${fillableItems.length} token${fillableItems.length !== 1 ? 's' : ''} from source sets into the override set`}
                                >
                                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                                  {isFillAllInProgress ? 'Filling…' : `Fill from source (${fillableItems.length})`}
                                </button>
                              )}
                            </div>

                            {/* Summary chips */}
                            <div className="flex items-center gap-2 mb-1.5">
                              {fillableItems.length > 0 && (
                                <span className="inline-flex items-center gap-1 text-[9px] font-medium text-emerald-600">
                                  <svg width="7" height="7" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 5.5l2.5 2.5L8 3" /></svg>
                                  {fillableItems.length} fillable
                                </span>
                              )}
                              {unfillableItems.length > 0 && (
                                <span className="inline-flex items-center gap-1 text-[9px] font-medium text-red-600">
                                  <svg width="7" height="7" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2.5 2.5l5 5M7.5 2.5l-5 5" /></svg>
                                  {unfillableItems.length} need manual fix
                                </span>
                              )}
                            </div>

                            <div className="flex flex-col gap-0 max-h-48 overflow-y-auto focus:outline-none focus:ring-1 focus:ring-[var(--color-figma-accent)] rounded" role="list" tabIndex={0} aria-label={`Missing tokens for ${selectedOpt}`}>
                              {/* Unfillable tokens first (most urgent) */}
                              {unfillableItems.length > 0 && (
                                <>
                                  {fillableItems.length > 0 && (
                                    <div className="text-[9px] font-semibold text-red-600 uppercase tracking-wider pt-1 pb-0.5">Needs attention</div>
                                  )}
                                  {unfillableItems.map(item => renderCoverageRow(item, false))}
                                </>
                              )}
                              {/* Fillable tokens */}
                              {fillableItems.length > 0 && (
                                <>
                                  {unfillableItems.length > 0 && (
                                    <div className="text-[9px] font-semibold text-emerald-600 uppercase tracking-wider pt-1.5 pb-0.5">Auto-fillable</div>
                                  )}
                                  {fillableItems.map(item => renderCoverageRow(item, true))}
                                </>
                              )}
                            </div>
                          </div>
                          );
                        })()}
                        {expandedStale.has(covKey) && staleSetNames.length > 0 && (
                          <div className="border-t border-[var(--color-figma-error)]/25 bg-[var(--color-figma-error)]/10 px-3 py-2">
                            <div className="text-[10px] font-medium text-[var(--color-figma-error)] mb-1">
                              Deleted sets ({staleSetNames.length})
                            </div>
                            <p className="text-[10px] text-[var(--color-figma-text-secondary)] mb-1.5">These sets are referenced but no longer exist.</p>
                            <div className="flex flex-col gap-0.5 max-h-32 overflow-y-auto focus:outline-none focus:ring-1 focus:ring-[var(--color-figma-accent)] rounded" role="list" tabIndex={0} aria-label={`Deleted sets for ${selectedOpt}`}>
                              {staleSetNames.map(s => (
                                <div key={s} className="text-[10px] text-[var(--color-figma-text-secondary)] font-mono truncate" role="listitem" title={s}>{s}</div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {dimSearch && filteredDimensions.length === 0 && (
                <div className="px-3 py-4 text-center text-[11px] text-[var(--color-figma-text-tertiary)]">
                  No dimensions or options matching &ldquo;{dimSearch}&rdquo;
                </div>
              )}
              {dimSearch && filteredDimensions.length > 0 && filteredDimensions.length < dimensions.length && (
                <div className="px-3 py-1 text-[10px] text-[var(--color-figma-text-tertiary)] text-center">
                  Showing {filteredDimensions.length} of {dimensions.length} layers
                </div>
              )}
            </div>

            {/* Live Token Resolution Preview */}
            {showPreview && dimensions.length > 0 && (
              <div className="border-t-2 border-[var(--color-figma-accent)]/30">
                <div className="px-3 py-1.5 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[10px] font-medium text-[var(--color-figma-text)]">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--color-figma-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                    Token Resolution Preview
                  </div>
                  <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">
                    {dimensions.map(d => {
                      const optName = selectedOptions[d.id];
                      return optName ? `${d.name}: ${optName}` : null;
                    }).filter(Boolean).join(' + ')}
                  </span>
                </div>
                <div className="px-3 py-1 border-t border-[var(--color-figma-border)]">
                  <input
                    type="text"
                    placeholder="Search tokens..."
                    value={previewSearch}
                    onChange={e => setPreviewSearch(e.target.value)}
                    className="w-full bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] rounded px-1.5 py-0.5 text-[10px] text-[var(--color-figma-text)] placeholder-[var(--color-figma-text-tertiary)] focus:outline-none focus:border-[var(--color-figma-accent)]"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {previewTokens.length === 0 ? (
                    <div className="px-3 py-3 text-[10px] text-[var(--color-figma-text-tertiary)] text-center italic">
                      {Object.keys(setTokenValues).length === 0
                        ? 'No token data available'
                        : dimensions.every(d => {
                            const opt = d.options.find(o => o.name === selectedOptions[d.id]);
                            return !opt || Object.values(opt.sets).every(s => s === 'disabled');
                          })
                        ? 'Assign sets as Base or Override to see resolved tokens'
                        : previewSearch
                        ? 'No matching tokens'
                        : 'No tokens resolved with current selections'}
                    </div>
                  ) : (
                    <table className="w-full text-[10px]">
                      <thead>
                        <tr className="text-left text-[var(--color-figma-text-tertiary)] bg-[var(--color-figma-bg-secondary)]">
                          <th className="px-3 py-0.5 font-medium">Token</th>
                          <th className="px-2 py-0.5 font-medium">Value</th>
                          <th className="px-2 py-0.5 font-medium text-right">Source</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--color-figma-border)]">
                        {previewTokens.map(t => (
                          <tr
                            key={t.path}
                            className="hover:bg-[var(--color-figma-bg-hover)] cursor-default"
                            onClick={() => onNavigateToToken?.(t.set, t.path)}
                            title={`${t.path}\nRaw: ${typeof t.rawValue === 'object' ? JSON.stringify(t.rawValue) : t.rawValue}\nFrom: ${t.set} (${t.layer})`}
                          >
                            <td className="px-3 py-0.5 font-mono text-[var(--color-figma-text)] truncate max-w-[120px]">{t.path}</td>
                            <td className="px-2 py-0.5 text-[var(--color-figma-text-secondary)]">{renderValuePreview(t.resolvedValue)}</td>
                            <td className="px-2 py-0.5 text-right text-[var(--color-figma-text-tertiary)] truncate max-w-[80px]" title={t.layer}>{t.set}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {previewTokens.length >= 50 && (
                    <div className="px-3 py-1 text-[10px] text-[var(--color-figma-text-tertiary)] text-center border-t border-[var(--color-figma-border)]">
                      Showing first 50 tokens. Use search to filter.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Compare two options */}
            {showCompare && dimensions.length > 0 && (() => {
              const allOptions = dimensions.flatMap(d =>
                d.options.map(o => ({ dimId: d.id, dimName: d.name, optionName: o.name }))
              );
              const valA = compareOptA ? `${compareOptA.dimId}:${compareOptA.optionName}` : '';
              const valB = compareOptB ? `${compareOptB.dimId}:${compareOptB.optionName}` : '';
              const diffCount = compareRows.filter(r => r.isDiff).length;
              const totalCount = (() => {
                if (!compareOptA || !compareOptB) return 0;
                const dimA = dimensions.find(d => d.id === compareOptA.dimId);
                const dimB = dimensions.find(d => d.id === compareOptB.dimId);
                const optA = dimA?.options.find(o => o.name === compareOptA.optionName);
                const optB = dimB?.options.find(o => o.name === compareOptB.optionName);
                if (!optA || !optB) return 0;
                const pathsA = new Set(
                  [...Object.entries(optA.sets)]
                    .filter(([, s]) => s === 'source' || s === 'enabled')
                    .flatMap(([s]) => Object.keys(setTokenValues[s] ?? {}))
                );
                const pathsB = new Set(
                  [...Object.entries(optB.sets)]
                    .filter(([, s]) => s === 'source' || s === 'enabled')
                    .flatMap(([s]) => Object.keys(setTokenValues[s] ?? {}))
                );
                return new Set([...pathsA, ...pathsB]).size;
              })();

              return (
                <div className="border-t-2 border-[var(--color-figma-accent)]/30">
                  {/* Header */}
                  <div className="px-3 py-1.5 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[10px] font-medium text-[var(--color-figma-text)]">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--color-figma-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4" />
                        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                        <path d="M9 12h6" />
                      </svg>
                      Compare Options
                    </div>
                    {totalCount > 0 && (
                      <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">
                        {diffCount} diff{diffCount !== 1 ? 's' : ''} / {totalCount} tokens
                      </span>
                    )}
                  </div>

                  {/* Option selectors */}
                  <div className="px-3 py-2 border-t border-[var(--color-figma-border)] flex items-center gap-2">
                    <div className="flex-1 flex flex-col gap-1">
                      <label className="text-[9px] font-medium text-[var(--color-figma-text-tertiary)] uppercase tracking-wider">Option A</label>
                      <select
                        value={valA}
                        onChange={e => {
                          const [dimId, ...rest] = e.target.value.split(':');
                          setCompareOptA({ dimId, optionName: rest.join(':') });
                        }}
                        className="w-full px-1.5 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[10px] text-[var(--color-figma-text)] focus:outline-none focus:border-[var(--color-figma-accent)]"
                      >
                        {allOptions.length === 0 && <option value="">No options</option>}
                        {dimensions.map(d => (
                          <optgroup key={d.id} label={d.name}>
                            {d.options.map(o => (
                              <option key={o.name} value={`${d.id}:${o.name}`}>{o.name}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                    <div className="flex-shrink-0 mt-4 text-[var(--color-figma-text-tertiary)]">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                    </div>
                    <div className="flex-1 flex flex-col gap-1">
                      <label className="text-[9px] font-medium text-[var(--color-figma-text-tertiary)] uppercase tracking-wider">Option B</label>
                      <select
                        value={valB}
                        onChange={e => {
                          const [dimId, ...rest] = e.target.value.split(':');
                          setCompareOptB({ dimId, optionName: rest.join(':') });
                        }}
                        className="w-full px-1.5 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[10px] text-[var(--color-figma-text)] focus:outline-none focus:border-[var(--color-figma-accent)]"
                      >
                        {allOptions.length === 0 && <option value="">No options</option>}
                        {dimensions.map(d => (
                          <optgroup key={d.id} label={d.name}>
                            {d.options.map(o => (
                              <option key={o.name} value={`${d.id}:${o.name}`}>{o.name}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Search + filter controls */}
                  <div className="px-3 py-1 border-t border-[var(--color-figma-border)] flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Search tokens..."
                      value={compareSearch}
                      onChange={e => setCompareSearch(e.target.value)}
                      className="flex-1 bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] rounded px-1.5 py-0.5 text-[10px] text-[var(--color-figma-text)] placeholder-[var(--color-figma-text-tertiary)] focus:outline-none focus:border-[var(--color-figma-accent)]"
                    />
                    <button
                      onClick={() => setCompareDiffsOnly(v => !v)}
                      className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
                        compareDiffsOnly
                          ? 'bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)]'
                          : 'text-[var(--color-figma-text-tertiary)] hover:bg-[var(--color-figma-bg-hover)]'
                      }`}
                      title={compareDiffsOnly ? 'Showing differences only — click to show all' : 'Showing all tokens — click to show differences only'}
                    >
                      Diffs only
                    </button>
                  </div>

                  {/* Diff table */}
                  <div className="max-h-56 overflow-y-auto">
                    {!compareOptA || !compareOptB ? (
                      <div className="px-3 py-3 text-[10px] text-[var(--color-figma-text-tertiary)] text-center italic">
                        Select two options above to compare
                      </div>
                    ) : compareRows.length === 0 ? (
                      <div className="px-3 py-3 text-[10px] text-[var(--color-figma-text-tertiary)] text-center italic">
                        {compareSearch
                          ? 'No matching tokens'
                          : compareDiffsOnly
                          ? 'No differences — options resolve to identical values'
                          : 'No tokens resolved for these options'}
                      </div>
                    ) : (
                      <table className="w-full text-[10px]">
                        <thead>
                          <tr className="text-left text-[var(--color-figma-text-tertiary)] bg-[var(--color-figma-bg-secondary)] sticky top-0">
                            <th className="px-3 py-0.5 font-medium">Token</th>
                            <th className="px-2 py-0.5 font-medium" title={compareOptA ? `${compareOptA.optionName}` : 'A'}>
                              {compareOptA?.optionName ?? 'A'}
                            </th>
                            <th className="px-2 py-0.5 font-medium" title={compareOptB ? `${compareOptB.optionName}` : 'B'}>
                              {compareOptB?.optionName ?? 'B'}
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--color-figma-border)]">
                          {compareRows.map(row => (
                            <tr
                              key={row.path}
                              className={`hover:bg-[var(--color-figma-bg-hover)] cursor-default ${row.isDiff ? '' : 'opacity-50'}`}
                              title={row.path}
                            >
                              <td className="px-3 py-0.5 font-mono text-[var(--color-figma-text)] truncate max-w-[100px]">{row.path}</td>
                              <td className={`px-2 py-0.5 ${row.isDiff ? 'bg-red-500/5' : ''}`}>
                                {row.a !== undefined ? renderValuePreview(row.a) : <span className="text-[var(--color-figma-text-tertiary)] italic">—</span>}
                              </td>
                              <td className={`px-2 py-0.5 ${row.isDiff ? 'bg-emerald-500/5' : ''}`}>
                                {row.b !== undefined ? renderValuePreview(row.b) : <span className="text-[var(--color-figma-text-tertiary)] italic">—</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Create dimension footer */}
      <div className="p-3 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
        {showCreateDim ? (
          <div className="flex flex-col gap-2">
            <input
              type="text"
              value={newDimName}
              onChange={e => { setNewDimName(e.target.value); setCreateDimError(null); }}
              placeholder="Layer name (e.g. Color Mode, Brand)"
              className={`w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)] ${createDimError ? 'border-[var(--color-figma-error)]' : 'border-[var(--color-figma-border)]'}`}
              onKeyDown={e => e.key === 'Enter' && handleCreateDimension()}
              autoFocus
            />
            {createDimError && <p role="alert" className="text-[10px] text-[var(--color-figma-error)]">{createDimError}</p>}
            <div className="flex gap-2">
              <button
                onClick={handleCreateDimension}
                disabled={!newDimName}
                className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
              >
                Create Layer
              </button>
              <button
                onClick={() => { setShowCreateDim(false); setNewDimName(''); setCreateDimError(null); }}
                className="px-3 py-1.5 rounded text-[11px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowCreateDim(true)}
            className="w-full px-3 py-1.5 rounded border border-dashed border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] text-[11px] hover:bg-[var(--color-figma-bg-hover)] hover:border-[var(--color-figma-text-secondary)] transition-colors text-left flex items-center gap-1.5"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="18" height="6" rx="1.5" />
              <rect x="3" y="12" width="18" height="6" rx="1.5" opacity="0.5" />
            </svg>
            New layer
          </button>
        )}
      </div>

      {/* Auto-fill confirmation modal */}
      {autoFillPreview && (() => {
        const dimName = dimensions.find(d => d.id === autoFillPreview.dimId)?.name ?? autoFillPreview.dimId;
        if (autoFillPreview.mode === 'single-option') {
          const { optionName, targetSet, tokens } = autoFillPreview;
          return (
            <ConfirmModal
              title={`Auto-fill ${tokens.length} token${tokens.length !== 1 ? 's' : ''}?`}
              wide
              confirmLabel="Fill tokens"
              onCancel={() => setAutoFillPreview(null)}
              onConfirm={() => executeAutoFillAll(autoFillPreview)}
            >
              <p className="mt-1 text-[11px] text-[var(--color-figma-text-secondary)] leading-relaxed">
                Writing to <span className="font-mono font-medium text-[var(--color-figma-text)]">{targetSet}</span> (override set for <strong>{optionName}</strong> in <strong>{dimName}</strong>).
              </p>
              <div className="mt-2 max-h-40 overflow-y-auto rounded border border-[var(--color-figma-border)]">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="text-left bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-tertiary)] sticky top-0">
                      <th className="px-2 py-1 font-medium">Token path</th>
                      <th className="px-2 py-1 font-medium">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-figma-border)]">
                    {tokens.map(t => (
                      <tr key={t.path}>
                        <td className="px-2 py-0.5 font-mono text-[var(--color-figma-text)] truncate max-w-[140px]" title={t.path}>{t.path}</td>
                        <td className="px-2 py-0.5 text-[var(--color-figma-text-secondary)] truncate max-w-[100px]" title={String(t.$value)}>
                          {t.$type && <span className="mr-1 text-[var(--color-figma-text-tertiary)]">{t.$type}</span>}
                          {typeof t.$value === 'object' ? JSON.stringify(t.$value) : String(t.$value)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ConfirmModal>
          );
        } else {
          const { perSetBatch, totalCount } = autoFillPreview;
          const setEntries = Object.entries(perSetBatch);
          return (
            <ConfirmModal
              title={`Auto-fill ${totalCount} token${totalCount !== 1 ? 's' : ''} across all options?`}
              wide
              confirmLabel="Fill all options"
              onCancel={() => setAutoFillPreview(null)}
              onConfirm={() => executeAutoFillAllOptions(autoFillPreview)}
            >
              <p className="mt-1 text-[11px] text-[var(--color-figma-text-secondary)] leading-relaxed">
                Writing to {setEntries.length} set{setEntries.length !== 1 ? 's' : ''} across all options in <strong>{dimName}</strong>.
              </p>
              <div className="mt-2 max-h-40 overflow-y-auto rounded border border-[var(--color-figma-border)]">
                {setEntries.map(([targetSet, tokens]) => (
                  <div key={targetSet}>
                    <div className="sticky top-0 bg-[var(--color-figma-bg-secondary)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-figma-text-secondary)] border-b border-[var(--color-figma-border)]">
                      <span className="font-mono text-[var(--color-figma-text)]">{targetSet}</span>
                      <span className="ml-1 text-[var(--color-figma-text-tertiary)]">({tokens.length} token{tokens.length !== 1 ? 's' : ''})</span>
                    </div>
                    <table className="w-full text-[10px]">
                      <tbody className="divide-y divide-[var(--color-figma-border)]">
                        {tokens.map(t => (
                          <tr key={t.path}>
                            <td className="px-2 py-0.5 font-mono text-[var(--color-figma-text)] truncate max-w-[140px]" title={t.path}>{t.path}</td>
                            <td className="px-2 py-0.5 text-[var(--color-figma-text-secondary)] truncate max-w-[100px]" title={String(t.$value)}>
                              {t.$type && <span className="mr-1 text-[var(--color-figma-text-tertiary)]">{t.$type}</span>}
                              {typeof t.$value === 'object' ? JSON.stringify(t.$value) : String(t.$value)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </ConfirmModal>
          );
        }
      })()}

      {/* Bulk set-status context menu */}
      {bulkMenu && (
        <div
          ref={bulkMenuRef}
          role="menu"
          aria-label={`Set "${bulkMenu.setName}" in all options`}
          className="fixed z-50 bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] rounded shadow-lg py-1 min-w-[180px]"
          style={{ top: bulkMenu.y, left: bulkMenu.x }}
          onClick={e => e.stopPropagation()}
        >
          <div className="px-3 py-1 text-[10px] text-[var(--color-figma-text-tertiary)] font-medium uppercase tracking-wider" aria-hidden="true">
            Set &ldquo;{bulkMenu.setName}&rdquo; in all options
          </div>
          {(['disabled', 'source', 'enabled'] as const).map(s => (
            <button
              key={s}
              role="menuitem"
              tabIndex={-1}
              onClick={() => handleBulkSetState(bulkMenu.dimId, bulkMenu.setName, s)}
              className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] flex items-center gap-2"
            >
              <span className={`inline-block w-2 h-2 rounded-full ${
                s === 'source'
                  ? 'bg-[var(--color-figma-accent)]'
                  : s === 'enabled'
                  ? 'bg-[var(--color-figma-success)]'
                  : 'bg-[var(--color-figma-text-tertiary)]'
              }`} />
              {STATE_LABELS[s]} — {STATE_DESCRIPTIONS[s]}
            </button>
          ))}
        </div>
      )}

    </div>
  );
}
