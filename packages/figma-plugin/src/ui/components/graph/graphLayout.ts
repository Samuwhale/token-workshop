import type { GraphNodeId } from "@tokenmanager/core";
import type { GraphRenderModel, GraphRenderNode } from "./graphClusters";

export interface NodePosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LaneBand {
  collectionId: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutResult {
  positions: Map<GraphNodeId, NodePosition>;
  /** Per-column collection bands. Empty when there's only one collection in scope. */
  lanes: LaneBand[];
  /** Collection of the focused node, when known — used by renderers to tint cross-collection nodes. */
  focusCollectionId: string | null;
  width: number;
  height: number;
}

export function nodeDimensions(
  node: GraphRenderNode,
): { width: number; height: number } {
  if (node.kind === "cluster") return { width: 180, height: 40 };
  if (node.kind === "generator") return { width: 200, height: 56 };
  if (node.kind === "ghost") return { width: 180, height: 40 };
  return { width: 200, height: 44 };
}

const FOCUS_COLUMN_WIDTH = 300;
const FOCUS_VERTICAL_GAP = 16;
const FOCUS_LANE_GAP = 24;
const FOCUS_LANE_LABEL_HEIGHT = 20;

/**
 * Deterministic columnar layout for focus mode: pin the focused node at
 * (0, 0); lay each upstream BFS hop in a column to the left and each
 * downstream hop in a column to the right. Camera stays stable across edits
 * because positions are a pure function of the subgraph topology.
 */
export function layoutFocused(
  subgraph: GraphRenderModel,
  focusId: GraphNodeId,
): LayoutResult {
  const positions = new Map<GraphNodeId, NodePosition>();
  const lanes: LaneBand[] = [];
  if (!subgraph.nodes.has(focusId)) {
    return {
      positions,
      lanes,
      focusCollectionId: null,
      width: 0,
      height: 0,
    };
  }

  const focusNode = subgraph.nodes.get(focusId)!;
  const focusCollectionId = collectionIdOf(focusNode);
  const focusDims = nodeDimensions(focusNode);
  positions.set(focusId, {
    x: -focusDims.width / 2,
    y: -focusDims.height / 2,
    width: focusDims.width,
    height: focusDims.height,
  });

  const columnsByHop = new Map<number, GraphNodeId[]>();
  collectColumn(subgraph, focusId, "upstream", columnsByHop);
  const upstream = new Map(columnsByHop);
  columnsByHop.clear();
  collectColumn(subgraph, focusId, "downstream", columnsByHop);
  const downstream = new Map(columnsByHop);

  let minY = -focusDims.height / 2;
  let maxY = focusDims.height / 2;
  let minX = -focusDims.width / 2;
  let maxX = focusDims.width / 2;

  const place = (
    nodeIds: GraphNodeId[],
    hop: number,
    side: "upstream" | "downstream",
  ) => {
    if (nodeIds.length === 0) return;
    const sorted = [...nodeIds].sort(
      orderForLayout(subgraph, focusCollectionId),
    );

    // Group by collection in the order they appear after sorting (focus
    // collection first, then alphabetical).
    const bands: { collectionId: string; ids: GraphNodeId[] }[] = [];
    for (const id of sorted) {
      const cid = collectionIdOf(subgraph.nodes.get(id)) ?? "";
      const last = bands[bands.length - 1];
      if (last && last.collectionId === cid) last.ids.push(id);
      else bands.push({ collectionId: cid, ids: [id] });
    }

    // Show a band label only for cross-collection bands (focus's own
    // collection is the visual baseline). When the column is single-collection
    // and that collection IS the focus collection, no label appears.
    const labelFor = (cid: string) =>
      cid && cid !== focusCollectionId ? cid : null;

    // Total height = sum of band heights + lane gaps between bands.
    let totalHeight = 0;
    const bandDims: { width: number; height: number }[][] = [];
    bands.forEach((band, bi) => {
      const dimsForBand = band.ids.map((id) => {
        const n = subgraph.nodes.get(id);
        return n ? nodeDimensions(n) : { width: 200, height: 44 };
      });
      bandDims.push(dimsForBand);
      const innerGap = FOCUS_VERTICAL_GAP * Math.max(band.ids.length - 1, 0);
      const labelH = labelFor(band.collectionId) ? FOCUS_LANE_LABEL_HEIGHT : 0;
      const bandH =
        labelH +
        innerGap +
        dimsForBand.reduce((s, d) => s + d.height, 0);
      totalHeight += bandH;
      if (bi < bands.length - 1) totalHeight += FOCUS_LANE_GAP;
    });

    let cursorY = -totalHeight / 2;
    const columnX = (side === "upstream" ? -1 : 1) * FOCUS_COLUMN_WIDTH * hop;

    bands.forEach((band, bi) => {
      const label = labelFor(band.collectionId);
      const bandStartY = cursorY;
      if (label) cursorY += FOCUS_LANE_LABEL_HEIGHT;

      const dimsForBand = bandDims[bi];
      band.ids.forEach((id, i) => {
        const d = dimsForBand[i];
        const x = columnX - d.width / 2;
        positions.set(id, { x, y: cursorY, width: d.width, height: d.height });
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x + d.width);
        minY = Math.min(minY, cursorY);
        maxY = Math.max(maxY, cursorY + d.height);
        cursorY += d.height + FOCUS_VERTICAL_GAP;
      });
      if (band.ids.length > 0) cursorY -= FOCUS_VERTICAL_GAP;

      const bandEndY = cursorY;
      // Emit a lane band only for cross-collection groups; the focus
      // collection is the visual baseline and gets no chrome.
      if (label) {
        lanes.push({
          collectionId: band.collectionId,
          label,
          x: columnX - FOCUS_COLUMN_WIDTH / 2 + 8,
          y: bandStartY,
          width: FOCUS_COLUMN_WIDTH - 16,
          height: bandEndY - bandStartY,
        });
      }

      if (bi < bands.length - 1) cursorY += FOCUS_LANE_GAP;
    });
  };

