import { useState, useEffect, useCallback, useRef, useMemo, Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { TokenList } from './components/TokenList';
import { TokenEditor } from './components/TokenEditor';
import { TokenDetailPreview } from './components/TokenDetailPreview';
import { ThemeManager } from './components/ThemeManager';
import { ThemeCompare } from './components/ThemeCompare';
// ResolverPanel is only accessible via ThemeManager's advanced mode toggle
import { PublishPanel } from './components/PublishPanel';
import { ImportPanel } from './components/ImportPanel';
import { AnalyticsPanel } from './components/AnalyticsPanel';
import { SelectionInspector } from './components/SelectionInspector';
import { ToastStack } from './components/ToastStack';
import { NotificationHistory } from './components/NotificationHistory';
import { useToastStack } from './hooks/useToastStack';
import { ConfirmModal } from './components/ConfirmModal';
import { EmptyState } from './components/EmptyState';
import { PasteTokensModal } from './components/PasteTokensModal';
import { QuickStartDialog } from './components/QuickStartDialog';
import { QuickStartWizard } from './components/QuickStartWizard';
import { WelcomePrompt } from './components/WelcomePrompt';
import { ColorScaleGenerator } from './components/ColorScaleGenerator';
import { CommandPalette } from './components/CommandPalette';
import type { Command, TokenEntry } from './components/CommandPalette';
import { SetSwitcher } from './components/SetSwitcher';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { QuickApplyPicker } from './components/QuickApplyPicker';
import { SettingsPanel } from './components/SettingsPanel';
import { PreviewPanel } from './components/PreviewPanel';
import { BindingAuditPanel } from './components/BindingAuditPanel';
import { GraphPanel, GRAPH_TEMPLATES } from './components/GraphPanel';
import { TokenFlowPanel } from './components/TokenFlowPanel';
import { ExportPanel } from './components/ExportPanel';
import { HistoryPanel } from './components/HistoryPanel';
import { useServerConnection } from './hooks/useServerConnection';
import { useServerEvents } from './hooks/useServerEvents';
import { useTokens, fetchAllTokensFlat } from './hooks/useTokens';
import type { TokenNode } from './hooks/useTokens';
import { useSelection } from './hooks/useSelection';
import { useUndo } from './hooks/useUndo';
import { useLint } from './hooks/useLint';
import { useGenerators } from './hooks/useGenerators';
import { usePreviewSplit } from './hooks/usePreviewSplit';
import { useAvailableFonts } from './hooks/useAvailableFonts';
import { useWindowExpand } from './hooks/useWindowExpand';
import { useHeatmap } from './hooks/useHeatmap';
import { useTokenNavigation } from './hooks/useTokenNavigation';
import { useThemeSwitcher } from './hooks/useThemeSwitcher';
import { useResolvers } from './hooks/useResolvers';
import { useFigmaSync } from './hooks/useFigmaSync';
import { useSetRename } from './hooks/useSetRename';
import { useSetDelete } from './hooks/useSetDelete';
import { useSetDuplicate } from './hooks/useSetDuplicate';
import { useSetMergeSplit } from './hooks/useSetMergeSplit';
import { useSetMetadata } from './hooks/useSetMetadata';
import { useModalVisibility } from './hooks/useModalVisibility';
import { useTokenDataLoading } from './hooks/useTokenDataLoading';
import { useSetTabs } from './hooks/useSetTabs';
import { useRecentOperations } from './hooks/useRecentOperations';
import { useLintConfig } from './hooks/useLintConfig';
import type { SyncCompleteMessage, TokenMapEntry } from '../shared/types';
import { resolveAllAliases, isAlias } from '../shared/resolveAlias';
import { adaptShortcut } from './shared/utils';
import { apiFetch, isNetworkError } from './shared/apiFetch';
import { STORAGE_KEYS, STORAGE_PREFIXES, lsGet, lsSet, lsRemove, lsGetJson, lsSetJson, lsClearByPrefix } from './shared/storage';
import { buildTreeByType } from './components/tokenListUtils';
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

class ErrorBoundary extends Component<{ children: ReactNode; panelName?: string; onReset?: () => void }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error(`[ErrorBoundary${this.props.panelName ? `:${this.props.panelName}` : ''}]`, error, info); }
  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-6 gap-3 text-center">
          <p className="text-[11px] font-medium text-[var(--color-figma-error)]">
            {this.props.panelName ? `${this.props.panelName} crashed` : 'Something went wrong'}
          </p>
          <p className="text-[10px] text-[var(--color-figma-text-secondary)] font-mono break-all max-w-xs">
            {(this.state.error as Error).message}
          </p>
          <div className="flex gap-2">
            {this.props.onReset && (
              <button
                onClick={() => { this.setState({ error: null }); this.props.onReset?.(); }}
                className="px-3 py-1.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] font-medium hover:bg-[var(--color-figma-bg-hover)]"
              >
                Dismiss
              </button>
            )}
            <button
              onClick={() => window.location.reload()}
              className="px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)]"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function useSyncBindings(serverUrl: string, connected: boolean, onNetworkError?: () => void) {
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<{ processed: number; total: number } | null>(null);
  const [result, setResult] = useState<SyncCompleteMessage | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data?.pluginMessage;
      if (!msg) return;
      if (msg.type === 'sync-progress') {
        setProgress({ processed: msg.processed, total: msg.total });
      } else if (msg.type === 'sync-complete') {
        setSyncing(false);
        setProgress(null);
        setResult(msg as SyncCompleteMessage);
        clearTimer.current = setTimeout(() => setResult(null), 3000);
      }
    };
    window.addEventListener('message', handler);
    return () => {
      window.removeEventListener('message', handler);
      if (clearTimer.current) clearTimeout(clearTimer.current);
    };
  }, []);

  const sync = useCallback(async (scope: 'page' | 'selection') => {
    if (!connected || syncing) return;
    setSyncing(true);
    setSyncError(null);
    setResult(null);
    try {
      const rawMap = await fetchAllTokensFlat(serverUrl);
      const tokenMap = resolveAllAliases(rawMap);
      parent.postMessage({ pluginMessage: { type: 'sync-bindings', tokenMap, scope } }, '*');
    } catch (err) {
      console.error('Failed to fetch tokens for sync:', err);
      const isNetworkErr = isNetworkError(err);
      if (isNetworkErr) onNetworkError?.();
      const friendly = isNetworkErr
        ? 'Could not reach the token server. Check that it is running.'
        : 'Could not load tokens. Restart the server and try again.';
      setSyncError(friendly);
      setSyncing(false);
    }
  }, [serverUrl, connected, syncing, onNetworkError]);

  return { syncing, syncProgress: progress, syncResult: result, syncError, sync };
}

type Tab = 'tokens' | 'inspect' | 'graph' | 'publish';
type TopTab = 'define' | 'apply' | 'ship';
type DefineSubTab = 'tokens' | 'themes' | 'generators';
type ApplySubTab = 'inspect' | 'audit' | 'dependencies';
type ShipSubTab = 'publish' | 'export' | 'validation' | 'history';
type SubTab = DefineSubTab | ApplySubTab | ShipSubTab;

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

const TOP_TABS: { id: TopTab; label: string; subTabs: { id: SubTab; label: string }[] }[] = [
  { id: 'define', label: 'Define', subTabs: [
    { id: 'tokens', label: 'Tokens' },
    { id: 'themes', label: 'Themes' },
    { id: 'generators', label: 'Generators' },
  ]},
  { id: 'apply', label: 'Apply', subTabs: [
    { id: 'inspect', label: 'Inspect' },
    { id: 'audit', label: 'Binding Audit' },
    { id: 'dependencies', label: 'Dependencies' },
  ]},
  { id: 'ship', label: 'Ship', subTabs: [
    { id: 'publish', label: 'Publish' },
    { id: 'export', label: 'Export' },
    { id: 'validation', label: 'Validation' },
    { id: 'history', label: 'History' },
  ]},
];

