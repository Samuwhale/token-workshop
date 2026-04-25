import { useMemo } from "react";
import type { GraphEdge, GraphModel, GraphNode, GraphNodeId } from "@tokenmanager/core";
import { filterByCollections, selectSubgraph } from "../components/graph/graphScope";
import {
  collapseGraphClusters,
  type GraphRenderModel,
} from "../components/graph/graphClusters";

export interface GraphFilters {
  tokenType: string;
}

export type GraphView = "all" | "issues" | "generators";

export interface GraphScopeInput {
  fullGraph: GraphModel;
  selectedCollectionIds: string[];
  filters: GraphFilters;
  view: GraphView;
  searchQuery: string;
  focusNodeId: GraphNodeId | null;
  expandedClusterIds: Set<GraphNodeId>;
}

export interface GraphScopeOutput {
  /** Graph after collection scope is applied; used for toolbar metrics + scope chip. */
  collectionScoped: GraphModel;
  /** The graph passed to <GraphCanvas>: scope → filters → focus → search → cluster collapse. */
  displayGraph: GraphRenderModel;
  /** Graph after scope+filters+search but before cluster collapse — used by the SR outline. */
  searchGraph: GraphModel;
  /** Whether the search yielded matches (false = render the empty-search state). */
  hasSearchMatches: boolean;
}

/**
 * Single source of truth for the graph view's slice/filter/collapse pipeline.
 * Replaces the inlined memos that previously lived in GraphPanel so that the
 * sequence (and the cache keys) can't drift between consumers.
 */
export function useGraphScope({
  fullGraph,
  selectedCollectionIds,
  filters,
  view,
  searchQuery,
  focusNodeId,
  expandedClusterIds,
}: GraphScopeInput): GraphScopeOutput {
  const collectionScoped = useMemo(
    () => filterByCollections(fullGraph, selectedCollectionIds),
    [fullGraph, selectedCollectionIds],
  );

  const viewScoped = useMemo(
    () => applyViewFilter(collectionScoped, view, focusNodeId),
    [collectionScoped, view, focusNodeId],
  );

  const filteredGraph = useMemo(
    () => filterGraphByFilters(viewScoped, filters, focusNodeId),
    [viewScoped, filters, focusNodeId],
  );

  const focusedGraph = useMemo(
    () => selectSubgraph(filteredGraph, { focusNodeId }),
    [filteredGraph, focusNodeId],
  );

  const searchBaseGraph = searchQuery.trim() ? filteredGraph : focusedGraph;

  const searchResult = useMemo(
    () => filterGraphBySearch(searchBaseGraph, searchQuery, focusNodeId),
    [searchBaseGraph, searchQuery, focusNodeId],
  );

  const displayGraph = useMemo(
    () =>
      collapseGraphClusters(searchResult.graph, {
        focusNodeId,
        expandedClusterIds,
        selectedCollectionIds,
        enabled: !searchQuery.trim(),
      }),
    [
      expandedClusterIds,
      focusNodeId,
      searchQuery,
      searchResult.graph,
      selectedCollectionIds,
    ],
  );

  return {
    collectionScoped,
    displayGraph,
    searchGraph: searchResult.graph,
    hasSearchMatches: searchResult.hasMatches,
  };
}

function applyViewFilter(
  graph: GraphModel,
  view: GraphView,
  focusNodeId: GraphNodeId | null,
): GraphModel {
  if (view === "all") return graph;

  const keep = new Set<GraphNodeId>();

  if (view === "issues") {
    for (const node of graph.nodes.values()) {
      if (node.kind === "ghost") {
        keep.add(node.id);
      } else if (node.kind === "token" || node.kind === "generator") {
        if (node.health !== "ok") keep.add(node.id);
      }
    }
    for (const edge of graph.edges.values()) {
      if (
        edge.kind === "alias" &&
        (edge.inCycle || edge.isMissingTarget || edge.issueRules?.length)
      ) {
        keep.add(edge.from);
        keep.add(edge.to);
      }
    }
  } else {
    // view === "generators"
    for (const node of graph.nodes.values()) {
      if (node.kind === "generator") keep.add(node.id);
    }
    for (const edge of graph.edges.values()) {
      if (edge.kind === "generator-source" || edge.kind === "generator-produces") {
        keep.add(edge.from);
        keep.add(edge.to);
      }
    }
  }

  if (focusNodeId && graph.nodes.has(focusNodeId)) keep.add(focusNodeId);

  return sliceGraph(graph, keep, `view:${view}`);
}

