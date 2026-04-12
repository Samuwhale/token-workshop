import { useState, useCallback, useRef, useMemo } from 'react';
import type { TokenGenerator } from '../../hooks/useGenerators';
import type { UndoSlot } from '../../hooks/useUndo';
import type {
  NodeGraphState,
  GraphNode,
} from './nodeGraphTypes';
import { generatorsToGraph } from './nodeGraphTypes';
import { lsGetJson, lsSetJson } from '../../shared/storage';

// ---------------------------------------------------------------------------
// localStorage persistence for node positions
// ---------------------------------------------------------------------------

const STORAGE_PREFIX = 'tokenmanager:nodeGraph:';

function loadPositions(activeSet: string): Record<string, { x: number; y: number }> {
  return lsGetJson(`${STORAGE_PREFIX}${activeSet}`, {});
}

function savePositions(activeSet: string, nodes: GraphNode[]): void {
  const positions: Record<string, { x: number; y: number }> = {};
  for (const n of nodes) {
    positions[n.id] = { x: n.x, y: n.y };
  }
  lsSetJson(`${STORAGE_PREFIX}${activeSet}`, positions);
}

// ---------------------------------------------------------------------------
// Hook — read-only pipeline graph (no wiring or transform nodes)
// ---------------------------------------------------------------------------

export interface UseNodeGraphResult {
  graph: NodeGraphState;
  // Node manipulation
  moveNode: (id: string, x: number, y: number) => void;
  /** Push an undo slot for a completed node move (call at drag end). */
  pushMoveUndo: (nodeId: string, fromX: number, fromY: number) => void;
  // Selection
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
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

  // Always-current refs for use in undo closures
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
    setGraph(base);
  }

  const moveNode = useCallback((id: string, x: number, y: number) => {
    setGraph(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => (n.id === id ? { ...n, x, y } : n)),
    }));
  }, []);

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

  const persistPositions = useCallback(() => {
    savePositions(activeSet, graph.nodes);
  }, [activeSet, graph.nodes]);

  return {
    graph,
    moveNode,
    pushMoveUndo,
    selectedNodeId,
    setSelectedNodeId,
    persistPositions,
  };
}
