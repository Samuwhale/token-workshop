import type { GraphNode } from './nodeGraphTypes';
import { NODE_HEADER_H, PORT_ROW_H, GENERATOR_PREVIEW_H } from './nodeGraphTypes';

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
  output: {
    bg: 'var(--color-figma-bg)',
    border: 'var(--color-figma-border)',
    header: 'var(--color-figma-bg-secondary)',
    headerText: 'var(--color-figma-text-secondary)',
  },
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
// Port label row (read-only, no wiring affordances)
// ---------------------------------------------------------------------------

function PortRow({ label, direction, index }: { label: string; direction: 'in' | 'out'; index: number }) {
  const cy = NODE_HEADER_H + index * PORT_ROW_H + PORT_ROW_H / 2;
  return (
    <text
      x={direction === 'in' ? 10 : -10}
      y={cy + 3}
      textAnchor={direction === 'in' ? 'start' : 'end'}
      fontSize="9"
      fill="var(--color-figma-text-secondary)"
      style={{ userSelect: 'none', pointerEvents: 'none' }}
    >
      {label}
    </text>
  );
}

// ---------------------------------------------------------------------------
// Inline preview for generator nodes
// ---------------------------------------------------------------------------

function GeneratorPreview({ node }: { node: GraphNode }) {
  const y = NODE_HEADER_H + node.ports.length * PORT_ROW_H + 4;
  const padX = 10;
  const w = node.width - padX * 2;

  if (node.previewColors && node.previewColors.length > 0) {
    const colors = node.previewColors.slice(0, 7);
    const dotR = 4;
    const spacing = Math.min(w / colors.length, dotR * 3);
    const totalW = (colors.length - 1) * spacing;
    const startX = padX + (w - totalW) / 2;
    return (
      <g style={{ pointerEvents: 'none' }}>
        {colors.map((c, i) => (
          <circle
            key={i}
            cx={startX + i * spacing}
            cy={y + GENERATOR_PREVIEW_H / 2}
            r={dotR}
            fill={c}
            stroke="var(--color-figma-border)"
            strokeWidth={0.5}
          />
        ))}
      </g>
    );
  }

  switch (node.generatorType) {
    case 'colorRamp':
    case 'darkModeInversion': {
      const count = Math.min(node.stepCount || 5, 7);
      const dotR = 4;
      const spacing = Math.min(w / count, dotR * 3);
      const totalW = (count - 1) * spacing;
      const startX = padX + (w - totalW) / 2;
      return (
        <g style={{ pointerEvents: 'none' }}>
          {Array.from({ length: count }, (_, i) => {
            const lightness = 90 - (i / (count - 1)) * 70;
            return (
              <circle
                key={i}
                cx={startX + i * spacing}
                cy={y + GENERATOR_PREVIEW_H / 2}
                r={dotR}
                fill={`hsl(220, 50%, ${lightness}%)`}
                stroke="var(--color-figma-border)"
                strokeWidth={0.5}
              />
            );
          })}
        </g>
      );
    }

    case 'typeScale': {
      const barCount = Math.min(node.stepCount || 3, 4);
      const barH = 2.5;
      const gap = 1.5;
      const totalH = barCount * barH + (barCount - 1) * gap;
      const startY = y + (GENERATOR_PREVIEW_H - totalH) / 2;
      return (
        <g style={{ pointerEvents: 'none' }}>
          {Array.from({ length: barCount }, (_, i) => {
            const barW = w * (1 - i * 0.2);
            return (
              <rect
                key={i}
                x={padX}
                y={startY + i * (barH + gap)}
                width={Math.max(8, barW)}
                height={barH}
                rx={1}
                fill="var(--color-figma-text-tertiary)"
                opacity={0.8 - i * 0.15}
              />
            );
          })}
        </g>
      );
    }

    case 'spacingScale':
    case 'borderRadiusScale': {
      const count = Math.min(node.stepCount || 4, 5);
      const maxSize = 10;
      const spacing2 = w / (count + 1);
      return (
        <g style={{ pointerEvents: 'none' }}>
          {Array.from({ length: count }, (_, i) => {
            const size = 3 + (i / (count - 1)) * (maxSize - 3);
            return (
              <rect
                key={i}
                x={padX + spacing2 * (i + 1) - size / 2}
                y={y + GENERATOR_PREVIEW_H / 2 - size / 2}
                width={size}
                height={size}
                rx={node.generatorType === 'borderRadiusScale' ? size * 0.3 : 1}
                fill="none"
                stroke="var(--color-figma-text-tertiary)"
                strokeWidth={1}
                opacity={0.7}
              />
            );
          })}
        </g>
      );
    }

    case 'opacityScale': {
      const count = Math.min(node.stepCount || 5, 6);
      const dotR = 4;
      const spacing3 = Math.min(w / count, dotR * 3);
      const totalW = (count - 1) * spacing3;
      const startX = padX + (w - totalW) / 2;
      return (
        <g style={{ pointerEvents: 'none' }}>
          {Array.from({ length: count }, (_, i) => {
            const opacity = 1 - (i / count) * 0.8;
            return (
              <circle
                key={i}
                cx={startX + i * spacing3}
                cy={y + GENERATOR_PREVIEW_H / 2}
                r={dotR}
                fill="var(--color-figma-text-secondary)"
                opacity={opacity}
              />
            );
          })}
        </g>
      );
    }

    default: {
      const count = Math.min(node.stepCount || 3, 6);
      const dotR = 2;
      const spacing4 = dotR * 3;
      const totalW = (count - 1) * spacing4;
      const startX = padX + (w - totalW) / 2;
      return (
        <g style={{ pointerEvents: 'none' }}>
          {Array.from({ length: count }, (_, i) => (
            <circle
              key={i}
              cx={startX + i * spacing4}
              cy={y + GENERATOR_PREVIEW_H / 2}
              r={dotR}
              fill="var(--color-figma-text-tertiary)"
              opacity={0.6}
            />
          ))}
        </g>
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Node component — read-only, no wiring or transform node support
// ---------------------------------------------------------------------------

export interface NodeRendererProps {
  node: GraphNode;
  isSelected: boolean;
  isHighlighted?: boolean;
  onSelect: (id: string) => void;
}

export function NodeRenderer({
  node,
  isSelected,
  isHighlighted,
  onSelect,
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
      <rect x={1} y={1} width={node.width} height={h} rx={6} fill="rgba(0,0,0,0.06)" />
      {/* Highlight ring for search matches */}
      {isHighlighted && (
        <rect
          x={-4} y={-4}
          width={node.width + 8} height={h + 8}
          rx={10}
          fill="none"
          stroke="#f59e0b"
          strokeWidth={2}
          strokeOpacity={0.9}
          style={{ pointerEvents: 'none' }}
        />
      )}
      {/* Body */}
      <rect
        x={0} y={0}
        width={node.width} height={h}
        rx={6}
        fill={colors.bg}
        stroke={isSelected ? 'var(--color-figma-accent)' : colors.border}
        strokeWidth={isSelected ? 2 : 1}
        strokeOpacity={isSelected ? 1 : 0.5}
      />
      {/* Header bar */}
      <rect x={0} y={0} width={node.width} height={NODE_HEADER_H} rx={6} fill={colors.header} />
      <rect x={0} y={NODE_HEADER_H - 6} width={node.width} height={6} fill={colors.header} />
      {/* Header icon + label */}
      <g transform={`translate(8, ${NODE_HEADER_H / 2 + 1})`} style={{ pointerEvents: 'none' }}>
        <g transform="translate(0, -5)" style={{ color: colors.headerText }}>
          <KindIcon kind={node.kind} />
        </g>
        <text
          x={16} y={3}
          fontSize="10" fontWeight="600"
          fill={colors.headerText}
          style={{ userSelect: 'none' }}
        >
          {node.label.length > 18 ? node.label.slice(0, 17) + '\u2026' : node.label}
        </text>
      </g>

      {/* Subtitle rows */}
      {node.kind === 'source' && node.sourceTokenPath && (
        <text
          x={8} y={NODE_HEADER_H + 14}
          fontSize="8" fill="var(--color-figma-text-tertiary)"
          style={{ userSelect: 'none', pointerEvents: 'none' }}
        >
          {node.sourceTokenPath.length > 22
            ? node.sourceTokenPath.slice(0, 21) + '\u2026'
            : node.sourceTokenPath}
        </text>
      )}
      {node.kind === 'generator' && (
        <text
          x={8} y={NODE_HEADER_H + 14}
          fontSize="8" fill="var(--color-figma-text-tertiary)"
          style={{ userSelect: 'none', pointerEvents: 'none' }}
        >
          {node.generatorType} {node.stepCount ? `\u00b7 ${node.stepCount} steps` : ''}
        </text>
      )}
      {node.kind === 'output' && (
        <text
          x={8} y={NODE_HEADER_H + 14}
          fontSize="8" fill="var(--color-figma-text-tertiary)"
          style={{ userSelect: 'none', pointerEvents: 'none' }}
        >
          {node.targetSet ? `\u2192 ${node.targetSet}` : ''}
        </text>
      )}

      {/* Inline preview for generator nodes */}
      {node.kind === 'generator' && <GeneratorPreview node={node} />}

      {/* Port labels (read-only) */}
      {node.ports.map((port, pi) => (
        <PortRow key={port.id} label={port.label} direction={port.direction} index={pi} />
      ))}
    </g>
  );
}
