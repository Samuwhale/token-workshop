import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  GraphModel,
  GraphNodeId,
  GraphValidationIssue,
  TokenCollection,
  TokenGenerator,
} from "@tokenmanager/core";
import { tokenNodeId, generatorNodeId } from "@tokenmanager/core";
import type { TokenMapEntry } from "../../../shared/types";
import type { TokensLibraryGeneratedGroupEditorTarget } from "../../shared/navigationTypes";
import { useGraphData } from "../../hooks/useGraphData";
import {
  useGraphScope,
  type GraphFilters,
  type GraphView,
} from "../../hooks/useGraphScope";
import { useGraphMutations } from "../../hooks/useGraphMutations";
import { usePersistedJsonState } from "../../hooks/usePersistedState";
import { GraphCanvas } from "./GraphCanvas";
import { GraphToolbar } from "./GraphToolbar";
import { GraphInspector } from "./GraphInspector";
import { GraphSROutline } from "./GraphSROutline";
import { RewireConfirm } from "./interactions/RewireConfirm";
import { DetachConfirm } from "./interactions/DetachConfirm";
import {
  consumePendingGraphFocus,
  subscribeGraphFocusIntent,
  type LibraryGraphFocusIntent,
} from "../../shared/graphFocusIntent";

interface GraphPanelProps {
  collections: TokenCollection[];
  workingCollectionId: string;
  generators: TokenGenerator[];
  derivedTokenPaths: Map<string, TokenGenerator>;
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>;
  pathToCollectionId: Record<string, string>;
  collectionIdsByPath: Record<string, string[]>;
  validationIssues?: GraphValidationIssue[];
  onNavigateToToken: (path: string, collectionId: string) => void;
  onCreateToken: (collectionId: string) => void;
  onCompareTokens?: (
    a: { path: string; collectionId: string },
    b: { path: string; collectionId: string },
  ) => void;
  onOpenGeneratedGroupEditor: (
    target: TokensLibraryGeneratedGroupEditorTarget,
  ) => void;
}

const DEFAULT_GRAPH_FILTERS: GraphFilters = {
  tokenType: "all",
};

function resolveFocusIntentNodeId(
  intent: LibraryGraphFocusIntent,
): GraphNodeId {
  if (intent.kind === "token") {
    return tokenNodeId(intent.collectionId, intent.path);
  }
  if (intent.kind === "generator") {
    return generatorNodeId(intent.generatorId);
  }
  return intent.nodeId;
}

function resolveIntentHighlightEdgeId(
  graph: GraphModel,
  targetNodeId: GraphNodeId,
  intent: LibraryGraphFocusIntent,
): string | null {
  const direct =
    "highlightEdgeId" in intent ? intent.highlightEdgeId : undefined;
  if (direct && graph.edges.has(direct)) {
    return direct;
  }
  if (intent.kind !== "token" || !intent.issue) {
    return null;
  }
  const { issue } = intent;
  if (issue.rule === "broken-alias" && issue.targetPath) {
    for (const edge of graph.edges.values()) {
      if (edge.kind !== "alias" || edge.to !== targetNodeId) continue;
      const upstream = graph.nodes.get(edge.from);
      if (
        (upstream?.kind === "token" || upstream?.kind === "ghost") &&
        upstream.path === issue.targetPath
      ) {
        return edge.id;
      }
    }
  }
  if (issue.rule === "circular-reference") {
    const incident = [
      ...(graph.incoming.get(targetNodeId) ?? []),
      ...(graph.outgoing.get(targetNodeId) ?? []),
    ];
    return (
      incident.find((edgeId) => {
        const edge = graph.edges.get(edgeId);
        return edge?.kind === "alias" && edge.inCycle;
      }) ?? null
    );
  }
  return null;
}

