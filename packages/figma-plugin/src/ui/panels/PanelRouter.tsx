/**
 * PanelRouter — routes (activeTopTab, activeSubTab, activeSecondarySurface) to the
 * correct panel component. Eliminates the O(N) condition matrix that previously
 * existed in App.tsx. Adding a new tab requires: one entry in the lookup table
 * + one render function below.
 *
 * Reads ConnectionContext, TokenDataContext, CollectionContext, and InspectContext
 * directly so callers only pass App-local state as props.
 */

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Layers, AlertCircle } from "lucide-react";
import { TokenList } from "../components/TokenList";
import { UnifiedComparePanel } from "../components/UnifiedComparePanel";
import { TokenEditor } from "../components/TokenEditor";
import { GeneratedGroupEditor } from "../components/GeneratedGroupEditor";
import { TokenCompactPreview } from "../components/TokenCompactPreview";
import { CollectionRail } from "../components/CollectionRail";
import { CollectionDetailsPanel } from "../components/CollectionDetailsPanel";
import { PublishPanel } from "../components/PublishPanel";
import type { PublishRoutingDraft } from "../hooks/usePublishRouting";
import { useResizableBoundary } from "../hooks/useResizableBoundary";
import { ResizeDivider } from "../components/ResizeDivider";
import { ImportPanel } from "../components/ImportPanel";
import type { ImportCompletionResult } from "../components/ImportPanelContext";
import { SelectionInspector } from "../components/SelectionInspector";
import { CanvasAnalysisPanel } from "../components/CanvasAnalysisPanel";
import { ExportPanel } from "../components/ExportPanel";
import { GitRepositoryPanel } from "../components/publish/GitRepositoryPanel";
import { HistoryPanel } from "../components/HistoryPanel";
import { HealthPanel } from "../components/HealthPanel";
import { ColorAnalysisPanel } from "../components/ColorAnalysisPanel";
import { PreviewPanel } from "../components/PreviewPanel";
import { FeedbackPlaceholder } from "../components/FeedbackPlaceholder";
import { SettingsPanel } from "../components/SettingsPanel";
import { NotificationsPanel } from "../components/NotificationsPanel";
import { KeyboardShortcutsPanel } from "../components/KeyboardShortcutsPanel";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { PanelContentHeader } from "../components/PanelContentHeader";
import {
  useConnectionContext,
  useSyncContext,
} from "../contexts/ConnectionContext";
import {
  useCollectionStateContext,
  useTokenFlatMapContext,
  useGeneratorContext,
} from "../contexts/TokenDataContext";
import {
  useSelectionContext,
  useHeatmapContext,
  useUsageContext,
} from "../contexts/InspectContext";
import { useNavigationContext } from "../contexts/NavigationContext";
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
import type { GeneratorSaveSuccessInfo } from "../hooks/useGeneratedGroupSave";
import type {
  ImportNextStepRecommendation,
  TopTab,
  SubTab,
  SecondarySurfaceId,
  TokensLibraryContextualSurface,
  TokensLibraryGeneratedGroupEditorTarget,
} from "../shared/navigationTypes";
import {
  getMostRelevantImportDestinationCollection,
  TOKENS_LIBRARY_SURFACE_CONTRACT,
} from "../shared/navigationTypes";
import { normalizeTokenType } from "../shared/tokenTypeCategories";
import type { ToastAction } from "../shared/toastBus";

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
  const collectionRailBoundary = useResizableBoundary({
    storageKey: STORAGE_KEYS.COLLECTION_RAIL_WIDTH,
    defaultSize: 240,
    min: 180,
    max: 360,
    axis: "x",
    mode: "px",
  });
  const sideEditorBoundary = useResizableBoundary({
    storageKey: STORAGE_KEYS.SIDE_EDITOR_WIDTH,
    defaultSize: 320,
    min: 280,
    max: 560,
    axis: "x",
    mode: "px",
    measureFrom: "end",
  });
  const healthDetailBoundary = useResizableBoundary({
    storageKey: STORAGE_KEYS.HEALTH_DETAIL_WIDTH,
    defaultSize: 320,
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
    onOpenCommandPaletteWithQuery: shell.openCommandPaletteWithQuery,
  };
  const {
    showPreviewSplit,
    setShowPreviewSplit,
    refreshAll,
    handleEditorSave,
  } = controller;
  // Navigation and editor state from contexts (previously passed as props)
  const {
    activeTopTab,
    activeSubTab,
    activeSecondarySurface,
    navigateTo,
    closeSecondarySurface,
    notificationsOpen,
    closeNotifications,
  } = useNavigationContext();
  const {
    editingToken,
    setEditingToken,
    editingGeneratedGroup,
    setEditingGeneratedGroup,
    inspectingCollection,
    highlightedToken,
    setHighlightedToken,
    createFromEmpty,
    setCreateFromEmpty,
    setPendingHighlight,
    setPendingHighlightForCollection,
    handleNavigateToAlias,
    handleNavigateBack,
    consumeNavigateBack,
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
  } = useEditorContext();
  const activeEditorSurface = tokensContextualSurfaceState.editorSurface;
  const activeMaintenanceSurface = tokensContextualSurfaceState.maintenanceSurface;

  // Read all four contexts — these cover ~40% of the data that panels need.
  const { serverUrl, connected, checking, updateServerUrlAndConnect } =
    useConnectionContext();
  const { sync, syncing, syncProgress, syncResult, syncError } =
    useSyncContext();
  const {
    collections,
    currentCollectionId,
    setCurrentCollectionId,
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
    perCollectionFlat,
    syncSnapshot,
    tokensError,
    setFilteredCollectionCount,
    modeResolvedTokensFlat,
  } = useTokenFlatMapContext();
  const {
    generators,
    generatorsByTargetGroup,
    derivedTokenPaths,
  } = useGeneratorContext();
  const { selectedNodes, selectionLoading } = useSelectionContext();
  const {
    heatmapResult,
    heatmapLoading,
    heatmapError,
    heatmapProgress,
    heatmapScope: _heatmapScope,
    setHeatmapScope: _setHeatmapScope,
    triggerHeatmapScan,
    cancelHeatmapScan: _cancelHeatmapScan,
  } = useHeatmapContext();
  const { tokenUsageCounts } = useUsageContext();
  const {
    showImport,
    historyFilterPath,
    setHistoryFilterPath,
  } = useEditorContext();
  const [healthDetailToken, setHealthDetailToken] = useState<{
    path: string;
    collectionId: string;
  } | null>(null);

  const healthSignals = useHealthSignals({
    validationIssues: controller.validationIssues,
    lintViolations: controller.lintViolations,
    generators,
    currentCollectionId,
  });
  const editingGeneratedGroupData =
    editingGeneratedGroup?.mode === "edit"
      ? (generators.find((generator) => generator.id === editingGeneratedGroup.id) ??
        null)
      : null;

  useEffect(() => {
    if (
      !editingGeneratedGroup ||
      editingGeneratedGroup.mode !== "edit" ||
      editingGeneratedGroupData
    )
      return;
    setEditingGeneratedGroup(null);
  }, [editingGeneratedGroup, editingGeneratedGroupData, setEditingGeneratedGroup]);

  const [splitPreviewToken, setSplitPreviewToken] = useState<{
    path: string;
    name?: string;
    currentCollectionId: string;
  } | null>(null);

  useEffect(() => {
    if (!showPreviewSplit) return;
    if (activeEditorSurface !== null || activeMaintenanceSurface !== null) {
      setShowPreviewSplit(false);
      setSplitPreviewToken(null);
    }
  }, [activeEditorSurface, activeMaintenanceSurface, setShowPreviewSplit, showPreviewSplit]);


  const tokenListHighlightedPath =
    editingToken?.path || splitPreviewToken?.path || highlightedToken;
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
        surface: "token-editor",
        token: {
          path: resolveCreateLauncherPath(options?.initialPath),
          currentCollectionId: targetCollectionId,
          isCreate: true,
          initialType: options?.initialType ?? readLastCreateType(),
          initialValue: options?.initialValue,
        },
      });
    },
    [currentCollectionId, switchContextualSurface],
  );

  const openTokenEditor = useCallback(
    (options: { path: string; currentCollectionId: string; name?: string }) => {
      setShowPreviewSplit(false);
      setSplitPreviewToken(null);
      setHighlightedToken(options.path);
      if (options.currentCollectionId !== currentCollectionId) {
        setCurrentCollectionId(options.currentCollectionId);
      }
      switchContextualSurface({
        surface: "token-editor",
        token: {
          path: options.path,
          name: options.name,
          currentCollectionId: options.currentCollectionId,
        },
      });
    },
    [
      currentCollectionId,
      setCurrentCollectionId,
      setHighlightedToken,
      setShowPreviewSplit,
      switchContextualSurface,
    ],
  );

  const openLinkedTokenSurface = useCallback(
    (options: {
      path: string;
      fromPath?: string;
    }) => {
      const targetCollectionId = pathToCollectionId[options.path];
      handleNavigateToAlias(options.path, options.fromPath);
      if (!targetCollectionId) return;

      switchContextualSurface({
        surface: "token-editor",
        token: {
          path: options.path,
          currentCollectionId: targetCollectionId,
        },
      });
    },
    [
      handleNavigateToAlias,
      pathToCollectionId,
      switchContextualSurface,
    ],
  );

  const openGeneratedGroupEditor = useCallback(
    (target: TokensLibraryGeneratedGroupEditorTarget) => {
      setShowPreviewSplit(false);
      switchContextualSurface({
        surface: "generated-group-editor",
        generatedGroup: target,
      });
    },
    [setShowPreviewSplit, switchContextualSurface],
  );

  const openNewGeneratedGroup = useCallback(() => {
    openGeneratedGroupEditor({
      mode: "create",
      initialDraft: {
        targetCollection: currentCollectionId,
      },
    });
  }, [currentCollectionId, openGeneratedGroupEditor]);

  const openGeneratedGroupFromGroup = useCallback(
    (groupPath: string) => {
      openGeneratedGroupEditor({
        mode: "create",
        initialDraft: {
          targetCollection: currentCollectionId,
          targetGroup: groupPath,
        },
      });
    },
    [currentCollectionId, openGeneratedGroupEditor],
  );

  const openGeneratedTokens = useCallback(
    (targetGroup: string, targetCollectionId: string) => {
      setShowPreviewSplit(false);
      switchContextualSurface({ surface: null });
      setPendingHighlightForCollection(targetGroup, targetCollectionId);
      if (targetCollectionId !== currentCollectionId) {
        setCurrentCollectionId(targetCollectionId);
      }
      navigateTo("library", "tokens");
    },
    [
      currentCollectionId,
      navigateTo,
      setCurrentCollectionId,
      setPendingHighlightForCollection,
      setShowPreviewSplit,
      switchContextualSurface,
    ],
  );

  const getViewTokensToastAction = useCallback(
    (info: GeneratorSaveSuccessInfo): ToastAction => ({
      label: "View tokens",
      onClick: () => openGeneratedTokens(info.targetGroup, info.targetCollection),
    }),
    [openGeneratedTokens],
  );

  const handleTokenEditorBack = useCallback(() => {
    if (!editingToken?.isCreate && navHistoryLength > 0) {
      const previousEntry = consumeNavigateBack();
      if (previousEntry?.path) {
        setEditingToken({
          path: previousEntry.path,
          currentCollectionId: previousEntry.collectionId,
        });
        return;
      }
    }
    if (editingToken?.isCreate) {
      setCreateFromEmpty(false);
    }
    setEditingToken(null);
    refreshAll();
  }, [
    editingToken?.isCreate,
    navHistoryLength,
    consumeNavigateBack,
    setCreateFromEmpty,
    setEditingToken,
    refreshAll,
  ]);

  const handleTokenEditorSaved = useCallback(
    (savedPath: string) => {
      if (editingToken?.isCreate) {
        persistLastCreateGroup(savedPath);
        setCreateFromEmpty(false);
      }
      handleEditorSave(savedPath);
    },
    [editingToken?.isCreate, handleEditorSave, setCreateFromEmpty],
  );

  const handleTokenEditorSaveAndCreateAnother = useCallback(
    (savedPath: string, savedType: string) => {
      persistLastCreateGroup(savedPath);
      persistLastCreateType(savedType);
      setCreateFromEmpty(false);
      setHighlightedToken(savedPath);
      refreshAll();
      const segments = savedPath.split(".");
      const parentPrefix =
        segments.length > 1 ? `${segments.slice(0, -1).join(".")}.` : "";
      setEditingToken({
        path: parentPrefix,
        currentCollectionId: editingToken?.currentCollectionId ?? currentCollectionId,
        isCreate: true,
        initialType: savedType,
      });
    },
    [
      currentCollectionId,
      editingToken?.currentCollectionId,
      setCreateFromEmpty,
      setEditingToken,
      setHighlightedToken,
      refreshAll,
    ],
  );

  useEffect(() => {
    if (
      !createFromEmpty ||
      editingToken ||
      editingGeneratedGroup ||
      showTokensCompare
    )
      return;
    setShowPreviewSplit(false);
    openCreateLauncher();
  }, [
    createFromEmpty,
    editingGeneratedGroup,
    editingToken,
    openCreateLauncher,
    setShowPreviewSplit,
    showTokensCompare,
  ]);

  // Build the common TokenList `actions` object once — it's identical across the
  // the TokenList render variants (no-split, preview-split).
  const tokenListActions = {
    onEdit: (path: string, name?: string) =>
      controller.guardEditorAction(() => {
        controller.setShowPreviewSplit(false);
        switchContextualSurface({
          surface: "token-editor",
          token: { path, name, currentCollectionId },
        });
        setHighlightedToken(path);
      }),
    onPreview: (path: string, name?: string) => {
      if (controller.showPreviewSplit) {
        const targetCollectionId =
          pathToCollectionId[path] ?? currentCollectionId;
        setSplitPreviewToken({ path, name, currentCollectionId: targetCollectionId });
        setHighlightedToken(path);
      } else {
        controller.guardEditorAction(() => {
          switchContextualSurface({
            surface: "token-editor",
            token: { path, name, currentCollectionId },
          });
          setHighlightedToken(path);
        });
      }
    },
    onCreateNew: (
      initialPath: string | undefined,
      initialType: string | undefined,
      initialValue: string | undefined,
    ) => {
      controller.setShowPreviewSplit(false);
      openCreateLauncher({ initialPath, initialType, initialValue });
    },
    onRefresh: controller.refreshAll,
    onPushUndo: controller.pushUndo,
    onTokenCreated: (path: string) => setHighlightedToken(path),
    onNavigateToAlias: handleNavigateToAlias,
    onNavigateBack: handleNavigateBack,
    navHistoryLength: navHistoryLength,
    onClearHighlight: () => setHighlightedToken(null),
    onSyncGroup: (groupPath: string, tokenCount: number) =>
      controller.setSyncGroupPending({ groupPath, tokenCount }),
    onSyncGroupStyles: (groupPath: string, tokenCount: number) =>
      controller.setSyncGroupStylesPending({ groupPath, tokenCount }),
    onSetGroupScopes: (groupPath: string) => {
      controller.setGroupScopesPath(groupPath);
      controller.setGroupScopesSelected([]);
      controller.setGroupScopesError(null);
    },
    onCreateGeneratedGroupFromGroup: (groupPath: string, _tokenType: string | null) => {
      openGeneratedGroupFromGroup(groupPath);
      navigateTo("library", "tokens");
    },
    onNavigateToNewGeneratedGroup: () => {
      openNewGeneratedGroup();
      navigateTo("library", "tokens");
    },
    onRefreshGeneratedGroups: controller.refreshAll,
    onToggleIssuesOnly: () => controller.setShowIssuesOnly((v) => !v),
    onFilteredCountChange: setFilteredCollectionCount,
    onNavigateToCollection: controller.handleNavigateToCollection,
    onViewTokenHistory: (path: string) => {
      setHistoryFilterPath(path);
      navigateTo("library", "history");
    },
    onEditGeneratedGroup: (generatorId: string) =>
      controller.guardEditorAction(() => {
        openGeneratedGroupEditor({
          mode: "edit",
          id: generatorId,
        });
      }),
    onOpenGeneratedGroupEditor: (target: TokensLibraryGeneratedGroupEditorTarget) =>
      controller.guardEditorAction(() => {
        openGeneratedGroupEditor(target);
      }),
    onNavigateToGeneratedGroup: controller.handleNavigateToGeneratedGroup,
    onDisplayedLeafNodesChange: (nodes: TokenNode[]) => {
      controller.displayedLeafNodesRef.current = nodes;
    },
    onTokenTouched: (path: string) => {
      controller.recentlyTouched.recordTouch(
        path,
        pathToCollectionId[path] ?? currentCollectionId,
      );
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
      controller.setShowPreviewSplit(false);
      switchContextualSurface({
        surface: "compare",
        mode: "tokens",
        paths,
      });
    },
    onOpenCrossCollectionCompare: (path: string) => {
      controller.setShowPreviewSplit(false);
      switchContextualSurface({
        surface: "compare",
        mode: "cross-collection",
        path,
      });
    },
    onOpenCommandPaletteWithQuery: controller.openCommandPaletteWithQuery,
    onShowPasteModal: controller.onShowPasteModal,
    onOpenImportPanel: controller.onShowImportPanel,
    onOpenCreateCollection: controller.onOpenCollectionCreateDialog,
    onOpenStartHere: controller.onOpenStartHere,
    onTogglePreviewSplit: () => controller.setShowPreviewSplit((v) => !v),
  };

  // Common TokenEditor props
  const tokenEditorProps = editingToken
    ? {
        tokenPath: editingToken.path,
        tokenName: editingToken.name,
        currentCollectionId: editingToken.currentCollectionId,
        collectionId:
          pathToCollectionId[editingToken.path] ??
          editingToken.currentCollectionId,
        serverUrl,
        onBack: handleTokenEditorBack,
        allTokensFlat,
        pathToCollectionId,
        generators,
        isCreateMode: editingToken.isCreate,
        initialType: editingToken.initialType,
        initialValue: editingToken.initialValue,
        editorSessionHost: {
          registerSession: controller.registerEditorSession,
          requestClose: controller.requestEditorClose,
        },
        onSaved: handleTokenEditorSaved,
        onSaveAndCreateAnother: handleTokenEditorSaveAndCreateAnother,
        collections,
        onRefresh: controller.refreshAll,
        availableFonts: controller.availableFonts,
        fontWeightsByFamily: controller.fontWeightsByFamily,
        derivedTokenPaths,
        onNavigateToToken: (path: string) =>
          openLinkedTokenSurface({
            path,
            fromPath: editingToken.path,
          }),
        onNavigateToGeneratedGroup: controller.handleNavigateToGeneratedGroup,
        onOpenGeneratedGroupEditor: openGeneratedGroupEditor,
        lintViolations: healthSignals.lintViolationsForCurrent,
        syncSnapshot:
          Object.keys(syncSnapshot).length > 0 ? syncSnapshot : undefined,
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
      pathToStorageCollectionId={pathToCollectionId}
      collections={collections}
      collectionIds={collectionIds}
      modeOptionsKey={tokensCompareModeKey}
      modeOptionsDefaultA={tokensCompareDefaultA}
      modeOptionsDefaultB={tokensCompareDefaultB}
      onEditToken={(collectionId, path) => {
        controller.guardEditorAction(() => {
          openTokenEditor({ path, currentCollectionId: collectionId });
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

  const generatedGroupEditorProps =
    editingGeneratedGroup &&
    (editingGeneratedGroup.mode !== "edit" || editingGeneratedGroupData)
      ? {
          serverUrl,
          currentCollectionId:
            editingGeneratedGroup.mode === "edit"
              ? (editingGeneratedGroupData?.targetCollection ?? currentCollectionId)
              : editingGeneratedGroup.initialDraft?.targetCollection ??
                (editingGeneratedGroup.sourceTokenPath
                  ? (pathToCollectionId?.[editingGeneratedGroup.sourceTokenPath] ??
                    currentCollectionId)
                  : currentCollectionId),
          allTokensFlat,
          sourceValuesFlat: modeResolvedTokensFlat,
          perCollectionFlat,
          collections,
          sourceTokenPath:
            editingGeneratedGroup.mode === "create"
              ? editingGeneratedGroup.sourceTokenPath
              : undefined,
          sourceTokenName:
            editingGeneratedGroup.mode === "create"
              ? editingGeneratedGroup.sourceTokenName
              : undefined,
          sourceTokenType:
            editingGeneratedGroup.mode === "create"
              ? editingGeneratedGroup.sourceTokenType
              : undefined,
          sourceTokenValue:
            editingGeneratedGroup.mode === "create"
              ? editingGeneratedGroup.sourceTokenValue
              : undefined,
          intentPreset:
            editingGeneratedGroup.mode === "create"
              ? editingGeneratedGroup.intentPreset
              : undefined,
          existingGenerator:
            editingGeneratedGroup.mode === "edit"
              ? (editingGeneratedGroupData ?? undefined)
              : undefined,
          initialDraft:
            editingGeneratedGroup.mode === "create"
              ? editingGeneratedGroup.initialDraft
              : undefined,
          template:
            editingGeneratedGroup.mode === "create"
              ? editingGeneratedGroup.template
              : undefined,
          pathToCollectionId,
          onClose: () => {
            setEditingGeneratedGroup(null);
            controller.refreshAll();
          },
          onSaved: (info?: GeneratorSaveSuccessInfo) => {
            setEditingGeneratedGroup(null);
            controller.refreshAll();
            if (info) {
              openGeneratedTokens(info.targetGroup, info.targetCollection);
            }
          },
          getSuccessToastAction: getViewTokensToastAction,
          onPushUndo: controller.pushUndo,
          presentation: "panel" as const,
          editorSessionHost: {
            registerSession: controller.registerEditorSession,
            requestClose: controller.requestEditorClose,
          },
        }
      : null;
  const generatedGroupEditorKey =
    editingGeneratedGroup?.mode === "edit"
      ? `edit:${editingGeneratedGroup.id}`
      : editingGeneratedGroup
        ? `create:${JSON.stringify({
            sourceTokenPath: editingGeneratedGroup.sourceTokenPath ?? null,
            sourceTokenType: editingGeneratedGroup.sourceTokenType ?? null,
            sourceTokenValue: editingGeneratedGroup.sourceTokenValue ?? null,
            intentPreset: editingGeneratedGroup.intentPreset ?? null,
            initialDraft: editingGeneratedGroup.initialDraft ?? null,
            templateId: editingGeneratedGroup.template?.id ?? null,
          })}`
        : null;

  type TokensContextualSurfaceRenderState = {
    surface: TokensLibraryContextualSurface;
    content: ReactNode;
    onDismiss: () => void;
  };

  const getEditorSurfaceRenderState =
    (): TokensContextualSurfaceRenderState | null => {
      if (
        activeEditorSurface === "collection-details" &&
        inspectingCollection
      ) {
        return {
          surface: "collection-details",
          content: (
            <CollectionDetailsPanel
              collection={
                collections.find(
                  (collection) => collection.id === inspectingCollection.collectionId,
                ) ?? null
              }
              collectionIds={collectionIds}
              collectionTokenCounts={collectionTokenCounts}
              collectionDescriptions={collectionDescriptions}
              serverUrl={serverUrl}
              connected={connected}
              onModeMutated={refreshTokens}
              onClose={() => switchContextualSurface({ surface: null })}
              onRename={collectionStructureController.onRename}
              onDuplicate={collectionStructureController.onDuplicate}
              onDelete={collectionStructureController.onDelete}
              onEditInfo={collectionStructureController.onEditInfo}
              onMerge={collectionStructureController.onMerge}
              onSplit={collectionStructureController.onSplit}
              renamingCollectionId={collectionStructureController.renamingCollectionId}
              renameValue={collectionStructureController.renameValue}
              setRenameValue={collectionStructureController.setRenameValue}
              renameError={collectionStructureController.renameError}
              renameInputRef={collectionStructureController.renameInputRef}
              onRenameConfirm={collectionStructureController.onRenameConfirm}
              onRenameCancel={collectionStructureController.onRenameCancel}
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
          ),
          onDismiss: () => switchContextualSurface({ surface: null }),
        };
      }

      if (
        activeEditorSurface === "token-editor" &&
        editingToken &&
        tokenEditorProps
      ) {
        return {
          surface: "token-editor",
          content: <TokenEditor {...tokenEditorProps} />,
          onDismiss: controller.requestEditorClose,
        };
      }

      if (
        activeEditorSurface === "generated-group-editor" &&
        editingGeneratedGroup &&
        generatedGroupEditorProps
      ) {
        return {
          surface: "generated-group-editor",
          content: (
            <GeneratedGroupEditor
              key={generatedGroupEditorKey ?? "generated-group-editor"}
              {...generatedGroupEditorProps}
            />
          ),
          onDismiss: controller.requestEditorClose,
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
              pathToCollectionId={pathToCollectionId}
              collections={collections}
              currentCollectionId={currentCollectionId}
              onNavigateToToken={(path, collectionId) => {
                setCurrentCollectionId(collectionId);
                setPendingHighlight(path);
                closeMaintenanceSurface();
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
    <div
      className="flex-1 min-w-0 overflow-hidden"
      data-tokens-library-surface-slot={TOKENS_LIBRARY_SURFACE_CONTRACT.body.id}
    >
      <TokenList
        ctx={{ collectionId: currentCollectionId, collectionIds, serverUrl, connected, selectedNodes }}
        data={{
          tokens,
          allTokensFlat: modeResolvedTokensFlat,
          lintViolations: healthSignals.lintViolationsForCurrent,
          syncSnapshot:
            Object.keys(syncSnapshot).length > 0 ? syncSnapshot : undefined,
          generators,
          generatorsByTargetGroup,
          derivedTokenPaths,
          tokenUsageCounts,
          perCollectionFlat,
          collectionMap,
          modeMap,
          collections,
          unresolvedAllTokensFlat: allTokensFlat,
          pathToCollectionId,
        }}
        actions={tokenListActions}
        recentlyTouched={controller.recentlyTouched}
        defaultCreateOpen={createFromEmpty}
        highlightedToken={tokenListHighlightedPath}
        showIssuesOnly={controller.showIssuesOnly}
        showPreviewSplit={controller.showPreviewSplit}
        editingTokenPath={editingToken?.path}
        compareHandle={controller.tokenListCompareRef}
        collectionHealthSummary={healthSignals.currentCollection}
        onOpenHealth={() => navigateTo("library", "health")}
      />
    </div>
  );

  const renderFullContextualSurface = (
    surfaceState: TokensContextualSurfaceRenderState,
  ) => (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden panel-slide-in"
      data-surface-kind={controller.contextualEditorTransition.kind}
      data-surface-presentation={
        controller.contextualEditorTransition.presentation
      }
      data-tokens-library-surface-slot={
        TOKENS_LIBRARY_SURFACE_CONTRACT.contextualPanel.id
      }
      data-tokens-library-contextual-surface={surfaceState.surface}
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

  function renderCanvasInspect(): ReactNode {
    return (
      <div className="h-full min-h-0 overflow-hidden">
        <ErrorBoundary
          panelName="Canvas selection"
          onReset={() => navigateTo("library", "tokens")}
        >
          <SelectionInspector
            selectedNodes={selectedNodes}
            selectionLoading={selectionLoading}
            tokenMap={allTokensFlat}
            onSync={sync}
            syncing={syncing}
            syncProgress={syncProgress}
            syncResult={syncResult}
            syncError={syncError}
            connected={connected}
            currentCollectionId={currentCollectionId}
            serverUrl={serverUrl}
            onTokenCreated={refreshTokens}
            onNavigateToToken={(path) => {
              setHighlightedToken(path);
              navigateTo("library", "tokens");
            }}
            onPushUndo={controller.pushUndo}
            onToast={controller.setSuccessToast}
            onGoToTokens={() => navigateTo("library", "tokens")}
            triggerCreateToken={controller.triggerCreateToken}
            usageContent={renderCanvasAnalysisContent()}
            triggerHeatmapScan={triggerHeatmapScan}
            heatmapLoading={heatmapLoading}
            heatmapResult={heatmapResult}
            heatmapError={heatmapError}
          />
        </ErrorBoundary>
      </div>
    );
  }

  function renderCanvasAnalysisContent(): ReactNode {
    return (
      <CanvasAnalysisPanel
        availableTokens={allTokensFlat}
        heatmapResult={heatmapResult}
        heatmapLoading={heatmapLoading}
        heatmapProgress={heatmapProgress}
        heatmapError={heatmapError}
        onSelectNodes={(ids) =>
          parent.postMessage(
            {
              pluginMessage: { type: "select-heatmap-nodes", nodeIds: ids },
            },
            "*",
          )
        }
        onBatchBind={(nodeIds, tokenPath, property) => {
          const entry = allTokensFlat[tokenPath];
          if (!entry) return;
          parent.postMessage(
            {
              pluginMessage: {
                type: "batch-bind-heatmap-nodes",
                nodeIds,
                tokenPath,
                tokenType: entry.$type,
                targetProperty: property,
                resolvedValue: entry.$value,
              },
            },
            "*",
          );
        }}
        onSelectNode={(nodeId) =>
          parent.postMessage(
            { pluginMessage: { type: "select-node", nodeId } },
            "*",
          )
        }
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Sub-tab panel routing — O(1) lookup, no repeated condition guards
  // ---------------------------------------------------------------------------

  type PanelRenderer = () => ReactNode;

  const PANEL_MAP: Record<TopTab, Partial<Record<SubTab, PanelRenderer>>> = {
    library: {
      tokens: renderLibraryTokens,
      health: renderLibraryHealth,
      history: renderLibraryHistory,
    },
    canvas: {
      inspect: renderCanvasInspect,
    },
    sync: {
      "figma-sync": renderSyncFigmaSync,
      "export": renderSyncExport,
      "versions": renderSyncVersions,
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
            className="absolute inset-0 z-10 bg-[#1a1a1a]/10"
            onClick={closeNotifications}
          />
          <div className="absolute right-0 top-0 bottom-0 z-20 w-[320px] border-l border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-lg panel-slide-in">
            <NotificationsPanel
              history={controller.notificationHistory}
              onClear={controller.clearNotificationHistory}
            />
          </div>
        </>
      )}
    </div>
  );

  // ---------------------------------------------------------------------------
  // Panel render functions — each closes over context + props
  // ---------------------------------------------------------------------------

  function renderCollectionRail(): ReactNode {
    return (
      <>
        <CollectionRail
          collections={collections}
          currentCollectionId={currentCollectionId}
          collectionTokenCounts={collectionTokenCounts}
          collectionHealth={healthSignals.byCollection}
          focusRequestKey={shell.collectionRailFocusRequestKey}
          widthPx={collectionRailBoundary.size}
          onSelectCollection={(collectionId) => {
            if (collectionId !== currentCollectionId) {
              setCurrentCollectionId(collectionId);
            }
            navigateTo("library", "tokens");
          }}
          onCreateCollection={async (name) => {
            const createdCollectionId =
              await collectionStructureController.onCreateCollectionByName(name);
            setCurrentCollectionId(createdCollectionId);
            return createdCollectionId;
          }}
          onOpenCollectionDetails={(collectionId) =>
            switchContextualSurface({
              surface: "collection-details",
              collection: { collectionId },
            })
          }
          onRenameCollection={collectionStructureController.onRename}
          onDuplicateCollection={collectionStructureController.onDuplicate}
          onMergeCollection={collectionStructureController.onMerge}
          onSplitCollection={collectionStructureController.onSplit}
          onDeleteCollection={collectionStructureController.onDelete}
        />
        <ResizeDivider
          axis="x"
          ariaLabel="Resize collection rail"
          ariaValueNow={collectionRailBoundary.ariaValueNow}
          onMouseDown={collectionRailBoundary.onMouseDown}
          onKeyDown={collectionRailBoundary.onKeyDown}
        />
      </>
    );
  }

  /**
   * Shared scaffold for every Library section (Tokens, Health, History).
   * Renders CollectionRail + main body and pins the side editor whenever a
   * token is open so authoring context survives section switches. The Tokens
   * section additionally opts into the preview-split layout.
   */
  function renderLibraryScaffold({
    body,
    allowPreviewSplit,
  }: {
    body: ReactNode;
    allowPreviewSplit: boolean;
  }): ReactNode {
    const showPreviewSplitLayout = allowPreviewSplit && controller.showPreviewSplit;
    const editorSurfaceState = !showPreviewSplitLayout
      ? getEditorSurfaceRenderState()
      : null;
    const maintenanceSurfaceState = !showPreviewSplitLayout
      ? getMaintenanceSurfaceRenderState()
      : null;

    const sideEditorState =
      editorSurfaceState &&
      (editorSurfaceState.surface === "token-editor" ||
        editorSurfaceState.surface === "collection-details")
        ? editorSurfaceState
        : null;
    const fullEditorState =
      editorSurfaceState && editorSurfaceState.surface === "generated-group-editor"
        ? editorSurfaceState
        : null;

    // Left-pane precedence: maintenance surface > full-takeover editor > section body.
    const leftPaneTakeoverState = maintenanceSurfaceState ?? fullEditorState;

    const renderLeftPane = () =>
      leftPaneTakeoverState
        ? renderFullContextualSurface(leftPaneTakeoverState)
        : body;

    return (
      <div className="flex h-full min-h-0 overflow-hidden">
        {renderCollectionRail()}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {(fetchError || tokensError) && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--color-figma-error)]/10 border-b border-[var(--color-figma-error)]/20 shrink-0">
              <AlertCircle size={10} strokeWidth={2} className="text-[var(--color-figma-error)] shrink-0" aria-hidden />
              <span className="text-secondary text-[var(--color-figma-text-secondary)] flex-1 truncate">
                Failed to load tokens: {fetchError || tokensError}
              </span>
              <button
                onClick={refreshTokens}
                className="text-secondary px-2 py-0.5 rounded border border-[var(--color-figma-error)]/40 text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10 transition-colors shrink-0"
              >
                Retry
              </button>
            </div>
          )}

          {!showPreviewSplitLayout && sideEditorState && (
            <div className="flex min-h-0 flex-1 overflow-hidden">
              <div className="min-w-0 flex-1 overflow-hidden">
                {renderLeftPane()}
              </div>
              <ResizeDivider
                axis="x"
                ariaLabel="Resize side editor"
                ariaValueNow={sideEditorBoundary.ariaValueNow}
                onMouseDown={sideEditorBoundary.onMouseDown}
                onKeyDown={sideEditorBoundary.onKeyDown}
              />
              <div
                className="shrink-0 overflow-hidden panel-slide-in"
                style={{ width: sideEditorBoundary.size }}
                data-tokens-library-surface-slot={TOKENS_LIBRARY_SURFACE_CONTRACT.contextualPanel.id}
                data-tokens-library-contextual-surface={sideEditorState.surface}
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
                {sideEditorState.content}
              </div>
            </div>
          )}

          {!showPreviewSplitLayout && !sideEditorState && renderLeftPane()}

          {showPreviewSplitLayout && (
            <div
              ref={controller.splitContainerRef}
              className="flex flex-col h-full overflow-hidden"
              data-surface-kind={controller.splitPreviewTransition.kind}
              data-surface-presentation={
                controller.splitPreviewTransition.presentation
              }
              data-tokens-library-surface-slot={
                TOKENS_LIBRARY_SURFACE_CONTRACT.splitPreview.id
              }
            >
              <div
                style={{
                  height: `${controller.splitRatio * 100}%`,
                  flexShrink: 0,
                  overflow: "hidden",
                }}
              >
                {body}
              </div>
              <div
                role="separator"
                aria-orientation="horizontal"
                aria-valuenow={controller.splitValueNow}
                aria-valuemin={20}
                aria-valuemax={80}
                aria-label="Resize token list and preview"
                tabIndex={0}
                className="h-1 flex-shrink-0 cursor-row-resize bg-[var(--color-figma-border)] hover:bg-[var(--color-figma-accent)] focus-visible:bg-[var(--color-figma-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-figma-accent)] transition-colors"
                onMouseDown={controller.handleSplitDragStart}
                onKeyDown={controller.handleSplitKeyDown}
              />
              <div className="flex-1 min-h-0 overflow-hidden">
                <ErrorBoundary
                  panelName="Preview"
                  onReset={() => navigateTo("library", "tokens")}
                >
                  <PreviewPanel
                    allTokensFlat={modeResolvedTokensFlat}
                    onGoToTokens={() => navigateTo("library", "tokens")}
                    onNavigateToToken={(path) => {
                      const name = path.split(".").pop();
                      const targetCollectionId =
                        pathToCollectionId[path] ?? currentCollectionId;
                      setSplitPreviewToken({
                        path,
                        name,
                        currentCollectionId: targetCollectionId,
                      });
                      setHighlightedToken(path);
                    }}
                    focusedToken={splitPreviewToken}
                    pathToCollectionId={pathToCollectionId}
                    onClearFocus={() => setSplitPreviewToken(null)}
                    lintViolations={healthSignals.lintViolationsForCurrent}
                    syncSnapshot={
                      Object.keys(syncSnapshot).length > 0
                        ? syncSnapshot
                        : undefined
                    }
                    onEditToken={(path, name, collectionId) => {
                      controller.guardEditorAction(() => {
                        openTokenEditor({
                          path,
                          name,
                          currentCollectionId:
                            collectionId ?? currentCollectionId,
                        });
                      });
                    }}
                  />
                </ErrorBoundary>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderLibraryTokens(): ReactNode {
    const tokensEmpty =
      collections.length === 0 &&
      !createFromEmpty &&
      !editingToken;

    const body = tokensEmpty ? (
      <FeedbackPlaceholder
        variant="empty"
        size="full"
        icon={<Layers size={20} strokeWidth={1.5} aria-hidden />}
        title="No collections yet"
        description="Create your first collection or import an existing token system to start authoring."
        primaryAction={{
          label: "Create collection",
          onClick: () => controller.onOpenCollectionCreateDialog(),
        }}
        secondaryAction={{
          label: "Import tokens",
          onClick: () => controller.onShowImportPanel(),
        }}
      />
    ) : hasTokensLibrarySurface ? (
      renderTokensLibraryBody()
    ) : null;

    return renderLibraryScaffold({ body, allowPreviewSplit: true });
  }

  function renderLibraryHealth(): ReactNode {
    const body = (
      <div className="flex h-full min-h-0 overflow-hidden">
        <div className="min-w-0 flex-1 overflow-hidden">
          <ErrorBoundary
            panelName="Health"
            onReset={() => navigateTo("library", "tokens")}
          >
            <HealthPanel
              serverUrl={serverUrl}
              connected={connected}
              currentCollectionId={currentCollectionId}
              healthSignals={healthSignals}
              allTokensFlat={allTokensFlat}
              pathToCollectionId={pathToCollectionId}
              tokenUsageCounts={tokenUsageCounts}
              heatmapResult={heatmapResult}
              onNavigateToToken={(path, collectionId) => {
                setHealthDetailToken({ path, collectionId });
              }}
              validationIssues={controller.validationIssues}
              validationLoading={controller.validationLoading}
              validationError={controller.validationError}
              validationLastRefreshed={controller.validationLastRefreshed}
              validationIsStale={controller.validationIsStale}
              onRefreshValidation={controller.refreshValidation}
              onPushUndo={controller.pushUndo}
              onError={controller.setErrorToast}
              onNavigateToGenerators={() => navigateTo("library", "tokens")}
            />
          </ErrorBoundary>
        </div>
        {healthDetailToken && (
          <>
            <ResizeDivider
              axis="x"
              ariaLabel="Resize token detail panel"
              ariaValueNow={healthDetailBoundary.ariaValueNow}
              onMouseDown={healthDetailBoundary.onMouseDown}
              onKeyDown={healthDetailBoundary.onKeyDown}
            />
            <div
              className="shrink-0 overflow-hidden panel-slide-in"
              style={{ width: healthDetailBoundary.size }}
            >
              <TokenCompactPreview
                tokenPath={healthDetailToken.path}
                storageCollectionId={healthDetailToken.collectionId}
                allTokensFlat={allTokensFlat}
                pathToCollectionId={pathToCollectionId}
                lintViolations={healthSignals.lintViolationsForCurrent.filter(
                  (v) => v.path === healthDetailToken.path,
                )}
                onEdit={() => {
                  setCurrentCollectionId(healthDetailToken.collectionId);
                  setPendingHighlight(healthDetailToken.path);
                  switchContextualSurface({
                    surface: "token-editor",
                    token: {
                      path: healthDetailToken.path,
                      currentCollectionId: healthDetailToken.collectionId,
                    },
                  });
                }}
                onClose={() => setHealthDetailToken(null)}
                onNavigateToAlias={(path) => {
                  const cid = pathToCollectionId[path];
                  if (cid) setHealthDetailToken({ path, collectionId: cid });
                }}
              />
            </div>
          </>
        )}
      </div>
    );

    return renderLibraryScaffold({ body, allowPreviewSplit: false });
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
            onPushUndo={controller.pushUndo}
            onRefreshTokens={controller.refreshAll}
            filterTokenPath={historyFilterPath}
            onClearFilter={() => setHistoryFilterPath(null)}
            recentOperations={controller.recentOperations}
            totalOperations={controller.totalOperations}
            hasMoreOperations={controller.hasMoreOperations}
            onLoadMoreOperations={controller.loadMoreOperations}
            onRollback={controller.handleRollback}
            undoDescriptions={controller.undoDescriptions}
            redoableOpIds={controller.redoableOpIds}
            onServerRedo={controller.handleServerRedo}
            executeUndo={controller.executeUndo}
            canUndo={controller.canUndo}
          />
        </ErrorBoundary>
      </div>
    );

    return renderLibraryScaffold({ body, allowPreviewSplit: false });
  }
  function renderSyncFigmaSync(): ReactNode {
    const { publishPreflightState, pendingPublishCount, publishPanelHandleRef } = controller;
    let publishAction: { label: string; onClick: () => void; disabled?: boolean } | null = null;
    if (publishPreflightState.stage === "running") {
      publishAction = { label: "Checking\u2026", onClick: () => {}, disabled: true };
    } else if (publishPreflightState.stage === "blocked") {
      publishAction = { label: "Resolve issues", onClick: () => publishPanelHandleRef.current?.focusStage("preflight") };
    } else if (pendingPublishCount > 0) {
      publishAction = { label: "Apply changes", onClick: () => publishPanelHandleRef.current?.focusStage("compare") };
    } else {
      publishAction = { label: "Check for changes", onClick: () => publishPanelHandleRef.current?.runReadinessChecks() };
    }

    return (
      <div className="flex h-full flex-col overflow-hidden">
        <PanelContentHeader primaryAction={publishAction} />
        <div className="min-h-0 flex-1 overflow-hidden">
          <ErrorBoundary
            panelName="Figma Sync"
            onReset={() => navigateTo("sync", "figma-sync")}
          >
            <PublishPanel
              serverUrl={serverUrl}
              connected={connected}
              currentCollectionId={currentCollectionId}
              collectionMap={collectionMap}
              modeMap={modeMap}
              savePublishRouting={savePublishRouting}
              refreshValidation={controller.refreshValidation}
              tokenChangeKey={controller.tokenChangeKey}
              publishPanelHandle={controller.publishPanelHandleRef}
            />
          </ErrorBoundary>
        </div>
      </div>
    );
  }

  function renderSyncExport(): ReactNode {
    return (
      <ErrorBoundary
        panelName="Export"
        onReset={() => navigateTo("sync", "export")}
      >
        <ExportPanel serverUrl={serverUrl} connected={connected} />
      </ErrorBoundary>
    );
  }

  function renderSyncVersions(): ReactNode {
    return (
      <ErrorBoundary
        panelName="Versions"
        onReset={() => navigateTo("sync", "versions")}
      >
        <GitRepositoryPanel
          serverUrl={serverUrl}
          connected={connected}
          onPushUndo={controller.pushUndo}
          onRefreshTokens={controller.refreshAll}
        />
      </ErrorBoundary>
    );
  }

}
