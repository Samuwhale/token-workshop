import { useState, useCallback, useRef, useMemo } from 'react';
import type { TokenGenerator } from '../../hooks/useGenerators';
import type { UndoSlot } from '../../hooks/useUndo';
import type {
  NodeGraphState,
  GraphNode,
  GraphEdge,
  WiringState,
  TransformOp,
  PortType,
} from './nodeGraphTypes';
import {
  generatorsToGraph,
  createTransformNode,
  portPosition,
  PORT_HIT_RADIUS,
  isCompatiblePortType,
} from './nodeGraphTypes';

// ---------------------------------------------------------------------------
// localStorage persistence for node positions
// ---------------------------------------------------------------------------

const STORAGE_PREFIX = 'tokenmanager:nodeGraph:';

function loadPositions(activeSet: string): Record<string, { x: number; y: number }> {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${activeSet}`);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.debug('[useNodeGraph] failed to load positions from localStorage:', e);
    return {};
  }
}

function savePositions(activeSet: string, nodes: GraphNode[]): void {
  const positions: Record<string, { x: number; y: number }> = {};
  for (const n of nodes) {
    positions[n.id] = { x: n.x, y: n.y };
  }
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${activeSet}`, JSON.stringify(positions));
  } catch (e) { console.debug('[useNodeGraph] failed to save positions (quota exceeded?):', e); }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseNodeGraphResult {
  graph: NodeGraphState;
  // Node manipulation
  moveNode: (id: string, x: number, y: number) => void;
  removeNode: (id: string) => void;
  addTransformNode: (op: TransformOp, x: number, y: number) => void;
  updateTransformParam: (nodeId: string, key: string, value: number | string) => void;
  /** Push an undo slot for a completed node move (call at drag end). */
  pushMoveUndo: (nodeId: string, fromX: number, fromY: number) => void;
  // Edge manipulation
  addEdge: (edge: GraphEdge) => void;
  removeEdge: (id: string) => void;
  // Selection
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  selectedEdgeId: string | null;
  setSelectedEdgeId: (id: string | null) => void;
  // Wiring
  wiring: WiringState | null;
  /** The PortType of the port that started the current wiring drag, or null */
  wiringSourcePortType: PortType | null;
  startWiring: (nodeId: string, portId: string, direction: 'in' | 'out', x: number, y: number) => void;
  updateWiring: (x: number, y: number) => void;
  finishWiring: (targetNodeId: string, targetPortId: string) => void;
  cancelWiring: () => void;
  // Persist positions
  persistPositions: () => void;
}

