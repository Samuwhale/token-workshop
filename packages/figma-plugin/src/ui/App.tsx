import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { TokenListImperativeHandle } from "./components/tokenListTypes";
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
import { AppCommandPalette } from "./components/AppCommandPalette";
import { CollectionCreateDialog } from "./components/CollectionCreateDialog";
import { QuickApplyPicker } from "./components/QuickApplyPicker";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Tooltip } from "./shared/Tooltip";
import { UnsavedChangesDialog } from "./components/UnsavedChangesDialog";
import { PanelRouter } from "./panels/PanelRouter";
import { useServerEvents } from "./hooks/useServerEvents";
import type { CollectionSummary, TokenNode } from "./hooks/useTokens";
import { useUndo } from "./hooks/useUndo";
import { useLint } from "./hooks/useLint";
import { usePreviewSplit } from "./hooks/usePreviewSplit";
import { useAvailableFonts } from "./hooks/useAvailableFonts";
import { useWindowExpand } from "./hooks/useWindowExpand";
import { useWindowResize } from "./hooks/useWindowResize";
import type {
  SecondarySurfaceId,
} from "./shared/navigationTypes";
import {
  CONTEXTUAL_PANEL_TRANSITIONS,
  SIDEBAR_GROUPS,
  WORKSPACE_TABS,
  resolveWorkspaceSummary,
} from "./shared/navigationTypes";
import type { SidebarItem, WorkspaceSection } from "./shared/navigationTypes";
import {
  DEFAULT_PUBLISH_PREFLIGHT_STATE,
  type PublishPreflightState,
} from "./shared/syncWorkflow";
import { useConnectionContext } from "./contexts/ConnectionContext";
import {
  useCollectionStateContext,
  useTokenFlatMapContext,
  useGeneratorContext,
} from "./contexts/TokenDataContext";
import {
  useResolverContext,
} from "./contexts/CollectionContext";
import {
  useSelectionContext,
  useHeatmapContext,
  useUsageContext,
} from "./contexts/InspectContext";
import { useNavigationContext } from "./contexts/NavigationContext";
import { useEditorContext } from "./contexts/EditorContext";
import { useFigmaSync } from "./hooks/useFigmaSync";
import { useCollectionRename } from "./hooks/useCollectionRename";
import { useCollectionDelete } from "./hooks/useCollectionDelete";
import { useCollectionDuplicate } from "./hooks/useCollectionDuplicate";
import { useCollectionMergeSplit } from "./hooks/useCollectionMergeSplit";
import { useCollectionMetadata } from "./hooks/useCollectionMetadata";
import { useModalVisibility } from "./hooks/useModalVisibility";
import { useRecentOperations } from "./hooks/useRecentOperations";
import { useRecentlyTouched } from "./hooks/useRecentlyTouched";
import { useStarredTokens } from "./hooks/useStarredTokens";
import { useAnalyticsState } from "./hooks/useAnalyticsState";
import { useValidationCache } from "./hooks/useValidationCache";
import { usePublishRouting } from "./hooks/usePublishRouting";
import { useSettingsListener } from "./components/SettingsPanel";
import {
  WorkspaceControllerProvider,
  type EditorSessionRegistration,
} from "./contexts/WorkspaceControllerContext";
import type { TokenMapEntry } from "../shared/types";
import { KNOWN_CONTROLLER_MESSAGE_TYPES } from "../shared/types";
import { tokenPathToUrlSegment } from "./shared/utils";
import { matchesShortcut } from "./shared/shortcutRegistry";
import { apiFetch } from "./shared/apiFetch";
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
    clearHandoff,
    notificationsOpen,
    toggleNotifications,
    closeNotifications,
  } = useNavigationContext();
  const {
    editingToken,
    setEditingToken,
    editingGeneratedGroup,
    setEditingGeneratedGroup,
    previewingToken,
    setPreviewingToken,
    inspectingCollection,
    setHighlightedToken,
    setPendingHighlight,
    setPendingHighlightForCollection,
    setAliasNotFoundHandler,
    setShowTokensCompare,
    setTokensCompareMode,
    setTokensComparePath,
    setTokensCompareModeKey,
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
  const {
    connected,
    checking,
    serverUrl,
    getDisconnectSignal,
    markDisconnected,
    retryConnection,
  } = useConnectionContext();
  const {
    collections,
    currentCollectionId,
    setCurrentCollectionId,
    currentCollectionTokens: tokens,
    collectionDescriptions,
    refreshCollections: refreshTokens,
    syncCollectionSummariesToState,
    addCollectionToState,
    removeCollectionFromState,
    renameCollectionInState,
    updateCollectionMetadataInState,
    fetchTokensForCollection,
  } = useCollectionStateContext();
  const collectionIds = useMemo(
    () => collections.map((collection) => collection.id),
    [collections],
  );
  const {
    allTokensFlat,
    pathToCollectionId,
    perCollectionFlat,
    modeResolvedTokensFlat,
  } = useTokenFlatMapContext();
  const {
    generators,
    refreshGenerators,
    generatorsBySource,
  } = useGeneratorContext();
  const resolverState = useResolverContext();
  const { setPushUndo: setResolverPushUndo } = resolverState;
  const { selectedNodes, selectionLoading } = useSelectionContext();
  const { triggerHeatmapScan } = useHeatmapContext();
  const { triggerUsageScan } = useUsageContext();
  const { families: availableFonts, weightsByFamily: fontWeightsByFamily } =
    useAvailableFonts();
  const { collectionMap, modeMap, savePublishRouting } = usePublishRouting(
    serverUrl,
    connected,
    collectionIds.join("\u0000"),
  );
  const {
    showPasteModal,
    setShowPasteModal,
    showCommandPalette,
    setShowCommandPalette,
    showQuickApply,
    setShowQuickApply,
  } = useModalVisibility();
  const [showCollectionCreateDialog, setShowCollectionCreateDialog] = useState(false);
  const [collectionRailFocusRequestKey, setCollectionRailFocusRequestKey] = useState(0);
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
    setShowCommandPalette(false);
    setShowQuickApply(false);
  }, [setShowCommandPalette, setShowQuickApply]);
  const handleInspectedCollectionRename = useCallback(
    (oldCollectionId: string, newCollectionId: string) => {
      if (inspectingCollection?.collectionId !== oldCollectionId) {
        return;
      }
      switchContextualSurface({
        surface: "collection-details",
        collection: { collectionId: newCollectionId },
      });
    },
    [inspectingCollection, switchContextualSurface],
  );
  const handleInspectedCollectionDelete = useCallback(
    (deletedCollectionId: string, nextCollectionId: string) => {
      if (inspectingCollection?.collectionId !== deletedCollectionId) {
        return;
      }
      if (nextCollectionId) {
        switchContextualSurface({
          surface: "collection-details",
          collection: { collectionId: nextCollectionId },
        });
        return;
      }
      switchContextualSurface({ surface: null });
    },
    [inspectingCollection, switchContextualSurface],
  );
  const handleCollectionRenameComplete = useCallback(
    (oldCollectionId: string, newCollectionId: string) => {
      handleInspectedCollectionRename(oldCollectionId, newCollectionId);
      recentlyTouched.renameCollection(oldCollectionId, newCollectionId);
      starredTokens.renameCollection(oldCollectionId, newCollectionId);
    },
    [handleInspectedCollectionRename, recentlyTouched, starredTokens],
  );
  const handleCollectionDeleteComplete = useCallback(
    (deletedCollectionId: string, nextCollectionId: string) => {
      handleInspectedCollectionDelete(deletedCollectionId, nextCollectionId);
      recentlyTouched.removeForCollection(deletedCollectionId);
      starredTokens.removeForCollection(deletedCollectionId);
    },
    [handleInspectedCollectionDelete, recentlyTouched, starredTokens],
  );
  const handleInspectedCollectionMerge = useCallback(
    (sourceCollectionId: string, targetCollectionId: string) => {
      if (
        inspectingCollection?.collectionId !== sourceCollectionId &&
        inspectingCollection?.collectionId !== targetCollectionId
      ) {
        return;
      }
      switchContextualSurface({
        surface: "collection-details",
        collection: { collectionId: targetCollectionId },
      });
    },
    [inspectingCollection, switchContextualSurface],
  );
  const handleInspectedCollectionSplit = useCallback(
    ({
      sourceCollectionId,
      createdCollectionIds,
      deleteOriginal,
    }: {
      sourceCollectionId: string;
      createdCollectionIds: string[];
      deleteOriginal: boolean;
    }) => {
      if (
        !deleteOriginal ||
        inspectingCollection?.collectionId !== sourceCollectionId
      ) {
        return;
      }
      const nextCollectionId = createdCollectionIds[0] ?? "";
      if (nextCollectionId) {
        switchContextualSurface({
          surface: "collection-details",
          collection: { collectionId: nextCollectionId },
        });
        return;
      }
      switchContextualSurface({ surface: null });
    },
    [inspectingCollection, switchContextualSurface],
  );
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
  const focusCollectionRail = useCallback(() => {
    dismissEphemeralOverlays();
    navigateTo("tokens", "tokens");
    setCollectionRailFocusRequestKey((current) => current + 1);
  }, [dismissEphemeralOverlays, navigateTo]);
  const openCollectionCreateDialog = useCallback(() => {
    dismissEphemeralOverlays();
    setShowCollectionCreateDialog(true);
  }, [dismissEphemeralOverlays]);
  const closeCollectionCreateDialog = useCallback(() => {
    setShowCollectionCreateDialog(false);
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
      const message = `Imported ${formatCount(result.totalImportedCount, "token")} into ${formatCount(result.destinationCollectionIds.length, "collection")}.${failureNote}`;
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
  const onGeneratedGroupError = useCallback(
    ({ generatorId, message }: { generatorId?: string; message: string }) => {
      const label = generatorId
        ? `Generated group "${generatorId}" failed`
        : "Generated group failed";
      setErrorToast(`${label}: ${message}`);
    },
    [setErrorToast],
  );
  const onServiceError = useCallback(
    ({ collectionId, message }: { collectionId: string; message: string }) => {
      const label = collectionId ? `Failed to load "${collectionId}"` : "File load error";
      setErrorToast(`${label}: ${message}`);
    },
    [setErrorToast],
  );
  const onResizeHandleMouseDown = useWindowResize();
  useWindowExpand();
  const [triggerCreateToken, setTriggerCreateToken] = useState(0);
  const [lintKey, setLintKey] = useState(0);
  const lintViolations = useLint(serverUrl, currentCollectionId, connected, lintKey);
  // Tracks the current position for "next issue" cycling — reset when set changes
  const lintIssueIndexRef = useRef(-1);
  useEffect(() => {
    lintIssueIndexRef.current = -1;
  }, [currentCollectionId]);
  const [tokenChangeKey, setTokenChangeKey] = useState(0);
  const refreshAll = useCallback(() => {
    refreshTokens();
    setLintKey((k) => k + 1);
    refreshGenerators();
    setTokenChangeKey((k) => k + 1);
  }, [refreshTokens, refreshGenerators]);
  const activeWorkspaceSummary = useMemo(
    () => resolveWorkspaceSummary(activeTopTab, activeSubTab),
    [activeTopTab, activeSubTab],
  );
  const activeWorkspace = activeWorkspaceSummary.workspace;
  const existingPathsForCurrentCollection = useMemo(
    () =>
      new Set(
        Object.keys(allTokensFlat).filter(
          (p) => pathToCollectionId[p] === currentCollectionId,
        ),
      ),
    [allTokensFlat, pathToCollectionId, currentCollectionId],
  );
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
    onGeneratedGroupError,
    refreshAllExternal,
    onServiceError,
  );

  // Show a change-summary toast after an external file change triggers a refresh
  useEffect(() => {
    if (!externalRefreshPendingRef.current) return;
    externalRefreshPendingRef.current = false;
    const prev = prevAllTokensFlatRef.current;
    const curr = allTokensFlat;
    const prevKeys = Object.keys(prev);
    // Skip if there was no prior state (initial load)
    if (prevKeys.length === 0) return;
    let added = 0,
      removed = 0,
      changed = 0;
    const prevKeySet = new Set(prevKeys);
    const currKeys = Object.keys(curr);
    for (const key of currKeys) {
      if (!prevKeySet.has(key)) {
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
    for (const key of prevKeySet) {
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
          currentCollectionId: previewingToken.currentCollectionId,
        },
      });
    });
  }, [guardEditorAction, previewingToken, switchContextualSurface]);
  const handlePreviewClose = useCallback(() => {
    setPreviewingToken(null);
  }, [setPreviewingToken]);
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
    ) {
      return;
    }
    setEditingGeneratedGroup(null);
  }, [editingGeneratedGroup, editingGeneratedGroupData, setEditingGeneratedGroup]);
  // Tracks the currently visible/filtered leaf nodes from TokenList — updated by onDisplayedLeafNodesChange
  const displayedLeafNodesRef = useRef<TokenNode[]>([]);
  const tokenListCompareRef = useRef<TokenListImperativeHandle | null>(null);
  const publishPanelHandleRef = useRef<PublishPanelHandle | null>(null);
  // Open compare view within the Tokens tab in 'cross-collection' mode for a specific token
  const handleOpenCrossCollectionCompare = useCallback(
    (path: string) => {
      setEditingToken(null);
      setEditingGeneratedGroup(null);
      setPreviewingToken(null);
      setTokensCompareMode("cross-collection");
      setTokensComparePath(path);
      setTokensCompareModeKey((key) => key + 1);
      setShowTokensCompare(true);
      navigateTo("tokens", "tokens");
    },
    [
      navigateTo,
      setEditingGeneratedGroup,
      setEditingToken,
      setPreviewingToken,
      setShowTokensCompare,
      setTokensCompareMode,
      setTokensComparePath,
      setTokensCompareModeKey,
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
          currentCollectionId: editingToken.currentCollectionId,
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
        pushActionToast(
          `Source token for ${n} ${n === 1 ? "generated group" : "generated groups"} changed`,
          {
            label: "Re-run",
            onClick: async () => {
              for (const generatedGroup of affectedGens) {
                const sourceValue =
                  generatedGroup.sourceToken
                    ? modeResolvedTokensFlat[generatedGroup.sourceToken]?.$value
                    : undefined;
                try {
                  await apiFetch(`${serverUrl}/api/generators/${generatedGroup.id}/run`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                    },
                    body:
                      sourceValue !== undefined
                        ? JSON.stringify({ sourceValue })
                        : undefined,
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
      modeResolvedTokensFlat,
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
        currentCollectionId,
        isCreate: true,
        initialType: savedType,
      });
    },
    [refreshAll, setHighlightedToken, setEditingToken, currentCollectionId],
  );
  const handleNavigateToCollection = useCallback(
    (targetCollectionId: string, tokenPath: string) => {
      if (targetCollectionId === currentCollectionId) {
        setHighlightedToken(tokenPath);
      } else {
        setPendingHighlightForCollection(tokenPath, targetCollectionId);
        setCurrentCollectionId(targetCollectionId);
      }
    },
    [currentCollectionId, setHighlightedToken, setPendingHighlightForCollection, setCurrentCollectionId],
  );
  const handleNavigateToGeneratedGroup = useCallback(
    (generatorId: string) => {
      navigateTo("tokens", "tokens");
      switchContextualSurface({
        surface: "generated-group-editor",
        generatedGroup: { mode: "edit", id: generatorId },
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => lsGet(STORAGE_KEYS.SIDEBAR_COLLAPSED) === "1",
  );
  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((previous) => {
      const next = !previous;
      lsSet(STORAGE_KEYS.SIDEBAR_COLLAPSED, next ? "1" : "0");
      return next;
    });
  }, []);
  const contextualEditorTransition = CONTEXTUAL_PANEL_TRANSITIONS.fullTakeover;

  const cascadeDiff = null;

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
    pathToCollectionId,
    collectionMap,
    modeMap,
    currentCollectionId,
  );

  useEffect(() => {
    if (syncGroupStylesError) setErrorToast(syncGroupStylesError);
  }, [syncGroupStylesError, setErrorToast]);

  useEffect(() => {
    if (syncGroupError) setErrorToast(syncGroupError);
  }, [syncGroupError, setErrorToast]);

  // Collection structure hooks
  const {
    editingMetadataCollectionId,
    metadataDescription,
    setMetadataDescription,
    openCollectionMetadata,
    handleSaveMetadata,
  } = useCollectionMetadata({
    serverUrl,
    connected,
    collectionDescriptions,
    updateCollectionMetadataInState,
    onError: setErrorToast,
  });
  const { deletingCollectionId, startDelete, cancelDelete, handleDeleteCollection } =
    useCollectionDelete({
      serverUrl,
      connected,
      getDisconnectSignal,
      collectionIds,
      currentCollectionId,
      setCurrentCollectionId,
      removeCollectionFromState,
      fetchTokensForCollection,
      refreshTokens,
      setSuccessToast,
      setErrorToast,
      markDisconnected,
      onPushUndo: pushUndo,
      onDeleteComplete: handleCollectionDeleteComplete,
    });
  const {
    renamingCollectionId,
    renameValue,
    setRenameValue,
    renameError,
    renameInputRef,
    startRename,
    cancelRename,
    handleRenameConfirm,
  } = useCollectionRename({
    serverUrl,
    connected,
    getDisconnectSignal,
    currentCollectionId,
    setCurrentCollectionId,
    renameCollectionInState,
    setSuccessToast,
    markDisconnected,
    onPushUndo: pushUndo,
    onRenameComplete: handleCollectionRenameComplete,
  });
  const { handleDuplicateCollection } = useCollectionDuplicate({
    serverUrl,
    connected,
    getDisconnectSignal,
    syncCollectionSummariesToState,
    refreshTokens,
    setSuccessToast,
    setErrorToast,
    markDisconnected,
    pushUndo,
  });
  const {
    mergingCollectionId,
    mergeTargetCollectionId,
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
    splittingCollectionId,
    splitPreview,
    splitDeleteOriginal,
    splitLoading,
    openSplitDialog,
    closeSplitDialog,
    setSplitDeleteOriginal,
    handleConfirmSplit,
  } = useCollectionMergeSplit({
    serverUrl,
    connected,
    getDisconnectSignal,
    collectionIds,
    currentCollectionId,
    setCurrentCollectionId,
    refreshTokens,
    setSuccessToast,
    setErrorToast,
    markDisconnected,
    pushUndo,
    onMergeComplete: handleInspectedCollectionMerge,
    onSplitComplete: handleInspectedCollectionSplit,
  });

  // Create a collection by name — shared by the collection rail, toolbar, and onboarding.
  const createCollectionByName = useCallback(
    async (name: string) => {
      const result = await apiFetch<{
        ok: true;
        id: string;
        collections: CollectionSummary[];
      }>(`${serverUrl}/api/collections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: name }),
        signal: AbortSignal.any([
          AbortSignal.timeout(5000),
          getDisconnectSignal(),
        ]),
      });
      syncCollectionSummariesToState(result.collections);
      setSuccessToast(`Created collection "${result.id}"`);
      return result.id;
    },
    [serverUrl, getDisconnectSignal, setSuccessToast, syncCollectionSummariesToState],
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

  const openSecondaryPanel = useCallback(
    (panel: SecondarySurfaceId) => {
      dismissEphemeralOverlays();
      closeNotifications();
      clearHandoff();
      openSecondarySurface(panel);
    },
    [clearHandoff, closeNotifications, dismissEphemeralOverlays, openSecondarySurface],
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
      navigateTo("canvas", "inspect");
      setTriggerCreateToken((n) => n + 1);
    }
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === "n") {
      e.preventDefault();
      dismissEphemeralOverlays();
      navigateTo("tokens", "tokens");
      setEditingToken({ path: "", currentCollectionId, isCreate: true });
    }
    if (matchesShortcut(e, "GO_TO_DEFINE")) {
      e.preventDefault();
      dismissEphemeralOverlays();
      navigateTo("tokens", "tokens");
    }
    if (matchesShortcut(e, "GO_TO_APPLY")) {
      e.preventDefault();
      dismissEphemeralOverlays();
      navigateTo("canvas", "inspect");
    }
    if (matchesShortcut(e, "GO_TO_SYNC")) {
      e.preventDefault();
      dismissEphemeralOverlays();
      navigateTo("publish", "sync");
    }
    if (matchesShortcut(e, "TOGGLE_QUICK_APPLY")) {
      e.preventDefault();
      setShowQuickApply((v) => !v);
    }
    if (matchesShortcut(e, "QUICK_SWITCH_COLLECTION")) {
      e.preventDefault();
      focusCollectionRail();
    }
    if (matchesShortcut(e, "GO_TO_RESOLVER")) {
      e.preventDefault();
      dismissEphemeralOverlays();
      navigateTo("tokens", "tokens");
      if (currentCollectionId) {
        switchContextualSurface({
          surface: "collection-details",
          collection: { collectionId: currentCollectionId },
        });
      }
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
      setErrorToast("No validation issues in the current collection");
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
        `${serverUrl}/api/tokens/${encodeURIComponent(currentCollectionId)}/batch-delete`,
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
              `${serverUrl}/api/tokens/${encodeURIComponent(currentCollectionId)}`,
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
            `${serverUrl}/api/tokens/${encodeURIComponent(currentCollectionId)}/batch-delete`,
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
    currentCollectionId,
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
      const targetCollectionId = pathToCollectionId[path] ?? currentCollectionId;
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
          `${serverUrl}/api/tokens/${encodeURIComponent(targetCollectionId)}/${tokenPathToUrlSegment(newPath)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
        );
        await refreshTokens();
        navigateTo("tokens", "tokens");
        if (targetCollectionId !== currentCollectionId) {
          setCurrentCollectionId(targetCollectionId);
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
      pathToCollectionId,
      currentCollectionId,
      serverUrl,
      navigateTo,
      refreshTokens,
      setCurrentCollectionId,
      setPendingHighlight,
      setHighlightedToken,
    ],
  );

  // Navigate to a token and trigger inline rename mode
  const handlePaletteRename = useCallback(
    (path: string) => {
      const targetCollectionId = pathToCollectionId[path];
      navigateTo("tokens", "tokens");
      setEditingToken(null);
      if (targetCollectionId && targetCollectionId !== currentCollectionId) {
        setCurrentCollectionId(targetCollectionId);
        setPendingHighlight(path);
      } else {
        setHighlightedToken(path);
        tokenListCompareRef.current?.triggerInlineRename(path);
      }
    },
    [
      pathToCollectionId,
      currentCollectionId,
      navigateTo,
      setEditingToken,
      setCurrentCollectionId,
      setPendingHighlight,
      setHighlightedToken,
    ],
  );

  // Trigger the move-to-collection dialog for a token
  const handlePaletteMove = useCallback(
    (path: string) => {
      const targetCollectionId = pathToCollectionId[path];
      navigateTo("tokens", "tokens");
      setEditingToken(null);
      if (targetCollectionId && targetCollectionId !== currentCollectionId) {
        setCurrentCollectionId(targetCollectionId);
        setPendingHighlight(path);
      } else {
        setHighlightedToken(path);
        tokenListCompareRef.current?.triggerMoveToken(path);
      }
    },
    [
      pathToCollectionId,
      currentCollectionId,
      navigateTo,
      setEditingToken,
      setCurrentCollectionId,
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
      openCollectionCreateDialog,
      openGeneratedPalette: () => {
        navigateTo("tokens", "tokens");
        switchContextualSurface({
          surface: "generated-group-editor",
          generatedGroup: {
            mode: "create",
            initialDraft: { selectedType: "colorRamp" },
          },
        });
      },
      toggleQuickApply: () => setShowQuickApply((visible) => !visible),
      focusCollectionRail,
      collectionRailFocusRequestKey,
      openStartHere: (branch?: StartHereBranch) => openStartHere(branch),
      restartGuidedSetup: () => {
        closeSecondarySurface();
        openStartHere("start-new");
      },
      handleClearAllComplete: () => {
        closeSecondarySurface();
        navigateTo("tokens", "tokens");
        refreshTokens();
        openStartHere("start-new");
      },
      handleImportComplete,
      notificationHistory,
      clearNotificationHistory,
    },
    editor: {
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
      handleNavigateToCollection,
      handleNavigateToGeneratedGroup,
      flowPanelInitialPath,
      setFlowPanelInitialPath,
      tokenListCompareRef,
      tokenListSelection,
      recentlyTouched,
      starredTokens,
      handleOpenCrossCollectionCompare,
      handlePaletteDuplicate,
      handlePaletteRename,
      handlePaletteMove,
      requestPaletteDelete: (paths: string[], label: string) =>
        setPaletteDeleteConfirm({ paths, label }),
      handlePaletteDeleteToken,
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
      publishPreflightState,
      pendingPublishCount,
    },
    collectionStructure: {
      onCreateCollectionByName: createCollectionByName,
      onRename: startRename,
      onDuplicate: handleDuplicateCollection,
      onDelete: startDelete,
      onEditInfo: openCollectionMetadata,
      onMerge: collectionIds.length > 1 ? openMergeDialog : undefined,
      onSplit: openSplitDialog,
      renamingCollectionId: renamingCollectionId,
      renameValue,
      setRenameValue,
      renameError,
      renameInputRef,
      onRenameConfirm: handleRenameConfirm,
      onRenameCancel: cancelRename,
      editingMetadataCollectionId: editingMetadataCollectionId,
      metadataDescription,
      setMetadataDescription,
      onMetadataSave: handleSaveMetadata,
      deletingCollectionId: deletingCollectionId,
      onDeleteConfirm: handleDeleteCollection,
      onDeleteCancel: cancelDelete,
      mergingCollectionId: mergingCollectionId,
      mergeTargetCollectionId: mergeTargetCollectionId,
      mergeConflicts,
      mergeResolutions,
      mergeChecked,
      mergeLoading,
      onMergeTargetChange: changeMergeTarget,
      setMergeResolutions,
      onMergeCheckConflicts: handleCheckMergeConflicts,
      onMergeConfirm: handleConfirmMerge,
      onMergeClose: closeMergeDialog,
      splittingCollectionId: splittingCollectionId,
      splitPreview: splitPreview ?? [],
      splitDeleteOriginal,
      splitLoading,
      setSplitDeleteOriginal,
      onSplitConfirm: handleConfirmSplit,
      onSplitClose: closeSplitDialog,
    },
  };

  const notificationCount = notificationHistory.length;

  const handleSidebarItemClick = useCallback((item: SidebarItem) => {
    guardEditorAction(() => {
      navigateTo(item.topTab, item.subTab);
      closeSecondarySurface();
      closeNotifications();
      clearHandoff();
      if (item.subTab === "canvas-analysis") {
        triggerHeatmapScan();
      }
    });
  }, [guardEditorAction, navigateTo, closeSecondarySurface, closeNotifications, clearHandoff, triggerHeatmapScan]);

  const handleSubTabClick = useCallback((section: WorkspaceSection) => {
    guardEditorAction(() => {
      navigateTo(section.topTab, section.subTab);
      if (section.id === "canvas-analysis") {
        triggerHeatmapScan();
      }
    });
  }, [guardEditorAction, navigateTo, triggerHeatmapScan]);

  return (
    <div className="relative flex h-screen min-h-0 overflow-hidden">
      <h1 className="sr-only">TokenManager</h1>
      {/* Sidebar */}
      <nav
        className={`flex ${sidebarCollapsed ? 'w-10' : 'w-[120px]'} shrink-0 flex-col border-r border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] transition-[width] duration-150 ease-[cubic-bezier(0.32,0.72,0,1)]`}
        aria-label="Workspaces"
      >
        {/* Accordion navigation */}
        <div className={`flex flex-1 flex-col overflow-y-auto overflow-x-hidden ${sidebarCollapsed ? 'px-1 pt-1.5 pb-1' : 'px-2 pt-2 pb-1'}`}>
          {SIDEBAR_GROUPS.map((group) => (
            <div key={group.id} className="flex flex-col gap-px">
              {group.items.map((item) => {
                const isWorkspaceActive = item.workspaceId === activeWorkspace.id && activeSecondarySurface === null;
                const workspace = WORKSPACE_TABS.find((w) => w.id === item.workspaceId);
                const sections = workspace?.sections ?? [];

                if (sidebarCollapsed) {
                  return (
                    <Tooltip key={item.id} label={item.label} position="right">
                      <button
                        onClick={() => handleSidebarItemClick(item)}
                        className={`flex h-8 w-8 items-center justify-center rounded-md outline-none transition-colors ${
                          isWorkspaceActive
                            ? "bg-[var(--color-figma-bg-selected)] text-[var(--color-figma-text)]"
                            : "text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] focus-visible:bg-[var(--color-figma-bg-hover)]"
                        }`}
                      >
                        {item.id === "tokens" && (
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M8 1.5L14 5v6l-6 3.5L2 11V5z" />
                          </svg>
                        )}
                        {item.id === "canvas" && (
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M2 5V2h3" /><path d="M14 5V2h-3" /><path d="M2 11v3h3" /><path d="M14 11v3h-3" />
                          </svg>
                        )}
                        {item.id === "publish" && (
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M8 10V2" /><path d="M4.5 5.5L8 2l3.5 3.5" /><path d="M3 10v3h10v-3" />
                          </svg>
                        )}
                      </button>
                    </Tooltip>
                  );
                }

                return (
                  <div key={item.id} className="mb-0.5">
                    <button
                      onClick={() => handleSidebarItemClick(item)}
                      className={`w-full rounded-md px-2.5 py-1 text-left text-[11px] outline-none transition-colors ${
                        isWorkspaceActive
                          ? "text-[var(--color-figma-text)] font-medium"
                          : "text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] focus-visible:bg-[var(--color-figma-bg-hover)]"
                      }`}
                    >
                      {item.label}
                    </button>
                    {isWorkspaceActive && sections.length > 0 && (
                      <div className="ml-2 flex flex-col gap-px">
                        {sections.map((section) => (
                          <button
                            key={section.id}
                            onClick={() => handleSubTabClick(section)}
                            className={`w-full rounded-md px-2 py-0.5 text-left text-[11px] outline-none transition-colors ${
                              activeSubTab === section.subTab
                                ? "bg-[var(--color-figma-bg-selected)] text-[var(--color-figma-text)] font-medium"
                                : "text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
                            }`}
                          >
                            {section.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Bottom utilities */}
        <div className={`flex flex-col gap-px border-t border-[var(--color-figma-border)] ${sidebarCollapsed ? 'items-center px-1 py-1.5' : 'px-2 py-2'}`}>
          {sidebarCollapsed ? (
            <>
              <div className="flex flex-col items-center gap-0.5">
                <Tooltip label={`Notifications${notificationCount > 0 ? ` (${notificationCount})` : ""}`} position="right">
                  <button
                    onClick={toggleNotifications}
                    className={`relative flex h-8 w-8 items-center justify-center rounded-md outline-none transition-colors ${
                      notificationsOpen
                        ? "bg-[var(--color-figma-bg-selected)] text-[var(--color-figma-text)]"
                        : "text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
                    }`}
                    aria-label="Notifications"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M4 5.5a4 4 0 0 1 8 0c0 2 1 3.5 1.5 4.5H2.5c.5-1 1.5-2.5 1.5-4.5z" /><path d="M6 10v.5a2 2 0 0 0 4 0V10" />
                    </svg>
                    {notificationCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--color-figma-accent)] text-[8px] font-medium text-white">{notificationCount > 9 ? "9+" : notificationCount}</span>
                    )}
                  </button>
                </Tooltip>
                <Tooltip label="Settings" position="right">
                  <button
                    onClick={() => toggleSecondarySurface("settings")}
                    className={`flex h-8 w-8 items-center justify-center rounded-md outline-none transition-colors ${
                      activeSecondarySurface === "settings"
                        ? "bg-[var(--color-figma-bg-selected)] text-[var(--color-figma-text)]"
                        : "text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
                    }`}
                    aria-label="Settings"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="8" cy="8" r="2" /><path d="M8 1v2M8 13v2M1 8h2M13 8h2M2.9 2.9l1.4 1.4M11.7 11.7l1.4 1.4M13.1 2.9l-1.4 1.4M4.3 11.7l-1.4 1.4" />
                    </svg>
                  </button>
                </Tooltip>
              </div>
              <div className="my-1 w-5 border-t border-[var(--color-figma-border)]" />
              <div className="flex flex-col items-center gap-0.5">
                <Tooltip label={undoSlot?.description ? `Undo: ${undoSlot.description}` : "Undo"} position="right">
                  <button onClick={executeUndo} disabled={!canUndo} className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors disabled:opacity-30 disabled:pointer-events-none" aria-label="Undo">
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7h7a3 3 0 0 1 0 6H9" /><path d="M6 4L3 7l3 3" /></svg>
                  </button>
                </Tooltip>
                <Tooltip label={redoSlot?.description ? `Redo: ${redoSlot.description}` : "Redo"} position="right">
                  <button onClick={() => { if (canRedo) executeRedo(); else handleServerRedo(); }} disabled={!canRedo && !canServerRedo} className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors disabled:opacity-30 disabled:pointer-events-none" aria-label="Redo">
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 7H6a3 3 0 0 0 0 6h1" /><path d="M10 4l3 3-3 3" /></svg>
                  </button>
                </Tooltip>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={toggleNotifications}
                  className={`relative flex h-6 w-6 items-center justify-center rounded-md outline-none transition-colors ${
                    notificationsOpen
                      ? "bg-[var(--color-figma-bg-selected)] text-[var(--color-figma-text)]"
                      : "text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
                  }`}
                  aria-label="Notifications"
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 5.5a4 4 0 0 1 8 0c0 2 1 3.5 1.5 4.5H2.5c.5-1 1.5-2.5 1.5-4.5z" /><path d="M6 10v.5a2 2 0 0 0 4 0V10" />
                  </svg>
                  {notificationCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-[var(--color-figma-accent)] text-[7px] font-medium text-white">{notificationCount > 9 ? "9+" : notificationCount}</span>
                  )}
                </button>
                <button
                  onClick={() => toggleSecondarySurface("settings")}
                  className={`flex h-6 w-6 items-center justify-center rounded-md outline-none transition-colors ${
                    activeSecondarySurface === "settings"
                      ? "bg-[var(--color-figma-bg-selected)] text-[var(--color-figma-text)]"
                      : "text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
                  }`}
                  aria-label="Settings"
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="8" cy="8" r="2" /><path d="M8 1v2M8 13v2M1 8h2M13 8h2M2.9 2.9l1.4 1.4M11.7 11.7l1.4 1.4M13.1 2.9l-1.4 1.4M4.3 11.7l-1.4 1.4" />
                  </svg>
                </button>
                <div className="mx-0.5 h-3.5 w-px bg-[var(--color-figma-border)]" />
                <button onClick={executeUndo} disabled={!canUndo} className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors disabled:opacity-30 disabled:pointer-events-none" aria-label="Undo" title={undoSlot?.description ? `Undo: ${undoSlot.description}` : "Undo"}>
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7h7a3 3 0 0 1 0 6H9" /><path d="M6 4L3 7l3 3" /></svg>
                </button>
                <button onClick={() => { if (canRedo) executeRedo(); else handleServerRedo(); }} disabled={!canRedo && !canServerRedo} className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors disabled:opacity-30 disabled:pointer-events-none" aria-label="Redo" title={redoSlot?.description ? `Redo: ${redoSlot.description}` : "Redo"}>
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 7H6a3 3 0 0 0 0 6h1" /><path d="M10 4l3 3-3 3" /></svg>
                </button>
              </div>
            </>
          )}
          {!connected && !sidebarCollapsed && (
            <div className="mt-1 rounded-md bg-[var(--color-figma-error)]/8 px-2.5 py-1.5">
              <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
                {checking ? "Connecting…" : "Server offline"}
              </div>
              {!checking && (
                <button
                  onClick={retryConnection}
                  className="mt-1 text-[10px] text-[var(--color-figma-accent)] hover:underline"
                >
                  Retry connection
                </button>
              )}
            </div>
          )}
          {!connected && sidebarCollapsed && (
            <Tooltip label={checking ? "Connecting…" : "Server offline"} position="right">
              <div className="mx-auto h-2 w-2 rounded-full bg-[var(--color-figma-error)]" />
            </Tooltip>
          )}
          <Tooltip label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} position="right" hidden={!sidebarCollapsed}>
            <button
              onClick={toggleSidebarCollapsed}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              className={`flex items-center justify-center rounded-md text-[var(--color-figma-text-tertiary)] outline-none transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text-secondary)] ${sidebarCollapsed ? 'mx-auto h-7 w-7' : 'h-6 w-full'}`}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {sidebarCollapsed ? (
                  <><path d="M6 3l5 5-5 5" /><path d="M1 3l5 5-5 5" /></>
                ) : (
                  <><path d="M10 3L5 8l5 5" /><path d="M15 3l-5 5 5 5" /></>
                )}
              </svg>
            </button>
          </Tooltip>
        </div>
      </nav>

      {/* Content area — no top bar */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <WorkspaceControllerProvider value={workspaceControllers}>
          <ErrorBoundary>
            <div className="min-h-0 flex-1 overflow-hidden">
              <PanelRouter
                collectionMap={collectionMap}
                modeMap={modeMap}
                savePublishRouting={savePublishRouting}
              />
            </div>
          </ErrorBoundary>
        </WorkspaceControllerProvider>
      </div>

      {/* Command palette delete confirmation */}
      {paletteDeleteConfirm && (
        <ConfirmModal
          title={paletteDeleteConfirm.label}
          description={`Delete from "${currentCollectionId}"? Use undo to restore.`}
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
        <div className="fixed inset-0 bg-[var(--color-figma-overlay)] flex items-center justify-center z-50">
          <div className="bg-[var(--color-figma-bg)] rounded border border-[var(--color-figma-border)] shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-figma-border)]">
              <span className="text-[13px] font-semibold text-[var(--color-figma-text)]">
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
              <div className="px-3 py-2 mx-3 mb-2 rounded bg-[var(--color-figma-error)]/10 border border-[var(--color-figma-error)]/30 text-[10px] text-[var(--color-figma-error)] flex items-center gap-1.5">
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

      <CollectionCreateDialog
        isOpen={showCollectionCreateDialog}
        onClose={closeCollectionCreateDialog}
        onCreate={createCollectionByName}
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
          currentCollectionId={currentCollectionId}
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
          currentCollectionId={currentCollectionId}
          collectionIds={collectionIds}
          initialBranch={startHereState.initialBranch}
          onClose={closeStartHere}
          onRetryConnection={retryConnection}
          onImportFigma={() => openSecondaryPanel("import")}
          onPasteJSON={() => setShowPasteModal(true)}
          onGuidedSetupComplete={() => {
            closeStartHere();
            refreshAll();
          }}
          onCollectionCreated={(name) => {
            void addCollectionToState(name);
            setCurrentCollectionId(name);
          }}
        />
      )}

      {/* Paste Tokens modal */}
      {showPasteModal && (
        <PasteTokensModal
          serverUrl={serverUrl}
          currentCollectionId={currentCollectionId}
          existingPaths={existingPathsForCurrentCollection}
          existingTokens={perCollectionFlat[currentCollectionId] ?? {}}
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
