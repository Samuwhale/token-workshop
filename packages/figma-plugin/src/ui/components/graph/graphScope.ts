import type { GraphEdge, GraphModel, GraphNodeId } from "@tokenmanager/core";

export interface SelectSubgraphOptions {
  focusNodeId: GraphNodeId | null;
  depth?: number;
  autoExpandThreshold?: number;
  autoExpandDepth?: number;
}

/**
 * Returns the cycle path (`a → b → c → a`) when adding an alias edge
 * `upstreamId → downstreamId` would close a cycle in the existing alias
 * subgraph. `null` means the rewire is safe.
 *
 * Direction matches `AliasEdge.from = upstream, to = downstream`. A new edge
 * `B → A` (i.e. A starts to alias B) closes a cycle iff there is already a
 * path A → ... → B in the alias subgraph.
 */
export function wouldCreateAliasCycle(
  full: GraphModel,
  upstreamNodeId: GraphNodeId,
  downstreamNodeId: GraphNodeId,
): GraphNodeId[] | null {
  if (upstreamNodeId === downstreamNodeId) {
    return [downstreamNodeId, upstreamNodeId];
  }
  // BFS from downstream looking for upstream along outgoing alias edges.
  const visited = new Set<GraphNodeId>([downstreamNodeId]);
  const parent = new Map<GraphNodeId, GraphNodeId>();
  const queue: GraphNodeId[] = [downstreamNodeId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const edgeIds = full.outgoing.get(current) ?? [];
    for (const edgeId of edgeIds) {
      const edge = full.edges.get(edgeId);
      if (!edge || edge.kind !== "alias") continue;
      const next = edge.to;
      if (visited.has(next)) continue;
      visited.add(next);
      parent.set(next, current);
      if (next === upstreamNodeId) {
        const path: GraphNodeId[] = [];
        let cursor: GraphNodeId | undefined = next;
        while (cursor !== undefined) {
          path.unshift(cursor);
          cursor = parent.get(cursor);
        }
        path.push(downstreamNodeId);
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}

export function selectSubgraph(
  full: GraphModel,
  {
    focusNodeId,
    depth = 2,
    autoExpandThreshold = 20,
    autoExpandDepth = 3,
  }: SelectSubgraphOptions,
): GraphModel {
  if (!focusNodeId || !full.nodes.has(focusNodeId)) return full;
  let visited = bfsSubgraph(full, focusNodeId, depth);
  if (visited.size < autoExpandThreshold) {
    visited = bfsSubgraph(full, focusNodeId, autoExpandDepth);
  }
  return sliceModel(full, visited);
}

export function filterByCollections(
  full: GraphModel,
  collectionIds: string[],
): GraphModel {
  if (collectionIds.length === 0) return full;
  const ids = new Set(collectionIds);
  const kept = new Set<GraphNodeId>();
  for (const node of full.nodes.values()) {
    if (node.kind === "token" && ids.has(node.collectionId)) kept.add(node.id);
    else if (node.kind === "generator" && ids.has(node.targetCollection)) kept.add(node.id);
    else if (
      node.kind === "ghost" &&
      node.collectionId &&
      ids.has(node.collectionId)
    )
      kept.add(node.id);
  }

  // Keep first-hop neighbors so cross-collection aliases remain visible, then
  // expand once more from any kept generators so produced/source context stays
  // intact regardless of edge insertion order.
  const directlyAdjacent = collectAdjacentNodes(full, kept);
  for (const nodeId of directlyAdjacent) {
    kept.add(nodeId);
  }

  const keptGenerators = new Set(
    [...kept].filter((nodeId) => full.nodes.get(nodeId)?.kind === "generator"),
  );
  const generatorContext = collectAdjacentNodes(full, keptGenerators);
  for (const nodeId of generatorContext) {
    kept.add(nodeId);
  }

  return sliceModel(full, kept);
}

function collectAdjacentNodes(
  full: GraphModel,
  seedNodeIds: ReadonlySet<GraphNodeId>,
): Set<GraphNodeId> {
  const adjacent = new Set<GraphNodeId>();
  if (seedNodeIds.size === 0) {
    return adjacent;
  }

  for (const edge of full.edges.values()) {
    if (seedNodeIds.has(edge.from)) {
      adjacent.add(edge.to);
    }
    if (seedNodeIds.has(edge.to)) {
      adjacent.add(edge.from);
    }
  }

  return adjacent;
}

function bfsSubgraph(
  full: GraphModel,
  start: GraphNodeId,
  maxDepth: number,
): Set<GraphNodeId> {
  // Walk upstream and downstream independently so the result matches the
  // focus-mode layout, which assigns each node to a strict upstream- or
  // downstream-only column. A bidirectional walk would happily collect
  // "sibling" nodes (e.g. other tokens that alias the same target as the
  // focus) that the layout has no column for — those would then collapse onto
  // (0, 0) and overlap the focus node.
  const visited = new Set<GraphNodeId>([start]);
  walkDirection(full, start, maxDepth, "upstream", visited);
  walkDirection(full, start, maxDepth, "downstream", visited);
  return visited;
}

function walkDirection(
  full: GraphModel,
  start: GraphNodeId,
  maxDepth: number,
  side: "upstream" | "downstream",
  visited: Set<GraphNodeId>,
): void {
  let frontier: GraphNodeId[] = [start];
  for (let d = 0; d < maxDepth; d++) {
    const next: GraphNodeId[] = [];
    for (const nodeId of frontier) {
      const edgeIds =
        side === "upstream"
          ? full.incoming.get(nodeId) ?? []
          : full.outgoing.get(nodeId) ?? [];
      for (const edgeId of edgeIds) {
        const edge = full.edges.get(edgeId);
        if (!edge) continue;
        const other = side === "upstream" ? edge.from : edge.to;
        if (visited.has(other)) continue;
        visited.add(other);
        next.push(other);
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }
}

function sliceModel(
  full: GraphModel,
  visitedNodes: Set<GraphNodeId>,
): GraphModel {
  const nodes = new Map(
    [...full.nodes].filter(([id]) => visitedNodes.has(id)),
  );
  const edges = new Map<string, GraphEdge>();
  const outgoing = new Map<GraphNodeId, string[]>();
  const incoming = new Map<GraphNodeId, string[]>();
  for (const [id, edge] of full.edges) {
    if (!visitedNodes.has(edge.from) || !visitedNodes.has(edge.to)) continue;
    edges.set(id, edge);
    const out = outgoing.get(edge.from);
    if (out) out.push(id);
    else outgoing.set(edge.from, [id]);
    const inc = incoming.get(edge.to);
    if (inc) inc.push(id);
    else incoming.set(edge.to, [id]);
  }
  return {
    nodes,
    edges,
    outgoing,
    incoming,
    fingerprint: `${full.fingerprint}:slice:${visitedNodes.size}:${fingerprintNodeSet(visitedNodes)}`,
  };
}

function fingerprintNodeSet(nodeIds: Set<GraphNodeId>): string {
  let hash = 5381;
  for (const nodeId of [...nodeIds].sort()) {
    for (let i = 0; i < nodeId.length; i++) {
      hash = ((hash << 5) + hash + nodeId.charCodeAt(i)) | 0;
    }
  }
  return (hash >>> 0).toString(36);
}
