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
import {
  isAlias,
  extractAliasPath,
  resolveTokenValue,
  resolveAllAliases,
} from "../../shared/resolveAlias";
import { TOKEN_TYPE_BADGE_CLASS } from "../../shared/types";
import type { NodeCapabilities, TokenMapEntry } from "../../shared/types";
import { BatchEditor } from "./BatchEditor";
import { stableStringify, getErrorMessage } from "../shared/utils";
import { apiFetch, ApiError } from "../shared/apiFetch";
import {
  STORAGE_KEY,
  STORAGE_KEYS,
  lsGet,
  lsRemove,
  lsSet,
} from "../shared/storage";
import type { PreferredCopyFormat } from "./SettingsPanel";
import {
  nodeParentPath,
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
  AffectedRef,
  RecipeImpact,
  ThemeImpact,
  TokenTreeGroupActionsContextType,
  TokenTreeGroupStateContextType,
  TokenTreeLeafActionsContextType,
  TokenTreeLeafStateContextType,
  TokenTreeSharedDataContextType,
} from "./tokenListTypes";
import { VIRTUAL_OVERSCAN } from "./tokenListTypes";
import {
  highlightMatch,
} from "./tokenListHelpers";
import { TokenTreeNode } from "./TokenTreeNode";
import { TokenTreeProvider } from "./TokenTreeContext";
import { TokenListModals } from "./TokenListModals";
import { TokenListModalsProvider } from "./TokenListModalsContext";
import type { TokenListModalsState } from "./TokenListModalsContext";
import { useExtractToAlias } from "../hooks/useExtractToAlias";
import { matchesShortcut } from "../shared/shortcutRegistry";
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
import { JsonEditorView } from "./JsonEditorView";
import { dispatchToast } from "../shared/toastBus";
import { NoticeBanner } from "../shared/noticeSystem";
import { TokenListToolbar } from "./TokenListToolbar";
import { SelectModeToolbar } from "./SelectModeToolbar";
import { TableCreateForm } from "./TableCreateForm";
import { WhereIsOverlay } from "./WhereIsOverlay";
import { FeedbackPlaceholder } from "./FeedbackPlaceholder";
import {
  TokenListFilteredEmptyState,
  TokenListReviewOverlays,
} from "./token-list/TokenListStates";
import type {
  VariableDiffPendingState,
} from "../shared/tokenListModalTypes";
import type {
  StylesAppliedMessage,
  VariablesReadMessage,
} from "../../shared/types";

const TOKEN_TYPE_COLORS: Record<string, string> = {
  color: "var(--color-token-type-color)",
  dimension: "var(--color-token-type-dimension)",
  spacing: "var(--color-token-type-spacing)",
  typography: "var(--color-token-type-typography)",
  fontFamily: "var(--color-token-type-fontFamily)",
  fontSize: "var(--color-token-type-fontSize)",
  fontWeight: "var(--color-token-type-fontWeight)",
  lineHeight: "var(--color-token-type-lineHeight)",
  number: "var(--color-token-type-number)",
  string: "var(--color-token-type-string)",
  shadow: "var(--color-token-type-shadow)",
  border: "var(--color-token-type-border)",
};
const EMPTY_LINT_VIOLATIONS: LintViolation[] = [];
const EMPTY_PATH_SET = new Set<string>();
const TOKENS_LIBRARY_BODY_SURFACE = "library-body";

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

type BatchEditorFocusTarget = "find-path";

