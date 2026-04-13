import { useRef, useCallback, useState, useEffect, useMemo } from 'react';
import type { TokenGenerator } from '../../hooks/useGenerators';
import type { UndoSlot } from '../../hooks/useUndo';
import { portInPosition, portOutPosition, FIXED_NODE_HEIGHT } from './nodeGraphTypes';
import { useNodeGraph } from './useNodeGraph';
import { NodeRenderer } from './NodeRenderer';
import { edgePath } from '../../shared/graphUtils';

// ---------------------------------------------------------------------------
// Detail popover — HTML overlay for selected node
// ---------------------------------------------------------------------------

function formatRelativeTime(value?: string): string | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  const diffMs = Date.now() - time;
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000));
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

interface DetailPopoverProps {
  generator: TokenGenerator;
  nodeScreenX: number;
  nodeScreenY: number;
  nodeWidth: number;
  onRun: (id: string) => void;
  onEdit: (id: string) => void;
  onViewTokens: (targetGroup: string, targetSet: string) => void;
}

function DetailPopover({
  generator,
  nodeScreenX,
  nodeScreenY,
  nodeWidth,
  onRun,
  onEdit,
  onViewTokens,
}: DetailPopoverProps) {
  const lastRun = formatRelativeTime(generator.lastRunAt);
  const hasError = !!generator.lastRunError;

  return (
    <div
      className="absolute z-50 w-56 rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-lg p-2.5 text-[10px]"
      style={{
        left: nodeScreenX + nodeWidth + 8,
        top: nodeScreenY,
        maxHeight: 240,
        overflow: 'auto',
      }}
    >
      {/* Source */}
      <div className="mb-1.5">
        <span className="text-[var(--color-figma-text-tertiary)]">Source: </span>
        <span className="font-mono text-[var(--color-figma-text-secondary)] break-all">
          {generator.sourceToken || 'standalone'}
        </span>
      </div>

      {/* Target */}
      <div className="mb-1.5">
        <span className="text-[var(--color-figma-text-tertiary)]">Target: </span>
        <span className="font-mono text-[var(--color-figma-text-secondary)] break-all">
          {generator.targetGroup}.* {generator.targetSet ? `\u2192 ${generator.targetSet}` : ''}
        </span>
      </div>

      {/* Last run */}
      {lastRun && (
        <div className="mb-1.5 text-[var(--color-figma-text-tertiary)]">
          Last run {lastRun}
        </div>
      )}

      {/* Error */}
      {hasError && (
        <div className="mb-1.5 px-1.5 py-1 rounded bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)] break-words">
          {generator.lastRunError!.message}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1 mt-2 pt-1.5 border-t border-[var(--color-figma-border)]">
        <button
          onClick={() => onRun(generator.id)}
          className="flex-1 py-1 rounded text-center bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] transition-colors"
        >
          Run
        </button>
        <button
          onClick={() => onEdit(generator.id)}
          className="flex-1 py-1 rounded text-center border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
        >
          Edit
        </button>
        <button
          onClick={() => onViewTokens(generator.targetGroup, generator.targetSet)}
          className="flex-1 py-1 rounded text-center border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
        >
          Tokens
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main canvas
// ---------------------------------------------------------------------------

export interface NodeGraphCanvasProps {
  generators: TokenGenerator[];
  activeSet: string;
  onRefresh: () => void;
  onPushUndo?: (slot: UndoSlot) => void;
  searchQuery?: string;
  onEditGenerator?: (generatorId: string) => void;
  onRunGenerator?: (generatorId: string) => void;
  onViewTokens?: (targetGroup: string, targetSet: string) => void;
}

export function NodeGraphCanvas({
  generators,
  activeSet,
  onPushUndo,
  searchQuery = '',
  onEditGenerator,
  onRunGenerator,
  onViewTokens,
}: NodeGraphCanvasProps) {
  const {
    graph,
    moveNode,
    pushMoveUndo,
    selectedNodeId,
    setSelectedNodeId,
    selectedGenerator,
    persistPositions,
  } = useNodeGraph(generators, activeSet, onPushUndo);

  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const panRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
  const dragRef = useRef<{ nodeId: string; startX: number; startY: number; nodeX: number; nodeY: number } | null>(null);
  const [containerSize, setContainerSize] = useState({ w: 600, h: 400 });
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const lastClickRef = useRef<{ nodeId: string; time: number } | null>(null);

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
          (n.sourceToken ?? '').toLowerCase().includes(q) ||
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
    const maxY = Math.max(...matchedNodes.map(n => n.y + FIXED_NODE_HEIGHT));
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
  // Node pointer handlers
  // ---------------------------------------------------------------------------
  const handleNodePointerDown = useCallback(
    (nodeId: string, e: React.PointerEvent<SVGGElement>) => {
      const node = graph.nodes.find(n => n.id === nodeId);
      if (!node) return;

      // Double-click detection
      const now = Date.now();
      if (
        lastClickRef.current &&
        lastClickRef.current.nodeId === nodeId &&
        now - lastClickRef.current.time < 350
      ) {
        // Double-click → edit
        lastClickRef.current = null;
        if (onEditGenerator) onEditGenerator(node.generatorId);
        return;
      }
      lastClickRef.current = { nodeId, time: now };

      setSelectedNodeId(nodeId);
      dragRef.current = {
        nodeId,
        startX: e.clientX,
        startY: e.clientY,
        nodeX: node.x,
        nodeY: node.y,
      };
    },
    [graph.nodes, setSelectedNodeId, onEditGenerator],
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
    const maxY = Math.max(...graph.nodes.map(n => n.y + FIXED_NODE_HEIGHT));
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
  // Popover positioning
  // ---------------------------------------------------------------------------
  const selectedNode = selectedNodeId ? graph.nodes.find(n => n.id === selectedNodeId) : null;
  const popoverPos = useMemo(() => {
    if (!selectedNode) return null;
    return {
      x: selectedNode.x * zoom + pan.x,
      y: selectedNode.y * zoom + pan.y,
      width: selectedNode.width * zoom,
    };
  }, [selectedNode, zoom, pan]);

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
            <circle cx={zoom} cy={zoom} r={zoom * 0.8} fill="var(--color-figma-text-tertiary)" opacity="0.12" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#ng-grid)" />
      </svg>

      {/* Main SVG layer */}
      <svg
        className="absolute inset-0"
        width="100%"
        height="100%"
        style={{ zIndex: 1 }}
      >
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* Dependency edges */}
          {graph.dependencyEdges.map(dep => {
            const fromNode = graph.nodes.find(n => n.id === `gen-${dep.fromGeneratorId}`);
            const toNode = graph.nodes.find(n => n.id === `gen-${dep.toGeneratorId}`);
            if (!fromNode || !toNode) return null;

            const from = portOutPosition(fromNode);
            const to = portInPosition(toNode);
            const path = edgePath(from.x, from.y, to.x, to.y);

            const shortLabel = dep.label.length > 26 ? `\u2026${dep.label.slice(-24)}` : dep.label;
            const midX = (from.x + to.x) / 2;
            const midY = (from.y + to.y) / 2;

            return (
              <g key={dep.id} style={{ pointerEvents: 'none' }} aria-hidden="true">
                {/* Glow */}
                <path d={path} fill="none" stroke="var(--color-figma-accent)" strokeWidth={6} strokeOpacity={0.06} />
                {/* Line */}
                <path
                  d={path}
                  fill="none"
                  stroke="var(--color-figma-accent)"
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                  strokeOpacity={0.5}
                />
                {/* Target dot */}
                <circle cx={to.x} cy={to.y} r={3} fill="var(--color-figma-accent)" opacity={0.7} />
                {/* Label */}
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
                    strokeOpacity={0.35}
                    opacity={0.92}
                  />
                  <text
                    x={midX}
                    y={midY + 3.5}
                    textAnchor="middle"
                    fontFamily="ui-monospace,monospace"
                    fontSize={8}
                    fill="var(--color-figma-accent)"
                    opacity={0.8}
                  >
                    {shortLabel}
                  </text>
                </g>
              </g>
            );
          })}

          {/* Nodes */}
          {graph.nodes.map(node => (
            <g
              key={node.id}
              transform={`translate(${node.x}, ${node.y})`}
              onPointerDown={(e) => handleNodePointerDown(node.id, e)}
              onPointerEnter={() => setHoveredNodeId(node.id)}
              onPointerLeave={() => setHoveredNodeId(prev => prev === node.id ? null : prev)}
            >
              <NodeRenderer
                node={node}
                isSelected={selectedNodeId === node.id}
                isHighlighted={matchedNodeIds.size > 0 && matchedNodeIds.has(node.id)}
                isHovered={hoveredNodeId === node.id}
                onSelect={setSelectedNodeId}
                onRun={onRunGenerator}
                onEdit={onEditGenerator}
              />
            </g>
          ))}
        </g>
      </svg>

      {/* Fit button */}
      <button
        onClick={fitToView}
        className="absolute top-2 right-2 w-7 h-7 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] flex items-center justify-center transition-colors"
        style={{ zIndex: 10 }}
        title="Fit to view"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" />
        </svg>
      </button>

      {/* Detail popover */}
      {selectedGenerator && popoverPos && onEditGenerator && onRunGenerator && onViewTokens && (
        <DetailPopover
          generator={selectedGenerator}
          nodeScreenX={popoverPos.x}
          nodeScreenY={popoverPos.y}
          nodeWidth={popoverPos.width}
          onRun={onRunGenerator}
          onEdit={onEditGenerator}
          onViewTokens={onViewTokens}
        />
      )}
    </div>
  );
}
