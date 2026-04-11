/**
 * PanelRouter — routes (activeTopTab, activeSubTab, activeSecondarySurface) to the
 * correct panel component. Eliminates the O(N) condition matrix that previously
 * existed in App.tsx. Adding a new tab requires: one entry in the lookup table
 * + one render function below.
 *
 * Reads ConnectionContext, TokenDataContext, ThemeContext, and InspectContext
 * directly so callers only pass App-local state as props.
 */

import { useCallback, useEffect, useState } from 'react';
import type {
  ReactNode,
  MutableRefObject,
  RefObject,
  Dispatch,
  SetStateAction,
  MouseEvent,
  KeyboardEvent,
} from 'react';
import { TokenList } from '../components/TokenList';
import { UnifiedComparePanel } from '../components/UnifiedComparePanel';
import type { TokenListImperativeHandle } from '../components/tokenListTypes';
import { TokenEditor } from '../components/TokenEditor';
import { TokenGeneratorDialog } from '../components/TokenGeneratorDialog';
import { TokenDetailPreview } from '../components/TokenDetailPreview';
import { ThemeManager } from '../components/ThemeManager';
import type { ThemeManagerHandle } from '../components/ThemeManager';
import { PublishPanel } from '../components/PublishPanel';
import type { PublishPanelHandle } from '../components/PublishPanel';
import { ImportPanel } from '../components/ImportPanel';
import type { ImportCompletionResult } from '../components/ImportPanelContext';
import { SelectionInspector } from '../components/SelectionInspector';
import type { SelectionInspectorHandle } from '../components/SelectionInspector';
import { CanvasAnalysisPanel } from '../components/CanvasAnalysisPanel';
import { GraphPanel } from '../components/GraphPanel';
import { TokenFlowPanel } from '../components/TokenFlowPanel';
import { ExportPanel } from '../components/ExportPanel';
import { HistoryPanel } from '../components/HistoryPanel';
import { HealthPanel } from '../components/HealthPanel';
import { PreviewPanel } from '../components/PreviewPanel';
import { getStartHereBranchCopy, TOKENS_START_HERE_BRANCHES, type StartHereBranch } from '../components/WelcomePrompt';
import { SettingsPanel } from '../components/SettingsPanel';
import { NotificationsPanel } from '../components/NotificationsPanel';
import { KeyboardShortcutsPanel } from '../components/KeyboardShortcutsPanel';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useConnectionContext, useSyncContext } from '../contexts/ConnectionContext';
import { useTokenSetsContext, useTokenFlatMapContext, useGeneratorContext } from '../contexts/TokenDataContext';
import { useThemeSwitcherContext, useResolverContext } from '../contexts/ThemeContext';
import { useSelectionContext, useHeatmapContext, useUsageContext } from '../contexts/InspectContext';
import { useNavigationContext } from '../contexts/NavigationContext';
import { useEditorContext } from '../contexts/EditorContext';
import type { TokenNode } from '../hooks/useTokens';
import type { LintViolation } from '../hooks/useLint';
import type { ValidationIssue, ValidationSummary } from '../hooks/useValidationCache';
import type { UndoSlot } from '../hooks/useUndo';
import type { OperationEntry } from '../hooks/useRecentOperations';
import type { RecentlyTouchedState } from '../hooks/useRecentlyTouched';
import type { StarredTokensState } from '../hooks/useStarredTokens';
import type { NotificationEntry } from '../hooks/useToastStack';
import type {
  TopTab,
  SubTab,
  SecondarySurfaceId,
  SurfaceTransition,
  TokensLibraryContextualSurface,
} from '../shared/navigationTypes';
import { TOKENS_LIBRARY_SURFACE_CONTRACT } from '../shared/navigationTypes';
import type { ThemeWorkspaceShellState } from '../shared/themeWorkflow';
import { useEditorWidth } from '../hooks/useEditorWidth';

const LAST_CREATE_GROUP_STORAGE_KEY = 'tm_last_create_group';
const LAST_CREATE_TYPE_STORAGE_KEY = 'tm_last_token_type';

function readLastCreateGroup(): string {
  try {
    return localStorage.getItem(LAST_CREATE_GROUP_STORAGE_KEY) || '';
  } catch (error) {
    console.debug('[PanelRouter] failed to read last create group:', error);
    return '';
  }
}

function readLastCreateType(): string {
  try {
    return localStorage.getItem(LAST_CREATE_TYPE_STORAGE_KEY) || 'color';
  } catch (error) {
    console.debug('[PanelRouter] failed to read last create type:', error);
    return 'color';
  }
}

function persistLastCreateGroup(tokenPath: string): void {
  const groupPath = tokenPath.includes('.') ? tokenPath.split('.').slice(0, -1).join('.') : '';
  try {
    localStorage.setItem(LAST_CREATE_GROUP_STORAGE_KEY, groupPath);
  } catch (error) {
    console.debug('[PanelRouter] failed to persist last create group:', error);
  }
}

function persistLastCreateType(tokenType: string): void {
  try {
    localStorage.setItem(LAST_CREATE_TYPE_STORAGE_KEY, tokenType);
  } catch (error) {
    console.debug('[PanelRouter] failed to persist last create type:', error);
  }
}

function resolveCreateLauncherPath(initialPath?: string): string {
  if (initialPath !== undefined) return initialPath;
  const lastGroup = readLastCreateGroup();
  return lastGroup ? `${lastGroup}.` : '';
}

// ---------------------------------------------------------------------------
// Props interface
// ---------------------------------------------------------------------------

