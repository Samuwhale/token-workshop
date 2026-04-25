import { Copy, Trash2, X } from "lucide-react";

interface SelectionActionBarProps {
  tokens: { path: string; collectionId: string }[];
  onClear: () => void;
  onCopyPaths?: () => void;
  onDelete?: () => void;
}

export function SelectionActionBar({
  tokens,
  onClear,
  onCopyPaths,
  onDelete,
}: SelectionActionBarProps) {
  return (
    <div className="pointer-events-auto absolute left-1/2 top-3 z-30 flex -translate-x-1/2 items-center gap-1 rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-secondary text-[var(--color-figma-text)] shadow-lg">
      <span className="px-1 text-[var(--color-figma-text-secondary)]">
        {tokens.length} selected
      </span>
      <span className="h-3 w-px bg-[var(--color-figma-border)]" aria-hidden />
      {onCopyPaths ? (
        <button
          type="button"
          onClick={onCopyPaths}
          className="flex items-center gap-1 rounded px-2 py-1 hover:bg-[var(--color-figma-bg-hover)]"
        >
          <Copy size={10} strokeWidth={2} aria-hidden />
          Copy paths
        </button>
      ) : null}
      {onDelete ? (
        <button
          type="button"
          onClick={onDelete}
          className="flex items-center gap-1 rounded px-2 py-1 text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10"
        >
          <Trash2 size={10} strokeWidth={2} aria-hidden />
          Delete
        </button>
      ) : null}
      <button
        type="button"
        onClick={onClear}
        aria-label="Clear selection"
        className="rounded p-1 text-[var(--color-figma-text-tertiary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
      >
        <X size={10} strokeWidth={2} aria-hidden />
      </button>
    </div>
  );
}
