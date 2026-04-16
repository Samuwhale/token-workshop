import type { GraphNode } from './nodeGraphTypes';
import {
  NODE_WIDTH,
  NODE_HEADER_H,
  SOURCE_LINE_H,
  PREVIEW_H,
  TARGET_LINE_H,
  FOOTER_H,
  FIXED_NODE_HEIGHT,
} from './nodeGraphTypes';
import { TYPE_LABELS } from '../recipes/recipeUtils';

// ---------------------------------------------------------------------------
// Status colors
// ---------------------------------------------------------------------------

function statusAccentColor(status: string): string | null {
  switch (status) {
    case 'stale': return 'var(--color-figma-warning)';
    case 'failed': return 'var(--color-figma-error)';
    case 'blocked': return 'var(--color-figma-warning)';
    default: return null;
  }
}

function statusDotColor(status: string): string {
  switch (status) {
    case 'stale': return 'var(--color-figma-warning)';
    case 'failed': return 'var(--color-figma-error)';
    case 'blocked': return 'var(--color-figma-warning)';
    case 'fresh': return 'var(--color-figma-success)';
    default: return 'var(--color-figma-text-tertiary)';
  }
}

// ---------------------------------------------------------------------------
// Inline preview (adapted from previous implementation)
// ---------------------------------------------------------------------------

