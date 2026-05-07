import {
  addEdge,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import type {
  TokenGeneratorDocument,
  TokenGeneratorDocumentNode,
  TokenGeneratorEdge,
  TokenGeneratorPortDescriptor,
  TokenGeneratorPreviewResult,
} from "@token-workshop/core";
import {
  checkTokenGeneratorConnection,
  getTokenGeneratorInputPorts,
  getTokenGeneratorOutputPorts,
} from "@token-workshop/core";
import type { TokenMapEntry } from "../../../shared/types";
import type { GraphIssue } from "./generatorGraphValidation";

export type GraphFlowNode = Node<
  {
    graphNode: TokenGeneratorDocumentNode;
    preview?: TokenGeneratorPreviewResult;
    issues?: GraphIssue[];
    detailsExpanded?: boolean;
    onToggleDetailsExpanded?: (nodeId: string) => void;
  },
  "graphNode"
>;

export type GraphFlowEdge = Edge<Record<string, never>>;

export function getNodeInputPorts(
  node: TokenGeneratorDocumentNode,
): TokenGeneratorPortDescriptor[] {
  return getTokenGeneratorInputPorts(node);
}

export function getNodeOutputPorts(
  node: TokenGeneratorDocumentNode,
): TokenGeneratorPortDescriptor[] {
  return getTokenGeneratorOutputPorts(node);
}

export function previewRelevantNodes(nodes: TokenGeneratorDocumentNode[]) {
  return nodes.map(({ position: _position, ...node }) => node);
}

export function toFlowNodes(
  generator: TokenGeneratorDocument,
  preview: TokenGeneratorPreviewResult | null,
  issues: GraphIssue[] = [],
  expandedNodeIds: Set<string> = new Set(),
  onToggleDetailsExpanded?: (nodeId: string) => void,
): GraphFlowNode[] {
  return generator.nodes.map((graphNode) => ({
    id: graphNode.id,
    type: "graphNode",
    position: graphNode.position,
    data: {
      graphNode,
      preview: preview ?? undefined,
      issues: issues.filter((issue) => issue.nodeId === graphNode.id),
      detailsExpanded: expandedNodeIds.has(graphNode.id),
      onToggleDetailsExpanded,
    },
  }));
}

export function graphWithFlowState(
  generator: TokenGeneratorDocument,
  nodes: GraphFlowNode[],
  edges: GraphFlowEdge[],
): TokenGeneratorDocument {
  return {
    ...generator,
    nodes: nodes.map((node) => ({
      ...node.data.graphNode,
      position: node.position,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      from: {
        nodeId: String(edge.source),
        port: String(edge.sourceHandle ?? "value"),
      },
      to: {
        nodeId: String(edge.target),
        port: String(edge.targetHandle ?? "value"),
      },
    })),
  };
}

export function toFlowEdges(edges: TokenGeneratorEdge[]): GraphFlowEdge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.from.nodeId,
    target: edge.to.nodeId,
    sourceHandle: edge.from.port,
    targetHandle: edge.to.port,
    animated: false,
  }));
}

export function createFlowEdgeFromConnection(
  connection: {
    source?: string | null;
    target?: string | null;
    sourceHandle?: string | null;
    targetHandle?: string | null;
  },
): GraphFlowEdge | null {
  if (!connection.source || !connection.target) return null;
  const sourceHandle = connection.sourceHandle ?? "value";
  const targetHandle = connection.targetHandle ?? "value";
  return {
    id: `${connection.source}-${sourceHandle}-${connection.target}-${targetHandle}`,
    source: connection.source,
    sourceHandle,
    target: connection.target,
    targetHandle,
  };
}

export function addSingleInputEdge(
  edges: GraphFlowEdge[],
  edge: GraphFlowEdge,
): GraphFlowEdge[] {
  const targetHandle = edge.targetHandle ?? "value";
  const edgesWithoutExistingInput = edges.filter(
    (existingEdge) =>
      existingEdge.target !== edge.target ||
      (existingEdge.targetHandle ?? "value") !== targetHandle,
  );
  return addEdge(edge, edgesWithoutExistingInput);
}

