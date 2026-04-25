import dagre from "@dagrejs/dagre";
import type { GraphNodeId } from "@tokenmanager/core";
import {
  getGraphNodeClusterInfo,
  type GraphRenderModel,
  type GraphRenderNode,
} from "./graphClusters";

export interface NodePosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutResult {
  positions: Map<GraphNodeId, NodePosition>;
  clusters: Map<GraphNodeId, { label: string; x: number; y: number; width: number; height: number }>;
  width: number;
  height: number;
}

export function nodeDimensions(
  node: GraphRenderNode,
): { width: number; height: number } {
  if (node.kind === "cluster") return { width: 180, height: 40 };
  if (node.kind === "generator") return { width: 200, height: 56 };
  if (node.kind === "ghost") return { width: 180, height: 40 };
  return { width: 200, height: 44 };
}

export function runDagreLayout(
  graph: GraphRenderModel,
  options: { rankdir?: "LR" | "TB"; selectedCollectionIds?: string[] } = {},
): LayoutResult {
  const g = new dagre.graphlib.Graph({ compound: true });
  g.setGraph({
    rankdir: options.rankdir ?? "LR",
    nodesep: 28,
    ranksep: 80,
    marginx: 24,
    marginy: 24,
  });
  g.setDefaultEdgeLabel(() => ({}));
  const selectedCollectionIds = options.selectedCollectionIds ?? [];
  const clusterLabels = new Map<GraphNodeId, string>();

  for (const node of graph.nodes.values()) {
    if (node.kind === "cluster") continue;
    const cluster = getGraphNodeClusterInfo(node, selectedCollectionIds);
    if (!cluster) continue;
    if (!g.hasNode(cluster.id)) {
      g.setNode(cluster.id, { label: cluster.label });
    }
    clusterLabels.set(cluster.id, cluster.label);
  }

  for (const node of graph.nodes.values()) {
    const dims = nodeDimensions(node);
    g.setNode(node.id, { width: dims.width, height: dims.height });
    const cluster =
      node.kind === "cluster"
        ? null
        : getGraphNodeClusterInfo(node, selectedCollectionIds);
    if (cluster) {
      g.setParent(node.id, cluster.id);
    }
  }

  for (const edge of graph.edges.values()) {
    if (g.hasNode(edge.from) && g.hasNode(edge.to)) {
      g.setEdge(edge.from, edge.to);
    }
  }

  dagre.layout(g);

  const positions = new Map<GraphNodeId, NodePosition>();
  const clusters = new Map<GraphNodeId, { label: string; x: number; y: number; width: number; height: number }>();
  let maxX = 0;
  let maxY = 0;
  for (const id of graph.nodes.keys()) {
    const laidOut = g.node(id);
    if (!laidOut) continue;
    const x = laidOut.x - laidOut.width / 2;
    const y = laidOut.y - laidOut.height / 2;
    positions.set(id, { x, y, width: laidOut.width, height: laidOut.height });
    maxX = Math.max(maxX, x + laidOut.width);
    maxY = Math.max(maxY, y + laidOut.height);
  }

  for (const [clusterId, label] of clusterLabels) {
    const laidOut = g.node(clusterId);
    if (!laidOut?.width || !laidOut?.height) continue;
    clusters.set(clusterId, {
      label,
      x: laidOut.x - laidOut.width / 2,
      y: laidOut.y - laidOut.height / 2,
      width: laidOut.width,
      height: laidOut.height,
    });
  }

  return { positions, clusters, width: maxX, height: maxY };
}
