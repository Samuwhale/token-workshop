import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { TokenListImperativeHandle } from "./components/tokenListTypes";
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
import type { CreateCollectionRequest } from "./components/CollectionCreateDialog";
import { QuickApplyPicker } from "./components/QuickApplyPicker";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Tooltip } from "./shared/Tooltip";
import { UnsavedChangesDialog } from "./components/UnsavedChangesDialog";
import { PanelRouter } from "./panels/PanelRouter";
import { useServerEvents } from "./hooks/useServerEvents";
import type { CollectionSummary, TokenNode } from "./hooks/useTokens";
import { useUndo } from "./hooks/useUndo";
import { useLint } from "./hooks/useLint";
import { useResizableBoundary } from "./hooks/useResizableBoundary";
import { ResizeDivider } from "./components/ResizeDivider";
import { useAvailableFonts } from "./hooks/useAvailableFonts";
import { useSelectionHealth } from "./hooks/useSelectionHealth";
import { useWindowExpand } from "./hooks/useWindowExpand";
import { useWindowResize } from "./hooks/useWindowResize";
import type {
  SecondarySurfaceId,
  SubTab,
  TopTab,
} from "./shared/navigationTypes";
import {
  SIDEBAR_GROUPS,
  WORKSPACE_TABS,
  resolveWorkspaceSummary,
} from "./shared/navigationTypes";
import type { SidebarItem, WorkspaceSection } from "./shared/navigationTypes";
import {
  useConnectionContext,
  useSyncContext,
} from "./contexts/ConnectionContext";
import {
  useCollectionStateContext,
  useTokenFlatMapContext,
} from "./contexts/TokenDataContext";
import {
  useResolverContext,
} from "./contexts/CollectionContext";
import {
  useSelectionContext,
  useUsageContext,
} from "./contexts/InspectContext";
import { useNavigationContext } from "./contexts/NavigationContext";
import { useEditorContext } from "./contexts/EditorContext";
import { useSyncState } from "./hooks/useSyncState";
import { useCollectionRename } from "./hooks/useCollectionRename";
import { useCollectionDelete } from "./hooks/useCollectionDelete";
import { useCollectionDuplicate } from "./hooks/useCollectionDuplicate";
import { useCollectionMergeSplit } from "./hooks/useCollectionMergeSplit";
import { useCollectionMetadata } from "./hooks/useCollectionMetadata";
import { useOverlayManager } from "./hooks/useOverlayManager";
import { useRecentOperations } from "./hooks/useRecentOperations";
import { useRecentlyTouched } from "./hooks/useRecentlyTouched";
import { useStarredTokens } from "./hooks/useStarredTokens";
import { useValidationCache } from "./hooks/useValidationCache";
import type { DerivationOp } from "@tokenmanager/core";
import { usePublishRouting } from "./hooks/usePublishRouting";
import { useSettingsListener } from "./components/SettingsPanel";
import {
  WorkspaceControllerProvider,
  type EditorSessionRegistration,
} from "./contexts/WorkspaceControllerContext";
import type { TokenMapEntry } from "../shared/types";
import { KNOWN_CONTROLLER_MESSAGE_TYPES } from "../shared/types";
import { getErrorMessage, stableStringify, tokenPathToUrlSegment } from "./shared/utils";
import {
  createAliasToken,
  createDerivationToken,
  detachAliasModes,
  rewireAliasModes,
} from "./shared/aliasMutations";
import { matchesShortcut } from "./shared/shortcutRegistry";
import { apiFetch, createFetchSignal } from "./shared/apiFetch";
import { getCollectionDisplayName } from "./shared/libraryCollections";
import { STORAGE_KEYS, lsGetJson } from "./shared/storage";
import {
  Layers, Frame, RefreshCw, ChevronRight, Bell, Settings,
  Undo2, Redo2, ChevronsLeft, ChevronsRight,
} from "lucide-react";

