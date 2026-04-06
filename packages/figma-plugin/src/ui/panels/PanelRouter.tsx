/**
 * PanelRouter — routes (activeTopTab, activeSubTab, overflowPanel) to the
 * correct panel component. Eliminates the O(N) condition matrix that previously
 * existed in App.tsx. Adding a new tab requires: one entry in the lookup table
 * + one render function below.
 *
 * Reads ConnectionContext, TokenDataContext, ThemeContext, and InspectContext
 * directly so callers only pass App-local state as props.
 */

import { useState } from 'react';
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
import type { CompareMode } from '../components/UnifiedComparePanel';
import type { TokenListImperativeHandle } from '../components/tokenListTypes';
import { TokenEditor } from '../components/TokenEditor';
import { TokenDetailPreview } from '../components/TokenDetailPreview';
import { ThemeManager } from '../components/ThemeManager';
import type { ThemeManagerHandle } from '../components/ThemeManager';
import { PublishPanel } from '../components/PublishPanel';
import { ImportPanel } from '../components/ImportPanel';
import { SelectionInspector } from '../components/SelectionInspector';
import { CanvasAnalysisPanel } from '../components/CanvasAnalysisPanel';
import { GraphPanel } from '../components/GraphPanel';
import { TokenFlowPanel } from '../components/TokenFlowPanel';
import { ExportPanel } from '../components/ExportPanel';
import { HistoryPanel } from '../components/HistoryPanel';
import { HealthPanel } from '../components/HealthPanel';
import { PreviewPanel } from '../components/PreviewPanel';
import { EmptyState } from '../components/EmptyState';
import { SettingsPanel } from '../components/SettingsPanel';
import { RecentsPanel } from '../components/RecentsPanel';
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
import type { CrossSetRecentsState } from '../hooks/useCrossSetRecents';
import type { StarredTokensState } from '../hooks/useStarredTokens';
import type { TopTab, SubTab } from '../shared/navigationTypes';
import { useEditorWidth } from '../hooks/useEditorWidth';

// ---------------------------------------------------------------------------
// Props interface
// ---------------------------------------------------------------------------

export interface PanelRouterProps {
  useSidePanel: boolean;
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
  handleOpenTokenCompare: (paths: Set<string>) => void;
  handleOpenCrossThemeCompare: (path: string) => void;
  /** Compare panel state for the Tokens tab — shown in-place without a tab switch. */
  tokensCompare: {
    showCompare: boolean;
    onClose: () => void;
    mode: CompareMode;
    onModeChange: (mode: CompareMode) => void;
    tokenPaths: Set<string>;
    onClearTokenPaths: () => void;
    tokenPath: string;
    onClearTokenPath: () => void;
    themeKey: number;
    defaultA: string;
    defaultB: string;
  };
  openCommandPaletteWithQuery: (query: string) => void;
  handleNavigateToGenerator: (id: string) => void;
  setThemeGapCount: (n: number) => void;
  triggerCreateToken: number;
  paletteRecentlyTouched: Pick<RecentlyTouchedState, 'recordTouch'>;
  crossSetRecents: CrossSetRecentsState;
  starredTokens: StarredTokensState;
  // Modal openers (for EmptyState + other panels that trigger global modals)
  onShowPasteModal: () => void;
  onShowScaffoldWizard: () => void;
  onShowColorScaleGen: () => void;
  onShowGuidedSetup: () => void;

