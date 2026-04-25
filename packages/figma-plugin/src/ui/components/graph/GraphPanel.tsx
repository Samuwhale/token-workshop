import { useEffect, useMemo, useState } from "react";
import type {
  GraphNodeId,
  GraphValidationIssue,
  TokenCollection,
  TokenGenerator,
} from "@tokenmanager/core";
import { tokenNodeId, generatorNodeId } from "@tokenmanager/core";
import type { TokenMapEntry } from "../../../shared/types";
import type { TokensLibraryGeneratedGroupEditorTarget } from "../../shared/navigationTypes";
import { useGraphData } from "../../hooks/useGraphData";
import { useGraphMutations } from "../../hooks/useGraphMutations";
import { usePersistedJsonState } from "../../hooks/usePersistedState";
import { useGraphRecents } from "../../hooks/useGraphRecents";
import { useIssuesGroups } from "../../hooks/useIssuesGroups";
import type { GraphHopDepth } from "../../hooks/useFocusedSubgraph";
import { GraphCanvas, type GraphMode } from "./GraphCanvas";
import { GraphInspector } from "./GraphInspector";
import { GraphSROutline } from "./GraphSROutline";
import { GraphToolbar } from "./GraphToolbar";
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
  onCompareTokens?: (
    a: { path: string; collectionId: string },
    b: { path: string; collectionId: string },
  ) => void;
  onOpenGeneratedGroupEditor: (
    target: TokensLibraryGeneratedGroupEditorTarget,
  ) => void;
}

interface GraphState {
  mode: GraphMode;
  focusId: GraphNodeId | null;
  hopDepth: GraphHopDepth;
  scopeCollectionIds: string[];
}

