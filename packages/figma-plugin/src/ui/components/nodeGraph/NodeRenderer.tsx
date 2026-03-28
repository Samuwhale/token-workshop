import type { GraphNode, Port, PortDirection, PortType } from './nodeGraphTypes';
import { NODE_HEADER_H, PORT_ROW_H, PORT_RADIUS, isCompatiblePortType } from './nodeGraphTypes';

// ---------------------------------------------------------------------------
// Color scheme per node kind
// ---------------------------------------------------------------------------

const KIND_COLORS: Record<string, { bg: string; border: string; header: string; headerText: string }> = {
  source: {
    bg: 'var(--color-figma-bg)',
    border: 'var(--color-figma-border)',
    header: 'var(--color-figma-bg-secondary)',
    headerText: 'var(--color-figma-text-secondary)',
  },
  generator: {
    bg: 'var(--color-figma-bg)',
    border: 'var(--color-figma-accent)',
    header: 'color-mix(in srgb, var(--color-figma-accent) 12%, var(--color-figma-bg))',
    headerText: 'var(--color-figma-accent)',
  },
  transform: {
    bg: 'var(--color-figma-bg)',
    border: '#d97706',
    header: 'color-mix(in srgb, #d97706 12%, var(--color-figma-bg))',
    headerText: '#d97706',
  },
  output: {
    bg: 'var(--color-figma-bg)',
    border: 'var(--color-figma-border)',
    header: 'var(--color-figma-bg-secondary)',
    headerText: 'var(--color-figma-text-secondary)',
  },
};

const PORT_TYPE_COLORS: Record<string, string> = {
  color: '#3b82f6',
  dimension: '#22c55e',
  number: '#a855f7',
  any: '#6b7280',
};

// ---------------------------------------------------------------------------
// Kind icons (inline SVGs)
// ---------------------------------------------------------------------------

