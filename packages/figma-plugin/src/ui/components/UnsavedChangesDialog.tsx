import { useEffect, useRef } from "react";
import { Spinner } from "./Spinner";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { Button } from "../primitives/Button";

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
            <Button
              type="button"
              onClick={onSave}
              disabled={controlsDisabled}
              variant="primary"
              className="w-full"
            >
              {busyAction === "save" && <Spinner size="sm" className="text-white" />}
              {busyAction === "save" ? "Saving…" : "Save"}
            </Button>
          )}
          <Button
            type="button"
            onClick={onDiscard}
            disabled={controlsDisabled}
            variant="secondary"
            className="w-full border-[var(--color-figma-error)]/25 text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10 hover:text-[var(--color-figma-error)]"
          >
            {busyAction === "discard" && (
              <Spinner size="sm" className="text-[var(--color-figma-error)]" />
            )}
            {busyAction === "discard" ? "Discarding…" : "Discard changes"}
          </Button>
          <Button
            type="button"
            onClick={onCancel}
            disabled={controlsDisabled}
            variant="secondary"
            className="w-full bg-[var(--color-figma-bg-secondary)]"
          >
            Keep editing
          </Button>
        </div>
      </div>
    </div>
  );
}
