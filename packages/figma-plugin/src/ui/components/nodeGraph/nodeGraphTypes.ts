import type {
  GeneratorDashboardStatus,
  TokenGenerator,
} from '../../hooks/useGenerators';
import { getGeneratorDashboardStatus } from '../../hooks/useGenerators';
import { TYPE_LABELS } from '../generators/generatorUtils';

// ---------------------------------------------------------------------------
// Node kinds — transform nodes removed (were non-functional)
// ---------------------------------------------------------------------------

export type NodeKind = 'source' | 'generator' | 'output';

// ---------------------------------------------------------------------------
// Ports
// ---------------------------------------------------------------------------

export type PortType = 'color' | 'dimension' | 'number' | 'any';
export type PortDirection = 'in' | 'out';

export interface Port {
  id: string;
  label: string;
  type: PortType;
  direction: PortDirection;
}

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

export interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  ports: Port[];
  // Source nodes
  sourceTokenPath?: string;
  // Generator nodes — link to server generator
  generatorId?: string;
  generatorType?: string;
  stepCount?: number;
  status?: GeneratorDashboardStatus;
  upstreamCount?: number;
  downstreamCount?: number;
  blockedBy?: string[];
  // Output nodes
  targetGroup?: string;
  targetSet?: string;
  // Preview data for inline node previews
  previewColors?: string[];
}

// ---------------------------------------------------------------------------
// Edges
// ---------------------------------------------------------------------------

export interface GraphEdge {
  id: string;
  fromNodeId: string;
  fromPortId: string;
  toNodeId: string;
  toPortId: string;
}

// ---------------------------------------------------------------------------
// Cross-generator dependency edges
// ---------------------------------------------------------------------------

/**
 * Represents a semantic dependency between two generators: the upstream generator
 * produces tokens that are consumed as input by the downstream generator.
 * These are rendered separately from port-based edges with distinct styling.
 */
export interface DependencyEdge {
  id: string;
  /** ID of the generator whose output feeds the downstream generator */
  fromGeneratorId: string;
  /** ID of the generator that consumes the upstream generator's output */
  toGeneratorId: string;
  /** The specific sourceToken path that creates this dependency */
  label: string;
}

/**
 * Compute inter-generator dependency edges for a list of generators.
 * Generator B depends on generator A when B.sourceToken starts with A.targetGroup + '.'.
 */
export function computeDependencyEdges(generators: TokenGenerator[]): DependencyEdge[] {
  const deps: DependencyEdge[] = [];
  for (const downstream of generators) {
    if (!downstream.sourceToken) continue;
    for (const upstream of generators) {
      if (upstream.id === downstream.id) continue;
      if (downstream.sourceToken.startsWith(upstream.targetGroup + '.')) {
        deps.push({
          id: `dep-${upstream.id}-${downstream.id}`,
          fromGeneratorId: upstream.id,
          toGeneratorId: downstream.id,
          label: downstream.sourceToken,
        });
        break; // One upstream per generator dependency
      }
    }
  }
  return deps;
}

// ---------------------------------------------------------------------------
// Full graph state
// ---------------------------------------------------------------------------

export interface NodeGraphState {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

export const NODE_WIDTHS: Record<NodeKind, number> = {
  source: 140,
  generator: 180,
  output: 140,
};

export const NODE_HEADER_H = 24;
export const PORT_ROW_H = 22;
export const PORT_RADIUS = 5;
export const PORT_HIT_RADIUS = 12;

/** Extra height added for inline previews in generator nodes */
export const GENERATOR_PREVIEW_H = 20;

export function nodeHeight(node: GraphNode): number {
  const base = NODE_HEADER_H + Math.max(1, node.ports.length) * PORT_ROW_H + 8;
  if (node.kind === 'generator') return base + GENERATOR_PREVIEW_H;
  return base;
}

// ---------------------------------------------------------------------------
// Port position helpers
// ---------------------------------------------------------------------------

export function portPosition(
  node: GraphNode,
  portId: string,
): { x: number; y: number } | null {
  const portIndex = node.ports.findIndex(p => p.id === portId);
  if (portIndex < 0) return null;
  const port = node.ports[portIndex];
  const px = port.direction === 'in' ? node.x : node.x + node.width;
  const py = node.y + NODE_HEADER_H + portIndex * PORT_ROW_H + PORT_ROW_H / 2;
  return { x: px, y: py };
}

// ---------------------------------------------------------------------------
// Generator → graph conversion
// ---------------------------------------------------------------------------

/**
 * Topologically sort generators so that upstream producers come before
 * downstream consumers in the layout. Cycles fall back to original order.
 */
function topoSortGenerators(generators: TokenGenerator[]): TokenGenerator[] {
  const n = generators.length;
  if (n <= 1) return [...generators];

  // adj[i] = indices of generators that i feeds into (i must appear before adj[i][j])
  const adj: number[][] = Array.from({ length: n }, () => []);
  const inDegree = new Array<number>(n).fill(0);

  for (let j = 0; j < n; j++) {
    const gen = generators[j];
    if (!gen.sourceToken) continue;
    for (let i = 0; i < n; i++) {
      if (i === j) continue;
      if (gen.sourceToken.startsWith(generators[i].targetGroup + '.')) {
        adj[i].push(j);
        inDegree[j]++;
        break;
      }
    }
  }

  // Kahn's algorithm
  const queue: number[] = [];
  for (let i = 0; i < n; i++) {
    if (inDegree[i] === 0) queue.push(i);
  }

  const sorted: number[] = [];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    sorted.push(curr);
    for (const next of adj[curr]) {
      inDegree[next]--;
      if (inDegree[next] === 0) queue.push(next);
    }
  }

