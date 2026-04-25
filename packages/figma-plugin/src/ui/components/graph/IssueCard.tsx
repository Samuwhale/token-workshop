import type { MouseEvent } from "react";
import type { GraphModel, GraphNodeId } from "@tokenmanager/core";
import type { GraphIssueEntry } from "../../hooks/useIssuesGroups";

interface IssueCardProps {
  entry: GraphIssueEntry;
  fullGraph: GraphModel;
  onOpenInFocus: (nodeId: GraphNodeId) => void;
  onRequestDetach?: (params: {
    edgeId: string;
    screenX: number;
    screenY: number;
  }) => void;
}

const KIND_LABELS: Record<GraphIssueEntry["kind"], string> = {
  "broken-alias": "Broken alias",
  "ghost-reference": "Missing reference",
  cycle: "Cycle",
  "ambiguous-generator-source": "Ambiguous source",
};

export function IssueCard({
  entry,
  fullGraph,
  onOpenInFocus,
  onRequestDetach,
}: IssueCardProps) {
  const handleDetach = (event: MouseEvent<HTMLButtonElement>) => {
    if (!entry.relatedEdgeId || !onRequestDetach) return;
    onRequestDetach({
      edgeId: entry.relatedEdgeId,
      screenX: event.clientX,
      screenY: event.clientY,
    });
  };

  return (
    <div className="flex flex-col gap-1.5 py-1.5">
      <div className="flex items-baseline gap-2">
        <span className="shrink-0 text-secondary text-[var(--color-figma-text-secondary)]">
          {KIND_LABELS[entry.kind]}
        </span>
        <span className="min-w-0 flex-1 truncate text-secondary text-[var(--color-figma-text)]">
          {entry.message}
        </span>
      </div>

      <MiniSubgraph entry={entry} fullGraph={fullGraph} />

      <div className="flex items-center gap-3 text-[10px]">
        <button
          type="button"
          onClick={() => onOpenInFocus(entry.primaryNodeId)}
          className="text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:underline"
        >
          Open in focus
        </button>
        {entry.kind === "broken-alias" && entry.relatedEdgeId && onRequestDetach ? (
          <button
            type="button"
            onClick={handleDetach}
            className="text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:underline"
          >
            Detach
          </button>
        ) : null}
      </div>
    </div>
  );
}

interface MiniSubgraphProps {
  entry: GraphIssueEntry;
  fullGraph: GraphModel;
}

function MiniSubgraph({ entry, fullGraph }: MiniSubgraphProps) {
  const primaryLabel = nodeLabel(fullGraph, entry.primaryNodeId);
  const relatedLabels = entry.relatedNodeIds
    .slice(0, 2)
    .map((id) => nodeLabel(fullGraph, id));

  if (relatedLabels.length === 0) {
    return (
      <div className="flex items-center">
        <Pill label={primaryLabel} />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 overflow-hidden">
      <Pill label={primaryLabel} />
      <span aria-hidden className="text-[10px] text-[var(--color-figma-text-tertiary)]">
        →
      </span>
      <Pill label={relatedLabels[0]} muted />
      {relatedLabels.length > 1 ? (
        <>
          <span aria-hidden className="text-[10px] text-[var(--color-figma-text-tertiary)]">
            →
          </span>
          <Pill label={relatedLabels[1]} muted />
        </>
      ) : null}
    </div>
  );
}

function Pill({ label, muted = false }: { label: string; muted?: boolean }) {
  return (
    <span
      title={label}
      className={`inline-block max-w-[140px] truncate rounded bg-[var(--color-figma-bg-secondary)] px-1.5 py-0.5 text-[10px] ${
        muted
          ? "text-[var(--color-figma-text-tertiary)]"
          : "text-[var(--color-figma-text)]"
      }`}
    >
      {label}
    </span>
  );
}

function nodeLabel(graph: GraphModel, id: GraphNodeId): string {
  const node = graph.nodes.get(id);
  if (!node) return id;
  if (node.kind === "token") return node.path;
  if (node.kind === "generator") return node.name;
  return node.path;
}