export function firstCompatibleEdge(
  generator: TokenGeneratorDocument,
  nodes: GraphFlowNode[],
  edges: GraphFlowEdge[],
  input: {
    sourceNodeId: string;
    sourcePort?: string;
    targetNodeId: string;
    targetPort?: string;
    replaceEdgeId?: string;
  },
): GraphFlowEdge | null {
  if (input.sourceNodeId === input.targetNodeId) return null;
  const sourceNode = nodes.find((node) => node.id === input.sourceNodeId)?.data.graphNode;
  const targetNode = nodes.find((node) => node.id === input.targetNodeId)?.data.graphNode;
  if (!sourceNode || !targetNode) return null;
  const sourcePorts = getNodeOutputPorts(sourceNode).filter(
    (port) => !input.sourcePort || port.id === input.sourcePort,
  );
  const targetPorts = getNodeInputPorts(targetNode).filter(
    (port) => !input.targetPort || port.id === input.targetPort,
  );
  const baseEdges = edges.filter((edge) => edge.id !== input.replaceEdgeId);
  for (const sourcePort of sourcePorts) {
    for (const targetPort of targetPorts) {
      const edge = makeGraphFlowEdge(
        input.sourceNodeId,
        sourcePort.id,
        input.targetNodeId,
        targetPort.id,
      );
      const nextEdges = addSingleInputEdge(baseEdges, edge);
      const candidateGenerator = graphWithFlowState(generator, nodes, nextEdges);
      const check = checkTokenGeneratorConnection(candidateGenerator, {
        sourceNodeId: edge.source,
        sourcePort: String(edge.sourceHandle ?? "value"),
        targetNodeId: edge.target,
        targetPort: String(edge.targetHandle ?? "value"),
        edges: candidateGenerator.edges,
      });
      if (check.valid) return edge;
    }
  }
  return null;
}

export function flowNodeFromPaletteItem(
  item: {
    kind: TokenGeneratorDocumentNode["kind"];
    label: string;
    defaults: Record<string, unknown>;
  },
  id: string,
  position: TokenGeneratorDocumentNode["position"],
): GraphFlowNode {
  const graphNode: TokenGeneratorDocumentNode = {
    id,
    kind: item.kind,
    label: item.label,
    position,
    data: { ...item.defaults },
  };
  return {
    id,
    type: "graphNode",
    position,
    data: { graphNode },
  };
}

export function withTokenInputTypes(
  nodes: GraphFlowNode[],
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>,
  defaultCollectionId: string,
): GraphFlowNode[] {
  return nodes.map((node) => {
    const graphNode = node.data.graphNode;
    if (graphNode.kind !== "tokenInput") return node;
    const nextGraphNode = graphNodeWithInferredTokenInputType(
      graphNode,
      perCollectionFlat,
      defaultCollectionId,
    );
    if (nextGraphNode === graphNode) return node;
    return {
      ...node,
      data: {
        ...node.data,
        graphNode: nextGraphNode,
      },
    };
  });
}

export function generatorWithInferredTokenInputTypes(
  generator: TokenGeneratorDocument,
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>,
): TokenGeneratorDocument {
  return {
    ...generator,
    nodes: generator.nodes.map((node) =>
      graphNodeWithInferredTokenInputType(
        node,
        perCollectionFlat,
        generator.targetCollectionId,
      ),
    ),
  };
}

function makeGraphFlowEdge(
  sourceNodeId: string,
  sourcePort: string,
  targetNodeId: string,
  targetPort: string,
): GraphFlowEdge {
  return {
    id: `${sourceNodeId}-${sourcePort}-${targetNodeId}-${targetPort}`,
    source: sourceNodeId,
    sourceHandle: sourcePort,
    target: targetNodeId,
    targetHandle: targetPort,
  };
}

