import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { TokenListImperativeHandle } from "./components/tokenListTypes";
import type { ThemeManagerHandle } from "./components/ThemeManager";
import type { PublishPanelHandle } from "./components/PublishPanel";
import { ToastStack } from "./components/ToastStack";
import { useToastStack } from "./hooks/useToastStack";
import { useToastBusListener, dispatchToast } from "./shared/toastBus";
import { ConfirmModal } from "./components/ConfirmModal";
import { PasteTokensModal } from "./components/PasteTokensModal";
import { ProgressOverlay } from "./components/ProgressOverlay";
import type { ImportCompletionResult } from "./components/ImportPanelContext";
import {
  WelcomePrompt,
  type StartHereBranch,
} from "./components/WelcomePrompt";
import { ColorScaleRecipe } from "./components/ColorScaleRecipe";
import { AppCommandPalette } from "./components/AppCommandPalette";
import { SetSwitcher } from "./components/SetSwitcher";
import { SetCreateDialog } from "./components/SetCreateDialog";
import { QuickApplyPicker } from "./components/QuickApplyPicker";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { UnsavedChangesDialog } from "./components/UnsavedChangesDialog";
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
  WorkspaceId,
} from "./shared/navigationTypes";
import {
  APP_SHELL_NAVIGATION,
  CONTEXTUAL_PANEL_MIN_WIDTH,
  CONTEXTUAL_PANEL_TRANSITIONS,
  resolveWorkspaceSummary,
} from "./shared/navigationTypes";
import type {
  ThemeWorkspaceShellState,
} from "./shared/themeWorkflow";
import { summarizeThemeWorkflow } from "./shared/themeWorkflow";
import {
  DEFAULT_PUBLISH_PREFLIGHT_STATE,
  type PublishPreflightState,
} from "./shared/syncWorkflow";
import { NoticeFieldMessage } from "./shared/noticeSystem";
import { useConnectionContext } from "./contexts/ConnectionContext";
import {
  useTokenSetsContext,
  useTokenFlatMapContext,
  useRecipeContext,
} from "./contexts/TokenDataContext";
import {
  useThemeSwitcherContext,
  useResolverContext,
} from "./contexts/ThemeContext";
import {
  useSelectionContext,
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
import { useAnalyticsState } from "./hooks/useAnalyticsState";
import { useValidationCache } from "./hooks/useValidationCache";
import { useSettingsListener } from "./components/SettingsPanel";
import {
  WorkspaceControllerProvider,
  type EditorSessionRegistration,
} from "./contexts/WorkspaceControllerContext";
import type { TokenMapEntry } from "../shared/types";
import { KNOWN_CONTROLLER_MESSAGE_TYPES } from "../shared/types";
import { adaptShortcut, tokenPathToUrlSegment } from "./shared/utils";
import { SHORTCUT_KEYS, matchesShortcut } from "./shared/shortcutRegistry";
import { getMenuItems, handleMenuArrowKeys } from "./hooks/useMenuKeyboard";
import { apiFetch, ApiError } from "./shared/apiFetch";
import { STORAGE_KEYS, lsGet, lsSet, lsGetJson } from "./shared/storage";
import { findLeafByPath } from "./components/tokenListUtils";

function formatCount(
  count: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${count} ${count === 1 ? singular : plural}`;
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
    clearHandoff,
    returnFromHandoff,
  } = useNavigationContext();
  const {
    editingToken,
    setEditingToken,
    editingRecipe,
    setEditingRecipe,
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
  const { allTokensFlat, pathToSet, perSetFlat } = useTokenFlatMapContext();
  const {
    recipes,
    refreshRecipes,
    recipesBySource,
  } = useRecipeContext();
  const {
    dimensions,
    activeThemes,
    setActiveThemes,
    previewThemes,
    setPreviewThemes,
    openDimDropdown,
    setOpenDimDropdown,
    dimDropdownRef,
    themesError,
  } = useThemeSwitcherContext();
  const resolverState = useResolverContext();
  const { setPushUndo: setResolverPushUndo } = resolverState;
  const { selectedNodes, selectionLoading } = useSelectionContext();
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
  const [showSetCreateDialog, setShowSetCreateDialog] = useState(false);
  const [commandPaletteInitialQuery, setCommandPaletteInitialQuery] =
    useState("");
  const recentlyTouched = useRecentlyTouched();
  const starredTokens = useStarredTokens();
  const initialFirstRun = !lsGet(STORAGE_KEYS.FIRST_RUN_DONE);
  const [startHereState, setStartHereState] = useState<{
    open: boolean;
    initialBranch: StartHereBranch;
  }>(() => ({
    open: initialFirstRun,
    initialBranch: "root",
  }));
  // undoMaxHistory is managed by SettingsPanel; App re-reads from localStorage when it changes
  const undoHistoryRev = useSettingsListener(STORAGE_KEYS.UNDO_MAX_HISTORY);
  const undoMaxHistory = useMemo(
    () => {
      void undoHistoryRev;
      return lsGetJson<number>(STORAGE_KEYS.UNDO_MAX_HISTORY, 20) ?? 20;
    },
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
    (initialBranch: StartHereBranch = "root") => {
      dismissEphemeralOverlays();
      setStartHereState({ open: true, initialBranch });
    },
    [dismissEphemeralOverlays],
  );
  const closeStartHere = useCallback(() => {
    lsSet(STORAGE_KEYS.FIRST_RUN_DONE, "1");
    setStartHereState({ open: false, initialBranch: "root" });
  }, []);
  const openSetSwitcher = useCallback(() => {
    dismissEphemeralOverlays();
    setShowSetSwitcher(true);
  }, [dismissEphemeralOverlays, setShowSetSwitcher]);
  const toggleSetSwitcher = useCallback(() => {
    setMenuOpen(false);
    setShowCommandPalette(false);
    setShowQuickApply(false);
    setShowSetSwitcher((visible) => !visible);
  }, [setShowCommandPalette, setShowQuickApply, setShowSetSwitcher]);
  const openSetCreateDialog = useCallback(() => {
    dismissEphemeralOverlays();
    setShowSetCreateDialog(true);
  }, [dismissEphemeralOverlays]);
  const closeSetCreateDialog = useCallback(() => {
    setShowSetCreateDialog(false);
  }, []);
  useEffect(() => {
    if (!initialFirstRun || !startHereState.open) return;
    if (Object.keys(allTokensFlat).length === 0) return;
    lsSet(STORAGE_KEYS.FIRST_RUN_DONE, "1");
    setStartHereState({ open: false, initialBranch: "root" });
  }, [allTokensFlat, initialFirstRun, startHereState.open]);
  const handleImportComplete = useCallback(
    (result: ImportCompletionResult) => {
      const failureNote = result.hadFailures ? " Some items still need follow-up." : "";
      const message = `Imported ${formatCount(result.totalImportedCount, "token")} into ${formatCount(result.destinationSets.length, "set")}.${failureNote}`;
      dispatchToast(message, result.hadFailures ? "warning" : "success");
    },
    [],
  );
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
  // Wire the alias-not-found toast into EditorContext
  useEffect(() => {
    setAliasNotFoundHandler((p) =>
      setErrorToast(`Alias target not found: ${p}`),
    );
  }, [setAliasNotFoundHandler, setErrorToast]);
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
    setResolverPushUndo(pushUndo);
    return () => {
      setResolverPushUndo(undefined);
    };
  }, [pushUndo, setResolverPushUndo]);
  const onRecipeError = useCallback(
    ({ recipeId, message }: { recipeId?: string; message: string }) => {
      const label = recipeId
        ? `Recipe "${recipeId}" failed`
        : "Recipe auto-run failed";
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
    refreshRecipes();
    setTokenChangeKey((k) => k + 1);
  }, [refreshTokens, refreshRecipes]);
  const activeWorkspaceSummary = useMemo(
    () => resolveWorkspaceSummary(activeTopTab, activeSubTab),
    [activeTopTab, activeSubTab],
  );
  const activeWorkspace = activeWorkspaceSummary.workspace;
  const activeWorkspaceSection = activeWorkspaceSummary.section;
  const activeWorkspaceId = activeWorkspace.id;
  const shellMenuSurfaces = APP_SHELL_NAVIGATION.secondarySurfaces.filter(
    (surface) => surface.access === "shell-menu",
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
    onRecipeError,
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

  const editorSessionRef = useRef<EditorSessionRegistration | null>(null);
  const [pendingNavAction, setPendingNavAction] = useState<(() => void) | null>(
    null,
  );
  const [pendingUnsavedAction, setPendingUnsavedAction] = useState<
    "save" | "discard" | null
  >(null);
  const guardEditorAction = useCallback((fn: () => void) => {
    if (editorSessionRef.current?.isDirty) {
      setPendingNavAction(() => fn);
    } else {
      fn();
    }
  }, []);
  const registerEditorSession = useCallback(
    (session: EditorSessionRegistration | null) => {
      editorSessionRef.current = session;
    },
    [],
  );
  const requestEditorClose = useCallback(() => {
    const closeWhenClean = editorSessionRef.current?.closeWhenClean;
    if (!closeWhenClean) return;
    guardEditorAction(closeWhenClean);
  }, [guardEditorAction]);
  const handlePendingEditorSave = useCallback(async () => {
    const action = pendingNavAction;
    const session = editorSessionRef.current;
    setPendingUnsavedAction("save");
    setPendingNavAction(null);
    if (!session) {
      setPendingUnsavedAction(null);
      action?.();
      return;
    }
    try {
      const saved = await session.save();
      if (saved) {
        action?.();
      }
    } finally {
      setPendingUnsavedAction(null);
    }
  }, [pendingNavAction]);
  const handlePendingEditorDiscard = useCallback(async () => {
    const action = pendingNavAction;
    const session = editorSessionRef.current;
    setPendingUnsavedAction("discard");
    setPendingNavAction(null);
    try {
      if (session) {
        editorSessionRef.current = { ...session, isDirty: false };
        await session.discard();
      }
      action?.();
    } finally {
      setPendingUnsavedAction(null);
    }
  }, [pendingNavAction]);
  const handlePendingEditorCancel = useCallback(() => {
    if (pendingUnsavedAction !== null) return;
    setPendingNavAction(null);
  }, [pendingUnsavedAction]);
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
    ) {
      return;
    }
    setEditingRecipe(null);
  }, [editingRecipe, editingRecipeData, setEditingRecipe]);
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
      setEditingRecipe(null);
      setPreviewingToken(null);
      setTokensCompareMode("cross-theme");
      setTokensComparePath(path);
      setTokensCompareThemeKey((key) => key + 1);
      setShowTokensCompare(true);
      navigateTo("tokens", "tokens");
    },
    [
      navigateTo,
      setEditingRecipe,
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
      const affectedGens = recipesBySource.get(savedPath) ?? [];
      refreshAll();
      if (affectedGens.length > 0) {
        const n = affectedGens.length;
        const genIds = affectedGens.map((g) => g.id);
        pushActionToast(
          `Source token for ${n} ${n === 1 ? "recipe" : "recipes"} changed`,
          {
            label: "Re-run",
            onClick: async () => {
              for (const id of genIds) {
                try {
                  await apiFetch(`${serverUrl}/api/recipes/${id}/run`, {
                    method: "POST",
                  });
                } catch {
                  /* ignore */
                }
              }
              refreshRecipes();
            },
          },
        );
      }
    },
    [
      refreshAll,
      setHighlightedToken,
      setEditingToken,
      recipesBySource,
      pushActionToast,
      serverUrl,
      refreshRecipes,
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
  const handleNavigateToRecipe = useCallback(
    (recipeId: string) => {
      navigateTo("tokens", "tokens");
      switchContextualSurface({
        surface: "recipe-editor",
        recipe: { mode: "edit", id: recipeId },
      });
    },
    [navigateTo, switchContextualSurface],
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
    !!(editingToken || editingRecipeData || previewingToken) &&
    activeSecondarySurface === null &&
    activeTopTab === "tokens" &&
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
    cascadeDiff,
    handleReorderSet,
    handleReorderSetFull,
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

  // Create set by name — shared by the quick switcher, toolbar, and manager.
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
      activeTopTab === "tokens" &&
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
      clearHandoff();
      openSecondarySurface(panel);
    },
    [clearHandoff, dismissEphemeralOverlays, openSecondarySurface],
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
      navigateTo("inspect", "inspect");
      setTriggerCreateToken((n) => n + 1);
    }
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === "n") {
      e.preventDefault();
      dismissEphemeralOverlays();
      navigateTo("tokens", "tokens");
      setEditingToken({ path: "", set: activeSet, isCreate: true });
    }
    if (matchesShortcut(e, "GO_TO_DEFINE")) {
      e.preventDefault();
      dismissEphemeralOverlays();
      navigateTo("tokens", "tokens");
    }
    if (matchesShortcut(e, "GO_TO_APPLY")) {
      e.preventDefault();
      dismissEphemeralOverlays();
      navigateTo("inspect", "inspect");
    }
    if (matchesShortcut(e, "GO_TO_SYNC")) {
      e.preventDefault();
      dismissEphemeralOverlays();
      navigateTo("sync", "publish");
    }
    if (matchesShortcut(e, "TOGGLE_QUICK_APPLY")) {
      e.preventDefault();
      setShowQuickApply((v) => !v);
    }
    if (matchesShortcut(e, "QUICK_SWITCH_SET")) {
      e.preventDefault();
      toggleSetSwitcher();
    }
    if (matchesShortcut(e, "GO_TO_RESOLVER")) {
      e.preventDefault();
      dismissEphemeralOverlays();
      navigateTo("themes", "themes");
      setTimeout(() => {
        themeManagerHandleRef.current?.switchToOutputView();
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
    navigateTo("tokens", "tokens");
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
        navigateTo("tokens", "tokens");
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
      navigateTo("tokens", "tokens");
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
      navigateTo("tokens", "tokens");
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
      openSetCreateDialog,
      openColorScaleRecipe: () => setShowColorScaleGen(true),
      toggleQuickApply: () => setShowQuickApply((visible) => !visible),
      toggleSetSwitcher,
      openStartHere: (branch?: StartHereBranch) => openStartHere(branch),
      restartGuidedSetup: () => {
        closeSecondarySurface();
        openStartHere("guided-setup");
      },
      handleClearAllComplete: () => {
        closeSecondarySurface();
        navigateTo("tokens", "tokens");
        refreshTokens();
        openStartHere("guided-setup");
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
      registerEditorSession,
      requestEditorClose,
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
      handleNavigateToRecipe,
      flowPanelInitialPath,
      setFlowPanelInitialPath,
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
    sync: {
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
        openSetSwitcher();
      },
      onRename: startRename,
      onDuplicate: handleDuplicateSet,
      onDelete: startDelete,
      onReorder: handleReorderSet,
      onReorderFull: handleReorderSetFull,
      onOpenCreateSet: openSetCreateDialog,
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

  const workspacePrimaryAction = useMemo(() => {
    if (activeSecondarySurface === null && activeSubTab === "themes") {
      if (
        themeShellState.activeView !== "authoring" ||
        themeShellState.authoringMode === "preview"
      ) {
        return {
          label: "Back",
          onClick: () => themeManagerHandleRef.current?.returnToAuthoring(),
        };
      }

      if (themeWorkflowSummary.currentStage === "options") {
        return {
          label: "Add option",
          onClick: () => {
            guardEditorAction(() => {
              navigateTo("themes", "themes");
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
              ? "Assign sets"
              : "Fix sets"),
          onClick: () => {
            guardEditorAction(() => {
              navigateTo("themes", "themes");
              closeSecondarySurface();
              themeManagerHandleRef.current?.focusStage("set-roles");
            });
          },
        };
      }

      if (themeWorkflowSummary.currentStage === "preview") {
        return {
          label: "Preview tokens",
          onClick: () => {
            guardEditorAction(() => {
              navigateTo("themes", "themes");
              closeSecondarySurface();
              themeManagerHandleRef.current?.focusStage("preview");
            });
          },
        };
      }

      return {
        label: "Create mode",
        onClick: () => {
          guardEditorAction(() => {
            navigateTo("themes", "themes");
            closeSecondarySurface();
            themeManagerHandleRef.current?.openCreateAxis();
          });
        },
      };
    }

    if (
      activeSecondarySurface === null &&
      activeWorkspace.id === "inspect" &&
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
      activeSubTab === "health"
    ) {
      return {
        label: "Refresh audit",
        onClick: refreshValidation,
      };
    }

    return null;
  }, [
    activeSecondarySurface,
    activeSubTab,
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
    themeWorkflowSummary.nextSetRoleTarget?.actionLabel,
  ]);

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

  const notificationCount = notificationHistory.length;
  const utilitiesAttention = !connected || notificationCount > 0;
  const utilitiesStatusLabel = checking
    ? `Checking ${serverUrl}`
    : connected
      ? `Connected to ${serverUrl}`
      : `Server offline · ${serverUrl}`;

  const workspaceIcon = (id: WorkspaceId) => {
    const props = { width: 14, height: 14, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
    switch (id) {
      case "tokens":
        return (<svg {...props}><path d="M2 5l6-3 6 3-6 3-6-3Z" /><path d="M2 8l6 3 6-3" /><path d="M2 11l6 3 6-3" /></svg>);
      case "themes":
        return (<svg {...props}><circle cx="8" cy="8" r="5.5" /><path d="M8 2.5A5.5 5.5 0 0 1 8 13.5Z" fill="currentColor" opacity="0.2" stroke="none" /></svg>);
      case "inspect":
        return (<svg {...props}><circle cx="8" cy="8" r="4.5" /><path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3" /></svg>);
      case "sync":
        return (<svg {...props}><path d="M13 5.5A5.5 5.5 0 0 0 4.5 3.5" /><path d="M3 10.5a5.5 5.5 0 0 0 8.5 2" /><path d="M6 2l-2 2 2 2" /><path d="M10 14l2-2-2-2" /></svg>);
    }
  };

  return (
    <div className="relative flex h-screen min-h-0 overflow-hidden">
      {/* Navigation rail */}
      <nav className="flex w-11 shrink-0 flex-col items-center border-r border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] py-1.5" aria-label="Workspaces">
        <div className="flex flex-col items-center gap-0.5" role="tablist" aria-label="Workspaces">
          {APP_SHELL_NAVIGATION.workspaces.map((workspace) => {
            const isActive = workspace.id === activeWorkspaceId;
            return (
              <button
                key={workspace.id}
                role="tab"
                aria-selected={isActive}
                title={workspace.label}
                onClick={() =>
                  guardEditorAction(() => {
                    clearHandoff();
                    navigateTo(workspace.topTab, workspace.subTab);
                  })
                }
                className={`relative flex h-8 w-8 items-center justify-center rounded-lg outline-none transition-colors ${
                  isActive
                    ? "bg-[var(--color-figma-accent)]/12 text-[var(--color-figma-text)] focus-visible:ring-1 focus-visible:ring-[var(--color-figma-accent)]/40"
                    : "text-[var(--color-figma-text-tertiary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text-secondary)] focus-visible:bg-[var(--color-figma-bg-hover)] focus-visible:text-[var(--color-figma-text-secondary)] focus-visible:ring-1 focus-visible:ring-[var(--color-figma-accent)]/30"
                }`}
              >
                {isActive && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r-full bg-[var(--color-figma-accent)]" aria-hidden="true" />
                )}
                {workspaceIcon(workspace.id)}
              </button>
            );
          })}
        </div>
        <div className="mt-auto flex flex-col items-center gap-0.5">
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="relative flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-figma-text-tertiary)] outline-none hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text-secondary)] focus-visible:ring-1 focus-visible:ring-[var(--color-figma-accent)]/30 transition-colors"
              aria-label="Tools"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              title="Tools"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6.8 1.6h2.4l.3 1.8.9.4 1.5-1 1.7 1.7-1 1.5.4.9 1.8.3v2.4l-1.8.3-.4.9 1 1.5-1.7 1.7-1.5-1-.9.4-.3 1.8H6.8l-.3-1.8-.9-.4-1.5 1-1.7-1.7 1-1.5-.4-.9-1.8-.3V6.8l1.8-.3.4-.9-1-1.5L4.1 2.4l1.5 1 .9-.4z" />
                <circle cx="8" cy="8" r="2" />
              </svg>
              {utilitiesAttention && (
                <span className={`absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full ${!connected && !checking ? "bg-[var(--color-figma-error)]" : "bg-[var(--color-figma-accent)]"}`} aria-hidden="true" />
              )}
            </button>
            {menuOpen && (
              <div className="absolute left-full bottom-0 z-50 ml-1 w-52 overflow-hidden rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-lg" role="menu">
                <div className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-2">
                  <div className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">{utilitiesStatusLabel}</div>
                  {!connected && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button onClick={retryConnection} disabled={checking} className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[10px] font-medium text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)] disabled:cursor-not-allowed disabled:opacity-50">{checking ? "Checking…" : "Retry"}</button>
                      <button onClick={() => { setShowConnectionEditor((v) => !v); setConnectionUrlInput(serverUrl); setConnectionConnectResult(null); }} className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[10px] font-medium text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)]">{showConnectionEditor ? "Hide URL" : "Change URL"}</button>
                    </div>
                  )}
                  {showConnectionEditor && (
                    <div className="mt-2 flex flex-col gap-1.5">
                      <div className="flex gap-1.5">
                        <input type="text" value={connectionUrlInput} onChange={(e) => { setConnectionUrlInput(e.target.value); setConnectionConnectResult(null); }} onKeyDown={async (e) => { if (e.key !== "Enter") return; const url = connectionUrlInput.trim(); if (!url) return; setConnectionConnectResult(null); const ok = await updateServerUrlAndConnect(url); setConnectionConnectResult(ok ? "ok" : "fail"); if (ok) setShowConnectionEditor(false); }} placeholder="http://localhost:9400" autoFocus className="min-w-0 flex-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[10px] text-[var(--color-figma-text)] outline-none placeholder-[var(--color-figma-text-tertiary)] focus-visible:border-[var(--color-figma-accent)]" />
                        <button onClick={async () => { const url = connectionUrlInput.trim(); if (!url) return; setConnectionConnectResult(null); const ok = await updateServerUrlAndConnect(url); setConnectionConnectResult(ok ? "ok" : "fail"); if (ok) setShowConnectionEditor(false); }} disabled={checking || !connectionUrlInput.trim()} className="shrink-0 rounded bg-[var(--color-figma-accent)] px-2.5 py-1 text-[10px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">Connect</button>
                      </div>
                      {connectionConnectResult === "fail" && (<NoticeFieldMessage severity="error">Cannot reach server. Check the URL and try again.</NoticeFieldMessage>)}
                    </div>
                  )}
                </div>
                {shellMenuSurfaces.length > 0 && (
                  <div className="py-0.5">
                    {shellMenuSurfaces.map((surface) => (
                      <button key={surface.id} role="menuitem" tabIndex={-1} onClick={() => { setMenuOpen(false); toggleSecondarySurface(surface.id); }} className="flex w-full items-center justify-between px-3 py-1.5 text-left text-[11px] text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] outline-none focus-visible:bg-[var(--color-figma-bg-hover)] focus-visible:text-[var(--color-figma-text)]" title={surface.transition.usage}>
                        <span>{surface.label}</span>
                        <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">
                          {surface.id === "notifications"
                            ? notificationCount > 0
                              ? `${notificationCount}`
                              : ""
                            : adaptShortcut(SHORTCUT_KEYS.OPEN_SETTINGS)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {APP_SHELL_NAVIGATION.utilityMenu.sections.map((section) => (
                  <div key={section.id} className="border-t border-[var(--color-figma-border)] py-0.5">
                    {section.actions.map((action) => (
                      <button key={action.id} role="menuitem" tabIndex={-1} onClick={() => handleUtilityAction(action.id)} className="flex w-full items-center justify-between px-3 py-1.5 text-left text-[11px] text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] outline-none focus-visible:bg-[var(--color-figma-bg-hover)] focus-visible:text-[var(--color-figma-text)]" title={action.transition?.usage ?? action.description}>
                        <span>{action.id === "window-size" ? isExpanded ? "Restore window" : "Expand window" : action.label}</span>
                        <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">{utilityActionDetail(action.id)}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Content area */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="shrink-0 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
          <div className="flex items-center gap-1.5 px-3 py-1.5">
            {visibleHandoff && returnFromHandoff && (
              <button
                onClick={returnFromHandoff}
                aria-label={`Back to ${visibleHandoff.returnLabel}`}
                className="flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] text-[var(--color-figma-accent)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
              >
                &larr; {visibleHandoff.returnLabel}
              </button>
            )}

            {/* Theme mode controls */}
            {!themesError && dimensions.length > 0 && (
            <div ref={dimDropdownRef} className="flex items-center gap-1">
              {dimensions.map((dim) => {
                const activeOption = activeThemes[dim.id];
                const previewOption = previewThemes[dim.id];
                const isOpen = openDimDropdown === dim.id;
                if (dim.options.length <= 3) {
                  return (
                    <div
                      key={dim.id}
                      className="flex items-center"
                      title={dim.name}
                      onMouseLeave={() => {
                        const next = { ...previewThemes };
                        delete next[dim.id];
                        setPreviewThemes(next);
                      }}
                    >
                      <div className="flex overflow-hidden rounded border border-[var(--color-figma-border)] divide-x divide-[var(--color-figma-border)]">
                        {dim.options.map((opt: { name: string }) => {
                          const isActive = activeOption === opt.name;
                          const isPreviewing = previewOption === opt.name && previewOption !== activeOption;
                          return (
                            <button
                              key={opt.name}
                              onClick={() => {
                                if (isActive) {
                                  const next = { ...activeThemes };
                                  delete next[dim.id];
                                  setActiveThemes(next);
                                } else {
                                  setActiveThemes({ ...activeThemes, [dim.id]: opt.name });
                                }
                                const next = { ...previewThemes };
                                delete next[dim.id];
                                setPreviewThemes(next);
                              }}
                              onMouseEnter={() => setPreviewThemes({ ...previewThemes, [dim.id]: opt.name })}
                              title={isActive ? `${dim.name}: ${opt.name} (active — click to deselect)` : `Preview ${dim.name}: ${opt.name}`}
                              className={`px-1.5 py-0.5 text-[10px] transition-colors ${
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
                  <div key={dim.id} className="relative flex items-center" title={dim.name}>
                    <button
                      onClick={() => setOpenDimDropdown(isOpen ? null : dim.id)}
                      aria-expanded={isOpen}
                      aria-haspopup="listbox"
                      aria-label={`${dim.name}: ${activeOption || "None"}`}
                      className={`flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] transition-colors ${
                        activeOption
                          ? "bg-[var(--color-figma-accent)] text-white font-medium"
                          : "border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                      }`}
                    >
                      {activeOption || dim.name}
                      <svg width="6" height="6" viewBox="0 0 8 8" fill="none" className={`transition-transform ${isOpen ? "rotate-180" : ""}`}>
                        <path d="M1 3l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    {isOpen && (
                      <div
                        className="absolute left-0 top-full z-50 mt-1 min-w-[90px] rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] py-0.5 shadow-lg"
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
                          className={`w-full px-2.5 py-0.5 text-left text-[10px] transition-colors hover:bg-[var(--color-figma-bg-hover)] ${
                            !activeOption ? "text-[var(--color-figma-accent)] font-medium" : "text-[var(--color-figma-text)]"
                          }`}
                        >
                          None
                        </button>
                        {dim.options.map((opt: { name: string }) => (
                          <button
                            key={opt.name}
                            onClick={() => {
                              setActiveThemes({ ...activeThemes, [dim.id]: opt.name });
                              setOpenDimDropdown(null);
                              const next = { ...previewThemes };
                              delete next[dim.id];
                              setPreviewThemes(next);
                            }}
                            onMouseEnter={() => setPreviewThemes({ ...previewThemes, [dim.id]: opt.name })}
                            className={`w-full px-2.5 py-0.5 text-left text-[10px] transition-colors hover:bg-[var(--color-figma-bg-hover)] ${
                              activeOption === opt.name ? "text-[var(--color-figma-accent)] font-medium" : "text-[var(--color-figma-text)]"
                            }`}
                          >
                            {opt.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex shrink-0 items-center gap-1 ml-auto">
            {shellPrimaryAction && (
              <button
                onClick={shellPrimaryAction.onClick}
                disabled={shellPrimaryAction.disabled}
                className="shrink-0 rounded-full bg-[var(--color-figma-accent)] px-2.5 py-1 text-[10px] font-medium text-white transition-[background-color,transform,opacity,box-shadow] duration-150 ease-out outline-none hover:bg-[var(--color-figma-accent-hover)] focus-visible:ring-2 focus-visible:ring-[var(--color-figma-accent)]/35 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40"
              >
                {shellPrimaryAction.label}
              </button>
            )}
            <button onClick={executeUndo} disabled={!canUndo} className="h-5 w-5 inline-flex items-center justify-center rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors disabled:opacity-30 disabled:pointer-events-none" aria-label="Undo" title={undoSlot?.description ? `Undo: ${undoSlot.description}` : "Undo"}>
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7h7a3 3 0 0 1 0 6H9" /><path d="M6 4L3 7l3 3" /></svg>
            </button>
            <button onClick={() => { if (canRedo) executeRedo(); else handleServerRedo(); }} disabled={!canRedo && !canServerRedo} className="h-5 w-5 inline-flex items-center justify-center rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors disabled:opacity-30 disabled:pointer-events-none" aria-label="Redo" title={redoSlot?.description ? `Redo: ${redoSlot.description}` : "Redo"}>
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 7H6a3 3 0 0 0 0 6h1" /><path d="M10 4l3 3-3 3" /></svg>
            </button>
          </div>
        </div>
      </div>

      <WorkspaceControllerProvider value={workspaceControllers}>
        <ErrorBoundary>
          <div className="min-h-0 flex-1 overflow-hidden">
            <PanelRouter />
          </div>
        </ErrorBoundary>
      </WorkspaceControllerProvider>
      </div>

      {/* Command palette delete confirmation */}
      {paletteDeleteConfirm && (
        <ConfirmModal
          title={paletteDeleteConfirm.label}
          description={`Delete from "${activeSet}"? Use undo to restore.`}
          confirmLabel={`Delete ${paletteDeleteConfirm.paths.length === 1 ? "token" : `${paletteDeleteConfirm.paths.length} tokens`}`}
          danger
          onConfirm={handlePaletteDeleteConfirm}
          onCancel={() => setPaletteDeleteConfirm(null)}
        />
      )}

      {/* Unsaved editor changes guard */}
      {pendingNavAction && (
        <UnsavedChangesDialog
          canSave={editorSessionRef.current?.canSave ?? false}
          busyAction={pendingUnsavedAction}
          onSave={() => {
            void handlePendingEditorSave();
          }}
          onDiscard={() => {
            void handlePendingEditorDiscard();
          }}
          onCancel={handlePendingEditorCancel}
        />
      )}

      {/* Sync group to Figma confirmation */}
      {syncGroupPending && (
        <ConfirmModal
          title={`Create variables from "${syncGroupPending.groupPath}"?`}
          description={`Create or update ${syncGroupPending.tokenCount} Figma variables?`}
          confirmLabel="Create variables"
          onConfirm={handleSyncGroup}
          onCancel={() => setSyncGroupPending(null)}
        />
      )}

      {/* Create styles from group confirmation */}
      {syncGroupStylesPending && (
        <ConfirmModal
          title={`Create styles from "${syncGroupStylesPending.groupPath}"?`}
          description={`Create or update ${syncGroupStylesPending.tokenCount} Figma styles?`}
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
            <div className="p-3 flex flex-col gap-1.5">
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
              navigateTo("tokens", "tokens");
            });
          }}
          onClose={() => setShowSetSwitcher(false)}
          onManageSets={() => {
            guardEditorAction(() => {
              setShowSetSwitcher(false);
              openSecondaryPanel("sets");
            });
          }}
          onOpenCreateSet={openSetCreateDialog}
          dimensions={dimensions}
        />
      )}

      <SetCreateDialog
        isOpen={showSetCreateDialog}
        onClose={closeSetCreateDialog}
        onCreate={createSetByName}
      />

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
          onClose={closeStartHere}
          onRetryConnection={retryConnection}
          onImportFigma={() => openSecondaryPanel("import")}
          onPasteJSON={() => setShowPasteModal(true)}
          onCreateToken={() =>
            setEditingToken({ path: "", set: activeSet, isCreate: true })
          }
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

      {/* Color Scale Recipe */}
      {showColorScaleGen && (
        <ColorScaleRecipe
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
          existingTokens={perSetFlat[activeSet] ?? {}}
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
