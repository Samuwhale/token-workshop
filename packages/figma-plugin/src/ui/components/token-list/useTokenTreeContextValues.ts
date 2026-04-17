import { useMemo } from "react";
import type { TokenNode } from "../../hooks/useTokens";
import type { TokenRecipe } from "../../hooks/useRecipes";
import type {
  NodeCapabilities,
  TokenMapEntry,
  SelectionNodeInfo,
} from "../../../shared/types";
import type { TokenCollection } from "@tokenmanager/core";
import type {
  TokenTreeGroupActionsContextType,
  TokenTreeGroupStateContextType,
  TokenTreeLeafActionsContextType,
  TokenTreeLeafStateContextType,
  TokenTreeSharedDataContextType,
} from "../tokenListTypes";
import type { Density } from "../tokenListTypes";

interface SharedDataDeps {
  effectiveAllTokensFlat: Record<string, TokenMapEntry>;
  pathToCollectionId?: Record<string, string>;
}

export function useTokenTreeSharedData(deps: SharedDataDeps): TokenTreeSharedDataContextType {
  return useMemo(
    () => ({
      allTokensFlat: deps.effectiveAllTokensFlat,
      pathToCollectionId: deps.pathToCollectionId,
    }),
    [deps.effectiveAllTokensFlat, deps.pathToCollectionId],
  );
}

interface GroupStateDeps {
  density: Density;
  collectionId: string;
  selectMode: boolean;
  expandedPaths: Set<string>;
  highlightedToken: string | null | undefined;
  searchHighlight?: { nameTerms: string[]; valueTerms: string[] };
  dragOverGroup?: string | null;
  dragOverGroupIsInvalid?: boolean;
  dragSource?: { paths: string[]; names: string[] } | null;
  recipesByTargetGroup?: Map<string, TokenRecipe>;
  collectionCoverage?: Map<
    string,
    { configured: number; total: number; totalMissing: number }
  >;
  condensedView?: boolean;
  effectiveRovingPath: string | null;
}

export function useTokenTreeGroupState(deps: GroupStateDeps): TokenTreeGroupStateContextType {
  return useMemo(
    () => ({
      density: deps.density,
      collectionId: deps.collectionId,
      selectMode: deps.selectMode,
      expandedPaths: deps.expandedPaths,
      highlightedToken: deps.highlightedToken ?? null,
      previewedPath: deps.highlightedToken ?? null,
      searchHighlight: deps.searchHighlight,
      dragOverGroup: deps.dragOverGroup,
      dragOverGroupIsInvalid: deps.dragOverGroupIsInvalid,
      dragSource: deps.dragSource,
      recipesByTargetGroup: deps.recipesByTargetGroup,
      collectionCoverage: deps.collectionCoverage,
      condensedView: deps.condensedView,
      rovingFocusPath: deps.effectiveRovingPath,
    }),
    [
      deps.density, deps.collectionId, deps.selectMode, deps.expandedPaths,
      deps.highlightedToken, deps.searchHighlight, deps.dragOverGroup,
      deps.dragOverGroupIsInvalid, deps.dragSource, deps.recipesByTargetGroup,
      deps.collectionCoverage, deps.condensedView, deps.effectiveRovingPath,
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
  onSyncGroup?: (groupPath: string, tokenCount: number) => void;
  onSyncGroupStyles?: (groupPath: string, tokenCount: number) => void;
  onSetGroupScopes?: (groupPath: string) => void;
  onGenerateScaleFromGroup?: (groupPath: string, tokenType: string | null) => void;
  handleZoomIntoGroup: (groupPath: string) => void;
  handleDragOverGroup: (groupPath: string | null, invalid?: boolean) => void;
  handleDropOnGroup: (groupPath: string) => void;
  onEditRecipe?: (recipeId: string) => void;
  onNavigateToRecipe?: (recipeId: string) => void;
  handleRegenerateRecipe: (recipeId: string) => Promise<void>;
  handleDetachRecipeGroup: (recipeId: string, groupPath: string) => Promise<void>;
  onNavigateToAlias?: (path: string, fromPath?: string) => void;
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
      onSyncGroup: deps.onSyncGroup,
      onSyncGroupStyles: deps.onSyncGroupStyles,
      onSetGroupScopes: deps.onSetGroupScopes,
      onGenerateScaleFromGroup: deps.onGenerateScaleFromGroup,
      onZoomIntoGroup: deps.handleZoomIntoGroup,
      onDragOverGroup: deps.handleDragOverGroup,
      onDropOnGroup: deps.handleDropOnGroup,
      onEditRecipe: deps.onEditRecipe,
      onNavigateToRecipe: deps.onNavigateToRecipe,
      onRegenerateRecipe: deps.handleRegenerateRecipe,
      onDetachRecipeGroup: deps.handleDetachRecipeGroup,
      onNavigateToToken: deps.onNavigateToAlias
        ? (path: string) => deps.onNavigateToAlias!(path)
        : undefined,
      onRovingFocus: deps.setRovingFocusPath,
    }),
    [deps],
  );
}

