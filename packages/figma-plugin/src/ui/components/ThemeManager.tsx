import { getErrorMessage } from '../shared/utils';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { flattenTokenGroup } from '@tokenmanager/core';
import type { ThemeOption, ThemeDimension } from '@tokenmanager/core';
import type { UndoSlot } from '../hooks/useUndo';

const STATE_LABELS: Record<string, string> = {
  disabled: 'Not included',
  source: 'Foundation',
  enabled: 'Override',
};

const STATE_DESCRIPTIONS: Record<string, string> = {
  disabled: 'Tokens from this set are not used in this option',
  source: 'Base layer — provides default tokens that can be overridden',
  enabled: 'Top layer — these tokens take priority over Foundation sets',
};

interface ThemeManagerProps {
  serverUrl: string;
  connected: boolean;
  sets: string[];
  onDimensionsChange?: (dimensions: ThemeDimension[]) => void;
  onNavigateToToken?: (set: string, tokenPath: string) => void;
  onPushUndo?: (slot: UndoSlot) => void;
}

type CoverageToken = { path: string; set: string };
type CoverageMap = Record<string, Record<string, { uncovered: CoverageToken[] }>>;


function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function ThemeManager({ serverUrl, connected, sets, onDimensionsChange, onNavigateToToken, onPushUndo }: ThemeManagerProps) {
  const [dimensions, setDimensions] = useState<ThemeDimension[]>([]);

  useEffect(() => { onDimensionsChange?.(dimensions); }, [dimensions, onDimensionsChange]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  // --- New stacking UI state ---
  // Selected option tab per dimension
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  // Token values per set (for live preview)
  const [setTokenValues, setSetTokenValues] = useState<Record<string, Record<string, any>>>({});
  // Live preview panel
  const [showPreview, setShowPreview] = useState(false);
  const [previewSearch, setPreviewSearch] = useState('');
  // Collapsed "Not included" sections per dimension
  const [collapsedDisabled, setCollapsedDisabled] = useState<Set<string>>(new Set());

  const fetchDimensions = useCallback(async () => {
    if (!connected) { setLoading(false); return; }
    try {
      const res = await fetch(`${serverUrl}/api/themes`);
      const data = await res.json();
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
      await Promise.all(sets.map(async (s) => {
        try {
          const r = await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(s)}`);
          if (r.ok) {
            const d = await r.json();
            const map: Record<string, any> = {};
            for (const [path, token] of flattenTokenGroup(d.tokens || {})) {
              map[path] = token.$value;
            }
            tokenValues[s] = map;
          }
        } catch { /* ignore */ }
      }));
      setSetTokenValues(tokenValues);

      const isResolved = (value: any, activeValues: Record<string, any>, visited = new Set<string>()): boolean => {
        if (typeof value !== 'string') return true;
        const m = /^\{([^}]+)\}$/.exec(value);
        if (!m) return true;
        const target = m[1];
        if (visited.has(target)) return false;
        if (!(target in activeValues)) return false;
        return isResolved(activeValues[target], activeValues, new Set([...visited, target]));
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
          const uncovered = Object.entries(activeValues)
            .filter(([, v]) => !isResolved(v, activeValues))
            .map(([p]) => ({ path: p, set: tokenSetOrigin[p] ?? '' }));
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
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [serverUrl, connected, sets]);

  const debouncedFetchDimensions = useCallback(() => {
    if (debounceFetchTimer.current) clearTimeout(debounceFetchTimer.current);
    debounceFetchTimer.current = setTimeout(() => {
      debounceFetchTimer.current = null;
      fetchDimensions();
    }, 600);
  }, [fetchDimensions]);

  useEffect(() => () => { if (debounceFetchTimer.current) clearTimeout(debounceFetchTimer.current); }, []);

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
      const res = await fetch(`${serverUrl}/api/themes/dimensions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setCreateDimError(d.error || 'Failed to create dimension');
        return;
      }
      setNewDimName('');
      setShowCreateDim(false);
      setNewlyCreatedDim(id);
      setDimensions(prev => [...prev, { id, name, options: [] }]);
      debouncedFetchDimensions();
    } catch (err) {
      setCreateDimError(getErrorMessage(err, 'Failed to create dimension'));
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
    try {
      const res = await fetch(`${serverUrl}/api/themes/dimensions/${encodeURIComponent(renameDim)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setRenameError(d.error || 'Rename failed');
        return;
      }
      setDimensions(prev => prev.map(d => d.id === renameDim ? { ...d, name } : d));
      cancelRenameDim();
      debouncedFetchDimensions();
    } catch (err) {
      setRenameError(getErrorMessage(err, 'Rename failed'));
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
      const res = await fetch(
        `${serverUrl}/api/themes/dimensions/${encodeURIComponent(renameOption.dimId)}/options/${encodeURIComponent(renameOption.optionName)}`,
        { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) },
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setRenameOptionError(d.error || 'Rename failed');
        return;
      }
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
      setRenameOptionError(getErrorMessage(err, 'Rename failed'));
    }
  };

  // --- Delete dimension ---

  const executeDeleteDimension = async (id: string) => {
    // Snapshot the full dimension (with all options) for undo
    const snapshot = dimensions.find(d => d.id === id);
    if (!snapshot) return;
    const savedDim = JSON.parse(JSON.stringify(snapshot)) as ThemeDimension;
    try {
      const res = await fetch(`${serverUrl}/api/themes/dimensions/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || `Failed to delete dimension (${res.status})`);
        return;
      }
      setDimensions(prev => prev.filter(d => d.id !== id));
      debouncedFetchDimensions();

      // Push undo slot to recreate the dimension + all its options
      onPushUndo?.({
        description: `Deleted layer "${savedDim.name}"`,
        restore: async () => {
          // Recreate the dimension
          const createRes = await fetch(`${serverUrl}/api/themes/dimensions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: savedDim.id, name: savedDim.name }),
          });
          if (!createRes.ok) {
            const d = await createRes.json().catch(() => ({}));
            setError(d.error || 'Failed to undo: could not recreate layer');
            return;
          }
          // Recreate each option
          for (const opt of savedDim.options) {
            const optRes = await fetch(`${serverUrl}/api/themes/dimensions/${encodeURIComponent(savedDim.id)}/options`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: opt.name, sets: opt.sets }),
            });
            if (!optRes.ok) {
              setError(`Undo restored layer but failed to restore option "${opt.name}"`);
            }
          }
          fetchDimensions();
        },
      });
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to delete dimension'));
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
    const defaultSets: Record<string, 'disabled'> = {};
    sets.forEach(s => { defaultSets[s] = 'disabled'; });
    try {
      const res = await fetch(`${serverUrl}/api/themes/dimensions/${encodeURIComponent(dimId)}/options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, sets: defaultSets }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setAddOptionErrors(prev => ({ ...prev, [dimId]: d.error || 'Failed to add option' }));
        return;
      }
      setNewOptionNames(prev => ({ ...prev, [dimId]: '' }));
      setDimensions(prev => prev.map(d =>
        d.id === dimId ? { ...d, options: [...d.options, { name, sets: defaultSets }] } : d,
      ));
      // Auto-select newly added option
      setSelectedOptions(prev => ({ ...prev, [dimId]: name }));
      debouncedFetchDimensions();
      setTimeout(() => addOptionInputRefs.current[dimId]?.focus(), 0);
    } catch (err) {
      setAddOptionErrors(prev => ({ ...prev, [dimId]: getErrorMessage(err, 'Failed to add option') }));
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
      const res = await fetch(`${serverUrl}/api/themes/dimensions/${encodeURIComponent(dimId)}/options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, sets: { ...opt.sets } }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || 'Failed to duplicate option');
        return;
      }
      setDimensions(prev => prev.map(d =>
        d.id === dimId ? { ...d, options: [...d.options, { name: newName, sets: { ...opt.sets } }] } : d,
      ));
      setSelectedOptions(prev => ({ ...prev, [dimId]: newName }));
      debouncedFetchDimensions();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to duplicate option'));
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
      const res = await fetch(
        `${serverUrl}/api/themes/dimensions/${encodeURIComponent(dimId)}/options-order`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ options: reordered.map(o => o.name) }),
        },
      );
      if (!res.ok) {
        fetchDimensions();
      }
    } catch {
      fetchDimensions();
    }
  };

  // --- Delete option ---

  const executeDeleteOption = async (dimId: string, optionName: string) => {
    // Snapshot the option for undo
    const dim = dimensions.find(d => d.id === dimId);
    const snapshot = dim?.options.find(o => o.name === optionName);
    if (!snapshot) return;
    const savedOpt = JSON.parse(JSON.stringify(snapshot)) as ThemeOption;
    const dimName = dim!.name;
    try {
      const res = await fetch(
        `${serverUrl}/api/themes/dimensions/${encodeURIComponent(dimId)}/options/${encodeURIComponent(optionName)}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || `Failed to delete option (${res.status})`);
        return;
      }
      setDimensions(prev => prev.map(d =>
        d.id === dimId ? { ...d, options: d.options.filter(o => o.name !== optionName) } : d,
      ));
      debouncedFetchDimensions();

      // Push undo slot to recreate the option
      onPushUndo?.({
        description: `Deleted option "${optionName}" from "${dimName}"`,
        restore: async () => {
          const optRes = await fetch(`${serverUrl}/api/themes/dimensions/${encodeURIComponent(dimId)}/options`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: savedOpt.name, sets: savedOpt.sets }),
          });
          if (!optRes.ok) {
            const d = await optRes.json().catch(() => ({}));
            setError(d.error || 'Failed to undo: could not recreate option');
            return;
          }
          fetchDimensions();
        },
      });
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to delete option'));
    }
  };

  // --- Set state toggle ---

  const handleSetState = async (dimId: string, optionName: string, setName: string, targetState: string) => {
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
      const res = await fetch(`${serverUrl}/api/themes/dimensions/${encodeURIComponent(dimId)}/options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: optionName, sets: updatedSets }),
      });
      if (!res.ok) {
        setDimensions(previousDimensions);
        const d = await res.json().catch(() => ({}));
        setError(d.error || `Failed to save (${res.status})`);
        return;
      }
      debouncedFetchDimensions();
    } catch (err) {
      setDimensions(previousDimensions);
      setError(getErrorMessage(err, 'Failed to save'));
    } finally {
      setSavingKeys(prev => { const n = new Set(prev); n.delete(saveKey); return n; });
    }
  };

  // --- Bulk set-status across all options in a dimension ---

  const handleBulkSetState = async (dimId: string, setName: string, targetState: 'enabled' | 'disabled' | 'source') => {
    setBulkMenu(null);
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
      const results = await Promise.all(dim.options.map(opt => {
        const updatedSets = { ...opt.sets, [setName]: targetState };
        return fetch(`${serverUrl}/api/themes/dimensions/${encodeURIComponent(dimId)}/options`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: opt.name, sets: updatedSets }),
        });
      }));
      const failed = results.find(r => !r.ok);
      if (failed) {
        setDimensions(previousDimensions);
        const d = await failed.json().catch(() => ({}));
        setError(d.error || `Failed to bulk-update (${failed.status})`);
        return;
      }
      debouncedFetchDimensions();
    } catch (err) {
      setDimensions(previousDimensions);
      setError(getErrorMessage(err, 'Failed to bulk-update'));
    } finally {
      setSavingKeys(prev => { const n = new Set(prev); bulkKeys.forEach(k => n.delete(k)); return n; });
    }
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

      // Foundation sets first (can be overridden)
      for (const [setName, status] of Object.entries(opt.sets)) {
        if (status !== 'source') continue;
        const tokens = setTokenValues[setName];
        if (!tokens) continue;
        for (const [path, value] of Object.entries(tokens)) {
          merged[path] = { value, set: setName, layer: `${dim.name} / Foundation` };
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
        <div className="w-4 h-4 rounded-full border-2 border-[var(--color-figma-border)] border-t-[var(--color-figma-accent)] animate-spin" aria-hidden="true" />
        Loading themes...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {error && (
        <div role="alert" className="mx-3 mt-2 px-2 py-1.5 rounded bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)] text-[10px] flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-2 text-[var(--color-figma-error)] hover:opacity-70 flex-shrink-0">
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
                  onClick={() => setShowPreview(p => !p)}
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
              </div>
            </div>

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
              {dimensions.map((dim, dimIdx) => {
                const selectedOpt = selectedOptions[dim.id] || dim.options[0]?.name || '';
                const opt = dim.options.find(o => o.name === selectedOpt);
                const optSets = opt ? (optionSetOrders[dim.id]?.[opt.name] || sets) : sets;
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

                return (
                  <div
                    key={dim.id}
                    ref={dim.id === newlyCreatedDim ? (el) => { if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } : undefined}
                    className="border-b border-[var(--color-figma-border)]"
                  >
                    {/* Layer header */}
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--color-figma-bg-secondary)] group">
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
                        {dim.options.map((o, oIdx) => (
                          <button
                            key={o.name}
                            onClick={() => setSelectedOptions(prev => ({ ...prev, [dim.id]: o.name }))}
                            className={`relative px-2.5 py-1 text-[10px] font-medium rounded-t transition-colors flex-shrink-0 ${
                              selectedOpt === o.name
                                ? 'text-[var(--color-figma-accent)] bg-[var(--color-figma-bg-secondary)]'
                                : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'
                            }`}
                          >
                            {o.name}
                            {selectedOpt === o.name && (
                              <span className="absolute bottom-0 left-1 right-1 h-[2px] bg-[var(--color-figma-accent)] rounded-t" />
                            )}
                          </button>
                        ))}
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
                              if (e.key === 'Escape') { setShowAddOption(prev => ({ ...prev, [dim.id]: false })); setNewOptionNames(prev => ({ ...prev, [dim.id]: '' })); }
                            }}
                            placeholder={dim.options.length === 0 ? 'First option (e.g. Light, Dark)' : 'Option name'}
                            className={`flex-1 px-1.5 py-0.5 rounded text-[10px] bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] outline-none focus:border-[var(--color-figma-accent)] ${addOptionErrors[dim.id] ? 'border-[var(--color-figma-error)]' : 'border-[var(--color-figma-border)]'}`}
                            autoFocus
                          />
                          <button onClick={() => handleAddOption(dim.id)} disabled={!newOptionNames[dim.id]?.trim()} className="px-1.5 py-0.5 rounded bg-[var(--color-figma-accent)] text-white text-[10px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40">Add</button>
                          {dim.options.length > 0 && (
                            <button onClick={() => { setShowAddOption(prev => ({ ...prev, [dim.id]: false })); setNewOptionNames(prev => ({ ...prev, [dim.id]: '' })); }} className="px-1.5 py-0.5 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]">Cancel</button>
                          )}
                        </div>
                        {addOptionErrors[dim.id] && <p role="alert" className="text-[10px] text-[var(--color-figma-error)] mt-1">{addOptionErrors[dim.id]}</p>}
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

                            {/* Foundation section */}
                            {foundationSets.length > 0 && (
                              <div>
                                <div className="px-3 py-0.5 flex items-center gap-1 text-[10px] font-medium text-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/5">
                                  <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="3" opacity="0.3" /></svg>
                                  Foundation ({foundationSets.length})
                                  <span className="text-[var(--color-figma-text-tertiary)] font-normal ml-1">base defaults</span>
                                </div>
                                {foundationSets.map(s => renderSetRow(dim, opt, s, 'source'))}
                              </div>
                            )}

                            {/* Not included section — collapsed by default */}
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
                                  Not included ({disabledSets.length})
                                </button>
                                {isDisabledCollapsed && disabledSets.map(s => renderSetRow(dim, opt, s, 'disabled'))}
                              </div>
                            )}

                            {/* All sets are in one group — show empty hint */}
                            {overrideSets.length === 0 && foundationSets.length === 0 && disabledSets.length > 0 && !isDisabledCollapsed && (
                              <div className="px-3 py-2 text-[10px] text-[var(--color-figma-text-tertiary)] italic">
                                No sets assigned yet. Expand &ldquo;Not included&rdquo; and assign sets as Foundation or Override.
                              </div>
                            )}
                          </div>
                        )}

                        {/* Coverage gaps */}
                        {expandedCoverage.has(covKey) && (coverage[dim.id]?.[selectedOpt]?.uncovered.length ?? 0) > 0 && (
                          <div className="border-t border-[var(--color-figma-warning)]/25 bg-[var(--color-figma-warning)]/10 px-3 py-2">
                            <div className="text-[10px] font-medium text-[var(--color-figma-warning)] mb-1">
                              Missing values ({coverage[dim.id][selectedOpt].uncovered.length})
                            </div>
                            <p className="text-[10px] text-[var(--color-figma-text-secondary)] mb-1.5">These tokens have references that can't be resolved within the active sets.</p>
                            <div className="flex flex-col gap-0.5 max-h-32 overflow-y-auto focus:outline-none focus:ring-1 focus:ring-[var(--color-figma-accent)] rounded" role="list" tabIndex={0} aria-label={`Missing tokens for ${selectedOpt}`}>
                              {coverage[dim.id][selectedOpt].uncovered.map(item => (
                                onNavigateToToken && item.set ? (
                                  <button
                                    key={item.path}
                                    onClick={() => onNavigateToToken(item.set, item.path)}
                                    className="text-left text-[10px] text-[var(--color-figma-warning)] font-mono truncate hover:underline cursor-pointer"
                                    title={`Navigate to ${item.path} in set "${item.set}"`}
                                    role="listitem"
                                  >
                                    {item.path}
                                  </button>
                                ) : (
                                  <div key={item.path} className="text-[10px] text-[var(--color-figma-text-secondary)] font-mono truncate" role="listitem">{item.path}</div>
                                )
                              ))}
                            </div>
                          </div>
                        )}
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
                        ? 'Assign sets as Foundation or Override to see resolved tokens'
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
