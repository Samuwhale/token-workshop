import { LayoutPanelTop } from "lucide-react";
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
          <LayoutPanelTop size={20} strokeWidth={1.5} aria-hidden="true" />
        }
        title={title}
        description={description}
      />
    </div>
  );
}
