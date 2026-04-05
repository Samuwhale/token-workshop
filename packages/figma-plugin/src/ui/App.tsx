import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { TokenListImperativeHandle } from './components/tokenListTypes';
import { ThemeManager } from './components/ThemeManager';
import type { ThemeManagerHandle } from './components/ThemeManager';
import { TokenEditor } from './components/TokenEditor';
import { TokenDetailPreview } from './components/TokenDetailPreview';
import { ToastStack } from './components/ToastStack';
import { NotificationHistory } from './components/NotificationHistory';
import { useToastStack } from './hooks/useToastStack';
import { useToastBusListener } from './shared/toastBus';
import { ConfirmModal } from './components/ConfirmModal';
import { PasteTokensModal } from './components/PasteTokensModal';
import { QuickStartDialog } from './components/QuickStartDialog';
import { QuickStartWizard } from './components/QuickStartWizard';
import { WelcomePrompt } from './components/WelcomePrompt';
import { ColorScaleGenerator } from './components/ColorScaleGenerator';
import { CreatePanel } from './components/CreatePanel';
import { CommandPalette } from './components/CommandPalette';
import type { Command, TokenEntry } from './components/CommandPalette';
import { SetSwitcher } from './components/SetSwitcher';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { QuickApplyPicker } from './components/QuickApplyPicker';
import { HealthPanel, computeHealthIssueCount } from './components/HealthPanel';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PanelRouter } from './panels/PanelRouter';
import { GRAPH_TEMPLATES } from './components/graph-templates';
import { useServerEvents } from './hooks/useServerEvents';
import type { TokenNode } from './hooks/useTokens';
import { useUndo } from './hooks/useUndo';
import { useLint } from './hooks/useLint';
import { usePreviewSplit } from './hooks/usePreviewSplit';
import { useAvailableFonts } from './hooks/useAvailableFonts';
import { useWindowExpand } from './hooks/useWindowExpand';
import { useWindowResize } from './hooks/useWindowResize';
import type { TopTab, SubTab, OverflowPanel } from './shared/navigationTypes';
import { TOP_TABS } from './shared/navigationTypes';
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
import { useLintConfig } from './hooks/useLintConfig';
import { useRecentlyTouched } from './hooks/useRecentlyTouched';
import { useCrossSetRecents } from './hooks/useCrossSetRecents';
import { useStarredTokens } from './hooks/useStarredTokens';
import { usePinnedTokens } from './hooks/usePinnedTokens';
import { useAnalyticsState } from './hooks/useAnalyticsState';
import { useValidationCache } from './hooks/useValidationCache';
import { useGraphState } from './hooks/useGraphState';
import { useCompareState } from './hooks/useCompareState';
import type { TokenMapEntry } from '../shared/types';
import { KNOWN_CONTROLLER_MESSAGE_TYPES } from '../shared/types';
import { isAlias } from '../shared/resolveAlias';
import { adaptShortcut, tokenPathToUrlSegment } from './shared/utils';
import { SHORTCUT_KEYS } from './shared/shortcutRegistry';
import { Tooltip } from './shared/Tooltip';
import { getMenuItems, handleMenuArrowKeys } from './hooks/useMenuKeyboard';
import { apiFetch, ApiError } from './shared/apiFetch';
import { STORAGE_KEYS, STORAGE_PREFIXES, lsGet, lsSet, lsRemove, lsGetJson, lsSetJson, lsClearByPrefix } from './shared/storage';
import { buildTreeByType, findLeafByPath, collectAllGroupPaths } from './components/tokenListUtils';
import { inferTypeFromValue } from './components/tokenListHelpers';

/** Format a timestamp as a human-readable relative time string. */
function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}


type Tab = 'tokens' | 'inspect' | 'graph' | 'publish';

type FolderTreeNode = {
  name: string;   // display name (first path segment, e.g. 'brands')
  path: string;   // full folder key (e.g. 'brands')
  sets: string[]; // full set names whose first segment matches this folder
};

// Builds a flat folder tree from set names that use '/' as a folder separator.
// Sets without '/' are returned as plain strings (root-level sets).
function buildSetFolderTree(sets: string[]): { roots: Array<string | FolderTreeNode> } {
  const folderMap = new Map<string, FolderTreeNode>();
  const roots: Array<string | FolderTreeNode> = [];
  for (const set of sets) {
    const slash = set.indexOf('/');
    if (slash === -1) {
      roots.push(set);
    } else {
      const folderName = set.slice(0, slash);
      if (!folderMap.has(folderName)) {
        const node: FolderTreeNode = { name: folderName, path: folderName, sets: [] };
        folderMap.set(folderName, node);
        roots.push(node);
      }
      folderMap.get(folderName)!.sets.push(set);
    }
  }
  return { roots };
}

const TABS: { id: Tab; label: string; shortcutNum: number }[] = [
  { id: 'tokens', label: 'Tokens', shortcutNum: 1 },
  { id: 'inspect', label: 'Inspect', shortcutNum: 2 },
  { id: 'graph', label: 'Generators', shortcutNum: 3 },
  { id: 'publish', label: 'Publish', shortcutNum: 4 },
];