const DEFAULT_SUB_TABS: Record<TopTab, SubTab> = { define: 'tokens', apply: 'inspect', ship: 'publish' };
const SUB_TAB_STORAGE: Record<TopTab, string> = { define: STORAGE_KEYS.ACTIVE_SUB_TAB_DEFINE, apply: STORAGE_KEYS.ACTIVE_SUB_TAB_APPLY, ship: STORAGE_KEYS.ACTIVE_SUB_TAB_SHIP };

type OverflowPanel = 'import' | 'settings' | null;

const RESIZE_MIN_W = 320;
const RESIZE_MIN_H = 400;
const RESIZE_MAX_W = 900;
const RESIZE_MAX_H = 900;

function useWindowResize() {
  const dragState = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      startW: window.innerWidth,
      startH: window.innerHeight,
    };

    const onMove = (ev: MouseEvent) => {
      if (!dragState.current) return;
      const { startX, startY, startW, startH } = dragState.current;
      const w = Math.min(RESIZE_MAX_W, Math.max(RESIZE_MIN_W, startW + (ev.clientX - startX)));
      const h = Math.min(RESIZE_MAX_H, Math.max(RESIZE_MIN_H, startH + (ev.clientY - startY)));
      parent.postMessage({ pluginMessage: { type: 'resize', width: Math.round(w), height: Math.round(h) } }, '*');
    };

    const onUp = () => {
      dragState.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  return onMouseDown;
}

