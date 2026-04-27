import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { GeneratorGraphNode } from "@tokenmanager/core";

export interface GeneratorNodeData extends Record<string, unknown> {
  generator: GeneratorGraphNode;
  isFocused?: boolean;
  dimmed?: boolean;
}

function isGeneratorNodeData(data: unknown): data is GeneratorNodeData {
  return (
    typeof data === "object" &&
    data !== null &&
    "generator" in data &&
    typeof (data as { generator?: unknown }).generator === "object"
  );
}

function GeneratorNodeImpl({ data, selected }: NodeProps) {
  if (!isGeneratorNodeData(data)) {
    return null;
  }
  const { generator, isFocused, dimmed } = data;
  const errored = generator.health === "generator-error";
  const missingSource = generator.health === "broken";
  const isAccented = selected || isFocused;
  const borderClass = errored
    ? "border-[var(--color-figma-error)]"
    : missingSource
      ? "border-[var(--color-figma-warning)]"
      : isAccented
        ? "border-[var(--color-figma-accent)]"
        : "border-[var(--color-figma-generator)]/60";
  const ringClass = isAccented
    ? "ring-2 ring-[var(--color-figma-accent)]/40 ring-offset-0"
    : "";
  const statusLabel = errored
    ? "failed"
    : generator.sourceIssue === "ambiguous"
      ? "multiple matches"
      : missingSource
        ? "missing source"
        : null;

  return (
    <div
      className={`tm-graph-node flex h-14 items-center gap-2 rounded-full border bg-[var(--color-figma-generator)]/10 px-3 text-secondary text-[var(--color-figma-text)] ${borderClass} ${ringClass}`}
      style={{
        width: 200,
        opacity: dimmed && !selected ? 0.25 : 1,
        transition: "opacity 120ms",
      }}
      title={generator.errorMessage ?? generator.name}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-[var(--color-figma-generator)]" />
      <span
        className="font-mono text-[10px] leading-none text-[var(--color-figma-generator)]"
        aria-hidden
      >
        {generatorTypeGlyph(generator.generatorType)}
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate font-medium">{generator.name}</span>
        <span className="truncate text-[10px] text-[var(--color-figma-text-tertiary)]">
          {generator.outputCount} outputs
          {!generator.enabled ? " · disabled" : ""}
          {statusLabel ? ` · ${statusLabel}` : ""}
        </span>
      </span>
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-[var(--color-figma-generator)]" />
    </div>
  );
}

export const GeneratorNode = memo(GeneratorNodeImpl);

function generatorTypeGlyph(type: string): string {
  switch (type) {
    case "colorRamp":
      return "▦";
    case "typeScale":
      return "Aa";
    case "spacingScale":
    case "borderRadiusScale":
    case "zIndexScale":
      return "⟷";
    case "opacityScale":
      return "◐";
    case "shadowScale":
      return "◑";
    case "customScale":
      return "∑";
    default:
      return "✦";
  }
}
