import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import type { GraphClusterNode } from "../graphClusters";

export interface ClusterNodeData extends Record<string, unknown> {
  cluster: GraphClusterNode;
  variant?: "pill" | "region";
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
  const { cluster, variant = "pill" } = data;

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
    <div
      className="flex h-10 items-center justify-between gap-2 rounded-full border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 text-secondary text-[var(--color-figma-text)]"
      style={{ width: 180 }}
      title={cluster.label}
    >
      <span className="min-w-0 truncate">{cluster.label}</span>
      <span className="shrink-0 text-[10px] text-[var(--color-figma-text-tertiary)]">
        {cluster.count}
      </span>
    </div>
  );
}

export const ClusterNode = memo(ClusterNodeImpl);
