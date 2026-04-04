import type { TokenGenerator } from '../../hooks/useGenerators';
import { TYPE_LABELS } from '../generators/generatorUtils';

// ---------------------------------------------------------------------------
// Node kinds & transform operations
// ---------------------------------------------------------------------------

export type NodeKind = 'source' | 'generator' | 'transform' | 'output';

export type TransformOp = 'lighten' | 'darken' | 'scale' | 'mix' | 'contrastCheck';

export const TRANSFORM_OPS: { op: TransformOp; label: string; description: string }[] = [
  { op: 'lighten', label: 'Lighten', description: 'Increase L* lightness in CIELAB' },
  { op: 'darken', label: 'Darken', description: 'Decrease L* lightness in CIELAB' },
  { op: 'scale', label: 'Scale', description: 'Multiply numeric value by a factor' },
  { op: 'mix', label: 'Mix', description: 'Blend two colors by a ratio' },
  { op: 'contrastCheck', label: 'Contrast Check', description: 'Verify WCAG contrast ratio' },
];

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
  // Transform nodes
  transformOp?: TransformOp;
  transformParams?: Record<string, number | string>;
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
// Full graph state
// ---------------------------------------------------------------------------

export interface NodeGraphState {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ---------------------------------------------------------------------------
// Wiring state (temporary edge while dragging)
// ---------------------------------------------------------------------------

export interface WiringState {
  fromNodeId: string;
  fromPortId: string;
  fromDirection: PortDirection;
  mouseX: number;
  mouseY: number;
}

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

export const NODE_WIDTHS: Record<NodeKind, number> = {
  source: 140,
  generator: 180,
  transform: 160,
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
// Port type compatibility
// ---------------------------------------------------------------------------

/**
 * Returns true if an output of type `from` can connect to an input of type `to`.
 * Rules:
 *  - `any` matches everything
 *  - exact match always works
 *  - `dimension` and `number` are interchangeable (dimensions are numeric)
 */
export function isCompatiblePortType(from: PortType, to: PortType): boolean {
  if (from === 'any' || to === 'any') return true;
  if (from === to) return true;
  // dimension ↔ number interop
  if ((from === 'dimension' && to === 'number') || (from === 'number' && to === 'dimension')) return true;
  return false;
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

function getStepCount(gen: TokenGenerator): number {
  const cfg = gen.config as Record<string, unknown>;
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

  generators.forEach((gen, i) => {
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

// ---------------------------------------------------------------------------
// Transform node factory
// ---------------------------------------------------------------------------

export function createTransformNode(
  op: TransformOp,
  x: number,
  y: number,
): GraphNode {
  const id = `transform-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const opDef = TRANSFORM_OPS.find(o => o.op === op)!;

  let ports: Port[];
  let params: Record<string, number | string>;

  switch (op) {
    case 'lighten':
      ports = [
        { id: `${id}-in`, label: 'Color', type: 'color', direction: 'in' },
        { id: `${id}-out`, label: 'Result', type: 'color', direction: 'out' },
      ];
      params = { amount: 20 };
      break;
    case 'darken':
      ports = [
        { id: `${id}-in`, label: 'Color', type: 'color', direction: 'in' },
        { id: `${id}-out`, label: 'Result', type: 'color', direction: 'out' },
      ];
      params = { amount: 20 };
      break;
    case 'scale':
      ports = [
        { id: `${id}-in`, label: 'Value', type: 'number', direction: 'in' },
        { id: `${id}-out`, label: 'Result', type: 'number', direction: 'out' },
      ];
      params = { factor: 2 };
      break;
    case 'mix':
      ports = [
        { id: `${id}-in-a`, label: 'Color A', type: 'color', direction: 'in' },
        { id: `${id}-in-b`, label: 'Color B', type: 'color', direction: 'in' },
        { id: `${id}-out`, label: 'Result', type: 'color', direction: 'out' },
      ];
      params = { ratio: 0.5 };
      break;
    case 'contrastCheck':
      ports = [
        { id: `${id}-in-fg`, label: 'Foreground', type: 'color', direction: 'in' },
        { id: `${id}-in-bg`, label: 'Background', type: 'color', direction: 'in' },
        { id: `${id}-out`, label: 'Ratio', type: 'number', direction: 'out' },
      ];
      params = { level: 'AA' };
      break;
  }

  const node: GraphNode = {
    id,
    kind: 'transform',
    label: opDef.label,
    x,
    y,
    width: NODE_WIDTHS.transform,
    height: 0,
    ports,
    transformOp: op,
    transformParams: params,
  };
  node.height = nodeHeight(node);
  return node;
}
