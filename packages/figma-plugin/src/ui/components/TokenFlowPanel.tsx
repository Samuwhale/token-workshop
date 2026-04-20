import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { swatchBgColor } from "../shared/colorUtils";
import type { TokenMapEntry } from "../../shared/types";
import {
  extractAliasPath,
  isAlias,
  resolveTokenValue,
} from "../../shared/resolveAlias";
import type { TokenValue, TokenReference } from "@tokenmanager/core";
import { edgePath } from "../shared/graphUtils";
import { SkeletonFlowRow } from "./Skeleton";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FlowNode {
  path: string;
  $type: string;
  $value: TokenValue | TokenReference;
  resolvedHex: string | null; // resolved color hex for swatches
  /** 'source' = upstream ref, 'center' = selected, 'dependent' = downstream */
  role: "source" | "center" | "dependent";
  isCyclic?: boolean;
}

export interface TokenDependencyNode {
  path: string;
  collectionId: string | null;
  $type: string;
  $value: TokenValue | TokenReference;
  resolvedHex: string | null;
  depth: number;
  isCyclic: boolean;
}

export interface TokenDependencySnapshot {
  centerNode: TokenDependencyNode;
  directReferences: string[];
  directDependents: string[];
  referenceNodes: TokenDependencyNode[];
  dependentNodes: TokenDependencyNode[];
  hasCycles: boolean;
}

export interface TokenFlowPanelProps {
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToCollectionId: Record<string, string>;
  onNavigateToToken?: (path: string) => void;
  onEditToken?: (path: string) => void;
  /** When set, the panel auto-selects this token path on mount / change */
  initialPath?: string | null;
  /** True while tokens are being fetched from the server */
  loading?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get all direct alias references from a token value (handles composite sub-props too) */
export function getDirectReferences(
  value: TokenValue | TokenReference,
): string[] {
  if (typeof value === "string") {
    const p = extractAliasPath(value);
    return p ? [p] : [];
  }
  if (value && typeof value === "object") {
    const refs: string[] = [];
    const items = Array.isArray(value) ? value : [value];
    for (const item of items) {
      if (item && typeof item === "object") {
        for (const v of Object.values(item as Record<string, unknown>)) {
          if (typeof v === "string") {
            const p = extractAliasPath(v);
            if (p) refs.push(p);
          }
        }
      }
    }
    return refs;
  }
  return [];
}

/** Build reverse dependency map: path → set of paths that reference it */
export function buildDependentsMap(
  tokenMap: Record<string, TokenMapEntry>,
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const [path, entry] of Object.entries(tokenMap)) {
    const refs = getDirectReferences(entry.$value);
    for (const ref of refs) {
      if (!map.has(ref)) map.set(ref, new Set());
      map.get(ref)!.add(path);
    }
  }
  return map;
}

/**
 * DFS cycle detection. Returns all node paths that participate in at least one cycle
 * reachable from `start`. Works for both upstream (follow references) and downstream
 * (follow dependents) directions by accepting a `getNeighbors` callback.
 */
function detectCycleNodes(
  start: string,
  getNeighbors: (path: string) => string[],
): Set<string> {
  const cycleNodes = new Set<string>();
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const stackArr: string[] = [];

  function dfs(path: string): void {
    if (inStack.has(path)) {
      // Back edge — everything from `path`'s first appearance in the stack to the
      // current tail is part of this cycle.
      const idx = stackArr.indexOf(path);
      for (let i = idx; i < stackArr.length; i++) cycleNodes.add(stackArr[i]);
      cycleNodes.add(path);
      return;
    }
    if (visited.has(path)) return;
    visited.add(path);
    inStack.add(path);
    stackArr.push(path);
    for (const neighbor of getNeighbors(path)) dfs(neighbor);
    stackArr.pop();
    inStack.delete(path);
  }

  dfs(start);
  return cycleNodes;
}

function tryResolveColor(
  path: string,
  tokenMap: Record<string, TokenMapEntry>,
): string | null {
  const entry = tokenMap[path];
  if (!entry) return null;
  const result = resolveTokenValue(entry.$value, entry.$type, tokenMap);
  const v = result.value;
  if (typeof v === "string" && /^#[0-9a-fA-F]{6,8}$/.test(v)) return v;
  return null;
}

function formatValue(value: TokenValue | TokenReference): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (value && typeof value === "object")
    return JSON.stringify(value).slice(0, 60);
  return "?";
}

