import { memo } from "react";
import { Handle, Position, useStore, type NodeProps } from "@xyflow/react";
import type { TokenGraphNode } from "@tokenmanager/core";

export interface TokenNodeData extends Record<string, unknown> {
  token: TokenGraphNode;
  isFocused?: boolean;
  isDimmed?: boolean;
}

const ZOOM_THRESHOLD = 0.7;

function isTokenNodeData(data: unknown): data is TokenNodeData {
  return (
    typeof data === "object" &&
    data !== null &&
    "token" in data &&
    typeof (data as { token?: unknown }).token === "object"
  );
}

function TokenNodeImpl({ data, selected }: NodeProps) {
  const zoom = useStore((s) => s.transform[2]);
  if (!isTokenNodeData(data)) {
    return null;
  }
  const { token, isFocused, isDimmed } = data;
  const isCompact = zoom < ZOOM_THRESHOLD;
  const borderClass =
    token.health === "cycle"
      ? "border-[var(--color-figma-warning)]"
      : token.health === "broken"
        ? "border-[var(--color-figma-error)]"
        : selected || isFocused
          ? "border-[var(--color-figma-accent)]"
          : "border-[var(--color-figma-border)]";

  return (
    <div
      className={`tm-graph-node group flex h-11 items-center gap-2 rounded-md border bg-[var(--color-figma-bg-secondary)] px-2 text-secondary text-[var(--color-figma-text)] shadow-[0_1px_0_rgba(0,0,0,0.15)] transition-opacity ${borderClass}`}
      style={{ width: 200, opacity: isDimmed ? 0.25 : 1 }}
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
        <span className="truncate font-medium">{token.displayName}</span>
        {!isCompact ? (
          <span className="truncate text-[10px] text-[var(--color-figma-text-tertiary)]">
            {token.path}
          </span>
        ) : null}
      </span>
      {!isCompact && token.valuePreview ? (
        <span className="ml-1 max-w-[68px] shrink-0 truncate text-right font-mono text-[10px] text-[var(--color-figma-text-tertiary)]">
          {token.valuePreview}
        </span>
      ) : null}
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-[var(--color-figma-text-tertiary)]" />
    </div>
  );
}

export const TokenNode = memo(TokenNodeImpl);

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
