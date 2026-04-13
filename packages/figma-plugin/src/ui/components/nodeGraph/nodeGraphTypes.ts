import type {
  GeneratorDashboardStatus,
  TokenGenerator,
} from '../../hooks/useGenerators';
import { getGeneratorDashboardStatus } from '../../hooks/useGenerators';
import { TYPE_LABELS } from '../generators/generatorUtils';

// ---------------------------------------------------------------------------
// Nodes — single unified node per generator
// ---------------------------------------------------------------------------

export type NodeKind = 'generator';

export interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  // Generator identity
  generatorId: string;
  generatorType: string;
  // Source and target
  sourceToken: string | null;
  targetGroup: string;
  targetSet: string;
  // Status
  status: GeneratorDashboardStatus;
  enabled: boolean;
  lastRunAt?: string;
  errorMessage?: string;
  // Metrics
  stepCount: number;
  upstreamCount: number;
  downstreamCount: number;
  blockedBy: string[];
  // Preview
  previewColors?: string[];
  // Layout depth (0 = root, 1+ = downstream)
  depth: number;
}

// ---------------------------------------------------------------------------
// Cross-generator dependency edges
// ---------------------------------------------------------------------------

export interface DependencyEdge {
  id: string;
  fromGeneratorId: string;
  toGeneratorId: string;
  label: string;
}

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
        break;
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
  dependencyEdges: DependencyEdge[];
}

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

export const NODE_WIDTH = 260;
export const NODE_HEADER_H = 28;
export const SOURCE_LINE_H = 18;
export const PREVIEW_H = 28;
export const TARGET_LINE_H = 18;
export const FOOTER_H = 22;
export const NODE_PADDING = 8;

export function nodeHeight(_node?: GraphNode): number {
  return NODE_HEADER_H + SOURCE_LINE_H + PREVIEW_H + TARGET_LINE_H + FOOTER_H + NODE_PADDING;
}

// Height is fixed for all nodes
export const FIXED_NODE_HEIGHT = nodeHeight();

// ---------------------------------------------------------------------------
// Port positions (for dependency edge attachment)
// ---------------------------------------------------------------------------

/** Left center of node — incoming dependency edge target */
export function portInPosition(node: GraphNode): { x: number; y: number } {
  return { x: node.x, y: node.y + FIXED_NODE_HEIGHT / 2 };
}

/** Right center of node — outgoing dependency edge source */
export function portOutPosition(node: GraphNode): { x: number; y: number } {
  return { x: node.x + node.width, y: node.y + FIXED_NODE_HEIGHT / 2 };
}

// ---------------------------------------------------------------------------
// Generator → graph conversion
// ---------------------------------------------------------------------------

function topoSortGenerators(generators: TokenGenerator[]): TokenGenerator[] {
  const n = generators.length;
  if (n <= 1) return [...generators];

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

/**
 * Compute the depth of each generator in the dependency DAG.
 * Depth 0 = no upstream generators, depth N = max upstream chain length.
 */
function computeDepths(generators: TokenGenerator[]): Map<string, number> {
  const depths = new Map<string, number>();
  const byId = new Map(generators.map(g => [g.id, g]));

  function getDepth(id: string): number {
    if (depths.has(id)) return depths.get(id)!;
    const gen = byId.get(id)!;
    if (!gen.sourceToken) {
      depths.set(id, 0);
      return 0;
    }
    // Find upstream
    let maxUpstream = -1;
    for (const other of generators) {
      if (other.id === id) continue;
      if (gen.sourceToken.startsWith(other.targetGroup + '.')) {
        maxUpstream = Math.max(maxUpstream, getDepth(other.id));
        break;
      }
    }
    const d = maxUpstream >= 0 ? maxUpstream + 1 : 0;
    depths.set(id, d);
    return d;
  }

  for (const gen of generators) getDepth(gen.id);
  return depths;
}

export function generatorsToGraph(generators: TokenGenerator[]): NodeGraphState {
  const nodes: GraphNode[] = [];
  const sortedGenerators = topoSortGenerators(generators);
  const depthMap = computeDepths(generators);
  const dependencyEdges = computeDependencyEdges(generators);

  const COL_X = 40;
  const DEPTH_INDENT = 40;
  const ROW_GAP = 20;
  const TOP_PAD = 40;

  const h = FIXED_NODE_HEIGHT;

  sortedGenerators.forEach((gen, i) => {
    const depth = depthMap.get(gen.id) ?? 0;
    const rowY = TOP_PAD + i * (h + ROW_GAP);
    const nodeId = `gen-${gen.id}`;

    const stepCount = getStepCount(gen);
    const status = getGeneratorDashboardStatus(gen);

    nodes.push({
      id: nodeId,
      kind: 'generator',
      label: gen.name || TYPE_LABELS[gen.type as keyof typeof TYPE_LABELS] || gen.type,
      x: COL_X + depth * DEPTH_INDENT,
      y: rowY,
      width: NODE_WIDTH,
      height: h,
      generatorId: gen.id,
      generatorType: gen.type,
      sourceToken: gen.sourceToken ?? null,
      targetGroup: gen.targetGroup,
      targetSet: gen.targetSet,
      status,
      enabled: gen.enabled !== false,
      lastRunAt: gen.lastRunAt,
      errorMessage: gen.lastRunError?.message,
      stepCount,
      upstreamCount: gen.upstreamGenerators?.length ?? 0,
      downstreamCount: gen.downstreamGenerators?.length ?? 0,
      blockedBy: gen.blockedByGenerators?.map(d => d.name) ?? [],
      depth,
    });
  });

  return { nodes, dependencyEdges };
}
