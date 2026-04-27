import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";
import type { DerivationProducesEdge as DerivationProducesEdgeModel } from "@tokenmanager/core";

export interface DerivationProducesEdgeData extends Record<string, unknown> {
  edge?: DerivationProducesEdgeModel;
  isEmphasized?: boolean;
  dimmed?: boolean;
}

export function DerivationProducesEdge(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    markerEnd,
    data,
    selected,
  } = props;
  const typed = (data ?? {}) as DerivationProducesEdgeData;
  const edge = typed.edge;
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const color = edge?.inCycle
    ? "var(--color-figma-warning)"
    : "var(--color-figma-accent)";

  return (
    <BaseEdge
      id={id}
      path={path}
      markerEnd={markerEnd}
      style={{
        stroke: color,
        strokeWidth: typed.isEmphasized || selected ? 2.5 : 1.5,
        opacity: typed.dimmed && !selected ? 0.18 : 1,
        transition: "stroke-width 120ms, opacity 120ms",
      }}
    />
  );
}
