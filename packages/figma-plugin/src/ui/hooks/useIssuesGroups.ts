import { useMemo } from "react";
import type { GraphModel, GraphNodeId } from "@tokenmanager/core";

export type GraphIssueKind =
  | "ghost-reference"
  | "broken-alias"
  | "cycle"
  | "ambiguous-generator-source";

export interface GraphIssueEntry {
  id: string;
  kind: GraphIssueKind;
  collectionId: string;
  primaryNodeId: GraphNodeId;
  relatedNodeIds: GraphNodeId[];
  modeNames?: string[];
  message: string;
}

export interface GraphIssueGroup {
  collectionId: string;
  collectionLabel: string;
  entries: GraphIssueEntry[];
}

const ISSUE_ORDER: Record<GraphIssueKind, number> = {
  "broken-alias": 0,
  "ghost-reference": 1,
  cycle: 2,
  "ambiguous-generator-source": 3,
};

export function useIssuesGroups(
  fullGraph: GraphModel,
  scopeCollectionIds: string[],
): GraphIssueGroup[] {
  return useMemo(() => {
    const inScope = (collectionId: string | undefined) =>
      !collectionId ||
      scopeCollectionIds.length === 0 ||
      scopeCollectionIds.includes(collectionId);

    const entries: GraphIssueEntry[] = [];

    for (const edge of fullGraph.edges.values()) {
      if (edge.kind !== "alias") continue;
      const isBroken =
        edge.isMissingTarget || edge.issueRules?.includes("broken-alias");
      if (!isBroken) continue;
      const downstream = fullGraph.nodes.get(edge.to);
      if (downstream?.kind !== "token") continue;
      if (!inScope(downstream.collectionId)) continue;
      const upstream = fullGraph.nodes.get(edge.from);
      const upstreamLabel =
        upstream?.kind === "token" || upstream?.kind === "ghost"
          ? upstream.path
          : upstream?.kind === "generator"
            ? upstream.name
            : "missing reference";
      entries.push({
        id: `broken-alias:${edge.id}`,
        kind: "broken-alias",
        collectionId: downstream.collectionId,
        primaryNodeId: downstream.id,
        relatedNodeIds: [edge.from],
        modeNames: edge.modeNames,
        message: `${downstream.path} → ${upstreamLabel}`,
      });
    }

    for (const node of fullGraph.nodes.values()) {
      if (node.kind !== "ghost") continue;
      if (!inScope(node.collectionId)) continue;
      const referrers = (fullGraph.outgoing.get(node.id) ?? [])
        .map((edgeId) => fullGraph.edges.get(edgeId))
        .map((edge) => (edge ? fullGraph.nodes.get(edge.to) : undefined))
        .filter((n): n is NonNullable<typeof n> => Boolean(n));
      const primary = referrers[0];
      const collectionId =
        primary && (primary.kind === "token" || primary.kind === "ghost")
          ? primary.collectionId ?? node.collectionId ?? "?"
          : node.collectionId ?? "?";
      entries.push({
        id: `ghost:${node.id}`,
        kind: "ghost-reference",
        collectionId,
        primaryNodeId: primary?.id ?? node.id,
        relatedNodeIds: [node.id],
        message:
          node.reason === "ambiguous"
            ? `${node.path} matches multiple collections`
            : `${node.path} not found`,
      });
    }

    for (const cycle of findCycles(fullGraph)) {
      const sortedMembers = [...cycle].sort();
      const primary = fullGraph.nodes.get(sortedMembers[0]);
      const collectionId =
        primary?.kind === "token" ? primary.collectionId : "?";
      if (!inScope(collectionId)) continue;
      entries.push({
        id: `cycle:${sortedMembers.join("|")}`,
        kind: "cycle",
        collectionId,
        primaryNodeId: sortedMembers[0],
        relatedNodeIds: sortedMembers.slice(1),
        message: `${sortedMembers.length} tokens in a cycle`,
      });
    }

    for (const node of fullGraph.nodes.values()) {
      if (node.kind !== "generator") continue;
      if (!node.sourceIssue) continue;
      if (!inScope(node.targetCollection)) continue;
      entries.push({
        id: `gen-src:${node.id}`,
        kind: "ambiguous-generator-source",
        collectionId: node.targetCollection,
        primaryNodeId: node.id,
        relatedNodeIds: [],
        message:
          node.sourceIssue === "ambiguous"
            ? `${node.name} source is ambiguous`
            : `${node.name} source is missing`,
      });
    }

    const groups = new Map<string, GraphIssueGroup>();
    for (const entry of entries) {
      const existing = groups.get(entry.collectionId);
      if (existing) {
        existing.entries.push(entry);
      } else {
        groups.set(entry.collectionId, {
          collectionId: entry.collectionId,
          collectionLabel: entry.collectionId,
          entries: [entry],
        });
      }
    }

    for (const group of groups.values()) {
      group.entries.sort((a, b) => {
        const order = ISSUE_ORDER[a.kind] - ISSUE_ORDER[b.kind];
        if (order !== 0) return order;
        return a.message.localeCompare(b.message);
      });
    }

    return [...groups.values()].sort((a, b) =>
      a.collectionLabel.localeCompare(b.collectionLabel),
    );
  }, [fullGraph, scopeCollectionIds]);
}

function findCycles(graph: GraphModel): GraphNodeId[][] {
  // Connected components over the subgraph of alias edges flagged inCycle.
  // Each component with > 1 node is reported as one cycle entry.
  const seen = new Set<GraphNodeId>();
  const cycles: GraphNodeId[][] = [];
  for (const node of graph.nodes.values()) {
    if (node.kind !== "token" || seen.has(node.id)) continue;
    const component: GraphNodeId[] = [];
    const stack: GraphNodeId[] = [node.id];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (seen.has(current)) continue;
      seen.add(current);
      let inComponent = false;
      const adjacency = [
        ...(graph.outgoing.get(current) ?? []),
        ...(graph.incoming.get(current) ?? []),
      ];
      for (const edgeId of adjacency) {
        const edge = graph.edges.get(edgeId);
        if (edge?.kind !== "alias" || !edge.inCycle) continue;
        inComponent = true;
        const next = edge.from === current ? edge.to : edge.from;
        if (!seen.has(next)) stack.push(next);
      }
      if (inComponent) component.push(current);
    }
    if (component.length > 1) cycles.push(component);
  }
  return cycles;
}