export function GraphPanel({
  collections,
  workingCollectionId,
  generators,
  derivedTokenPaths,
  perCollectionFlat,
  pathToCollectionId,
  collectionIdsByPath,
  validationIssues,
  onNavigateToToken,
  onCreateToken,
  onCompareTokens,
  onOpenGeneratedGroupEditor,
}: GraphPanelProps) {
  // focusNodeId is the inspector selection AND the spatial focus subject —
  // intentionally NOT persisted. Resets when the working collection changes.
  const [focusNodeId, setFocusNodeId] = useState<GraphNodeId | null>(null);
  const [highlightEdgeId, setHighlightEdgeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [pendingFocusIntent, setPendingFocusIntent] =
    useState<LibraryGraphFocusIntent | null>(() => consumePendingGraphFocus());
  const persistKeySuffix = workingCollectionId || "default";
  const [searchQuery, setSearchQuery] = usePersistedJsonState<string>(
    `graph:search:${persistKeySuffix}`,
    "",
  );
  const [selectedCollectionIds, setSelectedCollectionIds] =
    usePersistedJsonState<string[]>(
      `graph:collections:${persistKeySuffix}`,
      [workingCollectionId].filter(Boolean),
    );
  const [filters, setFilters] = usePersistedJsonState<GraphFilters>(
    `graph:filters:${persistKeySuffix}`,
    DEFAULT_GRAPH_FILTERS,
  );
  const [view, setView] = usePersistedJsonState<GraphView>(
    `graph:view:${persistKeySuffix}`,
    "all",
  );
  const [expandedClusterIds, setExpandedClusterIds] = useState<
    Set<GraphNodeId>
  >(() => new Set());
  const [resetViewToken, setResetViewToken] = useState(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const handleFocusSearch = useCallback(() => {
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  }, []);

  const { rewire, detach, deleteToken } = useGraphMutations();

  const [rewireRequest, setRewireRequest] = useState<{
    sourceNodeId: GraphNodeId;
    targetNodeId: GraphNodeId;
    screenX: number;
    screenY: number;
    error?: string;
    busy?: boolean;
  } | null>(null);
  const [detachRequest, setDetachRequest] = useState<{
    edgeId: string;
    screenX: number;
    screenY: number;
    error?: string;
    busy?: boolean;
  } | null>(null);

  const fullGraph = useGraphData({
    collections,
    perCollectionFlat,
    pathToCollectionId,
    collectionIdsByPath,
    generators,
    derivedTokenPaths,
    validationIssues,
  });

  useEffect(() => {
    setFocusNodeId(null);
    setHighlightEdgeId(null);
    setSelectedEdgeId(null);
    setExpandedClusterIds(new Set());
  }, [workingCollectionId]);

  useEffect(() => {
    return subscribeGraphFocusIntent(() => {
      setPendingFocusIntent(consumePendingGraphFocus());
    });
  }, []);

  useEffect(() => {
    if (!pendingFocusIntent) {
      return;
    }

    const targetNodeId = resolveFocusIntentNodeId(pendingFocusIntent);
    const targetNode = fullGraph.nodes.get(targetNodeId);
    if (!targetNode) {
      if (fullGraph.nodes.size > 0) {
        setPendingFocusIntent(null);
      }
      return;
    }

    const targetCollectionId =
      targetNode.kind === "token"
        ? targetNode.collectionId
        : targetNode.kind === "generator"
          ? targetNode.targetCollection
          : targetNode.collectionId;
    if (targetCollectionId) {
      setSelectedCollectionIds((current) =>
        current.includes(targetCollectionId) ? current : [targetCollectionId],
      );
      setExpandedClusterIds(new Set());
    }
    setFocusNodeId(targetNodeId);
    setHighlightEdgeId(
      resolveIntentHighlightEdgeId(fullGraph, targetNodeId, pendingFocusIntent),
    );
    setSelectedEdgeId(null);
    setPendingFocusIntent(null);
  }, [fullGraph, pendingFocusIntent]);

  useEffect(() => {
    if (pendingFocusIntent) return;
    if (focusNodeId && !fullGraph.nodes.has(focusNodeId)) {
      setFocusNodeId(null);
      setHighlightEdgeId(null);
    }
  }, [fullGraph, focusNodeId, pendingFocusIntent]);

  useEffect(() => {
    if (highlightEdgeId && !fullGraph.edges.has(highlightEdgeId)) {
      setHighlightEdgeId(null);
    }
    if (selectedEdgeId && !fullGraph.edges.has(selectedEdgeId)) {
      setSelectedEdgeId(null);
    }
  }, [fullGraph, highlightEdgeId, selectedEdgeId]);

  const activeCollectionIds = useMemo(() => {
    const known = new Set(collections.map((collection) => collection.id));
    const selected = selectedCollectionIds.filter((collectionId) =>
      known.has(collectionId),
    );
    return selected.length > 0 ? selected : [workingCollectionId].filter(Boolean);
  }, [collections, selectedCollectionIds, workingCollectionId]);

  const { collectionScoped, displayGraph, searchGraph, hasSearchMatches } =
    useGraphScope({
      fullGraph,
      selectedCollectionIds: activeCollectionIds,
      filters,
      view,
      searchQuery,
      focusNodeId,
      expandedClusterIds,
    });

  useEffect(() => {
    if (pendingFocusIntent) return;
    if (focusNodeId && !collectionScoped.nodes.has(focusNodeId)) {
      setFocusNodeId(null);
      setHighlightEdgeId(null);
    }
  }, [collectionScoped, focusNodeId, pendingFocusIntent]);

  const collectionModeCountById = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of collections) map.set(c.id, c.modes.length);
    return map;
  }, [collections]);

  const handleSelectedCollectionIdsChange = (next: string[]) => {
    setSelectedCollectionIds(next);
    setExpandedClusterIds(new Set());
  };

  const handleFiltersChange = (next: GraphFilters) => {
    setFilters(next);
    setExpandedClusterIds(new Set());
  };

  const handleSearchQueryChange = (next: string) => {
    setSearchQuery(next);
    setExpandedClusterIds(new Set());
  };

  const handleViewChange = (next: GraphView) => {
    setView(next);
    setExpandedClusterIds(new Set());
  };

  const clearGraphFocus = () => {
    setFocusNodeId(null);
    setHighlightEdgeId(null);
    setSelectedEdgeId(null);
  };

  const tokenCount = [...collectionScoped.nodes.values()].filter(
    (n) => n.kind === "token",
  ).length;
  const connectionCount = collectionScoped.edges.size;
  const visibleTokenCount = [...displayGraph.nodes.values()].filter(
    (n) => n.kind === "token",
  ).length;
  const visibleClusterCount = [...displayGraph.nodes.values()].filter(
    (n) => n.kind === "cluster",
  ).length;

  const overlay = resolveOverlay({
    tokenCount,
    connectionCount,
    hasSearchMatches,
    visibleTokenCount,
    visibleClusterCount,
    view,
  });

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--color-figma-bg)]">
      <GraphToolbar
        graph={collectionScoped}
        collections={collections}
        selectedCollectionIds={activeCollectionIds}
        filters={filters}
        searchQuery={searchQuery}
        view={view}
        hasFocus={Boolean(focusNodeId)}
        onSelectedCollectionIdsChange={handleSelectedCollectionIdsChange}
        onFiltersChange={handleFiltersChange}
        onSearchQueryChange={handleSearchQueryChange}
        onViewChange={handleViewChange}
        onClearFocus={clearGraphFocus}
        onResetView={() => setResetViewToken((t) => t + 1)}
        ref={searchInputRef}
      />
      <div className="flex min-h-0 flex-1">
        <div className="relative min-h-0 min-w-0 flex-1">
          {overlay ? null : (
            <GraphCanvas
              graph={displayGraph}
              interactionGraph={fullGraph}
              collectionModeCountById={collectionModeCountById}
              focusNodeId={focusNodeId}
              highlightEdgeId={highlightEdgeId}
              selectedCollectionIds={activeCollectionIds}
              onSelectToken={(path, collectionId) => {
                const targetId = tokenNodeId(collectionId, path);
                setFocusNodeId(targetId);
                setSelectedEdgeId(null);
              }}
              onSelectGenerator={(generatorId) => {
                setFocusNodeId(generatorNodeId(generatorId));
                setSelectedEdgeId(null);
              }}
              onActivateToken={(path, collectionId) => {
                onNavigateToToken(path, collectionId);
              }}
              onActivateGenerator={(generatorId) =>
                onOpenGeneratedGroupEditor({
                  mode: "edit",
                  id: generatorId,
                  origin: "graph",
                })
              }
              onFocusNode={(nodeId) => {
                setFocusNodeId(nodeId);
                setSelectedEdgeId(null);
              }}
              onExpandCluster={(clusterId) => {
                setExpandedClusterIds((current) => {
                  if (current.has(clusterId)) return current;
                  const next = new Set(current);
                  next.add(clusterId);
                  return next;
                });
              }}
              onRequestDeleteToken={(path, collectionId) => {
                deleteToken(path, collectionId);
              }}
              onRequestRewire={({ sourceNodeId, targetNodeId, screenX, screenY }) => {
                setRewireRequest({
                  sourceNodeId,
                  targetNodeId,
                  screenX,
                  screenY,
                });
              }}
              onRequestDetach={({ edgeId, screenX, screenY }) => {
                setDetachRequest({ edgeId, screenX, screenY });
              }}
              onCompareTokens={onCompareTokens}
              onFocusSearch={handleFocusSearch}
              onSelectEdge={(edgeId) => {
                setSelectedEdgeId(edgeId);
                if (edgeId) setFocusNodeId(null);
              }}
              editingEnabled
              resetViewToken={resetViewToken}
            />
          )}
          {overlay ? (
            <GraphCanvasOverlay
              kind={overlay}
              view={view}
              onAddToken={() => onCreateToken(workingCollectionId)}
              onAddGenerator={() =>
                onOpenGeneratedGroupEditor({ mode: "create", origin: "graph" })
              }
              onClearSearch={() => handleSearchQueryChange("")}
              onShowAll={() => handleViewChange("all")}
            />
          ) : null}
          <GraphSROutline graph={searchGraph} focusNodeId={focusNodeId} />
        </div>
        {focusNodeId || selectedEdgeId ? (
          <div className="hidden w-[280px] shrink-0 border-l border-[var(--color-figma-border)] sm:block">
            <GraphInspector
              graph={fullGraph}
              selectedNodeId={focusNodeId}
              selectedEdgeId={selectedEdgeId}
              collections={collections}
              perCollectionFlat={perCollectionFlat}
              onNavigateToToken={onNavigateToToken}
              onEditGenerator={(generatorId) =>
                onOpenGeneratedGroupEditor({
                  mode: "edit",
                  id: generatorId,
                  origin: "graph",
                })
              }
              onCompareTokens={onCompareTokens}
              onSelectNode={(nodeId) => {
                setFocusNodeId(nodeId);
                setSelectedEdgeId(null);
              }}
              onSelectEdge={(edgeId) => setSelectedEdgeId(edgeId)}
            />
          </div>
        ) : null}
      </div>
      {rewireRequest
        ? (() => {
            const sourceNode = fullGraph.nodes.get(rewireRequest.sourceNodeId);
            const targetNode = fullGraph.nodes.get(rewireRequest.targetNodeId);
            if (
              !sourceNode ||
              !targetNode ||
              sourceNode.kind !== "token" ||
              targetNode.kind !== "token"
            ) {
              return null;
            }
            const ownerCollection = collections.find(
              (c) => c.id === sourceNode.collectionId,
            );
            const modeNames = ownerCollection?.modes.map((m) => m.name) ?? [];
            return (
              <RewireConfirm
                x={rewireRequest.screenX}
                y={rewireRequest.screenY}
                sourcePath={sourceNode.path}
                targetPath={targetNode.path}
                modeNames={modeNames}
                busy={rewireRequest.busy}
                errorMessage={rewireRequest.error}
                onCancel={() => setRewireRequest(null)}
                onConfirm={async (selectedModes) => {
                  setRewireRequest((current) =>
                    current ? { ...current, busy: true, error: undefined } : current,
                  );
                  const result = await rewire({
                    tokenPath: sourceNode.path,
                    tokenCollectionId: sourceNode.collectionId,
                    targetPath: targetNode.path,
                    targetCollectionId: targetNode.collectionId,
                    modeNames: selectedModes,
                  });
                  if (result.ok) {
                    setRewireRequest(null);
                  } else {
                    setRewireRequest((current) =>
                      current
                        ? { ...current, busy: false, error: result.error }
                        : current,
                    );
                  }
                }}
              />
            );
          })()
        : null}
      {detachRequest
        ? (() => {
            const edge = fullGraph.edges.get(detachRequest.edgeId);
            if (!edge || edge.kind !== "alias") return null;
            const downstream = fullGraph.nodes.get(edge.to);
            if (!downstream || downstream.kind !== "token") return null;
            return (
              <DetachConfirm
                x={detachRequest.screenX}
                y={detachRequest.screenY}
                tokenPath={downstream.path}
                tokenCollectionId={downstream.collectionId}
                edgeModeNames={edge.modeNames}
                collections={collections}
                perCollectionFlat={perCollectionFlat}
                pathToCollectionId={pathToCollectionId}
                collectionIdsByPath={collectionIdsByPath}
                busy={detachRequest.busy}
                errorMessage={detachRequest.error}
                onCancel={() => setDetachRequest(null)}
                onConfirm={async (modeLiterals) => {
                  setDetachRequest((current) =>
                    current ? { ...current, busy: true, error: undefined } : current,
                  );
                  const result = await detach({
                    tokenPath: downstream.path,
                    tokenCollectionId: downstream.collectionId,
                    modeLiterals,
                  });
                  if (result.ok) {
                    setDetachRequest(null);
                  } else {
                    setDetachRequest((current) =>
                      current
                        ? { ...current, busy: false, error: result.error }
                        : current,
                    );
                  }
                }}
              />
            );
          })()
        : null}
    </div>
  );
}

