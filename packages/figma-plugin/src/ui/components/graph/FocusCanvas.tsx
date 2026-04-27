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
  type OnConnectEnd,
  type OnConnectStart,
  type OnSelectionChangeFunc,
} from "@xyflow/react";
import { dispatchToast } from "../../shared/toastBus";
import { wouldCreateAliasCycle } from "./graphScope";
import { NodeContextMenu, type NodeContextMenuItem } from "./NodeContextMenu";
import { SelectionActionBar } from "./SelectionActionBar";
import { useGraphKeyboardNav } from "../../hooks/useGraphKeyboardNav";
import {
  useFocusedSubgraph,
  type GraphHopDepthSetting,
} from "../../hooks/useFocusedSubgraph";
import type { GraphModel, GraphNodeId } from "@tokenmanager/core";
import {
  bucketKeyFromClusterId,
  type GraphRenderEdge,
  type GraphRenderModel,
  type GraphRenderNode,
} from "./graphClusters";
import { TokenNode } from "./nodes/TokenNode";
import { GeneratorNode } from "./nodes/GeneratorNode";
import { GhostNode } from "./nodes/GhostNode";
import { ClusterNode } from "./nodes/ClusterNode";
import { LaneLabelNode } from "./nodes/LaneLabelNode";
import { AliasEdge as AliasEdgeComponent } from "./edges/AliasEdge";
import { GeneratorSourceEdge } from "./edges/GeneratorSourceEdge";
import { GeneratorProducesEdge } from "./edges/GeneratorProducesEdge";
import { layoutFocused, nodeDimensions, type LayoutResult } from "./graphLayout";
import { collectionAccentHue } from "./collectionAccent";
import "@xyflow/react/dist/style.css";

interface FocusCanvasProps {
  fullGraph: GraphModel;
  focusId: GraphNodeId | null;
  hopDepth: GraphHopDepthSetting;
  scopeCollectionIds: string[];
  collectionModeCountById: Map<string, number>;
  selectedEdgeId: string | null;
  onSelectToken: (path: string, collectionId: string) => void;
  onSelectGenerator: (generatorId: string) => void;
  onActivateToken: (path: string, collectionId: string) => void;
  onActivateGenerator: (generatorId: string) => void;
  onFocusNode: (nodeId: GraphNodeId) => void;
  onRequestDeleteToken?: (path: string, collectionId: string) => void;
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
  onSelectEdge: (edgeId: string | null) => void;
  onSelectionChange?: (selectedNodeIds: GraphNodeId[]) => void;
  onExpandMoreHops?: () => void;
  onClearFocus?: () => void;
  onRequestCreateAliasToken?: (params: {
    sourceNodeId: GraphNodeId;
    screenX: number;
    screenY: number;
  }) => void;
  editingEnabled?: boolean;
}

const NODE_TYPES = {
  token: TokenNode,
  generator: GeneratorNode,
  ghost: GhostNode,
  cluster: ClusterNode,
  lane: LaneLabelNode,
};

const EDGE_TYPES = {
  alias: AliasEdgeComponent,
  "generator-source": GeneratorSourceEdge,
  "generator-produces": GeneratorProducesEdge,
};

