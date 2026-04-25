import type {
  AliasEdge,
  GraphEdgeId,
  GeneratorProducesEdge,
  GeneratorSourceEdge,
  GraphEdge,
  GraphModel,
  GraphNode,
  GraphNodeId,
} from "@tokenmanager/core";

const COLLAPSE_THRESHOLD = 80;

export interface GraphClusterNode {
  kind: "cluster";
  id: GraphNodeId;
  label: string;
  collectionId?: string;
  groupPath?: string;
  count: number;
}

export type GraphRenderNode = GraphNode | GraphClusterNode;

export type GraphRenderEdge =
  | (AliasEdge & {
      aggregateCount?: number;
      sourceEdgeIds?: GraphEdgeId[];
    })
  | (GeneratorSourceEdge & {
      aggregateCount?: number;
      sourceEdgeIds?: GraphEdgeId[];
    })
  | (GeneratorProducesEdge & {
      aggregateCount?: number;
      sourceEdgeIds?: GraphEdgeId[];
    });

export interface GraphRenderModel {
  nodes: Map<GraphNodeId, GraphRenderNode>;
  edges: Map<GraphEdgeId, GraphRenderEdge>;
  outgoing: Map<GraphNodeId, GraphEdgeId[]>;
  incoming: Map<GraphNodeId, GraphEdgeId[]>;
  fingerprint: string;
}

interface ClusterInfo {
  id: GraphNodeId;
  label: string;
  collectionId?: string;
  groupPath?: string;
  nodeIds: GraphNodeId[];
}

function groupPathFromTokenPath(path: string): string {
  const parts = path.split(".").filter(Boolean);
  if (parts.length <= 1) return "Ungrouped";
  return parts.slice(0, -1).join("/");
}

function clusterInfoForNode(
  node: GraphNode,
  selectedCollectionIds: string[],
): Omit<ClusterInfo, "nodeIds"> | null {
  const multiCollection = selectedCollectionIds.length > 1;
  if (node.kind === "token") {
    const groupPath = groupPathFromTokenPath(node.path);
    const label = multiCollection
      ? `${node.collectionId} / ${groupPath}`
      : groupPath;
    return {
      id: `cluster:${node.collectionId}::${groupPath}`,
      label,
      collectionId: node.collectionId,
      groupPath,
    };
  }

  if (node.kind === "generator") {
    const groupPath = node.targetGroup.replace(/\./g, "/") || "Generators";
    const label = multiCollection
      ? `${node.targetCollection} / ${groupPath}`
      : groupPath;
    return {
      id: `cluster:${node.targetCollection}::${groupPath}`,
      label,
      collectionId: node.targetCollection,
      groupPath,
    };
  }

  const groupPath = groupPathFromTokenPath(node.path);
  const collectionId = node.collectionId ?? "missing";
  const label = multiCollection ? `${collectionId} / ${groupPath}` : groupPath;
  return {
    id: `cluster:${collectionId}::${groupPath}`,
    label,
    collectionId: node.collectionId,
    groupPath,
  };
}

export function getGraphNodeClusterInfo(
  node: GraphNode | undefined,
  selectedCollectionIds: string[],
): Omit<ClusterInfo, "nodeIds"> | null {
  if (!node) return null;
  return clusterInfoForNode(node, selectedCollectionIds);
}

export function getGraphNodeClusterId(
  node: GraphNode | undefined,
  selectedCollectionIds: string[],
): GraphNodeId | null {
  return getGraphNodeClusterInfo(node, selectedCollectionIds)?.id ?? null;
}

