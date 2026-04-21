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
import { stableStringify } from "../shared/utils";
import { apiFetch } from "../shared/apiFetch";
import {
  STORAGE_KEY_BUILDERS,
  lsGet,
  lsRemove,
  lsSet,
} from "../shared/storage";
import {
  flattenVisible,
  pruneDeletedPaths,
  sortTokenNodes,
  collectAllGroupPaths,
  flattenLeafNodes,
  findGroupByPath,
  buildZoomBranchNavigation,
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
import { useFindReplace } from "../hooks/useFindReplace";
import { useDragDrop } from "../hooks/useDragDrop";
import { useGroupOperations } from "../hooks/useGroupOperations";
import { useTokenPromotion } from "../hooks/useTokenPromotion";
import { useTokenCrud } from "../hooks/useTokenCrud";
import { useFigmaMessage } from "../hooks/useFigmaMessage";
import { extractSyncApplyResult } from "../hooks/useTokenSyncBase";
import { useTokenWhereIs } from "../hooks/useTokenWhereIs";
import { useTokenExpansion } from "../hooks/useTokenExpansion";
import { useTokenVirtualScroll } from "../hooks/useTokenVirtualScroll";
import { useTokenSearch } from "../hooks/useTokenSearch";
import { useTokenSelection } from "../hooks/useTokenSelection";
import { useJsonEditor } from "../hooks/useJsonEditor";
import { useTokenListViewState } from "../hooks/useTokenListViewState";
import { useBoundTokenPaths } from "../hooks/useBoundTokenPaths";
import { LibrarySelectionStrip } from "./library/LibrarySelectionStrip";
import { applyModeSelectionsToTokens } from "../shared/collectionModeUtils";
import { dispatchToast } from "../shared/toastBus";
import { getGeneratedGroupKeepUpdatedAvailability, getGeneratedGroupTypeLabel } from "../shared/generatedGroupUtils";
import { TokenListToolbar } from "./TokenListToolbar";
import { SelectModeToolbar } from "./SelectModeToolbar";
import { TableCreateForm } from "./TableCreateForm";
import { WhereIsOverlay } from "./WhereIsOverlay";
import {
  TokenListReviewOverlays,
} from "./token-list/TokenListStates";
import { TokenListStatsBar } from "./token-list/TokenListStatsBar";
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
import { TokenListStaleGeneratedBanner } from "./token-list/TokenListStaleGeneratedBanner";
import {
  useTokenTreeSharedData,
  useTokenTreeGroupState,
  useTokenTreeGroupActions,
  useTokenTreeLeafState,
  useTokenTreeLeafActions,
} from "./token-list/useTokenTreeContextValues";
import { createGeneratedGroupDuplicateDraft } from "../hooks/useGeneratedGroupEditor";

const EMPTY_PATH_SET = new Set<string>();
const TOKENS_LIBRARY_BODY_SURFACE = "library-body";

function getInlineModeValues(
  entry: TokenMapEntry | undefined,
  collectionId: string,
): Record<string, unknown> {
  const modes = entry?.$extensions?.tokenmanager?.modes;
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

type BulkEditScope = {
  source: "current-scope" | "saved-preset";
  title: string;
  detail: string;
};

type PendingBulkPresetLaunch = {
  presetId: string;
  presetName: string;
  query: string;
};

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
    generators,
    generatorsByTargetGroup,
    derivedTokenPaths,
    tokenUsageCounts,
    perCollectionFlat,
    collectionMap = {},
    modeMap = {},
    collections = [],
    unresolvedAllTokensFlat,
    pathToCollectionId = {},
  },
  actions: {
    onEdit,
    onPreview,
    onCreateNew,
    onRefresh,
    onPushUndo,
    onTokenCreated,
    onNavigateToAlias,
    onNavigateBack,
    navHistoryLength,
    onClearHighlight,
    onPublishGroup,
    onSetGroupScopes,
    onCreateGeneratedGroupFromGroup,
    onRefreshGeneratedGroups,
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
    onEditGeneratedGroup,
    onOpenGeneratedGroupEditor,
    onNavigateToGeneratedGroup,
    onNavigateToNewGeneratedGroup,
    onDisplayedLeafNodesChange,
    onSelectionChange,
    onOpenCompare,
    onOpenCrossCollectionCompare,
    onOpenCommandPaletteWithQuery,
    onShowPasteModal,
    onOpenImportPanel,
    onOpenCreateCollection,
    onOpenStartHere: _onOpenStartHere,
    onTogglePreviewSplit,
  },
  recentlyTouched,
  defaultCreateOpen: _defaultCreateOpen,
  highlightedToken,
  showIssuesOnly,
  showPreviewSplit = false,
  editingTokenPath,
  compareHandle,
  collectionHealthSummary,
  onOpenHealth,
}: TokenListProps) {
  const librarySurfaceSlot = TOKENS_LIBRARY_BODY_SURFACE;
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
  // Find/replace state is managed by useFindReplace hook (called below after dependencies)
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
  const activeCollectionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const path of Object.keys(allTokensFlat)) {
      const tokenCollectionId = pathToCollectionId[path];
      if (tokenCollectionId && tokenCollectionId !== collectionId) {
        continue;
      }
      if (tokenCollectionId) {
        ids.add(tokenCollectionId);
      }
    }
    return ids;
  }, [allTokensFlat, pathToCollectionId, collectionId]);
  const activeCollections = useMemo(
    () =>
      collections.filter((collection) =>
        activeCollectionIds.has(collection.id) || collection.id === collectionId,
      ),
    [activeCollectionIds, collections, collectionId],
  );
  const viewState = useTokenListViewState({
    collectionId,
    collections: activeCollections,
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
    sortOrder,
    setSortOrder,
    showResolvedValues,
    setShowResolvedValues,
    statsBarOpen,
    setStatsBarOpen,
    rowHeight,
    multiModeDimId,
    setMultiModeDimId,
  } = viewState;
  const [runningStaleGenerators, setRunningStaleGenerators] = useState(false);
  const [activeBulkEditScope, setActiveBulkEditScope] =
    useState<BulkEditScope | null>(null);
  const [pendingBulkPresetLaunch, setPendingBulkPresetLaunch] =
    useState<PendingBulkPresetLaunch | null>(null);
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

  const staleGeneratorsForSet = useMemo(
    () =>
      (generators ?? []).filter(
        (generator) =>
          generator.targetCollection === collectionId && generator.isStale === true,
      ),
    [generators, collectionId],
  );

  const staleGeneratorBannerStorageKey = useMemo(
    () => STORAGE_KEY_BUILDERS.staleGeneratedBannerDismissed(collectionId),
    [collectionId],
  );

  const staleGeneratorSignature = useMemo(
    () =>
      stableStringify(
        staleGeneratorsForSet.map((generator) => ({
          id: generator.id,
          sourceToken: generator.sourceToken ?? null,
          currentSourceValue: generator.sourceToken
            ? (allTokensFlat[generator.sourceToken]?.$value ?? null)
            : null,
          lastRunAt: generator.lastRunAt ?? null,
          lastRunSourceValue: generator.lastRunSourceValue ?? null,
        })),
      ),
    [staleGeneratorsForSet, allTokensFlat],
  );

  const [
    dismissedStaleGeneratorSignature,
    setDismissedStaleGeneratorSignature,
  ] = useState<string | null>(() =>
    lsGet(STORAGE_KEY_BUILDERS.staleGeneratedBannerDismissed(collectionId)),
  );

  // Expand/collapse state managed by useTokenExpansion (called below)
  const batchEditorPanelRef = useRef<HTMLDivElement>(null);
  const virtualListRef = useRef<HTMLDivElement>(null);
  // Refs for values defined later in the component, used inside handleListKeyDown to avoid TDZ
  const displayedLeafNodesRef = useRef<TokenNode[]>([]);
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

  useEffect(() => {
    setDismissedStaleGeneratorSignature(lsGet(staleGeneratorBannerStorageKey));
  }, [staleGeneratorBannerStorageKey]);

  useEffect(() => {
    if (staleGeneratorsForSet.length === 0) {
      if (dismissedStaleGeneratorSignature !== null) {
        setDismissedStaleGeneratorSignature(null);
        lsRemove(staleGeneratorBannerStorageKey);
      }
      return;
    }
    if (
      dismissedStaleGeneratorSignature !== null &&
      dismissedStaleGeneratorSignature !== staleGeneratorSignature
    ) {
      setDismissedStaleGeneratorSignature(null);
      lsRemove(staleGeneratorBannerStorageKey);
    }
  }, [
    dismissedStaleGeneratorSignature,
    staleGeneratorBannerStorageKey,
    staleGeneratorSignature,
    staleGeneratorsForSet.length,
  ]);

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
    if (!tokenUsageCounts || Object.keys(tokenUsageCounts).length === 0)
      return undefined;
    // Collect all alias target paths from allTokensFlat
    const referencedPaths = new Set<string>();
    const collectRefs = (value: unknown) => {
      if (typeof value === "string") {
        const m = value.match(/^\{([^}]+)\}$/);
        if (m) referencedPaths.add(m[1]);
      } else if (Array.isArray(value)) {
        for (const item of value) collectRefs(item);
      } else if (value && typeof value === "object") {
        for (const v of Object.values(value as Record<string, unknown>))
          collectRefs(v);
      }
    };
    for (const entry of Object.values(allTokensFlat)) collectRefs(entry.$value);
    // Tokens with 0 Figma usage count AND not referenced by another token
    const paths = new Set<string>();
    for (const path of Object.keys(allTokensFlat)) {
      if ((tokenUsageCounts[path] ?? 0) === 0 && !referencedPaths.has(path)) {
        paths.add(path);
      }
    }
    return paths.size > 0 ? paths : undefined;
  }, [tokenUsageCounts, allTokensFlat]);

  // Stats computed from allTokensFlat (cross-set) and perCollectionFlat for the stats bar
  const statsByType = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const entry of Object.values(allTokensFlat)) {
      const t = entry.$type || "unknown";
      counts[t] = (counts[t] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [allTokensFlat]);

  const statsTotalTokens = useMemo(
    () => Object.keys(allTokensFlat).length,
    [allTokensFlat],
  );


  // Compute per-mode resolved token maps for the selected dimension. Always
  // produces at least one column — single-mode collections get one result,
  // multi-mode collections get N. Returns null only when no collection is
  // selected yet (e.g. during initial load).
  const multiModeData = useMemo(() => {
    if (
      !multiModeDimId ||
      !unresolvedAllTokensFlat ||
      activeCollections.length === 0
    )
      return null;
    const collection = activeCollections.find(
      (candidate) => candidate.id === multiModeDimId,
    );
    if (!collection || collection.modes.length === 0) return null;

    const results: Array<{
      optionName: string;
      collectionId: string;
      resolved: Record<string, TokenMapEntry>;
    }> = [];
    for (const option of collection.modes) {
      results.push({
        optionName: option.name,
        collectionId: collection.id,
        resolved: applyModeSelectionsToTokens(
          unresolvedAllTokensFlat,
          collections,
          { [collection.id]: option.name },
          pathToCollectionId,
        ),
      });
    }
    return { collection, results };
  }, [
    multiModeDimId,
    unresolvedAllTokensFlat,
    activeCollections,
    collections,
    pathToCollectionId,
  ]);

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
          targetCollectionId: pathToCollectionId[tokenPath] ?? null,
        };
      });
    },
    [multiModeData, pathToCollectionId],
  );

  // Pre-compute per-group collection coverage and per-token missing mode counts.
  const totalOptionCount = useMemo(
    () =>
      activeCollections.length > 0
        ? activeCollections.reduce((sum, collection) => sum + collection.modes.length, 0)
        : 0,
    [activeCollections],
  );

  const tokenModeMissing = useMemo(() => {
    if (activeCollections.length === 0 || totalOptionCount === 0)
      return undefined;
    const map = new Map<string, number>();
    for (const [path, entry] of Object.entries(allTokensFlat)) {
      let filled = 0;
      for (const collection of activeCollections) {
        const collectionModes = getInlineModeValues(entry, collection.id);
        for (let i = 0; i < collection.modes.length; i++) {
          const mode = collection.modes[i];
          const v = i === 0 ? entry.$value : collectionModes[mode.name];
          if (v !== undefined && v !== null && v !== "") filled++;
        }
      }
      const missing = totalOptionCount - filled;
      if (missing > 0) map.set(path, missing);
    }
    return map.size > 0 ? map : undefined;
  }, [activeCollections, allTokensFlat, totalOptionCount]);

  const collectionCoverage = useMemo(() => {
    if (activeCollections.length === 0) return undefined;
    const multiModeCollectionIds = new Set(
      activeCollections.filter((c) => c.modes.length >= 2).map((c) => c.id),
    );
    const configuredTokenPaths = new Set<string>();
    for (const [path, entry] of Object.entries(allTokensFlat)) {
      const tokenCollectionId = pathToCollectionId[path];
      if (tokenCollectionId && multiModeCollectionIds.has(tokenCollectionId)) {
        configuredTokenPaths.add(path);
        continue;
      }
      if (!entry.$extensions?.tokenmanager?.modes) continue;
      for (const collection of activeCollections) {
        const collectionModes = getInlineModeValues(entry, collection.id);
        if (Object.keys(collectionModes).length > 0) {
          configuredTokenPaths.add(path);
          break;
        }
      }
    }
    if (configuredTokenPaths.size === 0 && !tokenModeMissing) return undefined;
    const map = new Map<
      string,
      { configured: number; total: number; totalMissing: number }
    >();
    function walk(
      nodes: TokenNode[],
    ): { configured: number; total: number; totalMissing: number } {
      let configured = 0,
        total = 0,
        totalMissing = 0;
      for (const node of nodes) {
        if (node.isGroup && node.children) {
          const sub = walk(node.children);
          configured += sub.configured;
          total += sub.total;
          totalMissing += sub.totalMissing;
          map.set(node.path, sub);
        } else if (!node.isGroup) {
          total++;
          if (configuredTokenPaths.has(node.path)) configured++;
          totalMissing += tokenModeMissing?.get(node.path) ?? 0;
        }
      }
      return { configured, total, totalMissing };
    }
    walk(tokens);
    return map;
  }, [activeCollections, allTokensFlat, pathToCollectionId, tokenModeMissing, tokens]);

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
    closeTableCreate,
    restoreDraft: restoreTableDraft,
    dismissDraft: dismissTableDraft,
    openTableCreate,
    handleCreateAll,
    tableSuggestions,
  } = tableCreate;

  const findReplace = useFindReplace({
    connected,
    serverUrl,
    collectionId,
    tokens,
    allCollectionIds: collectionIds,
    perCollectionFlat,
    onRefresh,
    onPushUndo,
  });
  const {
    showFindReplace,
    setShowFindReplace,
    frFind,
    setFrFind,
    frReplace,
    setFrReplace,
    frIsRegex,
    setFrIsRegex,
    frScope,
    setFrScope,
    frTarget,
    setFrTarget,
    frTypeFilter,
    setFrTypeFilter,
    frAvailableTypes,
    frError,
    setFrError,
    frBusy,
    frRegexError,
    frPreview,
    frValuePreview,
    frConflictCount,
    frRenameCount,
    frValueCount,
    frAliasImpact,
    handleFindReplace,
    cancelFindReplace,
  } = findReplace;

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

  // Phase 1: useTokenWhereIs
  const tokenWhereIs = useTokenWhereIs({ serverUrl });
  const {
    whereIsPath,
    setWhereIsPath,
    whereIsResults,
    setWhereIsResults,
    whereIsLoading,
    setWhereIsLoading: _setWhereIsLoading,
    whereIsAbortRef,
  } = tokenWhereIs;

  const handleCloseWhereIs = useCallback(() => {
    setWhereIsPath(null);
    setWhereIsResults(null);
    whereIsAbortRef.current?.abort();
  }, [setWhereIsPath, setWhereIsResults, whereIsAbortRef]);

  // Phase 2: useTokenExpansion
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
    handleExpandAll,
    handleCollapseAll,
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

  // Phase 4: useTokenSearch (needs bridging refs + sortedTokens + expansion state)
  const tokenSearch = useTokenSearch({
    collectionId,
    tokens,
    collectionIds,
    serverUrl,
    onOpenCommandPaletteWithQuery,
    virtualScrollTopRef,
    flatItemsRef,
    itemOffsetsRef,
    scrollAnchorPathRef,
    isFilterChangeRef,
    expandedPaths,
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
    derivedTokenPaths,
  });
  const {
    searchQuery,
    typeFilter,
    refFilter,
    showDuplicates,
    crossCollectionSearch,
    setCrossCollectionSearch,
    filterPresets,
    deleteFilterPreset,
    applyFilterPreset,
    showQualifierHints,
    setShowQualifierHints,
    hintIndex,
    setHintIndex,
    crossCollectionResults,
    crossCollectionTotal,
    crossCollectionOffset: _crossCollectionOffset,
    setCrossCollectionOffset,
    CROSS_COLLECTION_PAGE_SIZE,
    searchRef,
    qualifierHintsRef,
    crossCollectionAbortRef: _crossCollectionAbortRef,
    saveScrollAnchor: _saveScrollAnchor,
    setSearchQuery,
    setTypeFilter,
    setRefFilter,
    setShowDuplicates,
    addQueryQualifierValue,
    removeQueryToken,
    filtersActive,
    activeFilterCount,
    duplicateValuePaths: _duplicateValuePaths,
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

  const multiModeDimensionName = useMemo(
    () =>
      activeCollections.find((collection) => collection.id === multiModeDimId)
        ?.id ?? null,
    [activeCollections, multiModeDimId],
  );

  const hasStructuredFilters = structuredFilterChips.length > 0;
  const allGroupsExpanded =
    allGroupPaths.length > 0 &&
    allGroupPaths.every((path) => expandedPaths.has(path));
  const filterMenuActiveCount =
    activeFilterCount +
    (inspectMode ? 1 : 0) +
    (crossCollectionSearch ? 1 : 0);

  const {
    toolbarStateChips,
  } = useToolbarStateChips({
    structuredFilterChips, removeQueryToken, sortOrder, setSortOrder,
    refFilter, setRefFilter, showDuplicates, setShowDuplicates,
    showIssuesOnly, onToggleIssuesOnly, lintViolationsLength: lintViolations.length,
    showRecentlyTouched, setShowRecentlyTouched, typeFilter, setTypeFilter,
    showStarredOnly, setShowStarredOnly,
    inspectMode, setInspectMode, crossCollectionSearch, setCrossCollectionSearch,
    showPreviewSplit, onTogglePreviewSplit, showFlatSearchResults,
    setSearchResultPresentation,
  });

  const currentBulkEditScope = useMemo<BulkEditScope>(() => {
    const trimmedQuery = searchQuery.trim();
    if (trimmedQuery) {
      return {
        source: "current-scope",
        title: "Current query results",
        detail: trimmedQuery,
      };
    }
    if (toolbarStateChips.length > 0) {
      return {
        source: "current-scope",
        title: "Current filtered tokens",
        detail: toolbarStateChips.map(c => c.label).join(" · "),
      };
    }
    return {
      source: "current-scope",
      title: `All tokens in ${collectionId}`,
      detail: "No search or filter constraints",
    };
  }, [toolbarStateChips, searchQuery, collectionId]);

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
    if (displayedGroupPaths.length === 0) return;
    setExpandedPaths((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const path of displayedGroupPaths) {
        if (next.has(path)) continue;
        next.add(path);
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [
    displayedGroupPaths,
    filtersActive,
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

  // Phase 3: useTokenVirtualScroll (needs displayedTokens from useTokenSearch)
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
    return flattenVisible(displayedTokens, expandedPaths);
  }, [
    displayedTokens,
    expandedPaths,
    flatSearchRows,
    viewMode,
    showRecentlyTouched,
    showFlatSearchResults,
    collectionId,
    recentlyTouched,
  ]);

  const tokenVirtualScroll = useTokenVirtualScroll({
    displayedTokens,
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

  // Report filtered leaf count to parent so collection tabs can show "X / Y"
  useEffect(() => {
    if (!onFilteredCountChange) return;
    onFilteredCountChange(filtersActive ? displayedLeafNodes.length : null);
  }, [displayedLeafNodes, filtersActive, onFilteredCountChange]);

  // Phase 5: useTokenSelection (called before tokenCrud/tokenPromotion so selectedPaths is available)
  const tokenSelection = useTokenSelection({
    viewMode,
    flatItems,
    displayedLeafNodes,
    crossCollectionResults,
    onSelectionChange,
  });
  const {
    selectMode,
    selectedPaths,
    setSelectedPaths,
    showBatchEditor,
    setShowBatchEditor,
    lastSelectedPathRef,
    displayedLeafPaths,
    selectedLeafNodes,
    handleTokenSelect,
    handleSelectAll,
    handleSelectGroupChildren,
    clearSelection: clearSelectionImpl,
  } = tokenSelection;

  const [activeBatchAction, setActiveBatchAction] = useState<BatchActionType | null>(null);

  clearSelectionRef.current = clearSelectionImpl;

  const handleClearSelection = useCallback(() => {
    clearSelectionImpl();
    setActiveBatchAction(null);
  }, [clearSelectionImpl]);

  const openBulkEditorForPaths = useCallback(
    (paths: Set<string>, scope: BulkEditScope) => {
      if (paths.size === 0) {
        dispatchToast("No tokens match that bulk-edit scope.", "error");
        return;
      }
      setSelectedPaths(paths);
      setActiveBulkEditScope(scope);
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
    openBulkEditorForPaths(
      new Set(displayedLeafNodes.map((node) => node.path)),
      currentBulkEditScope,
    );
  }, [
    crossCollectionSearch,
    currentBulkEditScope,
    displayedLeafNodes,
    openBulkEditorForPaths,
  ]);


  useEffect(() => {
    if (!pendingBulkPresetLaunch) return;
    if (crossCollectionSearch) return;
    if (searchQuery !== pendingBulkPresetLaunch.query) return;
    const presetPaths = new Set(displayedLeafNodes.map((node) => node.path));
    if (presetPaths.size === 0) {
      dispatchToast(
        `Saved scope "${pendingBulkPresetLaunch.presetName}" does not match any tokens in ${collectionId}.`,
        "error",
      );
      setPendingBulkPresetLaunch(null);
      return;
    }
    openBulkEditorForPaths(presetPaths, {
      source: "saved-preset",
      title: pendingBulkPresetLaunch.presetName,
      detail: pendingBulkPresetLaunch.query,
    });
    setPendingBulkPresetLaunch(null);
  }, [
    crossCollectionSearch,
    displayedLeafNodes,
    openBulkEditorForPaths,
    pendingBulkPresetLaunch,
    searchQuery,
    collectionId,
  ]);

  useEffect(() => {
    if (selectedPaths.size === 0) {
      setActiveBulkEditScope(null);
      setActiveBatchAction(null);
    }
  }, [selectedPaths.size]);

  // Sync: keyboard handler toggles showBatchEditor (from useTokenSelection).
  // Map that to activeBatchAction so the E key opens/closes the panel.
  useEffect(() => {
    if (showBatchEditor && !activeBatchAction) {
      setActiveBatchAction('set-description');
    } else if (!showBatchEditor && activeBatchAction) {
      setActiveBatchAction(null);
    }
  }, [showBatchEditor]); // eslint-disable-line react-hooks/exhaustive-deps

  const tokenCrud = useTokenCrud({
    connected,
    serverUrl,
    collectionId,
    collectionIds,
    tokens,
    allTokensFlat,
    perCollectionFlat,
    generators,
    collections,
    onRefresh,
    onPushUndo,
    onRefreshGeneratedGroups,
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
    handleSaveGeneratedException,
    handleDetachFromGenerator,
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

  const handleRunGeneratedGroup = useCallback(
    async (generatorId: string) => {
      const generator = generators?.find((candidate) => candidate.id === generatorId);
      const sourceValue =
        generator?.sourceToken
          ? allTokensFlat[generator.sourceToken]?.$value
          : undefined;
      try {
        await apiFetch(`${serverUrl}/api/generators/${generatorId}/run`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body:
            sourceValue !== undefined
              ? JSON.stringify({ sourceValue })
              : undefined,
        });
        onRefresh();
      } catch {
        onError?.("Failed to regenerate — check server connection");
      }
    },
    [allTokensFlat, onRefresh, onError, generators, serverUrl],
  );

  const handleToggleGeneratedGroupEnabled = useCallback(
    async (generatorId: string, enabled: boolean) => {
      const generator = generators?.find((candidate) => candidate.id === generatorId);
      const keepUpdatedAvailability = getGeneratedGroupKeepUpdatedAvailability({
        sourceTokenPath: generator?.sourceToken,
        sourceTokenEntry:
          (generator?.sourceToken &&
            (unresolvedAllTokensFlat?.[generator.sourceToken] ??
              allTokensFlat[generator.sourceToken])) ||
          undefined,
        collections,
        pathToCollectionId,
        perCollectionFlat,
      });
      if (enabled && !keepUpdatedAvailability.supported) {
        onError?.(keepUpdatedAvailability.reason ?? "Keep updated is unavailable");
        return;
      }
      try {
        await apiFetch(`${serverUrl}/api/generators/${generatorId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ enabled }),
        });
        onRefresh();
        onRefreshGeneratedGroups?.();
        dispatchToast(
          enabled ? "Keep updated turned on" : "Keep updated turned off",
          "success",
        );
      } catch {
        onError?.("Failed to update Keep updated");
      }
    },
    [
      allTokensFlat,
      collections,
      onError,
      onRefresh,
      onRefreshGeneratedGroups,
      perCollectionFlat,
      pathToCollectionId,
      generators,
      serverUrl,
      unresolvedAllTokensFlat,
    ],
  );

  const handleDuplicateGeneratedGroup = useCallback(
    (generatorId: string) => {
      if (!onOpenGeneratedGroupEditor) {
        onError?.("Cannot duplicate this generated group here");
        return;
      }
      const generator = generators?.find((candidate) => candidate.id === generatorId);
      if (!generator) {
        onError?.("Generated group no longer exists");
        return;
      }
      const sourceEntry = generator.sourceToken
        ? allTokensFlat[generator.sourceToken]
        : undefined;
      onOpenGeneratedGroupEditor({
        mode: "create",
        sourceTokenPath: generator.sourceToken,
        sourceTokenName: generator.sourceToken?.split(".").pop(),
        sourceTokenType: sourceEntry?.$type,
        sourceTokenValue: sourceEntry?.$value ?? generator.inlineValue,
        initialDraft: createGeneratedGroupDuplicateDraft(generator),
      });
    },
    [allTokensFlat, onError, onOpenGeneratedGroupEditor, generators],
  );

  const handleDeleteGeneratedGroup = useCallback(
    async (generatorId: string) => {
      const generator = generators?.find((candidate) => candidate.id === generatorId);
      try {
        await apiFetch(`${serverUrl}/api/generators/${generatorId}?deleteTokens=true`, {
          method: "DELETE",
        });
        onRefresh();
        onRefreshGeneratedGroups?.();
        dispatchToast(
          generator
            ? `Deleted ${getGeneratedGroupTypeLabel(generator.type).toLowerCase()} "${generator.name}"`
            : "Deleted generated group",
          "success",
        );
      } catch {
        onError?.("Failed to delete generated group");
      }
    },
    [onError, onRefresh, onRefreshGeneratedGroups, generators, serverUrl],
  );

  const handleDetachGeneratedGroup = useCallback(
    async (generatorId: string, groupPath: string) => {
      try {
        await apiFetch(`${serverUrl}/api/generators/${generatorId}/detach`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            scope: "group",
            path: groupPath,
          }),
        });
        onRefresh();
        onRefreshGeneratedGroups?.();
      } catch {
        onError?.("Failed to detach generated group");
      }
    },
    [onError, onRefresh, onRefreshGeneratedGroups, serverUrl],
  );

  const handleDismissStaleGeneratorBanner = useCallback(() => {
    lsSet(staleGeneratorBannerStorageKey, staleGeneratorSignature);
    setDismissedStaleGeneratorSignature(staleGeneratorSignature);
  }, [staleGeneratorBannerStorageKey, staleGeneratorSignature]);

  const handleRegenerateAllStaleGenerators = useCallback(async () => {
    if (runningStaleGenerators || staleGeneratorsForSet.length === 0) return;
    setRunningStaleGenerators(true);
    let successCount = 0;
    let totalUpdatedTokens = 0;
    const failedGenerators: string[] = [];
    try {
      for (const generator of staleGeneratorsForSet) {
        try {
          const sourceValue =
            generator.sourceToken
              ? allTokensFlat[generator.sourceToken]?.$value
              : undefined;
          const result = await apiFetch<{ count?: number }>(
            `${serverUrl}/api/generators/${generator.id}/run`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body:
                sourceValue !== undefined
                  ? JSON.stringify({ sourceValue })
                  : undefined,
            },
          );
          successCount += 1;
          totalUpdatedTokens += result.count ?? 0;
        } catch {
          failedGenerators.push(generator.name);
        }
      }
      if (failedGenerators.length === 0) {
        dispatchToast(
          `Re-ran ${successCount} stale generated group${successCount !== 1 ? "s" : ""}${totalUpdatedTokens > 0 ? ` — ${totalUpdatedTokens} token${totalUpdatedTokens !== 1 ? "s" : ""} updated` : ""}`,
          "success",
        );
      } else {
        dispatchToast(
          `${failedGenerators.length} generated group${failedGenerators.length !== 1 ? "s" : ""} failed: ${failedGenerators.join(", ")}`,
          "error",
        );
      }
      onRefresh();
    } finally {
      setRunningStaleGenerators(false);
    }
  }, [allTokensFlat, runningStaleGenerators, staleGeneratorsForSet, serverUrl, onRefresh]);

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
    setShowFindReplace(false);
    setActiveBatchAction(null);
    setShowBatchEditor(false);
    setPendingBatchEditorFocus(null);
  }, [
    dismissCopyToken,
    dismissMoveToken,
    setPromoteRows,
    setShowBatchEditor,
    setShowFindReplace,
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
    openBulkEditorForPaths(
      new Set(displayedLeafNodes.map((node) => node.path)),
      currentBulkEditScope,
    );
    setActiveBatchAction('find-replace');
    setPendingBatchEditorFocus("find-replace");
  }, [
    closeLongLivedReviewSurfaces,
    crossCollectionSearch,
    currentBulkEditScope,
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

  // Scroll virtual list to bring the highlighted token into view
  useLayoutEffect(() => {
    if (!highlightedToken || viewMode !== "tree" || !virtualListRef.current)
      return;
    const idx = flatItems.findIndex(
      (item) => item.node.path === highlightedToken,
    );
    if (idx < 0) return;
    const containerH = virtualListRef.current.clientHeight;
    const targetScrollTop = Math.max(
      0,
      itemOffsets[idx] - containerH / 2 + rowHeight / 2,
    );
    virtualListRef.current.scrollTop = targetScrollTop;
    setVirtualScrollTop(targetScrollTop);
  }, [
    highlightedToken,
    flatItems,
    itemOffsets,
    viewMode,
    rowHeight,
    setVirtualScrollTop,
  ]);

  // Restore scroll anchor after filter changes so the first visible item stays visible
  useLayoutEffect(() => {
    if (!isFilterChangeRef.current) return;
    isFilterChangeRef.current = false;
    const anchorPath = scrollAnchorPathRef.current;
    scrollAnchorPathRef.current = null;
    if (!virtualListRef.current) return;
    if (anchorPath) {
      const idx = flatItems.findIndex((item) => item.node.path === anchorPath);
      if (idx >= 0) {
        const targetScrollTop = itemOffsets[idx];
        virtualListRef.current.scrollTop = targetScrollTop;
        setVirtualScrollTop(targetScrollTop);
        return;
      }
    }
    // Anchor not in filtered list — scroll to top of results
    virtualListRef.current.scrollTop = 0;
    setVirtualScrollTop(0);
  }, [flatItems, itemOffsets, setVirtualScrollTop]);

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

  const clearViewModes = useCallback(() => {
    if (showResolvedValues) setShowResolvedValues(false);
    if (showPreviewSplit) onTogglePreviewSplit?.();
    if (showFlatSearchResults) setSearchResultPresentation("grouped");
    if (sortOrder !== "default") setSortOrder("default");
  }, [
    onTogglePreviewSplit,
    setSearchResultPresentation,
    setSortOrder,
    setShowResolvedValues,
    showPreviewSplit,
    showResolvedValues,
    showFlatSearchResults,
    sortOrder,
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

  // handleTokenSelect, displayedLeafPaths, selectedLeafNodes, handleSelectAll, handleSelectGroupChildren
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
    [setExpandedPaths, setViewMode, setZoomRootPath, tokens],
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
    [setExpandedPaths, setVirtualScrollTop, setZoomRootPath],
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

  // handleFindInAllSets is managed by useTokenWhereIs (destructured above)

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
      toggleStatsBar: () => {
        setStatsBarOpen((v) => !v);
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
        handleOpenExtractToAlias(path, $type, $value as any);
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
    setStatsBarOpen,
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
    perCollectionFlat,
    collections,
  });
  const activeCollectionModeLabel = useMemo(() => {
    const collection = activeCollections.find(
      (candidate) => candidate.id === collectionId,
    );
    if (!collection || collection.modes.length === 0) {
      return null;
    }
    return collection.modes[0]?.name ?? null;
  }, [activeCollections, collectionId]);

  const tokenTreeGroupState = useTokenTreeGroupState({
    collectionId, activeCollectionModeLabel, selectMode, expandedPaths, highlightedToken,
    searchHighlight, dragOverGroup, dragOverGroupIsInvalid, dragSource,
    generatorsByTargetGroup, collectionCoverage,
    effectiveRovingPath,
  });

  const tokenTreeGroupActions = useTokenTreeGroupActions({
    handleToggleExpand, requestDeleteGroup, handleOpenCreateSibling,
    setNewGroupDialogParent, handleRenameGroup, handleUpdateGroupMeta,
    handleRequestMoveGroup, handleRequestCopyGroup, handleDuplicateGroup,
    onPublishGroup, onSetGroupScopes, onCreateGeneratedGroupFromGroup,
    handleZoomIntoGroup, handleDragOverGroup, handleDropOnGroup,
    onEditGeneratedGroup,
    onDuplicateGeneratedGroup: handleDuplicateGeneratedGroup,
    onNavigateToGeneratedGroup,
    handleRunGeneratedGroup,
    handleToggleGeneratedGroupEnabled,
    handleDeleteGeneratedGroup,
    handleDetachGeneratedGroup, onNavigateToAlias, handleSelectGroupChildren,
    setRovingFocusPath,
  });

  const tokenTreeLeafState = useTokenTreeLeafState({
    serverUrl, collectionId, collectionIds, selectionCapabilities, duplicateCounts,
    selectMode, highlightedToken, inspectMode, syncSnapshot, derivedTokenPaths,
    searchHighlight, selectedNodes, boundTokenPaths, dragOverReorder, selectedLeafNodes,
    showResolvedValues,
    starredPaths,
    collections: activeCollections,
    pendingRenameToken, pendingTabEdit, effectiveRovingPath, showDuplicates,
    tokenModeMissing,
  });

  const tokenTreeLeafActions = useTokenTreeLeafActions({
    onEdit, onPreview, requestDeleteToken, handleTokenSelect, onNavigateToAlias,
    onRefresh, onPushUndo, handleRequestMoveTokenReview, handleRequestCopyTokenReview,
    handleDuplicateToken, handleDetachFromGenerator, handleSaveGeneratedException, handleOpenExtractToAlias,
    handleHoverToken, setTypeFilter, handleInlineSave, handleRenameToken,
    onViewTokenHistory,
    collectionsLength: activeCollections.length,
    handleCompareAcrossCollections,
    handleDragStartNotify: handleDragStart,
    handleDragEndNotify: handleDragEnd,
    handleDragOverToken, handleDragLeaveToken, handleDropReorder,
    multiModeData, handleMultiModeInlineSave, handleCopyValueToAllModes,
    onOpenGeneratedGroupEditor, onToggleStar,
    handleClearPendingRename, handleClearPendingTabEdit, handleTabToNext,
    setRovingFocusPath,
  });

  const modalContextValue = useTokenListModalContext({
    collectionId, collectionIds, allTokensFlat, connected,
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
    showFindReplace,
    frFind, frReplace, frIsRegex, frScope, frTarget, frError, frBusy,
    frRegexError, frPreview, frValuePreview, frConflictCount, frRenameCount,
    frValueCount, frAliasImpact, frTypeFilter, frAvailableTypes,
    setFrFind, setFrReplace, setFrIsRegex, setFrScope, setFrTarget,
    setFrTypeFilter, setFrError, setShowFindReplace,
    handleFindReplace, cancelFindReplace,
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
    setShowMoveToGroup, setMoveToGroupTarget, setMoveToGroupError,
    handleBatchMoveToGroup,
    showBatchMoveToCollection, batchMoveToCollectionTarget, setBatchMoveToCollectionTarget,
    setShowBatchMoveToCollection, handleBatchMoveToCollection,
    showBatchCopyToCollection, batchCopyToCollectionTarget, setBatchCopyToCollectionTarget,
    setShowBatchCopyToCollection, handleBatchCopyToCollection,
  });

  const showStaleGeneratorBanner =
    staleGeneratorsForSet.length > 0 &&
    dismissedStaleGeneratorSignature !== staleGeneratorSignature;

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
      data-tokens-library-surface-slot={librarySurfaceSlot}
      onKeyDown={handleListKeyDown}
    >
      {/* Copy feedback toast (⌘⌥C alias-ref or ⌘⇧C preferred-format) */}
      {(copyAliasFeedback || copyPreferredFeedback) && (
        <div
          className="absolute top-2 left-1/2 -translate-x-1/2 z-50 pointer-events-none px-3 py-1 rounded bg-[var(--color-figma-bg-brand,var(--color-figma-accent))] text-white text-body font-medium shadow-md"
          aria-live="polite"
        >
          Copied!
        </div>
      )}
      {/* Toolbars — fixed above the scrollable token list */}
      <div className="flex-shrink-0">
        {/* Select mode toolbar */}
        {selectMode && (
          <SelectModeToolbar
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
              const nodes = displayedLeafNodes.filter((n) => selectedPaths.has(n.path));
              copyTokensAsJson(nodes);
            }}
            onCopyCssVar={() => {
              const nodes = displayedLeafNodes.filter((n) => selectedPaths.has(n.path));
              copyTokensAsCssVar(nodes);
            }}
            onCopyDtcgRef={() => {
              const nodes = displayedLeafNodes.filter((n) => selectedPaths.has(n.path));
              copyTokensAsDtcgRef(nodes);
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
            searchQuery={searchQuery}
          />
        )}

        {/* Active batch action panel */}
        {selectMode && activeBatchAction && selectedPaths.size > 0 && (
          <div ref={batchEditorPanelRef}>
            <BatchActionPanel
              action={activeBatchAction}
              selectedPaths={selectedPaths}
              selectedEntries={selectedEntries}
              allTokensFlat={allTokensFlat}
              collectionId={collectionId}
              serverUrl={serverUrl}
              connected={connected}
              onApply={onRefresh}
              onPushUndo={onPushUndo}
              onSelectedPathsChange={handleBatchActionSelectionChange}
            />
          </div>
        )}


        {/* Proactive selection strip — visible only when Figma layers are selected. */}
        {!selectMode && (
          <LibrarySelectionStrip
            selectedNodeCount={selectedNodes.length}
            boundTokenCount={boundTokenPaths.size}
            inspectMode={inspectMode}
            onToggleInspectMode={() => setInspectMode((v) => !v)}
          />
        )}

        {/* Toolbar — row 1: [set name] [create] [tools] [view] [filter], row 2: [search] */}
        {!selectMode && (
          <TokenListToolbar
            onNavigateBack={onNavigateBack}
            navHistoryLength={navHistoryLength}
            collectionId={collectionId}
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
            structuredFilterChips={structuredFilterChips}
            toolbarStateChips={toolbarStateChips}
            hasStructuredFilters={hasStructuredFilters}
            clearFilters={clearFilters}
            clearViewModes={clearViewModes}
            connected={connected}
            hasTokens={tokens.length > 0}
            viewMode={viewMode}
            setViewMode={setViewMode}
            onCreateNew={onCreateNew}
            openTableCreate={openTableCreate}
            handleOpenNewGroupDialog={handleOpenNewGroupDialog}
            onShowPasteModal={onShowPasteModal}
            onOpenImportPanel={onOpenImportPanel}
            onOpenCreateCollection={onOpenCreateCollection}
            onCreateGeneratedGroup={onNavigateToNewGeneratedGroup}
            onSelectTokens={() => { handleSelectAll(); setActiveBatchAction(null); }}
            onBulkEdit={handleOpenBulkWorkflowForVisibleTokens}
            onFindReplace={handleOpenFindReplaceReview}
            overflowMenuProps={tokens.length > 0 ? {
              sortOrder,
              onSortOrderChange: setSortOrder,
              onExpandAll: handleExpandAll,
              onCollapseAll: handleCollapseAll,
              hasGroups: tokens.some((n) => n.isGroup),
              allGroupsExpanded,
              hasCollections: collections.length > 0,
              showPreviewSplit,
              onTogglePreviewSplit,
              canToggleSearchResultPresentation: canToggleSearchResultPresentation && !crossCollectionSearch,
              searchResultPresentation,
              onSearchResultPresentationChange: setSearchResultPresentation,
              showIssuesOnly: showIssuesOnly ?? false,
              onToggleIssuesOnly,
              lintCount: collectionHealthSummary?.actionable ?? 0,
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
              filterPresets,
              onApplyFilterPreset: applyFilterPreset,
              onDeleteFilterPreset: deleteFilterPreset,
              activeCount: filterMenuActiveCount,
            } : null}
            collectionHealthSummary={collectionHealthSummary}
            onOpenHealth={onOpenHealth}
          />
        )}
      </div>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {searchQuery ? `${displayedLeafNodes.length} tokens found` : ""}
      </div>
      {showStaleGeneratorBanner && (
        <TokenListStaleGeneratedBanner
          staleGeneratorsForSet={staleGeneratorsForSet}
          runningStaleGenerators={runningStaleGenerators}
          onDismiss={handleDismissStaleGeneratorBanner}
          onRegenerateAll={handleRegenerateAllStaleGenerators}
          onNavigateToGeneratedGroup={onNavigateToGeneratedGroup}
        />
      )}
      {/* Token stats bar — compact single row with type breakdown */}
      {statsBarOpen && (
        <TokenListStatsBar
          statsTotalTokens={statsTotalTokens}
          statsByType={statsByType}
          onClose={() => setStatsBarOpen(false)}
        />
      )}
      {/* Operation loading indicator */}
      {operationLoading && (
        <div className="shrink-0 flex items-center gap-1.5 px-3 py-1 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-secondary text-[var(--color-figma-text-secondary)]">
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
            crossCollectionResults={crossCollectionResults}
            crossCollectionTotal={crossCollectionTotal}
            setCrossCollectionOffset={setCrossCollectionOffset}
            CROSS_COLLECTION_PAGE_SIZE={CROSS_COLLECTION_PAGE_SIZE}
            collectionIds={collectionIds}
            searchQuery={searchQuery}
            searchHighlight={searchHighlight}
            availableTypes={availableTypes}
            typeFilter={typeFilter}
            filtersActive={filtersActive}
            setSearchQuery={setSearchQuery}
            setTypeFilter={setTypeFilter}
            addQueryQualifierValue={addQueryQualifierValue}
            insertSearchQualifier={insertSearchQualifier}
            inspectMode={inspectMode}
            selectedNodes={selectedNodes}
            jsonEditorProps={{
              jsonText,
              jsonDirty,
              jsonError,
              jsonSaving,
              jsonBrokenRefs,
              jsonTextareaRef,
              connected,
              onChange: handleJsonChange,
              onSave: handleJsonSave,
              onRevert: handleJsonRevert,
            }}
            tokens={tokens}
            displayedTokens={displayedTokens}
            flatItems={flatItems}
            virtualStartIdx={virtualStartIdx}
            virtualEndIdx={virtualEndIdx}
            virtualTopPad={virtualTopPad}
            virtualBottomPad={virtualBottomPad}
            multiModeData={multiModeData}
            multiModeDimId={multiModeDimId}
            multiModeDimensionName={multiModeDimensionName}
            collections={activeCollections}
            setMultiModeDimId={setMultiModeDimId}
            getMultiModeValues={getMultiModeValues}
            selectedPaths={selectedPaths}
            sortOrder={sortOrder}
            connected={connected}
            siblingOrderMap={siblingOrderMap}
            showRecentlyTouched={showRecentlyTouched}
            showFlatSearchResults={showFlatSearchResults}
            lintViolationsMap={lintViolationsMap}
            expandedChains={expandedChains}
            handleMoveTokenInGroup={handleMoveTokenInGroup}
            zoomBreadcrumb={zoomBreadcrumb}
            zoomParentPath={zoomParentPath}
            zoomSiblingBranches={zoomSiblingBranches}
            handleZoomUpOneLevel={handleZoomUpOneLevel}
            handleZoomOut={handleZoomOut}
            handleZoomToAncestor={handleZoomToAncestor}
            breadcrumbSegments={breadcrumbSegments}
            handleJumpToGroup={handleJumpToGroup}
            handleCollapseBelow={handleCollapseBelow}
            onNavigateToCollection={onNavigateToCollection}
            onCreateNew={onCreateNew}
            onCreateGeneratedGroup={onNavigateToNewGeneratedGroup}
            onOpenImportPanel={onOpenImportPanel}
            clearFilters={clearFilters}
            serverUrl={serverUrl}
            onModeMutated={onRefresh}
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
          onClose={closeTableCreate}
          onRestoreDraft={restoreTableDraft}
          onDismissDraft={dismissTableDraft}
          onCreateAll={handleCreateAll}
        />
      )}

      <TokenListModalsProvider value={modalContextValue}>
        <TokenListModals />
      </TokenListModalsProvider>

      {/* "Find in all collections" overlay */}
      {whereIsPath !== null && (
        <WhereIsOverlay
          whereIsPath={whereIsPath}
          whereIsResults={whereIsResults}
          whereIsLoading={whereIsLoading}
          onClose={handleCloseWhereIs}
          onNavigateToCollection={onNavigateToCollection}
        />
      )}
    </div>
  );
}
