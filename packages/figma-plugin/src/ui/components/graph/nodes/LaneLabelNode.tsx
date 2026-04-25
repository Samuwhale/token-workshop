import { memo } from "react";
import type { NodeProps } from "@xyflow/react";

export interface LaneLabelNodeData extends Record<string, unknown> {
  label: string;
  accentColor: string;
  width: number;
  height: number;
}

function isLaneLabelData(data: unknown): data is LaneLabelNodeData {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.label === "string" &&
    typeof d.accentColor === "string" &&
    typeof d.width === "number" &&
    typeof d.height === "number"
  );
}

function LaneLabelNodeImpl({ data }: NodeProps) {
  if (!isLaneLabelData(data)) return null;
  return (
    <div
      style={{
        width: data.width,
        height: data.height,
        background: `${data.accentColor}14`,
      }}
      className="pointer-events-none rounded-md"
    >
      <span
        style={{ color: data.accentColor }}
        className="ml-1.5 inline-block translate-y-[-50%] rounded bg-[var(--color-figma-bg)] px-1 text-[10px] leading-[14px]"
      >
        {data.label}
      </span>
    </div>
  );
}

export const LaneLabelNode = memo(LaneLabelNodeImpl);
