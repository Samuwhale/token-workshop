import { SelectModeOverflowMenu } from "./SelectModeOverflowMenu";

export interface SelectModeToolbarProps {
  selectedPaths: Set<string>;
  displayedLeafPaths: Set<string>;
  collectionIds: string[];
  operationLoading: string | null;
  showBatchEditor: boolean;
  copyFeedback: boolean;
  copyCssFeedback: boolean;
  copyAliasFeedback: boolean;
  onSelectAll: () => void;
  onToggleBatchEditor: () => void;
  onRequestBulkDelete: () => void;
  onExitSelectMode: () => void;
  onCopyJson: () => void;
  onCopyCssVar: () => void;
  onCopyDtcgRef: () => void;
  onMoveToGroup: () => void;
  onMoveToCollection: () => void;
  onCopyToCollection: () => void;
  onCompare?: () => void;
  onLinkToTokens: () => void;
  searchQuery?: string;
}

export function SelectModeToolbar({
  selectedPaths,
  displayedLeafPaths,
  collectionIds,
  operationLoading,
  showBatchEditor,
  copyFeedback,
  copyCssFeedback,
  copyAliasFeedback,
  onSelectAll,
  onToggleBatchEditor,
  onRequestBulkDelete,
  onExitSelectMode,
  onCopyJson,
  onCopyCssVar,
  onCopyDtcgRef,
  onMoveToGroup,
  onMoveToCollection,
  onCopyToCollection,
  onCompare,
  onLinkToTokens,
  searchQuery,
}: SelectModeToolbarProps) {
  return (
    <div className="flex items-center gap-1 px-1 py-px border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
      <input
        type="checkbox"
        checked={displayedLeafPaths.size > 0 && [...displayedLeafPaths].every((p) => selectedPaths.has(p))}
        ref={(el) => {
          if (el) el.indeterminate = selectedPaths.size > 0 && selectedPaths.size < displayedLeafPaths.size;
        }}
        onChange={onSelectAll}
        aria-label="Toggle select all"
        aria-describedby="select-mode-count"
        className="shrink-0 accent-[var(--color-figma-accent)]"
      />
      <span id="select-mode-count" className="text-[10px] text-[var(--color-figma-text-secondary)] flex-1 truncate">
        {selectedPaths.size}/{displayedLeafPaths.size}
        {searchQuery ? ` matching "${searchQuery}"` : ""}
      </span>
      {selectedPaths.size > 0 && (
        <>
          <button
            onClick={onToggleBatchEditor}
            className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${showBatchEditor ? "bg-[var(--color-figma-accent)] text-white" : "bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)]"}`}
          >
            Batch
          </button>
          <button
            onClick={onRequestBulkDelete}
            disabled={!!operationLoading}
            className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10 transition-colors disabled:opacity-50 disabled:pointer-events-none"
          >
            Delete
          </button>
        </>
      )}
      <button
        onClick={onExitSelectMode}
        className="shrink-0 px-1.5 py-0.5 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
        aria-label="Exit select mode"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
          <path d="M2 2l6 6M8 2l-6 6" />
        </svg>
      </button>
      {selectedPaths.size > 0 && (
        <SelectModeOverflowMenu
          selectedPaths={selectedPaths}
          collectionIds={collectionIds}
          operationLoading={operationLoading}
          copyFeedback={copyFeedback}
          copyCssFeedback={copyCssFeedback}
          copyAliasFeedback={copyAliasFeedback}
          onCopyJson={onCopyJson}
          onCopyCssVar={onCopyCssVar}
          onCopyDtcgRef={onCopyDtcgRef}
          onMoveToGroup={onMoveToGroup}
          onMoveToCollection={onMoveToCollection}
          onCopyToCollection={onCopyToCollection}
          onCompare={onCompare}
          onLinkToTokens={onLinkToTokens}
        />
      )}
    </div>
  );
}
