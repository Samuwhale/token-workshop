import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { TokenListImperativeHandle } from "./components/tokenListTypes";
import type { ThemeManagerHandle } from "./components/ThemeManager";
import type { PublishPanelHandle } from "./components/PublishPanel";
import { ToastStack } from "./components/ToastStack";
import { WorkspaceSummaryHeader } from "./components/WorkspaceSummaryHeader";
import { ApplyWorkflowControls } from "./components/ApplyWorkflowControls";
import { ThemeStageModelControls } from "./components/ThemeStageModelControls";
import { SyncWorkflowControls } from "./components/publish/SyncWorkflowControls";
import type { SelectionInspectorHandle } from "./components/SelectionInspector";
import { useToastStack } from "./hooks/useToastStack";
import { useToastBusListener } from "./shared/toastBus";
import { ConfirmModal } from "./components/ConfirmModal";
import { PasteTokensModal } from "./components/PasteTokensModal";
import type { ImportCompletionResult } from "./components/ImportPanelContext";
import {
  WelcomePrompt,
  type StartHereBranch,
} from "./components/WelcomePrompt";
import { ColorScaleGenerator } from "./components/ColorScaleGenerator";
import { CommandPalette } from "./components/CommandPalette";
import type { TokenEntry } from "./components/CommandPalette";
import { SetSwitcher, SetManager } from "./components/SetSwitcher";
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
  SecondarySurfaceId,
  UtilityActionId,
} from "./shared/navigationTypes";
import {
  APP_SHELL_NAVIGATION,
  CONTEXTUAL_PANEL_MIN_WIDTH,
  CONTEXTUAL_PANEL_TRANSITIONS,
  resolveWorkspace,
  resolveWorkspaceSection,
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
import { usePinnedTokens } from "./hooks/usePinnedTokens";
import { useAnalyticsState } from "./hooks/useAnalyticsState";
import { useValidationCache } from "./hooks/useValidationCache";
import { useGraphState } from "./hooks/useGraphState";
import { useCommandPaletteCommands } from "./hooks/useCommandPaletteCommands";
import { useSettingsListener } from "./components/SettingsPanel";
import type { TokenMapEntry } from "../shared/types";
import {
  KNOWN_CONTROLLER_MESSAGE_TYPES,
  PROPERTY_LABELS,
} from "../shared/types";
import { isAlias } from "../shared/resolveAlias";
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
import { summarizeApplyWorkflow } from "./components/selectionInspectorUtils";

const LAST_IMPORT_RESULT_DISMISS_MS = 30_000;

export function App() {
  // Navigation and editor state from contexts (owned by NavigationProvider and EditorProvider)
  const {
    activeTopTab,
    activeSubTab,
    activeSecondarySurface,
    navigateTo,
    openSecondarySurface,
    closeSecondarySurface,
    returnBreadcrumb,
    setReturnBreadcrumb,
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
  const [lastImportResult, setLastImportResult] =
    useState<ImportCompletionResult | null>(null);
  const [commandPaletteInitialQuery, setCommandPaletteInitialQuery] =
    useState("");
  const recentlyTouched = useRecentlyTouched();
  const starredTokens = useStarredTokens();
  const palettePinnedTokens = usePinnedTokens(activeSet);
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
    if (lastImportResult === null || LAST_IMPORT_RESULT_DISMISS_MS <= 0) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setLastImportResult(null);
    }, LAST_IMPORT_RESULT_DISMISS_MS);

    return () => window.clearTimeout(timeoutId);
  }, [lastImportResult]);
  const handleImportComplete = useCallback((result: ImportCompletionResult) => {
    setLastImportResult(result);
  }, []);
  const {
    toasts: toastStack,
    dismiss: dismissStackToast,
    pushSuccess: setSuccessToast,
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
  useToastBusListener(setSuccessToast, setErrorToast);
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
  const activeWorkspaceId = useMemo(
    () => toWorkspaceId(activeTopTab, activeSubTab),
    [activeTopTab, activeSubTab],
  );
  const activeWorkspace = useMemo(
    () => resolveWorkspace(activeTopTab, activeSubTab),
    [activeTopTab, activeSubTab],
  );
  const activeWorkspaceSection = useMemo(
    () => resolveWorkspaceSection(activeWorkspace, activeTopTab, activeSubTab),
    [activeWorkspace, activeTopTab, activeSubTab],
  );
  const activeSecondarySurfaceDef = useMemo(
    () => resolveSecondarySurface(activeSecondarySurface),
    [activeSecondarySurface],
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
  const applyWorkflowSummary = useMemo(
    () => summarizeApplyWorkflow(selectedNodes, allTokensFlat),
    [allTokensFlat, selectedNodes],
  );
  const [themeShellState, setThemeShellState] =
    useState<ThemeWorkspaceShellState>({
      activeView: "authoring",
      showPreview: false,
    });
  const defaultWorkspaceSummaryTitle = useMemo(
    () =>
      activeWorkspaceSection?.summaryTitle ??
      activeWorkspace.summaryTitle ??
      activeWorkspaceSection?.label ??
      activeWorkspace.label,
    [activeWorkspace, activeWorkspaceSection],
  );
  const workspaceSummaryTitle = useMemo(() => {
    if (activeSecondarySurfaceDef)
      return activeSecondarySurfaceDef.summaryTitle;
    if (activeWorkspace.id !== "themes") return defaultWorkspaceSummaryTitle;
    switch (themeShellState.activeView) {
      case "coverage":
        return "Theme coverage review";
      case "compare":
        return "Theme comparison";
      case "advanced":
        return "Advanced theme logic";
      default:
        return "Theme authoring";
    }
  }, [
    activeSecondarySurfaceDef,
    activeWorkspace.id,
    defaultWorkspaceSummaryTitle,
    themeShellState.activeView,
  ]);

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
  const selectionInspectorHandleRef = useRef<SelectionInspectorHandle | null>(
    null,
  );
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
  const isNarrow = windowWidth <= 360;

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
        setLastImportResult(null);
      }
      openSecondarySurface(panel);
    },
    [dismissEphemeralOverlays, openSecondarySurface],
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

  const { commands, activeSetPaletteTokens } = useCommandPaletteCommands({
    showPreviewSplit,
    setShowPreviewSplit,
    lintViolations,
    themeGapCount,
    tokenListSelection,
    setShowIssuesOnly,
    setFlowPanelInitialPath,
    setPaletteDeleteConfirm,
    setShowPasteModal,
    setShowColorScaleGen,
    setShowQuickApply,
    setShowSetSwitcher,
    setPendingGraphTemplate,
    refreshValidation,
    jumpToNextIssue,
    handlePaletteRename,
    handlePaletteDuplicate,
    handlePaletteMove,
    handleOpenCrossThemeCompare,
    tokenListCompareRef,
    themeManagerHandleRef,
    recentOperations,
    handleRollback,
    canRedo,
    redoSlot,
    executeRedo,
    redoableItems,
    handleServerRedo,
  });

  // All-sets flat token list for command palette "Search all sets" mode
  const paletteTokens: TokenEntry[] = useMemo(() => {
    return Object.entries(allTokensFlat).map(([path, entry]) => ({
      path,
      type: entry.$type,
      value:
        typeof entry.$value === "string"
          ? entry.$value
          : JSON.stringify(entry.$value),
      set: pathToSet[path],
      isAlias: isAlias(entry.$value),
      generatorName: derivedTokenPaths.get(path)?.name,
    }));
  }, [allTokensFlat, pathToSet, derivedTokenPaths]);

  // Pinned and recently-touched tokens for command palette quick-access sections
  const pinnedPaletteTokens: TokenEntry[] = useMemo(() => {
    return Array.from(palettePinnedTokens.paths)
      .filter((path) => allTokensFlat[path])
      .map((path) => {
        const entry = allTokensFlat[path];
        return {
          path,
          type: entry.$type,
          value:
            typeof entry.$value === "string"
              ? entry.$value
              : JSON.stringify(entry.$value),
          set: pathToSet[path],
          isAlias: isAlias(entry.$value),
        };
      });
  }, [palettePinnedTokens.paths, allTokensFlat, pathToSet]);

  const recentPaletteTokens: TokenEntry[] = useMemo(() => {
    const MAX_RECENT = 10;
    return Array.from(recentlyTouched.timestamps.entries())
      .filter(([path]) => allTokensFlat[path])
      .sort(([, a], [, b]) => b - a)
      .slice(0, MAX_RECENT)
      .map(([path]) => {
        const entry = allTokensFlat[path];
        return {
          path,
          type: entry.$type,
          value:
            typeof entry.$value === "string"
              ? entry.$value
              : JSON.stringify(entry.$value),
          set: pathToSet[path],
          isAlias: isAlias(entry.$value),
        };
      });
  }, [recentlyTouched.timestamps, allTokensFlat, pathToSet]);

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
        if (themeShellState.showPreview)
          pills.push({ label: "Live preview open", tone: "info" });
        if (themeShellState.activeView === "coverage")
          pills.push({ label: "Coverage review", tone: "info" });
        if (themeShellState.activeView === "compare")
          pills.push({ label: "Compare mode", tone: "info" });
        if (themeShellState.activeView === "advanced")
          pills.push({ label: "Resolver mode", tone: "info" });
        break;
      case "apply":
        pills.push({
          label: `${applyWorkflowSummary.selectionCount} layer${applyWorkflowSummary.selectionCount === 1 ? "" : "s"} selected`,
          tone: applyWorkflowSummary.hasSelection ? "info" : "info",
        });
        if (applyWorkflowSummary.suggestionCount > 0) {
          pills.push({
            label: `${applyWorkflowSummary.suggestionCount} best match${applyWorkflowSummary.suggestionCount === 1 ? "" : "es"} ready`,
            tone: "info",
          });
        } else if (
          !applyWorkflowSummary.hasAnyTokens &&
          applyWorkflowSummary.hasSelection
        ) {
          pills.push({ label: "Token library needed", tone: "warning" });
        }
        if (applyWorkflowSummary.allVisiblePropertiesBound) {
          pills.push({ label: "Visible properties bound", tone: "success" });
        } else if (applyWorkflowSummary.unboundPropertyCount > 0) {
          pills.push({
            label: `${applyWorkflowSummary.unboundPropertyCount} propert${applyWorkflowSummary.unboundPropertyCount === 1 ? "y" : "ies"} to bind`,
            tone: "warning",
          });
        }
        if (applyWorkflowSummary.mixedPropertyCount > 0) {
          pills.push({
            label: `${applyWorkflowSummary.mixedPropertyCount} mixed`,
            tone: "warning",
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
    applyWorkflowSummary.allVisiblePropertiesBound,
    applyWorkflowSummary.hasAnyTokens,
    applyWorkflowSummary.hasSelection,
    applyWorkflowSummary.mixedPropertyCount,
    applyWorkflowSummary.selectionCount,
    applyWorkflowSummary.suggestionCount,
    applyWorkflowSummary.unboundPropertyCount,
    checking,
    connected,
    dimensions.length,
    healthIssueCount,
    lintViolations.length,
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
    themeShellState.showPreview,
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
          : themeShellState.showPreview &&
              themeShellState.activeView === "authoring"
            ? "Live preview is open below"
            : "Review the resolved combination",
        tone: !themeWorkflowSummary.previewReady
          ? "blocked"
          : themeWorkflowSummary.currentStage === "preview" ||
              (themeShellState.showPreview &&
                themeShellState.activeView === "authoring")
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
    if (themeShellState.activeView !== "authoring") {
      actions.push({
        label:
          themeShellState.activeView === "coverage"
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
    themeShellState.showPreview,
    themeWorkflowSummary,
  ]);

  const handleSelectApplyStage = useCallback(
    (stage: "summary" | "suggestions" | "bindings" | "advanced") => {
      guardEditorAction(() => {
        navigateTo("apply", "inspect");
        closeSecondarySurface();
        selectionInspectorHandleRef.current?.focusStage(stage);
      });
    },
    [closeSecondarySurface, guardEditorAction, navigateTo],
  );

  const applyContextualControls = useMemo(() => {
    if (
      activeSecondarySurface !== null ||
      activeWorkspace.id !== "apply" ||
      activeWorkspaceSection?.id !== "inspect"
    )
      return null;

    const stages = [
      {
        id: "summary" as const,
        step: 1,
        label: "Summary",
        detail: !applyWorkflowSummary.hasSelection
          ? "Select a layer to start"
          : `${applyWorkflowSummary.selectionCount} layer${applyWorkflowSummary.selectionCount === 1 ? "" : "s"} ready to review`,
        tone: !applyWorkflowSummary.hasSelection ? "current" : "complete",
      },
      {
        id: "suggestions" as const,
        step: 2,
        label: "Best matches",
        detail: !applyWorkflowSummary.hasSelection
          ? "Pick a layer first"
          : !applyWorkflowSummary.hasAnyTokens
            ? "Create tokens before matches can surface"
            : applyWorkflowSummary.suggestionCount > 0
              ? `${applyWorkflowSummary.suggestionCount} best match${applyWorkflowSummary.suggestionCount === 1 ? "" : "es"} ready`
              : "No strong automatic matches surfaced",
        tone: !applyWorkflowSummary.hasSelection
          ? "blocked"
          : !applyWorkflowSummary.hasAnyTokens
            ? "blocked"
            : applyWorkflowSummary.suggestionCount > 0
              ? "current"
              : "pending",
        disabled: !applyWorkflowSummary.hasSelection,
      },
      {
        id: "bindings" as const,
        step: 3,
        label: "Bindings",
        detail: !applyWorkflowSummary.hasSelection
          ? "Selection required"
          : !applyWorkflowSummary.hasVisibleProperties
            ? "No token-ready properties on this selection"
            : applyWorkflowSummary.allVisiblePropertiesBound
              ? "All visible properties are already bound"
              : applyWorkflowSummary.nextUnboundProperty
                ? `Next: ${PROPERTY_LABELS[applyWorkflowSummary.nextUnboundProperty]}`
                : `${applyWorkflowSummary.unboundPropertyCount} propert${applyWorkflowSummary.unboundPropertyCount === 1 ? "y" : "ies"} left to review`,
        tone:
          !applyWorkflowSummary.hasSelection ||
          !applyWorkflowSummary.hasVisibleProperties
            ? "blocked"
            : applyWorkflowSummary.allVisiblePropertiesBound
              ? "complete"
              : "current",
        disabled: !applyWorkflowSummary.hasSelection,
      },
      {
        id: "advanced" as const,
        step: 4,
        label: "Advanced",
        detail:
          "Open sync, extract, remap, deep inspect, or filters only when the main binding flow is done",
        tone: applyWorkflowSummary.hasSelection ? "pending" : "blocked",
        disabled: !applyWorkflowSummary.hasSelection,
      },
    ];

    return (
      <ApplyWorkflowControls
        stages={stages}
        onSelectStage={handleSelectApplyStage}
      />
    );
  }, [
    activeWorkspace.id,
    activeWorkspaceSection?.id,
    activeSecondarySurface,
    applyWorkflowSummary.allVisiblePropertiesBound,
    applyWorkflowSummary.hasAnyTokens,
    applyWorkflowSummary.hasSelection,
    applyWorkflowSummary.hasVisibleProperties,
    applyWorkflowSummary.nextUnboundProperty,
    applyWorkflowSummary.selectionCount,
    applyWorkflowSummary.suggestionCount,
    applyWorkflowSummary.unboundPropertyCount,
    handleSelectApplyStage,
  ]);

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
      if (themeShellState.activeView !== "authoring") {
        return {
          label:
            themeShellState.activeView === "coverage"
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
          label: themeShellState.showPreview
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
      if (!applyWorkflowSummary.hasSelection) {
        return {
          label: "Select a layer",
          onClick: () => {},
          disabled: true,
        };
      }

      if (applyWorkflowSummary.suggestionCount > 0) {
        return {
          label: "Review matches",
          onClick: () =>
            selectionInspectorHandleRef.current?.focusStage("suggestions"),
        };
      }

      if (applyWorkflowSummary.nextUnboundProperty) {
        return {
          label: `Bind ${PROPERTY_LABELS[applyWorkflowSummary.nextUnboundProperty]}`,
          onClick: () =>
            selectionInspectorHandleRef.current?.focusStage("bindings"),
        };
      }

      return {
        label: "Review bindings",
        onClick: () =>
          selectionInspectorHandleRef.current?.focusStage("bindings"),
      };
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
    applyWorkflowSummary.hasSelection,
    applyWorkflowSummary.nextUnboundProperty,
    applyWorkflowSummary.suggestionCount,
    guardEditorAction,
    navigateTo,
    refreshValidation,
    pendingPublishCount,
    publishPreflightState.isOutdated,
    publishPreflightState.stage,
    closeSecondarySurface,
    themeShellState.activeView,
    themeShellState.showPreview,
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
            label: `${sets.length} set${sets.length === 1 ? "" : "s"}`,
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
  const shellPrimaryAction =
    activeSecondarySurface === null ? workspacePrimaryAction : null;
  const shellContextualControls =
    activeSecondarySurface === null ? workspaceContextualControls : null;

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

  return (
    <div className="relative flex flex-col h-screen">
      {/* Workspace shell */}
      <div className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
        <div className="flex items-start justify-between gap-3 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-figma-text-tertiary)]">
              Workspaces
            </div>
            <div
              className="mt-1 flex min-w-0 items-center gap-1 overflow-x-auto rounded-[14px] border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-1"
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
                        setReturnBreadcrumb(null);
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
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
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
                    <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-figma-text-tertiary)]">
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
                        <label className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-figma-text-tertiary)]">
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
                        <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-figma-text-tertiary)]">
                          Settings & shortcuts
                        </div>
                        <div className="mt-0.5 text-[10px] text-[var(--color-figma-text-secondary)]">
                          Reference surfaces that stay open in the shell.
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
                            {surface.id === "shortcuts"
                              ? adaptShortcut(SHORTCUT_KEYS.SHOW_SHORTCUTS)
                              : adaptShortcut(SHORTCUT_KEYS.OPEN_SETTINGS)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {APP_SHELL_NAVIGATION.utilityMenu.sections.map((section) => (
                    <div key={section.id}>
                      <div className="border-t border-[var(--color-figma-border)]" />
                      <div className="px-3 py-1.5">
                        <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-figma-text-tertiary)]">
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
          title={workspaceSummaryTitle}
          sections={shellSections}
          activeSectionId={shellActiveSectionId}
          onSelectSection={(section) => {
            guardEditorAction(() => {
              navigateTo(section.topTab, section.subTab);
              if (section.subTab === "canvas-analysis") triggerHeatmapScan();
            });
          }}
          statusPills={secondarySurfacePills}
          primaryAction={shellPrimaryAction}
          contextualControls={shellContextualControls}
          returnBreadcrumb={returnBreadcrumb}
          onReturnBreadcrumb={() => {
            if (returnBreadcrumb) {
              navigateTo(returnBreadcrumb.topTab, returnBreadcrumb.subTab);
              setReturnBreadcrumb(null);
            }
          }}
        />
      </div>

      {/* Set switching surface */}
      {activeTopTab === "define" &&
        activeSubTab === "tokens" &&
        activeSecondarySurface === null &&
        sets.length > 0 && (
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

      <ErrorBoundary>
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 flex flex-col overflow-hidden">
            {activeSecondarySurface === "sets" ? (
              <SetManager
                sets={sets}
                activeSet={activeSet}
                onClose={closeSecondarySurface}
                onOpenQuickSwitch={() => {
                  closeSecondarySurface();
                  setShowSetSwitcher(true);
                }}
                onOpenGenerators={(set) => {
                  guardEditorAction(() => {
                    setActiveSet(set);
                    navigateTo("define", "generators");
                    closeSecondarySurface();
                  });
                }}
                onRename={startRename}
                onDuplicate={handleDuplicateSet}
                onDelete={startDelete}
                onReorder={handleReorderSet}
                onReorderFull={handleReorderSetFull}
                onCreateSet={createSetByName}
                onEditInfo={(set) => {
                  closeSecondarySurface();
                  openSetMetadata(set);
                }}
                onMerge={sets.length > 1 ? openMergeDialog : undefined}
                onSplit={openSplitDialog}
                setTokenCounts={setTokenCounts}
                setDescriptions={setDescriptions}
                dimensions={dimensions}
                onBulkDelete={handleBulkDeleteSets}
                onBulkDuplicate={handleBulkDuplicateSets}
                onBulkMoveToFolder={handleBulkMoveToFolder}
                renamingSet={renamingSet}
                renameValue={renameValue}
                setRenameValue={setRenameValue}
                renameError={renameError}
                setRenameError={setRenameError}
                renameInputRef={renameInputRef}
                onRenameConfirm={handleRenameConfirm}
                onRenameCancel={cancelRename}
                editingMetadataSet={editingMetadataSet}
                metadataDescription={metadataDescription}
                setMetadataDescription={setMetadataDescription}
                metadataCollectionName={metadataCollectionName}
                setMetadataCollectionName={setMetadataCollectionName}
                metadataModeName={metadataModeName}
                setMetadataModeName={setMetadataModeName}
                onMetadataClose={closeSetMetadata}
                onMetadataSave={handleSaveMetadata}
                deletingSet={deletingSet}
                onDeleteConfirm={handleDeleteSet}
                onDeleteCancel={cancelDelete}
                mergingSet={mergingSet}
                mergeTargetSet={mergeTargetSet}
                mergeConflicts={mergeConflicts}
                mergeResolutions={mergeResolutions}
                mergeChecked={mergeChecked}
                mergeLoading={mergeLoading}
                onMergeTargetChange={changeMergeTarget}
                setMergeResolutions={setMergeResolutions}
                onMergeCheckConflicts={handleCheckMergeConflicts}
                onMergeConfirm={handleConfirmMerge}
                onMergeClose={closeMergeDialog}
                splittingSet={splittingSet}
                splitPreview={splitPreview}
                splitDeleteOriginal={splitDeleteOriginal}
                splitLoading={splitLoading}
                setSplitDeleteOriginal={setSplitDeleteOriginal}
                onSplitConfirm={handleConfirmSplit}
                onSplitClose={closeSplitDialog}
              />
            ) : (
              <>
                {/* Theme/Mode switcher — always visible on tokens tab */}
                {activeTopTab === "define" &&
                  activeSubTab === "tokens" &&
                  activeSecondarySurface === null &&
                  (isNarrow && dimensions.length > 0 && !dimBarExpanded ? (
                    <button
                      onClick={() => setDimBarExpanded(true)}
                      className="flex shrink-0 items-center gap-1.5 px-2 py-1 w-full bg-[var(--color-figma-bg)] border-b border-[var(--color-figma-border)] text-left"
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
                      <span className="text-[10px] text-[var(--color-figma-text-secondary)] truncate flex-1">
                        {dimensions
                          .map((d) => activeThemes[d.id])
                          .filter(Boolean)
                          .join(" · ") || "None"}
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
                  ) : (
                    <div
                      ref={dimDropdownRef}
                      className="flex shrink-0 flex-wrap items-center gap-1.5 px-2 py-1 bg-[var(--color-figma-bg)] border-b border-[var(--color-figma-border)]"
                    >
                      <span className="text-[10px] text-[var(--color-figma-text-tertiary)] shrink-0 flex items-center gap-1">
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
                        <span className="text-[10px] text-[var(--color-figma-danger)] flex items-center gap-1">
                          Could not load themes
                          <button
                            onClick={retryThemes}
                            className="underline hover:text-[var(--color-figma-text)] transition-colors"
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
                                  <span className="text-[10px] text-[var(--color-figma-text-tertiary)] shrink-0">
                                    {dim.name}:
                                  </span>
                                  <div className="flex rounded overflow-hidden border border-[var(--color-figma-border)]">
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
                                      className={`px-2 py-0.5 text-[10px] transition-colors border-r border-[var(--color-figma-border)] ${
                                        !activeOption && !previewOption
                                          ? "bg-[var(--color-figma-accent)] text-white font-medium"
                                          : "bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                                      }`}
                                    >
                                      None
                                    </button>
                                    {dim.options.map((opt, i) => {
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
                                          className={`px-2 py-0.5 text-[10px] transition-colors ${i < dim.options.length - 1 ? "border-r border-[var(--color-figma-border)]" : ""} ${
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
                                    })}
                                  </div>
                                </div>
                              );
                            }
                            return (
                              <div
                                key={dim.id}
                                className="relative flex items-center gap-1"
                              >
                                <span className="text-[10px] text-[var(--color-figma-text-tertiary)] shrink-0">
                                  {dim.name}:
                                </span>
                                <button
                                  onClick={() =>
                                    setOpenDimDropdown(isOpen ? null : dim.id)
                                  }
                                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-colors ${
                                    activeOption
                                      ? "bg-[var(--color-figma-accent)] text-white font-medium"
                                      : "bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] border border-[var(--color-figma-border)]"
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
                                    className="absolute top-full left-0 mt-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-lg z-50 py-1 min-w-[120px]"
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
                                      className={`w-full text-left px-3 py-1.5 text-[10px] hover:bg-[var(--color-figma-bg-hover)] transition-colors ${
                                        !activeOption
                                          ? "text-[var(--color-figma-accent)] font-medium"
                                          : "text-[var(--color-figma-text)]"
                                      }`}
                                    >
                                      None
                                    </button>
                                    {dim.options.map((opt) => (
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
                                        className={`w-full text-left px-3 py-1.5 text-[10px] hover:bg-[var(--color-figma-bg-hover)] transition-colors flex items-center justify-between ${
                                          activeOption === opt.name
                                            ? "text-[var(--color-figma-accent)] font-medium"
                                            : "text-[var(--color-figma-text)]"
                                        }`}
                                      >
                                        {opt.name}
                                        {previewThemes[dim.id] === opt.name &&
                                          activeOption !== opt.name && (
                                            <span className="text-[8px] text-[var(--color-figma-text-tertiary)] ml-2 opacity-70">
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
                          <button
                            onClick={() => navigateTo("define", "themes")}
                            className="ml-auto text-[10px] text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-accent)] transition-colors px-1"
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
                        </>
                      ) : connected ? (
                        <button
                          onClick={() => navigateTo("define", "themes")}
                          className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-bg-secondary)] border border-dashed border-[var(--color-figma-border)] hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)] transition-colors"
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
                          Set up themes to manage light/dark mode, brands, and
                          more
                        </button>
                      ) : null}
                      {isNarrow && dimBarExpanded && (
                        <button
                          onClick={() => setDimBarExpanded(false)}
                          className="ml-auto text-[10px] text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text)] transition-colors px-1"
                          title="Collapse"
                          aria-label="Collapse theme bar"
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
                    </div>
                  ))}
                {/* Theme preview indicator — shown while hovering over an option that differs from active */}
                {activeTopTab === "define" &&
                  activeSubTab === "tokens" &&
                  (() => {
                    const previewEntries = dimensions
                      .filter(
                        (d) =>
                          previewThemes[d.id] &&
                          previewThemes[d.id] !== activeThemes[d.id],
                      )
                      .map((d) => `${d.name}: ${previewThemes[d.id]}`);
                    if (previewEntries.length === 0) return null;
                    return (
                      <div className="flex shrink-0 items-center gap-1.5 px-2 py-0.5 bg-amber-50 border-b border-amber-200 text-[10px] text-amber-700 pointer-events-none select-none">
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
                        <span>Previewing</span>
                        <span className="font-medium">
                          {previewEntries.join(" · ")}
                        </span>
                        <span className="opacity-60">— click to apply</span>
                      </div>
                    );
                  })()}
                <div className="flex-1 overflow-y-auto">
                  {/* Panels — routed by (activeTopTab, activeSubTab) and activeSecondarySurface */}
                  <PanelRouter
                    useSidePanel={useSidePanel}
                    contextualEditorTransition={contextualEditorTransition}
                    splitPreviewTransition={
                      CONTEXTUAL_PANEL_TRANSITIONS.splitPreview
                    }
                    showPreviewSplit={showPreviewSplit}
                    setShowPreviewSplit={setShowPreviewSplit}
                    guardEditorAction={guardEditorAction}
                    editorIsDirtyRef={editorIsDirtyRef}
                    editorCloseRef={editorCloseRef}
                    displayedLeafNodesRef={displayedLeafNodesRef}
                    tokenListCompareRef={tokenListCompareRef}
                    handleEditorNavigate={handleEditorNavigate}
                    handleEditorSave={handleEditorSave}
                    handleEditorSaveAndCreateAnother={
                      handleEditorSaveAndCreateAnother
                    }
                    handlePreviewEdit={handlePreviewEdit}
                    handlePreviewClose={handlePreviewClose}
                    splitRatio={splitRatio}
                    splitValueNow={splitValueNow}
                    splitContainerRef={splitContainerRef}
                    handleSplitDragStart={handleSplitDragStart}
                    handleSplitKeyDown={handleSplitKeyDown}
                    availableFonts={availableFonts}
                    fontWeightsByFamily={fontWeightsByFamily}
                    showIssuesOnly={showIssuesOnly}
                    setShowIssuesOnly={setShowIssuesOnly}
                    lintViolations={lintViolations}
                    cascadeDiff={cascadeDiff ?? null}
                    validationIssues={validationIssues}
                    validationSummary={validationSummary}
                    validationLoading={validationLoading}
                    validationError={validationError}
                    validationLastRefreshed={validationLastRefreshed}
                    validationIsStale={validationIsStale}
                    refreshValidation={refreshValidation}
                    recentOperations={recentOperations}
                    totalOperations={totalOperations}
                    hasMoreOperations={hasMoreOperations}
                    loadMoreOperations={loadMoreOperations}
                    handleRollback={handleRollback}
                    handleServerRedo={handleServerRedo}
                    undoDescriptions={undoDescriptions}
                    redoableOpIds={redoableOpIds}
                    executeUndo={executeUndo}
                    canUndo={canUndo}
                    setSyncGroupPending={setSyncGroupPending}
                    setSyncGroupStylesPending={setSyncGroupStylesPending}
                    setGroupScopesPath={setGroupScopesPath}
                    setGroupScopesSelected={setGroupScopesSelected}
                    setGroupScopesError={setGroupScopesError}
                    tokenChangeKey={tokenChangeKey}
                    pendingGraphTemplate={pendingGraphTemplate}
                    setPendingGraphTemplate={setPendingGraphTemplate}
                    pendingGraphFromGroup={pendingGraphFromGroup}
                    setPendingGraphFromGroup={setPendingGraphFromGroup}
                    focusGeneratorId={focusGeneratorId}
                    setFocusGeneratorId={setFocusGeneratorId}
                    pendingOpenPicker={pendingOpenPicker}
                    setPendingOpenPicker={setPendingOpenPicker}
                    themeManagerHandleRef={themeManagerHandleRef}
                    publishPanelHandleRef={publishPanelHandleRef}
                    selectionInspectorHandleRef={selectionInspectorHandleRef}
                    onTokenDragStart={(paths, fromSet) =>
                      setTokenDragState({ paths, fromSet })
                    }
                    onTokenDragEnd={() => setTokenDragState(null)}
                    refreshAll={refreshAll}
                    pushUndo={pushUndo}
                    setErrorToast={setErrorToast}
                    setSuccessToast={setSuccessToast}
                    handleNavigateToSet={handleNavigateToSet}
                    setFlowPanelInitialPath={setFlowPanelInitialPath}
                    flowPanelInitialPath={flowPanelInitialPath}
                    openCommandPaletteWithQuery={(query: string) => {
                      setCommandPaletteInitialQuery(
                        ">" + (query ? " " + query : ""),
                      );
                      setShowCommandPalette(true);
                    }}
                    handleNavigateToGenerator={handleNavigateToGenerator}
                    setThemeGapCount={setThemeGapCount}
                    onThemeShellStateChange={setThemeShellState}
                    triggerCreateToken={triggerCreateToken}
                    recentlyTouched={recentlyTouched}
                    starredTokens={starredTokens}
                    onImportComplete={handleImportComplete}
                    onShowPasteModal={() => setShowPasteModal(true)}
                    onShowImportPanel={() => openSecondaryPanel("import")}
                    onShowColorScaleGen={() => setShowColorScaleGen(true)}
                    onOpenStartHere={(branch) => openStartHere(branch)}
                    onRestartGuidedSetup={() => {
                      closeSecondarySurface();
                      openStartHere("guided-setup");
                    }}
                    onClearAllComplete={() => {
                      closeSecondarySurface();
                      navigateTo("define", "tokens");
                      refreshTokens();
                      openStartHere("guided-setup", true);
                    }}
                    notificationHistory={notificationHistory}
                    clearNotificationHistory={clearNotificationHistory}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </ErrorBoundary>

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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-[240px] rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-xl px-4 py-4 flex flex-col items-center gap-3">
            <svg
              className="animate-spin text-[var(--color-figma-accent)]"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 12a9 9 0 11-6.219-8.56" />
            </svg>
            <div className="text-center">
              <p className="text-[12px] font-semibold text-[var(--color-figma-text)]">
                {syncGroupProgress && syncGroupProgress.total > 0
                  ? `Syncing variables… ${syncGroupProgress.current} / ${syncGroupProgress.total}`
                  : "Syncing variables…"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Style sync progress overlay */}
      {syncGroupStylesApplying && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-[240px] rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-xl px-4 py-4 flex flex-col items-center gap-3">
            <svg
              className="animate-spin text-[var(--color-figma-accent)]"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 12a9 9 0 11-6.219-8.56" />
            </svg>
            <div className="text-center">
              <p className="text-[12px] font-semibold text-[var(--color-figma-text)]">
                {syncGroupStylesProgress && syncGroupStylesProgress.total > 0
                  ? `Creating styles… ${syncGroupStylesProgress.current} / ${syncGroupStylesProgress.total}`
                  : "Creating styles…"}
              </p>
            </div>
          </div>
        </div>
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
        <CommandPalette
          initialQuery={commandPaletteInitialQuery}
          commands={commands}
          tokens={activeSetPaletteTokens}
          allSetTokens={paletteTokens}
          pinnedTokens={pinnedPaletteTokens}
          recentTokens={recentPaletteTokens}
          onGoToToken={(path) => {
            const targetSet = pathToSet[path];
            navigateTo("define", "tokens");
            setEditingToken(null);
            if (targetSet && targetSet !== activeSet) {
              setActiveSet(targetSet);
              setPendingHighlight(path);
            } else {
              setHighlightedToken(path);
            }
          }}
          onGoToGroup={(groupPath) => {
            navigateTo("define", "tokens");
            setEditingToken(null);
            setHighlightedToken(groupPath);
          }}
          onCopyTokenPath={(path) => {
            navigator.clipboard.writeText(path).catch((err) => {
              console.warn("[App] clipboard write failed for token path:", err);
            });
          }}
          onCopyTokenRef={(path) => {
            navigator.clipboard.writeText(`{${path}}`).catch((err) => {
              console.warn("[App] clipboard write failed for token ref:", err);
            });
          }}
          onCopyTokenValue={(value) => {
            navigator.clipboard.writeText(value).catch((err) => {
              console.warn(
                "[App] clipboard write failed for token value:",
                err,
              );
            });
          }}
          onCopyTokenCssVar={(path) => {
            const cssVar = `var(--${path.replace(/\./g, "-")})`;
            navigator.clipboard.writeText(cssVar).catch((err) => {
              console.warn("[App] clipboard write failed for CSS var:", err);
            });
          }}
          onDuplicateToken={handlePaletteDuplicate}
          onRenameToken={handlePaletteRename}
          onMoveToken={handlePaletteMove}
          onDeleteToken={handlePaletteDeleteToken}
          onClose={() => setShowCommandPalette(false)}
        />
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
