import { useMemo } from "react";
import type { TokenNode } from "../../hooks/useTokens";
import type {
  NodeCapabilities,
  TokenMapEntry,
  SelectionNodeInfo,
} from "../../../shared/types";
import type { TokenCollection } from "@token-workshop/core";
import type {
  TokenTreeGroupActionsContextType,
  TokenTreeGroupStateContextType,
  TokenTreeLeafActionsContextType,
  TokenTreeLeafStateContextType,
  TokenTreeSharedDataContextType,
} from "../tokenListTypes";

interface SharedDataDeps {
  effectiveAllTokensFlat: Record<string, TokenMapEntry>;
  modeResolvedTokensFlat?: Record<string, TokenMapEntry>;
  pathToCollectionId?: Record<string, string>;
  collectionIdsByPath?: Record<string, string[]>;
  perCollectionFlat?: Record<string, Record<string, TokenMapEntry>>;
  collections?: TokenCollection[];
}

export function useTokenTreeSharedData(deps: SharedDataDeps): TokenTreeSharedDataContextType {
  return useMemo(
    () => ({
      allTokensFlat: deps.effectiveAllTokensFlat,
      modeResolvedTokensFlat: deps.modeResolvedTokensFlat,
      pathToCollectionId: deps.pathToCollectionId,
      collectionIdsByPath: deps.collectionIdsByPath,
      perCollectionFlat: deps.perCollectionFlat,
      collections: deps.collections,
    }),
    [
      deps.effectiveAllTokensFlat,
      deps.modeResolvedTokensFlat,
      deps.pathToCollectionId,
      deps.collectionIdsByPath,
      deps.perCollectionFlat,
      deps.collections,
    ],
  );
}

interface GroupStateDeps {
  collectionId: string;
  groupBy: "path" | "type";
  selectionActive: boolean;
  selectedPaths: Set<string>;
  expandedPaths: Set<string>;
  highlightedToken: string | null | undefined;
  searchHighlight?: { nameTerms: string[]; valueTerms: string[] };
  dragOverGroup?: string | null;
  dragOverGroupIsInvalid?: boolean;
  dragSource?: { paths: string[]; names: string[] } | null;
  collectionCoverage?: Map<
    string,
    { total: number; totalMissing: number }
  >;
  effectiveRovingPath: string | null;
}

export function useTokenTreeGroupState(deps: GroupStateDeps): TokenTreeGroupStateContextType {
  return useMemo(
    () => ({
      collectionId: deps.collectionId,
      groupBy: deps.groupBy,
      selectionActive: deps.selectionActive,
      selectedPaths: deps.selectedPaths,
      expandedPaths: deps.expandedPaths,
      highlightedToken: deps.highlightedToken ?? null,
      previewedPath: deps.highlightedToken ?? null,
      searchHighlight: deps.searchHighlight,
      dragOverGroup: deps.dragOverGroup,
      dragOverGroupIsInvalid: deps.dragOverGroupIsInvalid,
      dragSource: deps.dragSource,
      collectionCoverage: deps.collectionCoverage,
      rovingFocusPath: deps.effectiveRovingPath,
    }),
    [
      deps.collectionId, deps.groupBy, deps.selectionActive, deps.selectedPaths, deps.expandedPaths,
      deps.highlightedToken, deps.searchHighlight, deps.dragOverGroup,
      deps.dragOverGroupIsInvalid, deps.dragSource,
      deps.collectionCoverage, deps.effectiveRovingPath,
    ],
  );
}

interface GroupActionsDeps {
  handleToggleExpand: (path: string) => void;
  requestDeleteGroup: (path: string, name: string, tokenCount: number) => void;
  handleOpenCreateSibling: (groupPath: string, tokenType: string) => void;
  setNewGroupDialogParent: (v: string | null) => void;
  handleRenameGroup: (oldPath: string, newPath: string) => void;
  handleUpdateGroupMeta: (groupPath: string, meta: { $type?: string | null; $description?: string | null }) => Promise<void>;
  handleRequestMoveGroup: (groupPath: string) => void;
  handleRequestCopyGroup: (groupPath: string) => void;
  handleDuplicateGroup: (groupPath: string) => void;
  onPublishGroup?: (groupPath: string, tokenCount: number) => void;
  onSetGroupScopes?: (groupPath: string) => void;
  handleZoomIntoGroup: (groupPath: string) => void;
  handleDragOverGroup: (groupPath: string | null, invalid?: boolean) => void;
  handleDropOnGroup: (groupPath: string) => void;
  onNavigateToAlias?: (path: string, fromPath?: string) => void;
  handleToggleGroupSelection?: (groupNode: TokenNode) => void;
  setRovingFocusPath: (path: string) => void;
}

