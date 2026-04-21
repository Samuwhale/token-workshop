import { useState, useCallback, useRef } from "react";
import type {
  NotificationDestination,
  ToastAction,
  ToastVariant,
} from "../shared/toastBus";

export interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
  action?: ToastAction;
  destination?: NotificationDestination;
}

export interface NotificationEntry {
  id: number;
  message: string;
  variant: ToastVariant;
  timestamp: number;
  destination?: NotificationDestination;
}

const MAX_HISTORY = 10;

export function useToastStack() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [history, setHistory] = useState<NotificationEntry[]>([]);
  const nextId = useRef(1);

  const addToHistory = useCallback(
    (
      message: string,
      variant: ToastVariant,
      destination?: NotificationDestination,
    ) => {
      const entry: NotificationEntry = {
        id: nextId.current,
        message,
        variant,
        timestamp: Date.now(),
        destination,
      };
      setHistory((prev) => [entry, ...prev].slice(0, MAX_HISTORY));
    },
    [],
  );

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    (
      message: string,
      variant: ToastVariant,
      destination?: NotificationDestination,
    ) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, message, variant, destination }]);
      addToHistory(message, variant, destination);
    },
    [addToHistory],
  );

  const pushSuccess = useCallback(
    (message: string, destination?: NotificationDestination) => {
      pushToast(message, "success", destination);
    },
    [pushToast],
  );

  const pushWarning = useCallback(
    (message: string, destination?: NotificationDestination) => {
      pushToast(message, "warning", destination);
    },
    [pushToast],
  );

  const pushError = useCallback(
    (message: string, destination?: NotificationDestination) => {
      pushToast(message, "error", destination);
    },
    [pushToast],
  );

  const pushAction = useCallback(
    (
      message: string,
      action: ToastAction,
      variant: ToastVariant = "success",
      destination?: NotificationDestination,
    ) => {
      const id = nextId.current++;
      setToasts((prev) => [
        ...prev,
        { id, message, variant, action, destination },
      ]);
      addToHistory(message, variant, destination);
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