export function deleteNodeAndPreserveFlow(
  generator: TokenGeneratorDocument,
  nodes: GraphFlowNode[],
  edges: GraphFlowEdge[],
  nodeId: string,
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>,
): { nodes: GraphFlowNode[]; edges: GraphFlowEdge[]; reconnectedEdgeCount: number } | null {
  const deletedNode = nodes.find((node) => node.id === nodeId);
  if (!deletedNode) return null;
  const nextNodes = nodes.filter((node) => node.id !== nodeId);
  const validationNodes = withTokenInputTypes(
    nextNodes,
    perCollectionFlat,
    generator.targetCollectionId,
  );
  const incomingEdges = edges.filter((edge) => edge.target === nodeId);
  const outgoingEdges = edges.filter((edge) => edge.source === nodeId);
  let nextEdges = edges.filter(
    (edge) => edge.source !== nodeId && edge.target !== nodeId,
  );
  let reconnectedEdgeCount = 0;
  for (const incomingEdge of incomingEdges) {
    for (const outgoingEdge of outgoingEdges) {
      const edge = firstCompatibleEdge(generator, validationNodes, nextEdges, {
        sourceNodeId: incomingEdge.source,
        sourcePort: String(incomingEdge.sourceHandle ?? "value"),
        targetNodeId: outgoingEdge.target,
        targetPort: String(outgoingEdge.targetHandle ?? "value"),
      });
      if (!edge) continue;
      nextEdges = addSingleInputEdge(nextEdges, edge);
      reconnectedEdgeCount += 1;
    }
  }
  return { nodes: nextNodes, edges: nextEdges, reconnectedEdgeCount };
}

export function cleanGraphEdges(
  generator: TokenGeneratorDocument,
  nodes: GraphFlowNode[],
  edges: GraphFlowEdge[],
): GraphFlowEdge[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node.data.graphNode]));
  let nextEdges: GraphFlowEdge[] = [];
  for (const edge of edges) {
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);
    if (!sourceNode || !targetNode) continue;
    if (
      !getNodeOutputPorts(sourceNode).some(
        (port) => port.id === (edge.sourceHandle ?? "value"),
      )
    ) {
      continue;
    }
    if (
      !getNodeInputPorts(targetNode).some(
        (port) => port.id === (edge.targetHandle ?? "value"),
      )
    ) {
      continue;
    }
    const candidateEdges = addSingleInputEdge(nextEdges, edge);
    const candidateGenerator = graphWithFlowState(
      generator,
      nodes,
      candidateEdges,
    );
    const check = checkTokenGeneratorConnection(candidateGenerator, {
      sourceNodeId: edge.source,
      sourcePort: String(edge.sourceHandle ?? "value"),
      targetNodeId: edge.target,
      targetPort: String(edge.targetHandle ?? "value"),
      edges: candidateGenerator.edges,
    });
    if (check.valid) {
      nextEdges = candidateEdges;
    }
  }
  return nextEdges;
}

export function sameEdgeList(a: GraphFlowEdge[], b: GraphFlowEdge[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((edge, index) => {
    const other = b[index];
    return (
      other &&
      edge.id === other.id &&
      edge.source === other.source &&
      edge.target === other.target &&
      edge.sourceHandle === other.sourceHandle &&
      edge.targetHandle === other.targetHandle
    );
  });
}

export function hasStructuralNodeChange(
  changes: NodeChange<GraphFlowNode>[],
): boolean {
  return changes.some(
    (change) =>
      change.type === "add" ||
      change.type === "remove" ||
      (change.type === "position" && Boolean(change.dragging === false)),
  );
}

export function changesOnlyCommitNodePositions(
  changes: NodeChange<GraphFlowNode>[],
): boolean {
  return (
    changes.length > 0 &&
    changes.every(
      (change) =>
        change.type === "position" && Boolean(change.dragging === false),
    )
  );
}

export function hasStructuralEdgeChange(
  changes: EdgeChange<GraphFlowEdge>[],
): boolean {
  return changes.some(
    (change) => change.type === "add" || change.type === "remove",
  );
}

function graphNodeWithInferredTokenInputType(
  graphNode: TokenGeneratorDocumentNode,
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>,
  defaultCollectionId: string,
): TokenGeneratorDocumentNode {
  if (graphNode.kind !== "tokenInput") return graphNode;
  const collectionId = String(
    graphNode.data.collectionId ?? defaultCollectionId,
  );
  const path = String(graphNode.data.path ?? "");
  const tokenType = perCollectionFlat[collectionId]?.[path]?.$type;
  if (tokenType === graphNode.data.tokenType) return graphNode;
  if (!tokenType) {
    if (!("tokenType" in graphNode.data)) return graphNode;
    const data = { ...graphNode.data };
    delete data.tokenType;
    return {
      ...graphNode,
      data,
    };
  }
  return {
    ...graphNode,
    data: {
      ...graphNode.data,
      tokenType,
    },
  };
}