export function useTokenTreeGroupActions(deps: GroupActionsDeps): TokenTreeGroupActionsContextType {
  return useMemo(
    () => ({
      onToggleExpand: deps.handleToggleExpand,
      onDeleteGroup: deps.requestDeleteGroup,
      onCreateSibling: deps.handleOpenCreateSibling,
      onCreateGroup: deps.setNewGroupDialogParent,
      onRenameGroup: deps.handleRenameGroup,
      onUpdateGroupMeta: deps.handleUpdateGroupMeta,
      onRequestMoveGroup: deps.handleRequestMoveGroup,
      onRequestCopyGroup: deps.handleRequestCopyGroup,
      onDuplicateGroup: deps.handleDuplicateGroup,
      onPublishGroup: deps.onPublishGroup,
      onSetGroupScopes: deps.onSetGroupScopes,
      onZoomIntoGroup: deps.handleZoomIntoGroup,
      onDragOverGroup: deps.handleDragOverGroup,
      onDropOnGroup: deps.handleDropOnGroup,
      onToggleGroupSelection: deps.handleToggleGroupSelection,
      onRovingFocus: deps.setRovingFocusPath,
    }),
    [
      deps.handleToggleExpand,
      deps.requestDeleteGroup,
      deps.handleOpenCreateSibling,
      deps.setNewGroupDialogParent,
      deps.handleRenameGroup,
      deps.handleUpdateGroupMeta,
      deps.handleRequestMoveGroup,
      deps.handleRequestCopyGroup,
      deps.handleDuplicateGroup,
      deps.onPublishGroup,
      deps.onSetGroupScopes,
      deps.handleZoomIntoGroup,
      deps.handleDragOverGroup,
      deps.handleDropOnGroup,
      deps.handleToggleGroupSelection,
      deps.setRovingFocusPath,
    ],
  );
}

interface LeafStateDeps {
  serverUrl: string;
  collectionId: string;
  collectionIds: string[];
  groupBy: "path" | "type";
  selectionCapabilities: NodeCapabilities | null;
  duplicateCounts: Map<string, number>;
  selectionActive: boolean;
  highlightedToken: string | null | undefined;
  inspectMode: boolean;
  syncSnapshot?: Record<string, string>;
  searchHighlight?: { nameTerms: string[]; valueTerms: string[] };
  selectedNodes: SelectionNodeInfo[];
  boundTokenPaths?: Set<string>;
  dragOverReorder?: { path: string; position: "before" | "after" } | null;
  selectedLeafNodes?: TokenNode[];
  showResolvedValues: boolean;
  starredPaths?: Set<string>;
  collections?: TokenCollection[];
  pendingRenameToken: string | null;
  pendingTabEdit: { path: string; columnId: string | null } | null;
  effectiveRovingPath: string | null;
  showDuplicates: boolean;
  tokenModeMissing?: Map<string, number>;
}

export function useTokenTreeLeafState(deps: LeafStateDeps): TokenTreeLeafStateContextType {
  return useMemo(
    () => ({
      serverUrl: deps.serverUrl,
      collectionId: deps.collectionId,
      collectionIds: deps.collectionIds,
      groupBy: deps.groupBy,
      selectionCapabilities: deps.selectionCapabilities,
      duplicateCounts: deps.duplicateCounts,
      selectionActive: deps.selectionActive,
      highlightedToken: deps.highlightedToken ?? null,
      previewedPath: deps.highlightedToken ?? null,
      inspectMode: deps.inspectMode,
      syncSnapshot: deps.syncSnapshot,
      searchHighlight: deps.searchHighlight,
      selectedNodes: deps.selectedNodes,
      boundTokenPaths: deps.boundTokenPaths,
      dragOverReorder: deps.dragOverReorder,
      selectedLeafNodes: deps.selectedLeafNodes,
      showResolvedValues: deps.showResolvedValues,
      starredPaths: deps.starredPaths,
      collections: deps.collections,
      pendingRenameToken: deps.pendingRenameToken,
      pendingTabEdit: deps.pendingTabEdit,
      rovingFocusPath: deps.effectiveRovingPath,
      showDuplicatesFilter: deps.showDuplicates,
      tokenModeMissing: deps.tokenModeMissing,
    }),
    [
      deps.serverUrl,
      deps.collectionId,
      deps.collectionIds,
      deps.groupBy,
      deps.selectionCapabilities,
      deps.duplicateCounts,
      deps.selectionActive,
      deps.highlightedToken,
      deps.inspectMode,
      deps.syncSnapshot,
      deps.searchHighlight,
      deps.selectedNodes,
      deps.boundTokenPaths,
      deps.dragOverReorder,
      deps.selectedLeafNodes,
      deps.showResolvedValues,
      deps.starredPaths,
      deps.collections,
      deps.pendingRenameToken,
      deps.pendingTabEdit,
      deps.effectiveRovingPath,
      deps.showDuplicates,
      deps.tokenModeMissing,
    ],
  );
}

