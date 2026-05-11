import { useEffect, useRef } from "react";
import {
  Check,
  CircleAlert,
  Info,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
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
    <div className="fixed bottom-4 left-3 right-3 z-50 flex flex-col gap-1.5 pointer-events-none sm:left-14">
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
      className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-md bg-[var(--color-figma-text)] px-3 py-2 text-body text-[color:var(--color-figma-bg)] shadow-[var(--shadow-popover)] animate-toast-in"
    >
      <span className="min-w-0 flex-1 break-words">{undoLabel}</span>
      <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          title={`Undo (${modKey}Z)`}
          className="shrink-0 rounded bg-white/20 px-2 py-0.5 font-medium text-secondary transition-colors hover:bg-white/30 disabled:cursor-default disabled:opacity-30 disabled:hover:bg-white/20"
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
          className="shrink-0 rounded bg-white/20 px-2 py-0.5 font-medium text-secondary transition-colors hover:bg-white/30 disabled:cursor-default disabled:opacity-30 disabled:hover:bg-white/20"
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
          className="shrink-0 rounded p-0.5 text-white/60 transition-colors hover:bg-white/20 hover:text-white"
        >
          <X size={10} strokeWidth={1.8} aria-hidden />
        </button>
      </div>
    </div>
  );
}

/* ---- Message row (supports all toast variants) ---- */

const TOAST_ICON: Record<
  ToastItem["variant"],
  { Icon: LucideIcon; cls: string }
> = {
  success: {
    Icon: Check,
    cls: "text-[color:var(--color-figma-text-success)]",
  },
  error: {
    Icon: CircleAlert,
    cls: "text-[color:var(--color-figma-text-error)]",
  },
  warning: {
    Icon: TriangleAlert,
    cls: "text-[color:var(--color-figma-text-warning)]",
  },
  info: {
    Icon: Info,
    cls: "text-[color:var(--color-figma-text-accent)]",
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
  const timeout = toast.action || toast.secondaryAction
    ? null
    : toast.variant === "error"
      ? null
      : toast.variant === "warning"
        ? 8000
        : 4500;
  const liveRole = toast.variant === "error" ? "alert" : "status";
  const livePriority = toast.variant === "error" ? "assertive" : "polite";

  useEffect(() => {
    if (timeout === null) return;
    timerRef.current = setTimeout(() => onDismiss(toast.id), timeout);
    return () => clearTimeout(timerRef.current);
  }, [toast.id, toast.message, timeout, onDismiss]);

  const iconCfg = TOAST_ICON[toast.variant] ?? TOAST_ICON.info;
  const ToastIcon = iconCfg.Icon;
  const secondaryAction = toast.secondaryAction;
  const primaryAction = toast.action;

  return (
    <div
      role={liveRole}
      aria-live={livePriority}
      className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-md bg-[var(--color-figma-text)] px-3 py-2 text-body text-[color:var(--color-figma-bg)] shadow-[var(--shadow-popover)] animate-toast-in"
    >
      <ToastIcon
        size={12}
        strokeWidth={2.5}
        aria-hidden="true"
        className={`shrink-0 ${iconCfg.cls}`}
      />
      <span className="min-w-0 flex-1 break-words">
        {toast.message}
      </span>
      <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
        {secondaryAction ? (
          <button
            onClick={() => {
              secondaryAction.onClick();
              onDismiss(toast.id);
            }}
            className="shrink-0 rounded px-2 py-0.5 text-secondary text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            {secondaryAction.label}
          </button>
        ) : null}
        {primaryAction ? (
          <button
            onClick={() => {
              primaryAction.onClick();
              onDismiss(toast.id);
            }}
            className="shrink-0 rounded bg-[var(--color-figma-action-bg)] px-2 py-0.5 font-medium text-secondary text-[color:var(--color-figma-text-onbrand)] transition-colors hover:brightness-110"
          >
            {primaryAction.label}
          </button>
        ) : null}
        <button
          onClick={() => onDismiss(toast.id)}
          aria-label="Dismiss"
          className="shrink-0 rounded p-0.5 text-white/60 transition-colors hover:bg-white/20 hover:text-white"
        >
          <X size={10} strokeWidth={1.8} aria-hidden />
        </button>
      </div>
    </div>
  );
}
