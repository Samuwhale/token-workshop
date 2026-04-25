import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";

export function GeneratorProducesEdge(props: EdgeProps) {
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
  const typed = (data ?? {}) as {
    isHighlighted?: boolean;
    isEmphasized?: boolean;
  };
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const color = selected
    || typed.isHighlighted
    ? "var(--color-figma-accent)"
    : "var(--color-figma-generator)";

  return (
    <BaseEdge
      id={id}
      path={path}
      markerEnd={markerEnd}
      style={{
        stroke: color,
        strokeWidth: typed.isHighlighted || typed.isEmphasized ? 2.5 : 1,
        transition: "stroke-width 120ms",
      }}
    />
  );
}
