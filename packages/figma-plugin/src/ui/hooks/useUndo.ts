import { useState, useCallback, useRef, useEffect } from 'react';

export interface UndoSlot {
  description: string;
  restore: () => Promise<void>;
  redo?: () => Promise<void>;
}

const MAX_HISTORY = 20;

export function useUndo() {
  // past[last] = most recent undoable action
  const [past, setPast] = useState<UndoSlot[]>([]);
  // future[last] = most recent redoable action (from an undo)
  const [future, setFuture] = useState<UndoSlot[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const executingRef = useRef(false);
  const pastRef = useRef(past);
  pastRef.current = past;
  const futureRef = useRef(future);
  futureRef.current = future;

  const pushUndo = useCallback((slot: UndoSlot) => {
    setPast(prev => {
      const next = [...prev, slot];
      return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
    });
    setFuture([]);
    setDismissed(false);
  }, []);

  const executeUndo = useCallback(async () => {
    if (executingRef.current) return;
    const p = pastRef.current;
    if (p.length === 0) return;
    const slot = p[p.length - 1];
    const next = p.slice(0, -1);
    executingRef.current = true;
    setPast(next);
    if (slot.redo) {
      setFuture(f => [...f, slot]);
    }
    try {
      await slot.restore();
    } finally {
      executingRef.current = false;
    }
  }, []);

  const executeRedo = useCallback(async () => {
    if (executingRef.current) return;
    const f = futureRef.current;
    if (f.length === 0) return;
    const slot = f[f.length - 1];
    if (!slot.redo) return;
    const next = f.slice(0, -1);
    executingRef.current = true;
    setFuture(next);
    setPast(p => [...p, slot]);
    try {
      await slot.redo!();
    } finally {
      executingRef.current = false;
    }
  }, []);

  const dismissToast = useCallback(() => {
    setDismissed(true);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === 'z' && !e.shiftKey) {
        if (pastRef.current.length > 0) {
          e.preventDefault();
          executeUndo();
        }
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        if (futureRef.current.length > 0) {
          e.preventDefault();
          executeRedo();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [executeUndo, executeRedo]);

  const canUndo = past.length > 0;
  const canRedo = future.length > 0;
  const toastVisible = !dismissed && (canUndo || canRedo);
  const slot = canUndo ? past[past.length - 1] : null;
  const redoSlot = canRedo ? future[future.length - 1] : null;

  return { toastVisible, slot, canUndo, pushUndo, executeUndo, executeRedo, dismissToast, canRedo, redoSlot, undoCount: past.length };
}