export function FocusCanvas(props: FocusCanvasProps) {
  return (
    <ReactFlowProvider>
      <FocusCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function FocusCanvasInner({
  fullGraph,
  focusId,
  hopDepth,
  scopeCollectionIds,
  collectionModeCountById,
  selectedEdgeId,
  onSelectToken,
  onSelectGenerator,
  onActivateToken,
  onActivateGenerator,
  onFocusNode,
  onRequestDeleteToken,
  onRequestRewire,
  onRequestDetach,
  onSelectEdge,
  onSelectionChange,
  onExpandMoreHops,
  onClearFocus,
  onRequestCreateAliasToken,
  editingEnabled = false,
}: FocusCanvasProps) {
  const reactFlow = useReactFlow();
  const lastPointerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const connectStartRef = useRef<GraphNodeId | null>(null);
  const connectMadeWireRef = useRef(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    items: NodeContextMenuItem[];
  } | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<GraphNodeId | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<GraphNodeId[]>([]);
  const [expandedBuckets, setExpandedBuckets] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  useEffect(() => {
    setExpandedBuckets(new Set());
  }, [focusId]);

  // When the focus jumps (e.g. user clicks a token in the inspector while a
  // multi-select is active), React Flow's internal node selection won't clear
  // by itself. Without this, the parent's `selectedTokenIds` would resync to
  // the still-selected nodes on the next interaction and the compare view
  // would flicker back. Clear both states whenever focus moves.
  useEffect(() => {
    setSelectedNodeIds([]);
    onSelectionChange?.([]);
    reactFlow.setNodes((current) =>
      current.map((n) => (n.selected ? { ...n, selected: false } : n)),
    );
  }, [focusId, onSelectionChange, reactFlow]);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      lastPointerRef.current = { x: event.clientX, y: event.clientY };
    };
    document.addEventListener("pointermove", onMove);
    return () => document.removeEventListener("pointermove", onMove);
  }, []);

  const { subgraph, isEmpty, hasMoreHops } = useFocusedSubgraph(
    fullGraph,
    focusId,
    hopDepth,
    scopeCollectionIds,
    expandedBuckets,
  );

  const layout: LayoutResult = useMemo(
    () =>
      focusId
        ? layoutFocused(subgraph, focusId)
        : {
            positions: new Map(),
            lanes: [],
            focusCollectionId: null,
            width: 0,
            height: 0,
          },
    [subgraph, focusId],
  );

  // BFS the hovered node's connected subtree, but don't expand *through* the
  // focus node — otherwise every hover would sweep up the whole subgraph via
  // the focus pivot and the dim would be a no-op.
  const relatedNodeIds = useMemo<ReadonlySet<GraphNodeId> | null>(() => {
    if (!hoveredNodeId) return null;
    if (hoveredNodeId === focusId) return null;
    if (!subgraph.nodes.has(hoveredNodeId)) return null;
    const related = new Set<GraphNodeId>([hoveredNodeId]);
    const queue: GraphNodeId[] = [hoveredNodeId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === focusId) continue;
      for (const edgeId of subgraph.outgoing.get(current) ?? []) {
        const edge = subgraph.edges.get(edgeId);
        if (!edge || related.has(edge.to)) continue;
        related.add(edge.to);
        queue.push(edge.to);
      }
      for (const edgeId of subgraph.incoming.get(current) ?? []) {
        const edge = subgraph.edges.get(edgeId);
        if (!edge || related.has(edge.from)) continue;
        related.add(edge.from);
        queue.push(edge.from);
      }
    }
    return related;
  }, [hoveredNodeId, focusId, subgraph]);

  const expandCluster = useCallback((clusterId: GraphNodeId) => {
    if (!focusId) return;
    const bucketKey = bucketKeyFromClusterId(focusId, clusterId);
    if (!bucketKey) return;
    setExpandedBuckets((current) => {
      const next = new Set(current);
      next.add(bucketKey);
      return next;
    });
  }, [focusId]);

  const nodes = useMemo(() => {
    const rfNodes: Node[] = [];
    // Lane labels render first (lower in the array → painted under tokens).
    // ID keys on (collection, columnX) so React Flow keeps the same DOM node
    // when hop depth changes the band index but not the band's column.
    layout.lanes.forEach((lane) => {
      rfNodes.push({
        id: `lane:${lane.collectionId}:${Math.round(lane.x)}`,
        type: "lane",
        position: { x: lane.x, y: lane.y },
        width: lane.width,
        height: lane.height,
        data: {
          label: lane.label,
          accentColor: collectionAccentHue(lane.collectionId),
          width: lane.width,
          height: lane.height,
        },
        selectable: false,
        draggable: false,
        connectable: false,
        focusable: false,
      });
    });
    for (const node of subgraph.nodes.values()) {
      const pos = layout.positions.get(node.id) ?? { x: 0, y: 0 };
      const dims = nodeDimensions(node);
      const dimmed = relatedNodeIds != null && !relatedNodeIds.has(node.id);
      rfNodes.push(
        buildRfNode(node, pos, dims, focusId, expandCluster, dimmed),
      );
    }
    return rfNodes;
  }, [
    focusId,
    subgraph,
    layout.positions,
    layout.lanes,
    expandCluster,
    relatedNodeIds,
  ]);

  const edges = useMemo(() => {
    const rfEdges: Edge[] = [];
    for (const edge of subgraph.edges.values()) {
      const inHoverSubtree =
        relatedNodeIds != null &&
        relatedNodeIds.has(edge.from) &&
        relatedNodeIds.has(edge.to);
      const isEmphasized = inHoverSubtree;
      const dimmed = relatedNodeIds != null && !inHoverSubtree;
      rfEdges.push(
        buildRfEdge(
          edge,
          subgraph,
          collectionModeCountById,
          isEmphasized,
          dimmed,
        ),
      );
    }
    return rfEdges;
  }, [relatedNodeIds, collectionModeCountById, subgraph]);

  // Pan to the focus node without changing zoom. Deliberately no `fitView`
  // on data change — that was the source of "where did my graph go?" jumps
  // mid-edit. Layout positions are already deterministic in focus mode.
  useEffect(() => {
    if (!focusId) return;
    const node = reactFlow.getNode(focusId);
    if (!node) return;
    const currentZoom = reactFlow.getZoom();
    reactFlow.setCenter(
      node.position.x + (node.measured?.width ?? 200) / 2,
      node.position.y + (node.measured?.height ?? 44) / 2,
      { zoom: currentZoom, duration: 200 },
    );
  }, [focusId, reactFlow]);

  const openNodeDetails = useCallback(
    (nodeId: GraphNodeId) => {
      const node = subgraph.nodes.get(nodeId);
      if (!node) return;
      if (node.kind === "token") onSelectToken(node.path, node.collectionId);
      else if (node.kind === "generator") onSelectGenerator(node.generatorId);
    },
    [subgraph, onSelectGenerator, onSelectToken],
  );

  const handleNodeClick: NodeMouseHandler = (event, rfNode) => {
    if (event.shiftKey || event.metaKey || event.ctrlKey) return;
    openNodeDetails(rfNode.id);
  };

  const activateNode = useCallback(
    (nodeId: GraphNodeId) => {
      const node = subgraph.nodes.get(nodeId);
      if (!node) return;
      if (node.kind === "token") {
        onActivateToken(node.path, node.collectionId);
      } else if (node.kind === "generator") {
        onActivateGenerator(node.generatorId);
      }
    },
    [subgraph, onActivateToken, onActivateGenerator],
  );

  const handleNodeDoubleClick: NodeMouseHandler = (event, rfNode) => {
    event.preventDefault();
    activateNode(rfNode.id);
  };

  const handleNodeMouseEnter: NodeMouseHandler = useCallback((_event, rfNode) => {
    setHoveredNodeId(rfNode.id);
  }, []);

  const handleNodeMouseLeave: NodeMouseHandler = useCallback(() => {
    setHoveredNodeId(null);
  }, []);

  useGraphKeyboardNav({
    enabled: true,
    layout,
    graph: subgraph,
    onActivate: activateNode,
  });

  const handleSelectionChange: OnSelectionChangeFunc = useCallback(
    ({ nodes: selNodes }) => {
      const ids = selNodes.map((n) => n.id);
      setSelectedNodeIds(ids);
      onSelectionChange?.(ids);
    },
    [onSelectionChange],
  );

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
      const sourceNode = fullGraph.nodes.get(source);
      const targetNode = fullGraph.nodes.get(target);
      if (!sourceNode || !targetNode) return false;
      if (sourceNode.kind !== "token" || targetNode.kind !== "token") {
        return false;
      }
      if (
        sourceNode.$type &&
        targetNode.$type &&
        sourceNode.$type !== targetNode.$type
      ) {
        return false;
      }
      if (wouldCreateAliasCycle(fullGraph, target, source)) {
        return false;
      }
      return true;
    },
    [fullGraph, editingEnabled],
  );

  const handleConnectStart: OnConnectStart = useCallback((_event, params) => {
    connectStartRef.current = (params.nodeId as GraphNodeId | null) ?? null;
    connectMadeWireRef.current = false;
  }, []);

  const handleConnectEnd: OnConnectEnd = useCallback(
    (event) => {
      const sourceNodeId = connectStartRef.current;
      connectStartRef.current = null;
      if (!editingEnabled) return;
      if (!sourceNodeId) return;
      if (connectMadeWireRef.current) return;
      const sourceNode = fullGraph.nodes.get(sourceNodeId);
      if (!sourceNode || sourceNode.kind !== "token") return;
      // Drop only counts as "create" when it lands on the pane background, not
      // on another node/handle (those go through onConnect).
      const target = event.target as HTMLElement | null;
      const droppedOnPane = Boolean(target?.closest?.(".react-flow__pane"));
      if (!droppedOnPane) return;
      const touchEvent = event as TouchEvent;
      const { x, y } =
        "changedTouches" in event && touchEvent.changedTouches.length > 0
          ? {
              x: touchEvent.changedTouches[0].clientX,
              y: touchEvent.changedTouches[0].clientY,
            }
          : {
              x: (event as MouseEvent).clientX,
              y: (event as MouseEvent).clientY,
            };
      onRequestCreateAliasToken?.({
        sourceNodeId,
        screenX: x,
        screenY: y,
      });
    },
    [editingEnabled, fullGraph, onRequestCreateAliasToken],
  );

  const handleConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (!editingEnabled) return;
      const { source, target } = connection;
      if (!source || !target) return;
      connectMadeWireRef.current = true;
      const sourceNode = fullGraph.nodes.get(source);
      const targetNode = fullGraph.nodes.get(target);
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
      const cycle = wouldCreateAliasCycle(fullGraph, target, source);
      if (cycle) {
        const formatted = cycle
          .map((id) => fullGraph.nodes.get(id))
          .map((node) => {
            if (!node) return "?";
            if (node.kind === "token") return node.path;
            if (node.kind === "generator") return node.name;
            if (node.kind === "derivation") return `${node.derivedPath} (modifier)`;
            return node.path;
          })
          .join(" → ");
        dispatchToast(`Would create a circular reference: ${formatted}`, "error");
        return;
      }
      onRequestRewire?.({
        sourceNodeId: source,
        targetNodeId: target,
        screenX: lastPointerRef.current.x,
        screenY: lastPointerRef.current.y,
      });
    },
    [fullGraph, editingEnabled, onRequestRewire],
  );

  const handleEdgeClick: EdgeMouseHandler = useCallback(
    (event, edge) => {
      event.stopPropagation();
      onSelectEdge(edge.id);
    },
    [onSelectEdge],
  );

  const handlePaneClick = useCallback(() => {
    setContextMenu(null);
    onSelectEdge(null);
    onClearFocus?.();
  }, [onSelectEdge, onClearFocus]);

  useEffect(() => {
    if (!onClearFocus) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      // If a popover/menu is open, let it handle Escape itself.
      if (contextMenu) return;
      if (document.querySelector('[role="dialog"]')) return;
      event.preventDefault();
      onSelectEdge(null);
      onClearFocus();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClearFocus, onSelectEdge, contextMenu]);

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
      const node = subgraph.nodes.get(rfNode.id);
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
          onClick: () => onActivateGenerator(node.generatorId),
        });
        items.push({
          label: "Focus on this",
          onClick: () => onFocusNode(node.id),
        });
      } else if (node.kind === "ghost") {
        items.push({
          label: "Copy path",
          onClick: () => copyToClipboard(node.path),
        });
      }
      setContextMenu({ x: event.clientX, y: event.clientY, items });
    },
    [
      subgraph,
      onSelectToken,
      onActivateGenerator,
      onFocusNode,
      onRequestDeleteToken,
      copyToClipboard,
    ],
  );

  const selectedTokenNodes = useMemo(() => {
    const out: { path: string; collectionId: string; nodeId: GraphNodeId }[] = [];
    for (const id of selectedNodeIds) {
      const node = subgraph.nodes.get(id);
      if (node?.kind === "token") {
        out.push({ path: node.path, collectionId: node.collectionId, nodeId: id });
      }
    }
    return out;
  }, [subgraph, selectedNodeIds]);

  const handleClearSelection = useCallback(() => {
    reactFlow.setNodes((current) =>
      current.map((n) => (n.selected ? { ...n, selected: false } : n)),
    );
  }, [reactFlow]);

  // Mark the externally-tracked selectedEdgeId so it stays visually selected
  // when GraphPanel mirrors edge selection for the inspector.
  const decoratedEdges = useMemo(
    () =>
      selectedEdgeId
        ? edges.map((e) =>
            e.id === selectedEdgeId ? { ...e, selected: true } : e,
          )
        : edges,
    [edges, selectedEdgeId],
  );

  if (isEmpty) {
    return (
      <div className="tm-graph relative flex h-full w-full items-center justify-center">
        <div className="text-secondary text-[var(--color-figma-text-secondary)]">
          This token isn’t in the current scope.
        </div>
      </div>
    );
  }

  return (
    <div className="tm-graph relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={decoratedEdges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onNodeMouseEnter={handleNodeMouseEnter}
        onNodeMouseLeave={handleNodeMouseLeave}
        onNodeContextMenu={handleNodeContextMenu}
        onPaneClick={handlePaneClick}
        onConnectStart={handleConnectStart}
        onConnectEnd={handleConnectEnd}
        onConnect={handleConnect}
        isValidConnection={isValidConnection}
        onEdgeClick={handleEdgeClick}
        onSelectionChange={handleSelectionChange}
        deleteKeyCode={null}
        multiSelectionKeyCode={["Shift", "Meta"]}
        selectionOnDrag
        selectionKeyCode="Shift"
        onlyRenderVisibleElements
        // `fitView` here is xyflow's mount-only initial fit. The data-change
        // refit useEffect was deliberately removed; once the user pans/zooms,
        // their viewport is preserved across edits.
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={false}
        nodesConnectable={editingEnabled}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          color="var(--color-figma-border)"
          gap={20}
          size={1}
          style={{ background: "var(--color-figma-bg)" }}
        />
        <Controls
          showInteractive={false}
          showFitView={false}
          position="bottom-right"
          className="tm-graph-controls"
        />
      </ReactFlow>
      {selectedTokenNodes.length >= 2 ? (
        <SelectionActionBar
          tokens={selectedTokenNodes}
          onClear={handleClearSelection}
          onCopyPaths={() =>
            copyToClipboard(
              selectedTokenNodes.map((n) => n.path).join("\n"),
            )
          }
          onDelete={
            onRequestDeleteToken
              ? () => {
                  for (const n of selectedTokenNodes) {
                    onRequestDeleteToken(n.path, n.collectionId);
                  }
                  handleClearSelection();
                }
              : undefined
          }
        />
      ) : null}
      {contextMenu ? (
        <NodeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      ) : null}
      {hasMoreHops && onExpandMoreHops ? (
        <button
          type="button"
          onClick={onExpandMoreHops}
          className="pointer-events-auto absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-full bg-[var(--color-figma-bg)]/95 px-3 py-1 text-secondary text-[var(--color-figma-text-secondary)] shadow-sm backdrop-blur-sm hover:bg-[var(--surface-hover)] hover:text-[var(--color-figma-text)]"
          title="Show one more hop in each direction"
        >
          Show more
        </button>
      ) : null}
    </div>
  );
}

