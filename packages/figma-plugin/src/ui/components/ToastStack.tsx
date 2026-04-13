import { useEffect, useRef } from "react";
import type { ToastItem } from "../hooks/useToastStack";
import { modKey, shiftKey } from "../shared/utils";

interface ToastStackProps {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
  /** Undo toast rendered at the bottom of the stack (managed by useUndo) */
  undoToast?: {
    visible: boolean;
    description: string | null;
    onUndo: () => void;
    onDismiss: () => void;
    canUndo: boolean;
    canRedo: boolean;
    redoDescription?: string;
    onRedo: () => void;
    undoCount: number;
  };
}

const MAX_VISIBLE = 5;

export function ToastStack({ toasts, onDismiss, undoToast }: ToastStackProps) {
  const visible = toasts.slice(-MAX_VISIBLE);
  const hasUndo = undoToast?.visible;
  const hasAny = visible.length > 0 || hasUndo;

  if (!hasAny) return null;

  return (
    <div className="fixed bottom-4 left-3 right-3 z-50 flex flex-col gap-1.5 pointer-events-none">
      {hasUndo && undoToast && (
        <UndoRow
          description={undoToast.description}
          onUndo={undoToast.onUndo}
          onDismiss={undoToast.onDismiss}
          canUndo={undoToast.canUndo}
          canRedo={undoToast.canRedo}
          redoDescription={undoToast.redoDescription}
          onRedo={undoToast.onRedo}
          undoCount={undoToast.undoCount}
        />
      )}
      {visible.map((toast) => (
        <MessageRow key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

/* ---- Undo row ---- */

function UndoRow({
  description,
  onUndo,
  onDismiss,
  canUndo,
  canRedo,
  redoDescription,
  onRedo,
  undoCount,
}: {
  description: string | null;
  onUndo: () => void;
  onDismiss: () => void;
  canUndo: boolean;
  canRedo: boolean;
  redoDescription?: string;
  onRedo: () => void;
  undoCount: number;
}) {
  const undoLabel =
    undoCount > 1 ? `${undoCount} actions` : (description ?? redoDescription);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto flex items-center gap-2 px-3 py-2 rounded-md bg-[var(--color-figma-text)] text-[var(--color-figma-bg)] text-[11px] shadow-lg animate-toast-in"
    >
      <span className="flex-1 truncate min-w-0">{undoLabel}</span>
      <button
        onClick={onUndo}
        disabled={!canUndo}
        title={`Undo (${modKey}Z)`}
        className="shrink-0 px-2 py-0.5 rounded font-medium text-[10px] transition-colors disabled:opacity-30 disabled:cursor-default bg-white/20 hover:bg-white/30 disabled:hover:bg-white/20"
      >
        Undo
        <kbd className="ml-1 opacity-50 font-normal">{modKey}Z</kbd>
      </button>
      <button
        onClick={onRedo}
        disabled={!canRedo}
        title={
          redoDescription
            ? `Redo: ${redoDescription} (${modKey}${shiftKey}Z)`
            : `Redo (${modKey}${shiftKey}Z)`
        }
        className="shrink-0 px-2 py-0.5 rounded font-medium text-[10px] transition-colors disabled:opacity-30 disabled:cursor-default bg-white/20 hover:bg-white/30 disabled:hover:bg-white/20"
      >
        Redo
        <kbd className="ml-1 opacity-50 font-normal">
          {modKey}
          {shiftKey}Z
        </kbd>
      </button>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 p-0.5 rounded hover:bg-white/20 text-white/60 hover:text-white transition-colors"
      >
        <svg
          width="8"
          height="8"
          viewBox="0 0 8 8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <path d="M1 1l6 6M7 1L1 7" />
        </svg>
      </button>
    </div>
  );
}

/* ---- Message row (supports all toast variants) ---- */

const TOAST_ICON: Record<string, { cls: string; d: string; extra?: string }> = {
  success: { cls: "text-green-400", d: "M20 6L9 17l-5-5" },
  error: {
    cls: "text-red-400",
    d: "M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z",
  },
  warning: {
    cls: "text-amber-400",
    d: "M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z",
  },
  info: {
    cls: "text-blue-400",
    d: "M12 16v-4M12 8h.01",
    extra: "M22 12A10 10 0 1 1 2 12a10 10 0 0 1 20 0z",
  },
};

function MessageRow({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: (id: number) => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  // Action toasts persist until explicitly dismissed or clicked
  const timeout = toast.action
    ? null
    : toast.variant === "error"
      ? 8000
      : toast.variant === "warning"
        ? 5000
        : 4500;

  useEffect(() => {
    if (timeout === null) return;
    timerRef.current = setTimeout(() => onDismiss(toast.id), timeout);
    return () => clearTimeout(timerRef.current);
  }, [toast.id, toast.message, timeout, onDismiss]);

  const iconCfg = TOAST_ICON[toast.variant] ?? TOAST_ICON.info;
  const iconEl = (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${iconCfg.cls}`}
    >
      {iconCfg.extra && <path d={iconCfg.extra} />}
      <path d={iconCfg.d} />
    </svg>
  );

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto flex items-center gap-2 px-3 py-2 rounded-md bg-[var(--color-figma-text)] text-[var(--color-figma-bg)] text-[11px] shadow-lg animate-toast-in"
    >
      {iconEl}
      <span className="flex-1 min-w-0 break-words line-clamp-3">
        {toast.message}
      </span>
      {toast.action && (
        <button
          onClick={() => {
            toast.action!.onClick();
            onDismiss(toast.id);
          }}
          className="shrink-0 px-2 py-0.5 rounded font-medium text-[10px] transition-colors bg-[var(--color-figma-accent)] text-white hover:brightness-110"
        >
          {toast.action.label}
        </button>
      )}
      <button
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss"
        className="shrink-0 p-0.5 rounded hover:bg-white/20 text-white/60 hover:text-white transition-colors"
      >
        <svg
          width="8"
          height="8"
          viewBox="0 0 8 8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <path d="M1 1l6 6M7 1L1 7" />
        </svg>
      </button>
    </div>
  );
}
