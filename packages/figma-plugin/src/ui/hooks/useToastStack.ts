import { useState, useCallback, useRef } from "react";
import type { ToastVariant } from "../shared/toastBus";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
  action?: ToastAction;
}

export interface NotificationEntry {
  id: number;
  message: string;
  variant: ToastVariant;
  timestamp: number;
}

const MAX_HISTORY = 10;

export function useToastStack() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [history, setHistory] = useState<NotificationEntry[]>([]);
  const nextId = useRef(1);

  const addToHistory = useCallback((message: string, variant: ToastVariant) => {
    const entry: NotificationEntry = {
      id: nextId.current,
      message,
      variant,
      timestamp: Date.now(),
    };
    setHistory((prev) => [entry, ...prev].slice(0, MAX_HISTORY));
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    (message: string, variant: ToastVariant) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, message, variant }]);
      addToHistory(message, variant);
    },
    [addToHistory],
  );

  const pushSuccess = useCallback(
    (message: string) => {
      pushToast(message, "success");
    },
    [pushToast],
  );

  const pushWarning = useCallback(
    (message: string) => {
      pushToast(message, "warning");
    },
    [pushToast],
  );

  const pushError = useCallback(
    (message: string) => {
      pushToast(message, "error");
    },
    [pushToast],
  );

  const pushAction = useCallback(
    (message: string, action: ToastAction) => {
      const id = nextId.current++;
      setToasts((prev) => [
        ...prev,
        { id, message, variant: "success", action },
      ]);
      addToHistory(message, "success");
      return id;
    },
    [addToHistory],
  );

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  return {
    toasts,
    dismiss,
    pushSuccess,
    pushWarning,
    pushError,
    pushAction,
    history,
    clearHistory,
  };
}