export function collapseGraphClusters(
  graph: GraphModel,
  params: {
    focusNodeId: GraphNodeId | null;
    expandedClusterIds: ReadonlySet<GraphNodeId>;
    selectedCollectionIds: string[];
    enabled: boolean;
    threshold?: number;
  },
): GraphRenderModel {
  const threshold = params.threshold ?? COLLAPSE_THRESHOLD;
  if (!params.enabled || graph.nodes.size <= threshold) {
    return graphToRenderModel(graph);
  }

  const clusters = new Map<GraphNodeId, ClusterInfo>();
  for (const node of graph.nodes.values()) {
    const base = clusterInfoForNode(node, params.selectedCollectionIds);
    if (!base) continue;
    const existing = clusters.get(base.id);
    if (existing) {
      existing.nodeIds.push(node.id);
    } else {
      clusters.set(base.id, { ...base, nodeIds: [node.id] });
    }
  }

  const focalClusterId = getGraphNodeClusterId(
    params.focusNodeId ? graph.nodes.get(params.focusNodeId) : undefined,
    params.selectedCollectionIds,
  );
  const collapsedNodeIds = new Map<GraphNodeId, GraphNodeId>();
  const nodes = new Map<GraphNodeId, GraphRenderNode>();

  for (const cluster of clusters.values()) {
    const shouldCollapse =
      cluster.id !== focalClusterId &&
      !params.expandedClusterIds.has(cluster.id) &&
      cluster.nodeIds.length > 1;
    if (!shouldCollapse) continue;
    const clusterNode: GraphClusterNode = {
      kind: "cluster",
      id: cluster.id,
      label: cluster.label,
      collectionId: cluster.collectionId,
      groupPath: cluster.groupPath,
      count: cluster.nodeIds.length,
    };
    nodes.set(cluster.id, clusterNode);
    for (const nodeId of cluster.nodeIds) {
      collapsedNodeIds.set(nodeId, cluster.id);
    }
  }

  for (const [nodeId, node] of graph.nodes) {
    if (!collapsedNodeIds.has(nodeId)) {
      nodes.set(nodeId, node);
    }
  }

  const edges = new Map<GraphEdgeId, GraphRenderEdge>();
  const outgoing = new Map<GraphNodeId, GraphEdgeId[]>();
  const incoming = new Map<GraphNodeId, GraphEdgeId[]>();

  for (const edge of graph.edges.values()) {
    const from = collapsedNodeIds.get(edge.from) ?? edge.from;
    const to = collapsedNodeIds.get(edge.to) ?? edge.to;
    if (from === to) continue;

    if (from === edge.from && to === edge.to) {
      edges.set(edge.id, edge);
      pushAdjacency(outgoing, from, edge.id);
      pushAdjacency(incoming, to, edge.id);
      continue;
    }

    const edgeId = `agg:${edge.kind}:${from}->${to}`;
    const existing = edges.get(edgeId);
    if (existing) {
      mergeAggregateEdge(existing, edge);
      continue;
    }
    const projected = projectAggregateEdge(edge, edgeId, from, to);
    edges.set(edgeId, projected);
    pushAdjacency(outgoing, from, edgeId);
    pushAdjacency(incoming, to, edgeId);
  }

  return {
    nodes,
    edges,
    outgoing,
    incoming,
    fingerprint: `${graph.fingerprint}:collapsed:${[
      ...params.expandedClusterIds,
    ]
      .sort()
      .join(",")}:${nodes.size}:${edges.size}`,
  };
}

function projectAggregateEdge(
  edge: GraphEdge,
  id: string,
  from: GraphNodeId,
  to: GraphNodeId,
): GraphRenderEdge {
  if (edge.kind === "alias") {
    return {
      ...edge,
      id,
      from,
      to,
      modeNames: [...edge.modeNames],
      aggregateCount: 1,
      sourceEdgeIds: [edge.id],
    } satisfies GraphRenderEdge;
  }
  if (edge.kind === "generator-produces") {
    return {
      ...edge,
      id,
      from,
      to,
      aggregateCount: 1,
      sourceEdgeIds: [edge.id],
    } satisfies GraphRenderEdge;
  }
  return {
    ...edge,
    id,
    from,
    to,
    aggregateCount: 1,
    sourceEdgeIds: [edge.id],
  } satisfies GraphRenderEdge;
}

function mergeAggregateEdge(target: GraphRenderEdge, source: GraphEdge): void {
  target.aggregateCount = (target.aggregateCount ?? 1) + 1;
  target.sourceEdgeIds = [...(target.sourceEdgeIds ?? []), source.id];
  if (target.kind === "alias" && source.kind === "alias") {
    target.modeNames = [
      ...new Set([...target.modeNames, ...source.modeNames]),
    ].sort();
    target.inCycle = target.inCycle || source.inCycle;
    target.isMissingTarget = target.isMissingTarget || source.isMissingTarget;
    target.issueRules = [
      ...new Set([...(target.issueRules ?? []), ...(source.issueRules ?? [])]),
    ].sort();
  }
}

function pushAdjacency(
  map: Map<GraphNodeId, GraphEdgeId[]>,
  nodeId: GraphNodeId,
  edgeId: GraphEdgeId,
): void {
  const existing = map.get(nodeId);
  if (existing) existing.push(edgeId);
  else map.set(nodeId, [edgeId]);
}

function graphToRenderModel(graph: GraphModel): GraphRenderModel {
  return {
    nodes: new Map(graph.nodes),
    edges: new Map(graph.edges),
    outgoing: new Map(graph.outgoing),
    incoming: new Map(graph.incoming),
    fingerprint: graph.fingerprint,
  };
}
