import { useMemo } from "react";
import {
  runDagreLayout,
  type LayoutResult,
} from "../components/graph/graphLayout";
import type { GraphRenderModel } from "../components/graph/graphClusters";

interface UseGraphLayoutParams {
  graph: GraphRenderModel;
  selectedCollectionIds: string[];
  rankdir?: "LR" | "TB";
}

/**
 * Memoized dagre layout, keyed on graph fingerprint + scope. The fingerprint
 * already accounts for node + edge identity, so unrelated UI churn (hover,
 * selection) doesn't trigger relayout.
 */
export function useGraphLayout({
  graph,
  selectedCollectionIds,
  rankdir = "LR",
}: UseGraphLayoutParams): LayoutResult {
  return useMemo(
    () => runDagreLayout(graph, { rankdir, selectedCollectionIds }),
    [graph, rankdir, selectedCollectionIds],
  );
}
