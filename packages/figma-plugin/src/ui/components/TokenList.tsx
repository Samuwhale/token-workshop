import {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
  useLayoutEffect,
} from "react";
import { Spinner } from "./Spinner";
import type { TokenNode } from "../hooks/useTokens";
import type { NodeCapabilities, TokenMapEntry } from "../../shared/types";
import { BatchActionPanel } from "./batch-actions/BatchActionPanel";
import type { BatchActionType } from "./batch-actions/types";
import { FIGMA_SCOPE_OPTIONS } from "../shared/tokenMetadata";
import {
  flattenVisible,
  pruneDeletedPaths,
  sortTokenNodes,
  collectAllGroupPaths,
  flattenLeafNodes,
  findGroupByPath,
  buildZoomBranchNavigation,
  groupTokenNodesByType,
  getTypeGroupPathForTokenType,
} from "./tokenListUtils";
import type { LintViolation } from "../hooks/useLint";
import type {
  TokenListProps,
  MultiModeValue,
} from "./tokenListTypes";
import { VIRTUAL_OVERSCAN } from "./tokenListTypes";
import { TokenTreeProvider } from "./TokenTreeContext";
import { TokenListModals } from "./TokenListModals";
import { TokenListModalsProvider } from "./TokenListModalsContext";
import { useExtractToAlias } from "../hooks/useExtractToAlias";
import { useTokenCreate } from "../hooks/useTokenCreate";
import { useTableCreate } from "../hooks/useTableCreate";
import { useDragDrop } from "../hooks/useDragDrop";
import { useGroupOperations } from "../hooks/useGroupOperations";
import { useTokenPromotion } from "../hooks/useTokenPromotion";
import { useTokenCrud } from "../hooks/useTokenCrud";
import { useFigmaMessage } from "../hooks/useFigmaMessage";
import { extractSyncApplyResult } from "../hooks/useTokenSyncBase";
import { useTokenExpansion } from "../hooks/useTokenExpansion";
import { useTokenVirtualScroll } from "../hooks/useTokenVirtualScroll";
import { useTokenSearch } from "../hooks/useTokenSearch";
import { useTokenSelection } from "../hooks/useTokenSelection";
import { useJsonEditor } from "../hooks/useJsonEditor";
import { useTokenListViewState } from "../hooks/useTokenListViewState";
import { useBoundTokenPaths } from "../hooks/useBoundTokenPaths";
import { applyModeSelectionsToTokens } from "../shared/collectionModeUtils";
import { getCollectionDisplayName } from "../shared/libraryCollections";
import { dispatchToast } from "../shared/toastBus";
import {
  buildReferencedTokenPathSetFromEntries,
  isTokenEntryUnused,
} from "../shared/tokenUsage";
import { TokenListToolbar } from "./TokenListToolbar";
import { TokenSelectionToolbar } from "./TokenSelectionToolbar";
import { TableCreateForm } from "./TableCreateForm";
import {
  TokenListReviewOverlays,
} from "./token-list/TokenListStates";
import { TokenListTreeBody } from "./token-list/TokenListTreeBody";
import { useTokenListClipboard } from "./token-list/TokenListClipboard";
import { useTokenListBatchOperations } from "./token-list/TokenListBatchOperations";
import { useTokenListKeyboardHandler } from "./token-list/TokenListKeyboardHandler";
import { useTokenListApplyOperations } from "./token-list/TokenListApplyOperations";
import { getDeleteModalProps } from "./token-list/TokenListDeleteModalProps";
import type {
  VariableDiffPendingState,
} from "../shared/tokenListModalTypes";
import type {
  StylesAppliedMessage,
  VariablesReadErrorMessage,
  VariablesReadMessage,
} from "../../shared/types";
import { getPluginMessageFromEvent } from "../../shared/utils";
import { useTokenListModalContext } from "./token-list/useTokenListModalContext";
import { useToolbarStateChips } from "./token-list/useToolbarStateChips";
import {
  useTokenTreeSharedData,
  useTokenTreeGroupState,
  useTokenTreeGroupActions,
  useTokenTreeLeafState,
  useTokenTreeLeafActions,
} from "./token-list/useTokenTreeContextValues";

const EMPTY_PATH_SET = new Set<string>();

function getInlineModeValues(
  entry: TokenMapEntry | undefined,
  collectionId: string,
): Record<string, unknown> {
  const modes = entry?.$extensions?.tokenworkshop?.modes;
  if (!modes || typeof modes !== "object" || Array.isArray(modes)) return {};
  const collectionModes = modes[collectionId];
  if (
    !collectionModes ||
    typeof collectionModes !== "object" ||
    Array.isArray(collectionModes)
  ) {
    return {};
  }
  return collectionModes as Record<string, unknown>;
}

type SearchResultPresentation = "grouped" | "flat";

type VisibleTokenRow = {
  node: TokenNode;
  depth: number;
  ancestorPathLabel?: string;
};

type BatchEditorFocusTarget = "find-replace";

