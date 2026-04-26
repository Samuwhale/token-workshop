import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { HelpCircle } from "lucide-react";
import type { GhostGraphNode } from "@tokenmanager/core";

export interface GhostNodeData extends Record<string, unknown> {
  ghost: GhostGraphNode;
  dimmed?: boolean;
}

function isGhostNodeData(data: unknown): data is GhostNodeData {
  return (
    typeof data === "object" &&
    data !== null &&
    "ghost" in data &&
    typeof (data as { ghost?: unknown }).ghost === "object"
  );
}

function GhostNodeImpl({ data, selected }: NodeProps) {
  if (!isGhostNodeData(data)) {
    return null;
  }
  const { ghost, dimmed } = data;
  const reasonLabel =
    ghost.reason === "ambiguous" ? "Multiple matches" : "Missing token";

  return (
    <div
      className="tm-graph-node flex h-10 items-center gap-2 rounded-md border border-dashed border-[var(--color-figma-error)]/60 bg-transparent px-2 text-secondary text-[var(--color-figma-text-secondary)]"
      style={{
        width: 180,
        opacity: dimmed && !selected ? 0.25 : 1,
        transition: "opacity 120ms",
      }}
      title={`${ghost.path} — ${reasonLabel}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !border-0 !bg-[var(--color-figma-error)]/60"
      />
      <HelpCircle
        size={11}
        strokeWidth={2}
        aria-label={reasonLabel}
        className="shrink-0 text-[var(--color-figma-error)]"
      />
      <span className="min-w-0 flex-1 truncate italic leading-tight">
        {ghost.path}
      </span>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-0 !bg-[var(--color-figma-error)]/60"
      />
    </div>
  );
}

export const GhostNode = memo(GhostNodeImpl);
