import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { SlidersHorizontal } from "lucide-react";
import type { DerivationGraphNode } from "@tokenmanager/core";
import { summarizeVisibleDerivationOps } from "../derivationSummary";

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

  const derivedLabel = pathTail(derivation.derivedPath);

  return (
    <div
      className={`tm-graph-node flex h-[68px] items-center gap-2 rounded-md border bg-[var(--color-figma-accent)]/8 px-2 text-secondary text-[var(--color-figma-text)] shadow-[0_1px_0_rgba(0,0,0,0.12)] ${borderClass} ${ringClass}`}
      style={{
        width: 200,
        opacity: dimmed && !selected ? 0.25 : 1,
        transition: "opacity 120ms",
      }}
      title={`${derivation.derivedPath} is a modified token`}
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
          <span className="truncate font-medium">Modified value</span>
          {derivation.swatchColor ? (
            <span
              className="h-3 w-3 shrink-0 rounded-sm ring-1 ring-[var(--color-figma-border)]"
              style={{ backgroundColor: derivation.swatchColor }}
              aria-hidden
            />
          ) : null}
        </div>
        <div
          className="truncate font-mono text-[10px] text-[var(--color-figma-text-secondary)]"
          title={derivation.derivedPath}
        >
          {derivedLabel}
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          {summarizeVisibleDerivationOps(derivation.ops).map((summary, index) => (
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

function pathTail(path: string): string {
  const parts = path.split(".").filter(Boolean);
  if (parts.length <= 2) return path;
  return parts.slice(-2).join(".");
}
