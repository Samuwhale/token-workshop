import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  useImperativeHandle,
} from "react";
import { Spinner } from "./Spinner";
import type { ThemeDimension, ThemeOption } from "@tokenmanager/core";
import type { UndoSlot } from "../hooks/useUndo";
import type { ResolverContentProps } from "./ResolverPanel";
import {
  getThemeOptionRolePriorityWeight,
  summarizeThemeOptionRoles,
  type ThemeOptionRoleSummary,
} from "./themeManagerTypes";
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
  themeIssueRequiresAdvancedSetup,
  type ThemeAuthoringStage,
  type ThemeAuthoringMode,
  type ThemeIssueSummary,
  type ThemeManagerView,
  type ThemeRoleNavigationTarget,
  type ThemeWorkspaceShellState,
} from "../shared/themeWorkflow";
import { ThemeCoverageScreen } from "./theme-manager/ThemeCoverageScreen";
import { ThemeCompareScreen } from "./theme-manager/ThemeCompareScreen";
import { ThemeAdvancedScreen } from "./theme-manager/ThemeAdvancedScreen";
import {
  ThemeAuthoringScreen,
  type ThemeAuthoringScreenHandle,
} from "./theme-manager/ThemeAuthoringScreen";
import { ThemePreviewScreen } from "./theme-manager/ThemePreviewScreen";
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
  /** Triggers auto-fill for the first dimension that has fillable gaps, showing the confirmation modal. */
  autoFillAllGaps: () => void;
  /** Opens the Compare view inside ThemeManager for the given mode. */
  navigateToCompare: (
    mode: CompareMode,
    path?: string,
    tokenPaths?: Set<string>,
    optionA?: string,
    optionB?: string,
  ) => void;
  /** Focus one of the default authoring stages inside the Theme workspace. */
  focusStage: (stage: ThemeAuthoringStage) => void;
  /** Returns to authoring and opens the create-axis entry point. */
  openCreateAxis: () => void;
  /** Returns from coverage/compare/advanced views to the default authoring flow. */
  returnToAuthoring: () => void;
  /** Switches to the DTCG Resolvers mode (advanced) inside ThemeManager. */
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
  /** Resolver state — when provided, enables the Advanced mode toggle */
  resolverState?: ResolverContentProps;
  /** Flat token map across all sets (for ThemeCompare) */
  allTokensFlat?: Record<string, TokenMapEntry>;
  /** Maps token path → owning set name (for ThemeCompare) */
  pathToSet?: Record<string, string>;
  /** Called whenever the total count of auto-fillable token gaps changes. */
  onGapsDetected?: (count: number) => void;
  /** Called after batch token creation so the app can refresh its token data. */
  onTokensCreated?: () => void;
  /** Called after a new set is created (e.g. via "Create override set") so the parent can update the set list. */
  onSetCreated?: (name: string) => void;
  /** Navigate to the Tokens sub-tab (used in Compare empty states). */
  onGoToTokens?: () => void;
  /** Navigate to Tokens workspace with a specific set selected */
  onNavigateToTokenSet?: (setName: string) => void;
  /** Ref populated with imperative actions for cross-component control (e.g. command palette). */
  themeManagerHandle?: React.MutableRefObject<ThemeManagerHandle | null>;
  /** Called with a success message after a mutation completes (dimension/option create, rename). */
  onSuccess?: (msg: string) => void;
  /** Called when user wants to generate tokens for a theme axis — provides the best target set and axis name. */
  onGenerateForDimension?: (info: {
    dimensionName: string;
    targetSet: string;
  }) => void;
  /** Mirrors the current internal theme view so the shell can stay aligned with the active sub-screen. */
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
    coverageContext,
    setCoverageContext,
    showAllCoverageAxes,
    setShowAllCoverageAxes,
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

  const getDimensionForContext = useCallback(
    (preferredId?: string | null) => {
      if (preferredId) {
        const matched = dimensions.find((dim) => dim.id === preferredId);
        if (matched) return matched;
      }
      if (focusedDimensionId) {
        const focused = dimensions.find((dim) => dim.id === focusedDimensionId);
        if (focused) return focused;
      }
      return dimensions[0] ?? null;
    },
    [dimensions, focusedDimensionId],
  );

  const getOptionNameForContext = useCallback(
    (dim: ThemeDimension | null, preferredName?: string | null) => {
      if (!dim) return null;
      if (
        preferredName &&
        dim.options.some((option: ThemeOption) => option.name === preferredName)
      )
        return preferredName;
      const selectedName = selectedOptions[dim.id];
      if (
        selectedName &&
        dim.options.some((option: ThemeOption) => option.name === selectedName)
      )
        return selectedName;
      return dim.options[0]?.name ?? null;
    },
    [selectedOptions],
  );

  const scrollToDimension = useCallback((dimId: string | null | undefined) => {
    if (!dimId) return;
    requestAnimationFrame(() => {
      authoringScreenRef.current?.scrollToDimension(dimId);
    });
  }, []);

  const scrollToSetRoles = useCallback((dimId: string, optionName: string) => {
    requestAnimationFrame(() => {
      authoringScreenRef.current?.scrollToSetRoles(dimId, optionName);
    });
  }, []);

  const focusRoleTarget = useCallback(
    (target: ThemeRoleNavigationTarget | null | undefined) => {
      const dimension = getDimensionForContext(target?.dimId ?? null);
      const optionName = getOptionNameForContext(
        dimension,
        target?.optionName ?? null,
      );
      if (!dimension || !optionName) return;

      setFocusedDimensionId(dimension.id);
      setSelectedOptions((prev) => ({ ...prev, [dimension.id]: optionName }));

      scrollToDimension(dimension.id);
      scrollToSetRoles(dimension.id, optionName);
    },
    [
      getDimensionForContext,
      getOptionNameForContext,
      scrollToDimension,
      scrollToSetRoles,
      setSelectedOptions,
    ],
  );

  const handleSelectOption = useCallback(
    (dimId: string, optionName: string) => {
      setFocusedDimensionId(dimId);
      setSelectedOptions((prev) => ({ ...prev, [dimId]: optionName }));
    },
    [setSelectedOptions],
  );

  const openAdvancedSetupView = useCallback(
    (target?: ThemeRoleNavigationTarget | null) => {
      const dimension = getDimensionForContext(target?.dimId ?? null);
      const optionName = getOptionNameForContext(
        dimension,
        target?.optionName ?? null,
      );

      if (dimension?.id) {
        setFocusedDimensionId(dimension.id);
      }
      if (dimension && optionName) {
        setSelectedOptions((prev) => ({ ...prev, [dimension.id]: optionName }));
      }

      setShowCompare(false);
      setAuthoringMode("roles");
      setActiveView("advanced-setup");
    },
    [
      getDimensionForContext,
      getOptionNameForContext,
      setActiveView,
      setAuthoringMode,
      setSelectedOptions,
      setShowCompare,
    ],
  );

  const returnToAuthoring = useCallback(
    (target?: ThemeRoleNavigationTarget | string | null) => {
      setShowCompare(false);
      setAuthoringMode("roles");
      setActiveView("authoring");

      const resolvedTarget =
        typeof target === "string"
          ? { dimId: target, optionName: null, preferredSetName: null }
          : (target ??
            (activeView === "coverage"
              ? coverageContext
              : activeView === "compare"
                ? compareContext
                : null));

      if (resolvedTarget?.dimId) {
        focusRoleTarget(resolvedTarget);
        return;
      }

      scrollToDimension(focusedDimensionId);
    },
    [
      activeView,
      compareContext,
      coverageContext,
      focusRoleTarget,
      focusedDimensionId,
      scrollToDimension,
      setActiveView,
      setAuthoringMode,
      setShowCompare,
    ],
  );

  const focusAuthoringStage = useCallback(
    (stage: ThemeAuthoringStage) => {
      setShowCompare(false);
      setActiveView("authoring");
      setAuthoringMode(stage === "preview" ? "preview" : "roles");

      if (stage === "preview") {
        return;
      }

      if (stage === "axes") {
        if (dimensions.length === 0) {
          openCreateDim();
          return;
        }
        scrollToDimension(focusedDimensionId ?? dimensions[0]?.id ?? null);
        return;
      }

      if (stage === "options") {
        const targetDimension =
          dimensions.find((dimension) => dimension.options.length === 0) ??
          getDimensionForContext();
        if (!targetDimension) {
          openCreateDim();
          return;
        }
        setFocusedDimensionId(targetDimension.id);
        setShowAddOption((prev) => ({ ...prev, [targetDimension.id]: true }));
        scrollToDimension(targetDimension.id);
        requestAnimationFrame(() => {
          addOptionInputRefs.current[targetDimension.id]?.focus();
        });
        return;
      }

      let bestTarget: {
        dimId: string;
        optionName: string;
        summary: ThemeOptionRoleSummary;
      } | null = null;
      for (const dimension of dimensions) {
        for (const option of dimension.options) {
          const summary = summarizeThemeOptionRoles({
            option,
            orderedSets: optionSetOrders[dimension.id]?.[option.name] || sets,
            availableSets: sets,
            tokenCountsBySet: setTokenCounts,
            uncoveredCount:
              coverage[dimension.id]?.[option.name]?.uncovered.length ?? 0,
            missingOverrideCount:
              missingOverrides[dimension.id]?.[option.name]?.missing.length ??
              0,
          });
          if (summary.priority === "ready") continue;
          if (!bestTarget) {
            bestTarget = {
              dimId: dimension.id,
              optionName: option.name,
              summary,
            };
            continue;
          }

          const currentWeight = getThemeOptionRolePriorityWeight(
            bestTarget.summary.priority,
          );
          const candidateWeight = getThemeOptionRolePriorityWeight(
            summary.priority,
          );
          if (
            candidateWeight < currentWeight ||
            (candidateWeight === currentWeight &&
              summary.totalIssueCount > bestTarget.summary.totalIssueCount)
          ) {
            bestTarget = {
              dimId: dimension.id,
              optionName: option.name,
              summary,
            };
          }
        }
      }

      if (bestTarget) {
        const issueTarget =
          optionIssues[`${bestTarget.dimId}:${bestTarget.optionName}`]?.[0];
        focusRoleTarget({
          dimId: bestTarget.dimId,
          optionName: bestTarget.optionName,
          preferredSetName: issueTarget?.preferredSetName ?? null,
        });
        return;
      }

      const fallbackDimension = getDimensionForContext();
      const fallbackOptionName = getOptionNameForContext(
        fallbackDimension,
        null,
      );
      if (!fallbackDimension || !fallbackOptionName) return;
      focusRoleTarget({
        dimId: fallbackDimension.id,
        optionName: fallbackOptionName,
        preferredSetName: sets[0] ?? null,
      });
    },
    [
      addOptionInputRefs,
      dimensions,
      focusRoleTarget,
      focusedDimensionId,
      getDimensionForContext,
      getOptionNameForContext,
      openCreateDim,
      optionIssues,
      optionSetOrders,
      coverage,
      missingOverrides,
      scrollToDimension,
      setActiveView,
      setAuthoringMode,
      setShowAddOption,
      setShowCompare,
      setTokenCounts,
      sets,
    ],
  );

  // Sync showCompare (set by external navigateToCompare calls) → activeView
  useEffect(() => {
    if (showCompare) setActiveView("compare");
  }, [setActiveView, showCompare]);

  const openCoverageView = useCallback(
    (target?: ThemeRoleNavigationTarget | null, allAxes = false) => {
      const targetDimension = getDimensionForContext(target?.dimId ?? null);
      const targetOptionName = getOptionNameForContext(
        targetDimension,
        target?.optionName ?? null,
      );
      if (targetDimension) setFocusedDimensionId(targetDimension.id);
      setCoverageContext({
        dimId: targetDimension?.id ?? null,
        optionName: targetOptionName,
        preferredSetName: target?.preferredSetName ?? null,
      });
      setShowAllCoverageAxes(allAxes);
      setShowCompare(false);
      setAuthoringMode("roles");
      setActiveView("coverage");
    },
    [
      getDimensionForContext,
      getOptionNameForContext,
      setActiveView,
      setAuthoringMode,
      setCoverageContext,
      setShowAllCoverageAxes,
      setShowCompare,
    ],
  );

  const openCompareView = useCallback(
    (dimension?: ThemeDimension, optionName?: string) => {
      setCompareMode("theme-options");
      const contextualDimension = getDimensionForContext(dimension?.id ?? null);
      const compareDimension =
        dimension && dimension.options.length >= 2
          ? dimension
          : contextualDimension && contextualDimension.options.length >= 2
            ? contextualDimension
            : dimensions.find((d) => d.options.length >= 2);
      if (compareDimension) {
        const optionAName =
          getOptionNameForContext(compareDimension, optionName) ??
          compareDimension.options[0]?.name ??
          "";
        const optionBName =
          compareDimension.options.find(
            (option: ThemeOption) => option.name !== optionAName,
          )?.name ??
          compareDimension.options[1]?.name ??
          "";
        setFocusedDimensionId(compareDimension.id);
        setCompareContext({
          dimId: compareDimension.id,
          optionName: optionAName || null,
        });
        setCompareThemeDefaultA(`${compareDimension.id}:${optionAName}`);
        setCompareThemeDefaultB(`${compareDimension.id}:${optionBName}`);
      } else if (
        dimensions.length >= 2 &&
        dimensions[0].options.length > 0 &&
        dimensions[1].options.length > 0
      ) {
        setCompareContext({
          dimId: dimensions[0].id,
          optionName: dimensions[0].options[0].name,
        });
        setCompareThemeDefaultA(
          `${dimensions[0].id}:${dimensions[0].options[0].name}`,
        );
        setCompareThemeDefaultB(
          `${dimensions[1].id}:${dimensions[1].options[0].name}`,
        );
      } else {
        setCompareContext({
          dimId: focusedDimensionId,
          optionName: null,
        });
      }
      setCompareThemeKey((k) => k + 1);
      setShowCompare(true);
      setAuthoringMode("roles");
      setActiveView("compare");
    },
    [
      dimensions,
      focusedDimensionId,
      getDimensionForContext,
      getOptionNameForContext,
      setCompareMode,
      setCompareThemeDefaultA,
      setCompareThemeDefaultB,
      setCompareThemeKey,
      setActiveView,
      setAuthoringMode,
      setCompareContext,
      setShowCompare,
    ],
  );

  const openAdvancedView = useCallback(() => {
    setShowCompare(false);
    setAuthoringMode("roles");
    setActiveView("advanced");
  }, [setActiveView, setAuthoringMode, setShowCompare]);

  const handleNavigateToCompare = useCallback(
    (
      mode: CompareMode,
      path?: string,
      tokenPaths?: Set<string>,
      optionA?: string,
      optionB?: string,
    ) => {
      if (mode === "theme-options" && optionA) {
        const separator = optionA.indexOf(":");
        const dimId = separator === -1 ? optionA : optionA.slice(0, separator);
        const optionName =
          separator === -1 ? null : optionA.slice(separator + 1);
        setFocusedDimensionId(dimId);
        setCompareContext({ dimId, optionName });
      } else {
        setCompareContext({
          dimId: focusedDimensionId,
          optionName: null,
        });
      }
      navigateToCompareState(mode, path, tokenPaths, optionA, optionB);
    },
    [focusedDimensionId, navigateToCompareState, setCompareContext],
  );

  // Populate imperative handle so parent (e.g. command palette) can trigger auto-fill
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
      switchToResolverMode: openAdvancedView,
    }),
    [
      coverage,
      dimensions,
      focusAuthoringStage,
      handleNavigateToCompare,
      openAdvancedView,
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
  const coverageFocusDimension = useMemo(
    () =>
      dimensions.find((dim) => dim.id === coverageContext.dimId) ??
      focusedDimension,
    [coverageContext.dimId, dimensions, focusedDimension],
  );
  const coverageFocusOptionName = useMemo(
    () =>
      getOptionNameForContext(
        coverageFocusDimension,
        coverageContext.optionName,
      ),
    [
      coverageContext.optionName,
      coverageFocusDimension,
      getOptionNameForContext,
    ],
  );
  const coverageDimensions = useMemo(
    () =>
      showAllCoverageAxes || !coverageFocusDimension
        ? dimensions
        : [coverageFocusDimension],
    [coverageFocusDimension, dimensions, showAllCoverageAxes],
  );
  const coverageFocusIssues = useMemo(
    () =>
      coverageFocusDimension && coverageFocusOptionName
        ? (optionIssues[
            `${coverageFocusDimension.id}:${coverageFocusOptionName}`
          ] ?? [])
        : [],
    [coverageFocusDimension, coverageFocusOptionName, optionIssues],
  );
  const coverageReviewIssues = useMemo(() => {
    if (showAllCoverageAxes) {
      return allIssues;
    }
    if (coverageFocusIssues.length > 0) return coverageFocusIssues;
    if (!coverageFocusDimension) return [];
    return sortThemeIssuesByPriority(
      coverageFocusDimension.options.flatMap(
        (option: ThemeDimension["options"][number]) =>
          optionIssues[`${coverageFocusDimension.id}:${option.name}`] ?? [],
      ),
    );
  }, [
    allIssues,
    coverageFocusDimension,
    coverageFocusIssues,
    optionIssues,
    showAllCoverageAxes,
  ]);
  const coverageFocusIssueCount = useMemo(
    () =>
      coverageReviewIssues.reduce(
        (sum: number, issue: ThemeIssueSummary) => sum + issue.count,
        0,
      ),
    [coverageReviewIssues],
  );
  const coveragePrimaryIssue =
    coverageFocusIssues[0] ?? coverageReviewIssues[0] ?? null;
  const coverageAutoFillAction = useMemo(
    () =>
      resolveThemeAutoFillAction(
        coverageFocusDimension,
        coverage,
        coverageFocusOptionName,
      ),
    [coverage, coverageFocusDimension, coverageFocusOptionName],
  );
  const isCoverageAutoFillInProgress = useMemo(() => {
    if (!coverageAutoFillAction) return false;
    if (coverageAutoFillAction.mode === "single-option") {
      return fillingKeys.has(
        `${coverageAutoFillAction.dimId}:${coverageAutoFillAction.optionName}:__all__`,
      );
    }
    return fillingKeys.has(`${coverageAutoFillAction.dimId}:__all_options__`);
  }, [coverageAutoFillAction, fillingKeys]);
  const handleCoverageAutoFill = useCallback(() => {
    if (!coverageAutoFillAction) return;
    if (
      coverageAutoFillAction.mode === "single-option" &&
      coverageAutoFillAction.optionName
    ) {
      handleAutoFillAll(
        coverageAutoFillAction.dimId,
        coverageAutoFillAction.optionName,
      );
      return;
    }
    handleAutoFillAllOptions(coverageAutoFillAction.dimId);
  }, [coverageAutoFillAction, handleAutoFillAll, handleAutoFillAllOptions]);
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
          {activeView === "coverage" ? (
            <ThemeCoverageScreen
              dimensions={coverageDimensions}
              allDimensions={dimensions}
              coverage={coverage}
              missingOverrides={missingOverrides}
              setTokenValues={setTokenValues}
              issueEntries={coverageReviewIssues}
              focusDimension={coverageFocusDimension}
              focusOptionName={coverageFocusOptionName}
              focusIssueCount={coverageFocusIssueCount}
              primaryIssue={coveragePrimaryIssue}
              showAllAxes={showAllCoverageAxes}
              context={coverageContext}
              autoFillAction={coverageAutoFillAction}
              isAutoFillInProgress={isCoverageAutoFillInProgress}
              onToggleShowAllAxes={() =>
                setShowAllCoverageAxes((value) => !value)
              }
              onBack={returnToAuthoring}
              onAutoFill={handleCoverageAutoFill}
              onResolveIssue={(issue) => {
                const target = {
                  dimId: issue.dimensionId,
                  optionName: issue.optionName,
                  preferredSetName: issue.preferredSetName,
                };
                if (themeIssueRequiresAdvancedSetup(issue)) {
                  openAdvancedSetupView(target);
                  return;
                }
                returnToAuthoring(target);
              }}
              onSelectOption={(dimId, optionName, preferredSetName) => {
                handleSelectOption(dimId, optionName);
                returnToAuthoring({
                  dimId,
                  optionName,
                  preferredSetName: preferredSetName ?? null,
                });
              }}
            />
          ) : activeView === "compare" ? (
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
                setActiveView("advanced-setup");
              }}
            />
          ) : activeView === "advanced-setup" ? (
            <ThemeAdvancedScreen
              mode="setup"
              dimensions={dimensions}
              focusedDimension={focusedDimension}
              selectedOptionName={
                focusedDimension ? selectedOptions[focusedDimension.id] ?? null : null
              }
              orderedSets={
                focusedDimension
                  ? optionSetOrders[focusedDimension.id]?.[
                      selectedOptions[focusedDimension.id] ??
                        focusedDimension.options[0]?.name ??
                        ""
                    ] ?? sets
                  : sets
              }
              canCompareThemes={canCompareThemes}
              resolverAvailable={Boolean(resolverState)}
              roleStates={roleStates}
              savingKeys={savingKeys}
              setTokenCounts={setTokenCounts}
              getCopySourceOptions={getCopySourceOptions}
              getSetRoleCounts={getSetRoleCounts}
              onSelectDimension={setFocusedDimensionId}
              onSelectOption={handleSelectOption}
              onSetState={handleSetState}
              onBulkSetState={handleBulkSetState}
              onBulkSetAllInOption={handleBulkSetAllInOption}
              onCopyAssignmentsFrom={handleCopyAssignmentsFrom}
              onCreateOverrideSet={(dimId, optionName, setName) =>
                overrideSet.setCreateOverrideSet({
                  dimId,
                  setName,
                  optName: optionName,
                })
              }
              onOpenCompare={() =>
                openCompareView(
                  focusedDimension ?? undefined,
                  focusedDimension
                    ? selectedOptions[focusedDimension.id] ??
                        focusedDimension.options[0]?.name
                    : undefined,
                )
              }
              onOpenResolver={openAdvancedView}
              onBack={returnToAuthoring}
            />
          ) : activeView === "advanced" && resolverState ? (
            <ThemeAdvancedScreen
              mode="resolver"
              resolverState={resolverState}
              resolverAuthoringContext={resolverAuthoringContext}
              onBack={() => setActiveView("advanced-setup")}
              onSuccess={onSuccess}
            />
          ) : activeView === "authoring" && authoringMode === "preview" ? (
            <ThemePreviewScreen
              dimensions={dimensions}
              selectedOptions={selectedOptions}
              setTokenValues={setTokenValues}
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
              onOpenCoverageView={openCoverageView}
              onOpenAdvancedSetup={openAdvancedSetupView}
              onNavigateToTokenSet={onNavigateToTokenSet}
            />
          )}
        </>

        <ThemeManagerModals />
      </div>
    </ThemeManagerModalsProvider>
  );
});
