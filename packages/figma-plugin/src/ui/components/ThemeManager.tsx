import { useState, useEffect, useCallback, useRef } from 'react';
import { flattenTokenGroup } from '@tokenmanager/core';
import type { ThemeOption, ThemeDimension } from '@tokenmanager/core';
import { ConfirmModal } from './ConfirmModal';

const STATE_LABELS: Record<string, string> = {
  disabled: 'Off',
  source: 'Base',
  enabled: 'On',
};

const STATE_DESCRIPTIONS: Record<string, string> = {
  disabled: 'Not used in this option',
  source: 'Foundation set — tokens can be overridden by "On" sets',
  enabled: 'Active in this option — overrides the base set',
};

interface ThemeManagerProps {
  serverUrl: string;
  connected: boolean;
  sets: string[];
  onDimensionsChange?: (dimensions: ThemeDimension[]) => void;
}

type CoverageMap = Record<string, Record<string, { uncovered: string[] }>>;


function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function ThemeManager({ serverUrl, connected, sets, onDimensionsChange }: ThemeManagerProps) {
  const [dimensions, setDimensions] = useState<ThemeDimension[]>([]);

  useEffect(() => { onDimensionsChange?.(dimensions); }, [dimensions, onDimensionsChange]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create dimension
  const [newDimName, setNewDimName] = useState('');
  const [showCreateDim, setShowCreateDim] = useState(false);
  const [createDimError, setCreateDimError] = useState<string | null>(null);

  // Rename dimension
  const [renameDim, setRenameDim] = useState<string | null>(null); // dimension id
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'dimension'; id: string } | { type: 'option'; dimId: string; optionName: string } | null>(null);

  // Add option per dimension
  const [newOptionNames, setNewOptionNames] = useState<Record<string, string>>({});
  const [showAddOption, setShowAddOption] = useState<Record<string, boolean>>({});
  const [addOptionErrors, setAddOptionErrors] = useState<Record<string, string>>({});

  // Coverage gaps
  const [coverage, setCoverage] = useState<CoverageMap>({});
  const [expandedCoverage, setExpandedCoverage] = useState<string | null>(null); // `${dimId}:${optionName}`

  // Per-option set ordering (determines override precedence)
  const [optionSetOrders, setOptionSetOrders] = useState<Record<string, Record<string, string[]>>>({});

  // Set row drag
  const [dragInfo, setDragInfo] = useState<{ dimId: string; optionName: string; setName: string } | null>(null);
  const [dragOver, setDragOver] = useState<{ dimId: string; optionName: string; setName: string } | null>(null);

  // Newly created dimension for auto-scroll
  const [newlyCreatedDim, setNewlyCreatedDim] = useState<string | null>(null);
  const newDimCardRef = useRef<HTMLDivElement | null>(null);

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

      // Compute coverage
      const setTokenValues: Record<string, Record<string, any>> = {};
      await Promise.all(sets.map(async (s) => {
        try {
          const r = await fetch(`${serverUrl}/api/tokens/${s}`);
          if (r.ok) {
            const d = await r.json();
            const map: Record<string, any> = {};
            for (const [path, token] of flattenTokenGroup(d.tokens || {})) {
              map[path] = token.$value;
            }
            setTokenValues[s] = map;
          }
        } catch { /* ignore */ }
      }));

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
          for (const [setName, state] of Object.entries(opt.sets)) {
            if (state === 'source') Object.assign(activeValues, setTokenValues[setName] ?? {});
          }
          for (const [setName, state] of Object.entries(opt.sets)) {
            if (state === 'enabled') Object.assign(activeValues, setTokenValues[setName] ?? {});
          }
          const uncovered = Object.entries(activeValues)
            .filter(([, v]) => !isResolved(v, activeValues))
            .map(([p]) => p);
          cov[dim.id][opt.name] = { uncovered };
        }
      }
      setCoverage(cov);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }, [serverUrl, connected, sets]);

  useEffect(() => { fetchDimensions(); }, [fetchDimensions]);

  // --- Create dimension ---

  const handleCreateDimension = async () => {
    const name = newDimName.trim();
    if (!name || !connected) return;
    const id = slugify(name) || name.toLowerCase().replace(/\s+/g, '-');
    if (!id || !/^[a-z0-9-]+$/.test(id)) {
      setCreateDimError('Could not generate a valid ID from that name. Use letters, numbers, and spaces.');
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
      fetchDimensions();
    } catch (err) {
      setCreateDimError(err instanceof Error ? err.message : 'Failed to create dimension');
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
      cancelRenameDim();
      fetchDimensions();
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : 'Rename failed');
    }
  };

  // --- Delete dimension ---

  const executeDeleteDimension = async (id: string) => {
    try {
      await fetch(`${serverUrl}/api/themes/dimensions/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setDimensions(prev => prev.filter(d => d.id !== id));
      fetchDimensions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete dimension');
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
      setShowAddOption(prev => ({ ...prev, [dimId]: false }));
      fetchDimensions();
    } catch (err) {
      setAddOptionErrors(prev => ({ ...prev, [dimId]: err instanceof Error ? err.message : 'Failed to add option' }));
    }
  };

  // --- Delete option ---

  const executeDeleteOption = async (dimId: string, optionName: string) => {
    try {
      await fetch(
        `${serverUrl}/api/themes/dimensions/${encodeURIComponent(dimId)}/options/${encodeURIComponent(optionName)}`,
        { method: 'DELETE' },
      );
      setDimensions(prev => prev.map(d =>
        d.id === dimId ? { ...d, options: d.options.filter(o => o.name !== optionName) } : d,
      ));
      fetchDimensions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete option');
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
    setDimensions(prev => prev.map(d =>
      d.id === dimId
        ? { ...d, options: d.options.map(o => o.name === optionName ? { ...o, sets: updatedSets } : o) }
        : d,
    ));
    try {
      await fetch(`${serverUrl}/api/themes/dimensions/${encodeURIComponent(dimId)}/options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: optionName, sets: updatedSets }),
      });
      fetchDimensions();
    } catch (err) {
      setDimensions(previousDimensions);
      setError(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  // --- Drag-to-reorder set rows within an option ---

  const handleDragStart = (e: React.DragEvent, dimId: string, optionName: string, setName: string) => {
    setDragInfo({ dimId, optionName, setName });
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, dimId: string, optionName: string, setName: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!dragInfo || dragInfo.dimId !== dimId || dragInfo.optionName !== optionName || dragInfo.setName === setName) return;
    setDragOver({ dimId, optionName, setName });
  };

  const handleDrop = async (e: React.DragEvent, dimId: string, optionName: string, targetSetName: string) => {
    e.preventDefault();
    if (!dragInfo || dragInfo.dimId !== dimId || dragInfo.optionName !== optionName) return;
    const dim = dimensions.find(d => d.id === dimId);
    const opt = dim?.options.find(o => o.name === optionName);
    if (!opt) return;
    const order = [...(optionSetOrders[dimId]?.[optionName] || sets)];
    const fromIdx = order.indexOf(dragInfo.setName);
    const toIdx = order.indexOf(targetSetName);
    setDragInfo(null);
    setDragOver(null);
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
    const newOrder = [...order];
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, dragInfo.setName);
    const previousOrder = order;
    setOptionSetOrders(prev => ({
      ...prev,
      [dimId]: { ...(prev[dimId] || {}), [optionName]: newOrder },
    }));
    const reorderedSets: Record<string, 'enabled' | 'disabled' | 'source'> = {};
    for (const s of newOrder) {
      reorderedSets[s] = opt.sets[s] ?? 'disabled';
    }
    try {
      const res = await fetch(`${serverUrl}/api/themes/dimensions/${encodeURIComponent(dimId)}/options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: optionName, sets: reorderedSets }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(body || `Server returned ${res.status}`);
      }
    } catch (err) {
      setOptionSetOrders(prev => ({
        ...prev,
        [dimId]: { ...(prev[dimId] || {}), [optionName]: previousOrder },
      }));
      setError(err instanceof Error ? err.message : 'Failed to save set order');
    }
  };

  const handleDragEnd = () => {
    setDragInfo(null);
    setDragOver(null);
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
        <div className="mx-3 mt-2 px-2 py-1.5 rounded bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)] text-[10px]">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3">
        {dimensions.length === 0 && !showCreateDim ? (
          <div className="flex flex-col items-center justify-center py-8 text-[var(--color-figma-text-secondary)] text-center px-4">
            <p className="text-[12px] font-medium text-[var(--color-figma-text)]">No theme dimensions configured</p>
            <p className="text-[10px] mt-1.5 leading-relaxed">Theme dimensions represent axes of variation in your design system — for example, "Color Mode" (Light/Dark), "Brand" (Default/Premium), or "Density" (Regular/Compact). Multiple dimensions can be active at once.</p>
            <button
              onClick={() => setShowCreateDim(true)}
              className="mt-4 px-4 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)]"
            >
              Create your first dimension
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {dimensions.map(dim => (
              <div
                key={dim.id}
                ref={dim.id === newlyCreatedDim ? (el) => { if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } } : undefined}
                className="rounded border border-[var(--color-figma-border)] overflow-hidden"
              >
                {/* Dimension header */}
                <div className="flex items-center justify-between px-3 py-2 bg-[var(--color-figma-bg-secondary)]">
                  {renameDim === dim.id ? (
                    <div className="flex flex-col gap-1 flex-1 mr-2">
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
                      {renameError && <p className="text-[9px] text-[var(--color-figma-error)]">{renameError}</p>}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 flex-1 min-w-0 group">
                      <div className="flex flex-col min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-medium truncate" title={dim.name}>{dim.name}</span>
                          <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">· {dim.options.length} option{dim.options.length !== 1 ? 's' : ''}</span>
                          <button
                            onClick={() => startRenameDim(dim.id, dim.name)}
                            className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] flex-shrink-0"
                            title="Rename dimension"
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      <button
                        onClick={() => setDeleteConfirm({ type: 'dimension', id: dim.id })}
                        className="p-1 rounded hover:bg-[var(--color-figma-error)]/20 text-[var(--color-figma-error)] text-[10px] flex-shrink-0 opacity-0 group-hover:opacity-100"
                        title="Delete dimension"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>

                {/* Options */}
                {dim.options.length > 0 && (
                  <div className="divide-y divide-[var(--color-figma-border)]">
                    {dim.options.map(opt => {
                      const covKey = `${dim.id}:${opt.name}`;
                      const hasUncovered = (coverage[dim.id]?.[opt.name]?.uncovered.length ?? 0) > 0;
                      const optSets = optionSetOrders[dim.id]?.[opt.name] || sets;
                      return (
                        <div key={opt.name} className="group/opt">
                          {/* Option header row */}
                          <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--color-figma-bg-secondary)]/50 border-t border-[var(--color-figma-border)]">
                            <div className="flex items-center gap-1.5 flex-1 min-w-0">
                              <span className="text-[10px] font-medium text-[var(--color-figma-text)] truncate">{opt.name}</span>
                              {hasUncovered && (
                                <button
                                  onClick={() => setExpandedCoverage(expandedCoverage === covKey ? null : covKey)}
                                  className="flex items-center gap-1 px-1 py-0.5 rounded text-[9px] font-medium bg-[var(--color-figma-warning)]/15 text-[var(--color-figma-warning)] border border-[var(--color-figma-warning)]/40 hover:bg-[var(--color-figma-warning)]/25 transition-colors flex-shrink-0"
                                  title={`${coverage[dim.id][opt.name].uncovered.length} tokens have no value in active sets`}
                                >
                                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                                  {coverage[dim.id][opt.name].uncovered.length} gaps
                                </button>
                              )}
                            </div>
                            <button
                              onClick={() => setDeleteConfirm({ type: 'option', dimId: dim.id, optionName: opt.name })}
                              className="p-0.5 rounded hover:bg-[var(--color-figma-error)]/20 text-[var(--color-figma-error)] flex-shrink-0 opacity-0 group-hover/opt:opacity-100"
                              title="Delete option"
                            >
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                              </svg>
                            </button>
                          </div>

                          {/* Set matrix for this option */}
                          {sets.length > 0 && (
                            <>
                              <div className="flex items-center justify-end px-3 py-0.5 bg-[var(--color-figma-bg-secondary)] gap-1.5 text-[9px] text-[var(--color-figma-text-tertiary)]">
                                <span className="font-medium text-[var(--color-figma-text-secondary)]">Off</span>
                                <span>= not used</span>
                                <span className="opacity-40">·</span>
                                <span className="font-medium text-[var(--color-figma-accent)]">Base</span>
                                <span>= foundation</span>
                                <span className="opacity-40">·</span>
                                <span className="font-medium text-[var(--color-figma-success)]">On</span>
                                <span>= overrides base</span>
                              </div>
                              <div className="divide-y divide-[var(--color-figma-border)]">
                                {optSets.map(setName => {
                                  const state = opt.sets[setName] || 'disabled';
                                  const isDropTarget = dragOver?.dimId === dim.id && dragOver?.optionName === opt.name && dragOver?.setName === setName;
                                  const isDragging = dragInfo?.dimId === dim.id && dragInfo?.optionName === opt.name && dragInfo?.setName === setName;
                                  return (
                                    <div
                                      key={setName}
                                      draggable
                                      onDragStart={e => handleDragStart(e, dim.id, opt.name, setName)}
                                      onDragOver={e => handleDragOver(e, dim.id, opt.name, setName)}
                                      onDrop={e => handleDrop(e, dim.id, opt.name, setName)}
                                      onDragEnd={handleDragEnd}
                                      className={`flex items-center justify-between px-3 py-1 transition-colors ${
                                        isDropTarget
                                          ? 'bg-[var(--color-figma-accent)]/10 border-l-2 border-l-[var(--color-figma-accent)]'
                                          : isDragging
                                          ? 'opacity-40'
                                          : 'hover:bg-[var(--color-figma-bg-hover)]'
                                      }`}
                                    >
                                      <span className="mr-2 text-[var(--color-figma-text-tertiary)] cursor-grab active:cursor-grabbing flex-shrink-0 select-none" title="Drag to reorder" aria-hidden="true">
                                        <svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor">
                                          <circle cx="2" cy="2" r="1"/><circle cx="6" cy="2" r="1"/>
                                          <circle cx="2" cy="6" r="1"/><circle cx="6" cy="6" r="1"/>
                                          <circle cx="2" cy="10" r="1"/><circle cx="6" cy="10" r="1"/>
                                        </svg>
                                      </span>
                                      <span className="text-[11px] text-[var(--color-figma-text)] flex-1 truncate" title={setName}>{setName}</span>
                                      <div className="flex rounded overflow-hidden border border-[var(--color-figma-border)] text-[9px] font-medium">
                                        {(['disabled', 'source', 'enabled'] as const).map(s => (
                                          <button
                                            key={s}
                                            onClick={() => { if (state !== s) handleSetState(dim.id, opt.name, setName, s); }}
                                            className={`px-1.5 py-0.5 transition-colors ${
                                              state === s
                                                ? s === 'source'
                                                  ? 'bg-[var(--color-figma-accent)]/20 text-[var(--color-figma-accent)]'
                                                  : s === 'enabled'
                                                  ? 'bg-[var(--color-figma-success)]/20 text-[var(--color-figma-success)]'
                                                  : 'bg-[var(--color-figma-border)]/60 text-[var(--color-figma-text-secondary)]'
                                                : 'text-[var(--color-figma-text-tertiary)] hover:bg-[var(--color-figma-bg-hover)]'
                                            }`}
                                            title={STATE_DESCRIPTIONS[s]}
                                            aria-pressed={state === s}
                                          >
                                            {STATE_LABELS[s]}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </>
                          )}

                          {/* Coverage gaps */}
                          {expandedCoverage === covKey && (coverage[dim.id]?.[opt.name]?.uncovered.length ?? 0) > 0 && (
                            <div className="border-t border-[var(--color-figma-warning)]/25 bg-[var(--color-figma-warning)]/10 px-3 py-2">
                              <div className="text-[10px] font-medium text-[var(--color-figma-warning)] mb-1">
                                Missing values ({coverage[dim.id][opt.name].uncovered.length})
                              </div>
                              <p className="text-[9px] text-[var(--color-figma-text-secondary)] mb-1.5">These tokens have references that can't be resolved within the active sets.</p>
                              <div className="flex flex-col gap-0.5 max-h-32 overflow-y-auto">
                                {coverage[dim.id][opt.name].uncovered.map(p => (
                                  <div key={p} className="text-[9px] text-[var(--color-figma-text-secondary)] font-mono truncate">{p}</div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Add option */}
                <div className="px-3 py-2 border-t border-[var(--color-figma-border)]">
                  {showAddOption[dim.id] ? (
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={newOptionNames[dim.id] || ''}
                          onChange={e => { setNewOptionNames(prev => ({ ...prev, [dim.id]: e.target.value })); setAddOptionErrors(prev => ({ ...prev, [dim.id]: '' })); }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleAddOption(dim.id);
                            if (e.key === 'Escape') { setShowAddOption(prev => ({ ...prev, [dim.id]: false })); setNewOptionNames(prev => ({ ...prev, [dim.id]: '' })); }
                          }}
                          placeholder="Option name (e.g. Light, Dark)"
                          className={`flex-1 px-1.5 py-0.5 rounded text-[10px] bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] outline-none focus:border-[var(--color-figma-accent)] ${addOptionErrors[dim.id] ? 'border-[var(--color-figma-error)]' : 'border-[var(--color-figma-border)]'}`}
                          autoFocus
                        />
                        <button
                          onClick={() => handleAddOption(dim.id)}
                          disabled={!newOptionNames[dim.id]?.trim()}
                          className="px-1.5 py-0.5 rounded bg-[var(--color-figma-accent)] text-white text-[10px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
                        >
                          Add
                        </button>
                        <button
                          onClick={() => { setShowAddOption(prev => ({ ...prev, [dim.id]: false })); setNewOptionNames(prev => ({ ...prev, [dim.id]: '' })); }}
                          className="px-1.5 py-0.5 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                        >
                          Cancel
                        </button>
                      </div>
                      {addOptionErrors[dim.id] && <p className="text-[9px] text-[var(--color-figma-error)]">{addOptionErrors[dim.id]}</p>}
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowAddOption(prev => ({ ...prev, [dim.id]: true }))}
                      className="text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
                    >
                      + Add option
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create dimension */}
      <div className="p-3 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
        {showCreateDim ? (
          <div className="flex flex-col gap-2">
            <input
              type="text"
              value={newDimName}
              onChange={e => { setNewDimName(e.target.value); setCreateDimError(null); }}
              placeholder="Dimension name (e.g. Color Mode, Brand)"
              className={`w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)] ${createDimError ? 'border-[var(--color-figma-error)]' : 'border-[var(--color-figma-border)]'}`}
              onKeyDown={e => e.key === 'Enter' && handleCreateDimension()}
              autoFocus
            />
            {createDimError && <p className="text-[10px] text-[var(--color-figma-error)]">{createDimError}</p>}
            <div className="flex gap-2">
              <button
                onClick={handleCreateDimension}
                disabled={!newDimName}
                className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
              >
                Create
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
            className="w-full px-3 py-1.5 rounded border border-dashed border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] text-[11px] hover:bg-[var(--color-figma-bg-hover)] hover:border-[var(--color-figma-text-secondary)] transition-colors text-left"
          >
            + New dimension
          </button>
        )}
      </div>

      {/* Delete confirm modal */}
      {deleteConfirm && (
        <ConfirmModal
          title={deleteConfirm.type === 'dimension' ? 'Delete dimension?' : 'Delete option?'}
          message={
            deleteConfirm.type === 'dimension'
              ? `Delete dimension "${dimensions.find(d => d.id === deleteConfirm.id)?.name}"? All its options will also be deleted.`
              : `Delete option "${deleteConfirm.optionName}" from "${dimensions.find(d => d.id === deleteConfirm.dimId)?.name}"?`
          }
          confirmLabel="Delete"
          onConfirm={() => {
            if (deleteConfirm.type === 'dimension') {
              executeDeleteDimension(deleteConfirm.id);
            } else {
              executeDeleteOption(deleteConfirm.dimId, deleteConfirm.optionName);
            }
            setDeleteConfirm(null);
          }}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
}
