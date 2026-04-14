import React, {
  useCallback,
  useState,
  useEffect,
  useRef,
  useMemo,
  useImperativeHandle,
} from "react";
import { Spinner } from "./Spinner";
import type { ThemeDimension } from "@tokenmanager/core";
import type { UndoSlot } from "../hooks/useUndo";
import type { ResolverContentProps } from "./ResolverPanel";
import type { CompareMode } from "./UnifiedComparePanel";
import type { TokenMapEntry } from "../../shared/types";
import {
  ThemeManagerModalsProvider,
  ThemeManagerModals,
  useThemeManagerFeedback,
} from "./ThemeManagerContext";
import {
  NoticeInlineAlert,
} from "../shared/noticeSystem";
import {
  sortThemeIssuesByPriority,
  type ThemeAuthoringStage,
  type ThemeAuthoringMode,
  type ThemeIssueSummary,
  type ThemeManagerView,
  type ThemeWorkspaceShellState,
} from "../shared/themeWorkflow";
import { ThemeCompareScreen } from "./theme-manager/ThemeCompareScreen";
import { ThemeResolverScreen } from "./theme-manager/ThemeResolverScreen";
import {
  ThemeAuthoringScreen,
  type ThemeAuthoringScreenHandle,
} from "./theme-manager/ThemeAuthoringScreen";
import { ThemePreviewScreen } from "./theme-manager/ThemePreviewScreen";
import { useThemeManagerNavigation } from "./theme-manager/useThemeManagerNavigation";
import {
  getFirstDimensionWithFillableGaps,
  resolveThemeAutoFillAction,
} from "./theme-manager/themeAutoFillTargets";
import {
  useThemeAdvancedToolsController,
  useThemeDiagnosticsController,
  useThemeWorkspaceController,
} from "./theme-manager/themeManagerControllers";

export interface ThemeManagerHandle {
  autoFillAllGaps: () => void;
  navigateToCompare: (
    mode: CompareMode,
    path?: string,
    tokenPaths?: Set<string>,
    optionA?: string,
    optionB?: string,
  ) => void;
  focusStage: (stage: ThemeAuthoringStage) => void;
  openCreateAxis: () => void;
  returnToAuthoring: () => void;
  switchToResolverMode: () => void;
}

interface ThemeManagerProps {
  serverUrl: string;
  connected: boolean;
  sets: string[];
  onDimensionsChange?: (dimensions: ThemeDimension[]) => void;
  onNavigateToToken?: (path: string, set: string) => void;
  onCreateToken?: (tokenPath: string, set: string) => void;
  onPushUndo?: (slot: UndoSlot) => void;
  resolverState?: ResolverContentProps;
  allTokensFlat?: Record<string, TokenMapEntry>;
  pathToSet?: Record<string, string>;
  onGapsDetected?: (count: number) => void;
  onTokensCreated?: () => void;
  onSetCreated?: (name: string) => void;
  onGoToTokens?: () => void;
  onNavigateToTokenSet?: (setName: string) => void;
  themeManagerHandle?: React.MutableRefObject<ThemeManagerHandle | null>;
  onSuccess?: (msg: string) => void;
  onGenerateForDimension?: (info: {
    dimensionName: string;
    targetSet: string;
  }) => void;
  onShellStateChange?: (state: ThemeWorkspaceShellState) => void;
}

interface ThemeManagerWorkspaceProps extends Omit<
  ThemeManagerProps,
  "themeManagerHandle" | "onShellStateChange"
> {
  activeView: ThemeManagerView;
  onActiveViewChange: (view: ThemeManagerView) => void;
  authoringMode: ThemeAuthoringMode;
  onAuthoringModeChange: (mode: ThemeAuthoringMode) => void;
}

type ThemeManagerWorkspaceHandle = ThemeManagerHandle;

