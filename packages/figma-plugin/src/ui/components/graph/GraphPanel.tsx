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
import { useGraphScope, type GraphFilters } from "../../hooks/useGraphScope";
import { useGraphMutations } from "../../hooks/useGraphMutations";
import { usePersistedJsonState } from "../../hooks/usePersistedState";
import { GraphCanvas } from "./GraphCanvas";
import { GraphToolbar } from "./GraphToolbar";
import { GraphEmptyState } from "./GraphEmptyState";
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
  health: "all",
  generatorType: "all",
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
  // focusNodeId is intentionally NOT persisted — focus is per-session and
  // resets when the user switches collections (per spec §1).
  const [focusNodeId, setFocusNodeId] = useState<GraphNodeId | null>(null);
  const [highlightEdgeId, setHighlightEdgeId] = useState<string | null>(null);
  const [pendingFocusIntent, setPendingFocusIntent] =
    useState<LibraryGraphFocusIntent | null>(() => consumePendingGraphFocus());
  // Persisted scope, keyed by working collection so each collection gets its
  // own remembered filter / search state.
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

  // Reset session-only state when switching working collection. Persisted
  // state (selectedCollectionIds, searchQuery, filters) is keyed by
  // workingCollectionId and rehydrates automatically via usePersistedJsonState.
  useEffect(() => {
    setFocusNodeId(null);
    setHighlightEdgeId(null);
    setExpandedClusterIds(new Set());
  }, [workingCollectionId]);

  // Store external focus intents locally until the scoped graph is ready to
  // represent the target node. This avoids dropping "View in graph" requests
  // during collection switches or transient graph reloads.
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
    setPendingFocusIntent(null);
  }, [fullGraph, pendingFocusIntent]);

  // Validate focus against current graph — a rename or delete can orphan it
  useEffect(() => {
    if (pendingFocusIntent) {
      return;
    }
    if (focusNodeId && !fullGraph.nodes.has(focusNodeId)) {
      setFocusNodeId(null);
      setHighlightEdgeId(null);
    }
  }, [fullGraph, focusNodeId, pendingFocusIntent]);

  useEffect(() => {
    if (highlightEdgeId && !fullGraph.edges.has(highlightEdgeId)) {
      setHighlightEdgeId(null);
    }
  }, [fullGraph, highlightEdgeId]);

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
      searchQuery,
      focusNodeId,
      expandedClusterIds,
    });

  // The graph view is collection-scoped. If the user switches collections and
  // the old focus is no longer represented in this scoped view, drop it so the
  // toolbar and canvas do not drift out of sync.
  useEffect(() => {
    if (pendingFocusIntent) {
      return;
    }
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

  const workingCollection = collections.find((c) => c.id === workingCollectionId);
  const workingLabel = workingCollection?.id ?? workingCollectionId ?? "No collection";

  const focusedPath = useMemo(() => {
    if (!focusNodeId) return null;
    const node = fullGraph.nodes.get(focusNodeId);
    if (!node) return null;
    if (node.kind === "token") return node.path;
    if (node.kind === "generator") return node.name;
    return node.path;
  }, [focusNodeId, fullGraph]);

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

  const clearGraphFocus = () => {
    setFocusNodeId(null);
    setHighlightEdgeId(null);
  };

  const tokenCount = [...collectionScoped.nodes.values()].filter(
    (n) => n.kind === "token",
  ).length;
  const connectionCount = collectionScoped.edges.size;

  if (tokenCount === 0) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <GraphToolbar
          graph={collectionScoped}
          focusedPath={null}
          workingCollectionLabel={workingLabel}
          collections={collections}
          selectedCollectionIds={activeCollectionIds}
          filters={filters}
          searchQuery={searchQuery}
          onSelectedCollectionIdsChange={handleSelectedCollectionIdsChange}
          onFiltersChange={handleFiltersChange}
          onSearchQueryChange={handleSearchQueryChange}
          onClearFocus={clearGraphFocus}
          onResetView={() => setResetViewToken((t) => t + 1)}
          ref={searchInputRef}
        />
        <div className="flex-1">
          <GraphEmptyState
            kind="no-tokens"
            onAddToken={() => {
              onCreateToken(workingCollectionId);
            }}
          />
        </div>
      </div>
    );
  }

  if (connectionCount === 0) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <GraphToolbar
          graph={collectionScoped}
          focusedPath={null}
          workingCollectionLabel={workingLabel}
          collections={collections}
          selectedCollectionIds={activeCollectionIds}
          filters={filters}
          searchQuery={searchQuery}
          onSelectedCollectionIdsChange={handleSelectedCollectionIdsChange}
          onFiltersChange={handleFiltersChange}
          onSearchQueryChange={handleSearchQueryChange}
          onClearFocus={clearGraphFocus}
          onResetView={() => setResetViewToken((t) => t + 1)}
          ref={searchInputRef}
        />
        <div className="flex-1">
          <GraphEmptyState
            kind="no-connections"
            onAddGenerator={() =>
              onOpenGeneratedGroupEditor({
                mode: "create",
                origin: "graph",
              })
            }
          />
        </div>
      </div>
    );
  }

  if (!hasSearchMatches) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <GraphToolbar
          graph={collectionScoped}
          focusedPath={focusedPath}
          workingCollectionLabel={workingLabel}
          collections={collections}
          selectedCollectionIds={activeCollectionIds}
          filters={filters}
          searchQuery={searchQuery}
          onSelectedCollectionIdsChange={handleSelectedCollectionIdsChange}
          onFiltersChange={handleFiltersChange}
          onSearchQueryChange={handleSearchQueryChange}
          onClearFocus={clearGraphFocus}
          onResetView={() => setResetViewToken((t) => t + 1)}
          ref={searchInputRef}
        />
        <div className="flex-1">
          <GraphEmptyState
            kind="scope-empty"
            onClearSearch={() => handleSearchQueryChange("")}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <GraphToolbar
        graph={collectionScoped}
        focusedPath={focusedPath}
        workingCollectionLabel={workingLabel}
        collections={collections}
        selectedCollectionIds={activeCollectionIds}
        filters={filters}
        searchQuery={searchQuery}
        onSelectedCollectionIdsChange={handleSelectedCollectionIdsChange}
        onFiltersChange={handleFiltersChange}
        onSearchQueryChange={handleSearchQueryChange}
        onClearFocus={clearGraphFocus}
        onResetView={() => setResetViewToken((t) => t + 1)}
      />
      <div className="relative flex-1">
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
            onNavigateToToken(path, collectionId);
          }}
          onSelectGenerator={(generatorId) => {
            setFocusNodeId(generatorNodeId(generatorId));
            onOpenGeneratedGroupEditor({
              mode: "edit",
              id: generatorId,
              origin: "graph",
            });
          }}
          onFocusNode={(nodeId) => setFocusNodeId(nodeId)}
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
          editingEnabled
          resetViewToken={resetViewToken}
        />
        <GraphSROutline graph={searchGraph} focusNodeId={focusNodeId} />
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