interface LeafActionsDeps {
  onEdit: (path: string, name?: string) => void;
  requestDeleteToken: (path: string) => void;
  handleTokenSelect: (path: string, modifiers?: { shift: boolean }) => void;
  onNavigateToAlias?: (path: string, fromPath?: string) => void;
  onRefresh: () => void;
  onPushUndo?: TokenTreeLeafActionsContextType["onPushUndo"];
  handleRequestMoveTokenReview: (path: string) => void;
  handleRequestCopyTokenReview: (path: string) => void;
  handleDuplicateToken: (path: string) => void;
  handleOpenExtractToAlias: (
    path: string,
    $type?: string,
    $value?: unknown,
  ) => void;
  handleHoverToken: (path: string) => void;
  setTypeFilter: (v: string) => void;
  handleInlineSave: (
    path: string,
    type: string,
    newValue: unknown,
    previousState?: { type?: string; value: unknown },
  ) => void;
  handleRenameToken: (oldPath: string, newPath: string) => void;
  onViewTokenHistory?: (path: string) => void;
  onOpenTokenIssues?: (path: string, collectionId: string) => void;
  collectionsLength: number;
  handleCompareAcrossCollections: (path: string) => void;
  handleDragStartNotify: (paths: string[], names: string[]) => void;
  handleDragEndNotify: () => void;
  handleDragOverToken: (path: string, name: string, position: "before" | "after") => void;
  handleDragLeaveToken: () => void;
  handleDropReorder: (path: string, name: string, position: "before" | "after") => void;
  multiModeData: unknown;
  handleMultiModeInlineSave?: TokenTreeLeafActionsContextType["onMultiModeInlineSave"];
  handleCopyValueToAllModes: (path: string, targetCollectionId: string) => Promise<void>;
  onToggleStar?: (path: string) => void;
  handleClearPendingRename: () => void;
  handleClearPendingTabEdit: () => void;
  handleTabToNext: (currentPath: string, columnId: string | null, direction: 1 | -1) => void;
  setRovingFocusPath: (path: string) => void;
}

export function useTokenTreeLeafActions(deps: LeafActionsDeps): TokenTreeLeafActionsContextType {
  const {
    onEdit,
    requestDeleteToken,
    handleTokenSelect,
    onNavigateToAlias,
    onRefresh,
    onPushUndo,
    handleRequestMoveTokenReview,
    handleRequestCopyTokenReview,
    handleDuplicateToken,
    handleOpenExtractToAlias,
    handleHoverToken,
    setTypeFilter,
    handleInlineSave,
    handleRenameToken,
    onViewTokenHistory,
    onOpenTokenIssues,
    collectionsLength,
    handleCompareAcrossCollections,
    handleDragStartNotify,
    handleDragEndNotify,
    handleDragOverToken,
    handleDragLeaveToken,
    handleDropReorder,
    multiModeData,
    handleMultiModeInlineSave,
    handleCopyValueToAllModes,
    onToggleStar,
    handleClearPendingRename,
    handleClearPendingTabEdit,
    handleTabToNext,
    setRovingFocusPath,
  } = deps;

  return useMemo(
    () => ({
      onEdit,
      onDelete: requestDeleteToken,
      onToggleSelect: handleTokenSelect,
      onNavigateToAlias,
      onRefresh,
      onPushUndo,
      onRequestMoveToken: handleRequestMoveTokenReview,
      onRequestCopyToken: handleRequestCopyTokenReview,
      onDuplicateToken: handleDuplicateToken,
      onExtractToAlias: handleOpenExtractToAlias,
      onHoverToken: handleHoverToken,
      onFilterByType: setTypeFilter,
      onInlineSave: handleInlineSave,
      onRenameToken: handleRenameToken,
      onViewTokenHistory,
      onOpenTokenIssues,
      onCompareAcrossCollections:
        collectionsLength > 0
          ? handleCompareAcrossCollections
          : undefined,
      onDragStart: handleDragStartNotify,
      onDragEnd: handleDragEndNotify,
      onDragOverToken: handleDragOverToken,
      onDragLeaveToken: handleDragLeaveToken,
      onDropOnToken: handleDropReorder,
      onMultiModeInlineSave: multiModeData
        ? handleMultiModeInlineSave
        : undefined,
      onCopyValueToAllModes: (path, targetCollectionId) => {
        void handleCopyValueToAllModes(path, targetCollectionId);
      },
      onToggleStar,
      clearPendingRename: handleClearPendingRename,
      clearPendingTabEdit: handleClearPendingTabEdit,
      onTabToNext: handleTabToNext,
      onRovingFocus: setRovingFocusPath,
    }),
    [
      onEdit,
      requestDeleteToken,
      handleTokenSelect,
      onNavigateToAlias,
      onRefresh,
      onPushUndo,
      handleRequestMoveTokenReview,
      handleRequestCopyTokenReview,
      handleDuplicateToken,
      handleOpenExtractToAlias,
      handleHoverToken,
      setTypeFilter,
      handleInlineSave,
      handleRenameToken,
      onViewTokenHistory,
      onOpenTokenIssues,
      collectionsLength,
      handleCompareAcrossCollections,
      handleDragStartNotify,
      handleDragEndNotify,
      handleDragOverToken,
      handleDragLeaveToken,
      handleDropReorder,
      multiModeData,
      handleMultiModeInlineSave,
      handleCopyValueToAllModes,
      onToggleStar,
      handleClearPendingRename,
      handleClearPendingTabEdit,
      handleTabToNext,
      setRovingFocusPath,
    ],
  );
}
