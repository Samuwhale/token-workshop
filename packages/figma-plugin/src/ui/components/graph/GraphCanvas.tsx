import type {
  GraphModel,
  GraphNodeId,
  TokenCollection,
} from "@tokenmanager/core";
import type { GraphHopDepth } from "../../hooks/useFocusedSubgraph";
import { FocusCanvas } from "./FocusCanvas";
import { GraphFocusEmpty } from "./GraphFocusEmpty";
import { GraphIssuesList } from "./GraphIssuesList";

export type GraphMode = "focus" | "issues";

interface GraphCanvasProps {
  mode: GraphMode;
  fullGraph: GraphModel;
  focusId: GraphNodeId | null;
  hopDepth: GraphHopDepth;
  scopeCollectionIds: string[];
  collections: TokenCollection[];
  collectionModeCountById: Map<string, number>;
  selectedEdgeId: string | null;
  onSelectToken: (path: string, collectionId: string) => void;
  onSelectGenerator: (generatorId: string) => void;
  onActivateToken: (path: string, collectionId: string) => void;
  onActivateGenerator: (generatorId: string) => void;
  onFocusNode: (nodeId: GraphNodeId) => void;
  onSelectIssue: (primaryNodeId: GraphNodeId) => void;
  onShowIssues: () => void;
  onRequestDeleteToken?: (path: string, collectionId: string) => void;
  onRequestRewire?: (params: {
    sourceNodeId: GraphNodeId;
    targetNodeId: GraphNodeId;
    screenX: number;
    screenY: number;
  }) => void;
  onRequestDetach?: (params: {
    edgeId: string;
    screenX: number;
    screenY: number;
  }) => void;
  onCompareTokens?: (
    a: { path: string; collectionId: string },
    b: { path: string; collectionId: string },
  ) => void;
  onSelectEdge: (edgeId: string | null) => void;
  editingEnabled?: boolean;
}

export function GraphCanvas({
  mode,
  fullGraph,
  focusId,
  hopDepth,
  scopeCollectionIds,
  collections,
  collectionModeCountById,
  selectedEdgeId,
  onSelectToken,
  onSelectGenerator,
  onActivateToken,
  onActivateGenerator,
  onFocusNode,
  onSelectIssue,
  onShowIssues,
  onRequestDeleteToken,
  onRequestRewire,
  onRequestDetach,
  onCompareTokens,
  onSelectEdge,
  editingEnabled,
}: GraphCanvasProps) {
  if (mode === "issues") {
    return (
      <GraphIssuesList
        fullGraph={fullGraph}
        scopeCollectionIds={scopeCollectionIds}
        collections={collections}
        onOpenInFocus={onSelectIssue}
        onRequestDetach={onRequestDetach}
      />
    );
  }
  if (focusId === null) {
    return (
      <GraphFocusEmpty
        fullGraph={fullGraph}
        scopeCollectionIds={scopeCollectionIds}
        onSelectFocus={onFocusNode}
        onShowIssues={onShowIssues}
      />
    );
  }
  return (
    <FocusCanvas
      fullGraph={fullGraph}
      focusId={focusId}
      hopDepth={hopDepth}
      scopeCollectionIds={scopeCollectionIds}
      collectionModeCountById={collectionModeCountById}
      selectedEdgeId={selectedEdgeId}
      onSelectToken={onSelectToken}
      onSelectGenerator={onSelectGenerator}
      onActivateToken={onActivateToken}
      onActivateGenerator={onActivateGenerator}
      onFocusNode={onFocusNode}
      onRequestDeleteToken={onRequestDeleteToken}
      onRequestRewire={onRequestRewire}
      onRequestDetach={onRequestDetach}
      onCompareTokens={onCompareTokens}
      onSelectEdge={onSelectEdge}
      editingEnabled={editingEnabled}
    />
  );
}
