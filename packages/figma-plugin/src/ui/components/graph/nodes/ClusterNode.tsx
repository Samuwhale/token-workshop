import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Plus } from "lucide-react";
import type { GraphClusterNode } from "../graphClusters";

export interface ClusterNodeData extends Record<string, unknown> {
  cluster: GraphClusterNode;
  onExpand?: () => void;
  dimmed?: boolean;
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
  const { cluster, onExpand, dimmed } = data;

  return (
    <button
      type="button"
      onClick={(event) => {
        if (!onExpand) return;
        event.stopPropagation();
        onExpand();
      }}
      disabled={!onExpand}
      className={`tm-graph-node flex h-10 items-center justify-center gap-1.5 rounded-full border border-dashed border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 text-secondary text-[var(--color-figma-text-secondary)] ${
        onExpand
          ? "cursor-pointer hover:border-[var(--color-figma-text-tertiary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
          : "cursor-default"
      }`}
      style={{
        width: 180,
        opacity: dimmed ? 0.25 : 1,
        transition: "opacity 120ms",
      }}
      title={onExpand ? `${cluster.label} — click to expand` : cluster.label}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !border-0 !bg-[var(--color-figma-text-tertiary)]"
      />
      <Plus size={11} strokeWidth={2} aria-hidden className="shrink-0" />
      <span className="min-w-0 truncate">{cluster.label}</span>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-0 !bg-[var(--color-figma-text-tertiary)]"
      />
    </button>
  );
}

export const ClusterNode = memo(ClusterNodeImpl);
