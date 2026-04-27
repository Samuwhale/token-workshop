import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import type { DerivationSourceEdge as DerivationSourceEdgeModel } from "@tokenmanager/core";

export interface DerivationSourceEdgeData extends Record<string, unknown> {
  edge?: DerivationSourceEdgeModel;
  totalCollectionModes?: number;
  isEmphasized?: boolean;
  dimmed?: boolean;
}

export function DerivationSourceEdge(props: EdgeProps) {
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
  const typed = (data ?? {}) as DerivationSourceEdgeData;
  const edge = typed.edge;
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const color = edge?.isMissingTarget
    ? "var(--color-figma-error)"
    : edge?.inCycle
      ? "var(--color-figma-warning)"
      : "var(--color-figma-accent)";
  const showParamLabel = Boolean(edge?.paramLabel) && (!typed.dimmed || selected);
  const isPartialCoverage =
    edge != null &&
    !edge.paramLabel &&
    typed.totalCollectionModes != null &&
    (edge.modeNames?.length ?? 0) > 0 &&
    (edge.modeNames?.length ?? 0) < typed.totalCollectionModes;
  const showModeLabels = isPartialCoverage && (!typed.dimmed || selected);
  const active = Boolean(typed.isEmphasized || selected);

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: color,
          strokeWidth: typed.isEmphasized || selected ? 2.25 : 1.35,
          strokeDasharray: "3 4",
          opacity: typed.dimmed && !selected ? 0.18 : 1,
          transition: "stroke-width 120ms, opacity 120ms",
        }}
      />
      {showParamLabel || showModeLabels ? (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -135%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "none",
            }}
            className="flex gap-0.5"
          >
            {showParamLabel ? (
              <span className="rounded bg-[var(--color-figma-bg)] px-1 text-[10px] leading-[14px] text-[var(--color-figma-text-tertiary)] shadow-sm ring-1 ring-[var(--color-figma-border)]">
                {edge?.paramLabel}
              </span>
            ) : null}
            {showModeLabels ? renderModeLabels(edge?.modeNames ?? [], active) : null}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

function renderModeLabels(modeNames: readonly string[], active: boolean) {
  const visible = modeNames.slice(0, 2);
  const overflow = modeNames.length - visible.length;
  const chipClass = active
    ? "rounded bg-[var(--color-figma-bg)] px-1 text-[10px] leading-[14px] text-[var(--color-figma-text)] shadow-sm ring-1 ring-[var(--color-figma-border)]"
    : "rounded bg-[var(--color-figma-bg)]/85 px-1 text-[10px] leading-[14px] text-[var(--color-figma-text-tertiary)] ring-1 ring-[var(--color-figma-border)]/50";
  return (
    <>
      {visible.map((name) => (
        <span key={name} className={chipClass}>
          {name}
        </span>
      ))}
      {overflow > 0 ? <span className={chipClass}>+{overflow}</span> : null}
    </>
  );
}
