import { useState, useEffect, useCallback, useRef, useLayoutEffect, useMemo, Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { TokenList } from './components/TokenList';
import { TokenEditor } from './components/TokenEditor';
import { ThemeManager } from './components/ThemeManager';
import { SyncPanel } from './components/SyncPanel';
import { ExportPanel } from './components/ExportPanel';
import { ImportPanel } from './components/ImportPanel';
import { AnalyticsPanel } from './components/AnalyticsPanel';
import { SelectionInspector } from './components/SelectionInspector';
import { UndoToast } from './components/UndoToast';
import { ConfirmModal } from './components/ConfirmModal';
import { EmptyState } from './components/EmptyState';
import { PasteTokensModal } from './components/PasteTokensModal';
import { QuickStartDialog } from './components/QuickStartDialog';
import { ColorScaleGenerator } from './components/ColorScaleGenerator';
import { CommandPalette } from './components/CommandPalette';
import type { Command, TokenEntry } from './components/CommandPalette';
import { PreviewPanel } from './components/PreviewPanel';
import { HeatmapPanel } from './components/HeatmapPanel';
import type { HeatmapResult } from './components/HeatmapPanel';
import { useServerConnection } from './hooks/useServerConnection';
import { useTokens, fetchAllTokensFlat, fetchAllTokensFlatWithSets } from './hooks/useTokens';
import { useSelection } from './hooks/useSelection';
import { useUndo } from './hooks/useUndo';
import { useLint } from './hooks/useLint';
import { useGenerators } from './hooks/useGenerators';
import type { SyncCompleteMessage, TokenMapEntry } from '../shared/types';
import { resolveAllAliases } from '../shared/resolveAlias';
import { stableStringify } from './shared/colorUtils';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('[ErrorBoundary]', error, info); }
  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-6 gap-3 text-center">
          <p className="text-[11px] font-medium text-[var(--color-figma-error)]">Something went wrong</p>
          <p className="text-[10px] text-[var(--color-figma-text-secondary)] font-mono break-all max-w-xs">
            {(this.state.error as Error).message}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)]"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function useSyncBindings(serverUrl: string, connected: boolean) {
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<{ processed: number; total: number } | null>(null);
  const [result, setResult] = useState<SyncCompleteMessage | null>(null);
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
    setResult(null);
    try {
      const rawMap = await fetchAllTokensFlat(serverUrl);
      const tokenMap = resolveAllAliases(rawMap);
      parent.postMessage({ pluginMessage: { type: 'sync-bindings', tokenMap, scope } }, '*');
    } catch (err) {
      console.error('Failed to fetch tokens for sync:', err);
      setSyncing(false);
    }
  }, [serverUrl, connected, syncing]);

  return { syncing, syncProgress: progress, syncResult: result, sync };
}

type Tab = 'tokens' | 'themes' | 'sync' | 'analytics' | 'preview';

const TABS: { id: Tab; label: string }[] = [
  { id: 'tokens', label: 'Tokens' },
  { id: 'themes', label: 'Themes' },
  { id: 'sync', label: 'Sync' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'preview', label: 'Preview' },
];

type OverflowPanel = 'import' | 'export' | 'settings' | 'heatmap' | null;

