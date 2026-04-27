import type { MouseEvent } from "react";
import { ArrowRight } from "lucide-react";
import type { GraphModel, GraphNodeId } from "@tokenmanager/core";
import type { GraphIssueEntry } from "../../hooks/useIssuesGroups";
import { collectionAccentHue } from "./collectionAccent";

interface IssueRowProps {
  entry: GraphIssueEntry;
  fullGraph: GraphModel;
  collectionLabel?: string | null;
  onOpenInFocus: (nodeId: GraphNodeId) => void;
  onRequestDetach?: (params: {
    edgeId: string;
    screenX: number;
    screenY: number;
  }) => void;
}

export function IssueRow({
  entry,
  fullGraph,
  collectionLabel,
  onOpenInFocus,
  onRequestDetach,
}: IssueRowProps) {
  const handleDetach = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!entry.relatedEdgeId || !onRequestDetach) return;
    onRequestDetach({
      edgeId: entry.relatedEdgeId,
      screenX: event.clientX,
      screenY: event.clientY,
    });
  };

  const canDetach =
    entry.kind === "broken-alias" &&
    Boolean(entry.relatedEdgeId) &&
    Boolean(onRequestDetach);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpenInFocus(entry.primaryNodeId)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenInFocus(entry.primaryNodeId);
        }
      }}
      className="group flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 transition-colors hover:bg-[var(--color-figma-bg-hover)]"
    >
      {collectionLabel ? (
        <span
          aria-hidden
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: collectionAccentHue(entry.collectionId) }}
          title={collectionLabel}
        />
      ) : null}
      <div className="min-w-0 flex-1 text-secondary text-[var(--color-figma-text)]">
        <MiniSubgraph entry={entry} fullGraph={fullGraph} />
      </div>
      {canDetach ? (
        <button
          type="button"
          onClick={handleDetach}
          className="hidden shrink-0 text-secondary text-[var(--color-figma-text-tertiary)] transition-colors hover:text-[var(--color-figma-text)] hover:underline group-hover:inline group-focus-within:inline focus-visible:inline"
        >
          Detach
        </button>
      ) : null}
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
    .slice(0, 1)
    .map((id) => nodeLabel(fullGraph, id));

  if (relatedLabels.length === 0) {
    return (
      <span className="block truncate font-mono" title={primaryLabel}>
        {primaryLabel}
      </span>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-1">
      <span className="min-w-0 truncate font-mono" title={primaryLabel}>
        {primaryLabel}
      </span>
      <ArrowRight
        size={10}
        strokeWidth={2}
        aria-hidden
        className="shrink-0 text-[var(--color-figma-text-tertiary)]"
      />
      <span
        className="min-w-0 truncate font-mono text-[var(--color-figma-text-secondary)]"
        title={relatedLabels[0]}
      >
        {relatedLabels[0]}
      </span>
    </div>
  );
}

function nodeLabel(graph: GraphModel, id: GraphNodeId): string {
  const node = graph.nodes.get(id);
  if (!node) return id;
  if (node.kind === "token") return node.path;
  if (node.kind === "generator") return node.name;
  if (node.kind === "derivation") return node.derivedPath;
  return node.path;
}
