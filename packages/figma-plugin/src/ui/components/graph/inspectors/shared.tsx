import type { ReactNode } from "react";
import type { GraphModel, GraphNode, GraphNodeId } from "@tokenmanager/core";
import { ListItem } from "../../../primitives";
import { isAlias } from "../../../../shared/resolveAlias";
import { formatTokenValueForDisplay } from "../../../shared/tokenFormatting";

export interface RelatedItem {
  id: GraphNodeId;
  path: string;
  collectionId: string;
  displayName: string;
  swatchColor?: string;
  $type?: string;
  isGhost?: boolean;
  isGenerator?: boolean;
}

export function NodeLabel({ node }: { node: GraphNode }) {
  if (node.kind === "token") {
    return (
      <span className="truncate text-[var(--color-figma-text)]">
        {node.path}
      </span>
    );
  }
  if (node.kind === "ghost") {
    return (
      <span className="truncate italic text-[var(--color-figma-error)]">
        {node.path}
      </span>
    );
  }
  return (
    <span className="truncate text-[var(--color-figma-text)]">{node.name}</span>
  );
}

export function MetaRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: ReactNode;
  tone?: "ok" | "warning" | "error";
}) {
  const valueClass =
    tone === "warning"
      ? "text-[var(--color-figma-warning)]"
      : tone === "error"
        ? "text-[var(--color-figma-error)]"
        : "text-[var(--color-figma-text)]";
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-16 shrink-0 text-secondary text-[var(--color-figma-text-tertiary)]">
        {label}
      </span>
      <span className={`min-w-0 flex-1 truncate text-secondary ${valueClass}`}>
        {value}
      </span>
    </div>
  );
}

export function ModeValueMatrix({
  modes,
  tokenType,
  modeValues,
}: {
  modes: string[];
  tokenType: string | undefined;
  modeValues: Record<string, unknown>;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {modes.map((mode) => {
        const value = modeValues[mode];
        const aliasRef = isAlias(value as never) ? String(value) : null;
        return (
          <div key={mode} className="flex items-baseline gap-2">
            <span className="w-14 shrink-0 truncate text-secondary text-[var(--color-figma-text-tertiary)]">
              {mode}
            </span>
            {aliasRef ? (
              <span
                className="min-w-0 flex-1 truncate font-mono text-secondary text-[var(--color-figma-accent)]"
                title={aliasRef}
              >
                {aliasRef}
              </span>
            ) : (
              <span
                className="min-w-0 flex-1 truncate font-mono text-secondary text-[var(--color-figma-text)]"
                title={String(value ?? "")}
              >
                {formatTokenValueForDisplay(tokenType, value, {
                  emptyPlaceholder: "—",
                })}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function RelatedList({
  items,
  onClick,
  onDoubleClick,
}: {
  items: RelatedItem[];
  onClick: (item: RelatedItem) => void;
  onDoubleClick?: (item: RelatedItem) => void;
}) {
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((item) => (
        <li key={item.id}>
          <ListItem
            onClick={() => onClick(item)}
            onDoubleClick={
              onDoubleClick ? () => onDoubleClick(item) : undefined
            }
            leading={
              item.swatchColor ? (
                <span
                  className="h-3 w-3 rounded border border-[var(--color-figma-border)]"
                  style={{ background: item.swatchColor }}
                  aria-hidden
                />
              ) : (
                <span
                  className="font-mono text-secondary text-[var(--color-figma-text-tertiary)]"
                  aria-hidden
                >
                  {item.isGenerator
                    ? "✦"
                    : item.isGhost
                      ? "?"
                      : tokenTypeGlyph(item.$type)}
                </span>
              )
            }
            trailing={
              <span className="max-w-[140px] truncate font-mono text-secondary text-[var(--color-figma-text-tertiary)]">
                {item.path}
              </span>
            }
            className={
              item.isGhost ? "text-[var(--color-figma-error)]" : undefined
            }
          >
            {item.displayName}
          </ListItem>
        </li>
      ))}
    </ul>
  );
}

export function collectIncidentTokens(
  graph: GraphModel,
  nodeId: GraphNodeId,
  direction: "incoming" | "outgoing",
): RelatedItem[] {
  const edgeIds =
    direction === "incoming"
      ? graph.incoming.get(nodeId) ?? []
      : graph.outgoing.get(nodeId) ?? [];
  const seen = new Set<GraphNodeId>();
  const out: RelatedItem[] = [];
  for (const edgeId of edgeIds) {
    const edge = graph.edges.get(edgeId);
    if (!edge) continue;
    const otherId = direction === "incoming" ? edge.from : edge.to;
    if (seen.has(otherId)) continue;
    seen.add(otherId);
    const other = graph.nodes.get(otherId);
    if (!other) continue;
    if (other.kind === "token") {
      out.push({
        id: other.id,
        path: other.path,
        collectionId: other.collectionId,
        displayName: other.displayName,
        swatchColor: other.swatchColor,
        $type: other.$type,
      });
    } else if (other.kind === "ghost") {
      out.push({
        id: other.id,
        path: other.path,
        collectionId: other.collectionId ?? "?",
        displayName: other.path.split(".").pop() ?? other.path,
        isGhost: true,
      });
    } else {
      out.push({
        id: other.id,
        path: other.targetGroup,
        collectionId: other.targetCollection,
        displayName: other.name,
        isGenerator: true,
      });
    }
  }
  return out;
}

export function healthLabel(health: string): string | null {
  if (health === "ok") return null;
  if (health === "broken") return "Broken alias";
  if (health === "cycle") return "In a circular reference";
  if (health === "generator-error") return "Generator error";
  return health;
}

export function healthTone(
  health: string,
): "ok" | "warning" | "error" | undefined {
  if (health === "broken" || health === "generator-error") return "error";
  if (health === "cycle") return "warning";
  return undefined;
}

export function tokenTypeGlyph(type: string | undefined): string {
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
