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
    if (past.length === 0) return;
    const slot = past[past.length - 1];
    const next = past.slice(0, -1);
    executingRef.current = true;
    setPast(next);
    if (slot.redo) {
      setFuture(f => [...f, slot]);
    }
    slot.restore().finally(() => { executingRef.current = false; });
  }, [past]);

  const executeRedo = useCallback(async () => {
    if (executingRef.current) return;
    if (future.length === 0) return;
    const slot = future[future.length - 1];
    if (!slot.redo) return;
    const next = future.slice(0, -1);
    executingRef.current = true;
    setFuture(next);
    setPast(p => [...p, slot]);
    slot.redo!().finally(() => { executingRef.current = false; });
  }, [future]);

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
