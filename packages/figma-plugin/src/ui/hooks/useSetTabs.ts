import { useState, useCallback, useRef, useEffect } from 'react';
import { apiFetch } from '../shared/apiFetch';

interface UseSetTabsParams {
  serverUrl: string;
  sets: string[];
  setSets: (sets: string[]) => void;
  activeSet: string;
  refreshTokens: () => void;
  setSuccessToast: (msg: string) => void;
  /** Source set when a token drag is in progress — enables drop zones on set tabs */
  tokenDragFromSet?: string | null;
  /** Called when tokens are dropped on a target set tab */
  onTokenDropOnSet?: (targetSet: string) => void;
}

export function useSetTabs({
  serverUrl,
  sets,
  setSets,
  activeSet,
  refreshTokens,
  setSuccessToast,
  tokenDragFromSet,
  onTokenDropOnSet,
}: UseSetTabsParams) {
  const [dragOverSetName, setDragOverSetName] = useState<string | null>(null);
  const setTabsScrollRef = useRef<HTMLDivElement>(null);
  const [setTabsOverflow, setSetTabsOverflow] = useState<{ left: boolean; right: boolean }>({ left: false, right: false });

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
    return () => {
      el.removeEventListener('scroll', checkSetTabsOverflow);
      ro.disconnect();
    };
  }, [checkSetTabsOverflow]);

  useEffect(() => {
    checkSetTabsOverflow();
  }, [sets, checkSetTabsOverflow]);

  const scrollSetTabs = useCallback((direction: 'left' | 'right') => {
    const el = setTabsScrollRef.current;
    if (!el) return;
    el.scrollBy({ left: direction === 'left' ? -120 : 120, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const container = setTabsScrollRef.current;
    if (!container) return;
    const activeEl = container.querySelector('[data-active-set="true"]') as HTMLElement | null;
    activeEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }, [activeSet]);

  const handleSetDragOver = (e: React.DragEvent, setName: string) => {
    if (!e.dataTransfer.types.includes('application/x-token-drag')) return;
    if (tokenDragFromSet && tokenDragFromSet !== setName) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDragOverSetName(setName);
    }
  };

  const handleSetDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setDragOverSetName(null);
    }
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

  const handleReorderSetFull = async (newOrder: string[]) => {
    setSets(newOrder);
    try {
      await apiFetch(`${serverUrl}/api/sets/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: newOrder }),
      });
      setSuccessToast('Set order updated');
    } catch (err) {
      console.warn('[useSetTabs] reorder set full failed:', err);
      refreshTokens();
    }
  };

  const handleSetDrop = async (e: React.DragEvent, targetSetName: string) => {
    e.preventDefault();
    setDragOverSetName(null);
    if (tokenDragFromSet && tokenDragFromSet !== targetSetName) {
      onTokenDropOnSet?.(targetSetName);
    }
  };

  return {
    dragOverSetName,
    setTabsScrollRef,
    setTabsOverflow,
    cascadeDiff: null as Record<string, { before: unknown; after: unknown }> | null,
    handleSetDragOver,
    handleSetDragLeave,
    handleSetDrop,
    handleReorderSet,
    handleReorderSetFull,
    scrollSetTabs,
  };
}
