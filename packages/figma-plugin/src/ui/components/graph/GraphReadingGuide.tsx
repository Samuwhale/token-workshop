import type { GraphModel, GraphNodeId } from "@tokenmanager/core";
import type { GraphRenderModel } from "./graphClusters";

interface GraphReadingGuideProps {
  fullGraph: GraphModel;
  subgraph: GraphRenderModel;
  focusId: GraphNodeId;
  scopeCollectionIds: string[];
  collectionModeCountById: Map<string, number>;
}

export function GraphReadingGuide({
  fullGraph,
  subgraph,
  focusId,
  scopeCollectionIds,
  collectionModeCountById,
}: GraphReadingGuideProps) {
  const focusNode = fullGraph.nodes.get(focusId);
  const collectionId = focusNode ? nodeCollectionId(focusNode) : null;
  const modeCount = collectionId
    ? collectionModeCountById.get(collectionId) ?? 0
    : 0;
  const incomingCount = countIncidentRelationships(subgraph, focusId, "incoming");
  const outgoingCount = countIncidentRelationships(subgraph, focusId, "outgoing");
  const scopeLabel =
    scopeCollectionIds.length === 1
      ? collectionDisplayName(scopeCollectionIds[0])
      : `${scopeCollectionIds.length} collections`;
  const focusLabel = focusNode ? nodeLabel(focusNode) : "Selected token";
  const focusCollectionLabel = collectionId
    ? collectionDisplayName(collectionId)
    : scopeLabel;
  const modeLabel =
    modeCount > 1 ? `${modeCount} modes in this collection` : "1 mode";
  const usesCollections = formatCollectionList(
    collectRelationshipCollectionIds(
      fullGraph,
      subgraph,
      collectionId,
      focusId,
      "incoming",
    ),
  );
  const usedByCollections = formatCollectionList(
    collectRelationshipCollectionIds(
      fullGraph,
      subgraph,
      collectionId,
      focusId,
      "outgoing",
    ),
  );
  const modeRelationshipLabel =
    modeCount > 1
      ? "Mode labels appear on mode-specific lines; unlabeled lines apply to all modes."
      : "Single-mode collection.";

  return (
    <div className="pointer-events-none absolute left-3 top-3 z-20 flex max-w-[min(640px,calc(100%-24px))] flex-col gap-1.5 rounded bg-[var(--color-figma-bg)]/94 px-3 py-2 text-secondary text-[var(--color-figma-text-secondary)] shadow-sm backdrop-blur-sm">
      <div className="flex min-w-0 items-center gap-1.5">
        <span
          className="truncate font-medium text-[var(--color-figma-text)]"
          title={focusLabel}
        >
          {focusLabel}
        </span>
        <span className="shrink-0 text-[var(--color-figma-text-tertiary)]">
          ·
        </span>
        <span
          className="shrink-0 text-[var(--color-figma-text-tertiary)]"
          title={collectionId ?? scopeLabel}
        >
          {focusCollectionLabel}
        </span>
        <span className="shrink-0 text-[var(--color-figma-text-tertiary)]">
          · {modeLabel}
        </span>
      </div>
      <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-[10px] leading-tight">
        <span>
          Depends on {incomingCount} {pluralize(incomingCount, "connection")}
          {usesCollections ? ` from ${usesCollections}` : ""}
        </span>
        <span>
          Used by {outgoingCount} {pluralize(outgoingCount, "connection")}
          {usedByCollections ? ` in ${usedByCollections}` : ""}
        </span>
      </div>
      <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-[10px] leading-tight text-[var(--color-figma-text-tertiary)]">
        <span>Graph scope: {scopeLabel}</span>
        <span>Lines point from source to dependent.</span>
        <span>Dashed or accented lines feed modified values.</span>
        <span>Warnings mean a source cannot resolve.</span>
        <span className="min-w-0 truncate" title={modeRelationshipLabel}>
          {modeRelationshipLabel}
        </span>
      </div>
    </div>
  );
}

function pluralize(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`;
}

function countIncidentRelationships(
  graph: GraphRenderModel,
  nodeId: GraphNodeId,
  direction: "incoming" | "outgoing",
): number {
  const edgeIds =
    direction === "incoming"
      ? graph.incoming.get(nodeId) ?? []
      : graph.outgoing.get(nodeId) ?? [];
  return edgeIds.reduce((count, edgeId) => {
    const edge = graph.edges.get(edgeId);
    return count + (edge?.aggregateCount ?? 1);
  }, 0);
}

function collectRelationshipCollectionIds(
  fullGraph: GraphModel,
  subgraph: GraphRenderModel,
  focusCollectionId: string | null,
  focusId: GraphNodeId,
  direction: "incoming" | "outgoing",
): string[] {
  if (!focusCollectionId) return [];
  const connected = new Set<string>();
  const edgeIds =
    direction === "incoming"
      ? subgraph.incoming.get(focusId) ?? []
      : subgraph.outgoing.get(focusId) ?? [];

  const visitEndpoint = (nodeId: GraphNodeId) => {
    const node = fullGraph.nodes.get(nodeId);
    if (!node) return;
    const collectionId = nodeCollectionId(node);
    if (collectionId && collectionId !== focusCollectionId) {
      connected.add(collectionId);
    }
  };

  for (const edgeId of edgeIds) {
    const edge = subgraph.edges.get(edgeId);
    if (!edge) continue;
    visitEndpoint(direction === "incoming" ? edge.from : edge.to);

    for (const sourceEdgeId of edge.sourceEdgeIds ?? []) {
      const sourceEdge = fullGraph.edges.get(sourceEdgeId);
      if (!sourceEdge) continue;
      visitEndpoint(direction === "incoming" ? sourceEdge.from : sourceEdge.to);
    }
  }

  return [...connected].sort();
}

function formatCollectionList(collectionIds: string[]): string {
  if (collectionIds.length === 0) return "";
  const names = collectionIds.map(collectionDisplayName);
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]} + ${names.length - 1}`;
}

function nodeCollectionId(
  node: NonNullable<ReturnType<GraphModel["nodes"]["get"]>>,
): string | null {
  if (node.kind === "token") return node.collectionId;
  if (node.kind === "generator") return node.targetCollection;
  if (node.kind === "derivation") return node.collectionId;
  return node.collectionId ?? null;
}

function collectionDisplayName(collectionId: string): string {
  return collectionId.replace(/^-?\d+-+/u, "");
}

function nodeLabel(
  node: NonNullable<ReturnType<GraphModel["nodes"]["get"]>>,
): string {
  if (node.kind === "token") return node.displayName || node.path;
  if (node.kind === "generator") return node.name;
  if (node.kind === "derivation") return node.derivedPath;
  return node.path;
}
