import { useRef, useCallback, useState, useEffect, useMemo } from 'react';
import type { TokenGenerator } from '../../hooks/useGenerators';
import type { UndoSlot } from '../../hooks/useUndo';
import type { TransformOp, PortDirection } from './nodeGraphTypes';
import { portPosition, TRANSFORM_OPS, nodeHeight, isCompatiblePortType } from './nodeGraphTypes';
import { useNodeGraph } from './useNodeGraph';
import { NodeRenderer } from './NodeRenderer';
import { edgePath } from '../../shared/graphUtils';

// ---------------------------------------------------------------------------
// Context menu for adding transform nodes
// ---------------------------------------------------------------------------

function AddNodeMenu({
  x,
  y,
  onAdd,
  onClose,
}: {
  x: number;
  y: number;
  onAdd: (op: TransformOp) => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Clamp position to prevent off-screen
  const menuW = 160;
  const menuH = TRANSFORM_OPS.length * 30 + 32;
  const clampedX = Math.min(x, window.innerWidth - menuW);
  const clampedY = Math.min(y, window.innerHeight - menuH);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] rounded-lg shadow-lg overflow-hidden"
      style={{ left: clampedX, top: clampedY, width: menuW }}
    >
      <div className="px-2 py-1.5 text-[9px] font-semibold text-[var(--color-figma-text-tertiary)] uppercase tracking-wider border-b border-[var(--color-figma-border)]">
        Add Transform Node
      </div>
      {TRANSFORM_OPS.map(({ op, label, description }) => (
        <button
          key={op}
          onClick={() => { onAdd(op); onClose(); }}
          className="w-full text-left px-2 py-1.5 hover:bg-[var(--color-figma-bg-hover)] transition-colors flex flex-col gap-0"
        >
          <span className="text-[10px] font-medium text-[var(--color-figma-text)]">{label}</span>
          <span className="text-[8px] text-[var(--color-figma-text-tertiary)]">{description}</span>
        </button>
      ))}
    </div>
  );
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
    transform: '#d97706',
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
    removeNode,
    addTransformNode,
    updateTransformParam,
    pushMoveUndo,
    addEdge: addEdgeAction,
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
  } = useNodeGraph(generators, activeSet, onPushUndo);

  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const panRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
  const dragRef = useRef<{ nodeId: string; startX: number; startY: number; nodeX: number; nodeY: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; graphX: number; graphY: number } | null>(null);
  const [containerSize, setContainerSize] = useState({ w: 600, h: 400 });
  const addBtnRef = useRef<HTMLButtonElement>(null);

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

  // Convert screen coords to graph coords
  const screenToGraph = useCallback(
    (sx: number, sy: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { x: sx, y: sy };
      return {
        x: (sx - rect.left - pan.x) / zoom,
        y: (sy - rect.top - pan.y) / zoom,
      };
    },
    [pan, zoom],
  );

  // ---------------------------------------------------------------------------
  // Pan
  // ---------------------------------------------------------------------------
  const handleCanvasPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button === 2) return; // right-click for context menu
      // Check if we clicked on a node
      const target = e.target as HTMLElement;
      if (target.closest('[data-node-id]')) return;

      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setIsPanning(true);
      panRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [pan, setSelectedNodeId, setSelectedEdgeId],
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
      if (wiring) {
        const g = screenToGraph(e.clientX, e.clientY);
        updateWiring(g.x, g.y);
      }
    },
    [zoom, moveNode, wiring, updateWiring, screenToGraph],
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
      if (wiring) {
        cancelWiring();
      }
    },
    [wiring, cancelWiring, persistPositions, pushMoveUndo],
  );

  // ---------------------------------------------------------------------------
  // Zoom (wheel)
  // ---------------------------------------------------------------------------
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.92 : 1.08;
      const newZoom = Math.max(0.2, Math.min(3, zoom * factor));
      // Zoom toward cursor
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
  // Context menu (right-click to add transform nodes)
  // ---------------------------------------------------------------------------
  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      const g = screenToGraph(e.clientX, e.clientY);
      setContextMenu({ x: e.clientX, y: e.clientY, graphX: g.x, graphY: g.y });
    },
    [screenToGraph],
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
  // Port interactions
  // ---------------------------------------------------------------------------
  const handlePortPointerDown = useCallback(
    (nodeId: string, portId: string, direction: PortDirection, cx: number, cy: number) => {
      startWiring(nodeId, portId, direction, cx, cy);
    },
    [startWiring],
  );

  const handlePortPointerUp = useCallback(
    (nodeId: string, portId: string, _direction: PortDirection) => {
      if (wiring) {
        finishWiring(nodeId, portId);
      }
    },
    [wiring, finishWiring],
  );

  // ---------------------------------------------------------------------------
  // Keyboard
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (document.activeElement?.tagName === 'INPUT') return;
        if (selectedNodeId) {
          const node = graph.nodes.find(n => n.id === selectedNodeId);
          if (node && node.kind === 'transform') {
            removeNode(selectedNodeId);
          }
        } else if (selectedEdgeId) {
          removeEdge(selectedEdgeId);
        }
      }
      if (e.key === 'Escape') {
        cancelWiring();
        setContextMenu(null);
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedNodeId, selectedEdgeId, graph.nodes, removeNode, removeEdge, cancelWiring, setSelectedNodeId, setSelectedEdgeId]);

  // ---------------------------------------------------------------------------
  // Floating "+" button — opens AddNodeMenu near the button
  // ---------------------------------------------------------------------------
  const handleAddButtonClick = useCallback(() => {
    const btn = addBtnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    // Place menu above-right of the button
    const menuX = rect.left;
    const menuY = rect.top - (TRANSFORM_OPS.length * 30 + 32) - 4;
    // Graph position: center of current viewport
    const graphCenter = screenToGraph(
      (containerSize.w) / 2 + (containerRef.current?.getBoundingClientRect().left ?? 0),
      (containerSize.h) / 2 + (containerRef.current?.getBoundingClientRect().top ?? 0),
    );
    setContextMenu({ x: menuX, y: Math.max(4, menuY), graphX: graphCenter.x, graphY: graphCenter.y });
  }, [screenToGraph, containerSize]);

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

  // Fit on first render
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
      onContextMenu={handleContextMenu}
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
          {/* Edges */}
          {graph.edges.map(edge => {
            const fromNode = graph.nodes.find(n => n.id === edge.fromNodeId);
            const toNode = graph.nodes.find(n => n.id === edge.toNodeId);
            if (!fromNode || !toNode) return null;
            const from = portPosition(fromNode, edge.fromPortId);
            const to = portPosition(toNode, edge.toPortId);
            if (!from || !to) return null;
            const isSelected = selectedEdgeId === edge.id;
            return (
              <g key={edge.id}>
                {/* Fat invisible hit target */}
                <path
                  d={edgePath(from.x, from.y, to.x, to.y)}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={12}
                  style={{ cursor: 'pointer' }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setSelectedEdgeId(edge.id);
                    setSelectedNodeId(null);
                  }}
                />
                <path
                  d={edgePath(from.x, from.y, to.x, to.y)}
                  fill="none"
                  stroke={isSelected ? 'var(--color-figma-accent)' : 'var(--color-figma-text-tertiary)'}
                  strokeWidth={isSelected ? 2 : 1.5}
                  strokeOpacity={isSelected ? 1 : 0.5}
                  style={{ pointerEvents: 'none' }}
                />
                {/* Port dots */}
                <circle cx={from.x} cy={from.y} r={3} fill="var(--color-figma-accent)" opacity={0.6} style={{ pointerEvents: 'none' }} />
                <circle cx={to.x} cy={to.y} r={3} fill="var(--color-figma-accent)" opacity={0.6} style={{ pointerEvents: 'none' }} />
              </g>
            );
          })}

          {/* Wiring temporary edge */}
          {wiring && (() => {
            const fromNode = graph.nodes.find(n => n.id === wiring.fromNodeId);
            if (!fromNode) return null;
            const from = portPosition(fromNode, wiring.fromPortId);
            if (!from) return null;
            const toX = wiring.mouseX;
            const toY = wiring.mouseY;
            return (
              <path
                d={wiring.fromDirection === 'out'
                  ? edgePath(from.x, from.y, toX, toY)
                  : edgePath(toX, toY, from.x, from.y)
                }
                fill="none"
                stroke="var(--color-figma-accent)"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                opacity={0.7}
                style={{ pointerEvents: 'none' }}
              />
            );
          })()}

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
                onPortPointerDown={handlePortPointerDown}
                onPortPointerUp={handlePortPointerUp}
                onParamChange={updateTransformParam}
                onDelete={removeNode}
                isWiring={!!wiring}
                wiringSourceDirection={wiring?.fromDirection ?? null}
                wiringSourcePortType={wiringSourcePortType}
                wiringSourceNodeId={wiring?.fromNodeId ?? null}
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

      {/* Floating "+" button — bottom-left, above help text */}
      <button
        ref={addBtnRef}
        onClick={handleAddButtonClick}
        className="absolute bottom-8 left-2 w-7 h-7 rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)] flex items-center justify-center text-[16px] font-bold shadow-sm transition-colors"
        style={{ zIndex: 10, lineHeight: 1 }}
        title="Add transform node"
      >
        +
      </button>

      {/* Help text */}
      <div className="absolute bottom-2 left-2 text-[8px] text-[var(--color-figma-text-tertiary)] pointer-events-none" style={{ zIndex: 10 }}>
        Scroll to zoom &middot; Drag to pan &middot; Right-click or + to add transform
      </div>

      {/* Minimap */}
      <Minimap
        nodes={graph.nodes.map(n => ({ x: n.x, y: n.y, width: n.width, height: n.height || nodeHeight(n), kind: n.kind }))}
        pan={pan}
        zoom={zoom}
        viewW={containerSize.w}
        viewH={containerSize.h}
      />

      {/* Context menu */}
      {contextMenu && (
        <AddNodeMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onAdd={(op) => addTransformNode(op, contextMenu.graphX, contextMenu.graphY)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