function defaultGraphState(workingCollectionId: string): GraphState {
  return {
    mode: "focus",
    focusId: null,
    hopDepth: 1,
    scopeCollectionIds: [workingCollectionId].filter(Boolean),
  };
}

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
  onCompareTokens,
  onOpenGeneratedGroupEditor,
}: GraphPanelProps) {
  const persistKeySuffix = workingCollectionId || "default";
  const [graphState, setGraphState] = usePersistedJsonState<GraphState>(
    `graph:state:${persistKeySuffix}`,
    defaultGraphState(workingCollectionId),
  );
  const { mode, focusId, hopDepth, scopeCollectionIds } = graphState;

  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [pendingFocusIntent, setPendingFocusIntent] =
    useState<LibraryGraphFocusIntent | null>(() => consumePendingGraphFocus());

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
    setSelectedEdgeId(null);
  }, [workingCollectionId]);

  useEffect(() => {
    return subscribeGraphFocusIntent(() => {
      setPendingFocusIntent(consumePendingGraphFocus());
    });
  }, []);

  useEffect(() => {
    if (!pendingFocusIntent) return;

    const targetNodeId = resolveFocusIntentNodeId(pendingFocusIntent);
    const targetNode = fullGraph.nodes.get(targetNodeId);
    if (!targetNode) {
      // Wait for the graph to populate; bail once we know the lookup will keep
      // failing rather than spin on an unresolvable intent forever.
      if (fullGraph.nodes.size > 0) setPendingFocusIntent(null);
      return;
    }

    const targetCollectionId =
      targetNode.kind === "token"
        ? targetNode.collectionId
        : targetNode.kind === "generator"
          ? targetNode.targetCollection
          : targetNode.collectionId;

    setGraphState((current) => {
      const nextScope =
        targetCollectionId && !current.scopeCollectionIds.includes(targetCollectionId)
          ? [targetCollectionId]
          : current.scopeCollectionIds;
      return {
        ...current,
        mode: "focus",
        focusId: targetNodeId,
        scopeCollectionIds: nextScope,
      };
    });
    setSelectedEdgeId(null);
    setPendingFocusIntent(null);
  }, [fullGraph, pendingFocusIntent, setGraphState]);

  useEffect(() => {
    if (pendingFocusIntent) return;
    // Wait for the graph to populate before deciding the focus is stale —
    // otherwise a persisted focusId gets nulled the moment GraphPanel mounts
    // because fullGraph.nodes is empty during the initial data fetch.
    if (fullGraph.nodes.size === 0) return;
    if (focusId && !fullGraph.nodes.has(focusId)) {
      setGraphState((current) => ({ ...current, focusId: null }));
    }
  }, [fullGraph, focusId, pendingFocusIntent, setGraphState]);

  useEffect(() => {
    if (fullGraph.nodes.size === 0) return;
    if (selectedEdgeId && !fullGraph.edges.has(selectedEdgeId)) {
      setSelectedEdgeId(null);
    }
  }, [fullGraph, selectedEdgeId]);

  const activeCollectionIds = useMemo(() => {
    const known = new Set(collections.map((collection) => collection.id));
    const selected = scopeCollectionIds.filter((collectionId) =>
      known.has(collectionId),
    );
    return selected.length > 0 ? selected : [workingCollectionId].filter(Boolean);
  }, [collections, scopeCollectionIds, workingCollectionId]);

  const collectionModeCountById = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of collections) map.set(c.id, c.modes.length);
    return map;
  }, [collections]);

  const setMode = (next: GraphMode) =>
    setGraphState((current) => ({ ...current, mode: next }));
  const setHopDepth = (next: GraphHopDepth) =>
    setGraphState((current) => ({ ...current, hopDepth: next }));
  const setFocusId = (next: GraphNodeId | null) =>
    setGraphState((current) => ({ ...current, focusId: next }));
  const setScopeCollectionIds = (next: string[]) =>
    setGraphState((current) => ({ ...current, scopeCollectionIds: next }));

  const handleSelectIssue = (primaryNodeId: GraphNodeId) => {
    setGraphState((current) => ({
      ...current,
      mode: "focus",
      focusId: primaryNodeId,
    }));
    setSelectedEdgeId(null);
  };

  useGraphRecents(fullGraph, focusId);

  const issueGroups = useIssuesGroups(fullGraph, activeCollectionIds);
  const issuesCount = useMemo(
    () => issueGroups.reduce((n, g) => n + g.entries.length, 0),
    [issueGroups],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--color-figma-bg)]">
      <GraphToolbar
        mode={mode}
        focusId={focusId}
        hopDepth={hopDepth}
        scopeCollectionIds={activeCollectionIds}
        collections={collections}
        fullGraph={fullGraph}
        issuesCount={issuesCount}
        onModeChange={setMode}
        onFocusChange={(nodeId) => {
          setFocusId(nodeId);
          setSelectedEdgeId(null);
        }}
        onHopDepthChange={setHopDepth}
        onScopeChange={setScopeCollectionIds}
      />
      <div className="flex min-h-0 flex-1">
        <div className="relative min-h-0 min-w-0 flex-1">
          <GraphCanvas
            mode={mode}
            fullGraph={fullGraph}
            focusId={focusId}
            hopDepth={hopDepth}
            scopeCollectionIds={activeCollectionIds}
            collections={collections}
            collectionModeCountById={collectionModeCountById}
            selectedEdgeId={selectedEdgeId}
            onSelectToken={(path, collectionId) => {
              setFocusId(tokenNodeId(collectionId, path));
              setSelectedEdgeId(null);
            }}
            onSelectGenerator={(generatorId) => {
              setFocusId(generatorNodeId(generatorId));
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
              setFocusId(nodeId);
              setSelectedEdgeId(null);
            }}
            onSelectIssue={handleSelectIssue}
            onShowIssues={() => setMode("issues")}
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
            onSelectEdge={setSelectedEdgeId}
            editingEnabled
          />
          <GraphSROutline graph={fullGraph} focusNodeId={focusId} />
        </div>
        {focusId || selectedEdgeId ? (
          <div className="hidden w-[280px] shrink-0 border-l border-[var(--color-figma-border)] sm:block">
            <GraphInspector
              graph={fullGraph}
              focusId={focusId}
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
                setFocusId(nodeId);
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