export interface PanelRouterProps {
  useSidePanel: boolean;
  contextualEditorTransition: SurfaceTransition;
  splitPreviewTransition: SurfaceTransition;
  showPreviewSplit: boolean;
  setShowPreviewSplit: Dispatch<SetStateAction<boolean>>;
  guardEditorAction: (fn: () => void) => void;
  editorIsDirtyRef: MutableRefObject<boolean>;
  editorCloseRef: MutableRefObject<() => void>;
  displayedLeafNodesRef: MutableRefObject<TokenNode[]>;
  tokenListCompareRef: MutableRefObject<TokenListImperativeHandle | null>;
  handleEditorNavigate: (direction: 1 | -1) => void;
  handleEditorSave: (savedPath: string) => void;
  handleEditorSaveAndCreateAnother: (savedPath: string, savedType: string) => void;
  handlePreviewEdit: () => void;
  handlePreviewClose: () => void;
  splitRatio: number;
  splitValueNow: number;
  splitContainerRef: RefObject<HTMLDivElement>;
  handleSplitDragStart: (e: MouseEvent) => void;
  handleSplitKeyDown: (e: KeyboardEvent) => void;

  // Font data
  availableFonts: string[];
  fontWeightsByFamily: Record<string, number[]>;

  // Token list display state
  showIssuesOnly: boolean;
  setShowIssuesOnly: Dispatch<SetStateAction<boolean>>;
  lintViolations: LintViolation[];
  /** Set-level cascade diff from useSetTabs — not in any context */
  cascadeDiff: Record<string, { before: unknown; after: unknown }> | null;

  // Validation
  validationIssues: ValidationIssue[] | null;
  validationSummary: ValidationSummary | null;
  validationLoading: boolean;
  validationError: string | null;
  validationLastRefreshed: Date | null;
  validationIsStale: boolean;
  refreshValidation: () => void;

  // History / operations
  recentOperations: OperationEntry[];
  totalOperations: number;
  hasMoreOperations: boolean;
  loadMoreOperations: () => void;
  handleRollback: (id: string) => void;
  handleServerRedo: (opId?: string) => void;
  undoDescriptions: string[];
  redoableOpIds: Set<string>;
  executeUndo: () => Promise<void>;
  canUndo: boolean;

  // Sync confirmation state (not the actual sync, which is in ConnectionContext)
  setSyncGroupPending: (v: { groupPath: string; tokenCount: number } | null) => void;
  setSyncGroupStylesPending: (v: { groupPath: string; tokenCount: number } | null) => void;
  setGroupScopesPath: (path: string | null) => void;
  setGroupScopesSelected: Dispatch<SetStateAction<string[]>>;
  setGroupScopesError: (err: string | null) => void;
  tokenChangeKey: number;

  // Generator / graph state
  pendingGraphTemplate: string | null;
  setPendingGraphTemplate: (id: string | null) => void;
  pendingGraphFromGroup: { groupPath: string; tokenType: string | null } | null;
  setPendingGraphFromGroup: (v: { groupPath: string; tokenType: string | null } | null) => void;
  focusGeneratorId: string | null;
  setFocusGeneratorId: (id: string | null) => void;
  pendingOpenPicker: boolean;
  setPendingOpenPicker: (v: boolean) => void;

  // Refs
  themeManagerHandleRef: MutableRefObject<ThemeManagerHandle | null>;
  publishPanelHandleRef: MutableRefObject<PublishPanelHandle | null>;
  selectionInspectorHandleRef: MutableRefObject<SelectionInspectorHandle | null>;

  // Token drag callbacks — notified by TokenList when a cross-set drag starts/ends
  onTokenDragStart?: (paths: string[], fromSet: string) => void;
  onTokenDragEnd?: () => void;

  // Action callbacks
  refreshAll: () => void;
  pushUndo: (slot: UndoSlot) => void;
  setErrorToast: (msg: string) => void;
  setSuccessToast: (msg: string) => void;
  handleNavigateToSet: (set: string, path: string) => void;
  setFlowPanelInitialPath: (path: string | null) => void;
  flowPanelInitialPath: string | null;
  openCommandPaletteWithQuery: (query: string) => void;
  handleNavigateToGenerator: (id: string) => void;
  setThemeGapCount: (n: number) => void;
  onThemeShellStateChange: (state: ThemeWorkspaceShellState) => void;
  triggerCreateToken: number;
  recentlyTouched: RecentlyTouchedState;
  starredTokens: StarredTokensState;
  onImportComplete: (result: ImportCompletionResult) => void;
  // Modal openers (for EmptyState + other panels that trigger global modals)
  onShowPasteModal: () => void;
  onShowColorScaleGen: () => void;
  onOpenStartHere: (branch?: StartHereBranch) => void;

