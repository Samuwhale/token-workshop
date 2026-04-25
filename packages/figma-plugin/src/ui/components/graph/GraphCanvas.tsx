import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeMouseHandler,
  type IsValidConnection,
  type Node,
  type NodeMouseHandler,
  type OnConnect,
} from "@xyflow/react";
import { dispatchToast } from "../../shared/toastBus";
import { wouldCreateAliasCycle } from "./graphScope";
import { NodeContextMenu, type NodeContextMenuItem } from "./NodeContextMenu";
import type { GraphModel, GraphNodeId } from "@tokenmanager/core";
import type {
  GraphRenderEdge,
  GraphRenderModel,
  GraphRenderNode,
} from "./graphClusters";
import { TokenNode } from "./nodes/TokenNode";
import { GeneratorNode } from "./nodes/GeneratorNode";
import { GhostNode } from "./nodes/GhostNode";
import { ClusterNode } from "./nodes/ClusterNode";
import { AliasEdge as AliasEdgeComponent } from "./edges/AliasEdge";
import { GeneratorSourceEdge } from "./edges/GeneratorSourceEdge";
import { GeneratorProducesEdge } from "./edges/GeneratorProducesEdge";
import { runDagreLayout, nodeDimensions } from "./graphLayout";
import "@xyflow/react/dist/style.css";

interface GraphCanvasProps {
  graph: GraphRenderModel;
  interactionGraph: GraphModel;
  collectionModeCountById: Map<string, number>;
  focusNodeId: GraphNodeId | null;
  highlightEdgeId: string | null;
  selectedCollectionIds: string[];
  onSelectToken: (path: string, collectionId: string) => void;
  onSelectGenerator: (generatorId: string) => void;
  onFocusNode: (nodeId: GraphNodeId) => void;
  onExpandCluster: (clusterId: GraphNodeId) => void;
  onRequestDeleteToken?: (path: string, collectionId: string) => void;
  onRequestDeleteGenerator?: (generatorId: string) => void;
  onRequestRewire?: (params: {
    sourceNodeId: GraphNodeId;
    targetNodeId: GraphNodeId;
    screenX: number;
    screenY: number;
  }) => void;
  onRequestDetach?: (params: {
    edgeId: string;
    screenX: number;
    screenY: number;
  }) => void;
  resetViewToken: number;
  editingEnabled?: boolean;
}

const NODE_TYPES = {
  token: TokenNode,
  generator: GeneratorNode,
  ghost: GhostNode,
  cluster: ClusterNode,
};

const EDGE_TYPES = {
  alias: AliasEdgeComponent,
  "generator-source": GeneratorSourceEdge,
  "generator-produces": GeneratorProducesEdge,
};

