import { useEffect, useRef, type ReactNode } from "react";

interface ContextDialogProps {
  x: number;
  y: number;
  ariaLabel: string;
  width?: number;
  onCancel: () => void;
  children: ReactNode;
}

const VIEWPORT_PADDING = 8;

export function ContextDialog({
  x,
  y,
  ariaLabel,
  width = 280,
  onCancel,
  children,
}: ContextDialogProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    const onPointer = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (containerRef.current.contains(event.target as Node)) return;
      onCancel();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [onCancel]);

  // Snap into the viewport: dialogs fired off the right edge would otherwise
  // clip and become unusable. We measure once on mount and adjust transform.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const overflowX = rect.right - (window.innerWidth - VIEWPORT_PADDING);
    const overflowY = rect.bottom - (window.innerHeight - VIEWPORT_PADDING);
    const dx = overflowX > 0 ? -overflowX : 0;
    const dy = overflowY > 0 ? -overflowY : 0;
    if (dx || dy) {
      el.style.transform = `translate(${dx}px, ${dy}px)`;
    }
  }, []);

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label={ariaLabel}
      style={{ left: x, top: y, width }}
      className="fixed z-50 rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] p-3 shadow-lg"
    >
      {children}
    </div>
  );
}

export function DialogActions({
  busy,
  disabled,
  cancelLabel = "Cancel",
  confirmLabel,
  busyLabel,
  onCancel,
  onConfirm,
}: {
  busy?: boolean;
  disabled?: boolean;
  cancelLabel?: string;
  confirmLabel: string;
  busyLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="mt-3 flex justify-end gap-2">
      <button
        type="button"
        onClick={onCancel}
        className="h-[26px] rounded px-2.5 text-secondary text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
      >
        {cancelLabel}
      </button>
      <button
        type="button"
        disabled={busy || disabled}
        onClick={onConfirm}
        className="h-[26px] rounded bg-[var(--color-figma-accent)] px-2.5 text-secondary font-medium text-white hover:opacity-90 disabled:opacity-40"
      >
        {busy && busyLabel ? busyLabel : confirmLabel}
      </button>
    </div>
  );
}

export function DialogError({ message }: { message: string }) {
  return (
    <div className="mt-2 text-secondary text-[var(--color-figma-error)]">
      {message}
    </div>
  );
}
