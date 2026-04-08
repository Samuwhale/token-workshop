import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { TokenListImperativeHandle } from './components/tokenListTypes';
import type { ThemeManagerHandle } from './components/ThemeManager';
import { TokenEditor } from './components/TokenEditor';
import { TokenGeneratorDialog } from './components/TokenGeneratorDialog';
import { TokenDetailPreview } from './components/TokenDetailPreview';
import { ToastStack } from './components/ToastStack';
import { NotificationHistory } from './components/NotificationHistory';
import { useToastStack } from './hooks/useToastStack';
import { useToastBusListener } from './shared/toastBus';
import { ConfirmModal } from './components/ConfirmModal';
import { PasteTokensModal } from './components/PasteTokensModal';
import { WelcomePrompt, type StartHereBranch } from './components/WelcomePrompt';
import { ColorScaleGenerator } from './components/ColorScaleGenerator';
import { CommandPalette } from './components/CommandPalette';
import type { TokenEntry } from './components/CommandPalette';
import { SetSwitcher, SetManager } from './components/SetSwitcher';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { QuickApplyPicker } from './components/QuickApplyPicker';
import { computeHealthIssueCount } from './components/HealthPanel';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PanelRouter } from './panels/PanelRouter';
import { useServerEvents } from './hooks/useServerEvents';
import type { TokenNode } from './hooks/useTokens';
import { useUndo } from './hooks/useUndo';
import { useLint } from './hooks/useLint';
import { usePreviewSplit } from './hooks/usePreviewSplit';
import { useAvailableFonts } from './hooks/useAvailableFonts';
import { useWindowExpand } from './hooks/useWindowExpand';
import { useWindowResize } from './hooks/useWindowResize';
import type { OverflowPanel, SecondaryActionId } from './shared/navigationTypes';
import { APP_SHELL_NAVIGATION, resolveWorkspace, resolveWorkspaceSection, toWorkspaceId } from './shared/navigationTypes';
import { useConnectionContext } from './contexts/ConnectionContext';
import { useTokenSetsContext, useTokenFlatMapContext, useGeneratorContext } from './contexts/TokenDataContext';
import { useThemeSwitcherContext, useResolverContext } from './contexts/ThemeContext';
import { useSelectionContext, useHeatmapContext, useUsageContext } from './contexts/InspectContext';
import { useNavigationContext } from './contexts/NavigationContext';
import { useEditorContext } from './contexts/EditorContext';
import { useFigmaSync } from './hooks/useFigmaSync';
import { useSetRename } from './hooks/useSetRename';
import { useSetDelete } from './hooks/useSetDelete';
import { useSetDuplicate } from './hooks/useSetDuplicate';
import { useSetMergeSplit } from './hooks/useSetMergeSplit';
import { useSetMetadata } from './hooks/useSetMetadata';
import { useModalVisibility } from './hooks/useModalVisibility';
import { useSetTabs } from './hooks/useSetTabs';
import { useRecentOperations } from './hooks/useRecentOperations';
import { useRecentlyTouched } from './hooks/useRecentlyTouched';
import { useStarredTokens } from './hooks/useStarredTokens';
import { usePinnedTokens } from './hooks/usePinnedTokens';
import { useAnalyticsState } from './hooks/useAnalyticsState';
import { useValidationCache } from './hooks/useValidationCache';
import { useGraphState } from './hooks/useGraphState';
import { useCommandPaletteCommands } from './hooks/useCommandPaletteCommands';
import { useCompareState } from './hooks/useCompareState';
import { useSettingsListener } from './components/SettingsPanel';
import type { TokenMapEntry } from '../shared/types';
import { KNOWN_CONTROLLER_MESSAGE_TYPES } from '../shared/types';
import { isAlias } from '../shared/resolveAlias';
import { adaptShortcut, tokenPathToUrlSegment } from './shared/utils';
import { SHORTCUT_KEYS, matchesShortcut } from './shared/shortcutRegistry';
import { getMenuItems, handleMenuArrowKeys } from './hooks/useMenuKeyboard';
import { apiFetch, ApiError } from './shared/apiFetch';
import { STORAGE_KEYS, lsGet, lsSet, lsGetJson, lsSetJson } from './shared/storage';
import { findLeafByPath } from './components/tokenListUtils';

