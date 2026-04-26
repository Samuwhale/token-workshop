import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import type { AliasEdge as AliasEdgeModel } from "@tokenmanager/core";

export interface AliasEdgeData extends Record<string, unknown> {
  edge: AliasEdgeModel;
  totalCollectionModes?: number;
  isEmphasized?: boolean;
  dimmed?: boolean;
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

  const isCycle = Boolean(edge?.inCycle);
  const isMissing = Boolean(edge?.isMissingTarget);
  const color = isCycle
    ? "var(--color-figma-warning)"
    : isMissing
      ? "var(--color-figma-error)"
      : selected
        ? "var(--color-figma-accent)"
        : typed.isEmphasized
          ? "var(--color-figma-text-secondary)"
          : "var(--color-figma-text-tertiary)";

  const style = {
    stroke: color,
    strokeWidth: typed.isEmphasized || selected ? 2.25 : 1.25,
    opacity: typed.dimmed && !selected ? 0.18 : 1,
    transition: "stroke-width 120ms, stroke 120ms, opacity 120ms",
    ...(isMissing ? { strokeDasharray: "4 3" } : {}),
  };

  // A partial-coverage alias means the alias only applies to a subset of the
  // collection's modes — the user should see *which* modes at a glance, not
  // only on hover. Full-coverage edges stay quiet (no chips) so the canvas
  // doesn't drown in labels.
  const isPartialCoverage =
    edge != null &&
    typed.totalCollectionModes != null &&
    edge.modeNames.length > 0 &&
    edge.modeNames.length < typed.totalCollectionModes;
  const showChips = isPartialCoverage && (!typed.dimmed || selected);
  const chipsActive = Boolean(typed.isEmphasized || selected);

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
      {showChips ? (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -120%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "none",
            }}
            className="flex gap-0.5"
          >
            {renderModeChips(edge!.modeNames, chipsActive)}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

function renderModeChips(modeNames: readonly string[], active: boolean) {
  const visible = modeNames.slice(0, 2);
  const overflow = modeNames.length - visible.length;
  const baseChip = active
    ? "rounded bg-[var(--color-figma-bg)] px-1 text-[10px] leading-[14px] text-[var(--color-figma-text)] shadow-sm ring-1 ring-[var(--color-figma-border)]"
    : "rounded bg-[var(--color-figma-bg)]/85 px-1 text-[10px] leading-[14px] text-[var(--color-figma-text-tertiary)] ring-1 ring-[var(--color-figma-border)]/50";
  const overflowChip = active
    ? "rounded bg-[var(--color-figma-bg)] px-1 text-[10px] leading-[14px] text-[var(--color-figma-text-tertiary)] shadow-sm ring-1 ring-[var(--color-figma-border)]"
    : "rounded bg-[var(--color-figma-bg)]/85 px-1 text-[10px] leading-[14px] text-[var(--color-figma-text-tertiary)] ring-1 ring-[var(--color-figma-border)]/50";
  return (
    <>
      {visible.map((name) => (
        <span key={name} className={baseChip}>
          {name}
        </span>
      ))}
      {overflow > 0 ? (
        <span className={overflowChip}>+{overflow}</span>
      ) : null}
    </>
  );
}
