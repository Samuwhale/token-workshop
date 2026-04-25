import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";
import type { AliasEdge as AliasEdgeModel } from "@tokenmanager/core";

export interface AliasEdgeData extends Record<string, unknown> {
  edge: AliasEdgeModel;
  isCrossCollection?: boolean;
  totalCollectionModes?: number;
  isHighlighted?: boolean;
  aggregateCount?: number;
}

export function AliasEdge(props: EdgeProps) {
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
  const typed = (data ?? {}) as AliasEdgeData;
  const edge = typed.edge;
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const color = edge?.inCycle
    ? "var(--color-figma-warning)"
    : edge?.isMissingTarget
      ? "var(--color-figma-error)"
      : selected || typed.isHighlighted
        ? "var(--color-figma-accent)"
        : "var(--color-figma-text-tertiary)";

  const style = {
    stroke: color,
    strokeWidth: typed.isHighlighted ? 2.5 : 1.5,
    ...(edge?.isMissingTarget ? { strokeDasharray: "4 3" } : {}),
  };

  const showModeCount =
    edge &&
    typed.totalCollectionModes &&
    edge.modeNames.length > 0 &&
    edge.modeNames.length < typed.totalCollectionModes;

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
      {(showModeCount || typed.isCrossCollection || typed.aggregateCount) && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "none",
            }}
            className="rounded bg-[var(--color-figma-bg)] px-1 text-[10px] text-[var(--color-figma-text-tertiary)]"
          >
            {typed.isCrossCollection ? "↗ " : ""}
            {showModeCount ? `·${edge!.modeNames.length}` : ""}
            {typed.aggregateCount ? ` ${typed.aggregateCount}` : ""}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