export function App() {
  // Navigation and editor state from contexts (owned by NavigationProvider and EditorProvider)
  const { activeTopTab, activeSubTab, overflowPanel, navigateTo, setOverflowPanel } = useNavigationContext();
  const { editingToken, setEditingToken, editingGenerator, setEditingGenerator, previewingToken, setPreviewingToken, setHighlightedToken, createFromEmpty, setPendingHighlight, setPendingHighlightForSet, handleNavigateToAlias, setAliasNotFoundHandler } = useEditorContext();
  const { showPreviewSplit, setShowPreviewSplit, splitRatio, splitValueNow, splitContainerRef, handleSplitDragStart, handleSplitKeyDown } = usePreviewSplit();
  const [menuOpen, setMenuOpen] = useState(false);
  const { connected, checking, serverUrl, getDisconnectSignal, markDisconnected, updateServerUrlAndConnect, retryConnection } = useConnectionContext();
  const { sets, setSets, activeSet, setActiveSet, tokens, setTokenCounts, setDescriptions, setCollectionNames, setModeNames, refreshTokens, addSetToState, removeSetFromState, renameSetInState, updateSetMetadataInState, fetchTokensForSet } = useTokenSetsContext();
  const { allTokensFlat, pathToSet, perSetFlat, filteredSetCount } = useTokenFlatMapContext();
  const { generators, refreshGenerators, generatorsBySource, derivedTokenPaths } = useGeneratorContext();
  const { dimensions, activeThemes, setActiveThemes, previewThemes, setPreviewThemes, openDimDropdown, setOpenDimDropdown, dimBarExpanded, setDimBarExpanded, dimDropdownRef, themesError, retryThemes, setThemeStatusMap } = useThemeSwitcherContext();
  const resolverState = useResolverContext();
  const { selectedNodes } = useSelectionContext();
  const { triggerHeatmapScan } = useHeatmapContext();
  const { triggerUsageScan, tokenUsageCounts } = useUsageContext();
  const { families: availableFonts, weightsByFamily: fontWeightsByFamily } = useAvailableFonts();
  // Banner URL editor has its own local state (separate from SettingsPanel's connection state)
  const [bannerUrlInput, setBannerUrlInput] = useState(serverUrl);
  const [bannerConnectResult, setBannerConnectResult] = useState<'ok' | 'fail' | null>(null);
  const [showBannerUrlEditor, setShowBannerUrlEditor] = useState(false);
  const { showPasteModal, setShowPasteModal, showColorScaleGen, setShowColorScaleGen, showCommandPalette, setShowCommandPalette, showKeyboardShortcuts, setShowKeyboardShortcuts, showQuickApply, setShowQuickApply, showSetSwitcher, setShowSetSwitcher } = useModalVisibility();
  const [commandPaletteInitialQuery, setCommandPaletteInitialQuery] = useState('');
  const recentlyTouched = useRecentlyTouched();
  const starredTokens = useStarredTokens();
  const palettePinnedTokens = usePinnedTokens(activeSet);
  const initialFirstRun = !lsGet(STORAGE_KEYS.FIRST_RUN_DONE);
  const [startHereState, setStartHereState] = useState<{ open: boolean; initialBranch: StartHereBranch; firstRun: boolean }>(() => ({
    open: initialFirstRun,
    initialBranch: 'root',
    firstRun: initialFirstRun,
  }));
  // undoMaxHistory is managed by SettingsPanel; App re-reads from localStorage when it changes
  const undoHistoryRev = useSettingsListener(STORAGE_KEYS.UNDO_MAX_HISTORY);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const undoMaxHistory = useMemo(() => lsGetJson<number>(STORAGE_KEYS.UNDO_MAX_HISTORY, 20) ?? 20, [undoHistoryRev]);
  const [pendingPublishCount, setPendingPublishCount] = useState(0);
  const openStartHere = useCallback((initialBranch: StartHereBranch = 'root', firstRun = false) => {
    setStartHereState({ open: true, initialBranch, firstRun });
  }, []);
  const closeStartHere = useCallback(() => {
    lsSet(STORAGE_KEYS.FIRST_RUN_DONE, '1');
    setStartHereState({ open: false, initialBranch: 'root', firstRun: false });
  }, []);
  const { toasts: toastStack, dismiss: dismissStackToast, pushSuccess: setSuccessToast, pushError: setErrorToast, pushAction: pushActionToast, history: notificationHistory, clearHistory: clearNotificationHistory } = useToastStack();
  // Listen for PublishPanel's broadcast of how many changes are pending sync
  useEffect(() => {
    const handler = (e: Event) => setPendingPublishCount((e as CustomEvent<{ total: number }>).detail.total);
    window.addEventListener('publish-pending-count', handler);
    return () => window.removeEventListener('publish-pending-count', handler);
  }, []);
  // Close the inline banner URL editor when connection is (re-)established
  useEffect(() => { if (connected) setShowBannerUrlEditor(false); }, [connected]);
  // Wire the alias-not-found toast into EditorContext (setErrorToast is stable)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setAliasNotFoundHandler((p) => setErrorToast(`Alias target not found: ${p}`)); }, []);
  // Route all dispatchToast() calls from deeply-nested components/hooks into the in-plugin ToastStack
  useToastBusListener(setSuccessToast, setErrorToast);
  const [showNotificationHistory, setShowNotificationHistory] = useState(false);
  const { toastVisible, slot: undoSlot, canUndo, pushUndo, executeUndo, executeRedo, dismissToast, canRedo, redoSlot, undoCount, undoDescriptions } = useUndo(undoMaxHistory, setErrorToast);
  // Wire pushUndo into the resolver context so deleteResolver can push undo slots
  useEffect(() => {
    resolverState.setPushUndo(pushUndo);
    return () => { resolverState.setPushUndo(undefined); };
  // resolverState.setPushUndo is stable (useCallback with no deps); pushUndo is stable
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const onGeneratorError = useCallback(({ generatorId, message }: { generatorId?: string; message: string }) => {
    const label = generatorId ? `Generator "${generatorId}" failed` : 'Generator auto-run failed';
    setErrorToast(`${label}: ${message}`);
  }, [setErrorToast]);
  const onServiceError = useCallback(({ setName, message }: { setName: string; message: string }) => {
    const label = setName ? `Failed to load "${setName}"` : 'File load error';
    setErrorToast(`${label}: ${message}`);
  }, [setErrorToast]);
  const onResizeHandleMouseDown = useWindowResize();
  const { isExpanded, toggleExpand } = useWindowExpand();
  const { pendingGraphTemplate, setPendingGraphTemplate, pendingGraphFromGroup, setPendingGraphFromGroup, focusGeneratorId, setFocusGeneratorId, pendingOpenPicker, setPendingOpenPicker } = useGraphState();
  const [triggerCreateToken, setTriggerCreateToken] = useState(0);
  const [lintKey, setLintKey] = useState(0);
  const lintViolations = useLint(serverUrl, activeSet, connected, lintKey);
  // Tracks the current position for "next issue" cycling — reset when set changes
  const lintIssueIndexRef = useRef(-1);
  useEffect(() => { lintIssueIndexRef.current = -1; }, [activeSet]);
  const [tokenChangeKey, setTokenChangeKey] = useState(0);
  const refreshAll = useCallback(() => { refreshTokens(); setLintKey(k => k + 1); refreshGenerators(); setTokenChangeKey(k => k + 1); }, [refreshTokens, refreshGenerators]);
  const staleGeneratorCount = useMemo(() => generators.filter(g => g.isStale).length, [generators]);
  const activeWorkspaceId = useMemo(() => toWorkspaceId(activeTopTab, activeSubTab), [activeTopTab, activeSubTab]);
  const activeWorkspace = useMemo(
    () => resolveWorkspace(activeTopTab, activeSubTab),
    [activeTopTab, activeSubTab],
  );
  const activeWorkspaceSection = useMemo(
    () => resolveWorkspaceSection(activeWorkspace, activeTopTab, activeSubTab),
    [activeWorkspace, activeTopTab, activeSubTab],
  );

  // Track external file change refreshes so we can show a diff toast
  const externalRefreshPendingRef = useRef(false);
  const prevAllTokensFlatRef = useRef<Record<string, TokenMapEntry>>({});
  const refreshAllExternal = useCallback(() => {
    prevAllTokensFlatRef.current = allTokensFlat;
    externalRefreshPendingRef.current = true;
    refreshAll();
  }, [refreshAll, allTokensFlat]);
  useServerEvents(serverUrl, connected, onGeneratorError, refreshAllExternal, onServiceError);

  // Show a change-summary toast after an external file change triggers a refresh
  useEffect(() => {
    if (!externalRefreshPendingRef.current) return;
    externalRefreshPendingRef.current = false;
    const prev = prevAllTokensFlatRef.current;
    const curr = allTokensFlat;
    // Skip if there was no prior state (initial load)
    if (Object.keys(prev).length === 0) return;
    let added = 0, removed = 0, changed = 0;
    const prevKeys = new Set(Object.keys(prev));
    for (const key of Object.keys(curr)) {
      if (!prevKeys.has(key)) {
        added++;
      } else {
        const p = prev[key], c = curr[key];
        if (p.$type !== c.$type || JSON.stringify(p.$value) !== JSON.stringify(c.$value)) changed++;
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
    setSuccessToast(`External change: ${parts.join(', ')}`);
  }, [allTokensFlat, setSuccessToast]);

  // Server-side operation log for undo/rollback
  const { recentOperations, total: totalOperations, hasMore: hasMoreOperations, loadMore: loadMoreOperations, handleRollback, handleServerRedo, canServerRedo, serverRedoDescription, redoableOpIds, redoableItems } = useRecentOperations({ serverUrl, connected, lintKey, refreshAll, setSuccessToast, setErrorToast });

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
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
      const isRedo = (e.key === 'z' && e.shiftKey) || e.key === 'y';
      const isUndo = e.key === 'z' && !e.shiftKey;
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
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleEditorClose = useCallback(() => {
    setEditingToken(null);
    setEditingGenerator(null);
    refreshAll();
  }, [refreshAll, setEditingGenerator, setEditingToken]);
  const handlePreviewEdit = useCallback(() => {
    if (previewingToken) { setEditingToken({ path: previewingToken.path, name: previewingToken.name, set: previewingToken.set }); setPreviewingToken(null); }
  }, [previewingToken, setEditingToken, setPreviewingToken]);
  const handlePreviewClose = useCallback(() => { setPreviewingToken(null); }, [setPreviewingToken]);
  const editorIsDirtyRef = useRef(false);
  const editorCloseRef = useRef<() => void>(() => { if (!editorIsDirtyRef.current) handleEditorClose(); });
  // Pending navigation action — set when user tries to navigate away from a dirty editor
  const [pendingNavAction, setPendingNavAction] = useState<(() => void) | null>(null);
  const guardEditorAction = useCallback((fn: () => void) => {
    if (editorIsDirtyRef.current) {
      setPendingNavAction(() => fn);
    } else {
      fn();
    }
  }, []);
  const editingGeneratorData = editingGenerator
    ? (generators.find(generator => generator.id === editingGenerator.id) ?? null)
    : null;
  useEffect(() => {
    if (!editingGenerator || editingGeneratorData) return;
    setEditingGenerator(null);
  }, [editingGenerator, editingGeneratorData, setEditingGenerator]);
  // Tracks the currently visible/filtered leaf nodes from TokenList — updated by onDisplayedLeafNodesChange
  const displayedLeafNodesRef = useRef<TokenNode[]>([]);
  // Imperative handle to TokenList compare actions — populated by TokenList via compareHandle prop
  const tokenListCompareRef = useRef<TokenListImperativeHandle | null>(null);
  // Imperative handle to ThemeManager — populated by ThemeManager for command palette actions
  const themeManagerHandleRef = useRef<ThemeManagerHandle | null>(null);
  const [themeGapCount, setThemeGapCount] = useState(0);
  // Compare state for the Tokens tab — shown in-place without switching tabs
  const {
    compareMode: tokensCompareMode, setCompareMode: setTokensCompareMode,
    compareTokenPaths: tokensComparePaths, setCompareTokenPaths: setTokensComparePaths,
    compareTokenPath: tokensComparePath, setCompareTokenPath: setTokensComparePath,
    compareThemeKey: tokensCompareThemeKey, setCompareThemeKey: setTokensCompareThemeKey,
    compareThemeDefaultA: tokensCompareDefaultA,
    compareThemeDefaultB: tokensCompareDefaultB,
  } = useCompareState();
  const [showTokensCompare, setShowTokensCompare] = useState(false);
  // Open compare view within the Tokens tab in 'tokens' mode (multi-select comparison)
  const handleOpenTokenCompare = useCallback((paths: Set<string>) => {
    setTokensCompareMode('tokens');
    setTokensComparePaths(paths);
    setTokensCompareThemeKey(k => k + 1);
    setShowTokensCompare(true);
    navigateTo('define', 'tokens');
  }, [navigateTo, setTokensCompareMode, setTokensComparePaths, setTokensCompareThemeKey]);
  // Open compare view within the Tokens tab in 'cross-theme' mode for a specific token
  const handleOpenCrossThemeCompare = useCallback((path: string) => {
    setTokensCompareMode('cross-theme');
    setTokensComparePath(path);
    setTokensCompareThemeKey(k => k + 1);
    setShowTokensCompare(true);
    navigateTo('define', 'tokens');
  }, [navigateTo, setTokensCompareMode, setTokensComparePath, setTokensCompareThemeKey]);
  // Navigate the editor to the next (+1) or previous (-1) sibling in the displayed list
  const handleEditorNavigate = useCallback((direction: 1 | -1) => {
    if (!editingToken) return;
    const nodes = displayedLeafNodesRef.current;
    const idx = nodes.findIndex(n => n.path === editingToken.path);
    if (idx === -1) return;
    const next = nodes[idx + direction];
    if (next) {
      setEditingToken({ path: next.path, name: next.name, set: editingToken.set });
      setHighlightedToken(next.path);
    }
  }, [editingToken, setHighlightedToken, setEditingToken]);
  const handleEditorSave = useCallback((savedPath: string) => {
    setHighlightedToken(savedPath);
    setEditingToken(null);
    const affectedGens = generatorsBySource.get(savedPath) ?? [];
    refreshAll();
    if (affectedGens.length > 0) {
      const n = affectedGens.length;
      const genIds = affectedGens.map(g => g.id);
      pushActionToast(
        `Source token for ${n} ${n === 1 ? 'generator' : 'generators'} changed`,
        {
          label: 'Regenerate',
          onClick: async () => {
            for (const id of genIds) {
              try { await apiFetch(`${serverUrl}/api/generators/${id}/run`, { method: 'POST' }); } catch { /* ignore */ }
            }
            refreshGenerators();
          },
        },
      );
    }
  }, [refreshAll, setHighlightedToken, setEditingToken, generatorsBySource, pushActionToast, serverUrl, refreshGenerators]);
  const handleEditorSaveAndCreateAnother = useCallback((savedPath: string, savedType: string) => {
    setHighlightedToken(savedPath);
    refreshAll();
    // Derive parent prefix from saved path for sibling creation
    const segments = savedPath.split('.');
    const parentPrefix = segments.length > 1 ? segments.slice(0, -1).join('.') + '.' : '';
    setEditingToken({ path: parentPrefix, set: activeSet, isCreate: true, initialType: savedType });
  }, [refreshAll, setHighlightedToken, setEditingToken, activeSet]);
  const handleNavigateToSet = useCallback((targetSet: string, tokenPath: string) => {
    if (targetSet === activeSet) {
      setHighlightedToken(tokenPath);
    } else {
      setPendingHighlightForSet(tokenPath, targetSet);
      setActiveSet(targetSet);
    }
  }, [activeSet, setHighlightedToken, setPendingHighlightForSet, setActiveSet]);
  const handleNavigateToGenerator = useCallback((generatorId: string) => {
    navigateTo('define', 'generators');
    setFocusGeneratorId(generatorId);
  }, [navigateTo, setFocusGeneratorId]);
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
    () => computeHealthIssueCount(lintViolations, generators, validationSummary),
    [lintViolations, generators, validationSummary],
  );
  const [flowPanelInitialPath, setFlowPanelInitialPath] = useState<string | null>(null);
  // Command palette batch-delete state
  const [tokenListSelection, setTokenListSelection] = useState<string[]>([]);
  const [paletteDeleteConfirm, setPaletteDeleteConfirm] = useState<{ paths: string[]; label: string } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [windowWidth, setWindowWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const useSidePanel = windowWidth > 400
    && !!(editingToken || editingGeneratorData || previewingToken)
    && overflowPanel === null
    && activeTopTab === 'define' && activeSubTab === 'tokens'
    && (tokens.length > 0 || createFromEmpty);
  const isNarrow = windowWidth <= 360;

  // Token drag state: set when a drag from the token tree is in progress
  const [tokenDragState, setTokenDragState] = useState<{ paths: string[]; fromSet: string } | null>(null);

  // Move tokens to a different set after a drag-drop on a set tab
  const handleTokenDropOnSet = useCallback(async (targetSet: string) => {
    if (!tokenDragState) return;
    const { paths, fromSet } = tokenDragState;
    setTokenDragState(null);
    try {
      if (paths.length === 1) {
        await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(fromSet)}/tokens/move`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tokenPath: paths[0], targetSet }),
        });
      } else {
        await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(fromSet)}/batch-move`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paths, targetSet }),
        });
      }
      refreshTokens();
      setSuccessToast(paths.length === 1 ? `Moved "${paths[0]}" to "${targetSet}"` : `Moved ${paths.length} tokens to "${targetSet}"`);
    } catch (err) {
      setErrorToast(err instanceof ApiError ? err.message : 'Move failed: network error');
    }
  }, [tokenDragState, serverUrl, refreshTokens, setSuccessToast, setErrorToast]);

  // Set tab management (drag, context menu, overflow, new-set form)
  const { dragOverSetName, setTabMenuOpen, setTabsScrollRef, setTabsOverflow, cascadeDiff, handleSetDragOver, handleSetDragLeave, handleSetDrop, handleReorderSet, handleReorderSetFull, scrollSetTabs } = useSetTabs({ serverUrl, connected, getDisconnectSignal, sets, setSets, activeSet, addSetToState, refreshTokens, setSuccessToast, setErrorToast, markDisconnected, perSetFlat, allTokensFlat, activeThemes, tokenDragFromSet: tokenDragState?.fromSet ?? null, onTokenDropOnSet: handleTokenDropOnSet });

  // Group sync + scope state
  const { syncGroupPending, setSyncGroupPending, syncGroupApplying, syncGroupProgress, syncGroupStylesPending, setSyncGroupStylesPending, syncGroupStylesApplying, syncGroupStylesProgress, groupScopesPath, setGroupScopesPath, groupScopesSelected, setGroupScopesSelected, groupScopesApplying, groupScopesError, setGroupScopesError, groupScopesProgress, handleSyncGroup, handleSyncGroupStyles, syncGroupStylesError, syncGroupError, handleApplyGroupScopes } = useFigmaSync(serverUrl, connected, pathToSet, setCollectionNames, setModeNames, activeSet);

  useEffect(() => {
    if (syncGroupStylesError) setErrorToast(syncGroupStylesError);
  }, [syncGroupStylesError, setErrorToast]);

  useEffect(() => {
    if (syncGroupError) setErrorToast(syncGroupError);
  }, [syncGroupError, setErrorToast]);

  // Set management hooks
  const { editingMetadataSet, metadataDescription, setMetadataDescription, metadataCollectionName, setMetadataCollectionName, metadataModeName, setMetadataModeName, closeSetMetadata, openSetMetadata, handleSaveMetadata } = useSetMetadata({ serverUrl, connected, setDescriptions, setCollectionNames, setModeNames, updateSetMetadataInState, setTabMenuOpen, onError: setErrorToast });
  const { deletingSet, startDelete, cancelDelete, handleDeleteSet } = useSetDelete({ serverUrl, connected, getDisconnectSignal, sets, activeSet, setActiveSet, removeSetFromState, fetchTokensForSet, refreshTokens, setSuccessToast, setErrorToast, markDisconnected, setTabMenuOpen, onPushUndo: pushUndo });
  const { renamingSet, renameValue, setRenameValue, renameError, setRenameError, renameInputRef, startRename, cancelRename, handleRenameConfirm } = useSetRename({ serverUrl, connected, getDisconnectSignal, activeSet, setActiveSet, renameSetInState, setSuccessToast, markDisconnected, setTabMenuOpen, onPushUndo: pushUndo });
  const { handleDuplicateSet } = useSetDuplicate({ serverUrl, connected, getDisconnectSignal, sets, tokenCounts: setTokenCounts, addSetToState, refreshTokens, setSuccessToast, setErrorToast, markDisconnected, pushUndo, setTabMenuOpen });
  const { mergingSet, mergeTargetSet, mergeConflicts, mergeResolutions, mergeChecked, mergeLoading, openMergeDialog, closeMergeDialog, changeMergeTarget, setMergeResolutions, handleCheckMergeConflicts, handleConfirmMerge, splittingSet, splitPreview, splitDeleteOriginal, splitLoading, openSplitDialog, closeSplitDialog, setSplitDeleteOriginal, handleConfirmSplit } = useSetMergeSplit({ serverUrl, connected, sets, activeSet, setActiveSet, refreshTokens, setSuccessToast, setErrorToast, pushUndo, setTabMenuOpen });

  // Create set by name — used by the Manage Sets panel
  const createSetByName = useCallback(async (name: string) => {
    await apiFetch(`${serverUrl}/api/sets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
      signal: AbortSignal.any([AbortSignal.timeout(5000), getDisconnectSignal()]),
    });
    addSetToState(name, 0);
    setSuccessToast(`Created set "${name}"`);
  }, [serverUrl, getDisconnectSignal, addSetToState, setSuccessToast]);

  // Bulk delete sets — used by SetSwitcher multi-select
  const handleBulkDeleteSets = useCallback(async (setsToDelete: string[]) => {
    let currentActive = activeSet;
    const currentSets = sets;
    for (const setName of setsToDelete) {
      await apiFetch(`${serverUrl}/api/sets/${encodeURIComponent(setName)}`, {
        method: 'DELETE',
        signal: AbortSignal.any([AbortSignal.timeout(5000), getDisconnectSignal()]),
      });
      removeSetFromState(setName);
      if (currentActive === setName) {
        const remaining = currentSets.filter(s => !setsToDelete.includes(s));
        const newActive = remaining[0] ?? '';
        currentActive = newActive;
        setActiveSet(newActive);
        if (newActive) await fetchTokensForSet(newActive);
      }
    }
    setSuccessToast(`Deleted ${setsToDelete.length} set${setsToDelete.length !== 1 ? 's' : ''}`);
  }, [serverUrl, sets, activeSet, setActiveSet, removeSetFromState, fetchTokensForSet, setSuccessToast, getDisconnectSignal]);

  // Bulk duplicate sets — used by SetSwitcher multi-select
  const handleBulkDuplicateSets = useCallback(async (setsToDuplicate: string[]) => {
    for (const setName of setsToDuplicate) {
      const result = await apiFetch<{ ok: true; name: string; originalName: string }>(
        `${serverUrl}/api/sets/${encodeURIComponent(setName)}/duplicate`,
        { method: 'POST', signal: AbortSignal.any([AbortSignal.timeout(5000), getDisconnectSignal()]) },
      );
      addSetToState(result.name, setTokenCounts[setName] ?? 0);
    }
    setSuccessToast(`Duplicated ${setsToDuplicate.length} set${setsToDuplicate.length !== 1 ? 's' : ''}`);
  }, [serverUrl, addSetToState, setTokenCounts, setSuccessToast, getDisconnectSignal]);

  // Bulk move sets to folder — used by SetSwitcher multi-select
  const handleBulkMoveToFolder = useCallback(async (moves: Array<{ from: string; to: string }>) => {
    for (const { from, to } of moves) {
      await apiFetch(`${serverUrl}/api/sets/${encodeURIComponent(from)}/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName: to }),
        signal: AbortSignal.any([AbortSignal.timeout(5000), getDisconnectSignal()]),
      });
      renameSetInState(from, to);
      if (activeSet === from) setActiveSet(to);
    }
    setSuccessToast(`Moved ${moves.length} set${moves.length !== 1 ? 's' : ''} to folder`);
  }, [serverUrl, activeSet, setActiveSet, renameSetInState, setSuccessToast, getDisconnectSignal]);

  // Per-set type breakdown for tab tooltips
  const setByTypeCounts = useMemo(() => {
    const result: Record<string, Record<string, number>> = {};
    for (const [setName, flatMap] of Object.entries(perSetFlat)) {
      const byType: Record<string, number> = {};
      for (const entry of Object.values(flatMap)) {
        const t = (entry as { $type?: string }).$type || 'unknown';
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
      if (!msg || typeof msg.type !== 'string') return;
      if (!KNOWN_CONTROLLER_MESSAGE_TYPES.has(msg.type)) {
        console.warn(`[plugin] Unhandled controller message type: "${msg.type}"`, msg);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  useEffect(() => {
    if (activeTopTab === 'define' && activeSubTab === 'tokens' && tokens.length > 0) {
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
      if (e.key === 'Escape') { setMenuOpen(false); return; }
      if (menuRef.current) handleMenuArrowKeys(e, menuRef.current);
    };
    const handlePointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [menuOpen]);


  // Keyboard shortcuts — use a stable callback ref so the effect never
  // re-registers the listener yet always calls the latest handler.
  const keyboardShortcutRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyboardShortcutRef.current = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
    if (matchesShortcut(e, 'PASTE_TOKENS')) {
      e.preventDefault();
      setShowPasteModal(true);
    }
    if (matchesShortcut(e, 'OPEN_PALETTE')) {
      e.preventDefault();
      setCommandPaletteInitialQuery('');
      setShowCommandPalette(v => !v);
    }
    if (matchesShortcut(e, 'OPEN_TOKEN_SEARCH')) {
      e.preventDefault();
      setCommandPaletteInitialQuery('>');
      setShowCommandPalette(v => !v);
    }
    if (matchesShortcut(e, 'TOGGLE_PREVIEW')) {
      e.preventDefault();
      setShowPreviewSplit(v => !v);
      setOverflowPanel(null);
    }
    if (matchesShortcut(e, 'CREATE_FROM_SELECTION')) {
      e.preventDefault();
      navigateTo('apply', 'inspect');
      setTriggerCreateToken(n => n + 1);
    }
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'n') {
      e.preventDefault();
      navigateTo('define', 'tokens');
      setEditingToken({ path: '', set: activeSet, isCreate: true });
    }
    if (matchesShortcut(e, 'GO_TO_DEFINE')) { e.preventDefault(); navigateTo('define', 'tokens'); }
    if (matchesShortcut(e, 'GO_TO_APPLY'))  { e.preventDefault(); navigateTo('apply', 'inspect'); }
    if (matchesShortcut(e, 'GO_TO_SHIP'))   { e.preventDefault(); navigateTo('ship', 'publish'); }
    if (matchesShortcut(e, 'TOGGLE_QUICK_APPLY')) {
      e.preventDefault();
      setShowQuickApply(v => !v);
    }
    if (matchesShortcut(e, 'QUICK_SWITCH_SET')) {
      e.preventDefault();
      setShowSetSwitcher(v => !v);
    }
    if (matchesShortcut(e, 'GO_TO_RESOLVER')) {
      e.preventDefault();
      navigateTo('define', 'themes');
      setTimeout(() => { themeManagerHandleRef.current?.switchToResolverMode(); }, 50);
    }
    if (matchesShortcut(e, 'SHOW_SHORTCUTS')) {
      e.preventDefault();
      setShowKeyboardShortcuts(v => !v);
    }
    if (matchesShortcut(e, 'OPEN_SETTINGS')) {
      e.preventDefault();
      openOverflowPanel('settings');
    }
    if (matchesShortcut(e, 'NEXT_LINT_ISSUE')) {
      e.preventDefault();
      jumpToNextIssue();
    }
    if (matchesShortcut(e, 'EXPORT_WITH_PRESET')) {
      e.preventDefault();
      // Open command palette pre-filtered to export preset commands
      setCommandPaletteInitialQuery('Export with preset');
      setShowCommandPalette(true);
    }
  };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => keyboardShortcutRef.current(e);
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);



  const openOverflowPanel = useCallback((panel: OverflowPanel) => {
    setMenuOpen(false);
    setShowNotificationHistory(false);
    setOverflowPanel(panel);
  }, [setOverflowPanel]);

  const jumpToNextIssue = useCallback(() => {
    if (lintViolations.length === 0) {
      setErrorToast('No validation issues in the current set');
      return;
    }
    lintIssueIndexRef.current = (lintIssueIndexRef.current + 1) % lintViolations.length;
    const violation = lintViolations[lintIssueIndexRef.current];
    navigateTo('define', 'tokens');
    setEditingToken(null);
    setHighlightedToken(violation.path);
    const n = lintIssueIndexRef.current + 1;
    const total = lintViolations.length;
    const icon = violation.severity === 'error' ? '✗' : violation.severity === 'warning' ? '⚠' : 'ℹ';
    setSuccessToast(`${icon} Issue ${n}/${total}: ${violation.message}`);
  }, [lintViolations, navigateTo, setEditingToken, setHighlightedToken, setErrorToast, setSuccessToast]);


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
      await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(activeSet)}/batch-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths }),
      });
      setTokenListSelection([]);
      pushUndo({
        description: paths.length === 1 ? `Delete "${paths[0]}"` : `Delete ${paths.length} tokens`,
        restore: async () => {
          for (const [path, token] of Object.entries(snapshot)) {
            await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(activeSet)}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ path, value: token.$value, type: token.$type }),
            });
          }
          refreshAll();
        },
        redo: async () => {
          await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(activeSet)}/batch-delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paths }),
          });
          refreshAll();
        },
      });
      refreshAll();
      setSuccessToast(`Deleted ${paths.length} token${paths.length !== 1 ? 's' : ''}`);
    } catch (err) {
      console.warn('[App] palette delete failed:', err);
      setErrorToast('Delete failed — check server connection');
    }
  }, [paletteDeleteConfirm, allTokensFlat, serverUrl, activeSet, pushUndo, refreshAll, setSuccessToast, setErrorToast]);

  // Duplicate a token from the command palette (shared between contextual command and token search button)
  const handlePaletteDuplicate = useCallback(async (path: string) => {
    const entry = allTokensFlat[path];
    if (!entry || !connected) return;
    const tokenNode = findLeafByPath(tokens, path);
    const targetSet = pathToSet[path] ?? activeSet;
    const baseCopy = `${path}-copy`;
    let newPath = baseCopy;
    let i = 2;
    while (allTokensFlat[newPath]) { newPath = `${baseCopy}-${i++}`; }
    try {
      const body: Record<string, unknown> = { $type: entry.$type, $value: entry.$value };
      if (tokenNode?.$description) body.$description = tokenNode.$description;
      if (tokenNode?.$extensions) body.$extensions = tokenNode.$extensions;
      await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(targetSet)}/${tokenPathToUrlSegment(newPath)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      await refreshTokens();
      navigateTo('define', 'tokens');
      if (targetSet !== activeSet) {
        setActiveSet(targetSet);
        setPendingHighlight(newPath);
      } else {
        setHighlightedToken(newPath);
      }
    } catch (err) {
      console.warn('[App] duplicate token from palette failed:', err);
    }
  }, [allTokensFlat, connected, tokens, pathToSet, activeSet, serverUrl, navigateTo, refreshTokens, setActiveSet, setPendingHighlight, setHighlightedToken]);

  // Navigate to a token and trigger inline rename mode
  const handlePaletteRename = useCallback((path: string) => {
    const targetSet = pathToSet[path];
    navigateTo('define', 'tokens');
    setEditingToken(null);
    if (targetSet && targetSet !== activeSet) {
      setActiveSet(targetSet);
      setPendingHighlight(path);
    } else {
      setHighlightedToken(path);
      tokenListCompareRef.current?.triggerInlineRename(path);
    }
  }, [pathToSet, activeSet, navigateTo, setEditingToken, setActiveSet, setPendingHighlight, setHighlightedToken]);

  // Trigger the move-to-set dialog for a token
  const handlePaletteMove = useCallback((path: string) => {
    const targetSet = pathToSet[path];
    navigateTo('define', 'tokens');
    setEditingToken(null);
    if (targetSet && targetSet !== activeSet) {
      setActiveSet(targetSet);
      setPendingHighlight(path);
    } else {
      setHighlightedToken(path);
      tokenListCompareRef.current?.triggerMoveToken(path);
    }
  }, [pathToSet, activeSet, navigateTo, setEditingToken, setActiveSet, setPendingHighlight, setHighlightedToken]);

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
      value: typeof entry.$value === 'string' ? entry.$value : JSON.stringify(entry.$value),
      set: pathToSet[path],
      isAlias: isAlias(entry.$value),
      generatorName: derivedTokenPaths.get(path)?.name,
    }));
  }, [allTokensFlat, pathToSet, derivedTokenPaths]);

  // Pinned and recently-touched tokens for command palette quick-access sections
  const pinnedPaletteTokens: TokenEntry[] = useMemo(() => {
    return Array.from(palettePinnedTokens.paths)
      .filter(path => allTokensFlat[path])
      .map(path => {
        const entry = allTokensFlat[path];
        return {
          path,
          type: entry.$type,
          value: typeof entry.$value === 'string' ? entry.$value : JSON.stringify(entry.$value),
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
          value: typeof entry.$value === 'string' ? entry.$value : JSON.stringify(entry.$value),
          set: pathToSet[path],
          isAlias: isAlias(entry.$value),
        };
      });
  }, [recentlyTouched.timestamps, allTokensFlat, pathToSet]);

  const workspacePills = useMemo(() => {
    const pills: Array<{ label: string; tone: 'neutral' | 'accent' | 'warning' | 'danger' | 'success' }> = [];
    switch (activeWorkspace.id) {
      case 'tokens':
        pills.push({ label: `${sets.length} set${sets.length === 1 ? '' : 's'}`, tone: 'neutral' });
        if (lintViolations.length > 0) pills.push({ label: `${lintViolations.length} issue${lintViolations.length === 1 ? '' : 's'}`, tone: 'danger' });
        if (staleGeneratorCount > 0) pills.push({ label: `${staleGeneratorCount} stale generator${staleGeneratorCount === 1 ? '' : 's'}`, tone: 'warning' });
        break;
      case 'themes':
        pills.push({ label: `${dimensions.length} dimension${dimensions.length === 1 ? '' : 's'}`, tone: 'neutral' });
        if (themeGapCount > 0) pills.push({ label: `${themeGapCount} gap${themeGapCount === 1 ? '' : 's'}`, tone: 'warning' });
        break;
      case 'apply':
        pills.push({ label: `${selectedNodes.length} layer${selectedNodes.length === 1 ? '' : 's'} selected`, tone: selectedNodes.length > 0 ? 'accent' : 'neutral' });
        break;
      case 'sync':
        if (activeWorkspaceSection?.id === 'publish') {
          if (pendingPublishCount > 0) {
            pills.push({ label: `${pendingPublishCount} Figma change${pendingPublishCount === 1 ? '' : 's'} pending`, tone: 'accent' });
          } else {
            pills.push({ label: 'No Figma changes pending', tone: 'success' });
          }
        }
        break;
      case 'audit':
        if (validationLoading) {
          pills.push({ label: 'Auditing…', tone: 'accent' });
        } else if (validationSummary === null) {
          pills.push({ label: 'Run audit', tone: 'neutral' });
        } else if (healthIssueCount > 0) {
          pills.push({ label: `${healthIssueCount} audit issue${healthIssueCount === 1 ? '' : 's'}`, tone: 'danger' });
        }
        if (undoDescriptions.length > 0) pills.push({ label: `${undoDescriptions.length} undo step${undoDescriptions.length === 1 ? '' : 's'}`, tone: 'neutral' });
        if (validationSummary !== null && healthIssueCount === 0 && undoDescriptions.length === 0) pills.push({ label: 'No active alerts', tone: 'success' });
        break;
    }
    return pills;
  }, [
    activeWorkspace.id,
    activeWorkspaceSection?.id,
    dimensions.length,
    healthIssueCount,
    lintViolations.length,
    pendingPublishCount,
    selectedNodes.length,
    sets.length,
    staleGeneratorCount,
    themeGapCount,
    undoDescriptions.length,
    validationLoading,
    validationSummary,
  ]);

  const renderWorkspaceActions = () => {
    if (activeWorkspace.id === 'tokens' && activeWorkspaceSection?.id === 'tokens') {
      return (
        <>
          <button
            onClick={() => setShowIssuesOnly(v => !v)}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors ${
              showIssuesOnly
                ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)] text-white'
                : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)]/40 hover:text-[var(--color-figma-text)]'
            }`}
            aria-pressed={showIssuesOnly}
          >
            Issues only
            {lintViolations.length > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-[9px] leading-none ${showIssuesOnly ? 'bg-white/20 text-white' : 'bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text)]'}`}>
                {lintViolations.length > 99 ? '99+' : lintViolations.length}
              </span>
            )}
          </button>
          <button
            onClick={() => { setShowPreviewSplit(v => !v); setOverflowPanel(null); }}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors ${
              showPreviewSplit
                ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)] text-white'
                : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)]/40 hover:text-[var(--color-figma-text)]'
            }`}
            aria-pressed={showPreviewSplit}
          >
            {showPreviewSplit ? 'Hide preview' : 'Show preview'}
          </button>
        </>
      );
    }

    if (activeWorkspace.id === 'themes') {
      return (
        <button
          onClick={() => themeManagerHandleRef.current?.switchToResolverMode()}
          className="inline-flex items-center gap-1 rounded-full border border-[var(--color-figma-border)] px-2.5 py-1 text-[10px] font-medium text-[var(--color-figma-text-secondary)] transition-colors hover:border-[var(--color-figma-accent)]/40 hover:text-[var(--color-figma-text)]"
        >
          Open resolver
        </button>
      );
    }

    if (activeWorkspace.id === 'apply' && selectedNodes.length > 0) {
      return (
        <button
          onClick={() => setShowQuickApply(true)}
          className="inline-flex items-center gap-1 rounded-full border border-[var(--color-figma-border)] px-2.5 py-1 text-[10px] font-medium text-[var(--color-figma-text-secondary)] transition-colors hover:border-[var(--color-figma-accent)]/40 hover:text-[var(--color-figma-text)]"
        >
          Quick apply
        </button>
      );
    }

    if (activeWorkspace.id === 'audit' && activeWorkspaceSection?.id === 'health') {
      return (
        <button
          onClick={refreshValidation}
          className="inline-flex items-center gap-1 rounded-full border border-[var(--color-figma-border)] px-2.5 py-1 text-[10px] font-medium text-[var(--color-figma-text-secondary)] transition-colors hover:border-[var(--color-figma-accent)]/40 hover:text-[var(--color-figma-text)]"
        >
          Refresh audit
        </button>
      );
    }

    return null;
  };

  const handleSecondaryAction = useCallback((actionId: SecondaryActionId) => {
    setMenuOpen(false);
    switch (actionId) {
      case 'command-palette':
        setShowNotificationHistory(false);
        setCommandPaletteInitialQuery('');
        setShowCommandPalette(true);
        return;
      case 'paste-tokens':
        setShowNotificationHistory(false);
        setShowPasteModal(true);
        return;
      case 'import':
        openOverflowPanel('import');
        return;
      case 'notifications':
        setOverflowPanel(null);
        setShowNotificationHistory(v => !v);
        return;
      case 'keyboard-shortcuts':
        setShowNotificationHistory(false);
        setShowKeyboardShortcuts(true);
        return;
      case 'window-size':
        setShowNotificationHistory(false);
        toggleExpand();
        return;
      case 'settings':
        openOverflowPanel('settings');
        return;
    }
  }, [
    openOverflowPanel,
    setCommandPaletteInitialQuery,
    setMenuOpen,
    setOverflowPanel,
    setShowCommandPalette,
    setShowKeyboardShortcuts,
    setShowNotificationHistory,
    setShowPasteModal,
    toggleExpand,
  ]);

  const secondaryActionDetail = useCallback((actionId: SecondaryActionId): string => {
    switch (actionId) {
      case 'command-palette':
        return adaptShortcut(SHORTCUT_KEYS.OPEN_PALETTE);
      case 'paste-tokens':
        return adaptShortcut(SHORTCUT_KEYS.PASTE_TOKENS);
      case 'import':
        return 'Admin';
      case 'notifications':
        return String(notificationHistory.length);
      case 'keyboard-shortcuts':
        return '?';
      case 'window-size':
        return isExpanded ? 'Windowed' : 'Expanded';
      case 'settings':
        return 'Admin';
    }
  }, [isExpanded, notificationHistory.length]);

  const utilitiesAttention = !connected || notificationHistory.length > 0;
  const utilitiesStatusLabel = checking
    ? 'Connecting…'
    : connected
      ? `Connected to ${serverUrl}`
      : `Cannot reach ${serverUrl}`;
  const workspaceActions = renderWorkspaceActions();

  const pillToneClasses: Record<'neutral' | 'accent' | 'warning' | 'danger' | 'success', string> = {
    neutral: 'border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)]',
    accent: 'border-[var(--color-figma-accent)]/25 bg-[var(--color-figma-accent)]/8 text-[var(--color-figma-accent)]',
    warning: 'border-amber-400/30 bg-amber-400/10 text-amber-700',
    danger: 'border-red-500/25 bg-red-500/10 text-red-500',
    success: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600',
  };

  return (
    <div className="relative flex flex-col h-screen">
      {/* Connection status — only shown when not connected */}
      {!connected && (
        <div className={`flex flex-col text-[10px] ${checking ? 'bg-[var(--color-figma-text-secondary)]/5 text-[var(--color-figma-text-secondary)]' : 'bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)]'}`}>
          {/* Status row */}
          <div className="flex items-center gap-1.5 px-3 py-1.5">
            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${checking ? 'bg-[var(--color-figma-text-secondary)] animate-pulse' : 'bg-[var(--color-figma-error)]'}`} />
            <span className="flex-1">{checking ? 'Connecting\u2026' : `Cannot reach ${serverUrl} \u2014 read-only mode`}</span>
            {!checking && (
              <>
                <button
                  onClick={retryConnection}
                  className="underline underline-offset-2 hover:opacity-70 transition-opacity shrink-0"
                >
                  Retry
                </button>
                <span className="opacity-40">·</span>
                <button
                  onClick={() => { setShowBannerUrlEditor(v => !v); setBannerUrlInput(serverUrl); setBannerConnectResult(null); }}
                  className="underline underline-offset-2 hover:opacity-70 transition-opacity shrink-0"
                >
                  {showBannerUrlEditor ? 'Cancel' : 'Change URL'}
                </button>
              </>
            )}
          </div>
          {/* Inline URL editor — expands when "Change URL" is clicked */}
          {showBannerUrlEditor && !checking && (
            <div className="flex flex-col gap-1.5 px-3 pb-2.5 pt-0.5">
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={bannerUrlInput}
                  onChange={e => { setBannerUrlInput(e.target.value); setBannerConnectResult(null); }}
                  onKeyDown={async e => {
                    if (e.key === 'Enter') {
                      setBannerConnectResult(null);
                      const ok = await updateServerUrlAndConnect(bannerUrlInput.trim());
                      setBannerConnectResult(ok ? 'ok' : 'fail');
                      if (ok) setShowBannerUrlEditor(false);
                    }
                  }}
                  placeholder="http://localhost:9400"
                  autoFocus
                  className="flex-1 min-w-0 px-2 py-1 rounded border border-current/30 bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] text-[11px] placeholder-[var(--color-figma-text-tertiary)] focus-visible:border-[var(--color-figma-accent)] outline-none"
                />
                <button
                  onClick={async () => {
                    setBannerConnectResult(null);
                    const ok = await updateServerUrlAndConnect(bannerUrlInput.trim());
                    setBannerConnectResult(ok ? 'ok' : 'fail');
                    if (ok) setShowBannerUrlEditor(false);
                  }}
                  disabled={checking || !bannerUrlInput.trim()}
                  className="px-2.5 py-1 text-[11px] font-medium rounded bg-[var(--color-figma-accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                >
                  Connect
                </button>
              </div>
              {bannerConnectResult === 'fail' && (
                <span className="text-[10px] text-[var(--color-figma-error)]">Cannot reach server — check the URL and try again</span>
              )}
            </div>
          )}
        </div>
      )}

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
              {APP_SHELL_NAVIGATION.workspaces.map(workspace => {
                const isActive = workspace.id === activeWorkspaceId;
                return (
                  <button
                    key={workspace.id}
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => guardEditorAction(() => navigateTo(workspace.topTab, workspace.subTab))}
                    className={`shrink-0 rounded-[10px] px-3 py-1.5 text-[11px] font-medium transition-colors ${
                      isActive
                        ? 'bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] shadow-sm ring-1 ring-[var(--color-figma-border)]'
                        : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]'
                    }`}
                  >
                    {workspace.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="relative shrink-0" ref={menuRef}>
            <button
              onClick={() => {
                setShowNotificationHistory(false);
                setMenuOpen(v => !v);
              }}
              className={`relative inline-flex min-h-[36px] items-center gap-2 rounded-[12px] border px-3 py-1.5 text-[11px] font-medium transition-colors ${
                menuOpen
                  ? 'border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text)]'
                  : 'border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]'
              }`}
              aria-label="Open utilities"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <span>{APP_SHELL_NAVIGATION.secondaryArea.triggerLabel}</span>
              <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" aria-hidden="true" className={`transition-transform ${menuOpen ? 'rotate-90' : ''}`}>
                <path d="M2 1l4 3-4 3V1z" />
              </svg>
              {utilitiesAttention && (
                <span className={`absolute right-1 top-1 h-1.5 w-1.5 rounded-full ${!connected && !checking ? 'bg-[var(--color-figma-error)]' : 'bg-[var(--color-figma-accent)]'}`} aria-hidden="true" />
              )}
            </button>

            {showNotificationHistory && (
              <NotificationHistory
                history={notificationHistory}
                onClear={clearNotificationHistory}
                onClose={() => setShowNotificationHistory(false)}
              />
            )}

            {menuOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-56 overflow-hidden rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-lg" role="menu">
                <div className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-2">
                  <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-figma-text-tertiary)]">{APP_SHELL_NAVIGATION.secondaryArea.label}</div>
                  <div className="mt-0.5 text-[10px] text-[var(--color-figma-text-secondary)]">{utilitiesStatusLabel}</div>
                </div>
                {APP_SHELL_NAVIGATION.secondaryArea.sections.map((section, sectionIndex) => (
                  <div key={section.id}>
                    {sectionIndex > 0 && <div className="border-t border-[var(--color-figma-border)]" />}
                    <div className="px-3 py-1.5">
                      <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-figma-text-tertiary)]">{section.label}</div>
                      <div className="mt-0.5 text-[10px] text-[var(--color-figma-text-secondary)]">{section.description}</div>
                    </div>
                    {section.actions.map(action => (
                      <button
                        key={action.id}
                        role="menuitem"
                        tabIndex={-1}
                        onClick={() => handleSecondaryAction(action.id)}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-[11px] text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
                        title={action.description}
                      >
                        <span>{action.id === 'window-size' ? (isExpanded ? 'Restore window' : 'Expand window') : action.label}</span>
                        <span className="text-[10px] text-[var(--color-figma-text-secondary)]">{secondaryActionDetail(action.id)}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
          <div className="flex flex-col gap-2 px-3 py-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-figma-text-tertiary)]">
                  Current workspace
                </div>
                <div className="mt-1 flex min-w-0 items-center gap-2">
                  <div className="truncate text-[13px] font-semibold text-[var(--color-figma-text)]">
                    {activeWorkspace.label}
                  </div>
                  {activeWorkspaceSection && (
                    <span className="shrink-0 rounded-full border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.06em] text-[var(--color-figma-text-secondary)]">
                      {activeWorkspaceSection.label}
                    </span>
                  )}
                </div>
                <div className="mt-1 text-[11px] text-[var(--color-figma-text-secondary)]">
                  {activeWorkspaceSection?.description ?? activeWorkspace.description}
                </div>
              </div>

              {workspaceActions && (
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                  {workspaceActions}
                </div>
              )}
            </div>

            {(activeWorkspace.sections && activeWorkspace.sections.length > 1) || workspacePills.length > 0 ? (
              <div className="flex items-center gap-3 overflow-x-auto pb-0.5">
                {activeWorkspace.sections && activeWorkspace.sections.length > 1 && (
                  <div className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] p-1" role="tablist" aria-label={`${activeWorkspace.label} sections`}>
                    <span className="pl-2 pr-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-figma-text-tertiary)]">
                      Sections
                    </span>
                    {activeWorkspace.sections.map(section => {
                      const isSectionActive = section.topTab === activeTopTab && section.subTab === activeSubTab;
                      return (
                        <button
                          key={`${section.topTab}:${section.subTab}`}
                          role="tab"
                          aria-selected={isSectionActive}
                          onClick={() => {
                            guardEditorAction(() => {
                              navigateTo(section.topTab, section.subTab);
                              if (section.subTab === 'canvas-analysis') triggerHeatmapScan();
                            });
                          }}
                          className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors ${
                            isSectionActive
                              ? 'bg-[var(--color-figma-accent)] text-white'
                              : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]'
                          }`}
                        >
                          {section.label}
                        </button>
                      );
                    })}
                  </div>
                )}

                {workspacePills.length > 0 && (
                  <div className="inline-flex min-w-0 items-center gap-1.5">
                    <span className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-figma-text-tertiary)]">
                      Status
                    </span>
                    {workspacePills.map((pill, index) => (
                      <span
                        key={`${pill.label}-${index}`}
                        className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-medium ${pillToneClasses[pill.tone]}`}
                      >
                        {pill.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Set switching surface */}
      {activeTopTab === 'define' && activeSubTab === 'tokens' && overflowPanel === null && sets.length > 0 && (
        <div className={`border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] ${tokenDragState ? 'bg-[var(--color-figma-accent)]/[0.03]' : ''}`}>
          <div className="relative flex items-center gap-2 px-2 py-1.5">
            <button
              onClick={() => setShowSetSwitcher(true)}
              className="shrink-0 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-left transition-colors hover:bg-[var(--color-figma-bg-hover)]"
              aria-label="Open set switcher"
            >
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-[var(--color-figma-text-secondary)]">Set</span>
                <span className="max-w-[180px] truncate text-[11px] font-medium text-[var(--color-figma-text)]">{activeSet}</span>
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" className="text-[var(--color-figma-text-tertiary)]">
                  <path d="M1 3l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </button>

            <div className="relative min-w-0 flex-1">
              <div ref={setTabsScrollRef} className="flex gap-1 overflow-x-auto pr-6" style={{ scrollbarWidth: 'none' }}>
                {sets.map(set => {
                  const isActive = activeSet === set;
                  const isTokenDragSource = tokenDragState?.fromSet === set;
                  const isTokenDropTarget = tokenDragState && !isTokenDragSource;
                  const isTokenHovered = isTokenDropTarget && dragOverSetName === set;
                  const themeStatus = setThemeStatusMap[set];
                  return (
                    <button
                      key={set}
                      data-active-set={isActive}
                      onClick={() => guardEditorAction(() => setActiveSet(set))}
                      onDragOver={e => handleSetDragOver(e, set)}
                      onDragLeave={handleSetDragLeave}
                      onDrop={e => handleSetDrop(e, set)}
                      title={(() => {
                        const parts: string[] = [setDescriptions[set] || set];
                        const byType = setByTypeCounts[set];
                        if (byType) {
                          const breakdown = Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([t, c]) => `${c} ${t}`).join(' · ');
                          if (breakdown) parts.push(breakdown);
                        }
                        if (themeStatus) parts.push(`theme: ${themeStatus}`);
                        return parts.join('\n');
                      })()}
                      className={`flex shrink-0 items-center gap-1.5 rounded px-2 py-1 text-[10px] transition-colors ${
                        isActive
                          ? 'bg-[var(--color-figma-accent)] text-white'
                          : 'bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
                      } ${
                        isTokenDragSource ? 'opacity-40' : ''
                      } ${
                        isTokenDropTarget
                          ? isTokenHovered
                            ? 'ring-2 ring-inset ring-[var(--color-figma-accent)]'
                            : 'ring-1 ring-inset ring-[var(--color-figma-accent)]/40'
                          : ''
                      }`}
                    >
                      {themeStatus && (
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            themeStatus === 'enabled'
                              ? isActive ? 'bg-green-300' : 'bg-green-500'
                              : themeStatus === 'source'
                                ? isActive ? 'bg-sky-300' : 'bg-sky-500'
                                : isActive ? 'bg-white/30' : 'bg-gray-400/50'
                          }`}
                        />
                      )}
                      <span className="max-w-[120px] truncate">{set}</span>
                      {setTokenCounts[set] !== undefined && (
                        <span className={`rounded-full px-1.5 py-0.5 leading-none tabular-nums ${isActive ? 'bg-white/20 text-white/90' : 'bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-tertiary)]'}`}>
                          {isActive && filteredSetCount !== null ? `${filteredSetCount}\u2009/\u2009${setTokenCounts[set]}` : setTokenCounts[set]}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {setTabsOverflow.left && (
                <>
                  <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-[var(--color-figma-bg-secondary)] to-transparent" aria-hidden="true" />
                  <button
                    onClick={() => scrollSetTabs('left')}
                    className="absolute left-0 top-0 bottom-0 z-[2] flex w-5 items-center justify-center text-[var(--color-figma-text-secondary)] transition-colors hover:text-[var(--color-figma-text)]"
                    aria-label="Scroll sets left"
                  >
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
                      <path d="M6 1L2 4l4 3V1z" />
                    </svg>
                  </button>
                </>
              )}
              {setTabsOverflow.right && (
                <>
                  <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-[var(--color-figma-bg-secondary)] to-transparent" aria-hidden="true" />
                  <button
                    onClick={() => scrollSetTabs('right')}
                    className="absolute right-0 top-0 bottom-0 z-[2] flex w-5 items-center justify-center text-[var(--color-figma-text-secondary)] transition-colors hover:text-[var(--color-figma-text)]"
                    aria-label="Scroll sets right"
                  >
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
                      <path d="M2 1l4 3-4 3V1z" />
                    </svg>
                  </button>
                </>
              )}
            </div>

            <button
              onClick={() => openOverflowPanel('sets')}
              className="shrink-0 rounded px-2 py-1 text-[10px] text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
            >
              Manage
            </button>
          </div>
          {tokenDragState && (
            <div className="border-t border-[var(--color-figma-border)] px-2 py-0.5 text-[10px] text-[var(--color-figma-text-tertiary)]">
              Drop on a set to move {tokenDragState.paths.length} token{tokenDragState.paths.length !== 1 ? 's' : ''}.
            </div>
          )}
        </div>
      )}

      <ErrorBoundary>
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          {overflowPanel === 'sets' ? (
            <SetManager
              sets={sets}
              activeSet={activeSet}
              onClose={() => setOverflowPanel(null)}
              onOpenQuickSwitch={() => {
                setOverflowPanel(null);
                setShowSetSwitcher(true);
              }}
              onOpenGenerators={(set) => {
                guardEditorAction(() => {
                  setActiveSet(set);
                  navigateTo('define', 'generators');
                  setOverflowPanel(null);
                });
              }}
              onRename={startRename}
              onDuplicate={handleDuplicateSet}
              onDelete={startDelete}
              onReorder={handleReorderSet}
              onReorderFull={handleReorderSetFull}
              onCreateSet={createSetByName}
              onEditInfo={(set) => {
                setOverflowPanel(null);
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
            />
          ) : (
            <>
          {/* Theme/Mode switcher — always visible on tokens tab */}
          {activeTopTab === 'define' && activeSubTab === 'tokens' && overflowPanel === null && (
            isNarrow && dimensions.length > 0 && !dimBarExpanded ? (
              <button
                onClick={() => setDimBarExpanded(true)}
                className="flex shrink-0 items-center gap-1.5 px-2 py-1 w-full bg-[var(--color-figma-bg)] border-b border-[var(--color-figma-border)] text-left"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" aria-hidden="true">
                  <circle cx="3.5" cy="5" r="2.5"/>
                  <circle cx="6.5" cy="5" r="2.5"/>
                </svg>
                <span className="text-[10px] text-[var(--color-figma-text-secondary)] truncate flex-1">
                  {dimensions.map(d => activeThemes[d.id]).filter(Boolean).join(' · ') || 'None'}
                </span>
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" className="shrink-0 text-[var(--color-figma-text-tertiary)]">
                  <path d="M1 3l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            ) : (
            <div ref={dimDropdownRef} className="flex shrink-0 flex-wrap items-center gap-1.5 px-2 py-1 bg-[var(--color-figma-bg)] border-b border-[var(--color-figma-border)]">
              <span className="text-[10px] text-[var(--color-figma-text-tertiary)] shrink-0 flex items-center gap-1">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" aria-hidden="true">
                  <circle cx="3.5" cy="5" r="2.5"/>
                  <circle cx="6.5" cy="5" r="2.5"/>
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
                  {dimensions.map(dim => {
                    const activeOption = activeThemes[dim.id];
                    const previewOption = previewThemes[dim.id];
                    const isOpen = openDimDropdown === dim.id;
                    if (dim.options.length <= 5) {
                      return (
                        <div
                          key={dim.id}
                          className="flex items-center gap-1"
                          onMouseLeave={() => { const next = { ...previewThemes }; delete next[dim.id]; setPreviewThemes(next); }}
                        >
                          <span className="text-[10px] text-[var(--color-figma-text-tertiary)] shrink-0">{dim.name}:</span>
                          <div className="flex rounded overflow-hidden border border-[var(--color-figma-border)]">
                            <button
                              onClick={() => { const next = { ...activeThemes }; delete next[dim.id]; setActiveThemes(next); }}
                              onMouseEnter={() => { const next = { ...previewThemes }; delete next[dim.id]; setPreviewThemes(next); }}
                              className={`px-2 py-0.5 text-[10px] transition-colors border-r border-[var(--color-figma-border)] ${
                                !activeOption && !previewOption
                                  ? 'bg-[var(--color-figma-accent)] text-white font-medium'
                                  : 'bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
                              }`}
                            >
                              None
                            </button>
                            {dim.options.map((opt, i) => {
                              const isActive = activeOption === opt.name;
                              const isPreviewing = previewOption === opt.name && previewOption !== activeOption;
                              return (
                                <button
                                  key={opt.name}
                                  onClick={() => { setActiveThemes({ ...activeThemes, [dim.id]: opt.name }); const next = { ...previewThemes }; delete next[dim.id]; setPreviewThemes(next); }}
                                  onMouseEnter={() => setPreviewThemes({ ...previewThemes, [dim.id]: opt.name })}
                                  title={isActive ? `${opt.name} (active)` : `Preview ${opt.name} — click to apply`}
                                  className={`px-2 py-0.5 text-[10px] transition-colors ${i < dim.options.length - 1 ? 'border-r border-[var(--color-figma-border)]' : ''} ${
                                    isActive
                                      ? 'bg-[var(--color-figma-accent)] text-white font-medium'
                                      : isPreviewing
                                        ? 'bg-[var(--color-figma-accent)] text-white opacity-60'
                                        : 'bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
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
                      <div key={dim.id} className="relative flex items-center gap-1">
                        <span className="text-[10px] text-[var(--color-figma-text-tertiary)] shrink-0">{dim.name}:</span>
                        <button
                          onClick={() => setOpenDimDropdown(isOpen ? null : dim.id)}
                          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-colors ${
                            activeOption
                              ? 'bg-[var(--color-figma-accent)] text-white font-medium'
                              : 'bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] border border-[var(--color-figma-border)]'
                          }`}
                        >
                          {activeOption || 'None'}
                          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                            <path d="M1 3l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                        {isOpen && (
                          <div
                            className="absolute top-full left-0 mt-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-lg z-50 py-1 min-w-[120px]"
                            onMouseLeave={() => { const next = { ...previewThemes }; delete next[dim.id]; setPreviewThemes(next); }}
                          >
                            <button
                              onClick={() => { const next = { ...activeThemes }; delete next[dim.id]; setActiveThemes(next); setOpenDimDropdown(null); }}
                              onMouseEnter={() => { const next = { ...previewThemes }; delete next[dim.id]; setPreviewThemes(next); }}
                              className={`w-full text-left px-3 py-1.5 text-[10px] hover:bg-[var(--color-figma-bg-hover)] transition-colors ${
                                !activeOption ? 'text-[var(--color-figma-accent)] font-medium' : 'text-[var(--color-figma-text)]'
                              }`}
                            >
                              None
                            </button>
                            {dim.options.map(opt => (
                              <button
                                key={opt.name}
                                onClick={() => { setActiveThemes({ ...activeThemes, [dim.id]: opt.name }); setOpenDimDropdown(null); const next = { ...previewThemes }; delete next[dim.id]; setPreviewThemes(next); }}
                                onMouseEnter={() => setPreviewThemes({ ...previewThemes, [dim.id]: opt.name })}
                                title={activeOption === opt.name ? `${opt.name} (active)` : `Preview ${opt.name} — click to apply`}
                                className={`w-full text-left px-3 py-1.5 text-[10px] hover:bg-[var(--color-figma-bg-hover)] transition-colors flex items-center justify-between ${
                                  activeOption === opt.name ? 'text-[var(--color-figma-accent)] font-medium' : 'text-[var(--color-figma-text)]'
                                }`}
                              >
                                {opt.name}
                                {previewThemes[dim.id] === opt.name && activeOption !== opt.name && (
                                  <span className="text-[8px] text-[var(--color-figma-text-tertiary)] ml-2 opacity-70">preview</span>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <button
                    onClick={() => navigateTo('define', 'themes')}
                    className="ml-auto text-[10px] text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-accent)] transition-colors px-1"
                    title="Manage theme axes"
                    aria-label="Manage theme axes"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" aria-hidden="true">
                      <circle cx="5" cy="2" r="1"/>
                      <circle cx="5" cy="5" r="1"/>
                      <circle cx="5" cy="8" r="1"/>
                    </svg>
                  </button>
                </>
              ) : connected ? (
                <button
                  onClick={() => navigateTo('define', 'themes')}
                  className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-bg-secondary)] border border-dashed border-[var(--color-figma-border)] hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)] transition-colors"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" aria-hidden="true">
                    <circle cx="3.5" cy="5" r="2.5"/>
                    <circle cx="6.5" cy="5" r="2.5"/>
                  </svg>
                  Set up themes to manage light/dark mode, brands, and more
                </button>
              ) : null}
              {isNarrow && dimBarExpanded && (
                <button
                  onClick={() => setDimBarExpanded(false)}
                  className="ml-auto text-[10px] text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text)] transition-colors px-1"
                  title="Collapse"
                  aria-label="Collapse theme bar"
                >
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                    <path d="M1 5l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              )}
            </div>
            )
          )}
          {/* Theme preview indicator — shown while hovering over an option that differs from active */}
          {activeTopTab === 'define' && activeSubTab === 'tokens' && (() => {
            const previewEntries = dimensions
              .filter(d => previewThemes[d.id] && previewThemes[d.id] !== activeThemes[d.id])
              .map(d => `${d.name}: ${previewThemes[d.id]}`);
            if (previewEntries.length === 0) return null;
            return (
              <div className="flex shrink-0 items-center gap-1.5 px-2 py-0.5 bg-amber-50 border-b border-amber-200 text-[10px] text-amber-700 pointer-events-none select-none">
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" aria-hidden="true">
                  <circle cx="4" cy="4" r="3"/>
                  <path d="M4 2.5v2M4 5.5v.5"/>
                </svg>
                <span>Previewing</span>
                <span className="font-medium">{previewEntries.join(' · ')}</span>
                <span className="opacity-60">— click to apply</span>
              </div>
            );
          })()}
          <div className="flex-1 overflow-y-auto">
            {/* Panels — routed by (activeTopTab, activeSubTab) and overflowPanel */}
            <PanelRouter
              useSidePanel={useSidePanel}
              showPreviewSplit={showPreviewSplit}
              setShowPreviewSplit={setShowPreviewSplit}
              guardEditorAction={guardEditorAction}
              editorIsDirtyRef={editorIsDirtyRef}
              editorCloseRef={editorCloseRef}
              displayedLeafNodesRef={displayedLeafNodesRef}
              tokenListCompareRef={tokenListCompareRef}
              handleEditorNavigate={handleEditorNavigate}
              handleEditorSave={handleEditorSave}
              handleEditorSaveAndCreateAnother={handleEditorSaveAndCreateAnother}
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
              onTokenDragStart={(paths, fromSet) => setTokenDragState({ paths, fromSet })}
              onTokenDragEnd={() => setTokenDragState(null)}
              refreshAll={refreshAll}
              pushUndo={pushUndo}
              setErrorToast={setErrorToast}
              setSuccessToast={setSuccessToast}
              handleNavigateToSet={handleNavigateToSet}
              setFlowPanelInitialPath={setFlowPanelInitialPath}
              flowPanelInitialPath={flowPanelInitialPath}
              handleOpenTokenCompare={handleOpenTokenCompare}
              handleOpenCrossThemeCompare={handleOpenCrossThemeCompare}
              tokensCompare={{
                showCompare: showTokensCompare,
                onClose: () => setShowTokensCompare(false),
                mode: tokensCompareMode,
                onModeChange: setTokensCompareMode,
                tokenPaths: tokensComparePaths,
                onClearTokenPaths: () => setTokensComparePaths(new Set()),
                tokenPath: tokensComparePath,
                onClearTokenPath: () => setTokensComparePath(''),
                themeKey: tokensCompareThemeKey,
                defaultA: tokensCompareDefaultA,
                defaultB: tokensCompareDefaultB,
              }}
              openCommandPaletteWithQuery={(query: string) => {
                setCommandPaletteInitialQuery('>' + (query ? ' ' + query : ''));
                setShowCommandPalette(true);
              }}
              handleNavigateToGenerator={handleNavigateToGenerator}
              setThemeGapCount={setThemeGapCount}
              triggerCreateToken={triggerCreateToken}
              recentlyTouched={recentlyTouched}
              starredTokens={starredTokens}
              onShowPasteModal={() => setShowPasteModal(true)}
              onShowColorScaleGen={() => setShowColorScaleGen(true)}
              onOpenStartHere={(branch) => openStartHere(branch)}
              onRestartGuidedSetup={() => { setOverflowPanel(null); openStartHere('guided-setup'); }}
              onClearAllComplete={() => { setOverflowPanel(null); navigateTo('define', 'tokens'); refreshTokens(); }}
            />
          </div>
            </>
          )}
        </div>
      </div>
      </ErrorBoundary>

      {/* Token editor drawer (narrow windows only; wide windows use side panel) */}
      {editingToken && overflowPanel === null && activeTopTab === 'define' && activeSubTab === 'tokens' && !useSidePanel && (
        <div
          className="fixed inset-0 z-40 flex flex-col justify-end overflow-hidden"
          onKeyDown={(e) => {
            if ((e.key === ']' || e.key === '[') && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
              e.preventDefault();
              handleEditorNavigate(e.key === ']' ? 1 : -1);
            }
          }}
        >
          <div
            className="absolute inset-0 bg-black/30 drawer-fade-in"
            onClick={() => editorCloseRef.current()}
          />
          <div className="relative bg-[var(--color-figma-bg)] rounded-t-xl shadow-2xl flex flex-col drawer-slide-up" style={{ height: '65%' }}>
            <div className="flex justify-center pt-2 pb-1 shrink-0">
              <div className="w-8 h-1 rounded-full bg-[var(--color-figma-border)]" />
            </div>
            <div className="flex-1 overflow-hidden">
              <TokenEditor
                tokenPath={editingToken.path}
                tokenName={editingToken.name}
                setName={editingToken.set}
                serverUrl={serverUrl}
                onBack={handleEditorClose}
                allTokensFlat={allTokensFlat}
                pathToSet={pathToSet}
                generators={generators}
                allSets={sets}
                onRefreshGenerators={refreshGenerators}
                isCreateMode={editingToken.isCreate}
                initialType={editingToken.initialType}
                initialValue={editingToken.initialValue}
                onDirtyChange={(dirty) => { editorIsDirtyRef.current = dirty; }}
                closeRef={editorCloseRef}
                onSaved={handleEditorSave}
                onSaveAndCreateAnother={handleEditorSaveAndCreateAnother}
                dimensions={dimensions}
                perSetFlat={perSetFlat}
                onRefresh={refreshAll}
                availableFonts={availableFonts}
                fontWeightsByFamily={fontWeightsByFamily}
                derivedTokenPaths={derivedTokenPaths}
                onShowReferences={(path) => { setFlowPanelInitialPath(path); navigateTo('apply', 'dependencies'); }}
                onNavigateToToken={handleNavigateToAlias}
                onNavigateToGenerator={handleNavigateToGenerator}
                pushUndo={pushUndo}
              />
            </div>
          </div>
        </div>
      )}

      {editingGeneratorData && !editingToken && overflowPanel === null && activeTopTab === 'define' && activeSubTab === 'tokens' && !useSidePanel && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end overflow-hidden">
          <div
            className="absolute inset-0 bg-black/30 drawer-fade-in"
            onClick={() => editorCloseRef.current()}
          />
          <div className="relative bg-[var(--color-figma-bg)] rounded-t-xl shadow-2xl flex flex-col drawer-slide-up" style={{ height: '72%' }}>
            <div className="flex justify-center pt-2 pb-1 shrink-0">
              <div className="w-8 h-1 rounded-full bg-[var(--color-figma-border)]" />
            </div>
            <div className="flex-1 overflow-hidden">
              <TokenGeneratorDialog
                serverUrl={serverUrl}
                allSets={sets}
                activeSet={activeSet}
                allTokensFlat={allTokensFlat}
                existingGenerator={editingGeneratorData}
                pathToSet={pathToSet}
                onClose={handleEditorClose}
                onSaved={() => {
                  setEditingGenerator(null);
                  refreshAll();
                }}
                onPushUndo={pushUndo}
                presentation="panel"
                onDirtyChange={(dirty) => { editorIsDirtyRef.current = dirty; }}
                closeRef={editorCloseRef}
              />
            </div>
          </div>
        </div>
      )}


      {/* Token preview drawer (narrow windows only; wide windows use side panel) */}
      {!editingToken && !editingGeneratorData && previewingToken && overflowPanel === null && activeTopTab === 'define' && activeSubTab === 'tokens' && !useSidePanel && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end overflow-hidden">
          <div
            className="absolute inset-0 bg-black/30 drawer-fade-in"
            onClick={handlePreviewClose}
          />
          <div className="relative bg-[var(--color-figma-bg)] rounded-t-xl shadow-2xl flex flex-col drawer-slide-up" style={{ height: '50%' }}>
            <div className="flex justify-center pt-2 pb-1 shrink-0">
              <div className="w-8 h-1 rounded-full bg-[var(--color-figma-border)]" />
            </div>
            <div className="flex-1 overflow-hidden">
              <TokenDetailPreview
                tokenPath={previewingToken.path}
                tokenName={previewingToken.name}
                setName={previewingToken.set}
                allTokensFlat={allTokensFlat}
                pathToSet={pathToSet}
                dimensions={dimensions}
                activeThemes={activeThemes}
                tokenUsageCounts={tokenUsageCounts}
                generatorsBySource={generatorsBySource}
                derivedTokenPaths={derivedTokenPaths}
                serverUrl={serverUrl}
                onEdit={handlePreviewEdit}
                onClose={handlePreviewClose}
                onNavigateToAlias={handleNavigateToAlias}
              />
            </div>
          </div>
        </div>
      )}

      {/* Set metadata editor */}
      {editingMetadataSet && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-[var(--color-figma-bg)] rounded border border-[var(--color-figma-border)] shadow-xl w-72 p-4 flex flex-col gap-3">
            <div className="text-[12px] font-medium text-[var(--color-figma-text)]">
              Edit set info — {editingMetadataSet}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-[var(--color-figma-text-secondary)]">Description</label>
              <textarea
                autoFocus
                value={metadataDescription}
                onChange={e => setMetadataDescription(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') closeSetMetadata(); }}
                rows={3}
                placeholder="What is this token set for?"
                className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)] resize-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-[var(--color-figma-text-secondary)]">Figma collection name</label>
              <input
                type="text"
                value={metadataCollectionName}
                onChange={e => setMetadataCollectionName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') closeSetMetadata(); }}
                placeholder="TokenManager"
                className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)]"
              />
              <p className="text-[10px] text-[var(--color-figma-text-secondary)] mt-0.5">Tokens in this set will sync to this Figma variable collection.</p>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-[var(--color-figma-text-secondary)]">Figma mode name</label>
              <input
                type="text"
                value={metadataModeName}
                onChange={e => setMetadataModeName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') closeSetMetadata(); }}
                placeholder="Mode 1"
                className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)]"
              />
              <p className="text-[10px] text-[var(--color-figma-text-secondary)] mt-0.5">When multiple sets share a collection, each set maps to a mode. Leave blank to use the first mode.</p>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => closeSetMetadata()}
                className="px-3 py-1.5 rounded text-[11px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveMetadata}
                className="px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Command palette delete confirmation */}
      {paletteDeleteConfirm && (
        <ConfirmModal
          title={paletteDeleteConfirm.label}
          description={`This will permanently delete ${paletteDeleteConfirm.paths.length === 1 ? 'this token' : `these ${paletteDeleteConfirm.paths.length} tokens`} from the "${activeSet}" set. This cannot be undone without the undo command.`}
          confirmLabel={`Delete ${paletteDeleteConfirm.paths.length === 1 ? 'token' : `${paletteDeleteConfirm.paths.length} tokens`}`}
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

      {/* Delete set confirmation */}
      {deletingSet && (
        <ConfirmModal
          title={`Delete "${deletingSet}"?`}
          description="All tokens in this set will be permanently deleted."
          confirmLabel="Delete set"
          danger
          onConfirm={handleDeleteSet}
          onCancel={cancelDelete}
        />
      )}

      {/* Sync group to Figma confirmation */}
      {syncGroupPending && (
        <ConfirmModal
          title={`Create variables from "${syncGroupPending.groupPath}"?`}
          description={`This will create or update ${syncGroupPending.tokenCount} Figma variable${syncGroupPending.tokenCount !== 1 ? 's' : ''} from this group.`}
          confirmLabel="Create variables"
          onConfirm={handleSyncGroup}
          onCancel={() => setSyncGroupPending(null)}
        />
      )}

      {/* Create styles from group confirmation */}
      {syncGroupStylesPending && (
        <ConfirmModal
          title={`Create styles from "${syncGroupStylesPending.groupPath}"?`}
          description={`This will create or update ${syncGroupStylesPending.tokenCount} Figma style${syncGroupStylesPending.tokenCount !== 1 ? 's' : ''} from this group.`}
          confirmLabel="Create styles"
          onConfirm={handleSyncGroupStyles}
          onCancel={() => setSyncGroupStylesPending(null)}
        />
      )}

      {/* Variable sync progress overlay */}
      {syncGroupApplying && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-[240px] rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-xl px-4 py-4 flex flex-col items-center gap-3">
            <svg className="animate-spin text-[var(--color-figma-accent)]" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12a9 9 0 11-6.219-8.56"/>
            </svg>
            <div className="text-center">
              <p className="text-[12px] font-semibold text-[var(--color-figma-text)]">
                {syncGroupProgress && syncGroupProgress.total > 0
                  ? `Syncing variables… ${syncGroupProgress.current} / ${syncGroupProgress.total}`
                  : 'Syncing variables…'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Style sync progress overlay */}
      {syncGroupStylesApplying && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-[240px] rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-xl px-4 py-4 flex flex-col items-center gap-3">
            <svg className="animate-spin text-[var(--color-figma-accent)]" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12a9 9 0 11-6.219-8.56"/>
            </svg>
            <div className="text-center">
              <p className="text-[12px] font-semibold text-[var(--color-figma-text)]">
                {syncGroupStylesProgress && syncGroupStylesProgress.total > 0
                  ? `Creating styles… ${syncGroupStylesProgress.current} / ${syncGroupStylesProgress.total}`
                  : 'Creating styles…'}
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
              <span className="text-[12px] font-semibold text-[var(--color-figma-text)]">Set Figma Scopes</span>
              <button onClick={() => setGroupScopesPath(null)} title="Close" aria-label="Close" className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="p-4 flex flex-col gap-2">
              <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
                Select scopes for all tokens in <span className="font-mono font-medium">{groupScopesPath}</span>. Empty = All scopes.
              </p>
              {([
                { label: 'Fill Color', value: 'FILL_COLOR' },
                { label: 'Stroke Color', value: 'STROKE_COLOR' },
                { label: 'Text Fill', value: 'TEXT_FILL' },
                { label: 'Effect Color', value: 'EFFECT_COLOR' },
                { label: 'Width & Height', value: 'WIDTH_HEIGHT' },
                { label: 'Gap / Spacing', value: 'GAP' },
                { label: 'Corner Radius', value: 'CORNER_RADIUS' },
                { label: 'Opacity', value: 'OPACITY' },
                { label: 'Font Size', value: 'FONT_SIZE' },
                { label: 'Font Family', value: 'FONT_FAMILY' },
              ] as const).map(scope => (
                <label key={scope.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={groupScopesSelected.includes(scope.value)}
                    onChange={e => setGroupScopesSelected(prev =>
                      e.target.checked ? [...prev, scope.value] : prev.filter(s => s !== scope.value)
                    )}
                    className="w-3 h-3 rounded"
                  />
                  <span className="text-[11px] text-[var(--color-figma-text)]">{scope.label}</span>
                </label>
              ))}
            </div>
            {groupScopesError && (
              <div className="px-3 py-2 mx-3 mb-2 rounded bg-red-50 border border-red-200 text-[10px] text-red-700 flex items-center gap-1.5">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
                  <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
                </svg>
                <span className="flex-1 min-w-0">{groupScopesError}</span>
              </div>
            )}
            <div className="flex gap-2 p-3 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
              <button
                onClick={() => setGroupScopesPath(null)}
                className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] text-[11px] hover:bg-[var(--color-figma-bg-hover)]"
              >Cancel</button>
              <button
                onClick={handleApplyGroupScopes}
                disabled={groupScopesApplying}
                className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50"
              >{groupScopesApplying ? (groupScopesProgress && groupScopesProgress.total > 0 ? `Applying… ${groupScopesProgress.done}/${groupScopesProgress.total}` : 'Applying…') : 'Apply to group'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Merge into dialog */}
      {mergingSet && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-[var(--color-figma-bg)] rounded border border-[var(--color-figma-border)] shadow-xl w-80 flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-figma-border)]">
              <span className="text-[12px] font-semibold text-[var(--color-figma-text)]">Merge "{mergingSet}" into…</span>
              <button onClick={closeMergeDialog} className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="p-4 flex flex-col gap-3 overflow-y-auto">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-[var(--color-figma-text-secondary)]">Target set</label>
                <select
                  value={mergeTargetSet}
                  onChange={e => changeMergeTarget(e.target.value)}
                  className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)]"
                >
                  {sets.filter(s => s !== mergingSet).map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              {!mergeChecked && (
                <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
                  Tokens from <span className="font-mono font-medium">{mergingSet}</span> will be added to <span className="font-mono font-medium">{mergeTargetSet}</span>. Conflicts where both sets have the same path but different values will be shown for resolution.
                </p>
              )}
              {mergeChecked && mergeConflicts.length === 0 && (
                <p className="text-[10px] text-green-500">No conflicts — all tokens can be merged cleanly.</p>
              )}
              {mergeChecked && mergeConflicts.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
                    {mergeConflicts.length} conflict{mergeConflicts.length !== 1 ? 's' : ''} found. Choose which value to keep:
                  </p>
                  <div className="flex flex-col gap-2 max-h-52 overflow-y-auto">
                    {mergeConflicts.map(c => (
                      <div key={c.path} className="flex flex-col gap-1 rounded border border-[var(--color-figma-border)] p-2">
                        <span className="text-[10px] font-mono text-[var(--color-figma-text)] truncate" title={c.path}>{c.path}</span>
                        <div className="flex gap-2">
                          <label className="flex items-center gap-1.5 cursor-pointer flex-1 min-w-0">
                            <input
                              type="radio"
                              name={`conflict-${c.path}`}
                              checked={mergeResolutions[c.path] === 'source'}
                              onChange={() => setMergeResolutions(r => ({ ...r, [c.path]: 'source' }))}
                              className="w-3 h-3 shrink-0"
                            />
                            <span className="text-[10px] text-[var(--color-figma-text-secondary)] truncate" title={`${mergingSet}: ${String(c.sourceValue)}`}>
                              {mergingSet}: {String(c.sourceValue).slice(0, 18)}{String(c.sourceValue).length > 18 ? '…' : ''}
                            </span>
                          </label>
                          <label className="flex items-center gap-1.5 cursor-pointer flex-1 min-w-0">
                            <input
                              type="radio"
                              name={`conflict-${c.path}`}
                              checked={mergeResolutions[c.path] === 'target'}
                              onChange={() => setMergeResolutions(r => ({ ...r, [c.path]: 'target' }))}
                              className="w-3 h-3 shrink-0"
                            />
                            <span className="text-[10px] text-[var(--color-figma-text-secondary)] truncate" title={`${mergeTargetSet}: ${String(c.targetValue)}`}>
                              {mergeTargetSet}: {String(c.targetValue).slice(0, 18)}{String(c.targetValue).length > 18 ? '…' : ''}
                            </span>
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2 p-3 border-t border-[var(--color-figma-border)]">
              <button
                onClick={closeMergeDialog}
                className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] text-[11px] hover:bg-[var(--color-figma-bg-hover)]"
              >Cancel</button>
              {!mergeChecked ? (
                <button
                  onClick={handleCheckMergeConflicts}
                  disabled={!mergeTargetSet || mergeLoading}
                  className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50"
                >{mergeLoading ? 'Checking…' : 'Check conflicts'}</button>
              ) : (
                <button
                  onClick={handleConfirmMerge}
                  disabled={mergeLoading}
                  className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50"
                >{mergeLoading ? 'Merging…' : 'Merge'}</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Split by group dialog */}
      {splittingSet && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-[var(--color-figma-bg)] rounded border border-[var(--color-figma-border)] shadow-xl w-72 flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-figma-border)]">
              <span className="text-[12px] font-semibold text-[var(--color-figma-text)]">Split "{splittingSet}"</span>
              <button onClick={closeSplitDialog} className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="p-4 flex flex-col gap-3 overflow-y-auto">
              {splitPreview.length === 0 ? (
                <p className="text-[10px] text-[var(--color-figma-text-secondary)]">No top-level groups found in this set to split.</p>
              ) : (
                <>
                  <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
                    Creates {splitPreview.length} new set{splitPreview.length !== 1 ? 's' : ''} from top-level groups:
                  </p>
                  <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                    {splitPreview.map(p => (
                      <div key={p.key} className="flex items-center justify-between px-2 py-1 rounded bg-[var(--color-figma-bg-hover)]">
                        <span className="text-[11px] font-mono text-[var(--color-figma-text)] truncate">{p.newName}</span>
                        <span className="text-[10px] text-[var(--color-figma-text-secondary)] ml-2 shrink-0">{p.count} token{p.count !== 1 ? 's' : ''}</span>
                      </div>
                    ))}
                  </div>
                  {splitPreview.some(p => sets.includes(p.newName)) && (
                    <p className="text-[10px] text-amber-500">Some sets already exist and will be skipped.</p>
                  )}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={splitDeleteOriginal}
                      onChange={e => setSplitDeleteOriginal(e.target.checked)}
                      className="w-3 h-3 rounded"
                    />
                    <span className="text-[11px] text-[var(--color-figma-text)]">Delete "{splittingSet}" after split</span>
                  </label>
                </>
              )}
            </div>
            <div className="flex gap-2 p-3 border-t border-[var(--color-figma-border)]">
              <button
                onClick={closeSplitDialog}
                className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] text-[11px] hover:bg-[var(--color-figma-bg-hover)]"
              >Cancel</button>
              <button
                onClick={handleConfirmSplit}
                disabled={splitLoading || splitPreview.length === 0}
                className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50"
              >{splitLoading ? 'Splitting…' : 'Split'}</button>
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
              navigateTo('define', 'tokens');
            });
          }}
          onClose={() => setShowSetSwitcher(false)}
          onManageSets={() => {
            setShowSetSwitcher(false);
            openOverflowPanel('sets');
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
            navigateTo('define', 'tokens');
            setEditingToken(null);
            if (targetSet && targetSet !== activeSet) {
              setActiveSet(targetSet);
              setPendingHighlight(path);
            } else {
              setHighlightedToken(path);
            }
          }}
          onGoToGroup={(groupPath) => {
            navigateTo('define', 'tokens');
            setEditingToken(null);
            setHighlightedToken(groupPath);
          }}
          onCopyTokenPath={(path) => {
            navigator.clipboard.writeText(path).catch((err) => { console.warn('[App] clipboard write failed for token path:', err); });
          }}
          onCopyTokenRef={(path) => {
            navigator.clipboard.writeText(`{${path}}`).catch((err) => { console.warn('[App] clipboard write failed for token ref:', err); });
          }}
          onCopyTokenValue={(value) => {
            navigator.clipboard.writeText(value).catch((err) => { console.warn('[App] clipboard write failed for token value:', err); });
          }}
          onCopyTokenCssVar={(path) => {
            const cssVar = `var(--${path.replace(/\./g, '-')})`;
            navigator.clipboard.writeText(cssVar).catch((err) => { console.warn('[App] clipboard write failed for CSS var:', err); });
          }}
          onDuplicateToken={handlePaletteDuplicate}
          onRenameToken={handlePaletteRename}
          onMoveToken={handlePaletteMove}
          onDeleteToken={handlePaletteDeleteToken}
          onClose={() => setShowCommandPalette(false)}
        />
      )}

      {/* Quick Apply Picker */}
      {showQuickApply && selectedNodes.length > 0 && (
        <QuickApplyPicker
          selectedNodes={selectedNodes}
          tokenMap={allTokensFlat}
          onApply={(tokenPath, tokenType, targetProperty, resolvedValue) => {
            parent.postMessage({
              pluginMessage: {
                type: 'apply-to-selection',
                tokenPath,
                tokenType,
                targetProperty,
                resolvedValue,
              },
            }, '*');
            setShowQuickApply(false);
            setSuccessToast(`Bound "${tokenPath}" to ${targetProperty}`);
          }}
          onUnbind={(targetProperty) => {
            parent.postMessage({
              pluginMessage: {
                type: 'remove-binding',
                property: targetProperty,
              },
            }, '*');
            setShowQuickApply(false);
            setSuccessToast(`Unbound ${targetProperty}`);
          }}
          onClose={() => setShowQuickApply(false)}
        />
      )}

      {/* Keyboard Shortcuts Modal */}
      {showKeyboardShortcuts && (
        <KeyboardShortcutsModal onClose={() => setShowKeyboardShortcuts(false)} />
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
          onImportFigma={() => setOverflowPanel('import')}
          onPasteJSON={() => setShowPasteModal(true)}
          onCreateToken={() => setEditingToken({ path: '', set: activeSet, isCreate: true })}
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
          onSetCreated={(name) => { addSetToState(name, 0); setActiveSet(name); }}
        />
      )}

      {/* Color Scale Generator */}
      {showColorScaleGen && (
        <ColorScaleGenerator
          serverUrl={serverUrl}
          activeSet={activeSet}
          existingPaths={new Set(Object.keys(allTokensFlat).filter(p => pathToSet[p] === activeSet))}
          onClose={() => setShowColorScaleGen(false)}
          onConfirm={(firstPath) => { setShowColorScaleGen(false); refreshAll(); if (firstPath) setPendingHighlight(firstPath); }}
        />
      )}

      {/* Paste Tokens modal */}
      {showPasteModal && (
        <PasteTokensModal
          serverUrl={serverUrl}
          activeSet={activeSet}
          existingPaths={new Set(Object.keys(allTokensFlat).filter(p => pathToSet[p] === activeSet))}
          onClose={() => setShowPasteModal(false)}
          onConfirm={() => { setShowPasteModal(false); refreshAll(); }}
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
        style={{ touchAction: 'none' }}
        title="Drag to resize"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
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