export function GraphCanvas(props: GraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <GraphCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function GraphCanvasInner({
  graph,
  interactionGraph,
  collectionModeCountById,
  focusNodeId,
  highlightEdgeId,
  selectedCollectionIds,
  onSelectToken,
  onSelectGenerator,
  onFocusNode,
  onExpandCluster,
  onRequestDeleteToken,
  onRequestDeleteGenerator,
  onRequestRewire,
  onRequestDetach,
  resetViewToken,
  editingEnabled = false,
}: GraphCanvasProps) {
  const reactFlow = useReactFlow();
  const lastFingerprintRef = useRef<string | null>(null);
  const lastPointerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    items: NodeContextMenuItem[];
  } | null>(null);

  // Track screen-space pointer for popover anchoring on connect/Backspace.
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      lastPointerRef.current = { x: event.clientX, y: event.clientY };
    };
    document.addEventListener("pointermove", onMove);
    return () => document.removeEventListener("pointermove", onMove);
  }, []);

  const layout = useMemo(
    () => runDagreLayout(graph, { rankdir: "LR", selectedCollectionIds }),
    [graph, selectedCollectionIds],
  );

  const nodes = useMemo(() => {
    const rfNodes: Node[] = [];
    for (const [clusterId, cluster] of layout.clusters) {
      rfNodes.push({
        id: `region:${clusterId}`,
        type: "cluster",
        position: { x: cluster.x, y: cluster.y },
        width: cluster.width,
        height: cluster.height,
        data: {
          cluster: {
            kind: "cluster",
            id: clusterId,
            label: cluster.label,
            count: 0,
          },
          variant: "region",
        },
        selectable: false,
        draggable: false,
        connectable: false,
        focusable: false,
        style: { zIndex: -10, pointerEvents: "none" },
      });
    }
    for (const node of graph.nodes.values()) {
      const pos = layout.positions.get(node.id) ?? { x: 0, y: 0 };
      const dims = nodeDimensions(node);
      rfNodes.push(buildRfNode(node, pos, dims, focusNodeId));
    }
    return rfNodes;
  }, [focusNodeId, graph, layout.clusters, layout.positions]);

  const edges = useMemo(() => {
    const rfEdges: Edge[] = [];
    for (const edge of graph.edges.values()) {
      rfEdges.push(buildRfEdge(edge, graph, collectionModeCountById, highlightEdgeId));
    }
    return rfEdges;
  }, [collectionModeCountById, graph, highlightEdgeId]);

  // Fit view whenever fingerprint changes or user asks for reset
  useEffect(() => {
    if (lastFingerprintRef.current === graph.fingerprint) return;
    lastFingerprintRef.current = graph.fingerprint;
    const timer = window.setTimeout(() => {
      reactFlow.fitView({ padding: 0.2, duration: 180 });
    }, 30);
    return () => window.clearTimeout(timer);
  }, [graph.fingerprint, reactFlow]);

  useEffect(() => {
    if (resetViewToken === 0) return;
    reactFlow.fitView({ padding: 0.2, duration: 180 });
  }, [resetViewToken, reactFlow]);

  // Center on focus node when it changes
  useEffect(() => {
    if (!focusNodeId) return;
    const node = reactFlow.getNode(focusNodeId);
    if (!node) return;
    reactFlow.setCenter(
      node.position.x + (node.measured?.width ?? 200) / 2,
      node.position.y + (node.measured?.height ?? 44) / 2,
      { zoom: 1, duration: 200 },
    );
  }, [focusNodeId, reactFlow]);

  const handleNodeClick: NodeMouseHandler = (_event, rfNode) => {
    const node = graph.nodes.get(rfNode.id);
    if (!node) return;
    if (node.kind === "token") onSelectToken(node.path, node.collectionId);
    else if (node.kind === "generator") onSelectGenerator(node.generatorId);
    else if (node.kind === "cluster") onExpandCluster(node.id);
  };

  const copyToClipboard = useCallback((value: string) => {
    navigator.clipboard
      .writeText(value)
      .then(() => dispatchToast("Copied to clipboard", "success"))
      .catch(() => dispatchToast("Could not copy to clipboard", "error"));
  }, []);

  const isValidConnection: IsValidConnection = useCallback(
    (connection) => {
      if (!editingEnabled) return false;
      const { source, target } = connection;
      if (!source || !target || source === target) return false;
      const sourceNode = interactionGraph.nodes.get(source);
      const targetNode = interactionGraph.nodes.get(target);
      if (!sourceNode || !targetNode) return false;
      if (sourceNode.kind !== "token" || targetNode.kind !== "token") {
        return false;
      }
      // Type compatibility: both tokens must share $type (DTCG strict).
      if (
        sourceNode.$type &&
        targetNode.$type &&
        sourceNode.$type !== targetNode.$type
      ) {
        return false;
      }
      // Cycle guard: adding upstream=target, downstream=source.
      if (wouldCreateAliasCycle(interactionGraph, target, source)) {
        return false;
      }
      return true;
    },
    [interactionGraph, editingEnabled],
  );

  const handleConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (!editingEnabled) return;
      const { source, target } = connection;
      if (!source || !target) return;
      const sourceNode = interactionGraph.nodes.get(source);
      const targetNode = interactionGraph.nodes.get(target);
      if (
        !sourceNode ||
        !targetNode ||
        sourceNode.kind !== "token" ||
        targetNode.kind !== "token"
      ) {
        return;
      }
      if (
        sourceNode.$type &&
        targetNode.$type &&
        sourceNode.$type !== targetNode.$type
      ) {
        dispatchToast(
          `${capitalize(sourceNode.$type)} token can't alias a ${targetNode.$type} token.`,
          "error",
        );
        return;
      }
      const cycle = wouldCreateAliasCycle(interactionGraph, target, source);
      if (cycle) {
        const formatted = cycle
          .map((id) => interactionGraph.nodes.get(id))
          .map((node) => {
            if (!node) return "?";
            if (node.kind === "token") return node.path;
            if (node.kind === "generator") return node.name;
            return node.path;
          })
          .join(" → ");
        dispatchToast(`Would create a cycle: ${formatted}`, "error");
        return;
      }
      onRequestRewire?.({
        sourceNodeId: source,
        targetNodeId: target,
        screenX: lastPointerRef.current.x,
        screenY: lastPointerRef.current.y,
      });
    },
    [interactionGraph, editingEnabled, onRequestRewire],
  );

  const handleEdgeClick: EdgeMouseHandler = useCallback((event, edge) => {
    // ReactFlow toggles selection by default; we just need to capture the
    // click so the canvas pane handler doesn't fire and clear the menu.
    event.stopPropagation();
    void edge;
  }, []);

  // Disable xyflow's default delete-on-Backspace; we open a confirm popover
  // instead and let the user choose modes.
  useEffect(() => {
    if (!editingEnabled) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== "Backspace" && event.key !== "Delete") return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const selectedEdge = reactFlow.getEdges().find((e) => e.selected);
      if (!selectedEdge || selectedEdge.type !== "alias") return;
      if (
        (selectedEdge.data as { aggregateCount?: number } | undefined)
          ?.aggregateCount
      ) {
        return;
      }
      event.preventDefault();
      onRequestDetach?.({
        edgeId: selectedEdge.id,
        screenX: lastPointerRef.current.x,
        screenY: lastPointerRef.current.y,
      });
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [editingEnabled, reactFlow, onRequestDetach]);

  const handleNodeContextMenu: NodeMouseHandler = useCallback(
    (event, rfNode) => {
      event.preventDefault();
      const node = graph.nodes.get(rfNode.id);
      if (!node) return;
      const items: NodeContextMenuItem[] = [];
      if (node.kind === "token") {
        items.push({
          label: "Open details",
          onClick: () => onSelectToken(node.path, node.collectionId),
        });
        items.push({
          label: "Focus on this",
          onClick: () => onFocusNode(node.id),
        });
        items.push({
          label: "Copy path",
          onClick: () => copyToClipboard(node.path),
        });
        items.push({
          label: "Copy alias reference",
          onClick: () => copyToClipboard(`{${node.path}}`),
        });
        if (onRequestDeleteToken) {
          items.push({
            label: "Delete token",
            danger: true,
            onClick: () => onRequestDeleteToken(node.path, node.collectionId),
          });
        }
      } else if (node.kind === "generator") {
        items.push({
          label: "Edit generator",
          onClick: () => onSelectGenerator(node.generatorId),
        });
        items.push({
          label: "Focus on this",
          onClick: () => onFocusNode(node.id),
        });
        if (onRequestDeleteGenerator) {
          items.push({
            label: "Delete generator",
            danger: true,
            onClick: () => onRequestDeleteGenerator(node.generatorId),
          });
        }
      } else if (node.kind === "cluster") {
        items.push({
          label: "Expand group",
          onClick: () => onExpandCluster(node.id),
        });
      } else {
        if (node.kind === "ghost") {
          items.push({
            label: "Copy path",
            onClick: () => copyToClipboard(node.path),
          });
        }
      }
      setContextMenu({ x: event.clientX, y: event.clientY, items });
    },
    [
      graph,
      onSelectToken,
      onSelectGenerator,
      onFocusNode,
      onExpandCluster,
      onRequestDeleteToken,
      onRequestDeleteGenerator,
      copyToClipboard,
    ],
  );

  return (
    <div className="tm-graph h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodeClick={handleNodeClick}
        onNodeContextMenu={handleNodeContextMenu}
        onPaneClick={() => setContextMenu(null)}
        onConnect={handleConnect}
        isValidConnection={isValidConnection}
        onEdgeClick={handleEdgeClick}
        deleteKeyCode={null}
        onlyRenderVisibleElements
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={false}
        nodesConnectable={editingEnabled}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="var(--color-figma-border)" gap={24} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
      {contextMenu ? (
        <NodeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      ) : null}
    </div>
  );
}

