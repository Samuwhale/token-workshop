import { useState, useRef, useEffect } from 'react';
import type { ThemeDimension } from '@tokenmanager/core';
import { apiFetch, ApiError } from '../shared/apiFetch';
import { getErrorMessage } from '../shared/utils';

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
  // Bulk set-status context menu
  const [bulkMenu, setBulkMenu] = useState<{ x: number; y: number; dimId: string; setName: string } | null>(null);
  const bulkMenuRef = useRef<HTMLDivElement | null>(null);
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());

  // Copy-from state
  const [copyFromNewOption, setCopyFromNewOption] = useState<Record<string, string>>({});
  const [showCopyFromMenu, setShowCopyFromMenu] = useState<{ dimId: string; optionName: string } | null>(null);
  const copyFromMenuRef = useRef<HTMLDivElement | null>(null);

  // Mutation queue: serializes set-state mutations so concurrent calls don't
  // interleave optimistic updates or capture stale rollback snapshots.
  const mutationChainRef = useRef<Promise<void>>(Promise.resolve());

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

  // --- Set state toggle (single option, single set) ---

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

  return {
    bulkMenu,
    setBulkMenu,
    bulkMenuRef,
    savingKeys,
    copyFromNewOption,
    setCopyFromNewOption,
    showCopyFromMenu,
    setShowCopyFromMenu,
    copyFromMenuRef,
    handleSetState,
    handleBulkSetState,
    handleBulkSetAllInOption,
    handleCopyAssignmentsFrom,
  };
}
