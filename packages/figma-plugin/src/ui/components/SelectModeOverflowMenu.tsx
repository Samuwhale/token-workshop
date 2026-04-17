import { useState, useEffect, useRef } from "react";

export interface SelectModeOverflowMenuProps {
  selectedPaths: Set<string>;
  collectionIds: string[];
  operationLoading: string | null;
  copyFeedback: boolean;
  copyCssFeedback: boolean;
  copyAliasFeedback: boolean;
  onCopyJson: () => void;
  onCopyCssVar: () => void;
  onCopyDtcgRef: () => void;
  onMoveToGroup: () => void;
  onMoveToCollection: () => void;
  onCopyToCollection: () => void;
  onCompare?: () => void;
  onLinkToTokens: () => void;
}

export function SelectModeOverflowMenu({
  selectedPaths,
  collectionIds,
  operationLoading,
  copyFeedback,
  copyCssFeedback,
  copyAliasFeedback,
  onCopyJson,
  onCopyCssVar,
  onCopyDtcgRef,
  onMoveToGroup,
  onMoveToCollection,
  onCopyToCollection,
  onCompare,
  onLinkToTokens,
}: SelectModeOverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const menuItemClass =
    "w-full flex items-center gap-2 px-2.5 py-1 text-left text-[10px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors disabled:cursor-not-allowed disabled:opacity-40";
  const sectionBorder = "border-t border-[var(--color-figma-border)] mt-1 pt-1";
  const sectionLabel =
    "px-2.5 pt-1.5 pb-0.5 text-[9px] font-semibold text-[var(--color-figma-text-tertiary)]";

  return (
    <div className="relative shrink-0" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`inline-flex items-center justify-center rounded px-1.5 py-1 transition-colors ${
          open
            ? "bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text)]"
            : "text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
        }`}
        title="More actions"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-1 w-[160px] overflow-hidden rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] py-1 shadow-xl"
          role="menu"
        >
          <div className={sectionLabel}>Copy</div>
          <button type="button" role="menuitem" onClick={() => { onCopyJson(); setOpen(false); }} className={menuItemClass}>
            <span aria-live="polite">{copyFeedback ? "Copied!" : "JSON"}</span>
          </button>
          <button type="button" role="menuitem" onClick={() => { onCopyCssVar(); setOpen(false); }} className={menuItemClass}>
            <span aria-live="polite">{copyCssFeedback ? "Copied!" : "CSS var"}</span>
          </button>
          <button type="button" role="menuitem" onClick={() => { onCopyDtcgRef(); setOpen(false); }} className={menuItemClass}>
            <span aria-live="polite" className="font-mono">{copyAliasFeedback ? "Copied!" : "{ref}"}</span>
          </button>

          <div className={sectionBorder}>
            <div className={sectionLabel}>Organize</div>
          </div>
          <button type="button" role="menuitem" onClick={() => { onMoveToGroup(); setOpen(false); }} disabled={!!operationLoading} className={menuItemClass}>
            Move to group...
          </button>
          {collectionIds.length > 1 && (
            <>
              <button type="button" role="menuitem" onClick={() => { onMoveToCollection(); setOpen(false); }} disabled={!!operationLoading} className={menuItemClass}>
                Move to collection...
              </button>
              <button type="button" role="menuitem" onClick={() => { onCopyToCollection(); setOpen(false); }} disabled={!!operationLoading} className={menuItemClass}>
                Copy to collection...
              </button>
            </>
          )}

          <div className={sectionBorder}>
            <div className={sectionLabel}>Analyze</div>
          </div>
          {onCompare && (
            <button type="button" role="menuitem" onClick={() => { onCompare(); setOpen(false); }} className={menuItemClass}>
              Compare {selectedPaths.size}
            </button>
          )}
          <button type="button" role="menuitem" onClick={() => { onLinkToTokens(); setOpen(false); }} className={menuItemClass}>
            Alias
          </button>
        </div>
      )}
    </div>
  );
}