function filterGraphByFilters(
  graph: GraphModel,
  filters: GraphFilters,
  focusNodeId: GraphNodeId | null,
): GraphModel {
  if (filters.tokenType === "all") {
    return graph;
  }

  const keptNodeIds = new Set<GraphNodeId>();
  for (const node of graph.nodes.values()) {
    const keep =
      node.kind !== "token" ||
      filters.tokenType === "all" ||
      node.$type === filters.tokenType;
    if (keep || node.id === focusNodeId) {
      keptNodeIds.add(node.id);
    }
  }

  return sliceGraph(graph, keptNodeIds, `filters:${JSON.stringify(filters)}`);
}

function filterGraphBySearch(
  graph: GraphModel,
  searchQuery: string,
  focusNodeId: GraphNodeId | null,
): { graph: GraphModel; hasMatches: boolean } {
  const query = searchQuery.trim().toLowerCase();
  if (!query) {
    return { graph, hasMatches: true };
  }

  const matched = new Set<GraphNodeId>();
  for (const node of graph.nodes.values()) {
    if (node.kind === "token" || node.kind === "ghost") {
      if (node.path.toLowerCase().includes(query)) {
        matched.add(node.id);
      }
      continue;
    }
    if (node.name.toLowerCase().includes(query)) {
      matched.add(node.id);
    }
  }

  if (matched.size === 0) {
    return {
      graph: {
        nodes: new Map<GraphNodeId, GraphNode>(),
        edges: new Map<string, GraphEdge>(),
        outgoing: new Map<GraphNodeId, string[]>(),
        incoming: new Map<GraphNodeId, string[]>(),
        fingerprint: `${graph.fingerprint}:q:${query}:empty`,
      },
      hasMatches: false,
    };
  }

  if (focusNodeId && graph.nodes.has(focusNodeId)) {
    matched.add(focusNodeId);
  }

  for (const edge of graph.edges.values()) {
    if (matched.has(edge.from) || matched.has(edge.to)) {
      matched.add(edge.from);
      matched.add(edge.to);
    }
  }

  const keptNodes = new Map<GraphNodeId, GraphNode>();
  for (const [id, node] of graph.nodes) {
    if (matched.has(id)) {
      keptNodes.set(id, node);
    }
  }

  const keptEdges = new Map<string, GraphEdge>();
  const outgoing = new Map<GraphNodeId, string[]>();
  const incoming = new Map<GraphNodeId, string[]>();
  for (const [id, edge] of graph.edges) {
    if (!matched.has(edge.from) || !matched.has(edge.to)) continue;
    keptEdges.set(id, edge);
    const out = outgoing.get(edge.from);
    if (out) out.push(id);
    else outgoing.set(edge.from, [id]);
    const inc = incoming.get(edge.to);
    if (inc) inc.push(id);
    else incoming.set(edge.to, [id]);
  }

  return {
    graph: {
      nodes: keptNodes,
      edges: keptEdges,
      outgoing,
      incoming,
      fingerprint: `${graph.fingerprint}:q:${query}`,
    },
    hasMatches: true,
  };
}

function sliceGraph(
  graph: GraphModel,
  keptNodeIds: Set<GraphNodeId>,
  fingerprintSuffix: string,
): GraphModel {
  const nodes = new Map<GraphNodeId, GraphNode>();
  for (const [id, node] of graph.nodes) {
    if (keptNodeIds.has(id)) {
      nodes.set(id, node);
    }
  }

  const edges = new Map<string, GraphEdge>();
  const outgoing = new Map<GraphNodeId, string[]>();
  const incoming = new Map<GraphNodeId, string[]>();
  for (const [id, edge] of graph.edges) {
    if (!keptNodeIds.has(edge.from) || !keptNodeIds.has(edge.to)) continue;
    edges.set(id, edge);
    const out = outgoing.get(edge.from);
    if (out) out.push(id);
    else outgoing.set(edge.from, [id]);
    const inc = incoming.get(edge.to);
    if (inc) inc.push(id);
    else incoming.set(edge.to, [id]);
  }

  return {
    nodes,
    edges,
    outgoing,
    incoming,
    fingerprint: `${graph.fingerprint}:${fingerprintSuffix}`,
  };
}
