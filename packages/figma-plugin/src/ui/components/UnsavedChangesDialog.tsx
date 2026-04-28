import { useEffect, useRef } from "react";
import { Spinner } from "./Spinner";
import { useFocusTrap } from "../hooks/useFocusTrap";

interface UnsavedChangesDialogProps {
  canSave: boolean;
  busyAction: "save" | "discard" | null;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

export function UnsavedChangesDialog({
  canSave,
  busyAction,
  onSave,
  onDiscard,
  onCancel,
}: UnsavedChangesDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape" && busyAction === null) {
        onCancel();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [busyAction, onCancel]);

  const controlsDisabled = busyAction !== null;

  return (
    <div
      className="tm-modal-shell"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !controlsDisabled) {
          onCancel();
        }
      }}
    >
      <div
        ref={dialogRef}
        className="tm-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="unsaved-changes-title"
        aria-describedby="unsaved-changes-description"
      >
        <div className="tm-modal-header">
          <h3
            id="unsaved-changes-title"
            className="text-heading font-semibold text-[var(--color-figma-text)]"
          >
            Unsaved changes
          </h3>
          <p
            id="unsaved-changes-description"
            className="mt-1.5 text-body leading-relaxed text-[var(--color-figma-text-secondary)]"
          >
            Your edits have not been saved and will be lost if you leave.
          </p>
        </div>
        <div className="tm-modal-footer pt-0">
          {canSave && (
            <button
              type="button"
              onClick={onSave}
              disabled={controlsDisabled}
              className="flex w-full items-center justify-center gap-1.5 rounded bg-[var(--color-figma-accent)] px-3 py-1.5 text-body font-medium text-white hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50"
            >
              {busyAction === "save" && <Spinner size="sm" className="text-white" />}
              {busyAction === "save" ? "Saving…" : "Save"}
            </button>
          )}
          <button
            type="button"
            onClick={onDiscard}
            disabled={controlsDisabled}
            className="flex w-full items-center justify-center gap-1.5 rounded border border-[var(--color-figma-border)] px-3 py-1.5 text-body font-medium text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10 disabled:opacity-50"
          >
            {busyAction === "discard" && (
              <Spinner size="sm" className="text-[var(--color-figma-error)]" />
            )}
            {busyAction === "discard" ? "Discarding…" : "Discard changes"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={controlsDisabled}
            className="w-full rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-1.5 text-body font-medium text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-50"
          >
            Keep editing
          </button>
        </div>
      </div>
    </div>
  );
}