function buildRfNode(
  node: GraphRenderNode,
  position: { x: number; y: number },
  dims: { width: number; height: number },
  focusNodeId: GraphNodeId | null,
): Node {
  const isFocused = node.id === focusNodeId;
  if (node.kind === "token") {
    return {
      id: node.id,
      type: "token",
      position,
      width: dims.width,
      height: dims.height,
      data: { token: node, isFocused },
      selectable: true,
      draggable: false,
      connectable: true,
    };
  }
  if (node.kind === "generator") {
    return {
      id: node.id,
      type: "generator",
      position,
      width: dims.width,
      height: dims.height,
      data: { generator: node, isFocused },
      selectable: true,
      draggable: false,
      connectable: false,
    };
  }
  if (node.kind === "cluster") {
    return {
      id: node.id,
      type: "cluster",
      position,
      width: dims.width,
      height: dims.height,
      data: { cluster: node, variant: "pill" },
      selectable: true,
      draggable: false,
      connectable: false,
    };
  }
  return {
    id: node.id,
    type: "ghost",
    position,
    width: dims.width,
    height: dims.height,
    data: { ghost: node },
    selectable: false,
    draggable: false,
    connectable: false,
  };
}

function buildRfEdge(
  edge: GraphRenderEdge,
  graph: GraphRenderModel,
  collectionModeCountById: Map<string, number>,
  highlightEdgeId: string | null,
): Edge {
  const aggregateCount = edge.aggregateCount;
  const isHighlighted = Boolean(
    highlightEdgeId &&
      (edge.id === highlightEdgeId ||
        edge.sourceEdgeIds?.includes(highlightEdgeId)),
  );
  const base = {
    id: edge.id,
    source: edge.from,
    target: edge.to,
    type: edge.kind,
    markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
    data: { isHighlighted, aggregateCount },
  };
  if (edge.kind !== "alias") {
    return base;
  }
  const fromNode = graph.nodes.get(edge.from);
  const toNode = graph.nodes.get(edge.to);
  const isCrossCollection = Boolean(
    fromNode?.kind === "token" &&
      toNode?.kind === "token" &&
      fromNode.collectionId !== toNode.collectionId,
  );
  // Mode-count glyph uses the downstream token's collection mode count
  const totalCollectionModes =
    toNode?.kind === "token"
      ? collectionModeCountById.get(toNode.collectionId)
      : undefined;
  return {
    ...base,
    data: {
      ...base.data,
      edge,
      isCrossCollection,
      totalCollectionModes,
    },
  };
}

function capitalize(value: string): string {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);
}
