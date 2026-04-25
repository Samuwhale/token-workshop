import { useEffect } from "react";
import type { GraphModel, GraphNodeId, TokenGraphNode } from "@tokenmanager/core";
import { tokenNodeId } from "@tokenmanager/core";
import {
  addRecentToken,
  getRecentTokens,
} from "../shared/recentTokens";

const MAX_VISIBLE = 5;

export interface GraphRecentEntry {
  nodeId: GraphNodeId;
  node: TokenGraphNode;
}

export function useGraphRecents(
  fullGraph: GraphModel,
  focusId: GraphNodeId | null,
): GraphRecentEntry[] {
  useEffect(() => {
    if (!focusId) return;
    const node = fullGraph.nodes.get(focusId);
    if (!node || node.kind !== "token") return;
    addRecentToken(node.path, node.collectionId);
  }, [focusId, fullGraph]);

  const result: GraphRecentEntry[] = [];
  for (const recent of getRecentTokens()) {
    const id = tokenNodeId(recent.collectionId, recent.path);
    const node = fullGraph.nodes.get(id);
    if (!node || node.kind !== "token") continue;
    result.push({ nodeId: id, node });
    if (result.length >= MAX_VISIBLE) break;
  }
  return result;
}
