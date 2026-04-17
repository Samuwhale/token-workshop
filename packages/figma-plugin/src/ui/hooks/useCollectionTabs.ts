import { useState, useCallback, useRef, useEffect } from 'react';
import { apiFetch } from '../shared/apiFetch';

interface UseCollectionTabsParams {
  serverUrl: string;
  collectionIds: string[];
  setCollectionIds: (collectionIds: string[]) => void;
  currentCollectionId: string;
  refreshTokens: () => void;
  setSuccessToast: (msg: string) => void;
  tokenDragSourceCollectionId?: string | null;
  onTokenDropOnCollection?: (targetCollectionId: string) => void;
}

export function useCollectionTabs({
  serverUrl,
  collectionIds,
  setCollectionIds,
  currentCollectionId,
  refreshTokens,
  setSuccessToast,
  tokenDragSourceCollectionId,
  onTokenDropOnCollection,
}: UseCollectionTabsParams) {
  const [dragOverCollectionId, setDragOverCollectionId] = useState<string | null>(null);
  const collectionTabsScrollRef = useRef<HTMLDivElement>(null);
  const [collectionTabsOverflow, setCollectionTabsOverflow] = useState<{ left: boolean; right: boolean }>({ left: false, right: false });

  const checkCollectionTabsOverflow = useCallback(() => {
    const el = collectionTabsScrollRef.current;
    if (!el) return;
    const hasOverflow = el.scrollWidth > el.clientWidth;
    setCollectionTabsOverflow({
      left: hasOverflow && el.scrollLeft > 2,
      right: hasOverflow && el.scrollLeft < el.scrollWidth - el.clientWidth - 2,
    });
  }, []);

  useEffect(() => {
    const el = collectionTabsScrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', checkCollectionTabsOverflow);
    const ro = new ResizeObserver(checkCollectionTabsOverflow);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', checkCollectionTabsOverflow);
      ro.disconnect();
    };
  }, [checkCollectionTabsOverflow]);

  useEffect(() => {
    checkCollectionTabsOverflow();
  }, [collectionIds, checkCollectionTabsOverflow]);

  const scrollCollectionTabs = useCallback((direction: 'left' | 'right') => {
    const el = collectionTabsScrollRef.current;
    if (!el) return;
    el.scrollBy({ left: direction === 'left' ? -120 : 120, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const container = collectionTabsScrollRef.current;
    if (!container) return;
    const activeEl = container.querySelector('[data-active-collection="true"]') as HTMLElement | null;
    activeEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }, [currentCollectionId]);

  const handleCollectionDragOver = (e: React.DragEvent, collectionId: string) => {
    if (!e.dataTransfer.types.includes('application/x-token-drag')) return;
    if (tokenDragSourceCollectionId && tokenDragSourceCollectionId !== collectionId) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDragOverCollectionId(collectionId);
    }
  };

  const handleCollectionDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setDragOverCollectionId(null);
    }
  };

  const handleReorderCollection = async (collectionId: string, direction: 'left' | 'right') => {
    const idx = collectionIds.indexOf(collectionId);
    if (idx === -1) return;
    const targetIdx = direction === 'left' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= collectionIds.length) return;
    const newOrder = [...collectionIds];
    newOrder.splice(idx, 1);
    newOrder.splice(targetIdx, 0, collectionId);
    setCollectionIds(newOrder);
    try {
      await apiFetch(`${serverUrl}/api/collections/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: newOrder }),
      });
      setSuccessToast('Collection order updated');
    } catch (err) {
      console.warn('[useCollectionTabs] reorder collection failed:', err);
      refreshTokens();
    }
  };

  const handleReorderCollectionFull = async (newOrder: string[]) => {
    setCollectionIds(newOrder);
    try {
      await apiFetch(`${serverUrl}/api/collections/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: newOrder }),
      });
      setSuccessToast('Collection order updated');
    } catch (err) {
      console.warn('[useCollectionTabs] reorder collection full failed:', err);
      refreshTokens();
    }
  };

  const handleCollectionDrop = async (e: React.DragEvent, targetCollectionId: string) => {
    e.preventDefault();
    setDragOverCollectionId(null);
    if (tokenDragSourceCollectionId && tokenDragSourceCollectionId !== targetCollectionId) {
      onTokenDropOnCollection?.(targetCollectionId);
    }
  };

  return {
    dragOverCollectionId,
    collectionTabsScrollRef,
    collectionTabsOverflow,
    cascadeDiff: null as Record<string, { before: unknown; after: unknown }> | null,
    handleCollectionDragOver,
    handleCollectionDragLeave,
    handleCollectionDrop,
    handleReorderCollection,
    handleReorderCollectionFull,
    scrollCollectionTabs,
  };
}