function formatCount(
  count: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

const SIDEBAR_HOVER_CLASSES =
  "hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)] focus-visible:bg-[var(--color-figma-bg-hover)]";
const RESPONSIVE_SIDEBAR_COLLAPSE_WIDTH = 560;

const SYNC_ADORNMENT_DOT: Record<"accent" | "warning" | "error", string> = {
  accent: "bg-[var(--color-figma-accent)]",
  warning: "bg-[var(--color-figma-warning)]",
  error: "bg-[var(--color-figma-error)]",
};

const SYNC_ADORNMENT_TEXT: Record<"accent" | "warning" | "error", string> = {
  accent: "text-[color:var(--color-figma-text-accent)]",
  warning: "text-[color:var(--color-figma-text-warning)]",
  error: "text-[color:var(--color-figma-text-error)]",
};

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
    tokenDetails,
    setTokenDetails,
    inspectingCollection,
    setHighlightedToken,
    setPendingHighlightForCollection,
    setAliasNotFoundHandler,
    setShowTokensCompare,
    setTokensCompareMode,
    setTokensComparePath,
    setTokensCompareModeKey,
    switchContextualSurface,
    dismissContextualTools,
  } = useEditorContext();
  const {
    connected,
    checking,
    serverUrl,
    getDisconnectSignal,
    markDisconnected,
    retryConnection,
  } = useConnectionContext();
  const { syncing, syncResult, syncError } = useSyncContext();
  const {
    collections,
    workingCollectionId: currentCollectionId,
    setWorkingCollectionId: setCurrentCollectionId,
    collectionDescriptions,
    refreshCollections: refreshTokens,
    syncCollectionSummariesToState,
    removeCollectionFromState,
    renameCollectionInState,
    updateCollectionMetadataInState,
    fetchTokensForCollection,
  } = useCollectionStateContext();
  const collectionIds = useMemo(
    () => collections.map((collection) => collection.id),
    [collections],
  );
  const librarySetupRequired = collections.length === 0;
  const {
    allTokensFlat,
    pathToCollectionId,
    collectionIdsByPath,
    perCollectionFlat,
  } = useTokenFlatMapContext();
  const resolverState = useResolverContext();
  const { setPushUndo: setResolverPushUndo } = resolverState;
  const { selectedNodes, selectionLoading } = useSelectionContext();
  const selectionHealth = useSelectionHealth(selectedNodes, allTokensFlat);
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
    showCollectionCreateDialog,
    openCollectionCreateDialog,
    closeCollectionCreateDialog,
    commandPaletteInitialQuery,
    setCommandPaletteInitialQuery,
    paletteDeleteConfirm,
    setPaletteDeleteConfirm,
    startHereState,
    dismissEphemeralOverlays,
    openStartHere,
    closeStartHere,
    finishStartHere,
  } = useOverlayManager();
  const [collectionPickerFocusRequestKey, setCollectionPickerFocusRequestKey] = useState(0);
  const recentlyTouched = useRecentlyTouched();
  const starredTokens = useStarredTokens();
  const [pendingPaletteAction, setPendingPaletteAction] = useState<{
    kind: "rename" | "move";
    path: string;
    collectionId: string;
  } | null>(null);
  // undoMaxHistory is managed by SettingsPanel; App re-reads from localStorage when it changes
  const undoHistoryRev = useSettingsListener(STORAGE_KEYS.UNDO_MAX_HISTORY);
  const undoMaxHistory = useMemo(
    () => {
      void undoHistoryRev;
      return lsGetJson<number>(STORAGE_KEYS.UNDO_MAX_HISTORY, 20) ?? 20;
    },
    [undoHistoryRev],
  );
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
  const handleCollectionMergeComplete = useCallback(
    (sourceCollectionId: string, targetCollectionId: string) => {
      handleInspectedCollectionMerge(sourceCollectionId, targetCollectionId);
      recentlyTouched.removeForCollection(sourceCollectionId);
      starredTokens.removeForCollection(sourceCollectionId);
    },
    [handleInspectedCollectionMerge, recentlyTouched, starredTokens],
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
  const handleCollectionSplitComplete = useCallback(
    ({
      sourceCollectionId,
      createdCollectionIds,
      deleteOriginal,
    }: {
      sourceCollectionId: string;
      createdCollectionIds: string[];
      deleteOriginal: boolean;
    }) => {
      handleInspectedCollectionSplit({
        sourceCollectionId,
        createdCollectionIds,
        deleteOriginal,
      });
      if (!deleteOriginal) {
        return;
      }
      recentlyTouched.removeForCollection(sourceCollectionId);
      starredTokens.removeForCollection(sourceCollectionId);
    },
    [handleInspectedCollectionSplit, recentlyTouched, starredTokens],
  );
  const openCollectionPicker = useCallback(() => {
    dismissEphemeralOverlays();
    if (inspectingCollection) {
      switchContextualSurface({ surface: null });
    }
    if (activeTopTab === "library") {
      navigateTo("library", activeSubTab);
    } else {
      navigateTo("library", "tokens");
    }
    setCollectionPickerFocusRequestKey((current) => current + 1);
  }, [
    activeSubTab,
    activeTopTab,
    dismissEphemeralOverlays,
    inspectingCollection,
    navigateTo,
    switchContextualSurface,
  ]);
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
  // Wire the alias-not-found toast into EditorContext
  useEffect(() => {
    setAliasNotFoundHandler((path, reason) => {
      if (reason === "ambiguous") {
        setErrorToast(
          `Alias target is ambiguous across collections: ${path}`,
        );
        return;
      }
      setErrorToast(`Alias target not found: ${path}`);
    });
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
  const [triggerExtractToken, setTriggerExtractToken] = useState(0);
  const [lintKey, setLintKey] = useState(0);
  const lintViolations = useLint(serverUrl, connected, lintKey);
  // Tracks the current position for "next issue" cycling — reset when set changes
  const lintIssueIndexRef = useRef(-1);
  useEffect(() => {
    lintIssueIndexRef.current = -1;
  }, [currentCollectionId]);
  const [tokenChangeKey, setTokenChangeKey] = useState(0);
  const refreshAll = useCallback(() => {
    refreshTokens();
    setLintKey((k) => k + 1);
    setTokenChangeKey((k) => k + 1);
  }, [refreshTokens]);
  const activeWorkspaceSummary = useMemo(
    () => resolveWorkspaceSummary(activeTopTab, activeSubTab),
    [activeTopTab, activeSubTab],
  );
  const activeWorkspace = activeWorkspaceSummary.workspace;
  const existingPathsForCurrentCollection = useMemo(
    () => new Set(Object.keys(perCollectionFlat[currentCollectionId] ?? {})),
    [currentCollectionId, perCollectionFlat],
  );
  const libraryTokenPathSignature = useMemo(
    () =>
      Object.entries(perCollectionFlat)
        .flatMap(([collectionId, collectionFlat]) =>
          Object.keys(collectionFlat).map((path) => `${collectionId}:${path}`),
        )
        .sort()
        .join("\0"),
    [perCollectionFlat],
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
          stableStringify(p.$value) !== stableStringify(c.$value)
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
  // Tracks the currently visible/filtered leaf nodes from TokenList — updated by onDisplayedLeafNodesChange
  const displayedLeafNodesRef = useRef<TokenNode[]>([]);
  const tokenListCompareRef = useRef<TokenListImperativeHandle | null>(null);
  // Open compare view within the Tokens tab in 'cross-collection' mode for a specific token
  const handleOpenCrossCollectionCompare = useCallback(
    (path: string) => {
      setTokenDetails(null);
      setTokensCompareMode("cross-collection");
      setTokensComparePath(path);
      setTokensCompareModeKey((key) => key + 1);
      setShowTokensCompare(true);
      navigateTo("library", "tokens");
    },
    [
      navigateTo,
      setTokenDetails,
      setShowTokensCompare,
      setTokensCompareMode,
      setTokensComparePath,
      setTokensCompareModeKey,
    ],
  );
  // Navigate the editor to the next (+1) or previous (-1) sibling in the displayed list
  const handleEditorNavigate = useCallback(
    (direction: 1 | -1) => {
      if (!tokenDetails || tokenDetails.mode !== "edit") return;
      const nodes = displayedLeafNodesRef.current;
      const idx = nodes.findIndex((n) => n.path === tokenDetails.path);
      if (idx === -1) return;
      const next = nodes[idx + direction];
      if (next) {
        setTokenDetails({
          path: next.path,
          name: next.name,
          collectionId: tokenDetails.collectionId,
          mode: "edit",
        });
        setHighlightedToken(next.path);
      }
    },
    [tokenDetails, setHighlightedToken, setTokenDetails],
  );
  const handleEditorSave = useCallback(
    (savedPath: string, _savedCollectionId: string) => {
      setHighlightedToken(savedPath);
      setTokenDetails(null);
      refreshAll();
    },
    [
      refreshAll,
      setHighlightedToken,
      setTokenDetails,
    ],
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
  const [showIssuesOnly, setShowIssuesOnly] = useState(false);
  const {
    validationIssues,
    validationLoading,
    validationError,
    validationLastRefreshed,
    validationIsStale,
    refreshValidation,
  } = useValidationCache({ serverUrl, connected, tokenChangeKey });
  // Aggregate actionable-issue count surfaced as a sidebar badge on the Review
  // section, so broken aliases / lint errors are visible without drilling in.
  const reviewBadgeCount = useMemo(() => {
    const validationActionable = (validationIssues ?? []).filter(
      (issue) => issue.severity === "error" || issue.severity === "warning",
    ).length;
    const lintActionable = lintViolations.filter(
      (violation) => violation.severity === "error" || violation.severity === "warning",
    ).length;
    return validationActionable + lintActionable;
  }, [validationIssues, lintViolations]);
  const [tokenListSelection, setTokenListSelection] = useState<string[]>([]);
  const sidebarBoundary = useResizableBoundary({
    storageKey: STORAGE_KEYS.SIDEBAR_WIDTH,
    defaultSize: 136,
    min: 40,
    max: 240,
    axis: "x",
    mode: "px",
    snap: { below: 120, to: 40 },
  });
  const [responsiveSidebarCollapsed, setResponsiveSidebarCollapsed] = useState(
    () =>
      typeof window !== "undefined" &&
      window.innerWidth < RESPONSIVE_SIDEBAR_COLLAPSE_WIDTH,
  );
  const [responsiveSidebarFlyout, setResponsiveSidebarFlyout] = useState<{
    itemId: string;
    top: number;
  } | null>(null);
  useEffect(() => {
    const updateResponsiveSidebar = () => {
      setResponsiveSidebarCollapsed(
        window.innerWidth < RESPONSIVE_SIDEBAR_COLLAPSE_WIDTH,
      );
    };
    updateResponsiveSidebar();
    window.addEventListener("resize", updateResponsiveSidebar);
    return () => window.removeEventListener("resize", updateResponsiveSidebar);
  }, []);
  const sidebarCollapsed =
    responsiveSidebarCollapsed || sidebarBoundary.size <= 40;
  const effectiveSidebarWidth = responsiveSidebarCollapsed
    ? 40
    : sidebarBoundary.size;
  const toggleSidebarCollapsed = useCallback(() => {
    sidebarBoundary.setSize(sidebarBoundary.size <= 40 ? 136 : 40);
  }, [sidebarBoundary]);
  useEffect(() => {
    if (!responsiveSidebarCollapsed) {
      setResponsiveSidebarFlyout(null);
    }
  }, [responsiveSidebarCollapsed]);
  const openResponsiveSidebarFlyout = useCallback((itemId: string, top: number) => {
    setResponsiveSidebarFlyout((current) =>
      current?.itemId === itemId
        ? null
        : {
            itemId,
            top: Math.max(8, Math.min(top, window.innerHeight - 220)),
          },
    );
  }, []);
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<string>>(
    () => new Set([activeWorkspace.id]),
  );
  const {
    publishPending,
    setPublishPending,
    publishApplying,
    publishProgress,
    handlePublish,
    pendingPublishCount,
    publishPreflightState,
    publishPanelHandleRef,
  } = useSyncState({
    connected,
    collections,
    perCollectionFlat,
    collectionMap,
    modeMap,
    setErrorToast,
  });

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
  const { renameCollection } = useCollectionRename({
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
    onMergeComplete: handleCollectionMergeComplete,
    onSplitComplete: handleCollectionSplitComplete,
  });

  // Create a collection by name — shared by dialogs, collection pickers, and onboarding.
  const createCollectionByName = useCallback(
    async ({ name, modes }: CreateCollectionRequest) => {
      const result = await apiFetch<{
        ok: true;
        id: string;
        collections: CollectionSummary[];
      }>(`${serverUrl}/api/collections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: name,
          modes: modes.map((modeName) => ({ name: modeName })),
        }),
        signal: createFetchSignal(getDisconnectSignal(), 5000),
      });
      syncCollectionSummariesToState(result.collections);
      const modeCount = modes.length;
      setSuccessToast(
        `Created "${result.id}" with ${modeCount} mode${modeCount === 1 ? "" : "s"}. Add a group or token next.`,
      );
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
      activeTopTab === "library" &&
      (activeSubTab === "tokens" || activeSubTab === "health") &&
      libraryTokenPathSignature.length > 0
    ) {
      triggerUsageScan();
    }
  }, [
    activeTopTab,
    activeSubTab,
    libraryTokenPathSignature,
    triggerUsageScan,
  ]);

  // Moving between Library sections dismisses contextual tools (compare,
  // color-analysis, import, collection-details) so they
  // don't leak into Tokens/Review/History. Only fires when both the previous
  // and next routes are inside the Library workspace — entering Library from
  // another workspace must not clobber a tool that was just opened alongside
  // the navigation (e.g. command palette "Color analysis"). The pinned token
  // editor is preserved deliberately so authors keep context.
  const previousLibraryRouteRef = useRef<{ topTab: TopTab; subTab: SubTab }>({
    topTab: activeTopTab,
    subTab: activeSubTab,
  });
  useEffect(() => {
    const prev = previousLibraryRouteRef.current;
    const prevInLibrary = prev.topTab === "library";
    const nowInLibrary = activeTopTab === "library";
    const sectionChanged = prev.subTab !== activeSubTab;
    if (prevInLibrary && nowInLibrary && sectionChanged) {
      dismissContextualTools();
    }
    previousLibraryRouteRef.current = {
      topTab: activeTopTab,
      subTab: activeSubTab,
    };
  }, [activeTopTab, activeSubTab, dismissContextualTools]);

  useEffect(() => {
    if (!librarySetupRequired || activeTopTab === "library") {
      return;
    }
    navigateTo("library", "tokens");
  }, [activeTopTab, librarySetupRequired, navigateTo]);

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
    if (matchesShortcut(e, "CREATE_FROM_SELECTION")) {
      e.preventDefault();
      dismissEphemeralOverlays();
      navigateTo("canvas", "inspect");
      setTriggerCreateToken((n) => n + 1);
    }
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === "n") {
      e.preventDefault();
      dismissEphemeralOverlays();
      navigateTo("library", "tokens");
      setTokenDetails({ path: "", collectionId: currentCollectionId, mode: "edit", isCreate: true });
    }
    if (matchesShortcut(e, "GO_TO_DEFINE")) {
      e.preventDefault();
      dismissEphemeralOverlays();
      navigateTo("library", "tokens");
    }
    if (matchesShortcut(e, "GO_TO_APPLY")) {
      e.preventDefault();
      dismissEphemeralOverlays();
      navigateTo("canvas", "inspect");
    }
    if (matchesShortcut(e, "GO_TO_SYNC")) {
      e.preventDefault();
      dismissEphemeralOverlays();
      navigateTo("publish", "publish-figma");
    }
    if (matchesShortcut(e, "TOGGLE_QUICK_APPLY")) {
      e.preventDefault();
      setShowQuickApply((v) => !v);
    }
    if (matchesShortcut(e, "QUICK_SWITCH_COLLECTION")) {
      e.preventDefault();
      openCollectionPicker();
    }
    if (matchesShortcut(e, "GO_TO_RESOLVER")) {
      e.preventDefault();
      dismissEphemeralOverlays();
      navigateTo("library", "tokens");
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
    navigateTo("library", "tokens");
    setTokenDetails(null);
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
    setTokenDetails,
    setHighlightedToken,
    setErrorToast,
    setSuccessToast,
  ]);

  const handlePaletteDeleteConfirm = useCallback(async () => {
    if (!paletteDeleteConfirm) return;
    const { paths, collectionId } = paletteDeleteConfirm;
    setPaletteDeleteConfirm(null);
    const snapshot: Record<string, { $type: string; $value: unknown }> = {};
    for (const p of paths) {
      const entry = perCollectionFlat[collectionId]?.[p] ?? allTokensFlat[p];
      if (entry) snapshot[p] = { $type: entry.$type, $value: entry.$value };
    }
    try {
      await apiFetch(
        `${serverUrl}/api/tokens/${encodeURIComponent(collectionId)}/batch-delete`,
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
              `${serverUrl}/api/tokens/${encodeURIComponent(collectionId)}`,
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
            `${serverUrl}/api/tokens/${encodeURIComponent(collectionId)}/batch-delete`,
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
    perCollectionFlat,
    serverUrl,
    pushUndo,
    refreshAll,
    setPaletteDeleteConfirm,
    setSuccessToast,
    setErrorToast,
  ]);

  useEffect(() => {
    if (!pendingPaletteAction) return;
    if (pendingPaletteAction.collectionId !== currentCollectionId) return;
    if (!perCollectionFlat[currentCollectionId]?.[pendingPaletteAction.path]) return;

    setHighlightedToken(pendingPaletteAction.path);
    const frameId = window.requestAnimationFrame(() => {
      if (pendingPaletteAction?.kind === "rename") {
        tokenListCompareRef.current?.triggerInlineRename(
          pendingPaletteAction.path,
        );
      } else if (pendingPaletteAction?.kind === "move") {
        tokenListCompareRef.current?.triggerMoveToken(
          pendingPaletteAction.path,
        );
      }
      setPendingPaletteAction(null);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [
    currentCollectionId,
    pendingPaletteAction,
    perCollectionFlat,
    setHighlightedToken,
    tokenListCompareRef,
  ]);

  // Duplicate a token from the command palette (shared between contextual command and token search button)
  const handlePaletteDuplicate = useCallback(
    async (path: string, collectionId: string) => {
      const targetCollectionId = collectionId;
      const entry =
        perCollectionFlat[targetCollectionId]?.[path] ?? allTokensFlat[path];
      if (!entry || !connected) return;
      const baseCopy = `${path}-copy`;
      let newPath = baseCopy;
      let i = 2;
      while (perCollectionFlat[targetCollectionId]?.[newPath]) {
        newPath = `${baseCopy}-${i++}`;
      }
      try {
        const body: Record<string, unknown> = {
          $type: entry.$type,
          $value: entry.$value,
        };
        if (entry.$description) body.$description = entry.$description;
        if (entry.$extensions) body.$extensions = entry.$extensions;
        await apiFetch(
          `${serverUrl}/api/tokens/${encodeURIComponent(targetCollectionId)}/${tokenPathToUrlSegment(newPath)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
        );
        await refreshTokens();
        navigateTo("library", "tokens");
        if (targetCollectionId !== currentCollectionId) {
          setCurrentCollectionId(targetCollectionId);
          setPendingHighlightForCollection(newPath, targetCollectionId);
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
      currentCollectionId,
      perCollectionFlat,
      serverUrl,
      navigateTo,
      refreshTokens,
      setCurrentCollectionId,
      setPendingHighlightForCollection,
      setHighlightedToken,
    ],
  );

  // Navigate to a token and trigger inline rename mode
  const handlePaletteRename = useCallback(
    (path: string, collectionId: string) => {
      const targetCollectionId = collectionId;
      navigateTo("library", "tokens");
      setTokenDetails(null);
      if (targetCollectionId && targetCollectionId !== currentCollectionId) {
        setPendingPaletteAction({
          kind: "rename",
          path,
          collectionId: targetCollectionId,
        });
        setPendingHighlightForCollection(path, targetCollectionId);
        setCurrentCollectionId(targetCollectionId);
      } else {
        setHighlightedToken(path);
        tokenListCompareRef.current?.triggerInlineRename(path);
      }
    },
    [
      currentCollectionId,
      navigateTo,
      setTokenDetails,
      setCurrentCollectionId,
      setPendingHighlightForCollection,
      setPendingPaletteAction,
      setHighlightedToken,
    ],
  );

  // Trigger the move-to-collection dialog for a token
  const handlePaletteMove = useCallback(
    (path: string, collectionId: string) => {
      const targetCollectionId = collectionId;
      navigateTo("library", "tokens");
      setTokenDetails(null);
      if (targetCollectionId && targetCollectionId !== currentCollectionId) {
        setPendingPaletteAction({
          kind: "move",
          path,
          collectionId: targetCollectionId,
        });
        setPendingHighlightForCollection(path, targetCollectionId);
        setCurrentCollectionId(targetCollectionId);
      } else {
        setHighlightedToken(path);
        tokenListCompareRef.current?.triggerMoveToken(path);
      }
    },
    [
      currentCollectionId,
      navigateTo,
      setTokenDetails,
      setCurrentCollectionId,
      setPendingHighlightForCollection,
      setPendingPaletteAction,
      setHighlightedToken,
    ],
  );

  // Trigger delete confirm for a single token from the token search row
  const handlePaletteDeleteToken = useCallback((
    path: string,
    collectionId: string,
  ) => {
    setPaletteDeleteConfirm({
      paths: [path],
      label: `Delete "${path}"?`,
      collectionId,
    });
  }, [
    setPaletteDeleteConfirm,
  ]);

  const workspaceControllers = {
    shell: {
      openPasteModal: () => setShowPasteModal(true),
      openImportPanel: () => {
        navigateTo("library", "tokens");
        switchContextualSurface({ surface: "import" });
      },
      openCollectionCreateDialog,
      openGeneratorsWorkspace: () => {
        switchContextualSurface({ surface: null });
        navigateTo("library", "generators");
      },
      toggleQuickApply: () => setShowQuickApply((visible) => !visible),
      triggerCreateFromSelection: () => {
        dismissEphemeralOverlays();
        navigateTo("canvas", "inspect");
        setTriggerCreateToken((n) => n + 1);
      },
      triggerExtractFromSelection: () => {
        dismissEphemeralOverlays();
        navigateTo("canvas", "inspect");
        setTriggerExtractToken((n) => n + 1);
      },
      openCollectionPicker,
      collectionPickerFocusRequestKey,
      openStartHere: (branch?: StartHereBranch) => openStartHere(branch),
      restartGuidedSetup: () => {
        closeSecondarySurface();
        openStartHere("start-new");
      },
      handleClearAllComplete: () => {
        closeSecondarySurface();
        navigateTo("library", "tokens");
        refreshTokens();
        openStartHere("start-new");
      },
      handleImportComplete,
      notificationHistory,
      clearNotificationHistory,
    },
    editor: {
      guardEditorAction,
      registerEditorSession,
      requestEditorClose,
      displayedLeafNodesRef,
      tokenListCompareRef,
      handleEditorNavigate,
      handleEditorSave,
      availableFonts,
      fontWeightsByFamily,
    },
    tokens: {
      showIssuesOnly,
      setShowIssuesOnly,
      lintViolations,
      jumpToNextIssue,
      refreshAll,
      pushUndo,
      setErrorToast,
      setSuccessToast,
      handleNavigateToCollection,
      tokenListCompareRef,
      tokenListSelection,
      recentlyTouched,
      starredTokens,
      handleOpenCrossCollectionCompare,
      handlePaletteDuplicate,
      handlePaletteRename,
      handlePaletteMove,
      requestPaletteDelete: (
        paths: string[],
        label: string,
        collectionId = currentCollectionId,
      ) => setPaletteDeleteConfirm({ paths, label, collectionId }),
      handlePaletteDeleteToken,
      applyAliasRewire: async ({
        tokenPath,
        tokenCollectionId,
        targetPath,
        targetCollectionId,
        modeNames,
      }: {
        tokenPath: string;
        tokenCollectionId: string;
        targetPath: string;
        targetCollectionId: string;
        modeNames: string[];
      }) => {
        const collection = collections.find(
          (c) => c.id === tokenCollectionId,
        );
        if (!collection) {
          const message = `Collection "${tokenCollectionId}" not found`;
          setErrorToast(message);
          return { ok: false, error: message };
        }
        try {
          await rewireAliasModes({
            serverUrl,
            collection,
            tokenPath,
            targetPath,
            targetCollectionId,
            pathToCollectionId,
            collectionIdsByPath,
            modeNames:
              modeNames.length > 0
                ? modeNames
                : collection.modes.map((mode) => mode.name),
          });
          refreshAll();
          return { ok: true };
        } catch (err) {
          const message = getErrorMessage(err);
          setErrorToast(`Could not rewire alias: ${message}`);
          return { ok: false, error: message };
        }
      },
      createAliasToken: async ({
        newPath,
        collectionId,
        type,
        targetPath,
        targetCollectionId,
      }: {
        newPath: string;
        collectionId: string;
        type: string | undefined;
        targetPath: string;
        targetCollectionId: string;
      }) => {
        const collection = collections.find((c) => c.id === collectionId);
        if (!collection) {
          const message = `Collection "${collectionId}" not found`;
          setErrorToast(message);
          return { ok: false, error: message };
        }
        try {
          await createAliasToken({
            serverUrl,
            collection,
            newPath,
            type,
            targetPath,
            targetCollectionId,
            pathToCollectionId,
            collectionIdsByPath,
          });
          refreshAll();
          return { ok: true };
        } catch (err) {
          const message = getErrorMessage(err);
          setErrorToast(`Could not create token: ${message}`);
          return { ok: false, error: message };
        }
      },
      createDerivationToken: async ({
        newPath,
        collectionId,
        type,
        sourcePath,
        sourceCollectionId,
        derivationOps,
      }: {
        newPath: string;
        collectionId: string;
        type: string | undefined;
        sourcePath: string;
        sourceCollectionId: string;
        derivationOps: DerivationOp[];
      }) => {
        const collection = collections.find((c) => c.id === collectionId);
        if (!collection) {
          const message = `Collection "${collectionId}" not found`;
          setErrorToast(message);
          return { ok: false, error: message };
        }
        try {
          await createDerivationToken({
            serverUrl,
            collection,
            newPath,
            type,
            sourcePath,
            sourceCollectionId,
            derivationOps,
            pathToCollectionId,
            collectionIdsByPath,
          });
          refreshAll();
          return { ok: true };
        } catch (err) {
          const message = getErrorMessage(err);
          setErrorToast(`Could not create modifier: ${message}`);
          return { ok: false, error: message };
        }
      },
      applyAliasDetach: async ({
        tokenPath,
        tokenCollectionId,
        modeLiterals,
      }: {
        tokenPath: string;
        tokenCollectionId: string;
        modeLiterals: Record<string, unknown>;
      }) => {
        const collection = collections.find(
          (c) => c.id === tokenCollectionId,
        );
        if (!collection) {
          const message = `Collection "${tokenCollectionId}" not found`;
          setErrorToast(message);
          return { ok: false, error: message };
        }
        try {
          await detachAliasModes({
            serverUrl,
            collection,
            tokenPath,
            modeLiterals,
          });
          refreshAll();
          return { ok: true };
        } catch (err) {
          const message = getErrorMessage(err);
          setErrorToast(`Could not detach alias: ${message}`);
          return { ok: false, error: message };
        }
      },
    },
    apply: {
      triggerCreateToken,
      triggerExtractToken,
    },
    sync: {
      validationIssues,
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
      setPublishPending,
      tokenChangeKey,
      publishPanelHandleRef,
      publishPreflightState,
      pendingPublishCount,
      publishApplying,
    },
    collectionStructure: {
      onRename: renameCollection,
      onDuplicate: handleDuplicateCollection,
      onDelete: startDelete,
      onEditInfo: openCollectionMetadata,
      onMerge: collectionIds.length > 1 ? openMergeDialog : undefined,
      onSplit: openSplitDialog,
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
    if (librarySetupRequired && item.workspaceId !== "library") {
      guardEditorAction(() => {
        navigateTo("library", "tokens");
        closeSecondarySurface();
        closeNotifications();
        clearHandoff();
        setExpandedWorkspaces(new Set(["library"]));
        openStartHere("root");
      });
      return;
    }
    const isAlreadyActive = item.workspaceId === activeWorkspace.id && activeSecondarySurface === null;
    if (isAlreadyActive) {
      setExpandedWorkspaces((prev) => {
        const next = new Set(prev);
        if (next.has(item.workspaceId)) {
          next.delete(item.workspaceId);
        } else {
          next.add(item.workspaceId);
        }
        return next;
      });
      return;
    }
    guardEditorAction(() => {
      navigateTo(item.topTab, item.subTab);
      closeSecondarySurface();
      closeNotifications();
      clearHandoff();
      setExpandedWorkspaces((prev) => new Set(prev).add(item.workspaceId));
    });
  }, [
    activeWorkspace.id,
    activeSecondarySurface,
    clearHandoff,
    closeNotifications,
    closeSecondarySurface,
    guardEditorAction,
    librarySetupRequired,
    navigateTo,
    openStartHere,
  ]);
  const runStartHereAction = useCallback(
    (action: () => void) => {
      finishStartHere();
      action();
    },
    [finishStartHere],
  );

  const workspaceIcon = (id: string) => {
    switch (id) {
      case "library":  return <Layers size={16} strokeWidth={1.5} aria-hidden />;
      case "canvas":   return <Frame size={16} strokeWidth={1.5} aria-hidden />;
      case "publish":  return <RefreshCw size={16} strokeWidth={1.5} aria-hidden />;
      default:         return null;
    }
  };

  const handleSubTabClick = useCallback((section: WorkspaceSection) => {
    guardEditorAction(() => {
      navigateTo(section.topTab, section.subTab);
    });
  }, [guardEditorAction, navigateTo]);

  return (
    <div className="relative flex h-screen min-h-0 overflow-hidden">
      <h1 className="sr-only">TokenManager</h1>
      {/* Sidebar */}
      <nav
        className={`flex shrink-0 flex-col bg-[var(--surface-app)] ${sidebarBoundary.isDragging ? '' : 'transition-[width] duration-150 ease-[cubic-bezier(0.32,0.72,0,1)]'}`}
        style={{ width: effectiveSidebarWidth }}
        aria-label="Workspaces"
      >
        {/* Accordion navigation */}
        <div className={`flex flex-1 flex-col overflow-y-auto overflow-x-hidden ${sidebarCollapsed ? 'px-1 pt-1.5 pb-1' : 'px-2 pt-2 pb-1'}`}>
          {SIDEBAR_GROUPS.map((group) => (
            <div
              key={group.id}
              className="flex flex-col gap-px"
            >
              {group.items.map((item) => {
                const requiresSetup =
                  librarySetupRequired && item.workspaceId !== "library";
                const isWorkspaceActive = item.workspaceId === activeWorkspace.id && activeSecondarySurface === null;
                const workspace = WORKSPACE_TABS.find((w) => w.id === item.workspaceId);
                const allSections = workspace?.sections ?? [];
                const sections = requiresSetup ? [] : allSections;
                const showCanvasSelectionAdornment =
                  item.id === "canvas" &&
                  !requiresSetup &&
                  !isWorkspaceActive &&
                  selectionHealth.hasSelection;
                const canvasHasBrokenBindings =
                  showCanvasSelectionAdornment &&
                  selectionHealth.staleBindingCount > 0;
                const syncAdornment: {
                  tone: "accent" | "warning" | "error";
                  count: number | null;
                  label: string;
                } | null = (() => {
                  if (requiresSetup) return null;
                  if (item.id !== "publish" || isWorkspaceActive) return null;
                  if (syncError) return { tone: "error", count: null, label: `Apply failed: ${syncError}` };
                  if (syncResult && syncResult.errors > 0) {
                    return { tone: "error", count: null, label: `${syncResult.errors} sync error${syncResult.errors === 1 ? "" : "s"}` };
                  }
                  if (syncResult && syncResult.missingTokens.length > 0) {
                    const n = syncResult.missingTokens.length;
                    return { tone: "warning", count: null, label: `${n} missing token path${n === 1 ? "" : "s"}` };
                  }
                  if (publishApplying || syncing) {
                    return { tone: "accent", count: null, label: "Applying to Figma…" };
                  }
                  if (pendingPublishCount > 0) {
                    return { tone: "accent", count: pendingPublishCount, label: `${pendingPublishCount} ready to apply` };
                  }
                  return null;
                })();
                const publishIsIdle =
                  item.id === "publish" && !isWorkspaceActive && syncAdornment === null;
                const inactiveTextClass = `${publishIsIdle ? "text-[color:var(--color-figma-text-tertiary)]" : "text-[color:var(--color-figma-text-secondary)]"} ${SIDEBAR_HOVER_CLASSES}`;

                if (sidebarCollapsed) {
                  const tooltipLabel = requiresSetup
                    ? `${item.label} · set up a collection first`
                    : showCanvasSelectionAdornment
                      ? canvasHasBrokenBindings
                        ? `${item.label} · ${selectionHealth.selectionCount} selected · ${selectionHealth.staleBindingCount} broken`
                        : `${item.label} · ${selectionHealth.selectionCount} selected`
                      : syncAdornment
                        ? `${item.label} · ${syncAdornment.label}`
                        : item.label;
                  return (
                    <Tooltip
                      key={item.id}
                      label={tooltipLabel}
                      position="right"
                    >
                      <button
                        onClick={(event) => {
                          if (responsiveSidebarCollapsed && sections.length > 0) {
                            openResponsiveSidebarFlyout(
                              item.id,
                              event.currentTarget.getBoundingClientRect().top,
                            );
                            return;
                          }
                          setResponsiveSidebarFlyout(null);
                          handleSidebarItemClick(item);
                        }}
                        aria-expanded={
                          responsiveSidebarCollapsed && sections.length > 0
                            ? responsiveSidebarFlyout?.itemId === item.id
                            : undefined
                        }
                        aria-current={isWorkspaceActive ? "page" : undefined}
                        aria-label={item.label}
                        data-workspace={item.id}
                        className={`tm-sidebar-workspace-button relative flex h-8 ${sidebarCollapsed ? 'w-8' : 'w-full'} items-center justify-center rounded-md outline-none transition-colors ${
                          isWorkspaceActive
                            ? "bg-[var(--color-figma-bg-selected)] text-[color:var(--color-figma-text-accent)]"
                            : requiresSetup
                              ? "text-[color:var(--color-figma-text-tertiary)] opacity-60"
                              : inactiveTextClass
                        }`}
                      >
                        {workspaceIcon(item.id)}
                        {showCanvasSelectionAdornment && (
                          <span
                            aria-hidden
                            className={`absolute right-1 top-1 h-1 w-1 rounded-full ${
                              canvasHasBrokenBindings
                                ? "bg-[var(--color-figma-warning)]"
                                : "bg-[var(--color-figma-text-secondary)]"
                            }`}
                          />
                        )}
                        {syncAdornment && (
                          <span
                            aria-hidden
                            className={`absolute right-1 top-1 h-1 w-1 rounded-full ${SYNC_ADORNMENT_DOT[syncAdornment.tone]}`}
                          />
                        )}
                      </button>
                    </Tooltip>
                  );
                }

                const sectionListId = `${item.workspaceId}-workspace-sections`;
                return (
                  <div key={item.id} className="mb-0.5">
                    <button
                      onClick={() => handleSidebarItemClick(item)}
                      aria-current={isWorkspaceActive ? "page" : undefined}
                      aria-expanded={sections.length > 0 ? expandedWorkspaces.has(item.workspaceId) : undefined}
                      aria-controls={sections.length > 0 ? sectionListId : undefined}
                      title={requiresSetup ? "Set up a collection first" : undefined}
                      data-workspace={item.id}
                      className={`tm-sidebar-workspace-button relative flex min-h-7 w-full items-center gap-1.5 rounded-md px-2.5 py-1 text-left text-body outline-none transition-colors ${
                        isWorkspaceActive
                          ? "bg-[var(--color-figma-bg-selected)] text-[color:var(--color-figma-text)] font-medium"
                          : requiresSetup
                            ? "text-[color:var(--color-figma-text-tertiary)] opacity-60"
                            : inactiveTextClass
                      }`}
                    >
                      {sections.length > 0 && (
                        <ChevronRight
                          size={10}
                          strokeWidth={2}
                          aria-hidden
                          className={`shrink-0 transition-transform duration-150 ${expandedWorkspaces.has(item.workspaceId) ? "rotate-90" : ""}`}
                        />
                      )}
                      <span className="shrink-0">{workspaceIcon(item.id)}</span>
                      <span className="tm-sidebar-nav__label">{item.label}</span>
                      {showCanvasSelectionAdornment && (
                        <span
                          className={`ml-auto shrink-0 text-secondary ${
                            canvasHasBrokenBindings
                              ? "text-[color:var(--color-figma-text-warning)]"
                              : "text-[color:var(--color-figma-text-secondary)]"
                          }`}
                          title={
                            canvasHasBrokenBindings
                              ? `${selectionHealth.staleBindingCount} broken binding${selectionHealth.staleBindingCount === 1 ? "" : "s"}`
                              : undefined
                          }
                        >
                          {selectionHealth.selectionCount}
                        </span>
                      )}
                      {syncAdornment && (
                        syncAdornment.count !== null ? (
                          <span
                            className={`ml-auto shrink-0 text-secondary font-medium ${SYNC_ADORNMENT_TEXT[syncAdornment.tone]}`}
                            title={syncAdornment.label}
                          >
                            {syncAdornment.count}
                          </span>
                        ) : (
                          <span
                            aria-hidden
                            className={`ml-auto shrink-0 h-1.5 w-1.5 rounded-full ${SYNC_ADORNMENT_DOT[syncAdornment.tone]}`}
                            title={syncAdornment.label}
                          />
                        )
                      )}
                    </button>
                    {sections.length > 0 && (() => {
                      const isSectionExpanded = expandedWorkspaces.has(item.workspaceId);
                      return (
                        <div
                          id={sectionListId}
                          aria-hidden={!isSectionExpanded}
                          className={`ml-6 flex flex-col gap-px overflow-hidden transition-[max-height,opacity] duration-150 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                            isSectionExpanded ? "max-h-40 opacity-100 mt-0.5 mb-1" : "max-h-0 opacity-0"
                          }`}
                        >
                          {sections.map((section) => {
                            const showReviewBadge =
                              item.id === "library" &&
                              section.id === "health" &&
                              reviewBadgeCount > 0 &&
                              !(activeSubTab === section.subTab && isWorkspaceActive);
                            return (
                              <button
                                key={section.id}
                                onClick={() => handleSubTabClick(section)}
                                tabIndex={isSectionExpanded ? 0 : -1}
                                aria-current={
                                  activeSubTab === section.subTab && isWorkspaceActive
                                    ? "page"
                                    : undefined
                                }
                                data-workspace={item.id}
                                className={`tm-sidebar-section-button flex min-h-7 w-full items-center gap-1.5 rounded px-2 py-0.5 text-left text-secondary outline-none transition-colors ${
                                  activeSubTab === section.subTab && isWorkspaceActive
                                    ? "bg-[var(--color-figma-bg-selected)] text-[color:var(--color-figma-text)] font-medium"
                                    : "text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)]"
                                }`}
                              >
                                <span className="tm-sidebar-nav__sub-label min-w-0 flex-1">{section.label}</span>
                                {showReviewBadge ? (
                                  <span
                                    aria-label={`${reviewBadgeCount} review item${reviewBadgeCount === 1 ? "" : "s"}`}
                                    className="shrink-0 tabular-nums text-secondary font-medium text-[color:var(--color-figma-text-warning)]"
                                  >
                                    {reviewBadgeCount > 99 ? "99+" : reviewBadgeCount}
                                  </span>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Bottom utilities */}
        <div className={`flex flex-col gap-px border-t border-[var(--border-muted)] bg-[var(--surface-panel-header)] ${sidebarCollapsed ? 'items-center px-1 py-1.5' : 'px-2 py-2'}`}>
          {sidebarCollapsed ? (
            <>
              <div className="flex flex-col items-center gap-0.5">
                <Tooltip label={`Notifications${notificationCount > 0 ? ` (${notificationCount})` : ""}`} position="right">
                  <button
                    onClick={toggleNotifications}
                    className={`relative flex h-8 w-8 items-center justify-center rounded-md outline-none transition-colors ${
                      notificationsOpen
                        ? "bg-[var(--color-figma-bg-selected)] text-[color:var(--color-figma-text)]"
                        : "text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)]"
                    }`}
                    aria-label="Notifications"
                  >
                    <Bell size={14} strokeWidth={1.5} aria-hidden />
                    {notificationCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--color-figma-action-bg)] text-[var(--font-size-xs)] font-medium text-[color:var(--color-figma-text-onbrand)]">{notificationCount > 9 ? "9+" : notificationCount}</span>
                    )}
                  </button>
                </Tooltip>
                <Tooltip label="Settings" position="right">
                  <button
                    onClick={() => toggleSecondarySurface("settings")}
                    className={`flex h-8 w-8 items-center justify-center rounded-md outline-none transition-colors ${
                      activeSecondarySurface === "settings"
                        ? "bg-[var(--color-figma-bg-selected)] text-[color:var(--color-figma-text)]"
                        : "text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)]"
                    }`}
                    aria-label="Settings"
                  >
                    <Settings size={14} strokeWidth={1.5} aria-hidden />
                  </button>
                </Tooltip>
              </div>
              <div className="my-1 w-5 border-t border-[var(--border-muted)]" />
              <div className="flex flex-col items-center gap-0.5">
                <Tooltip label={undoSlot?.description ? `Undo: ${undoSlot.description}` : "Undo"} position="right">
                  <button onClick={executeUndo} disabled={!canUndo} className="flex h-8 w-8 items-center justify-center rounded-md text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors disabled:opacity-30 disabled:pointer-events-none" aria-label="Undo">
                    <Undo2 size={13} strokeWidth={1.5} aria-hidden />
                  </button>
                </Tooltip>
                <Tooltip label={redoSlot?.description ? `Redo: ${redoSlot.description}` : "Redo"} position="right">
                  <button onClick={() => { if (canRedo) executeRedo(); else handleServerRedo(); }} disabled={!canRedo && !canServerRedo} className="flex h-8 w-8 items-center justify-center rounded-md text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors disabled:opacity-30 disabled:pointer-events-none" aria-label="Redo">
                    <Redo2 size={13} strokeWidth={1.5} aria-hidden />
                  </button>
                </Tooltip>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={toggleNotifications}
                  className={`tm-sidebar-utility-button relative ${
                    notificationsOpen
                      ? "bg-[var(--color-figma-bg-selected)] text-[color:var(--color-figma-text)]"
                      : "text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)]"
                  }`}
                  aria-label="Notifications"
                  title={`Notifications${notificationCount > 0 ? ` (${notificationCount})` : ""}`}
                >
                  <Bell size={14} strokeWidth={1.5} aria-hidden className="shrink-0" />
                  <span className="tm-sidebar-utility-button__label">Notifications</span>
                  {notificationCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--color-figma-action-bg)] text-[var(--font-size-xs)] font-medium text-[color:var(--color-figma-text-onbrand)]">{notificationCount > 9 ? "9+" : notificationCount}</span>
                  )}
                </button>
                <button
                  onClick={() => toggleSecondarySurface("settings")}
                  className={`tm-sidebar-utility-button ${
                    activeSecondarySurface === "settings"
                      ? "bg-[var(--color-figma-bg-selected)] text-[color:var(--color-figma-text)]"
                      : "text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)]"
                  }`}
                  aria-label="Settings"
                  title="Settings"
                >
                  <Settings size={14} strokeWidth={1.5} aria-hidden className="shrink-0" />
                  <span className="tm-sidebar-utility-button__label">Settings</span>
                </button>
                <div className="my-1 h-px w-full bg-[var(--border-muted)]" />
                <button onClick={executeUndo} disabled={!canUndo} className="tm-sidebar-utility-button text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-30 disabled:pointer-events-none" aria-label="Undo" title={undoSlot?.description ? `Undo: ${undoSlot.description}` : "Undo"}>
                  <Undo2 size={13} strokeWidth={1.5} aria-hidden className="shrink-0" />
                  <span className="tm-sidebar-utility-button__label">Undo</span>
                </button>
                <button onClick={() => { if (canRedo) executeRedo(); else handleServerRedo(); }} disabled={!canRedo && !canServerRedo} className="tm-sidebar-utility-button text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-30 disabled:pointer-events-none" aria-label="Redo" title={redoSlot?.description ? `Redo: ${redoSlot.description}` : "Redo"}>
                  <Redo2 size={13} strokeWidth={1.5} aria-hidden className="shrink-0" />
                  <span className="tm-sidebar-utility-button__label">Redo</span>
                </button>
              </div>
            </>
          )}
          {!connected && !sidebarCollapsed && (
            <div className="mt-1 rounded-md bg-[var(--color-figma-error)]/8 px-2.5 py-1.5">
              <div className="text-secondary text-[color:var(--color-figma-text-secondary)]">
                {checking ? "Connecting…" : "Server offline"}
              </div>
              {!checking && (
                <button
                  onClick={retryConnection}
                  className="mt-1 text-secondary text-[color:var(--color-figma-text-accent)] hover:underline"
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
          {responsiveSidebarCollapsed ? (
            <>
              <div className="my-1 w-5 mx-auto border-t border-[var(--border-muted)]" />
              <Tooltip label="Workspace sections" position="right">
                <button
                  type="button"
                  onClick={() => openResponsiveSidebarFlyout(activeWorkspace.id, window.innerHeight - 224)}
                  aria-label="Open workspace sections"
                  aria-expanded={responsiveSidebarFlyout?.itemId === activeWorkspace.id}
                  className="mx-auto flex h-7 w-7 items-center justify-center rounded-md text-[color:var(--color-figma-text-tertiary)] outline-none transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text-secondary)]"
                >
                  <ChevronsRight size={12} strokeWidth={1.5} aria-hidden />
                </button>
              </Tooltip>
            </>
          ) : (
            <>
              <div className={`${sidebarCollapsed ? 'my-1 w-5 mx-auto' : 'my-1 w-full'} border-t border-[var(--border-muted)]`} />
              <Tooltip label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} position="right" hidden={!sidebarCollapsed}>
                <button
                  onClick={toggleSidebarCollapsed}
                  aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                  className={`flex h-7 items-center justify-center rounded-md text-[color:var(--color-figma-text-tertiary)] outline-none transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text-secondary)] ${sidebarCollapsed ? 'mx-auto w-7' : 'w-full'}`}
                >
                  {sidebarCollapsed ? (
                    <ChevronsRight size={12} strokeWidth={1.5} aria-hidden />
                  ) : (
                    <ChevronsLeft size={12} strokeWidth={1.5} aria-hidden />
                  )}
                </button>
              </Tooltip>
            </>
          )}
        </div>
      </nav>
      {!responsiveSidebarCollapsed ? (
        <ResizeDivider
          axis="x"
          ariaLabel="Resize workspace sidebar"
          ariaValueNow={sidebarBoundary.ariaValueNow}
          onMouseDown={sidebarBoundary.onMouseDown}
          onKeyDown={sidebarBoundary.onKeyDown}
        />
      ) : null}
      {responsiveSidebarFlyout ? (() => {
        const item = SIDEBAR_GROUPS.flatMap((group) => group.items).find(
          (candidate) => candidate.id === responsiveSidebarFlyout.itemId,
        );
        const workspace = item
          ? WORKSPACE_TABS.find((candidate) => candidate.id === item.workspaceId)
          : null;
        const sections = workspace?.sections ?? [];
        if (!item || sections.length === 0) return null;
        const isWorkspaceActive =
          item.workspaceId === activeWorkspace.id && activeSecondarySurface === null;
        return (
          <>
            <button
              type="button"
              className="fixed inset-0 z-20 cursor-default"
              aria-label="Close workspace navigation"
              onClick={() => setResponsiveSidebarFlyout(null)}
            />
            <div
              className="tm-sidebar-flyout absolute left-10 z-30 rounded-md border border-[var(--border-muted)] bg-[var(--surface-panel-header)] p-1 shadow-[var(--shadow-popover)]"
              style={{ top: responsiveSidebarFlyout.top }}
            >
              <div className="tm-sidebar-flyout__label px-2 py-1 text-secondary font-medium text-[color:var(--color-figma-text-secondary)]">
                {item.label}
              </div>
              {sections.map((section) => {
                const isSectionActive =
                  isWorkspaceActive && activeSubTab === section.subTab;
                const showReviewBadge =
                  item.id === "library" &&
                  section.id === "health" &&
                  reviewBadgeCount > 0 &&
                  !isSectionActive;
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => {
                      setResponsiveSidebarFlyout(null);
                      handleSubTabClick(section);
                    }}
                    className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-secondary outline-none transition-colors ${
                      isSectionActive
                        ? "bg-[var(--color-figma-bg-selected)] text-[color:var(--color-figma-text)] font-medium"
                        : "text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)]"
                    }`}
                  >
                    <span className="tm-sidebar-flyout__label min-w-0 flex-1">{section.label}</span>
                    {showReviewBadge ? (
                      <span
                        aria-label={`${reviewBadgeCount} review item${reviewBadgeCount === 1 ? "" : "s"}`}
                        className="shrink-0 tabular-nums text-secondary font-medium text-[color:var(--color-figma-text-warning)]"
                      >
                        {reviewBadgeCount > 99 ? "99+" : reviewBadgeCount}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </>
        );
      })() : null}

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

      {publishPending && (
        <ConfirmModal
          title={
            publishPending.scope === 'group'
              ? `Apply "${publishPending.groupPath}" to Figma?`
              : `Apply "${getCollectionDisplayName(publishPending.collectionId, collectionDescriptions)}" to Figma?`
          }
          description={
            publishPending.scope === 'group'
              ? `This will create or update ${publishPending.tokenCount} variable${publishPending.tokenCount !== 1 ? 's' : ''} in your Figma file from the "${publishPending.groupPath}" group.`
              : `This will create or update ${publishPending.tokenCount} variable${publishPending.tokenCount !== 1 ? 's' : ''} in your Figma file.`
          }
          confirmLabel="Apply to Figma"
          onConfirm={handlePublish}
          onCancel={() => setPublishPending(null)}
        />
      )}

      {publishApplying && (
        <ProgressOverlay
          message="Applying to Figma…"
          current={publishProgress?.current}
          total={publishProgress?.total}
        />
      )}

      <CollectionCreateDialog
        isOpen={showCollectionCreateDialog}
        onClose={closeCollectionCreateDialog}
        onCreate={createCollectionByName}
        onCreated={(collectionId) => {
          setCurrentCollectionId(collectionId);
          navigateTo("library", "tokens");
        }}
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
      {showQuickApply && !selectionLoading && (
        <QuickApplyPicker
          selectedNodes={selectedNodes}
          tokenMap={perCollectionFlat[currentCollectionId] ?? {}}
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
          selectedNodeCount={selectedNodes.length}
          initialBranch={startHereState.initialBranch}
          onClose={closeStartHere}
          onRetryConnection={retryConnection}
          onImportExistingSystem={() => {
            runStartHereAction(() => {
              navigateTo("library", "tokens");
              switchContextualSurface({ surface: "import" });
            });
          }}
          onStartFromSelection={() => {
            runStartHereAction(() => {
              dismissEphemeralOverlays();
              navigateTo("canvas", "inspect");
              setTriggerExtractToken((n) => n + 1);
            });
          }}
          onAuthorFirstToken={(collectionId) => {
            runStartHereAction(() => {
              navigateTo("library", "tokens");
              setCurrentCollectionId(collectionId);
              setTokenDetails({
                path: "",
                collectionId,
                mode: "edit",
                isCreate: true,
              });
            });
          }}
          onGuidedSetupComplete={() => {
            runStartHereAction(() => {
              refreshAll();
            });
          }}
          onCreateCollection={createCollectionByName}
          onCollectionCreated={(collectionId) => {
            setCurrentCollectionId(collectionId);
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