  onRestartGuidedSetup: () => void;
  /** Called after "Clear all data" — navigate away and refresh tokens */
  onClearAllComplete?: () => void;
  notificationHistory: NotificationEntry[];
  clearNotificationHistory: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PanelRouter(p: PanelRouterProps): ReactNode {
  // Navigation and editor state from contexts (previously passed as props)
  const { activeTopTab, activeSubTab, activeSecondarySurface, navigateTo, closeSecondarySurface, setReturnBreadcrumb } = useNavigationContext();
  const {
    editingToken, setEditingToken, editingGenerator, setEditingGenerator, previewingToken, setPreviewingToken,
    highlightedToken, setHighlightedToken, createFromEmpty, setCreateFromEmpty,
    setPendingHighlight, handleNavigateToAlias, handleNavigateBack, navHistoryLength,
    showTokensCompare, setShowTokensCompare, tokensCompareMode, setTokensCompareMode,
    tokensComparePaths, setTokensComparePaths, tokensComparePath, setTokensComparePath,
    tokensCompareThemeKey, setTokensCompareThemeKey, tokensCompareDefaultA, tokensCompareDefaultB, tokensContextualSurfaceState,
    switchContextualSurface,
  } = useEditorContext();
  const activeTokensContextualSurface = tokensContextualSurfaceState.activeSurface;

  // Read all four contexts — these cover ~40% of the data that panels need.
  const {
    serverUrl, connected, checking,
    updateServerUrlAndConnect,
  } = useConnectionContext();
  const { sync, syncing, syncProgress, syncResult, syncError } = useSyncContext();
  const {
    sets, activeSet, setActiveSet, tokens,
    setCollectionNames, setModeNames,
    fetchError, refreshTokens, addSetToState,
  } = useTokenSetsContext();
  const {
    allTokensFlat, pathToSet, perSetFlat, syncSnapshot,
    tokensError, tokensLoading, setFilteredSetCount,
  } = useTokenFlatMapContext();
  const {
    generators, generatorsByTargetGroup, derivedTokenPaths, generatorsLoading, refreshGenerators,
  } = useGeneratorContext();
  const {
    dimensions, setDimensions, activeThemes, setActiveThemes, themedAllTokensFlat,
  } = useThemeSwitcherContext();
  const resolverState = useResolverContext();
  const { selectedNodes } = useSelectionContext();
  const {
    heatmapResult, heatmapLoading, heatmapError, heatmapProgress,
    heatmapScope: _heatmapScope, setHeatmapScope: _setHeatmapScope, triggerHeatmapScan, cancelHeatmapScan: _cancelHeatmapScan,
  } = useHeatmapContext();
  const { tokenUsageCounts } = useUsageContext();

  const [historyFilterPath, setHistoryFilterPath] = useState<string | null>(null);
  const editingGeneratorData = editingGenerator
    ? (generators.find(generator => generator.id === editingGenerator.id) ?? null)
    : null;

  useEffect(() => {
    if (!editingGenerator || editingGeneratorData) return;
    setEditingGenerator(null);
  }, [editingGenerator, editingGeneratorData, setEditingGenerator]);

  useEffect(() => {
    if (!p.showPreviewSplit) return;
    if (
      activeTokensContextualSurface === 'compare'
      || activeTokensContextualSurface === 'token-editor'
      || activeTokensContextualSurface === 'generator-editor'
    ) {
      p.setShowPreviewSplit(false);
    }
  }, [activeTokensContextualSurface, p.showPreviewSplit, p.setShowPreviewSplit]);

  const editingTokenType = editingToken
    ? (allTokensFlat[editingToken.path]?.$type ?? editingToken.initialType)
    : undefined;
  const { editorWidth, handleEditorWidthDragStart } = useEditorWidth(editingTokenType);
  const tokenListHighlightedPath = editingToken?.path || previewingToken?.path || highlightedToken;
  const hasTokensLibrarySurface = tokens.length > 0 || createFromEmpty || activeTokensContextualSurface !== null;

  const openCreateLauncher = useCallback((options?: {
    initialPath?: string;
    initialType?: string;
    initialValue?: string;
    set?: string;
  }) => {
    const targetSet = options?.set ?? activeSet;
    switchContextualSurface({
      surface: 'token-editor',
      token: {
        path: resolveCreateLauncherPath(options?.initialPath),
        set: targetSet,
        isCreate: true,
        initialType: options?.initialType ?? readLastCreateType(),
        initialValue: options?.initialValue,
        createPresentation: 'launcher',
      },
    });
  }, [activeSet, switchContextualSurface]);

  const openTokenEditor = useCallback((options: {
    path: string;
    set: string;
    name?: string;
  }) => {
    p.setShowPreviewSplit(false);
    setPreviewingToken(null);
    setHighlightedToken(options.path);
    if (options.set !== activeSet) {
      setActiveSet(options.set);
    }
    switchContextualSurface({
      surface: 'token-editor',
      token: {
        path: options.path,
        name: options.name,
        set: options.set,
      },
    });
  }, [
    activeSet,
    p.setShowPreviewSplit,
    setActiveSet,
    setHighlightedToken,
    setPreviewingToken,
    switchContextualSurface,
  ]);

  const handleTokenEditorBack = useCallback(() => {
    if (editingToken?.isCreate) {
      setCreateFromEmpty(false);
    }
    setEditingToken(null);
    p.refreshAll();
  }, [editingToken?.isCreate, p.refreshAll, setCreateFromEmpty, setEditingToken]);

  const handleTokenEditorSaved = useCallback((savedPath: string) => {
    if (editingToken?.isCreate) {
      persistLastCreateGroup(savedPath);
      setCreateFromEmpty(false);
    }
    p.handleEditorSave(savedPath);
  }, [editingToken?.isCreate, p.handleEditorSave, setCreateFromEmpty]);

  const handleTokenEditorSaveAndCreateAnother = useCallback((savedPath: string, savedType: string) => {
    persistLastCreateGroup(savedPath);
    persistLastCreateType(savedType);
    setCreateFromEmpty(false);
    setHighlightedToken(savedPath);
    p.refreshAll();
    const segments = savedPath.split('.');
    const parentPrefix = segments.length > 1 ? `${segments.slice(0, -1).join('.')}.` : '';
    setEditingToken({
      path: parentPrefix,
      set: editingToken?.set ?? activeSet,
      isCreate: true,
      initialType: savedType,
      createPresentation: 'launcher',
    });
  }, [activeSet, editingToken?.set, p.refreshAll, setCreateFromEmpty, setEditingToken, setHighlightedToken]);

  useEffect(() => {
    if (!createFromEmpty || editingToken || editingGenerator || previewingToken || showTokensCompare) return;
    p.setShowPreviewSplit(false);
    openCreateLauncher();
  }, [
    createFromEmpty,
    editingGenerator,
    editingToken,
    openCreateLauncher,
    p.setShowPreviewSplit,
    previewingToken,
    showTokensCompare,
  ]);

  // Build the common TokenList `actions` object once — it's identical across the
  // three TokenList render variants (side-panel, no-split, preview-split).
  const tokenListActions = {
    onEdit: (path: string, name?: string) => p.guardEditorAction(() => {
      p.setShowPreviewSplit(false);
      switchContextualSurface({
        surface: 'token-editor',
        token: { path, name, set: activeSet },
      });
      setHighlightedToken(path);
    }),
    onPreview: (path: string, name?: string) => {
      switchContextualSurface({
        surface: 'token-preview',
        token: { path, name, set: activeSet },
      });
      setHighlightedToken(path);
    },
    onCreateNew: (initialPath: string | undefined, initialType: string | undefined, initialValue: string | undefined) =>
      {
        p.setShowPreviewSplit(false);
        openCreateLauncher({ initialPath, initialType, initialValue });
      },
    onRefresh: p.refreshAll,
    onPushUndo: p.pushUndo,
    onTokenCreated: (path: string) => setHighlightedToken(path),
    onNavigateToAlias: handleNavigateToAlias,
    onNavigateBack: handleNavigateBack,
    navHistoryLength: navHistoryLength,
    onClearHighlight: () => setHighlightedToken(null),
    onSyncGroup: (groupPath: string, tokenCount: number) => p.setSyncGroupPending({ groupPath, tokenCount }),
    onSyncGroupStyles: (groupPath: string, tokenCount: number) => p.setSyncGroupStylesPending({ groupPath, tokenCount }),
    onSetGroupScopes: (groupPath: string) => {
      p.setGroupScopesPath(groupPath);
      p.setGroupScopesSelected([]);
      p.setGroupScopesError(null);
    },
    onGenerateScaleFromGroup: (groupPath: string, tokenType: string | null) => {
      p.setPendingGraphFromGroup({ groupPath, tokenType });
      navigateTo('define', 'generators');
    },
    onRefreshGenerators: p.refreshAll,
    onToggleIssuesOnly: () => p.setShowIssuesOnly(v => !v),
    onFilteredCountChange: setFilteredSetCount,
    onNavigateToSet: p.handleNavigateToSet,
    onViewTokenHistory: (path: string) => {
      setHistoryFilterPath(path);
      navigateTo('ship', 'history');
    },
    onEditGenerator: (generatorId: string) => p.guardEditorAction(() => {
      p.setShowPreviewSplit(false);
      switchContextualSurface({
        surface: 'generator-editor',
        generator: { id: generatorId },
      });
    }),
    onNavigateToGenerator: p.handleNavigateToGenerator,
    onShowReferences: (path: string) => {
      p.setFlowPanelInitialPath(path);
      navigateTo('apply', 'dependencies');
    },
    onDisplayedLeafNodesChange: (nodes: TokenNode[]) => { p.displayedLeafNodesRef.current = nodes; },
    onTokenTouched: (path: string) => {
      p.recentlyTouched.recordTouch(path);
    },
    onToggleStar: (path: string) => p.starredTokens.toggleStar(path, activeSet),
    starredPaths: new Set(p.starredTokens.tokens.filter(t => t.setName === activeSet).map(t => t.path)),
    onError: p.setErrorToast,
    onOpenCompare: (paths: Set<string>) => {
      p.setShowPreviewSplit(false);
      switchContextualSurface({
        surface: 'compare',
        mode: 'tokens',
        paths,
      });
    },
    onOpenCrossThemeCompare: (path: string) => {
      p.setShowPreviewSplit(false);
      switchContextualSurface({
        surface: 'compare',
        mode: 'cross-theme',
        path,
      });
    },
    onOpenCommandPaletteWithQuery: p.openCommandPaletteWithQuery,
    onOpenStartHere: p.onOpenStartHere,
    onTogglePreviewSplit: () => p.setShowPreviewSplit(v => !v),
    onTokenDragStart: p.onTokenDragStart,
    onTokenDragEnd: p.onTokenDragEnd,
  };

  // Common TokenEditor props shared between side-panel and drawer variants
  const tokenEditorProps = editingToken ? {
    tokenPath: editingToken.path,
    tokenName: editingToken.name,
    setName: editingToken.set,
    serverUrl,
    onBack: handleTokenEditorBack,
    allTokensFlat,
    pathToSet,
    generators,
    allSets: sets,
    onRefreshGenerators: p.refreshAll,
    isCreateMode: editingToken.isCreate,
    initialType: editingToken.initialType,
    initialValue: editingToken.initialValue,
    createPresentation: editingToken.createPresentation,
    onDirtyChange: (dirty: boolean) => { p.editorIsDirtyRef.current = dirty; },
    closeRef: p.editorCloseRef,
    onSaved: handleTokenEditorSaved,
    onSaveAndCreateAnother: handleTokenEditorSaveAndCreateAnother,
    dimensions,
    perSetFlat,
    onRefresh: p.refreshAll,
    availableFonts: p.availableFonts,
    fontWeightsByFamily: p.fontWeightsByFamily,
    derivedTokenPaths,
    onShowReferences: (path: string) => { p.setFlowPanelInitialPath(path); navigateTo('apply', 'dependencies'); },
    onNavigateToToken: handleNavigateToAlias,
    onNavigateToGenerator: p.handleNavigateToGenerator,
  } : null;

  const renderTokensComparePanel = () => (
    <UnifiedComparePanel
      mode={tokensCompareMode}
      onModeChange={setTokensCompareMode}
      tokenPaths={tokensComparePaths}
      onClearTokenPaths={() => setTokensComparePaths(new Set())}
      tokenPath={tokensComparePath}
      onClearTokenPath={() => setTokensComparePath('')}
      allTokensFlat={allTokensFlat}
      pathToSet={pathToSet}
      dimensions={dimensions}
      sets={sets}
      themeOptionsKey={tokensCompareThemeKey}
      themeOptionsDefaultA={tokensCompareDefaultA}
      themeOptionsDefaultB={tokensCompareDefaultB}
      onEditToken={(set, path) => {
        p.guardEditorAction(() => {
          openTokenEditor({ path, set });
        });
      }}
      onCreateToken={(path, set, type, value) => {
        p.guardEditorAction(() => {
          openCreateLauncher({ initialPath: path, initialType: type, initialValue: value, set });
        });
      }}
      onGoToTokens={() => setShowTokensCompare(false)}
      serverUrl={serverUrl}
      onTokensCreated={p.refreshAll}
      onBack={() => setShowTokensCompare(false)}
      backLabel="Back to tokens"
    />
  );

  const generatorEditorProps = editingGeneratorData ? {
    serverUrl,
    allSets: sets,
    activeSet,
    allTokensFlat,
    existingGenerator: editingGeneratorData,
    pathToSet,
    onClose: () => { setEditingGenerator(null); p.refreshAll(); },
    onSaved: () => { setEditingGenerator(null); p.refreshAll(); },
    onPushUndo: p.pushUndo,
    presentation: 'panel' as const,
    onDirtyChange: (dirty: boolean) => { p.editorIsDirtyRef.current = dirty; },
    closeRef: p.editorCloseRef,
  } : null;

  type TokensContextualSurfaceRenderState = {
    surface: TokensLibraryContextualSurface;
    content: ReactNode;
    onDismiss: () => void;
    height: string;
  };

  const getTokensContextualSurfaceRenderState = (): TokensContextualSurfaceRenderState | null => {
    if (activeTokensContextualSurface === 'token-editor' && editingToken && tokenEditorProps) {
      return {
        surface: 'token-editor',
        content: <TokenEditor {...tokenEditorProps} />,
        onDismiss: p.editorCloseRef.current,
        height: '65%',
      };
    }

    if (activeTokensContextualSurface === 'generator-editor' && editingGeneratorData && generatorEditorProps) {
      return {
        surface: 'generator-editor',
        content: <TokenGeneratorDialog {...generatorEditorProps} />,
        onDismiss: p.editorCloseRef.current,
        height: '72%',
      };
    }

    if (activeTokensContextualSurface === 'token-preview' && previewingToken) {
      return {
        surface: 'token-preview',
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
            generators={generators}
            derivedTokenPaths={derivedTokenPaths}
            lintViolations={p.lintViolations.filter(violation => violation.path === previewingToken.path)}
            syncSnapshot={Object.keys(syncSnapshot).length > 0 ? syncSnapshot : undefined}
            serverUrl={serverUrl}
            onEdit={p.handlePreviewEdit}
            onClose={p.handlePreviewClose}
            onNavigateToAlias={handleNavigateToAlias}
          />
        ),
        onDismiss: p.handlePreviewClose,
        height: '50%',
      };
    }

    if (activeTokensContextualSurface === 'compare' && showTokensCompare) {
      return {
        surface: 'compare',
        content: renderTokensComparePanel(),
        onDismiss: () => setShowTokensCompare(false),
        height: '72%',
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
        data={{ tokens, allTokensFlat: themedAllTokensFlat, lintViolations: p.lintViolations, syncSnapshot: Object.keys(syncSnapshot).length > 0 ? syncSnapshot : undefined, generators, generatorsByTargetGroup, derivedTokenPaths, tokenUsageCounts, cascadeDiff: p.cascadeDiff ?? undefined, perSetFlat, collectionMap: setCollectionNames, modeMap: setModeNames, dimensions, unthemedAllTokensFlat: allTokensFlat, pathToSet, activeThemes }}
        actions={tokenListActions}
        recentlyTouched={p.recentlyTouched}
        defaultCreateOpen={createFromEmpty}
        highlightedToken={tokenListHighlightedPath}
        showIssuesOnly={p.showIssuesOnly}
        showPreviewSplit={p.showPreviewSplit}
        editingTokenPath={editingToken?.path}
        compareHandle={p.tokenListCompareRef}
      />
    </div>
  );

  const renderWideTokensContextualSurface = (surfaceState: TokensContextualSurfaceRenderState) => (
    <div
      className="shrink-0 border-l border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] flex flex-row overflow-hidden"
      style={{ width: editorWidth }}
      data-surface-kind={p.contextualEditorTransition.kind}
      data-surface-presentation={p.contextualEditorTransition.presentation}
      data-tokens-library-surface-slot={TOKENS_LIBRARY_SURFACE_CONTRACT.contextualPanel.id}
      data-tokens-library-contextual-surface={surfaceState.surface}
      onKeyDown={(e) => {
        if ((e.key === ']' || e.key === '[') && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
          e.preventDefault();
          p.handleEditorNavigate(e.key === ']' ? 1 : -1);
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
    if (p.useSidePanel || p.showPreviewSplit) return null;

    const surfaceState = getTokensContextualSurfaceRenderState();
    if (!surfaceState) return null;

    return (
      <div
        className="fixed inset-0 z-40 flex flex-col justify-end overflow-hidden"
        data-surface-kind={p.contextualEditorTransition.kind}
        data-surface-presentation={p.contextualEditorTransition.presentation}
        data-tokens-library-surface-slot={TOKENS_LIBRARY_SURFACE_CONTRACT.contextualPanel.id}
        data-tokens-library-contextual-surface={surfaceState.surface}
        onKeyDown={(e) => {
          if ((e.key === ']' || e.key === '[') && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
            e.preventDefault();
            p.handleEditorNavigate(e.key === ']' ? 1 : -1);
          }
        }}
      >
        <div
          className="absolute inset-0 bg-black/30 drawer-fade-in"
          onClick={() => surfaceState.onDismiss()}
        />
        <div className="relative flex flex-col rounded-t-xl bg-[var(--color-figma-bg)] shadow-2xl drawer-slide-up" style={{ height: surfaceState.height }}>
          <div className="flex justify-center pt-2 pb-1 shrink-0">
            <div className="w-8 h-1 rounded-full bg-[var(--color-figma-border)]" />
          </div>
          <div className="flex-1 overflow-hidden">
            {surfaceState.content}
          </div>
        </div>
      </div>
    );
  };

  type SecondaryPanelRenderer = () => ReactNode;

  // Secondary surfaces are full-height takeovers: they keep the shell visible
  // while replacing the main body until the user closes them.
  const SECONDARY_PANEL_MAP: Partial<Record<SecondarySurfaceId, SecondaryPanelRenderer>> = {
    import: () => (
      <ErrorBoundary panelName="Import" onReset={closeSecondarySurface}>
        <div className="flex h-full flex-col overflow-hidden">
          <div className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-2.5">
            <h2 className="text-[11px] font-medium text-[var(--color-figma-text)]">Import tokens</h2>
            <p className="mt-1 text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">
              Bring in Figma variables, token files, code exports, or migration inputs without leaving the current shell.
            </p>
          </div>
          <ImportPanel
            serverUrl={serverUrl}
            connected={connected}
            onImported={refreshTokens}
            onImportComplete={(result) => {
              p.onImportComplete(result);
              navigateTo('define', 'tokens');
              const primaryDestinationSet = result.destinationSets[0];
              if (primaryDestinationSet) {
                setActiveSet(primaryDestinationSet);
              }
              closeSecondarySurface();
            }}
            onPushUndo={p.pushUndo}
          />
        </div>
      </ErrorBoundary>
    ),
    notifications: () => (
      <NotificationsPanel
        history={p.notificationHistory}
        onClear={p.clearNotificationHistory}
      />
    ),
    shortcuts: () => <KeyboardShortcutsPanel />,
    settings: () => (
      <SettingsPanel
        serverUrl={serverUrl}
        connected={connected}
        checking={checking}
        updateServerUrlAndConnect={updateServerUrlAndConnect}
        onRestartGuidedSetup={p.onRestartGuidedSetup}
        onClearAllComplete={p.onClearAllComplete}
        onClose={closeSecondarySurface}
      />
    ),
  };

  if (activeSecondarySurface && activeSecondarySurface !== 'sets') {
    const secondaryRenderer = SECONDARY_PANEL_MAP[activeSecondarySurface];
    return secondaryRenderer ? secondaryRenderer() : null;
  }

  // ---------------------------------------------------------------------------
  // Sub-tab panel routing — O(1) lookup, no repeated condition guards
  // ---------------------------------------------------------------------------

  type PanelRenderer = () => ReactNode;

  const PANEL_MAP: Record<TopTab, Partial<Record<SubTab, PanelRenderer>>> = {
    define: {
      tokens:     renderDefineTokens,
      generators: renderDefineGenerators,
      themes:     renderDefineThemes,
    },
    apply: {
      inspect:          renderApplyInspect,
      'canvas-analysis': renderApplyCanvasAnalysis,
      dependencies:     renderApplyDependencies,
    },
    ship: {
      publish:    renderShipPublish,
      export:     renderShipExport,
      history:    renderShipHistory,
      health: renderShipHealth,
    },
  };

  const renderer = PANEL_MAP[activeTopTab]?.[activeSubTab];
  return renderer ? renderer() : null;

  // ---------------------------------------------------------------------------
  // Panel render functions — each closes over context + props
  // ---------------------------------------------------------------------------

  function renderDefineTokens(): ReactNode {
    const renderTokensStartSurface = (title: string, description: string) => (
      <div className="flex h-full flex-col items-center justify-center gap-5 overflow-y-auto px-5 py-8 text-center">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
            </svg>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-[13px] font-semibold text-[var(--color-figma-text)]">{title}</p>
            <p className="max-w-[280px] text-[11px] leading-relaxed text-[var(--color-figma-text-secondary)]">
              {description}
            </p>
          </div>
        </div>

        {!connected && (
          <div className="flex w-full max-w-[310px] items-center gap-2 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-2 text-left">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--color-figma-text-secondary)]" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p className="text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
              Start here still works offline. Guided setup can walk you through reconnecting before you import, generate, or create tokens.
            </p>
          </div>
        )}

        <div className="flex w-full max-w-[310px] flex-col gap-2 text-left">
          {TOKENS_START_HERE_BRANCHES.map((branch) => {
            const shortcut = getStartHereBranchCopy(branch);
            const isRecommended = branch === 'guided-setup';
            return (
              <button
                key={branch}
                onClick={() => p.onOpenStartHere(branch)}
                className={[
                  'rounded-lg border px-3 py-2.5 text-left transition-colors',
                  isRecommended
                    ? 'border-[var(--color-figma-accent)]/35 bg-[var(--color-figma-accent)]/5 hover:border-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/10'
                    : 'border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)]',
                ].join(' ')}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium text-[var(--color-figma-text)]">{shortcut.title}</span>
                  {isRecommended && (
                    <span className="rounded-full bg-[var(--color-figma-bg-secondary)] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-[var(--color-figma-text-secondary)]">
                      Recommended
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">
                  {shortcut.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    );

    const wideContextualSurface = !p.showPreviewSplit && p.useSidePanel
      ? getTokensContextualSurfaceRenderState()
      : null;

    return (
      <>
        {/* Fetch error banner */}
        {(fetchError || tokensError) && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border-b border-red-500/20 shrink-0">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-400 shrink-0" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
            <span className="text-[10px] text-[var(--color-figma-text-secondary)] flex-1 truncate">Failed to load tokens: {fetchError || tokensError}</span>
            <button
              onClick={refreshTokens}
              className="text-[10px] px-2 py-0.5 rounded border border-red-400/40 text-red-400 hover:bg-red-400/10 transition-colors shrink-0"
            >
              Retry
            </button>
          </div>
        )}
        {/* Empty state */}
        {tokens.length === 0 && !createFromEmpty && !editingToken && (
          renderTokensStartSurface(
            'Build your token system',
            'Choose the exact start branch you want to open. Every onboarding path resolves through the same Start here flow.',
          )
        )}
        {/* Main content: TokenList variants */}
        {hasTokensLibrarySurface && !p.showPreviewSplit && (
          <div className="flex h-full overflow-hidden">
            {renderTokensLibraryBody()}
            {wideContextualSurface ? renderWideTokensContextualSurface(wideContextualSurface) : null}
          </div>
        )}
        {/* Preview split view */}
        {hasTokensLibrarySurface && p.showPreviewSplit && (
          <div
            ref={p.splitContainerRef}
            className="flex flex-col h-full overflow-hidden"
            data-surface-kind={p.splitPreviewTransition.kind}
            data-surface-presentation={p.splitPreviewTransition.presentation}
            data-tokens-library-surface-slot={TOKENS_LIBRARY_SURFACE_CONTRACT.splitPreview.id}
          >
            <div style={{ height: `${p.splitRatio * 100}%`, flexShrink: 0, overflow: 'hidden' }}>
              {renderTokensLibraryBody()}
            </div>
            <div
              role="separator"
              aria-orientation="horizontal"
              aria-valuenow={p.splitValueNow}
              aria-valuemin={20}
              aria-valuemax={80}
              aria-label="Resize token list and preview"
              tabIndex={0}
              className="h-1 flex-shrink-0 cursor-row-resize bg-[var(--color-figma-border)] hover:bg-[var(--color-figma-accent)] focus-visible:bg-[var(--color-figma-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-figma-accent)] transition-colors"
              onMouseDown={p.handleSplitDragStart}
              onKeyDown={p.handleSplitKeyDown}
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
                    const name = path.split('.').pop();
                    const set = pathToSet[path] ?? activeSet;
                    setPreviewingToken({ path, name, set });
                    setHighlightedToken(path);
                  }}
                  focusedToken={previewingToken}
                  pathToSet={pathToSet}
                  onClearFocus={() => setPreviewingToken(null)}
                  lintViolations={p.lintViolations}
                  syncSnapshot={Object.keys(syncSnapshot).length > 0 ? syncSnapshot : undefined}
                  onEditToken={(path, name, set) => {
                    p.guardEditorAction(() => {
                      openTokenEditor({ path, name, set: set ?? activeSet });
                    });
                  }}
                  serverUrl={serverUrl}
                  tokenUsageCounts={tokenUsageCounts}
                  generators={generators}
                  derivedTokenPaths={derivedTokenPaths}
                />
              </ErrorBoundary>
            </div>
          </div>
        )}
        {renderNarrowTokensContextualSurface()}
      </>
    );
  }

  function renderDefineGenerators(): ReactNode {
    return (
      <ErrorBoundary panelName="Generators" onReset={() => navigateTo('define', 'tokens')}>
        <GraphPanel
          serverUrl={serverUrl}
          activeSet={activeSet}
          allSets={sets}
          generators={generators}
          loading={generatorsLoading}
          connected={connected}
          onRefresh={() => { p.refreshAll(); refreshGenerators(); }}
          onPushUndo={p.pushUndo}
          pendingTemplateId={p.pendingGraphTemplate}
          onApplyTemplate={() => p.setPendingGraphTemplate(null)}
          pendingGroupPath={p.pendingGraphFromGroup?.groupPath ?? null}
          pendingGroupTokenType={p.pendingGraphFromGroup?.tokenType ?? null}
          onClearPendingGroup={() => { p.setPendingGraphFromGroup(null); p.setPendingOpenPicker(false); }}
          focusGeneratorId={p.focusGeneratorId}
          onClearFocusGenerator={() => p.setFocusGeneratorId(null)}
          openTemplatePicker={p.pendingOpenPicker}
        />
      </ErrorBoundary>
    );
  }

  function renderDefineThemes(): ReactNode {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex-1 overflow-hidden">
          <ErrorBoundary panelName="Themes" onReset={() => navigateTo('define', 'tokens')}>
            <ThemeManager
              serverUrl={serverUrl}
              connected={connected}
              sets={sets}
              onDimensionsChange={setDimensions}
              onNavigateToToken={(path, set) => { navigateTo('define', 'tokens'); p.handleNavigateToSet(set, path); }}
              onCreateToken={(tokenPath, set) => { navigateTo('define', 'tokens'); setEditingToken({ path: tokenPath, set, isCreate: true }); }}
              onPushUndo={p.pushUndo}
              allTokensFlat={allTokensFlat}
              pathToSet={pathToSet}
              onGapsDetected={p.setThemeGapCount}
              onShellStateChange={p.onThemeShellStateChange}
              onTokensCreated={p.refreshAll}
              onSetCreated={(name) => { addSetToState(name, 0); setActiveSet(name); }}
              onGoToTokens={() => navigateTo('define', 'tokens')}
              themeManagerHandle={p.themeManagerHandleRef}
              onSuccess={p.setSuccessToast}
              onGenerateForDimension={({ dimensionName: _name, targetSet }) => {
                if (targetSet) setActiveSet(targetSet);
                p.setPendingOpenPicker(true);
                navigateTo('define', 'generators');
              }}
              resolverState={{
                serverUrl,
                connected,
                sets,
                resolvers: resolverState.resolvers,
                resolverLoadErrors: resolverState.resolverLoadErrors,
                activeResolver: resolverState.activeResolver,
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
                getResolverFile: resolverState.getResolverFile,
                updateResolver: resolverState.updateResolver,
              }}
            />
          </ErrorBoundary>
        </div>
      </div>
    );
  }

  function renderApplyInspect(): ReactNode {
    return (
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
          onPushUndo={p.pushUndo}
          onToast={p.setSuccessToast}
          onGoToTokens={() => navigateTo('define', 'tokens')}
          triggerCreateToken={p.triggerCreateToken}
          selectionInspectorHandle={p.selectionInspectorHandleRef}
        />
      </ErrorBoundary>
    );
  }

  function renderApplyCanvasAnalysis(): ReactNode {
    return (
      <ErrorBoundary panelName="Canvas Analysis" onReset={() => navigateTo('apply', 'inspect')}>
        <CanvasAnalysisPanel
          availableTokens={allTokensFlat}
          heatmapResult={heatmapResult}
          heatmapLoading={heatmapLoading}
          heatmapProgress={heatmapProgress}
          heatmapError={heatmapError}
          onSelectNodes={(ids) => parent.postMessage({ pluginMessage: { type: 'select-heatmap-nodes', nodeIds: ids } }, '*')}
          onBatchBind={(nodeIds, tokenPath, property) => {
            const entry = allTokensFlat[tokenPath];
            if (!entry) return;
            parent.postMessage({ pluginMessage: { type: 'batch-bind-heatmap-nodes', nodeIds, tokenPath, tokenType: entry.$type, targetProperty: property, resolvedValue: entry.$value } }, '*');
          }}
          onSelectNode={(nodeId) => parent.postMessage({ pluginMessage: { type: 'select-node', nodeId } }, '*')}
        />
      </ErrorBoundary>
    );
  }

function renderApplyDependencies(): ReactNode {
    return (
      <ErrorBoundary panelName="Dependencies" onReset={() => navigateTo('ship', 'health')}>
        <TokenFlowPanel
          allTokensFlat={themedAllTokensFlat}
          pathToSet={pathToSet}
          loading={tokensLoading}
          initialPath={p.flowPanelInitialPath}
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
          onEditToken={(path) => {
            const targetSet = pathToSet[path];
            navigateTo('define', 'tokens');
            setEditingToken({ path, set: targetSet ?? activeSet });
            if (targetSet && targetSet !== activeSet) {
              setActiveSet(targetSet);
              setPendingHighlight(path);
            } else {
              setHighlightedToken(path);
            }
          }}
        />
      </ErrorBoundary>
    );
  }

  function renderShipPublish(): ReactNode {
    return (
      <ErrorBoundary panelName="Figma Sync" onReset={() => navigateTo('ship', 'publish')}>
        <PublishPanel
          serverUrl={serverUrl}
          connected={connected}
          activeSet={activeSet}
          collectionMap={setCollectionNames}
          modeMap={setModeNames}
          tokenChangeKey={p.tokenChangeKey}
          publishPanelHandle={p.publishPanelHandleRef}
        />
      </ErrorBoundary>
    );
  }

  function renderShipExport(): ReactNode {
    return (
      <ErrorBoundary panelName="Handoff files" onReset={() => navigateTo('ship', 'export')}>
        <ExportPanel serverUrl={serverUrl} connected={connected} />
      </ErrorBoundary>
    );
  }

  function renderShipHistory(): ReactNode {
    return (
      <ErrorBoundary panelName="History" onReset={() => navigateTo('ship', 'health')}>
        <HistoryPanel
          serverUrl={serverUrl}
          connected={connected}
          onPushUndo={p.pushUndo}
          onRefreshTokens={p.refreshAll}
          filterTokenPath={historyFilterPath}
          onClearFilter={() => setHistoryFilterPath(null)}
          recentOperations={p.recentOperations}
          totalOperations={p.totalOperations}
          hasMoreOperations={p.hasMoreOperations}
          onLoadMoreOperations={p.loadMoreOperations}
          onRollback={p.handleRollback}
          undoDescriptions={p.undoDescriptions}
          redoableOpIds={p.redoableOpIds}
          onServerRedo={p.handleServerRedo}
          executeUndo={p.executeUndo}
          canUndo={p.canUndo}
        />
      </ErrorBoundary>
    );
  }

  function renderShipHealth(): ReactNode {
    return (
      <ErrorBoundary panelName="Audit" onReset={() => navigateTo('ship', 'history')}>
        <HealthPanel
          serverUrl={serverUrl}
          connected={connected}
          activeSet={activeSet}
          generators={generators}
          lintViolations={p.lintViolations}
          allTokensFlat={allTokensFlat}
          pathToSet={pathToSet}
          dimensions={dimensions}
          tokenUsageCounts={tokenUsageCounts}
          heatmapResult={heatmapResult}
          onNavigateTo={(topTab, subTab) => navigateTo(topTab as TopTab, subTab as SubTab | undefined)}
          onNavigateToToken={(path, set) => {
            setReturnBreadcrumb({ label: 'Audit', topTab: 'ship', subTab: 'health' });
            setActiveSet(set);
            navigateTo('define', 'tokens');
            setPendingHighlight(path);
          }}
          onTriggerHeatmap={triggerHeatmapScan}
          validationIssues={p.validationIssues}
          validationSummary={p.validationSummary}
          validationLoading={p.validationLoading}
          validationError={p.validationError}
          validationLastRefreshed={p.validationLastRefreshed}
          validationIsStale={p.validationIsStale}
          onRefreshValidation={p.refreshValidation}
          onError={p.setErrorToast}
        />
      </ErrorBoundary>
    );
  }
}
