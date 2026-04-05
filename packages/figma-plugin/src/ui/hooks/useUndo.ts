import { useState, useCallback, useRef, useEffect } from 'react';

export interface UndoSlot {
  description: string;
  restore: () => Promise<void>;
  redo?: () => Promise<void>;
  /**
   * When set, consecutive pushes with the same groupKey arriving within
   * GROUP_TIMEOUT_MS are merged into a single undo entry instead of creating
   * separate entries. Useful for rapid sequential edits of the same logical type
   * (e.g. renaming several tokens in a row).
   */
  groupKey?: string;
  /**
   * Optional callback to produce a description for the merged entry.
   * Receives the number of individual operations that have been merged.
   * Defaults to the last pushed slot's description if not provided.
   */
  groupSummary?: (count: number) => string;
}

/** How long (ms) to keep the grouping window open after the last push. */
const GROUP_TIMEOUT_MS = 2000;

/** Internal slot stored in the past/future stacks — extends the public interface. */
interface InternalSlot extends UndoSlot {
  _pushedAt: number;
  _mergeCount: number;
  /** All constituent restore functions in push-order (oldest first). */
  _restores: Array<() => Promise<void>>;
  /** All constituent redo functions in push-order (oldest first). */
  _redos: Array<() => Promise<void>>;
}

const DEFAULT_MAX_HISTORY = 20;

export function useUndo(maxHistory: number = DEFAULT_MAX_HISTORY, onError?: (message: string) => void) {
  const limit = Math.max(1, Math.min(200, Math.round(maxHistory)));
  // past[last] = most recent undoable action
  const [past, setPast] = useState<InternalSlot[]>([]);
  // future[last] = most recent redoable action (from an undo)
  const [future, setFuture] = useState<InternalSlot[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const executingRef = useRef(false);
  const pastRef = useRef(past);
  pastRef.current = past;
  const futureRef = useRef(future);
  futureRef.current = future;

  const pushUndo = useCallback((slot: UndoSlot) => {
    const now = Date.now();
    setPast(prev => {
      const last = prev.length > 0 ? prev[prev.length - 1] : undefined;

      // Merge with previous entry when groupKey matches and window is still open
      if (
        slot.groupKey &&
        last?.groupKey === slot.groupKey &&
        (now - last._pushedAt) < GROUP_TIMEOUT_MS
      ) {
        const newRestores = [...last._restores, slot.restore];
        const newRedos = slot.redo ? [...last._redos, slot.redo] : last._redos;
        const newCount = last._mergeCount + 1;
        const summaryFn = slot.groupSummary ?? last.groupSummary;
        const merged: InternalSlot = {
          description: summaryFn?.(newCount) ?? slot.description,
          groupKey: slot.groupKey,
          groupSummary: summaryFn,
          restore: async () => {
            // Undo newest-first so dependent operations unwind in the right order
            for (let i = newRestores.length - 1; i >= 0; i--) {
              await newRestores[i]();
            }
          },
          redo: newRedos.length > 0
            ? async () => { for (const r of newRedos) await r(); }
            : undefined,
          _pushedAt: now,
          _mergeCount: newCount,
          _restores: newRestores,
          _redos: newRedos,
        };
        const next = [...prev.slice(0, -1), merged];
        return next.length > limit ? next.slice(next.length - limit) : next;
      }

      // Regular push
      const internal: InternalSlot = {
        ...slot,
        _pushedAt: now,
        _mergeCount: 1,
        _restores: [slot.restore],
        _redos: slot.redo ? [slot.redo] : [],
      };
      const next = [...prev, internal];
      return next.length > limit ? next.slice(next.length - limit) : next;
    });
    setFuture([]);
    setDismissed(false);
  }, [limit]);

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
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
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

  const undoDescriptions = past.map(s => s.description);

  return { toastVisible, slot, canUndo, pushUndo, executeUndo, executeRedo, dismissToast, canRedo, redoSlot, undoCount: past.length, undoDescriptions };
}