function walkDependencyNodes(
  seeds: string[],
  tokenMap: Record<string, TokenMapEntry>,
  pathToCollectionId: Record<string, string>,
  cycleNodes: Set<string>,
  getNext: (path: string) => string[],
): TokenDependencyNode[] {
  const nodes: TokenDependencyNode[] = [];
  const seen = new Set<string>();
  const queue = seeds.map((path) => ({ path, depth: 1 }));
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (seen.has(current.path)) continue;
    seen.add(current.path);
    const entry = tokenMap[current.path];
    if (!entry) continue;
    nodes.push({
      path: current.path,
      collectionId: pathToCollectionId[current.path] ?? null,
      $type: entry.$type,
      $value: entry.$value,
      resolvedHex: tryResolveColor(current.path, tokenMap),
      depth: current.depth,
      isCyclic: cycleNodes.has(current.path),
    });
    for (const nextPath of getNext(current.path)) {
      if (!seen.has(nextPath))
        queue.push({ path: nextPath, depth: current.depth + 1 });
    }
  }
  return nodes;
}

export function buildTokenDependencySnapshot(
  selectedPath: string,
  tokenMap: Record<string, TokenMapEntry>,
  pathToCollectionId: Record<string, string>,
): TokenDependencySnapshot | null {
  const centerEntry = tokenMap[selectedPath];
  if (!centerEntry) return null;

  const dependentsMap = buildDependentsMap(tokenMap);
  const upstreamCycleNodes = detectCycleNodes(selectedPath, (path) => {
    const entry = tokenMap[path];
    return entry ? getDirectReferences(entry.$value) : [];
  });
  const downstreamCycleNodes = detectCycleNodes(selectedPath, (path) =>
    Array.from(dependentsMap.get(path) ?? []),
  );
  const cycleNodes = new Set<string>();
  for (const path of upstreamCycleNodes) cycleNodes.add(path);
  for (const path of downstreamCycleNodes) cycleNodes.add(path);
  const directReferences = getDirectReferences(centerEntry.$value);
  const directDependents = [...(dependentsMap.get(selectedPath) ?? [])];

  return {
    centerNode: {
      path: selectedPath,
      collectionId: pathToCollectionId[selectedPath] ?? null,
      $type: centerEntry.$type,
      $value: centerEntry.$value,
      resolvedHex: tryResolveColor(selectedPath, tokenMap),
      depth: 0,
      isCyclic: cycleNodes.has(selectedPath),
    },
    directReferences,
    directDependents,
    referenceNodes: walkDependencyNodes(
      directReferences,
      tokenMap,
      pathToCollectionId,
      cycleNodes,
      (path) => {
        const entry = tokenMap[path];
        return entry ? getDirectReferences(entry.$value) : [];
      },
    ),
    dependentNodes: walkDependencyNodes(
      directDependents,
      tokenMap,
      pathToCollectionId,
      cycleNodes,
      (path) => Array.from(dependentsMap.get(path) ?? []),
    ),
    hasCycles: cycleNodes.size > 0,
  };
}

// ---------------------------------------------------------------------------
// Search component
// ---------------------------------------------------------------------------

