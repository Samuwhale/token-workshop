import type { GraphModel, GraphNodeId } from "@tokenmanager/core";
import type { ReactNode } from "react";
import { Boxes, GitBranch, Layers3 } from "lucide-react";
import type { GraphRenderModel } from "./graphClusters";

interface GraphReadingGuideProps {
  fullGraph: GraphModel;
  subgraph: GraphRenderModel;
  focusId: GraphNodeId;
  scopeCollectionIds: string[];
  collectionModeCountById: Map<string, number>;
  hasCrossCollectionBands: boolean;
}

export function GraphReadingGuide({
  fullGraph,
  subgraph,
  focusId,
  scopeCollectionIds,
  collectionModeCountById,
  hasCrossCollectionBands,
}: GraphReadingGuideProps) {
  const focusNode = fullGraph.nodes.get(focusId);
  const collectionId = focusNode ? nodeCollectionId(focusNode) : null;
  const modeCount = collectionId
    ? collectionModeCountById.get(collectionId) ?? 0
    : 0;
  const incomingCount = subgraph.incoming.get(focusId)?.length ?? 0;
  const outgoingCount = subgraph.outgoing.get(focusId)?.length ?? 0;
  const scopeLabel =
    scopeCollectionIds.length === 1
      ? scopeCollectionIds[0]
      : `${scopeCollectionIds.length} collections`;

  return (
    <div className="pointer-events-none absolute left-3 top-3 z-20 flex max-w-[min(520px,calc(100%-24px))] flex-col gap-2 rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]/94 px-3 py-2 text-secondary text-[var(--color-figma-text-secondary)] shadow-sm backdrop-blur-sm">
      <div className="flex min-w-0 items-center gap-2">
        <span className="font-medium text-[var(--color-figma-text)]">
          Reading this graph
        </span>
        <span className="min-w-0 truncate text-[var(--color-figma-text-tertiary)]">
          {incomingCount} incoming · {outgoingCount} outgoing
        </span>
      </div>
      <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-3">
        <GuideItem
          icon={<Boxes size={11} strokeWidth={2} aria-hidden />}
          label="Collections"
          value={
            hasCrossCollectionBands
              ? "Colored bands mark other collections"
              : `Scope: ${scopeLabel}`
          }
        />
        <GuideItem
          icon={<GitBranch size={11} strokeWidth={2} aria-hidden />}
          label="Tokens"
          value="Each node is one token"
        />
        <GuideItem
          icon={<Layers3 size={11} strokeWidth={2} aria-hidden />}
          label="Modes"
          value={
            modeCount > 1
              ? `${modeCount} modes; line chips mean mode-specific`
              : "Lines apply to the token value"
          }
        />
      </div>
    </div>
  );
}

function GuideItem({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-1.5">
      <span className="mt-0.5 shrink-0 text-[var(--color-figma-text-tertiary)]">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="font-medium text-[var(--color-figma-text)]">
          {label}
        </span>
        <span className="text-[var(--color-figma-text-tertiary)]"> · </span>
        <span className="text-[var(--color-figma-text-secondary)]">
          {value}
        </span>
      </span>
    </div>
  );
}

function nodeCollectionId(
  node: NonNullable<ReturnType<GraphModel["nodes"]["get"]>>,
): string | null {
  if (node.kind === "token") return node.collectionId;
  if (node.kind === "generator") return node.targetCollection;
  if (node.kind === "derivation") return node.collectionId;
  return node.collectionId ?? null;
}
