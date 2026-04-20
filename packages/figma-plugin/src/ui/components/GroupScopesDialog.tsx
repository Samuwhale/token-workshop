import type { Dispatch, SetStateAction } from "react";
import { ConfirmModal } from "./ConfirmModal";

const FIGMA_SCOPES = [
  { label: "Fill Color", value: "FILL_COLOR" },
  { label: "Stroke Color", value: "STROKE_COLOR" },
  { label: "Text Fill", value: "TEXT_FILL" },
  { label: "Effect Color", value: "EFFECT_COLOR" },
  { label: "Width & Height", value: "WIDTH_HEIGHT" },
  { label: "Gap / Spacing", value: "GAP" },
  { label: "Corner Radius", value: "CORNER_RADIUS" },
  { label: "Opacity", value: "OPACITY" },
  { label: "Font Size", value: "FONT_SIZE" },
  { label: "Font Family", value: "FONT_FAMILY" },
] as const;

interface GroupScopesDialogProps {
  scopesSelected: string[];
  setScopesSelected: Dispatch<SetStateAction<string[]>>;
  applying: boolean;
  progress: { done: number; total: number } | null;
  error: string | null;
  onApply: () => void;
  onClose: () => void;
}

export function GroupScopesDialog({
  scopesSelected,
  setScopesSelected,
  applying,
  progress,
  error,
  onApply,
  onClose,
}: GroupScopesDialogProps) {
  return (
    <ConfirmModal
      title="Set Figma Scopes"
      confirmLabel={
        applying
          ? progress && progress.total > 0
            ? `Applying\u2026 ${progress.done}/${progress.total}`
            : "Applying\u2026"
          : "Apply to group"
      }
      cancelLabel="Cancel"
      confirmDisabled={applying}
      onConfirm={onApply}
      onCancel={onClose}
      wide
    >
      <div className="mt-3 flex flex-col gap-1.5">
        {FIGMA_SCOPES.map((scope) => (
          <label
            key={scope.value}
            className="flex items-center gap-2 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={scopesSelected.includes(scope.value)}
              onChange={(e) =>
                setScopesSelected((prev) =>
                  e.target.checked
                    ? [...prev, scope.value]
                    : prev.filter((s) => s !== scope.value),
                )
              }
              className="w-3 h-3 rounded"
            />
            <span className="text-body text-[var(--color-figma-text)]">
              {scope.label}
            </span>
          </label>
        ))}
      </div>
      {error && (
        <p className="mt-2 text-secondary text-[var(--color-figma-error)]">
          {error}
        </p>
      )}
    </ConfirmModal>
  );
}