interface LeafStateDeps {
  density: Density;
  serverUrl: string;
  collectionId: string;
  collectionIds: string[];
  selectionCapabilities: NodeCapabilities | null;
  duplicateCounts: Map<string, number>;
  selectMode: boolean;
  highlightedToken: string | null | undefined;
  inspectMode: boolean;
  syncSnapshot?: Record<string, string>;
  derivedTokenPaths?: Map<string, TokenRecipe>;
  searchHighlight?: { nameTerms: string[]; valueTerms: string[] };
  selectedNodes: SelectionNodeInfo[];
  dragOverReorder?: { path: string; position: "before" | "after" } | null;
  selectedLeafNodes?: TokenNode[];
  showResolvedValues: boolean;
  condensedView?: boolean;
  starredPaths?: Set<string>;
  collections?: TokenCollection[];
  selectedModes?: Record<string, string>;
  pendingRenameToken: string | null;
  pendingTabEdit: { path: string; columnId: string | null } | null;
  effectiveRovingPath: string | null;
  showDuplicates: boolean;
  multiModeEnabled: boolean;
  modeVariantPaths: Set<string>;
  modeLensEnabled: boolean;
  tokenModeMissing?: Map<string, number>;
}

export function useTokenTreeLeafState(deps: LeafStateDeps): TokenTreeLeafStateContextType {
  return useMemo(
    () => ({
      density: deps.density,
      serverUrl: deps.serverUrl,
      collectionId: deps.collectionId,
      collectionIds: deps.collectionIds,
      selectionCapabilities: deps.selectionCapabilities,
      duplicateCounts: deps.duplicateCounts,
      selectMode: deps.selectMode,
      highlightedToken: deps.highlightedToken ?? null,
      previewedPath: deps.highlightedToken ?? null,
      inspectMode: deps.inspectMode,
      syncSnapshot: deps.syncSnapshot,
      derivedTokenPaths: deps.derivedTokenPaths,
      searchHighlight: deps.searchHighlight,
      selectedNodes: deps.selectedNodes,
      dragOverReorder: deps.dragOverReorder,
      selectedLeafNodes: deps.selectedLeafNodes,
      showResolvedValues: deps.showResolvedValues,
      condensedView: deps.condensedView,
      starredPaths: deps.starredPaths,
      collections: deps.collections,
      selectedModes: deps.selectedModes,
      pendingRenameToken: deps.pendingRenameToken,
      pendingTabEdit: deps.pendingTabEdit,
      rovingFocusPath: deps.effectiveRovingPath,
      showDuplicatesFilter: deps.showDuplicates,
      modeVariantPaths: (!deps.multiModeEnabled || deps.modeLensEnabled) && deps.modeVariantPaths.size > 0 ? deps.modeVariantPaths : undefined,
      modeLensEnabled: deps.modeLensEnabled,
      tokenModeMissing: deps.tokenModeMissing,
    }),
    [deps],
  );
}

