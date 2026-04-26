import { useMemo } from "react";
import type { GraphModel, GraphNodeId } from "@tokenmanager/core";
import {
  filterByCollections,
  selectSubgraph,
} from "../components/graph/graphScope";
import {
  aggregateNeighbours,
  graphToRenderModel,
  type GraphRenderModel,
} from "../components/graph/graphClusters";

export type GraphHopDepth = 1 | 2;
/**
 * "auto" defers depth selection to {@link useFocusedSubgraph}: render at
 * depth 1, but expand to depth 2 when the 1-hop slice is small enough that
 * 2 hops still fits a calm canvas. Once the user clicks a specific depth
 * in the toolbar, that value pins until they change it.
 */
export type GraphHopDepthSetting = GraphHopDepth | "auto";

interface UseFocusedSubgraphResult {
  subgraph: GraphRenderModel;
  /** The depth the subgraph was actually rendered at — relevant when "auto" resolved upward. */
  resolvedDepth: GraphHopDepth;
  /** True when expanding by one more hop would add nodes — drives the "expand" affordance. */
  hasMoreHops: boolean;
  isEmpty: boolean;
}

// Per spec: collapse same-kind sibling neighbours of the focus into one pill
// once a (side, hop, kind) bucket exceeds this count.
const FOCUS_AGGREGATE_MAX = 8;
// "auto" expands from 1 → 2 hops only when both slices stay below this node
// count. Above the threshold, the user can still pin depth=2 manually.
const AUTO_EXPAND_THRESHOLD = 8;
// Hard ceiling on hop depth — keeps "auto" from runaway-expanding on narrow
// graphs and matches the toolbar's max-pinnable value.
const MAX_DEPTH: GraphHopDepth = 2;

export function useFocusedSubgraph(
  fullGraph: GraphModel,
  focusId: GraphNodeId | null,
  hopDepth: GraphHopDepthSetting,
  scopeCollectionIds: string[],
  expandedBucketKeys?: ReadonlySet<string>,
): UseFocusedSubgraphResult {
  const scoped = useMemo(
    () => filterByCollections(fullGraph, scopeCollectionIds),
    [fullGraph, scopeCollectionIds],
  );

  return useMemo(() => {
    if (!focusId || !scoped.nodes.has(focusId)) {
      return {
        subgraph: graphToRenderModel(emptyModel(scoped.fingerprint)),
        resolvedDepth: 1,
        hasMoreHops: false,
        isEmpty: true,
      };
    }

    const slice = (depth: number) =>
      selectSubgraph(scoped, {
        focusNodeId: focusId,
        depth,
        autoExpandThreshold: 0,
        autoExpandDepth: depth,
      });

    let resolvedDepth: GraphHopDepth;
    let sliced;
    if (hopDepth === "auto") {
      const oneHop = slice(1);
      const twoHop =
        oneHop.nodes.size <= AUTO_EXPAND_THRESHOLD ? slice(2) : null;
      if (twoHop && twoHop.nodes.size <= AUTO_EXPAND_THRESHOLD) {
        sliced = twoHop;
        resolvedDepth = 2;
      } else {
        sliced = oneHop;
        resolvedDepth = 1;
      }
    } else {
      sliced = slice(hopDepth);
      resolvedDepth = hopDepth;
    }

    let hasMoreHops = false;
    if (resolvedDepth < MAX_DEPTH) {
      const expanded = slice(resolvedDepth + 1);
      hasMoreHops = expanded.nodes.size > sliced.nodes.size;
    }

    const aggregated = aggregateNeighbours(
      sliced,
      focusId,
      FOCUS_AGGREGATE_MAX,
      expandedBucketKeys,
    );
    return { subgraph: aggregated, resolvedDepth, hasMoreHops, isEmpty: false };
  }, [scoped, focusId, hopDepth, expandedBucketKeys]);
}

function emptyModel(parentFingerprint: string): GraphModel {
  return {
    nodes: new Map(),
    edges: new Map(),
    outgoing: new Map(),
    incoming: new Map(),
    fingerprint: `${parentFingerprint}:focus:none`,
  };
}
