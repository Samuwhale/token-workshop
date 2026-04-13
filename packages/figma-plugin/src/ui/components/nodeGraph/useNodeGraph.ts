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
// Hook
// ---------------------------------------------------------------------------

export interface UseNodeGraphResult {
  graph: NodeGraphState;
  moveNode: (id: string, x: number, y: number) => void;
  pushMoveUndo: (nodeId: string, fromX: number, fromY: number) => void;
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  /** The TokenGenerator corresponding to the selected node, or null. */
  selectedGenerator: TokenGenerator | null;
  persistPositions: () => void;
}

export function useNodeGraph(
  generators: TokenGenerator[],
  activeSet: string,
  onPushUndo?: (slot: UndoSlot) => void,
): UseNodeGraphResult {
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

  const selectedGenerator = useMemo(() => {
    if (!selectedNodeId) return null;
    const node = graph.nodes.find(n => n.id === selectedNodeId);
    if (!node) return null;
    return generators.find(g => g.id === node.generatorId) ?? null;
  }, [selectedNodeId, graph.nodes, generators]);

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
    selectedGenerator,
    persistPositions,
  };
}
