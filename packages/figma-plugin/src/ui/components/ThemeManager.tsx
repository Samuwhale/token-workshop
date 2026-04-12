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
  STATE_LABELS,
  STATE_DESCRIPTIONS,
  getThemeOptionRolePriorityWeight,
  summarizeThemeOptionRoles,
  type ThemeRoleState,
  type ThemeOptionRoleSummary,
} from "./themeManagerTypes";
import { useThemeDragDrop } from "../hooks/useThemeDragDrop";
import { useThemeBulkOps } from "../hooks/useThemeBulkOps";
import type { CompareMode } from "./UnifiedComparePanel";
import type { TokenMapEntry } from "../../shared/types";
import { useThemeAutoFill } from "../hooks/useThemeAutoFill";
import { useThemeDimensions } from "../hooks/useThemeDimensions";
import { useThemeOptions } from "../hooks/useThemeOptions";
import { useThemeCoverage } from "../hooks/useThemeCoverage";
import { useThemeCompare } from "../hooks/useThemeCompare";
import {
  ThemeManagerModalsProvider,
  ThemeManagerModals,
  useThemeManagerModalsValue,
} from "./ThemeManagerContext";
import { apiFetch } from "../shared/apiFetch";
import {
  NoticePill,
  NoticeCountBadge,
  NoticeInlineAlert,
} from "../shared/noticeSystem";
import type {
  ThemeAuthoringStage,
  ThemeAuthoringMode,
  ThemeIssueSummary,
  ThemeManagerView,
  ThemeRoleNavigationTarget,
  ThemeWorkspaceShellState,
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
import { buildThemeResolverAuthoringContext } from "./theme-manager/themeResolverContext";

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
    themeManagerHandle.current = workspaceRef.current;
    return () => {
      if (themeManagerHandle.current === workspaceRef.current) {
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
  const [editingRoleTarget, setEditingRoleTarget] = useState<{
    dimId: string;
    optionName: string;
    setName: string | null;
  } | null>(null);
  const authoringScreenRef = useRef<ThemeAuthoringScreenHandle | null>(null);
  const [focusedDimensionId, setFocusedDimensionId] = useState<string | null>(
    null,
  );
  const [coverageContext, setCoverageContext] =
    useState<ThemeRoleNavigationTarget>({
      dimId: null,
      optionName: null,
      preferredSetName: null,
    });
  const [showAllCoverageAxes, setShowAllCoverageAxes] = useState(false);
  const [compareContext, setCompareContext] = useState<{
    dimId: string | null;
    optionName: string | null;
  }>({
    dimId: null,
    optionName: null,
  });

  // --- Domain hooks ---
  const {
    dimensions,
    setDimensions,
    loading,
    error,
    setError,
    fetchWarnings,
    clearFetchWarnings,
    coverage,
    missingOverrides,
    optionSetOrders,
    setOptionSetOrders,
    selectedOptions,
    setSelectedOptions,
    setTokenValues,
    newlyCreatedDim,
    fetchDimensions,
    debouncedFetchDimensions,
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
    isRenamingDim: _isRenamingDim,
    startRenameDim,
    cancelRenameDim,
    executeRenameDim,
    dimensionDeleteConfirm,
    openDeleteConfirm,
    closeDeleteConfirm,
    isDeletingDim: _isDeletingDim,
    executeDeleteDimension,
    isDuplicatingDim,
    handleDuplicateDimension,
  } = useThemeDimensions({ serverUrl, connected, sets, onPushUndo, onSuccess });

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

  const {
    draggingDimId,
    dragOverDimId,
    draggingOpt,
    dragOverOpt,
    handleMoveDimension,
    handleMoveOption,
    handleDimDragStart,
    handleDimDragOver,
    handleDimDrop,
    handleDimDragEnd,
    handleOptDragStart,
    handleOptDragOver,
    handleOptDrop,
    handleOptDragEnd,
  } = useThemeDragDrop({
    serverUrl,
    connected,
    dimensions,
    setDimensions,
    fetchDimensions,
  });

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
  } = useThemeCompare();

  const {
    copyFromNewOption,
    setCopyFromNewOption,
    roleStates,
    savingKeys,
    handleSetState,
    handleBulkSetState,
    handleBulkSetAllInOption,
    handleCopyAssignmentsFrom,
    getCopySourceOptions,
    getSetRoleCounts,
  } = useThemeBulkOps({
    serverUrl,
    sets,
    dimensions,
    setDimensions,
    debouncedFetchDimensions,
    setError,
  });

  const {
    fillingKeys,
    autoFillPreview,
    setAutoFillPreview,
    autoFillStrategy,
    setAutoFillStrategy,
    handleAutoFillAll,
    executeAutoFillAll,
    handleAutoFillAllOptions,
    executeAutoFillAllOptions,
  } = useThemeAutoFill({
    serverUrl,
    dimensions,
    coverage,
    debouncedFetchDimensions,
    setError,
  });

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
    optionDeleteConfirm,
    setOptionDeleteConfirm,
    executeDeleteOption,
  } = useThemeOptions({
    serverUrl,
    connected,
    sets,
    dimensions,
    setDimensions,
    debouncedFetchDimensions,
    fetchDimensions,
    selectedOptions,
    setSelectedOptions,
    optionSetOrders,
    setOptionSetOrders,
    setError,
    onSuccess,
    onPushUndo,
    copyFromNewOption,
    setCopyFromNewOption,
  });

  const setTokenCounts = useMemo(() => {
    const counts: Record<string, number | null> = {};
    for (const setName of sets) {
      counts[setName] = setTokenValues[setName]
        ? Object.keys(setTokenValues[setName]).length
        : null;
    }
    return counts;
  }, [setTokenValues, sets]);

  const { optionIssues, totalIssueCount, totalFillableGaps } = useThemeCoverage(
    {
      dimensions,
      coverage,
      missingOverrides,
      availableSets: sets,
      optionSetOrders,
      setTokenCounts,
    },
  );

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

  useEffect(() => {
    if (!editingRoleTarget) return;
    const dimension = dimensions.find(
      (dim) => dim.id === editingRoleTarget.dimId,
    );
    if (!dimension) {
      setEditingRoleTarget(null);
      return;
    }
    const optionExists = dimension.options.some(
      (option: ThemeOption) => option.name === editingRoleTarget.optionName,
    );
    if (!optionExists) {
      setEditingRoleTarget(null);
      return;
    }
    if (editingRoleTarget.setName && sets.includes(editingRoleTarget.setName)) {
      return;
    }
    setEditingRoleTarget({
      dimId: editingRoleTarget.dimId,
      optionName: editingRoleTarget.optionName,
      setName: sets[0] ?? null,
    });
  }, [dimensions, editingRoleTarget, sets]);

  const openRoleEditor = useCallback(
    (dimId: string, optionName: string, preferredSetName?: string | null) => {
      setEditingRoleTarget({
        dimId,
        optionName,
        setName:
          preferredSetName && sets.includes(preferredSetName)
            ? preferredSetName
            : (sets[0] ?? null),
      });
    },
    [sets],
  );

  const closeRoleEditor = useCallback((dimId: string, optionName: string) => {
    setEditingRoleTarget((current) =>
      current?.dimId === dimId && current.optionName === optionName
        ? null
        : current,
    );
  }, []);

  const setRoleEditorSetName = useCallback(
    (dimId: string, optionName: string, setName: string) => {
      setEditingRoleTarget((current) => {
        if (current?.dimId === dimId && current.optionName === optionName) {
          return { ...current, setName };
        }
        return {
          dimId,
          optionName,
          setName,
        };
      });
    },
    [],
  );

  const focusRoleTarget = useCallback(
    (
      target: ThemeRoleNavigationTarget | null | undefined,
      openEditor = true,
    ) => {
      const dimension = getDimensionForContext(target?.dimId ?? null);
      const optionName = getOptionNameForContext(
        dimension,
        target?.optionName ?? null,
      );
      if (!dimension || !optionName) return;

      setFocusedDimensionId(dimension.id);
      setSelectedOptions((prev) => ({ ...prev, [dimension.id]: optionName }));

      if (openEditor) {
        openRoleEditor(
          dimension.id,
          optionName,
          target?.preferredSetName ?? null,
        );
      }

      scrollToDimension(dimension.id);
      scrollToSetRoles(dimension.id, optionName);
    },
    [
      getDimensionForContext,
      getOptionNameForContext,
      openRoleEditor,
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
        focusRoleTarget(resolvedTarget, activeView === "coverage");
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
      setAuthoringMode,
      setShowAddOption,
      setShowCompare,
      sets,
    ],
  );

  // --- Create override set ---
  const [createOverrideSet, setCreateOverrideSet] = useState<{
    dimId: string;
    setName: string;
    optName?: string;
  } | null>(null);
  const [isCreatingOverrideSet, setIsCreatingOverrideSet] = useState(false);

  const executeCreateOverrideSet = useCallback(
    async ({
      newName,
      optionName,
      startEmpty,
    }: {
      newName: string;
      optionName: string;
      startEmpty: boolean;
    }) => {
      if (!createOverrideSet) return;
      const { dimId, setName: sourceName } = createOverrideSet;
      setIsCreatingOverrideSet(true);
      try {
        if (startEmpty) {
          await apiFetch<{ ok: true; name: string }>(`${serverUrl}/api/sets`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: newName }),
          });
        } else {
          await apiFetch<{ ok: true; name: string; originalName: string }>(
            `${serverUrl}/api/sets/${encodeURIComponent(sourceName)}/duplicate`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ newName }),
            },
          );
        }
        // Link the new set to the selected theme option as Override
        const dim = dimensions.find((d) => d.id === dimId);
        const opt = dim?.options.find(
          (o: ThemeOption) => o.name === optionName,
        );
        if (dim && opt) {
          const updatedSets = { ...opt.sets, [newName]: "enabled" as const };
          await apiFetch(
            `${serverUrl}/api/themes/dimensions/${encodeURIComponent(dimId)}/options`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: optionName, sets: updatedSets }),
            },
          );
        }
        onSetCreated?.(newName);
        onTokensCreated?.();
        await debouncedFetchDimensions();
        setCreateOverrideSet(null);
        onSuccess?.(
          `Created override set "${newName}"${dim && opt ? ` linked to ${dim.name} → ${optionName}` : ""}`,
        );
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to create override set",
        );
      } finally {
        setIsCreatingOverrideSet(false);
      }
    },
    [
      createOverrideSet,
      dimensions,
      serverUrl,
      debouncedFetchDimensions,
      onSetCreated,
      onTokensCreated,
      onSuccess,
      setError,
    ],
  );

  // Sync showCompare (set by external navigateToCompare calls) → activeView
  useEffect(() => {
    if (showCompare) setActiveView("compare");
  }, [showCompare]);

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
      setAuthoringMode,
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
      setAuthoringMode,
      setShowCompare,
    ],
  );

  const openAdvancedView = useCallback(() => {
    setShowCompare(false);
    setAuthoringMode("roles");
    setActiveView("advanced");
  }, [setAuthoringMode, setShowCompare]);

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
    [focusedDimensionId, navigateToCompareState],
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
      setShowCompare,
    ],
  );

  // --- Per-option diff counts vs currently selected option ---
  const optionDiffCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const resolveOpt = (opt: ThemeOption): Record<string, any> => {
      const merged: Record<string, any> = {};
      for (const [s, st] of Object.entries(opt.sets)) {
        if (st === "source") Object.assign(merged, setTokenValues[s] ?? {});
      }
      for (const [s, st] of Object.entries(opt.sets)) {
        if (st === "enabled") Object.assign(merged, setTokenValues[s] ?? {});
      }
      const resolve = (v: any, depth = 0): any => {
        if (depth > 10 || typeof v !== "string") return v;
        const m = /^\{([^}]+)\}$/.exec(v);
        if (!m) return v;
        const t = m[1];
        return t in merged ? resolve(merged[t], depth + 1) : v;
      };
      const out: Record<string, any> = {};
      for (const [p, v] of Object.entries(merged)) out[p] = resolve(v);
      return out;
    };
    for (const dim of dimensions) {
      if (dim.options.length < 2) continue;
      const selOptName = selectedOptions[dim.id] || dim.options[0]?.name || "";
      const selOpt = dim.options.find(
        (o: ThemeOption) => o.name === selOptName,
      );
      if (!selOpt) continue;
      const selTokens = resolveOpt(selOpt);
      for (const opt of dim.options) {
        if (opt.name === selOptName) continue;
        const optTokens = resolveOpt(opt);
        const allPaths = new Set([
          ...Object.keys(optTokens),
          ...Object.keys(selTokens),
        ]);
        let diff = 0;
        for (const path of allPaths) {
          if (
            JSON.stringify(optTokens[path]) !== JSON.stringify(selTokens[path])
          )
            diff++;
        }
        counts[`${dim.id}/${opt.name}`] = diff;
      }
    }
    return counts;
  }, [dimensions, selectedOptions, setTokenValues]);

  const optionRoleSummaries = useMemo(() => {
    const summaries: Record<string, ThemeOptionRoleSummary> = {};
    for (const dimension of dimensions) {
      for (const option of dimension.options) {
        summaries[`${dimension.id}:${option.name}`] = summarizeThemeOptionRoles(
          {
            option,
            orderedSets: optionSetOrders[dimension.id]?.[option.name] || sets,
            availableSets: sets,
            tokenCountsBySet: setTokenCounts,
            uncoveredCount:
              coverage[dimension.id]?.[option.name]?.uncovered.length ?? 0,
            missingOverrideCount:
              missingOverrides[dimension.id]?.[option.name]?.missing.length ??
              0,
          },
        );
      }
    }
    return summaries;
  }, [
    coverage,
    dimensions,
    missingOverrides,
    optionSetOrders,
    setTokenCounts,
    sets,
  ]);

  const resolverAuthoringContext = useMemo(
    () =>
      resolverState
        ? buildThemeResolverAuthoringContext({
            dimensions,
            selectedOptions,
            resolvers: resolverState.resolvers,
            activeResolverName: resolverState.activeResolver,
          })
        : null,
    [dimensions, resolverState, selectedOptions],
  );

  // --- Render helpers ---

  const renderSetRow = (
    dim: ThemeDimension,
    opt: ThemeOption,
    setName: string,
    status: ThemeRoleState,
    isEditingRoles: boolean,
    isBulkActionTarget: boolean,
  ) => {
    const isSaving = savingKeys.has(`${dim.id}/${opt.name}/${setName}`);
    const tokenCount = setTokenCounts[setName] ?? null;
    const isEmptyOverride =
      status === "enabled" && tokenCount !== null && tokenCount === 0;
    return (
      <div
        key={setName}
        className={`rounded border px-2 py-1 transition-colors ${
          isBulkActionTarget
            ? "border-[var(--color-figma-accent)]/40 bg-[var(--color-figma-accent)]/6"
            : "border-transparent hover:bg-[var(--color-figma-bg-hover)]"
        } ${isSaving ? "opacity-50 pointer-events-none" : ""}`}
      >
        <div className="flex items-start justify-between gap-2">
          {isEditingRoles ? (
            <button
              type="button"
              onClick={() => setRoleEditorSetName(dim.id, opt.name, setName)}
              className="min-w-0 flex-1 text-left"
              aria-pressed={isBulkActionTarget}
              title={`Focus bulk actions on ${setName}`}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className="truncate text-[10px] font-medium text-[var(--color-figma-text)]"
                  title={setName}
                >
                  {setName}
                </span>
                {isBulkActionTarget && (
                  <span className="rounded-full border border-[var(--color-figma-accent)]/30 bg-[var(--color-figma-accent)]/12 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-[0.08em] text-[var(--color-figma-accent)]">
                    Bulk target
                  </span>
                )}
              </div>
            </button>
          ) : (
            <div className="min-w-0 flex-1">
              <span
                className="block truncate text-[10px] font-medium text-[var(--color-figma-text)]"
                title={setName}
              >
                {setName}
              </span>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-end gap-1">
            <span className="rounded-full border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--color-figma-text-secondary)]">
              {tokenCount === null
                ? "Loading tokens…"
                : `${tokenCount} token${tokenCount === 1 ? "" : "s"}`}
            </span>
            {isEmptyOverride && (
              <NoticePill
                severity="warning"
                title="This override set is empty — it contains no tokens and will not change any values when this theme option is active"
              >
                empty
              </NoticePill>
            )}
          </div>
        </div>
        {isEditingRoles && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1 pl-2">
            {roleStates.map((nextState) => (
              <button
                key={nextState}
                type="button"
                onClick={() => {
                  setRoleEditorSetName(dim.id, opt.name, setName);
                  if (status !== nextState)
                    handleSetState(dim.id, opt.name, setName, nextState);
                }}
                className={`min-h-6 rounded border px-2 py-1 text-[9px] font-medium transition-colors ${
                  status === nextState
                    ? nextState === "source"
                      ? "border-[var(--color-figma-accent)]/30 bg-[var(--color-figma-accent)]/12 text-[var(--color-figma-accent)]"
                      : nextState === "enabled"
                        ? "border-[var(--color-figma-success)]/30 bg-[var(--color-figma-success)]/12 text-[var(--color-figma-success)]"
                        : "border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)]"
                    : "border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                }`}
                aria-label={`${STATE_LABELS[nextState]} "${setName}": ${STATE_DESCRIPTIONS[nextState]}`}
                aria-pressed={status === nextState}
              >
                {STATE_LABELS[nextState]}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderValuePreview = (value: any) => {
    if (typeof value === "string") {
      // Color preview
      if (/^#[0-9a-fA-F]{6,8}$/.test(value)) {
        return (
          <span className="flex items-center gap-1">
            <span
              className="inline-block w-3 h-3 rounded border border-[var(--color-figma-border)]"
              style={{ backgroundColor: value }}
            />
            <span className="font-mono text-[10px]">{value}</span>
          </span>
        );
      }
      // Alias reference
      if (/^\{[^}]+\}$/.test(value)) {
        return (
          <span className="font-mono text-[10px] text-[var(--color-figma-warning)]">
            {value}
          </span>
        );
      }
    }
    return (
      <span className="font-mono text-[10px]">
        {typeof value === "object" ? JSON.stringify(value) : String(value)}
      </span>
    );
  };

  const focusedDimension = useMemo(
    () =>
      dimensions.find((dim) => dim.id === focusedDimensionId) ??
      dimensions[0] ??
      null,
    [dimensions, focusedDimensionId],
  );
  const focusedOptionName = useMemo(
    () => getOptionNameForContext(focusedDimension, null),
    [focusedDimension, getOptionNameForContext],
  );
  const canCompareThemes = useMemo(
    () => dimensions.some((dim) => dim.options.length >= 2),
    [dimensions],
  );
  const focusedContextLabel = useMemo(() => {
    if (!focusedDimension) return "current theme context";
    if (focusedOptionName)
      return `${focusedDimension.name} -> ${focusedOptionName}`;
    return focusedDimension.name;
  }, [focusedDimension, focusedOptionName]);
  const focusedOptionIssues = useMemo(
    () =>
      focusedDimension && focusedOptionName
        ? (optionIssues[`${focusedDimension.id}:${focusedOptionName}`] ?? [])
        : [],
    [focusedDimension, focusedOptionName, optionIssues],
  );
  const focusedIssueCount = useMemo(
    () => focusedOptionIssues.reduce((sum, issue) => sum + issue.count, 0),
    [focusedOptionIssues],
  );
  const focusedPrimaryIssue = focusedOptionIssues[0] ?? null;
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
      return Object.values(optionIssues)
        .flat()
        .sort((left, right) => right.count - left.count);
    }
    if (coverageFocusIssues.length > 0) return coverageFocusIssues;
    if (!coverageFocusDimension) return [];
    return coverageFocusDimension.options.flatMap(
      (option: ThemeDimension["options"][number]) =>
        optionIssues[`${coverageFocusDimension.id}:${option.name}`] ?? [],
    );
  }, [
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

  const renderIssueEntry = useCallback(
    (issue: ThemeIssueSummary, source: "authoring" | "coverage") => {
      const actionLabel =
        source === "coverage"
          ? "Edit set roles"
          : issue.kind === "stale-set" || issue.kind === "empty-override"
            ? "Edit set roles"
            : "Review issue";
      const issueSeverity: "error" | "warning" =
        issue.kind === "stale-set" ? "error" : "warning";
      const toneClass =
        issue.kind === "stale-set"
          ? "border-[var(--color-figma-error)]/30 bg-[var(--color-figma-error)]/10"
          : issue.kind === "missing-override"
            ? "border-violet-500/25 bg-violet-500/8"
            : "border-[var(--color-figma-warning)]/30 bg-[var(--color-figma-warning)]/8";

      const handleAction = () => {
        const target = {
          dimId: issue.dimensionId,
          optionName: issue.optionName,
          preferredSetName: issue.preferredSetName,
        };

        if (
          source === "coverage" ||
          issue.kind === "stale-set" ||
          issue.kind === "empty-override"
        ) {
          returnToAuthoring(target);
          return;
        }

        openCoverageView(target, false);
      };

      return (
        <div
          key={issue.key}
          className={`rounded border px-2.5 py-2 ${toneClass}`}
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-semibold text-[var(--color-figma-text)]">
                  {issue.title}
                </span>
                <NoticeCountBadge
                  severity={
                    issue.kind === "missing-override" ? "info" : issueSeverity
                  }
                  count={issue.count}
                  className="min-w-[18px] px-1.5 font-semibold"
                />
              </div>
              <div className="mt-1 text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
                {issue.summary}
              </div>
              <div className="mt-1 text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
                Next: {issue.recommendedNextAction}
              </div>
            </div>
            <button
              type="button"
              onClick={handleAction}
              className="shrink-0 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[10px] font-medium text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
            >
              {actionLabel}
            </button>
          </div>
        </div>
      );
    },
    [openCoverageView, returnToAuthoring],
  );

  const modalContextValue = useThemeManagerModalsValue({
    dimensions,
    autoFillPreview,
    setAutoFillPreview,
    autoFillStrategy,
    setAutoFillStrategy,
    executeAutoFillAll,
    executeAutoFillAllOptions,
    dimensionDeleteConfirm,
    setDimensionDeleteConfirm: openDeleteConfirm,
    closeDeleteConfirm,
    executeDeleteDimension,
    optionDeleteConfirm,
    setOptionDeleteConfirm,
    executeDeleteOption,
    createOverrideSet,
    setCreateOverrideSet,
    executeCreateOverrideSet,
    isCreatingOverrideSet,
  });

  if (!connected) {
    return (
      <div className="flex items-center justify-center py-12 text-[var(--color-figma-text-secondary)] text-[11px]">
        Connect to server to manage themes
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-[var(--color-figma-text-secondary)] text-[11px]">
        <Spinner size="md" className="text-[var(--color-figma-accent)]" />
        Loading themes...
      </div>
    );
  }

  return (
    <ThemeManagerModalsProvider value={modalContextValue}>
      <div className="flex flex-col h-full">
        {error && (
          <div className="mx-3 mt-2">
            <NoticeInlineAlert
              severity="error"
              onDismiss={() => setError(null)}
            >
              {error}
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
              onSelectIssue={(issue) => {
                openCoverageView(
                  {
                    dimId: issue.dimensionId,
                    optionName: issue.optionName,
                    preferredSetName: issue.preferredSetName,
                  },
                  false,
                );
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
                returnToAuthoring({
                  dimId: compareFocusDimension?.id ?? compareContext.dimId,
                  optionName:
                    compareFocusOptionName ?? compareContext.optionName,
                  preferredSetName: null,
                });
              }}
            />
          ) : activeView === "advanced" && resolverState ? (
            <ThemeAdvancedScreen
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
              totalFillableGaps={totalFillableGaps}
              optionDiffCounts={optionDiffCounts}
              optionRoleSummaries={optionRoleSummaries}
              focusedDimension={focusedDimension}
              canCompareThemes={canCompareThemes}
              resolverAvailable={Boolean(resolverState)}
              resolverAuthoringContext={resolverAuthoringContext}
              newlyCreatedDim={newlyCreatedDim}
              draggingDimId={draggingDimId}
              dragOverDimId={dragOverDimId}
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
              roleStates={roleStates}
              fillingKeys={fillingKeys}
              onNavigateToToken={onNavigateToToken}
              onGenerateForDimension={onGenerateForDimension}
              setRenameValue={setRenameValue}
              startRenameDim={startRenameDim}
              cancelRenameDim={cancelRenameDim}
              executeRenameDim={executeRenameDim}
              openDeleteConfirm={openDeleteConfirm}
              handleDuplicateDimension={handleDuplicateDimension}
              handleMoveDimension={handleMoveDimension}
              handleDimDragStart={handleDimDragStart}
              handleDimDragOver={handleDimDragOver}
              handleDimDrop={handleDimDrop}
              handleDimDragEnd={handleDimDragEnd}
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
              onOpenCompareView={openCompareView}
              onOpenAdvancedView={openAdvancedView}
              onFocusRoleTarget={focusRoleTarget}
            />
          )}
        </>

        <ThemeManagerModals />
      </div>
    </ThemeManagerModalsProvider>
  );
});
