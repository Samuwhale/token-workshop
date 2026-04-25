import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { TokenGraphNode } from "@tokenmanager/core";

export interface TokenNodeData extends Record<string, unknown> {
  token: TokenGraphNode;
  isFocused?: boolean;
}

function isTokenNodeData(data: unknown): data is TokenNodeData {
  return (
    typeof data === "object" &&
    data !== null &&
    "token" in data &&
    typeof (data as { token?: unknown }).token === "object"
  );
}

function TokenNodeImpl({ data, selected }: NodeProps) {
  if (!isTokenNodeData(data)) {
    return null;
  }
  const { token, isFocused } = data;
  const primaryLabel = isFocused ? token.path : pathTail(token.path);
  const showFullPath = Boolean(isFocused);
  const showValuePreview = Boolean(isFocused) && Boolean(token.valuePreview);
  const isAccented = selected || isFocused;
  const borderClass =
    token.health === "cycle"
      ? "border-[var(--color-figma-warning)]"
      : token.health === "broken"
        ? "border-[var(--color-figma-error)]"
        : isAccented
          ? "border-[var(--color-figma-accent)]"
          : "border-[var(--color-figma-border)]";
  const ringClass = isAccented
    ? "ring-2 ring-[var(--color-figma-accent)]/40 ring-offset-0"
    : "";

  return (
    <div
      className={`tm-graph-node group flex h-11 items-center gap-2 rounded-md border bg-[var(--color-figma-bg-secondary)] px-1.5 text-secondary text-[var(--color-figma-text)] shadow-[0_1px_0_rgba(0,0,0,0.15)] ${borderClass} ${ringClass}`}
      style={{ width: 200 }}
      title={token.path}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-[var(--color-figma-text-tertiary)]" />
      {token.swatchColor ? (
        <span
          className="h-4 w-4 shrink-0 rounded border border-[var(--color-figma-border)]"
          style={{ background: token.swatchColor }}
          aria-hidden
        />
      ) : token.$type ? (
        <span className="font-mono text-[10px] leading-none text-[var(--color-figma-text-tertiary)]">
          {tokenTypeGlyph(token.$type)}
        </span>
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate font-medium">{primaryLabel}</span>
        {showFullPath && primaryLabel !== token.path ? (
          <span className="truncate text-[10px] text-[var(--color-figma-text-tertiary)]">
            {token.path}
          </span>
        ) : null}
      </span>
      {showValuePreview ? (
        <span className="ml-1 max-w-[68px] shrink-0 truncate text-right font-mono text-[10px] text-[var(--color-figma-text-tertiary)]">
          {token.valuePreview}
        </span>
      ) : null}
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-[var(--color-figma-text-tertiary)]" />
    </div>
  );
}

export const TokenNode = memo(TokenNodeImpl);

function pathTail(path: string): string {
  const parts = path.split(".").filter(Boolean);
  if (parts.length <= 2) return path;
  return parts.slice(-2).join(".");
}

function tokenTypeGlyph(type: string): string {
  switch (type) {
    case "color":
      return "◐";
    case "dimension":
      return "⟷";
    case "number":
      return "#";
    case "fontFamily":
    case "fontWeight":
    case "typography":
      return "T";
    case "duration":
      return "⧖";
    case "shadow":
      return "◑";
    case "cubicBezier":
      return "~";
    default:
      return "•";
  }
}
