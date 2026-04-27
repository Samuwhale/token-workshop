import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { AlertTriangle, RotateCw } from "lucide-react";
import type { TokenGraphNode } from "@tokenmanager/core";

export interface TokenNodeData extends Record<string, unknown> {
  token: TokenGraphNode;
  isFocused?: boolean;
  dimmed?: boolean;
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
  const { token, isFocused, dimmed } = data;
  const label = isFocused ? token.path : pathTail(token.path);
  const isAccented = selected || isFocused;
  const isBroken = token.health === "broken";
  const isCycle = token.health === "cycle";
  const showValuePreview = Boolean(isFocused) && Boolean(token.valuePreview);
  const collectionLabel = isFocused ? token.collectionId : collectionTail(token.collectionId);

  const borderClass = isBroken
    ? "border-[var(--color-figma-error)]"
    : isCycle
      ? "border-[var(--color-figma-warning)]"
      : isAccented
        ? "border-[var(--color-figma-accent)]"
        : "border-[var(--color-figma-border)]/50 group-hover:border-[var(--color-figma-border)]";
  const labelToneClass = isAccented
    ? "font-medium text-[var(--color-figma-text)]"
    : "text-[var(--color-figma-text-secondary)] group-hover:text-[var(--color-figma-text)]";

  return (
    <div
      className={`tm-graph-node group flex h-11 items-center gap-2 rounded-md border bg-[var(--color-figma-bg-secondary)] px-2 text-secondary shadow-[0_1px_0_rgba(0,0,0,0.12)] ${borderClass}`}
      style={{
        width: 200,
        opacity: dimmed && !selected ? 0.25 : 1,
        transition: "opacity 120ms",
      }}
      title={token.path}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !border-0 !bg-[var(--color-figma-text-tertiary)]"
      />
      <Leading token={token} isFocused={Boolean(isFocused)} />
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className={`truncate ${labelToneClass}`}>{label}</span>
        <span
          className="truncate font-mono text-[10px] leading-tight text-[var(--color-figma-text-tertiary)]"
          title={token.collectionId}
        >
          {collectionLabel}
        </span>
      </span>
      {isBroken ? (
        <AlertTriangle
          size={11}
          strokeWidth={2}
          aria-label="Broken alias"
          className="shrink-0 text-[var(--color-figma-error)]"
        />
      ) : isCycle ? (
        <RotateCw
          size={11}
          strokeWidth={2}
          aria-label="In a circular reference"
          className="shrink-0 text-[var(--color-figma-warning)]"
        />
      ) : showValuePreview ? (
        <span
          className="ml-1 max-w-[68px] shrink-0 truncate text-right font-mono text-[10px] text-[var(--color-figma-text-tertiary)]"
          title={token.valuePreview}
        >
          {token.valuePreview}
        </span>
      ) : null}
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-0 !bg-[var(--color-figma-text-tertiary)]"
      />
    </div>
  );
}

function Leading({
  token,
  isFocused,
}: {
  token: TokenGraphNode;
  isFocused: boolean;
}) {
  if (token.swatchColor) {
    return (
      <span
        className="h-4 w-4 shrink-0 rounded border border-[var(--color-figma-border)]"
        style={{ background: token.swatchColor }}
        aria-hidden
      />
    );
  }
  if (isFocused && token.$type) {
    return (
      <span
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-[var(--color-figma-bg)] font-mono text-[10px] leading-none text-[var(--color-figma-text-tertiary)]"
        aria-hidden
      >
        {tokenTypeGlyph(token.$type)}
      </span>
    );
  }
  return null;
}

export const TokenNode = memo(TokenNodeImpl);

function pathTail(path: string): string {
  const parts = path.split(".").filter(Boolean);
  if (parts.length <= 2) return path;
  return parts.slice(-2).join(".");
}

function collectionTail(collectionId: string): string {
  const normalized = collectionId.replace(/^-?\d+-+/u, "");
  return normalized.length > 22 ? `${normalized.slice(0, 19)}...` : normalized;
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
