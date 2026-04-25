import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { GraphClusterNode } from "../graphClusters";

export interface ClusterNodeData extends Record<string, unknown> {
  cluster: GraphClusterNode;
  variant?: "pill" | "region";
  onExpand?: () => void;
}

function isClusterNodeData(data: unknown): data is ClusterNodeData {
  return (
    typeof data === "object" &&
    data !== null &&
    "cluster" in data &&
    typeof (data as { cluster?: unknown }).cluster === "object"
  );
}

function ClusterNodeImpl({ data }: NodeProps) {
  if (!isClusterNodeData(data)) return null;
  const { cluster, variant = "pill", onExpand } = data;

  if (variant === "region") {
    return (
      <div
        className="h-full w-full rounded-lg bg-[var(--color-figma-bg-secondary)]/45"
        style={{ pointerEvents: "none" }}
      >
        <div className="px-2 py-1 text-[10px] text-[var(--color-figma-text-tertiary)]">
          {cluster.label}
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={(event) => {
        if (!onExpand) return;
        event.stopPropagation();
        onExpand();
      }}
      disabled={!onExpand}
      className={`tm-graph-node flex h-10 w-full items-center justify-between gap-2 rounded-full border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 text-left text-secondary text-[var(--color-figma-text)] ${
        onExpand ? "cursor-pointer hover:bg-[var(--color-figma-bg-hover)]" : "cursor-default"
      }`}
      style={{ width: 180 }}
      title={onExpand ? `${cluster.label} (click to expand)` : cluster.label}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !border-0 !bg-[var(--color-figma-text-tertiary)]"
      />
      <span className="min-w-0 truncate">{cluster.label}</span>
      <span aria-hidden className="shrink-0 text-[10px] text-[var(--color-figma-text-tertiary)]">
        {onExpand ? "+" : cluster.count}
      </span>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-0 !bg-[var(--color-figma-text-tertiary)]"
      />
    </button>
  );
}

export const ClusterNode = memo(ClusterNodeImpl);
