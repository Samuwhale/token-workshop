import { useEffect } from "react";
import { useReactFlow } from "@xyflow/react";
import type { GraphNodeId } from "@tokenmanager/core";
import type { GraphRenderModel } from "../components/graph/graphClusters";
import type { LayoutResult } from "../components/graph/graphLayout";

interface UseGraphKeyboardNavParams {
  enabled: boolean;
  layout: LayoutResult;
  graph: GraphRenderModel;
  onActivate: (nodeId: GraphNodeId) => void;
  onFocusSearch?: () => void;
}

type Axis = "horizontal" | "vertical";
type Direction = -1 | 1;

/**
 * Arrow keys move keyboard focus to the nearest neighbor along that axis in
 * laid-out coordinates; Enter/Space activates the focused node; `/` and Cmd+K
 * focus the search field. Skipped when typing in inputs or when no graph node
 * is currently focused.
 */
export function useGraphKeyboardNav({
  enabled,
  layout,
  graph,
  onActivate,
  onFocusSearch,
}: UseGraphKeyboardNavParams): void {
  const reactFlow = useReactFlow();

  useEffect(() => {
    if (!enabled) return;

    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const inEditableField =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      // Cmd+K / Ctrl+K → focus search (works even when typing).
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        if (onFocusSearch) {
          event.preventDefault();
          onFocusSearch();
        }
        return;
      }

      if (inEditableField) return;

      // `/` → focus search.
      if (event.key === "/" && !event.metaKey && !event.ctrlKey) {
        if (onFocusSearch) {
          event.preventDefault();
          onFocusSearch();
        }
        return;
      }

      // Find the currently focused graph node (xyflow gives the wrapper a
      // `react-flow__node` class with data-id when focused).
      const focusedEl = (target?.closest?.(".react-flow__node") ??
        document.activeElement?.closest?.(".react-flow__node")) as
        | HTMLElement
        | null;
      if (!focusedEl) return;
      const focusedId = focusedEl.getAttribute("data-id");
      if (!focusedId || !graph.nodes.has(focusedId)) return;

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onActivate(focusedId);
        return;
      }

      const direction = arrowKeyDirection(event.key);
      if (!direction) return;
      event.preventDefault();
      const next = findNearestNeighbor(focusedId, direction, graph, layout);
      if (!next) return;
      // xyflow renders `react-flow__node[data-id="..."]`; focusing the wrapper
      // mirrors what tab navigation does and re-runs our :focus-visible style.
      const nextEl = document.querySelector<HTMLElement>(
        `.react-flow__node[data-id="${cssEscape(next)}"]`,
      );
      nextEl?.focus({ preventScroll: false });
      // Keep selection in sync so the side panel reflects the focused node.
      reactFlow.setNodes((current) =>
        current.map((n) => ({ ...n, selected: n.id === next })),
      );
    };

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [enabled, graph, layout, onActivate, onFocusSearch, reactFlow]);
}

function arrowKeyDirection(
  key: string,
): { axis: Axis; direction: Direction } | null {
  if (key === "ArrowLeft") return { axis: "horizontal", direction: -1 };
  if (key === "ArrowRight") return { axis: "horizontal", direction: 1 };
  if (key === "ArrowUp") return { axis: "vertical", direction: -1 };
  if (key === "ArrowDown") return { axis: "vertical", direction: 1 };
  return null;
}

function findNearestNeighbor(
  fromId: GraphNodeId,
  { axis, direction }: { axis: Axis; direction: Direction },
  graph: GraphRenderModel,
  layout: LayoutResult,
): GraphNodeId | null {
  const fromPos = layout.positions.get(fromId);
  if (!fromPos) return null;
  const fromCenter = {
    x: fromPos.x + fromPos.width / 2,
    y: fromPos.y + fromPos.height / 2,
  };

  let best: { id: GraphNodeId; primary: number; secondary: number } | null = null;
  for (const [otherId, pos] of layout.positions) {
    if (otherId === fromId) continue;
    if (!graph.nodes.has(otherId)) continue;
    const otherCenter = {
      x: pos.x + pos.width / 2,
      y: pos.y + pos.height / 2,
    };
    const dx = otherCenter.x - fromCenter.x;
    const dy = otherCenter.y - fromCenter.y;
    const along = axis === "horizontal" ? dx : dy;
    const across = axis === "horizontal" ? dy : dx;
    if (Math.sign(along) !== direction) continue;
    const primary = Math.abs(along);
    const secondary = Math.abs(across);
    // Prefer the node closest along the axis; break ties by the smaller
    // perpendicular offset so we don't jump rows unnecessarily.
    if (
      !best ||
      primary < best.primary ||
      (primary === best.primary && secondary < best.secondary)
    ) {
      best = { id: otherId, primary, secondary };
    }
  }

  return best?.id ?? null;
}

function cssEscape(value: string): string {
  // Path segments contain dots / colons. CSS.escape is not available in older
  // jsdom; fall back to a manual minimal escape.
  if (typeof window !== "undefined" && typeof window.CSS?.escape === "function") {
    return window.CSS.escape(value);
  }
  return value.replace(/(["\\])/g, "\\$1");
}