type CanvasOverlayKind =
  | "no-tokens"
  | "no-connections"
  | "scope-empty"
  | "view-empty";

function resolveOverlay({
  tokenCount,
  connectionCount,
  hasSearchMatches,
  visibleTokenCount,
  visibleClusterCount,
  view,
}: {
  tokenCount: number;
  connectionCount: number;
  hasSearchMatches: boolean;
  visibleTokenCount: number;
  visibleClusterCount: number;
  view: GraphView;
}): CanvasOverlayKind | null {
  if (tokenCount === 0) return "no-tokens";
  if (connectionCount === 0) return "no-connections";
  if (!hasSearchMatches) return "scope-empty";
  if (
    view !== "all" &&
    visibleTokenCount === 0 &&
    visibleClusterCount === 0
  ) {
    return "view-empty";
  }
  return null;
}

function GraphCanvasOverlay({
  kind,
  view,
  onAddToken,
  onAddGenerator,
  onClearSearch,
  onShowAll,
}: {
  kind: CanvasOverlayKind;
  view: GraphView;
  onAddToken: () => void;
  onAddGenerator: () => void;
  onClearSearch: () => void;
  onShowAll: () => void;
}) {
  const dotted = (
    <div
      className="absolute inset-0"
      style={{
        backgroundColor: "var(--color-figma-bg)",
        backgroundImage:
          "radial-gradient(var(--color-figma-border) 1px, transparent 1px)",
        backgroundSize: "20px 20px",
      }}
      aria-hidden
    />
  );

  let title = "";
  let description = "";
  let primary: { label: string; onClick: () => void } | null = null;
  let secondary: { label: string; onClick: () => void } | null = null;

  if (kind === "no-tokens") {
    title = "No tokens in this collection yet";
    description = "Add a token to start building dependencies.";
    primary = { label: "Add token", onClick: onAddToken };
  } else if (kind === "no-connections") {
    title = "Nothing aliased or generated here";
    description = "Add a generator or alias tokens to draw connections.";
    primary = { label: "Add generator", onClick: onAddGenerator };
  } else if (kind === "view-empty") {
    if (view === "issues") {
      title = "No issues in this scope";
      description = "Aliases resolve cleanly and no cycles were detected.";
    } else {
      title = "No generators in this scope";
      description = "Generators show up here once they're added.";
      primary = { label: "Add generator", onClick: onAddGenerator };
    }
    secondary = { label: "Show all", onClick: onShowAll };
  } else {
    title = "No matches in this scope";
    description = "Adjust your search to keep working in the graph.";
    secondary = { label: "Clear search", onClick: onClearSearch };
  }

  return (
    <div className="absolute inset-0">
      {dotted}
      <div className="pointer-events-none absolute inset-0 flex items-start justify-start p-6">
        <div className="pointer-events-auto flex max-w-[320px] flex-col gap-1 text-secondary">
          <div className="font-medium text-[var(--color-figma-text)]">
            {title}
          </div>
          <div className="text-[var(--color-figma-text-secondary)]">
            {description}
          </div>
          {primary || secondary ? (
            <div className="mt-2 flex items-center gap-2">
              {primary ? (
                <button
                  type="button"
                  onClick={primary.onClick}
                  className="rounded bg-[var(--color-figma-accent)] px-2.5 py-1 font-medium text-white transition-colors hover:bg-[var(--color-figma-accent-hover)]"
                >
                  {primary.label}
                </button>
              ) : null}
              {secondary ? (
                <button
                  type="button"
                  onClick={secondary.onClick}
                  className="rounded px-2.5 py-1 text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
                >
                  {secondary.label}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
