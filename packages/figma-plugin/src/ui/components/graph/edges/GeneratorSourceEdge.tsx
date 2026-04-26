import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";

export function GeneratorSourceEdge(props: EdgeProps) {
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
  const typed = (data ?? {}) as { isEmphasized?: boolean; dimmed?: boolean };
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const color = selected
    ? "var(--color-figma-accent)"
    : "var(--color-figma-generator)";

  return (
    <BaseEdge
      id={id}
      path={path}
      markerEnd={markerEnd}
      style={{
        stroke: color,
        strokeWidth: typed.isEmphasized || selected ? 2.5 : 1.5,
        strokeDasharray: "2 4",
        opacity: typed.dimmed && !selected ? 0.18 : 1,
        transition: "stroke-width 120ms, opacity 120ms",
      }}
    />
  );
}