function KindIcon({ kind }: { kind: string }) {
  switch (kind) {
    case 'source':
      return (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case 'generator':
      return (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      );
    case 'transform':
      return (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="16 3 21 3 21 8" />
          <line x1="4" y1="20" x2="21" y2="3" />
          <polyline points="21 16 21 21 16 21" />
          <line x1="15" y1="15" x2="21" y2="21" />
          <line x1="4" y1="4" x2="9" y2="9" />
        </svg>
      );
    case 'output':
      return (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      );
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Port circle
// ---------------------------------------------------------------------------

interface PortCircleProps {
  port: Port;
  nodeX: number;
  nodeWidth: number;
  portIndex: number;
  onPointerDown: (portId: string, direction: PortDirection, cx: number, cy: number) => void;
  onPointerUp: (portId: string, direction: PortDirection) => void;
  isWiring: boolean;
  /** During wiring: the direction of the source port, so we know which ports are valid targets */
  wiringSourceDirection: PortDirection | null;
  /** During wiring: the type of the source port, for compatibility check */
  wiringSourcePortType: PortType | null;
  /** During wiring: the node ID that started wiring (to exclude self-connection) */
  wiringSourceNodeId: string | null;
  /** This port's node ID */
  nodeId: string;
}

function PortCircle({
  port, nodeX, nodeWidth, portIndex, onPointerDown, onPointerUp,
  isWiring, wiringSourceDirection, wiringSourcePortType, wiringSourceNodeId, nodeId,
}: PortCircleProps) {
  const cx = port.direction === 'in' ? 0 : nodeWidth;
  const cy = NODE_HEADER_H + portIndex * PORT_ROW_H + PORT_ROW_H / 2;
  const color = PORT_TYPE_COLORS[port.type] || PORT_TYPE_COLORS.any;

  // Determine compatibility state during wiring
  let compatState: 'none' | 'valid' | 'invalid' = 'none';
  if (isWiring && wiringSourceDirection && wiringSourcePortType && wiringSourceNodeId) {
    const isSameNode = wiringSourceNodeId === nodeId;
    const isOppositeDirection = port.direction !== wiringSourceDirection;
    if (isSameNode) {
      compatState = 'invalid';
    } else if (!isOppositeDirection) {
      // Same direction — not a valid target
      compatState = 'invalid';
    } else {
      // Check type compatibility — determine which is out and which is in
      const outType = wiringSourceDirection === 'out' ? wiringSourcePortType : port.type;
      const inType = wiringSourceDirection === 'out' ? port.type : wiringSourcePortType;
      compatState = isCompatiblePortType(outType, inType) ? 'valid' : 'invalid';
    }
  }

  // Visual styling based on compat state
  let fillColor: string;
  let strokeColor: string;
  let portRadius = PORT_RADIUS;
  let opacity = 1;
  if (compatState === 'valid') {
    fillColor = color;
    strokeColor = color;
    portRadius = PORT_RADIUS + 1.5;
  } else if (compatState === 'invalid') {
    fillColor = 'var(--color-figma-bg)';
    strokeColor = color;
    opacity = 0.25;
  } else {
    fillColor = isWiring ? color : 'var(--color-figma-bg)';
    strokeColor = color;
  }

  return (
    <g
      style={{ cursor: compatState === 'invalid' ? 'not-allowed' : 'crosshair', opacity }}
      onPointerDown={(e) => {
        e.stopPropagation();
        onPointerDown(port.id, port.direction, nodeX + cx, cy);
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        onPointerUp(port.id, port.direction);
      }}
    >
      {/* Larger invisible hit target */}
      <circle cx={cx} cy={cy} r={12} fill="transparent" />
      {/* Glow ring for valid targets */}
      {compatState === 'valid' && (
        <circle
          cx={cx}
          cy={cy}
          r={PORT_RADIUS + 4}
          fill="none"
          stroke={color}
          strokeWidth={1}
          opacity={0.4}
          style={{ pointerEvents: 'none' }}
        />
      )}
      {/* Visible port circle */}
      <circle
        cx={cx}
        cy={cy}
        r={portRadius}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={1.5}
        style={{ transition: 'r 0.1s, fill 0.1s, opacity 0.1s' }}
      />
      {/* Port label */}
      <text
        x={port.direction === 'in' ? cx + PORT_RADIUS + 6 : cx - PORT_RADIUS - 6}
        y={cy + 3}
        textAnchor={port.direction === 'in' ? 'start' : 'end'}
        fontSize="9"
        fill="var(--color-figma-text-secondary)"
        style={{ userSelect: 'none', pointerEvents: 'none', opacity }}
      >
        {port.label}
      </text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Transform params inline editor
// ---------------------------------------------------------------------------

function TransformParamsInline({
  node,
  onParamChange,
}: {
  node: GraphNode;
  onParamChange: (key: string, value: number | string) => void;
}) {
  if (!node.transformParams) return null;

  const entries = Object.entries(node.transformParams);
  if (entries.length === 0) return null;

  const portsHeight = node.ports.length * PORT_ROW_H;

  return (
    <foreignObject
      x={8}
      y={NODE_HEADER_H + portsHeight + 2}
      width={node.width - 16}
      height={entries.length * 22}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {entries.map(([key, val]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '8px', color: 'var(--color-figma-text-tertiary)', width: '40px', textAlign: 'right', flexShrink: 0 }}>
              {key}
            </span>
            {typeof val === 'number' ? (
              <input
                type="number"
                value={val}
                onChange={(e) => onParamChange(key, parseFloat(e.target.value) || 0)}
                onPointerDown={(e) => e.stopPropagation()}
                style={{
                  width: '100%',
                  fontSize: '9px',
                  padding: '1px 4px',
                  border: '1px solid var(--color-figma-border)',
                  borderRadius: '3px',
                  background: 'var(--color-figma-bg-secondary)',
                  color: 'var(--color-figma-text)',
                  outline: 'none',
                }}
              />
            ) : (
              <input
                type="text"
                value={val}
                onChange={(e) => onParamChange(key, e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
                style={{
                  width: '100%',
                  fontSize: '9px',
                  padding: '1px 4px',
                  border: '1px solid var(--color-figma-border)',
                  borderRadius: '3px',
                  background: 'var(--color-figma-bg-secondary)',
                  color: 'var(--color-figma-text)',
                  outline: 'none',
                }}
              />
            )}
          </div>
        ))}
      </div>
    </foreignObject>
  );
}

// ---------------------------------------------------------------------------
// Node component
// ---------------------------------------------------------------------------

export interface NodeRendererProps {
  node: GraphNode;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onPortPointerDown: (nodeId: string, portId: string, direction: PortDirection, cx: number, cy: number) => void;
  onPortPointerUp: (nodeId: string, portId: string, direction: PortDirection) => void;
  onParamChange: (nodeId: string, key: string, value: number | string) => void;
  onDelete: (id: string) => void;
  isWiring: boolean;
  wiringSourceDirection: PortDirection | null;
  wiringSourcePortType: PortType | null;
  wiringSourceNodeId: string | null;
}

export function NodeRenderer({
  node,
  isSelected,
  onSelect,
  onPortPointerDown,
  onPortPointerUp,
  onParamChange,
  onDelete,
  isWiring,
  wiringSourceDirection,
  wiringSourcePortType,
  wiringSourceNodeId,
}: NodeRendererProps) {
  const colors = KIND_COLORS[node.kind] || KIND_COLORS.source;
  const h = node.height || NODE_HEADER_H + node.ports.length * PORT_ROW_H + 8;

  return (
    <g
      data-node-id={node.id}
      onPointerDown={(e) => {
        e.stopPropagation();
        onSelect(node.id);
      }}
      style={{ cursor: 'grab' }}
    >
      {/* Shadow */}
      <rect
        x={1}
        y={1}
        width={node.width}
        height={h}
        rx={6}
        fill="rgba(0,0,0,0.06)"
      />
      {/* Body */}
      <rect
        x={0}
        y={0}
        width={node.width}
        height={h}
        rx={6}
        fill={colors.bg}
        stroke={isSelected ? 'var(--color-figma-accent)' : colors.border}
        strokeWidth={isSelected ? 2 : 1}
        strokeOpacity={isSelected ? 1 : 0.5}
      />
      {/* Header bar */}
      <rect
        x={0}
        y={0}
        width={node.width}
        height={NODE_HEADER_H}
        rx={6}
        fill={colors.header}
      />
      {/* Bottom corners of header (square them off) */}
      <rect
        x={0}
        y={NODE_HEADER_H - 6}
        width={node.width}
        height={6}
        fill={colors.header}
      />
      {/* Header icon + label */}
      <g transform={`translate(8, ${NODE_HEADER_H / 2 + 1})`} style={{ pointerEvents: 'none' }}>
        <g transform="translate(0, -5)" style={{ color: colors.headerText }}>
          <KindIcon kind={node.kind} />
        </g>
        <text
          x={16}
          y={3}
          fontSize="10"
          fontWeight="600"
          fill={colors.headerText}
          style={{ userSelect: 'none' }}
        >
          {node.label.length > 18 ? node.label.slice(0, 17) + '\u2026' : node.label}
        </text>
      </g>
      {/* Delete button */}
      {(node.kind === 'transform') && (
        <g
          transform={`translate(${node.width - 16}, 6)`}
          style={{ cursor: 'pointer' }}
          onPointerDown={(e) => {
            e.stopPropagation();
            onDelete(node.id);
          }}
        >
          <rect x={-2} y={-2} width={14} height={14} rx={3} fill="transparent" />
          <line x1={0} y1={0} x2={8} y2={8} stroke="var(--color-figma-text-tertiary)" strokeWidth={1.5} strokeLinecap="round" />
          <line x1={8} y1={0} x2={0} y2={8} stroke="var(--color-figma-text-tertiary)" strokeWidth={1.5} strokeLinecap="round" />
        </g>
      )}

      {/* Subtitle row for specific node kinds */}
      {node.kind === 'source' && node.sourceTokenPath && (
        <text
          x={8}
          y={NODE_HEADER_H + 14}
          fontSize="8"
          fill="var(--color-figma-text-tertiary)"
          style={{ userSelect: 'none', pointerEvents: 'none' }}
        >
          {node.sourceTokenPath.length > 22
            ? node.sourceTokenPath.slice(0, 21) + '\u2026'
            : node.sourceTokenPath}
        </text>
      )}
      {node.kind === 'generator' && (
        <text
          x={8}
          y={NODE_HEADER_H + 14}
          fontSize="8"
          fill="var(--color-figma-text-tertiary)"
          style={{ userSelect: 'none', pointerEvents: 'none' }}
        >
          {node.generatorType} {node.stepCount ? `\u00b7 ${node.stepCount} steps` : ''}
        </text>
      )}
      {node.kind === 'output' && (
        <text
          x={8}
          y={NODE_HEADER_H + 14}
          fontSize="8"
          fill="var(--color-figma-text-tertiary)"
          style={{ userSelect: 'none', pointerEvents: 'none' }}
        >
          {node.targetSet ? `\u2192 ${node.targetSet}` : ''}
        </text>
      )}

      {/* Ports */}
      {node.ports.map((port, pi) => (
        <PortCircle
          key={port.id}
          port={port}
          nodeX={node.x}
          nodeWidth={node.width}
          portIndex={pi}
          onPointerDown={(portId, direction, cx, cy) =>
            onPortPointerDown(node.id, portId, direction, cx, cy)
          }
          onPointerUp={(portId, direction) =>
            onPortPointerUp(node.id, portId, direction)
          }
          isWiring={isWiring}
          wiringSourceDirection={wiringSourceDirection}
          wiringSourcePortType={wiringSourcePortType}
          wiringSourceNodeId={wiringSourceNodeId}
          nodeId={node.id}
        />
      ))}

      {/* Transform params */}
      {node.kind === 'transform' && (
        <TransformParamsInline
          node={node}
          onParamChange={(key, value) => onParamChange(node.id, key, value)}
        />
      )}
    </g>
  );
}