function RecipePreview({ node }: { node: GraphNode }) {
  const y = NODE_HEADER_H + SOURCE_LINE_H + 2;
  const padX = 10;
  const w = NODE_WIDTH - padX * 2;

  if (node.previewColors && node.previewColors.length > 0) {
    const colors = node.previewColors.slice(0, 11);
    const dotR = 5;
    const spacing = Math.min(w / colors.length, dotR * 2.8);
    const totalW = (colors.length - 1) * spacing;
    const startX = padX + (w - totalW) / 2;
    return (
      <g style={{ pointerEvents: 'none' }}>
        {colors.map((c, i) => (
          <circle
            key={i}
            cx={startX + i * spacing}
            cy={y + PREVIEW_H / 2}
            r={dotR}
            fill={c}
            stroke="var(--color-figma-border)"
            strokeWidth={0.5}
          />
        ))}
      </g>
    );
  }

  switch (node.recipeType) {
    case 'colorRamp':
    case 'darkModeInversion': {
      const count = Math.min(node.stepCount || 7, 11);
      const dotR = 5;
      const spacing = Math.min(w / count, dotR * 2.8);
      const totalW = (count - 1) * spacing;
      const startX = padX + (w - totalW) / 2;
      return (
        <g style={{ pointerEvents: 'none' }}>
          {Array.from({ length: count }, (_, i) => {
            const lightness = 92 - (i / (count - 1)) * 74;
            return (
              <circle
                key={i}
                cx={startX + i * spacing}
                cy={y + PREVIEW_H / 2}
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
      const barCount = Math.min(node.stepCount || 4, 5);
      const barH = 3;
      const gap = 2;
      const totalH = barCount * barH + (barCount - 1) * gap;
      const startY = y + (PREVIEW_H - totalH) / 2;
      return (
        <g style={{ pointerEvents: 'none' }}>
          {Array.from({ length: barCount }, (_, i) => {
            const barW = w * (1 - i * 0.18);
            return (
              <rect
                key={i}
                x={padX}
                y={startY + i * (barH + gap)}
                width={Math.max(10, barW)}
                height={barH}
                rx={1.5}
                fill="var(--color-figma-text-tertiary)"
                opacity={0.85 - i * 0.12}
              />
            );
          })}
        </g>
      );
    }

    case 'spacingScale':
    case 'borderRadiusScale': {
      const count = Math.min(node.stepCount || 5, 7);
      const maxSize = 14;
      const spacing2 = w / (count + 1);
      return (
        <g style={{ pointerEvents: 'none' }}>
          {Array.from({ length: count }, (_, i) => {
            const size = 4 + (i / (count - 1)) * (maxSize - 4);
            return (
              <rect
                key={i}
                x={padX + spacing2 * (i + 1) - size / 2}
                y={y + PREVIEW_H / 2 - size / 2}
                width={size}
                height={size}
                rx={node.recipeType === 'borderRadiusScale' ? size * 0.3 : 1}
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
      const count = Math.min(node.stepCount || 6, 8);
      const dotR = 5;
      const spacing3 = Math.min(w / count, dotR * 2.8);
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
                cy={y + PREVIEW_H / 2}
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
      const count = Math.min(node.stepCount || 4, 8);
      const dotR = 3;
      const spacing4 = dotR * 3;
      const totalW = (count - 1) * spacing4;
      const startX = padX + (w - totalW) / 2;
      return (
        <g style={{ pointerEvents: 'none' }}>
          {Array.from({ length: count }, (_, i) => (
            <circle
              key={i}
              cx={startX + i * spacing4}
              cy={y + PREVIEW_H / 2}
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
// Main node renderer
// ---------------------------------------------------------------------------

export interface NodeRendererProps {
  node: GraphNode;
  isSelected: boolean;
  isHighlighted?: boolean;
  isHovered?: boolean;
  onSelect: (id: string) => void;
  onRun?: (recipeId: string) => void;
  onEdit?: (recipeId: string) => void;
}

export function NodeRenderer({
  node,
  isSelected,
  isHighlighted,
  isHovered,
  onSelect,
  onRun,
  onEdit,
}: NodeRendererProps) {
  const h = FIXED_NODE_HEIGHT;
  const w = node.width;
  const accent = statusAccentColor(node.status);
  const disabled = !node.enabled;
  const showActions = isHovered || isSelected;

  const trunc = (s: string, max: number) =>
    s.length > max ? s.slice(0, max - 1) + '\u2026' : s;

  const typeLabel = TYPE_LABELS[node.recipeType as keyof typeof TYPE_LABELS] || node.recipeType;

  // Y offsets for each section
  const sourceY = NODE_HEADER_H;
  const previewY = sourceY + SOURCE_LINE_H;
  const targetY = previewY + PREVIEW_H;
  const footerY = targetY + TARGET_LINE_H;

  return (
    <g
      data-node-id={node.id}
      onPointerDown={(e) => {
        e.stopPropagation();
        onSelect(node.id);
      }}
      style={{ cursor: 'grab', opacity: disabled ? 0.5 : 1 }}
    >
      {/* Highlight ring for search matches */}
      {isHighlighted && (
        <rect
          x={-4} y={-4}
          width={w + 8} height={h + 8}
          rx={10}
          fill="none"
          stroke="var(--color-figma-warning)"
          strokeWidth={2}
          strokeOpacity={0.9}
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* Shadow */}
      <rect
        x={1} y={2}
        width={w} height={h}
        rx={8}
        fill="rgba(0,0,0,0.06)"
      />

      {/* Body */}
      <rect
        x={0} y={0}
        width={w} height={h}
        rx={8}
        fill="var(--color-figma-bg)"
        stroke={isSelected ? 'var(--color-figma-accent)' : 'var(--color-figma-border)'}
        strokeWidth={isSelected ? 2 : 1}
        strokeOpacity={isSelected ? 1 : disabled ? 0.4 : 0.6}
        strokeDasharray={disabled ? '4 3' : undefined}
      />

      {/* Status accent — left border bar */}
      {accent && (
        <rect
          x={0} y={4}
          width={3} height={h - 8}
          rx={1.5}
          fill={accent}
        />
      )}

      {/* Header background */}
      <rect
        x={0} y={0}
        width={w} height={NODE_HEADER_H}
        rx={8}
        fill="var(--color-figma-bg-secondary)"
      />
      <rect
        x={0} y={NODE_HEADER_H - 8}
        width={w} height={8}
        fill="var(--color-figma-bg-secondary)"
      />

      {/* Header: name + status dot */}
      <text
        x={10} y={NODE_HEADER_H / 2 + 4.5}
        fontSize="12" fontWeight="600"
        fill="var(--color-figma-text)"
        style={{ userSelect: 'none', pointerEvents: 'none' }}
      >
        {trunc(node.label, 28)}
      </text>
      <circle
        cx={w - 12}
        cy={NODE_HEADER_H / 2}
        r={4}
        fill={statusDotColor(node.status)}
        opacity={0.9}
      />

      {/* Source line */}
      <text
        x={10} y={sourceY + SOURCE_LINE_H / 2 + 3.5}
        fontSize="10"
        fontFamily="ui-monospace, monospace"
        fill="var(--color-figma-text-tertiary)"
        style={{ userSelect: 'none', pointerEvents: 'none' }}
      >
        {node.sourceToken
          ? `\u2190 ${trunc(node.sourceToken, 32)}`
          : '\u2190 standalone'}
      </text>

      {/* Preview */}
      <RecipePreview node={node} />

      {/* Target line */}
      <text
        x={10} y={targetY + TARGET_LINE_H / 2 + 3.5}
        fontSize="10"
        fontFamily="ui-monospace, monospace"
        fill="var(--color-figma-text-tertiary)"
        style={{ userSelect: 'none', pointerEvents: 'none' }}
      >
        {`\u2192 ${trunc(node.targetGroup + '.*', 32)}`}
      </text>

      {/* Divider above footer */}
      <line
        x1={8} y1={footerY}
        x2={w - 8} y2={footerY}
        stroke="var(--color-figma-border)"
        strokeOpacity={0.4}
      />

      {/* Footer: type label + step count */}
      <text
        x={10} y={footerY + FOOTER_H / 2 + 3.5}
        fontSize="10"
        fill="var(--color-figma-text-secondary)"
        style={{ userSelect: 'none', pointerEvents: 'none' }}
      >
        {typeLabel}{node.stepCount > 0 ? ` \u00b7 ${node.stepCount} steps` : ''}
      </text>

      {/* Action icons (visible on hover/select) */}
      {showActions && (
        <g>
          {/* Run button */}
          <g
            style={{ cursor: 'pointer' }}
            onPointerDown={(e) => {
              e.stopPropagation();
              onRun?.(node.recipeId);
            }}
          >
            <rect
              x={w - 48} y={footerY + 3}
              width={18} height={16}
              rx={3}
              fill="var(--color-figma-bg-hover)"
              opacity={0.8}
            />
            <svg x={w - 44} y={footerY + 5} width="10" height="12" viewBox="0 0 24 24" aria-hidden="true">
              <polygon points="5 3 19 12 5 21 5 3" fill="var(--color-figma-accent)" />
            </svg>
          </g>

          {/* Edit button */}
          <g
            style={{ cursor: 'pointer' }}
            onPointerDown={(e) => {
              e.stopPropagation();
              onEdit?.(node.recipeId);
            }}
          >
            <rect
              x={w - 26} y={footerY + 3}
              width={18} height={16}
              rx={3}
              fill="var(--color-figma-bg-hover)"
              opacity={0.8}
            />
            <svg x={w - 22} y={footerY + 5} width="10" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-figma-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
            </svg>
          </g>
        </g>
      )}
    </g>
  );
}
