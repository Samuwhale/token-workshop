import { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { apiFetch, isNetworkError } from '../shared/apiFetch';
import { stableStringify, SET_NAME_RE } from '../shared/utils';
import { resolveAllAliases } from '../../shared/resolveAlias';
import type { TokenMapEntry } from '../../shared/types';

interface UseSetTabsParams {
  serverUrl: string;
  connected: boolean;
  getDisconnectSignal: () => AbortSignal;
  sets: string[];
  setSets: (sets: string[]) => void;
  activeSet: string;
  refreshTokens: () => void;
  setSuccessToast: (msg: string) => void;
  setErrorToast: (msg: string) => void;
  markDisconnected: () => void;
  perSetFlat: Record<string, Record<string, TokenMapEntry>>;
  allTokensFlat: Record<string, TokenMapEntry>;
  activeThemes: Record<string, string>;
}

export function useSetTabs({
  serverUrl, connected, getDisconnectSignal,
  sets, setSets, activeSet,
  refreshTokens, setSuccessToast, setErrorToast, markDisconnected,
  perSetFlat, allTokensFlat, activeThemes,
}: UseSetTabsParams) {
  // Drag state
  const [dragSetName, setDragSetName] = useState<string | null>(null);
  const [dragOverSetName, setDragOverSetName] = useState<string | null>(null);

  // Context menu state
  const [tabMenuOpen, setTabMenuOpen] = useState<string | null>(null);
  const [tabMenuPos, setTabMenuPos] = useState({ x: 0, y: 0 });
  const tabMenuRef = useRef<HTMLDivElement>(null);

  // New set creation state
  const [creatingSet, setCreatingSet] = useState(false);
  const [newSetName, setNewSetName] = useState('');
  const [newSetError, setNewSetError] = useState('');
  const newSetInputRef = useRef<HTMLInputElement>(null);

  // Overflow state
  const setTabsScrollRef = useRef<HTMLDivElement>(null);
  const [setTabsOverflow, setSetTabsOverflow] = useState<{ left: boolean; right: boolean }>({ left: false, right: false });

  // Cascade diff: live diff of resolved values when dragging set tabs to reorder
  const cascadeDiff = useMemo<Record<string, { before: any; after: any }> | null>(() => {
    if (!dragSetName || !dragOverSetName || dragSetName === dragOverSetName) return null;
    if (Object.keys(activeThemes).length > 0) return null;
    const fromIdx = sets.indexOf(dragSetName);
    const toIdx = sets.indexOf(dragOverSetName);
    if (fromIdx === -1 || toIdx === -1) return null;
    const proposedOrder = [...sets];
    proposedOrder.splice(fromIdx, 1);
    proposedOrder.splice(toIdx, 0, dragSetName);
    const proposedRaw: Record<string, TokenMapEntry> = {};
    for (const sn of proposedOrder) {
      const setMap = perSetFlat[sn];
      if (setMap) Object.assign(proposedRaw, setMap);
    }
    const proposedResolved = resolveAllAliases(proposedRaw);
    const diff: Record<string, { before: any; after: any }> = {};
    const allPaths = new Set([...Object.keys(allTokensFlat), ...Object.keys(proposedResolved)]);
    for (const path of allPaths) {
      const before = allTokensFlat[path]?.$value;
      const after = proposedResolved[path]?.$value;
      if (stableStringify(before) !== stableStringify(after)) {
        diff[path] = { before, after };
      }
    }
    return Object.keys(diff).length > 0 ? diff : null;
  }, [dragSetName, dragOverSetName, sets, perSetFlat, allTokensFlat, activeThemes]);

  // Close set context menu on outside click
  useEffect(() => {
    if (!tabMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (tabMenuRef.current && !tabMenuRef.current.contains(e.target as Node)) {
        setTabMenuOpen(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [tabMenuOpen]);

  // Focus new set input when it appears
  useLayoutEffect(() => {
    if (creatingSet && newSetInputRef.current) {
      newSetInputRef.current.focus();
      newSetInputRef.current.select();
    }
  }, [creatingSet]);

  // Detect horizontal overflow in set tab bar
  const checkSetTabsOverflow = useCallback(() => {
    const el = setTabsScrollRef.current;
    if (!el) return;
    const hasOverflow = el.scrollWidth > el.clientWidth;
    setSetTabsOverflow({
      left: hasOverflow && el.scrollLeft > 2,
      right: hasOverflow && el.scrollLeft < el.scrollWidth - el.clientWidth - 2,
    });
  }, []);

  useEffect(() => {
    const el = setTabsScrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', checkSetTabsOverflow);
    const ro = new ResizeObserver(checkSetTabsOverflow);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', checkSetTabsOverflow); ro.disconnect(); };
  }, [checkSetTabsOverflow]);

  // Re-check overflow whenever the set list changes
  useEffect(() => { checkSetTabsOverflow(); }, [sets, checkSetTabsOverflow]);

  const scrollSetTabs = useCallback((direction: 'left' | 'right') => {
    const el = setTabsScrollRef.current;
    if (!el) return;
    el.scrollBy({ left: direction === 'left' ? -120 : 120, behavior: 'smooth' });
  }, []);

  // Scroll active set tab into view whenever activeSet changes
  useEffect(() => {
    const container = setTabsScrollRef.current;
    if (!container) return;
    const activeEl = container.querySelector('[data-active-set="true"]') as HTMLElement | null;
    if (activeEl) activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }, [activeSet]);

  const openSetMenu = (setName: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setTabMenuOpen(setName);
    setTabMenuPos({
      x: Math.min(e.clientX, window.innerWidth - 176),
      y: Math.min(e.clientY, window.innerHeight - 280),
    });
  };

  const handleSetDragStart = (e: React.DragEvent, setName: string) => {
    setDragSetName(setName);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleSetDragOver = (e: React.DragEvent, setName: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragSetName && dragSetName !== setName) {
      setDragOverSetName(setName);
    }
  };

  const handleSetDragEnd = () => {
    setDragSetName(null);
    setDragOverSetName(null);
  };

  const handleReorderSet = async (setName: string, direction: 'left' | 'right') => {
    const idx = sets.indexOf(setName);
    if (idx === -1) return;
    const targetIdx = direction === 'left' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= sets.length) return;
    const newOrder = [...sets];
    newOrder.splice(idx, 1);
    newOrder.splice(targetIdx, 0, setName);
    setSets(newOrder);
    setTabMenuOpen(null);
    try {
      await apiFetch(`${serverUrl}/api/sets/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: newOrder }),
      });
      setSuccessToast('Set order updated');
    } catch (err) {
      console.warn('[useSetTabs] reorder set failed:', err);
      refreshTokens();
    }
  };

  const handleSetDrop = async (e: React.DragEvent, targetSetName: string) => {
    e.preventDefault();
    if (!dragSetName || dragSetName === targetSetName) { handleSetDragEnd(); return; }
    const fromIdx = sets.indexOf(dragSetName);
    const toIdx = sets.indexOf(targetSetName);
    if (fromIdx === -1 || toIdx === -1) { handleSetDragEnd(); return; }
    const newOrder = [...sets];
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, dragSetName);
    setDragSetName(null);
    setDragOverSetName(null);
    setSets(newOrder);
    try {
      await apiFetch(`${serverUrl}/api/sets/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: newOrder }),
      });
      setSuccessToast('Set order updated');
    } catch (err) {
      console.warn('[useSetTabs] set drop reorder failed:', err);
      refreshTokens();
    }
  };

  const handleCreateSet = async () => {
    const name = newSetName.trim();
    if (!name) { setNewSetError('Name cannot be empty'); return; }
    if (!SET_NAME_RE.test(name)) { setNewSetError('Use letters, numbers, - and _ (/ for folders)'); return; }
    if (!connected) { setCreatingSet(false); return; }
    try {
      await apiFetch(`${serverUrl}/api/sets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
        signal: AbortSignal.any([AbortSignal.timeout(5000), getDisconnectSignal()]),
      });
      setCreatingSet(false);
      setNewSetName('');
      setNewSetError('');
      refreshTokens();
      setSuccessToast(`Created set "${name}"`);
    } catch (err) {
      if (isNetworkError(err)) {
        markDisconnected();
        setCreatingSet(false);
        setNewSetName('');
        setNewSetError('');
      } else {
        setNewSetError(err instanceof Error ? err.message : 'Network error');
      }
    }
  };

  return {
    dragSetName,
    dragOverSetName,
    tabMenuOpen, setTabMenuOpen,
    tabMenuPos,
    tabMenuRef,
    creatingSet, setCreatingSet,
    newSetName, setNewSetName,
    newSetError, setNewSetError,
    newSetInputRef,
    setTabsScrollRef,
    setTabsOverflow,
    cascadeDiff,
    openSetMenu,
    handleSetDragStart,
    handleSetDragOver,
    handleSetDragEnd,
    handleSetDrop,
    handleReorderSet,
    handleCreateSet,
    scrollSetTabs,
    checkSetTabsOverflow,
  };
}
