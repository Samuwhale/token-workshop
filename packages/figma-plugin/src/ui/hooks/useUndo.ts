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
  const executingRef = useRef(false);

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
    setPast(prev => {
      if (prev.length === 0) return prev;
      const slot = prev[prev.length - 1];
      const next = prev.slice(0, -1);
      executingRef.current = true;
      slot.restore().finally(() => { executingRef.current = false; });
      if (slot.redo) {
        setFuture(f => [...f, slot]);
      }
      return next;
    });
  }, []);

  const executeRedo = useCallback(async () => {
    if (executingRef.current) return;
    setFuture(prev => {
      if (prev.length === 0) return prev;
      const slot = prev[prev.length - 1];
      if (!slot.redo) return prev;
      const next = prev.slice(0, -1);
      executingRef.current = true;
      slot.redo!().finally(() => { executingRef.current = false; });
      setPast(p => [...p, slot]);
      return next;
    });
  }, []);

  const [dismissed, setDismissed] = useState(false);

  const dismissToast = useCallback(() => {
    setDismissed(true);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === 'z' && !e.shiftKey) {
        if (past.length > 0) {
          e.preventDefault();
          executeUndo();
        }
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        if (future.length > 0) {
          e.preventDefault();
          executeRedo();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [past, future, executeUndo, executeRedo]);

  const canUndo = past.length > 0;
  const canRedo = future.length > 0;
  const toastVisible = !dismissed && (canUndo || canRedo);
  const slot = canUndo ? past[past.length - 1] : null;
  const redoSlot = canRedo ? future[future.length - 1] : null;

  return { toastVisible, slot, canUndo, pushUndo, executeUndo, executeRedo, dismissToast, canRedo, redoSlot, undoCount: past.length };
}