  for (const [hop, ids] of upstream) place(ids, hop, "upstream");
  for (const [hop, ids] of downstream) place(ids, hop, "downstream");

  return {
    positions,
    lanes,
    focusCollectionId,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function collectionIdOf(node: GraphRenderNode | undefined): string | null {
  if (!node) return null;
  if (node.kind === "token") return node.collectionId;
  if (node.kind === "generator") return node.targetCollection;
  if (node.kind === "ghost") return node.collectionId ?? null;
  return null;
}

function collectColumn(
  graph: GraphRenderModel,
  anchor: GraphNodeId,
  side: "upstream" | "downstream",
  columnsByHop: Map<number, GraphNodeId[]>,
): void {
  const visited = new Set<GraphNodeId>([anchor]);
  let frontier: GraphNodeId[] = [anchor];
  let hop = 0;
  while (frontier.length > 0) {
    hop++;
    const next: GraphNodeId[] = [];
    for (const nodeId of frontier) {
      const edgeIds =
        side === "upstream"
          ? graph.incoming.get(nodeId) ?? []
          : graph.outgoing.get(nodeId) ?? [];
      for (const edgeId of edgeIds) {
        const edge = graph.edges.get(edgeId);
        if (!edge) continue;
        const otherId = side === "upstream" ? edge.from : edge.to;
        if (visited.has(otherId)) continue;
        visited.add(otherId);
        next.push(otherId);
        const list = columnsByHop.get(hop);
        if (list) list.push(otherId);
        else columnsByHop.set(hop, [otherId]);
      }
    }
    frontier = next;
  }
}

function orderForLayout(
  graph: GraphRenderModel,
  focusCollectionId: string | null,
): (a: GraphNodeId, b: GraphNodeId) => number {
  return (a, b) => {
    const na = graph.nodes.get(a);
    const nb = graph.nodes.get(b);
    // Sort by collection first (focus collection wins), then by label inside
    // each band so each column reads as collection-grouped + alphabetical.
    const ca = collectionIdOf(na) ?? "";
    const cb = collectionIdOf(nb) ?? "";
    const aIsFocus = focusCollectionId !== null && ca === focusCollectionId;
    const bIsFocus = focusCollectionId !== null && cb === focusCollectionId;
    if (aIsFocus !== bIsFocus) return aIsFocus ? -1 : 1;
    if (ca !== cb) return ca.localeCompare(cb);
    return labelForOrdering(na).localeCompare(labelForOrdering(nb));
  };
}

function labelForOrdering(node: GraphRenderNode | undefined): string {
  if (!node) return "";
  if (node.kind === "token" || node.kind === "ghost") return node.path;
  if (node.kind === "generator") return node.name;
  if (node.kind === "derivation") return node.derivedPath;
  return node.label;
}
