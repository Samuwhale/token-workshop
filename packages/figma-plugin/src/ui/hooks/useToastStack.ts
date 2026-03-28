import { useState, useCallback, useRef } from 'react';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastItem {
  id: number;
  message: string;
  variant: 'success' | 'error';
  action?: ToastAction;
}

export interface NotificationEntry {
  id: number;
  message: string;
  variant: 'success' | 'error';
  timestamp: number;
}

const MAX_HISTORY = 10;

export function useToastStack() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [history, setHistory] = useState<NotificationEntry[]>([]);
  const nextId = useRef(1);

  const addToHistory = useCallback((message: string, variant: 'success' | 'error') => {
    const entry: NotificationEntry = { id: nextId.current, message, variant, timestamp: Date.now() };
    setHistory(prev => [entry, ...prev].slice(0, MAX_HISTORY));
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const pushSuccess = useCallback((message: string) => {
    const id = nextId.current++;
    setToasts(prev => [...prev, { id, message, variant: 'success' }]);
    addToHistory(message, 'success');
  }, [addToHistory]);

  const pushError = useCallback((message: string) => {
    const id = nextId.current++;
    setToasts(prev => [...prev, { id, message, variant: 'error' }]);
    addToHistory(message, 'error');
  }, [addToHistory]);

  const pushAction = useCallback((message: string, action: ToastAction) => {
    const id = nextId.current++;
    setToasts(prev => [...prev, { id, message, variant: 'success', action }]);
    addToHistory(message, 'success');
    return id;
  }, [addToHistory]);

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  return { toasts, dismiss, pushSuccess, pushError, pushAction, history, clearHistory };
}