export function TokenList({
  ctx: { setName, sets, serverUrl, connected, selectedNodes },
  data: {
    tokens,
    allTokensFlat,
    lintViolations = [],
    syncSnapshot,
    recipes,
    recipesByTargetGroup,
    derivedTokenPaths,
    cascadeDiff: _cascadeDiff,
    tokenUsageCounts,
    perSetFlat,
    collectionMap = {},
    modeMap = {},
    dimensions = [],
    unthemedAllTokensFlat,
    pathToSet = {},
    activeThemes = {},
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
    onSyncGroup,
    onSyncGroupStyles,
    onSetGroupScopes,
    onGenerateScaleFromGroup,
    onRefreshRecipes,
    onToggleIssuesOnly,
    onFilteredCountChange,
    onNavigateToSet,
    onTokenTouched,
    onToggleStar,
    starredPaths,
    onError,
    onViewTokenHistory,
    onEditRecipe,
    onOpenRecipeEditor,
    onNavigateToRecipe,
    onNavigateToNewRecipe,
    onShowReferences: _onShowReferences,
    onDisplayedLeafNodesChange,
    onSelectionChange,
    onOpenCompare,
    onOpenCrossThemeCompare,
    onOpenCommandPaletteWithQuery,
    onShowPasteModal,
    onOpenImportPanel,
    onOpenSetSwitcher,
    onOpenSetManager,
    onNavigateToRecipesWorkspace,
    onNavigateToThemesWorkspace,
    onTokenDragStart,
    onTokenDragEnd,
    onOpenStartHere,
    onTogglePreviewSplit,
  },
  recentlyTouched,
  defaultCreateOpen: _defaultCreateOpen,
  highlightedToken,
  showIssuesOnly,
  showPreviewSplit = false,
  editingTokenPath,
  compareHandle,
}: TokenListProps) {
  const librarySurfaceSlot = TOKENS_LIBRARY_BODY_SURFACE;
  // Token create state is managed by useTokenCreate hook (called below after dependencies)
  const [applying, setApplying] = useState(false);
  const [varDiffPending, setVarDiffPending] = useState<VariableDiffPendingState | null>(null);
  const [varDiffLoading, setVarDiffLoading] = useState(false);
  // Loading indicator for async token operations (delete, rename, move, duplicate, reorder, etc.)
  const [operationLoading, setOperationLoading] = useState<string | null>(null);
  const [locallyDeletedPaths, setLocallyDeletedPaths] = useState<Set<string>>(
    new Set(),
  );
  // selectMode/selectedPaths/showBatchEditor/lastSelectedPathRef managed by useTokenSelection (called below)
  const varReadPendingRef = useRef<Map<string, (tokens: VariablesReadMessage["collections"]) => void>>(
    new Map(),
  );
  // Drag/drop state is managed by useDragDrop hook (called below after dependencies)
  // Find/replace state is managed by useFindReplace hook (called below after dependencies)
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [copyCssFeedback, setCopyCssFeedback] = useState(false);
  const [copyPreferredFeedback, setCopyPreferredFeedback] = useState(false);
  const [copyAliasFeedback, setCopyAliasFeedback] = useState(false);
  const [showMoveToGroup, setShowMoveToGroup] = useState(false);
  const [moveToGroupTarget, setMoveToGroupTarget] = useState("");
  const [moveToGroupError, setMoveToGroupError] = useState("");
  const [showBatchMoveToSet, setShowBatchMoveToSet] = useState(false);
  const [batchMoveToSetTarget, setBatchMoveToSetTarget] = useState("");
  const [showBatchCopyToSet, setShowBatchCopyToSet] = useState(false);
  const [batchCopyToSetTarget, setBatchCopyToSetTarget] = useState("");
  const viewState = useTokenListViewState({ setName, dimensions });
  const {
    showRecentlyTouched,
    setShowRecentlyTouched,
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
    density,
    setDensity,
    rowHeight,
    condensedView,
    setCondensedView,
    multiModeEnabled,
    multiModeDimId,
    setMultiModeDimId,
    toggleMultiMode,
    themeLensEnabled,
    setThemeLensEnabled,
  } = viewState;
  const [runningStaleRecipes, setRunningStaleRecipes] = useState(false);
  const [activeBulkEditScope, setActiveBulkEditScope] =
    useState<BulkEditScope | null>(null);
  const [pendingBulkPresetLaunch, setPendingBulkPresetLaunch] =
    useState<PendingBulkPresetLaunch | null>(null);
  const [pendingBatchEditorFocus, setPendingBatchEditorFocus] =
    useState<BatchEditorFocusTarget | null>(null);
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
      recentlyTouched.recordTouch(highlightedToken);
      onTokenTouched?.(highlightedToken);
    }
    prevHighlightRef.current = highlightedToken ?? null;
  }, [highlightedToken, recentlyTouched, onTokenTouched]);

  const staleRecipesForSet = useMemo(
    () =>
      (recipes ?? []).filter(
        (recipe) =>
          recipe.targetSet === setName && recipe.isStale === true,
      ),
    [recipes, setName],
  );

  const staleRecipeBannerStorageKey = useMemo(
    () => STORAGE_KEY.staleRecipeBannerDismissed(setName),
    [setName],
  );

  const staleRecipeSignature = useMemo(
    () =>
      stableStringify(
        staleRecipesForSet.map((recipe) => ({
          id: recipe.id,
          sourceToken: recipe.sourceToken ?? null,
          currentSourceValue: recipe.sourceToken
            ? (allTokensFlat[recipe.sourceToken]?.$value ?? null)
            : null,
          lastRunAt: recipe.lastRunAt ?? null,
          lastRunSourceValue: recipe.lastRunSourceValue ?? null,
        })),
      ),
    [staleRecipesForSet, allTokensFlat],
  );

  const [
    dismissedStaleRecipeSignature,
    setDismissedStaleRecipeSignature,
  ] = useState<string | null>(() =>
    lsGet(STORAGE_KEY.staleRecipeBannerDismissed(setName)),
  );

  // Expand/collapse state managed by useTokenExpansion (called below)
  const batchEditorPanelRef = useRef<HTMLDivElement>(null);
  const virtualListRef = useRef<HTMLDivElement>(null);
  // Refs for values defined later in the component, used inside handleListKeyDown to avoid TDZ
  const displayedLeafNodesRef = useRef<TokenNode[]>([]);
  const copyTokensAsJsonRef = useRef<(nodes: TokenNode[]) => void>(() => {});
  const copyTokensAsCssVarRef = useRef<(nodes: TokenNode[]) => void>(() => {});
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
      const msg = ev.data?.pluginMessage;
      if (msg?.type === "variables-read" && msg.correlationId) {
        const resolve = varReadPendingRef.current.get(msg.correlationId);
        if (resolve) {
          varReadPendingRef.current.delete(msg.correlationId);
          resolve(msg.tokens ?? []);
        }
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // handleListKeyDown is defined after custom hook calls (below) to avoid TDZ issues

  useEffect(() => {
    setDismissedStaleRecipeSignature(lsGet(staleRecipeBannerStorageKey));
  }, [staleRecipeBannerStorageKey]);

  useEffect(() => {
    if (staleRecipesForSet.length === 0) {
      if (dismissedStaleRecipeSignature !== null) {
        setDismissedStaleRecipeSignature(null);
        lsRemove(staleRecipeBannerStorageKey);
      }
      return;
    }
    if (
      dismissedStaleRecipeSignature !== null &&
      dismissedStaleRecipeSignature !== staleRecipeSignature
    ) {
      setDismissedStaleRecipeSignature(null);
      lsRemove(staleRecipeBannerStorageKey);
    }
  }, [
    dismissedStaleRecipeSignature,
    staleRecipeBannerStorageKey,
    staleRecipeSignature,
    staleRecipesForSet.length,
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

  // Stats computed from allTokensFlat (cross-set) and perSetFlat for the stats bar
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

  const flattenTokens = (nodes: TokenNode[]): any[] => {
    const result: any[] = [];
    const walk = (list: TokenNode[]) => {
      for (const node of list) {
        if (!node.isGroup) {
          result.push({
            path: node.path,
            $type: node.$type,
            $value: node.$value,
            setName,
          });
        }
        if (node.children) walk(node.children);
      }
    };
    walk(nodes);
    return result;
  };

  // Compute per-option resolved token maps for the selected dimension
  const multiModeData = useMemo(() => {
    if (
      !multiModeEnabled ||
      !multiModeDimId ||
      !unthemedAllTokensFlat ||
      dimensions.length === 0
    )
      return null;
    const dim = dimensions.find((d) => d.id === multiModeDimId);
    if (!dim || dim.options.length < 2) return null;

    // Collect all themed set names (from all dimensions)
    const themedSets = new Set<string>();
    for (const d of dimensions) {
      for (const opt of d.options) {
        for (const sn of Object.keys(opt.sets)) themedSets.add(sn);
      }
    }

    const results: Array<{
      optionName: string;
      dimId: string;
      resolved: Record<string, TokenMapEntry>;
    }> = [];
    for (const option of dim.options) {
      // Base layer: tokens from non-themed sets
      const merged: Record<string, TokenMapEntry> = {};
      for (const [path, entry] of Object.entries(unthemedAllTokensFlat)) {
        const set = pathToSet[path];
        if (!set || !themedSets.has(set)) merged[path] = entry;
      }
      // Source sets
      for (const [sn, status] of Object.entries(option.sets)) {
        if (status !== "source") continue;
        for (const [path, entry] of Object.entries(unthemedAllTokensFlat)) {
          if (pathToSet[path] === sn) merged[path] = entry;
        }
      }
      // Enabled sets (overrides)
      for (const [sn, status] of Object.entries(option.sets)) {
        if (status !== "enabled") continue;
        for (const [path, entry] of Object.entries(unthemedAllTokensFlat)) {
          if (pathToSet[path] === sn) merged[path] = entry;
        }
      }
      results.push({
        optionName: option.name,
        dimId: dim.id,
        resolved: resolveAllAliases(merged),
      });
    }
    return { dim, results };
  }, [
    multiModeEnabled,
    multiModeDimId,
    unthemedAllTokensFlat,
    pathToSet,
    dimensions,
  ]);

  // Lightweight check: which token paths have different values across mode options?
  // Computed even when mode columns are hidden, for the inline variant indicator.
  const modeVariantPaths = useMemo<Set<string>>(() => {
    if (multiModeEnabled || !unthemedAllTokensFlat || dimensions.length === 0)
      return new Set();
    // Pick the first dimension with >=2 options
    const dim = dimensions.find((d) => d.options.length >= 2);
    if (!dim) return new Set();

    // Early bail-out: if any option has no enabled sets, it can't produce overrides
    const hasEnabledSets = dim.options.every((opt) =>
      Object.values(opt.sets).some((s) => s === "enabled"),
    );
    if (!hasEnabledSets) return new Set();

    // Collect only tokens in "enabled" override sets — only those can differ
    const enabledSetsByOption: Set<string>[] = dim.options.map((opt) => {
      const sets = new Set<string>();
      for (const [sn, status] of Object.entries(opt.sets)) {
        if (status === "enabled") sets.add(sn);
      }
      return sets;
    });

    // Gather the candidate paths: tokens whose set appears in any enabled set
    const candidatePaths = new Set<string>();
    for (const [path] of Object.entries(unthemedAllTokensFlat)) {
      const set = pathToSet[path];
      if (!set) continue;
      for (const enabledSets of enabledSetsByOption) {
        if (enabledSets.has(set)) {
          candidatePaths.add(path);
          break;
        }
      }
    }
    if (candidatePaths.size === 0) return new Set();

    // Build per-option override maps only for candidate paths
    const optionOverrides: Map<string, TokenMapEntry>[] = dim.options.map(
      (opt) => {
        const overrides = new Map<string, TokenMapEntry>();
        // Apply "enabled" sets (overrides) — last wins
        for (const [sn, status] of Object.entries(opt.sets)) {
          if (status !== "enabled") continue;
          for (const path of candidatePaths) {
            if (pathToSet[path] === sn) {
              overrides.set(path, unthemedAllTokensFlat[path]);
            }
          }
        }
        return overrides;
      },
    );

    const varies = new Set<string>();
    for (const path of candidatePaths) {
      const firstEntry = optionOverrides[0].get(path);
      const firstValue = firstEntry?.$value ?? null;
      for (let i = 1; i < optionOverrides.length; i++) {
        const otherEntry = optionOverrides[i].get(path);
        const otherValue = otherEntry?.$value ?? null;
        // Referential equality check first, then fall back to stringify
        if (firstValue !== otherValue) {
          if (
            JSON.stringify(firstValue) !== JSON.stringify(otherValue)
          ) {
            varies.add(path);
          }
          break;
        }
      }
    }
    return varies;
  }, [multiModeEnabled, unthemedAllTokensFlat, pathToSet, dimensions]);

  // Build multiModeValues for a given token path
  const getMultiModeValues = useCallback(
    (tokenPath: string): MultiModeValue[] | undefined => {
      if (!multiModeData || !perSetFlat) return undefined;
      const { dim, results } = multiModeData;
      return results.map(({ optionName, dimId, resolved }) => {
        const option = dim.options.find(
          (option: { name: string; sets: Record<string, string> }) =>
            option.name === optionName,
        )!;
        // Find the best target set for edits: first enabled set that already has the token, or first enabled set
        let targetSet: string | null = null;
        const enabledSets = Object.entries(option.sets)
          .filter(([_, s]) => s === "enabled")
          .map(([sn]) => sn);
        for (const sn of enabledSets) {
          if (perSetFlat[sn]?.[tokenPath]) {
            targetSet = sn;
            break;
          }
        }
        if (!targetSet && enabledSets.length > 0) targetSet = enabledSets[0];
        // Fall back to source sets if no enabled sets exist
        if (!targetSet) {
          const sourceSets = Object.entries(option.sets)
            .filter(([_, s]) => s === "source")
            .map(([sn]) => sn);
          for (const sn of sourceSets) {
            if (perSetFlat[sn]?.[tokenPath]) {
              targetSet = sn;
              break;
            }
          }
          if (!targetSet && sourceSets.length > 0) targetSet = sourceSets[0];
        }
        return { optionName, dimId, resolved: resolved[tokenPath], targetSet };
      });
    },
    [multiModeData, perSetFlat],
  );

  // Pre-compute per-group theme coverage for the coverage badge
  const themeCoverage = useMemo(() => {
    if (!dimensions || dimensions.length === 0 || !perSetFlat) return undefined;
    // Collect all themed set names (sets referenced by any dimension option)
    const themedSetNames = new Set<string>();
    for (const d of dimensions) {
      for (const opt of d.options) {
        for (const [sn, status] of Object.entries(opt.sets)) {
          if (status === "enabled" || status === "source")
            themedSetNames.add(sn);
        }
      }
    }
    if (themedSetNames.size === 0) return undefined;
    // Build set of token paths that exist in any themed set
    const themedTokenPaths = new Set<string>();
    for (const sn of themedSetNames) {
      if (perSetFlat[sn]) {
        for (const path of Object.keys(perSetFlat[sn]))
          themedTokenPaths.add(path);
      }
    }
    if (themedTokenPaths.size === 0) return undefined;
    // Walk token tree, computing per-group coverage
    const map = new Map<string, { themed: number; total: number }>();
    function walk(nodes: TokenNode[]): { themed: number; total: number } {
      let themed = 0,
        total = 0;
      for (const node of nodes) {
        if (node.isGroup && node.children) {
          const sub = walk(node.children);
          themed += sub.themed;
          total += sub.total;
          map.set(node.path, sub);
        } else if (!node.isGroup) {
          total++;
          if (themedTokenPaths.has(node.path)) themed++;
        }
      }
      return { themed, total };
    }
    walk(tokens);
    return map;
  }, [dimensions, perSetFlat, tokens]);

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
    setName,
    allTokensFlat,
    tokens,
    onRefresh,
  });

  const boundTokenPaths = useMemo(() => {
    const paths = new Set<string>();
    for (const node of selectedNodes) {
      for (const tokenPath of Object.values(node.bindings)) {
        if (tokenPath) paths.add(tokenPath);
      }
    }
    return paths;
  }, [selectedNodes]);

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
  const totalLeafCount = useMemo(() => flattenLeafNodes(tokens).length, [tokens]);
  const activeThemeSelectionCount = useMemo(
    () => Object.values(activeThemes).filter(Boolean).length,
    [activeThemes],
  );

  const { handleOpenCreateSibling } = useTokenCreate({
    selectedNodes,
    siblingOrderMap,
    onCreateNew,
  });

  const tableCreate = useTableCreate({
    connected,
    serverUrl,
    setName,
    siblingOrderMap,
    onRefresh,
    onPushUndo,
    onTokenCreated,
    onRecordTouch: recentlyTouched.recordTouch,
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
    setName,
    tokens,
    allSets: sets,
    perSetFlat,
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
    setName,
    siblingOrderMap,
    onRefresh,
    onPushUndo,
    onError,
    onRenamePath: (oldPath, newPath) => {
      recentlyTouched.renamePath(oldPath, newPath);
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

  // Wrap drag callbacks to notify parent so it can expose set-tab drop zones
  const handleDragStartNotify = useCallback(
    (paths: string[], names: string[]) => {
      handleDragStart(paths, names);
      onTokenDragStart?.(paths, setName);
    },
    [handleDragStart, onTokenDragStart, setName],
  );

  const handleDragEndNotify = useCallback(() => {
    handleDragEnd();
    onTokenDragEnd?.();
  }, [handleDragEnd, onTokenDragEnd]);

  const groupOps = useGroupOperations({
    connected,
    serverUrl,
    setName,
    sets,
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
    moveGroupTargetSet,
    setMoveGroupTargetSet,
    copyGroupTargetSet,
    setCopyGroupTargetSet,
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
    setName,
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
    setName,
    tokens,
    sets,
    serverUrl,
    onOpenCommandPaletteWithQuery,
    virtualScrollTopRef,
    flatItemsRef,
    itemOffsetsRef,
    scrollAnchorPathRef,
    isFilterChangeRef,
    expandedPaths,
    pinnedPaths: EMPTY_PATH_SET,
    sortedTokens,
    recentlyTouched,
    showIssuesOnly,
    showRecentlyTouched,
    showPinnedOnly: false,
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
    crossSetSearch,
    setCrossSetSearch,
    filterPresets,
    deleteFilterPreset,
    applyFilterPreset,
    showQualifierHints,
    setShowQualifierHints,
    hintIndex,
    setHintIndex,
    crossSetResults,
    crossSetTotal,
    crossSetOffset: _crossSetOffset,
    setCrossSetOffset,
    CROSS_SET_PAGE_SIZE,
    searchRef,
    qualifierHintsRef,
    crossSetAbortRef: _crossSetAbortRef,
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
    !crossSetSearch;
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

  const viewOptionsActiveCount = useMemo(() => {
    let count = activeFilterCount;
    if (sortOrder !== "default") count += 1;
    if (inspectMode) count += 1;
    if (crossSetSearch) count += 1;
    if (multiModeEnabled) count += 1;
    if (themeLensEnabled) count += 1;
    if (condensedView) count += 1;
    if (showPreviewSplit) count += 1;
    if (showFlatSearchResults) count += 1;
    return count;
  }, [
    activeFilterCount,
    condensedView,
    crossSetSearch,
    inspectMode,
    multiModeEnabled,
    themeLensEnabled,
    showFlatSearchResults,
    showPreviewSplit,
    sortOrder,
  ]);

  const multiModeDimensionName = useMemo(
    () => dimensions.find((d) => d.id === multiModeDimId)?.name ?? null,
    [dimensions, multiModeDimId],
  );

  const activeFilterSummary = useMemo(() => {
    const items: string[] = [];
    if (sortOrder !== "default")
      items.push(sortOrder === "alpha-asc" ? "Sorted A to Z" : "Sorted by type");
    if (refFilter !== "all")
      items.push(refFilter === "aliases" ? "Alias tokens only" : "Direct values only");
    if (showDuplicates) items.push("Duplicate values");
    if (showIssuesOnly)
      items.push(
        lintViolations.length > 0
          ? `Issues only (${lintViolations.length})`
          : "Issues only",
      );
    if (showRecentlyTouched) items.push("Recently touched");
    if (typeFilter !== "") items.push(`Type: ${typeFilter}`);
    if (inspectMode) items.push("Bound to selection");
    if (crossSetSearch) items.push("Search all sets");
    return items;
  }, [
    crossSetSearch,
    inspectMode,
    lintViolations.length,
    refFilter,
    showDuplicates,
    showIssuesOnly,
    showRecentlyTouched,
    sortOrder,
    typeFilter,
  ]);

  const hasStructuredFilters = structuredFilterChips.length > 0;
  const toolbarStateChips = useMemo(() => {
    const chips: Array<{
      key: string;
      label: string;
      tone: "filter" | "view";
      onRemove?: () => void;
    }> = [];

    for (const chip of structuredFilterChips) {
      chips.push({
        key: `query:${chip.token}`,
        label: chip.label,
        tone: "filter",
        onRemove: () => removeQueryToken(chip.token),
      });
    }

    if (sortOrder !== "default") {
      chips.push({
        key: `sort:${sortOrder}`,
        label: sortOrder === "alpha-asc" ? "Sorted A to Z" : "Sorted by type",
        tone: "view",
        onRemove: () => setSortOrder("default"),
      });
    }
    if (refFilter !== "all") {
      chips.push({
        key: `refs:${refFilter}`,
        label: refFilter === "aliases" ? "Alias tokens only" : "Direct values only",
        tone: "filter",
        onRemove: () => setRefFilter("all"),
      });
    }
    if (showDuplicates) {
      chips.push({
        key: "duplicates",
        label: "Duplicate values",
        tone: "filter",
        onRemove: () => setShowDuplicates(false),
      });
    }
    if (showIssuesOnly && onToggleIssuesOnly) {
      chips.push({
        key: "issues-only",
        label:
          lintViolations.length > 0
            ? `Issues only (${lintViolations.length})`
            : "Issues only",
        tone: "filter",
        onRemove: onToggleIssuesOnly,
      });
    }
    if (showRecentlyTouched) {
      chips.push({
        key: "recent",
        label: "Recently touched",
        tone: "filter",
        onRemove: () => setShowRecentlyTouched(false),
      });
    }
    if (typeFilter !== "") {
      chips.push({
        key: `type:${typeFilter}`,
        label: `Type: ${typeFilter}`,
        tone: "filter",
        onRemove: () => setTypeFilter(""),
      });
    }
    if (inspectMode) {
      chips.push({
        key: "inspect",
        label: "Bound to selection",
        tone: "filter",
        onRemove: () => setInspectMode(false),
      });
    }
    if (crossSetSearch) {
      chips.push({
        key: "cross-set",
        label: "Search all sets",
        tone: "filter",
        onRemove: () => setCrossSetSearch(false),
      });
    }
    if (multiModeEnabled) {
      chips.push({
        key: "view:modes",
        label:
          multiModeDimensionName
            ? `Theme options: ${multiModeDimensionName}`
            : "Theme options",
        tone: "view",
        onRemove: toggleMultiMode,
      });
    }
    if (themeLensEnabled) {
      chips.push({
        key: "view:theme-values",
        label: "Active theme values",
        tone: "view",
        onRemove: () => setThemeLensEnabled(false),
      });
    }
    if (condensedView) {
      chips.push({
        key: "view:condensed",
        label: "Condensed rows",
        tone: "view",
        onRemove: () => setCondensedView(false),
      });
    }
    if (showPreviewSplit && onTogglePreviewSplit) {
      chips.push({
        key: "view:split",
        label: "Preview pane",
        tone: "view",
        onRemove: onTogglePreviewSplit,
      });
    }
    if (showFlatSearchResults) {
      chips.push({
        key: "view:flat-results",
        label: "Flat search results",
        tone: "view",
        onRemove: () => setSearchResultPresentation("grouped"),
      });
    }

    return chips;
  }, [
    condensedView,
    crossSetSearch,
    inspectMode,
    lintViolations.length,
    multiModeDimensionName,
    multiModeEnabled,
    onToggleIssuesOnly,
    onTogglePreviewSplit,
    refFilter,
    removeQueryToken,
    setCondensedView,
    setCrossSetSearch,
    setInspectMode,
    setRefFilter,
    setSearchResultPresentation,
    setThemeLensEnabled,
    setShowDuplicates,
    setShowRecentlyTouched,
    setSortOrder,
    setTypeFilter,
    showDuplicates,
    showFlatSearchResults,
    showIssuesOnly,
    showPreviewSplit,
    showRecentlyTouched,
    sortOrder,
    structuredFilterChips,
    themeLensEnabled,
    toggleMultiMode,
    typeFilter,
  ]);

  const contextSummary = useMemo(() => {
    if (viewMode === "json") {
      return `Location: ${setName}. View: raw token JSON.`;
    }

    const locationLabel = crossSetSearch
      ? "all sets"
      : zoomRootPath
        ? `${setName} / ${zoomRootPath}`
        : setName;
    const viewLabels: string[] = [];
    if (crossSetSearch) {
      viewLabels.push("cross-set search results");
    } else if (zoomRootPath) {
      viewLabels.push("focused group");
    }
    if (!crossSetSearch && !zoomRootPath && !showFlatSearchResults) {
      viewLabels.push("full group tree");
    }
    if (showFlatSearchResults) {
      viewLabels.push("flat search results");
    }
    if (multiModeEnabled) {
      viewLabels.push(
        multiModeDimensionName
          ? `theme options in ${multiModeDimensionName}`
          : "theme options",
      );
    } else if (themeLensEnabled) {
      viewLabels.push("active theme values");
    }
    if (inspectMode) {
      viewLabels.push("selection-related tokens");
    }

    const summaryParts = [
      `Location: ${locationLabel}.`,
      `View: ${viewLabels.join(" + ")}.`,
    ];

    if (searchQuery.trim()) {
      summaryParts.push(`Search: “${searchQuery.trim()}”.`);
    }

    const count =
      crossSetResults !== null ? crossSetResults.length : displayedLeafNodes.length;
    summaryParts.push(
      `${count} token${count === 1 ? "" : "s"} visible.`,
    );
    return summaryParts.join(" ");
  }, [
    crossSetResults,
    crossSetSearch,
    displayedLeafNodes.length,
    inspectMode,
    multiModeDimensionName,
    multiModeEnabled,
    searchQuery,
    setName,
    showFlatSearchResults,
    themeLensEnabled,
    viewMode,
    zoomRootPath,
  ]);

  const currentBulkEditScope = useMemo<BulkEditScope>(() => {
    const trimmedQuery = searchQuery.trim();
    if (trimmedQuery) {
      return {
        source: "current-scope",
        title: "Current query results",
        detail: trimmedQuery,
      };
    }
    if (activeFilterSummary.length > 0) {
      return {
        source: "current-scope",
        title: "Current filtered tokens",
        detail: activeFilterSummary.join(" · "),
      };
    }
    return {
      source: "current-scope",
      title: `All tokens in ${setName}`,
      detail: "No search or filter constraints",
    };
  }, [activeFilterSummary, searchQuery, setName]);

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
          (recentlyTouched.timestamps.get(b.path) ?? 0) -
          (recentlyTouched.timestamps.get(a.path) ?? 0),
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
    recentlyTouched.timestamps,
  ]);

  const tokenVirtualScroll = useTokenVirtualScroll({
    displayedTokens,
    expandedPaths,
    expandedChains,
    rowHeight,
    allTokensFlat,
    viewMode,
    recentlyTouched,
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

  // Report filtered leaf count to parent so set tabs can show "X / Y"
  useEffect(() => {
    if (!onFilteredCountChange) return;
    onFilteredCountChange(filtersActive ? displayedLeafNodes.length : null);
  }, [displayedLeafNodes, filtersActive, onFilteredCountChange]);

  // Phase 5: useTokenSelection (called before tokenCrud/tokenPromotion so selectedPaths is available)
  const tokenSelection = useTokenSelection({
    viewMode,
    flatItems,
    displayedLeafNodes,
    crossSetResults,
    onSelectionChange,
  });
  const {
    selectMode,
    setSelectMode,
    selectedPaths,
    setSelectedPaths,
    showBatchEditor,
    setShowBatchEditor,
    lastSelectedPathRef,
    displayedLeafPaths,
    selectedLeafNodes,
    handleTokenSelect,
    handleSelectAll,
  } = tokenSelection;

  // Wire up the clearSelection ref now that useTokenSelection has been called
  clearSelectionRef.current = () => {
    setSelectMode(false);
    setSelectedPaths(new Set());
  };

  const handleExitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedPaths(new Set());
    setShowBatchEditor(false);
  }, [setSelectMode, setSelectedPaths, setShowBatchEditor]);

  const handleToggleBatchEditor = useCallback(() => {
    setShowBatchEditor((v) => !v);
  }, [setShowBatchEditor]);


  const openBulkEditorForPaths = useCallback(
    (paths: Set<string>, scope: BulkEditScope) => {
      if (paths.size === 0) {
        dispatchToast("No tokens match that bulk-edit scope.", "error");
        return;
      }
      setSelectMode(true);
      setSelectedPaths(paths);
      setShowBatchEditor(true);
      setActiveBulkEditScope(scope);
    },
    [setSelectMode, setSelectedPaths, setShowBatchEditor],
  );

  const handleBatchEditorSelectionChange = useCallback(
    (nextSelectedPaths: Set<string>) => {
      setSelectedPaths(nextSelectedPaths);
      if (nextSelectedPaths.size === 0) {
        setShowBatchEditor(false);
        setSelectMode(false);
      }
    },
    [setSelectMode, setSelectedPaths, setShowBatchEditor],
  );

  const handleOpenBulkWorkflowForVisibleTokens = useCallback(() => {
    if (crossSetSearch) {
      dispatchToast(
        'Turn off "Search all sets" before bulk editing tokens in this set.',
        "error",
      );
      return;
    }
    openBulkEditorForPaths(
      new Set(displayedLeafNodes.map((node) => node.path)),
      currentBulkEditScope,
    );
  }, [
    crossSetSearch,
    currentBulkEditScope,
    displayedLeafNodes,
    openBulkEditorForPaths,
  ]);


  useEffect(() => {
    if (!pendingBulkPresetLaunch) return;
    if (crossSetSearch) return;
    if (searchQuery !== pendingBulkPresetLaunch.query) return;
    const presetPaths = new Set(displayedLeafNodes.map((node) => node.path));
    if (presetPaths.size === 0) {
      dispatchToast(
        `Saved scope "${pendingBulkPresetLaunch.presetName}" does not match any tokens in ${setName}.`,
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
    crossSetSearch,
    displayedLeafNodes,
    openBulkEditorForPaths,
    pendingBulkPresetLaunch,
    searchQuery,
    setName,
  ]);

  useEffect(() => {
    if (!selectMode || selectedPaths.size === 0) {
      setActiveBulkEditScope(null);
    }
  }, [selectMode, selectedPaths.size]);

  const tokenCrud = useTokenCrud({
    connected,
    serverUrl,
    setName,
    sets,
    tokens,
    allTokensFlat,
    perSetFlat,
    recipes,
    dimensions,
    onRefresh,
    onPushUndo,
    onRefreshRecipes,
    onSetOperationLoading: setOperationLoading,
    onSetLocallyDeletedPaths: setLocallyDeletedPaths,
    onRecordTouch: recentlyTouched.recordTouch,
    onRenamePath: (oldPath, newPath) => {
      recentlyTouched.renamePath(oldPath, newPath);
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
    copyingToken,
    setCopyingToken,
    moveTokenTargetSet,
    setMoveTokenTargetSet: _setMoveTokenTargetSet,
    copyTokenTargetSet,
    setCopyTokenTargetSet: _setCopyTokenTargetSet,
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
    handleDetachFromRecipe,
    handleRequestMoveToken,
    handleConfirmMoveToken,
    handleChangeMoveTokenTargetSet,
    handleRequestCopyToken,
    handleConfirmCopyToken,
    handleChangeCopyTokenTargetSet,
  } = tokenCrud;

  // Convert delete errors to toasts
  useEffect(() => {
    if (deleteError) {
      dispatchToast(`Delete failed: ${deleteError}`, "error");
      setDeleteError(null);
    }
  }, [deleteError, setDeleteError]);

  const handleRegenerateRecipe = useCallback(
    async (recipeId: string) => {
      try {
        await apiFetch(`${serverUrl}/api/recipes/${recipeId}/run`, {
          method: "POST",
        });
        onRefresh();
      } catch {
        onError?.("Failed to regenerate — check server connection");
      }
    },
    [serverUrl, onRefresh, onError],
  );

  const handleDetachRecipeGroup = useCallback(
    async (recipeId: string, groupPath: string) => {
      try {
        await apiFetch(`${serverUrl}/api/recipes/${recipeId}/detach`, {
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
        onRefreshRecipes?.();
      } catch {
        onError?.("Failed to detach recipe group");
      }
    },
    [onError, onRefresh, onRefreshRecipes, serverUrl],
  );

  const handleDismissStaleRecipeBanner = useCallback(() => {
    lsSet(staleRecipeBannerStorageKey, staleRecipeSignature);
    setDismissedStaleRecipeSignature(staleRecipeSignature);
  }, [staleRecipeBannerStorageKey, staleRecipeSignature]);

  const handleRegenerateAllStaleRecipes = useCallback(async () => {
    if (runningStaleRecipes || staleRecipesForSet.length === 0) return;
    setRunningStaleRecipes(true);
    let successCount = 0;
    let totalUpdatedTokens = 0;
    const failedRecipes: string[] = [];
    try {
      for (const recipe of staleRecipesForSet) {
        try {
          const result = await apiFetch<{ count?: number }>(
            `${serverUrl}/api/recipes/${recipe.id}/run`,
            { method: "POST" },
          );
          successCount += 1;
          totalUpdatedTokens += result.count ?? 0;
        } catch {
          failedRecipes.push(recipe.name);
        }
      }
      if (failedRecipes.length === 0) {
        dispatchToast(
          `Re-ran ${successCount} stale recipe${successCount !== 1 ? "s" : ""}${totalUpdatedTokens > 0 ? ` — ${totalUpdatedTokens} token${totalUpdatedTokens !== 1 ? "s" : ""} updated` : ""}`,
          "success",
        );
      } else {
        dispatchToast(
          `${failedRecipes.length} recipe${failedRecipes.length !== 1 ? "s" : ""} failed: ${failedRecipes.join(", ")}`,
          "error",
        );
      }
      onRefresh();
    } finally {
      setRunningStaleRecipes(false);
    }
  }, [runningStaleRecipes, staleRecipesForSet, serverUrl, onRefresh]);

  const tokenPromotion = useTokenPromotion({
    connected,
    serverUrl,
    setName,
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
    setMovingToken(null);
    setCopyingToken(null);
    setShowFindReplace(false);
    setShowBatchEditor(false);
    setPendingBatchEditorFocus(null);
  }, [
    setCopyingToken,
    setMovingToken,
    setPromoteRows,
    setShowBatchEditor,
    setShowFindReplace,
  ]);

  const handleOpenFindReplaceReview = useCallback(() => {
    if (crossSetSearch) {
      dispatchToast(
        'Turn off "Search all sets" before bulk renaming tokens in this set.',
        "error",
      );
      return;
    }
    closeLongLivedReviewSurfaces();
    openBulkEditorForPaths(
      new Set(displayedLeafNodes.map((node) => node.path)),
      currentBulkEditScope,
    );
    setPendingBatchEditorFocus("find-path");
  }, [
    closeLongLivedReviewSurfaces,
    crossSetSearch,
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
    if (!showBatchEditor || pendingBatchEditorFocus !== "find-path") return;
    const frameId = window.requestAnimationFrame(() => {
      const input =
        batchEditorPanelRef.current?.querySelector<HTMLInputElement>(
          'input[aria-label="Find in path"]',
        );
      input?.focus();
      input?.select();
      setPendingBatchEditorFocus(null);
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [pendingBatchEditorFocus, showBatchEditor]);

  // handleListKeyDown is defined after custom hook calls to avoid TDZ
  // Container-level keyboard shortcut handler for the token list
  const handleListKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      const isTyping =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT";
      const activeEl = document.activeElement as HTMLElement | null;
      const focusedTokenPath = activeEl?.dataset?.tokenPath;
      const focusedGroupPath = activeEl?.dataset?.groupPath;

      // Escape: close create form, exit select mode, exit zoom, or blur search
      if (e.key === "Escape") {
        if (selectMode) {
          e.preventDefault();
          setSelectMode(false);
          setSelectedPaths(new Set());
          setShowBatchEditor(false);
          return;
        }
        if (zoomRootPath) {
          e.preventDefault();
          setZoomRootPath(null);
          setVirtualScrollTop(0);
          if (virtualListRef.current) virtualListRef.current.scrollTop = 0;
          return;
        }
        return;
      }

      // Cmd/Ctrl+C: copy selected tokens as DTCG JSON
      if (matchesShortcut(e, "TOKEN_COPY")) {
        if (selectMode && selectedPaths.size > 0) {
          e.preventDefault();
          const nodes = displayedLeafNodesRef.current.filter((n) =>
            selectedPaths.has(n.path),
          );
          copyTokensAsJsonRef.current(nodes);
          return;
        }
        // Single focused token row — copy that token
        if (!isTyping) {
          const focusedPath = (document.activeElement as HTMLElement)?.dataset
            ?.tokenPath;
          if (focusedPath) {
            const node = displayedLeafNodesRef.current.find(
              (n) => n.path === focusedPath,
            );
            if (node) {
              e.preventDefault();
              copyTokensAsJsonRef.current([node]);
              return;
            }
          }
        }
      }

      // Cmd/Ctrl+Shift+C: copy selected tokens in preferred format (configured in Settings)
      if (matchesShortcut(e, "TOKEN_COPY_CSS_VAR")) {
        if (selectMode && selectedPaths.size > 0) {
          e.preventDefault();
          const nodes = displayedLeafNodesRef.current.filter((n) =>
            selectedPaths.has(n.path),
          );
          copyTokensAsPreferredRef.current(nodes);
          return;
        }
        // Single focused token row — copy that token
        if (!isTyping) {
          const focusedPath = (document.activeElement as HTMLElement)?.dataset
            ?.tokenPath;
          if (focusedPath) {
            const node = displayedLeafNodesRef.current.find(
              (n) => n.path === focusedPath,
            );
            if (node) {
              e.preventDefault();
              copyTokensAsPreferredRef.current([node]);
              return;
            }
          }
        }
      }

      // Cmd/Ctrl+Alt+C: copy selected tokens as DTCG alias reference ({path.to.token})
      if (
        e.key === "c" &&
        (e.metaKey || e.ctrlKey) &&
        e.altKey &&
        !e.shiftKey
      ) {
        if (selectMode && selectedPaths.size > 0) {
          e.preventDefault();
          const nodes = displayedLeafNodesRef.current.filter((n) =>
            selectedPaths.has(n.path),
          );
          copyTokensAsDtcgRefRef.current(nodes);
          return;
        }
        // Single focused token row — copy that token
        if (!isTyping) {
          const focusedPath = (document.activeElement as HTMLElement)?.dataset
            ?.tokenPath;
          if (focusedPath) {
            const node = displayedLeafNodesRef.current.find(
              (n) => n.path === focusedPath,
            );
            if (node) {
              e.preventDefault();
              copyTokensAsDtcgRefRef.current([node]);
              return;
            }
          }
        }
      }

      // Cmd/Ctrl+] / Cmd/Ctrl+[: navigate to next/previous token in the editor (works from list when side panel is visible)
      if (
        (matchesShortcut(e, "EDITOR_NEXT_TOKEN") ||
          matchesShortcut(e, "EDITOR_PREV_TOKEN")) &&
        editingTokenPath
      ) {
        e.preventDefault();
        const nodes = displayedLeafNodesRef.current;
        const idx = nodes.findIndex((n) => n.path === editingTokenPath);
        if (idx !== -1) {
          const next = matchesShortcut(e, "EDITOR_NEXT_TOKEN")
            ? nodes[idx + 1]
            : nodes[idx - 1];
          if (next) onEdit(next.path, next.name);
        }
        return;
      }

      // Don't handle shortcuts when typing in a form field
      if (isTyping) return;

      // Cmd/Ctrl+A: select all visible leaf tokens (auto-enters select mode)
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        !e.altKey &&
        e.key.toLowerCase() === "a"
      ) {
        e.preventDefault();
        if (!selectMode) setSelectMode(true);
        setSelectedPaths(
          new Set(displayedLeafNodesRef.current.map((n) => n.path)),
        );
        return;
      }

      // ⌫/Del: bulk delete when in select mode with tokens selected
      if (
        matchesShortcut(e, "TOKEN_DELETE") &&
        selectMode &&
        selectedPaths.size > 0 &&
        (focusedTokenPath || focusedGroupPath)
      ) {
        e.preventDefault();
        requestBulkDeleteFromHook(selectedPaths);
        return;
      }

      // ⌘⇧M: batch move selected tokens to another set
      if (
        matchesShortcut(e, "TOKEN_BATCH_MOVE_TO_SET") &&
        selectMode &&
        selectedPaths.size > 0
      ) {
        e.preventDefault();
        setBatchMoveToSetTarget(sets.filter((s) => s !== setName)[0] ?? "");
        setShowBatchMoveToSet(true);
        return;
      }

      // ⌘⇧Y: batch copy selected tokens to another set
      if (
        matchesShortcut(e, "TOKEN_BATCH_COPY_TO_SET") &&
        selectMode &&
        selectedPaths.size > 0
      ) {
        e.preventDefault();
        setBatchCopyToSetTarget(sets.filter((s) => s !== setName)[0] ?? "");
        setShowBatchCopyToSet(true);
        return;
      }

      // m: toggle multi-select mode
      if (matchesShortcut(e, "TOKEN_MULTI_SELECT")) {
        e.preventDefault();
        if (selectMode) {
          setSelectMode(false);
          setSelectedPaths(new Set());
          setShowBatchEditor(false);
        } else {
          setSelectMode(true);
        }
        return;
      }

      // e: open/toggle batch editor when in select mode with tokens selected
      if (e.key === "e" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (selectMode && selectedPaths.size > 0) {
          e.preventDefault();
          setShowBatchEditor((v) => !v);
          return;
        }
      }

      // n: open create form / drawer, pre-filling path from focused group or token's parent group
      if (matchesShortcut(e, "TOKEN_NEW")) {
        e.preventDefault();
        const groupPath = focusedGroupPath;
        const tokenPath = focusedTokenPath;

        let prefixPath = "";
        if (groupPath) {
          prefixPath = groupPath;
        } else if (tokenPath) {
          const groups = Array.from(
            document.querySelectorAll<HTMLElement>("[data-group-path]"),
          );
          const parentGroup = groups
            .filter((el) =>
              tokenPath.startsWith((el.dataset.groupPath ?? "") + "."),
            )
            .sort(
              (a, b) =>
                (b.dataset.groupPath?.length ?? 0) -
                (a.dataset.groupPath?.length ?? 0),
            )[0];
          prefixPath = parentGroup?.dataset?.groupPath ?? "";
        }

        if (prefixPath) {
          handleOpenCreateSibling(prefixPath, "color");
        } else if (onCreateNew) {
          onCreateNew();
        }
        return;
      }

      // /: focus search input
      if (matchesShortcut(e, "TOKEN_SEARCH")) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }

      // Alt+↑/↓: move focused token/group up or down within its parent group
      if (
        e.altKey &&
        !e.metaKey &&
        !e.ctrlKey &&
        (e.key === "ArrowUp" || e.key === "ArrowDown")
      ) {
        const activeEl = document.activeElement as HTMLElement;
        const nodePath =
          activeEl?.dataset?.tokenPath ?? activeEl?.dataset?.groupPath;
        const nodeName = activeEl?.dataset?.nodeName;
        if (nodePath && nodeName && sortOrder === "default" && connected) {
          const direction = e.key === "ArrowUp" ? "up" : "down";
          const parentPath = nodeParentPath(nodePath, nodeName) ?? "";
          const siblings = siblingOrderMap.get(parentPath) ?? [];
          const idx = siblings.indexOf(nodeName);
          const newIdx = direction === "up" ? idx - 1 : idx + 1;
          if (idx >= 0 && newIdx >= 0 && newIdx < siblings.length) {
            e.preventDefault();
            handleMoveTokenInGroup(nodePath, nodeName, direction);
          }
        }
        return;
      }

      // ↑/↓: navigate between visible token and group rows
      // Shift+↑/↓ in select mode: extend/shrink range selection
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        const rows = Array.from(
          document.querySelectorAll<HTMLElement>(
            "[data-token-path],[data-group-path]",
          ),
        );
        if (rows.length === 0) return;
        const currentIndex = rows.findIndex(
          (el) => el === document.activeElement,
        );
        let targetRow: HTMLElement | undefined;
        if (e.key === "ArrowUp") {
          e.preventDefault();
          targetRow =
            currentIndex > 0 ? rows[currentIndex - 1] : rows[rows.length - 1];
        } else {
          e.preventDefault();
          targetRow =
            currentIndex < rows.length - 1 ? rows[currentIndex + 1] : rows[0];
        }
        targetRow?.focus();
        targetRow?.scrollIntoView({ block: "nearest" });

        // Shift+Arrow: extend/shrink range selection (auto-enters select mode)
        if (e.shiftKey && targetRow) {
          const targetPath =
            targetRow.dataset.tokenPath || targetRow.dataset.groupPath;
          if (targetPath) {
            if (!selectMode) setSelectMode(true);
            // Set anchor on first shift-arrow if none exists
            if (lastSelectedPathRef.current === null) {
              const currentRow =
                currentIndex >= 0 ? rows[currentIndex] : undefined;
              const currentPath =
                currentRow?.dataset.tokenPath || currentRow?.dataset.groupPath;
              if (currentPath) {
                lastSelectedPathRef.current = currentPath;
                setSelectedPaths((prev) => {
                  const next = new Set(prev);
                  next.add(currentPath);
                  return next;
                });
              }
            }
            handleTokenSelect(targetPath, { shift: true, ctrl: false });
          }
        }
      }

      // Alt+←: navigate back in alias navigation history
      if (
        e.altKey &&
        !e.metaKey &&
        !e.ctrlKey &&
        e.key === "ArrowLeft" &&
        (navHistoryLength ?? 0) > 0
      ) {
        e.preventDefault();
        onNavigateBack?.();
        return;
      }

      // Cmd/Ctrl+→: expand all groups; Cmd/Ctrl+←: collapse all groups
      if (matchesShortcut(e, "TOKEN_EXPAND_ALL")) {
        e.preventDefault();
        handleExpandAll();
        return;
      }
      if (matchesShortcut(e, "TOKEN_COLLAPSE_ALL")) {
        e.preventDefault();
        handleCollapseAll();
        return;
      }

      // ←/→: expand/collapse groups (standard tree keyboard pattern)
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const activeEl = document.activeElement as HTMLElement;
        const groupPath = activeEl?.dataset?.groupPath;
        const tokenPath = activeEl?.dataset?.tokenPath;

        if (groupPath) {
          const isExpanded = expandedPaths.has(groupPath);
          if (e.key === "ArrowRight") {
            e.preventDefault();
            if (!isExpanded) {
              handleToggleExpand(groupPath);
            } else {
              const rows = Array.from(
                document.querySelectorAll<HTMLElement>(
                  "[data-token-path],[data-group-path]",
                ),
              );
              const idx = rows.indexOf(activeEl);
              if (idx >= 0 && idx < rows.length - 1) {
                rows[idx + 1]?.focus();
                rows[idx + 1]?.scrollIntoView({ block: "nearest" });
              }
            }
          } else {
            e.preventDefault();
            if (isExpanded) {
              handleToggleExpand(groupPath);
            } else {
              const parentPath = nodeParentPath(
                groupPath,
                activeEl.dataset.nodeName ?? "",
              );
              if (parentPath) {
                const parentEl = document.querySelector<HTMLElement>(
                  `[data-group-path="${CSS.escape(parentPath)}"]`,
                );
                if (parentEl) {
                  parentEl.focus();
                  parentEl.scrollIntoView({ block: "nearest" });
                }
              }
            }
          }
        } else if (tokenPath && e.key === "ArrowLeft") {
          e.preventDefault();
          const parentPath = nodeParentPath(
            tokenPath,
            activeEl.dataset.nodeName ?? "",
          );
          if (parentPath) {
            const parentEl = document.querySelector<HTMLElement>(
              `[data-group-path="${CSS.escape(parentPath)}"]`,
            );
            if (parentEl) {
              parentEl.focus();
              parentEl.scrollIntoView({ block: "nearest" });
            }
          }
        }
      }
    },
    [
      selectMode,
      selectedPaths,
      handleOpenCreateSibling,
      onCreateNew,
      expandedPaths,
      handleToggleExpand,
      handleExpandAll,
      handleCollapseAll,
      zoomRootPath,
      navHistoryLength,
      onNavigateBack,
      handleMoveTokenInGroup,
      siblingOrderMap,
      sortOrder,
      connected,
      requestBulkDeleteFromHook,
      sets,
      setName,
      setBatchMoveToSetTarget,
      setShowBatchMoveToSet,
      setBatchCopyToSetTarget,
      setShowBatchCopyToSet,
      editingTokenPath,
      handleTokenSelect,
      lastSelectedPathRef,
      onEdit,
      searchRef,
      setSelectMode,
      setSelectedPaths,
      setShowBatchEditor,
      setVirtualScrollTop,
    ],
  );

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
    setCrossSetSearch(false);
    setInspectMode(false);
    setShowRecentlyTouched(false);
    if (showIssuesOnly && onToggleIssuesOnly) onToggleIssuesOnly();
  }, [
    onToggleIssuesOnly,
    setCrossSetSearch,
    setInspectMode,
    setRefFilter,
    setSearchQuery,
    setShowDuplicates,
    setShowRecentlyTouched,
    setTypeFilter,
    showIssuesOnly,
  ]);

  const clearViewModes = useCallback(() => {
    if (multiModeEnabled) toggleMultiMode();
    if (themeLensEnabled) setThemeLensEnabled(false);
    if (condensedView) setCondensedView(false);
    if (showPreviewSplit) onTogglePreviewSplit?.();
    if (showFlatSearchResults) setSearchResultPresentation("grouped");
    if (sortOrder !== "default") setSortOrder("default");
  }, [
    condensedView,
    multiModeEnabled,
    onTogglePreviewSplit,
    setCondensedView,
    setSearchResultPresentation,
    setSortOrder,
    setThemeLensEnabled,
    showPreviewSplit,
    showFlatSearchResults,
    sortOrder,
    themeLensEnabled,
    toggleMultiMode,
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
    newPrimitiveSet,
    setNewPrimitiveSet,
    existingAlias,
    setExistingAlias,
    existingAliasSearch,
    setExistingAliasSearch,
    extractError,
    setExtractError,
    handleOpenExtractToAlias,
    handleConfirmExtractToAlias,
  } = useExtractToAlias({ connected, serverUrl, setName, onRefresh });

  // requestBulkDelete wrapper — passes current selectedPaths
  const requestBulkDelete = useCallback(() => {
    requestBulkDeleteFromHook(selectedPaths);
  }, [requestBulkDeleteFromHook, selectedPaths]);

  const handleBatchMoveToGroup = useCallback(async () => {
    const target = moveToGroupTarget.trim();
    if (!target || selectedPaths.size === 0 || !connected) return;

    const renames = [...selectedPaths].map((oldPath) => {
      const name = oldPath.split(".").pop()!;
      const newPath = `${target}.${name}`;
      return { oldPath, newPath };
    });

    const newPaths = renames.map((r) => r.newPath);
    if (new Set(newPaths).size !== newPaths.length) {
      setMoveToGroupError(
        "Some selected tokens have the same name — resolve conflicts before moving",
      );
      return;
    }

    setShowMoveToGroup(false);
    setMoveToGroupError("");
    setOperationLoading(
      `Moving ${selectedPaths.size} token${selectedPaths.size !== 1 ? "s" : ""}…`,
    );
    try {
      await apiFetch(
        `${serverUrl}/api/tokens/${encodeURIComponent(setName)}/batch-rename-paths`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ renames, updateAliases: true }),
        },
      );
      setSelectedPaths(new Set());
      setSelectMode(false);
    } catch (err) {
      onError?.(
        err instanceof ApiError ? err.message : "Move failed: network error",
      );
    }
    setOperationLoading(null);
    onRefresh();
  }, [
    moveToGroupTarget,
    selectedPaths,
    connected,
    serverUrl,
    setName,
    onRefresh,
    onError,
    setSelectMode,
    setSelectedPaths,
  ]);

  const handleBatchMoveToSet = useCallback(async () => {
    const target = batchMoveToSetTarget.trim();
    if (!target || selectedPaths.size === 0 || !connected) return;
    setShowBatchMoveToSet(false);
    setOperationLoading(
      `Moving ${selectedPaths.size} token${selectedPaths.size !== 1 ? "s" : ""} to ${target}…`,
    );
    try {
      await apiFetch(
        `${serverUrl}/api/tokens/${encodeURIComponent(setName)}/batch-move`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paths: [...selectedPaths],
            targetSet: target,
          }),
        },
      );
      setSelectedPaths(new Set());
      setSelectMode(false);
    } catch (err) {
      onError?.(
        err instanceof ApiError
          ? err.message
          : "Move to set failed: network error",
      );
    }
    setOperationLoading(null);
    onRefresh();
  }, [
    batchMoveToSetTarget,
    selectedPaths,
    connected,
    serverUrl,
    setName,
    onRefresh,
    onError,
    setSelectMode,
    setSelectedPaths,
  ]);

  const handleBatchCopyToSet = useCallback(async () => {
    const target = batchCopyToSetTarget.trim();
    if (!target || selectedPaths.size === 0 || !connected) return;
    setShowBatchCopyToSet(false);
    setOperationLoading(
      `Copying ${selectedPaths.size} token${selectedPaths.size !== 1 ? "s" : ""} to ${target}…`,
    );
    try {
      await apiFetch(
        `${serverUrl}/api/tokens/${encodeURIComponent(setName)}/batch-copy`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paths: [...selectedPaths],
            targetSet: target,
          }),
        },
      );
    } catch (err) {
      onError?.(
        err instanceof ApiError
          ? err.message
          : "Copy to set failed: network error",
      );
    }
    setOperationLoading(null);
    onRefresh();
  }, [
    batchCopyToSetTarget,
    selectedPaths,
    connected,
    serverUrl,
    setName,
    onRefresh,
    onError,
  ]);

  // handleTokenSelect, displayedLeafPaths, selectedLeafNodes, handleSelectAll, handleSelectGroupChildren
  // are managed by useTokenSelection (destructured above)

  /** Build nested DTCG JSON from a list of token nodes and copy to clipboard. */
  const copyTokensAsJson = useCallback((nodes: TokenNode[]) => {
    if (nodes.length === 0) return;
    // Build a nested DTCG object from flat token paths
    const root: Record<string, any> = {};
    for (const node of nodes) {
      if (node.isGroup) continue;
      const segments = node.path.split(".");
      let cursor = root;
      for (let i = 0; i < segments.length - 1; i++) {
        if (!(segments[i] in cursor)) cursor[segments[i]] = {};
        cursor = cursor[segments[i]];
      }
      const leaf: Record<string, unknown> = {
        $value: node.$value,
        $type: node.$type,
      };
      if (node.$description) leaf.$description = node.$description;
      cursor[segments[segments.length - 1]] = leaf;
    }
    const json = JSON.stringify(root, null, 2);
    navigator.clipboard
      .writeText(json)
      .then(() => {
        setCopyFeedback(true);
        setTimeout(() => setCopyFeedback(false), 1500);
      })
      .catch((err) => console.warn("[TokenList] clipboard write failed:", err));
  }, []);
  copyTokensAsJsonRef.current = copyTokensAsJson;

  /** Convert token paths to CSS custom property references and copy to clipboard. */
  const copyTokensAsCssVar = useCallback((nodes: TokenNode[]) => {
    const leafNodes = nodes.filter((n) => !n.isGroup);
    if (leafNodes.length === 0) return;
    const text = leafNodes
      .map((n) => `var(--${n.path.replace(/\./g, "-")})`)
      .join("\n");
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopyCssFeedback(true);
        setTimeout(() => setCopyCssFeedback(false), 1500);
      })
      .catch((err) => console.warn("[TokenList] clipboard write failed:", err));
  }, []);
  copyTokensAsCssVarRef.current = copyTokensAsCssVar;

  /** Copy token paths as DTCG alias reference syntax ({path.to.token}) — ⌘⌥C. */
  const copyTokensAsDtcgRef = useCallback((nodes: TokenNode[]) => {
    const leafNodes = nodes.filter((n) => !n.isGroup);
    if (leafNodes.length === 0) return;
    const text = leafNodes.map((n) => `{${n.path}}`).join("\n");
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopyAliasFeedback(true);
        setTimeout(() => setCopyAliasFeedback(false), 1500);
      })
      .catch((err) => console.warn("[TokenList] clipboard write failed:", err));
  }, []);
  copyTokensAsDtcgRefRef.current = copyTokensAsDtcgRef;

  /** Copy the focused/selected token(s) in the user's preferred format (⌘⇧C). */
  const copyTokensAsPreferred = useCallback((nodes: TokenNode[]) => {
    const leafNodes = nodes.filter((n) => !n.isGroup);
    if (leafNodes.length === 0) return;

    const fmt = (lsGet(STORAGE_KEYS.PREFERRED_COPY_FORMAT) ??
      "css-var") as PreferredCopyFormat;

    let text: string;
    if (fmt === "json") {
      const root: Record<string, any> = {};
      for (const node of leafNodes) {
        const segments = node.path.split(".");
        let cursor = root;
        for (let i = 0; i < segments.length - 1; i++) {
          if (!(segments[i] in cursor)) cursor[segments[i]] = {};
          cursor = cursor[segments[i]];
        }
        const leaf: Record<string, unknown> = {
          $value: node.$value,
          $type: node.$type,
        };
        if (node.$description) leaf.$description = node.$description;
        cursor[segments[segments.length - 1]] = leaf;
      }
      text = JSON.stringify(root, null, 2);
    } else if (fmt === "raw") {
      text = leafNodes
        .map((n) =>
          typeof n.$value === "string" ? n.$value : JSON.stringify(n.$value),
        )
        .join("\n");
    } else if (fmt === "dtcg-ref") {
      text = leafNodes.map((n) => `{${n.path}}`).join("\n");
    } else if (fmt === "scss") {
      text = leafNodes.map((n) => `$${n.path.replace(/\./g, "-")}`).join("\n");
    } else {
      // css-var (default)
      text = leafNodes
        .map((n) => `var(--${n.path.replace(/\./g, "-")})`)
        .join("\n");
    }

    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopyPreferredFeedback(true);
        setTimeout(() => setCopyPreferredFeedback(false), 1500);
      })
      .catch((err) => console.warn("[TokenList] clipboard write failed:", err));
  }, []);
  copyTokensAsPreferredRef.current = copyTokensAsPreferred;

  const resolveFlat = (flat: any[]) =>
    flat.map((t) => {
      if (t.$type === "gradient" && Array.isArray(t.$value)) {
        const resolvedStops = t.$value.map(
          (stop: { color: string; position: number }) => {
            if (isAlias(stop.color)) {
              const refPath = extractAliasPath(stop.color)!;
              const refEntry = allTokensFlat[refPath];
              if (refEntry) {
                const inner = resolveTokenValue(
                  refEntry.$value,
                  refEntry.$type,
                  allTokensFlat,
                );
                return { ...stop, color: inner.value ?? refEntry.$value };
              }
            }
            return stop;
          },
        );
        return { ...t, $value: resolvedStops };
      }
      const resolved = resolveTokenValue(t.$value, t.$type, allTokensFlat);
      return {
        ...t,
        $value: resolved.value ?? t.$value,
        $type: resolved.$type,
      };
    });

  const doApplyVariables = useCallback(
    (flat: any[]) => {
      parent.postMessage(
        {
          pluginMessage: {
            type: "apply-variables",
            tokens: flat,
            collectionMap,
            modeMap,
          },
        },
        "*",
      );
      dispatchToast(`Applied ${flat.length} variables`, "success");
    },
    [collectionMap, modeMap],
  );

  const handleApplyVariables = async () => {
    closeLongLivedReviewSurfaces();
    const flat = resolveFlat(flattenTokens(tokens)).map((t: any) => ({
      ...t,
      setName,
    }));
    setVarDiffLoading(true);
    try {
      const figmaTokens: any[] = await new Promise((resolve, reject) => {
        const cid = `tl-vars-${Date.now()}-${Math.random()}`;
        const timeout = setTimeout(() => {
          varReadPendingRef.current.delete(cid);
          reject(new Error("timeout"));
        }, 8000);
        varReadPendingRef.current.set(cid, (toks) => {
          clearTimeout(timeout);
          resolve(toks);
        });
        parent.postMessage(
          { pluginMessage: { type: "read-variables", correlationId: cid } },
          "*",
        );
      });
      const figmaMap = new Map(
        figmaTokens.map((t: any) => [t.path, String(t.$value ?? "")]),
      );
      let added = 0,
        modified = 0,
        unchanged = 0;
      for (const t of flat) {
        if (!figmaMap.has(t.path)) added++;
        else if (figmaMap.get(t.path) !== String(t.$value ?? "")) modified++;
        else unchanged++;
      }
      setVarDiffPending({ added, modified, unchanged, flat });
    } catch (err) {
      // Figma not reachable — show count-only confirmation
      console.warn("[TokenList] Figma variable diff failed:", err);
      setVarDiffPending({
        added: flat.length,
        modified: 0,
        unchanged: 0,
        flat,
      });
    } finally {
      setVarDiffLoading(false);
    }
  };

  const handleApplyStyles = async () => {
    setApplying(true);
    const flat = resolveFlat(flattenTokens(tokens));
    try {
      const result = await sendStyleApply("apply-styles", { tokens: flat });
      dispatchToast(`Applied ${result.count} styles`, "success");
      if (result.failures.length > 0) {
        const failedPaths = result.failures.map((f) => f.path).join(", ");
        onError?.(
          `${result.count}/${result.total} styles created. Failed: ${failedPaths}`,
        );
      }
    } catch (err) {
      onError?.(getErrorMessage(err, "Failed to apply styles"));
    } finally {
      setApplying(false);
    }
  };

  const getDeleteModalProps = (): {
    title: string;
    description?: string;
    confirmLabel: string;
    pathList?: string[];
    affectedRefs?: AffectedRef[];
    recipeImpacts?: RecipeImpact[];
    themeImpacts?: ThemeImpact[];
  } | null => {
    if (!deleteConfirm) return null;
    const genImpacts =
      deleteConfirm.recipeImpacts.length > 0
        ? deleteConfirm.recipeImpacts
        : undefined;
    const thmImpacts =
      deleteConfirm.themeImpacts.length > 0
        ? deleteConfirm.themeImpacts
        : undefined;
    if (deleteConfirm.type === "token") {
      const name = deleteConfirm.path.split(".").pop() ?? deleteConfirm.path;
      const { orphanCount, affectedRefs } = deleteConfirm;
      const setCount = new Set(affectedRefs.map((r) => r.setName)).size;
      const parts: string[] = [];
      if (orphanCount > 0)
        parts.push(
          `break ${orphanCount} alias reference${orphanCount !== 1 ? "s" : ""} in ${setCount} set${setCount !== 1 ? "s" : ""}`,
        );
      if (genImpacts)
        parts.push(
          `affect ${genImpacts.length} recipe${genImpacts.length !== 1 ? "s" : ""}`,
        );
      if (thmImpacts)
        parts.push(
          `affect ${thmImpacts.length} mode option${thmImpacts.length !== 1 ? "s" : ""}`,
        );
      return {
        title: `Delete "${name}"?`,
        description:
          parts.length > 0
            ? `This will ${parts.join(", ")}.`
            : `Token path: ${deleteConfirm.path}`,
        confirmLabel: "Delete",
        affectedRefs: orphanCount > 0 ? affectedRefs : undefined,
        recipeImpacts: genImpacts,
        themeImpacts: thmImpacts,
      };
    }
    if (deleteConfirm.type === "group") {
      const { orphanCount, affectedRefs } = deleteConfirm;
      const setCount = new Set(affectedRefs.map((r) => r.setName)).size;
      const parts: string[] = [
        `delete ${deleteConfirm.tokenCount} token${deleteConfirm.tokenCount !== 1 ? "s" : ""}`,
      ];
      if (orphanCount > 0)
        parts.push(
          `break ${orphanCount} alias reference${orphanCount !== 1 ? "s" : ""} in ${setCount} set${setCount !== 1 ? "s" : ""}`,
        );
      if (genImpacts)
        parts.push(
          `affect ${genImpacts.length} recipe${genImpacts.length !== 1 ? "s" : ""}`,
        );
      if (thmImpacts)
        parts.push(
          `affect ${thmImpacts.length} mode option${thmImpacts.length !== 1 ? "s" : ""}`,
        );
      return {
        title: `Delete group "${deleteConfirm.name}"?`,
        description: `This will ${parts.join(", ")}.`,
        confirmLabel: `Delete group (${deleteConfirm.tokenCount} token${deleteConfirm.tokenCount !== 1 ? "s" : ""})`,
        affectedRefs: orphanCount > 0 ? affectedRefs : undefined,
        recipeImpacts: genImpacts,
        themeImpacts: thmImpacts,
      };
    }
    const { paths, orphanCount, affectedRefs } = deleteConfirm;
    const setCount = new Set(affectedRefs.map((r) => r.setName)).size;
    const parts: string[] = [];
    if (orphanCount > 0)
      parts.push(
        `break ${orphanCount} alias reference${orphanCount !== 1 ? "s" : ""} in ${setCount} set${setCount !== 1 ? "s" : ""}`,
      );
    if (genImpacts)
      parts.push(
        `affect ${genImpacts.length} recipe${genImpacts.length !== 1 ? "s" : ""}`,
      );
    if (thmImpacts)
      parts.push(
        `affect ${thmImpacts.length} mode option${thmImpacts.length !== 1 ? "s" : ""}`,
      );
    return {
      title: `Delete ${paths.length} token${paths.length !== 1 ? "s" : ""}?`,
      description:
        parts.length > 0 ? `This will ${parts.join(", ")}.` : undefined,
      confirmLabel: `Delete ${paths.length} token${paths.length !== 1 ? "s" : ""}`,
      pathList: paths,
      affectedRefs: orphanCount > 0 ? affectedRefs : undefined,
      recipeImpacts: genImpacts,
      themeImpacts: thmImpacts,
    };
  };

  const modalProps = getDeleteModalProps();

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

  const handleCompareAcrossThemes = useCallback(
    (path: string) => {
      if (onOpenCrossThemeCompare) {
        onOpenCrossThemeCompare(path);
      }
    },
    [onOpenCrossThemeCompare],
  );

  // handleFindInAllSets is managed by useTokenWhereIs (destructured above)

  // Expose imperative actions to the parent via compareHandle ref
  useEffect(() => {
    if (!compareHandle) return;
    compareHandle.current = {
      openCompareMode: () => {
        setSelectMode(true);
        setShowBatchEditor(false);
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
    setSelectMode,
    setShowBatchEditor,
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

  const effectiveAllTokensFlat = themeLensEnabled || !unthemedAllTokensFlat
    ? allTokensFlat
    : unthemedAllTokensFlat;

  const tokenTreeSharedData = useMemo<TokenTreeSharedDataContextType>(
    () => ({
      allTokensFlat: effectiveAllTokensFlat,
      pathToSet,
    }),
    [effectiveAllTokensFlat, pathToSet],
  );

  const tokenTreeGroupState = useMemo<TokenTreeGroupStateContextType>(
    () => ({
      density,
      setName,
      selectMode,
      expandedPaths,
      highlightedToken: highlightedToken ?? null,
      previewedPath: highlightedToken ?? null,
      searchHighlight,
      dragOverGroup,
      dragOverGroupIsInvalid,
      dragSource,
      recipesByTargetGroup,
      themeCoverage,
      condensedView,
      rovingFocusPath: effectiveRovingPath,
    }),
    [
      density,
      setName,
      selectMode,
      expandedPaths,
      highlightedToken,
      searchHighlight,
      dragOverGroup,
      dragOverGroupIsInvalid,
      dragSource,
      recipesByTargetGroup,
      themeCoverage,
      condensedView,
      effectiveRovingPath,
    ],
  );

  const tokenTreeGroupActions = useMemo<TokenTreeGroupActionsContextType>(
    () => ({
      onToggleExpand: handleToggleExpand,
      onDeleteGroup: requestDeleteGroup,
      onCreateSibling: handleOpenCreateSibling,
      onCreateGroup: setNewGroupDialogParent,
      onRenameGroup: handleRenameGroup,
      onUpdateGroupMeta: handleUpdateGroupMeta,
      onRequestMoveGroup: handleRequestMoveGroup,
      onRequestCopyGroup: handleRequestCopyGroup,
      onDuplicateGroup: handleDuplicateGroup,
      onSyncGroup,
      onSyncGroupStyles,
      onSetGroupScopes,
      onGenerateScaleFromGroup,
      onZoomIntoGroup: handleZoomIntoGroup,
      onDragOverGroup: handleDragOverGroup,
      onDropOnGroup: handleDropOnGroup,
      onEditRecipe,
      onNavigateToRecipe,
      onRegenerateRecipe: handleRegenerateRecipe,
      onDetachRecipeGroup: handleDetachRecipeGroup,
      onNavigateToToken: onNavigateToAlias
        ? (path: string) => onNavigateToAlias(path)
        : undefined,
      onRovingFocus: setRovingFocusPath,
    }),
    [
      handleToggleExpand,
      requestDeleteGroup,
      handleOpenCreateSibling,
      setNewGroupDialogParent,
      handleRenameGroup,
      handleUpdateGroupMeta,
      handleRequestMoveGroup,
      handleRequestCopyGroup,
      handleDuplicateGroup,
      onSyncGroup,
      onSyncGroupStyles,
      onSetGroupScopes,
      onGenerateScaleFromGroup,
      handleZoomIntoGroup,
      handleDragOverGroup,
      handleDropOnGroup,
      onEditRecipe,
      onNavigateToRecipe,
      handleRegenerateRecipe,
      handleDetachRecipeGroup,
      onNavigateToAlias,
      setRovingFocusPath,
    ],
  );

  const tokenTreeLeafState = useMemo<TokenTreeLeafStateContextType>(
    () => ({
      density,
      serverUrl,
      setName,
      sets,
      selectionCapabilities,
      duplicateCounts,
      selectMode,
      highlightedToken: highlightedToken ?? null,
      previewedPath: highlightedToken ?? null,
      inspectMode,
      syncSnapshot,
      derivedTokenPaths,
      searchHighlight,
      selectedNodes,
      dragOverReorder,
      selectedLeafNodes,
      showResolvedValues,
      condensedView,
      starredPaths,
      dimensions,
      activeThemes,
      pendingRenameToken,
      pendingTabEdit,
      rovingFocusPath: effectiveRovingPath,
      showDuplicatesFilter: showDuplicates,
      modeVariantPaths: (!multiModeEnabled || themeLensEnabled) && modeVariantPaths.size > 0 ? modeVariantPaths : undefined,
      themeLensEnabled,
    }),
    [
      density,
      serverUrl,
      setName,
      sets,
      selectionCapabilities,
      duplicateCounts,
      selectMode,
      highlightedToken,
      inspectMode,
      syncSnapshot,
      derivedTokenPaths,
      searchHighlight,
      selectedNodes,
      dragOverReorder,
      selectedLeafNodes,
      showResolvedValues,
      condensedView,
      starredPaths,
      dimensions,
      activeThemes,
      pendingRenameToken,
      pendingTabEdit,
      effectiveRovingPath,
      showDuplicates,
      multiModeEnabled,
      modeVariantPaths,
      themeLensEnabled,
    ],
  );

  const tokenTreeLeafActions = useMemo<TokenTreeLeafActionsContextType>(
    () => ({
      onEdit,
      onPreview,
      onDelete: requestDeleteToken,
      onToggleSelect: handleTokenSelect,
      onNavigateToAlias,
      onRefresh,
      onPushUndo,
      onRequestMoveToken: handleRequestMoveTokenReview,
      onRequestCopyToken: handleRequestCopyTokenReview,
      onDuplicateToken: handleDuplicateToken,
      onDetachFromRecipe: handleDetachFromRecipe,
      onExtractToAlias: handleOpenExtractToAlias,
      onHoverToken: handleHoverToken,
      onFilterByType: setTypeFilter,
      onInlineSave: handleInlineSave,
      onRenameToken: handleRenameToken,
      onViewTokenHistory,
      onCompareAcrossThemes:
        dimensions.length > 0 ? handleCompareAcrossThemes : undefined,
      onDragStart: handleDragStartNotify,
      onDragEnd: handleDragEndNotify,
      onDragOverToken: handleDragOverToken,
      onDragLeaveToken: handleDragLeaveToken,
      onDropOnToken: handleDropReorder,
      onMultiModeInlineSave: multiModeData
        ? handleMultiModeInlineSave
        : undefined,
      onOpenRecipeEditor,
      onToggleStar,
      clearPendingRename: handleClearPendingRename,
      clearPendingTabEdit: handleClearPendingTabEdit,
      onTabToNext: handleTabToNext,
      onRovingFocus: setRovingFocusPath,
    }),
    [
      onEdit,
      onPreview,
      requestDeleteToken,
      handleTokenSelect,
      onNavigateToAlias,
      onRefresh,
      onPushUndo,
      handleRequestMoveTokenReview,
      handleRequestCopyTokenReview,
      handleDuplicateToken,
      handleDetachFromRecipe,
      handleOpenExtractToAlias,
      handleHoverToken,
      setTypeFilter,
      handleInlineSave,
      handleRenameToken,
      onViewTokenHistory,
      dimensions.length,
      handleCompareAcrossThemes,
      handleDragStartNotify,
      handleDragEndNotify,
      handleDragOverToken,
      handleDragLeaveToken,
      handleDropReorder,
      multiModeData,
      handleMultiModeInlineSave,
      onOpenRecipeEditor,
      onToggleStar,
      handleClearPendingRename,
      handleClearPendingTabEdit,
      handleTabToNext,
      setRovingFocusPath,
    ],
  );

  // Build modal context value — memoized so TokenListModals only re-renders when
  // modal-related state actually changes, not on every TokenList render.
  const modalContextValue = useMemo<TokenListModalsState>(
    () => ({
      setName,
      sets,
      allTokensFlat,
      connected,
      deleteConfirm,
      modalProps,
      executeDelete,
      onSetDeleteConfirm: setDeleteConfirm,
      newGroupDialogParent,
      newGroupName,
      newGroupError,
      onSetNewGroupName: setNewGroupName,
      onSetNewGroupError: setNewGroupError,
      handleCreateGroup,
      onSetNewGroupDialogParent: setNewGroupDialogParent,
      renameTokenConfirm,
      executeTokenRename,
      onSetRenameTokenConfirm: setRenameTokenConfirm,
      renameGroupConfirm,
      executeGroupRename,
      onSetRenameGroupConfirm: setRenameGroupConfirm,
      varDiffPending,
      doApplyVariables,
      onSetVarDiffPending: setVarDiffPending,
      extractToken,
      extractMode,
      onSetExtractMode: setExtractMode,
      newPrimitivePath,
      onSetNewPrimitivePath: setNewPrimitivePath,
      newPrimitiveSet,
      onSetNewPrimitiveSet: setNewPrimitiveSet,
      existingAlias,
      onSetExistingAlias: setExistingAlias,
      existingAliasSearch,
      onSetExistingAliasSearch: setExistingAliasSearch,
      extractError,
      onSetExtractError: setExtractError,
      handleConfirmExtractToAlias,
      onSetExtractToken: setExtractToken,
      showFindReplace,
      frFind,
      frReplace,
      frIsRegex,
      frScope,
      frTarget,
      frError,
      frBusy,
      frRegexError,
      frPreview,
      frValuePreview,
      frConflictCount,
      frRenameCount,
      frValueCount,
      frAliasImpact,
      frTypeFilter,
      frAvailableTypes,
      onSetFrFind: setFrFind,
      onSetFrReplace: setFrReplace,
      onSetFrIsRegex: setFrIsRegex,
      onSetFrScope: setFrScope,
      onSetFrTarget: setFrTarget,
      onSetFrTypeFilter: setFrTypeFilter,
      onSetFrError: setFrError,
      onSetShowFindReplace: setShowFindReplace,
      handleFindReplace,
      cancelFindReplace,
      promoteRows,
      promoteBusy,
      onSetPromoteRows: setPromoteRows,
      handleConfirmPromote,
      movingToken,
      movingGroup,
      moveTargetSet: movingGroup ? moveGroupTargetSet : moveTokenTargetSet,
      onSetMoveTargetSet: movingGroup
        ? setMoveGroupTargetSet
        : handleChangeMoveTokenTargetSet,
      onSetMovingToken: setMovingToken,
      onSetMovingGroup: setMovingGroup,
      handleConfirmMoveToken,
      handleConfirmMoveGroup,
      moveConflict: movingToken ? moveConflict : null,
      moveConflictAction,
      onSetMoveConflictAction: setMoveConflictAction,
      moveConflictNewPath,
      onSetMoveConflictNewPath: setMoveConflictNewPath,
      moveSourceToken: movingToken
        ? (allTokensFlat[movingToken] ?? null)
        : null,
      copyingToken,
      copyingGroup,
      copyTargetSet: copyingGroup ? copyGroupTargetSet : copyTokenTargetSet,
      onSetCopyTargetSet: copyingGroup
        ? setCopyGroupTargetSet
        : handleChangeCopyTokenTargetSet,
      onSetCopyingToken: setCopyingToken,
      onSetCopyingGroup: setCopyingGroup,
      handleConfirmCopyToken,
      handleConfirmCopyGroup,
      copyConflict: copyingToken ? copyConflict : null,
      copyConflictAction,
      onSetCopyConflictAction: setCopyConflictAction,
      copyConflictNewPath,
      onSetCopyConflictNewPath: setCopyConflictNewPath,
      copySourceToken: copyingToken
        ? (allTokensFlat[copyingToken] ?? null)
        : null,
      showMoveToGroup,
      moveToGroupTarget,
      moveToGroupError,
      selectedMoveCount: selectedPaths.size,
      onSetShowMoveToGroup: setShowMoveToGroup,
      onSetMoveToGroupTarget: setMoveToGroupTarget,
      onSetMoveToGroupError: setMoveToGroupError,
      handleBatchMoveToGroup,
      showBatchMoveToSet,
      batchMoveToSetTarget,
      onSetBatchMoveToSetTarget: setBatchMoveToSetTarget,
      onSetShowBatchMoveToSet: setShowBatchMoveToSet,
      handleBatchMoveToSet,
      showBatchCopyToSet,
      batchCopyToSetTarget,
      onSetBatchCopyToSetTarget: setBatchCopyToSetTarget,
      onSetShowBatchCopyToSet: setShowBatchCopyToSet,
      handleBatchCopyToSet,
    }),
    [
      setName,
      sets,
      allTokensFlat,
      connected,
      deleteConfirm,
      modalProps,
      executeDelete,
      newGroupDialogParent,
      newGroupName,
      newGroupError,
      handleCreateGroup,
      renameTokenConfirm,
      executeTokenRename,
      renameGroupConfirm,
      executeGroupRename,
      varDiffPending,
      doApplyVariables,
      extractToken,
      extractMode,
      newPrimitivePath,
      newPrimitiveSet,
      existingAlias,
      existingAliasSearch,
      extractError,
      handleConfirmExtractToAlias,
      showFindReplace,
      frFind,
      frReplace,
      frIsRegex,
      frScope,
      frTarget,
      frError,
      frBusy,
      frRegexError,
      frPreview,
      frValuePreview,
      frConflictCount,
      frRenameCount,
      frValueCount,
      frAliasImpact,
      frTypeFilter,
      frAvailableTypes,
      handleFindReplace,
      cancelFindReplace,
      promoteRows,
      promoteBusy,
      handleConfirmPromote,
      movingToken,
      movingGroup,
      moveGroupTargetSet,
      moveTokenTargetSet,
      setMoveGroupTargetSet,
      handleChangeMoveTokenTargetSet,
      handleConfirmMoveToken,
      handleConfirmMoveGroup,
      moveConflict,
      moveConflictAction,
      setMoveConflictAction,
      moveConflictNewPath,
      setMoveConflictNewPath,
      copyingToken,
      copyingGroup,
      copyGroupTargetSet,
      copyTokenTargetSet,
      setCopyGroupTargetSet,
      handleChangeCopyTokenTargetSet,
      handleConfirmCopyToken,
      handleConfirmCopyGroup,
      copyConflict,
      copyConflictAction,
      setCopyConflictAction,
      copyConflictNewPath,
      setCopyConflictNewPath,
      showMoveToGroup,
      moveToGroupTarget,
      moveToGroupError,
      selectedPaths,
      handleBatchMoveToGroup,
      showBatchMoveToSet,
      batchMoveToSetTarget,
      handleBatchMoveToSet,
      showBatchCopyToSet,
      batchCopyToSetTarget,
      handleBatchCopyToSet,
      setCopyingGroup,
      setCopyingToken,
      setDeleteConfirm,
      setExistingAlias,
      setExistingAliasSearch,
      setExtractError,
      setExtractMode,
      setExtractToken,
      setFrError,
      setFrFind,
      setFrIsRegex,
      setFrReplace,
      setFrScope,
      setFrTarget,
      setFrTypeFilter,
      setMovingGroup,
      setMovingToken,
      setNewGroupDialogParent,
      setNewGroupError,
      setNewGroupName,
      setNewPrimitivePath,
      setNewPrimitiveSet,
      setPromoteRows,
      setRenameGroupConfirm,
      setRenameTokenConfirm,
      setShowFindReplace,
    ],
  );

  const showStaleRecipeBanner =
    staleRecipesForSet.length > 0 &&
    dismissedStaleRecipeSignature !== staleRecipeSignature;

  // Stable callbacks for review overlay panel actions
  const handleCloseVarDiff = useCallback(() => setVarDiffPending(null), []);
  const handleApplyVarDiff = useCallback(() => {
    if (varDiffPending) {
      doApplyVariables(varDiffPending.flat);
      setVarDiffPending(null);
    }
  }, [varDiffPending, doApplyVariables]);
  const handleClosePromote = useCallback(() => setPromoteRows(null), [setPromoteRows]);
  const handleCloseMove = useCallback(() => setMovingToken(null), [setMovingToken]);
  const handleCloseCopy = useCallback(() => setCopyingToken(null), [setCopyingToken]);
  const moveSourceToken = movingToken ? (allTokensFlat[movingToken] ?? null) : null;
  const copySourceToken = copyingToken ? (allTokensFlat[copyingToken] ?? null) : null;

  return (
    <div
      className="flex flex-col h-full relative"
      data-tokens-library-surface-slot={librarySurfaceSlot}
      onKeyDown={handleListKeyDown}
    >
      {/* Copy feedback toast (⌘⌥C alias-ref or ⌘⇧C preferred-format) */}
      {(copyAliasFeedback || copyPreferredFeedback) && (
        <div
          className="absolute top-2 left-1/2 -translate-x-1/2 z-50 pointer-events-none px-3 py-1 rounded bg-[var(--color-figma-bg-brand,var(--color-figma-accent))] text-white text-[11px] font-medium shadow-md"
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
            sets={sets}
            operationLoading={operationLoading}
            showBatchEditor={showBatchEditor}
            copyFeedback={copyFeedback}
            copyCssFeedback={copyCssFeedback}
            copyAliasFeedback={copyAliasFeedback}
            onSelectAll={handleSelectAll}
            onToggleBatchEditor={handleToggleBatchEditor}
            onRequestBulkDelete={requestBulkDelete}
            onExitSelectMode={handleExitSelectMode}
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
            onMoveToSet={() => {
              setBatchMoveToSetTarget(sets.filter((s) => s !== setName)[0] ?? "");
              setShowBatchMoveToSet(true);
            }}
            onCopyToSet={() => {
              setBatchCopyToSetTarget(sets.filter((s) => s !== setName)[0] ?? "");
              setShowBatchCopyToSet(true);
            }}
            onCompare={selectedPaths.size >= 2 && onOpenCompare ? () => onOpenCompare(selectedPaths) : undefined}
            onLinkToTokens={() => handleOpenPromoteReview()}
          />
        )}

        {/* Batch editor panel */}
        {selectMode && showBatchEditor && selectedPaths.size > 0 && (
          <div ref={batchEditorPanelRef}>
            <BatchEditor
              selectedPaths={selectedPaths}
              allTokensFlat={allTokensFlat}
              setName={setName}
              sets={sets}
              serverUrl={serverUrl}
              connected={connected}
              onApply={onRefresh}
              onSelectedPathsChange={handleBatchEditorSelectionChange}
              onPushUndo={onPushUndo}
              onRequestDelete={requestBulkDelete}
              selectionScope={activeBulkEditScope}
            />
          </div>
        )}


        {/* Compact toolbar — single row: [back?] [search (filter badge)] [+] [...] */}
        {!selectMode && (
          <TokenListToolbar
            onNavigateBack={onNavigateBack}
            navHistoryLength={navHistoryLength}
            setName={setName}
            totalTokenCount={totalLeafCount}
            visibleTokenCount={
              crossSetResults !== null ? crossSetResults.length : displayedLeafNodes.length
            }
            groupCount={allGroupPaths.length}
            staleRecipeCount={staleRecipesForSet.length}
            activeThemeSelectionCount={activeThemeSelectionCount}
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
            contextSummary={contextSummary}
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
            onOpenSetSwitcher={onOpenSetSwitcher}
            onOpenSetManager={onOpenSetManager}
            onNavigateToRecipesWorkspace={onNavigateToRecipesWorkspace}
            onNavigateToThemesWorkspace={onNavigateToThemesWorkspace}
            onCreateRecipe={onNavigateToNewRecipe}
            hasDimensions={dimensions.length > 0}
            multiModeEnabled={multiModeEnabled}
            onToggleMultiMode={toggleMultiMode}
            themeLensEnabled={themeLensEnabled}
            onToggleThemeLens={() => setThemeLensEnabled((value) => !value)}
            onSelectTokens={() => { setSelectMode(true); setShowBatchEditor(false); }}
            onBulkEdit={handleOpenBulkWorkflowForVisibleTokens}
            onFindReplace={handleOpenFindReplaceReview}
            onFoundationTemplates={onOpenStartHere ? () => onOpenStartHere("template-library") : undefined}
            onApplyVariables={handleApplyVariables}
            onApplyStyles={handleApplyStyles}
            applyingOrLoading={applying || varDiffLoading}
            tokensExist={tokens.length > 0}
            overflowMenuProps={tokens.length > 0 ? {
              sortOrder,
              onSortOrderChange: setSortOrder,
              onExpandAll: handleExpandAll,
              onCollapseAll: handleCollapseAll,
              hasGroups: tokens.some((n) => n.isGroup),
              density,
              onDensityChange: setDensity,
              condensedView,
              onCondensedViewChange: setCondensedView,
              multiModeEnabled,
              onToggleMultiMode: toggleMultiMode,
              themeLensEnabled,
              onToggleThemeLens: () => setThemeLensEnabled((v) => !v),
              hasDimensions: dimensions.length > 0,
              showPreviewSplit,
              onTogglePreviewSplit,
              canToggleSearchResultPresentation: canToggleSearchResultPresentation && !crossSetSearch,
              searchResultPresentation,
              onSearchResultPresentationChange: setSearchResultPresentation,
              showIssuesOnly: showIssuesOnly ?? false,
              onToggleIssuesOnly,
              lintCount: lintViolations.length,
              recentlyTouchedCount: recentlyTouched.count,
              showRecentlyTouched,
              onToggleRecentlyTouched: () => setShowRecentlyTouched((v) => !v),
              inspectMode,
              onToggleInspectMode: () => setInspectMode((v) => !v),
              crossSetSearch,
              onToggleCrossSetSearch: () => setCrossSetSearch(!crossSetSearch),
              hasMultipleSets: sets.length > 1,
              refFilter,
              onRefFilterChange: setRefFilter,
              showDuplicates,
              onToggleDuplicates: () => setShowDuplicates(!showDuplicates),
              filterPresets,
              onApplyFilterPreset: applyFilterPreset,
              onDeleteFilterPreset: deleteFilterPreset,
              onSelectTokens: () => { setSelectMode(true); setShowBatchEditor(false); },
              onBulkEdit: handleOpenBulkWorkflowForVisibleTokens,
              onFindReplace: handleOpenFindReplaceReview,
              onFoundationTemplates: onOpenStartHere ? () => onOpenStartHere("template-library") : undefined,
              onApplyVariables: handleApplyVariables,
              onApplyStyles: handleApplyStyles,
              applyingOrLoading: applying || varDiffLoading,
              tokensExist: tokens.length > 0,
              connected,
              activeCount: viewOptionsActiveCount,
            } : null}
          />
        )}
      </div>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {searchQuery ? `${displayedLeafNodes.length} tokens found` : ""}
      </div>
      {showStaleRecipeBanner && (
        <NoticeBanner
          severity="warning"
          onDismiss={
            !runningStaleRecipes
              ? handleDismissStaleRecipeBanner
              : undefined
          }
          dismissLabel="Dismiss"
          actions={
            <button
              type="button"
              onClick={handleRegenerateAllStaleRecipes}
              disabled={runningStaleRecipes}
              className="inline-flex items-center gap-1 shrink-0 px-2 py-1 rounded bg-amber-500/15 text-amber-700 font-medium hover:bg-amber-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {runningStaleRecipes && <Spinner size="xs" />}
              <span>
                {runningStaleRecipes ? "Re-running…" : "Re-run all"}
              </span>
            </button>
          }
        >
          <span>
            {staleRecipesForSet.length === 1 ? "1 recipe is" : `${staleRecipesForSet.length} recipes are`}{" "}
            out of date:{" "}
            {staleRecipesForSet.map((recipe, i) => (
              <span key={recipe.id}>
                {i > 0 && ", "}
                {onNavigateToRecipe ? (
                  <button
                    type="button"
                    onClick={() => onNavigateToRecipe(recipe.id)}
                    className="underline decoration-amber-500/40 hover:decoration-amber-600 hover:text-amber-800 transition-colors"
                  >
                    {recipe.name}
                  </button>
                ) : (
                  recipe.name
                )}
              </span>
            ))}
          </span>
        </NoticeBanner>
      )}
      {/* Token stats bar — compact single row with type breakdown */}
      {statsBarOpen && statsTotalTokens > 0 && (
        <div className="shrink-0 border-b border-[var(--color-figma-border)]">
          <div className="flex items-center gap-2 px-3 py-1 text-[10px] text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-bg-secondary)]">
            <span className="font-medium text-[var(--color-figma-text)]">
              {statsTotalTokens}
            </span>
            <span>token{statsTotalTokens !== 1 ? "s" : ""}</span>
            <div className="flex-1 h-1.5 rounded-full overflow-hidden flex gap-px">
              {statsByType.map(([type, count]) => (
                <div
                  key={type}
                  style={{
                    width: `${(count / statsTotalTokens) * 100}%`,
                    backgroundColor:
                      TOKEN_TYPE_COLORS[type] ?? "var(--color-token-type-fallback)",
                  }}
                  title={`${type}: ${count}`}
                />
              ))}
            </div>
            <button
              onClick={() => setStatsBarOpen(false)}
              className="p-0.5 rounded text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              aria-label="Hide token statistics"
              title="Hide token statistics"
            >
              <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
      {/* Operation loading indicator */}
      {operationLoading && (
        <div className="shrink-0 flex items-center gap-1.5 px-3 py-1 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text-secondary)]">
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
          className={`h-full overflow-y-auto${operationLoading ? " opacity-50 pointer-events-none" : ""}`}
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
          {/* Multi-mode column headers */}
          {multiModeData && viewMode === "tree" && (
            <div className="sticky top-0 z-20 flex items-center border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
              <div className="flex-1 min-w-0 px-2 py-1 flex items-center gap-1">
                {dimensions.length > 1 ? (
                  <select
                    value={multiModeDimId ?? ""}
                    onChange={(e) => setMultiModeDimId(e.target.value)}
                    className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-1 py-0.5 text-[10px] font-medium text-[var(--color-figma-text-secondary)] focus-visible:border-[var(--color-figma-accent)]"
                  >
                    {dimensions.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                ) : (
                  <span className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">
                    {multiModeDimensionName ?? "Token"}
                  </span>
                )}
              </div>
              {multiModeData.results.map((r) => (
                <div
                  key={r.optionName}
                  className="w-[48px] shrink-0 px-0.5 py-1 text-[10px] font-medium text-[var(--color-figma-text-secondary)] text-center truncate border-l border-[var(--color-figma-border)]"
                  title={r.optionName}
                >
                  {r.optionName}
                </div>
              ))}
            </div>
          )}
          {crossSetResults !== null ? (
            /* Cross-set search results */
            crossSetResults.length === 0 ? (
              <div className="py-3">
                <FeedbackPlaceholder
                  variant="no-results"
                  size="section"
                  title="No tokens found across all sets"
                  description="Try a broader search or switch to a specific set."
                />
                {searchQuery &&
                  (() => {
                    const q = searchQuery.trim();
                    const qLower = q.toLowerCase();
                    const matchingType =
                      availableTypes.find((t) => t.toLowerCase() === qLower) ||
                      availableTypes.find((t) =>
                        t.toLowerCase().startsWith(qLower),
                      );
                    if (matchingType && typeFilter !== matchingType) {
                      return (
                        <div className="mt-2 text-center">
                          <button
                            onClick={() => {
                              setSearchQuery("");
                              setTypeFilter(matchingType);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-[var(--color-figma-border)] hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)] transition-colors"
                          >
                            Filter by type: {matchingType}{" "}
                            <span aria-hidden="true">&rarr;</span>
                          </button>
                        </div>
                      );
                    }
                    return null;
                  })()}
              </div>
            ) : (
              <div>
                {sets
                  .filter((sn) => crossSetResults.some((r) => r.setName === sn))
                  .map((sn) => {
                    const setResults = crossSetResults.filter(
                      (r) => r.setName === sn,
                    );
                    return (
                      <div key={sn}>
                        <div className="px-2 py-1 text-[10px] font-medium text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-bg-secondary)] border-b border-[var(--color-figma-border)] sticky top-0 z-10">
                          {sn}{" "}
                          <span className="font-normal opacity-60">
                            ({setResults.length})
                          </span>
                        </div>
                        {setResults.map((r) => (
                          <button
                            key={r.path}
                            onClick={() => onNavigateToSet?.(r.setName, r.path)}
                            className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-[var(--color-figma-bg-hover)] border-b border-[var(--color-figma-border)]/50"
                          >
                            {r.entry.$type === "color" &&
                              typeof r.entry.$value === "string" &&
                              r.entry.$value.startsWith("#") && (
                                <span
                                  className="shrink-0 w-3 h-3 rounded-sm border border-[var(--color-figma-border)]"
                                  style={{ background: r.entry.$value }}
                                />
                              )}
                            <span
                              className="flex-1 min-w-0 font-mono text-[10px] text-[var(--color-figma-text)] truncate"
                              title={r.path}
                            >
                              {highlightMatch(
                                r.path,
                                searchHighlight?.nameTerms ?? [],
                              )}
                            </span>
                            <span
                              className={`shrink-0 text-[8px] px-1 py-0.5 rounded ${TOKEN_TYPE_BADGE_CLASS[r.entry.$type] ?? "bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]"}`}
                            >
                              {r.entry.$type}
                            </span>
                          </button>
                        ))}
                      </div>
                    );
                  })}
                {crossSetTotal > crossSetResults.length && (
                  <div className="px-3 py-2 flex items-center justify-between border-t border-[var(--color-figma-border)]">
                    <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                      {crossSetResults.length} of {crossSetTotal} shown
                    </span>
                    <button
                      className="text-[10px] text-[var(--color-figma-accent)] hover:underline"
                      onClick={() => setCrossSetOffset(crossSetResults.length)}
                    >
                      Load{" "}
                      {Math.min(
                        CROSS_SET_PAGE_SIZE,
                        crossSetTotal - crossSetResults.length,
                      )}{" "}
                      more
                    </button>
                  </div>
                )}
              </div>
            )
          ) : inspectMode && selectedNodes.length === 0 ? (
            <FeedbackPlaceholder
              variant="empty"
              title="Select a layer to inspect"
              description="Bound tokens will appear here."
              icon={
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                  <path d="M10 17l5-5-5-5" />
                  <path d="M13 12H3" />
                </svg>
              }
            />
          ) : viewMode === "json" ? (
            <JsonEditorView
              jsonText={jsonText}
              jsonDirty={jsonDirty}
              jsonError={jsonError}
              jsonSaving={jsonSaving}
              jsonBrokenRefs={jsonBrokenRefs}
              jsonTextareaRef={jsonTextareaRef}
              connected={connected}
              hasTokens={tokens.length > 0}
              onChange={handleJsonChange}
              onSave={handleJsonSave}
              onRevert={handleJsonRevert}
            />
          ) : tokens.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 px-3 py-3 text-center">
              <FeedbackPlaceholder
                variant="empty"
                size="section"
                className="w-full max-w-[260px]"
                icon={
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
                  </svg>
                }
                title="This set is empty"
                description="Use the Create menu to add tokens."
              />
            </div>
          ) : displayedTokens.length === 0 && filtersActive ? (
            <TokenListFilteredEmptyState
              searchQuery={searchQuery}
              availableTypes={availableTypes}
              typeFilter={typeFilter}
              connected={connected}
              onClearFilters={clearFilters}
              onSetSearchQuery={setSearchQuery}
              onSetTypeFilter={setTypeFilter}
              onCreateNew={onCreateNew}
              onAddQueryQualifierValue={addQueryQualifierValue}
              onInsertSearchQualifier={insertSearchQualifier}
            />
          ) : (
            <div className="py-1">
              {zoomBreadcrumb ? (
                <div className="sticky top-0 z-10 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-[10px]">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={handleZoomUpOneLevel}
                      disabled={!zoomParentPath}
                      className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] disabled:cursor-default disabled:opacity-40"
                      title={
                        zoomParentPath
                          ? "Move up one group"
                          : "Already at the top scoped branch"
                      }
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
                        <path d="M12 19V5" />
                        <path d="m5 12 7-7 7 7" />
                      </svg>
                      <span>Up</span>
                    </button>
                    <button
                      onClick={handleZoomOut}
                      className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
                      title="Clear the scoped branch (Esc)"
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
                        <path d="M18 6 6 18" />
                        <path d="M6 6l12 12" />
                      </svg>
                      <span>All tokens</span>
                    </button>
                    <div className="min-w-0 flex items-center gap-0.5 overflow-x-auto">
                      {zoomBreadcrumb.map((seg, i) => (
                        <span
                          key={seg.path}
                          className="flex items-center gap-0.5 shrink-0"
                        >
                          {i > 0 && <span className="opacity-40 mx-0.5">›</span>}
                          {i < zoomBreadcrumb.length - 1 ? (
                            <button
                              className="truncate text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:underline max-w-[120px]"
                              title={seg.path}
                              onClick={() => handleZoomToAncestor(seg.path)}
                            >
                              {seg.name}
                            </button>
                          ) : (
                            <span
                              className="truncate font-medium text-[var(--color-figma-text)] max-w-[120px]"
                              title={seg.path}
                            >
                              {seg.name}
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                  {zoomSiblingBranches.length > 0 && (
                    <div className="mt-1 flex items-center gap-1 overflow-x-auto">
                      <span className="shrink-0 text-[9px] text-[var(--color-figma-text-tertiary)]">
                        Other branches
                      </span>
                      {zoomSiblingBranches.map((branch) => (
                        <button
                          key={branch.path}
                          onClick={() => handleZoomToAncestor(branch.path)}
                          className="shrink-0 text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:underline"
                          title={`Scope to ${branch.path}`}
                        >
                          {branch.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : !showFlatSearchResults && breadcrumbSegments.length > 0 ? (
                <div className="sticky top-0 z-10 flex items-center gap-0.5 px-2 py-1 bg-[var(--color-figma-bg-secondary)] border-b border-[var(--color-figma-border)] text-[10px] text-[var(--color-figma-text-secondary)] group/breadcrumb">
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
                    className="shrink-0 opacity-40 mr-0.5"
                  >
                    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                    <polyline points="9 22 9 12 15 12 15 22" />
                  </svg>
                  {breadcrumbSegments.map((seg, i) => (
                    <span key={seg.path} className="flex items-center gap-0.5">
                      {i > 0 && <span className="opacity-40 mx-0.5">›</span>}
                      {i < breadcrumbSegments.length - 1 ? (
                        <button
                          className="hover:text-[var(--color-figma-text)] hover:underline truncate max-w-[120px]"
                          title={`Jump to ${seg.path}`}
                          onClick={() => handleJumpToGroup(seg.path)}
                        >
                          {seg.name}
                        </button>
                      ) : (
                        <span
                          className="font-medium text-[var(--color-figma-text)] truncate max-w-[120px]"
                          title={seg.path}
                        >
                          {seg.name}
                        </span>
                      )}
                    </span>
                  ))}
                  <button
                    className="ml-auto flex items-center gap-0.5 opacity-0 group-hover/breadcrumb:opacity-100 group-focus-within/breadcrumb:opacity-100 transition-opacity text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] shrink-0"
                    title="Collapse and jump to group"
                    onClick={() =>
                      handleCollapseBelow(
                        breadcrumbSegments[breadcrumbSegments.length - 1].path,
                      )
                    }
                  >
                    <svg
                      width="8"
                      height="8"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M18 15l-6-6-6 6" />
                    </svg>
                    <span>Collapse</span>
                  </button>
                </div>
              ) : null}
              <div style={{ height: virtualTopPad }} aria-hidden="true" />
              {flatItems
                .slice(virtualStartIdx, virtualEndIdx)
                .map(({ node, depth, ancestorPathLabel }) => {
                  const moveEnabled = sortOrder === "default" && connected;
                  const parentPath = moveEnabled
                    ? (nodeParentPath(node.path, node.name) ?? "")
                    : "";
                  const siblings = moveEnabled
                    ? (siblingOrderMap.get(parentPath) ?? [])
                    : [];
                  const sibIdx = moveEnabled ? siblings.indexOf(node.name) : -1;
                  return (
                    <TokenTreeNode
                      key={node.path}
                      node={node}
                      depth={depth}
                      skipChildren
                      isSelected={
                        node.isGroup ? false : selectedPaths.has(node.path)
                      }
                      lintViolations={
                        lintViolationsMap.get(node.path) ??
                        EMPTY_LINT_VIOLATIONS
                      }
                      chainExpanded={expandedChains.has(node.path)}
                      ancestorPathLabel={ancestorPathLabel}
                      showFullPath={showRecentlyTouched}
                      onMoveUp={
                        moveEnabled && sibIdx > 0
                          ? () =>
                              handleMoveTokenInGroup(node.path, node.name, "up")
                          : undefined
                      }
                      onMoveDown={
                        moveEnabled &&
                        sibIdx >= 0 &&
                        sibIdx < siblings.length - 1
                          ? () =>
                              handleMoveTokenInGroup(
                                node.path,
                                node.name,
                                "down",
                              )
                          : undefined
                      }
                      multiModeValues={
                        multiModeData
                          ? getMultiModeValues(node.path)
                          : undefined
                      }
                    />
                  );
                })}
              <div style={{ height: virtualBottomPad }} aria-hidden="true" />
            </div>
          )}
        </TokenTreeProvider>
        </div>

        <TokenListReviewOverlays
          showBatchEditor={showBatchEditor}
          varDiffPending={varDiffPending}
          onCloseVarDiff={handleCloseVarDiff}
          onApplyVarDiff={handleApplyVarDiff}
          promoteRows={promoteRows}
          promoteBusy={promoteBusy}
          onPromoteRowsChange={setPromoteRows}
          onConfirmPromote={handleConfirmPromote}
          onClosePromote={handleClosePromote}
          movingToken={movingToken}
          setName={setName}
          sets={sets}
          moveTokenTargetSet={moveTokenTargetSet}
          onChangeMoveTokenTargetSet={handleChangeMoveTokenTargetSet}
          moveConflict={moveConflict}
          moveConflictAction={moveConflictAction}
          onMoveConflictActionChange={setMoveConflictAction}
          moveConflictNewPath={moveConflictNewPath}
          onMoveConflictNewPathChange={setMoveConflictNewPath}
          moveSourceToken={moveSourceToken}
          onConfirmMoveToken={handleConfirmMoveToken}
          onCloseMove={handleCloseMove}
          copyingToken={copyingToken}
          copyTokenTargetSet={copyTokenTargetSet}
          onChangeCopyTokenTargetSet={handleChangeCopyTokenTargetSet}
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
          setName={setName}
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

      {/* "Find in all sets" overlay */}
      {whereIsPath !== null && (
        <WhereIsOverlay
          whereIsPath={whereIsPath}
          whereIsResults={whereIsResults}
          whereIsLoading={whereIsLoading}
          onClose={handleCloseWhereIs}
          onNavigateToSet={onNavigateToSet}
        />
      )}
    </div>
  );
}