export function TokenList({
  ctx: { collectionId, collectionIds, serverUrl, connected, selectedNodes },
  data: {
    tokens,
    allTokensFlat,
    lintViolations = [],
    syncSnapshot,
    tokenUsageCounts,
    tokenUsageReady = false,
    perCollectionFlat,
    collectionMap = {},
    collectionTokenCounts: _collectionTokenCounts = {},
    modeMap = {},
    collections = [],
    pathToCollectionId = {},
    collectionIdsByPath,
  },
  actions: {
    onEdit,
    onCreateNew,
    onCreateGenerator,
    onRefresh,
    onPushUndo,
    onTokenCreated,
    onNavigateToAlias,
    onNavigateBack,
    navHistoryLength,
    onClearHighlight,
    onPublishGroup,
    onToggleIssuesOnly,
    onFilteredCountChange,
    onNavigateToCollection,
    onTokenTouched,
    onToggleStar,
    starredPaths,
    onRemoveStarredTokens,
    onRenameStarredToken,
    onMoveStarredToken,
    onError,
    onViewTokenHistory,
    onOpenTokenIssues,
    onDisplayedLeafNodesChange,
    onSelectionChange,
    onOpenCompare,
    onOpenCrossCollectionCompare,
    onOpenImportPanel,
    onExtractFromSelection,
  },
  recentlyTouched,
  highlightedToken,
  focusGroupPath,
  onFocusGroupHandled,
  showIssuesOnly,
  editingTokenPath,
  compareHandle,
}: TokenListProps) {
  // Token create state is managed by useTokenCreate hook (called below after dependencies)
  const [, setApplying] = useState(false);
  const [varDiffPending, setVarDiffPending] = useState<VariableDiffPendingState | null>(null);
  const [, setVarDiffLoading] = useState(false);
  // Loading indicator for async token operations (delete, rename, move, duplicate, reorder, etc.)
  const [operationLoading, setOperationLoading] = useState<string | null>(null);
  const [locallyDeletedPaths, setLocallyDeletedPaths] = useState<Set<string>>(
    new Set(),
  );
  // selectedPaths/showBatchEditor/lastSelectedPathRef managed by useTokenSelection (called below)
  const varReadPendingRef = useRef<
    Map<
      string,
      {
        resolve: (collections: VariablesReadMessage["collections"]) => void;
        reject: (error: Error) => void;
      }
    >
  >(new Map());
  // Drag/drop state is managed by useDragDrop hook (called below after dependencies)
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [copyCssFeedback, setCopyCssFeedback] = useState(false);
  const [copyPreferredFeedback, setCopyPreferredFeedback] = useState(false);
  const [copyAliasFeedback, setCopyAliasFeedback] = useState(false);
  const [showMoveToGroup, setShowMoveToGroup] = useState(false);
  const [moveToGroupTarget, setMoveToGroupTarget] = useState("");
  const [moveToGroupError, setMoveToGroupError] = useState("");
  const [showBatchMoveToCollection, setShowBatchMoveToCollection] = useState(false);
  const [batchMoveToCollectionTarget, setBatchMoveToCollectionTarget] = useState("");
  const [showBatchCopyToCollection, setShowBatchCopyToCollection] = useState(false);
  const [batchCopyToCollectionTarget, setBatchCopyToCollectionTarget] = useState("");
  const currentCollectionFlat = useMemo(
    () => perCollectionFlat?.[collectionId] ?? {},
    [collectionId, perCollectionFlat],
  );
  const activeCollections = useMemo(
    () => collections.filter((collection) => collection.id === collectionId),
    [collections, collectionId],
  );
  const viewState = useTokenListViewState({
    collectionId,
  });
  const {
    showRecentlyTouched,
    setShowRecentlyTouched,
    showStarredOnly,
    setShowStarredOnly,
    inspectMode,
    setInspectMode,
    viewMode,
    setViewMode,
    groupBy,
    setGroupBy,
    sortOrder,
    setSortOrder,
    showResolvedValues,
    setShowResolvedValues,
    rowHeight,
  } = viewState;

  useEffect(() => {
    if (tokens.length === 0 && viewMode !== "tree") {
      setViewMode("tree");
    }
  }, [setViewMode, tokens.length, viewMode]);

  const [pendingBatchEditorFocus, setPendingBatchEditorFocus] =
    useState<BatchEditorFocusTarget | null>(null);
  const recentlyTouchedPaths = useMemo(
    () => recentlyTouched.getPathsForCollection(collectionId),
    [collectionId, recentlyTouched],
  );
  const sendStyleApply = useFigmaMessage<{
    count: number;
    total: number;
    failures: { path: string; error: string }[];
    skipped: Array<{ path: string; $type: string }>;
  }, StylesAppliedMessage>({
    responseType: "styles-applied",
    errorType: "styles-apply-error",
    timeout: 15000,
    extractResponse: extractSyncApplyResult,
  });
  const [zoomRootPath, setZoomRootPath] = useState<string | null>(null);
  // Roving tabindex: tracks which row path currently has tabIndex=0
  const [rovingFocusPath, setRovingFocusPath] = useState<string | null>(null);

  // Track editor saves: highlightedToken is set to saved path after TokenEditor save
  const prevHighlightRef = useRef<string | null>(null);
  useEffect(() => {
    if (highlightedToken && highlightedToken !== prevHighlightRef.current) {
      recentlyTouched.recordTouch(highlightedToken, collectionId);
      onTokenTouched?.(highlightedToken);
    }
    prevHighlightRef.current = highlightedToken ?? null;
  }, [collectionId, highlightedToken, recentlyTouched, onTokenTouched]);

  // Expand/collapse state managed by useTokenExpansion (called below)
  const batchEditorPanelRef = useRef<HTMLDivElement>(null);
  const virtualListRef = useRef<HTMLDivElement>(null);
  // Refs for values defined later in the component, used inside handleListKeyDown to avoid TDZ
  const displayedLeafNodesRef = useRef<TokenNode[]>([]);
  const selectedTokenNodesRef = useRef<TokenNode[]>([]);
  const copyTokensAsJsonRef = useRef<(nodes: TokenNode[]) => void>(() => {});
  const copyTokensAsPreferredRef = useRef<(nodes: TokenNode[]) => void>(
    () => {},
  );
  const copyTokensAsDtcgRefRef = useRef<(nodes: TokenNode[]) => void>(() => {});

  // Bridging refs — created here so they can be passed to both useTokenSearch and useTokenVirtualScroll
  // useTokenVirtualScroll assigns flatItemsRef.current and itemOffsetsRef.current after its memos
  const virtualScrollTopRef = useRef(0);
  const flatItemsRef = useRef<Array<{ node: { path: string } }>>([]);
  const itemOffsetsRef = useRef<number[]>([0]);
  const scrollAnchorPathRef = useRef<string | null>(null);
  const isFilterChangeRef = useRef(false);

  // Ref-based clearSelection and selectedPaths — defined here so they're available before useTokenSelection is called.
  // useTokenCrud and useTokenPromotion are called before useTokenSelection, so we use ref-based proxies.
  const clearSelectionRef = useRef<() => void>(() => {});
  const clearSelection = useCallback(() => clearSelectionRef.current(), []);

  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      const msg = getPluginMessageFromEvent<
        | VariablesReadMessage
        | VariablesReadErrorMessage
      >(ev);
      if (msg?.type === "variables-read" && msg.correlationId) {
        const entry = varReadPendingRef.current.get(msg.correlationId);
        if (entry) {
          varReadPendingRef.current.delete(msg.correlationId);
          entry.resolve(msg.collections ?? []);
        }
      } else if (msg?.type === "variables-read-error" && msg.correlationId) {
        const entry = varReadPendingRef.current.get(msg.correlationId);
        if (entry) {
          varReadPendingRef.current.delete(msg.correlationId);
          entry.reject(
            new Error(msg.error || "Failed to read Figma variables"),
          );
        }
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  useEffect(
    () => () => {
      for (const [correlationId, entry] of varReadPendingRef.current) {
        entry.reject(
          new Error(
            `Variable read request was cancelled before completion (${correlationId})`,
          ),
        );
      }
      varReadPendingRef.current.clear();
    },
    [],
  );

  // handleListKeyDown is defined after custom hook calls (below) to avoid TDZ issues

  // Clear optimistic deletions when the server response arrives with fresh tokens
  useEffect(() => {
    setLocallyDeletedPaths(new Set());
  }, [tokens]);

  const sortedTokens = useMemo(() => {
    const sorted = sortTokenNodes(tokens, sortOrder);
    return locallyDeletedPaths.size > 0
      ? pruneDeletedPaths(sorted, locallyDeletedPaths)
      : sorted;
  }, [tokens, sortOrder, locallyDeletedPaths]);

  // Search/filter state managed by useTokenSearch (called below after sortedTokens/lintPaths are available)

  // Compute the set of token paths that are "unused": zero Figma usage AND not referenced by any other token as an alias
  const unusedTokenPaths = useMemo<Set<string> | undefined>(() => {
    if (!tokenUsageReady || !tokenUsageCounts)
      return undefined;

    const allCollectionFlat = perCollectionFlat ?? {};
    const currentCollectionFlat = allCollectionFlat[collectionId] ?? {};
    const referencedPaths = buildReferencedTokenPathSetFromEntries(
      Object.values(allCollectionFlat).flatMap((collectionFlat) =>
        Object.values(collectionFlat),
      ),
    );
    const paths = new Set<string>();
    for (const [path, entry] of Object.entries(currentCollectionFlat)) {
      if (
        isTokenEntryUnused(path, entry, tokenUsageCounts, referencedPaths, {
          includeDeprecated: false,
        })
      ) {
        paths.add(path);
      }
    }

    return paths.size > 0 ? paths : undefined;
  }, [collectionId, perCollectionFlat, tokenUsageCounts, tokenUsageReady]);

  // Compute per-mode resolved token maps for the active collection. Always
  // produces at least one column — single-mode collections get one result,
  // multi-mode collections get N. Returns null only when no collection is
  // selected yet (e.g. during initial load).
  const currentCollection = useMemo(
    () =>
      activeCollections.find((candidate) => candidate.id === collectionId) ??
      null,
    [activeCollections, collectionId],
  );

  const multiModeData = useMemo(() => {
    if (
      Object.keys(currentCollectionFlat).length === 0 ||
      !currentCollection
    )
      return null;
    if (currentCollection.modes.length === 0) return null;

    const results: Array<{
      optionName: string;
      collectionId: string;
      resolved: Record<string, TokenMapEntry>;
    }> = [];
    const currentCollectionPathMap = Object.fromEntries(
      Object.keys(currentCollectionFlat).map((path) => [
        path,
        currentCollection.id,
      ]),
    );
    for (const option of currentCollection.modes) {
      results.push({
        optionName: option.name,
        collectionId: currentCollection.id,
        resolved: applyModeSelectionsToTokens(
          currentCollectionFlat,
          [currentCollection],
          { [currentCollection.id]: option.name },
          currentCollectionPathMap,
        ),
      });
    }
    return { collection: currentCollection, results };
  }, [currentCollection, currentCollectionFlat]);

  // Build mode values for a given token path. Always returns at least one entry
  // — single-mode collections get one, multi-mode collections get N.
  const getMultiModeValues = useCallback(
    (tokenPath: string): MultiModeValue[] => {
      if (!multiModeData) return [];
      const { results } = multiModeData;
      return results.map(({ optionName, collectionId, resolved }) => {
        return {
          optionName,
          collectionId,
          resolved: resolved[tokenPath],
          targetCollectionId: collectionId,
        };
      });
    },
    [multiModeData],
  );

  // Pre-compute per-group missing mode counts for the active collection.
  const tokenModeMissing = useMemo(() => {
    if (!currentCollection || currentCollection.modes.length === 0) return undefined;

    const map = new Map<string, number>();
    const totalModeCount = currentCollection.modes.length;
    for (const [path, entry] of Object.entries(currentCollectionFlat)) {
      let filled = 0;
      const collectionModes = getInlineModeValues(entry, currentCollection.id);
      for (let i = 0; i < currentCollection.modes.length; i++) {
        const mode = currentCollection.modes[i];
        const value = i === 0 ? entry.$value : collectionModes[mode.name];
        if (value !== undefined && value !== null && value !== "") filled++;
      }
      const missing = totalModeCount - filled;
      if (missing > 0) map.set(path, missing);
    }
    return map.size > 0 ? map : undefined;
  }, [currentCollection, currentCollectionFlat]);

  const collectionCoverage = useMemo(() => {
    if (!currentCollection || !tokenModeMissing) return undefined;

    const map = new Map<
      string,
      { total: number; totalMissing: number }
    >();
    function walk(
      nodes: TokenNode[],
    ): { total: number; totalMissing: number } {
      let total = 0;
      let totalMissing = 0;
      for (const node of nodes) {
        if (node.isGroup && node.children) {
          const sub = walk(node.children);
          total += sub.total;
          totalMissing += sub.totalMissing;
          map.set(node.path, sub);
        } else if (!node.isGroup) {
          total++;
          totalMissing += tokenModeMissing?.get(node.path) ?? 0;
        }
      }
      return { total, totalMissing };
    }
    walk(tokens);
    return map;
  }, [currentCollection, tokenModeMissing, tokens]);

  // JSON editor state
  const {
    jsonText,
    jsonDirty,
    jsonError,
    jsonSaving,
    jsonBrokenRefs,
    jsonTextareaRef,
    handleJsonChange,
    handleJsonSave,
    handleJsonRevert,
  } = useJsonEditor({
    viewMode,
    connected,
    serverUrl,
    collectionId,
    allTokensFlat,
    tokens,
    onRefresh,
  });

  const boundTokenPaths = useBoundTokenPaths(selectedNodes);

  const handleHoverToken = useCallback((tokenPath: string) => {
    parent.postMessage(
      { pluginMessage: { type: "highlight-layer-by-token", tokenPath } },
      "*",
    );
  }, []);

  // displayedTokens/displayedLeafNodes/flatItems/itemOffsets computed by hooks below

  // Map of group path ('' = root) → ordered child names, reflecting actual file order
  const siblingOrderMap = useMemo(() => {
    const map = new Map<string, string[]>();
    const walk = (nodes: TokenNode[], parentPath: string) => {
      map.set(
        parentPath,
        nodes.map((n) => n.name),
      );
      for (const node of nodes) {
        if (node.isGroup && node.children) walk(node.children, node.path);
      }
    };
    walk(tokens, "");
    return map;
  }, [tokens]);

  // --- Custom hooks for extracted state groups ---
  const allGroupPaths = useMemo(() => collectAllGroupPaths(tokens), [tokens]);

  const { handleOpenCreateSibling } = useTokenCreate({
    selectedNodes,
    siblingOrderMap,
    onCreateNew,
  });

  const tableCreate = useTableCreate({
    connected,
    serverUrl,
    collectionId,
    collectionModeNames: activeCollections[0]?.modes.map((mode) => mode.name) ?? [],
    siblingOrderMap,
    onRefresh,
    onPushUndo,
    onTokenCreated,
    onRecordTouch: (path) => recentlyTouched.recordTouch(path, collectionId),
  });
  const {
    showTableCreate,
    tableGroup,
    setTableGroup,
    tableRows,
    rowErrors,
    createAllError,
    busy: tableCreateBusy,
    hasDraft: tableCreateHasDraft,
    addRow: addTableRow,
    removeRow: removeTableRow,
    updateRow: updateTableRow,
    updateModeValue: updateTableModeValue,
    copyFirstModeToEmptyModes,
    closeTableCreate,
    restoreDraft: restoreTableDraft,
    dismissDraft: dismissTableDraft,
    openTableCreate,
    handleCreateAll,
    tableSuggestions,
  } = tableCreate;

  const dragDrop = useDragDrop({
    connected,
    serverUrl,
    collectionId,
    siblingOrderMap,
    onRefresh,
    onPushUndo,
    onError,
    onRenamePath: (oldPath, newPath) => {
      recentlyTouched.renamePath(oldPath, newPath, collectionId);
      onRenameStarredToken?.(oldPath, newPath, collectionId);
    },
  });
  const {
    dragSource,
    dragOverGroup,
    dragOverGroupIsInvalid,
    dragOverReorder,
    handleDragStart,
    handleDragEnd,
    handleDragOverGroup,
    handleDragOverToken,
    handleDragLeaveToken,
    handleDropOnGroup,
    handleDropReorder,
  } = dragDrop;

  const groupOps = useGroupOperations({
    connected,
    serverUrl,
    collectionId,
    collectionIds,
    siblingOrderMap,
    onRefresh,
    onPushUndo,
    onSetOperationLoading: setOperationLoading,
    onError,
  });
  const {
    renameGroupConfirm,
    setRenameGroupConfirm,
    newGroupDialogParent,
    setNewGroupDialogParent,
    newGroupName,
    setNewGroupName,
    newGroupError,
    setNewGroupError,
    movingGroup,
    setMovingGroup,
    copyingGroup,
    setCopyingGroup,
    moveGroupTargetCollectionId,
    setMoveGroupTargetCollectionId,
    copyGroupTargetCollectionId,
    setCopyGroupTargetCollectionId,
    executeGroupRename,
    handleRenameGroup,
    handleRequestMoveGroup,
    handleConfirmMoveGroup,
    handleRequestCopyGroup,
    handleConfirmCopyGroup,
    handleDuplicateGroup,
    handleUpdateGroupMeta,
    handleCreateGroup,
    handleMoveTokenInGroup,
  } = groupOps;

  // Token expansion state
  const tokenExpansion = useTokenExpansion({
    collectionId,
    tokens,
    highlightedToken,
    onClearHighlight,
  });
  const {
    expandedPaths,
    setExpandedPaths,
    expandedChains,
    setExpandedChains: _setExpandedChains,
    handleToggleExpand,
    handleExpandAll: handleExpandAllPath,
    handleCollapseAll: handleCollapseAllPath,
  } = tokenExpansion;
  const expandedPathsRef = useRef(expandedPaths);

  useEffect(() => {
    expandedPathsRef.current = expandedPaths;
  }, [expandedPaths]);

  // Compute lintPaths here so we can pass it to useTokenSearch
  const lintPaths = useMemo(() => {
    const paths = new Set<string>();
    for (const v of lintViolations) paths.add(v.path);
    return paths;
  }, [lintViolations]);

  // Stable map of path → filtered violations so we don't create new arrays per-row on every render
  const lintViolationsMap = useMemo(() => {
    const map = new Map<string, LintViolation[]>();
    for (const v of lintViolations) {
      let arr = map.get(v.path);
      if (!arr) {
        arr = [];
        map.set(v.path, arr);
      }
      arr.push(v);
    }
    return map;
  }, [lintViolations]);

  // Token search state (depends on expansion and virtual-scroll bridge refs)
  const tokenSearch = useTokenSearch({
    collectionId,
    tokens,
    serverUrl,
    virtualScrollTopRef,
    flatItemsRef,
    itemOffsetsRef,
    scrollAnchorPathRef,
    isFilterChangeRef,
    starredPaths: starredPaths ?? EMPTY_PATH_SET,
    sortedTokens,
    recentlyTouchedPaths,
    showIssuesOnly,
    showRecentlyTouched,
    showStarredOnly,
    inspectMode,
    zoomRootPath,
    lintPaths,
    boundTokenPaths,
    unusedTokenPaths,
  });
  const {
    searchQuery,
    typeFilter,
    refFilter,
    showDuplicates,
    crossCollectionSearch,
    hasCrossCollectionCriteria,
    setCrossCollectionSearch,
    showQualifierHints,
    setShowQualifierHints,
    hintIndex,
    setHintIndex,
    crossCollectionLoading,
    crossCollectionError,
    crossCollectionResults,
    crossCollectionTotal,
    setCrossCollectionOffset,
    retryCrossCollectionSearch,
    CROSS_COLLECTION_PAGE_SIZE,
    searchRef,
    qualifierHintsRef,
    setSearchQuery,
    setTypeFilter,
    setRefFilter,
    setShowDuplicates,
    addQueryQualifierValue,
    removeQueryToken,
    filtersActive,
    activeFilterCount,
    duplicateCounts,
    availableTypes,
    qualifierHints,
    activeQueryToken,
    structuredFilterChips,
    searchHighlight,
    searchTooltip,
    displayedTokens,
    displayedLeafNodes,
    displayedGroupPaths,
    displayedLeafNodesWithAncestors,
  } = tokenSearch;

  const [searchResultPresentation, setSearchResultPresentation] =
    useState<SearchResultPresentation>("grouped");
  const groupedDisplayedTokens = useMemo(
    () =>
      groupBy === "type" ? groupTokenNodesByType(displayedTokens) : displayedTokens,
    [displayedTokens, groupBy],
  );
  const groupedDisplayedGroupPaths = useMemo(
    () => collectAllGroupPaths(groupedDisplayedTokens),
    [groupedDisplayedTokens],
  );
  const canToggleSearchResultPresentation =
    viewMode === "tree" && filtersActive && !showRecentlyTouched;
  const showFlatSearchResults =
    canToggleSearchResultPresentation &&
    searchResultPresentation === "flat" &&
    !crossCollectionSearch;
  const searchExpansionRestoreRef = useRef<Set<string> | null>(null);
  const flatSearchRows = useMemo<VisibleTokenRow[]>(
    () =>
      displayedLeafNodesWithAncestors.map(({ node, ancestors }) => ({
        node,
        depth: 0,
        ancestorPathLabel: ancestors.map((ancestor) => ancestor.name).join(" › "),
      })),
    [displayedLeafNodesWithAncestors],
  );

  const visibleGroupPaths =
    groupBy === "type" ? groupedDisplayedGroupPaths : allGroupPaths;
  const allGroupsExpanded =
    visibleGroupPaths.length > 0 &&
    visibleGroupPaths.every((path) => expandedPaths.has(path));
  const handleExpandAll = useCallback(() => {
    if (groupBy === "type") {
      setExpandedPaths(new Set(groupedDisplayedGroupPaths));
      return;
    }
    handleExpandAllPath();
  }, [groupBy, groupedDisplayedGroupPaths, handleExpandAllPath, setExpandedPaths]);
  const handleCollapseAll = useCallback(() => {
    if (groupBy === "type") {
      setExpandedPaths(new Set());
      return;
    }
    handleCollapseAllPath();
  }, [groupBy, handleCollapseAllPath, setExpandedPaths]);
  const filterMenuActiveCount = activeFilterCount + (inspectMode ? 1 : 0);

  const {
    toolbarStateChips,
  } = useToolbarStateChips({
    structuredFilterChips, removeQueryToken,
    refFilter, setRefFilter, showDuplicates, setShowDuplicates,
    showIssuesOnly, onToggleIssuesOnly, lintViolationsLength: lintViolations.length,
    showRecentlyTouched, setShowRecentlyTouched, typeFilter, setTypeFilter,
    showStarredOnly, setShowStarredOnly,
  });

  const insertSearchQualifier = useCallback(
    (qualifier: string) => {
      const trimmed = searchQuery.trimEnd();
      setSearchQuery(trimmed ? `${trimmed} ${qualifier}:` : `${qualifier}:`);
      requestAnimationFrame(() => searchRef.current?.focus());
    },
    [searchQuery, setSearchQuery, searchRef],
  );

  // Sync displayedLeafNodesRef
  displayedLeafNodesRef.current = displayedLeafNodes;

  // Notify parent when the visible leaf list changes
  useEffect(() => {
    onDisplayedLeafNodesChange?.(displayedLeafNodes);
  }, [displayedLeafNodes, onDisplayedLeafNodesChange]);

  // Auto-clear zoom if the zoomed group no longer exists in the tree
  useEffect(() => {
    if (zoomRootPath && !findGroupByPath(sortedTokens, zoomRootPath)) {
      setZoomRootPath(null);
    }
  }, [sortedTokens, zoomRootPath]);

  useLayoutEffect(() => {
    if (viewMode !== "tree" || showRecentlyTouched || !filtersActive) return;
    if (searchExpansionRestoreRef.current === null) {
      searchExpansionRestoreRef.current = new Set(expandedPathsRef.current);
    }
    const groupPaths =
      groupBy === "type" ? groupedDisplayedGroupPaths : displayedGroupPaths;
    if (groupPaths.length === 0) return;
    setExpandedPaths((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const path of groupPaths) {
        if (next.has(path)) continue;
        next.add(path);
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [
    displayedGroupPaths,
    filtersActive,
    groupedDisplayedGroupPaths,
    groupBy,
    setExpandedPaths,
    showRecentlyTouched,
    viewMode,
  ]);

  useLayoutEffect(() => {
    if (viewMode !== "tree" || showRecentlyTouched || filtersActive) return;
    if (searchExpansionRestoreRef.current === null) return;
    const restore = searchExpansionRestoreRef.current;
    searchExpansionRestoreRef.current = null;
    const isSameSize = restore.size === expandedPaths.size;
    const hasSameEntries =
      isSameSize &&
      [...restore].every((path) => expandedPaths.has(path));
    if (hasSameEntries) return;
    setExpandedPaths(new Set(restore));
  }, [
    expandedPaths,
    filtersActive,
    setExpandedPaths,
    showRecentlyTouched,
    viewMode,
  ]);

  // Virtual scroll state (depends on the filtered token list)
  // Note: showRecentlyTouched special-case for flatItems is handled here
  const flatItemsForScroll = useMemo<VisibleTokenRow[]>(() => {
    if (viewMode !== "tree") return [];
    if (showRecentlyTouched) {
      const leaves = flattenLeafNodes(displayedTokens);
      leaves.sort(
        (a, b) =>
          (recentlyTouched.getTimestamp(b.path, collectionId) ?? 0) -
          (recentlyTouched.getTimestamp(a.path, collectionId) ?? 0),
      );
      return leaves.map((node) => ({ node, depth: 0 }));
    }
    if (showFlatSearchResults) {
      return flatSearchRows;
    }
    return flattenVisible(groupedDisplayedTokens, expandedPaths);
  }, [
    displayedTokens,
    expandedPaths,
    flatSearchRows,
    groupedDisplayedTokens,
    viewMode,
    showRecentlyTouched,
    showFlatSearchResults,
    collectionId,
    recentlyTouched,
  ]);

  const tokenVirtualScroll = useTokenVirtualScroll({
    displayedTokens: groupedDisplayedTokens,
    expandedPaths,
    expandedChains,
    rowHeight,
    allTokensFlat,
    viewMode,
    recentlyTouchedPaths,
    highlightedToken,
    virtualListRef,
    virtualScrollTopRef,
    flatItemsRef,
    itemOffsetsRef,
    scrollAnchorPathRef,
    isFilterChangeRef,
    flatItemsOverride: flatItemsForScroll,
  });
  // Override flatItems from the hook with our special recency-sorted version
  const flatItems = flatItemsForScroll;
  const {
    virtualScrollTop,
    setVirtualScrollTop,
    itemOffsets,
    pendingTabEdit,
    handleClearPendingTabEdit,
    handleJumpToGroup,
    handleTabToNext,
  } = tokenVirtualScroll;
  // Sync flatItemsRef/itemOffsetsRef (useTokenVirtualScroll already does this, but flatItems is overridden above)
  flatItemsRef.current = flatItems;
  // itemOffsetsRef is set by useTokenVirtualScroll internally

  useEffect(() => {
    if (!focusGroupPath || viewMode !== "tree") return;
    if (!findGroupByPath(sortedTokens, focusGroupPath)) return;
    setZoomRootPath(focusGroupPath);
    setExpandedPaths((current) => new Set([...current, focusGroupPath]));
    if (virtualListRef.current) virtualListRef.current.scrollTop = 0;
    virtualScrollTopRef.current = 0;
    setVirtualScrollTop(0);
    onFocusGroupHandled?.();
  }, [
    focusGroupPath,
    onFocusGroupHandled,
    setExpandedPaths,
    setVirtualScrollTop,
    sortedTokens,
    viewMode,
  ]);

  // Report filtered leaf count to parent so collection tabs can show "X / Y"
  useEffect(() => {
    if (!onFilteredCountChange) return;
    onFilteredCountChange(filtersActive ? displayedLeafNodes.length : null);
  }, [displayedLeafNodes, filtersActive, onFilteredCountChange]);

  // Token selection state (needed before CRUD and promotion hooks)
  const tokenSelection = useTokenSelection({
    viewMode,
    flatItems,
    displayedLeafNodes,
    crossCollectionResults,
    selectionScopeKey: `${collectionId}:${crossCollectionSearch ? "cross-collection" : "collection"}`,
    selectionEnabled: !crossCollectionSearch,
    onSelectionChange,
  });
  const {
    selectionActive,
    selectedPaths,
    setSelectedPaths,
    showBatchEditor,
    setShowBatchEditor,
    lastSelectedPathRef,
    displayedLeafPaths,
    selectedLeafNodes,
    handleTokenSelect,
    handleSelectAll,
    handleToggleGroupChildren,
    clearSelection: clearSelectionImpl,
  } = tokenSelection;

  const [activeBatchAction, setActiveBatchAction] = useState<BatchActionType | null>(null);

  clearSelectionRef.current = clearSelectionImpl;

  const handleClearSelection = useCallback(() => {
    clearSelectionImpl();
    setActiveBatchAction(null);
  }, [clearSelectionImpl]);

  const openBulkEditorForPaths = useCallback(
    (paths: Set<string>) => {
      if (paths.size === 0) {
        dispatchToast("No tokens match that bulk-edit scope.", "error");
        return;
      }
      setSelectedPaths(paths);
    },
    [setSelectedPaths],
  );

  const handleBatchActionSelectionChange = useCallback(
    (nextSelectedPaths: Set<string>) => {
      setSelectedPaths(nextSelectedPaths);
      if (nextSelectedPaths.size === 0) {
        setActiveBatchAction(null);
        setShowBatchEditor(false);
      }
    },
    [setSelectedPaths, setShowBatchEditor],
  );

  const selectedEntries = useMemo(
    () => [...selectedPaths]
      .map(p => ({ path: p, entry: allTokensFlat[p] }))
      .filter((x): x is { path: string; entry: TokenMapEntry } => x.entry != null),
    [selectedPaths, allTokensFlat],
  );
  const selectedTokenNodes = useMemo<TokenNode[]>(
    () => selectedEntries.map(({ path, entry }) => ({
      path,
      name: entry.$name ?? path.split(".").at(-1) ?? path,
      $type: entry.$type,
      $value: entry.$value,
      ...(entry.$description ? { $description: entry.$description } : {}),
      ...(entry.$extensions ? { $extensions: entry.$extensions } : {}),
      ...(entry.$scopes ? { $scopes: entry.$scopes } : {}),
      ...(entry.$lifecycle ? { $lifecycle: entry.$lifecycle } : {}),
      isGroup: false,
    })),
    [selectedEntries],
  );
  selectedTokenNodesRef.current = selectedTokenNodes;

  const hasColors = useMemo(
    () => selectedEntries.some(x => x.entry.$type === 'color'),
    [selectedEntries],
  );
  const hasNumeric = useMemo(
    () => selectedEntries.some(x => x.entry.$type === 'dimension' || x.entry.$type === 'number'),
    [selectedEntries],
  );
  const hasScopableTypes = useMemo(
    () => selectedEntries.some(x => !!FIGMA_SCOPE_OPTIONS[x.entry.$type as string]),
    [selectedEntries],
  );

  const handleOpenBulkWorkflowForVisibleTokens = useCallback(() => {
    if (crossCollectionSearch) {
      dispatchToast(
        'Turn off "Search all collections" before bulk editing tokens in this collection.',
        "error",
      );
      return;
    }
    openBulkEditorForPaths(new Set(displayedLeafNodes.map((node) => node.path)));
  }, [
    crossCollectionSearch,
    displayedLeafNodes,
    openBulkEditorForPaths,
  ]);


  useEffect(() => {
    if (selectedPaths.size === 0) {
      setActiveBatchAction(null);
    }
  }, [selectedPaths.size]);

  const handleSetGroupScopes = useCallback(
    (groupPath: string) => {
      const prefix = groupPath + '.';
      const descendantPaths = new Set<string>();
      for (const path of Object.keys(allTokensFlat)) {
        if (path === groupPath || path.startsWith(prefix)) {
          descendantPaths.add(path);
        }
      }
      if (descendantPaths.size === 0) {
        dispatchToast('No tokens in this group.', 'error');
        return;
      }
      setSelectedPaths(descendantPaths);
      setShowBatchEditor(true);
      setActiveBatchAction('figma-scopes');
    },
    [allTokensFlat, setSelectedPaths, setShowBatchEditor],
  );

  // Sync: keyboard handler toggles showBatchEditor (from useTokenSelection).
  // Map that to activeBatchAction so the E key opens/closes the panel.
  useEffect(() => {
    if (showBatchEditor && !activeBatchAction) {
      setActiveBatchAction('set-description');
    } else if (!showBatchEditor && activeBatchAction) {
      setActiveBatchAction(null);
    }
  }, [showBatchEditor, activeBatchAction]);

  const tokenCrud = useTokenCrud({
    connected,
    serverUrl,
    collectionId,
    collectionIds,
    tokens,
    allTokensFlat,
    pathToCollectionId,
    collectionIdsByPath,
    perCollectionFlat,
    collections,
    onRefresh,
    onPushUndo,
    onSetOperationLoading: setOperationLoading,
    onSetLocallyDeletedPaths: setLocallyDeletedPaths,
    onDeletePaths: (paths, targetCollectionId) => {
      for (const path of paths) {
        recentlyTouched.removePath(path, targetCollectionId);
      }
      onRemoveStarredTokens?.(paths, targetCollectionId);
    },
    onRecordTouch: (path) => recentlyTouched.recordTouch(path, collectionId),
    onRenamePath: (oldPath, newPath) => {
      recentlyTouched.renamePath(oldPath, newPath, collectionId);
      onRenameStarredToken?.(oldPath, newPath, collectionId);
    },
    onMovePath: (oldPath, newPath, sourceCollectionId, targetCollectionId) => {
      recentlyTouched.movePath(
        oldPath,
        newPath,
        sourceCollectionId,
        targetCollectionId,
      );
      onMoveStarredToken?.(
        oldPath,
        newPath,
        sourceCollectionId,
        targetCollectionId,
      );
    },
    onClearSelection: clearSelection,
    onError,
  });
  const {
    deleteConfirm,
    setDeleteConfirm,
    renameTokenConfirm,
    setRenameTokenConfirm,
    deleteError,
    setDeleteError,
    pendingRenameToken,
    setPendingRenameToken,
    movingToken,
    setMovingToken,
    dismissMoveToken,
    copyingToken,
    setCopyingToken,
    dismissCopyToken,
    moveTokenTargetCollectionId,
    setMoveTokenTargetCollectionId: _setMoveTokenTargetCollectionId,
    copyTokenTargetCollectionId,
    setCopyTokenTargetCollectionId: _setCopyTokenTargetCollectionId,
    moveConflict,
    copyConflict,
    moveConflictAction,
    setMoveConflictAction,
    copyConflictAction,
    setCopyConflictAction,
    moveConflictNewPath,
    setMoveConflictNewPath,
    copyConflictNewPath,
    setCopyConflictNewPath,
    executeTokenRename,
    handleRenameToken,
    requestDeleteToken,
    requestDeleteGroup,
    requestBulkDelete: requestBulkDeleteFromHook,
    executeDelete,
    handleDuplicateToken,
    handleInlineSave,
    handleDescriptionSave: _handleDescriptionSave,
    handleMultiModeInlineSave,
    handleCopyValueToAllModes,
    handleRequestMoveToken,
    handleConfirmMoveToken,
    handleChangeMoveTokenTargetCollection,
    handleRequestCopyToken,
    handleConfirmCopyToken,
    handleChangeCopyTokenTargetCollection,
  } = tokenCrud;

  // Convert delete errors to toasts
  useEffect(() => {
    if (deleteError) {
      dispatchToast(`Delete failed: ${deleteError}`, "error");
      setDeleteError(null);
    }
  }, [deleteError, setDeleteError]);

  const tokenPromotion = useTokenPromotion({
    connected,
    serverUrl,
    collectionId,
    tokens,
    allTokensFlat,
    selectedPaths,
    onRefresh,
    onClearSelection: clearSelection,
    onError,
  });
  const {
    promoteRows,
    setPromoteRows,
    promoteBusy,
    handleOpenPromoteModal,
    handleConfirmPromote,
  } = tokenPromotion;

  const closeLongLivedReviewSurfaces = useCallback(() => {
    setVarDiffPending(null);
    setPromoteRows(null);
    dismissMoveToken();
    dismissCopyToken();
    setActiveBatchAction(null);
    setShowBatchEditor(false);
    setPendingBatchEditorFocus(null);
  }, [
    dismissCopyToken,
    dismissMoveToken,
    setPromoteRows,
    setShowBatchEditor,
  ]);

  const handleOpenFindReplaceReview = useCallback(() => {
    if (crossCollectionSearch) {
      dispatchToast(
        'Turn off "Search all collections" before bulk renaming tokens in this collection.',
        "error",
      );
      return;
    }
    closeLongLivedReviewSurfaces();
    openBulkEditorForPaths(new Set(displayedLeafNodes.map((node) => node.path)));
    setActiveBatchAction('find-replace');
    setPendingBatchEditorFocus("find-replace");
  }, [
    closeLongLivedReviewSurfaces,
    crossCollectionSearch,
    displayedLeafNodes,
    openBulkEditorForPaths,
  ]);

  const handleOpenPromoteReview = useCallback(
    (paths?: Set<string>) => {
      closeLongLivedReviewSurfaces();
      handleOpenPromoteModal(paths);
    },
    [closeLongLivedReviewSurfaces, handleOpenPromoteModal],
  );

  const handleRequestMoveTokenReview = useCallback(
    (path: string) => {
      closeLongLivedReviewSurfaces();
      handleRequestMoveToken(path);
    },
    [closeLongLivedReviewSurfaces, handleRequestMoveToken],
  );

  const handleRequestCopyTokenReview = useCallback(
    (path: string) => {
      closeLongLivedReviewSurfaces();
      handleRequestCopyToken(path);
    },
    [closeLongLivedReviewSurfaces, handleRequestCopyToken],
  );

  useEffect(() => {
    if (!activeBatchAction || pendingBatchEditorFocus !== "find-replace") return;
    const frameId = window.requestAnimationFrame(() => {
      const input =
        batchEditorPanelRef.current?.querySelector<HTMLInputElement>(
          'input[type="text"]',
        );
      input?.focus();
      input?.select();
      setPendingBatchEditorFocus(null);
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [pendingBatchEditorFocus, activeBatchAction]);

  const handleListKeyDown = useTokenListKeyboardHandler({
    selectedPaths,
    expandedPaths,
    zoomRootPath,
    sortOrder,
    connected,
    navHistoryLength,
    editingTokenPath,
    siblingOrderMap,
    displayedLeafNodesRef,
    selectedTokenNodesRef,
    copyTokensAsJsonRef,
    copyTokensAsPreferredRef,
    copyTokensAsDtcgRefRef,
    lastSelectedPathRef,
    searchRef,
    virtualListRef,
    collectionIds,
    collectionId,
    setSelectedPaths,
    setShowBatchEditor,
    clearSelection,
    setZoomRootPath,
    setVirtualScrollTop,
    setBatchMoveToCollectionTarget,
    setShowBatchMoveToCollection,
    setBatchCopyToCollectionTarget,
    setShowBatchCopyToCollection,
    handleOpenCreateSibling,
    onCreateNew,
    handleToggleExpand,
    handleExpandAll,
    handleCollapseAll,
    handleMoveTokenInGroup,
    handleTokenSelect,
    requestBulkDeleteFromHook,
    onNavigateBack,
    onEdit,
  });

  const clearFilters = useCallback(() => {
    setSearchQuery("");
    setTypeFilter("");
    setRefFilter("all");
    setShowDuplicates(false);
    setCrossCollectionSearch(false);
    setInspectMode(false);
    setShowRecentlyTouched(false);
    setShowStarredOnly(false);
    if (showIssuesOnly && onToggleIssuesOnly) onToggleIssuesOnly();
  }, [
    onToggleIssuesOnly,
    setCrossCollectionSearch,
    setInspectMode,
    setRefFilter,
    setSearchQuery,
    setShowDuplicates,
    setShowRecentlyTouched,
    setShowStarredOnly,
    setTypeFilter,
    showIssuesOnly,
  ]);

  const handleOpenNewGroupDialog = useCallback(() => {
    setNewGroupDialogParent("");
    setNewGroupName("");
    setNewGroupError("");
  }, [setNewGroupDialogParent, setNewGroupName, setNewGroupError]);

  // Merge capabilities from all selected nodes for the property picker
  const selectionCapabilities = useMemo<NodeCapabilities | null>(
    () =>
      selectedNodes.length > 0
        ? {
            hasFills: selectedNodes.some((n) => n.capabilities.hasFills),
            hasStrokes: selectedNodes.some((n) => n.capabilities.hasStrokes),
            hasAutoLayout: selectedNodes.some(
              (n) => n.capabilities.hasAutoLayout,
            ),
            isText: selectedNodes.some((n) => n.capabilities.isText),
            hasEffects: selectedNodes.some((n) => n.capabilities.hasEffects),
          }
        : null,
    [selectedNodes],
  );

  // Extract to alias state — managed by useExtractToAlias hook
  const {
    extractToken,
    setExtractToken,
    extractMode,
    setExtractMode,
    newPrimitivePath,
    setNewPrimitivePath,
    newPrimitiveCollectionId,
    setNewPrimitiveCollectionId,
    existingAlias,
    setExistingAlias,
    existingAliasSearch,
    setExistingAliasSearch,
    extractError,
    setExtractError,
    handleOpenExtractToAlias,
    handleConfirmExtractToAlias,
  } = useExtractToAlias({ connected, serverUrl, collectionId, onRefresh });

  // requestBulkDelete wrapper — passes current selectedPaths
  const requestBulkDelete = useCallback(() => {
    requestBulkDeleteFromHook(selectedPaths);
  }, [requestBulkDeleteFromHook, selectedPaths]);

  const batchOps = useTokenListBatchOperations({
    connected,
    serverUrl,
    collectionId,
    selectedPaths,
    onRefresh,
    onError,
    clearSelection,
    setOperationLoading,
  });

  const handleBatchMoveToGroup = useCallback(async () => {
    await batchOps.handleBatchMoveToGroup(
      moveToGroupTarget,
      setShowMoveToGroup,
      setMoveToGroupError,
    );
  }, [batchOps, moveToGroupTarget]);

  const handleBatchMoveToCollection = useCallback(async () => {
    await batchOps.handleBatchMoveToCollection(
      batchMoveToCollectionTarget,
      setShowBatchMoveToCollection,
    );
  }, [batchOps, batchMoveToCollectionTarget]);

  const handleBatchCopyToCollection = useCallback(async () => {
    await batchOps.handleBatchCopyToCollection(
      batchCopyToCollectionTarget,
      setShowBatchCopyToCollection,
    );
  }, [batchOps, batchCopyToCollectionTarget]);

  // handleTokenSelect, displayedLeafPaths, selectedLeafNodes, handleSelectAll, handleToggleGroupChildren
  // are managed by useTokenSelection (destructured above)

  const {
    copyTokensAsJson,
    copyTokensAsCssVar,
    copyTokensAsDtcgRef,
    copyTokensAsPreferred,
  } = useTokenListClipboard({
    setCopyFeedback,
    setCopyCssFeedback,
    setCopyPreferredFeedback,
    setCopyAliasFeedback,
  });
  copyTokensAsJsonRef.current = copyTokensAsJson;
  copyTokensAsDtcgRefRef.current = copyTokensAsDtcgRef;
  copyTokensAsPreferredRef.current = copyTokensAsPreferred;

  const {
    doApplyVariables,
  } = useTokenListApplyOperations({
    tokens,
    allTokensFlat,
    collectionId,
    collections,
    perCollectionFlat: perCollectionFlat ?? {},
    collectionMap,
    modeMap,
    varReadPendingRef,
    onError,
    setApplying,
    setVarDiffLoading,
    setVarDiffPending,
    closeLongLivedReviewSurfaces,
    sendStyleApply,
  });

  const modalProps = getDeleteModalProps(deleteConfirm);

  // handleJumpToGroup is managed by useTokenVirtualScroll (destructured above)

  const handleRevealPath = useCallback(
    (path: string) => {
      const isGroupPath = tokens.some(
        (node) => node.isGroup && node.path === path,
      );
      setViewMode("tree");
      setZoomRootPath(null);
      setExpandedPaths((prev) => {
        const next = new Set(prev);
        if (groupBy === "type") {
          if (path.startsWith("__type/")) {
            next.add(path);
            return next;
          }
          const entry = allTokensFlat[path];
          if (entry) {
            next.add(getTypeGroupPathForTokenType(entry.$type));
            return next;
          }
        }
        const segments = path.split(".");
        for (let i = 1; i < segments.length; i += 1) {
          next.add(segments.slice(0, i).join("."));
        }
        if (isGroupPath) {
          next.add(path);
        }
        return next;
      });
    },
    [allTokensFlat, groupBy, setExpandedPaths, setViewMode, setZoomRootPath, tokens],
  );

  useLayoutEffect(() => {
    if (!highlightedToken) return;
    handleRevealPath(highlightedToken);
  }, [handleRevealPath, highlightedToken]);

  // Collapse all groups that are descendants of the given group path,
  // keeping the ancestor chain expanded so the group header stays visible
  const handleCollapseBelow = useCallback(
    (groupPath: string) => {
      setExpandedPaths((prev) => {
        const next = new Set(prev);
        const prefix = groupPath + ".";
        for (const p of prev) {
          if (p === groupPath || p.startsWith(prefix)) {
            next.delete(p);
          }
        }
        return next;
      });
      // Jump to the (now-collapsed) group header
      const idx = flatItems.findIndex((item) => item.node.path === groupPath);
      if (idx >= 0 && virtualListRef.current) {
        const targetScrollTop = Math.max(0, itemOffsets[idx]);
        virtualListRef.current.scrollTop = targetScrollTop;
        setVirtualScrollTop(targetScrollTop);
      }
    },
    [flatItems, itemOffsets, setExpandedPaths, setVirtualScrollTop],
  );

  const handleZoomIntoGroup = useCallback(
    (groupPath: string) => {
      if (groupBy !== "path") return;
      setZoomRootPath(groupPath);
      // Ensure the zoom target's children are visible
      setExpandedPaths((prev) => {
        const next = new Set(prev);
        next.add(groupPath);
        return next;
      });
      setVirtualScrollTop(0);
      if (virtualListRef.current) virtualListRef.current.scrollTop = 0;
    },
    [groupBy, setExpandedPaths, setVirtualScrollTop, setZoomRootPath],
  );

  const handleZoomOut = useCallback(() => {
    setZoomRootPath(null);
    setVirtualScrollTop(0);
    if (virtualListRef.current) virtualListRef.current.scrollTop = 0;
  }, [setVirtualScrollTop, setZoomRootPath]);

  const handleZoomToAncestor = useCallback(
    (ancestorPath: string) => {
      setZoomRootPath(ancestorPath || null);
      if (ancestorPath) {
        setExpandedPaths((prev) => {
          const next = new Set(prev);
          next.add(ancestorPath);
          return next;
        });
      }
      setVirtualScrollTop(0);
      if (virtualListRef.current) virtualListRef.current.scrollTop = 0;
    },
    [setExpandedPaths, setVirtualScrollTop, setZoomRootPath],
  );

  // Virtual scroll window computation — uses itemOffsets for variable-height rows
  const virtualContainerH = virtualListRef.current?.clientHeight ?? 500;
  const totalVirtualH = itemOffsets[flatItems.length];
  // Find the first item whose bottom edge is below virtualScrollTop
  let rawStart = 0;
  while (
    rawStart < flatItems.length &&
    itemOffsets[rawStart + 1] <= virtualScrollTop
  )
    rawStart++;
  // Find the first item whose top edge is past the bottom of the viewport
  let rawEnd = rawStart;
  while (
    rawEnd < flatItems.length &&
    itemOffsets[rawEnd] < virtualScrollTop + virtualContainerH
  )
    rawEnd++;
  const virtualStartIdx = Math.max(0, rawStart - VIRTUAL_OVERSCAN);
  const virtualEndIdx = Math.min(flatItems.length, rawEnd + VIRTUAL_OVERSCAN);
  const virtualTopPad = itemOffsets[virtualStartIdx];
  const virtualBottomPad = Math.max(
    0,
    totalVirtualH - itemOffsets[virtualEndIdx],
  );

  // Breadcrumb: build ancestor path segments for the first visible item
  // Map group paths → display names from the flat items list
  const groupNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const { node } of flatItems) {
      if (node.isGroup) map.set(node.path, node.name);
    }
    return map;
  }, [flatItems]);

  const zoomNavigation = useMemo(() => {
    if (!zoomRootPath) return null;
    return buildZoomBranchNavigation(zoomRootPath, sortedTokens);
  }, [zoomRootPath, sortedTokens]);

  const zoomBreadcrumb = zoomNavigation?.breadcrumb ?? null;
  const zoomParentPath = zoomNavigation?.parent?.path ?? null;
  const zoomSiblingBranches = zoomNavigation?.siblings ?? [];

  const handleZoomUpOneLevel = useCallback(() => {
    if (!zoomParentPath) return;
    handleZoomToAncestor(zoomParentPath);
  }, [handleZoomToAncestor, zoomParentPath]);

  const breadcrumbSegments = useMemo(() => {
    if (flatItems.length === 0 || rawStart >= flatItems.length) return [];
    const topItem = flatItems[rawStart];
    if (topItem.depth === 0) return [];
    // Walk up the ancestor chain from the top visible item
    const segments: Array<{ name: string; path: string }> = [];
    let currentPath = topItem.node.path;
    let currentName = topItem.node.name;
    while (currentPath.length > currentName.length) {
      const parentPath = currentPath.slice(
        0,
        currentPath.length - currentName.length - 1,
      );
      if (!parentPath) break;
      const parentName = groupNameMap.get(parentPath);
      if (parentName) {
        segments.unshift({ name: parentName, path: parentPath });
        currentPath = parentPath;
        currentName = parentName;
      } else {
        break;
      }
    }
    return segments;
  }, [flatItems, rawStart, groupNameMap]);

  const handleCompareAcrossCollections = useCallback(
    (path: string) => {
      if (onOpenCrossCollectionCompare) {
        onOpenCrossCollectionCompare(path);
      }
    },
    [onOpenCrossCollectionCompare],
  );

  // Expose imperative actions to the parent via compareHandle ref
  useEffect(() => {
    if (!compareHandle) return;
    compareHandle.current = {
      openCompareMode: () => {
        setActiveBatchAction(null);
      },
      revealPath: (path: string) => {
        handleRevealPath(path);
      },
      showRecentlyTouched: () => {
        setShowRecentlyTouched(true);
      },
      toggleJsonView: () => {
        setViewMode(viewMode === "json" ? "tree" : "json");
      },
      toggleResolvedValues: () => {
        setViewMode("tree");
        setShowResolvedValues((v) => !v);
      },
      triggerInlineRename: (path: string) => {
        setPendingRenameToken(path);
      },
      triggerMoveToken: (path: string) => {
        handleRequestMoveTokenReview(path);
      },
      triggerExtractToAlias: (
        path: string,
        $type?: string,
        $value?: unknown,
      ) => {
        handleOpenExtractToAlias(path, $type, $value);
      },
    };
    return () => {
      compareHandle.current = null;
    };
  }, [
    compareHandle,
    handleRevealPath,
    setShowRecentlyTouched,
    viewMode,
    setViewMode,
    setShowResolvedValues,
    setPendingRenameToken,
    handleRequestMoveTokenReview,
    handleOpenExtractToAlias,
  ]);

  const handleClearPendingRename = useCallback(
    () => setPendingRenameToken(null),
    [setPendingRenameToken],
  );

  // Effective roving focus path: if none has been set yet, default to the first visible row
  // so Tab-into-tree always lands on a meaningful starting point.
  const effectiveRovingPath =
    rovingFocusPath ?? flatItems[0]?.node.path ?? null;

  const effectiveAllTokensFlat = allTokensFlat;

  const tokenTreeSharedData = useTokenTreeSharedData({
    effectiveAllTokensFlat,
    modeResolvedTokensFlat: allTokensFlat,
    pathToCollectionId,
    collectionIdsByPath,
    perCollectionFlat,
    collections,
  });
  const tokenTreeGroupState = useTokenTreeGroupState({
    collectionId, groupBy, selectionActive, selectedPaths, expandedPaths, highlightedToken,
    searchHighlight, dragOverGroup, dragOverGroupIsInvalid, dragSource,
    collectionCoverage,
    effectiveRovingPath,
  });

  const tokenTreeGroupActions = useTokenTreeGroupActions({
    handleToggleExpand, requestDeleteGroup, handleOpenCreateSibling,
    setNewGroupDialogParent, handleRenameGroup, handleUpdateGroupMeta,
    handleRequestMoveGroup, handleRequestCopyGroup, handleDuplicateGroup,
    onPublishGroup, onSetGroupScopes: handleSetGroupScopes,
    handleZoomIntoGroup, handleDragOverGroup, handleDropOnGroup,
    onNavigateToAlias, handleToggleGroupSelection: handleToggleGroupChildren,
    setRovingFocusPath,
  });

  const tokenTreeLeafState = useTokenTreeLeafState({
    serverUrl, collectionId, collectionIds, groupBy, selectionCapabilities, duplicateCounts,
    selectionActive, highlightedToken, inspectMode, syncSnapshot,
    searchHighlight, selectedNodes, boundTokenPaths, dragOverReorder, selectedLeafNodes,
    showResolvedValues,
    starredPaths,
    collections: activeCollections,
    pendingRenameToken, pendingTabEdit, effectiveRovingPath, showDuplicates,
    tokenModeMissing,
  });

  const tokenTreeLeafActions = useTokenTreeLeafActions({
    onEdit, requestDeleteToken, handleTokenSelect, onNavigateToAlias,
    onRefresh, onPushUndo, handleRequestMoveTokenReview, handleRequestCopyTokenReview,
    handleDuplicateToken, handleOpenExtractToAlias,
    handleHoverToken, setTypeFilter, handleInlineSave, handleRenameToken,
    onViewTokenHistory,
    onOpenTokenIssues,
    collectionsLength: activeCollections.length,
    handleCompareAcrossCollections,
    handleDragStartNotify: handleDragStart,
    handleDragEndNotify: handleDragEnd,
    handleDragOverToken, handleDragLeaveToken, handleDropReorder,
    multiModeData, handleMultiModeInlineSave, handleCopyValueToAllModes,
    onToggleStar,
    handleClearPendingRename, handleClearPendingTabEdit, handleTabToNext,
    setRovingFocusPath,
  });

  const modalContextValue = useTokenListModalContext({
    collectionId, collectionIds, collectionDisplayNames: collectionMap, allTokensFlat, connected,
    deleteConfirm, modalProps, executeDelete, setDeleteConfirm,
    newGroupDialogParent, newGroupName, newGroupError,
    setNewGroupName, setNewGroupError, handleCreateGroup, setNewGroupDialogParent,
    renameTokenConfirm, executeTokenRename, setRenameTokenConfirm,
    renameGroupConfirm, executeGroupRename, setRenameGroupConfirm,
    varDiffPending, doApplyVariables, setVarDiffPending,
    extractToken, extractMode, setExtractMode,
    newPrimitivePath, setNewPrimitivePath, newPrimitiveCollectionId, setNewPrimitiveCollectionId,
    existingAlias, setExistingAlias, existingAliasSearch, setExistingAliasSearch,
    extractError, setExtractError, handleConfirmExtractToAlias, setExtractToken,
    promoteRows, promoteBusy, setPromoteRows, handleConfirmPromote,
    movingToken, movingGroup, moveGroupTargetCollectionId, moveTokenTargetCollectionId,
    setMoveGroupTargetCollectionId, handleChangeMoveTokenTargetCollection,
    setMovingToken, setMovingGroup, handleConfirmMoveToken, handleConfirmMoveGroup,
    moveConflict, moveConflictAction, setMoveConflictAction,
    moveConflictNewPath, setMoveConflictNewPath,
    copyingToken, copyingGroup, copyGroupTargetCollectionId, copyTokenTargetCollectionId,
    setCopyGroupTargetCollectionId, handleChangeCopyTokenTargetCollection,
    setCopyingToken, setCopyingGroup, handleConfirmCopyToken, handleConfirmCopyGroup,
    copyConflict, copyConflictAction, setCopyConflictAction,
    copyConflictNewPath, setCopyConflictNewPath,
    showMoveToGroup, moveToGroupTarget, moveToGroupError, selectedPaths,
    perCollectionFlat: perCollectionFlat ?? {},
    setShowMoveToGroup, setMoveToGroupTarget, setMoveToGroupError,
    handleBatchMoveToGroup,
    showBatchMoveToCollection, batchMoveToCollectionTarget, setBatchMoveToCollectionTarget,
    setShowBatchMoveToCollection, handleBatchMoveToCollection,
    showBatchCopyToCollection, batchCopyToCollectionTarget, setBatchCopyToCollectionTarget,
    setShowBatchCopyToCollection, handleBatchCopyToCollection,
  });

  // Stable callbacks for review overlay panel actions
  const handleCloseVarDiff = useCallback(() => setVarDiffPending(null), []);
  const handleApplyVarDiff = useCallback(() => {
    if (varDiffPending) {
      doApplyVariables(varDiffPending.flat);
      setVarDiffPending(null);
    }
  }, [varDiffPending, doApplyVariables]);
  const handleClosePromote = useCallback(() => setPromoteRows(null), [setPromoteRows]);
  const handleCloseMove = useCallback(() => dismissMoveToken(), [dismissMoveToken]);
  const handleCloseCopy = useCallback(() => dismissCopyToken(), [dismissCopyToken]);
  const moveSourceToken = movingToken ? (allTokensFlat[movingToken] ?? null) : null;
  const copySourceToken = copyingToken ? (allTokensFlat[copyingToken] ?? null) : null;

  return (
    <div
      className="relative flex h-full min-h-0 flex-col"
      onKeyDown={handleListKeyDown}
    >
      {/* Copy feedback toast (⌘⌥C alias-ref or ⌘⇧C preferred-format) */}
      {(copyAliasFeedback || copyPreferredFeedback) && (
        <div
          className="absolute top-2 left-1/2 -translate-x-1/2 z-50 pointer-events-none px-3 py-1 rounded bg-[var(--color-figma-bg-brand,var(--color-figma-action-bg))] text-[color:var(--color-figma-text-onbrand)] text-body font-medium shadow-md"
          aria-live="polite"
        >
          Copied!
        </div>
      )}
      {/* Toolbars — fixed above the scrollable token list */}
      <div className="flex-shrink-0">
        {/* Selection toolbar */}
        {selectionActive && (
          <TokenSelectionToolbar
            selectedPaths={selectedPaths}
            displayedLeafPaths={displayedLeafPaths}
            collectionIds={collectionIds}
            operationLoading={operationLoading}
            activeBatchAction={activeBatchAction}
            hasColors={hasColors}
            hasNumeric={hasNumeric}
            hasScopableTypes={hasScopableTypes}
            copyFeedback={copyFeedback}
            copyCssFeedback={copyCssFeedback}
            copyAliasFeedback={copyAliasFeedback}
            onSelectAll={handleSelectAll}
            onSetBatchAction={setActiveBatchAction}
            onRequestBulkDelete={requestBulkDelete}
            onClearSelection={handleClearSelection}
            onCopyJson={() => {
              copyTokensAsJson(selectedTokenNodes);
            }}
            onCopyCssVar={() => {
              copyTokensAsCssVar(selectedTokenNodes);
            }}
            onCopyDtcgRef={() => {
              copyTokensAsDtcgRef(selectedTokenNodes);
            }}
            onMoveToGroup={() => {
              setMoveToGroupTarget("");
              setMoveToGroupError("");
              setShowMoveToGroup(true);
            }}
            onMoveToCollection={() => {
              setBatchMoveToCollectionTarget(
                collectionIds.filter((s) => s !== collectionId)[0] ?? "",
              );
              setShowBatchMoveToCollection(true);
            }}
            onCopyToCollection={() => {
              setBatchCopyToCollectionTarget(
                collectionIds.filter((s) => s !== collectionId)[0] ?? "",
              );
              setShowBatchCopyToCollection(true);
            }}
            onCompare={selectedPaths.size >= 2 && onOpenCompare ? () => onOpenCompare(selectedPaths) : undefined}
            onLinkToTokens={() => handleOpenPromoteReview()}
          />
        )}

        {/* Active batch action panel */}
        {selectionActive && activeBatchAction && selectedPaths.size > 0 && (
          <div ref={batchEditorPanelRef}>
            <BatchActionPanel
              action={activeBatchAction}
              selectedPaths={selectedPaths}
              selectedEntries={selectedEntries}
              allTokensFlat={allTokensFlat}
              collectionTokensFlat={currentCollectionFlat}
              collectionId={collectionId}
              serverUrl={serverUrl}
              connected={connected}
              onApply={onRefresh}
              onPushUndo={onPushUndo}
              onSelectedPathsChange={handleBatchActionSelectionChange}
            />
          </div>
        )}

        {/* Toolbar — search is primary, while arrangement and filters stay secondary. */}
        {!selectionActive && (
          <TokenListToolbar
            onNavigateBack={onNavigateBack}
            navHistoryLength={navHistoryLength}
            zoomRootPath={zoomRootPath}
            searchRef={searchRef}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            hintIndex={hintIndex}
            setHintIndex={setHintIndex}
            showQualifierHints={showQualifierHints}
            setShowQualifierHints={setShowQualifierHints}
            qualifierHints={qualifierHints}
            activeQueryToken={activeQueryToken}
            searchTooltip={searchTooltip}
            qualifierHintsRef={qualifierHintsRef}
            toolbarStateChips={toolbarStateChips}
            connected={connected}
            hasTokens={tokens.length > 0}
            viewMode={viewMode}
            setViewMode={setViewMode}
            groupBy={groupBy}
            setGroupBy={setGroupBy}
            selectedNodeCount={selectedNodes.length}
            boundTokenCount={boundTokenPaths.size}
            inspectMode={inspectMode}
            onToggleInspectMode={() => setInspectMode((v) => !v)}
            openTableCreate={openTableCreate}
            onCreateToken={() => onCreateNew?.()}
            onCreateGenerator={onCreateGenerator}
            handleOpenNewGroupDialog={handleOpenNewGroupDialog}
            onBulkEdit={handleOpenBulkWorkflowForVisibleTokens}
            onFindReplace={handleOpenFindReplaceReview}
            overflowMenuProps={tokens.length > 0 || collectionIds.length > 1 ? {
              sortOrder,
              onSortOrderChange: setSortOrder,
              onExpandAll: handleExpandAll,
              onCollapseAll: handleCollapseAll,
              hasGroups: groupBy === "type" ? groupedDisplayedTokens.length > 0 : tokens.some((n) => n.isGroup),
              allGroupsExpanded,
              canToggleSearchResultPresentation: canToggleSearchResultPresentation && !crossCollectionSearch,
              searchResultPresentation,
              onSearchResultPresentationChange: setSearchResultPresentation,
              showIssuesOnly: showIssuesOnly ?? false,
              onToggleIssuesOnly,
              lintCount: lintViolations.length,
              recentlyTouchedCount: recentlyTouched.count,
              showRecentlyTouched,
              onToggleRecentlyTouched: () => setShowRecentlyTouched((v) => !v),
              starredCount: starredPaths?.size ?? 0,
              showStarredOnly,
              onToggleStarredOnly: () => setShowStarredOnly((v) => !v),
              inspectMode,
              onToggleInspectMode: () => setInspectMode((v) => !v),
              crossCollectionSearch,
              onToggleCrossCollectionSearch: () => setCrossCollectionSearch(!crossCollectionSearch),
              hasMultipleCollections: collectionIds.length > 1,
              refFilter,
              onRefFilterChange: setRefFilter,
              showDuplicates,
              onToggleDuplicates: () => setShowDuplicates(!showDuplicates),
              activeCount: filterMenuActiveCount,
            } : null}
          />
        )}
      </div>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {searchQuery ? `${displayedLeafNodes.length} tokens found` : ""}
      </div>
      {/* Operation loading indicator */}
      {operationLoading && (
        <div className="shrink-0 flex items-center gap-1.5 px-3 py-1 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-secondary text-[color:var(--color-figma-text-secondary)]">
          <Spinner size="xs" />
          <span>{operationLoading}</span>
        </div>
      )}
      {/* Scrollable token content with virtual scroll */}
      <div className="relative flex-1 min-h-0">
        <div
          ref={virtualListRef}
          role="tree"
          aria-label="Token tree"
          aria-multiselectable="true"
          className={`h-full overflow-auto${operationLoading ? " opacity-50 pointer-events-none" : ""}`}
          onScroll={(e) => {
            const top = e.currentTarget.scrollTop;
            virtualScrollTopRef.current = top;
            setVirtualScrollTop(top);
          }}
        >
        <TokenTreeProvider
          sharedData={tokenTreeSharedData}
          groupState={tokenTreeGroupState}
          groupActions={tokenTreeGroupActions}
          leafState={tokenTreeLeafState}
          leafActions={tokenTreeLeafActions}
        >
          <TokenListTreeBody
            viewMode={viewMode}
            jsonEditorProps={{
              jsonText,
              jsonDirty,
              jsonError,
              jsonSaving,
              jsonBrokenRefs,
              jsonTextareaRef,
              searchQuery,
              connected,
              onChange: handleJsonChange,
              onSave: handleJsonSave,
              onRevert: handleJsonRevert,
            }}
            search={{
              query: searchQuery,
              highlight: searchHighlight,
              availableTypes,
              typeFilter,
              filtersActive,
              setQuery: setSearchQuery,
              setTypeFilter,
              addQualifierValue: addQueryQualifierValue,
              insertQualifier: insertSearchQualifier,
            }}
            crossCollection={{
              active: crossCollectionSearch,
              hasCriteria: hasCrossCollectionCriteria,
              loading: crossCollectionLoading,
              error: crossCollectionError,
              results: crossCollectionResults,
              total: crossCollectionTotal,
              setOffset: setCrossCollectionOffset,
              retry: retryCrossCollectionSearch,
              pageSize: CROSS_COLLECTION_PAGE_SIZE,
            }}
            virtualScroll={{
              items: flatItems,
              startIdx: virtualStartIdx,
              endIdx: virtualEndIdx,
              topPad: virtualTopPad,
              bottomPad: virtualBottomPad,
            }}
            multiMode={{
              data: multiModeData,
              getValues: getMultiModeValues,
              serverUrl,
              onMutated: onRefresh,
            }}
            zoom={{
              breadcrumb: zoomBreadcrumb,
              parentPath: zoomParentPath,
              siblingBranches: zoomSiblingBranches,
              zoomUpOneLevel: handleZoomUpOneLevel,
              zoomOut: handleZoomOut,
              zoomToAncestor: handleZoomToAncestor,
              breadcrumbSegments,
              jumpToGroup: handleJumpToGroup,
              collapseBelow: handleCollapseBelow,
            }}
            navigation={{
              onNavigateToCollection,
              onCreateNew,
              onCreateGroup: handleOpenNewGroupDialog,
              onOpenImportPanel,
              onExtractFromSelection,
              hasSelection: selectedNodes.length > 0,
            }}
            inspectMode={inspectMode}
            selectedNodes={selectedNodes}
            tokens={tokens}
            displayedTokens={groupedDisplayedTokens}
            selectedPaths={selectedPaths}
            displayedLeafPaths={displayedLeafPaths}
            onSelectAll={handleSelectAll}
            sortOrder={sortOrder}
            connected={connected}
            siblingOrderMap={siblingOrderMap}
            showRecentlyTouched={showRecentlyTouched}
            showFlatSearchResults={showFlatSearchResults}
            lintViolationsMap={lintViolationsMap}
            expandedChains={expandedChains}
            handleMoveTokenInGroup={handleMoveTokenInGroup}
            clearFilters={clearFilters}
            collectionDisplayNames={collectionMap}
          />
        </TokenTreeProvider>
        </div>

        <TokenListReviewOverlays
          showBatchEditor={activeBatchAction !== null}
          varDiffPending={varDiffPending}
          onCloseVarDiff={handleCloseVarDiff}
          onApplyVarDiff={handleApplyVarDiff}
          promoteRows={promoteRows}
          promoteBusy={promoteBusy}
          onPromoteRowsChange={setPromoteRows}
          onConfirmPromote={handleConfirmPromote}
          onClosePromote={handleClosePromote}
          movingToken={movingToken}
          collectionId={collectionId}
          collectionIds={collectionIds}
          moveTokenTargetCollectionId={moveTokenTargetCollectionId}
          onChangeMoveTokenTargetCollection={handleChangeMoveTokenTargetCollection}
          moveConflict={moveConflict}
          moveConflictAction={moveConflictAction}
          onMoveConflictActionChange={setMoveConflictAction}
          moveConflictNewPath={moveConflictNewPath}
          onMoveConflictNewPathChange={setMoveConflictNewPath}
          moveSourceToken={moveSourceToken}
          onConfirmMoveToken={handleConfirmMoveToken}
          onCloseMove={handleCloseMove}
          copyingToken={copyingToken}
          copyTokenTargetCollectionId={copyTokenTargetCollectionId}
          onChangeCopyTokenTargetCollection={handleChangeCopyTokenTargetCollection}
          copyConflict={copyConflict}
          copyConflictAction={copyConflictAction}
          onCopyConflictActionChange={setCopyConflictAction}
          copyConflictNewPath={copyConflictNewPath}
          onCopyConflictNewPathChange={setCopyConflictNewPath}
          copySourceToken={copySourceToken}
          onConfirmCopyToken={handleConfirmCopyToken}
          onCloseCopy={handleCloseCopy}
        />
      </div>

      {/* Table create mode */}
      {showTableCreate && (
        <TableCreateForm
          collectionId={collectionId}
          collectionLabel={getCollectionDisplayName(collectionId, collectionMap)}
          collectionModeNames={activeCollections[0]?.modes.map((mode) => mode.name) ?? []}
          tableGroup={tableGroup}
          onSetTableGroup={setTableGroup}
          tableRows={tableRows}
          rowErrors={rowErrors}
          createAllError={createAllError}
          busy={tableCreateBusy}
          hasDraft={tableCreateHasDraft}
          connected={connected}
          allGroupPaths={allGroupPaths}
          tableSuggestions={tableSuggestions}
          onAddRow={addTableRow}
          onRemoveRow={removeTableRow}
          onUpdateRow={updateTableRow}
          onUpdateModeValue={updateTableModeValue}
          onCopyFirstModeToEmptyModes={copyFirstModeToEmptyModes}
          onClose={closeTableCreate}
          onRestoreDraft={restoreTableDraft}
          onDismissDraft={dismissTableDraft}
          onCreateAll={handleCreateAll}
        />
      )}

      <TokenListModalsProvider value={modalContextValue}>
        <TokenListModals />
      </TokenListModalsProvider>
    </div>
  );
}
