import { useState, useCallback, useRef } from 'react';

export interface ToastItem {
  id: number;
  message: string;
  variant: 'success' | 'error';
}

export function useToastStack() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const pushSuccess = useCallback((message: string) => {
    const id = nextId.current++;
    setToasts(prev => [...prev, { id, message, variant: 'success' }]);
  }, []);

  const pushError = useCallback((message: string) => {
    const id = nextId.current++;
    setToasts(prev => [...prev, { id, message, variant: 'error' }]);
  }, []);

  return { toasts, dismiss, pushSuccess, pushError };
}
