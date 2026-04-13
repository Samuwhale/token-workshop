import { useRef, useEffect } from "react";
import { useFocusTrap } from "../../hooks/useFocusTrap";

export function SaveChangesDialog({
  canSave,
  isCreateMode,
  editPath,
  saving,
  onSave,
  onDiscard,
  onCancel,
}: {
  canSave: boolean;
  isCreateMode: boolean;
  editPath: string;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onCancel]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        className="w-[240px] rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-changes-title"
        aria-describedby="save-changes-description"
      >
        <div className="px-4 pt-4 pb-3">
          <h3
            id="save-changes-title"
            className="text-[12px] font-semibold text-[var(--color-figma-text)]"
          >
            Save changes?
          </h3>
          <p id="save-changes-description" className="mt-1.5 text-[11px] text-[var(--color-figma-text-secondary)] leading-relaxed">
            Your edits have not been saved and will be lost if you close.
          </p>
        </div>
        <div className="px-4 pb-4 flex flex-col gap-2">
          {canSave && (!isCreateMode || editPath.trim() !== "") && (
            <button
              onClick={onSave}
              disabled={saving}
              className="w-full px-3 py-1.5 rounded text-[11px] font-medium bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          )}
          <button
            onClick={onDiscard}
            className="w-full px-3 py-1.5 rounded text-[11px] font-medium text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10 border border-[var(--color-figma-border)]"
          >
            Discard
          </button>
          <button
            onClick={onCancel}
            className="w-full px-3 py-1.5 rounded text-[11px] font-medium bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
          >
            Keep editing
          </button>
        </div>
      </div>
    </div>
  );
}