function TokenSearch({
  tokenMap,
  onSelect,
}: {
  tokenMap: Record<string, TokenMapEntry>;
  onSelect: (path: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    const paths = Object.keys(tokenMap);
    const matches: string[] = [];
    for (const p of paths) {
      if (p.toLowerCase().includes(q)) {
        matches.push(p);
        if (matches.length >= 20) break;
      }
    }
    return matches;
  }, [query, tokenMap]);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        className="w-full px-2 py-1.5 text-secondary bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] rounded focus-visible:border-[var(--color-figma-accent)]"
        placeholder="Search token to visualize…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 200)}
      />
      {focused && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-0.5 max-h-48 overflow-y-auto bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] rounded shadow-lg">
          {results.map((p) => (
            <button
              key={p}
              className="w-full text-left px-2 py-1 text-secondary hover:bg-[var(--color-figma-bg-hover)] truncate"
              onMouseDown={(e) => {
                e.preventDefault();
                setQuery("");
                setFocused(false);
                onSelect(p);
              }}
            >
              <span className="opacity-50">{tokenMap[p].$type}</span> {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Graph node component (rendered with HTML overlay, positioned absolutely)
// ---------------------------------------------------------------------------

const NODE_W = 180;
const NODE_H = 56;
const COL_GAP = 80;
const ROW_GAP = 12;

function FlowNodeCard({
  node,
  x,
  y,
  isCenter,
  onClick,
  onEdit,
  onGoToTree,
}: {
  node: FlowNode;
  x: number;
  y: number;
  isCenter: boolean;
  onClick: () => void;
  onEdit?: () => void;
  onGoToTree?: () => void;
}) {
  const cyclic = node.isCyclic;
  const hasActions = !!(onEdit || onGoToTree);
  return (
    <div
      className={`group/card absolute rounded border text-secondary select-none transition-shadow ${
        cyclic
          ? "border-[var(--color-figma-error)]/60 bg-[var(--color-figma-error)]/5"
          : isCenter
            ? "border-[var(--color-figma-accent)] shadow-md bg-[var(--color-figma-bg)]"
            : "border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] hover:border-[var(--color-figma-accent)] hover:shadow cursor-pointer"
      }`}
      style={{ left: x, top: y, width: NODE_W, height: NODE_H }}
      onClick={isCenter ? undefined : onClick}
      title={cyclic ? `⚠ Circular dependency: ${node.path}` : node.path}
    >
      <div className="px-2 pt-1.5 flex items-center gap-1.5 truncate">
        {cyclic && (
          <svg
            width="10"
            height="10"
            viewBox="0 0 16 16"
            fill="currentColor"
            className="flex-shrink-0 text-[var(--color-figma-error)]"
            aria-hidden="true"
          >
            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm-.75 3.5h1.5v5h-1.5v-5zm0 6h1.5v1.5h-1.5V10.5z" />
          </svg>
        )}
        {!cyclic && node.resolvedHex && (
          <span
            className="inline-block w-3 h-3 rounded-sm border border-[var(--color-figma-border)] flex-shrink-0"
            style={{ backgroundColor: swatchBgColor(node.resolvedHex) }}
          />
        )}
        {cyclic && node.resolvedHex && (
          <span
            className="inline-block w-3 h-3 rounded-sm border border-[var(--color-figma-error)]/30 flex-shrink-0 opacity-50"
            style={{ backgroundColor: swatchBgColor(node.resolvedHex) }}
          />
        )}
        <span
          className={`font-medium truncate ${cyclic ? "text-[var(--color-figma-error)]" : ""}`}
        >
          {node.path.split(".").pop()}
        </span>
        <span className="ml-auto opacity-40 flex-shrink-0 group-hover/card:opacity-0 transition-opacity">
          {node.$type}
        </span>
      </div>
      <div
        className="px-2 pt-0.5 truncate opacity-60"
        title={formatValue(node.$value)}
      >
        {formatValue(node.$value)}
      </div>
      {/* Action buttons — visible on hover */}
      {hasActions && (
        <div className="absolute right-1 top-0 bottom-0 flex items-center gap-0.5 opacity-0 group-hover/card:opacity-100 pointer-events-none group-hover/card:pointer-events-auto transition-opacity">
          {onGoToTree && (
            <button
              className="w-5 h-5 flex items-center justify-center rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
              onClick={(e) => {
                e.stopPropagation();
                onGoToTree();
              }}
              title="Go to in token library"
              aria-label="Go to in tree"
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
            </button>
          )}
          {onEdit && (
            <button
              className="w-5 h-5 flex items-center justify-center rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              title="Edit token"
              aria-label="Edit token"
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M11 4H4a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SVG edge drawing
// ---------------------------------------------------------------------------

type FlowEdge = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  isCyclic?: boolean;
};

function FlowEdges({
  edges,
  totalWidth,
  totalHeight,
}: {
  edges: FlowEdge[];
  totalWidth: number;
  totalHeight: number;
}) {
  if (edges.length === 0) return null;
  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      style={{ width: totalWidth, height: totalHeight }}
    >
      <defs>
        <marker
          id="flow-arrow"
          viewBox="0 0 10 7"
          refX="10"
          refY="3.5"
          markerWidth="8"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0 0L10 3.5L0 7z" fill="var(--color-figma-accent)" />
        </marker>
        <marker
          id="flow-arrow-cyclic"
          viewBox="0 0 10 7"
          refX="10"
          refY="3.5"
          markerWidth="8"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0 0L10 3.5L0 7z" fill="var(--color-figma-error)" />
        </marker>
      </defs>
      {edges.map((e, i) => (
        <path
          key={i}
          d={edgePath(e.x1, e.y1, e.x2, e.y2)}
          fill="none"
          stroke={e.isCyclic ? "var(--color-figma-error)" : "var(--color-figma-accent)"}
          strokeWidth={e.isCyclic ? 1.5 : 1.5}
          strokeOpacity={e.isCyclic ? 0.8 : 0.5}
          strokeDasharray={e.isCyclic ? "4 3" : undefined}
          markerEnd={
            e.isCyclic ? "url(#flow-arrow-cyclic)" : "url(#flow-arrow)"
          }
        />
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

const DEFAULT_SOURCE_LIMIT = 20;
const DEFAULT_DEP_LIMIT = 30;

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 3;

export function TokenFlowPanel({
  allTokensFlat,
  pathToCollectionId,
  onNavigateToToken,
  onEditToken,
  initialPath,
  loading = false,
}: TokenFlowPanelProps) {
  const [selectedPath, setSelectedPath] = useState<string | null>(
    initialPath ?? null,
  );

  // When an external caller sets initialPath (e.g. "Show references" action), select it
  useEffect(() => {
    if (initialPath && allTokensFlat[initialPath]) {
      setSelectedPath(initialPath);
    }
  }, [initialPath, allTokensFlat]);
  const [sourceExpanded, setSourceExpanded] = useState(false);
  const [depExpanded, setDepExpanded] = useState(false);

  // Pan/zoom state
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{
    startX: number;
    startY: number;
    panX: number;
    panY: number;
  } | null>(null);
  const containerSizeRef = useRef({ w: 600, h: 400 });

  // Build graph data for selected token
  const graphData = useMemo(() => {
    if (!selectedPath) return null;
    const snapshot = buildTokenDependencySnapshot(
      selectedPath,
      allTokensFlat,
      pathToCollectionId,
    );
    if (!snapshot) return null;

    return {
      centerNode: { ...snapshot.centerNode, role: "center" as const },
      sourceNodes: snapshot.referenceNodes.map((node) => ({
        ...node,
        role: "source" as const,
      })),
      depNodes: snapshot.dependentNodes.map((node) => ({
        ...node,
        role: "dependent" as const,
      })),
      hasCycles: snapshot.hasCycles,
    };
  }, [selectedPath, allTokensFlat, pathToCollectionId]);

  // Reset expanded state when selection changes
  const prevSelectedRef = useRef(selectedPath);
  if (prevSelectedRef.current !== selectedPath) {
    prevSelectedRef.current = selectedPath;
    setSourceExpanded(false);
    setDepExpanded(false);
  }

  // Apply display limits
  const visibleData = useMemo(() => {
    if (!graphData) return null;
    const srcLimit = sourceExpanded
      ? graphData.sourceNodes.length
      : DEFAULT_SOURCE_LIMIT;
    const depLimit = depExpanded
      ? graphData.depNodes.length
      : DEFAULT_DEP_LIMIT;
    return {
      centerNode: graphData.centerNode,
      sourceNodes: graphData.sourceNodes.slice(0, srcLimit),
      depNodes: graphData.depNodes.slice(0, depLimit),
      totalSourceCount: graphData.sourceNodes.length,
      totalDepCount: graphData.depNodes.length,
      sourceTruncated: graphData.sourceNodes.length > srcLimit,
      depTruncated: graphData.depNodes.length > depLimit,
    };
  }, [graphData, sourceExpanded, depExpanded]);

  // Layout: 3 columns — sources | center | dependents
  const layout = useMemo(() => {
    if (!visibleData) return null;
    const {
      centerNode,
      sourceNodes,
      depNodes,
      totalSourceCount,
      totalDepCount,
      sourceTruncated,
      depTruncated,
    } = visibleData;

    const srcCount = sourceNodes.length;
    const depCount = depNodes.length;
    const maxSideCount = Math.max(srcCount, depCount, 1);

    const totalHeight = Math.max(
      maxSideCount * (NODE_H + ROW_GAP) - ROW_GAP,
      NODE_H,
    );
    const centerY = totalHeight / 2 - NODE_H / 2;

    // Source column (left)
    const srcX = 20;
    const srcStartY =
      totalHeight / 2 - (srcCount * (NODE_H + ROW_GAP) - ROW_GAP) / 2;
    const srcPositions = sourceNodes.map((_, i) => ({
      x: srcX,
      y: srcStartY + i * (NODE_H + ROW_GAP),
    }));

    // Center column
    const centerX = srcX + NODE_W + COL_GAP;
    const centerPos = { x: centerX, y: centerY };

    // Dependent column (right)
    const depX = centerX + NODE_W + COL_GAP;
    const depStartY =
      totalHeight / 2 - (depCount * (NODE_H + ROW_GAP) - ROW_GAP) / 2;
    const depPositions = depNodes.map((_, i) => ({
      x: depX,
      y: depStartY + i * (NODE_H + ROW_GAP),
    }));

    // Edges: source → center, center → dependent
    const edges: FlowEdge[] = [];
    for (let i = 0; i < srcPositions.length; i++) {
      const sp = srcPositions[i];
      const srcNode = sourceNodes[i];
      edges.push({
        x1: sp.x + NODE_W,
        y1: sp.y + NODE_H / 2,
        x2: centerPos.x,
        y2: centerPos.y + NODE_H / 2,
        isCyclic: srcNode.isCyclic || centerNode.isCyclic,
      });
    }
    for (let i = 0; i < depPositions.length; i++) {
      const dp = depPositions[i];
      const depNode = depNodes[i];
      edges.push({
        x1: centerPos.x + NODE_W,
        y1: centerPos.y + NODE_H / 2,
        x2: dp.x,
        y2: dp.y + NODE_H / 2,
        isCyclic: centerNode.isCyclic || depNode.isCyclic,
      });
    }

    const totalWidth = depX + NODE_W + 20;
    const contentHeight =
      totalHeight + 40 + (sourceTruncated || depTruncated ? 28 : 0);

    return {
      centerNode,
      sourceNodes,
      depNodes,
      centerPos,
      srcPositions,
      depPositions,
      edges,
      totalWidth,
      totalHeight: contentHeight,
      totalSourceCount,
      totalDepCount,
      sourceTruncated,
      depTruncated,
    };
  }, [visibleData]);

  // Fit-to-view: compute pan/zoom to fit the graph in the container
  const fitToView = useCallback(() => {
    if (!layout || !containerRef.current) return;
    const { w, h } = containerSizeRef.current;
    const PAD = 32;
    const scaleX = (w - PAD * 2) / layout.totalWidth;
    const scaleY = (h - PAD * 2) / layout.totalHeight;
    const newZoom = Math.max(
      MIN_ZOOM,
      Math.min(MAX_ZOOM, Math.min(scaleX, scaleY)),
    );
    setPan({
      x: (w - layout.totalWidth * newZoom) / 2,
      y: (h - layout.totalHeight * newZoom) / 2,
    });
    setZoom(newZoom);
  }, [layout]);

  // Auto fit-to-view when the selected token changes (node navigation).
  // Uses selectedPath as the key so that every navigation triggers a re-fit,
  // even when the new token has the same source/dep count as the previous one.
  // Expand/collapse of the same token does NOT reset the view.
  const prevFitPathRef = useRef<string | null>(null);
  useEffect(() => {
    if (!layout || !selectedPath) return;
    if (selectedPath !== prevFitPathRef.current) {
      prevFitPathRef.current = selectedPath;
      fitToView();
    }
  }, [layout, fitToView, selectedPath]);

  // Track container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        containerSizeRef.current = {
          w: entry.contentRect.width,
          h: entry.contentRect.height,
        };
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Attach wheel listener with passive:false so preventDefault works
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.92 : 1.08;
      setZoom((prevZoom) => {
        const newZoom = Math.max(
          MIN_ZOOM,
          Math.min(MAX_ZOOM, prevZoom * factor),
        );
        const rect = el.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const scale = newZoom / prevZoom;
        setPan((prev) => ({
          x: cx - (cx - prev.x) * scale,
          y: cy - (cy - prev.y) * scale,
        }));
        return newZoom;
      });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  // Pan handlers
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Only pan on background (not on node cards or buttons)
      const target = e.target as HTMLElement;
      if (target.closest("[data-flow-node]") || target.closest("button"))
        return;
      e.currentTarget.setPointerCapture(e.pointerId);
      setIsPanning(true);
      panRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        panX: pan.x,
        panY: pan.y,
      };
    },
    [pan],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!panRef.current) return;
      setPan({
        x: panRef.current.panX + (e.clientX - panRef.current.startX),
        y: panRef.current.panY + (e.clientY - panRef.current.startY),
      });
    },
    [],
  );

  const handlePointerUp = useCallback(() => {
    panRef.current = null;
    setIsPanning(false);
  }, []);

  const handleNodeClick = useCallback((path: string) => {
    setSelectedPath(path);
  }, []);

  const handleNavigate = useCallback(
    (path: string) => {
      onNavigateToToken?.(path);
    },
    [onNavigateToToken],
  );

  const handleEdit = useCallback(
    (path: string) => {
      onEditToken?.(path);
    },
    [onEditToken],
  );

  // Stats
  const stats = useMemo(() => {
    const totalTokens = Object.keys(allTokensFlat).length;
    let aliasCount = 0;
    for (const entry of Object.values(allTokensFlat)) {
      if (isAlias(entry.$value)) aliasCount++;
    }
    return { totalTokens, aliasCount };
  }, [allTokensFlat]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-3 pt-3 pb-2 border-b border-[var(--color-figma-border)]">
        <div className="flex items-center gap-2 mb-2">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="opacity-60"
          >
            <circle cx="5" cy="12" r="3" />
            <circle cx="19" cy="6" r="3" />
            <circle cx="19" cy="18" r="3" />
            <path d="M8 12h4m0 0l4-6m-4 6l4 6" />
          </svg>
          <span className="text-secondary font-semibold">Dependencies</span>
          <span className="ml-auto text-secondary opacity-40">
            {stats.totalTokens} tokens · {stats.aliasCount} aliases
          </span>
        </div>
        <TokenSearch tokenMap={allTokensFlat} onSelect={setSelectedPath} />
      </div>

      {/* Cycle warning banner */}
      {graphData?.hasCycles && (
        <div className="flex-shrink-0 flex items-start gap-2 px-3 py-2 bg-[var(--color-figma-error)]/10 border-b border-[var(--color-figma-error)]/20 text-body text-[var(--color-figma-error)]">
          <svg
            width="12"
            height="12"
            viewBox="0 0 16 16"
            fill="currentColor"
            className="flex-shrink-0 mt-px"
            aria-hidden="true"
          >
            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm-.75 3.5h1.5v5h-1.5v-5zm0 6h1.5v1.5h-1.5V10.5z" />
          </svg>
          <span>
            <strong>Circular dependency.</strong> Red nodes form a cycle and will not resolve.
          </span>
        </div>
      )}

      {/* Graph area */}
      {loading && (
        <div
          className="flex-1 flex flex-col justify-center gap-1 pb-4"
          aria-label="Loading tokens…"
          aria-busy="true"
        >
          <SkeletonFlowRow wide />
          <SkeletonFlowRow />
          <SkeletonFlowRow wide />
          <SkeletonFlowRow />
        </div>
      )}
      {!loading && !selectedPath && (
        <div className="flex-1 flex items-center justify-center text-secondary opacity-40 px-4 text-center">
          <div>
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mx-auto mb-2 opacity-30"
            >
              <circle cx="5" cy="12" r="3" />
              <circle cx="19" cy="6" r="3" />
              <circle cx="19" cy="18" r="3" />
              <path d="M8 12h4m0 0l4-6m-4 6l4 6" />
            </svg>
            Search or select a token to view its dependency graph.
          </div>
        </div>
      )}

      {!loading && selectedPath && !graphData && (
        <div className="flex-1 flex items-center justify-center text-secondary opacity-40">
          Token not found: {selectedPath}
        </div>
      )}

      {layout && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Pannable/zoomable canvas */}
          <div
            ref={containerRef}
            className="flex-1 relative overflow-hidden"
            style={{ cursor: isPanning ? "grabbing" : "grab" }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            {/* Transformed graph content */}
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                transformOrigin: "0 0",
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                width: layout.totalWidth,
                height: layout.totalHeight,
              }}
            >
              {/* Column labels */}
              {layout.sourceNodes.length > 0 && (
                <div
                  className="absolute text-secondary font-medium uppercase tracking-wider opacity-30"
                  style={{ left: layout.srcPositions[0]?.x ?? 20, top: 4 }}
                >
                  References
                </div>
              )}
              <div
                className="absolute text-secondary font-medium uppercase tracking-wider opacity-30"
                style={{ left: layout.centerPos.x, top: 4 }}
              >
                Selected
              </div>
              {layout.depNodes.length > 0 && (
                <div
                  className="absolute text-secondary font-medium uppercase tracking-wider opacity-30"
                  style={{ left: layout.depPositions[0]?.x ?? 0, top: 4 }}
                >
                  Dependents
                </div>
              )}

              {/* SVG edges */}
              <FlowEdges
                edges={layout.edges}
                totalWidth={layout.totalWidth}
                totalHeight={layout.totalHeight}
              />

              {/* Source nodes */}
              {layout.sourceNodes.map((node, i) => (
                <div key={node.path} data-flow-node="1">
                  <FlowNodeCard
                    node={node}
                    x={layout.srcPositions[i].x}
                    y={layout.srcPositions[i].y + 20}
                    isCenter={false}
                    onClick={() => handleNodeClick(node.path)}
                    onGoToTree={
                      onNavigateToToken
                        ? () => handleNavigate(node.path)
                        : undefined
                    }
                    onEdit={
                      onEditToken ? () => handleEdit(node.path) : undefined
                    }
                  />
                </div>
              ))}
              {(layout.sourceTruncated || sourceExpanded) &&
                layout.sourceNodes.length > 0 && (
                  <button
                    data-flow-node="1"
                    className="absolute text-secondary text-[var(--color-figma-accent)] hover:underline"
                    style={{
                      left:
                        layout.srcPositions[layout.srcPositions.length - 1]
                          ?.x ?? 20,
                      top:
                        (layout.srcPositions[layout.srcPositions.length - 1]
                          ?.y ?? 0) +
                        NODE_H +
                        20 +
                        6,
                      width: NODE_W,
                      textAlign: "center",
                    }}
                    onClick={() => setSourceExpanded((v) => !v)}
                  >
                    {sourceExpanded
                      ? "Show fewer"
                      : `Show all ${layout.totalSourceCount} reference${layout.totalSourceCount !== 1 ? "s" : ""}`}
                  </button>
                )}

              {/* Center node */}
              <div data-flow-node="1">
                <FlowNodeCard
                  node={layout.centerNode}
                  x={layout.centerPos.x}
                  y={layout.centerPos.y + 20}
                  isCenter={true}
                  onClick={() => {}}
                  onGoToTree={
                    onNavigateToToken
                      ? () => handleNavigate(layout.centerNode.path)
                      : undefined
                  }
                  onEdit={
                    onEditToken
                      ? () => handleEdit(layout.centerNode.path)
                      : undefined
                  }
                />
              </div>

              {/* Dependent nodes */}
              {layout.depNodes.map((node, i) => (
                <div key={node.path} data-flow-node="1">
                  <FlowNodeCard
                    node={node}
                    x={layout.depPositions[i].x}
                    y={layout.depPositions[i].y + 20}
                    isCenter={false}
                    onClick={() => handleNodeClick(node.path)}
                    onGoToTree={
                      onNavigateToToken
                        ? () => handleNavigate(node.path)
                        : undefined
                    }
                    onEdit={
                      onEditToken ? () => handleEdit(node.path) : undefined
                    }
                  />
                </div>
              ))}
              {(layout.depTruncated || depExpanded) &&
                layout.depNodes.length > 0 && (
                  <button
                    data-flow-node="1"
                    className="absolute text-secondary text-[var(--color-figma-accent)] hover:underline"
                    style={{
                      left:
                        layout.depPositions[layout.depPositions.length - 1]
                          ?.x ?? 0,
                      top:
                        (layout.depPositions[layout.depPositions.length - 1]
                          ?.y ?? 0) +
                        NODE_H +
                        20 +
                        6,
                      width: NODE_W,
                      textAlign: "center",
                    }}
                    onClick={() => setDepExpanded((v) => !v)}
                  >
                    {depExpanded
                      ? "Show fewer"
                      : `Show all ${layout.totalDepCount} dependent${layout.totalDepCount !== 1 ? "s" : ""}`}
                  </button>
                )}
            </div>

            {/* Zoom controls (absolute overlay, outside transform) */}
            <div className="absolute bottom-2 right-2 flex items-center gap-1 pointer-events-auto z-10">
              <button
                className="px-1.5 py-0.5 text-secondary rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] hover:bg-[var(--color-figma-bg-hover)] opacity-70 hover:opacity-100 transition-opacity"
                onClick={fitToView}
                title="Fit to view"
              >
                Fit
              </button>
              <div className="flex items-center rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] overflow-hidden opacity-70 hover:opacity-100 transition-opacity">
                <button
                  className="px-1.5 py-0.5 text-body hover:bg-[var(--color-figma-bg-hover)] leading-none"
                  onClick={() => {
                    setZoom((prev) => {
                      const newZoom = Math.max(MIN_ZOOM, prev / 1.25);
                      // Zoom toward center
                      const { w, h } = containerSizeRef.current;
                      const scale = newZoom / prev;
                      setPan((p) => ({
                        x: w / 2 - (w / 2 - p.x) * scale,
                        y: h / 2 - (h / 2 - p.y) * scale,
                      }));
                      return newZoom;
                    });
                  }}
                  title="Zoom out"
                >
                  −
                </button>
                <span className="text-secondary px-1 min-w-[30px] text-center tabular-nums">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  className="px-1.5 py-0.5 text-body hover:bg-[var(--color-figma-bg-hover)] leading-none"
                  onClick={() => {
                    setZoom((prev) => {
                      const newZoom = Math.min(MAX_ZOOM, prev * 1.25);
                      const { w, h } = containerSizeRef.current;
                      const scale = newZoom / prev;
                      setPan((p) => ({
                        x: w / 2 - (w / 2 - p.x) * scale,
                        y: h / 2 - (h / 2 - p.y) * scale,
                      }));
                      return newZoom;
                    });
                  }}
                  title="Zoom in"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* Legend / actions below graph — outside the pannable area */}
          {selectedPath && (
            <div className="flex-shrink-0 px-3 pb-3 pt-1 border-t border-[var(--color-figma-border)]">
              <div className="flex items-center gap-3 text-secondary opacity-50">
                <span>Scroll to zoom · drag to pan</span>
                <span>·</span>
                <span>
                  {layout.totalSourceCount} reference
                  {layout.totalSourceCount !== 1 ? "s" : ""}
                </span>
                <span>·</span>
                <span>
                  {layout.totalDepCount} dependent
                  {layout.totalDepCount !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-secondary truncate font-medium">
                  {selectedPath}
                </span>
                {pathToCollectionId[selectedPath] && (
                  <span className="text-secondary opacity-40 flex-shrink-0">
                    in {pathToCollectionId[selectedPath]}
                  </span>
                )}
                {onNavigateToToken && (
                  <button
                    className="ml-auto text-secondary text-[var(--color-figma-accent)] hover:underline flex-shrink-0"
                    onClick={() => handleNavigate(selectedPath)}
                  >
                    Go to token →
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
