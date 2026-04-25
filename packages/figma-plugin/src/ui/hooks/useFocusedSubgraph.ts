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

export type GraphHopDepth = 1 | 2 | "chain";

interface UseFocusedSubgraphResult {
  subgraph: GraphRenderModel;
  hasMoreHops: boolean;
  isEmpty: boolean;
}

const CHAIN_DEPTH = 64;
// Per spec: collapse same-kind sibling neighbours of the focus into one pill
// once a (side, hop, kind) bucket exceeds this count.
const FOCUS_AGGREGATE_MAX = 8;

export function useFocusedSubgraph(
  fullGraph: GraphModel,
  focusId: GraphNodeId | null,
  hopDepth: GraphHopDepth,
  scopeCollectionIds: string[],
): UseFocusedSubgraphResult {
  const scoped = useMemo(
    () => filterByCollections(fullGraph, scopeCollectionIds),
    [fullGraph, scopeCollectionIds],
  );

  return useMemo(() => {
    if (!focusId || !scoped.nodes.has(focusId)) {
      return {
        subgraph: graphToRenderModel(emptyModel(scoped.fingerprint)),
        hasMoreHops: false,
        isEmpty: true,
      };
    }

    const depth = depthFor(hopDepth);
    const sliced = selectSubgraph(scoped, {
      focusNodeId: focusId,
      depth,
      autoExpandThreshold: 0,
      autoExpandDepth: depth,
    });

    let hasMoreHops = false;
    if (hopDepth !== "chain") {
      const expanded = selectSubgraph(scoped, {
        focusNodeId: focusId,
        depth: depth + 1,
        autoExpandThreshold: 0,
        autoExpandDepth: depth + 1,
      });
      hasMoreHops = expanded.nodes.size > sliced.nodes.size;
    }

    const aggregated = aggregateNeighbours(sliced, focusId, FOCUS_AGGREGATE_MAX);
    return { subgraph: aggregated, hasMoreHops, isEmpty: false };
  }, [scoped, focusId, hopDepth]);
}

function depthFor(hopDepth: GraphHopDepth): number {
  if (hopDepth === "chain") return CHAIN_DEPTH;
  return hopDepth;
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
