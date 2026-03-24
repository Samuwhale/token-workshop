import { useState, useEffect, useRef, useCallback } from 'react';

export interface UndoSlot {
  description: string;
  restore: () => Promise<void>;
}

export function useUndo() {
  const [slot, setSlot] = useState<UndoSlot | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const pushUndo = useCallback((newSlot: UndoSlot) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setSlot(newSlot);
    setToastVisible(true);
    timerRef.current = setTimeout(() => setToastVisible(false), 8000);
  }, []);

  const executeUndo = useCallback(async () => {
    if (!slot) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    setToastVisible(false);
    const s = slot;
    setSlot(null);
    await s.restore();
  }, [slot]);

  const dismissToast = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToastVisible(false);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && slot) {
        e.preventDefault();
        executeUndo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [slot, executeUndo]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { toastVisible, slot, pushUndo, executeUndo, dismissToast };
}
