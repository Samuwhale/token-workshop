import type {
  GraphModel,
  GraphNodeId,
} from "@tokenmanager/core";
import type { GraphHopDepthSetting } from "../../hooks/useFocusedSubgraph";
import { FocusCanvas } from "./FocusCanvas";
import { GraphFocusEmpty } from "./GraphFocusEmpty";

interface GraphCanvasProps {
  fullGraph: GraphModel;
  focusId: GraphNodeId | null;
  hopDepth: GraphHopDepthSetting;
  scopeCollectionIds: string[];
  collectionModeCountById: Map<string, number>;
  selectedEdgeId: string | null;
  onSelectToken: (path: string, collectionId: string) => void;
  onSelectGenerator: (generatorId: string) => void;
  onActivateToken: (path: string, collectionId: string) => void;
  onActivateGenerator: (generatorId: string) => void;
  onFocusNode: (nodeId: GraphNodeId) => void;
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
  onSelectEdge: (edgeId: string | null) => void;
  onSelectionChange?: (selectedNodeIds: GraphNodeId[]) => void;
  onExpandMoreHops?: () => void;
  onClearFocus?: () => void;
  onRequestCreateAliasToken?: (params: {
    sourceNodeId: GraphNodeId;
    screenX: number;
    screenY: number;
  }) => void;
  onRequestCreateFromSource?: (params: {
    sourceNodeId: GraphNodeId;
    screenX: number;
    screenY: number;
  }) => void;
  onRequestCreateDerivationToken?: (params: {
    sourceNodeId: GraphNodeId;
    screenX: number;
    screenY: number;
  }) => void;
  editingEnabled?: boolean;
}

export function GraphCanvas({
  fullGraph,
  focusId,
  hopDepth,
  scopeCollectionIds,
  collectionModeCountById,
  selectedEdgeId,
  onSelectToken,
  onSelectGenerator,
  onActivateToken,
  onActivateGenerator,
  onFocusNode,
  onRequestDeleteToken,
  onRequestRewire,
  onRequestDetach,
  onSelectEdge,
  onSelectionChange,
  onExpandMoreHops,
  onClearFocus,
  onRequestCreateAliasToken,
  onRequestCreateFromSource,
  onRequestCreateDerivationToken,
  editingEnabled,
}: GraphCanvasProps) {
  if (focusId === null) {
    return (
      <GraphFocusEmpty
        fullGraph={fullGraph}
        scopeCollectionIds={scopeCollectionIds}
        onSelectFocus={onFocusNode}
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
      onSelectEdge={onSelectEdge}
      onSelectionChange={onSelectionChange}
      onExpandMoreHops={onExpandMoreHops}
      onClearFocus={onClearFocus}
      onRequestCreateAliasToken={onRequestCreateAliasToken}
      onRequestCreateFromSource={onRequestCreateFromSource}
      onRequestCreateDerivationToken={onRequestCreateDerivationToken}
      editingEnabled={editingEnabled}
    />
  );
}