export function ThemeManager({
  serverUrl,
  connected,
  sets,
  onDimensionsChange,
  onNavigateToToken,
  onCreateToken,
  onPushUndo,
  resolverState,
  allTokensFlat = {},
  pathToSet = {},
  onGapsDetected,
  onTokensCreated,
  onGoToTokens,
  onNavigateToTokenSet,
  themeManagerHandle,
  onSuccess,
  onGenerateForDimension,
  onSetCreated,
  onShellStateChange,
}: ThemeManagerProps) {
  const [authoringMode, setAuthoringMode] =
    useState<ThemeAuthoringMode>("roles");
  const [activeView, setActiveView] = useState<ThemeManagerView>("authoring");
  const workspaceRef = useRef<ThemeManagerWorkspaceHandle | null>(null);

  useEffect(() => {
    onShellStateChange?.({ activeView, authoringMode });
  }, [activeView, authoringMode, onShellStateChange]);

  useEffect(() => {
    if (!themeManagerHandle) return;
    const currentWorkspace = workspaceRef.current;
    themeManagerHandle.current = currentWorkspace;
    return () => {
      if (themeManagerHandle.current === currentWorkspace) {
        themeManagerHandle.current = null;
      }
    };
  });

  return (
    <ThemeManagerWorkspace
      ref={workspaceRef}
      serverUrl={serverUrl}
      connected={connected}
      sets={sets}
      onDimensionsChange={onDimensionsChange}
      onNavigateToToken={onNavigateToToken}
      onCreateToken={onCreateToken}
      onPushUndo={onPushUndo}
      resolverState={resolverState}
      allTokensFlat={allTokensFlat}
      pathToSet={pathToSet}
      onGapsDetected={onGapsDetected}
      onTokensCreated={onTokensCreated}
      onGoToTokens={onGoToTokens}
      onNavigateToTokenSet={onNavigateToTokenSet}
      onSuccess={onSuccess}
      onGenerateForDimension={onGenerateForDimension}
      onSetCreated={onSetCreated}
      activeView={activeView}
      onActiveViewChange={setActiveView}
      authoringMode={authoringMode}
      onAuthoringModeChange={setAuthoringMode}
    />
  );
}

const ThemeManagerWorkspace = React.forwardRef<
  ThemeManagerWorkspaceHandle,
  ThemeManagerWorkspaceProps
