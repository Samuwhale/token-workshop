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
}: {
  onSelectLayer: (nodeId: string) => void;
}) {
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
        title="No layer selected"
        description="Search above or select a layer on the canvas to inspect its token bindings."
      />
    </div>
  );
}
