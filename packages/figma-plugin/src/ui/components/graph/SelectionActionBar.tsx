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
    <div
      role="toolbar"
      aria-label="Selection actions"
      className="pointer-events-auto absolute left-1/2 top-3 z-30 flex h-7 max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-0.5 rounded-full border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] pl-3 pr-1 text-secondary text-[var(--color-figma-text)] shadow-md"
    >
      <span className="pr-2 text-[var(--color-figma-text-secondary)]">
        {tokens.length} selected
      </span>
      {onCopyPaths ? (
        <button
          type="button"
          onClick={onCopyPaths}
          className="flex h-6 items-center gap-1 rounded-full px-2 text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
          aria-label="Copy selected paths"
        >
          <Copy size={11} strokeWidth={2} aria-hidden />
          Copy paths
        </button>
      ) : null}
      {onDelete ? (
        <button
          type="button"
          onClick={onDelete}
          className="flex h-6 items-center gap-1 rounded-full px-2 text-[var(--color-figma-error)] hover:bg-[color-mix(in_srgb,var(--color-figma-error)_12%,transparent)]"
          aria-label="Delete selected tokens"
        >
          <Trash2 size={11} strokeWidth={2} aria-hidden />
          Delete
        </button>
      ) : null}
      <button
        type="button"
        onClick={onClear}
        aria-label="Clear selection"
        className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--color-figma-text-tertiary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
      >
        <X size={11} strokeWidth={2} aria-hidden />
      </button>
    </div>
  );
}
