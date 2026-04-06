import { useRef, useCallback, useState, useEffect, useMemo } from 'react';
import type { TokenGenerator } from '../../hooks/useGenerators';
import type { UndoSlot } from '../../hooks/useUndo';
import { portPosition, nodeHeight, computeDependencyEdges } from './nodeGraphTypes';
import { useNodeGraph } from './useNodeGraph';
import { NodeRenderer } from './NodeRenderer';
import { edgePath } from '../../shared/graphUtils';

// ---------------------------------------------------------------------------
// Dependency edge path — connects output node (right) to source node (left)
// across rows, routing via the right side of the canvas.
// ---------------------------------------------------------------------------

function depEdgePath(x1: number, y1: number, x2: number, y2: number): string {
  const rightX = Math.max(x1, x2) + 60;
  return `M${x1},${y1} C${rightX},${y1} ${rightX},${y2} ${x2},${y2}`;
}

// ---------------------------------------------------------------------------
// Minimap
// ---------------------------------------------------------------------------

function Minimap({
  nodes,
  pan,
  zoom,
  viewW,
  viewH,
}: {
  nodes: { x: number; y: number; width: number; height: number; kind: string }[];
  pan: { x: number; y: number };
  zoom: number;
  viewW: number;
  viewH: number;
}) {
  if (nodes.length === 0) return null;

  const minX = Math.min(...nodes.map(n => n.x));
  const minY = Math.min(...nodes.map(n => n.y));
  const maxX = Math.max(...nodes.map(n => n.x + n.width));
  const maxY = Math.max(...nodes.map(n => n.y + n.height));
  const graphW = maxX - minX + 80;
  const graphH = maxY - minY + 80;
  const mapW = 120;
  const mapH = 80;
  const scale = Math.min(mapW / graphW, mapH / graphH);

  const viewRectX = (-pan.x / zoom - minX + 40) * scale;
  const viewRectY = (-pan.y / zoom - minY + 40) * scale;
  const viewRectW = (viewW / zoom) * scale;
  const viewRectH = (viewH / zoom) * scale;

  const kindColors: Record<string, string> = {
    source: '#6b7280',
    generator: '#3b82f6',
    output: '#6b7280',
  };

  return (
    <div
      className="absolute bottom-2 right-2 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] opacity-60 hover:opacity-90 transition-opacity pointer-events-auto"
      style={{ width: mapW, height: mapH, zIndex: 20 }}
    >
      <svg width={mapW} height={mapH}>
        {nodes.map((n, i) => (
          <rect
            key={i}
            x={(n.x - minX + 40) * scale}
            y={(n.y - minY + 40) * scale}
            width={Math.max(2, n.width * scale)}
            height={Math.max(2, n.height * scale)}
            rx={1}
            fill={kindColors[n.kind] || '#6b7280'}
            opacity={0.6}
          />
        ))}
        <rect
          x={viewRectX}
          y={viewRectY}
          width={viewRectW}
          height={viewRectH}
          fill="none"
          stroke="var(--color-figma-accent)"
          strokeWidth={1}
          opacity={0.8}
        />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main canvas
// ---------------------------------------------------------------------------

export interface NodeGraphCanvasProps {
  generators: TokenGenerator[];
  activeSet: string;
  serverUrl: string;
  onRefresh: () => void;
  onPushUndo?: (slot: UndoSlot) => void;
  searchQuery?: string;
}

export function NodeGraphCanvas({
  generators,
  activeSet,
  onPushUndo,
  searchQuery = '',
}: NodeGraphCanvasProps) {
  const {
    graph,
    moveNode,
    pushMoveUndo,
    selectedNodeId,
    setSelectedNodeId,
    persistPositions,
  } = useNodeGraph(generators, activeSet, onPushUndo);

  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const panRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
  const dragRef = useRef<{ nodeId: string; startX: number; startY: number; nodeX: number; nodeY: number } | null>(null);
  const [containerSize, setContainerSize] = useState({ w: 600, h: 400 });

  // ---------------------------------------------------------------------------
  // Dependency edges
  // ---------------------------------------------------------------------------
  const dependencyEdges = useMemo(() => computeDependencyEdges(generators), [generators]);

  // ---------------------------------------------------------------------------
  // Search — compute matched node IDs
  // ---------------------------------------------------------------------------
  const matchedNodeIds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return new Set<string>();
    return new Set(
      graph.nodes
        .filter(n =>
          n.label.toLowerCase().includes(q) ||
          (n.sourceTokenPath ?? '').toLowerCase().includes(q) ||
          (n.targetGroup ?? '').toLowerCase().includes(q) ||
          (n.generatorType ?? '').toLowerCase().includes(q),
        )
        .map(n => n.id),
    );
  }, [searchQuery, graph.nodes]);

  // Zoom to matched nodes when query changes
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q || matchedNodeIds.size === 0) return;
    const matchedNodes = graph.nodes.filter(n => matchedNodeIds.has(n.id));
    if (matchedNodes.length === 0) return;
    const PAD = 60;
    const minX = Math.min(...matchedNodes.map(n => n.x));
    const minY = Math.min(...matchedNodes.map(n => n.y));
    const maxX = Math.max(...matchedNodes.map(n => n.x + n.width));
    const maxY = Math.max(...matchedNodes.map(n => n.y + (n.height || nodeHeight(n))));
    const graphW = maxX - minX + PAD * 2;
    const graphH = maxY - minY + PAD * 2;
    const scaleX = containerSize.w / graphW;
    const scaleY = containerSize.h / graphH;
    const newZoom = Math.max(0.3, Math.min(1.5, Math.min(scaleX, scaleY)));
    setPan({
      x: (containerSize.w - graphW * newZoom) / 2 - (minX - PAD) * newZoom,
      y: (containerSize.h - graphH * newZoom) / 2 - (minY - PAD) * newZoom,
    });
    setZoom(newZoom);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, matchedNodeIds]);

  // Track container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContainerSize({ w: entry.contentRect.width, h: entry.contentRect.height });
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);


  // ---------------------------------------------------------------------------
  // Pan
  // ---------------------------------------------------------------------------
  const handleCanvasPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button === 2) return;
      const target = e.target as HTMLElement;
      if (target.closest('[data-node-id]')) return;

      setSelectedNodeId(null);
      setIsPanning(true);
      panRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [pan, setSelectedNodeId],
  );

  const handleCanvasPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (panRef.current) {
        setPan({
          x: panRef.current.panX + (e.clientX - panRef.current.startX),
          y: panRef.current.panY + (e.clientY - panRef.current.startY),
        });
      }
      if (dragRef.current) {
        const dx = (e.clientX - dragRef.current.startX) / zoom;
        const dy = (e.clientY - dragRef.current.startY) / zoom;
        moveNode(dragRef.current.nodeId, dragRef.current.nodeX + dx, dragRef.current.nodeY + dy);
      }
    },
    [zoom, moveNode],
  );

  const handleCanvasPointerUp = useCallback(
    (_e: React.PointerEvent<HTMLDivElement>) => {
      if (panRef.current) {
        panRef.current = null;
        setIsPanning(false);
      }
      if (dragRef.current) {
        const { nodeId, nodeX, nodeY } = dragRef.current;
        dragRef.current = null;
        persistPositions();
        pushMoveUndo(nodeId, nodeX, nodeY);
      }
    },
    [persistPositions, pushMoveUndo],
  );

  // ---------------------------------------------------------------------------
  // Zoom (wheel)
  // ---------------------------------------------------------------------------
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.92 : 1.08;
      const newZoom = Math.max(0.2, Math.min(3, zoom * factor));
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const scale = newZoom / zoom;
        setPan(prev => ({
          x: cx - (cx - prev.x) * scale,
          y: cy - (cy - prev.y) * scale,
        }));
      }
      setZoom(newZoom);
    },
    [zoom],
  );

  // ---------------------------------------------------------------------------
  // Node drag
  // ---------------------------------------------------------------------------
  const handleNodePointerDown = useCallback(
    (nodeId: string, e: React.PointerEvent<SVGGElement>) => {
      const node = graph.nodes.find(n => n.id === nodeId);
      if (!node) return;
      setSelectedNodeId(nodeId);
      dragRef.current = {
        nodeId,
        startX: e.clientX,
        startY: e.clientY,
        nodeX: node.x,
        nodeY: node.y,
      };
    },
    [graph.nodes, setSelectedNodeId],
  );

  // ---------------------------------------------------------------------------
  // Keyboard
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedNodeId(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setSelectedNodeId]);

  // ---------------------------------------------------------------------------
  // Fit to view
  // ---------------------------------------------------------------------------
  const fitToView = useCallback(() => {
    if (graph.nodes.length === 0) return;
    const minX = Math.min(...graph.nodes.map(n => n.x));
    const minY = Math.min(...graph.nodes.map(n => n.y));
    const maxX = Math.max(...graph.nodes.map(n => n.x + n.width));
    const maxY = Math.max(...graph.nodes.map(n => n.y + (n.height || nodeHeight(n))));
    const graphW = maxX - minX + 80;
    const graphH = maxY - minY + 80;
    const scaleX = containerSize.w / graphW;
    const scaleY = containerSize.h / graphH;
    const newZoom = Math.max(0.2, Math.min(1.5, Math.min(scaleX, scaleY)));
    setPan({
      x: (containerSize.w - graphW * newZoom) / 2 - minX * newZoom + 40 * newZoom,
      y: (containerSize.h - graphH * newZoom) / 2 - minY * newZoom + 40 * newZoom,
    });
    setZoom(newZoom);
  }, [graph.nodes, containerSize]);

  const didFitRef = useRef(false);
  useEffect(() => {
    if (!didFitRef.current && graph.nodes.length > 0) {
      didFitRef.current = true;
      fitToView();
    }
  }, [graph.nodes.length, fitToView]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div
      ref={containerRef}
      className={`flex-1 relative overflow-hidden ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
      style={{ userSelect: 'none' }}
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handleCanvasPointerMove}
      onPointerUp={handleCanvasPointerUp}
      onWheel={handleWheel}
    >
      {/* Dot grid background */}
      <svg
        className="absolute inset-0 pointer-events-none"
        width="100%"
        height="100%"
        aria-hidden="true"
        style={{ zIndex: 0 }}
      >
        <defs>
          <pattern
            id="ng-grid"
            x={((pan.x % (24 * zoom)) + 24 * zoom) % (24 * zoom)}
            y={((pan.y % (24 * zoom)) + 24 * zoom) % (24 * zoom)}
            width={24 * zoom}
            height={24 * zoom}
            patternUnits="userSpaceOnUse"
          >
            <circle cx={zoom} cy={zoom} r={zoom * 0.8} fill="var(--color-figma-text-tertiary)" opacity="0.2" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#ng-grid)" />
      </svg>

      {/* Main SVG layer (pan + zoom) */}
      <svg
        className="absolute inset-0"
        width="100%"
        height="100%"
        style={{ zIndex: 1 }}
      >
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* Cross-generator dependency edges */}
          {dependencyEdges.map(dep => {
            const fromOutNode = graph.nodes.find(n => n.id === `out-${dep.fromGeneratorId}`);
            const toSrcNode = graph.nodes.find(n => n.id === `src-${dep.toGeneratorId}`);
            const toGenNode = graph.nodes.find(n => n.id === `gen-${dep.toGeneratorId}`);
            const toNode = toSrcNode ?? toGenNode;
            if (!fromOutNode || !toNode) return null;

            const fromX = fromOutNode.x + fromOutNode.width;
            const fromY = fromOutNode.y + (fromOutNode.height || nodeHeight(fromOutNode)) / 2;
            const toX = toNode.x;
            const toY = toNode.y + (toNode.height || nodeHeight(toNode)) / 2;
            const path = depEdgePath(fromX, fromY, toX, toY);

            return (
              <g key={dep.id} style={{ pointerEvents: 'none' }} aria-hidden="true">
                <path d={path} fill="none" stroke="var(--color-figma-accent)" strokeWidth={6} strokeOpacity={0.08} />
                <path
                  d={path}
                  fill="none"
                  stroke="var(--color-figma-accent)"
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                  strokeOpacity={0.55}
                />
                <circle cx={toX} cy={toY} r={3} fill="var(--color-figma-accent)" opacity={0.7} />
                {dep.label && (() => {
                  const rightX = Math.max(fromX, toX) + 60;
                  const midX = (rightX + toX) / 2;
                  const midY = (fromY + toY) / 2;
                  const shortLabel = dep.label.length > 26 ? `…${dep.label.slice(-24)}` : dep.label;
                  return (
                    <g>
                      <rect
                        x={midX - shortLabel.length * 2.7}
                        y={midY - 7}
                        width={shortLabel.length * 5.4}
                        height={13}
                        rx={3}
                        fill="var(--color-figma-bg)"
                        stroke="var(--color-figma-accent)"
                        strokeWidth={0.75}
                        strokeOpacity={0.4}
                        opacity={0.9}
                      />
                      <text
                        x={midX}
                        y={midY + 3.5}
                        textAnchor="middle"
                        fontFamily="ui-monospace,monospace"
                        fontSize={8}
                        fill="var(--color-figma-accent)"
                        opacity={0.85}
                      >
                        {shortLabel}
                      </text>
                    </g>
                  );
                })()}
              </g>
            );
          })}

          {/* Edges */}
          {graph.edges.map(edge => {
            const fromNode = graph.nodes.find(n => n.id === edge.fromNodeId);
            const toNode = graph.nodes.find(n => n.id === edge.toNodeId);
            if (!fromNode || !toNode) return null;
            const from = portPosition(fromNode, edge.fromPortId);
            const to = portPosition(toNode, edge.toPortId);
            if (!from || !to) return null;
            return (
              <g key={edge.id} style={{ pointerEvents: 'none' }}>
                <path
                  d={edgePath(from.x, from.y, to.x, to.y)}
                  fill="none"
                  stroke="var(--color-figma-text-tertiary)"
                  strokeWidth={1.5}
                  strokeOpacity={0.5}
                />
                <circle cx={from.x} cy={from.y} r={3} fill="var(--color-figma-accent)" opacity={0.6} />
                <circle cx={to.x} cy={to.y} r={3} fill="var(--color-figma-accent)" opacity={0.6} />
              </g>
            );
          })}

          {/* Nodes */}
          {graph.nodes.map(node => (
            <g
              key={node.id}
              transform={`translate(${node.x}, ${node.y})`}
              onPointerDown={(e) => handleNodePointerDown(node.id, e)}
            >
              <NodeRenderer
                node={node}
                isSelected={selectedNodeId === node.id}
                isHighlighted={matchedNodeIds.size > 0 && matchedNodeIds.has(node.id)}
                onSelect={setSelectedNodeId}
              />
            </g>
          ))}
        </g>
      </svg>

      {/* Toolbar overlay */}
      <div className="absolute top-2 right-2 flex items-center gap-1" style={{ zIndex: 10 }}>
        <button
          onClick={() => setZoom(z => Math.min(3, z * 1.25))}
          className="w-6 h-6 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] flex items-center justify-center text-[12px] font-bold transition-colors"
          title="Zoom in"
        >
          +
        </button>
        <button
          onClick={() => setZoom(z => Math.max(0.2, z * 0.8))}
          className="w-6 h-6 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] flex items-center justify-center text-[12px] font-bold transition-colors"
          title="Zoom out"
        >
          -
        </button>
        <button
          onClick={fitToView}
          className="h-6 px-1.5 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] flex items-center justify-center text-[9px] transition-colors"
          title="Fit to view"
        >
          Fit
        </button>
        <span className="text-[9px] text-[var(--color-figma-text-tertiary)] ml-1 tabular-nums">
          {Math.round(zoom * 100)}%
        </span>
      </div>

      {/* Help text */}
      <div className="absolute bottom-2 left-2 text-[8px] text-[var(--color-figma-text-tertiary)] pointer-events-none" style={{ zIndex: 10 }}>
        Scroll to zoom &middot; Drag to pan
      </div>

      {/* Minimap */}
      <Minimap
        nodes={graph.nodes.map(n => ({ x: n.x, y: n.y, width: n.width, height: n.height || nodeHeight(n), kind: n.kind }))}
        pan={pan}
        zoom={zoom}
        viewW={containerSize.w}
        viewH={containerSize.h}
      />
    </div>
  );
}