interface LeafActionsDeps {
  onEdit: (path: string, name?: string) => void;
  onPreview?: (path: string, name?: string) => void;
  requestDeleteToken: (path: string) => void;
  handleTokenSelect: (path: string, modifiers?: { shift: boolean; ctrl: boolean }) => void;
  onNavigateToAlias?: (path: string, fromPath?: string) => void;
  onRefresh: () => void;
  onPushUndo?: any;
  handleRequestMoveTokenReview: (path: string) => void;
  handleRequestCopyTokenReview: (path: string) => void;
  handleDuplicateToken: (path: string) => void;
  handleDetachFromRecipe: (path: string) => Promise<void>;
  handleOpenExtractToAlias: (path: string, $type?: string, $value?: any) => void;
  handleHoverToken: (path: string) => void;
  setTypeFilter: (v: string) => void;
  handleInlineSave: (path: string, type: string, newValue: any, previousState?: { type?: string; value: unknown }) => void;
  handleRenameToken: (oldPath: string, newPath: string) => void;
  onViewTokenHistory?: (path: string) => void;
  collectionsLength: number;
  handleCompareAcrossCollections: (path: string) => void;
  handleDragStartNotify: (paths: string[], names: string[]) => void;
  handleDragEndNotify: () => void;
  handleDragOverToken: (path: string, name: string, position: "before" | "after") => void;
  handleDragLeaveToken: () => void;
  handleDropReorder: (path: string, name: string, position: "before" | "after") => void;
  multiModeData: any;
  handleMultiModeInlineSave: any;
  onOpenRecipeEditor?: any;
  onToggleStar?: (path: string) => void;
  handleClearPendingRename: () => void;
  handleClearPendingTabEdit: () => void;
  handleTabToNext: (currentPath: string, columnId: string | null, direction: 1 | -1) => void;
  setRovingFocusPath: (path: string) => void;
}

export function useTokenTreeLeafActions(deps: LeafActionsDeps): TokenTreeLeafActionsContextType {
  return useMemo(
    () => ({
      onEdit: deps.onEdit,
      onPreview: deps.onPreview,
      onDelete: deps.requestDeleteToken,
      onToggleSelect: deps.handleTokenSelect,
      onNavigateToAlias: deps.onNavigateToAlias,
      onRefresh: deps.onRefresh,
      onPushUndo: deps.onPushUndo,
      onRequestMoveToken: deps.handleRequestMoveTokenReview,
      onRequestCopyToken: deps.handleRequestCopyTokenReview,
      onDuplicateToken: deps.handleDuplicateToken,
      onDetachFromRecipe: deps.handleDetachFromRecipe,
      onExtractToAlias: deps.handleOpenExtractToAlias,
      onHoverToken: deps.handleHoverToken,
      onFilterByType: deps.setTypeFilter,
      onInlineSave: deps.handleInlineSave,
      onRenameToken: deps.handleRenameToken,
      onViewTokenHistory: deps.onViewTokenHistory,
      onCompareAcrossCollections:
        deps.collectionsLength > 0
          ? deps.handleCompareAcrossCollections
          : undefined,
      onDragStart: deps.handleDragStartNotify,
      onDragEnd: deps.handleDragEndNotify,
      onDragOverToken: deps.handleDragOverToken,
      onDragLeaveToken: deps.handleDragLeaveToken,
      onDropOnToken: deps.handleDropReorder,
      onMultiModeInlineSave: deps.multiModeData
        ? deps.handleMultiModeInlineSave
        : undefined,
      onOpenRecipeEditor: deps.onOpenRecipeEditor,
      onToggleStar: deps.onToggleStar,
      clearPendingRename: deps.handleClearPendingRename,
      clearPendingTabEdit: deps.handleClearPendingTabEdit,
      onTabToNext: deps.handleTabToNext,
      onRovingFocus: deps.setRovingFocusPath,
    }),
    [deps],
  );
}
