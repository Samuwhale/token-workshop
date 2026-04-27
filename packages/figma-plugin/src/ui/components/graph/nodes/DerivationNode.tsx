import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { SlidersHorizontal } from "lucide-react";
import type {
  DerivationGraphNode,
  DerivationOp,
  DimensionValue,
  DurationValue,
} from "@tokenmanager/core";

export interface DerivationNodeData extends Record<string, unknown> {
  derivation: DerivationGraphNode;
  isFocused?: boolean;
  dimmed?: boolean;
}

function isDerivationNodeData(data: unknown): data is DerivationNodeData {
  return (
    typeof data === "object" &&
    data !== null &&
    "derivation" in data &&
    typeof (data as { derivation?: unknown }).derivation === "object"
  );
}

function DerivationNodeImpl({ data, selected }: NodeProps) {
  if (!isDerivationNodeData(data)) {
    return null;
  }

  const { derivation, isFocused, dimmed } = data;
  const isAccented = selected || isFocused;
  const isBroken = derivation.health === "broken";
  const isCycle = derivation.health === "cycle";
  const borderClass = isBroken
    ? "border-[var(--color-figma-error)]"
    : isCycle
      ? "border-[var(--color-figma-warning)]"
      : isAccented
        ? "border-[var(--color-figma-accent)]"
        : "border-[var(--color-figma-accent)]/45";
  const ringClass = isAccented
    ? "ring-2 ring-[var(--color-figma-accent)]/35 ring-offset-0"
    : "";

  return (
    <div
      className={`tm-graph-node flex h-16 items-center gap-2 rounded-md border bg-[var(--color-figma-accent)]/8 px-2 text-secondary text-[var(--color-figma-text)] shadow-[0_1px_0_rgba(0,0,0,0.12)] ${borderClass} ${ringClass}`}
      style={{
        width: 200,
        opacity: dimmed && !selected ? 0.25 : 1,
        transition: "opacity 120ms",
      }}
      title={`Modifier for ${derivation.derivedPath}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !border-0 !bg-[var(--color-figma-accent)]"
      />
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[var(--color-figma-bg)] text-[var(--color-figma-accent)] ring-1 ring-[var(--color-figma-border)]">
        <SlidersHorizontal size={14} strokeWidth={2.25} aria-hidden />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 leading-tight">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-medium">Modifier</span>
          {derivation.swatchColor ? (
            <span
              className="h-3 w-3 shrink-0 rounded-sm ring-1 ring-[var(--color-figma-border)]"
              style={{ backgroundColor: derivation.swatchColor }}
              aria-hidden
            />
          ) : null}
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          {summarizeVisibleOps(derivation.ops).map((summary, index) => (
            <span
              key={`${summary}:${index}`}
              className="truncate font-mono text-[10px] text-[var(--color-figma-text-tertiary)]"
              title={summary}
            >
              {summary}
            </span>
          ))}
        </div>
        {derivation.valuePreview ? (
          <div className="truncate font-mono text-[10px] text-[var(--color-figma-text-secondary)]">
            {derivation.valuePreview}
          </div>
        ) : null}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-0 !bg-[var(--color-figma-accent)]"
      />
    </div>
  );
}

export const DerivationNode = memo(DerivationNodeImpl);

function summarizeVisibleOps(ops: readonly DerivationOp[]): string[] {
  if (ops.length === 0) return ["No ops"];
  const visible = ops.slice(0, 2).map(summarizeOp);
  const overflow = ops.length - visible.length;
  return overflow > 0 ? [...visible, `+${overflow} more`] : visible;
}

function summarizeOp(op: DerivationOp): string {
  switch (op.kind) {
    case "alpha":
      return `alpha ${Math.round(op.amount * 100)}%`;
    case "lighten":
      return `lighten ${formatNumber(op.amount)}`;
    case "darken":
      return `darken ${formatNumber(op.amount)}`;
    case "mix":
      return `mix ${formatRefOrValue(op.with)} ${Math.round(op.ratio * 100)}%`;
    case "invertLightness":
      return `invert L ${formatNumber(op.chromaBoost ?? 1)}x`;
    case "scaleBy":
      return `x${formatNumber(op.factor)}`;
    case "add":
      return `+${formatDelta(op.delta)}`;
  }
}

function formatDelta(delta: number | DimensionValue | DurationValue): string {
  if (typeof delta === "number") return formatNumber(delta);
  return `${formatNumber(delta.value)}${delta.unit}`;
}

function formatRefOrValue(value: string): string {
  return value.length > 18 ? `${value.slice(0, 15)}...` : value;
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
