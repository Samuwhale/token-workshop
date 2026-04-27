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
          Create from source
        </div>
        <div className="max-w-56 truncate font-mono text-secondary text-[var(--color-figma-text-secondary)]">
          {sourcePath}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <ActionButton icon={<GitBranch size={12} />} label="Create alias" onClick={onCreateAlias} />
        <ActionButton
          icon={<SlidersHorizontal size={12} />}
          label="Modify..."
          onClick={onCreateModifier}
          disabled={!canModify}
        />
        <ActionButton icon={<Sparkles size={12} />} label="Generate from..." onClick={onGenerateFrom} />
      </div>
    </ContextDialog>
  );
}

function ActionButton({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex h-7 items-center gap-2 rounded px-2 text-left text-secondary text-[var(--color-figma-text)] hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:text-[var(--color-figma-text-tertiary)]"
    >
      <span className="flex h-4 w-4 items-center justify-center text-[var(--color-figma-text-tertiary)]">
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}