function buildRfNode(
  node: GraphRenderNode,
  position: { x: number; y: number },
  dims: { width: number; height: number },
  focusId: GraphNodeId | null,
  expandCluster: (clusterId: GraphNodeId) => void,
  dimmed: boolean,
): Node {
  const isFocused = node.id === focusId;
  if (node.kind === "token") {
    return {
      id: node.id,
      type: "token",
      position,
      width: dims.width,
      height: dims.height,
      data: { token: node, isFocused, dimmed },
      selectable: true,
      draggable: false,
      connectable: true,
      focusable: true,
    };
  }
  if (node.kind === "generator") {
    return {
      id: node.id,
      type: "generator",
      position,
      width: dims.width,
      height: dims.height,
      data: { generator: node, isFocused, dimmed },
      selectable: true,
      draggable: false,
      connectable: false,
      focusable: true,
    };
  }
  if (node.kind === "cluster") {
    return {
      id: node.id,
      type: "cluster",
      position,
      width: dims.width,
      height: dims.height,
      data: {
        cluster: node,
        variant: "pill",
        onExpand: () => expandCluster(node.id),
        dimmed,
      },
      selectable: true,
      draggable: false,
      connectable: false,
      focusable: true,
    };
  }
  return {
    id: node.id,
    type: "ghost",
    position,
    width: dims.width,
    height: dims.height,
    data: { ghost: node, dimmed },
    selectable: false,
    draggable: false,
    connectable: false,
    focusable: false,
  };
}

function buildRfEdge(
  edge: GraphRenderEdge,
  graph: GraphRenderModel,
  collectionModeCountById: Map<string, number>,
  isEmphasized: boolean,
  dimmed: boolean,
): Edge {
  const aggregateCount = edge.aggregateCount;
  const base = {
    id: edge.id,
    source: edge.from,
    target: edge.to,
    type: edge.kind,
    markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
    data: {
      isEmphasized,
      dimmed,
      aggregateCount,
    },
  };
  if (edge.kind !== "alias") {
    return base;
  }
  const toNode = graph.nodes.get(edge.to);
  const totalCollectionModes =
    toNode?.kind === "token"
      ? collectionModeCountById.get(toNode.collectionId)
      : undefined;
  return {
    ...base,
    data: {
      ...base.data,
      edge,
      totalCollectionModes,
    },
  };
}

function capitalize(value: string): string {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);
}