  // Append any remaining (cycle members) in original order
  const inSortedSet = new Set(sorted);
  for (let i = 0; i < n; i++) {
    if (!inSortedSet.has(i)) sorted.push(i);
  }

  return sorted.map(i => generators[i]);
}

function getStepCount(gen: TokenGenerator): number {
  const cfg = gen.config as unknown as Record<string, unknown>;
  if (Array.isArray(cfg.steps)) return (cfg.steps as unknown[]).length;
  return 0;
}

export function generatorsToGraph(generators: TokenGenerator[]): NodeGraphState {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  const COL_SRC = 40;
  const COL_GEN = 260;
  const COL_OUT = 520;
  const ROW_H = 120;
  const TOP_PAD = 40;

  // Sort generators topologically so upstream producers appear above downstream consumers
  const sortedGenerators = topoSortGenerators(generators);

  sortedGenerators.forEach((gen, i) => {
    const rowY = TOP_PAD + i * ROW_H;
    const srcId = `src-${gen.id}`;
    const genId = `gen-${gen.id}`;
    const outId = `out-${gen.id}`;

    // Source node
    if (gen.sourceToken) {
      nodes.push({
        id: srcId,
        kind: 'source',
        label: gen.sourceToken.split('.').pop() || gen.sourceToken,
        x: COL_SRC,
        y: rowY,
        width: NODE_WIDTHS.source,
        height: 0, // computed at render
        ports: [{ id: `${srcId}-out`, label: 'Value', type: 'any', direction: 'out' }],
        sourceTokenPath: gen.sourceToken,
      });
    }

    // Generator node
    const stepCount = getStepCount(gen);
    nodes.push({
      id: genId,
      kind: 'generator',
      label: gen.name || TYPE_LABELS[gen.type as keyof typeof TYPE_LABELS] || gen.type,
      x: COL_GEN,
      y: rowY,
      width: NODE_WIDTHS.generator,
      height: 0,
      ports: [
        { id: `${genId}-in`, label: 'Source', type: 'any', direction: 'in' },
        { id: `${genId}-out`, label: `${stepCount} tokens`, type: 'any', direction: 'out' },
      ],
      generatorId: gen.id,
      generatorType: gen.type,
      stepCount,
      status: getGeneratorDashboardStatus(gen),
      upstreamCount: gen.upstreamGenerators?.length ?? 0,
      downstreamCount: gen.downstreamGenerators?.length ?? 0,
      blockedBy: gen.blockedByGenerators?.map((dependency) => dependency.name) ?? [],
    });

    // Output node
    nodes.push({
      id: outId,
      kind: 'output',
      label: gen.targetGroup,
      x: COL_OUT,
      y: rowY,
      width: NODE_WIDTHS.output,
      height: 0,
      ports: [{ id: `${outId}-in`, label: 'Input', type: 'any', direction: 'in' }],
      targetGroup: gen.targetGroup,
      targetSet: gen.targetSet,
    });

    // Edges
    if (gen.sourceToken) {
      edges.push({
        id: `edge-${srcId}-${genId}`,
        fromNodeId: srcId,
        fromPortId: `${srcId}-out`,
        toNodeId: genId,
        toPortId: `${genId}-in`,
      });
    }

    edges.push({
      id: `edge-${genId}-${outId}`,
      fromNodeId: genId,
      fromPortId: `${genId}-out`,
      toNodeId: outId,
      toPortId: `${outId}-in`,
    });
  });

  // Compute heights
  for (const node of nodes) {
    node.height = nodeHeight(node);
  }

  return { nodes, edges };
}
