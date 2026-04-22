import { FeedbackPlaceholder } from "./FeedbackPlaceholder";
import { LayerSearchPanel } from "./LayerSearchPanel";

export function SelectionInspectorLoadingState() {
  return (
    <div className="flex flex-1 flex-col gap-3 px-4 pt-4">
      <FeedbackPlaceholder
        variant="empty"
        size="section"
        title="Loading selection"
        description="Waiting for the current Figma selection to arrive."
      />
    </div>
  );
}

export function SelectionInspectorEmptyState({
  onSelectLayer,
  extractPending = false,
}: {
  onSelectLayer: (nodeId: string) => void;
  extractPending?: boolean;
}) {
  const title = extractPending
    ? "Select a layer to extract from"
    : "No layer selected";
  const description = extractPending
    ? "Pick a frame, shape, or text layer with unbound colors, type, or spacing. The extract sheet will open automatically."
    : "Search above or select a layer on the canvas to inspect its token bindings.";

  return (
    <div className="flex flex-1 flex-col gap-3 px-4 pt-4">
      <LayerSearchPanel onSelect={onSelectLayer} />
      <FeedbackPlaceholder
        variant="empty"
        size="section"
        icon={
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18M9 21V9" />
          </svg>
        }
        title={title}
        description={description}
      />
    </div>
  );
}
