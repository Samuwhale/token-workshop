/**
 * PanelRouter — routes (activeTopTab, activeSubTab, activeSecondarySurface) to the
 * correct panel component. Eliminates the O(N) condition matrix that previously
 * existed in App.tsx. Adding a new tab requires: one entry in the lookup table
 * + one render function below.
 *
 * Reads ConnectionContext, TokenDataContext, ThemeContext, and InspectContext
 * directly so callers only pass App-local state as props.
 */

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { GraphPanel } from "../components/GraphPanel";
import { TokenList } from "../components/TokenList";
import { UnifiedComparePanel } from "../components/UnifiedComparePanel";
import { TokenEditor } from "../components/TokenEditor";
import { TokenRecipeDialog } from "../components/TokenRecipeDialog";
import { TokenDetailPreview } from "../components/TokenDetailPreview";
import { ThemeManager } from "../components/ThemeManager";
import { SetManager } from "../components/SetSwitcher";
import { PublishPanel } from "../components/PublishPanel";
import { ImportPanel } from "../components/ImportPanel";
import type { ImportCompletionResult } from "../components/ImportPanelContext";
import { SelectionInspector } from "../components/SelectionInspector";
import { CanvasAnalysisPanel } from "../components/CanvasAnalysisPanel";
import { ExportPanel } from "../components/ExportPanel";
import { HistoryPanel } from "../components/HistoryPanel";
import { HealthPanel } from "../components/HealthPanel";
import { PreviewPanel } from "../components/PreviewPanel";
import { FeedbackPlaceholder } from "../components/FeedbackPlaceholder";
import { SettingsPanel } from "../components/SettingsPanel";
import { NotificationsPanel } from "../components/NotificationsPanel";
import { KeyboardShortcutsPanel } from "../components/KeyboardShortcutsPanel";
import { ErrorBoundary } from "../components/ErrorBoundary";
import type { RecipeDialogInitialDraft } from "../hooks/useRecipeDialog";
import {
  useConnectionContext,
  useSyncContext,
} from "../contexts/ConnectionContext";
import {
  useTokenSetsContext,
  useTokenFlatMapContext,
  useRecipeContext,
} from "../contexts/TokenDataContext";
import {
  useThemeSwitcherContext,
  useResolverContext,
} from "../contexts/ThemeContext";
import {
  useSelectionContext,
  useHeatmapContext,
  useUsageContext,
} from "../contexts/InspectContext";
import { useNavigationContext } from "../contexts/NavigationContext";
import { useEditorContext } from "../contexts/EditorContext";
import { lsGet, lsSet } from "../shared/storage";
import {
  useApplyWorkspaceController,
  useEditorShellController,
  useSetManagerWorkspaceController,
  useShellWorkspaceController,
  useSyncWorkspaceController,
  useThemeWorkspaceController,
  useTokensWorkspaceController,
} from "../contexts/WorkspaceControllerContext";
import type { TokenNode } from "../hooks/useTokens";
import type { RecipeSaveSuccessInfo } from "../hooks/useRecipeSave";
import type {
  ImportNextStepRecommendation,
  TopTab,
  SubTab,
  SecondarySurfaceId,
  TokensLibraryContextualSurface,
  TokensLibraryRecipeEditorTarget,
} from "../shared/navigationTypes";
import {
  getImportResultNextStepRecommendations,
  getMostRelevantImportDestinationSet,
  TOKENS_LIBRARY_SURFACE_CONTRACT,
} from "../shared/navigationTypes";
import type { ToastAction } from "../shared/toastBus";
import { useEditorWidth } from "../hooks/useEditorWidth";

const LAST_CREATE_GROUP_STORAGE_KEY = "tm_last_create_group";
const LAST_CREATE_TYPE_STORAGE_KEY = "tm_last_token_type";

function readLastCreateGroup(): string {
  return lsGet(LAST_CREATE_GROUP_STORAGE_KEY, "");
}

function readLastCreateType(): string {
  return lsGet(LAST_CREATE_TYPE_STORAGE_KEY, "color");
}

function persistLastCreateGroup(tokenPath: string): void {
  const groupPath = tokenPath.includes(".")
    ? tokenPath.split(".").slice(0, -1).join(".")
    : "";
  lsSet(LAST_CREATE_GROUP_STORAGE_KEY, groupPath);
}

function persistLastCreateType(tokenType: string): void {
  lsSet(LAST_CREATE_TYPE_STORAGE_KEY, tokenType);
}

function resolveCreateLauncherPath(initialPath?: string): string {
  if (initialPath !== undefined) return initialPath;
  const lastGroup = readLastCreateGroup();
  return lastGroup ? `${lastGroup}.` : "";
}

