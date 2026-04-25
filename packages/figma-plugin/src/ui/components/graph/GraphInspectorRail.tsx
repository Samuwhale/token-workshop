import { ChevronLeft } from "lucide-react";
import type { GraphModel, GraphNodeId } from "@tokenmanager/core";

interface GraphInspectorRailProps {
  graph: GraphModel;
  focusId: GraphNodeId | null;
  selectedEdgeId: string | null;
  selectedTokenIds: GraphNodeId[];
  onExpand: () => void;
}

export function GraphInspectorRail({
  graph,
  focusId,
  selectedEdgeId,
  selectedTokenIds,
  onExpand,
}: GraphInspectorRailProps) {
  const label = describeSelection(graph, focusId, selectedEdgeId, selectedTokenIds);
  return (
    <button
      type="button"
      onClick={onExpand}
      aria-label={`Expand inspector — ${label}`}
      title={label}
      className="flex h-full w-8 shrink-0 flex-col items-center gap-2 border-l border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] py-3 text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
    >
      <ChevronLeft size={12} strokeWidth={2} aria-hidden />
      <span
        className="text-[10px]"
        style={{
          writingMode: "vertical-rl",
          transform: "rotate(180deg)",
          maxHeight: "calc(100% - 24px)",
          overflow: "hidden",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
    </button>
  );
}

function describeSelection(
  graph: GraphModel,
  focusId: GraphNodeId | null,
  selectedEdgeId: string | null,
  selectedTokenIds: GraphNodeId[],
): string {
  if (selectedTokenIds.length >= 2) return `Compare ${selectedTokenIds.length}`;
  if (selectedEdgeId) {
    const edge = graph.edges.get(selectedEdgeId);
    if (edge?.kind === "alias") return "Alias edge";
    return "Edge";
  }
  if (focusId) {
    const node = graph.nodes.get(focusId);
    if (node?.kind === "token") return node.path;
    if (node?.kind === "generator") return node.name;
    if (node?.kind === "ghost") return node.path;
  }
  return "Inspector";
}
