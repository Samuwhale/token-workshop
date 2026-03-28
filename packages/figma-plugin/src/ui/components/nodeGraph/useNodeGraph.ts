import { useState, useCallback, useRef, useMemo } from 'react';
import type { TokenGenerator } from '../../hooks/useGenerators';
import type {
  NodeGraphState,
  GraphNode,
  GraphEdge,
  WiringState,
  TransformOp,
} from './nodeGraphTypes';
import {
  generatorsToGraph,
  createTransformNode,
  portPosition,
  PORT_HIT_RADIUS,
} from './nodeGraphTypes';

// ---------------------------------------------------------------------------
// localStorage persistence for node positions
// ---------------------------------------------------------------------------

const STORAGE_PREFIX = 'tokenmanager:nodeGraph:';

function loadPositions(activeSet: string): Record<string, { x: number; y: number }> {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${activeSet}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
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
  } catch { /* quota exceeded — noop */ }
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
    setGraph(prev => ({
      nodes: prev.nodes.filter(n => n.id !== id),
      edges: prev.edges.filter(e => e.fromNodeId !== id && e.toNodeId !== id),
    }));
    setSelectedNodeId(prev => (prev === id ? null : prev));
  }, []);

  const addTransformNode = useCallback((op: TransformOp, x: number, y: number) => {
    const node = createTransformNode(op, x, y);
    setGraph(prev => ({
      ...prev,
      nodes: [...prev.nodes, node],
    }));
    setSelectedNodeId(node.id);
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
    setGraph(prev => {
      // Remove any existing edges to the same input port (one connection per input)
      const filtered = prev.edges.filter(
        e => !(e.toNodeId === edge.toNodeId && e.toPortId === edge.toPortId),
      );
      return { ...prev, edges: [...filtered, edge] };
    });
  }, []);

  const removeEdge = useCallback((id: string) => {
    setGraph(prev => ({
      ...prev,
      edges: prev.edges.filter(e => e.id !== id),
    }));
    setSelectedEdgeId(prev => (prev === id ? null : prev));
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
      // Determine from/to based on direction
      let fromNodeId: string, fromPortId: string, toNodeId: string, toPortId: string;
      if (wiring.fromDirection === 'out') {
        fromNodeId = wiring.fromNodeId;
        fromPortId = wiring.fromPortId;
        toNodeId = targetNodeId;
        toPortId = targetPortId;
      } else {
        fromNodeId = targetNodeId;
        fromPortId = targetPortId;
        toNodeId = wiring.fromNodeId;
        toPortId = wiring.fromPortId;
      }

      const edgeId = `edge-${fromNodeId}-${fromPortId}-${toNodeId}-${toPortId}`;
      addEdge({ id: edgeId, fromNodeId, fromPortId, toNodeId, toPortId });
      setWiring(null);
    },
    [wiring, addEdge],
  );

  const cancelWiring = useCallback(() => {
    setWiring(null);
  }, []);

  const persistPositions = useCallback(() => {
    savePositions(activeSet, graph.nodes);
  }, [activeSet, graph.nodes]);

  return {
    graph,
    moveNode,
    removeNode,
    addTransformNode,
    updateTransformParam,
    addEdge,
    removeEdge,
    selectedNodeId,
    setSelectedNodeId,
    selectedEdgeId,
    setSelectedEdgeId,
    wiring,
    startWiring,
    updateWiring,
    finishWiring,
    cancelWiring,
    persistPositions,
  };
}