const MIN_WIDTH = 320;
const MIN_HEIGHT = 400;
const MAX_WIDTH = 900;
const MAX_HEIGHT = 900;

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
      const w = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startW + (ev.clientX - startX)));
      const h = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, startH + (ev.clientY - startY)));
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
    try {
      const stored = localStorage.getItem('tm_active_tab');
      return (stored && TABS.some(t => t.id === stored) ? stored : 'tokens') as Tab;
    } catch { return 'tokens'; }
  });
  const setActiveTab = (tab: Tab) => {
    try { localStorage.setItem('tm_active_tab', tab); } catch {}
    setActiveTabState(tab);
  };
  const [overflowPanel, setOverflowPanel] = useState<OverflowPanel>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingToken, setEditingToken] = useState<{ path: string; set: string; isCreate?: boolean; initialType?: string } | null>(null);
  const { connected, checking, serverUrl, updateServerUrlAndConnect, retryConnection } = useServerConnection();
  const { sets, setSets, activeSet, setActiveSet, tokens, setTokenCounts, setDescriptions, refreshTokens } = useTokens(serverUrl, connected);
  const { selectedNodes } = useSelection();
  const { syncing, syncProgress, syncResult, sync } = useSyncBindings(serverUrl, connected);
  const [allTokensFlat, setAllTokensFlat] = useState<Record<string, TokenMapEntry>>({});
  const [pathToSet, setPathToSet] = useState<Record<string, string>>({});
  const [highlightedToken, setHighlightedToken] = useState<string | null>(null);
  const [pendingHighlight, setPendingHighlight] = useState<string | null>(null);
  const [serverUrlInput, setServerUrlInput] = useState(serverUrl);
  const [connectResult, setConnectResult] = useState<'ok' | 'fail' | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState('');
  const [clearing, setClearing] = useState(false);
  const { toastVisible, slot: undoSlot, canUndo, pushUndo, executeUndo, executeRedo, dismissToast, canRedo, redoSlot, undoCount } = useUndo();
  const onResizeHandleMouseDown = useWindowResize();
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [showScaffoldWizard, setShowScaffoldWizard] = useState(false);
  const [showColorScaleGen, setShowColorScaleGen] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [lintKey, setLintKey] = useState(0);
  const lintViolations = useLint(serverUrl, activeSet, connected, lintKey);
  const refreshAll = useCallback(() => { refreshTokens(); setLintKey(k => k + 1); }, [refreshTokens]);
  const handleEditorClose = useCallback(() => { setEditingToken(null); refreshAll(); }, [refreshAll]);
  const editorIsDirtyRef = useRef(false);
  const handleEditorSave = useCallback((savedPath: string) => {
    setHighlightedToken(savedPath);
    setEditingToken(null);
    refreshAll();
  }, [refreshAll]);
  const { generators, refreshGenerators, generatorsBySource, derivedTokenPaths } = useGenerators(serverUrl, connected);
  const [validateKey, setValidateKey] = useState(0);
  const [analyticsIssueCount, setAnalyticsIssueCount] = useState<number | null>(null);
  const [syncSnapshot, setSyncSnapshot] = useState<Record<string, string>>({});
  const menuRef = useRef<HTMLDivElement>(null);

  // Set context menu state
  const [tabMenuOpen, setTabMenuOpen] = useState<string | null>(null);
  const [tabMenuPos, setTabMenuPos] = useState({ x: 0, y: 0 });
  const tabMenuRef = useRef<HTMLDivElement>(null);

  // Empty state create flow
  const [createFromEmpty, setCreateFromEmpty] = useState(false);

  // Reset createFromEmpty when switching sets
  useEffect(() => {
    if (createFromEmpty) setCreateFromEmpty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSet]);

  // Set metadata editing state
  const [editingMetadataSet, setEditingMetadataSet] = useState<string | null>(null);
  const [metadataDescription, setMetadataDescription] = useState('');

  // Delete state
  const [deletingSet, setDeletingSet] = useState<string | null>(null);

  // Group sync state
  const [syncGroupPending, setSyncGroupPending] = useState<{ groupPath: string; tokenCount: number } | null>(null);

  // Group scope state
  const [groupScopesPath, setGroupScopesPath] = useState<string | null>(null);
  const [groupScopesSelected, setGroupScopesSelected] = useState<string[]>([]);
  const [groupScopesApplying, setGroupScopesApplying] = useState(false);

  // Rename state
  const [renamingSet, setRenamingSet] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // New set creation state
  const [creatingSet, setCreatingSet] = useState(false);
  const [newSetName, setNewSetName] = useState('');
  const [newSetError, setNewSetError] = useState('');
  const newSetInputRef = useRef<HTMLInputElement>(null);
  const setTabsScrollRef = useRef<HTMLDivElement>(null);
  const [setTabsOverflow, setSetTabsOverflow] = useState(false);

  useEffect(() => {
    if (connected) {
      fetchAllTokensFlatWithSets(serverUrl).then(({ flat, pathToSet: pts }) => {
        setAllTokensFlat(resolveAllAliases(flat));
        setPathToSet(pts);
      }).catch(err => console.error('Failed to fetch tokens flat:', err));
    }
  }, [connected, serverUrl, tokens]);

  // Heatmap state
  const [heatmapResult, setHeatmapResult] = useState<HeatmapResult | null>(null);
  const [heatmapLoading, setHeatmapLoading] = useState(false);

  const triggerHeatmapScan = useCallback(() => {
    setHeatmapLoading(true);
    setHeatmapResult(null);
    parent.postMessage({ pluginMessage: { type: 'scan-canvas-heatmap' } }, '*');
  }, []);

  // Listen for variables-applied and capture a sync snapshot
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data?.pluginMessage;
      if (msg?.type === 'variables-applied') {
        // Snapshot current allTokensFlat values as last-applied baseline
        const snap: Record<string, string> = {};
        for (const [path, entry] of Object.entries(allTokensFlat)) {
          snap[path] = stableStringify(entry.$value);
        }
        setSyncSnapshot(snap);
      } else if (msg?.type === 'canvas-heatmap-result') {
        setHeatmapResult({
          total: msg.total,
          green: msg.green,
          yellow: msg.yellow,
          red: msg.red,
          nodes: msg.nodes,
        });
        setHeatmapLoading(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [allTokensFlat]);

  // Apply pending highlight after switching sets
  useEffect(() => {
    if (pendingHighlight && pathToSet[pendingHighlight] === activeSet) {
      setHighlightedToken(pendingHighlight);
      setPendingHighlight(null);
    }
  }, [tokens, pendingHighlight, activeSet, pathToSet]);

  const handleNavigateToAlias = useCallback((aliasPath: string) => {
    if (pathToSet[aliasPath]) {
      const targetSet = pathToSet[aliasPath];
      if (targetSet === activeSet) {
        setHighlightedToken(aliasPath);
      } else {
        setPendingHighlight(aliasPath);
        setActiveSet(targetSet);
      }
    }
  }, [pathToSet, activeSet, setActiveSet]);

  // Close overflow menu on Escape key (not on outside click — accidental mis-clicks dismiss it)
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [menuOpen]);

  // Close set context menu on outside click
  useEffect(() => {
    if (!tabMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (tabMenuRef.current && !tabMenuRef.current.contains(e.target as Node)) {
        setTabMenuOpen(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [tabMenuOpen]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'v') {
        e.preventDefault();
        setShowPasteModal(true);
      }
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'k') {
        e.preventDefault();
        setShowCommandPalette(v => !v);
      }
      const tabIndex = ['1', '2', '3', '4'].indexOf(e.key);
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && tabIndex !== -1) {
        e.preventDefault();
        setActiveTab(TABS[tabIndex].id);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Focus rename input when it appears
  useLayoutEffect(() => {
    if (renamingSet && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingSet]);

  // Focus new set input when it appears
  useLayoutEffect(() => {
    if (creatingSet && newSetInputRef.current) {
      newSetInputRef.current.focus();
      newSetInputRef.current.select();
    }
  }, [creatingSet]);

  // Detect horizontal overflow in set tab bar — persistent observer (only one alive at a time)
  useEffect(() => {
    const el = setTabsScrollRef.current;
    if (!el) return;
    const check = () => setSetTabsOverflow(el.scrollWidth > el.clientWidth);
    el.addEventListener('scroll', check);
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', check); ro.disconnect(); };
  }, []);

  // Re-check overflow whenever the set list changes (tabs added/removed/renamed)
  useEffect(() => {
    const el = setTabsScrollRef.current;
    if (!el) return;
    setSetTabsOverflow(el.scrollWidth > el.clientWidth);
  }, [sets]);

  // Scroll active set tab into view whenever activeSet changes
  useEffect(() => {
    const container = setTabsScrollRef.current;
    if (!container) return;
    const activeEl = container.querySelector('[data-active-set="true"]') as HTMLElement | null;
    if (activeEl) activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }, [activeSet]);

  const openSetMenu = (setName: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setTabMenuOpen(setName);
    setTabMenuPos({
      x: Math.min(e.clientX, window.innerWidth - 176),
      y: Math.min(e.clientY, window.innerHeight - 240),
    });
  };

  const startRename = (setName: string) => {
    setTabMenuOpen(null);
    setRenamingSet(setName);
    setRenameValue(setName);
    setRenameError('');
  };

  const cancelRename = () => {
    setRenamingSet(null);
    setRenameError('');
  };

  const handleRenameConfirm = async () => {
    if (!renamingSet) return;
    const newName = renameValue.trim();
    if (!newName || newName === renamingSet) { cancelRename(); return; }
    if (!/^[a-zA-Z0-9_-]+$/.test(newName)) {
      setRenameError('Only letters, numbers, - and _');
      return;
    }
    if (!connected) { cancelRename(); return; }
    try {
      const res = await fetch(`${serverUrl}/api/sets/${renamingSet}/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName }),
      });
      if (!res.ok) {
        const data = await res.json();
        setRenameError(data.error || 'Rename failed');
        return;
      }
      if (activeSet === renamingSet) setActiveSet(newName);
      cancelRename();
      refreshTokens();
    } catch {
      setRenameError('Rename failed');
    }
  };

  const handleCreateSet = async () => {
    const name = newSetName.trim();
    if (!name) { setNewSetError('Name cannot be empty'); return; }
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) { setNewSetError('Only letters, numbers, - and _'); return; }
    if (!connected) { setCreatingSet(false); return; }
    try {
      const res = await fetch(`${serverUrl}/api/sets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setNewSetError((data as any).error || 'Failed to create set');
        return;
      }
      setCreatingSet(false);
      setNewSetName('');
      setNewSetError('');
      refreshTokens();
    } catch {
      setNewSetError('Network error');
    }
  };

  const handleDeleteSet = async () => {
    if (!deletingSet || !connected) return;
    try {
      const res = await fetch(`${serverUrl}/api/sets/${deletingSet}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Failed to delete set: ${res.statusText}`);
    } catch {
      setDeletingSet(null);
      return;
    }
    const remaining = sets.filter(s => s !== deletingSet);
    setSets(remaining);
    if (activeSet === deletingSet) {
      setActiveSet(remaining[0] ?? '');
    }
    setDeletingSet(null);
    refreshTokens();
  };

  const handleSyncGroup = useCallback(async () => {
    if (!syncGroupPending || !connected) return;
    const { groupPath } = syncGroupPending;
    setSyncGroupPending(null);
    try {
      const rawMap = await fetchAllTokensFlat(serverUrl);
      const resolved = resolveAllAliases(rawMap);
      const prefix = groupPath + '.';
      const tokens: { path: string; $type: string; $value: any }[] = [];
      for (const [path, entry] of Object.entries(resolved)) {
        if (path === groupPath || path.startsWith(prefix)) {
          tokens.push({ path, $type: entry.$type, $value: entry.$value });
        }
      }
      parent.postMessage({ pluginMessage: { type: 'apply-variables', tokens } }, '*');
    } catch (err) {
      console.error('Failed to sync group to Figma:', err);
    }
  }, [syncGroupPending, connected, serverUrl]);

  const handleApplyGroupScopes = useCallback(async () => {
    if (!groupScopesPath || !connected) return;
    setGroupScopesApplying(true);
    try {
      const res = await fetch(`${serverUrl}/api/tokens/${activeSet}`);
      if (!res.ok) throw new Error('Failed to fetch tokens');
      const data = await res.json();
      const prefix = groupScopesPath + '.';
      const patchPromises: Promise<any>[] = [];
      const walk = (group: Record<string, any>, p: string) => {
        for (const [key, val] of Object.entries(group)) {
          if (key.startsWith('$')) continue;
          const path = p ? `${p}.${key}` : key;
          if (val && typeof val === 'object' && '$value' in val) {
            if (path === groupScopesPath || path.startsWith(prefix)) {
              patchPromises.push(fetch(`${serverUrl}/api/tokens/${activeSet}/${path}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ $extensions: { 'com.figma.scopes': groupScopesSelected } }),
              }));
            }
          } else if (val && typeof val === 'object') {
            walk(val, path);
          }
        }
      };
      walk(data.tokens || {}, '');
      await Promise.all(patchPromises);
      setGroupScopesPath(null);
      setGroupScopesSelected([]);
    } catch (err) {
      console.error('Failed to apply group scopes:', err);
    } finally {
      setGroupScopesApplying(false);
    }
  }, [groupScopesPath, groupScopesSelected, connected, serverUrl, activeSet]);

  const handleDuplicateSet = async (setName: string) => {
    setTabMenuOpen(null);
    if (!connected) return;
    let newName = `${setName}-copy`;
    let i = 2;
    while (sets.includes(newName)) {
      newName = `${setName}-copy-${i++}`;
    }
    try {
      const res = await fetch(`${serverUrl}/api/sets/${setName}`);
      if (!res.ok) return;
      const data = await res.json();
      const createRes = await fetch(`${serverUrl}/api/sets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, tokens: data.tokens }),
      });
      if (!createRes.ok) return;
    } catch {
      return;
    }
    refreshTokens();
  };

  const openSetMetadata = (setName: string) => {
    setTabMenuOpen(null);
    setEditingMetadataSet(setName);
    setMetadataDescription(setDescriptions[setName] || '');
  };

  const handleSaveMetadata = async () => {
    if (!editingMetadataSet || !connected) { setEditingMetadataSet(null); return; }
    try {
      await fetch(`${serverUrl}/api/sets/${editingMetadataSet}/metadata`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: metadataDescription }),
      });
    } catch {
      // best-effort; close modal regardless
    }
    setEditingMetadataSet(null);
    refreshTokens();
  };

  const handleClearAll = async () => {
    if (clearConfirmText !== 'DELETE') return;
    setClearing(true);
    try {
      await fetch(`${serverUrl}/api/data`, { method: 'DELETE' });
    } catch {
      // best-effort
    }
    // Clear all plugin localStorage keys
    const keysToRemove = ['tm_active_tab', 'tm_active_set', 'analytics_canonicalPick', 'themeCardOrder', 'importTargetSet'];
    for (const key of keysToRemove) {
      try { localStorage.removeItem(key); } catch {}
    }
    // Clear per-set sort/filter keys
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('token-sort:') || k.startsWith('token-type-filter:'))) {
        try { localStorage.removeItem(k); } catch {}
      }
    }
    setClearing(false);
    setShowClearConfirm(false);
    setClearConfirmText('');
    setOverflowPanel(null);
    setActiveTabState('tokens');
    refreshTokens();
  };

  const openOverflowPanel = (panel: OverflowPanel) => {
    setMenuOpen(false);
    setOverflowPanel(panel);
  };

  const commands: Command[] = useMemo(() => {
    const goToTokens = () => { setActiveTab('tokens'); setOverflowPanel(null); setEditingToken(null); };
    const cmds: Command[] = [
      {
        id: 'new-token',
        label: 'Create new token',
        description: `In set: ${activeSet}`,
        category: 'Tokens',
        handler: () => { goToTokens(); },
      },
      {
        id: 'paste-tokens',
        label: 'Paste tokens',
        description: 'Create tokens from JSON or name:value lines',
        category: 'Tokens',
        shortcut: '⌘⇧V',
        handler: () => setShowPasteModal(true),
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
        handler: () => openOverflowPanel('export'),
      },
      {
        id: 'settings',
        label: 'Open Settings',
        description: 'Manage server URL and connection',
        category: 'Settings',
        handler: () => openOverflowPanel('settings'),
      },
      {
        id: 'themes',
        label: 'Go to Themes',
        description: 'Manage design themes and set assignments',
        category: 'Navigation',
        handler: () => setActiveTab('themes'),
      },
      {
        id: 'sync',
        label: 'Go to Sync',
        description: 'Sync tokens to Figma variables',
        category: 'Navigation',
        handler: () => setActiveTab('sync'),
      },
      {
        id: 'analytics',
        label: 'Go to Analytics',
        description: 'View validation issues and token statistics',
        category: 'Navigation',
        handler: () => setActiveTab('analytics'),
      },
      {
        id: 'validate',
        label: 'Validate All Tokens',
        description: 'Run cross-set validation for broken references, circular refs, and more',
        category: 'Tokens',
        handler: () => { setActiveTab('analytics'); setValidateKey(k => k + 1); },
      },
      {
        id: 'generate-color-scale',
        label: 'Generate Color Scale',
        description: 'Create a perceptually uniform color ramp',
        category: 'Tokens',
        handler: () => { goToTokens(); setShowColorScaleGen(true); },
      },
      ...sets.map(s => ({
        id: `switch-set-${s}`,
        label: `Switch to Set: ${s}`,
        description: `${setTokenCounts[s] ?? 0} tokens`,
        category: 'Sets',
        handler: () => { setActiveSet(s); goToTokens(); },
      })),
    ];
    return cmds;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSet, sets, setTokenCounts]);

  // Flat token list for command palette token search mode
  const paletteTokens: TokenEntry[] = useMemo(() => {
    return Object.entries(allTokensFlat).map(([path, entry]) => ({
      path,
      type: entry.$type,
    }));
  }, [allTokensFlat]);

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

      {/* Tab bar */}
      <div className="flex items-center border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]" role="tablist">
        {TABS.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id && overflowPanel === null}
            onClick={() => { setActiveTab(tab.id); setOverflowPanel(null); }}
            className={`relative px-3 py-2 text-[11px] font-medium transition-colors rounded-sm mx-0.5 my-1 ${
              activeTab === tab.id && overflowPanel === null
                ? 'bg-[var(--color-figma-accent)] text-white'
                : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'
            }`}
          >
            {tab.label}
            {tab.id === 'analytics' && analyticsIssueCount !== null && analyticsIssueCount > 0 && !(activeTab === 'analytics' && overflowPanel === null) && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-[3px] rounded-full bg-red-500 text-white text-[9px] font-bold leading-[14px] text-center">
                {analyticsIssueCount > 99 ? '99+' : analyticsIssueCount}
              </span>
            )}
          </button>
        ))}

        {/* Command palette trigger */}
        <button
          onClick={() => setShowCommandPalette(v => !v)}
          className="ml-auto flex items-center gap-1 px-2 py-1 mr-1 my-1 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] transition-colors text-[10px]"
          title="Command palette (⌘K)"
          aria-label="Open command palette"
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="4.5" cy="4.5" r="3.5"/>
            <path d="M8 8l2 2"/>
          </svg>
          <span className="opacity-50">⌘K</span>
        </button>

        {/* Heatmap toggle */}
        <button
          onClick={() => {
            if (overflowPanel === 'heatmap') {
              setOverflowPanel(null);
            } else {
              setOverflowPanel('heatmap');
              triggerHeatmapScan();
            }
          }}
          className={`flex items-center justify-center w-7 h-7 mr-0.5 my-1 rounded transition-colors ${
            overflowPanel === 'heatmap'
              ? 'bg-[var(--color-figma-accent)] text-white'
              : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]'
          }`}
          title="Canvas heatmap: token adoption overlay"
          aria-label="Toggle canvas heatmap"
          aria-pressed={overflowPanel === 'heatmap'}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" rx="1"/>
            <rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/>
            <rect x="14" y="14" width="7" height="7" rx="1"/>
          </svg>
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
                Paste tokens <span className="text-[9px] text-[var(--color-figma-text-secondary)] ml-1">⌘⇧V</span>
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
                onClick={() => openOverflowPanel('export')}
                className="w-full text-left px-3 py-2 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Export
              </button>
              <div className="border-t border-[var(--color-figma-border)]" />
              <button
                role="menuitem"
                onClick={() => openOverflowPanel('settings')}
                className="w-full text-left px-3 py-2 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors flex items-center gap-2"
              >
                <span className="flex-1">Server Settings</span>
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${connected ? 'bg-[var(--color-figma-success)]' : checking ? 'bg-[var(--color-figma-text-secondary)] animate-pulse' : 'bg-[var(--color-figma-error)]'}`} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Set selector (for tokens tab) */}
      {activeTab === 'tokens' && overflowPanel === null && sets.length > 0 && (
        <div className="relative">
        <div ref={setTabsScrollRef} className="flex gap-1 px-2 py-1.5 bg-[var(--color-figma-bg-secondary)] border-b border-[var(--color-figma-border)] overflow-x-auto">
          {sets.map(set => {
            const isActive = activeSet === set;
            const isRenaming = renamingSet === set;
            return (
              <div key={set} data-active-set={isActive} className="relative flex group/settab">
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
                      />
                    </div>
                    {renameError && (
                      <span className="text-[9px] text-red-500 mt-0.5 px-1">{renameError}</span>
                    )}
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => setActiveSet(set)}
                      onContextMenu={e => openSetMenu(set, e)}
                      title={setDescriptions[set] || 'Right-click for options'}
                      className={`flex items-center pl-2 pr-1 py-1 rounded-l text-[10px] whitespace-nowrap transition-colors ${
                        isActive
                          ? 'bg-[var(--color-figma-accent)] text-white font-medium'
                          : 'bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
                      }`}
                    >
                      {set}
                      {setTokenCounts[set] !== undefined && (
                        <span className={`ml-1.5 ${isActive ? 'text-white/70' : 'text-[var(--color-figma-text-tertiary)]'}`}>
                          {setTokenCounts[set]}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={e => openSetMenu(set, e)}
                      onContextMenu={e => openSetMenu(set, e)}
                      title="Set options"
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
                onClick={() => openSetMetadata(tabMenuOpen)}
                className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Edit description
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
              <div className="border-t border-[var(--color-figma-border)] my-1" />
              <button
                role="menuitem"
                onMouseDown={e => e.preventDefault()}
                onClick={() => { setDeletingSet(tabMenuOpen); setTabMenuOpen(null); }}
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
                />
              </div>
              {newSetError && (
                <span className="text-[9px] text-red-500 mt-0.5 px-1">{newSetError}</span>
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
        {setTabsOverflow && (
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-[var(--color-figma-bg-secondary)] to-transparent pointer-events-none" aria-hidden="true" />
        )}
        </div>
      )}

      {/* Content */}
      <ErrorBoundary>
      <div className="flex-1 flex flex-col overflow-hidden">
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
              <ImportPanel
                serverUrl={serverUrl}
                connected={connected}
                onImported={refreshTokens}
              />
            </>
          )}
          {overflowPanel === 'export' && (
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
                <span className="text-[10px] font-medium text-[var(--color-figma-text)] ml-1">Export</span>
              </div>
              <ExportPanel serverUrl={serverUrl} connected={connected} />
            </>
          )}
          {overflowPanel === 'settings' && (
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
                <span className="text-[10px] font-medium text-[var(--color-figma-text)] ml-1">Settings</span>
              </div>
            <div className="flex flex-col gap-3 p-3">
              <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
                <div className="px-3 py-2 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between">
                  <span className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide">Server</span>
                  <span className={`flex items-center gap-1 text-[10px] font-medium ${connected ? 'text-[var(--color-figma-success)]' : checking ? 'text-[var(--color-figma-text-secondary)]' : 'text-[var(--color-figma-error)]'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full inline-block ${connected ? 'bg-[var(--color-figma-success)]' : checking ? 'bg-[var(--color-figma-text-secondary)] animate-pulse' : 'bg-[var(--color-figma-error)]'}`} />
                    {connected ? 'Connected' : checking ? 'Checking…' : 'Disconnected'}
                  </span>
                </div>
                <div className="p-3 flex flex-col gap-2">
                  <div>
                    <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Local server URL</label>
                    <input
                      type="text"
                      value={serverUrlInput}
                      onChange={e => { setServerUrlInput(e.target.value); setConnectResult(null); }}
                      onFocus={e => e.target.select()}
                      onKeyDown={async e => {
                        if (e.key === 'Enter') {
                          const url = serverUrlInput.trim() || 'http://localhost:9400';
                          const ok = await updateServerUrlAndConnect(url);
                          setConnectResult(ok ? 'ok' : 'fail');
                        }
                      }}
                      placeholder="http://localhost:9400"
                      className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)]"
                    />
                    <p className="text-[10px] text-[var(--color-figma-text-secondary)] mt-1 leading-relaxed">
                      Run <span className="font-mono">npm start</span> in the TokenManager directory, then press Enter or click Save &amp; Connect.
                    </p>
                  </div>
                  {connectResult === 'ok' && (
                    <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-figma-success)]">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>
                      Connected successfully
                    </div>
                  )}
                  {connectResult === 'fail' && (
                    <div className="text-[10px] text-[var(--color-figma-error)]">
                      <div className="flex items-center gap-1.5 font-medium mb-0.5">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>
                        Cannot reach server
                      </div>
                      <p className="text-[var(--color-figma-text-secondary)] leading-relaxed">
                        Check the URL above, then make sure the server is running (<span className="font-mono">npm start</span>).
                      </p>
                    </div>
                  )}
                  <button
                    onClick={async () => {
                      const url = serverUrlInput.trim() || 'http://localhost:9400';
                      const ok = await updateServerUrlAndConnect(url);
                      setConnectResult(ok ? 'ok' : 'fail');
                    }}
                    disabled={checking}
                    className="w-full px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50 transition-opacity"
                  >
                    {checking ? 'Connecting…' : 'Save & Connect'}
                  </button>
                </div>
              </div>
              <div className="rounded border border-[var(--color-figma-error)] overflow-hidden opacity-80">
                <div className="px-3 py-2 bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-error)] font-medium uppercase tracking-wide">
                  Danger Zone
                </div>
                <div className="p-3 flex flex-col gap-2">
                  {!showClearConfirm ? (
                    <>
                      <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
                        Permanently deletes all tokens, themes, and sets. This cannot be undone.
                      </p>
                      <button
                        onClick={() => { setShowClearConfirm(true); setClearConfirmText(''); }}
                        className="w-full px-3 py-1.5 rounded border border-[var(--color-figma-error)] text-[var(--color-figma-error)] text-[11px] font-medium hover:bg-[var(--color-figma-error)] hover:text-white transition-colors"
                      >
                        Clear all data…
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
                        Type <span className="font-mono font-bold text-[var(--color-figma-error)]">DELETE</span> to confirm.
                      </p>
                      <input
                        type="text"
                        value={clearConfirmText}
                        onChange={e => setClearConfirmText(e.target.value)}
                        placeholder="DELETE"
                        autoFocus
                        className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-error)] text-[var(--color-figma-text)] text-[11px] outline-none font-mono"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setShowClearConfirm(false); setClearConfirmText(''); }}
                          className="flex-1 px-3 py-1.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] text-[11px] font-medium hover:text-[var(--color-figma-text)] transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleClearAll}
                          disabled={clearConfirmText !== 'DELETE' || clearing}
                          className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-error)] text-white text-[11px] font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
                        >
                          {clearing ? 'Clearing…' : 'Clear all data'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
            </>
          )}

          {/* Heatmap panel */}
          {overflowPanel === 'heatmap' && (
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
                <span className="text-[10px] font-medium text-[var(--color-figma-text)] ml-1">Canvas Heatmap</span>
              </div>
              <HeatmapPanel
                result={heatmapResult}
                loading={heatmapLoading}
                onRescan={triggerHeatmapScan}
                onSelectNodes={(ids) => parent.postMessage({ pluginMessage: { type: 'select-heatmap-nodes', nodeIds: ids } }, '*')}
              />
            </>
          )}

          {/* Main tab panels */}
          {overflowPanel === null && activeTab === 'tokens' && tokens.length === 0 && !createFromEmpty && !editingToken && (
            <EmptyState
              connected={connected}
              onCreateToken={() => setEditingToken({ path: '', set: activeSet, isCreate: true })}
              onPasteJSON={() => setShowPasteModal(true)}
              onUsePreset={() => setShowScaffoldWizard(true)}
              onGenerateColorScale={() => setShowColorScaleGen(true)}
            />
          )}
          {overflowPanel === null && activeTab === 'tokens' && (tokens.length > 0 || createFromEmpty) && (
            <TokenList
              tokens={tokens}
              setName={activeSet}
              sets={sets}
              serverUrl={serverUrl}
              connected={connected}
              selectedNodes={selectedNodes}
              allTokensFlat={allTokensFlat}
              onEdit={(path) => { setEditingToken({ path, set: activeSet }); setHighlightedToken(path); }}
              onCreateNew={(initialPath, initialType) => setEditingToken({ path: initialPath ?? '', set: activeSet, isCreate: true, initialType })}
              onRefresh={refreshAll}
              onTokenCreated={(path) => setHighlightedToken(path)}
              lintViolations={lintViolations}
              onPushUndo={pushUndo}
              defaultCreateOpen={createFromEmpty}
              highlightedToken={highlightedToken}
              onNavigateToAlias={handleNavigateToAlias}
              onClearHighlight={() => setHighlightedToken(null)}
              onSyncGroup={(groupPath, tokenCount) => setSyncGroupPending({ groupPath, tokenCount })}
              onSetGroupScopes={(groupPath) => { setGroupScopesPath(groupPath); setGroupScopesSelected([]); }}
              syncSnapshot={Object.keys(syncSnapshot).length > 0 ? syncSnapshot : undefined}
              generators={generators}
              derivedTokenPaths={derivedTokenPaths}
            />
          )}
          {overflowPanel === null && activeTab === 'themes' && (
            <ThemeManager serverUrl={serverUrl} connected={connected} sets={sets} />
          )}
          {overflowPanel === null && activeTab === 'sync' && (
            <SyncPanel serverUrl={serverUrl} connected={connected} activeSet={activeSet} />
          )}
          {overflowPanel === null && activeTab === 'analytics' && (
            <AnalyticsPanel
              serverUrl={serverUrl}
              connected={connected}
              validateKey={validateKey}
              onNavigateToToken={(path, set) => {
                setActiveSet(set);
                setActiveTab('tokens');
                setPendingHighlight(path);
              }}
              onValidationComplete={setAnalyticsIssueCount}
            />
          )}
          {overflowPanel === null && activeTab === 'preview' && (
            <PreviewPanel allTokensFlat={allTokensFlat} />
          )}
        </div>
        {overflowPanel === null && activeTab === 'tokens' && (
          <SelectionInspector
            selectedNodes={selectedNodes}
            tokenMap={allTokensFlat}
            onSync={sync}
            syncing={syncing}
            syncProgress={syncProgress}
            syncResult={syncResult}
            connected={connected}
            activeSet={activeSet}
            serverUrl={serverUrl}
            onTokenCreated={refreshTokens}
            onNavigateToToken={setHighlightedToken}
            onPushUndo={pushUndo}
          />
        )}
      </div>
      </ErrorBoundary>

      {/* Token editor drawer */}
      {editingToken && overflowPanel === null && activeTab === 'tokens' && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end overflow-hidden">
          <div
            className="absolute inset-0 bg-black/30 drawer-fade-in"
            onClick={() => { if (!editorIsDirtyRef.current) handleEditorClose(); }}
          />
          <div className="relative bg-[var(--color-figma-bg)] rounded-t-xl shadow-2xl flex flex-col drawer-slide-up" style={{ height: '65%' }}>
            <div className="flex justify-center pt-2 pb-1 shrink-0">
              <div className="w-8 h-1 rounded-full bg-[var(--color-figma-border)]" />
            </div>
            <div className="flex-1 overflow-hidden">
              <TokenEditor
                tokenPath={editingToken.path}
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
                onSaved={handleEditorSave}
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
              Edit description — {editingMetadataSet}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-[var(--color-figma-text-secondary)]">Description</label>
              <textarea
                autoFocus
                value={metadataDescription}
                onChange={e => setMetadataDescription(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') setEditingMetadataSet(null); }}
                rows={3}
                placeholder="What is this token set for?"
                className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)] resize-none"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setEditingMetadataSet(null)}
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

      {/* Delete set confirmation */}
      {deletingSet && (
        <ConfirmModal
          title={`Delete "${deletingSet}"?`}
          description="All tokens in this set will be permanently deleted."
          confirmLabel="Delete set"
          danger
          onConfirm={handleDeleteSet}
          onCancel={() => setDeletingSet(null)}
        />
      )}

      {/* Sync group to Figma confirmation */}
      {syncGroupPending && (
        <ConfirmModal
          title={`Sync "${syncGroupPending.groupPath}" to Figma?`}
          description={`This will apply ${syncGroupPending.tokenCount} token${syncGroupPending.tokenCount !== 1 ? 's' : ''} from this group to all matching Figma nodes on the page.`}
          confirmLabel="Sync group"
          onConfirm={handleSyncGroup}
          onCancel={() => setSyncGroupPending(null)}
        />
      )}

      {/* Group Scope Editor */}
      {groupScopesPath && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-[var(--color-figma-bg)] rounded border border-[var(--color-figma-border)] shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-figma-border)]">
              <span className="text-[12px] font-semibold text-[var(--color-figma-text)]">Set Figma Scopes</span>
              <button onClick={() => setGroupScopesPath(null)} title="Close" className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]">
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
            <div className="flex gap-2 p-3 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
              <button
                onClick={() => setGroupScopesPath(null)}
                className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] text-[11px] hover:bg-[var(--color-figma-bg-hover)]"
              >Cancel</button>
              <button
                onClick={handleApplyGroupScopes}
                disabled={groupScopesApplying}
                className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50"
              >{groupScopesApplying ? 'Applying…' : 'Apply to group'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Command Palette */}
      {showCommandPalette && (
        <CommandPalette
          commands={commands}
          tokens={paletteTokens}
          onGoToToken={(path) => {
            const targetSet = pathToSet[path];
            setActiveTab('tokens');
            setOverflowPanel(null);
            setEditingToken(null);
            if (targetSet && targetSet !== activeSet) {
              setActiveSet(targetSet);
              setPendingHighlight(path);
            } else {
              setHighlightedToken(path);
            }
          }}
          onCopyTokenCssVar={(path) => {
            const cssVar = `--${path.replace(/\./g, '-')}`;
            navigator.clipboard.writeText(cssVar).catch(() => {});
          }}
          onClose={() => setShowCommandPalette(false)}
        />
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

      {/* Undo/redo toast */}
      {toastVisible && (
        <UndoToast
          description={undoSlot?.description ?? null}
          onUndo={executeUndo}
          onDismiss={dismissToast}
          canUndo={canUndo}
          canRedo={canRedo}
          redoDescription={redoSlot?.description}
          onRedo={executeRedo}
          undoCount={undoCount}
        />
      )}

      {/* Resize handle */}
      <div
        onMouseDown={onResizeHandleMouseDown}
        className="absolute bottom-0 right-0 w-3 h-3 cursor-nwse-resize z-50"
        style={{ touchAction: 'none' }}
      />
    </div>
  );
}