export function useNodeGraph(
  generators: TokenGenerator[],
  activeSet: string,
  onPushUndo?: (slot: UndoSlot) => void,
): UseNodeGraphResult {
  // Derive initial state from generators, applying saved positions
  const initialGraph = useMemo(() => {
    const base = generatorsToGraph(generators);
    const saved = loadPositions(activeSet);
    for (const node of base.nodes) {
      if (saved[node.id]) {
        node.x = saved[node.id].x;
        node.y = saved[node.id].y;
      }
    }
    return base;
  }, [generators, activeSet]);

  const [graph, setGraph] = useState<NodeGraphState>(initialGraph);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [wiring, setWiring] = useState<WiringState | null>(null);

  // Always-current ref for use in undo closures (avoids stale closure issues)
  const graphRef = useRef(graph);
  graphRef.current = graph;
  const onPushUndoRef = useRef(onPushUndo);
  onPushUndoRef.current = onPushUndo;
  const activeSetRef = useRef(activeSet);
  activeSetRef.current = activeSet;

  // Keep graph in sync when generators change
  const prevGenIdsRef = useRef<string>(generators.map(g => g.id).join(','));
  const currentGenIds = generators.map(g => g.id).join(',');
  if (currentGenIds !== prevGenIdsRef.current) {
    prevGenIdsRef.current = currentGenIds;
    const base = generatorsToGraph(generators);
    const saved = loadPositions(activeSet);
    // Preserve positions of existing nodes, also keep transform nodes
    const existingTransforms = graph.nodes.filter(n => n.kind === 'transform');
    const existingEdges = graph.edges.filter(e => {
      // keep edges connected to transform nodes
      return existingTransforms.some(t => t.id === e.fromNodeId || t.id === e.toNodeId);
    });
    for (const node of base.nodes) {
      const existing = graph.nodes.find(n => n.id === node.id);
      if (existing) {
        node.x = existing.x;
        node.y = existing.y;
      } else if (saved[node.id]) {
        node.x = saved[node.id].x;
        node.y = saved[node.id].y;
      }
    }
    setGraph({
      nodes: [...base.nodes, ...existingTransforms],
      edges: [...base.edges, ...existingEdges],
    });
  }

  const moveNode = useCallback((id: string, x: number, y: number) => {
    setGraph(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => (n.id === id ? { ...n, x, y } : n)),
    }));
  }, []);

  const removeNode = useCallback((id: string) => {
    const node = graphRef.current.nodes.find(n => n.id === id);
    if (!node) return;
    const connectedEdges = graphRef.current.edges.filter(
      e => e.fromNodeId === id || e.toNodeId === id,
    );
    setGraph(prev => ({
      nodes: prev.nodes.filter(n => n.id !== id),
      edges: prev.edges.filter(e => e.fromNodeId !== id && e.toNodeId !== id),
    }));
    setSelectedNodeId(prev => (prev === id ? null : prev));
    onPushUndoRef.current?.({
      description: `Remove "${node.label}"`,
      restore: async () => {
        setGraph(prev => ({
          nodes: [...prev.nodes, node],
          edges: [...prev.edges, ...connectedEdges],
        }));
        setSelectedNodeId(id);
      },
      redo: async () => {
        setGraph(prev => ({
          nodes: prev.nodes.filter(n => n.id !== id),
          edges: prev.edges.filter(e => e.fromNodeId !== id && e.toNodeId !== id),
        }));
        setSelectedNodeId(curr => (curr === id ? null : curr));
      },
    });
  }, []);

  const addTransformNode = useCallback((op: TransformOp, x: number, y: number) => {
    const node = createTransformNode(op, x, y);
    setGraph(prev => ({
      ...prev,
      nodes: [...prev.nodes, node],
    }));
    setSelectedNodeId(node.id);
    onPushUndoRef.current?.({
      description: `Add "${op}" transform`,
      restore: async () => {
        setGraph(prev => ({
          ...prev,
          nodes: prev.nodes.filter(n => n.id !== node.id),
          edges: prev.edges.filter(e => e.fromNodeId !== node.id && e.toNodeId !== node.id),
        }));
        setSelectedNodeId(curr => (curr === node.id ? null : curr));
      },
      redo: async () => {
        setGraph(prev => ({ ...prev, nodes: [...prev.nodes, node] }));
        setSelectedNodeId(node.id);
      },
    });
  }, []);

  const updateTransformParam = useCallback((nodeId: string, key: string, value: number | string) => {
    setGraph(prev => ({
      ...prev,
      nodes: prev.nodes.map(n =>
        n.id === nodeId && n.transformParams
          ? { ...n, transformParams: { ...n.transformParams, [key]: value } }
          : n,
      ),
    }));
  }, []);

  const addEdge = useCallback((edge: GraphEdge) => {
    // Capture displaced edges before mutation (one connection per input port rule)
    const displaced = graphRef.current.edges.filter(
      e => e.toNodeId === edge.toNodeId && e.toPortId === edge.toPortId,
    );
    setGraph(prev => {
      const filtered = prev.edges.filter(
        e => !(e.toNodeId === edge.toNodeId && e.toPortId === edge.toPortId),
      );
      return { ...prev, edges: [...filtered, edge] };
    });
    onPushUndoRef.current?.({
      description: 'Connect edge',
      restore: async () => {
        setGraph(prev => ({
          ...prev,
          edges: [...prev.edges.filter(e => e.id !== edge.id), ...displaced],
        }));
      },
      redo: async () => {
        setGraph(prev => {
          const filtered = prev.edges.filter(
            e => !(e.toNodeId === edge.toNodeId && e.toPortId === edge.toPortId),
          );
          return { ...prev, edges: [...filtered, edge] };
        });
      },
    });
  }, []);

  const removeEdge = useCallback((id: string) => {
    const edge = graphRef.current.edges.find(e => e.id === id);
    setGraph(prev => ({
      ...prev,
      edges: prev.edges.filter(e => e.id !== id),
    }));
    setSelectedEdgeId(prev => (prev === id ? null : prev));
    if (edge) {
      onPushUndoRef.current?.({
        description: 'Remove edge',
        restore: async () => {
          setGraph(prev => ({ ...prev, edges: [...prev.edges, edge] }));
        },
        redo: async () => {
          setGraph(prev => ({ ...prev, edges: prev.edges.filter(e => e.id !== id) }));
          setSelectedEdgeId(curr => (curr === id ? null : curr));
        },
      });
    }
  }, []);

  // Push undo for a node move (called by canvas at drag end with original position)
  const pushMoveUndo = useCallback((nodeId: string, fromX: number, fromY: number) => {
    const currentNode = graphRef.current.nodes.find(n => n.id === nodeId);
    if (!currentNode) return;
    const toX = currentNode.x;
    const toY = currentNode.y;
    if (fromX === toX && fromY === toY) return;
    const set = activeSetRef.current;
    onPushUndoRef.current?.({
      description: 'Move node',
      restore: async () => {
        setGraph(prev => ({
          ...prev,
          nodes: prev.nodes.map(n => (n.id === nodeId ? { ...n, x: fromX, y: fromY } : n)),
        }));
        savePositions(set, graphRef.current.nodes.map(n => (n.id === nodeId ? { ...n, x: fromX, y: fromY } : n)));
      },
      redo: async () => {
        setGraph(prev => ({
          ...prev,
          nodes: prev.nodes.map(n => (n.id === nodeId ? { ...n, x: toX, y: toY } : n)),
        }));
        savePositions(set, graphRef.current.nodes.map(n => (n.id === nodeId ? { ...n, x: toX, y: toY } : n)));
      },
    });
  }, []);

  // Wiring
  const startWiring = useCallback(
    (nodeId: string, portId: string, direction: 'in' | 'out', x: number, y: number) => {
      setWiring({ fromNodeId: nodeId, fromPortId: portId, fromDirection: direction, mouseX: x, mouseY: y });
    },
    [],
  );

  const updateWiring = useCallback((x: number, y: number) => {
    setWiring(prev => (prev ? { ...prev, mouseX: x, mouseY: y } : null));
  }, []);

  const finishWiring = useCallback(
    (targetNodeId: string, targetPortId: string) => {
      if (!wiring) return;
      // Can't wire to the same node
      if (wiring.fromNodeId === targetNodeId) {
        setWiring(null);
        return;
      }

      // Look up target port to validate direction & type
      const targetNode = graph.nodes.find(n => n.id === targetNodeId);
      const targetPort = targetNode?.ports.find(p => p.id === targetPortId);
      if (!targetNode || !targetPort) {
        setWiring(null);
        return;
      }

      // Can't wire same-direction ports (out→out or in→in)
      if (targetPort.direction === wiring.fromDirection) {
        setWiring(null);
        return;
      }

      // Determine from/to based on direction
      let fromNodeId: string, fromPortId: string, toNodeId: string, toPortId: string;
      let outPortType: PortType, inPortType: PortType;
      if (wiring.fromDirection === 'out') {
        fromNodeId = wiring.fromNodeId;
        fromPortId = wiring.fromPortId;
        toNodeId = targetNodeId;
        toPortId = targetPortId;
        // Get source port type
        const srcNode = graph.nodes.find(n => n.id === wiring.fromNodeId);
        const srcPort = srcNode?.ports.find(p => p.id === wiring.fromPortId);
        outPortType = srcPort?.type ?? 'any';
        inPortType = targetPort.type;
      } else {
        fromNodeId = targetNodeId;
        fromPortId = targetPortId;
        toNodeId = wiring.fromNodeId;
        toPortId = wiring.fromPortId;
        outPortType = targetPort.type;
        // Get source (in) port type
        const srcNode = graph.nodes.find(n => n.id === wiring.fromNodeId);
        const srcPort = srcNode?.ports.find(p => p.id === wiring.fromPortId);
        inPortType = srcPort?.type ?? 'any';
      }

      // Type compatibility check
      if (!isCompatiblePortType(outPortType, inPortType)) {
        setWiring(null);
        return;
      }

      const edgeId = `edge-${fromNodeId}-${fromPortId}-${toNodeId}-${toPortId}`;
      addEdge({ id: edgeId, fromNodeId, fromPortId, toNodeId, toPortId });
      setWiring(null);
    },
    [wiring, addEdge, graph.nodes],
  );

  const cancelWiring = useCallback(() => {
    setWiring(null);
  }, []);

  const persistPositions = useCallback(() => {
    savePositions(activeSet, graph.nodes);
  }, [activeSet, graph.nodes]);

  // Derive the port type of the wiring source for visual feedback
  const wiringSourcePortType: PortType | null = useMemo(() => {
    if (!wiring) return null;
    const node = graph.nodes.find(n => n.id === wiring.fromNodeId);
    const port = node?.ports.find(p => p.id === wiring.fromPortId);
    return port?.type ?? null;
  }, [wiring, graph.nodes]);

  return {
    graph,
    moveNode,
    removeNode,
    addTransformNode,
    updateTransformParam,
    pushMoveUndo,
    addEdge,
    removeEdge,
    selectedNodeId,
    setSelectedNodeId,
    selectedEdgeId,
    setSelectedEdgeId,
    wiring,
    wiringSourcePortType,
    startWiring,
    updateWiring,
    finishWiring,
    cancelWiring,
    persistPositions,
  };
}
