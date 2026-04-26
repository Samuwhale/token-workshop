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
        background: `${data.accentColor}0D`,
      }}
      className="pointer-events-none flex flex-col rounded-md"
    >
      <span
        style={{ color: data.accentColor, maxWidth: data.width - 16 }}
        className="ml-2 mt-1.5 block self-start truncate text-[10px] font-medium leading-none"
        title={data.label}
      >
        {data.label}
      </span>
    </div>
  );
}

export const LaneLabelNode = memo(LaneLabelNodeImpl);
