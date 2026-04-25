import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";
import type { AliasEdge as AliasEdgeModel } from "@tokenmanager/core";

export interface AliasEdgeData extends Record<string, unknown> {
  edge: AliasEdgeModel;
  totalCollectionModes?: number;
  isEmphasized?: boolean;
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
      : selected
        ? "var(--color-figma-accent)"
        : "var(--color-figma-text-tertiary)";

  const style = {
    stroke: color,
    strokeWidth: typed.isEmphasized || selected ? 2.5 : 1.5,
    transition: "stroke-width 120ms",
    ...(edge?.isMissingTarget ? { strokeDasharray: "4 3" } : {}),
  };

  // Mode chips appear only on partial-mode-coverage edges that the user is
  // looking at (hovered or selected). Full-coverage edges carry no label —
  // the absence is itself information.
  const isPartialCoverage =
    edge != null &&
    typed.totalCollectionModes != null &&
    edge.modeNames.length > 0 &&
    edge.modeNames.length < typed.totalCollectionModes;
  const showChips = isPartialCoverage && (typed.isEmphasized || selected);

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
      {showChips ? (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "none",
            }}
            className="flex gap-0.5"
          >
            {renderModeChips(edge!.modeNames)}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

function renderModeChips(modeNames: readonly string[]) {
  const visible = modeNames.slice(0, 2);
  const overflow = modeNames.length - visible.length;
  return (
    <>
      {visible.map((name) => (
        <span
          key={name}
          className="rounded bg-[var(--color-figma-bg)] px-1 text-[10px] leading-[14px] text-[var(--color-figma-text-secondary)] ring-1 ring-[var(--color-figma-border)]"
        >
          {name}
        </span>
      ))}
      {overflow > 0 ? (
        <span className="rounded bg-[var(--color-figma-bg)] px-1 text-[10px] leading-[14px] text-[var(--color-figma-text-tertiary)] ring-1 ring-[var(--color-figma-border)]">
          +{overflow}
        </span>
      ) : null}
    </>
  );
}