export function App() {
  const [activeTab, setActiveTabState] = useState<Tab>(() => {
    const stored = lsGet(STORAGE_KEYS.ACTIVE_TAB);
    return (stored && TABS.some(t => t.id === stored) ? stored : 'tokens') as Tab;
  });
  const setActiveTab = (tab: Tab) => {
    lsSet(STORAGE_KEYS.ACTIVE_TAB, tab);
    setActiveTabState(tab);
  };
  const [overflowPanel, setOverflowPanel] = useState<OverflowPanel>(null);

  // Two-tier navigation state
  const [activeTopTab, setActiveTopTabState] = useState<TopTab>(() => {
    const stored = lsGet(STORAGE_KEYS.ACTIVE_TOP_TAB);
    return (stored && TOP_TABS.some(t => t.id === stored) ? stored : 'define') as TopTab;
  });
  const [activeSubTab, setActiveSubTabState] = useState<SubTab>(() => {
    const topTab = (lsGet(STORAGE_KEYS.ACTIVE_TOP_TAB) || 'define') as TopTab;
    const storageKey = SUB_TAB_STORAGE[topTab] || SUB_TAB_STORAGE.define;
    const stored = lsGet(storageKey);
    const topDef = TOP_TABS.find(t => t.id === topTab);
    return (stored && topDef?.subTabs.some(s => s.id === stored) ? stored : DEFAULT_SUB_TABS[topTab]) as SubTab;
  });
  const navigateTo = useCallback((topTab: TopTab, subTab?: SubTab) => {
    const topDef = TOP_TABS.find(t => t.id === topTab)!;
    const resolvedSub = subTab && topDef.subTabs.some(s => s.id === subTab)
      ? subTab
      : (lsGet(SUB_TAB_STORAGE[topTab]) as SubTab | null) ?? DEFAULT_SUB_TABS[topTab];
    lsSet(STORAGE_KEYS.ACTIVE_TOP_TAB, topTab);
    lsSet(SUB_TAB_STORAGE[topTab], resolvedSub);
    setActiveTopTabState(topTab);
    setActiveSubTabState(resolvedSub);
    setOverflowPanel(null);
  }, []);
  const setSubTab = useCallback((subTab: SubTab) => {
    lsSet(SUB_TAB_STORAGE[activeTopTab], subTab);
    setActiveSubTabState(subTab);
    setOverflowPanel(null);
  }, [activeTopTab]);
  const { showPreviewSplit, setShowPreviewSplit, splitRatio, splitValueNow, splitContainerRef, handleSplitDragStart, handleSplitKeyDown } = usePreviewSplit();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingToken, setEditingToken] = useState<{ path: string; name?: string; set: string; isCreate?: boolean; initialType?: string; initialValue?: string } | null>(null);
  const [previewingToken, setPreviewingToken] = useState<{ path: string; name?: string; set: string } | null>(null);
  const { connected, checking, serverUrl, getDisconnectSignal, markDisconnected, updateServerUrlAndConnect, retryConnection } = useServerConnection();
  const { sets, setSets, activeSet, setActiveSet, tokens, setTokenCounts, setDescriptions, setCollectionNames, setModeNames, refreshTokens } = useTokens(serverUrl, connected, markDisconnected, getDisconnectSignal);
  const { selectedNodes } = useSelection();
  const availableFonts = useAvailableFonts();
  const { syncing, syncProgress, syncResult, syncError, sync } = useSyncBindings(serverUrl, connected, markDisconnected);
  const { allTokensFlat, pathToSet, perSetFlat, filteredSetCount, setFilteredSetCount, syncSnapshot } = useTokenDataLoading({ serverUrl, connected, tokens, markDisconnected });
  const handleAliasNotFound = useCallback((aliasPath: string) => {
    setErrorToast(`Alias target not found: ${aliasPath}`);
  }, []);
  const { highlightedToken, setHighlightedToken, pendingHighlight, setPendingHighlight, setPendingHighlightForSet, createFromEmpty, setCreateFromEmpty, handleNavigateToAlias, handleNavigateBack, navHistory } = useTokenNavigation(pathToSet, activeSet, setActiveSet, tokens, handleAliasNotFound);
  const [serverUrlInput, setServerUrlInput] = useState(serverUrl);
  const [connectResult, setConnectResult] = useState<'ok' | 'fail' | null>(null);
  const { showClearConfirm, setShowClearConfirm, showPasteModal, setShowPasteModal, showScaffoldWizard, setShowScaffoldWizard, showGuidedSetup, setShowGuidedSetup, showColorScaleGen, setShowColorScaleGen, showCommandPalette, setShowCommandPalette, showKeyboardShortcuts, setShowKeyboardShortcuts, showQuickApply, setShowQuickApply, showSetSwitcher, setShowSetSwitcher } = useModalVisibility();
  const [showWelcome, setShowWelcome] = useState(() => !lsGet(STORAGE_KEYS.FIRST_RUN_DONE));
  const [clearConfirmText, setClearConfirmText] = useState('');
  const [clearing, setClearing] = useState(false);
  const [undoMaxHistory, setUndoMaxHistory] = useState(() => lsGetJson<number>(STORAGE_KEYS.UNDO_MAX_HISTORY, 20));
  const { toasts: toastStack, dismiss: dismissStackToast, pushSuccess: setSuccessToast, pushError: setErrorToast, pushAction: pushActionToast, history: notificationHistory, clearHistory: clearNotificationHistory } = useToastStack();
  const [showNotificationHistory, setShowNotificationHistory] = useState(false);
  const { toastVisible, slot: undoSlot, canUndo, pushUndo, executeUndo, executeRedo, dismissToast, canRedo, redoSlot, undoCount, undoDescriptions } = useUndo(undoMaxHistory, setErrorToast);
  const onGeneratorError = useCallback(({ generatorId, message }: { generatorId?: string; message: string }) => {
    const label = generatorId ? `Generator "${generatorId}" failed` : 'Generator auto-run failed';
    setErrorToast(`${label}: ${message}`);
  }, []);
  const onResizeHandleMouseDown = useWindowResize();
  const { isExpanded, toggleExpand } = useWindowExpand();
  const [themesView, setThemesView] = useState<'manage' | 'compare'>('manage');
  const [pendingGraphTemplate, setPendingGraphTemplate] = useState<string | null>(null);
  const [pendingGraphFromGroup, setPendingGraphFromGroup] = useState<{ groupPath: string; tokenType: string | null } | null>(null);
  const [focusGeneratorId, setFocusGeneratorId] = useState<string | null>(null);
  const [triggerCreateToken, setTriggerCreateToken] = useState(0);
  const [lintKey, setLintKey] = useState(0);
  const lintViolations = useLint(serverUrl, activeSet, connected, lintKey);
  const lintConfig = useLintConfig(serverUrl, connected);
  const { generators, refreshGenerators, generatorsBySource, derivedTokenPaths } = useGenerators(serverUrl, connected);
  const refreshAll = useCallback(() => { refreshTokens(); setLintKey(k => k + 1); refreshGenerators(); }, [refreshTokens, refreshGenerators]);

  // Track external file change refreshes so we can show a diff toast
  const externalRefreshPendingRef = useRef(false);
  const prevAllTokensFlatRef = useRef<Record<string, TokenMapEntry>>({});
  const refreshAllExternal = useCallback(() => {
    prevAllTokensFlatRef.current = allTokensFlat;
    externalRefreshPendingRef.current = true;
    refreshAll();
  }, [refreshAll, allTokensFlat]);
  useServerEvents(serverUrl, connected, onGeneratorError, refreshAllExternal);

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
    refreshAll();
  }, [refreshAll, setHighlightedToken]);
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
  const [validateKey, setValidateKey] = useState(0);
  const [analyticsIssueCount, setAnalyticsIssueCount] = useState<number | null>(null);
  const [showIssuesOnly, setShowIssuesOnly] = useState(false);
  const [showValidationReturn, setShowValidationReturn] = useState(false);
  const [historyFilterPath, setHistoryFilterPath] = useState<string | null>(null);
  const [flowPanelInitialPath, setFlowPanelInitialPath] = useState<string | null>(null);
  const [tokenUsageCounts, setTokenUsageCounts] = useState<Record<string, number>>({});
  const menuRef = useRef<HTMLDivElement>(null);
  const [windowWidth, setWindowWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const [gitHasChanges, setGitHasChanges] = useState(false);
  useEffect(() => {
    if (!connected) { setGitHasChanges(false); return; }
    let cancelled = false;
    const check = async () => {
      try {
        const data = await apiFetch<{ status?: { isClean?: boolean } }>(`${serverUrl}/api/sync/status`, {
          signal: AbortSignal.any([AbortSignal.timeout(5000), getDisconnectSignal()]),
        });
        if (!cancelled) {
          setGitHasChanges(data.status != null && !data.status.isClean);
        }
      } catch (err) { console.warn('[App] git status check failed:', err); }
    };
    check();
    const interval = setInterval(check, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [connected, serverUrl]);
  const useSidePanel = windowWidth > 480
    && !!(editingToken || previewingToken)
    && overflowPanel === null
    && activeTopTab === 'define' && activeSubTab === 'tokens'
    && (tokens.length > 0 || createFromEmpty);
  const isNarrow = windowWidth <= 360;

  // Theme switcher state (multi-dimensional)
  const { dimensions, setDimensions, activeThemes, setActiveThemes, previewThemes, setPreviewThemes, openDimDropdown, setOpenDimDropdown, dimBarExpanded, setDimBarExpanded, dimDropdownRef, themedAllTokensFlat: themeOnlyTokensFlat, themesError, retryThemes } = useThemeSwitcher(serverUrl, connected, tokens, allTokensFlat, pathToSet);

  // DTCG Resolver (v2025.10) — contextual token resolution
  const resolverState = useResolvers(serverUrl, connected);

  // When a resolver is active and has resolved tokens, use those; otherwise fall back to themed tokens
  const themedAllTokensFlat = useMemo(() => {
    if (resolverState.activeResolver && resolverState.resolvedTokens && Object.keys(resolverState.resolvedTokens).length > 0) {
      return resolverState.resolvedTokens;
    }
    return themeOnlyTokensFlat;
  }, [resolverState.activeResolver, resolverState.resolvedTokens, themeOnlyTokensFlat]);

  // Compute per-set theme status from active dimension options (enabled > source > disabled)
  const setThemeStatusMap = useMemo((): Record<string, 'enabled' | 'source' | 'disabled'> => {
    const result: Record<string, 'enabled' | 'source' | 'disabled'> = {};
    if (dimensions.length === 0) return result;
    for (const dim of dimensions) {
      const activeOptionName = activeThemes[dim.id];
      if (!activeOptionName) continue;
      const option = dim.options.find(o => o.name === activeOptionName);
      if (!option) continue;
      for (const [setName, status] of Object.entries(option.sets)) {
        const existing = result[setName];
        if (!existing || status === 'enabled' || (status === 'source' && existing === 'disabled')) {
          result[setName] = status as 'enabled' | 'source' | 'disabled';
        }
      }
    }
    return result;
  }, [dimensions, activeThemes]);

  // Set tab management (drag, context menu, overflow, new-set form)
  const { dragSetName, dragOverSetName, tabMenuOpen, setTabMenuOpen, tabMenuPos, tabMenuRef, creatingSet, setCreatingSet, newSetName, setNewSetName, newSetError, setNewSetError, newSetInputRef, setTabsScrollRef, setTabsOverflow, cascadeDiff, openSetMenu, handleSetDragStart, handleSetDragOver, handleSetDragEnd, handleSetDrop, handleReorderSet, handleCreateSet, scrollSetTabs, checkSetTabsOverflow } = useSetTabs({ serverUrl, connected, getDisconnectSignal, sets, setSets, activeSet, refreshTokens, setSuccessToast, setErrorToast, markDisconnected, perSetFlat, allTokensFlat, activeThemes });

  // Group sync + scope state
  const { syncGroupPending, setSyncGroupPending, syncGroupStylesPending, setSyncGroupStylesPending, groupScopesPath, setGroupScopesPath, groupScopesSelected, setGroupScopesSelected, groupScopesApplying, groupScopesError, setGroupScopesError, groupScopesProgress, handleSyncGroup, handleSyncGroupStyles, syncGroupStylesError, syncGroupError, handleApplyGroupScopes } = useFigmaSync(serverUrl, connected, pathToSet, setCollectionNames, setModeNames, activeSet);

  useEffect(() => {
    if (syncGroupStylesError) setErrorToast(syncGroupStylesError);
  }, [syncGroupStylesError]);

  useEffect(() => {
    if (syncGroupError) setErrorToast(syncGroupError);
  }, [syncGroupError]);

  // Set management hooks
  const { editingMetadataSet, metadataDescription, setMetadataDescription, metadataCollectionName, setMetadataCollectionName, metadataModeName, setMetadataModeName, closeSetMetadata, openSetMetadata, handleSaveMetadata } = useSetMetadata({ serverUrl, connected, setDescriptions, setCollectionNames, setModeNames, refreshTokens, setTabMenuOpen, onError: setErrorToast });
  const { deletingSet, startDelete, cancelDelete, handleDeleteSet } = useSetDelete({ serverUrl, connected, getDisconnectSignal, sets, setSets, activeSet, setActiveSet, refreshTokens, setSuccessToast, setErrorToast, markDisconnected, setTabMenuOpen });
  const { renamingSet, renameValue, setRenameValue, renameError, setRenameError, renameInputRef, startRename, cancelRename, handleRenameConfirm } = useSetRename({ serverUrl, connected, getDisconnectSignal, activeSet, setActiveSet, refreshTokens, setSuccessToast, markDisconnected, setTabMenuOpen });
  const { handleDuplicateSet } = useSetDuplicate({ serverUrl, connected, getDisconnectSignal, sets, refreshTokens, setSuccessToast, setErrorToast, markDisconnected, pushUndo, setTabMenuOpen });
  const { mergingSet, mergeTargetSet, mergeConflicts, mergeResolutions, mergeChecked, mergeLoading, openMergeDialog, closeMergeDialog, changeMergeTarget, setMergeResolutions, handleCheckMergeConflicts, handleConfirmMerge, splittingSet, splitPreview, splitDeleteOriginal, splitLoading, openSplitDialog, closeSplitDialog, setSplitDeleteOriginal, handleConfirmSplit } = useSetMergeSplit({ serverUrl, connected, sets, activeSet, setActiveSet, refreshTokens, setSuccessToast, setErrorToast, pushUndo, setTabMenuOpen });


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


  const { heatmapResult, heatmapLoading, heatmapError, heatmapScope, setHeatmapScope, triggerHeatmapScan, cancelHeatmapScan } = useHeatmap();


  // Listen for token-usage-map results; re-scan after apply/sync/remap changes
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data?.pluginMessage;
      if (msg?.type === 'token-usage-map') {
        setTokenUsageCounts(msg.usageMap ?? {});
      } else if (msg?.type === 'applied-to-selection' || msg?.type === 'sync-complete' || msg?.type === 'remap-complete') {
        parent.postMessage({ pluginMessage: { type: 'scan-token-usage' } }, '*');
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  useEffect(() => {
    if (activeTopTab === 'define' && activeSubTab === 'tokens' && tokens.length > 0) {
      parent.postMessage({ pluginMessage: { type: 'scan-token-usage' } }, '*');
    }
  }, [activeTopTab, activeSubTab, tokens.length]);

  // Close overflow menu on Escape key (not on outside click — accidental mis-clicks dismiss it)
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
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
      setShowCommandPalette(v => !v);
    }
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 't') {
      e.preventDefault();
      navigateTo('apply', 'inspect');
      setTriggerCreateToken(n => n + 1);
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
      setShowSetSwitcher(v => !v);
    }
    if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      setShowKeyboardShortcuts(v => !v);
    }
    if ((e.metaKey || e.ctrlKey) && e.key === ',') {
      e.preventDefault();
      openOverflowPanel('settings');
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
    for (const key of [STORAGE_KEYS.ACTIVE_TAB, STORAGE_KEYS.ACTIVE_SET, STORAGE_KEYS.ANALYTICS_CANONICAL, STORAGE_KEYS.THEME_CARD_ORDER, STORAGE_KEYS.IMPORT_TARGET_SET, STORAGE_KEYS.ACTIVE_TOP_TAB, STORAGE_KEYS.ACTIVE_SUB_TAB_DEFINE, STORAGE_KEYS.ACTIVE_SUB_TAB_APPLY, STORAGE_KEYS.ACTIVE_SUB_TAB_SHIP]) {
      lsRemove(key);
    }
    // Clear per-set sort/filter keys
    lsClearByPrefix(STORAGE_PREFIXES.TOKEN_SORT, STORAGE_PREFIXES.TOKEN_TYPE_FILTER);
    setClearing(false);
    setShowClearConfirm(false);
    setClearConfirmText('');
    setOverflowPanel(null);
    setActiveTabState('tokens');
    setActiveTopTabState('define');
    setActiveSubTabState('tokens');
    refreshTokens();
  };

  const openOverflowPanel = useCallback((panel: OverflowPanel) => {
    setMenuOpen(false);
    setOverflowPanel(panel);
  }, []);

  const commands: Command[] = useMemo(() => {
    const goToTokens = () => { navigateTo('define', 'tokens'); setEditingToken(null); };
    const cmds: Command[] = [
      {
        id: 'new-token',
        label: 'Create new token',
        description: `In set: ${activeSet}`,
        category: 'Tokens',
        shortcut: adaptShortcut('⌘T'),
        handler: () => { goToTokens(); },
      },
      {
        id: 'switch-set',
        label: 'Switch set\u2026',
        description: `${sets.length} set${sets.length !== 1 ? 's' : ''} available`,
        category: 'Sets',
        shortcut: adaptShortcut('⌘⇧S'),
        handler: () => setShowSetSwitcher(true),
      },
      {
        id: 'paste-tokens',
        label: 'Paste tokens',
        description: 'Create tokens from JSON, CSS vars, CSV, or Tailwind config',
        category: 'Tokens',
        shortcut: adaptShortcut('⌘⇧V'),
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
        shortcut: adaptShortcut('⌘⇧A'),
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
        id: 'heatmap',
        label: 'Canvas Heatmap',
        description: 'Token adoption overlay on the canvas',
        category: 'Navigation',
        handler: () => { navigateTo('apply', 'audit'); triggerHeatmapScan(); },
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
        id: 'validate',
        label: 'Validate All Tokens',
        description: 'Run cross-set validation for broken references, circular refs, and more',
        category: 'Tokens',
        handler: () => { navigateTo('ship', 'validation'); setValidateKey(k => k + 1); },
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
        category: 'Generate',
        handler: () => {
          navigateTo('define', 'generators');
          setPendingGraphTemplate(t.id);
        },
      })),
      ...sets.map(s => ({
        id: `switch-set-${s}`,
        label: `Switch to Set: ${s}`,
        description: `${setTokenCounts[s] ?? 0} tokens`,
        category: 'Sets',
        handler: () => { setActiveSet(s); goToTokens(); },
      })),
      {
        id: 'guided-setup',
        label: 'Guided Setup',
        description: 'Step-by-step wizard: generate primitives, map semantics, set up themes',
        category: 'Help',
        handler: () => setShowGuidedSetup(true),
      },
      {
        id: 'keyboard-shortcuts',
        label: 'Keyboard shortcuts\u2026',
        description: 'View all keyboard shortcuts',
        category: 'Help',
        shortcut: '?',
        handler: () => setShowKeyboardShortcuts(true),
      },
      // Server-side undo: recent operations with rollback
      ...recentOperations
        .filter(op => !op.rolledBack)
        .slice(0, 5)
        .map((op, i) => ({
          id: `undo-op-${op.id}`,
          label: i === 0 ? `Undo: ${op.description}` : `Rollback: ${op.description}`,
          description: `${op.affectedPaths.length} path(s) \u00b7 ${op.setName} \u00b7 ${timeAgo(op.timestamp)}`,
          category: 'Undo',
          handler: () => handleRollback(op.id),
        })),
      // Local redo: most recent item from the client-side future stack
      ...(canRedo && redoSlot ? [{
        id: 'redo-local',
        label: `Redo: ${redoSlot.description}`,
        description: 'Re-apply the last undone action',
        category: 'Undo',
        shortcut: '⇧⌘Z',
        handler: executeRedo,
      }] : []),
      // Server-side redo: rolled-back operations that can be re-applied (most recent first)
      ...[...redoableItems].reverse().slice(0, 5).map((item, i) => ({
        id: `redo-op-${item.origOpId}`,
        label: i === 0 && !canRedo ? `Redo: ${item.description}` : `Re-apply: ${item.description}`,
        description: 'Re-apply a rolled-back server operation',
        category: 'Undo',
        handler: () => handleServerRedo(item.origOpId),
      })),
    ];
    return cmds;
  }, [activeSet, sets, setTokenCounts, openOverflowPanel, navigateTo, triggerHeatmapScan, recentOperations, handleRollback, selectedNodes, canRedo, redoSlot, executeRedo, redoableItems, handleServerRedo]);

  // Flat token list for command palette token search mode
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

  return (
    <div className="relative flex flex-col h-screen">
      {/* Connection status — only shown when not connected */}
      {!connected && (
        <div className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] ${checking ? 'bg-[var(--color-figma-text-secondary)]/5 text-[var(--color-figma-text-secondary)]' : 'bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)]'}`}>
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
                onClick={() => { setOverflowPanel('settings'); setConnectResult(null); }}
                className="underline underline-offset-2 hover:opacity-70 transition-opacity shrink-0"
              >
                Change URL
              </button>
            </>
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
            {tab.id === 'ship' && gitHasChanges && !(activeTopTab === 'ship' && overflowPanel === null) && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-400 border border-[var(--color-figma-bg)]" aria-label="Uncommitted changes" />
            )}
          </button>
        ))}

        {/* Issues filter toggle */}
        <button
          onClick={() => { setShowIssuesOnly(v => !v); if (activeTopTab !== 'define' || activeSubTab !== 'tokens') navigateTo('define', 'tokens'); }}
          className={`relative flex items-center justify-center w-7 h-7 ml-auto mr-0.5 my-1 rounded transition-colors ${
            showIssuesOnly
              ? 'bg-[var(--color-figma-accent)] text-white'
              : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]'
          }`}
          title="Filter tokens with validation issues"
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

        {/* Preview split-view toggle */}
        <button
          onClick={() => { setShowPreviewSplit(v => !v); setOverflowPanel(null); }}
          className={`flex items-center justify-center w-7 h-7 mr-0.5 my-1 rounded transition-colors ${
            showPreviewSplit
              ? 'bg-[var(--color-figma-accent)] text-white'
              : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]'
          }`}
          title="Preview: split-view with live token preview"
          aria-label="Toggle preview split view"
          aria-pressed={showPreviewSplit}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        </button>

        {/* Command palette trigger */}
        <button
          onClick={() => setShowCommandPalette(v => !v)}
          className="flex items-center gap-1 px-2 py-1 mr-1 my-1 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] transition-colors text-[10px]"
          title={`Command palette (${adaptShortcut('⌘K')})`}
          aria-label="Open command palette"
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="4.5" cy="4.5" r="3.5"/>
            <path d="M8 8l2 2"/>
          </svg>
          <span className="opacity-50">{adaptShortcut('⌘K')}</span>
        </button>

        {/* Second screen / expand toggle */}
        <button
          onClick={toggleExpand}
          className={`flex items-center justify-center w-7 h-7 mr-0.5 my-1 rounded transition-colors ${
            isExpanded
              ? 'text-[var(--color-figma-text)] bg-[var(--color-figma-bg-hover)]'
              : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]'
          }`}
          title={isExpanded ? 'Restore window size' : 'Expand to second screen'}
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

        {/* Heatmap toggle */}
        <button
          onClick={() => {
            if (activeTopTab === 'apply' && activeSubTab === 'audit') {
              navigateTo('apply', 'inspect');
            } else {
              navigateTo('apply', 'audit');
              triggerHeatmapScan();
            }
          }}
          className={`flex items-center justify-center w-7 h-7 mr-0.5 my-1 rounded transition-colors ${
            activeTopTab === 'apply' && activeSubTab === 'audit'
              ? 'bg-[var(--color-figma-accent)] text-white'
              : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]'
          }`}
          title="Binding audit: coverage and suggestions"
          aria-label="Toggle binding audit"
          aria-pressed={activeTopTab === 'apply' && activeSubTab === 'audit'}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" rx="1"/>
            <rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/>
            <rect x="14" y="14" width="7" height="7" rx="1"/>
          </svg>
        </button>

        {/* Notification history */}
        <div className="relative">
          <button
            onClick={() => setShowNotificationHistory(v => !v)}
            className={`relative flex items-center justify-center w-7 h-7 mr-0.5 my-1 rounded transition-colors ${
              showNotificationHistory
                ? 'bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text)]'
                : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]'
            }`}
            title="Notification history"
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
          {showNotificationHistory && (
            <NotificationHistory
              history={notificationHistory}
              onClear={clearNotificationHistory}
              onClose={() => setShowNotificationHistory(false)}
            />
          )}
        </div>

        {/* Server connection indicator */}
        <button
          onClick={() => {
            if (!connected) {
              retryConnection();
            } else {
              setOverflowPanel('settings');
              setConnectResult(null);
            }
          }}
          className="flex items-center justify-center w-7 h-7 mr-0.5 my-1 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
          title={checking ? 'Connecting…' : connected ? `Connected to ${serverUrl}` : `Cannot reach ${serverUrl} — click to retry`}
          aria-label={checking ? 'Connecting to server' : connected ? 'Server connected' : 'Server disconnected — click to retry'}
        >
          <span className={`w-2 h-2 rounded-full ${checking ? 'bg-[var(--color-figma-text-secondary)] animate-pulse' : connected ? 'bg-green-500' : 'bg-[var(--color-figma-error)]'}`} />
        </button>

        {/* Overflow menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(v => !v)}
            className={`relative flex items-center justify-center w-7 h-7 mr-1 my-1 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] transition-colors ${menuOpen ? 'bg-[var(--color-figma-bg-hover)]' : ''}`}
            title={connected ? 'More actions' : 'More actions (server disconnected)'}
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

          {menuOpen && (
            <div className="absolute right-1 top-full mt-0.5 w-40 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-lg z-50" role="menu">
              <button
                role="menuitem"
                onClick={() => { setShowPasteModal(true); setMenuOpen(false); }}
                className="w-full text-left px-3 py-2 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Paste tokens <span className="text-[10px] text-[var(--color-figma-text-secondary)] ml-1">{adaptShortcut('⌘⇧V')}</span>
              </button>
              <button
                role="menuitem"
                onClick={() => openOverflowPanel('import')}
                className="w-full text-left px-3 py-2 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Import
              </button>
              <button
                role="menuitem"
                onClick={() => { setMenuOpen(false); navigateTo('ship', 'export'); }}
                className="w-full text-left px-3 py-2 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Export
              </button>
              <button
                role="menuitem"
                onClick={() => { setMenuOpen(false); navigateTo('ship', 'validation'); setValidateKey(k => k + 1); }}
                className="w-full text-left px-3 py-2 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Validation
              </button>
              <div className="border-t border-[var(--color-figma-border)]" />
              <button
                role="menuitem"
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
                    if (sub.id === 'audit') triggerHeatmapScan();
                  });
                }}
                className={`px-2.5 py-1 text-[10px] font-medium rounded-sm transition-colors ${
                  activeSubTab === sub.id
                    ? 'bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] shadow-sm'
                    : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'
                }`}
              >
                {sub.label}
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
        <div ref={setTabsScrollRef} className="flex gap-1 px-2 py-1.5 bg-[var(--color-figma-bg-secondary)] border-b border-[var(--color-figma-border)] overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {sets.map(set => {
            const isActive = activeSet === set;
            const isRenaming = renamingSet === set;
            return (
              <div
                key={set}
                data-active-set={isActive}
                draggable={!isRenaming}
                onDragStart={e => handleSetDragStart(e, set)}
                onDragOver={e => handleSetDragOver(e, set)}
                onDrop={e => handleSetDrop(e, set)}
                onDragEnd={handleSetDragEnd}
                className={`relative flex group/settab ${dragOverSetName === set && dragSetName !== set ? 'border-l-2 border-[var(--color-figma-accent)]' : ''}`}
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
                onMouseDown={e => e.preventDefault()}
                onClick={() => guardEditorAction(() => { setActiveSet(tabMenuOpen); navigateTo('define', 'generators'); setTabMenuOpen(null); })}
                className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Generate tokens…
              </button>
              <div className="border-t border-[var(--color-figma-border)] my-1" />
              <button
                role="menuitem"
                onMouseDown={e => e.preventDefault()}
                onClick={() => openSetMetadata(tabMenuOpen)}
                className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Edit set info
              </button>
              <div className="border-t border-[var(--color-figma-border)] my-1" />
              <button
                role="menuitem"
                onMouseDown={e => e.preventDefault()}
                onClick={() => startRename(tabMenuOpen)}
                className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Rename
              </button>
              <button
                role="menuitem"
                onMouseDown={e => e.preventDefault()}
                onClick={() => handleDuplicateSet(tabMenuOpen)}
                className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Duplicate
              </button>
              <button
                role="menuitem"
                onMouseDown={e => e.preventDefault()}
                onClick={() => handleReorderSet(tabMenuOpen!, 'left')}
                disabled={sets.indexOf(tabMenuOpen!) === 0}
                className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ← Move left
              </button>
              <button
                role="menuitem"
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
                onMouseDown={e => e.preventDefault()}
                onClick={() => openMergeDialog(tabMenuOpen)}
                disabled={sets.filter(s => s !== tabMenuOpen).length === 0}
                className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Merge into…
              </button>
              <button
                role="menuitem"
                onMouseDown={e => e.preventDefault()}
                onClick={() => openSplitDialog(tabMenuOpen)}
                className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Split by group
              </button>
              <div className="border-t border-[var(--color-figma-border)] my-1" />
              <button
                role="menuitem"
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
                  return (
                    <div key={set} className="group/sidebarset relative">
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
                      return (
                        <div key={set} className="group/sidebarset relative">
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
                    title="Manage theme dimensions"
                    aria-label="Manage theme dimensions"
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
          {/* Overflow panels */}
          {overflowPanel === 'import' && (
            <>
              <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
                <button
                  onClick={() => setOverflowPanel(null)}
                  className="flex items-center gap-1 text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
                  aria-label="Back"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M6.5 2L3.5 5l3 3"/>
                  </svg>
                  Back
                </button>
                <span className="text-[10px] font-medium text-[var(--color-figma-text)] ml-1">Import</span>
              </div>
              <ErrorBoundary panelName="Import" onReset={() => setOverflowPanel(null)}>
              <ImportPanel
                serverUrl={serverUrl}
                connected={connected}
                onImported={refreshTokens}
                onImportComplete={(importedSet) => {
                  navigateTo('define', 'tokens');
                  setActiveSet(importedSet);
                }}
              />
              </ErrorBoundary>
            </>
          )}
          {overflowPanel === 'settings' && (
            <SettingsPanel
              serverUrl={serverUrl}
              connected={connected}
              checking={checking}
              serverUrlInput={serverUrlInput}
              setServerUrlInput={setServerUrlInput}
              connectResult={connectResult}
              setConnectResult={setConnectResult}
              updateServerUrlAndConnect={updateServerUrlAndConnect}
              advancedModeOverride={advancedModeOverride}
              setAdvancedModeOverride={setAdvancedModeOverride}
              undoMaxHistory={undoMaxHistory}
              setUndoMaxHistory={setUndoMaxHistory}
              showClearConfirm={showClearConfirm}
              setShowClearConfirm={setShowClearConfirm}
              clearConfirmText={clearConfirmText}
              setClearConfirmText={setClearConfirmText}
              onClearAll={handleClearAll}
              clearing={clearing}
              onClose={() => setOverflowPanel(null)}
            />
          )}

          {/* Heatmap panel */}
          {/* Main tab panels */}
          {showValidationReturn && overflowPanel === null && activeTopTab === 'define' && activeSubTab === 'tokens' && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--color-figma-accent)]/10 border-b border-[var(--color-figma-accent)]/20 shrink-0">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--color-figma-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 14l-4-4 4-4"/><path d="M5 10h11a4 4 0 010 8h-1"/></svg>
              <span className="text-[10px] text-[var(--color-figma-text-secondary)] flex-1">Fix the token, then return to re-validate.</span>
              <button
                onClick={() => { navigateTo('ship', 'validation'); setShowValidationReturn(false); }}
                className="text-[10px] px-2 py-0.5 rounded border border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/10 transition-colors shrink-0"
              >
                Back to Validation
              </button>
              <button
                onClick={() => setShowValidationReturn(false)}
                className="text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)] transition-colors shrink-0"
                aria-label="Dismiss"
              >
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
          )}
          {overflowPanel === null && activeTopTab === 'define' && activeSubTab === 'tokens' && effectiveTokens.length === 0 && !createFromEmpty && !editingToken && (
            <EmptyState
              connected={connected}
              onCreateToken={() => setEditingToken({ path: '', set: activeSet, isCreate: true })}
              onPasteJSON={() => setShowPasteModal(true)}
              onImportFigma={() => openOverflowPanel('import')}
              onUsePreset={() => setShowScaffoldWizard(true)}
              onGenerateColorScale={() => setShowColorScaleGen(true)}
              onGoToGraph={() => { navigateTo('define', 'generators'); setShowScaffoldWizard(true); }}
              onGuidedSetup={() => setShowGuidedSetup(true)}
            />
          )}
          {overflowPanel === null && activeTopTab === 'define' && activeSubTab === 'tokens' && (effectiveTokens.length > 0 || createFromEmpty) && !showPreviewSplit && (
            useSidePanel ? (
              <div className="flex h-full overflow-hidden">
                <div className="flex-1 min-w-0 overflow-hidden">
                  <TokenList
                    ctx={{ setName: activeSet, sets, serverUrl, connected, selectedNodes }}
                    data={{ tokens, allTokensFlat: themedAllTokensFlat, lintViolations, syncSnapshot: Object.keys(syncSnapshot).length > 0 ? syncSnapshot : undefined, generators, derivedTokenPaths, tokenUsageCounts, cascadeDiff: cascadeDiff ?? undefined, perSetFlat, collectionMap: setCollectionNames, modeMap: setModeNames, dimensions, unthemedAllTokensFlat: allTokensFlat, pathToSet, activeThemes }}
                    actions={{ onEdit: (path, name) => { setEditingToken({ path, name, set: activeSet }); setPreviewingToken(null); setHighlightedToken(path); }, onPreview: (path, name) => { setPreviewingToken({ path, name, set: activeSet }); setHighlightedToken(path); }, onCreateNew: (initialPath, initialType, initialValue) => setEditingToken({ path: initialPath ?? '', set: activeSet, isCreate: true, initialType, initialValue }), onRefresh: refreshAll, onPushUndo: pushUndo, onTokenCreated: (path) => setHighlightedToken(path), onNavigateToAlias: handleNavigateToAlias, onNavigateBack: handleNavigateBack, navHistoryLength: navHistory.length, onClearHighlight: () => setHighlightedToken(null), onSyncGroup: (groupPath, tokenCount) => setSyncGroupPending({ groupPath, tokenCount }), onSyncGroupStyles: (groupPath, tokenCount) => setSyncGroupStylesPending({ groupPath, tokenCount }), onSetGroupScopes: (groupPath) => { setGroupScopesPath(groupPath); setGroupScopesSelected([]); setGroupScopesError(null); }, onGenerateScaleFromGroup: (groupPath, tokenType) => { setPendingGraphFromGroup({ groupPath, tokenType }); navigateTo('define', 'generators'); }, onRefreshGenerators: refreshGenerators, onToggleIssuesOnly: () => setShowIssuesOnly(v => !v), onFilteredCountChange: setFilteredSetCount, onNavigateToSet: handleNavigateToSet, onViewTokenHistory: (path) => { setHistoryFilterPath(path); navigateTo('ship', 'history'); }, onNavigateToGenerator: handleNavigateToGenerator, onShowReferences: (path) => { setFlowPanelInitialPath(path); navigateTo('apply', 'dependencies'); }, onDisplayedLeafNodesChange: (nodes) => { displayedLeafNodesRef.current = nodes; }, onError: setErrorToast }}
                    defaultCreateOpen={createFromEmpty}
                    highlightedToken={editingToken?.path ?? previewingToken?.path ?? highlightedToken}
                    showIssuesOnly={showIssuesOnly}
                    editingTokenPath={editingToken?.path}
                  />
                </div>
                <div
                  className="w-60 shrink-0 border-l border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] flex flex-col overflow-hidden"
                  onKeyDown={(e) => {
                    if ((e.key === ']' || e.key === '[') && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
                      e.preventDefault();
                      handleEditorNavigate(e.key === ']' ? 1 : -1);
                    }
                  }}
                >
                  {editingToken ? (
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
                    derivedTokenPaths={derivedTokenPaths}
                    onShowReferences={(path) => { setFlowPanelInitialPath(path); navigateTo('apply', 'dependencies'); }}
                  />
                  ) : previewingToken ? (
                  <TokenDetailPreview
                    tokenPath={previewingToken.path}
                    tokenName={previewingToken.name}
                    setName={previewingToken.set}
                    allTokensFlat={allTokensFlat}
                    pathToSet={pathToSet}
                    dimensions={dimensions}
                    activeThemes={activeThemes}
                    onEdit={handlePreviewEdit}
                    onClose={handlePreviewClose}
                    onNavigateToAlias={handleNavigateToAlias}
                  />
                  ) : null}
                </div>
              </div>
            ) : (
              <TokenList
                ctx={{ setName: activeSet, sets, serverUrl, connected, selectedNodes }}
                data={{ tokens, allTokensFlat: themedAllTokensFlat, lintViolations, syncSnapshot: Object.keys(syncSnapshot).length > 0 ? syncSnapshot : undefined, generators, derivedTokenPaths, tokenUsageCounts, cascadeDiff: cascadeDiff ?? undefined, perSetFlat, collectionMap: setCollectionNames, modeMap: setModeNames, dimensions, unthemedAllTokensFlat: allTokensFlat, pathToSet, activeThemes }}
                actions={{ onEdit: (path, name) => { setEditingToken({ path, name, set: activeSet }); setPreviewingToken(null); setHighlightedToken(path); }, onPreview: (path, name) => { setPreviewingToken({ path, name, set: activeSet }); setHighlightedToken(path); }, onCreateNew: (initialPath, initialType, initialValue) => setEditingToken({ path: initialPath ?? '', set: activeSet, isCreate: true, initialType, initialValue }), onRefresh: refreshAll, onPushUndo: pushUndo, onTokenCreated: (path) => setHighlightedToken(path), onNavigateToAlias: handleNavigateToAlias, onNavigateBack: handleNavigateBack, navHistoryLength: navHistory.length, onClearHighlight: () => setHighlightedToken(null), onSyncGroup: (groupPath, tokenCount) => setSyncGroupPending({ groupPath, tokenCount }), onSyncGroupStyles: (groupPath, tokenCount) => setSyncGroupStylesPending({ groupPath, tokenCount }), onSetGroupScopes: (groupPath) => { setGroupScopesPath(groupPath); setGroupScopesSelected([]); setGroupScopesError(null); }, onGenerateScaleFromGroup: (groupPath, tokenType) => { setPendingGraphFromGroup({ groupPath, tokenType }); navigateTo('define', 'generators'); }, onRefreshGenerators: refreshGenerators, onToggleIssuesOnly: () => setShowIssuesOnly(v => !v), onFilteredCountChange: setFilteredSetCount, onNavigateToSet: handleNavigateToSet, onViewTokenHistory: (path) => { setHistoryFilterPath(path); navigateTo('ship', 'history'); }, onNavigateToGenerator: handleNavigateToGenerator, onShowReferences: (path) => { setFlowPanelInitialPath(path); navigateTo('apply', 'dependencies'); }, onDisplayedLeafNodesChange: (nodes) => { displayedLeafNodesRef.current = nodes; }, onError: setErrorToast }}
                defaultCreateOpen={createFromEmpty}
                highlightedToken={highlightedToken}
                showIssuesOnly={showIssuesOnly}
                editingTokenPath={editingToken?.path}
              />
            )
          )}
          {overflowPanel === null && activeTopTab === 'define' && activeSubTab === 'tokens' && (effectiveTokens.length > 0 || createFromEmpty) && showPreviewSplit && (
            <div ref={splitContainerRef} className="flex flex-col h-full overflow-hidden">
              <div style={{ height: `${splitRatio * 100}%`, flexShrink: 0, overflow: 'hidden' }}>
                <TokenList
                  ctx={{ setName: activeSet, sets, serverUrl, connected, selectedNodes }}
                  data={{ tokens, allTokensFlat: themedAllTokensFlat, lintViolations, syncSnapshot: Object.keys(syncSnapshot).length > 0 ? syncSnapshot : undefined, generators, derivedTokenPaths, tokenUsageCounts, cascadeDiff: cascadeDiff ?? undefined, perSetFlat, collectionMap: setCollectionNames, modeMap: setModeNames, dimensions, unthemedAllTokensFlat: allTokensFlat, pathToSet, activeThemes }}
                  actions={{ onEdit: (path, name) => { setEditingToken({ path, name, set: activeSet }); setPreviewingToken(null); setHighlightedToken(path); }, onPreview: (path, name) => { setPreviewingToken({ path, name, set: activeSet }); setHighlightedToken(path); }, onCreateNew: (initialPath, initialType, initialValue) => setEditingToken({ path: initialPath ?? '', set: activeSet, isCreate: true, initialType, initialValue }), onRefresh: refreshAll, onPushUndo: pushUndo, onTokenCreated: (path) => setHighlightedToken(path), onNavigateToAlias: handleNavigateToAlias, onNavigateBack: handleNavigateBack, navHistoryLength: navHistory.length, onClearHighlight: () => setHighlightedToken(null), onSyncGroup: (groupPath, tokenCount) => setSyncGroupPending({ groupPath, tokenCount }), onSyncGroupStyles: (groupPath, tokenCount) => setSyncGroupStylesPending({ groupPath, tokenCount }), onSetGroupScopes: (groupPath) => { setGroupScopesPath(groupPath); setGroupScopesSelected([]); setGroupScopesError(null); }, onGenerateScaleFromGroup: (groupPath, tokenType) => { setPendingGraphFromGroup({ groupPath, tokenType }); navigateTo('define', 'generators'); }, onRefreshGenerators: refreshGenerators, onToggleIssuesOnly: () => setShowIssuesOnly(v => !v), onFilteredCountChange: setFilteredSetCount, onNavigateToSet: handleNavigateToSet, onViewTokenHistory: (path) => { setHistoryFilterPath(path); navigateTo('ship', 'history'); }, onNavigateToGenerator: handleNavigateToGenerator, onShowReferences: (path) => { setFlowPanelInitialPath(path); navigateTo('apply', 'dependencies'); }, onDisplayedLeafNodesChange: (nodes) => { displayedLeafNodesRef.current = nodes; }, onError: setErrorToast }}
                  defaultCreateOpen={createFromEmpty}
                  highlightedToken={highlightedToken}
                  showIssuesOnly={showIssuesOnly}
                  editingTokenPath={editingToken?.path}
                />
              </div>
              <div
                role="separator"
                aria-orientation="horizontal"
                aria-valuenow={splitValueNow}
                aria-valuemin={20}
                aria-valuemax={80}
                aria-label="Resize token list and preview"
                tabIndex={0}
                className="h-1 flex-shrink-0 cursor-row-resize bg-[var(--color-figma-border)] hover:bg-[var(--color-figma-accent)] focus-visible:bg-[var(--color-figma-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-figma-accent)] transition-colors"
                onMouseDown={handleSplitDragStart}
                onKeyDown={handleSplitKeyDown}
              />
              <div className="flex-1 min-h-0 overflow-hidden">
                <ErrorBoundary panelName="Preview" onReset={() => navigateTo('define', 'tokens')}>
                <PreviewPanel
                  allTokensFlat={themedAllTokensFlat}
                  dimensions={dimensions}
                  activeThemes={activeThemes}
                  onActiveThemesChange={setActiveThemes}
                  onGoToTokens={() => navigateTo('define', 'tokens')}
                  onNavigateToToken={(path) => {
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
                />
                </ErrorBoundary>
              </div>
            </div>
          )}
          {overflowPanel === null && activeTopTab === 'define' && activeSubTab === 'generators' && (
            <ErrorBoundary panelName="Generators" onReset={() => navigateTo('define', 'tokens')}>
            <GraphPanel
              serverUrl={serverUrl}
              activeSet={activeSet}
              generators={generators}
              connected={connected}
              onRefresh={() => { refreshAll(); refreshGenerators(); }}
              pendingTemplateId={pendingGraphTemplate}
              onApplyTemplate={() => setPendingGraphTemplate(null)}
              pendingGroupPath={pendingGraphFromGroup?.groupPath ?? null}
              pendingGroupTokenType={pendingGraphFromGroup?.tokenType ?? null}
              onClearPendingGroup={() => setPendingGraphFromGroup(null)}
              focusGeneratorId={focusGeneratorId}
              onClearFocusGenerator={() => setFocusGeneratorId(null)}
            />
            </ErrorBoundary>
          )}
          {overflowPanel === null && activeTopTab === 'apply' && activeSubTab === 'dependencies' && (
            <ErrorBoundary panelName="Dependencies" onReset={() => navigateTo('apply', 'inspect')}>
            <TokenFlowPanel
              allTokensFlat={themedAllTokensFlat}
              pathToSet={pathToSet}
              initialPath={flowPanelInitialPath}
              onNavigateToToken={(path) => {
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
            />
            </ErrorBoundary>
          )}
          {overflowPanel === null && activeTopTab === 'apply' && activeSubTab === 'inspect' && (
            <ErrorBoundary panelName="Inspector" onReset={() => navigateTo('define', 'tokens')}>
            <SelectionInspector
              selectedNodes={selectedNodes}
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
                navigateTo('define', 'tokens');
              }}
              onPushUndo={pushUndo}
              onGoToTokens={() => navigateTo('define', 'tokens')}
              triggerCreateToken={triggerCreateToken}
            />
            </ErrorBoundary>
          )}
          {overflowPanel === null && activeTopTab === 'ship' && activeSubTab === 'publish' && (
            <ErrorBoundary panelName="Publish" onReset={() => navigateTo('define', 'tokens')}>
            <PublishPanel serverUrl={serverUrl} connected={connected} activeSet={activeSet} collectionMap={setCollectionNames} modeMap={setModeNames} />
            </ErrorBoundary>
          )}

          {/* Validation sub-tab (Ship > Validation) */}
          {overflowPanel === null && activeTopTab === 'ship' && activeSubTab === 'validation' && (
              <ErrorBoundary panelName="Validation" onReset={() => navigateTo('ship', 'publish')}>
              <AnalyticsPanel
                serverUrl={serverUrl}
                connected={connected}
                validateKey={validateKey}
                tokenUsageCounts={tokenUsageCounts}
                onNavigateToToken={(path, set) => {
                  setActiveSet(set);
                  navigateTo('define', 'tokens');
                  setPendingHighlight(path);
                  setShowValidationReturn(true);
                }}
                onValidationComplete={setAnalyticsIssueCount}
              />
              </ErrorBoundary>
          )}
          {/* Themes sub-tab (Define > Themes) */}
          {overflowPanel === null && activeTopTab === 'define' && activeSubTab === 'themes' && (
            <div className="flex flex-col h-full overflow-hidden">
              {/* Manage / Compare toggle */}
              <div className="shrink-0 flex items-center gap-1 px-2 py-1 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
                {([{ id: 'manage', label: 'Manage' }, { id: 'compare', label: 'Compare' }] as const).map(v => (
                  <button
                    key={v.id}
                    onClick={() => setThemesView(v.id)}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                      themesView === v.id
                        ? 'bg-[var(--color-figma-accent)] text-white'
                        : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              <div className="flex-1 overflow-hidden">
                {themesView === 'manage' ? (
                  <ErrorBoundary panelName="Themes" onReset={() => navigateTo('define', 'tokens')}>
                    <ThemeManager serverUrl={serverUrl} connected={connected} sets={sets} onDimensionsChange={setDimensions} onNavigateToToken={(set, path) => { navigateTo('define', 'tokens'); handleNavigateToSet(set, path); }} onCreateToken={(tokenPath, set) => { navigateTo('define', 'tokens'); setEditingToken({ path: tokenPath, set, isCreate: true }); }} onPushUndo={pushUndo} resolverState={{
                      serverUrl,
                      connected,
                      sets,
                      resolvers: resolverState.resolvers,
                      activeResolver: resolverState.activeResolver,
                      setActiveResolver: resolverState.setActiveResolver,
                      resolverInput: resolverState.resolverInput,
                      setResolverInput: resolverState.setResolverInput,
                      activeModifiers: resolverState.activeModifiers,
                      resolvedTokens: resolverState.resolvedTokens,
                      resolverError: resolverState.resolverError,
                      loading: resolverState.loading,
                      fetchResolvers: resolverState.fetchResolvers,
                      convertFromThemes: resolverState.convertFromThemes,
                      deleteResolver: resolverState.deleteResolver,
                    }} />
                  </ErrorBoundary>
                ) : (
                  <ErrorBoundary panelName="Theme Compare" onReset={() => setThemesView('manage')}>
                    <ThemeCompare
                      dimensions={dimensions}
                      allTokensFlat={allTokensFlat}
                      pathToSet={pathToSet}
                      onEditToken={(set, path) => { navigateTo('define', 'tokens'); handleNavigateToSet(set, path); }}
                      onCreateToken={(path, set, type, value) => {
                        navigateTo('define', 'tokens');
                        if (set !== activeSet) setActiveSet(set);
                        setEditingToken({ path, set, isCreate: true, initialType: type, initialValue: value });
                      }}
                    />
                  </ErrorBoundary>
                )}
              </div>
            </div>
          )}


          {/* Export sub-tab (Ship > Export) */}
          {overflowPanel === null && activeTopTab === 'ship' && activeSubTab === 'export' && (
              <ErrorBoundary panelName="Export" onReset={() => navigateTo('ship', 'publish')}>
              <ExportPanel
                serverUrl={serverUrl}
                connected={connected}
              />
              </ErrorBoundary>
          )}

          {/* History sub-tab (Ship > History) — git commits + snapshots */}
          {overflowPanel === null && activeTopTab === 'ship' && activeSubTab === 'history' && (
              <ErrorBoundary panelName="History" onReset={() => navigateTo('ship', 'publish')}>
              <HistoryPanel serverUrl={serverUrl} connected={connected} onPushUndo={pushUndo} onRefreshTokens={refreshAll} filterTokenPath={historyFilterPath} onClearFilter={() => setHistoryFilterPath(null)} recentOperations={recentOperations} totalOperations={totalOperations} hasMoreOperations={hasMoreOperations} onLoadMoreOperations={loadMoreOperations} onRollback={handleRollback} undoDescriptions={undoDescriptions} redoableOpIds={redoableOpIds} onServerRedo={handleServerRedo} />
              </ErrorBoundary>
          )}

          {/* Binding Audit sub-tab (Apply > Binding Audit) */}
          {overflowPanel === null && activeTopTab === 'apply' && activeSubTab === 'audit' && (
              <ErrorBoundary panelName="Binding Audit" onReset={() => navigateTo('apply', 'inspect')}>
              <BindingAuditPanel
                heatmapResult={heatmapResult}
                heatmapLoading={heatmapLoading}
                heatmapError={heatmapError}
                heatmapScope={heatmapScope}
                onScopeChange={setHeatmapScope}
                onRescan={triggerHeatmapScan}
                onCancel={cancelHeatmapScan}
                onSelectNodes={(ids) => parent.postMessage({ pluginMessage: { type: 'select-heatmap-nodes', nodeIds: ids } }, '*')}
                onBatchBind={(nodeIds, tokenPath, property) => {
                  const entry = allTokensFlat[tokenPath];
                  if (!entry) return;
                  parent.postMessage({ pluginMessage: { type: 'batch-bind-heatmap-nodes', nodeIds, tokenPath, tokenType: entry.$type, targetProperty: property, resolvedValue: entry.$value } }, '*');
                }}
                availableTokens={allTokensFlat}
                onSelectNode={(nodeId) => parent.postMessage({ pluginMessage: { type: 'select-node', nodeId } }, '*')}
              />
              </ErrorBoundary>
          )}
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
                derivedTokenPaths={derivedTokenPaths}
                onShowReferences={(path) => { setFlowPanelInitialPath(path); navigateTo('apply', 'dependencies'); }}
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
                className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)] resize-none"
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
                className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)]"
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
                className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)]"
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
                  className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)]"
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
            setActiveSet(set);
            navigateTo('define', 'tokens');
          }}
          onClose={() => setShowSetSwitcher(false)}
        />
      )}

      {/* Command Palette */}
      {showCommandPalette && (
        <CommandPalette
          commands={commands}
          tokens={paletteTokens}
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
          onCopyTokenValue={(value) => {
            navigator.clipboard.writeText(value).catch((err) => { console.warn('[App] clipboard write failed for token value:', err); });
          }}
          onCopyTokenCssVar={(path) => {
            const cssVar = `--${path.replace(/\./g, '-')}`;
            navigator.clipboard.writeText(cssVar).catch((err) => { console.warn('[App] clipboard write failed for CSS var:', err); });
          }}
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
