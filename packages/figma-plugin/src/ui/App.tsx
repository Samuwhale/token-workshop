import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { TokenListImperativeHandle } from "./components/tokenListTypes";
import type { ThemeManagerHandle } from "./components/ThemeManager";
import type { PublishPanelHandle } from "./components/PublishPanel";
import { ToastStack } from "./components/ToastStack";
import { WorkspaceSummaryHeader } from "./components/WorkspaceSummaryHeader";
import { ThemeStageModelControls } from "./components/ThemeStageModelControls";
import { SyncWorkflowControls } from "./components/publish/SyncWorkflowControls";
import { useToastStack } from "./hooks/useToastStack";
import { useToastBusListener } from "./shared/toastBus";
import { ConfirmModal } from "./components/ConfirmModal";
import { InlineBanner } from "./components/InlineBanner";
import { PasteTokensModal } from "./components/PasteTokensModal";
import { ProgressOverlay } from "./components/ProgressOverlay";
import type { ImportCompletionResult } from "./components/ImportPanelContext";
import {
  WelcomePrompt,
  type StartHereBranch,
} from "./components/WelcomePrompt";
import { ColorScaleGenerator } from "./components/ColorScaleGenerator";
import { AppCommandPalette } from "./components/AppCommandPalette";
import { SetSwitcher } from "./components/SetSwitcher";
import { QuickApplyPicker } from "./components/QuickApplyPicker";
import { computeHealthIssueCount } from "./components/HealthPanel";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PanelRouter } from "./panels/PanelRouter";
import { useServerEvents } from "./hooks/useServerEvents";
import type { TokenNode } from "./hooks/useTokens";
import { useUndo } from "./hooks/useUndo";
import { useLint } from "./hooks/useLint";
import { usePreviewSplit } from "./hooks/usePreviewSplit";
import { useAvailableFonts } from "./hooks/useAvailableFonts";
import { useWindowExpand } from "./hooks/useWindowExpand";
import { useWindowResize } from "./hooks/useWindowResize";
import type {
  ImportNextStepRecommendation,
  SecondarySurfaceId,
  SubTab,
  TopTab,
  UtilityActionId,
} from "./shared/navigationTypes";
import {
  APP_SHELL_NAVIGATION,
  AUDIT_WORKSPACE_GUIDE,
  CONTEXTUAL_PANEL_MIN_WIDTH,
  CONTEXTUAL_PANEL_TRANSITIONS,
  getSurfaceKindLabel,
  getImportResultNextStepRecommendations,
  getMostRelevantImportDestinationSet,
  getWorkspaceWorkflowGuide,
  PRIMARY_WORKSPACE_SEQUENCE,
  resolveWorkspaceSummary,
  resolveSecondarySurface,
  toWorkspaceId,
} from "./shared/navigationTypes";
import type {
  ThemeAuthoringStage,
  ThemeWorkspaceShellState,
} from "./shared/themeWorkflow";
import { summarizeThemeWorkflow } from "./shared/themeWorkflow";
import {
  DEFAULT_PUBLISH_PREFLIGHT_STATE,
  type PublishPreflightState,
  type SyncWorkflowStage,
} from "./shared/syncWorkflow";
import type { NoticeSeverity } from "./shared/noticeSystem";
import { NoticeFieldMessage } from "./shared/noticeSystem";
import { useConnectionContext } from "./contexts/ConnectionContext";
import {
  useTokenSetsContext,
  useTokenFlatMapContext,
  useGeneratorContext,
} from "./contexts/TokenDataContext";
import {
  useThemeSwitcherContext,
  useResolverContext,
} from "./contexts/ThemeContext";
import {
  useSelectionContext,
  useHeatmapContext,
  useUsageContext,
  useInspectPreferencesContext,
} from "./contexts/InspectContext";
import { useNavigationContext } from "./contexts/NavigationContext";
import { useEditorContext } from "./contexts/EditorContext";
import { useFigmaSync } from "./hooks/useFigmaSync";
import { useSetRename } from "./hooks/useSetRename";
import { useSetDelete } from "./hooks/useSetDelete";
import { useSetDuplicate } from "./hooks/useSetDuplicate";
import { useSetMergeSplit } from "./hooks/useSetMergeSplit";
import { useSetMetadata } from "./hooks/useSetMetadata";
import { useModalVisibility } from "./hooks/useModalVisibility";
import { useSetTabs } from "./hooks/useSetTabs";
import { useRecentOperations } from "./hooks/useRecentOperations";
import { useRecentlyTouched } from "./hooks/useRecentlyTouched";
import { useStarredTokens } from "./hooks/useStarredTokens";
import { useAnalyticsState } from "./hooks/useAnalyticsState";
import { useValidationCache } from "./hooks/useValidationCache";
import { useGraphState } from "./hooks/useGraphState";
import { useSettingsListener } from "./components/SettingsPanel";
import { WorkspaceControllerProvider } from "./contexts/WorkspaceControllerContext";
import type { TokenMapEntry } from "../shared/types";
import { KNOWN_CONTROLLER_MESSAGE_TYPES } from "../shared/types";
import { adaptShortcut, tokenPathToUrlSegment } from "./shared/utils";
import { SHORTCUT_KEYS, matchesShortcut } from "./shared/shortcutRegistry";
import { getMenuItems, handleMenuArrowKeys } from "./hooks/useMenuKeyboard";
import { apiFetch, ApiError } from "./shared/apiFetch";
import { STORAGE_KEYS, lsGet, lsSet, lsGetJson } from "./shared/storage";
import {
  shellControlClass,
  shellCountBadgeClass,
  shellMetaTextClass,
} from "./shared/shellControlStyles";
import { findLeafByPath } from "./components/tokenListUtils";

const LAST_IMPORT_RESULT_DISMISS_MS = 30_000;

type WorkspaceRouteTarget = {
  topTab: TopTab;
  subTab: SubTab;
};

type PostImportBannerState = {
  result: ImportCompletionResult;
  destination: WorkspaceRouteTarget;
  nextRecommendation: ImportNextStepRecommendation | null;
  visible: boolean;
};