  onRestartGuidedSetup: () => void;
  /** Called after "Clear all data" — navigate away and refresh tokens */
  onClearAllComplete?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PanelRouter(p: PanelRouterProps): ReactNode {
  // Navigation and editor state from contexts (previously passed as props)
  const { activeTopTab, activeSubTab, overflowPanel, navigateTo, setOverflowPanel } = useNavigationContext();
  const {
    editingToken, setEditingToken, previewingToken, setPreviewingToken,
    highlightedToken, setHighlightedToken, createFromEmpty,
    setPendingHighlight, handleNavigateToAlias, handleNavigateBack, navHistoryLength,
  } = useEditorContext();

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
    generators, derivedTokenPaths, generatorsLoading, refreshGenerators,
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

  const editingTokenType = editingToken
    ? (allTokensFlat[editingToken.path]?.$type ?? editingToken.initialType)
    : undefined;
  const { editorWidth, handleEditorWidthDragStart } = useEditorWidth(editingTokenType);

  // Build the common TokenList `actions` object once — it's identical across the
  // three TokenList render variants (side-panel, no-split, preview-split).
  const tokenListActions = {
    onEdit: (path: string, name?: string) => p.guardEditorAction(() => {
      setEditingToken({ path, name, set: activeSet });
      setPreviewingToken(null);
      setHighlightedToken(path);
    }),
    onPreview: (path: string, name?: string) => {
      setPreviewingToken({ path, name, set: activeSet });
      setHighlightedToken(path);
    },
    onCreateNew: (initialPath: string | undefined, initialType: string | undefined, initialValue: string | undefined) =>
      setEditingToken({ path: initialPath ?? '', set: activeSet, isCreate: true, initialType, initialValue }),
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
    onNavigateToGenerator: p.handleNavigateToGenerator,
    onShowReferences: (path: string) => {
      p.setFlowPanelInitialPath(path);
      navigateTo('apply', 'dependencies');
    },
    onDisplayedLeafNodesChange: (nodes: TokenNode[]) => { p.displayedLeafNodesRef.current = nodes; },
    onTokenTouched: (path: string) => {
      p.paletteRecentlyTouched.recordTouch(path);
      p.crossSetRecents.recordTouch(path, activeSet);
    },
    onToggleStar: (path: string) => p.starredTokens.toggleStar(path, activeSet),
    starredPaths: new Set(p.starredTokens.tokens.filter(t => t.setName === activeSet).map(t => t.path)),
    onError: p.setErrorToast,
    onOpenCompare: p.handleOpenTokenCompare,
    onOpenCrossThemeCompare: p.handleOpenCrossThemeCompare,
    onOpenCommandPaletteWithQuery: p.openCommandPaletteWithQuery,
    onTokenDragStart: p.onTokenDragStart,
    onTokenDragEnd: p.onTokenDragEnd,
  };

  // Common TokenEditor props shared between side-panel and drawer variants
  const tokenEditorProps = editingToken ? {
    tokenPath: editingToken.path,
    tokenName: editingToken.name,
    setName: editingToken.set,
    serverUrl,
    onBack: () => { setEditingToken(null); p.refreshAll(); },
    allTokensFlat,
    pathToSet,
    generators,
    allSets: sets,
    onRefreshGenerators: p.refreshAll,
    isCreateMode: editingToken.isCreate,
    initialType: editingToken.initialType,
    initialValue: editingToken.initialValue,
    onDirtyChange: (dirty: boolean) => { p.editorIsDirtyRef.current = dirty; },
    closeRef: p.editorCloseRef,
    onSaved: p.handleEditorSave,
    onSaveAndCreateAnother: p.handleEditorSaveAndCreateAnother,
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

  // ---------------------------------------------------------------------------
  // Overflow panels
  // ---------------------------------------------------------------------------

  if (overflowPanel === 'import') {
    return (
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
            onPushUndo={p.pushUndo}
          />
        </ErrorBoundary>
      </>
    );
  }

  if (overflowPanel === 'recents') {
    return (
      <RecentsPanel
        crossSetRecents={p.crossSetRecents}
        starredTokens={p.starredTokens}
        perSetFlat={perSetFlat}
        onNavigateToSet={(setName, path) => {
          p.handleNavigateToSet(setName, path);
          setOverflowPanel(null);
        }}
        onClose={() => setOverflowPanel(null)}
      />
    );
  }

  if (overflowPanel === 'settings') {
    return (
      <SettingsPanel
        serverUrl={serverUrl}
        connected={connected}
        checking={checking}
        updateServerUrlAndConnect={updateServerUrlAndConnect}
        onRestartGuidedSetup={p.onRestartGuidedSetup}
        onClearAllComplete={p.onClearAllComplete}
        onClose={() => setOverflowPanel(null)}
      />
    );
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
    // Show the compare panel in-place when triggered from the Tokens tab
    if (p.tokensCompare.showCompare) {
      return (
        <UnifiedComparePanel
          mode={p.tokensCompare.mode}
          onModeChange={p.tokensCompare.onModeChange}
          tokenPaths={p.tokensCompare.tokenPaths}
          onClearTokenPaths={p.tokensCompare.onClearTokenPaths}
          tokenPath={p.tokensCompare.tokenPath}
          onClearTokenPath={p.tokensCompare.onClearTokenPath}
          allTokensFlat={allTokensFlat}
          pathToSet={pathToSet}
          dimensions={dimensions}
          sets={sets}
          themeOptionsKey={p.tokensCompare.themeKey}
          themeOptionsDefaultA={p.tokensCompare.defaultA}
          themeOptionsDefaultB={p.tokensCompare.defaultB}
          onEditToken={(set, path) => { p.handleNavigateToSet(set, path); }}
          onCreateToken={(path, set) => { setEditingToken({ path, set, isCreate: true }); }}
          onGoToTokens={p.tokensCompare.onClose}
          serverUrl={serverUrl}
          onTokensCreated={p.refreshAll}
          onBack={p.tokensCompare.onClose}
          backLabel="Back to tokens"
        />
      );
    }

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
          <EmptyState
            connected={connected}
            serverUrl={serverUrl}
            checking={checking}
            onConnect={updateServerUrlAndConnect}
            onCreateToken={() => setEditingToken({ path: '', set: activeSet, isCreate: true })}
            onPasteJSON={p.onShowPasteModal}
            onImportFigma={() => setOverflowPanel('import')}
            onUsePreset={p.onShowScaffoldWizard}
            onGenerateColorScale={p.onShowColorScaleGen}
            onGoToGraph={() => { navigateTo('define', 'generators'); p.onShowScaffoldWizard(); }}
            onGuidedSetup={p.onShowGuidedSetup}
          />
        )}
        {/* Main content: TokenList variants */}
        {(tokens.length > 0 || createFromEmpty) && !p.showPreviewSplit && (
          p.useSidePanel ? (
            <div className="flex h-full overflow-hidden">
              <div className="flex-1 min-w-0 overflow-hidden">
                <TokenList
                  ctx={{ setName: activeSet, sets, serverUrl, connected, selectedNodes }}
                  data={{ tokens, allTokensFlat: themedAllTokensFlat, lintViolations: p.lintViolations, syncSnapshot: Object.keys(syncSnapshot).length > 0 ? syncSnapshot : undefined, generators, derivedTokenPaths, tokenUsageCounts, cascadeDiff: p.cascadeDiff ?? undefined, perSetFlat, collectionMap: setCollectionNames, modeMap: setModeNames, dimensions, unthemedAllTokensFlat: allTokensFlat, pathToSet, activeThemes }}
                  actions={tokenListActions}
                  defaultCreateOpen={createFromEmpty}
                  highlightedToken={editingToken?.path ?? previewingToken?.path ?? highlightedToken}
                  showIssuesOnly={p.showIssuesOnly}
                  editingTokenPath={editingToken?.path}
                  compareHandle={p.tokenListCompareRef}
                />
              </div>
              <div
                className="shrink-0 border-l border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] flex flex-row overflow-hidden"
                style={{ width: editorWidth }}
                onKeyDown={(e) => {
                  if ((e.key === ']' || e.key === '[') && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
                    e.preventDefault();
                    p.handleEditorNavigate(e.key === ']' ? 1 : -1);
                  }
                }}
              >
                {/* Drag handle — user drags left to widen, right to narrow */}
                <div
                  className="w-1 shrink-0 cursor-col-resize hover:bg-[var(--color-figma-accent)]/30 active:bg-[var(--color-figma-accent)]/50 transition-colors"
                  onMouseDown={handleEditorWidthDragStart}
                  title="Drag to resize"
                  aria-hidden="true"
                />
                <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
                {editingToken && tokenEditorProps ? (
                  <TokenEditor {...tokenEditorProps} />
                ) : previewingToken ? (
                  <TokenDetailPreview
                    tokenPath={previewingToken.path}
                    tokenName={previewingToken.name}
                    setName={previewingToken.set}
                    allTokensFlat={allTokensFlat}
                    pathToSet={pathToSet}
                    dimensions={dimensions}
                    activeThemes={activeThemes}
                    serverUrl={serverUrl}
                    onEdit={p.handlePreviewEdit}
                    onClose={p.handlePreviewClose}
                    onNavigateToAlias={handleNavigateToAlias}
                  />
                ) : null}
                </div>
              </div>
            </div>
          ) : (
            <TokenList
              ctx={{ setName: activeSet, sets, serverUrl, connected, selectedNodes }}
              data={{ tokens, allTokensFlat: themedAllTokensFlat, lintViolations: p.lintViolations, syncSnapshot: Object.keys(syncSnapshot).length > 0 ? syncSnapshot : undefined, generators, derivedTokenPaths, tokenUsageCounts, cascadeDiff: p.cascadeDiff ?? undefined, perSetFlat, collectionMap: setCollectionNames, modeMap: setModeNames, dimensions, unthemedAllTokensFlat: allTokensFlat, pathToSet, activeThemes }}
              actions={tokenListActions}
              defaultCreateOpen={createFromEmpty}
              highlightedToken={highlightedToken}
              showIssuesOnly={p.showIssuesOnly}
              editingTokenPath={editingToken?.path}
              compareHandle={p.tokenListCompareRef}
            />
          )
        )}
        {/* Preview split view */}
        {(tokens.length > 0 || createFromEmpty) && p.showPreviewSplit && (
          <div ref={p.splitContainerRef} className="flex flex-col h-full overflow-hidden">
            <div style={{ height: `${p.splitRatio * 100}%`, flexShrink: 0, overflow: 'hidden' }}>
              <TokenList
                ctx={{ setName: activeSet, sets, serverUrl, connected, selectedNodes }}
                data={{ tokens, allTokensFlat: themedAllTokensFlat, lintViolations: p.lintViolations, syncSnapshot: Object.keys(syncSnapshot).length > 0 ? syncSnapshot : undefined, generators, derivedTokenPaths, tokenUsageCounts, cascadeDiff: p.cascadeDiff ?? undefined, perSetFlat, collectionMap: setCollectionNames, modeMap: setModeNames, dimensions, unthemedAllTokensFlat: allTokensFlat, pathToSet, activeThemes }}
                actions={tokenListActions}
                defaultCreateOpen={createFromEmpty}
                highlightedToken={previewingToken?.path ?? highlightedToken}
                showIssuesOnly={p.showIssuesOnly}
                editingTokenPath={editingToken?.path}
                compareHandle={p.tokenListCompareRef}
              />
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
                  onEditToken={(path, name, set) => {
                    p.setShowPreviewSplit(false);
                    setEditingToken({ path, name, set: set ?? activeSet });
                    setPreviewingToken(null);
                  }}
                  serverUrl={serverUrl}
                />
              </ErrorBoundary>
            </div>
          </div>
        )}
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
      <ErrorBoundary panelName="Dependencies" onReset={() => navigateTo('apply', 'inspect')}>
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
      <ErrorBoundary panelName="Publish" onReset={() => navigateTo('define', 'tokens')}>
        <PublishPanel
          serverUrl={serverUrl}
          connected={connected}
          activeSet={activeSet}
          collectionMap={setCollectionNames}
          modeMap={setModeNames}
          tokenChangeKey={p.tokenChangeKey}
        />
      </ErrorBoundary>
    );
  }

  function renderShipExport(): ReactNode {
    return (
      <ErrorBoundary panelName="Export" onReset={() => navigateTo('ship', 'publish')}>
        <ExportPanel serverUrl={serverUrl} connected={connected} />
      </ErrorBoundary>
    );
  }

  function renderShipHistory(): ReactNode {
    return (
      <ErrorBoundary panelName="History" onReset={() => navigateTo('ship', 'publish')}>
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
      <ErrorBoundary panelName="Health" onReset={() => navigateTo('ship', 'publish')}>
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
