/**
 * Proactive selection strip shown at the top of the Library > Tokens section
 * whenever the user has layers selected in Figma. Surfaces the selection-aware
 * context that was previously hidden behind a filter toggle.
 */

interface LibrarySelectionStripProps {
  selectedNodeCount: number;
  boundTokenCount: number;
  inspectMode: boolean;
  onToggleInspectMode: () => void;
}

export function LibrarySelectionStrip({
  selectedNodeCount,
  boundTokenCount,
  inspectMode,
  onToggleInspectMode,
}: LibrarySelectionStripProps) {
  if (selectedNodeCount === 0) return null;

  const layerLabel = `${selectedNodeCount} layer${selectedNodeCount === 1 ? "" : "s"} selected`;
  const tokenLabel =
    boundTokenCount === 0
      ? "no bound tokens"
      : `${boundTokenCount} bound token${boundTokenCount === 1 ? "" : "s"}`;

  return (
    <div className="flex items-center gap-2 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-1 text-secondary text-[var(--color-figma-text-secondary)] shrink-0">
      <span className="truncate">
        {layerLabel} · {tokenLabel}
      </span>
      {boundTokenCount > 0 && (
        <button
          type="button"
          onClick={onToggleInspectMode}
          className="shrink-0 text-[var(--color-figma-accent)] hover:underline focus-visible:underline outline-none"
        >
          {inspectMode ? "Show all tokens" : "Show tokens used here"}
        </button>
      )}
    </div>
  );
}