// ---------------------------------------------------------------------------
// Props interface
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PanelRouter(): ReactNode {
  const shell = useShellWorkspaceController();
  const editorShell = useEditorShellController();
  const tokensController = useTokensWorkspaceController();
  const themeController = useThemeWorkspaceController();
  const applyController = useApplyWorkspaceController();
  const syncController = useSyncWorkspaceController();
  const setManagerController = useSetManagerWorkspaceController();
  const controller = {
    ...shell,
    ...editorShell,
    ...tokensController,
    ...themeController,
    ...applyController,
    ...syncController,
    onShowPasteModal: shell.openPasteModal,
    onShowImportPanel: shell.openImportPanel,
    onOpenSetCreateDialog: shell.openSetCreateDialog,
    onShowColorScaleGen: shell.openColorScaleRecipe,
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
    setSubTab,
    beginHandoff,
    closeSecondarySurface,
  } = useNavigationContext();
  const {
    editingToken,
    setEditingToken,
    editingRecipe,
    setEditingRecipe,
    previewingToken,
    setPreviewingToken,
    highlightedToken,
    setHighlightedToken,
    createFromEmpty,
    setCreateFromEmpty,
    setPendingHighlight,
    setPendingHighlightForSet,
    handleNavigateToAlias,
    handleNavigateToAliasWithoutHistory,
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
    tokensCompareThemeKey,
    setTokensCompareThemeKey: _setTokensCompareThemeKey,
    tokensCompareDefaultA,
    tokensCompareDefaultB,
    tokensContextualSurfaceState,
    switchContextualSurface,
  } = useEditorContext();
  const activeTokensContextualSurface =
    tokensContextualSurfaceState.activeSurface;

  // Read all four contexts — these cover ~40% of the data that panels need.
  const { serverUrl, connected, checking, updateServerUrlAndConnect } =
    useConnectionContext();
  const { sync, syncing, syncProgress, syncResult, syncError } =
    useSyncContext();
  const {
    sets,
    activeSet,
    setActiveSet,
    tokens,
    setTokenCounts,
    setDescriptions,
    setCollectionNames,
    setModeNames,
    fetchError,
    refreshTokens,
  } = useTokenSetsContext();
  const {
    allTokensFlat,
    pathToSet,
    perSetFlat,
    syncSnapshot,
    tokensError,
    setFilteredSetCount,
  } = useTokenFlatMapContext();
  const {
    recipes,
    recipesByTargetGroup,
    derivedTokenPaths,
  } = useRecipeContext();
  const {
    dimensions,
    setDimensions,
    activeThemes,
    setActiveThemes,
    themedAllTokensFlat,
  } = useThemeSwitcherContext();
  const resolverState = useResolverContext();
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

  const [historyFilterPath, setHistoryFilterPath] = useState<string | null>(
    null,
  );
  const editingRecipeData =
    editingRecipe?.mode === "edit"
      ? (recipes.find((recipe) => recipe.id === editingRecipe.id) ??
        null)
      : null;

  useEffect(() => {
    if (
      !editingRecipe ||
      editingRecipe.mode !== "edit" ||
      editingRecipeData
    )
      return;
    setEditingRecipe(null);
  }, [editingRecipe, editingRecipeData, setEditingRecipe]);

  useEffect(() => {
    if (!showPreviewSplit) return;
    if (
      activeTokensContextualSurface === "compare" ||
      activeTokensContextualSurface === "token-editor" ||
      activeTokensContextualSurface === "recipe-editor"
    ) {
      setShowPreviewSplit(false);
    }
  }, [activeTokensContextualSurface, setShowPreviewSplit, showPreviewSplit]);

  const editingTokenType = editingToken
    ? (allTokensFlat[editingToken.path]?.$type ?? editingToken.initialType)
    : undefined;
  const { editorWidth, handleEditorWidthDragStart } =
    useEditorWidth(editingTokenType);
  const tokenListHighlightedPath =
    editingToken?.path || previewingToken?.path || highlightedToken;
  const hasTokensLibrarySurface =
    tokens.length > 0 ||
    createFromEmpty ||
    activeTokensContextualSurface !== null;

  const openCreateLauncher = useCallback(
    (options?: {
      initialPath?: string;
      initialType?: string;
      initialValue?: string;
      set?: string;
    }) => {
      const targetSet = options?.set ?? activeSet;
      switchContextualSurface({
        surface: "token-editor",
        token: {
          path: resolveCreateLauncherPath(options?.initialPath),
          set: targetSet,
          isCreate: true,
          initialType: options?.initialType ?? readLastCreateType(),
          initialValue: options?.initialValue,
        },
      });
    },
    [activeSet, switchContextualSurface],
  );

  const openTokenEditor = useCallback(
    (options: { path: string; set: string; name?: string }) => {
      setShowPreviewSplit(false);
      setPreviewingToken(null);
      setHighlightedToken(options.path);
      if (options.set !== activeSet) {
        setActiveSet(options.set);
      }
      switchContextualSurface({
        surface: "token-editor",
        token: {
          path: options.path,
          name: options.name,
          set: options.set,
        },
      });
    },
    [
      activeSet,
      setActiveSet,
      setHighlightedToken,
      setPreviewingToken,
      setShowPreviewSplit,
      switchContextualSurface,
    ],
  );

  const openLinkedTokenSurface = useCallback(
    (options: {
      path: string;
      fromPath?: string;
      surface: "token-editor" | "token-preview";
    }) => {
      const targetSet = pathToSet[options.path];
      if (options.surface === "token-editor") {
        handleNavigateToAlias(options.path, options.fromPath);
      } else {
        handleNavigateToAliasWithoutHistory(options.path);
      }
      if (!targetSet) return;

      switchContextualSurface(
        options.surface === "token-editor"
          ? {
              surface: "token-editor",
              token: {
                path: options.path,
                set: targetSet,
              },
            }
          : {
              surface: "token-preview",
              token: {
                path: options.path,
                set: targetSet,
              },
            },
      );
    },
    [
      handleNavigateToAlias,
      handleNavigateToAliasWithoutHistory,
      pathToSet,
      switchContextualSurface,
    ],
  );

  const openRecipeEditor = useCallback(
    (target: TokensLibraryRecipeEditorTarget) => {
      setShowPreviewSplit(false);
      switchContextualSurface({
        surface: "recipe-editor",
        recipe: target,
      });
    },
    [setShowPreviewSplit, switchContextualSurface],
  );

  const openNewRecipe = useCallback(() => {
    openRecipeEditor({ mode: "create" });
  }, [openRecipeEditor]);

  const openRecipeFromSource = useCallback((source: {
    path: string;
    name?: string;
    type?: string;
    value?: unknown;
    initialDraft?: RecipeDialogInitialDraft;
  }) => {
    openRecipeEditor({
      mode: "create",
      sourceTokenPath: source.path,
      sourceTokenName: source.name,
      sourceTokenType: source.type,
      sourceTokenValue: source.value,
      initialDraft: source.initialDraft,
    });
  }, [openRecipeEditor]);

  const openGeneratedTokens = useCallback(
    (targetGroup: string, targetSet: string) => {
      setShowPreviewSplit(false);
      switchContextualSurface({ surface: null });
      setPendingHighlightForSet(targetGroup, targetSet);
      if (targetSet !== activeSet) {
        setActiveSet(targetSet);
      }
      navigateTo("tokens", "tokens");
    },
    [
      activeSet,
      navigateTo,
      setActiveSet,
      setPendingHighlightForSet,
      setShowPreviewSplit,
      switchContextualSurface,
    ],
  );

  const getViewTokensToastAction = useCallback(
    (info: RecipeSaveSuccessInfo): ToastAction => ({
      label: "View tokens",
      onClick: () => openGeneratedTokens(info.targetGroup, info.targetSet),
    }),
    [openGeneratedTokens],
  );

  const handleTokenEditorBack = useCallback(() => {
    if (!editingToken?.isCreate && navHistoryLength > 0) {
      const previousEntry = consumeNavigateBack();
      if (previousEntry?.path) {
        setEditingToken({
          path: previousEntry.path,
          set: previousEntry.set,
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
        set: editingToken?.set ?? activeSet,
        isCreate: true,
        initialType: savedType,
      });
    },
    [
      activeSet,
      editingToken?.set,
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
      editingRecipe ||
      previewingToken ||
      showTokensCompare
    )
      return;
    setShowPreviewSplit(false);
    openCreateLauncher();
  }, [
    createFromEmpty,
    editingRecipe,
    editingToken,
    openCreateLauncher,
    previewingToken,
    setShowPreviewSplit,
    showTokensCompare,
  ]);

  // Build the common TokenList `actions` object once — it's identical across the
  // three TokenList render variants (side-panel, no-split, preview-split).
  const tokenListActions = {
    onEdit: (path: string, name?: string) =>
      controller.guardEditorAction(() => {
        controller.setShowPreviewSplit(false);
        switchContextualSurface({
          surface: "token-editor",
          token: { path, name, set: activeSet },
        });
        setHighlightedToken(path);
      }),
    onPreview: (path: string, name?: string) => {
      switchContextualSurface({
        surface: "token-preview",
        token: { path, name, set: activeSet },
      });
      setHighlightedToken(path);
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
    onGenerateScaleFromGroup: (groupPath: string, tokenType: string | null) => {
      openRecipeFromSource({
        path: groupPath,
        type: tokenType ?? undefined,
      });
      navigateTo("tokens", "tokens");
    },
    onNavigateToNewRecipe: () => {
      openNewRecipe();
      navigateTo("tokens", "tokens");
    },
    onRefreshRecipes: controller.refreshAll,
    onToggleIssuesOnly: () => controller.setShowIssuesOnly((v) => !v),
    onFilteredCountChange: setFilteredSetCount,
    onNavigateToSet: controller.handleNavigateToSet,
    onViewTokenHistory: (path: string) => {
      setHistoryFilterPath(path);
      navigateTo("sync", "history");
    },
    onEditRecipe: (recipeId: string) =>
      controller.guardEditorAction(() => {
        openRecipeEditor({
          mode: "edit",
          id: recipeId,
        });
      }),
    onOpenRecipeEditor: (target: TokensLibraryRecipeEditorTarget) =>
      controller.guardEditorAction(() => {
        openRecipeEditor(target);
      }),
    onNavigateToRecipe: controller.handleNavigateToRecipe,
    onShowReferences: (path: string) => {
      controller.setFlowPanelInitialPath(path);
      navigateTo("sync", "health");
    },
    onDisplayedLeafNodesChange: (nodes: TokenNode[]) => {
      controller.displayedLeafNodesRef.current = nodes;
    },
    onTokenTouched: (path: string) => {
      controller.recentlyTouched.recordTouch(path);
    },
    onToggleStar: (path: string) =>
      controller.starredTokens.toggleStar(path, activeSet),
    starredPaths: new Set(
      controller.starredTokens.tokens
        .filter((t) => t.setName === activeSet)
        .map((t) => t.path),
    ),
    onError: controller.setErrorToast,
    onOpenCompare: (paths: Set<string>) => {
      controller.setShowPreviewSplit(false);
      switchContextualSurface({
        surface: "compare",
        mode: "tokens",
        paths,
      });
    },
    onOpenCrossThemeCompare: (path: string) => {
      controller.setShowPreviewSplit(false);
      switchContextualSurface({
        surface: "compare",
        mode: "cross-theme",
        path,
      });
    },
    onOpenCommandPaletteWithQuery: controller.openCommandPaletteWithQuery,
    onShowPasteModal: controller.onShowPasteModal,
    onOpenImportPanel: controller.onShowImportPanel,
    onOpenSetSwitcher: controller.toggleSetSwitcher,
    onOpenCreateSet: controller.onOpenSetCreateDialog,
    onOpenStartHere: controller.onOpenStartHere,
    onTogglePreviewSplit: () => controller.setShowPreviewSplit((v) => !v),
    onTokenDragStart: controller.onTokenDragStart,
    onTokenDragEnd: controller.onTokenDragEnd,
  };

  // Common TokenEditor props shared between side-panel and drawer variants
  const tokenEditorProps = editingToken
    ? {
        tokenPath: editingToken.path,
        tokenName: editingToken.name,
        setName: editingToken.set,
        serverUrl,
        onBack: handleTokenEditorBack,
        allTokensFlat,
        pathToSet,
        recipes,
        isCreateMode: editingToken.isCreate,
        initialType: editingToken.initialType,
        initialValue: editingToken.initialValue,
        editorSessionHost: {
          registerSession: controller.registerEditorSession,
          requestClose: controller.requestEditorClose,
        },
        onSaved: handleTokenEditorSaved,
        onSaveAndCreateAnother: handleTokenEditorSaveAndCreateAnother,
        dimensions,
        onRefresh: controller.refreshAll,
        availableFonts: controller.availableFonts,
        fontWeightsByFamily: controller.fontWeightsByFamily,
        derivedTokenPaths,
        onShowReferences: (path: string) => {
          controller.setFlowPanelInitialPath(path);
          navigateTo("sync", "health");
        },
        onNavigateToToken: (path: string) =>
          openLinkedTokenSurface({
            path,
            fromPath: editingToken.path,
            surface: "token-editor",
          }),
        onNavigateToRecipe: controller.handleNavigateToRecipe,
        onOpenRecipeEditor: openRecipeEditor,
        onNavigateToThemes: () => navigateTo("themes", "themes"),
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
      pathToSet={pathToSet}
      dimensions={dimensions}
      sets={sets}
      themeOptionsKey={tokensCompareThemeKey}
      themeOptionsDefaultA={tokensCompareDefaultA}
      themeOptionsDefaultB={tokensCompareDefaultB}
      onEditToken={(set, path) => {
        controller.guardEditorAction(() => {
          openTokenEditor({ path, set });
        });
      }}
      onCreateToken={(path, set, type, value) => {
        controller.guardEditorAction(() => {
          openCreateLauncher({
            initialPath: path,
            initialType: type,
            initialValue: value,
            set,
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

  const recipeEditorProps =
    editingRecipe &&
    (editingRecipe.mode !== "edit" || editingRecipeData)
      ? {
          serverUrl,
          allSets: sets,
          activeSet,
          allTokensFlat,
          sourceTokenPath:
            editingRecipe.mode === "create"
              ? editingRecipe.sourceTokenPath
              : undefined,
          sourceTokenName:
            editingRecipe.mode === "create"
              ? editingRecipe.sourceTokenName
              : undefined,
          sourceTokenType:
            editingRecipe.mode === "create"
              ? editingRecipe.sourceTokenType
              : undefined,
          sourceTokenValue:
            editingRecipe.mode === "create"
              ? editingRecipe.sourceTokenValue
              : undefined,
          existingRecipe:
            editingRecipe.mode === "edit"
              ? (editingRecipeData ?? undefined)
              : undefined,
          initialDraft:
            editingRecipe.mode === "create"
              ? editingRecipe.initialDraft
              : undefined,
          template:
            editingRecipe.mode === "create"
              ? editingRecipe.template
              : undefined,
          pathToSet,
          onClose: () => {
            setEditingRecipe(null);
            controller.refreshAll();
          },
          onSaved: (info?: RecipeSaveSuccessInfo) => {
            setEditingRecipe(null);
            controller.refreshAll();
            if (info) {
              openGeneratedTokens(info.targetGroup, info.targetSet);
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

  type TokensContextualSurfaceRenderState = {
    surface: TokensLibraryContextualSurface;
    content: ReactNode;
    onDismiss: () => void;
    height: string;
  };

  const getTokensContextualSurfaceRenderState =
    (): TokensContextualSurfaceRenderState | null => {
      if (
        activeTokensContextualSurface === "token-editor" &&
        editingToken &&
        tokenEditorProps
      ) {
        return {
          surface: "token-editor",
          content: <TokenEditor {...tokenEditorProps} />,
          onDismiss: controller.requestEditorClose,
          height: "65%",
        };
      }

      if (
        activeTokensContextualSurface === "recipe-editor" &&
        editingRecipe &&
        recipeEditorProps
      ) {
        return {
          surface: "recipe-editor",
          content: <TokenRecipeDialog {...recipeEditorProps} />,
          onDismiss: controller.requestEditorClose,
          height: "72%",
        };
      }

      if (
        activeTokensContextualSurface === "token-preview" &&
        previewingToken
      ) {
        return {
          surface: "token-preview",
          content: (
            <TokenDetailPreview
              tokenPath={previewingToken.path}
              tokenName={previewingToken.name}
              setName={previewingToken.set}
              allTokensFlat={allTokensFlat}
              pathToSet={pathToSet}
              dimensions={dimensions}
              activeThemes={activeThemes}
              tokenUsageCounts={tokenUsageCounts}
              recipes={recipes}
              derivedTokenPaths={derivedTokenPaths}
              lintViolations={controller.lintViolations.filter(
                (violation) => violation.path === previewingToken.path,
              )}
              syncSnapshot={
                Object.keys(syncSnapshot).length > 0 ? syncSnapshot : undefined
              }
              serverUrl={serverUrl}
              onEdit={controller.handlePreviewEdit}
              onClose={controller.handlePreviewClose}
              onNavigateToAlias={(path: string, fromPath?: string) =>
                openLinkedTokenSurface({
                  path,
                  fromPath,
                  surface: "token-preview",
                })
              }
              onNavigateToRecipe={controller.handleNavigateToRecipe}
            />
          ),
          onDismiss: controller.handlePreviewClose,
          height: "50%",
        };
      }

      if (activeTokensContextualSurface === "compare" && showTokensCompare) {
        return {
          surface: "compare",
          content: renderTokensComparePanel(),
          onDismiss: () => setShowTokensCompare(false),
          height: "72%",
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
        ctx={{ setName: activeSet, sets, serverUrl, connected, selectedNodes }}
        data={{
          tokens,
          allTokensFlat: themedAllTokensFlat,
          lintViolations: controller.lintViolations,
          syncSnapshot:
            Object.keys(syncSnapshot).length > 0 ? syncSnapshot : undefined,
          recipes,
          recipesByTargetGroup,
          derivedTokenPaths,
          tokenUsageCounts,
          cascadeDiff: controller.cascadeDiff ?? undefined,
          perSetFlat,
          collectionMap: setCollectionNames,
          modeMap: setModeNames,
          dimensions,
          unthemedAllTokensFlat: allTokensFlat,
          pathToSet,
          activeThemes,
        }}
        actions={tokenListActions}
        recentlyTouched={controller.recentlyTouched}
        defaultCreateOpen={createFromEmpty}
        highlightedToken={tokenListHighlightedPath}
        showIssuesOnly={controller.showIssuesOnly}
        showPreviewSplit={controller.showPreviewSplit}
        editingTokenPath={editingToken?.path}
        compareHandle={controller.tokenListCompareRef}
      />
    </div>
  );

  const renderWideTokensContextualSurface = (
    surfaceState: TokensContextualSurfaceRenderState,
  ) => (
    <div
      className="shrink-0 border-l border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] flex flex-row overflow-hidden"
      style={{ width: editorWidth }}
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
      <div
        className="w-1 shrink-0 cursor-col-resize hover:bg-[var(--color-figma-accent)]/30 active:bg-[var(--color-figma-accent)]/50 transition-colors"
        onMouseDown={handleEditorWidthDragStart}
        title="Drag to resize"
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {surfaceState.content}
      </div>
    </div>
  );

  const renderNarrowTokensContextualSurface = () => {
    if (controller.useSidePanel || controller.showPreviewSplit) return null;

    const surfaceState = getTokensContextualSurfaceRenderState();
    if (!surfaceState) return null;

    return (
      <div
        className="fixed inset-0 z-40 flex flex-col justify-end overflow-hidden"
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
        <div
          className="absolute inset-0 bg-[var(--color-figma-overlay)] drawer-fade-in"
          onClick={() => surfaceState.onDismiss()}
        />
        <div
          className="relative flex flex-col rounded-t-xl bg-[var(--color-figma-bg)] shadow-2xl drawer-slide-up"
          style={{ height: surfaceState.height }}
        >
          <div className="flex justify-center pt-2 pb-1 shrink-0">
            <div className="w-8 h-1 rounded-full bg-[var(--color-figma-border)]" />
          </div>
          <div className="flex-1 overflow-hidden">{surfaceState.content}</div>
        </div>
      </div>
    );
  };

  const openImportNextStep = useCallback(
    (
      result: ImportCompletionResult,
      recommendation: ImportNextStepRecommendation,
      options?: { preserveSecondarySurface?: boolean },
    ) => {
      if (recommendation.target.kind !== "workspace") {
        return;
      }

      const targetSet = getMostRelevantImportDestinationSet(result);
      if (targetSet) {
        setActiveSet(targetSet);
      }

      beginHandoff({
        reason: recommendation.rationale,
        returnSecondarySurfaceId: "import",
      });
      navigateTo(recommendation.target.topTab, recommendation.target.subTab, {
        preserveSecondarySurface: options?.preserveSecondarySurface,
        preserveHandoff: true,
      });
    },
    [beginHandoff, navigateTo, setActiveSet],
  );

  type SecondaryPanelRenderer = () => ReactNode;

  // Secondary surfaces are full-height takeovers: they keep the shell visible
  // while replacing the main body until the user closes them.
  const SECONDARY_PANEL_MAP: Partial<
    Record<SecondarySurfaceId, SecondaryPanelRenderer>
  > = {
    sets: () => (
      <SetManager
        sets={sets}
        activeSet={activeSet}
        onClose={closeSecondarySurface}
        onOpenQuickSwitch={setManagerController.onOpenQuickSwitch}
        onRename={setManagerController.onRename}
        onDuplicate={setManagerController.onDuplicate}
        onDelete={setManagerController.onDelete}
        onReorder={setManagerController.onReorder}
        onReorderFull={setManagerController.onReorderFull}
        onOpenCreateSet={setManagerController.onOpenCreateSet}
        onEditInfo={setManagerController.onEditInfo}
        onMerge={setManagerController.onMerge}
        onSplit={setManagerController.onSplit}
        setTokenCounts={setTokenCounts}
        setDescriptions={setDescriptions}
        onBulkDelete={setManagerController.onBulkDelete}
        onBulkDuplicate={setManagerController.onBulkDuplicate}
        onBulkMoveToFolder={setManagerController.onBulkMoveToFolder}
        renamingSet={setManagerController.renamingSet}
        renameValue={setManagerController.renameValue}
        setRenameValue={setManagerController.setRenameValue}
        renameError={setManagerController.renameError}
        setRenameError={setManagerController.setRenameError}
        renameInputRef={setManagerController.renameInputRef}
        onRenameConfirm={setManagerController.onRenameConfirm}
        onRenameCancel={setManagerController.onRenameCancel}
        editingMetadataSet={setManagerController.editingMetadataSet}
        metadataDescription={setManagerController.metadataDescription}
        setMetadataDescription={setManagerController.setMetadataDescription}
        metadataCollectionName={setManagerController.metadataCollectionName}
        setMetadataCollectionName={
          setManagerController.setMetadataCollectionName
        }
        metadataModeName={setManagerController.metadataModeName}
        setMetadataModeName={setManagerController.setMetadataModeName}
        onMetadataClose={setManagerController.onMetadataClose}
        onMetadataSave={setManagerController.onMetadataSave}
        deletingSet={setManagerController.deletingSet}
        onDeleteConfirm={setManagerController.onDeleteConfirm}
        onDeleteCancel={setManagerController.onDeleteCancel}
        mergingSet={setManagerController.mergingSet}
        mergeTargetSet={setManagerController.mergeTargetSet}
        mergeConflicts={setManagerController.mergeConflicts}
        mergeResolutions={setManagerController.mergeResolutions}
        mergeChecked={setManagerController.mergeChecked}
        mergeLoading={setManagerController.mergeLoading}
        onMergeTargetChange={setManagerController.onMergeTargetChange}
        setMergeResolutions={setManagerController.setMergeResolutions}
        onMergeCheckConflicts={setManagerController.onMergeCheckConflicts}
        onMergeConfirm={setManagerController.onMergeConfirm}
        onMergeClose={setManagerController.onMergeClose}
        splittingSet={setManagerController.splittingSet}
        splitPreview={setManagerController.splitPreview}
        splitDeleteOriginal={setManagerController.splitDeleteOriginal}
        splitLoading={setManagerController.splitLoading}
        setSplitDeleteOriginal={setManagerController.setSplitDeleteOriginal}
        onSplitConfirm={setManagerController.onSplitConfirm}
        onSplitClose={setManagerController.onSplitClose}
      />
    ),
    import: () => (
      <ErrorBoundary panelName="Import" onReset={closeSecondarySurface}>
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          <div className="shrink-0 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-2">
            <h2 className="text-[11px] font-medium text-[var(--color-figma-text)]">
              Import tokens
            </h2>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <ImportPanel
              serverUrl={serverUrl}
              connected={connected}
              onImported={refreshTokens}
              onImportComplete={(result) => {
                controller.onImportComplete(result);
                const nextWorkspaceStep = getImportResultNextStepRecommendations(
                  result,
                ).find(
                  (recommendation) => recommendation.target.kind === "workspace",
                );
                if (nextWorkspaceStep) {
                  openImportNextStep(result, nextWorkspaceStep, {
                    preserveSecondarySurface: true,
                  });
                  return;
                }

                navigateTo("tokens", "tokens", {
                  preserveSecondarySurface: true,
                });
              }}
              onOpenImportNextStep={(result, recommendation) =>
                openImportNextStep(result, recommendation)
              }
              onPushUndo={controller.pushUndo}
            />
          </div>
        </div>
      </ErrorBoundary>
    ),
    notifications: () => (
      <NotificationsPanel
        history={controller.notificationHistory}
        onClear={controller.clearNotificationHistory}
      />
    ),
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

  // ---------------------------------------------------------------------------
  // Sub-tab panel routing — O(1) lookup, no repeated condition guards
  // ---------------------------------------------------------------------------

  type PanelRenderer = () => ReactNode;

  const PANEL_MAP: Record<TopTab, Partial<Record<SubTab, PanelRenderer>>> = {
    tokens: {
      tokens: renderDefineTokens,
    },
    recipes: {
      recipes: renderRecipes,
    },
    themes: {
      themes: renderDefineThemes,
    },
    inspect: {
      inspect: renderApplyInspect,
      "canvas-analysis": renderApplyCanvasAnalysis,
    },
    sync: {
      publish: renderSyncPublish,
      export: renderSyncExport,
      history: renderSyncHistory,
      health: renderSyncHealth,
    },
  };

  // Sub-tab switching is now driven by the sidebar — no in-panel segment controls
  const renderer = PANEL_MAP[activeTopTab]?.[activeSubTab];
  return renderer ? renderer() : null;

  // ---------------------------------------------------------------------------
  // Panel render functions — each closes over context + props
  // ---------------------------------------------------------------------------

  function renderDefineTokens(): ReactNode {
    const renderTokensStartSurface = () => (
      <FeedbackPlaceholder
        variant="empty"
        size="full"
        icon={(
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
          </svg>
        )}
        title="No tokens yet"
        description="Set up your first tokens with guided setup, templates, or import."
        primaryAction={{ label: "Get started", onClick: () => controller.onOpenStartHere() }}
      />
    );

    const wideContextualSurface =
      !controller.showPreviewSplit && controller.useSidePanel
        ? getTokensContextualSurfaceRenderState()
        : null;

    const renderLibrarySection = () => (
      <>
        {/* Fetch error banner */}
        {(fetchError || tokensError) && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--color-figma-error)]/10 border-b border-[var(--color-figma-error)]/20 shrink-0">
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-[var(--color-figma-error)] shrink-0"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
            <span className="text-[10px] text-[var(--color-figma-text-secondary)] flex-1 truncate">
              Failed to load tokens: {fetchError || tokensError}
            </span>
            <button
              onClick={refreshTokens}
              className="text-[10px] px-2 py-0.5 rounded border border-[var(--color-figma-error)]/40 text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10 transition-colors shrink-0"
            >
              Retry
            </button>
          </div>
        )}
        {/* Empty state */}
        {tokens.length === 0 &&
          !createFromEmpty &&
          !editingToken &&
          renderTokensStartSurface()}
        {/* Main content: TokenList variants */}
        {hasTokensLibrarySurface && !controller.showPreviewSplit && (
          <div className="flex h-full overflow-hidden">
            {renderTokensLibraryBody()}
            {wideContextualSurface
              ? renderWideTokensContextualSurface(wideContextualSurface)
              : null}
          </div>
        )}
        {/* Preview split view */}
        {hasTokensLibrarySurface && controller.showPreviewSplit && (
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
              {renderTokensLibraryBody()}
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
                onReset={() => navigateTo("tokens", "tokens")}
              >
                <PreviewPanel
                  allTokensFlat={themedAllTokensFlat}
                  dimensions={dimensions}
                  activeThemes={activeThemes}
                  onActiveThemesChange={setActiveThemes}
                  onGoToTokens={() => navigateTo("tokens", "tokens")}
                  onNavigateToToken={(path) => {
                    const name = path.split(".").pop();
                    const set = pathToSet[path] ?? activeSet;
                    setPreviewingToken({ path, name, set });
                    setHighlightedToken(path);
                  }}
                  focusedToken={previewingToken}
                  pathToSet={pathToSet}
                  onClearFocus={() => setPreviewingToken(null)}
                  lintViolations={controller.lintViolations}
                  syncSnapshot={
                    Object.keys(syncSnapshot).length > 0
                      ? syncSnapshot
                      : undefined
                  }
                  onEditToken={(path, name, set) => {
                    controller.guardEditorAction(() => {
                      openTokenEditor({ path, name, set: set ?? activeSet });
                    });
                  }}
                  serverUrl={serverUrl}
                  tokenUsageCounts={tokenUsageCounts}
                  recipes={recipes}
                  derivedTokenPaths={derivedTokenPaths}
                  onNavigateToRecipe={controller.handleNavigateToRecipe}
                />
              </ErrorBoundary>
            </div>
          </div>
        )}
      </>
    );

    return (
      <>
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {renderLibrarySection()}
        </div>
        {renderNarrowTokensContextualSurface()}
      </>
    );
  }

  function renderDefineThemes(): ReactNode {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-hidden">
          <ErrorBoundary
            panelName="Themes"
            onReset={() => navigateTo("tokens", "tokens")}
          >
            <ThemeManager
              serverUrl={serverUrl}
              connected={connected}
              sets={sets}
              onDimensionsChange={setDimensions}
              onNavigateToToken={(path, set) => {
                beginHandoff({
                  reason: "View or edit this token, then return to Themes",
                });
                navigateTo("tokens", "tokens", { preserveHandoff: true });
                controller.handleNavigateToSet(set, path);
              }}
              onCreateToken={(tokenPath, set) => {
                beginHandoff({
                  reason: "Create this token, then return to Themes",
                });
                navigateTo("tokens", "tokens", { preserveHandoff: true });
                setEditingToken({ path: tokenPath, set, isCreate: true });
              }}
              onPushUndo={controller.pushUndo}
              allTokensFlat={allTokensFlat}
              pathToSet={pathToSet}
              onShellStateChange={controller.onThemeShellStateChange}
              onTokensCreated={controller.refreshAll}
              onGoToTokens={() => {
                beginHandoff({
                  reason: "Browse tokens, then return to Themes",
                });
                navigateTo("tokens", "tokens", { preserveHandoff: true });
              }}
              themeManagerHandle={controller.themeManagerHandleRef}
              onSuccess={controller.setSuccessToast}
              resolverState={{
                connected,
                resolvers: resolverState.resolvers,
                resolverLoadErrors: resolverState.resolverLoadErrors,
                activeResolver: resolverState.activeResolver,
                selectionOrigin: resolverState.selectionOrigin,
                setActiveResolver: resolverState.setActiveResolver,
                resolverInput: resolverState.resolverInput,
                setResolverInput: resolverState.setResolverInput,
                activeModifiers: resolverState.activeModifiers,
                resolvedTokens: resolverState.resolvedTokens,
                resolverError: resolverState.resolverError,
                loading: resolverState.loading,
                resolversLoading: resolverState.resolversLoading,
                fetchResolvers: resolverState.fetchResolvers,
                convertFromThemes: resolverState.convertFromThemes,
                deleteResolver: resolverState.deleteResolver,
              }}
            />
          </ErrorBoundary>
        </div>
      </div>
    );
  }

  function renderRecipes(): ReactNode {
    return (
      <ErrorBoundary
        panelName="Recipes"
        onReset={() => navigateTo("tokens", "tokens")}
      >
        <GraphPanel
          serverUrl={serverUrl}
          activeSet={activeSet}
          allSets={sets}
          recipes={recipes}
          connected={connected}
          onRefresh={controller.refreshAll}
          onPushUndo={controller.pushUndo}
          allTokensFlat={allTokensFlat}
          onViewTokens={openGeneratedTokens}
        />
      </ErrorBoundary>
    );
  }

  function renderApplyInspect(): ReactNode {
    return (
      <ErrorBoundary
        panelName="Inspector"
        onReset={() => navigateTo("tokens", "tokens")}
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
          activeSet={activeSet}
          serverUrl={serverUrl}
          onTokenCreated={refreshTokens}
          onNavigateToToken={(path) => {
            setHighlightedToken(path);
            navigateTo("tokens", "tokens");
          }}
          onPushUndo={controller.pushUndo}
          onToast={controller.setSuccessToast}
          onGoToTokens={() => navigateTo("tokens", "tokens")}
          triggerCreateToken={controller.triggerCreateToken}
        />
      </ErrorBoundary>
    );
  }

  function renderApplyCanvasAnalysis(): ReactNode {
    return (
      <ErrorBoundary
        panelName="Canvas Analysis"
        onReset={() => navigateTo("inspect", "inspect")}
      >
        <CanvasAnalysisPanel
          availableTokens={allTokensFlat}
          heatmapResult={heatmapResult}
          heatmapLoading={heatmapLoading}
          heatmapProgress={heatmapProgress}
          heatmapError={heatmapError}
          onSelectNodes={(ids) =>
            parent.postMessage(
              { pluginMessage: { type: "select-heatmap-nodes", nodeIds: ids } },
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
      </ErrorBoundary>
    );
  }

  function renderSyncPublish(): ReactNode {
    return (
      <ErrorBoundary
        panelName="Figma Sync"
        onReset={() => navigateTo("sync", "publish")}
      >
        <PublishPanel
          serverUrl={serverUrl}
          connected={connected}
          activeSet={activeSet}
          collectionMap={setCollectionNames}
          modeMap={setModeNames}
          refreshValidation={controller.refreshValidation}
          tokenChangeKey={controller.tokenChangeKey}
          publishPanelHandle={controller.publishPanelHandleRef}
        />
      </ErrorBoundary>
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

  function renderSyncHistory(): ReactNode {
    return (
      <ErrorBoundary
        panelName="History"
        onReset={() => navigateTo("sync", "health")}
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
    );
  }

  function renderSyncHealth(): ReactNode {
    return (
      <ErrorBoundary
        panelName="Audit"
        onReset={() => navigateTo("sync", "history")}
      >
        <HealthPanel
          serverUrl={serverUrl}
          connected={connected}
          activeSet={activeSet}
          recipes={recipes}
          lintViolations={controller.lintViolations}
          allTokensFlat={allTokensFlat}
          pathToSet={pathToSet}
          dimensions={dimensions}
          tokenUsageCounts={tokenUsageCounts}
          heatmapResult={heatmapResult}
          onNavigateTo={(topTab, subTab) =>
            navigateTo(topTab as TopTab, subTab as SubTab | undefined)
          }
          onNavigateToToken={(path, set) => {
            beginHandoff({
              reason:
                "Inspect the source token behind this audit finding, then return to Audit.",
            });
            setActiveSet(set);
            navigateTo("tokens", "tokens", { preserveHandoff: true });
            setPendingHighlight(path);
          }}
          onNavigateToRecipe={(recipeId) => {
            beginHandoff({
              reason:
                "Inspect the recipe behind this audit finding, then return to Audit.",
            });
            navigateTo("tokens", "tokens", { preserveHandoff: true });
            openRecipeEditor({ mode: "edit", id: recipeId });
          }}
          onTriggerHeatmap={triggerHeatmapScan}
          validationIssues={controller.validationIssues}
          validationSummary={controller.validationSummary}
          validationLoading={controller.validationLoading}
          validationError={controller.validationError}
          validationLastRefreshed={controller.validationLastRefreshed}
          validationIsStale={controller.validationIsStale}
          onRefreshValidation={controller.refreshValidation}
          onPushUndo={controller.pushUndo}
          onError={controller.setErrorToast}
        />
      </ErrorBoundary>
    );
  }
}
