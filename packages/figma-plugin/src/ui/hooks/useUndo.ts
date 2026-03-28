import { useState, useCallback, useRef, useEffect } from 'react';

export interface UndoSlot {
  description: string;
  restore: () => Promise<void>;
  redo?: () => Promise<void>;
}

const DEFAULT_MAX_HISTORY = 20;

export function useUndo(maxHistory: number = DEFAULT_MAX_HISTORY, onError?: (message: string) => void) {
  const limit = Math.max(1, Math.min(200, Math.round(maxHistory)));
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
      return next.length > limit ? next.slice(next.length - limit) : next;
    });
    setFuture([]);
    setDismissed(false);
  }, []);

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const executeUndo = useCallback(async () => {
    if (executingRef.current) return;
    const p = pastRef.current;
    if (p.length === 0) return;
    const slot = p[p.length - 1];
    executingRef.current = true;
    try {
      await slot.restore();
      // Only remove from stack after successful restore
      setPast(prev => prev.filter(s => s !== slot));
      if (slot.redo) {
        setFuture(f => [...f, slot]);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onErrorRef.current?.(`Undo failed: ${msg}`);
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
    executingRef.current = true;
    try {
      await slot.redo!();
      // Only move between stacks after successful redo
      setFuture(prev => prev.filter(s => s !== slot));
      setPast(p => [...p, slot]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onErrorRef.current?.(`Redo failed: ${msg}`);
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