export function App() {
  const [activeTab, setActiveTabState] = useState<Tab>(() => {
    const stored = lsGet(STORAGE_KEYS.ACTIVE_TAB);
    return (stored && TABS.some(t => t.id === stored) ? stored : 'tokens') as Tab;
  });
  const setActiveTab = (tab: Tab) => {
    lsSet(STORAGE_KEYS.ACTIVE_TAB, tab);
    setActiveTabState(tab);
  };
  // Navigation and editor state from contexts (owned by NavigationProvider and EditorProvider)
  const { activeTopTab, activeSubTab, overflowPanel, navigateTo, setOverflowPanel, setSubTab } = useNavigationContext();
  const { editingToken, setEditingToken, previewingToken, setPreviewingToken, highlightedToken, setHighlightedToken, createFromEmpty, setPendingHighlight, setPendingHighlightForSet, handleNavigateToAlias, handleNavigateBack, navHistoryLength, setAliasNotFoundHandler } = useEditorContext();
  const { showPreviewSplit, setShowPreviewSplit, splitRatio, splitValueNow, splitContainerRef, handleSplitDragStart, handleSplitKeyDown } = usePreviewSplit();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showCreatePanel, setShowCreatePanel] = useState<{ tab?: 'single' | 'scale' | 'bulk'; initialPath?: string; initialType?: string; initialValue?: string } | null>(null);
  const { connected, checking, serverUrl, getDisconnectSignal, markDisconnected, updateServerUrlAndConnect, retryConnection, gitHasChanges, syncing, syncProgress, syncResult, syncError, sync } = useConnectionContext();
  const { sets, setSets, activeSet, setActiveSet, tokens, tokenRevision, fetchError, setTokenCounts, setDescriptions, setCollectionNames, setModeNames, refreshTokens, addSetToState, removeSetFromState, renameSetInState, updateSetMetadataInState, fetchTokensForSet } = useTokenSetsContext();
  const { allTokensFlat, pathToSet, perSetFlat, filteredSetCount, setFilteredSetCount, syncSnapshot, tokensLoading, tokensError } = useTokenFlatMapContext();
  const { generators, refreshGenerators, generatorsBySource, derivedTokenPaths } = useGeneratorContext();
  const { dimensions, setDimensions, activeThemes, setActiveThemes, previewThemes, setPreviewThemes, openDimDropdown, setOpenDimDropdown, dimBarExpanded, setDimBarExpanded, dimDropdownRef, themesError, retryThemes, themedAllTokensFlat, setThemeStatusMap } = useThemeSwitcherContext();
  const resolverState = useResolverContext();
  const { selectedNodes } = useSelectionContext();
  const { heatmapResult, heatmapLoading, heatmapError, heatmapProgress, heatmapScope, setHeatmapScope, triggerHeatmapScan, cancelHeatmapScan } = useHeatmapContext();
  const { tokenUsageCounts, triggerUsageScan } = useUsageContext();
  const { families: availableFonts, weightsByFamily: fontWeightsByFamily } = useAvailableFonts();
  const [serverUrlInput, setServerUrlInput] = useState(serverUrl);
  const [connectResult, setConnectResult] = useState<'ok' | 'fail' | null>(null);
  const [showBannerUrlEditor, setShowBannerUrlEditor] = useState(false);
  const { showClearConfirm, setShowClearConfirm, showPasteModal, setShowPasteModal, showScaffoldWizard, setShowScaffoldWizard, showGuidedSetup, setShowGuidedSetup, showColorScaleGen, setShowColorScaleGen, showCommandPalette, setShowCommandPalette, showKeyboardShortcuts, setShowKeyboardShortcuts, showQuickApply, setShowQuickApply, showSetSwitcher, setShowSetSwitcher, showManageSets, setShowManageSets } = useModalVisibility();
  const [commandPaletteInitialQuery, setCommandPaletteInitialQuery] = useState('');
  const paletteRecentlyTouched = useRecentlyTouched();
  const crossSetRecents = useCrossSetRecents();
  const starredTokens = useStarredTokens();
  const palettePinnedTokens = usePinnedTokens(activeSet);
  const [showWelcome, setShowWelcome] = useState(() => !lsGet(STORAGE_KEYS.FIRST_RUN_DONE));
  const [clearConfirmText, setClearConfirmText] = useState('');
  const [clearing, setClearing] = useState(false);
  const [undoMaxHistory, setUndoMaxHistory] = useState(() => lsGetJson<number>(STORAGE_KEYS.UNDO_MAX_HISTORY, 20));
  const [pendingPublishCount, setPendingPublishCount] = useState(0);
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
  }, []);
  const onServiceError = useCallback(({ setName, message }: { setName: string; message: string }) => {
    const label = setName ? `Failed to load "${setName}"` : 'File load error';
    setErrorToast(`${label}: ${message}`);
  }, []);
  const onResizeHandleMouseDown = useWindowResize();
  const { isExpanded, toggleExpand } = useWindowExpand();
  const { pendingGraphTemplate, setPendingGraphTemplate, pendingGraphFromGroup, setPendingGraphFromGroup, focusGeneratorId, setFocusGeneratorId, pendingOpenPicker, setPendingOpenPicker } = useGraphState();
  const [triggerCreateToken, setTriggerCreateToken] = useState(0);
  const [lintKey, setLintKey] = useState(0);
  const lintViolations = useLint(serverUrl, activeSet, connected, lintKey);
  const lintConfig = useLintConfig(serverUrl, connected);
  // Tracks the current position for "next issue" cycling — reset when set changes
  const lintIssueIndexRef = useRef(-1);
  useEffect(() => { lintIssueIndexRef.current = -1; }, [activeSet]);
  const [tokenChangeKey, setTokenChangeKey] = useState(0);
  const refreshAll = useCallback(() => { refreshTokens(); setLintKey(k => k + 1); refreshGenerators(); setTokenChangeKey(k => k + 1); }, [refreshTokens, refreshGenerators]);
  const allGroupPaths = useMemo(() => collectAllGroupPaths(tokens), [tokens]);
  const staleGeneratorCount = useMemo(() => generators.filter(g => g.isStale).length, [generators]);

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

  // Keyboard shortcut for server redo (Cmd+Y / Cmd+Shift+Z) when no local redo is available
  const serverRedoRef = useRef(handleServerRedo);
  serverRedoRef.current = handleServerRedo;
  const canServerRedoRef = useRef(canServerRedo);
  canServerRedoRef.current = canServerRedo;
  const canRedoRef = useRef(canRedo);
  canRedoRef.current = canRedo;
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
      if (((e.key === 'z' && e.shiftKey) || e.key === 'y') && canServerRedoRef.current && !canRedoRef.current) {
        e.preventDefault();
        serverRedoRef.current();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleEditorClose = useCallback(() => { setEditingToken(null); refreshAll(); }, [refreshAll]);
  const handlePreviewEdit = useCallback(() => {
    if (previewingToken) { setEditingToken({ path: previewingToken.path, name: previewingToken.name, set: previewingToken.set }); setPreviewingToken(null); }
  }, [previewingToken]);
  const handlePreviewClose = useCallback(() => { setPreviewingToken(null); }, []);
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
  }, [editingToken, setHighlightedToken]);
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
  }, [refreshAll, setHighlightedToken, generatorsBySource, pushActionToast, serverUrl, refreshGenerators]);
  const handleEditorSaveAndCreateAnother = useCallback((savedPath: string, savedType: string) => {
    setHighlightedToken(savedPath);
    refreshAll();
    // Derive parent prefix from saved path for sibling creation
    const segments = savedPath.split('.');
    const parentPrefix = segments.length > 1 ? segments.slice(0, -1).join('.') + '.' : '';
    setEditingToken({ path: parentPrefix, set: activeSet, isCreate: true, initialType: savedType });
  }, [refreshAll, setHighlightedToken, activeSet]);
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
  }, [navigateTo]);
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
  const [historyFilterPath, setHistoryFilterPath] = useState<string | null>(null);
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
    && !!(editingToken || previewingToken)
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
  const { dragSetName, dragOverSetName, tabMenuOpen, setTabMenuOpen, tabMenuPos, tabMenuRef, creatingSet, setCreatingSet, newSetName, setNewSetName, newSetError, setNewSetError, newSetInputRef, setTabsScrollRef, setTabsOverflow, cascadeDiff, openSetMenu, handleSetDragStart, handleSetDragOver, handleSetDragLeave, handleSetDragEnd, handleSetDrop, handleReorderSet, handleReorderSetFull, handleCreateSet, scrollSetTabs, checkSetTabsOverflow } = useSetTabs({ serverUrl, connected, getDisconnectSignal, sets, setSets, activeSet, addSetToState, refreshTokens, setSuccessToast, setErrorToast, markDisconnected, perSetFlat, allTokensFlat, activeThemes, tokenDragFromSet: tokenDragState?.fromSet ?? null, onTokenDropOnSet: handleTokenDropOnSet });

  // Group sync + scope state
  const { syncGroupPending, setSyncGroupPending, syncGroupApplying, syncGroupProgress, syncGroupStylesPending, setSyncGroupStylesPending, syncGroupStylesApplying, syncGroupStylesProgress, groupScopesPath, setGroupScopesPath, groupScopesSelected, setGroupScopesSelected, groupScopesApplying, groupScopesError, setGroupScopesError, groupScopesProgress, handleSyncGroup, handleSyncGroupStyles, syncGroupStylesError, syncGroupError, handleApplyGroupScopes } = useFigmaSync(serverUrl, connected, pathToSet, setCollectionNames, setModeNames, activeSet);

  useEffect(() => {
    if (syncGroupStylesError) setErrorToast(syncGroupStylesError);
  }, [syncGroupStylesError]);

  useEffect(() => {
    if (syncGroupError) setErrorToast(syncGroupError);
  }, [syncGroupError]);

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

  // Sidebar mode: activate when any set has a '/' folder separator or there are many sets
  const useSidebar = sets.some(s => s.includes('/')) || sets.length >= 7;
  const sidebarTree = useMemo(() => buildSetFolderTree(sets), [sets]);

  // Simple mode: hide set abstraction when total tokens < 200 and user hasn't opted out
  const totalTokenCount = useMemo(
    () => Object.values(setTokenCounts).reduce((a, b) => a + b, 0),
    [setTokenCounts],
  );
  const [advancedModeOverride, setAdvancedModeOverride] = useState<boolean>(
    () => lsGet(STORAGE_KEYS.ADVANCED_MODE) === 'true',
  );
  const isSimpleMode = totalTokenCount > 0 && totalTokenCount < 200 && sets.length > 0 && !advancedModeOverride;

  // In simple mode, build a merged tree organized by token type
  const simpleModeTokens = useMemo(() => {
    if (!isSimpleMode) return [];
    return buildTreeByType(themedAllTokensFlat);
  }, [isSimpleMode, themedAllTokensFlat]);

  // Effective tokens/set for TokenList — simple mode merges all sets by type
  const effectiveTokens = isSimpleMode ? simpleModeTokens : tokens;
  const effectiveSetName = isSimpleMode ? (sets[0] || '') : activeSet;

  // Collapsed folders state (persisted to localStorage)
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() =>
    new Set<string>(lsGetJson<string[]>(STORAGE_KEYS.COLLAPSED_FOLDERS, []))
  );
  const toggleFolder = useCallback((folderPath: string) => {
    setCollapsedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderPath)) next.delete(folderPath);
      else next.add(folderPath);
      lsSetJson(STORAGE_KEYS.COLLAPSED_FOLDERS, [...next]);
      return next;
    });
  }, []);


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

  // Close overflow menu on Escape key; arrow keys navigate between items
  useEffect(() => {
    if (!menuOpen) return;
    // Auto-focus first menu item when menu opens
    const frame = requestAnimationFrame(() => {
      if (menuRef.current) getMenuItems(menuRef.current)[0]?.focus();
    });
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setMenuOpen(false); return; }
      if (menuRef.current) handleMenuArrowKeys(e, menuRef.current);
    };
    document.addEventListener('keydown', handler);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handler);
    };
  }, [menuOpen]);


  // Keyboard shortcuts — use a stable callback ref so the effect never
  // re-registers the listener yet always calls the latest handler.
  const keyboardShortcutRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyboardShortcutRef.current = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'v') {
      e.preventDefault();
      setShowPasteModal(true);
    }
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'k') {
      e.preventDefault();
      setCommandPaletteInitialQuery('');
      setShowCommandPalette(v => !v);
    }
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'f') {
      e.preventDefault();
      setCommandPaletteInitialQuery('>');
      setShowCommandPalette(v => !v);
    }
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'p') {
      e.preventDefault();
      setShowPreviewSplit(v => !v);
      setOverflowPanel(null);
    }
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 't') {
      e.preventDefault();
      navigateTo('apply', 'inspect');
      setTriggerCreateToken(n => n + 1);
    }
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'n') {
      e.preventDefault();
      setShowCreatePanel(prev => prev ? null : { tab: 'single' });
    }
    const tabIndex = ['1', '2', '3'].indexOf(e.key);
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && tabIndex !== -1 && tabIndex < TOP_TABS.length) {
      e.preventDefault();
      navigateTo(TOP_TABS[tabIndex].id);
    }
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'a') {
      e.preventDefault();
      setShowQuickApply(v => !v);
    }
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 's') {
      e.preventDefault();
      setShowManageSets(false);
      setShowSetSwitcher(v => !v);
    }
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'r') {
      e.preventDefault();
      navigateTo('define', 'themes');
      setTimeout(() => { themeManagerHandleRef.current?.switchToResolverMode(); }, 50);
    }
    if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      setShowKeyboardShortcuts(v => !v);
    }
    if ((e.metaKey || e.ctrlKey) && e.key === ',') {
      e.preventDefault();
      openOverflowPanel('settings');
    }
    if (e.key === 'F8' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      jumpToNextIssue();
    }
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'e') {
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


  const handleClearAll = async () => {
    if (clearConfirmText !== 'DELETE') return;
    setClearing(true);
    try {
      await apiFetch(`${serverUrl}/api/data`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: 'DELETE' }) });
    } catch (err) {
      console.warn('[App] clear all data request failed:', err);
    }
    // Clear all plugin localStorage keys
    for (const key of [STORAGE_KEYS.ACTIVE_TAB, STORAGE_KEYS.ACTIVE_SET, STORAGE_KEYS.ANALYTICS_CANONICAL, STORAGE_KEYS.THEME_CARD_ORDER, STORAGE_KEYS.IMPORT_TARGET_SET, STORAGE_KEYS.ACTIVE_TOP_TAB, STORAGE_KEYS.ACTIVE_SUB_TAB_DEFINE, STORAGE_KEYS.ACTIVE_SUB_TAB_APPLY, STORAGE_KEYS.ACTIVE_SUB_TAB_SHIP, STORAGE_KEYS.ACTIVE_RESOLVER, STORAGE_KEYS.RESOLVER_INPUT]) {
      lsRemove(key);
    }
    // Clear per-set sort/filter keys
    lsClearByPrefix(STORAGE_PREFIXES.TOKEN_SORT, STORAGE_PREFIXES.TOKEN_TYPE_FILTER);
    setClearing(false);
    setShowClearConfirm(false);
    setClearConfirmText('');
    setActiveTabState('tokens');
    navigateTo('define', 'tokens');
    refreshTokens();
  };

  const openOverflowPanel = useCallback((panel: OverflowPanel) => {
    setMenuOpen(false);
    setOverflowPanel(panel);
  }, []);

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

  const onTokenListSelectionChange = useCallback((paths: string[]) => {
    setTokenListSelection(paths);
  }, []);

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
        undo: async () => {
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

  // Track export preset changes so the command palette stays in sync.
  const [exportPresetRev, setExportPresetRev] = useState(0);
  useEffect(() => {
    const onChanged = () => setExportPresetRev(r => r + 1);
    window.addEventListener('exportPresetsChanged', onChanged);
    return () => window.removeEventListener('exportPresetsChanged', onChanged);
  }, []);

  // Split the command palette registry into focused sub-memos so that
  // frequently-changing state (highlightedToken on every hover, undo stack on
  // every op) only rebuilds its own small slice instead of all 40+ commands.

  // Base commands: stable navigation / action commands.
  // Rebuilds when set count, preview toggle, lint count, selection, or
  // server connectivity changes — all infrequent relative to hover events.
  const baseCommands = useMemo<Command[]>(() => {
    const goToTokens = () => { navigateTo('define', 'tokens'); setEditingToken(null); };
    return [
      {
        id: 'new-token',
        label: 'Create new token',
        description: `Open the unified creation panel`,
        category: 'Tokens',
        shortcut: adaptShortcut('⌘N'),
        handler: () => { setShowCreatePanel({ tab: 'single' }); },
      },
      {
        id: 'generate-scale',
        label: 'Generate a scale',
        description: 'Create a scale of tokens from a template',
        category: 'Tokens',
        handler: () => { setShowCreatePanel({ tab: 'scale' }); },
      },
      {
        id: 'bulk-create',
        label: 'Bulk create tokens',
        description: 'Create multiple tokens at once in a table',
        category: 'Tokens',
        handler: () => { setShowCreatePanel({ tab: 'bulk' }); },
      },
      {
        id: 'switch-set',
        label: 'Switch set\u2026',
        description: `${sets.length} set${sets.length !== 1 ? 's' : ''} available`,
        category: 'Sets',
        shortcut: adaptShortcut(SHORTCUT_KEYS.QUICK_SWITCH_SET),
        handler: () => setShowSetSwitcher(true),
      },
      {
        id: 'manage-sets',
        label: 'Manage sets\u2026',
        description: `Create, rename, duplicate, reorder, and delete sets`,
        category: 'Sets',
        handler: () => setShowManageSets(true),
      },
      {
        id: 'paste-tokens',
        label: 'Paste tokens',
        description: 'Create tokens from JSON, CSS vars, CSV, or Tailwind config',
        category: 'Tokens',
        shortcut: adaptShortcut(SHORTCUT_KEYS.PASTE_TOKENS),
        handler: () => setShowPasteModal(true),
      },
      {
        id: 'new-from-clipboard',
        label: 'New token from clipboard',
        description: 'Create a single token pre-filled with your clipboard value',
        category: 'Tokens',
        handler: async () => {
          try {
            const text = await navigator.clipboard.readText();
            const trimmed = text?.trim();
            if (!trimmed) {
              setErrorToast('Clipboard is empty');
              return;
            }
            const inferredType = inferTypeFromValue(trimmed) || 'string';
            goToTokens();
            setEditingToken({ path: '', set: activeSet, isCreate: true, initialType: inferredType, initialValue: trimmed });
          } catch (err) {
            console.warn('[App] clipboard read failed:', err);
            setErrorToast('Could not read clipboard — browser may have denied access');
          }
        },
      },
      {
        id: 'find-replace-names',
        label: 'Find & Replace Names',
        description: 'Rename token paths by pattern',
        category: 'Tokens',
        handler: goToTokens,
      },
      {
        id: 'recents-favorites',
        label: 'Recents & Favorites',
        description: 'View recently edited tokens and starred favorites across all sets',
        category: 'View',
        handler: () => openOverflowPanel('recents'),
      },
      {
        id: 'import',
        label: 'Import Tokens',
        description: 'Import tokens from a file',
        category: 'Data',
        handler: () => openOverflowPanel('import'),
      },
      {
        id: 'export',
        label: 'Export Tokens',
        description: 'Export tokens as CSS, JSON, or other formats',
        category: 'Data',
        handler: () => navigateTo('ship', 'export'),
      },
      {
        id: 'toggle-preview',
        label: showPreviewSplit ? 'Hide preview panel' : 'Show preview panel',
        description: 'Split-view with live token previews — colors, typography, buttons, and more',
        category: 'View',
        shortcut: adaptShortcut(SHORTCUT_KEYS.TOGGLE_PREVIEW),
        handler: () => { setShowPreviewSplit(v => !v); setOverflowPanel(null); },
      },
      {
        id: 'settings',
        label: 'Open Settings',
        description: 'UI preferences, server, lint rules, and export defaults',
        category: 'Settings',
        handler: () => openOverflowPanel('settings'),
      },
      {
        id: 'quick-apply',
        label: 'Quick apply token to selection',
        description: 'Contextual token picker — infers property, shows relevant tokens',
        category: 'Selection',
        shortcut: adaptShortcut(SHORTCUT_KEYS.TOGGLE_QUICK_APPLY),
        handler: () => { if (selectedNodes.length > 0) setShowQuickApply(true); },
      },
      {
        id: 'inspect',
        label: 'Go to Inspect',
        description: 'Inspect token bindings on selected layers',
        category: 'Navigation',
        handler: () => navigateTo('apply', 'inspect'),
      },
      {
        id: 'themes',
        label: 'Open Themes',
        description: 'Manage design themes and set assignments',
        category: 'Navigation',
        handler: () => navigateTo('define', 'themes'),
      },
      {
        id: 'autofill-theme-gaps',
        label: 'Auto-fill theme gaps',
        description: themeGapCount > 0
          ? `Fill ${themeGapCount} missing token value${themeGapCount !== 1 ? 's' : ''} from source sets`
          : 'No fillable gaps detected — open Themes to run a coverage check',
        category: 'Themes',
        handler: () => {
          navigateTo('define', 'themes');
          // Small delay so ThemeManager has time to mount / receive focus before the modal opens
          setTimeout(() => { themeManagerHandleRef.current?.autoFillAllGaps(); }, 150);
        },
      },
      {
        id: 'resolver',
        label: 'Open DTCG Resolver',
        description: 'Configure DTCG v2025.10 resolver rules and preview resolved tokens (in Themes)',
        category: 'Navigation',
        shortcut: adaptShortcut(SHORTCUT_KEYS.GO_TO_RESOLVER),
        handler: () => { navigateTo('define', 'themes'); setTimeout(() => { themeManagerHandleRef.current?.switchToResolverMode(); }, 50); },
      },
      {
        id: 'canvas-coverage',
        label: 'Canvas Coverage',
        description: 'Token binding coverage heatmap for the canvas',
        category: 'Navigation',
        handler: () => { navigateTo('apply', 'canvas-analysis'); triggerHeatmapScan(); },
      },
      {
        id: 'canvas-consistency',
        label: 'Canvas Suggestions',
        description: 'Near-match token consistency check for the canvas',
        category: 'Navigation',
        handler: () => navigateTo('apply', 'canvas-analysis'),
      },
      {
        id: 'canvas-components',
        label: 'Canvas Components',
        description: 'Component token coverage report',
        category: 'Navigation',
        handler: () => navigateTo('apply', 'components'),
      },
      {
        id: 'publish',
        label: 'Go to Publish',
        description: 'Sync tokens to Figma and export',
        category: 'Navigation',
        handler: () => navigateTo('ship', 'publish'),
      },
      {
        id: 'analytics',
        label: 'Filter Validation Issues',
        description: 'Show only tokens with lint violations',
        category: 'Tokens',
        handler: () => { setShowIssuesOnly(v => !v); navigateTo('define', 'tokens'); },
      },
      {
        id: 'next-issue',
        label: 'Jump to Next Issue',
        description: lintViolations.length > 0
          ? `Cycle through ${lintViolations.length} validation issue${lintViolations.length === 1 ? '' : 's'} in the current set`
          : 'No validation issues in the current set',
        category: 'Tokens',
        shortcut: SHORTCUT_KEYS.NEXT_LINT_ISSUE,
        handler: jumpToNextIssue,
      },
      {
        id: 'validate',
        label: 'Validate All Tokens',
        description: 'Run cross-set validation for broken references, circular refs, and more',
        category: 'Tokens',
        handler: () => { navigateTo('ship', 'health'); refreshValidation(); },
      },
      {
        id: 'health-dashboard',
        label: 'Token Health',
        description: 'Validation report, lint summary, generator health, canvas coverage, and unused tokens',
        category: 'Navigation',
        handler: () => navigateTo('ship', 'health'),
      },
      {
        id: 'generate-color-scale',
        label: 'Generate Color Scale',
        description: 'Create a perceptually uniform color ramp',
        category: 'Tokens',
        handler: () => { goToTokens(); setShowColorScaleGen(true); },
      },
      {
        id: 'new-graph',
        label: 'New generator',
        description: 'Create a token generator — color ramps, spacing scales, type scales, and more',
        category: 'Generate',
        handler: () => navigateTo('define', 'generators'),
      },
      {
        id: 'open-graph',
        label: 'Open Generators',
        description: 'View token generators for the current set',
        category: 'Generate',
        handler: () => navigateTo('define', 'generators'),
      },
      ...GRAPH_TEMPLATES.map(t => ({
        id: `graph-template-${t.id}`,
        label: `Generate ${t.label}`,
        description: `Generator template — ${t.description}`,
        category: 'Generate' as const,
        handler: () => {
          navigateTo('define', 'generators');
          setPendingGraphTemplate(t.id);
        },
      })),
      {
        id: 'guided-setup',
        label: 'Guided Setup',
        description: 'Step-by-step wizard: generate primitives, map semantics, set up themes',
        category: 'Help',
        handler: () => setShowGuidedSetup(true),
      },
      {
        id: 'view-style-guide',
        label: 'View style guide',
        description: connected ? `Open ${serverUrl}/docs in browser` : 'Connect to server first',
        category: 'Help',
        handler: () => { if (connected) window.open(`${serverUrl}/docs`, '_blank', 'noopener,noreferrer'); },
      },
      {
        id: 'keyboard-shortcuts',
        label: 'Keyboard shortcuts\u2026',
        description: 'View all keyboard shortcuts',
        category: 'Help',
        shortcut: SHORTCUT_KEYS.SHOW_SHORTCUTS,
        handler: () => setShowKeyboardShortcuts(true),
      },
      // Compare tokens (multi-select → navigate to compare tab)
      {
        id: 'compare-tokens',
        label: 'Compare tokens\u2026',
        description: 'Enter multi-select mode and compare two or more tokens side-by-side',
        category: 'Tokens',
        handler: () => { navigateTo('define', 'tokens'); tokenListCompareRef.current?.openCompareMode(); },
      },
    ];
  }, [activeSet, sets, openOverflowPanel, navigateTo, triggerHeatmapScan, selectedNodes, lintViolations, jumpToNextIssue, showPreviewSplit, setShowPreviewSplit, connected, serverUrl, themeGapCount]);

  // Per-set switch commands — rebuilds when the set list or token counts change.
  const setCommands = useMemo<Command[]>(() => {
    const goToTokens = () => { navigateTo('define', 'tokens'); setEditingToken(null); };
    return sets.map(s => ({
      id: `switch-set-${s}`,
      label: `Switch to Set: ${s}`,
      description: `${setTokenCounts[s] ?? 0} tokens`,
      category: 'Sets' as const,
      handler: () => { setActiveSet(s); goToTokens(); },
    }));
  }, [sets, setTokenCounts, navigateTo]);

  // Theme compare commands — rebuilds when dimensions change (rare: theme config edits).
  const themeCompareCommands = useMemo<Command[]>(() => [
    // Compare theme options — shown when dimensions exist
    ...(dimensions.length > 0 ? [{
      id: 'compare-theme-options',
      label: 'Compare theme options\u2026',
      description: 'Side-by-side token diff across theme options',
      category: 'Themes' as const,
      handler: () => {
        themeManagerHandleRef.current?.navigateToCompare('theme-options');
        navigateTo('define', 'themes');
      },
    }] : []),
    // Per-dimension compare shortcuts when there are ≥2 options
    ...dimensions.filter(d => d.options.length >= 2).map(d => ({
      id: `compare-dim-${d.id}`,
      label: `Compare ${d.name}: ${d.options[0].name} vs ${d.options[1].name}`,
      description: `See token differences across ${d.name} options`,
      category: 'Themes' as const,
      handler: () => {
        themeManagerHandleRef.current?.navigateToCompare('theme-options', undefined, undefined, `${d.id}:${d.options[0].name}`, `${d.id}:${d.options[1].name}`);
        navigateTo('define', 'themes');
      },
    })),
  ], [dimensions, navigateTo]);

  // Contextual commands — rebuilds on hover/selection changes (most frequent).
  // Kept small (~5 entries) so the rebuild cost is negligible.
  const contextualCommands = useMemo<Command[]>(() => [
    // Rename highlighted token (only when a token in the active set is focused)
    ...(highlightedToken && pathToSet[highlightedToken] === activeSet ? [{
      id: 'rename-highlighted-token',
      label: `Rename: ${highlightedToken}`,
      description: 'Start inline rename mode for this token',
      category: 'Tokens' as const,
      handler: () => handlePaletteRename(highlightedToken),
    }] : []),
    // Duplicate highlighted token
    ...(highlightedToken && pathToSet[highlightedToken] === activeSet ? [{
      id: 'duplicate-highlighted-token',
      label: `Duplicate: ${highlightedToken}`,
      description: 'Create a copy of this token with a new path',
      category: 'Tokens' as const,
      handler: () => { handlePaletteDuplicate(highlightedToken); },
    }] : []),
    // Move highlighted token to a different set
    ...(highlightedToken && pathToSet[highlightedToken] === activeSet ? [{
      id: 'move-highlighted-token',
      label: `Move to set: ${highlightedToken}`,
      description: 'Move this token to a different token set',
      category: 'Tokens' as const,
      handler: () => handlePaletteMove(highlightedToken),
    }] : []),
    // Extract highlighted token value to an alias
    ...(highlightedToken && pathToSet[highlightedToken] === activeSet ? [{
      id: 'extract-highlighted-token-to-alias',
      label: `Extract to alias: ${highlightedToken}`,
      description: 'Create a primitive alias token and replace this value with a reference',
      category: 'Tokens' as const,
      handler: () => {
        const entry = allTokensFlat[highlightedToken];
        navigateTo('define', 'tokens');
        setHighlightedToken(highlightedToken);
        tokenListCompareRef.current?.triggerExtractToAlias(highlightedToken, entry?.$type, entry?.$value);
      },
    }] : []),
    // Delete highlighted token (only when a token in the active set is focused)
    ...(highlightedToken && pathToSet[highlightedToken] === activeSet ? [{
      id: 'delete-highlighted-token',
      label: `Delete token: ${highlightedToken}`,
      description: `Permanently delete this token from set "${activeSet}"`,
      category: 'Tokens' as const,
      handler: () => setPaletteDeleteConfirm({ paths: [highlightedToken], label: `Delete "${highlightedToken}"?` }),
    }] : []),
    // Delete selected tokens (only when multi-select is active in TokenList)
    ...(tokenListSelection.length > 0 ? [{
      id: 'delete-selected-tokens',
      label: `Delete ${tokenListSelection.length} selected token${tokenListSelection.length !== 1 ? 's' : ''}`,
      description: `Permanently delete ${tokenListSelection.length} token${tokenListSelection.length !== 1 ? 's' : ''} from set "${activeSet}"`,
      category: 'Tokens' as const,
      handler: () => setPaletteDeleteConfirm({
        paths: tokenListSelection,
        label: `Delete ${tokenListSelection.length} token${tokenListSelection.length !== 1 ? 's' : ''}?`,
      }),
    }] : []),
    // Show dependencies of highlighted token
    ...(highlightedToken ? [{
      id: 'show-dependencies',
      label: `Show dependencies: ${highlightedToken}`,
      description: 'View what aliases and tokens reference this token',
      category: 'Tokens' as const,
      handler: () => { setFlowPanelInitialPath(highlightedToken); navigateTo('apply', 'dependencies'); },
    }] : []),
    // Compare token across themes (only when theme dimensions exist and a token is focused)
    ...(dimensions.length > 0 && highlightedToken ? [{
      id: 'compare-across-themes',
      label: `Compare across themes: ${highlightedToken}`,
      description: 'See how this token\u2019s value varies across all theme options',
      category: 'Tokens' as const,
      handler: () => { handleOpenCrossThemeCompare(highlightedToken); },
    }] : []),
    // Compare any token across themes (no focused token — prompt user)
    ...(dimensions.length > 0 && !highlightedToken ? [{
      id: 'compare-across-themes-pick',
      label: 'Compare token across themes\u2026',
      description: 'Focus a token first, then run this command to compare its values across theme options',
      category: 'Tokens' as const,
      handler: () => { themeManagerHandleRef.current?.navigateToCompare('cross-theme'); navigateTo('define', 'themes'); },
    }] : []),
  ], [highlightedToken, tokenListSelection, pathToSet, activeSet, dimensions, setPaletteDeleteConfirm, navigateTo, setFlowPanelInitialPath, handleOpenCrossThemeCompare, handlePaletteRename, handlePaletteDuplicate, handlePaletteMove, allTokensFlat, setHighlightedToken]);

  // Undo/redo commands — rebuilds when the operation log or redo stack changes.
  const undoRedoCommands = useMemo<Command[]>(() => [
    // Server-side undo: recent operations with rollback
    ...recentOperations
      .filter(op => !op.rolledBack)
      .slice(0, 5)
      .map((op, i) => ({
        id: `undo-op-${op.id}`,
        label: i === 0 ? `Undo: ${op.description}` : `Rollback: ${op.description}`,
        description: `${op.affectedPaths.length} path(s) \u00b7 ${op.setName} \u00b7 ${timeAgo(op.timestamp)}`,
        category: 'Undo' as const,
        handler: () => handleRollback(op.id),
      })),
    // Local redo: most recent item from the client-side future stack
    ...(canRedo && redoSlot ? [{
      id: 'redo-local',
      label: `Redo: ${redoSlot.description}`,
      description: 'Re-apply the last undone action',
      category: 'Undo' as const,
      shortcut: '⇧⌘Z',
      handler: executeRedo,
    }] : []),
    // Server-side redo: rolled-back operations that can be re-applied (most recent first)
    ...[...redoableItems].reverse().slice(0, 5).map((item, i) => ({
      id: `redo-op-${item.origOpId}`,
      label: i === 0 && !canRedo ? `Redo: ${item.description}` : `Re-apply: ${item.description}`,
      description: 'Re-apply a rolled-back server operation',
      category: 'Undo' as const,
      handler: () => handleServerRedo(item.origOpId),
    })),
  ], [recentOperations, handleRollback, canRedo, redoSlot, executeRedo, redoableItems, handleServerRedo]);

  // Export preset commands — one entry per saved preset.
  // Rebuilds only when presets change (exportPresetRev bumped by custom event from ExportPanel).
  const exportPresetCommands = useMemo<Command[]>(() => {
    const presets = lsGetJson<Array<{ id: string; name: string }>>(STORAGE_KEYS.EXPORT_PRESETS, []);
    return presets.map(preset => ({
      id: `export-preset-${preset.id}`,
      label: `Export with preset: ${preset.name}`,
      description: 'Apply export preset and open the Export panel',
      category: 'Data' as const,
      handler: () => {
        lsSet(STORAGE_KEYS.EXPORT_PRESET_APPLY, preset.id);
        navigateTo('ship', 'export');
        window.dispatchEvent(new CustomEvent('applyExportPreset'));
      },
    }));
  // exportPresetRev is the only dep that changes when presets are added/removed/renamed
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportPresetRev, navigateTo]);

  // Merge all command slices. Each slice has a stable reference until its own
  // deps change, so this array spread is the only work done on hover events.
  const commands: Command[] = useMemo(
    () => [...baseCommands, ...themeCompareCommands, ...setCommands, ...contextualCommands, ...undoRedoCommands, ...exportPresetCommands],
    [baseCommands, themeCompareCommands, setCommands, contextualCommands, undoRedoCommands, exportPresetCommands],
  );

  // Flat token list for command palette — active set only (default mode)
  const activeSetPaletteTokens: TokenEntry[] = useMemo(() => {
    const setFlat = perSetFlat[activeSet] ?? {};
    return Object.entries(setFlat).map(([path, entry]) => ({
      path,
      type: entry.$type || 'unknown',
      value: typeof entry.$value === 'string' ? entry.$value : JSON.stringify(entry.$value),
      set: activeSet,
      isAlias: isAlias(entry.$value),
      generatorName: derivedTokenPaths.get(path)?.name,
    }));
  }, [perSetFlat, activeSet, derivedTokenPaths]);

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
    return Array.from(paletteRecentlyTouched.timestamps.entries())
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
  }, [paletteRecentlyTouched.timestamps, allTokensFlat, pathToSet]);

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
                  onClick={() => { setShowBannerUrlEditor(v => !v); setServerUrlInput(serverUrl); setConnectResult(null); }}
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
                  value={serverUrlInput}
                  onChange={e => { setServerUrlInput(e.target.value); setConnectResult(null); }}
                  onKeyDown={async e => {
                    if (e.key === 'Enter') {
                      setConnectResult(null);
                      const ok = await updateServerUrlAndConnect(serverUrlInput.trim());
                      setConnectResult(ok ? 'ok' : 'fail');
                      if (ok) setShowBannerUrlEditor(false);
                    }
                  }}
                  placeholder="http://localhost:9400"
                  autoFocus
                  className="flex-1 min-w-0 px-2 py-1 rounded border border-current/30 bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] text-[11px] placeholder-[var(--color-figma-text-tertiary)] focus-visible:border-[var(--color-figma-accent)] outline-none"
                />
                <button
                  onClick={async () => {
                    setConnectResult(null);
                    const ok = await updateServerUrlAndConnect(serverUrlInput.trim());
                    setConnectResult(ok ? 'ok' : 'fail');
                    if (ok) setShowBannerUrlEditor(false);
                  }}
                  disabled={checking || !serverUrlInput.trim()}
                  className="px-2.5 py-1 text-[11px] font-medium rounded bg-[var(--color-figma-accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                >
                  Connect
                </button>
              </div>
              {connectResult === 'fail' && (
                <span className="text-[10px] text-[var(--color-figma-error)]">Cannot reach server — check the URL and try again</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab bar — two-tier: top tabs (Define/Apply/Ship) + sub-tabs */}
      <div className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
      <div className="flex items-center" role="tablist" aria-label="Workflow tabs">
        {TOP_TABS.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTopTab === tab.id && overflowPanel === null}
            onClick={() => guardEditorAction(() => navigateTo(tab.id))}
            className={`relative px-3 py-2 text-[11px] font-medium transition-colors rounded-sm mx-0.5 my-1 ${
              activeTopTab === tab.id && overflowPanel === null
                ? 'bg-[var(--color-figma-accent)] text-white'
                : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'
            }`}
          >
            {tab.label}
            {tab.id === 'apply' && selectedNodes.length > 0 && !(activeTopTab === 'apply' && overflowPanel === null) && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[var(--color-figma-accent)] border border-[var(--color-figma-bg)]" aria-label="Layer selected" />
            )}
            {tab.id === 'ship' && !(activeTopTab === 'ship' && overflowPanel === null) && pendingPublishCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-0.5 flex items-center justify-center rounded-full bg-[var(--color-figma-accent)] border border-[var(--color-figma-bg)] text-white text-[8px] font-bold leading-none" aria-label={`${pendingPublishCount} changes pending sync`}>{pendingPublishCount}</span>
            )}
            {tab.id === 'ship' && !(activeTopTab === 'ship' && overflowPanel === null) && pendingPublishCount === 0 && (gitHasChanges || computeHealthIssueCount(lintViolations, generators) > 0) && (
              <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-[var(--color-figma-bg)] ${gitHasChanges ? 'bg-amber-400' : 'bg-[var(--color-figma-error)]'}`} aria-label={gitHasChanges ? 'Uncommitted changes' : 'Health issues detected'} />
            )}
          </button>
        ))}

        {/* Issues filter toggle */}
        <Tooltip label="Validation issues filter" className="ml-auto mr-0.5 my-1">
          <button
            onClick={() => { setShowIssuesOnly(v => !v); if (activeTopTab !== 'define' || activeSubTab !== 'tokens') navigateTo('define', 'tokens'); }}
            className={`relative flex items-center justify-center w-7 h-7 rounded transition-colors ${
              showIssuesOnly
                ? 'bg-[var(--color-figma-accent)] text-white'
                : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]'
            }`}
            aria-label="Toggle validation issues filter"
            aria-pressed={showIssuesOnly}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01"/>
            </svg>
            {lintViolations.length > 0 && !showIssuesOnly && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-[3px] rounded-full bg-red-500 text-white text-[10px] font-bold leading-[14px] text-center">
                {lintViolations.length > 99 ? '99+' : lintViolations.length}
              </span>
            )}
          </button>
        </Tooltip>

        {/* Preview split-view toggle */}
        <Tooltip label="Preview panel" shortcut={adaptShortcut(SHORTCUT_KEYS.TOGGLE_PREVIEW)} className="mr-0.5 my-1">
          <button
            onClick={() => { setShowPreviewSplit(v => !v); setOverflowPanel(null); }}
            className={`flex items-center gap-1 px-2 py-1 rounded transition-colors text-[10px] ${
              showPreviewSplit
                ? 'bg-[var(--color-figma-accent)] text-white'
                : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]'
            }`}
            aria-label="Toggle preview split view"
            aria-pressed={showPreviewSplit}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            <span className={showPreviewSplit ? 'opacity-80' : 'opacity-50'}>{adaptShortcut(SHORTCUT_KEYS.TOGGLE_PREVIEW)}</span>
          </button>
        </Tooltip>

        {/* Command palette trigger */}
        <Tooltip label="Command palette" shortcut={adaptShortcut(SHORTCUT_KEYS.OPEN_PALETTE)} className="mr-1 my-1">
          <button
            onClick={() => setShowCommandPalette(v => !v)}
            className="flex items-center gap-1 px-2 py-1 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] transition-colors text-[10px]"
            aria-label="Open command palette"
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="4.5" cy="4.5" r="3.5"/>
              <path d="M8 8l2 2"/>
            </svg>
            <span className="opacity-50">{adaptShortcut(SHORTCUT_KEYS.OPEN_PALETTE)}</span>
          </button>
        </Tooltip>

        {/* Second screen / expand toggle */}
        <Tooltip label={isExpanded ? 'Restore window' : 'Expand to second screen'} className="mr-0.5 my-1">
          <button
            onClick={toggleExpand}
            className={`flex items-center justify-center w-7 h-7 rounded transition-colors ${
              isExpanded
                ? 'text-[var(--color-figma-text)] bg-[var(--color-figma-bg-hover)]'
                : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]'
            }`}
            aria-label={isExpanded ? 'Restore window size' : 'Expand to second screen'}
            aria-pressed={isExpanded}
          >
            {isExpanded ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
              </svg>
            )}
          </button>
        </Tooltip>

        {/* Canvas Coverage toggle */}
        <Tooltip label="Canvas analysis" className="mr-0.5 my-1">
          <button
            onClick={() => {
              if (activeTopTab === 'apply' && activeSubTab === 'canvas-analysis') {
                navigateTo('apply', 'inspect');
              } else {
                navigateTo('apply', 'canvas-analysis');
                triggerHeatmapScan();
              }
            }}
            className={`flex items-center justify-center w-7 h-7 rounded transition-colors ${
              activeTopTab === 'apply' && activeSubTab === 'canvas-analysis'
                ? 'bg-[var(--color-figma-accent)] text-white'
                : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]'
            }`}
            aria-label="Toggle canvas analysis"
            aria-pressed={activeTopTab === 'apply' && activeSubTab === 'canvas-analysis'}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="7" height="7" rx="1"/>
              <rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/>
              <rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
          </button>
        </Tooltip>

        {/* Notification history */}
        <div className="relative group/tooltip mr-0.5 my-1">
          <button
            onClick={() => setShowNotificationHistory(v => !v)}
            className={`relative flex items-center justify-center w-7 h-7 rounded transition-colors ${
              showNotificationHistory
                ? 'bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text)]'
                : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]'
            }`}
            aria-label="Notification history"
            aria-haspopup="true"
            aria-expanded={showNotificationHistory}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            {notificationHistory.length > 0 && !showNotificationHistory && (
              <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-[var(--color-figma-accent)]" aria-hidden="true" />
            )}
          </button>
          {!showNotificationHistory && (
            <div
              role="tooltip"
              className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-[60] pointer-events-none
                opacity-0 group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100
                transition-opacity duration-100
                bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)]
                text-[var(--color-figma-text)] text-[10px] whitespace-nowrap
                rounded px-1.5 py-0.5 shadow-md"
            >
              Notifications
            </div>
          )}
          {showNotificationHistory && (
            <NotificationHistory
              history={notificationHistory}
              onClear={clearNotificationHistory}
              onClose={() => setShowNotificationHistory(false)}
            />
          )}
        </div>

        {/* Server connection indicator */}
        <Tooltip
          label={checking ? 'Connecting…' : connected ? `Connected to ${serverUrl}` : `Cannot reach ${serverUrl}`}
          className="mr-0.5 my-1"
        >
          <button
            onClick={() => {
              if (!connected) {
                retryConnection();
              } else {
                setOverflowPanel('settings');
                setConnectResult(null);
              }
            }}
            className="flex items-center justify-center w-7 h-7 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            aria-label={checking ? 'Connecting to server' : connected ? 'Server connected' : 'Server disconnected — click to retry'}
          >
            <span className={`w-2 h-2 rounded-full ${checking ? 'bg-[var(--color-figma-text-secondary)] animate-pulse' : connected ? 'bg-green-500' : 'bg-[var(--color-figma-error)]'}`} />
          </button>
        </Tooltip>

        {/* Overflow menu */}
        <div className="relative group/tooltip mr-1 my-1" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(v => !v)}
            className={`relative flex items-center justify-center w-7 h-7 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] transition-colors ${menuOpen ? 'bg-[var(--color-figma-bg-hover)]' : ''}`}
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <circle cx="6" cy="2" r="1.2" />
              <circle cx="6" cy="6" r="1.2" />
              <circle cx="6" cy="10" r="1.2" />
            </svg>
            {!connected && !checking && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[var(--color-figma-error)] border border-[var(--color-figma-bg)]" aria-hidden="true" />
            )}
          </button>
          {!menuOpen && (
            <div
              role="tooltip"
              className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-[60] pointer-events-none
                opacity-0 group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100
                transition-opacity duration-100
                bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)]
                text-[var(--color-figma-text)] text-[10px] whitespace-nowrap
                rounded px-1.5 py-0.5 shadow-md"
            >
              More actions
            </div>
          )}

          {menuOpen && (
            <div className="absolute right-1 top-full mt-0.5 w-40 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-lg z-50" role="menu">
              <button
                role="menuitem"
                tabIndex={-1}
                onClick={() => { setShowPasteModal(true); setMenuOpen(false); }}
                className="w-full text-left px-3 py-2 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Paste tokens <span className="text-[10px] text-[var(--color-figma-text-secondary)] ml-1">{adaptShortcut(SHORTCUT_KEYS.PASTE_TOKENS)}</span>
              </button>
              <button
                role="menuitem"
                tabIndex={-1}
                onClick={() => openOverflowPanel('import')}
                className="w-full text-left px-3 py-2 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Import
              </button>
              <button
                role="menuitem"
                tabIndex={-1}
                onClick={() => { setMenuOpen(false); navigateTo('ship', 'export'); }}
                className="w-full text-left px-3 py-2 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Export
              </button>
              <button
                role="menuitem"
                tabIndex={-1}
                onClick={() => { setMenuOpen(false); navigateTo('ship', 'health'); }}
                className="w-full text-left px-3 py-2 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Health
              </button>
              <div className="border-t border-[var(--color-figma-border)]" />
              <button
                role="menuitem"
                tabIndex={-1}
                onClick={() => { setMenuOpen(false); openOverflowPanel('recents'); }}
                className="w-full text-left px-3 py-2 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors flex items-center gap-2"
              >
                <span className="flex-1">Recents &amp; Favorites</span>
                {(crossSetRecents.count > 0 || starredTokens.count > 0) && (
                  <span className="text-[9px] text-[var(--color-figma-text-secondary)]">
                    {starredTokens.count > 0 ? `★ ${starredTokens.count}` : ''}
                  </span>
                )}
              </button>
              <button
                role="menuitem"
                tabIndex={-1}
                onClick={() => openOverflowPanel('settings')}
                className="w-full text-left px-3 py-2 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors flex items-center gap-2"
              >
                <span className="flex-1">Settings</span>
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${connected ? 'bg-[var(--color-figma-success)]' : checking ? 'bg-[var(--color-figma-text-secondary)] animate-pulse' : 'bg-[var(--color-figma-error)]'}`} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </div>
      {/* Sub-tab row */}
      {overflowPanel === null && (() => {
        const topDef = TOP_TABS.find(t => t.id === activeTopTab);
        if (!topDef || topDef.subTabs.length <= 1) return null;
        return (
          <div className="flex items-center gap-0.5 px-2 py-1 bg-[var(--color-figma-bg-secondary)]" role="tablist" aria-label="Sub-tabs">
            {topDef.subTabs.map(sub => (
              <button
                key={sub.id}
                role="tab"
                aria-selected={activeSubTab === sub.id}
                onClick={() => {
                  guardEditorAction(() => {
                    setSubTab(sub.id);
                    if (sub.id === 'canvas-analysis') triggerHeatmapScan();
                  });
                }}
                className={`px-2.5 py-1 text-[10px] font-medium rounded-sm transition-colors ${
                  activeSubTab === sub.id
                    ? 'bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] shadow-sm'
                    : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'
                }`}
              >
                {sub.label}
                {sub.id === 'generators' && staleGeneratorCount > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center min-w-[14px] h-[14px] px-[3px] rounded-full bg-yellow-400 text-[9px] font-bold text-yellow-900 leading-none" aria-label={`${staleGeneratorCount} stale`}>
                    {staleGeneratorCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        );
      })()}
      </div>

      {/* Set selector (for tokens tab) — hidden when sidebar or simple mode is active */}
      {activeTopTab === 'define' && activeSubTab === 'tokens' && overflowPanel === null && sets.length > 0 && !useSidebar && !isSimpleMode && (
        <>
        <div className="relative">
        <div ref={setTabsScrollRef} className={`flex gap-1 px-2 py-1.5 bg-[var(--color-figma-bg-secondary)] border-b border-[var(--color-figma-border)] overflow-x-auto transition-colors ${tokenDragState ? 'bg-[var(--color-figma-accent)]/[0.03]' : ''}`} style={{ scrollbarWidth: 'none' }}>
          {sets.map(set => {
            const isActive = activeSet === set;
            const isRenaming = renamingSet === set;
            const isTokenDragSource = tokenDragState?.fromSet === set;
            const isTokenDropTarget = tokenDragState && !isTokenDragSource;
            const isTokenHovered = isTokenDropTarget && dragOverSetName === set;
            return (
              <div
                key={set}
                data-active-set={isActive}
                draggable={!isRenaming}
                onDragStart={e => handleSetDragStart(e, set)}
                onDragOver={e => handleSetDragOver(e, set)}
                onDragLeave={handleSetDragLeave}
                onDrop={e => handleSetDrop(e, set)}
                onDragEnd={handleSetDragEnd}
                className={`relative flex group/settab transition-opacity ${dragOverSetName === set && dragSetName !== set ? 'border-l-2 border-[var(--color-figma-accent)]' : ''} ${isTokenDragSource ? 'opacity-40' : ''} ${isTokenDropTarget ? isTokenHovered ? 'ring-2 ring-inset ring-[var(--color-figma-accent)] rounded' : 'ring-1 ring-inset ring-[var(--color-figma-accent)]/40 rounded' : ''}`}
              >
                {isRenaming ? (
                  <div className="flex flex-col">
                    <div className="flex items-center">
                      <input
                        ref={renameInputRef}
                        value={renameValue}
                        onChange={e => { setRenameValue(e.target.value.trimStart()); setRenameError(''); }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleRenameConfirm();
                          if (e.key === 'Escape') cancelRename();
                        }}
                        onBlur={cancelRename}
                        size={Math.max(set.length + 4, 10)}
                        className="px-2 py-1 rounded text-[10px] bg-[var(--color-figma-bg)] border border-[var(--color-figma-accent)] text-[var(--color-figma-text)] outline-none"
                        placeholder={set}
                        aria-label="Rename token set"
                      />
                    </div>
                    {renameError && (
                      <span className="text-[10px] text-red-500 mt-0.5 px-1">{renameError}</span>
                    )}
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => guardEditorAction(() => setActiveSet(set))}
                      onContextMenu={e => openSetMenu(set, e)}
                      title={(() => {
                        const parts: string[] = [setDescriptions[set] || set];
                        const byType = setByTypeCounts[set];
                        if (byType) {
                          const breakdown = Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([t, c]) => `${c} ${t}`).join(' · ');
                          if (breakdown) parts.push(breakdown);
                        }
                        if (setThemeStatusMap[set]) parts.push(`theme: ${setThemeStatusMap[set]}`);
                        return parts.join('\n');
                      })()}
                      className={`flex items-center pl-2 pr-1 py-1 rounded-l text-[10px] whitespace-nowrap transition-colors ${
                        isActive
                          ? 'bg-[var(--color-figma-accent)] text-white font-medium'
                          : 'bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
                      }`}
                    >
                      {setThemeStatusMap[set] && (
                        <span
                          className={`mr-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                            setThemeStatusMap[set] === 'enabled'
                              ? isActive ? 'bg-green-300' : 'bg-green-500'
                              : setThemeStatusMap[set] === 'source'
                              ? isActive ? 'bg-sky-300' : 'bg-sky-500'
                              : isActive ? 'bg-white/30' : 'bg-gray-400/50'
                          }`}
                        />
                      )}
                      {set}
                      {setTokenCounts[set] !== undefined && (
                        <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full leading-none tabular-nums ${isActive ? 'bg-white/20 text-white/90' : 'bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-tertiary)]'}`}>
                          {isActive && filteredSetCount !== null ? `${filteredSetCount}\u2009/\u2009${setTokenCounts[set]}` : setTokenCounts[set]}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={e => openSetMenu(set, e)}
                      onContextMenu={e => openSetMenu(set, e)}
                      title="Set options"
                      aria-label="Set options"
                      className={`flex items-center justify-center px-1 py-1 rounded-r text-[10px] transition-colors ${
                        isActive
                          ? 'opacity-100 bg-[var(--color-figma-accent)] text-white/80 hover:text-white hover:bg-[var(--color-figma-accent-hover)]'
                          : 'opacity-40 group-hover/settab:opacity-100 bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
                      }`}
                    >
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
                        <circle cx="4" cy="1" r="0.9" />
                        <circle cx="4" cy="4" r="0.9" />
                        <circle cx="4" cy="7" r="0.9" />
                      </svg>
                    </button>
                  </>
                )}
              </div>
            );
          })}

          {/* Set context menu */}
          {tabMenuOpen && (
            <div
              ref={tabMenuRef}
              role="menu"
              className="fixed rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-lg z-50 py-1 min-w-[168px]"
              style={{ top: tabMenuPos.y, left: tabMenuPos.x }}
            >
              <button
                role="menuitem"
                tabIndex={-1}
                onMouseDown={e => e.preventDefault()}
                onClick={() => guardEditorAction(() => { setActiveSet(tabMenuOpen); navigateTo('define', 'generators'); setTabMenuOpen(null); })}
                className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Generate tokens…
              </button>
              <div className="border-t border-[var(--color-figma-border)] my-1" />
              <button
                role="menuitem"
                tabIndex={-1}
                onMouseDown={e => e.preventDefault()}
                onClick={() => openSetMetadata(tabMenuOpen)}
                className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Edit set info
              </button>
              <div className="border-t border-[var(--color-figma-border)] my-1" />
              <button
                role="menuitem"
                tabIndex={-1}
                onMouseDown={e => e.preventDefault()}
                onClick={() => startRename(tabMenuOpen)}
                className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Rename
              </button>
              <button
                role="menuitem"
                tabIndex={-1}
                onMouseDown={e => e.preventDefault()}
                onClick={() => handleDuplicateSet(tabMenuOpen)}
                className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Duplicate
              </button>
              <button
                role="menuitem"
                tabIndex={-1}
                onMouseDown={e => e.preventDefault()}
                onClick={() => handleReorderSet(tabMenuOpen!, 'left')}
                disabled={sets.indexOf(tabMenuOpen!) === 0}
                className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ← Move left
              </button>
              <button
                role="menuitem"
                tabIndex={-1}
                onMouseDown={e => e.preventDefault()}
                onClick={() => handleReorderSet(tabMenuOpen!, 'right')}
                disabled={sets.indexOf(tabMenuOpen!) === sets.length - 1}
                className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Move right →
              </button>
              <div className="border-t border-[var(--color-figma-border)] my-1" />
              <button
                role="menuitem"
                tabIndex={-1}
                onMouseDown={e => e.preventDefault()}
                onClick={() => openMergeDialog(tabMenuOpen)}
                disabled={sets.filter(s => s !== tabMenuOpen).length === 0}
                className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Merge into…
              </button>
              <button
                role="menuitem"
                tabIndex={-1}
                onMouseDown={e => e.preventDefault()}
                onClick={() => openSplitDialog(tabMenuOpen)}
                className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Split by group
              </button>
              <div className="border-t border-[var(--color-figma-border)] my-1" />
              <button
                role="menuitem"
                tabIndex={-1}
                onMouseDown={e => e.preventDefault()}
                onClick={() => { startDelete(tabMenuOpen!); }}
                className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--color-figma-error)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Delete
              </button>
            </div>
          )}

          {creatingSet ? (
            <div className="flex flex-col">
              <div className="flex items-center gap-1">
                <input
                  ref={newSetInputRef}
                  value={newSetName}
                  onChange={e => { setNewSetName(e.target.value); setNewSetError(''); }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleCreateSet();
                    if (e.key === 'Escape') { setCreatingSet(false); setNewSetName(''); setNewSetError(''); }
                  }}
                  onBlur={() => { if (!newSetName.trim()) { setCreatingSet(false); setNewSetName(''); setNewSetError(''); } }}
                  className="px-2 py-1 rounded text-[10px] bg-[var(--color-figma-bg)] border border-[var(--color-figma-accent)] text-[var(--color-figma-text)] outline-none w-28"
                  placeholder="Set name"
                  aria-label="New set name"
                />
              </div>
              {newSetError && (
                <span className="text-[10px] text-red-500 mt-0.5 px-1">{newSetError}</span>
              )}
            </div>
          ) : (
            <button
              onClick={() => { setCreatingSet(true); setNewSetName(''); setNewSetError(''); }}
              className="px-2 py-1 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
            >
              + Add Set
            </button>
          )}
        </div>
        {setTabsOverflow.left && (
          <>
            <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-[var(--color-figma-bg-secondary)] to-transparent pointer-events-none z-[1]" aria-hidden="true" />
            <button
              onClick={() => scrollSetTabs('left')}
              className="absolute left-0 top-0 bottom-0 w-5 flex items-center justify-center z-[2] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
              aria-label="Scroll tabs left"
            >
              <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><path d="M6 1L2 4l4 3V1z" /></svg>
            </button>
          </>
        )}
        {setTabsOverflow.right && (
          <>
            <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-[var(--color-figma-bg-secondary)] to-transparent pointer-events-none z-[1]" aria-hidden="true" />
            <button
              onClick={() => scrollSetTabs('right')}
              className="absolute right-0 top-0 bottom-0 w-5 flex items-center justify-center z-[2] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
              aria-label="Scroll tabs right"
            >
              <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><path d="M2 1l4 3-4 3V1z" /></svg>
            </button>
          </>
        )}
        </div>
        {sets.length > 1 && dragSetName && (
          <div className="px-2 py-0.5 text-[10px] text-[var(--color-figma-text-tertiary)] select-none bg-[var(--color-figma-bg-secondary)] border-b border-[var(--color-figma-border)]">
            ← lower precedence · drag to reorder · higher precedence →
          </div>
        )}
        </>
      )}

      {/* Simple mode info bar — shows when set navigation is hidden */}
      {activeTopTab === 'define' && activeSubTab === 'tokens' && overflowPanel === null && isSimpleMode && sets.length > 1 && (
        <div className="flex items-center justify-between px-2 py-1 bg-[var(--color-figma-bg-secondary)] border-b border-[var(--color-figma-border)]">
          <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
            {totalTokenCount} tokens across {sets.length} sets — organized by type
          </span>
          <button
            onClick={() => { setAdvancedModeOverride(true); lsSet(STORAGE_KEYS.ADVANCED_MODE, 'true'); }}
            className="text-[10px] text-[var(--color-figma-accent)] hover:underline shrink-0 ml-2"
          >
            Show sets
          </button>
        </div>
      )}

      {/* Advanced mode return bar — shown when user opted into advanced mode but could use simple mode */}
      {activeTopTab === 'define' && activeSubTab === 'tokens' && overflowPanel === null && advancedModeOverride && totalTokenCount > 0 && totalTokenCount < 200 && sets.length > 1 && (
        <div className="flex items-center justify-end px-2 py-0.5 bg-[var(--color-figma-bg-secondary)] border-b border-[var(--color-figma-border)]">
          <button
            onClick={() => { setAdvancedModeOverride(false); lsRemove(STORAGE_KEYS.ADVANCED_MODE); }}
            className="text-[10px] text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)] hover:underline"
          >
            Simplify view
          </button>
        </div>
      )}

      {/* Content — outer wrapper is flex-row so the set sidebar can sit alongside the content column */}
      <ErrorBoundary>
      <div className="flex-1 flex overflow-hidden">

        {/* Set sidebar — shown when sets have folder structure (/) or count ≥ 7, hidden in simple mode */}
        {activeTopTab === 'define' && activeSubTab === 'tokens' && overflowPanel === null && useSidebar && !isSimpleMode && (
          <aside className="w-[128px] shrink-0 border-r border-[var(--color-figma-border)] flex flex-col bg-[var(--color-figma-bg-secondary)] overflow-hidden">
            <div className="flex-1 overflow-y-auto py-0.5" style={{ scrollbarWidth: 'none' }}>
              {sidebarTree.roots.map(item => {
                if (typeof item === 'string') {
                  // Root-level (unfoldered) set
                  const set = item;
                  const isSidebarTokenSource = tokenDragState?.fromSet === set;
                  const isSidebarTokenDropTarget = tokenDragState && !isSidebarTokenSource;
                  const isSidebarTokenHovered = isSidebarTokenDropTarget && dragOverSetName === set;
                  return (
                    <div
                      key={set}
                      className={`group/sidebarset relative transition-opacity ${isSidebarTokenSource ? 'opacity-40' : ''} ${isSidebarTokenDropTarget ? isSidebarTokenHovered ? 'ring-2 ring-inset ring-[var(--color-figma-accent)] rounded' : 'ring-1 ring-inset ring-[var(--color-figma-accent)]/40 rounded' : ''}`}
                      onDragOver={e => handleSetDragOver(e, set)}
                      onDragLeave={handleSetDragLeave}
                      onDrop={e => handleSetDrop(e, set)}
                    >
                      {renamingSet === set ? (
                        <div className="px-1 py-0.5">
                          <input
                            ref={renameInputRef}
                            value={renameValue}
                            onChange={e => { setRenameValue(e.target.value.trimStart()); setRenameError(''); }}
                            onKeyDown={e => { if (e.key === 'Enter') handleRenameConfirm(); if (e.key === 'Escape') cancelRename(); }}
                            onBlur={cancelRename}
                            aria-label="Rename token set"
                            className="w-full px-1.5 py-0.5 rounded text-[10px] bg-[var(--color-figma-bg)] border border-[var(--color-figma-accent)] text-[var(--color-figma-text)] outline-none"
                          />
                          {renameError && <span className="block text-[10px] text-red-500 px-1">{renameError}</span>}
                        </div>
                      ) : (
                        <div className="flex items-center">
                          <button
                            onClick={() => guardEditorAction(() => setActiveSet(set))}
                            onContextMenu={e => openSetMenu(set, e)}
                            title={(() => {
                              const parts: string[] = [setDescriptions[set] || set];
                              const byType = setByTypeCounts[set];
                              if (byType) {
                                const breakdown = Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([t, c]) => `${c} ${t}`).join(' · ');
                                if (breakdown) parts.push(breakdown);
                              }
                              return parts.join('\n');
                            })()}
                            data-active-set={activeSet === set}
                            className={`flex-1 min-w-0 flex items-center justify-between pl-2 pr-1 py-1 text-[10px] text-left transition-colors ${
                              activeSet === set
                                ? 'bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] font-medium'
                                : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
                            }`}
                          >
                            <span className="truncate flex-1">{set}</span>
                            {setTokenCounts[set] !== undefined && (
                              <span className={`text-[10px] shrink-0 ml-1 px-1.5 py-0.5 rounded-full leading-none tabular-nums ${activeSet === set ? 'bg-[var(--color-figma-accent)]/20 text-[var(--color-figma-accent)]' : 'bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-tertiary)]'}`}>
                                {activeSet === set && filteredSetCount !== null ? `${filteredSetCount}\u2009/\u2009${setTokenCounts[set]}` : setTokenCounts[set]}
                              </span>
                            )}
                          </button>
                          <button
                            onClick={e => openSetMenu(set, e)}
                            onContextMenu={e => openSetMenu(set, e)}
                            title="Set options"
                            aria-label="Set options"
                            className={`shrink-0 flex items-center justify-center w-5 h-5 rounded transition-opacity ${
                              activeSet === set
                                ? 'opacity-60 hover:opacity-100 text-[var(--color-figma-accent)]'
                                : 'opacity-0 group-hover/sidebarset:opacity-60 hover:!opacity-100 text-[var(--color-figma-text-tertiary)]'
                            }`}
                          >
                            <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><circle cx="4" cy="1" r="0.9" /><circle cx="4" cy="4" r="0.9" /><circle cx="4" cy="7" r="0.9" /></svg>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                }
                // Folder node
                const folder = item as FolderTreeNode;
                const isCollapsed = collapsedFolders.has(folder.path);
                return (
                  <div key={folder.path}>
                    <button
                      onClick={() => toggleFolder(folder.path)}
                      className="w-full flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)] uppercase tracking-wider transition-colors"
                    >
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`shrink-0 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}><path d="M2 1l4 3-4 3V1z" /></svg>
                      <span className="truncate">{folder.name}</span>
                    </button>
                    {!isCollapsed && folder.sets.map(set => {
                      const leaf = set.slice(folder.path.length + 1);
                      const isFolderSetTokenSource = tokenDragState?.fromSet === set;
                      const isFolderSetTokenDropTarget = tokenDragState && !isFolderSetTokenSource;
                      const isFolderSetTokenHovered = isFolderSetTokenDropTarget && dragOverSetName === set;
                      return (
                        <div
                          key={set}
                          className={`group/sidebarset relative transition-opacity ${isFolderSetTokenSource ? 'opacity-40' : ''} ${isFolderSetTokenDropTarget ? isFolderSetTokenHovered ? 'ring-2 ring-inset ring-[var(--color-figma-accent)] rounded' : 'ring-1 ring-inset ring-[var(--color-figma-accent)]/40 rounded' : ''}`}
                          onDragOver={e => handleSetDragOver(e, set)}
                          onDragLeave={handleSetDragLeave}
                          onDrop={e => handleSetDrop(e, set)}
                        >
                          {renamingSet === set ? (
                            <div className="pl-4 pr-1 py-0.5">
                              <input
                                ref={renameInputRef}
                                value={renameValue}
                                onChange={e => { setRenameValue(e.target.value.trimStart()); setRenameError(''); }}
                                onKeyDown={e => { if (e.key === 'Enter') handleRenameConfirm(); if (e.key === 'Escape') cancelRename(); }}
                                onBlur={cancelRename}
                                aria-label="Rename token set"
                                className="w-full px-1.5 py-0.5 rounded text-[10px] bg-[var(--color-figma-bg)] border border-[var(--color-figma-accent)] text-[var(--color-figma-text)] outline-none"
                              />
                              {renameError && <span className="block text-[10px] text-red-500 px-1">{renameError}</span>}
                            </div>
                          ) : (
                            <div className="flex items-center">
                              <button
                                onClick={() => guardEditorAction(() => setActiveSet(set))}
                                onContextMenu={e => openSetMenu(set, e)}
                                title={(() => {
                                  const parts: string[] = [setDescriptions[set] || leaf];
                                  const byType = setByTypeCounts[set];
                                  if (byType) {
                                    const breakdown = Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([t, c]) => `${c} ${t}`).join(' · ');
                                    if (breakdown) parts.push(breakdown);
                                  }
                                  return parts.join('\n');
                                })()}
                                data-active-set={activeSet === set}
                                className={`flex-1 min-w-0 flex items-center justify-between pl-5 pr-1 py-1 text-[10px] text-left transition-colors ${
                                  activeSet === set
                                    ? 'bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] font-medium'
                                    : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
                                }`}
                              >
                                <span className="truncate flex-1">{leaf}</span>
                                {setTokenCounts[set] !== undefined && (
                                  <span className={`text-[10px] shrink-0 ml-1 px-1.5 py-0.5 rounded-full leading-none tabular-nums ${activeSet === set ? 'bg-[var(--color-figma-accent)]/20 text-[var(--color-figma-accent)]' : 'bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-tertiary)]'}`}>
                                    {activeSet === set && filteredSetCount !== null ? `${filteredSetCount}\u2009/\u2009${setTokenCounts[set]}` : setTokenCounts[set]}
                                  </span>
                                )}
                              </button>
                              <button
                                onClick={e => openSetMenu(set, e)}
                                onContextMenu={e => openSetMenu(set, e)}
                                title="Set options"
                                aria-label="Set options"
                                className={`shrink-0 flex items-center justify-center w-5 h-5 rounded transition-opacity ${
                                  activeSet === set
                                    ? 'opacity-60 hover:opacity-100 text-[var(--color-figma-accent)]'
                                    : 'opacity-0 group-hover/sidebarset:opacity-60 hover:!opacity-100 text-[var(--color-figma-text-tertiary)]'
                                }`}
                              >
                                <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><circle cx="4" cy="1" r="0.9" /><circle cx="4" cy="4" r="0.9" /><circle cx="4" cy="7" r="0.9" /></svg>
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Context menu (sidebar mode) */}
            {tabMenuOpen && (
              <div
                ref={tabMenuRef}
                role="menu"
                className="fixed rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-lg z-50 py-1 min-w-[168px]"
                style={{ top: tabMenuPos.y, left: tabMenuPos.x }}
              >
                <button role="menuitem" onMouseDown={e => e.preventDefault()} onClick={() => { setActiveSet(tabMenuOpen); navigateTo('define', 'generators'); setTabMenuOpen(null); }} className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors">Generate tokens…</button>
                <div className="border-t border-[var(--color-figma-border)] my-1" />
                <button role="menuitem" onMouseDown={e => e.preventDefault()} onClick={() => openSetMetadata(tabMenuOpen)} className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors">Edit set info</button>
                <div className="border-t border-[var(--color-figma-border)] my-1" />
                <button role="menuitem" onMouseDown={e => e.preventDefault()} onClick={() => startRename(tabMenuOpen)} className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors">Rename</button>
                <button role="menuitem" onMouseDown={e => e.preventDefault()} onClick={() => handleDuplicateSet(tabMenuOpen)} className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors">Duplicate</button>
                <div className="border-t border-[var(--color-figma-border)] my-1" />
                <button role="menuitem" onMouseDown={e => e.preventDefault()} onClick={() => { startDelete(tabMenuOpen!); }} className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--color-figma-error)] hover:bg-[var(--color-figma-bg-hover)] transition-colors">Delete</button>
              </div>
            )}

            {/* Add Set */}
            <div className="shrink-0 border-t border-[var(--color-figma-border)] p-1">
              {creatingSet ? (
                <div className="flex flex-col gap-0.5">
                  <input
                    ref={newSetInputRef}
                    value={newSetName}
                    onChange={e => { setNewSetName(e.target.value); setNewSetError(''); }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleCreateSet();
                      if (e.key === 'Escape') { setCreatingSet(false); setNewSetName(''); setNewSetError(''); }
                    }}
                    onBlur={() => { if (!newSetName.trim()) { setCreatingSet(false); setNewSetName(''); setNewSetError(''); } }}
                    placeholder="name or folder/name"
                    aria-label="New set name"
                    className="w-full px-1.5 py-0.5 rounded text-[10px] bg-[var(--color-figma-bg)] border border-[var(--color-figma-accent)] text-[var(--color-figma-text)] outline-none"
                  />
                  {newSetError && <span className="text-[10px] text-red-500">{newSetError}</span>}
                </div>
              ) : (
                <button
                  onClick={() => { setCreatingSet(true); setNewSetName(''); setNewSetError(''); }}
                  className="w-full px-2 py-0.5 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] text-left"
                >
                  + Add Set
                </button>
              )}
            </div>
          </aside>
        )}

        {/* Main content column */}
        <div className="flex-1 flex flex-col overflow-hidden">
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
              effectiveTokens={effectiveTokens}
              lintViolations={lintViolations}
              cascadeDiff={cascadeDiff ?? null}
              validationIssues={validationIssues}
              validationSummary={validationSummary}
              validationLoading={validationLoading}
              validationError={validationError}
              validationLastRefreshed={validationLastRefreshed}
              validationIsStale={validationIsStale}
              refreshValidation={refreshValidation}
              historyFilterPath={historyFilterPath}
              setHistoryFilterPath={setHistoryFilterPath}
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
              paletteRecentlyTouched={paletteRecentlyTouched}
              crossSetRecents={crossSetRecents}
              starredTokens={starredTokens}
              onShowPasteModal={() => setShowPasteModal(true)}
              onShowScaffoldWizard={() => setShowScaffoldWizard(true)}
              onShowColorScaleGen={() => setShowColorScaleGen(true)}
              onShowGuidedSetup={() => setShowGuidedSetup(true)}
              serverUrlInput={serverUrlInput}
              setServerUrlInput={setServerUrlInput}
              connectResult={connectResult}
              setConnectResult={setConnectResult}
              advancedModeOverride={advancedModeOverride}
              setAdvancedModeOverride={setAdvancedModeOverride}
              undoMaxHistory={undoMaxHistory}
              setUndoMaxHistory={setUndoMaxHistory}
              showClearConfirm={showClearConfirm}
              setShowClearConfirm={setShowClearConfirm}
              clearConfirmText={clearConfirmText}
              setClearConfirmText={setClearConfirmText}
              handleClearAll={handleClearAll}
              clearing={clearing}
            />
          </div>
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

      {/* Create panel drawer */}
      {showCreatePanel && overflowPanel === null && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end overflow-hidden">
          <div
            className="absolute inset-0 bg-black/30 drawer-fade-in"
            onClick={() => setShowCreatePanel(null)}
          />
          <div className="relative bg-[var(--color-figma-bg)] rounded-t-xl shadow-2xl flex flex-col drawer-slide-up" style={{ height: '75%' }}>
            <div className="flex justify-center pt-2 pb-1 shrink-0">
              <div className="w-8 h-1 rounded-full bg-[var(--color-figma-border)]" />
            </div>
            <div className="flex-1 overflow-hidden">
              <CreatePanel
                serverUrl={serverUrl}
                activeSet={activeSet}
                allSets={sets}
                allTokensFlat={allTokensFlat}
                pathToSet={pathToSet}
                allGroupPaths={allGroupPaths}
                connected={connected}
                initialTab={showCreatePanel.tab}
                initialPath={showCreatePanel.initialPath}
                initialType={showCreatePanel.initialType}
                initialValue={showCreatePanel.initialValue}
                graphTemplates={GRAPH_TEMPLATES}
                onOpenGenerator={(template) => {
                  setShowCreatePanel(null);
                  setPendingGraphTemplate(template.id);
                  navigateTo('define', 'generators');
                }}
                onTokenCreated={(path) => {
                  setHighlightedToken(path);
                  setSuccessToast(`Created ${path}`);
                }}
                onRefresh={refreshAll}
                onClose={() => setShowCreatePanel(null)}
                availableFonts={availableFonts}
                fontWeightsByFamily={fontWeightsByFamily}
              />
            </div>
          </div>
        </div>
      )}

      {/* Token preview drawer (narrow windows only; wide windows use side panel) */}
      {!editingToken && previewingToken && overflowPanel === null && activeTopTab === 'define' && activeSubTab === 'tokens' && !useSidePanel && (
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

      {/* Set Switcher / Manage Sets */}
      {(showSetSwitcher || showManageSets) && (
        <SetSwitcher
          sets={sets}
          activeSet={activeSet}
          onSelect={(set) => {
            setActiveSet(set);
            navigateTo('define', 'tokens');
          }}
          onClose={() => { setShowSetSwitcher(false); setShowManageSets(false); }}
          initialMode={showManageSets ? 'manage' : 'switch'}
          onRename={startRename}
          onDuplicate={handleDuplicateSet}
          onDelete={startDelete}
          onReorder={handleReorderSet}
          onReorderFull={handleReorderSetFull}
          onCreateSet={createSetByName}
          onEditInfo={(set) => { setShowSetSwitcher(false); setShowManageSets(false); openSetMetadata(set); }}
          setTokenCounts={setTokenCounts}
          setDescriptions={setDescriptions}
          dimensions={dimensions}
          onBulkDelete={handleBulkDeleteSets}
          onBulkDuplicate={handleBulkDuplicateSets}
          onBulkMoveToFolder={handleBulkMoveToFolder}
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

      {/* Quick Start Dialog (from empty state) */}
      {showScaffoldWizard && (
        <QuickStartDialog
          serverUrl={serverUrl}
          activeSet={activeSet}
          allSets={sets}
          onClose={() => setShowScaffoldWizard(false)}
          onConfirm={(firstPath) => { setShowScaffoldWizard(false); refreshAll(); if (firstPath) setPendingHighlight(firstPath); }}
        />
      )}

      {/* First-run welcome prompt */}
      {showWelcome && (
        <WelcomePrompt
          connected={connected}
          onStartSetup={() => { lsSet(STORAGE_KEYS.FIRST_RUN_DONE, '1'); setShowWelcome(false); setShowGuidedSetup(true); }}
          onDismiss={() => { lsSet(STORAGE_KEYS.FIRST_RUN_DONE, '1'); setShowWelcome(false); }}
        />
      )}

      {/* Guided Setup Wizard */}
      {showGuidedSetup && (
        <QuickStartWizard
          serverUrl={serverUrl}
          activeSet={activeSet}
          allSets={sets}
          connected={connected}
          onClose={() => setShowGuidedSetup(false)}
          onComplete={() => { setShowGuidedSetup(false); refreshAll(); }}
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