function formatCount(
  count: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatImportSource(
  sourceType: ImportCompletionResult["sourceType"],
): string {
  switch (sourceType) {
    case "variables":
      return "Figma variables";
    case "styles":
      return "styles";
    case "tokens-studio":
      return "Tokens Studio";
    case "tailwind":
      return "Tailwind tokens";
    case "json":
      return "JSON";
    case "css":
      return "CSS";
    default:
      return "import source";
  }
}

function getWorkspaceRouteLabel(topTab: TopTab, subTab: SubTab): string {
  const summary = resolveWorkspaceSummary(topTab, subTab);
  return summary.section?.label ?? summary.workspaceLabel;
}

function matchesWorkspaceRoute(
  route: WorkspaceRouteTarget,
  target: WorkspaceRouteTarget,
): boolean {
  return route.topTab === target.topTab && route.subTab === target.subTab;
}

function createFallbackWorkspaceRecommendation(
  topTab: TopTab,
  subTab: SubTab,
  rationale: string,
): ImportNextStepRecommendation {
  return {
    label: getWorkspaceRouteLabel(topTab, subTab),
    rationale,
    target: {
      kind: "workspace",
      workspaceId: toWorkspaceId(topTab, subTab),
      topTab,
      subTab,
    },
  };
}

function getPostImportDestination(
  result: ImportCompletionResult,
  destinationRecommendation: ImportNextStepRecommendation | null,
): WorkspaceRouteTarget {
  if (destinationRecommendation?.target.kind === "workspace") {
    return {
      topTab: destinationRecommendation.target.topTab,
      subTab: destinationRecommendation.target.subTab,
    };
  }

  const firstWorkspaceRecommendation = getImportResultNextStepRecommendations(
    result,
  ).find((recommendation) => recommendation.target.kind === "workspace");

  if (firstWorkspaceRecommendation?.target.kind === "workspace") {
    return {
      topTab: firstWorkspaceRecommendation.target.topTab,
      subTab: firstWorkspaceRecommendation.target.subTab,
    };
  }

  return { topTab: "define", subTab: "tokens" };
}

function getFallbackPostImportRecommendation(
  result: ImportCompletionResult,
  destination: WorkspaceRouteTarget,
): ImportNextStepRecommendation | null {
  if (destination.topTab !== "define" || destination.subTab !== "tokens") {
    return createFallbackWorkspaceRecommendation(
      "define",
      "tokens",
      "Open Tokens next to review the imported library before moving into Themes, Apply, or Sync.",
    );
  }

  if (
    result.sourceType === "variables" &&
    (result.sourceCollectionCount ?? 0) > 1
  ) {
    return createFallbackWorkspaceRecommendation(
      "define",
      "themes",
      "Open Themes next. Imported variable collections usually need a quick theme-structure pass before you fine-tune individual tokens.",
    );
  }

  return createFallbackWorkspaceRecommendation(
    "ship",
    "publish",
    "Open Sync next to confirm mapping for the imported changes before more edits pile on.",
  );
}

function getPostImportNextRecommendation(
  result: ImportCompletionResult,
  destination: WorkspaceRouteTarget,
): ImportNextStepRecommendation | null {
  const nextWorkspaceRecommendation = getImportResultNextStepRecommendations(
    result,
  ).find(
    (recommendation) =>
      recommendation.target.kind === "workspace" &&
      !matchesWorkspaceRoute(destination, {
        topTab: recommendation.target.topTab,
        subTab: recommendation.target.subTab,
      }),
  );

  return (
    nextWorkspaceRecommendation ??
    getFallbackPostImportRecommendation(result, destination)
  );
}

function buildPostImportBannerMessage(result: ImportCompletionResult): string {
  const summaryParts = [];
  if (result.newCount > 0) summaryParts.push(`${result.newCount} new`);
  if (result.overwriteCount > 0)
    summaryParts.push(`${result.overwriteCount} overwritten`);
  if (result.mergeCount > 0) summaryParts.push(`${result.mergeCount} merged`);
  if (result.keepExistingCount > 0)
    summaryParts.push(`${result.keepExistingCount} kept`);

  const breakdown =
    summaryParts.length > 0 ? ` ${summaryParts.join(", ")}.` : "";
  const failureNote = result.hadFailures
    ? " Some items still need follow-up."
    : "";

  return `Imported ${formatCount(
    result.totalImportedCount,
    "token",
  )} from ${formatImportSource(result.sourceType)} into ${formatCount(
    result.destinationSets.length,
    "set",
  )}.${breakdown}${failureNote}`;
}

export function App() {
  // Navigation and editor state from contexts (owned by NavigationProvider and EditorProvider)
  const {
    activeTopTab,
    activeSubTab,
    activeSecondarySurface,
    navigateTo,
    openSecondarySurface,
    closeSecondarySurface,
    activeHandoff,
    beginHandoff,
    clearHandoff,
    returnFromHandoff,
  } = useNavigationContext();
  const {
    editingToken,
    setEditingToken,
    editingGenerator,
    setEditingGenerator,
    previewingToken,
    setPreviewingToken,
    setHighlightedToken,
    createFromEmpty,
    setPendingHighlight,
    setPendingHighlightForSet,
    setAliasNotFoundHandler,
    setShowTokensCompare,
    setTokensCompareMode,
    setTokensComparePath,
    setTokensCompareThemeKey,
    switchContextualSurface,
  } = useEditorContext();
  const {
    showPreviewSplit,
    setShowPreviewSplit,
    splitRatio,
    splitValueNow,
    splitContainerRef,
    handleSplitDragStart,
    handleSplitKeyDown,
  } = usePreviewSplit();
  const [menuOpen, setMenuOpen] = useState(false);
  const {
    connected,
    checking,
    serverUrl,
    getDisconnectSignal,
    markDisconnected,
    updateServerUrlAndConnect,
    retryConnection,
  } = useConnectionContext();
  const {
    sets,
    setSets,
    activeSet,
    setActiveSet,
    tokens,
    setTokenCounts,
    setDescriptions,
    setCollectionNames,
    setModeNames,
    refreshTokens,
    addSetToState,
    removeSetFromState,
    renameSetInState,
    updateSetMetadataInState,
    fetchTokensForSet,
  } = useTokenSetsContext();
  const { allTokensFlat, pathToSet, perSetFlat, filteredSetCount } =
    useTokenFlatMapContext();
  const {
    generators,
    refreshGenerators,
    generatorsBySource,
    derivedTokenPaths,
  } = useGeneratorContext();
  const {
    dimensions,
    activeThemes,
    setActiveThemes,
    previewThemes,
    setPreviewThemes,
    openDimDropdown,
    setOpenDimDropdown,
    dimBarExpanded,
    setDimBarExpanded,
    dimDropdownRef,
    themesError,
    retryThemes,
    setThemeStatusMap,
  } = useThemeSwitcherContext();
  const resolverState = useResolverContext();
  const { selectedNodes, selectionLoading } = useSelectionContext();
  const { triggerHeatmapScan } = useHeatmapContext();
  const { triggerUsageScan } = useUsageContext();
  const { deepInspect, propFilter, propFilterMode } =
    useInspectPreferencesContext();
  const { families: availableFonts, weightsByFamily: fontWeightsByFamily } =
    useAvailableFonts();
  // Utilities menu owns the connection editor so recovery stays available without
  // pinning a disconnect banner across every workspace.
  const [connectionUrlInput, setConnectionUrlInput] = useState(serverUrl);
  const [connectionConnectResult, setConnectionConnectResult] = useState<
    "ok" | "fail" | null
  >(null);
  const [showConnectionEditor, setShowConnectionEditor] = useState(false);
  const {
    showPasteModal,
    setShowPasteModal,
    showColorScaleGen,
    setShowColorScaleGen,
    showCommandPalette,
    setShowCommandPalette,
    showQuickApply,
    setShowQuickApply,
    showSetSwitcher,
    setShowSetSwitcher,
  } = useModalVisibility();
  const [postImportBanner, setPostImportBanner] =
    useState<PostImportBannerState | null>(null);
  const [commandPaletteInitialQuery, setCommandPaletteInitialQuery] =
    useState("");
  const recentlyTouched = useRecentlyTouched();
  const starredTokens = useStarredTokens();
  const initialFirstRun = !lsGet(STORAGE_KEYS.FIRST_RUN_DONE);
  const [startHereState, setStartHereState] = useState<{
    open: boolean;
    initialBranch: StartHereBranch;
    firstRun: boolean;
  }>(() => ({
    open: initialFirstRun,
    initialBranch: "root",
    firstRun: initialFirstRun,
  }));
  // undoMaxHistory is managed by SettingsPanel; App re-reads from localStorage when it changes
  const undoHistoryRev = useSettingsListener(STORAGE_KEYS.UNDO_MAX_HISTORY);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const undoMaxHistory = useMemo(
    () => lsGetJson<number>(STORAGE_KEYS.UNDO_MAX_HISTORY, 20) ?? 20,
    [undoHistoryRev],
  );
  const [pendingPublishCount, setPendingPublishCount] = useState(0);
  const [publishPreflightState, setPublishPreflightState] =
    useState<PublishPreflightState>(DEFAULT_PUBLISH_PREFLIGHT_STATE);
  const dismissEphemeralOverlays = useCallback(() => {
    setMenuOpen(false);
    setShowCommandPalette(false);
    setShowQuickApply(false);
    setShowSetSwitcher(false);
  }, [setShowCommandPalette, setShowQuickApply, setShowSetSwitcher]);
  const openStartHere = useCallback(
    (initialBranch: StartHereBranch = "root", firstRun = false) => {
      dismissEphemeralOverlays();
      setStartHereState({ open: true, initialBranch, firstRun });
    },
    [dismissEphemeralOverlays],
  );
  const closeStartHere = useCallback(() => {
    lsSet(STORAGE_KEYS.FIRST_RUN_DONE, "1");
    setStartHereState({ open: false, initialBranch: "root", firstRun: false });
  }, []);
  useEffect(() => {
    if (!postImportBanner?.visible || LAST_IMPORT_RESULT_DISMISS_MS <= 0) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setPostImportBanner(null);
    }, LAST_IMPORT_RESULT_DISMISS_MS);

    return () => window.clearTimeout(timeoutId);
  }, [postImportBanner]);
  const previousSecondarySurfaceRef = useRef<SecondarySurfaceId | null>(
    activeSecondarySurface,
  );
  useEffect(() => {
    const previousSecondarySurface = previousSecondarySurfaceRef.current;
    if (
      previousSecondarySurface === "import" &&
      activeSecondarySurface !== "import"
    ) {
      setPostImportBanner((current) =>
        current === null || current.visible
          ? current
          : { ...current, visible: true },
      );
    }
    previousSecondarySurfaceRef.current = activeSecondarySurface;
  }, [activeSecondarySurface]);
  useEffect(() => {
    if (
      !postImportBanner?.visible ||
      matchesWorkspaceRoute(postImportBanner.destination, {
        topTab: activeTopTab,
        subTab: activeSubTab,
      })
    ) {
      return;
    }

    setPostImportBanner(null);
  }, [activeSubTab, activeTopTab, postImportBanner]);
  const handleImportComplete = useCallback(
    (
      result: ImportCompletionResult,
      destinationRecommendation: ImportNextStepRecommendation | null,
    ) => {
      const destination = getPostImportDestination(
        result,
        destinationRecommendation,
      );
      setPostImportBanner({
        result,
        destination,
        nextRecommendation: getPostImportNextRecommendation(
          result,
          destination,
        ),
        visible: false,
      });
    },
    [],
  );
  const dismissPostImportBanner = useCallback(() => {
    setPostImportBanner(null);
  }, []);
  const handlePostImportBannerAction = useCallback(() => {
    if (postImportBanner?.nextRecommendation?.target.kind !== "workspace") {
      return;
    }

    const targetSet = getMostRelevantImportDestinationSet(
      postImportBanner.result,
    );
    if (targetSet) {
      setActiveSet(targetSet);
    }

    beginHandoff({
      reason: postImportBanner.nextRecommendation.rationale,
      returnSecondarySurfaceId: "import",
    });
    setPostImportBanner(null);
    navigateTo(
      postImportBanner.nextRecommendation.target.topTab,
      postImportBanner.nextRecommendation.target.subTab,
      { preserveHandoff: true },
    );
  }, [beginHandoff, navigateTo, postImportBanner, setActiveSet]);
  const {
    toasts: toastStack,
    dismiss: dismissStackToast,
    pushSuccess: setSuccessToast,
    pushWarning: setWarningToast,
    pushError: setErrorToast,
    pushAction: pushActionToast,
    history: notificationHistory,
    clearHistory: clearNotificationHistory,
  } = useToastStack();
  // Listen for PublishPanel's broadcast of how many changes are pending sync
  useEffect(() => {
    const handler = (e: Event) =>
      setPendingPublishCount(
        (e as CustomEvent<{ total: number }>).detail.total,
      );
    window.addEventListener("publish-pending-count", handler);
    return () => window.removeEventListener("publish-pending-count", handler);
  }, []);
  useEffect(() => {
    const handler = (e: Event) =>
      setPublishPreflightState(
        (e as CustomEvent<PublishPreflightState>).detail,
      );
    window.addEventListener("publish-preflight-state", handler);
    return () => window.removeEventListener("publish-preflight-state", handler);
  }, []);
  // Collapse the utilities connection editor once the server is reachable again.
  useEffect(() => {
    if (!connected) return;
    setShowConnectionEditor(false);
    setConnectionConnectResult(null);
  }, [connected]);
  // Wire the alias-not-found toast into EditorContext (setErrorToast is stable)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setAliasNotFoundHandler((p) =>
      setErrorToast(`Alias target not found: ${p}`),
    );
  }, []);
  // Route all dispatchToast() calls from deeply-nested components/hooks into the in-plugin ToastStack
  useToastBusListener(
    setSuccessToast,
    setWarningToast,
    setErrorToast,
    pushActionToast,
  );
  const {
    toastVisible,
    slot: undoSlot,
    canUndo,
    pushUndo,
    executeUndo,
    executeRedo,
    dismissToast,
    canRedo,
    redoSlot,
    undoCount,
    undoDescriptions,
  } = useUndo(undoMaxHistory, setErrorToast);
  // Wire pushUndo into the resolver context so deleteResolver can push undo slots
  useEffect(() => {
    resolverState.setPushUndo(pushUndo);
    return () => {
      resolverState.setPushUndo(undefined);
    };
    // resolverState.setPushUndo is stable (useCallback with no deps); pushUndo is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const onGeneratorError = useCallback(
    ({ generatorId, message }: { generatorId?: string; message: string }) => {
      const label = generatorId
        ? `Generator "${generatorId}" failed`
        : "Generator auto-run failed";
      setErrorToast(`${label}: ${message}`);
    },
    [setErrorToast],
  );
  const onServiceError = useCallback(
    ({ setName, message }: { setName: string; message: string }) => {
      const label = setName ? `Failed to load "${setName}"` : "File load error";
      setErrorToast(`${label}: ${message}`);
    },
    [setErrorToast],
  );
  const onResizeHandleMouseDown = useWindowResize();
  const { isExpanded, toggleExpand } = useWindowExpand();
  const {
    pendingGraphTemplate,
    setPendingGraphTemplate,
    pendingGraphFromGroup,
    setPendingGraphFromGroup,
    focusGeneratorId,
    setFocusGeneratorId,
    pendingOpenPicker,
    setPendingOpenPicker,
  } = useGraphState();
  const [triggerCreateToken, setTriggerCreateToken] = useState(0);
  const [lintKey, setLintKey] = useState(0);
  const lintViolations = useLint(serverUrl, activeSet, connected, lintKey);
  // Tracks the current position for "next issue" cycling — reset when set changes
  const lintIssueIndexRef = useRef(-1);
  useEffect(() => {
    lintIssueIndexRef.current = -1;
  }, [activeSet]);
  const [tokenChangeKey, setTokenChangeKey] = useState(0);
  const refreshAll = useCallback(() => {
    refreshTokens();
    setLintKey((k) => k + 1);
    refreshGenerators();
    setTokenChangeKey((k) => k + 1);
  }, [refreshTokens, refreshGenerators]);
  const staleGeneratorCount = useMemo(
    () => generators.filter((g) => g.isStale).length,
    [generators],
  );
  const activeWorkspaceSummary = useMemo(
    () => resolveWorkspaceSummary(activeTopTab, activeSubTab),
    [activeTopTab, activeSubTab],
  );
  const activeWorkspace = activeWorkspaceSummary.workspace;
  const activeWorkspaceSection = activeWorkspaceSummary.section;
  const activeWorkspaceId = activeWorkspace.id;
  const activeWorkspaceGuide = useMemo(
    () => getWorkspaceWorkflowGuide(activeWorkspaceId),
    [activeWorkspaceId],
  );
  const activeSecondarySurfaceDef = useMemo(
    () => resolveSecondarySurface(activeSecondarySurface),
    [activeSecondarySurface],
  );
  const shellShortcutSurfaces = APP_SHELL_NAVIGATION.secondarySurfaces.filter(
    (surface) => surface.access === "shell-shortcut",
  );
  const shellMenuSurfaces = APP_SHELL_NAVIGATION.secondarySurfaces.filter(
    (surface) => surface.access === "shell-menu",
  );
  const notificationSurface = APP_SHELL_NAVIGATION.secondarySurfaces.find(
    (surface) => surface.access === "attention-bell",
  );
  const themeSetTokenCounts = useMemo(() => {
    const counts: Record<string, number | null> = {};
    for (const setName of sets) {
      counts[setName] = Object.keys(perSetFlat[setName] ?? {}).length;
    }
    return counts;
  }, [perSetFlat, sets]);
  const themeWorkflowSummary = useMemo(
    () =>
      summarizeThemeWorkflow(dimensions, {
        availableSets: sets,
        setTokenCounts: themeSetTokenCounts,
      }),
    [dimensions, sets, themeSetTokenCounts],
  );
  const [themeShellState, setThemeShellState] =
    useState<ThemeWorkspaceShellState>({
      activeView: "authoring",
      authoringMode: "roles",
    });
  const shellCurrentTitle = useMemo(() => {
    if (activeSecondarySurfaceDef)
      return activeSecondarySurfaceDef.summaryTitle;
    if (activeWorkspace.id !== "themes") {
      return activeWorkspaceSummary.currentTitle;
    }
    switch (themeShellState.activeView) {
      case "coverage":
        return "Theme coverage review";
      case "compare":
        return "Theme comparison";
      case "advanced":
        return "Advanced theme logic";
      default:
        return themeShellState.authoringMode === "preview"
          ? "Theme preview"
          : "Theme authoring";
    }
  }, [
    activeSecondarySurfaceDef,
    activeWorkspace.id,
    activeWorkspaceSummary.currentTitle,
    themeShellState.activeView,
    themeShellState.authoringMode,
  ]);
  const shellCurrentLabel = useMemo(() => {
    if (activeSecondarySurfaceDef) {
      return activeSecondarySurfaceDef.label;
    }

    if (activeWorkspace.id !== "themes") {
      return activeWorkspaceSummary.currentLabel;
    }

    return shellCurrentTitle;
  }, [
    activeSecondarySurfaceDef,
    activeWorkspace.id,
    activeWorkspaceSummary.currentLabel,
    shellCurrentTitle,
  ]);
  const shellCurrentDepthLabel = useMemo(() => {
    if (activeSecondarySurfaceDef) {
      return getSurfaceKindLabel(activeSecondarySurfaceDef.transition.kind);
    }

    if (activeWorkspace.id !== "themes") {
      return activeWorkspaceSummary.currentDepthLabel;
    }

    return shellCurrentTitle === activeWorkspaceSummary.workspaceTitle
      ? "Workspace"
      : "Context";
  }, [
    activeSecondarySurfaceDef,
    activeWorkspace.id,
    activeWorkspaceSummary.currentDepthLabel,
    activeWorkspaceSummary.workspaceTitle,
    shellCurrentTitle,
  ]);
  const shellWorkspaceLabel = activeSecondarySurfaceDef
    ? null
    : activeWorkspaceSummary.workspaceLabel;

  // Track external file change refreshes so we can show a diff toast
  const externalRefreshPendingRef = useRef(false);
  const prevAllTokensFlatRef = useRef<Record<string, TokenMapEntry>>({});
  const refreshAllExternal = useCallback(() => {
    prevAllTokensFlatRef.current = allTokensFlat;
    externalRefreshPendingRef.current = true;
    refreshAll();
  }, [refreshAll, allTokensFlat]);
  useServerEvents(
    serverUrl,
    connected,
    onGeneratorError,
    refreshAllExternal,
    onServiceError,
  );

  // Show a change-summary toast after an external file change triggers a refresh
  useEffect(() => {
    if (!externalRefreshPendingRef.current) return;
    externalRefreshPendingRef.current = false;
    const prev = prevAllTokensFlatRef.current;
    const curr = allTokensFlat;
    // Skip if there was no prior state (initial load)
    if (Object.keys(prev).length === 0) return;
    let added = 0,
      removed = 0,
      changed = 0;
    const prevKeys = new Set(Object.keys(prev));
    for (const key of Object.keys(curr)) {
      if (!prevKeys.has(key)) {
        added++;
      } else {
        const p = prev[key],
          c = curr[key];
        if (
          p.$type !== c.$type ||
          JSON.stringify(p.$value) !== JSON.stringify(c.$value)
        )
          changed++;
      }
    }
    for (const key of prevKeys) {
      if (!(key in curr)) removed++;
    }
    const total = added + removed + changed;
    if (total === 0) return;
    const parts: string[] = [];
    if (changed > 0) parts.push(`${changed} updated`);
    if (added > 0) parts.push(`${added} added`);
    if (removed > 0) parts.push(`${removed} removed`);
    setSuccessToast(`External change: ${parts.join(", ")}`);
  }, [allTokensFlat, setSuccessToast]);

  // Server-side operation log for undo/rollback
  const {
    recentOperations,
    total: totalOperations,
    hasMore: hasMoreOperations,
    loadMore: loadMoreOperations,
    handleRollback,
    handleServerRedo,
    canServerRedo,
    serverRedoDescription,
    redoableOpIds,
    redoableItems,
  } = useRecentOperations({
    serverUrl,
    connected,
    lintKey,
    refreshAll,
    setSuccessToast,
    setErrorToast,
  });

  // Keyboard shortcuts for undo (⌘Z) and redo (⌘⇧Z / ⌘Y)
  const serverRedoRef = useRef(handleServerRedo);
  serverRedoRef.current = handleServerRedo;
  const canServerRedoRef = useRef(canServerRedo);
  canServerRedoRef.current = canServerRedo;
  const canRedoRef = useRef(canRedo);
  canRedoRef.current = canRedo;
  const canUndoRef = useRef(canUndo);
  canUndoRef.current = canUndo;
  const executeUndoRef = useRef(executeUndo);
  executeUndoRef.current = executeUndo;
  const executeRedoRef = useRef(executeRedo);
  executeRedoRef.current = executeRedo;
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el?.isContentEditable
      )
        return;
      const isRedo = (e.key === "z" && e.shiftKey) || e.key === "y";
      const isUndo = e.key === "z" && !e.shiftKey;
      if (isRedo) {
        e.preventDefault();
        if (canRedoRef.current) {
          executeRedoRef.current();
        } else if (canServerRedoRef.current) {
          serverRedoRef.current();
        }
      } else if (isUndo && canUndoRef.current) {
        e.preventDefault();
        executeUndoRef.current();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const editorIsDirtyRef = useRef(false);
  // Pending navigation action — set when user tries to navigate away from a dirty editor
  const [pendingNavAction, setPendingNavAction] = useState<(() => void) | null>(
    null,
  );
  const guardEditorAction = useCallback((fn: () => void) => {
    if (editorIsDirtyRef.current) {
      setPendingNavAction(() => fn);
    } else {
      fn();
    }
  }, []);
  const handleEditorClose = useCallback(() => {
    switchContextualSurface({ surface: null });
    refreshAll();
  }, [refreshAll, switchContextualSurface]);
  const handlePreviewEdit = useCallback(() => {
    guardEditorAction(() => {
      if (!previewingToken) return;
      switchContextualSurface({
        surface: "token-editor",
        token: {
          path: previewingToken.path,
          name: previewingToken.name,
          set: previewingToken.set,
        },
      });
    });
  }, [guardEditorAction, previewingToken, switchContextualSurface]);
  const handlePreviewClose = useCallback(() => {
    setPreviewingToken(null);
  }, [setPreviewingToken]);
  const editorCloseRef = useRef<() => void>(() => {
    if (!editorIsDirtyRef.current) handleEditorClose();
  });
  const editingGeneratorData =
    editingGenerator?.mode === "edit"
      ? (generators.find((generator) => generator.id === editingGenerator.id) ??
        null)
      : null;
  useEffect(() => {
    if (
      !editingGenerator ||
      editingGenerator.mode !== "edit" ||
      editingGeneratorData
    ) {
      return;
    }
    setEditingGenerator(null);
  }, [editingGenerator, editingGeneratorData, setEditingGenerator]);
  // Tracks the currently visible/filtered leaf nodes from TokenList — updated by onDisplayedLeafNodesChange
  const displayedLeafNodesRef = useRef<TokenNode[]>([]);
  // Imperative handle to TokenList compare actions — populated by TokenList via compareHandle prop
  const tokenListCompareRef = useRef<TokenListImperativeHandle | null>(null);
  // Imperative handle to ThemeManager — populated by ThemeManager for command palette actions
  const themeManagerHandleRef = useRef<ThemeManagerHandle | null>(null);
  const publishPanelHandleRef = useRef<PublishPanelHandle | null>(null);
  const [themeGapCount, setThemeGapCount] = useState(0);
  // Open compare view within the Tokens tab in 'cross-theme' mode for a specific token
  const handleOpenCrossThemeCompare = useCallback(
    (path: string) => {
      setEditingToken(null);
      setEditingGenerator(null);
      setPreviewingToken(null);
      setTokensCompareMode("cross-theme");
      setTokensComparePath(path);
      setTokensCompareThemeKey((key) => key + 1);
      setShowTokensCompare(true);
      navigateTo("define", "tokens");
    },
    [
      navigateTo,
      setEditingGenerator,
      setEditingToken,
      setPreviewingToken,
      setShowTokensCompare,
      setTokensCompareMode,
      setTokensComparePath,
      setTokensCompareThemeKey,
    ],
  );
  // Navigate the editor to the next (+1) or previous (-1) sibling in the displayed list
  const handleEditorNavigate = useCallback(
    (direction: 1 | -1) => {
      if (!editingToken) return;
      const nodes = displayedLeafNodesRef.current;
      const idx = nodes.findIndex((n) => n.path === editingToken.path);
      if (idx === -1) return;
      const next = nodes[idx + direction];
      if (next) {
        setEditingToken({
          path: next.path,
          name: next.name,
          set: editingToken.set,
        });
        setHighlightedToken(next.path);
      }
    },
    [editingToken, setHighlightedToken, setEditingToken],
  );
  const handleEditorSave = useCallback(
    (savedPath: string) => {
      setHighlightedToken(savedPath);
      setEditingToken(null);
      const affectedGens = generatorsBySource.get(savedPath) ?? [];
      refreshAll();
      if (affectedGens.length > 0) {
        const n = affectedGens.length;
        const genIds = affectedGens.map((g) => g.id);
        pushActionToast(
          `Source token for ${n} ${n === 1 ? "generator" : "generators"} changed`,
          {
            label: "Regenerate",
            onClick: async () => {
              for (const id of genIds) {
                try {
                  await apiFetch(`${serverUrl}/api/generators/${id}/run`, {
                    method: "POST",
                  });
                } catch {
                  /* ignore */
                }
              }
              refreshGenerators();
            },
          },
        );
      }
    },
    [
      refreshAll,
      setHighlightedToken,
      setEditingToken,
      generatorsBySource,
      pushActionToast,
      serverUrl,
      refreshGenerators,
    ],
  );
  const handleEditorSaveAndCreateAnother = useCallback(
    (savedPath: string, savedType: string) => {
      setHighlightedToken(savedPath);
      refreshAll();
      // Derive parent prefix from saved path for sibling creation
      const segments = savedPath.split(".");
      const parentPrefix =
        segments.length > 1 ? segments.slice(0, -1).join(".") + "." : "";
      setEditingToken({
        path: parentPrefix,
        set: activeSet,
        isCreate: true,
        initialType: savedType,
      });
    },
    [refreshAll, setHighlightedToken, setEditingToken, activeSet],
  );
  const handleNavigateToSet = useCallback(
    (targetSet: string, tokenPath: string) => {
      if (targetSet === activeSet) {
        setHighlightedToken(tokenPath);
      } else {
        setPendingHighlightForSet(tokenPath, targetSet);
        setActiveSet(targetSet);
      }
    },
    [activeSet, setHighlightedToken, setPendingHighlightForSet, setActiveSet],
  );
  const handleNavigateToGenerator = useCallback(
    (generatorId: string) => {
      navigateTo("define", "generators");
      setFocusGeneratorId(generatorId);
    },
    [navigateTo, setFocusGeneratorId],
  );
  const { showIssuesOnly, setShowIssuesOnly } = useAnalyticsState();
  const {
    validationIssues,
    validationSummary,
    validationLoading,
    validationError,
    validationLastRefreshed,
    validationIsStale,
    refreshValidation,
  } = useValidationCache({ serverUrl, connected, tokenChangeKey });
  const healthIssueCount = useMemo(
    () =>
      computeHealthIssueCount(lintViolations, generators, validationSummary),
    [lintViolations, generators, validationSummary],
  );
  const [flowPanelInitialPath, setFlowPanelInitialPath] = useState<
    string | null
  >(null);
  // Command palette batch-delete state
  const [tokenListSelection, setTokenListSelection] = useState<string[]>([]);
  const [paletteDeleteConfirm, setPaletteDeleteConfirm] = useState<{
    paths: string[];
    label: string;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [windowWidth, setWindowWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const useSidePanel =
    windowWidth >= CONTEXTUAL_PANEL_MIN_WIDTH &&
    !!(editingToken || editingGeneratorData || previewingToken) &&
    activeSecondarySurface === null &&
    activeTopTab === "define" &&
    activeSubTab === "tokens" &&
    (tokens.length > 0 || createFromEmpty);
  const contextualEditorTransition = useMemo(
    () =>
      useSidePanel
        ? CONTEXTUAL_PANEL_TRANSITIONS.sidePanel
        : CONTEXTUAL_PANEL_TRANSITIONS.bottomDrawer,
    [useSidePanel],
  );

  // Token drag state: set when a drag from the token tree is in progress
  const [tokenDragState, setTokenDragState] = useState<{
    paths: string[];
    fromSet: string;
  } | null>(null);

  // Move tokens to a different set after a drag-drop on a set tab
  const handleTokenDropOnSet = useCallback(
    async (targetSet: string) => {
      if (!tokenDragState) return;
      const { paths, fromSet } = tokenDragState;
      setTokenDragState(null);
      try {
        if (paths.length === 1) {
          await apiFetch(
            `${serverUrl}/api/tokens/${encodeURIComponent(fromSet)}/tokens/move`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ tokenPath: paths[0], targetSet }),
            },
          );
        } else {
          await apiFetch(
            `${serverUrl}/api/tokens/${encodeURIComponent(fromSet)}/batch-move`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ paths, targetSet }),
            },
          );
        }
        refreshTokens();
        setSuccessToast(
          paths.length === 1
            ? `Moved "${paths[0]}" to "${targetSet}"`
            : `Moved ${paths.length} tokens to "${targetSet}"`,
        );
      } catch (err) {
        setErrorToast(
          err instanceof ApiError ? err.message : "Move failed: network error",
        );
      }
    },
    [tokenDragState, serverUrl, refreshTokens, setSuccessToast, setErrorToast],
  );

  // Lightweight set switcher bar: overflow handling, token-drop targets, and manager reorder helpers.
  const {
    dragOverSetName,
    setTabsScrollRef,
    setTabsOverflow,
    cascadeDiff,
    handleSetDragOver,
    handleSetDragLeave,
    handleSetDrop,
    handleReorderSet,
    handleReorderSetFull,
    scrollSetTabs,
  } = useSetTabs({
    serverUrl,
    sets,
    setSets,
    activeSet,
    refreshTokens,
    setSuccessToast,
    tokenDragFromSet: tokenDragState?.fromSet ?? null,
    onTokenDropOnSet: handleTokenDropOnSet,
  });

  // Group sync + scope state
  const {
    syncGroupPending,
    setSyncGroupPending,
    syncGroupApplying,
    syncGroupProgress,
    syncGroupStylesPending,
    setSyncGroupStylesPending,
    syncGroupStylesApplying,
    syncGroupStylesProgress,
    groupScopesPath,
    setGroupScopesPath,
    groupScopesSelected,
    setGroupScopesSelected,
    groupScopesApplying,
    groupScopesError,
    setGroupScopesError,
    groupScopesProgress,
    handleSyncGroup,
    handleSyncGroupStyles,
    syncGroupStylesError,
    syncGroupError,
    handleApplyGroupScopes,
  } = useFigmaSync(
    serverUrl,
    connected,
    pathToSet,
    setCollectionNames,
    setModeNames,
    activeSet,
  );

  useEffect(() => {
    if (syncGroupStylesError) setErrorToast(syncGroupStylesError);
  }, [syncGroupStylesError, setErrorToast]);

  useEffect(() => {
    if (syncGroupError) setErrorToast(syncGroupError);
  }, [syncGroupError, setErrorToast]);

  // Set management hooks
  const {
    editingMetadataSet,
    metadataDescription,
    setMetadataDescription,
    metadataCollectionName,
    setMetadataCollectionName,
    metadataModeName,
    setMetadataModeName,
    closeSetMetadata,
    openSetMetadata,
    handleSaveMetadata,
  } = useSetMetadata({
    serverUrl,
    connected,
    setDescriptions,
    setCollectionNames,
    setModeNames,
    updateSetMetadataInState,
    onError: setErrorToast,
  });
  const { deletingSet, startDelete, cancelDelete, handleDeleteSet } =
    useSetDelete({
      serverUrl,
      connected,
      getDisconnectSignal,
      sets,
      activeSet,
      setActiveSet,
      removeSetFromState,
      fetchTokensForSet,
      refreshTokens,
      setSuccessToast,
      setErrorToast,
      markDisconnected,
      onPushUndo: pushUndo,
    });
  const {
    renamingSet,
    renameValue,
    setRenameValue,
    renameError,
    setRenameError,
    renameInputRef,
    startRename,
    cancelRename,
    handleRenameConfirm,
  } = useSetRename({
    serverUrl,
    connected,
    getDisconnectSignal,
    activeSet,
    setActiveSet,
    renameSetInState,
    setSuccessToast,
    markDisconnected,
    onPushUndo: pushUndo,
  });
  const { handleDuplicateSet } = useSetDuplicate({
    serverUrl,
    connected,
    getDisconnectSignal,
    sets,
    tokenCounts: setTokenCounts,
    addSetToState,
    refreshTokens,
    setSuccessToast,
    setErrorToast,
    markDisconnected,
    pushUndo,
  });
  const {
    mergingSet,
    mergeTargetSet,
    mergeConflicts,
    mergeResolutions,
    mergeChecked,
    mergeLoading,
    openMergeDialog,
    closeMergeDialog,
    changeMergeTarget,
    setMergeResolutions,
    handleCheckMergeConflicts,
    handleConfirmMerge,
    splittingSet,
    splitPreview,
    splitDeleteOriginal,
    splitLoading,
    openSplitDialog,
    closeSplitDialog,
    setSplitDeleteOriginal,
    handleConfirmSplit,
  } = useSetMergeSplit({
    serverUrl,
    connected,
    sets,
    activeSet,
    setActiveSet,
    refreshTokens,
    setSuccessToast,
    setErrorToast,
    pushUndo,
  });

  // Create set by name — owned by the set manager surface.
  const createSetByName = useCallback(
    async (name: string) => {
      await apiFetch(`${serverUrl}/api/sets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
        signal: AbortSignal.any([
          AbortSignal.timeout(5000),
          getDisconnectSignal(),
        ]),
      });
      addSetToState(name, 0);
      setSuccessToast(`Created set "${name}"`);
    },
    [serverUrl, getDisconnectSignal, addSetToState, setSuccessToast],
  );

  // Bulk delete sets — owned by the set manager surface.
  const handleBulkDeleteSets = useCallback(
    async (setsToDelete: string[]) => {
      let currentActive = activeSet;
      const currentSets = sets;
      for (const setName of setsToDelete) {
        await apiFetch(`${serverUrl}/api/sets/${encodeURIComponent(setName)}`, {
          method: "DELETE",
          signal: AbortSignal.any([
            AbortSignal.timeout(5000),
            getDisconnectSignal(),
          ]),
        });
        removeSetFromState(setName);
        if (currentActive === setName) {
          const remaining = currentSets.filter(
            (s) => !setsToDelete.includes(s),
          );
          const newActive = remaining[0] ?? "";
          currentActive = newActive;
          setActiveSet(newActive);
          if (newActive) await fetchTokensForSet(newActive);
        }
      }
      setSuccessToast(
        `Deleted ${setsToDelete.length} set${setsToDelete.length !== 1 ? "s" : ""}`,
      );
    },
    [
      serverUrl,
      sets,
      activeSet,
      setActiveSet,
      removeSetFromState,
      fetchTokensForSet,
      setSuccessToast,
      getDisconnectSignal,
    ],
  );

  // Bulk duplicate sets — owned by the set manager surface.
  const handleBulkDuplicateSets = useCallback(
    async (setsToDuplicate: string[]) => {
      for (const setName of setsToDuplicate) {
        const result = await apiFetch<{
          ok: true;
          name: string;
          originalName: string;
        }>(`${serverUrl}/api/sets/${encodeURIComponent(setName)}/duplicate`, {
          method: "POST",
          signal: AbortSignal.any([
            AbortSignal.timeout(5000),
            getDisconnectSignal(),
          ]),
        });
        addSetToState(result.name, setTokenCounts[setName] ?? 0);
      }
      setSuccessToast(
        `Duplicated ${setsToDuplicate.length} set${setsToDuplicate.length !== 1 ? "s" : ""}`,
      );
    },
    [
      serverUrl,
      addSetToState,
      setTokenCounts,
      setSuccessToast,
      getDisconnectSignal,
    ],
  );

  // Bulk move sets to folder — owned by the set manager surface.
  const handleBulkMoveToFolder = useCallback(
    async (moves: Array<{ from: string; to: string }>) => {
      for (const { from, to } of moves) {
        await apiFetch(
          `${serverUrl}/api/sets/${encodeURIComponent(from)}/rename`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ newName: to }),
            signal: AbortSignal.any([
              AbortSignal.timeout(5000),
              getDisconnectSignal(),
            ]),
          },
        );
        renameSetInState(from, to);
        if (activeSet === from) setActiveSet(to);
      }
      setSuccessToast(
        `Moved ${moves.length} set${moves.length !== 1 ? "s" : ""} to folder`,
      );
    },
    [
      serverUrl,
      activeSet,
      setActiveSet,
      renameSetInState,
      setSuccessToast,
      getDisconnectSignal,
    ],
  );

  // Per-set type breakdown for tab tooltips
  const setByTypeCounts = useMemo(() => {
    const result: Record<string, Record<string, number>> = {};
    for (const [setName, flatMap] of Object.entries(perSetFlat)) {
      const byType: Record<string, number> = {};
      for (const entry of Object.values(flatMap)) {
        const t = (entry as { $type?: string }).$type || "unknown";
        byType[t] = (byType[t] || 0) + 1;
      }
      result[setName] = byType;
    }
    return result;
  }, [perSetFlat]);

  // Catch-all: warn in the console when the plugin sandbox sends a message type that
  // is not in the ControllerMessage union. This fires during development and helps
  // catch missing type definitions or misspelled message types before they become
  // silent data-loss bugs.
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data?.pluginMessage;
      if (!msg || typeof msg.type !== "string") return;
      if (!KNOWN_CONTROLLER_MESSAGE_TYPES.has(msg.type)) {
        console.warn(
          `[plugin] Unhandled controller message type: "${msg.type}"`,
          msg,
        );
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  useEffect(() => {
    if (
      activeTopTab === "define" &&
      activeSubTab === "tokens" &&
      tokens.length > 0
    ) {
      triggerUsageScan();
    }
  }, [activeTopTab, activeSubTab, tokens.length, triggerUsageScan]);

  // Utilities menu: autofocus the first item, support arrow-key navigation,
  // and close when clicking outside the menu.
  useEffect(() => {
    if (!menuOpen) return;
    const frame = requestAnimationFrame(() => {
      if (menuRef.current) getMenuItems(menuRef.current)[0]?.focus();
    });
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        return;
      }
      if (menuRef.current) handleMenuArrowKeys(e, menuRef.current);
    };
    const handlePointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [menuOpen]);

  const openSecondaryPanel = useCallback(
    (panel: SecondarySurfaceId) => {
      dismissEphemeralOverlays();
      if (panel === "import") {
        setPostImportBanner(null);
      }
      clearHandoff();
      openSecondarySurface(panel);
    },
    [clearHandoff, dismissEphemeralOverlays, openSecondarySurface],
  );
  const openSettingsHelpPanel = useCallback(
    (panel: Extract<SecondarySurfaceId, "shortcuts">) => {
      dismissEphemeralOverlays();
      beginHandoff({
        reason:
          "Review the keyboard reference, then jump back into settings if you still need to adjust preferences or recovery tools.",
        returnLabel: "Back to Settings",
        returnSecondarySurfaceId: "settings",
      });
      openSecondarySurface(panel);
    },
    [beginHandoff, dismissEphemeralOverlays, openSecondarySurface],
  );
  const toggleSecondarySurface = useCallback(
    (panel: SecondarySurfaceId) => {
      guardEditorAction(() => {
        if (activeSecondarySurface === panel) {
          closeSecondarySurface();
          return;
        }
        openSecondaryPanel(panel);
      });
    },
    [
      activeSecondarySurface,
      closeSecondarySurface,
      guardEditorAction,
      openSecondaryPanel,
    ],
  );

  // Keyboard shortcuts — use a stable callback ref so the effect never
  // re-registers the listener yet always calls the latest handler.
  const keyboardShortcutRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyboardShortcutRef.current = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      (e.target as HTMLElement)?.isContentEditable
    )
      return;
    if (matchesShortcut(e, "PASTE_TOKENS")) {
      e.preventDefault();
      setShowPasteModal(true);
    }
    if (matchesShortcut(e, "OPEN_PALETTE")) {
      e.preventDefault();
      setCommandPaletteInitialQuery("");
      setShowCommandPalette((v) => !v);
    }
    if (matchesShortcut(e, "OPEN_TOKEN_SEARCH")) {
      e.preventDefault();
      setCommandPaletteInitialQuery(">");
      setShowCommandPalette((v) => !v);
    }
    if (matchesShortcut(e, "TOGGLE_PREVIEW")) {
      e.preventDefault();
      setShowPreviewSplit((v) => !v);
      closeSecondarySurface();
    }
    if (matchesShortcut(e, "CREATE_FROM_SELECTION")) {
      e.preventDefault();
      dismissEphemeralOverlays();
      navigateTo("apply", "inspect");
      setTriggerCreateToken((n) => n + 1);
    }
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === "n") {
      e.preventDefault();
      dismissEphemeralOverlays();
      navigateTo("define", "tokens");
      setEditingToken({ path: "", set: activeSet, isCreate: true });
    }
    if (matchesShortcut(e, "GO_TO_DEFINE")) {
      e.preventDefault();
      dismissEphemeralOverlays();
      navigateTo("define", "tokens");
    }
    if (matchesShortcut(e, "GO_TO_APPLY")) {
      e.preventDefault();
      dismissEphemeralOverlays();
      navigateTo("apply", "inspect");
    }
    if (matchesShortcut(e, "GO_TO_SHIP")) {
      e.preventDefault();
      dismissEphemeralOverlays();
      navigateTo("ship", "publish");
    }
    if (matchesShortcut(e, "TOGGLE_QUICK_APPLY")) {
      e.preventDefault();
      setShowQuickApply((v) => !v);
    }
    if (matchesShortcut(e, "QUICK_SWITCH_SET")) {
      e.preventDefault();
      setShowSetSwitcher((v) => !v);
    }
    if (matchesShortcut(e, "GO_TO_RESOLVER")) {
      e.preventDefault();
      dismissEphemeralOverlays();
      navigateTo("define", "themes");
      setTimeout(() => {
        themeManagerHandleRef.current?.switchToResolverMode();
      }, 50);
    }
    if (matchesShortcut(e, "SHOW_SHORTCUTS")) {
      e.preventDefault();
      if (activeSecondarySurface === "shortcuts") {
        closeSecondarySurface();
      } else {
        openSecondaryPanel("shortcuts");
      }
    }
    if (matchesShortcut(e, "OPEN_SETTINGS")) {
      e.preventDefault();
      openSecondaryPanel("settings");
    }
    if (matchesShortcut(e, "NEXT_LINT_ISSUE")) {
      e.preventDefault();
      jumpToNextIssue();
    }
    if (matchesShortcut(e, "EXPORT_WITH_PRESET")) {
      e.preventDefault();
      // Open command palette pre-filtered to export preset commands
      setCommandPaletteInitialQuery("Export with preset");
      setShowCommandPalette(true);
    }
  };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => keyboardShortcutRef.current(e);
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const jumpToNextIssue = useCallback(() => {
    if (lintViolations.length === 0) {
      setErrorToast("No validation issues in the current set");
      return;
    }
    lintIssueIndexRef.current =
      (lintIssueIndexRef.current + 1) % lintViolations.length;
    const violation = lintViolations[lintIssueIndexRef.current];
    navigateTo("define", "tokens");
    setEditingToken(null);
    setHighlightedToken(violation.path);
    const n = lintIssueIndexRef.current + 1;
    const total = lintViolations.length;
    const icon =
      violation.severity === "error"
        ? "✗"
        : violation.severity === "warning"
          ? "⚠"
          : "ℹ";
    setSuccessToast(`${icon} Issue ${n}/${total}: ${violation.message}`);
  }, [
    lintViolations,
    navigateTo,
    setEditingToken,
    setHighlightedToken,
    setErrorToast,
    setSuccessToast,
  ]);

  const handlePaletteDeleteConfirm = useCallback(async () => {
    if (!paletteDeleteConfirm) return;
    const { paths } = paletteDeleteConfirm;
    setPaletteDeleteConfirm(null);
    const snapshot: Record<string, { $type: string; $value: unknown }> = {};
    for (const p of paths) {
      const entry = allTokensFlat[p];
      if (entry) snapshot[p] = { $type: entry.$type, $value: entry.$value };
    }
    try {
      await apiFetch(
        `${serverUrl}/api/tokens/${encodeURIComponent(activeSet)}/batch-delete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paths }),
        },
      );
      setTokenListSelection([]);
      pushUndo({
        description:
          paths.length === 1
            ? `Delete "${paths[0]}"`
            : `Delete ${paths.length} tokens`,
        restore: async () => {
          for (const [path, token] of Object.entries(snapshot)) {
            await apiFetch(
              `${serverUrl}/api/tokens/${encodeURIComponent(activeSet)}`,
              {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  path,
                  value: token.$value,
                  type: token.$type,
                }),
              },
            );
          }
          refreshAll();
        },
        redo: async () => {
          await apiFetch(
            `${serverUrl}/api/tokens/${encodeURIComponent(activeSet)}/batch-delete`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ paths }),
            },
          );
          refreshAll();
        },
      });
      refreshAll();
      setSuccessToast(
        `Deleted ${paths.length} token${paths.length !== 1 ? "s" : ""}`,
      );
    } catch (err) {
      console.warn("[App] palette delete failed:", err);
      setErrorToast("Delete failed — check server connection");
    }
  }, [
    paletteDeleteConfirm,
    allTokensFlat,
    serverUrl,
    activeSet,
    pushUndo,
    refreshAll,
    setSuccessToast,
    setErrorToast,
  ]);

  // Duplicate a token from the command palette (shared between contextual command and token search button)
  const handlePaletteDuplicate = useCallback(
    async (path: string) => {
      const entry = allTokensFlat[path];
      if (!entry || !connected) return;
      const tokenNode = findLeafByPath(tokens, path);
      const targetSet = pathToSet[path] ?? activeSet;
      const baseCopy = `${path}-copy`;
      let newPath = baseCopy;
      let i = 2;
      while (allTokensFlat[newPath]) {
        newPath = `${baseCopy}-${i++}`;
      }
      try {
        const body: Record<string, unknown> = {
          $type: entry.$type,
          $value: entry.$value,
        };
        if (tokenNode?.$description) body.$description = tokenNode.$description;
        if (tokenNode?.$extensions) body.$extensions = tokenNode.$extensions;
        await apiFetch(
          `${serverUrl}/api/tokens/${encodeURIComponent(targetSet)}/${tokenPathToUrlSegment(newPath)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
        );
        await refreshTokens();
        navigateTo("define", "tokens");
        if (targetSet !== activeSet) {
          setActiveSet(targetSet);
          setPendingHighlight(newPath);
        } else {
          setHighlightedToken(newPath);
        }
      } catch (err) {
        console.warn("[App] duplicate token from palette failed:", err);
      }
    },
    [
      allTokensFlat,
      connected,
      tokens,
      pathToSet,
      activeSet,
      serverUrl,
      navigateTo,
      refreshTokens,
      setActiveSet,
      setPendingHighlight,
      setHighlightedToken,
    ],
  );

  // Navigate to a token and trigger inline rename mode
  const handlePaletteRename = useCallback(
    (path: string) => {
      const targetSet = pathToSet[path];
      navigateTo("define", "tokens");
      setEditingToken(null);
      if (targetSet && targetSet !== activeSet) {
        setActiveSet(targetSet);
        setPendingHighlight(path);
      } else {
        setHighlightedToken(path);
        tokenListCompareRef.current?.triggerInlineRename(path);
      }
    },
    [
      pathToSet,
      activeSet,
      navigateTo,
      setEditingToken,
      setActiveSet,
      setPendingHighlight,
      setHighlightedToken,
    ],
  );

  // Trigger the move-to-set dialog for a token
  const handlePaletteMove = useCallback(
    (path: string) => {
      const targetSet = pathToSet[path];
      navigateTo("define", "tokens");
      setEditingToken(null);
      if (targetSet && targetSet !== activeSet) {
        setActiveSet(targetSet);
        setPendingHighlight(path);
      } else {
        setHighlightedToken(path);
        tokenListCompareRef.current?.triggerMoveToken(path);
      }
    },
    [
      pathToSet,
      activeSet,
      navigateTo,
      setEditingToken,
      setActiveSet,
      setPendingHighlight,
      setHighlightedToken,
    ],
  );

  // Trigger delete confirm for a single token from the token search row
  const handlePaletteDeleteToken = useCallback((path: string) => {
    setPaletteDeleteConfirm({ paths: [path], label: `Delete "${path}"?` });
  }, []);

  const workspaceControllers = {
    shell: {
      showPreviewSplit,
      setShowPreviewSplit,
      openCommandPaletteWithQuery: (query: string) => {
        setCommandPaletteInitialQuery(">" + (query ? ` ${query}` : ""));
        setShowCommandPalette(true);
      },
      openPasteModal: () => setShowPasteModal(true),
      openImportPanel: () => openSecondaryPanel("import"),
      openShortcutsPanelFromSettings: () => openSettingsHelpPanel("shortcuts"),
      openColorScaleGenerator: () => setShowColorScaleGen(true),
      toggleQuickApply: () => setShowQuickApply((visible) => !visible),
      toggleSetSwitcher: () => setShowSetSwitcher((visible) => !visible),
      openStartHere: (branch?: StartHereBranch) => openStartHere(branch),
      restartGuidedSetup: () => {
        closeSecondarySurface();
        openStartHere("guided-setup");
      },
      handleClearAllComplete: () => {
        closeSecondarySurface();
        navigateTo("define", "tokens");
        refreshTokens();
        openStartHere("guided-setup", true);
      },
      handleImportComplete,
      notificationHistory,
      clearNotificationHistory,
    },
    editor: {
      useSidePanel,
      contextualEditorTransition,
      splitPreviewTransition: CONTEXTUAL_PANEL_TRANSITIONS.splitPreview,
      guardEditorAction,
      editorIsDirtyRef,
      editorCloseRef,
      displayedLeafNodesRef,
      tokenListCompareRef,
      handleEditorNavigate,
      handleEditorSave,
      handleEditorSaveAndCreateAnother,
      handlePreviewEdit,
      handlePreviewClose,
      splitRatio,
      splitValueNow,
      splitContainerRef,
      handleSplitDragStart,
      handleSplitKeyDown,
      availableFonts,
      fontWeightsByFamily,
    },
    tokens: {
      showIssuesOnly,
      setShowIssuesOnly,
      lintViolations,
      jumpToNextIssue,
      cascadeDiff: cascadeDiff ?? null,
      refreshAll,
      pushUndo,
      setErrorToast,
      setSuccessToast,
      handleNavigateToSet,
      handleNavigateToGenerator,
      flowPanelInitialPath,
      setFlowPanelInitialPath,
      pendingGraphTemplate,
      setPendingGraphTemplate,
      pendingGraphFromGroup,
      setPendingGraphFromGroup,
      focusGeneratorId,
      setFocusGeneratorId,
      pendingOpenPicker,
      setPendingOpenPicker,
      tokenListCompareRef,
      tokenListSelection,
      onTokenDragStart: (paths: string[], fromSet: string) =>
        setTokenDragState({ paths, fromSet }),
      onTokenDragEnd: () => setTokenDragState(null),
      recentlyTouched,
      starredTokens,
      handleOpenCrossThemeCompare,
      handlePaletteDuplicate,
      handlePaletteRename,
      handlePaletteMove,
      requestPaletteDelete: (paths: string[], label: string) =>
        setPaletteDeleteConfirm({ paths, label }),
      handlePaletteDeleteToken,
    },
    themes: {
      themeManagerHandleRef,
      themeGapCount,
      setThemeGapCount,
      onThemeShellStateChange: setThemeShellState,
    },
    apply: {
      triggerCreateToken,
    },
    ship: {
      validationIssues,
      validationSummary,
      validationLoading,
      validationError,
      validationLastRefreshed,
      validationIsStale,
      refreshValidation,
      recentOperations,
      totalOperations,
      hasMoreOperations,
      loadMoreOperations,
      handleRollback,
      redoableItems,
      handleServerRedo,
      undoDescriptions,
      redoableOpIds,
      executeUndo,
      canUndo,
      canRedo,
      redoSlot,
      executeRedo,
      setSyncGroupPending,
      setSyncGroupStylesPending,
      setGroupScopesPath,
      setGroupScopesSelected,
      setGroupScopesError,
      tokenChangeKey,
      publishPanelHandleRef,
    },
    setManager: {
      onOpenQuickSwitch: () => {
        closeSecondarySurface();
        setShowSetSwitcher(true);
      },
      onOpenGenerators: (set: string) => {
        guardEditorAction(() => {
          setActiveSet(set);
          navigateTo("define", "generators");
          closeSecondarySurface();
        });
      },
      onRename: startRename,
      onDuplicate: handleDuplicateSet,
      onDelete: startDelete,
      onReorder: handleReorderSet,
      onReorderFull: handleReorderSetFull,
      onCreateSet: createSetByName,
      onEditInfo: (set: string) => {
        closeSecondarySurface();
        openSetMetadata(set);
      },
      onMerge: sets.length > 1 ? openMergeDialog : undefined,
      onSplit: openSplitDialog,
      onBulkDelete: handleBulkDeleteSets,
      onBulkDuplicate: handleBulkDuplicateSets,
      onBulkMoveToFolder: handleBulkMoveToFolder,
      renamingSet,
      renameValue,
      setRenameValue,
      renameError,
      setRenameError,
      renameInputRef,
      onRenameConfirm: handleRenameConfirm,
      onRenameCancel: cancelRename,
      editingMetadataSet,
      metadataDescription,
      setMetadataDescription,
      metadataCollectionName,
      setMetadataCollectionName,
      metadataModeName,
      setMetadataModeName,
      onMetadataClose: closeSetMetadata,
      onMetadataSave: handleSaveMetadata,
      deletingSet,
      onDeleteConfirm: handleDeleteSet,
      onDeleteCancel: cancelDelete,
      mergingSet,
      mergeTargetSet,
      mergeConflicts,
      mergeResolutions,
      mergeChecked,
      mergeLoading,
      onMergeTargetChange: changeMergeTarget,
      setMergeResolutions,
      onMergeCheckConflicts: handleCheckMergeConflicts,
      onMergeConfirm: handleConfirmMerge,
      onMergeClose: closeMergeDialog,
      splittingSet,
      splitPreview: splitPreview ?? [],
      splitDeleteOriginal,
      splitLoading,
      setSplitDeleteOriginal,
      onSplitConfirm: handleConfirmSplit,
      onSplitClose: closeSplitDialog,
    },
  };

  const workspacePills = useMemo(() => {
    const pills: Array<{
      label: string;
      tone: NoticeSeverity;
    }> = [];
    if (checking) {
      pills.push({ label: "Server checking…", tone: "info" });
    } else if (!connected) {
      pills.push({ label: "Server offline", tone: "error" });
    }
    switch (activeWorkspace.id) {
      case "tokens":
        pills.push({
          label: `${sets.length} set${sets.length === 1 ? "" : "s"}`,
          tone: "info",
        });
        if (lintViolations.length > 0)
          pills.push({
            label: `${lintViolations.length} issue${lintViolations.length === 1 ? "" : "s"}`,
            tone: "warning",
          });
        if (staleGeneratorCount > 0)
          pills.push({
            label: `${staleGeneratorCount} stale generator${staleGeneratorCount === 1 ? "" : "s"}`,
            tone: "stale",
          });
        break;
      case "themes":
        pills.push({
          label: `${dimensions.length} dimension${dimensions.length === 1 ? "" : "s"}`,
          tone: "info",
        });
        if (themeGapCount > 0)
          pills.push({
            label: `${themeGapCount} gap${themeGapCount === 1 ? "" : "s"}`,
            tone: "warning",
          });
        if (
          themeShellState.activeView === "authoring" &&
          themeShellState.authoringMode === "preview"
        ) {
          pills.push({ label: "Preview stage", tone: "info" });
        }
        if (themeShellState.activeView === "coverage")
          pills.push({ label: "Coverage review", tone: "info" });
        if (themeShellState.activeView === "compare")
          pills.push({ label: "Compare mode", tone: "info" });
        if (themeShellState.activeView === "advanced")
          pills.push({ label: "Resolver mode", tone: "info" });
        break;
      case "apply":
        pills.push({
          label: `${selectedNodes.length} layer${selectedNodes.length === 1 ? "" : "s"} selected`,
          tone: "info",
        });
        if (deepInspect) {
          pills.push({ label: "Deep inspect on", tone: "info" });
        }
        if (propFilter !== "" || propFilterMode !== "all") {
          const activeFilterCount =
            Number(propFilter !== "") + Number(propFilterMode !== "all");
          pills.push({
            label:
              activeFilterCount === 1
                ? "1 filter active"
                : `${activeFilterCount} filters active`,
            tone: "info",
          });
        }
        break;
      case "sync":
        if (activeWorkspaceSection?.id === "publish") {
          if (publishPreflightState.stage === "running") {
            pills.push({ label: "Preflight running", tone: "info" });
          } else if (
            publishPreflightState.isOutdated ||
            publishPreflightState.stage === "idle"
          ) {
            pills.push({ label: "Run preflight", tone: "info" });
          } else if (publishPreflightState.stage === "blocked") {
            pills.push({
              label: `${publishPreflightState.blockingCount} blocking cluster${publishPreflightState.blockingCount === 1 ? "" : "s"}`,
              tone: "error",
            });
          } else if (publishPreflightState.stage === "advisory") {
            pills.push({
              label: `${publishPreflightState.advisoryCount} advisory cluster${publishPreflightState.advisoryCount === 1 ? "" : "s"}`,
              tone: "warning",
            });
          } else {
            pills.push({ label: "Preflight ready", tone: "success" });
          }

          if (publishPreflightState.canProceed && pendingPublishCount > 0) {
            pills.push({
              label: `${pendingPublishCount} Figma change${pendingPublishCount === 1 ? "" : "s"} pending`,
              tone: "info",
            });
          } else if (publishPreflightState.canProceed) {
            pills.push({ label: "No Figma changes pending", tone: "success" });
          }
        } else if (activeWorkspaceSection?.id === "export") {
          pills.push({ label: "Repo / handoff tools", tone: "info" });
        }
        break;
      case "audit":
        if (validationLoading) {
          pills.push({ label: "Auditing…", tone: "info" });
        } else if (validationSummary === null) {
          pills.push({ label: "Run audit", tone: "info" });
        } else if (healthIssueCount > 0) {
          pills.push({
            label: `${healthIssueCount} audit issue${healthIssueCount === 1 ? "" : "s"}`,
            tone: "warning",
          });
        }
        if (undoDescriptions.length > 0)
          pills.push({
            label: `${undoDescriptions.length} undo step${undoDescriptions.length === 1 ? "" : "s"}`,
            tone: "info",
          });
        if (
          validationSummary !== null &&
          healthIssueCount === 0 &&
          undoDescriptions.length === 0
        )
          pills.push({ label: "No active alerts", tone: "success" });
        break;
    }
    return pills;
  }, [
    activeWorkspace.id,
    activeWorkspaceSection?.id,
    selectedNodes.length,
    checking,
    connected,
    deepInspect,
    dimensions.length,
    healthIssueCount,
    lintViolations.length,
    propFilter,
    propFilterMode,
    pendingPublishCount,
    publishPreflightState.advisoryCount,
    publishPreflightState.blockingCount,
    publishPreflightState.canProceed,
    publishPreflightState.isOutdated,
    publishPreflightState.stage,
    sets.length,
    staleGeneratorCount,
    themeGapCount,
    themeShellState.activeView,
    themeShellState.authoringMode,
    undoDescriptions.length,
    validationLoading,
    validationSummary,
  ]);

  const handleSelectThemeStage = useCallback(
    (stage: ThemeAuthoringStage) => {
      guardEditorAction(() => {
        navigateTo("define", "themes");
        closeSecondarySurface();
        themeManagerHandleRef.current?.focusStage(stage);
      });
    },
    [closeSecondarySurface, guardEditorAction, navigateTo],
  );

  const themeContextualControls = useMemo(() => {
    if (activeSecondarySurface !== null || activeWorkspace.id !== "themes")
      return null;

    const stages = [
      {
        id: "axes" as const,
        step: 1,
        label: "Axes",
        detail:
          themeWorkflowSummary.axisCount === 0
            ? "Start by creating the first axis"
            : `${themeWorkflowSummary.axisCount} axis${themeWorkflowSummary.axisCount === 1 ? "" : "es"} defined`,
        tone:
          themeWorkflowSummary.axisCount === 0
            ? "current"
            : themeWorkflowSummary.currentStage === "axes"
              ? "current"
              : "complete",
      },
      {
        id: "options" as const,
        step: 2,
        label: "Options",
        detail:
          themeWorkflowSummary.axisCount === 0
            ? "Create an axis first"
            : themeWorkflowSummary.axesMissingOptionsCount > 0
              ? `${themeWorkflowSummary.axesMissingOptionsCount} axis${themeWorkflowSummary.axesMissingOptionsCount === 1 ? "" : "es"} still need options`
              : `${themeWorkflowSummary.optionCount} option${themeWorkflowSummary.optionCount === 1 ? "" : "s"} ready`,
        tone:
          themeWorkflowSummary.axisCount === 0
            ? "blocked"
            : themeWorkflowSummary.currentStage === "options"
              ? "current"
              : themeWorkflowSummary.axesMissingOptionsCount === 0 &&
                  themeWorkflowSummary.optionCount > 0
                ? "complete"
                : "pending",
        disabled: themeWorkflowSummary.axisCount === 0,
      },
      {
        id: "set-roles" as const,
        step: 3,
        label: "Set roles",
        detail:
          themeWorkflowSummary.optionCount === 0
            ? "Add options before mapping sets"
            : themeWorkflowSummary.unmappedOptionCount > 0
              ? themeWorkflowSummary.nextSetRoleTarget
                ? `${themeWorkflowSummary.unmappedOptionCount} option${themeWorkflowSummary.unmappedOptionCount === 1 ? "" : "s"} still need base or override sets. Start with ${themeWorkflowSummary.nextSetRoleTarget.dimensionName} -> ${themeWorkflowSummary.nextSetRoleTarget.optionName}.`
                : `${themeWorkflowSummary.unmappedOptionCount} option${themeWorkflowSummary.unmappedOptionCount === 1 ? "" : "s"} still need base or override sets`
              : themeWorkflowSummary.mappedOptionWithAssignmentIssuesCount > 0
                ? themeWorkflowSummary.nextSetRoleTarget
                  ? `${themeWorkflowSummary.mappedOptionWithAssignmentIssuesCount} mapped option${themeWorkflowSummary.mappedOptionWithAssignmentIssuesCount === 1 ? "" : "s"} still need stale or empty assignments fixed. Start with ${themeWorkflowSummary.nextSetRoleTarget.dimensionName} -> ${themeWorkflowSummary.nextSetRoleTarget.optionName}.`
                  : `${themeWorkflowSummary.mappedOptionWithAssignmentIssuesCount} mapped option${themeWorkflowSummary.mappedOptionWithAssignmentIssuesCount === 1 ? "" : "s"} still need stale or empty assignments fixed`
                : `${themeWorkflowSummary.mappedSetCount} role assignment${themeWorkflowSummary.mappedSetCount === 1 ? "" : "s"} in place`,
        tone:
          themeWorkflowSummary.optionCount === 0
            ? "blocked"
            : themeWorkflowSummary.currentStage === "set-roles"
              ? "current"
              : themeWorkflowSummary.unmappedOptionCount === 0 &&
                  themeWorkflowSummary.mappedOptionWithAssignmentIssuesCount ===
                    0
                ? "complete"
                : "pending",
        disabled: themeWorkflowSummary.optionCount === 0,
      },
      {
        id: "preview" as const,
        step: 4,
        label: "Preview",
        detail: !themeWorkflowSummary.previewReady
          ? "Assign sets before previewing"
          : themeShellState.activeView === "authoring" &&
              themeShellState.authoringMode === "preview"
            ? "Preview stage is active"
            : "Review the resolved combination",
        tone: !themeWorkflowSummary.previewReady
          ? "blocked"
          : themeWorkflowSummary.currentStage === "preview" ||
              (themeShellState.activeView === "authoring" &&
                themeShellState.authoringMode === "preview")
            ? "current"
            : "pending",
        disabled: !themeWorkflowSummary.previewReady,
      },
    ];

    const actions: Array<{
      label: string;
      onClick: () => void;
      active?: boolean;
    }> = [];
    if (
      themeShellState.activeView !== "authoring" ||
      themeShellState.authoringMode === "preview"
    ) {
      actions.push({
        label:
          themeShellState.activeView === "coverage"
            ? "Back to set roles"
            : themeShellState.authoringMode === "preview"
              ? "Back to set roles"
              : "Back to authoring",
        onClick: () => themeManagerHandleRef.current?.returnToAuthoring(),
      });
    }

    return (
      <ThemeStageModelControls
        stages={stages}
        onSelectStage={handleSelectThemeStage}
        actions={actions}
      />
    );
  }, [
    activeWorkspace.id,
    activeSecondarySurface,
    handleSelectThemeStage,
    themeShellState.activeView,
    themeShellState.authoringMode,
    themeWorkflowSummary,
  ]);

  const applyContextualControls = null;

  const handleSelectSyncStage = useCallback(
    (stage: SyncWorkflowStage) => {
      guardEditorAction(() => {
        navigateTo("ship", "publish");
        closeSecondarySurface();
        publishPanelHandleRef.current?.focusStage(stage);
      });
    },
    [closeSecondarySurface, guardEditorAction, navigateTo],
  );

  const syncContextualControls = useMemo(() => {
    if (
      activeSecondarySurface !== null ||
      activeWorkspace.id !== "sync" ||
      activeWorkspaceSection?.id !== "publish"
    )
      return null;

    const stages = [
      {
        id: "preflight" as const,
        step: 1,
        label: "Preflight",
        detail:
          publishPreflightState.stage === "running"
            ? "Checks are running against the current file"
            : publishPreflightState.isOutdated ||
                publishPreflightState.stage === "idle"
              ? "Run the readiness pass first"
              : publishPreflightState.stage === "blocked"
                ? `${publishPreflightState.blockingCount} blocking cluster${publishPreflightState.blockingCount === 1 ? "" : "s"} found`
                : publishPreflightState.stage === "advisory"
                  ? `${publishPreflightState.advisoryCount} advisory cluster${publishPreflightState.advisoryCount === 1 ? "" : "s"} remain`
                  : "Preflight is clear",
        tone:
          publishPreflightState.stage === "running" ||
          publishPreflightState.isOutdated ||
          publishPreflightState.stage === "idle"
            ? "current"
            : publishPreflightState.stage === "blocked"
              ? "blocked"
              : "complete",
      },
      {
        id: "compare" as const,
        step: 2,
        label: "Compare",
        detail: !publishPreflightState.canProceed
          ? "Locked until preflight is clear"
          : pendingPublishCount > 0
            ? `${pendingPublishCount} Figma change${pendingPublishCount === 1 ? "" : "s"} ready to review`
            : "Compare variables and styles against Figma",
        tone: !publishPreflightState.canProceed
          ? "blocked"
          : pendingPublishCount > 0
            ? "current"
            : "pending",
        disabled: !publishPreflightState.canProceed,
      },
      {
        id: "apply" as const,
        step: 3,
        label: "Apply",
        detail: !publishPreflightState.canProceed
          ? "Still blocked by preflight"
          : pendingPublishCount > 0
            ? "Apply the reviewed sync plan"
            : "Apply unlocks after compare finds changes",
        tone: !publishPreflightState.canProceed
          ? "blocked"
          : pendingPublishCount > 0
            ? "current"
            : "pending",
        disabled: !publishPreflightState.canProceed,
      },
    ];

    return (
      <SyncWorkflowControls
        stages={stages}
        onSelectStage={handleSelectSyncStage}
      />
    );
  }, [
    activeWorkspace.id,
    activeWorkspaceSection?.id,
    activeSecondarySurface,
    handleSelectSyncStage,
    pendingPublishCount,
    publishPreflightState.advisoryCount,
    publishPreflightState.blockingCount,
    publishPreflightState.canProceed,
    publishPreflightState.isOutdated,
    publishPreflightState.stage,
  ]);

  const workspacePrimaryAction = useMemo(() => {
    if (activeSecondarySurface === null && activeWorkspace.id === "themes") {
      if (
        themeShellState.activeView !== "authoring" ||
        themeShellState.authoringMode === "preview"
      ) {
        return {
          label:
            themeShellState.activeView === "coverage"
              ? "Back to set roles"
              : themeShellState.authoringMode === "preview"
                ? "Back to set roles"
                : "Back to authoring",
          onClick: () => themeManagerHandleRef.current?.returnToAuthoring(),
        };
      }

      if (themeWorkflowSummary.currentStage === "options") {
        return {
          label: "Add option",
          onClick: () => {
            guardEditorAction(() => {
              navigateTo("define", "themes");
              closeSecondarySurface();
              themeManagerHandleRef.current?.focusStage("options");
            });
          },
        };
      }

      if (themeWorkflowSummary.currentStage === "set-roles") {
        return {
          label:
            themeWorkflowSummary.nextSetRoleTarget?.actionLabel ??
            (themeWorkflowSummary.unmappedOptionCount > 0
              ? "Assign set roles"
              : "Fix set roles"),
          onClick: () => {
            guardEditorAction(() => {
              navigateTo("define", "themes");
              closeSecondarySurface();
              themeManagerHandleRef.current?.focusStage("set-roles");
            });
          },
        };
      }

      if (themeWorkflowSummary.currentStage === "preview") {
        return {
          label:
            themeShellState.authoringMode === "preview"
              ? "Review preview"
              : "Preview combination",
          onClick: () => {
            guardEditorAction(() => {
              navigateTo("define", "themes");
              closeSecondarySurface();
              themeManagerHandleRef.current?.focusStage("preview");
            });
          },
        };
      }

      return {
        label: "Create axis",
        onClick: () => {
          guardEditorAction(() => {
            navigateTo("define", "themes");
            closeSecondarySurface();
            themeManagerHandleRef.current?.openCreateAxis();
          });
        },
      };
    }

    if (
      activeSecondarySurface === null &&
      activeWorkspace.id === "apply" &&
      activeWorkspaceSection?.id === "inspect"
    ) {
      return null;
    }

    if (
      activeSecondarySurface === null &&
      activeWorkspace.id === "sync" &&
      activeWorkspaceSection?.id === "publish"
    ) {
      if (publishPreflightState.stage === "running") {
        return {
          label: "Running preflight…",
          onClick: () => {},
          disabled: true,
        };
      }

      if (
        publishPreflightState.isOutdated ||
        publishPreflightState.stage === "idle"
      ) {
        return {
          label: "Run preflight",
          onClick: () => publishPanelHandleRef.current?.runReadinessChecks(),
        };
      }

      if (publishPreflightState.stage === "blocked") {
        return {
          label: "Review blockers",
          onClick: () => publishPanelHandleRef.current?.focusStage("preflight"),
        };
      }

      if (pendingPublishCount > 0) {
        return {
          label: "Review differences",
          onClick: () => publishPanelHandleRef.current?.focusStage("compare"),
        };
      }

      return {
        label: "Compare Figma",
        onClick: () => publishPanelHandleRef.current?.runCompareAll(),
      };
    }

    if (
      activeSecondarySurface === null &&
      activeWorkspace.id === "audit" &&
      activeWorkspaceSection?.id === "health"
    ) {
      return {
        label: "Refresh audit",
        onClick: refreshValidation,
      };
    }

    return null;
  }, [
    activeSecondarySurface,
    activeWorkspace.id,
    activeWorkspaceSection?.id,
    guardEditorAction,
    navigateTo,
    refreshValidation,
    pendingPublishCount,
    publishPreflightState.isOutdated,
    publishPreflightState.stage,
    closeSecondarySurface,
    themeShellState.activeView,
    themeShellState.authoringMode,
    themeWorkflowSummary.currentStage,
    themeWorkflowSummary.unmappedOptionCount,
  ]);

  const workspaceContextualControls =
    activeWorkspace.id === "themes"
      ? themeContextualControls
      : activeWorkspace.id === "apply"
        ? applyContextualControls
        : activeWorkspace.id === "sync"
          ? syncContextualControls
          : null;

  const secondarySurfacePills = useMemo((): Array<{
    label: string;
    tone: NoticeSeverity;
  }> => {
    switch (activeSecondarySurface) {
      case "import":
        return [
          {
            label: connected ? "Server connected" : "Server required",
            tone: connected ? "success" : "error",
          },
        ];
      case "sets":
        return [
          {
            label: `${sets.length} authoring set${sets.length === 1 ? "" : "s"}`,
            tone: "info",
          },
        ];
      case "notifications":
        return [
          {
            label:
              notificationHistory.length === 0
                ? "No notifications"
                : `${notificationHistory.length} entr${notificationHistory.length === 1 ? "y" : "ies"}`,
            tone: notificationHistory.length === 0 ? "info" : "info",
          },
        ];
      case "shortcuts":
        return [
          {
            label: adaptShortcut(SHORTCUT_KEYS.SHOW_SHORTCUTS),
            tone: "info",
          },
        ];
      case "settings":
        return [
          {
            label: connected ? "Connected" : "Offline recovery visible",
            tone: connected ? "success" : "info",
          },
        ];
      default:
        return workspacePills;
    }
  }, [
    activeSecondarySurface,
    connected,
    notificationHistory.length,
    sets.length,
    workspacePills,
  ]);

  const shellSections =
    activeSecondarySurface === null ? activeWorkspace.sections : undefined;
  const shellActiveSectionId =
    activeSecondarySurface === null
      ? (activeWorkspaceSection?.id ?? null)
      : null;
  const shellDescription = useMemo(() => {
    if (activeSecondarySurfaceDef) {
      return activeSecondarySurfaceDef.transition.usage;
    }

    if (activeWorkspaceGuide.stepNumber !== null) {
      return `Step ${activeWorkspaceGuide.stepNumber} of ${PRIMARY_WORKSPACE_SEQUENCE.length}. ${activeWorkspaceGuide.role}`;
    }

    return `Cross-cutting review space, not a separate linear step. ${activeWorkspaceGuide.role}`;
  }, [activeSecondarySurfaceDef, activeWorkspaceGuide]);
  const shellWorkflowSummary = useMemo(() => {
    if (activeSecondarySurface !== null) {
      return null;
    }

    return (
      <div className="flex flex-col gap-2">
        <div className="text-[10px] font-medium text-[var(--color-figma-text)]">
          Primary workflow
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {PRIMARY_WORKSPACE_SEQUENCE.map((workspace) => {
            const isActive = workspace.id === activeWorkspace.id;
            return (
              <span
                key={workspace.id}
                title={workspace.role}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-medium uppercase tracking-[0.08em] ${
                  isActive
                    ? "border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]"
                    : "border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]"
                }`}
              >
                <span>{workspace.stepNumber}</span>
                <span>{workspace.label}</span>
              </span>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">
          <span
            className={`inline-flex items-center rounded-full border px-2 py-1 text-[9px] font-medium uppercase tracking-[0.08em] ${
              activeWorkspace.id === AUDIT_WORKSPACE_GUIDE.id
                ? "border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]"
                : "border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]"
            }`}
          >
            {AUDIT_WORKSPACE_GUIDE.label}
          </span>
          <span>{AUDIT_WORKSPACE_GUIDE.role}</span>
        </div>
      </div>
    );
  }, [activeSecondarySurface, activeWorkspace.id]);
  const visibleHandoff = useMemo(() => {
    if (!activeHandoff) {
      return null;
    }

    if (
      activeHandoff.returnTarget.secondarySurfaceId !== null &&
      activeSecondarySurface === activeHandoff.returnTarget.secondarySurfaceId
    ) {
      return null;
    }

    if (
      activeHandoff.returnTarget.secondarySurfaceId === null &&
      activeSecondarySurface === null &&
      activeTopTab === activeHandoff.returnTarget.topTab &&
      activeSubTab === activeHandoff.returnTarget.subTab
    ) {
      return null;
    }

    return activeHandoff;
  }, [activeHandoff, activeSecondarySurface, activeSubTab, activeTopTab]);
  const shellPrimaryAction =
    activeSecondarySurface === null ? workspacePrimaryAction : null;
  const shellContextualControls =
    activeSecondarySurface === null ? workspaceContextualControls : null;
  const isTokenWorkspacePrimarySurface =
    activeTopTab === "define" &&
    activeSubTab === "tokens" &&
    activeSecondarySurface === null;

  const handleUtilityAction = useCallback(
    (actionId: UtilityActionId) => {
      setMenuOpen(false);
      switch (actionId) {
        case "command-palette":
          setCommandPaletteInitialQuery("");
          setShowCommandPalette(true);
          return;
        case "paste-tokens":
          setShowPasteModal(true);
          return;
        case "window-size":
          toggleExpand();
          return;
      }
    },
    [
      setCommandPaletteInitialQuery,
      setShowCommandPalette,
      setMenuOpen,
      setShowPasteModal,
      toggleExpand,
    ],
  );

  const utilityActionDetail = useCallback(
    (actionId: UtilityActionId): string => {
      switch (actionId) {
        case "command-palette":
          return adaptShortcut(SHORTCUT_KEYS.OPEN_PALETTE);
        case "paste-tokens":
          return adaptShortcut(SHORTCUT_KEYS.PASTE_TOKENS);
        case "window-size":
          return isExpanded ? "Windowed" : "Expanded";
      }
    },
    [isExpanded],
  );

  const utilitiesAttention = !connected;
  const utilitiesStatusLabel = checking
    ? `Checking ${serverUrl}`
    : connected
      ? `Connected to ${serverUrl}`
      : `Server offline · ${serverUrl}`;
  const shellMenuActive =
    menuOpen ||
    activeSecondarySurface === "settings" ||
    activeSecondarySurface === "shortcuts";
  const notificationCount = notificationHistory.length;
  const showNotificationButton =
    notificationCount > 0 || activeSecondarySurface === "notifications";
  const tokenThemePreviewEntries = useMemo(
    () =>
      dimensions
        .filter(
          (dimension) =>
            previewThemes[dimension.id] &&
            previewThemes[dimension.id] !== activeThemes[dimension.id],
        )
        .map(
          (dimension) => `${dimension.name}: ${previewThemes[dimension.id]}`,
        ),
    [activeThemes, dimensions, previewThemes],
  );
  const tokenThemeSelectionSummary = useMemo(() => {
    const activeEntries = dimensions
      .map((dimension) => activeThemes[dimension.id])
      .filter(Boolean);
    return activeEntries.join(" · ") || "No theme applied";
  }, [activeThemes, dimensions]);
  const showExpandedTokenThemeBar =
    isTokenWorkspacePrimarySurface &&
    (dimBarExpanded ||
      themesError !== null ||
      tokenThemePreviewEntries.length > 0);
  const showCollapsedTokenThemeBar =
    isTokenWorkspacePrimarySurface &&
    dimensions.length > 0 &&
    !showExpandedTokenThemeBar;
  const workspaceHeaderStatusPills = isTokenWorkspacePrimarySurface
    ? []
    : secondarySurfacePills;

  return (
    <div className="relative flex flex-col h-screen">
      {/* Workspace shell */}
      <div className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
        <div className="flex items-start justify-between gap-3 px-3 py-2.5">
          <div
            className="min-w-0 flex flex-1 items-center gap-1 overflow-x-auto rounded-[14px] border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-1"
            role="tablist"
            aria-label="Workspaces"
          >
            {APP_SHELL_NAVIGATION.workspaces.map((workspace) => {
              const isActive = workspace.id === activeWorkspaceId;
              return (
                <button
                  key={workspace.id}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() =>
                    guardEditorAction(() => {
                      clearHandoff();
                      navigateTo(workspace.topTab, workspace.subTab);
                    })
                  }
                  className={shellControlClass({
                    active: isActive,
                    size: "md",
                    shape: "rounded",
                  })}
                >
                  {workspace.label}
                </button>
              );
            })}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {shellShortcutSurfaces.map((surface) => (
              <button
                key={surface.id}
                onClick={() => toggleSecondarySurface(surface.id)}
                className={shellControlClass({
                  active: activeSecondarySurface === surface.id,
                  size: "md",
                  shape: "rounded",
                })}
                aria-pressed={activeSecondarySurface === surface.id}
                title={surface.transition.usage}
              >
                {surface.label}
              </button>
            ))}
            {showNotificationButton && notificationSurface && (
              <button
                onClick={() => toggleSecondarySurface(notificationSurface.id)}
                className={`${shellControlClass({
                  active: activeSecondarySurface === notificationSurface.id,
                  size: "md",
                  shape: "rounded",
                })} h-9 w-9 min-h-0 px-0 py-0`}
                aria-label={`Open notifications (${notificationCount})`}
                aria-pressed={activeSecondarySurface === notificationSurface.id}
                title={notificationSurface.transition.usage}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M8 2.5a3 3 0 0 0-3 3v1.1c0 .8-.23 1.58-.67 2.23L3.2 10.5h9.6l-1.13-1.67A4 4 0 0 1 11 6.6V5.5a3 3 0 0 0-3-3Z" />
                  <path d="M6.6 12.4a1.6 1.6 0 0 0 2.8 0" />
                </svg>
                <span className="absolute right-0.5 top-0.5 inline-flex min-w-[16px] items-center justify-center rounded-full bg-[var(--color-figma-accent)] px-1 text-[9px] font-semibold leading-4 text-white">
                  {notificationCount > 99 ? "99+" : notificationCount}
                </span>
              </button>
            )}

            <div className="relative shrink-0" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className={`${shellControlClass({
                  active: shellMenuActive,
                  size: "md",
                  shape: "rounded",
                })} h-9 w-9 min-h-0 px-0 py-0`}
                aria-label="Open app menu"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="8" cy="8" r="2.1" />
                  <path d="M8 1.7v1.6M8 12.7v1.6M3.54 3.54l1.13 1.13M11.33 11.33l1.13 1.13M1.7 8h1.6M12.7 8h1.6M3.54 12.46l1.13-1.13M11.33 4.67l1.13-1.13" />
                </svg>
                {utilitiesAttention && (
                  <span
                    className={`absolute right-1 top-1 h-1.5 w-1.5 rounded-full ${!connected && !checking ? "bg-[var(--color-figma-error)]" : "bg-[var(--color-figma-accent)]"}`}
                    aria-hidden="true"
                  />
                )}
              </button>

              {menuOpen && (
                <div
                  className="absolute right-0 top-full z-50 mt-1 w-56 overflow-hidden rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-lg"
                  role="menu"
                >
                  <div className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-2">
                    <div className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">
                      App menu
                    </div>
                    <div className="mt-0.5 text-[10px] text-[var(--color-figma-text-secondary)]">
                      {utilitiesStatusLabel}
                    </div>
                    {!connected && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button
                          onClick={retryConnection}
                          disabled={checking}
                          className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[10px] font-medium text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {checking ? "Checking…" : "Retry"}
                        </button>
                        <button
                          onClick={() => {
                            setShowConnectionEditor((v) => !v);
                            setConnectionUrlInput(serverUrl);
                            setConnectionConnectResult(null);
                          }}
                          className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[10px] font-medium text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
                        >
                          {showConnectionEditor ? "Hide URL" : "Change URL"}
                        </button>
                      </div>
                    )}
                    {showConnectionEditor && (
                      <div className="mt-2 flex flex-col gap-1.5">
                        <label className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">
                          Server URL
                        </label>
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            value={connectionUrlInput}
                            onChange={(e) => {
                              setConnectionUrlInput(e.target.value);
                              setConnectionConnectResult(null);
                            }}
                            onKeyDown={async (e) => {
                              if (e.key !== "Enter") return;
                              const url = connectionUrlInput.trim();
                              if (!url) return;
                              setConnectionConnectResult(null);
                              const ok = await updateServerUrlAndConnect(url);
                              setConnectionConnectResult(ok ? "ok" : "fail");
                              if (ok) setShowConnectionEditor(false);
                            }}
                            placeholder="http://localhost:9400"
                            autoFocus
                            className="min-w-0 flex-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[10px] text-[var(--color-figma-text)] outline-none placeholder-[var(--color-figma-text-tertiary)] focus-visible:border-[var(--color-figma-accent)]"
                          />
                          <button
                            onClick={async () => {
                              const url = connectionUrlInput.trim();
                              if (!url) return;
                              setConnectionConnectResult(null);
                              const ok = await updateServerUrlAndConnect(url);
                              setConnectionConnectResult(ok ? "ok" : "fail");
                              if (ok) setShowConnectionEditor(false);
                            }}
                            disabled={checking || !connectionUrlInput.trim()}
                            className="shrink-0 rounded bg-[var(--color-figma-accent)] px-2.5 py-1 text-[10px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Connect
                          </button>
                        </div>
                        {connectionConnectResult === "fail" && (
                          <NoticeFieldMessage severity="error">
                            Cannot reach server. Check the URL and try again.
                          </NoticeFieldMessage>
                        )}
                      </div>
                    )}
                  </div>
                  {shellMenuSurfaces.length > 0 && (
                    <div>
                      <div className="px-3 py-1.5">
                        <div className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">
                          Settings
                        </div>
                        <div className="mt-0.5 text-[10px] text-[var(--color-figma-text-secondary)]">
                          Open preferences, recovery tools, and connection
                          controls.
                        </div>
                      </div>
                      {shellMenuSurfaces.map((surface) => (
                        <button
                          key={surface.id}
                          role="menuitem"
                          tabIndex={-1}
                          onClick={() => {
                            setMenuOpen(false);
                            toggleSecondarySurface(surface.id);
                          }}
                          className="mx-1 mb-1 flex w-[calc(100%-0.5rem)] items-center justify-between rounded-[10px] border border-transparent px-3 py-2 text-left text-[11px] font-medium text-[var(--color-figma-text-secondary)] transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-150 ease-out outline-none hover:border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-secondary)] hover:text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-border)] focus-visible:bg-[var(--color-figma-bg-secondary)] focus-visible:text-[var(--color-figma-text)] focus-visible:ring-2 focus-visible:ring-[var(--color-figma-accent)]/30 active:translate-y-px active:bg-[var(--color-figma-bg-hover)]"
                          title={surface.transition.usage}
                        >
                          <span>{surface.label}</span>
                          <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">
                            {adaptShortcut(SHORTCUT_KEYS.OPEN_SETTINGS)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {APP_SHELL_NAVIGATION.utilityMenu.sections.map((section) => (
                    <div key={section.id}>
                      <div className="border-t border-[var(--color-figma-border)]" />
                      <div className="px-3 py-1.5">
                        <div className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">
                          {section.label}
                        </div>
                        <div className="mt-0.5 text-[10px] text-[var(--color-figma-text-secondary)]">
                          {section.description}
                        </div>
                      </div>
                      {section.actions.map((action) => (
                        <button
                          key={action.id}
                          role="menuitem"
                          tabIndex={-1}
                          onClick={() => handleUtilityAction(action.id)}
                          className="mx-1 mb-1 flex w-[calc(100%-0.5rem)] items-center justify-between rounded-[10px] border border-transparent px-3 py-2 text-left text-[11px] font-medium text-[var(--color-figma-text-secondary)] transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-150 ease-out outline-none hover:border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-secondary)] hover:text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-border)] focus-visible:bg-[var(--color-figma-bg-secondary)] focus-visible:text-[var(--color-figma-text)] focus-visible:ring-2 focus-visible:ring-[var(--color-figma-accent)]/30 active:translate-y-px active:bg-[var(--color-figma-bg-hover)]"
                          title={action.transition?.usage ?? action.description}
                        >
                          <span>
                            {action.id === "window-size"
                              ? isExpanded
                                ? "Restore window"
                                : "Expand window"
                              : action.label}
                          </span>
                          <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">
                            {utilityActionDetail(action.id)}
                          </span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <WorkspaceSummaryHeader
          workspaceLabel={shellWorkspaceLabel}
          currentLabel={shellCurrentLabel}
          currentDepthLabel={shellCurrentDepthLabel}
          title={shellCurrentTitle}
          description={shellDescription}
          workflowSummary={shellWorkflowSummary}
          sections={shellSections}
          activeSectionId={shellActiveSectionId}
          onSelectSection={(section) => {
            guardEditorAction(() => {
              clearHandoff();
              navigateTo(section.topTab, section.subTab);
              if (section.subTab === "canvas-analysis") triggerHeatmapScan();
            });
          }}
          statusPills={workspaceHeaderStatusPills}
          primaryAction={shellPrimaryAction}
          contextualControls={shellContextualControls}
          handoff={visibleHandoff}
          onReturnHandoff={returnFromHandoff}
        />
      </div>

      {activeSecondarySurface === null && postImportBanner?.visible && (
        <InlineBanner
          variant={postImportBanner.result.hadFailures ? "warning" : "success"}
          layout="strip"
          size="sm"
          action={
            postImportBanner.nextRecommendation?.target.kind === "workspace"
              ? {
                  label: `Open ${postImportBanner.nextRecommendation.label}`,
                  onClick: handlePostImportBannerAction,
                  title: postImportBanner.nextRecommendation.rationale,
                }
              : undefined
          }
          onDismiss={dismissPostImportBanner}
        >
          <span className="block truncate text-[var(--color-figma-text)]">
            {buildPostImportBannerMessage(postImportBanner.result)}
          </span>
        </InlineBanner>
      )}

      {/* Set switching surface */}
      {activeTopTab === "define" &&
        activeSubTab === "tokens" &&
        activeSecondarySurface === null &&
        sets.length > 1 && (
          <div
            className={`border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] ${tokenDragState ? "bg-[var(--color-figma-accent)]/[0.03]" : ""}`}
          >
            <div className="relative flex items-center gap-2 px-2 py-1.5">
              <button
                onClick={() => setShowSetSwitcher(true)}
                className={`${shellControlClass({ size: "sm", shape: "rounded" })} shrink-0 justify-start text-left`}
                aria-label="Open set switcher"
              >
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] ${shellMetaTextClass(false)}`}>
                    Set
                  </span>
                  <span className="max-w-[180px] truncate text-[11px] font-medium text-[var(--color-figma-text)]">
                    {activeSet}
                  </span>
                  <svg
                    width="8"
                    height="8"
                    viewBox="0 0 8 8"
                    fill="none"
                    className={shellMetaTextClass(false)}
                  >
                    <path
                      d="M1 3l3 3 3-3"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </button>

              <div className="relative min-w-0 flex-1">
                <div
                  ref={setTabsScrollRef}
                  className="flex gap-1 overflow-x-auto pr-6"
                  style={{ scrollbarWidth: "none" }}
                >
                  {sets.map((set) => {
                    const isActive = activeSet === set;
                    const isTokenDragSource = tokenDragState?.fromSet === set;
                    const isTokenDropTarget =
                      tokenDragState && !isTokenDragSource;
                    const isTokenHovered =
                      isTokenDropTarget && dragOverSetName === set;
                    const themeStatus = setThemeStatusMap[set];
                    return (
                      <button
                        key={set}
                        data-active-set={isActive}
                        onClick={() =>
                          guardEditorAction(() => setActiveSet(set))
                        }
                        onDragOver={(e) => handleSetDragOver(e, set)}
                        onDragLeave={handleSetDragLeave}
                        onDrop={(e) => handleSetDrop(e, set)}
                        title={(() => {
                          const parts: string[] = [setDescriptions[set] || set];
                          const byType = setByTypeCounts[set];
                          if (byType) {
                            const breakdown = Object.entries(byType)
                              .sort((a, b) => b[1] - a[1])
                              .map(([t, c]) => `${c} ${t}`)
                              .join(" · ");
                            if (breakdown) parts.push(breakdown);
                          }
                          if (themeStatus) parts.push(`theme: ${themeStatus}`);
                          return parts.join("\n");
                        })()}
                        className={`${shellControlClass({ active: isActive, size: "sm", shape: "rounded" })} flex shrink-0 justify-start gap-1.5 ${
                          isTokenDragSource ? "opacity-40" : ""
                        } ${
                          isTokenDropTarget
                            ? isTokenHovered
                              ? "ring-2 ring-inset ring-[var(--color-figma-accent)]"
                              : "ring-1 ring-inset ring-[var(--color-figma-accent)]/40"
                            : ""
                        }`}
                      >
                        {themeStatus && (
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              themeStatus === "enabled"
                                ? isActive
                                  ? "bg-green-500"
                                  : "bg-green-500"
                                : themeStatus === "source"
                                  ? isActive
                                    ? "bg-sky-500"
                                    : "bg-sky-500"
                                  : isActive
                                    ? "bg-[var(--color-figma-text-secondary)]/50"
                                    : "bg-gray-400/50"
                            }`}
                          />
                        )}
                        <span className="max-w-[120px] truncate">{set}</span>
                        {setTokenCounts[set] !== undefined && (
                          <span className={shellCountBadgeClass(isActive)}>
                            {isActive && filteredSetCount !== null
                              ? `${filteredSetCount}\u2009/\u2009${setTokenCounts[set]}`
                              : setTokenCounts[set]}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {setTabsOverflow.left && (
                  <>
                    <div
                      className="pointer-events-none absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-[var(--color-figma-bg-secondary)] to-transparent"
                      aria-hidden="true"
                    />
                    <button
                      onClick={() => scrollSetTabs("left")}
                      className={`${shellControlClass({ size: "sm", shape: "rounded" })} absolute left-0 top-1/2 z-[2] h-6 w-5 min-h-0 -translate-y-1/2 px-0 py-0`}
                      aria-label="Scroll sets left"
                    >
                      <svg
                        width="8"
                        height="8"
                        viewBox="0 0 8 8"
                        fill="currentColor"
                      >
                        <path d="M6 1L2 4l4 3V1z" />
                      </svg>
                    </button>
                  </>
                )}
                {setTabsOverflow.right && (
                  <>
                    <div
                      className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-[var(--color-figma-bg-secondary)] to-transparent"
                      aria-hidden="true"
                    />
                    <button
                      onClick={() => scrollSetTabs("right")}
                      className={`${shellControlClass({ size: "sm", shape: "rounded" })} absolute right-0 top-1/2 z-[2] h-6 w-5 min-h-0 -translate-y-1/2 px-0 py-0`}
                      aria-label="Scroll sets right"
                    >
                      <svg
                        width="8"
                        height="8"
                        viewBox="0 0 8 8"
                        fill="currentColor"
                      >
                        <path d="M2 1l4 3-4 3V1z" />
                      </svg>
                    </button>
                  </>
                )}
              </div>
            </div>
            {tokenDragState && (
              <div className="border-t border-[var(--color-figma-border)] px-2 py-0.5 text-[10px] text-[var(--color-figma-text-tertiary)]">
                Drop on a set to move {tokenDragState.paths.length} token
                {tokenDragState.paths.length !== 1 ? "s" : ""}.
              </div>
            )}
          </div>
        )}

      <WorkspaceControllerProvider value={workspaceControllers}>
        <ErrorBoundary>
          <div className="flex-1 flex overflow-hidden">
            <div className="flex-1 flex flex-col overflow-hidden">
              <>
                {showCollapsedTokenThemeBar && (
                  <button
                    onClick={() => setDimBarExpanded(true)}
                    className="flex shrink-0 items-center gap-1.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-left"
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 10 10"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                      aria-hidden="true"
                    >
                      <circle cx="3.5" cy="5" r="2.5" />
                      <circle cx="6.5" cy="5" r="2.5" />
                    </svg>
                    <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                      Themes
                    </span>
                    <span className="truncate text-[10px] text-[var(--color-figma-text)]">
                      {tokenThemeSelectionSummary}
                    </span>
                    <svg
                      width="8"
                      height="8"
                      viewBox="0 0 8 8"
                      fill="none"
                      className="shrink-0 text-[var(--color-figma-text-tertiary)]"
                    >
                      <path
                        d="M1 3l3 3 3-3"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                )}

                {showExpandedTokenThemeBar && (
                  <div
                    ref={dimDropdownRef}
                    className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1"
                  >
                    <span className="flex shrink-0 items-center gap-1 text-[10px] text-[var(--color-figma-text-tertiary)]">
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 10 10"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                        aria-hidden="true"
                      >
                        <circle cx="3.5" cy="5" r="2.5" />
                        <circle cx="6.5" cy="5" r="2.5" />
                      </svg>
                      Themes
                    </span>
                    {themesError ? (
                      <span className="flex items-center gap-1 text-[10px] text-[var(--color-figma-danger)]">
                        Could not load themes
                        <button
                          onClick={retryThemes}
                          className="underline transition-colors hover:text-[var(--color-figma-text)]"
                        >
                          Retry
                        </button>
                      </span>
                    ) : dimensions.length > 0 ? (
                      <>
                        {dimensions.map((dim) => {
                          const activeOption = activeThemes[dim.id];
                          const previewOption = previewThemes[dim.id];
                          const isOpen = openDimDropdown === dim.id;
                          if (dim.options.length <= 5) {
                            return (
                              <div
                                key={dim.id}
                                className="flex items-center gap-1"
                                onMouseLeave={() => {
                                  const next = { ...previewThemes };
                                  delete next[dim.id];
                                  setPreviewThemes(next);
                                }}
                              >
                                <span className="shrink-0 text-[10px] text-[var(--color-figma-text-tertiary)]">
                                  {dim.name}:
                                </span>
                                <div className="flex overflow-hidden rounded border border-[var(--color-figma-border)]">
                                  <button
                                    onClick={() => {
                                      const next = { ...activeThemes };
                                      delete next[dim.id];
                                      setActiveThemes(next);
                                    }}
                                    onMouseEnter={() => {
                                      const next = { ...previewThemes };
                                      delete next[dim.id];
                                      setPreviewThemes(next);
                                    }}
                                    className={`border-r border-[var(--color-figma-border)] px-2 py-0.5 text-[10px] transition-colors ${
                                      !activeOption && !previewOption
                                        ? "bg-[var(--color-figma-accent)] text-white font-medium"
                                        : "bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                                    }`}
                                  >
                                    None
                                  </button>
                                  {dim.options.map(
                                    (opt: { name: string }, index: number) => {
                                      const isActive =
                                        activeOption === opt.name;
                                      const isPreviewing =
                                        previewOption === opt.name &&
                                        previewOption !== activeOption;
                                      return (
                                        <button
                                          key={opt.name}
                                          onClick={() => {
                                            setActiveThemes({
                                              ...activeThemes,
                                              [dim.id]: opt.name,
                                            });
                                            const next = { ...previewThemes };
                                            delete next[dim.id];
                                            setPreviewThemes(next);
                                          }}
                                          onMouseEnter={() =>
                                            setPreviewThemes({
                                              ...previewThemes,
                                              [dim.id]: opt.name,
                                            })
                                          }
                                          title={
                                            isActive
                                              ? `${opt.name} (active)`
                                              : `Preview ${opt.name} — click to apply`
                                          }
                                          className={`px-2 py-0.5 text-[10px] transition-colors ${
                                            index < dim.options.length - 1
                                              ? "border-r border-[var(--color-figma-border)]"
                                              : ""
                                          } ${
                                            isActive
                                              ? "bg-[var(--color-figma-accent)] text-white font-medium"
                                              : isPreviewing
                                                ? "bg-[var(--color-figma-accent)] text-white opacity-60"
                                                : "bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                                          }`}
                                        >
                                          {opt.name}
                                        </button>
                                      );
                                    },
                                  )}
                                </div>
                              </div>
                            );
                          }
                          return (
                            <div
                              key={dim.id}
                              className="relative flex items-center gap-1"
                            >
                              <span className="shrink-0 text-[10px] text-[var(--color-figma-text-tertiary)]">
                                {dim.name}:
                              </span>
                              <button
                                onClick={() =>
                                  setOpenDimDropdown(isOpen ? null : dim.id)
                                }
                                className={`flex items-center gap-1 rounded px-2 py-0.5 text-[10px] transition-colors ${
                                  activeOption
                                    ? "bg-[var(--color-figma-accent)] text-white font-medium"
                                    : "border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                                }`}
                              >
                                {activeOption || "None"}
                                <svg
                                  width="8"
                                  height="8"
                                  viewBox="0 0 8 8"
                                  fill="none"
                                  className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
                                >
                                  <path
                                    d="M1 3l3 3 3-3"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                              </button>
                              {isOpen && (
                                <div
                                  className="absolute left-0 top-full z-50 mt-1 min-w-[120px] rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] py-1 shadow-lg"
                                  onMouseLeave={() => {
                                    const next = { ...previewThemes };
                                    delete next[dim.id];
                                    setPreviewThemes(next);
                                  }}
                                >
                                  <button
                                    onClick={() => {
                                      const next = { ...activeThemes };
                                      delete next[dim.id];
                                      setActiveThemes(next);
                                      setOpenDimDropdown(null);
                                    }}
                                    onMouseEnter={() => {
                                      const next = { ...previewThemes };
                                      delete next[dim.id];
                                      setPreviewThemes(next);
                                    }}
                                    className={`w-full px-3 py-1.5 text-left text-[10px] transition-colors hover:bg-[var(--color-figma-bg-hover)] ${
                                      !activeOption
                                        ? "text-[var(--color-figma-accent)] font-medium"
                                        : "text-[var(--color-figma-text)]"
                                    }`}
                                  >
                                    None
                                  </button>
                                  {dim.options.map((opt: { name: string }) => (
                                    <button
                                      key={opt.name}
                                      onClick={() => {
                                        setActiveThemes({
                                          ...activeThemes,
                                          [dim.id]: opt.name,
                                        });
                                        setOpenDimDropdown(null);
                                        const next = { ...previewThemes };
                                        delete next[dim.id];
                                        setPreviewThemes(next);
                                      }}
                                      onMouseEnter={() =>
                                        setPreviewThemes({
                                          ...previewThemes,
                                          [dim.id]: opt.name,
                                        })
                                      }
                                      title={
                                        activeOption === opt.name
                                          ? `${opt.name} (active)`
                                          : `Preview ${opt.name} — click to apply`
                                      }
                                      className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-[10px] transition-colors hover:bg-[var(--color-figma-bg-hover)] ${
                                        activeOption === opt.name
                                          ? "text-[var(--color-figma-accent)] font-medium"
                                          : "text-[var(--color-figma-text)]"
                                      }`}
                                    >
                                      {opt.name}
                                      {previewThemes[dim.id] === opt.name &&
                                        activeOption !== opt.name && (
                                          <span className="ml-2 text-[8px] text-[var(--color-figma-text-tertiary)] opacity-70">
                                            preview
                                          </span>
                                        )}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {tokenThemePreviewEntries.length > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-medium text-amber-700">
                            <svg
                              width="8"
                              height="8"
                              viewBox="0 0 8 8"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.2"
                              strokeLinecap="round"
                              aria-hidden="true"
                            >
                              <circle cx="4" cy="4" r="3" />
                              <path d="M4 2.5v2M4 5.5v.5" />
                            </svg>
                            Previewing {tokenThemePreviewEntries.join(" · ")}
                          </span>
                        )}
                        <button
                          onClick={() => navigateTo("define", "themes")}
                          className="ml-auto px-1 text-[10px] text-[var(--color-figma-text-tertiary)] transition-colors hover:text-[var(--color-figma-accent)]"
                          title="Manage theme axes"
                          aria-label="Manage theme axes"
                        >
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 10 10"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.2"
                            strokeLinecap="round"
                            aria-hidden="true"
                          >
                            <circle cx="5" cy="2" r="1" />
                            <circle cx="5" cy="5" r="1" />
                            <circle cx="5" cy="8" r="1" />
                          </svg>
                        </button>
                        {dimensions.length > 0 && (
                          <button
                            onClick={() => setDimBarExpanded(false)}
                            className="px-1 text-[10px] text-[var(--color-figma-text-tertiary)] transition-colors hover:text-[var(--color-figma-text)]"
                            title="Collapse theme controls"
                            aria-label="Collapse theme controls"
                          >
                            <svg
                              width="8"
                              height="8"
                              viewBox="0 0 8 8"
                              fill="none"
                            >
                              <path
                                d="M1 5l3-3 3 3"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </button>
                        )}
                      </>
                    ) : null}
                  </div>
                )}
                <div className="flex-1 overflow-y-auto">
                  {/* Panels — routed by (activeTopTab, activeSubTab) and activeSecondarySurface */}
                  <PanelRouter />
                </div>
              </>
            </div>
          </div>
        </ErrorBoundary>
      </WorkspaceControllerProvider>

      {/* Command palette delete confirmation */}
      {paletteDeleteConfirm && (
        <ConfirmModal
          title={paletteDeleteConfirm.label}
          description={`This will permanently delete ${paletteDeleteConfirm.paths.length === 1 ? "this token" : `these ${paletteDeleteConfirm.paths.length} tokens`} from the "${activeSet}" set. This cannot be undone without the undo command.`}
          confirmLabel={`Delete ${paletteDeleteConfirm.paths.length === 1 ? "token" : `${paletteDeleteConfirm.paths.length} tokens`}`}
          danger
          onConfirm={handlePaletteDeleteConfirm}
          onCancel={() => setPaletteDeleteConfirm(null)}
        />
      )}

      {/* Unsaved editor changes guard */}
      {pendingNavAction && (
        <ConfirmModal
          title="You have unsaved changes"
          description="Your edits have not been saved and will be lost if you continue."
          confirmLabel="Discard changes"
          cancelLabel="Keep editing"
          danger
          onConfirm={() => {
            const action = pendingNavAction;
            setPendingNavAction(null);
            handleEditorClose();
            action();
          }}
          onCancel={() => setPendingNavAction(null)}
        />
      )}

      {/* Sync group to Figma confirmation */}
      {syncGroupPending && (
        <ConfirmModal
          title={`Create variables from "${syncGroupPending.groupPath}"?`}
          description={`This will create or update ${syncGroupPending.tokenCount} Figma variable${syncGroupPending.tokenCount !== 1 ? "s" : ""} from this group.`}
          confirmLabel="Create variables"
          onConfirm={handleSyncGroup}
          onCancel={() => setSyncGroupPending(null)}
        />
      )}

      {/* Create styles from group confirmation */}
      {syncGroupStylesPending && (
        <ConfirmModal
          title={`Create styles from "${syncGroupStylesPending.groupPath}"?`}
          description={`This will create or update ${syncGroupStylesPending.tokenCount} Figma style${syncGroupStylesPending.tokenCount !== 1 ? "s" : ""} from this group.`}
          confirmLabel="Create styles"
          onConfirm={handleSyncGroupStyles}
          onCancel={() => setSyncGroupStylesPending(null)}
        />
      )}

      {/* Variable sync progress overlay */}
      {syncGroupApplying && (
        <ProgressOverlay
          message="Syncing variables…"
          current={syncGroupProgress?.current}
          total={syncGroupProgress?.total}
        />
      )}

      {/* Style sync progress overlay */}
      {syncGroupStylesApplying && (
        <ProgressOverlay
          message="Creating styles…"
          current={syncGroupStylesProgress?.current}
          total={syncGroupStylesProgress?.total}
        />
      )}

      {/* Group Scope Editor */}
      {groupScopesPath && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-[var(--color-figma-bg)] rounded border border-[var(--color-figma-border)] shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-figma-border)]">
              <span className="text-[12px] font-semibold text-[var(--color-figma-text)]">
                Set Figma Scopes
              </span>
              <button
                onClick={() => setGroupScopesPath(null)}
                title="Close"
                aria-label="Close"
                className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 flex flex-col gap-2">
              <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
                Select scopes for all tokens in{" "}
                <span className="font-mono font-medium">{groupScopesPath}</span>
                . Empty = All scopes.
              </p>
              {(
                [
                  { label: "Fill Color", value: "FILL_COLOR" },
                  { label: "Stroke Color", value: "STROKE_COLOR" },
                  { label: "Text Fill", value: "TEXT_FILL" },
                  { label: "Effect Color", value: "EFFECT_COLOR" },
                  { label: "Width & Height", value: "WIDTH_HEIGHT" },
                  { label: "Gap / Spacing", value: "GAP" },
                  { label: "Corner Radius", value: "CORNER_RADIUS" },
                  { label: "Opacity", value: "OPACITY" },
                  { label: "Font Size", value: "FONT_SIZE" },
                  { label: "Font Family", value: "FONT_FAMILY" },
                ] as const
              ).map((scope) => (
                <label
                  key={scope.value}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={groupScopesSelected.includes(scope.value)}
                    onChange={(e) =>
                      setGroupScopesSelected((prev) =>
                        e.target.checked
                          ? [...prev, scope.value]
                          : prev.filter((s) => s !== scope.value),
                      )
                    }
                    className="w-3 h-3 rounded"
                  />
                  <span className="text-[11px] text-[var(--color-figma-text)]">
                    {scope.label}
                  </span>
                </label>
              ))}
            </div>
            {groupScopesError && (
              <div className="px-3 py-2 mx-3 mb-2 rounded bg-red-50 border border-red-200 text-[10px] text-red-700 flex items-center gap-1.5">
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="shrink-0"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 8v4M12 16h.01" />
                </svg>
                <span className="flex-1 min-w-0">{groupScopesError}</span>
              </div>
            )}
            <div className="flex gap-2 p-3 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
              <button
                onClick={() => setGroupScopesPath(null)}
                className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] text-[11px] hover:bg-[var(--color-figma-bg-hover)]"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyGroupScopes}
                disabled={groupScopesApplying}
                className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50"
              >
                {groupScopesApplying
                  ? groupScopesProgress && groupScopesProgress.total > 0
                    ? `Applying… ${groupScopesProgress.done}/${groupScopesProgress.total}`
                    : "Applying…"
                  : "Apply to group"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Set Switcher */}
      {showSetSwitcher && (
        <SetSwitcher
          sets={sets}
          activeSet={activeSet}
          onSelect={(set) => {
            guardEditorAction(() => {
              setActiveSet(set);
              navigateTo("define", "tokens");
            });
          }}
          onClose={() => setShowSetSwitcher(false)}
          onManageSets={() => {
            setShowSetSwitcher(false);
            openSecondaryPanel("sets");
          }}
          dimensions={dimensions}
        />
      )}

      {/* Command Palette */}
      {showCommandPalette && (
        <WorkspaceControllerProvider value={workspaceControllers}>
          <AppCommandPalette
            initialQuery={commandPaletteInitialQuery}
            onClose={() => setShowCommandPalette(false)}
          />
        </WorkspaceControllerProvider>
      )}

      {/* Quick Apply Picker */}
      {showQuickApply && !selectionLoading && selectedNodes.length > 0 && (
        <QuickApplyPicker
          selectedNodes={selectedNodes}
          tokenMap={allTokensFlat}
          onApply={(tokenPath, tokenType, targetProperty, resolvedValue) => {
            parent.postMessage(
              {
                pluginMessage: {
                  type: "apply-to-selection",
                  tokenPath,
                  tokenType,
                  targetProperty,
                  resolvedValue,
                },
              },
              "*",
            );
            setShowQuickApply(false);
            setSuccessToast(`Bound "${tokenPath}" to ${targetProperty}`);
          }}
          onUnbind={(targetProperty) => {
            parent.postMessage(
              {
                pluginMessage: {
                  type: "remove-binding",
                  property: targetProperty,
                },
              },
              "*",
            );
            setShowQuickApply(false);
            setSuccessToast(`Unbound ${targetProperty}`);
          }}
          onClose={() => setShowQuickApply(false)}
        />
      )}

      {/* Unified start flow */}
      {startHereState.open && (
        <WelcomePrompt
          connected={connected}
          checking={checking}
          serverUrl={serverUrl}
          activeSet={activeSet}
          allSets={sets}
          initialBranch={startHereState.initialBranch}
          isFirstRun={startHereState.firstRun}
          onClose={closeStartHere}
          onRetryConnection={retryConnection}
          onImportFigma={() => openSecondaryPanel("import")}
          onPasteJSON={() => setShowPasteModal(true)}
          onCreateToken={() =>
            setEditingToken({ path: "", set: activeSet, isCreate: true })
          }
          onGenerateColorScale={() => setShowColorScaleGen(true)}
          onTemplateCreated={(firstPath) => {
            closeStartHere();
            refreshAll();
            if (firstPath) setPendingHighlight(firstPath);
          }}
          onGuidedSetupComplete={() => {
            closeStartHere();
            refreshAll();
          }}
          onSetCreated={(name) => {
            addSetToState(name, 0);
            setActiveSet(name);
          }}
        />
      )}

      {/* Color Scale Generator */}
      {showColorScaleGen && (
        <ColorScaleGenerator
          serverUrl={serverUrl}
          activeSet={activeSet}
          existingPaths={
            new Set(
              Object.keys(allTokensFlat).filter(
                (p) => pathToSet[p] === activeSet,
              ),
            )
          }
          onClose={() => setShowColorScaleGen(false)}
          onConfirm={(firstPath) => {
            setShowColorScaleGen(false);
            refreshAll();
            if (firstPath) setPendingHighlight(firstPath);
          }}
        />
      )}

      {/* Paste Tokens modal */}
      {showPasteModal && (
        <PasteTokensModal
          serverUrl={serverUrl}
          activeSet={activeSet}
          existingPaths={
            new Set(
              Object.keys(allTokensFlat).filter(
                (p) => pathToSet[p] === activeSet,
              ),
            )
          }
          onClose={() => setShowPasteModal(false)}
          onConfirm={() => {
            setShowPasteModal(false);
            refreshAll();
          }}
          pushUndo={pushUndo}
        />
      )}

      {/* Toast stack — queues multiple toasts vertically */}
      <ToastStack
        toasts={toastStack}
        onDismiss={dismissStackToast}
        undoToast={{
          visible: toastVisible || canServerRedo,
          description: undoSlot?.description ?? null,
          onUndo: executeUndo,
          onDismiss: dismissToast,
          canUndo,
          canRedo: canRedo || canServerRedo,
          redoDescription: redoSlot?.description ?? serverRedoDescription,
          onRedo: canRedo ? executeRedo : handleServerRedo,
          undoCount,
        }}
      />

      {/* Resize handle */}
      <div
        onMouseDown={onResizeHandleMouseDown}
        className="absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize z-50 flex items-end justify-end p-[3px] opacity-30 hover:opacity-80 transition-opacity"
        style={{ touchAction: "none" }}
        title="Drag to resize"
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="currentColor"
          aria-hidden="true"
        >
          <rect x="6" y="0" width="1.5" height="1.5" rx="0.5" />
          <rect x="3" y="3" width="1.5" height="1.5" rx="0.5" />
          <rect x="6" y="3" width="1.5" height="1.5" rx="0.5" />
          <rect x="0" y="6" width="1.5" height="1.5" rx="0.5" />
          <rect x="3" y="6" width="1.5" height="1.5" rx="0.5" />
          <rect x="6" y="6" width="1.5" height="1.5" rx="0.5" />
        </svg>
      </div>
    </div>
  );
}
