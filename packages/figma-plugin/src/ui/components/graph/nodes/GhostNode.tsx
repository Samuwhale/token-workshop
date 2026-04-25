import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { GhostGraphNode } from "@tokenmanager/core";

export interface GhostNodeData extends Record<string, unknown> {
  ghost: GhostGraphNode;
}

function isGhostNodeData(data: unknown): data is GhostNodeData {
  return (
    typeof data === "object" &&
    data !== null &&
    "ghost" in data &&
    typeof (data as { ghost?: unknown }).ghost === "object"
  );
}

function GhostNodeImpl({ data }: NodeProps) {
  if (!isGhostNodeData(data)) {
    return null;
  }
  const { ghost } = data;
  const reasonLabel = ghost.reason === "ambiguous" ? "ambiguous" : "missing";

  return (
    <div
      className="flex h-10 items-center gap-2 rounded-md border border-dashed border-[var(--color-figma-error)]/60 bg-transparent px-2 text-secondary text-[var(--color-figma-text-secondary)]"
      style={{ width: 180 }}
      title={`${ghost.path} (${reasonLabel})`}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-[var(--color-figma-error)]/60" />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate italic">{ghost.path}</span>
        <span className="truncate text-[10px] text-[var(--color-figma-error)]">
          {reasonLabel}
        </span>
      </span>
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-[var(--color-figma-error)]/60" />
    </div>
  );
}

export const GhostNode = memo(GhostNodeImpl);
