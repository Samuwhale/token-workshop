import type { ReactNode } from "react";
import { GitBranch, SlidersHorizontal, Sparkles } from "lucide-react";
import { ContextDialog } from "./ContextDialog";

interface CreateFromSourcePickerProps {
  x: number;
  y: number;
  sourcePath: string;
  canModify: boolean;
  onCreateAlias: () => void;
  onCreateModifier: () => void;
  onGenerateFrom: () => void;
  onCancel: () => void;
}

export function CreateFromSourcePicker({
  x,
  y,
  sourcePath,
  canModify,
  onCreateAlias,
  onCreateModifier,
  onGenerateFrom,
  onCancel,
}: CreateFromSourcePickerProps) {
  return (
    <ContextDialog
      x={x}
      y={y}
      ariaLabel="Create from source token"
      onCancel={onCancel}
    >
      <div className="mb-2 flex flex-col gap-1">
        <div className="font-medium text-[var(--color-figma-text)]">
          Make another token depend on this
        </div>
        <div className="max-w-56 truncate font-mono text-secondary text-[var(--color-figma-text-secondary)]">
          {sourcePath}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <ActionButton
          icon={<GitBranch size={12} />}
          label="Reference token"
          description="Same value, kept linked"
          onClick={onCreateAlias}
        />
        <ActionButton
          icon={<SlidersHorizontal size={12} />}
          label="Modified token"
          description="Linked value with an adjustment"
          onClick={onCreateModifier}
          disabled={!canModify}
        />
        <ActionButton
          icon={<Sparkles size={12} />}
          label="Generated group"
          description="Many managed tokens from this value"
          onClick={onGenerateFrom}
        />
      </div>
    </ContextDialog>
  );
}

function ActionButton({
  icon,
  label,
  description,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  description: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-9 items-start gap-2 rounded px-2 py-1.5 text-left text-secondary text-[var(--color-figma-text)] hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:text-[var(--color-figma-text-tertiary)]"
    >
      <span className="mt-0.5 flex h-4 w-4 items-center justify-center text-[var(--color-figma-text-tertiary)]">
        {icon}
      </span>
      <span className="min-w-0 flex flex-col">
        <span>{label}</span>
        <span className="text-[10px] leading-tight text-[var(--color-figma-text-tertiary)]">
          {description}
        </span>
      </span>
    </button>
  );
}
