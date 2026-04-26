import type {
  AliasEdge,
  GeneratorProducesEdge,
  GeneratorSourceEdge,
  GraphEdge,
  GraphEdgeId,
  GraphModel,
  GraphNode,
  GraphNodeId,
} from "@tokenmanager/core";

export interface GraphClusterNode {
  kind: "cluster";
  id: GraphNodeId;
  label: string;
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

const DEFAULT_AGGREGATE_MAX = 8;

type Side = "upstream" | "downstream";

interface NeighbourMeta {
  hop: number;
  side: Side;
}

/**
 * Collapse same-kind sibling neighbours of an anchor that exceed `max` per
 * (side, hop, kind) bucket into a single cluster pill. Used by the focus-mode
 * subgraph: a fan-out of 50 generated colors at hop 1 becomes one "50 tokens"
 * pill, while a small mixed fan-out is left intact.
 *
 * Edges crossing a cluster boundary are aggregated using the same
 * `aggregateCount` + `sourceEdgeIds` shape that downstream renderers already
 * expect.
 */
export function bucketKeyFromClusterId(
  anchorId: GraphNodeId,
  clusterId: GraphNodeId,
): string | null {
  const prefix = `cluster:agg:${anchorId}:`;
  if (!clusterId.startsWith(prefix)) return null;
  return clusterId.slice(prefix.length);
}

export function aggregateNeighbours(
  subgraph: GraphModel,
  anchorId: GraphNodeId,
  max: number = DEFAULT_AGGREGATE_MAX,
  expandedBucketKeys?: ReadonlySet<string>,
): GraphRenderModel {
  const meta = new Map<GraphNodeId, NeighbourMeta>();
  if (subgraph.nodes.has(anchorId)) {
    bfsSide(subgraph, anchorId, "upstream", meta);
    bfsSide(subgraph, anchorId, "downstream", meta);
  }

  const groups = new Map<string, GraphNodeId[]>();
  for (const [nodeId, info] of meta) {
    const node = subgraph.nodes.get(nodeId);
    if (!node) continue;
    const key = `${info.side}:${info.hop}:${node.kind}`;
    const list = groups.get(key);
    if (list) list.push(nodeId);
    else groups.set(key, [nodeId]);
  }

  const collapsedNodeIds = new Map<GraphNodeId, GraphNodeId>();
  const clusterNodes = new Map<GraphNodeId, GraphClusterNode>();
  for (const [key, ids] of groups) {
    if (ids.length <= max) continue;
    if (expandedBucketKeys?.has(key)) continue;
    const clusterId = `cluster:agg:${anchorId}:${key}`;
    const sample = subgraph.nodes.get(ids[0]);
    clusterNodes.set(clusterId, {
      kind: "cluster",
      id: clusterId,
      label: pluraliseKind(sample?.kind ?? "token", ids.length),
      count: ids.length,
    });
    for (const id of ids) collapsedNodeIds.set(id, clusterId);
  }

  const nodes = new Map<GraphNodeId, GraphRenderNode>();
  for (const [nodeId, node] of subgraph.nodes) {
    if (!collapsedNodeIds.has(nodeId)) nodes.set(nodeId, node);
  }
  for (const [clusterId, cluster] of clusterNodes) {
    nodes.set(clusterId, cluster);
  }

  const edges = new Map<GraphEdgeId, GraphRenderEdge>();
  const outgoing = new Map<GraphNodeId, GraphEdgeId[]>();
  const incoming = new Map<GraphNodeId, GraphEdgeId[]>();

  for (const edge of subgraph.edges.values()) {
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

  // Relabel clusters whose only incoming edges are `generator-produces` as
  // `produces · N`, so a generator's many outputs read as one relationship.
  for (const [clusterId, cluster] of clusterNodes) {
    const incomingIds = incoming.get(clusterId) ?? [];
    if (incomingIds.length === 0) continue;
    const allProduces = incomingIds.every(
      (id) => edges.get(id)?.kind === "generator-produces",
    );
    if (allProduces) {
      cluster.label = `produces · ${cluster.count}`;
    }
  }

  return {
    nodes,
    edges,
    outgoing,
    incoming,
    fingerprint: `${subgraph.fingerprint}:agg:${anchorId}:${nodes.size}:${edges.size}`,
  };
}

export function graphToRenderModel(graph: GraphModel): GraphRenderModel {
  return {
    nodes: new Map(graph.nodes),
    edges: new Map(graph.edges),
    outgoing: new Map(graph.outgoing),
    incoming: new Map(graph.incoming),
    fingerprint: graph.fingerprint,
  };
}

function bfsSide(
  graph: GraphModel,
  anchor: GraphNodeId,
  side: Side,
  meta: Map<GraphNodeId, NeighbourMeta>,
): void {
  const visited = new Set<GraphNodeId>([anchor]);
  let frontier: GraphNodeId[] = [anchor];
  let hop = 0;
  while (frontier.length > 0) {
    hop++;
    const next: GraphNodeId[] = [];
    for (const nodeId of frontier) {
      const edgeIds =
        side === "upstream"
          ? graph.incoming.get(nodeId) ?? []
          : graph.outgoing.get(nodeId) ?? [];
      for (const edgeId of edgeIds) {
        const edge = graph.edges.get(edgeId);
        if (!edge) continue;
        const otherId = side === "upstream" ? edge.from : edge.to;
        if (visited.has(otherId)) continue;
        visited.add(otherId);
        if (!meta.has(otherId)) meta.set(otherId, { hop, side });
        next.push(otherId);
      }
    }
    frontier = next;
  }
}

function pluraliseKind(kind: GraphNode["kind"], count: number): string {
  if (kind === "generator") return `${count} generators`;
  if (kind === "ghost") return `${count} broken refs`;
  return `${count} tokens`;
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
    };
  }
  if (edge.kind === "generator-produces") {
    return {
      ...edge,
      id,
      from,
      to,
      aggregateCount: 1,
      sourceEdgeIds: [edge.id],
    };
  }
  return {
    ...edge,
    id,
    from,
    to,
    aggregateCount: 1,
    sourceEdgeIds: [edge.id],
  };
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
