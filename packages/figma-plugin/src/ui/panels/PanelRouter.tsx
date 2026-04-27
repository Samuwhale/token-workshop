/**
 * PanelRouter — routes (activeTopTab, activeSubTab, activeSecondarySurface) to the
 * correct panel component. Eliminates the O(N) condition matrix that previously
 * existed in App.tsx. Adding a new tab requires: one entry in the lookup table
 * + one render function below.
 *
 * Reads ConnectionContext, TokenDataContext, CollectionContext, and InspectContext
 * directly so callers only pass App-local state as props.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Layers, AlertCircle } from "lucide-react";
import { resolveCollectionIdForPath } from "@tokenmanager/core";
import { CanvasRouter } from "./CanvasRouter";
import { ExportRouter } from "./ExportRouter";
import { SyncRouter } from "./SyncRouter";
import { TokenList } from "../components/TokenList";
import { UnifiedComparePanel } from "../components/UnifiedComparePanel";
import { TokenDetails } from "../components/TokenDetails";
import { CollectionDetailsPanel } from "../components/CollectionDetailsPanel";
import type { PublishRoutingDraft } from "../hooks/usePublishRouting";
import { useResizableBoundary } from "../hooks/useResizableBoundary";
import { ResizeDivider } from "../components/ResizeDivider";
import { ImportPanel } from "../components/ImportPanel";
import type { ImportCompletionResult } from "../components/ImportPanelContext";
import { HistoryPanel } from "../components/HistoryPanel";
import { HealthPanel } from "../components/HealthPanel";
import type { HealthScope } from "../components/health/types";
import type { HistoryScope } from "../components/history/types";
import { ColorAnalysisPanel } from "../components/ColorAnalysisPanel";
import { FeedbackPlaceholder } from "../components/FeedbackPlaceholder";
import { SettingsPanel } from "../components/SettingsPanel";
import { NotificationsPanel } from "../components/NotificationsPanel";
import { KeyboardShortcutsPanel } from "../components/KeyboardShortcutsPanel";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { CollectionTabs } from "../components/library/CollectionTabs";
import { useConnectionContext } from "../contexts/ConnectionContext";
import {
  useCollectionStateContext,
  useTokenFlatMapContext,
} from "../contexts/TokenDataContext";
import {
  useSelectionContext,
  useUsageContext,
} from "../contexts/InspectContext";
import {
  useNavigationContext,
} from "../contexts/NavigationContext";
import { useEditorContext } from "../contexts/EditorContext";
import { STORAGE_KEYS, lsGet, lsSet } from "../shared/storage";
import {
  useApplyWorkspaceController,
  useEditorShellController,
  useCollectionStructureWorkspaceController,
  useShellWorkspaceController,
  useSyncWorkspaceController,
  useTokensWorkspaceController,
} from "../contexts/WorkspaceControllerContext";
import type { TokenNode } from "../hooks/useTokens";
import { useHealthSignals } from "../hooks/useHealthSignals";
import { useHealthData } from "../hooks/useHealthData";
import { useDeprecatedUsage } from "../hooks/useDeprecatedUsage";
import { useIssueActions } from "../hooks/useIssueActions";
import {
  buildTokenContextTarget,
  useTokenContextNavigation,
} from "../hooks/useTokenContextNavigation";
import type {
  ImportNextStepRecommendation,
  TopTab,
  SubTab,
  SecondarySurfaceId,
  TokenContextNavigationHistoryEntry,
  TokenContextNavigationRequest,
  TokensLibraryContextualSurface,
} from "../shared/navigationTypes";
import { getMostRelevantImportDestinationCollection } from "../shared/navigationTypes";
import { normalizeTokenType } from "../shared/tokenTypeCategories";
import { buildLibraryReviewSummary } from "../shared/reviewSummary";
import { getRuleLabel, suppressKey } from "../shared/ruleLabels";
import { GraphPanel } from "../components/graph/GraphPanel";
import { GenerateTokensWizard } from "../components/GenerateTokensWizard";

const DEFAULT_CREATE_TYPE = "color";

function readLastCreateGroup(): string {
  return lsGet(STORAGE_KEYS.LAST_CREATE_GROUP, "");
}

function readLastCreateType(): string {
  const savedType = lsGet(STORAGE_KEYS.LAST_CREATE_TYPE, DEFAULT_CREATE_TYPE);
  const normalizedType = normalizeTokenType(savedType, DEFAULT_CREATE_TYPE);
  if (normalizedType === savedType) {
    return savedType;
  }
  lsSet(STORAGE_KEYS.LAST_CREATE_TYPE, normalizedType);
  return normalizedType;
}

function persistLastCreateGroup(tokenPath: string): void {
  const groupPath = tokenPath.includes(".")
    ? tokenPath.split(".").slice(0, -1).join(".")
    : "";
  lsSet(STORAGE_KEYS.LAST_CREATE_GROUP, groupPath);
}

function persistLastCreateType(tokenType: string): void {
  lsSet(
    STORAGE_KEYS.LAST_CREATE_TYPE,
    normalizeTokenType(tokenType, DEFAULT_CREATE_TYPE),
  );
}

function resolveCreateLauncherPath(initialPath?: string): string {
  if (initialPath !== undefined) return initialPath;
  const lastGroup = readLastCreateGroup();
  return lastGroup ? `${lastGroup}.` : "";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PanelRouter({
  collectionMap,
  modeMap,
  savePublishRouting,
}: {
  collectionMap: Record<string, string>;
  modeMap: Record<string, string>;
  savePublishRouting: (
    collectionId: string,
    routing: PublishRoutingDraft,
  ) => Promise<{ collectionName?: string; modeName?: string }>;
}): ReactNode {
  const sideEditorBoundary = useResizableBoundary({
    storageKey: STORAGE_KEYS.SIDE_EDITOR_WIDTH,
    defaultSize: 340,
    min: 280,
    max: 560,
    axis: "x",
    mode: "px",
    measureFrom: "end",
  });
  const shell = useShellWorkspaceController();
  const editorShell = useEditorShellController();
  const tokensController = useTokensWorkspaceController();
  const applyController = useApplyWorkspaceController();
  const syncController = useSyncWorkspaceController();
  const collectionStructureController = useCollectionStructureWorkspaceController();
  const controller = {
    ...shell,
    ...editorShell,
    ...tokensController,
    ...applyController,
    ...syncController,
    onShowPasteModal: shell.openPasteModal,
    onShowImportPanel: shell.openImportPanel,
    onOpenCollectionCreateDialog: shell.openCollectionCreateDialog,
    onOpenStartHere: shell.openStartHere,
    onRestartGuidedSetup: shell.restartGuidedSetup,
    onClearAllComplete: shell.handleClearAllComplete,
    onImportComplete: shell.handleImportComplete,
  };
  const {
    refreshAll,
    handleEditorSave,
    guardEditorAction,
    validationIssues,
    lintViolations,
    refreshValidation,
    setErrorToast,
  } = controller;
  // Navigation and editor state from contexts (previously passed as props)
  const {
    activeTopTab,
    activeSubTab,
    activeSecondarySurface,
    navigateTo,
    closeSecondarySurface,
    beginHandoff,
    returnFromHandoff,
    notificationsOpen,
    openNotifications,
    closeNotifications,
  } = useNavigationContext();
  const {
    tokenDetails,
    setTokenDetails,
    inspectingCollection,
    setInspectingCollection,
    highlightedToken,
    setHighlightedToken,
    createFromEmpty,
    setCreateFromEmpty,
    handleNavigateToAlias,
    handleNavigateBack,
    navHistoryLength,
    showTokensCompare,
    setShowTokensCompare,
    tokensCompareMode,
    setTokensCompareMode,
    tokensComparePaths,
    setTokensComparePaths,
    tokensComparePath,
    setTokensComparePath,
    tokensCompareModeKey,
    setTokensCompareModeKey: _setTokensCompareModeKey,
    tokensCompareDefaultA,
    tokensCompareDefaultB,
    tokensContextualSurfaceState,
    switchContextualSurface,
    closeMaintenanceSurface,
    showImport,
  } = useEditorContext();
  const activeEditorSurface = tokensContextualSurfaceState.editorSurface;
  const activeMaintenanceSurface = tokensContextualSurfaceState.maintenanceSurface;

  // Read all four contexts — these cover ~40% of the data that panels need.
  const { serverUrl, connected, checking, updateServerUrlAndConnect } =
    useConnectionContext();
  const {
    collections,
    workingCollectionId: currentCollectionId,
    setWorkingCollectionId: setCurrentCollectionId,
    currentCollectionTokens: tokens,
    collectionTokenCounts,
    collectionDescriptions,
    collectionsError: fetchError,
    refreshCollections: refreshTokens,
  } = useCollectionStateContext();
  const collectionIds = collections.map((collection) => collection.id);
  const {
    allTokensFlat,
    pathToCollectionId,
    collectionIdsByPath,
    perCollectionFlat,
    syncSnapshot,
    tokensError,
    setFilteredCollectionCount,
    modeResolvedTokensFlat,
  } = useTokenFlatMapContext();
  const { selectedNodes } = useSelectionContext();
  const { tokenUsageCounts, hasTokenUsageScanResult } = useUsageContext();
  const healthRouteIntentRef = useRef<"deep-link" | null>(null);
  const historyRouteIntentRef = useRef<"deep-link" | null>(null);
  const [pendingGraphDocumentId, setPendingGraphDocumentId] = useState<string | null>(null);
  const [pendingGeneratedOutputGroup, setPendingGeneratedOutputGroup] = useState<string | null>(null);
  const createLibraryHealthScope = useCallback(
    (overrides?: Partial<HealthScope>): HealthScope => ({
      mode: "current",
      collectionId: currentCollectionId || null,
      tokenPath: null,
      issueKey: null,
      view: "dashboard",
      nonce: Date.now(),
      ...overrides,
    }),
    [currentCollectionId],
  );
  const createLibraryHistoryScope = useCallback(
    (overrides?: Partial<HistoryScope>): HistoryScope => ({
      mode: "all",
      collectionId: null,
      tokenPath: null,
      view: "recent",
      ...overrides,
    }),
    [],
  );
  const [healthScope, setHealthScope] = useState<HealthScope>(() =>
    createLibraryHealthScope(),
  );
  const [historyScope, setHistoryScope] = useState<HistoryScope>(() =>
    createLibraryHistoryScope(),
  );

  const openCollectionIssues = useCallback(
    (collectionId: string, tokenPath?: string) => {
      healthRouteIntentRef.current = "deep-link";
      setHealthScope(
        createLibraryHealthScope({
          mode: "current",
          collectionId,
          tokenPath: tokenPath ?? null,
          issueKey: null,
          view: "issues",
        }),
      );
      navigateTo("library", "health");
    },
    [createLibraryHealthScope, navigateTo],
  );

  const openScopedHealth = useCallback(
    (collectionId: string) => {
      healthRouteIntentRef.current = "deep-link";
      setHealthScope(
        createLibraryHealthScope({
          mode: "current",
          collectionId,
          tokenPath: null,
          issueKey: null,
          view: "dashboard",
        }),
      );
      navigateTo("library", "health");
    },
    [createLibraryHealthScope, navigateTo],
  );

  useEffect(() => {
    if (activeTopTab !== "library" || activeSubTab !== "health") {
      return;
    }
    if (healthRouteIntentRef.current === "deep-link") {
      healthRouteIntentRef.current = null;
      return;
    }
    setHealthScope(createLibraryHealthScope());
    healthRouteIntentRef.current = null;
  }, [activeSubTab, activeTopTab, createLibraryHealthScope]);

  useEffect(() => {
    if (activeTopTab !== "library" || activeSubTab !== "history") {
      return;
    }
    if (historyRouteIntentRef.current === "deep-link") {
      historyRouteIntentRef.current = null;
      return;
    }
    setHistoryScope(createLibraryHistoryScope({ view: "recent" }));
    historyRouteIntentRef.current = null;
  }, [activeSubTab, activeTopTab, createLibraryHistoryScope]);

  const openTokenInContext = useTokenContextNavigation({
    currentCollectionId,
    navigateTo,
    switchContextualSurface,
    setCurrentCollectionId,
    setHighlightedToken,
    beginHandoff,
    returnFromHandoff,
    guardEditorAction,
  });

  const openTokenDetails = useCallback(
    (
      path: string,
      collectionId: string,
      mode: "inspect" | "edit",
      name?: string,
    ) => {
      openTokenInContext({
        path,
        collectionId,
        mode,
        name,
        origin: "tokens",
      } satisfies TokenContextNavigationRequest);
    },
    [openTokenInContext],
  );

  const healthSignals = useHealthSignals({
    validationIssues,
    lintViolations,
    currentCollectionId,
  });
  const [reviewRefreshKey, setReviewRefreshKey] = useState(0);
  const refreshReviewData = useCallback(async () => {
    setReviewRefreshKey((currentKey) => currentKey + 1);
    return await refreshValidation();
  }, [refreshValidation]);
  const {
    duplicateAliasCountsByCollection,
    aliasOpportunityCountsByCollection,
    unusedTokenCountsByCollection,
  } = useHealthData({
    allTokensFlat,
    perCollectionFlat,
    tokenUsageCounts,
    tokenUsageReady: hasTokenUsageScanResult,
    validationIssues,
    currentCollectionId,
  });
  const deprecatedUsage = useDeprecatedUsage({
    serverUrl,
    connected,
    refreshKey: (controller.validationLastRefreshed?.getTime() ?? 0) + reviewRefreshKey,
  });
  const deprecatedUsageCountsByCollection = useMemo(
    () =>
      deprecatedUsage.entries.reduce<Map<string, number>>((counts, entry) => {
        counts.set(entry.collectionId, (counts.get(entry.collectionId) ?? 0) + 1);
        return counts;
      }, new Map()),
    [deprecatedUsage.entries],
  );
  const libraryReview = useMemo(
    () =>
      buildLibraryReviewSummary({
        collectionIds,
        healthSignals,
        duplicateAliasCountsByCollection,
        aliasOpportunityCountsByCollection,
        deprecatedUsageCountsByCollection,
        unusedTokenCountsByCollection,
      }),
    [
      aliasOpportunityCountsByCollection,
      collectionIds,
      deprecatedUsageCountsByCollection,
      duplicateAliasCountsByCollection,
      healthSignals,
      unusedTokenCountsByCollection,
    ],
  );
  const issueActions = useIssueActions({
    serverUrl,
    connected,
    onRefreshReview: refreshReviewData,
    onError: setErrorToast,
  });
  const tokenListHighlightedPath =
    tokenDetails?.collectionId === currentCollectionId
      ? tokenDetails.path
      : highlightedToken;
  const hasTokensLibrarySurface =
    tokens.length > 0 ||
    Boolean(currentCollectionId) ||
    createFromEmpty ||
    activeEditorSurface !== null ||
    activeMaintenanceSurface !== null;

  const openCreateLauncher = useCallback(
    (options?: {
      initialPath?: string;
      initialType?: string;
      initialValue?: string;
      currentCollectionId?: string;
    }) => {
      const targetCollectionId = options?.currentCollectionId ?? currentCollectionId;
      switchContextualSurface({
        surface: "token-details",
        token: {
          path: resolveCreateLauncherPath(options?.initialPath),
          collectionId: targetCollectionId,
          mode: "edit",
          isCreate: true,
          initialType: options?.initialType ?? readLastCreateType(),
          initialValue: options?.initialValue,
        },
      });
    },
    [currentCollectionId, switchContextualSurface],
  );

  const openTokenDetailsEditor = useCallback(
    (options: {
      path: string;
      collectionId: string;
      name?: string;
      origin?: string;
    }) => {
      openTokenInContext({
        path: options.path,
        collectionId: options.collectionId,
        mode: "edit",
        name: options.name,
        origin: options.origin ?? "tokens",
      } satisfies TokenContextNavigationRequest);
    },
    [openTokenInContext],
  );

  const openLinkedTokenInDetails = useCallback(
    (options: {
      path: string;
      mode: "inspect" | "edit";
      collectionId?: string;
    }) => {
      const resolution = options.collectionId
        ? {
            collectionId: options.collectionId,
            reason: "single" as const,
          }
        : resolveCollectionIdForPath({
            path: options.path,
            pathToCollectionId,
            collectionIdsByPath,
            preferredCollectionId: currentCollectionId,
          });
      const targetCollectionId = resolution.collectionId;
      if (!targetCollectionId) {
        setErrorToast(
          resolution.reason === "ambiguous"
            ? `Token target is ambiguous across collections: ${options.path}`
            : `Token target not found: ${options.path}`,
        );
        return;
      }

      guardEditorAction(() => {
        setTokenDetails((current) => {
          const nextHistory: TokenContextNavigationHistoryEntry[] = current
            ? [
                ...(current.navigationHistory ?? []),
                {
                  path: current.path,
                  collectionId: current.collectionId,
                  mode: current.mode,
                  name: current.name ?? current.path.split(".").pop() ?? current.path,
                },
              ]
            : [];
          const nextMode =
            targetCollectionId === currentCollectionId ? options.mode : "inspect";
          return buildTokenContextTarget({
            request: {
              path: options.path,
              collectionId: targetCollectionId,
              mode: options.mode,
              origin: current?.origin ?? "token-details",
              returnLabel: current?.backLabel,
              navigationHistory: nextHistory,
            },
            mode: nextMode,
            currentCollectionId,
            preserveHandoff: Boolean(current?.backLabel),
            navigateTo,
            switchContextualSurface,
            setCurrentCollectionId,
            setHighlightedToken,
            returnFromHandoff,
          });
        });
        if (targetCollectionId === currentCollectionId) {
          setHighlightedToken(options.path);
        } else {
          setHighlightedToken(null);
        }
      });
    },
    [
      collectionIdsByPath,
      currentCollectionId,
      guardEditorAction,
      navigateTo,
      pathToCollectionId,
      returnFromHandoff,
      setErrorToast,
      setCurrentCollectionId,
      setHighlightedToken,
      setTokenDetails,
      switchContextualSurface,
    ],
  );

  const handleTokenDetailsBack = useCallback(() => {
    const tokenDetailsHistory = tokenDetails?.navigationHistory ?? [];
    if (tokenDetailsHistory.length > 0) {
      const previousEntry =
        tokenDetailsHistory[tokenDetailsHistory.length - 1] ?? null;
      if (previousEntry) {
        const remainingHistory = tokenDetailsHistory.slice(0, -1);
        setTokenDetails((current) => {
          if (!current) {
            return current;
          }
          const resolvedMode =
            previousEntry.collectionId === currentCollectionId
              ? previousEntry.mode
              : "inspect";
          return buildTokenContextTarget({
            request: {
              path: previousEntry.path,
              collectionId: previousEntry.collectionId,
              mode: previousEntry.mode,
              name: previousEntry.name,
              origin: current.origin ?? "token-details",
              returnLabel: current.backLabel,
              navigationHistory: remainingHistory,
            },
            mode: resolvedMode,
            currentCollectionId,
            preserveHandoff: Boolean(current.backLabel),
            navigateTo,
            switchContextualSurface,
            setCurrentCollectionId,
            setHighlightedToken,
            returnFromHandoff,
          });
        });
        if (previousEntry.collectionId === currentCollectionId) {
          setHighlightedToken(previousEntry.path);
        } else {
          setHighlightedToken(null);
        }
        return;
      }
    }
    if (tokenDetails?.mode === "edit" && !tokenDetails.isCreate) {
      setTokenDetails((current) =>
        current ? { ...current, mode: "inspect" } : null,
      );
      refreshAll();
      return;
    }
    if (tokenDetails?.isCreate) {
      setCreateFromEmpty(false);
    }
    if (tokenDetails?.onBackToOrigin) {
      const onBackToOrigin = tokenDetails.onBackToOrigin;
      setTokenDetails(null);
      refreshAll();
      onBackToOrigin();
      return;
    }
    setTokenDetails(null);
    refreshAll();
  }, [
    tokenDetails,
    currentCollectionId,
    navigateTo,
    returnFromHandoff,
    setCreateFromEmpty,
    setCurrentCollectionId,
    setHighlightedToken,
    setTokenDetails,
    refreshAll,
    switchContextualSurface,
  ]);

  const handleTokenDetailsSaved = useCallback(
    (savedPath: string) => {
      const savedCollectionId =
        tokenDetails?.collectionId ?? currentCollectionId;
      if (tokenDetails?.isCreate) {
        persistLastCreateGroup(savedPath);
        setCreateFromEmpty(false);
      }
      handleEditorSave(savedPath, savedCollectionId);
    },
    [
      currentCollectionId,
      tokenDetails?.collectionId,
      tokenDetails?.isCreate,
      handleEditorSave,
      setCreateFromEmpty,
    ],
  );

  const handleTokenDetailsSaveAndCreateAnother = useCallback(
    (savedPath: string, savedType: string) => {
      persistLastCreateGroup(savedPath);
      persistLastCreateType(savedType);
      setCreateFromEmpty(false);
      setHighlightedToken(savedPath);
      refreshAll();
      const segments = savedPath.split(".");
      const parentPrefix =
        segments.length > 1 ? `${segments.slice(0, -1).join(".")}.` : "";
      setTokenDetails({
        path: parentPrefix,
        collectionId: tokenDetails?.collectionId ?? currentCollectionId,
        mode: "edit",
        isCreate: true,
        initialType: savedType,
      });
    },
    [
      currentCollectionId,
      tokenDetails?.collectionId,
      setCreateFromEmpty,
      setTokenDetails,
      setHighlightedToken,
      refreshAll,
    ],
  );

  useEffect(() => {
    if (
      !createFromEmpty ||
      tokenDetails ||
      showTokensCompare
    )
      return;
    openCreateLauncher();
  }, [
    createFromEmpty,
    tokenDetails,
    openCreateLauncher,
    showTokensCompare,
  ]);

  // Build the common TokenList `actions` object once.
  const tokenListActions = {
    // Row click / "open" action — lands in inspect mode first.
    onEdit: (path: string, name?: string) =>
      controller.guardEditorAction(() => {
        switchContextualSurface({
          surface: "token-details",
          token: { path, name, collectionId: currentCollectionId, mode: "inspect" },
        });
        setHighlightedToken(path);
      }),
    onCreateNew: (
      initialPath: string | undefined,
      initialType: string | undefined,
      initialValue: string | undefined,
    ) => {
      openCreateLauncher({ initialPath, initialType, initialValue });
    },
    onGenerateTokens: () => {
      controller.guardEditorAction(() => {
        switchContextualSurface({ surface: "generate-tokens" });
      });
    },
    onRefresh: controller.refreshAll,
    onPushUndo: controller.pushUndo,
    onTokenCreated: (path: string) => setHighlightedToken(path),
    onNavigateToAlias: handleNavigateToAlias,
    onNavigateBack: handleNavigateBack,
    navHistoryLength: navHistoryLength,
    onClearHighlight: () => setHighlightedToken(null),
    onPublishGroup: (groupPath: string, tokenCount: number) =>
      controller.setPublishPending({
        scope: 'group',
        groupPath,
        collectionId: currentCollectionId,
        tokenCount,
      }),
    onToggleIssuesOnly: () => controller.setShowIssuesOnly((v) => !v),
    onFilteredCountChange: setFilteredCollectionCount,
    onNavigateToCollection: controller.handleNavigateToCollection,
    onViewTokenHistory: (path: string) => {
      historyRouteIntentRef.current = "deep-link";
      setHistoryScope((currentScope) => ({
        ...currentScope,
        mode: "current",
        collectionId: currentCollectionId,
        tokenPath: path,
      }));
      navigateTo("library", "history");
    },
    onOpenTokenIssues: (path: string, collectionId: string) =>
      openCollectionIssues(collectionId, path),
    onDisplayedLeafNodesChange: (nodes: TokenNode[]) => {
      controller.displayedLeafNodesRef.current = nodes;
    },
    onTokenTouched: (path: string) => {
      controller.recentlyTouched.recordTouch(path, currentCollectionId);
    },
    onToggleStar: (path: string) =>
      controller.starredTokens.toggleStar(path, currentCollectionId),
    starredPaths: new Set(
      controller.starredTokens.tokens
        .filter((t) => t.collectionId === currentCollectionId)
        .map((t) => t.path),
    ),
    onRemoveStarredTokens: (paths: string[], collectionId: string) => {
      controller.starredTokens.removeMany(paths, collectionId);
    },
    onRenameStarredToken: (
      oldPath: string,
      newPath: string,
      collectionId: string,
    ) => {
      controller.starredTokens.rename(oldPath, newPath, collectionId);
    },
    onMoveStarredToken: (
      oldPath: string,
      newPath: string,
      sourceCollectionId: string,
      targetCollectionId: string,
    ) => {
      controller.starredTokens.move(
        oldPath,
        newPath,
        sourceCollectionId,
        targetCollectionId,
      );
    },
    onError: controller.setErrorToast,
    onOpenCompare: (paths: Set<string>) => {
      switchContextualSurface({
        surface: "compare",
        mode: "tokens",
        paths,
      });
    },
    onOpenCrossCollectionCompare: (path: string) => {
      switchContextualSurface({
        surface: "compare",
        mode: "cross-collection",
        path,
      });
    },
    onShowPasteModal: controller.onShowPasteModal,
    onOpenImportPanel: controller.onShowImportPanel,
    onExtractFromSelection: controller.triggerExtractFromSelection,
  };

  const tokenDetailsProps = tokenDetails
    ? {
        tokenPath: tokenDetails.path,
        tokenName: tokenDetails.name,
        currentCollectionId: currentCollectionId,
        collectionId: tokenDetails.collectionId,
        serverUrl,
        mode: tokenDetails.mode,
        onBack: handleTokenDetailsBack,
        backLabel: tokenDetails.backLabel,
        allTokensFlat,
        pathToCollectionId,
        collectionIdsByPath,
        perCollectionFlat,
        isCreateMode: tokenDetails.isCreate,
        initialType: tokenDetails.initialType,
        initialValue: tokenDetails.initialValue,
        editorSessionHost: {
          registerSession: controller.registerEditorSession,
          requestClose: controller.requestEditorClose,
        },
        onSaved: handleTokenDetailsSaved,
        onRenamed: (newPath: string) => {
          setTokenDetails((current) =>
            current ? { ...current, path: newPath, name: undefined } : null,
          );
          setHighlightedToken(newPath);
        },
        onSaveAndCreateAnother: handleTokenDetailsSaveAndCreateAnother,
        collections,
        onRefresh: controller.refreshAll,
        pushUndo: controller.pushUndo,
        availableFonts: controller.availableFonts,
        fontWeightsByFamily: controller.fontWeightsByFamily,
        onNavigateToToken: (
          path: string,
          collectionId?: string,
        ) =>
          openLinkedTokenInDetails({
            path,
            mode: tokenDetails.mode,
            collectionId,
          }),
        onOpenGraphDocument: (graphId: string) => {
          setPendingGraphDocumentId(graphId);
          navigateTo("library", "graph");
        },
        lintViolations: healthSignals.lintViolationsForCurrent,
        syncSnapshot:
          Object.keys(syncSnapshot).length > 0 ? syncSnapshot : undefined,
        requiresWorkingCollectionForEdit:
          tokenDetails.requiresWorkingCollectionForEdit,
        onMakeWorkingCollection: tokenDetails.onMakeWorkingCollection ?? undefined,
        onEnterEditMode: tokenDetails.isCreate
          ? undefined
          : () =>
              openTokenDetails(
                tokenDetails.path,
                tokenDetails.collectionId,
                "edit",
                tokenDetails.name,
              ),
        onDuplicate: tokenDetails.isCreate
          ? undefined
          : () => {
              void controller.handlePaletteDuplicate(
                tokenDetails.path,
                tokenDetails.collectionId,
              );
            },
        onOpenInHealth: tokenDetails.isCreate
          ? undefined
          : () => openCollectionIssues(tokenDetails.collectionId),
      }
    : null;

  const renderTokensComparePanel = () => (
    <UnifiedComparePanel
      mode={tokensCompareMode}
      onModeChange={setTokensCompareMode}
      tokenPaths={tokensComparePaths}
      onClearTokenPaths={() => setTokensComparePaths(new Set())}
      tokenPath={tokensComparePath}
      onClearTokenPath={() => setTokensComparePath("")}
      allTokensFlat={allTokensFlat}
      pathToCollectionId={pathToCollectionId}
      perCollectionFlat={perCollectionFlat}
      collections={collections}
      collectionIds={collectionIds}
      modeOptionsKey={tokensCompareModeKey}
      modeOptionsDefaultA={tokensCompareDefaultA}
      modeOptionsDefaultB={tokensCompareDefaultB}
      onEditToken={(collectionId, path) => {
        controller.guardEditorAction(() => {
          openTokenDetailsEditor({ path, collectionId, origin: "compare" });
        });
      }}
      onCreateToken={(path, collectionId, type, value) => {
        controller.guardEditorAction(() => {
          openCreateLauncher({
            initialPath: path,
            initialType: type,
            initialValue: value,
            currentCollectionId: collectionId,
          });
        });
      }}
      onGoToTokens={() => setShowTokensCompare(false)}
      serverUrl={serverUrl}
      onTokensCreated={controller.refreshAll}
      onBack={() => setShowTokensCompare(false)}
      backLabel="Back to tokens"
    />
  );

  type TokensContextualSurfaceRenderState = {
    surface: TokensLibraryContextualSurface;
    content: ReactNode;
    onDismiss: () => void;
  };

  const getEditorSurfaceRenderState =
    (): TokensContextualSurfaceRenderState | null => {
      if (activeEditorSurface === "token-details" && tokenDetails && tokenDetailsProps) {
        return {
          surface: "token-details",
          content: (
            <div className="flex flex-col h-full bg-[var(--color-figma-bg)] overflow-hidden">
              <TokenDetails {...tokenDetailsProps} />
            </div>
          ),
          onDismiss: controller.requestEditorClose,
        };
      }

      if (activeEditorSurface === "collection-details" && inspectingCollection) {
        return {
          surface: "collection-details",
          content: renderCollectionDetailsInInspector(inspectingCollection.collectionId),
          onDismiss: () => switchContextualSurface({ surface: null }),
        };
      }

      if (activeEditorSurface === "generate-tokens") {
        return {
          surface: "generate-tokens",
          content: (
            <GenerateTokensWizard
              serverUrl={serverUrl}
              collections={collections}
              workingCollectionId={currentCollectionId}
              perCollectionFlat={perCollectionFlat}
              onClose={() => switchContextualSurface({ surface: null })}
              onApplied={({ collectionId, firstPath, outputPrefix }) => {
                setCurrentCollectionId(collectionId);
                if (firstPath) {
                  setHighlightedToken(firstPath);
                }
                setPendingGeneratedOutputGroup(outputPrefix);
                switchContextualSurface({ surface: null });
                refreshAll();
              }}
              onOpenGraph={(graphId) => {
                setPendingGraphDocumentId(graphId);
                switchContextualSurface({ surface: null });
                navigateTo("library", "graph");
              }}
            />
          ),
          onDismiss: () => switchContextualSurface({ surface: null }),
        };
      }

      return null;
    };

  const getMaintenanceSurfaceRenderState =
    (): TokensContextualSurfaceRenderState | null => {
      if (activeMaintenanceSurface === "compare" && showTokensCompare) {
        return {
          surface: "compare",
          content: renderTokensComparePanel(),
          onDismiss: () => setShowTokensCompare(false),
        };
      }

      if (activeMaintenanceSurface === "color-analysis") {
        return {
          surface: "color-analysis",
          content: (
            <ColorAnalysisPanel
              allTokensFlat={allTokensFlat}
              perCollectionFlat={perCollectionFlat}
              collections={collections}
              currentCollectionId={currentCollectionId}
              onNavigateToToken={(path, collectionId) => {
                openTokenInContext({
                  path,
                  collectionId,
                  mode: "inspect",
                  origin: "color-analysis",
                  returnLabel: "Back to Color analysis",
                  onReturn: () => switchContextualSurface({ surface: "color-analysis" }),
                });
              }}
              onClose={closeMaintenanceSurface}
            />
          ),
          onDismiss: closeMaintenanceSurface,
        };
      }

      if (activeMaintenanceSurface === "import" && showImport) {
        return {
          surface: "import",
          content: (
            <div className="h-full min-h-0 overflow-hidden">
              <ErrorBoundary panelName="Import" onReset={closeMaintenanceSurface}>
                <ImportPanel
                  serverUrl={serverUrl}
                  connected={connected}
                  workingCollectionId={currentCollectionId}
                  onImported={refreshTokens}
                  onImportComplete={(result) => {
                    controller.onImportComplete(result);
                  }}
                  onOpenImportNextStep={(result, recommendation) =>
                    openImportNextStep(result, recommendation)
                  }
                  onPushUndo={controller.pushUndo}
                />
              </ErrorBoundary>
            </div>
          ),
          onDismiss: closeMaintenanceSurface,
        };
      }

      return null;
    };

  const renderTokensLibraryBody = () => (
    <div className="flex-1 min-w-0 overflow-hidden">
      <TokenList
        ctx={{ collectionId: currentCollectionId, collectionIds, serverUrl, connected, selectedNodes }}
        data={{
          tokens,
          allTokensFlat: modeResolvedTokensFlat,
          lintViolations: healthSignals.lintViolationsForCurrent,
          syncSnapshot:
            Object.keys(syncSnapshot).length > 0 ? syncSnapshot : undefined,
          tokenUsageCounts,
          tokenUsageReady: hasTokenUsageScanResult,
          perCollectionFlat,
          collectionMap,
          collectionTokenCounts,
          modeMap,
          collections,
          unresolvedAllTokensFlat: allTokensFlat,
          pathToCollectionId,
          collectionIdsByPath,
        }}
        actions={tokenListActions}
        recentlyTouched={controller.recentlyTouched}
        highlightedToken={tokenListHighlightedPath}
        focusGroupPath={pendingGeneratedOutputGroup}
        onFocusGroupHandled={() => setPendingGeneratedOutputGroup(null)}
        showIssuesOnly={controller.showIssuesOnly}
        editingTokenPath={tokenDetails?.mode === "edit" ? tokenDetails.path : null}
        compareHandle={controller.tokenListCompareRef}
      />
    </div>
  );

  const renderFullContextualSurface = (
    surfaceState: TokensContextualSurfaceRenderState,
  ) => (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden panel-slide-in"
      onKeyDown={(e) => {
        if (
          (e.key === "]" || e.key === "[") &&
          (e.metaKey || e.ctrlKey) &&
          !e.shiftKey &&
          !e.altKey
        ) {
          e.preventDefault();
          controller.handleEditorNavigate(e.key === "]" ? 1 : -1);
        }
      }}
    >
      {surfaceState.content}
    </div>
  );

  const renderTokensContextualPanel = (): ReactNode => {
    const surfaceState =
      getMaintenanceSurfaceRenderState() ?? getEditorSurfaceRenderState();

    if (surfaceState) {
      return renderFullContextualSurface(surfaceState);
    }

    return null;
  };

  const openImportNextStep = useCallback(
    (
      result: ImportCompletionResult,
      recommendation: ImportNextStepRecommendation,
    ) => {
      if (recommendation.target.kind !== "workspace") {
        return;
      }

      const targetCollectionId =
        getMostRelevantImportDestinationCollection(result);
      if (targetCollectionId) {
        setCurrentCollectionId(targetCollectionId);
      }

      navigateTo(recommendation.target.topTab, recommendation.target.subTab);
    },
    [navigateTo, setCurrentCollectionId],
  );

  type SecondaryPanelRenderer = () => ReactNode;

  // Secondary surfaces are full-height takeovers: they keep the shell visible
  // while replacing the main body until the user closes them.
  const SECONDARY_PANEL_MAP: Partial<
    Record<SecondarySurfaceId, SecondaryPanelRenderer>
  > = {
    shortcuts: () => <KeyboardShortcutsPanel />,
    settings: () => (
      <SettingsPanel
        serverUrl={serverUrl}
        connected={connected}
        checking={checking}
        updateServerUrlAndConnect={updateServerUrlAndConnect}
        onRestartGuidedSetup={controller.onRestartGuidedSetup}
        onClearAllComplete={controller.onClearAllComplete}
        onClose={closeSecondarySurface}
      />
    ),
  };

  if (activeSecondarySurface) {
    const secondaryRenderer = SECONDARY_PANEL_MAP[activeSecondarySurface];
    return secondaryRenderer ? secondaryRenderer() : null;
  }

  const renderCanvasSubTab = (subTab: "inspect" | "repair") => (
    <CanvasRouter
      subTab={subTab}
      reviewTotals={libraryReview.totals}
      openScopedHealth={openScopedHealth}
      openTokenInContext={openTokenInContext}
    />
  );

  // ---------------------------------------------------------------------------
  // Sub-tab panel routing — O(1) lookup, no repeated condition guards
  // ---------------------------------------------------------------------------

  type PanelRenderer = () => ReactNode;

  const PANEL_MAP: Record<TopTab, Partial<Record<SubTab, PanelRenderer>>> = {
    library: {
      tokens: renderLibraryTokens,
      graph: renderLibraryGraph,
      health: renderLibraryHealth,
      history: renderLibraryHistory,
    },
    canvas: {
      inspect: () => renderCanvasSubTab("inspect"),
      repair: () => renderCanvasSubTab("repair"),
    },
    publish: {
      "publish-figma": () => (
        <SyncRouter
          collectionMap={collectionMap}
          modeMap={modeMap}
          savePublishRouting={savePublishRouting}
        />
      ),
      "publish-code": () => <ExportRouter />,
    },
  };

  const renderer = PANEL_MAP[activeTopTab]?.[activeSubTab];
  const panelContent = renderer ? renderer() : null;

  return (
    <div className="relative flex h-full min-h-0 overflow-hidden">
      <div className="min-w-0 flex-1 overflow-hidden">{panelContent}</div>
      {notificationsOpen && (
        <>
          <div
            className="absolute inset-0 z-10 bg-[var(--color-figma-overlay)]"
            onClick={closeNotifications}
          />
          <div className="absolute right-0 top-0 bottom-0 z-20 w-[320px] border-l border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-lg panel-slide-in">
            <NotificationsPanel
              history={controller.notificationHistory}
              onClear={controller.clearNotificationHistory}
              onOpenToken={(path, collectionId) =>
                openTokenInContext({
                  path,
                  collectionId,
                  mode: "inspect",
                  origin: "notifications",
                  returnLabel: "Back to Notifications",
                  onReturn: openNotifications,
                })
              }
            />
          </div>
        </>
      )}
    </div>
  );

  // ---------------------------------------------------------------------------
  // Panel render functions — each closes over context + props
  // ---------------------------------------------------------------------------

  function handleLibraryCollectionSelect(collectionId: string): void {
    if (collectionId !== currentCollectionId) {
      setCurrentCollectionId(collectionId);
    }

    if (
      activeEditorSurface === "collection-details" &&
      inspectingCollection?.collectionId !== collectionId
    ) {
      setInspectingCollection({ collectionId });
    }

    if (activeTopTab !== "library") {
      return;
    }

    if (activeSubTab === "health") {
      setHealthScope({
        ...healthScope,
        mode: "current",
        collectionId,
        tokenPath: null,
        issueKey: null,
        view: "dashboard",
        nonce: Date.now(),
      });
      return;
    }

    if (activeSubTab === "history") {
      setHistoryScope({
        ...historyScope,
        mode: "current",
        collectionId,
        tokenPath: null,
      });
    }
  }

  function renderCollectionTabs(
    section: "tokens" | "health" | "history",
  ): ReactNode {
    const allCollectionsScope =
      section === "tokens"
        ? undefined
        : {
            selected:
              section === "health"
                ? healthScope.mode === "all"
                : historyScope.mode === "all",
            onSelect: () => {
              if (section === "health") {
                setHealthScope({
                  ...healthScope,
                  mode: "all",
                  collectionId: null,
                  tokenPath: null,
                  issueKey: null,
                  view: "dashboard",
                  nonce: Date.now(),
                });
                return;
              }

              setHistoryScope({
                ...historyScope,
                mode: "all",
                collectionId: null,
                tokenPath: null,
              });
            },
          };

    const tabsCurrentId =
      section === "tokens"
        ? currentCollectionId
        : section === "health"
          ? healthScope.mode === "current"
            ? healthScope.collectionId ?? currentCollectionId
            : null
          : historyScope.mode === "current"
            ? historyScope.collectionId ?? currentCollectionId
            : null;

    return (
      <CollectionTabs
        collections={collections}
        currentCollectionId={tabsCurrentId}
        collectionDisplayNames={collectionMap}
        collectionTokenCounts={collectionTokenCounts}
        collectionHealth={libraryReview.byCollection}
        focusRequestKey={shell.collectionPickerFocusRequestKey}
        allCollectionsScope={allCollectionsScope}
        onSelectCollection={handleLibraryCollectionSelect}
        onOpenCreateCollection={controller.onOpenCollectionCreateDialog}
        onOpenImport={controller.onShowImportPanel}
        activeCollectionSettings={
          section === "tokens"
            ? {
                open: activeEditorSurface === "collection-details",
                onToggle: (collectionId: string) => {
                  if (
                    activeEditorSurface === "collection-details" &&
                    inspectingCollection?.collectionId === collectionId
                  ) {
                    switchContextualSurface({ surface: null });
                    return;
                  }
                  switchContextualSurface({
                    surface: "collection-details",
                    collection: { collectionId },
                  });
                },
              }
            : undefined
        }
      />
    );
  }

  function renderLibraryScaffold({
    body,
    tabs,
    header,
    contextualPanel,
  }: {
    body: ReactNode;
    tabs?: ReactNode;
    header?: ReactNode;
    contextualPanel?: ReactNode;
  }): ReactNode {
    return (
      <div className="flex h-full min-h-0 overflow-hidden bg-[var(--color-figma-bg)]">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {tabs}
          {(fetchError || tokensError) && (
            <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-figma-error)]/20 bg-[var(--color-figma-error)]/10 px-3 py-1.5">
              <AlertCircle
                size={10}
                strokeWidth={2}
                className="shrink-0 text-[var(--color-figma-error)]"
                aria-hidden
              />
              <span className="flex-1 truncate text-secondary text-[var(--color-figma-text-secondary)]">
                Failed to load tokens: {fetchError || tokensError}
              </span>
              <button
                onClick={refreshTokens}
                className="shrink-0 rounded border border-[var(--color-figma-error)]/40 px-2 py-0.5 text-secondary text-[var(--color-figma-error)] transition-colors hover:bg-[var(--color-figma-error)]/10"
              >
                Retry
              </button>
            </div>
          )}

          {header}
          <div className="min-h-0 flex-1 overflow-hidden">{body}</div>
        </div>

        {contextualPanel ? (
          <>
            <ResizeDivider
              axis="x"
              ariaLabel="Resize contextual panel"
              ariaValueNow={sideEditorBoundary.ariaValueNow}
              onMouseDown={sideEditorBoundary.onMouseDown}
              onKeyDown={sideEditorBoundary.onKeyDown}
            />
            <div
              className="flex min-h-0 shrink-0 flex-col overflow-hidden border-l border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]"
              style={{ width: sideEditorBoundary.size }}
            >
              {contextualPanel}
            </div>
          </>
        ) : null}
      </div>
    );
  }

  function renderCollectionDetailsInInspector(collectionId: string): ReactNode {
    return (
      <CollectionDetailsPanel
        collection={
          collections.find((collection) => collection.id === collectionId) ?? null
        }
        collectionIds={collectionIds}
        collectionTokenCounts={collectionTokenCounts}
        collectionDescriptions={collectionDescriptions}
        collectionDisplayNames={collectionMap}
        serverUrl={serverUrl}
        connected={connected}
        presentation="bottom"
        onModeMutated={refreshTokens}
        onClose={() => switchContextualSurface({ surface: null })}
        onRename={collectionStructureController.onRename}
        onDuplicate={collectionStructureController.onDuplicate}
        onDelete={collectionStructureController.onDelete}
        onEditInfo={collectionStructureController.onEditInfo}
        onMerge={collectionStructureController.onMerge}
        onSplit={collectionStructureController.onSplit}
        editingMetadataCollectionId={collectionStructureController.editingMetadataCollectionId}
        metadataDescription={collectionStructureController.metadataDescription}
        setMetadataDescription={collectionStructureController.setMetadataDescription}
        onMetadataSave={collectionStructureController.onMetadataSave}
        deletingCollectionId={collectionStructureController.deletingCollectionId}
        onDeleteConfirm={collectionStructureController.onDeleteConfirm}
        onDeleteCancel={collectionStructureController.onDeleteCancel}
        mergingCollectionId={collectionStructureController.mergingCollectionId}
        mergeTargetCollectionId={collectionStructureController.mergeTargetCollectionId}
        mergeConflicts={collectionStructureController.mergeConflicts}
        mergeResolutions={collectionStructureController.mergeResolutions}
        mergeChecked={collectionStructureController.mergeChecked}
        mergeLoading={collectionStructureController.mergeLoading}
        onMergeTargetChange={collectionStructureController.onMergeTargetChange}
        setMergeResolutions={collectionStructureController.setMergeResolutions}
        onMergeCheckConflicts={collectionStructureController.onMergeCheckConflicts}
        onMergeConfirm={collectionStructureController.onMergeConfirm}
        onMergeClose={collectionStructureController.onMergeClose}
        splittingCollectionId={collectionStructureController.splittingCollectionId}
        splitPreview={collectionStructureController.splitPreview}
        splitDeleteOriginal={collectionStructureController.splitDeleteOriginal}
        splitLoading={collectionStructureController.splitLoading}
        setSplitDeleteOriginal={collectionStructureController.setSplitDeleteOriginal}
        onSplitConfirm={collectionStructureController.onSplitConfirm}
        onSplitClose={collectionStructureController.onSplitClose}
      />
    );
  }

  function renderLibraryTokens(): ReactNode {
    const tokensEmpty =
      collections.length === 0 &&
      !createFromEmpty &&
      !tokenDetails;

    const body = tokensEmpty ? (
      <FeedbackPlaceholder
        variant="empty"
        size="full"
        icon={<Layers size={20} strokeWidth={1.5} aria-hidden />}
        title="No collections yet"
        description="Start by importing a system, authoring one, or extracting from your current selection."
        primaryAction={{
          label: "Get started",
          onClick: () => controller.onOpenStartHere(),
        }}
      />
    ) : hasTokensLibrarySurface ? (
      renderTokensLibraryBody()
    ) : null;

    return renderLibraryScaffold({
      body,
      tabs: tokensEmpty ? undefined : renderCollectionTabs("tokens"),
      contextualPanel: renderTokensContextualPanel(),
    });
  }

  function renderReviewContextPanel(): ReactNode {
    const scopedCollectionId =
      healthScope.mode === "current"
        ? healthScope.collectionId ?? currentCollectionId
        : null;
    const selectedIssue =
      healthScope.mode === "current" &&
      healthScope.view === "issues" &&
      (healthScope.issueKey || healthScope.tokenPath)
        ? (validationIssues ?? [])
            .filter((issue) => !issueActions.suppressedKeys.has(suppressKey(issue)))
            .filter((issue) => issue.rule !== "no-duplicate-values")
            .filter((issue) => issue.rule !== "alias-opportunity")
            .find(
              (issue) =>
                issue.collectionId === scopedCollectionId &&
                (healthScope.issueKey
                  ? suppressKey(issue) === healthScope.issueKey
                  : issue.path === healthScope.tokenPath),
            ) ?? null
        : null;

    if (!selectedIssue) {
      return null;
    }

    const ruleMeta = getRuleLabel(selectedIssue.rule);
    return (
      <div className="flex h-full flex-col overflow-y-auto px-4 py-4">
        <h3 className="text-body font-semibold text-[var(--color-figma-text)]">
          {ruleMeta.label}
        </h3>
        <p className="mt-1 break-all font-mono text-secondary text-[var(--color-figma-text-secondary)]">
          {selectedIssue.path}
        </p>
        <p className="mt-3 text-body leading-[1.45] text-[var(--color-figma-text-secondary)]">
          {selectedIssue.message}
        </p>
        {ruleMeta.tip ? (
          <p className="mt-2 text-secondary text-[var(--color-figma-text-secondary)]">
            {ruleMeta.tip}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() =>
            openTokenInContext({
              path: selectedIssue.path,
              collectionId: selectedIssue.collectionId,
              mode: "inspect",
              origin: "health",
              returnLabel: "Back to Review",
            })
          }
          className="mt-4 self-start rounded-md bg-[var(--color-figma-bg-secondary)] px-2.5 py-1.5 text-secondary font-medium text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
        >
          Open token
        </button>
      </div>
    );
  }

  function renderLibraryGraph(): ReactNode {
    const body = (
      <div className="h-full min-h-0 overflow-hidden">
        <ErrorBoundary
          panelName="Graph"
          onReset={() => navigateTo("library", "tokens")}
        >
          <GraphPanel
            serverUrl={serverUrl}
            collections={collections}
            workingCollectionId={currentCollectionId}
            perCollectionFlat={perCollectionFlat}
            tokenChangeKey={controller.tokenChangeKey}
            initialGraphId={pendingGraphDocumentId}
            onInitialGraphHandled={() => setPendingGraphDocumentId(null)}
            onNavigateToToken={(path, collectionId) => {
              openTokenInContext({
                path,
                collectionId,
                mode: "inspect",
                origin: "graph",
                returnLabel: "Back to graph",
              });
            }}
          />
        </ErrorBoundary>
      </div>
    );
    return renderLibraryScaffold({ body });
  }

  function renderLibraryHealth(): ReactNode {
    const body = (
      <div className="h-full min-h-0 overflow-hidden">
        <ErrorBoundary
          panelName="Review"
          onReset={() => navigateTo("library", "tokens")}
        >
          <HealthPanel
            serverUrl={serverUrl}
            connected={connected}
            workingCollectionId={currentCollectionId}
            collectionIds={collectionIds}
            collectionDisplayNames={collectionMap}
            healthSignals={healthSignals}
            allTokensFlat={allTokensFlat}
            pathToCollectionId={pathToCollectionId}
            perCollectionFlat={perCollectionFlat}
            tokenUsageCounts={tokenUsageCounts}
            tokenUsageReady={hasTokenUsageScanResult}
            onNavigateToToken={(path, collectionId) => {
              openTokenInContext({
                path,
                collectionId,
                mode: "inspect",
                origin: "health",
                returnLabel: "Back to Review",
              });
            }}
            validationIssues={controller.validationIssues}
            validationLoading={controller.validationLoading}
            validationError={controller.validationError}
            validationLastRefreshed={controller.validationLastRefreshed}
            validationIsStale={controller.validationIsStale}
            deprecatedUsageEntries={deprecatedUsage.entries}
            deprecatedUsageLoading={deprecatedUsage.loading}
            deprecatedUsageError={deprecatedUsage.error}
            collectionReviewSummaries={libraryReview.byCollection}
            onRefreshReview={refreshReviewData}
            onPushUndo={controller.pushUndo}
            onError={controller.setErrorToast}
            onNavigateToGraphs={() => navigateTo("library", "graph")}
            onViewIssueInGraph={(issue) => {
              if (!issue.graphId) return;
              setPendingGraphDocumentId(issue.graphId);
              navigateTo("library", "graph");
            }}
            scope={healthScope}
            onScopeChange={setHealthScope}
            issueActions={issueActions}
            onSelectIssue={(issue) => {
              if (issue.rule === "graph-diagnostic" && issue.graphId) {
                setPendingGraphDocumentId(issue.graphId);
                navigateTo("library", "graph");
                return;
              }
              setHealthScope((currentScope) => ({
                ...currentScope,
                tokenPath: issue.path,
                issueKey: suppressKey(issue),
                nonce: Date.now(),
              }));
            }}
          />
        </ErrorBoundary>
      </div>
    );

    return renderLibraryScaffold({
      body,
      tabs: renderCollectionTabs("health"),
      contextualPanel: renderReviewContextPanel(),
    });
  }

  function renderLibraryHistory(): ReactNode {
    const body = (
      <div className="h-full min-h-0 overflow-hidden">
        <ErrorBoundary
          panelName="Changes"
          onReset={() => navigateTo("library", "tokens")}
        >
          <HistoryPanel
            serverUrl={serverUrl}
            connected={connected}
            workingCollectionId={currentCollectionId}
            scope={historyScope}
            onScopeChange={setHistoryScope}
            collectionIds={collectionIds}
            onPushUndo={controller.pushUndo}
            onRefreshTokens={controller.refreshAll}
            recentOperations={controller.recentOperations}
            totalOperations={controller.totalOperations}
            hasMoreOperations={controller.hasMoreOperations}
            onLoadMoreOperations={controller.loadMoreOperations}
            onRollback={controller.handleRollback}
            undoDescriptions={controller.undoDescriptions}
            redoableOpIds={controller.redoableOpIds}
            onServerRedo={controller.handleServerRedo}
            executeUndo={controller.executeUndo}
          />
        </ErrorBoundary>
      </div>
    );

    return renderLibraryScaffold({
      body,
      tabs: renderCollectionTabs("history"),
    });
  }
}