>(function ThemeManagerWorkspace(
  {
    serverUrl,
    connected,
    sets,
    onDimensionsChange,
    onNavigateToToken,
    onCreateToken,
    onPushUndo,
    resolverState,
    allTokensFlat = {},
    pathToSet = {},
    onGapsDetected,
    onTokensCreated,
    onGoToTokens,
    onNavigateToTokenSet,
    onSuccess,
    onGenerateForDimension,
    onSetCreated,
    activeView,
    onActiveViewChange,
    authoringMode,
    onAuthoringModeChange,
  }: ThemeManagerWorkspaceProps,
  ref,
) {
  const setActiveView = onActiveViewChange;
  const setAuthoringMode = onAuthoringModeChange;
  const authoringScreenRef = useRef<ThemeAuthoringScreenHandle | null>(null);
  const feedback = useThemeManagerFeedback(onSuccess);
  const [focusedDimensionId, setFocusedDimensionId] = useState<string | null>(
    null,
  );
  const workspace = useThemeWorkspaceController({
    serverUrl,
    connected,
    sets,
    feedback,
    onPushUndo,
    onTokensCreated,
    onSetCreated,
  });
  const {
    dimensionsState,
    dragDrop,
    bulkOps,
    autoFill,
    options,
    overrideSet,
    modals: modalContextValue,
    coverage,
    missingOverrides,
    optionSetOrders,
    selectedOptions,
    setSelectedOptions,
    setTokenValues,
    setTokenTypesRef,
    fetchDimensions,
    debouncedFetchDimensions,
    dimensions,
  } = workspace;
  const {
    loading,
    fetchWarnings,
    clearFetchWarnings,
    newlyCreatedDim,
    newDimName,
    setNewDimName,
    showCreateDim,
    openCreateDim,
    closeCreateDim,
    createDimError,
    isCreatingDim,
    handleCreateDimension,
    renameDim,
    renameValue,
    setRenameValue,
    renameError,
    startRenameDim,
    cancelRenameDim,
    executeRenameDim,
    openDeleteConfirm,
    handleDuplicateDimension,
    isDuplicatingDim,
  } = dimensionsState;
  const {
    draggingOpt,
    dragOverOpt,
    handleMoveDimension,
    handleMoveOption,
    handleOptDragStart,
    handleOptDragOver,
    handleOptDrop,
    handleOptDragEnd,
  } = dragDrop;
  const {
    copyFromNewOption,
    setCopyFromNewOption,
    roleStates,
    handleSetState,
    handleBulkSetState,
    handleBulkSetAllInOption,
    handleCopyAssignmentsFrom,
    getCopySourceOptions,
    getSetRoleCounts,
    savingKeys,
  } = bulkOps;
  const {
    fillingKeys,
    handleAutoFillAll,
    handleAutoFillAllOptions,
  } = autoFill;
  const {
    newOptionNames,
    setNewOptionNames,
    showAddOption,
    setShowAddOption,
    addOptionErrors,
    setAddOptionErrors,
    addOptionInputRefs,
    handleAddOption,
    handleDuplicateOption,
    renameOption,
    renameOptionValue,
    setRenameOptionValue,
    renameOptionError,
    setRenameOptionError,
    startRenameOption,
    cancelRenameOption,
    executeRenameOption,
    setOptionDeleteConfirm,
  } = options;
  const diagnostics = useThemeDiagnosticsController({
    dimensions,
    coverage,
    missingOverrides,
    availableSets: sets,
    optionSetOrders,
    setTokenValues,
    selectedOptions,
  });
  const {
    setTokenCounts,
    optionIssues,
    allIssues,
    totalFillableGaps,
    optionDiffCounts,
    optionRoleSummaries,
  } = diagnostics;
  const advancedTools = useThemeAdvancedToolsController({
    dimensions,
    selectedOptions,
    resolverState,
  });
  const {
    compare,
    compareContext,
    setCompareContext,
    resolverAuthoringContext,
    canCompareThemes,
  } = advancedTools;
  const {
    showCompare,
    setShowCompare,
    compareMode,
    setCompareMode,
    compareTokenPath,
    setCompareTokenPath,
    compareTokenPaths,
    setCompareTokenPaths,
    compareThemeKey,
    setCompareThemeKey,
    compareThemeDefaultA,
    setCompareThemeDefaultA,
    compareThemeDefaultB,
    setCompareThemeDefaultB,
    navigateToCompare: navigateToCompareState,
  } = compare;

  useEffect(() => {
    onDimensionsChange?.(dimensions);
  }, [dimensions, onDimensionsChange]);
  useEffect(() => {
    fetchDimensions();
  }, [fetchDimensions]);
  useEffect(() => {
    if (dimensions.length === 0) {
      setFocusedDimensionId(null);
      return;
    }
    if (
      focusedDimensionId &&
      dimensions.some((dim) => dim.id === focusedDimensionId)
    )
      return;
    setFocusedDimensionId(dimensions[0].id);
  }, [dimensions, focusedDimensionId]);

  useEffect(() => {
    onGapsDetected?.(totalFillableGaps);
  }, [totalFillableGaps, onGapsDetected]);

  const {
    getOptionNameForContext,
    handleSelectOption,
    returnToAuthoring,
    focusAuthoringStage,
    openCompareView,
    openResolverView,
    handleNavigateToCompare,
  } = useThemeManagerNavigation({
    dimensions,
    sets,
    focusedDimensionId,
    setFocusedDimensionId,
    selectedOptions,
    setSelectedOptions,
    activeView,
    setActiveView,
    setAuthoringMode,
    authoringScreenRef,
    openCreateDim,
    setShowAddOption,
    addOptionInputRefs,
    optionSetOrders,
    coverage,
    missingOverrides,
    optionIssues,
    setTokenCounts,
    compareContext,
    setCompareContext,
    setCompareMode,
    setCompareThemeDefaultA,
    setCompareThemeDefaultB,
    setCompareThemeKey,
    showCompare,
    setShowCompare,
    navigateToCompareState,
    resolverAvailable: Boolean(resolverState),
  });

  const handleAutoFillAllRef = useRef(handleAutoFillAllOptions);
  handleAutoFillAllRef.current = handleAutoFillAllOptions;
  useImperativeHandle(
    ref,
    () => ({
      autoFillAllGaps: () => {
        const dimWithGaps = getFirstDimensionWithFillableGaps(
          dimensions,
          coverage,
        );
        if (dimWithGaps) handleAutoFillAllRef.current(dimWithGaps.id);
      },
      navigateToCompare: handleNavigateToCompare,
      focusStage: focusAuthoringStage,
      openCreateAxis: () => {
        setShowCompare(false);
        setActiveView("authoring");
        openCreateDim();
      },
      returnToAuthoring: () => {
        returnToAuthoring();
      },
      switchToResolverMode: openResolverView,
    }),
    [
      coverage,
      dimensions,
      focusAuthoringStage,
      handleNavigateToCompare,
      openResolverView,
      openCreateDim,
      returnToAuthoring,
      setActiveView,
      setShowCompare,
    ],
  );

  const focusedDimension = useMemo(
    () =>
      dimensions.find((dim) => dim.id === focusedDimensionId) ??
      dimensions[0] ??
      null,
    [dimensions, focusedDimensionId],
  );
  const compareFocusDimension = useMemo(
    () =>
      dimensions.find((dim) => dim.id === compareContext.dimId) ??
      focusedDimension,
    [compareContext.dimId, dimensions, focusedDimension],
  );
  const compareFocusOptionName = useMemo(
    () =>
      getOptionNameForContext(compareFocusDimension, compareContext.optionName),
    [compareContext.optionName, compareFocusDimension, getOptionNameForContext],
  );

  if (!connected) {
    return (
      <div className="flex items-center justify-center py-3 text-[var(--color-figma-text-secondary)] text-[11px]">
        Connect to server to manage themes
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-3 text-[var(--color-figma-text-secondary)] text-[11px]">
        <Spinner size="md" className="text-[var(--color-figma-accent)]" />
        Loading themes...
      </div>
    );
  }

  return (
    <ThemeManagerModalsProvider value={modalContextValue}>
      <div className="flex flex-col h-full">
        {feedback.error && (
          <div className="mx-3 mt-2">
            <NoticeInlineAlert
              severity="error"
              onDismiss={feedback.clearError}
            >
              {feedback.error}
            </NoticeInlineAlert>
          </div>
        )}
        {fetchWarnings && (
          <div className="mx-3 mt-2">
            <NoticeInlineAlert
              severity="warning"
              onDismiss={clearFetchWarnings}
            >
              {fetchWarnings}
            </NoticeInlineAlert>
          </div>
        )}

        <>
          {activeView === "compare" ? (
            <ThemeCompareScreen
              compareFocusDimension={compareFocusDimension}
              compareFocusOptionName={compareFocusOptionName}
              mode={compareMode}
              onModeChange={setCompareMode}
              tokenPaths={compareTokenPaths}
              onClearTokenPaths={() => setCompareTokenPaths(new Set())}
              tokenPath={compareTokenPath}
              onClearTokenPath={() => setCompareTokenPath("")}
              allTokensFlat={allTokensFlat}
              pathToSet={pathToSet}
              dimensions={dimensions}
              sets={sets}
              themeOptionsKey={compareThemeKey}
              themeOptionsDefaultA={compareThemeDefaultA}
              themeOptionsDefaultB={compareThemeDefaultB}
              onEditToken={(setName, tokenPath) =>
                onNavigateToToken?.(tokenPath, setName)
              }
              onCreateToken={(tokenPath, setName) =>
                onCreateToken?.(tokenPath, setName)
              }
              onGoToTokens={onGoToTokens ?? (() => setActiveView("authoring"))}
              serverUrl={serverUrl}
              onTokensCreated={() => {
                debouncedFetchDimensions();
                onTokensCreated?.();
              }}
              onBack={() => {
                setShowCompare(false);
                setActiveView("authoring");
              }}
            />
          ) : activeView === "resolver" && resolverState ? (
            <ThemeResolverScreen
              resolverState={resolverState}
              resolverAuthoringContext={resolverAuthoringContext}
              onBack={() => setActiveView("authoring")}
              onSuccess={onSuccess}
            />
          ) : activeView === "authoring" && authoringMode === "preview" ? (
            <ThemePreviewScreen
              dimensions={dimensions}
              selectedOptions={selectedOptions}
              setTokenValues={setTokenValues}
              setTokenTypes={setTokenTypesRef.current}
              onNavigateToToken={onNavigateToToken}
              onBack={() => setAuthoringMode("roles")}
            />
          ) : (
            <ThemeAuthoringScreen
              ref={authoringScreenRef}
              dimensions={dimensions}
              sets={sets}
              coverage={coverage}
              optionSetOrders={optionSetOrders}
              selectedOptions={selectedOptions}
              setTokenValues={setTokenValues}
              optionIssues={optionIssues}
              optionDiffCounts={optionDiffCounts}
              optionRoleSummaries={optionRoleSummaries}
              focusedDimension={focusedDimension}
              newlyCreatedDim={newlyCreatedDim}
              draggingOpt={draggingOpt}
              dragOverOpt={dragOverOpt}
              renameDim={renameDim}
              renameValue={renameValue}
              renameError={renameError}
              showCreateDim={showCreateDim}
              newDimName={newDimName}
              createDimError={createDimError}
              isCreatingDim={isCreatingDim}
              isDuplicatingDim={isDuplicatingDim}
              newOptionNames={newOptionNames}
              showAddOption={showAddOption}
              addOptionErrors={addOptionErrors}
              addOptionInputRefs={addOptionInputRefs}
              copyFromNewOption={copyFromNewOption}
              renameOption={renameOption}
              renameOptionValue={renameOptionValue}
              renameOptionError={renameOptionError}
              onGenerateForDimension={onGenerateForDimension}
              setRenameValue={setRenameValue}
              startRenameDim={startRenameDim}
              cancelRenameDim={cancelRenameDim}
              executeRenameDim={executeRenameDim}
              openDeleteConfirm={openDeleteConfirm}
              handleDuplicateDimension={handleDuplicateDimension}
              handleMoveDimension={handleMoveDimension}
              onSelectDimension={setFocusedDimensionId}
              onSelectOption={handleSelectOption}
              openCreateDim={openCreateDim}
              closeCreateDim={closeCreateDim}
              handleCreateDimension={handleCreateDimension}
              setNewDimName={setNewDimName}
              setShowAddOption={setShowAddOption}
              setNewOptionNames={setNewOptionNames}
              setAddOptionErrors={setAddOptionErrors}
              handleAddOption={handleAddOption}
              setCopyFromNewOption={setCopyFromNewOption}
              handleOptDragStart={handleOptDragStart}
              handleOptDragOver={handleOptDragOver}
              handleOptDrop={handleOptDrop}
              handleOptDragEnd={handleOptDragEnd}
              handleMoveOption={handleMoveOption}
              handleDuplicateOption={handleDuplicateOption}
              setOptionDeleteConfirm={setOptionDeleteConfirm}
              startRenameOption={startRenameOption}
              setRenameOptionValue={setRenameOptionValue}
              setRenameOptionError={setRenameOptionError}
              executeRenameOption={executeRenameOption}
              cancelRenameOption={cancelRenameOption}
              getCopySourceOptions={getCopySourceOptions}
              handleSetState={handleSetState}
              handleCopyAssignmentsFrom={handleCopyAssignmentsFrom}
              handleAutoFillAll={handleAutoFillAll}
              handleAutoFillAllOptions={handleAutoFillAllOptions}
              onOpenCompare={openCompareView}
              onOpenResolver={openResolverView}
              onNavigateToTokenSet={onNavigateToTokenSet}
            />
          )}
        </>

        <ThemeManagerModals />
      </div>
    </ThemeManagerModalsProvider>
  );
});
