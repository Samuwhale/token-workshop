import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { Spinner } from "./Spinner";
import type { ThemeDimension, ThemeOption } from "@tokenmanager/core";
import type { UndoSlot } from "../hooks/useUndo";
import type { ResolverContentProps } from "./ResolverPanel";
import { ResolverContent } from "./ResolverPanel";
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
import { UnifiedComparePanel } from "./UnifiedComparePanel";
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
} from "./ThemeManagerContext";
import type { ThemeManagerModalsState } from "./ThemeManagerContext";
import { ThemeCoverageMatrix } from "./ThemeCoverageMatrix";
import { getMenuItems, handleMenuArrowKeys } from "../hooks/useMenuKeyboard";
import { adaptShortcut } from "../shared/utils";
import { SHORTCUT_KEYS } from "../shared/shortcutRegistry";
import { apiFetch } from "../shared/apiFetch";
import { NoticeBanner, NoticePill, NoticeCountBadge, NoticeFieldMessage, NoticeInlineAlert } from '../shared/noticeSystem';
import type {
  ThemeAuthoringStage,
  ThemeIssueSummary,
  ThemeManagerView,
  ThemeWorkspaceShellState,
} from "../shared/themeWorkflow";

interface ThemeRoleNavigationTarget {
  dimId: string | null;
  optionName: string | null;
  preferredSetName?: string | null;
}

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
  // Live preview panel
  const [showPreview, setShowPreview] = useState(false);
  const [previewSearch, setPreviewSearch] = useState("");
  // The default flow stays in theme authoring; review and resolver tools are explicit secondary views.
  const [activeView, setActiveView] = useState<ThemeManagerView>("authoring");
  const [editingRoleTarget, setEditingRoleTarget] = useState<{
    dimId: string;
    optionName: string;
    setName: string | null;
  } | null>(null);
  // Collapsed "Excluded" sections per dimension
  const [collapsedDisabled, setCollapsedDisabled] = useState<Set<string>>(
    new Set(),
  );
  // Dimension/option search filter
  const [dimSearch, setDimSearch] = useState("");
  const dimSearchRef = useRef<HTMLInputElement | null>(null);
  const previewSearchRef = useRef<HTMLInputElement | null>(null);
  const [showOnlyWithGaps, setShowOnlyWithGaps] = useState(false);
  const dimensionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const setRoleRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const previewSectionRef = useRef<HTMLDivElement | null>(null);
  const secondaryToolsRef = useRef<HTMLDivElement | null>(null);
  const [focusedDimensionId, setFocusedDimensionId] = useState<string | null>(
    null,
  );
  const [secondaryToolsOpen, setSecondaryToolsOpen] = useState(false);
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
  // Tab strip scroll state — tracks whether each dimension's tab strip can scroll left/right
  const tabScrollRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [tabScrollState, setTabScrollState] = useState<
    Record<string, { left: boolean; right: boolean }>
  >({});

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
    onShellStateChange?.({ activeView, showPreview });
  }, [activeView, onShellStateChange, showPreview]);
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
        dim.options.some((option) => option.name === preferredName)
      )
        return preferredName;
      const selectedName = selectedOptions[dim.id];
      if (
        selectedName &&
        dim.options.some((option) => option.name === selectedName)
      )
        return selectedName;
      return dim.options[0]?.name ?? null;
    },
    [selectedOptions],
  );

  const scrollToDimension = useCallback((dimId: string | null | undefined) => {
    if (!dimId) return;
    requestAnimationFrame(() => {
      dimensionRefs.current[dimId]?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, []);

  const scrollToSetRoles = useCallback((dimId: string, optionName: string) => {
    requestAnimationFrame(() => {
      setRoleRefs.current[`${dimId}:${optionName}`]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
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
      (option) => option.name === editingRoleTarget.optionName,
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

  const scrollToPreview = useCallback(() => {
    requestAnimationFrame(() => {
      previewSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, []);

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

      if (stage === "preview") {
        setShowPreview(true);
        scrollToPreview();
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
      scrollToPreview,
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
        const opt = dim?.options.find((o) => o.name === optionName);
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
      setShowPreview(false);
      setActiveView("coverage");
    },
    [getDimensionForContext, getOptionNameForContext, setShowCompare],
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
          compareDimension.options.find((option) => option.name !== optionAName)
            ?.name ??
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
      setShowPreview(false);
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
      setShowCompare,
    ],
  );

  const openAdvancedView = useCallback(() => {
    setShowCompare(false);
    setShowPreview(false);
    setActiveView("advanced");
  }, [setShowCompare]);

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
  useEffect(() => {
    if (!themeManagerHandle) return;
    themeManagerHandle.current = {
      autoFillAllGaps: () => {
        const dimWithGaps = dimensions.find((dim) => {
          const dimCov = coverage[dim.id] ?? {};
          return Object.values(dimCov).some((opt) =>
            opt.uncovered.some(
              (i) => i.missingRef && i.fillValue !== undefined,
            ),
          );
        });
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
    };
    return () => {
      themeManagerHandle.current = null;
    };
  }, [
    themeManagerHandle,
    dimensions,
    coverage,
    focusAuthoringStage,
    handleNavigateToCompare,
    openAdvancedView,
    openCreateDim,
    returnToAuthoring,
    setShowCompare,
  ]);

  // Tab strip scroll helpers
  const updateTabScroll = useCallback((dimId: string) => {
    const el = tabScrollRefs.current[dimId];
    if (!el) return;
    setTabScrollState((prev) => ({
      ...prev,
      [dimId]: {
        left: el.scrollLeft > 0,
        right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
      },
    }));
  }, []);

  useEffect(() => {
    const cleanup: (() => void)[] = [];
    dimensions.forEach((dim) => {
      const el = tabScrollRefs.current[dim.id];
      if (!el) return;
      const onScroll = () => updateTabScroll(dim.id);
      el.addEventListener("scroll", onScroll, { passive: true });
      const ro = new ResizeObserver(() => updateTabScroll(dim.id));
      ro.observe(el);
      updateTabScroll(dim.id);
      cleanup.push(() => {
        el.removeEventListener("scroll", onScroll);
        ro.disconnect();
      });
    });
    return () => cleanup.forEach((fn) => fn());
  }, [dimensions, updateTabScroll]);

  // --- Live preview: compute resolved token values for current selections ---

  const previewTokens = useMemo(() => {
    if (!showPreview || dimensions.length === 0) return [];

    // Merge tokens according to the stacking model
    const merged: Record<string, { value: any; set: string; layer: string }> =
      {};

    // Apply dimensions bottom to top (last dimension = lowest priority, first = highest)
    for (let i = dimensions.length - 1; i >= 0; i--) {
      const dim = dimensions[i];
      const optName = selectedOptions[dim.id];
      const opt = dim.options.find((o) => o.name === optName);
      if (!opt) continue;

      // Base sets first (can be overridden)
      for (const [setName, status] of Object.entries(opt.sets)) {
        if (status !== "source") continue;
        const tokens = setTokenValues[setName];
        if (!tokens) continue;
        for (const [path, value] of Object.entries(tokens)) {
          merged[path] = { value, set: setName, layer: `${dim.name} / Base` };
        }
      }
      // Override sets (take priority)
      for (const [setName, status] of Object.entries(opt.sets)) {
        if (status !== "enabled") continue;
        const tokens = setTokenValues[setName];
        if (!tokens) continue;
        for (const [path, value] of Object.entries(tokens)) {
          merged[path] = {
            value,
            set: setName,
            layer: `${dim.name} / Override`,
          };
        }
      }
    }

    // Resolve aliases
    const resolveAlias = (value: any, depth = 0): any => {
      if (depth > 10 || typeof value !== "string") return value;
      const m = /^\{([^}]+)\}$/.exec(value);
      if (!m) return value;
      const target = m[1];
      if (merged[target]) return resolveAlias(merged[target].value, depth + 1);
      return value;
    };

    let entries = Object.entries(merged).map(([path, info]) => ({
      path,
      rawValue: info.value,
      resolvedValue: resolveAlias(info.value),
      set: info.set,
      layer: info.layer,
    }));

    if (previewSearch) {
      const term = previewSearch.toLowerCase();
      entries = entries.filter(
        (e) =>
          e.path.toLowerCase().includes(term) ||
          e.set.toLowerCase().includes(term) ||
          String(e.resolvedValue).toLowerCase().includes(term),
      );
    }

    return entries.slice(0, 50);
  }, [showPreview, dimensions, selectedOptions, setTokenValues, previewSearch]);

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
      const selOpt = dim.options.find((o) => o.name === selOptName);
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

  // Filter dimensions (and their options) by search query and/or gaps toggle
  // Must be before early returns to satisfy rules-of-hooks
  const filteredDimensions = useMemo(() => {
    let result = dimensions;
    if (showOnlyWithGaps) {
      result = result.filter((dim) => {
        const dimCov = coverage[dim.id] ?? {};
        return Object.values(dimCov).some((opt) => opt.uncovered.length > 0);
      });
    }
    const q = dimSearch.trim().toLowerCase();
    if (!q) return result;
    return result.filter((dim) => {
      if (dim.name.toLowerCase().includes(q)) return true;
      return dim.options.some((o) => o.name.toLowerCase().includes(q));
    });
  }, [dimensions, dimSearch, showOnlyWithGaps, coverage]);

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
                  severity={issue.kind === "missing-override" ? "info" : issueSeverity}
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

  useEffect(() => {
    if (!secondaryToolsOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!secondaryToolsRef.current?.contains(event.target as Node)) {
        setSecondaryToolsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSecondaryToolsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    requestAnimationFrame(() => {
      if (!secondaryToolsRef.current) return;
      getMenuItems(secondaryToolsRef.current)[0]?.focus();
    });

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [secondaryToolsOpen]);

  useEffect(() => {
    if (activeView !== "authoring") {
      setSecondaryToolsOpen(false);
    }
  }, [activeView]);

  const modalContextValue = useMemo<ThemeManagerModalsState>(
    () => ({
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
      setOptionDeleteConfirm: (v) => setOptionDeleteConfirm(v),
      executeDeleteOption,
      createOverrideSet,
      setCreateOverrideSet,
      executeCreateOverrideSet,
      isCreatingOverrideSet,
    }),
    [
      dimensions,
      autoFillPreview,
      setAutoFillPreview,
      autoFillStrategy,
      setAutoFillStrategy,
      executeAutoFillAll,
      executeAutoFillAllOptions,
      dimensionDeleteConfirm,
      openDeleteConfirm,
      closeDeleteConfirm,
      executeDeleteDimension,
      optionDeleteConfirm,
      setOptionDeleteConfirm,
      executeDeleteOption,
      createOverrideSet,
      setCreateOverrideSet,
      executeCreateOverrideSet,
      isCreatingOverrideSet,
    ],
  );

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
            <NoticeInlineAlert severity="error" onDismiss={() => setError(null)}>
              {error}
            </NoticeInlineAlert>
          </div>
        )}
        {fetchWarnings && (
          <div className="mx-3 mt-2">
            <NoticeInlineAlert severity="warning" onDismiss={clearFetchWarnings}>
              {fetchWarnings}
            </NoticeInlineAlert>
          </div>
        )}

        <>
          {activeView === "coverage" && (
            <div className="shrink-0 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
              <div className="px-3 py-2.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-[var(--color-figma-text)]">
                    {showAllCoverageAxes || !coverageFocusDimension
                      ? "Coverage review"
                      : `Coverage for ${coverageFocusDimension.name}`}
                  </p>
                  <p className="mt-0.5 text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
                    {showAllCoverageAxes || !coverageFocusDimension
                      ? "Started from the current theme context and expanded to every axis. Focus any issue, then jump straight back into the matching role editor."
                      : coveragePrimaryIssue
                        ? `${coveragePrimaryIssue.dimensionName} -> ${coveragePrimaryIssue.optionName}: ${coveragePrimaryIssue.recommendedNextAction}`
                        : coverageFocusOptionName
                          ? `Review issue summaries for ${coverageFocusDimension.name} -> ${coverageFocusOptionName}, then jump straight back into that option's set roles.`
                          : "Review issue summaries for the current axis, then jump back into authoring to fix the mapping."}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {dimensions.length > 1 && coverageFocusDimension && (
                    <button
                      onClick={() => setShowAllCoverageAxes((value) => !value)}
                      className="inline-flex items-center gap-1 rounded border border-[var(--color-figma-border)] px-2 py-1 text-[10px] font-medium text-[var(--color-figma-text-secondary)] transition-colors hover:border-[var(--color-figma-accent)]/40 hover:text-[var(--color-figma-text)]"
                    >
                      {showAllCoverageAxes
                        ? `Focus ${coverageFocusDimension.name}`
                        : "Show all axes"}
                    </button>
                  )}
                  <button
                    onClick={() => returnToAuthoring(coverageContext)}
                    className="inline-flex items-center gap-1 rounded border border-[var(--color-figma-border)] px-2 py-1 text-[10px] font-medium text-[var(--color-figma-text-secondary)] transition-colors hover:border-[var(--color-figma-accent)]/40 hover:text-[var(--color-figma-text)]"
                  >
                    <svg
                      width="9"
                      height="9"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M15 18l-6-6 6-6" />
                    </svg>
                    Back to set roles
                  </button>
                </div>
              </div>
              {!showAllCoverageAxes && coverageFocusDimension && (
                <div className="px-3 pb-2 flex flex-wrap items-center gap-1.5 text-[9px] text-[var(--color-figma-text-tertiary)]">
                  <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-0.5">
                    <span className="font-medium text-[var(--color-figma-text-secondary)]">
                      Axis
                    </span>
                    <span>{coverageFocusDimension.name}</span>
                  </span>
                  {coverageFocusOptionName && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-0.5">
                      <span className="font-medium text-[var(--color-figma-text-secondary)]">
                        Option
                      </span>
                      <span>{coverageFocusOptionName}</span>
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-0.5">
                    <span className="font-medium text-[var(--color-figma-text-secondary)]">
                      Issues
                    </span>
                    <span>{coverageFocusIssueCount}</span>
                  </span>
                </div>
              )}
            </div>
          )}
          {activeView === "compare" && (
            <div className="shrink-0 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
              <div className="px-3 py-2.5">
                <p className="text-[12px] font-semibold text-[var(--color-figma-text)]">
                  {compareFocusDimension
                    ? `Compare from ${compareFocusDimension.name}`
                    : "Compare in theme context"}
                </p>
                <p className="mt-0.5 text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
                  {compareFocusDimension && compareFocusOptionName
                    ? `Theme option comparison starts from ${compareFocusDimension.name} → ${compareFocusOptionName}. Switch compare modes if you need token-level or set-level analysis without losing this context.`
                    : "Compare launches from the current axis or option so you can inspect alternatives without leaving theme authoring."}
                </p>
              </div>
            </div>
          )}
          {activeView === "advanced" && resolverState && (
            <div className="shrink-0 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
              <div className="px-3 py-2.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-[var(--color-figma-text)]">
                    Advanced theme logic
                  </p>
                  <p className="mt-0.5 text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
                    Use DTCG resolvers when you need explicit resolution order,
                    modifier contexts, or cross-dimensional logic beyond
                    light/dark style theme authoring.
                  </p>
                </div>
                <button
                  onClick={() => setActiveView("authoring")}
                  className="shrink-0 inline-flex items-center gap-1 rounded border border-[var(--color-figma-border)] px-2 py-1 text-[10px] font-medium text-[var(--color-figma-text-secondary)] transition-colors hover:border-[var(--color-figma-accent)]/40 hover:text-[var(--color-figma-text)]"
                >
                  <svg
                    width="9"
                    height="9"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                  Back to authoring
                </button>
              </div>
              <div className="px-3 pb-2 flex items-center gap-2 text-[9px] text-[var(--color-figma-text-tertiary)]">
                <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-0.5">
                  <span className="font-medium text-[var(--color-figma-text-secondary)]">
                    Shortcut
                  </span>
                  <kbd className="rounded border border-[var(--color-figma-border)] px-1 font-mono leading-none">
                    {adaptShortcut(SHORTCUT_KEYS.GO_TO_RESOLVER)}
                  </kbd>
                </span>
              </div>
            </div>
          )}
          <div
            className={
              activeView === "advanced"
                ? "flex-1 overflow-hidden"
                : "flex-1 overflow-y-auto"
            }
          >
            {activeView === "authoring" &&
            dimensions.length === 0 &&
            !showCreateDim ? (
              /* Empty state */
              <div className="flex flex-col items-center justify-center px-5 py-8 text-center gap-4">
                {/* Icon */}
                <div className="w-10 h-10 rounded-xl bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] flex items-center justify-center">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-[var(--color-figma-text-secondary)]"
                    aria-hidden="true"
                  >
                    <rect x="3" y="3" width="18" height="6" rx="1.5" />
                    <rect
                      x="3"
                      y="12"
                      width="18"
                      height="6"
                      rx="1.5"
                      opacity="0.5"
                    />
                  </svg>
                </div>

                {/* Heading + description */}
                <div className="flex flex-col gap-1">
                  <p className="text-[12px] font-semibold text-[var(--color-figma-text)]">
                    No theme axes yet
                  </p>
                  <p className="text-[11px] text-[var(--color-figma-text-secondary)] leading-relaxed max-w-[240px]">
                    Themes let you switch entire sets of tokens at once —
                    light/dark mode, brand variants, or density levels — without
                    duplicating values.
                  </p>
                </div>

                {/* How themes work */}
                <div className="w-full max-w-[260px]">
                  <p className="text-[10px] text-[var(--color-figma-text-tertiary)] uppercase tracking-wide font-medium text-left mb-2">
                    How themes work
                  </p>
                  <div className="flex items-start gap-0 w-full">
                    <div className="flex-1 flex flex-col items-center gap-1 min-w-0">
                      <div className="w-6 h-6 rounded-full bg-[var(--color-figma-bg-secondary)] flex items-center justify-center text-[var(--color-figma-text-secondary)]">
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M12 2L2 7l10 5 10-5-10-5z" />
                          <path d="M2 17l10 5 10-5" />
                        </svg>
                      </div>
                      <p className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium leading-tight text-center">
                        Add axes
                      </p>
                      <p className="text-[8px] text-[var(--color-figma-text-tertiary)] leading-tight text-center">
                        Theme axes
                      </p>
                    </div>
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 8 8"
                      fill="var(--color-figma-text-tertiary)"
                      className="mt-2 shrink-0"
                    >
                      <path d="M2 1l4 3-4 3V1z" />
                    </svg>
                    <div className="flex-1 flex flex-col items-center gap-1 min-w-0">
                      <div className="w-6 h-6 rounded-full bg-[var(--color-figma-bg-secondary)] flex items-center justify-center text-[var(--color-figma-text-secondary)]">
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                          <path d="M3 9h18M9 21V9" />
                        </svg>
                      </div>
                      <p className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium leading-tight text-center">
                        Map sets
                      </p>
                      <p className="text-[8px] text-[var(--color-figma-text-tertiary)] leading-tight text-center">
                        Per option
                      </p>
                    </div>
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 8 8"
                      fill="var(--color-figma-text-tertiary)"
                      className="mt-2 shrink-0"
                    >
                      <path d="M2 1l4 3-4 3V1z" />
                    </svg>
                    <div className="flex-1 flex flex-col items-center gap-1 min-w-0">
                      <div className="w-6 h-6 rounded-full bg-[var(--color-figma-bg-secondary)] flex items-center justify-center text-[var(--color-figma-text-secondary)]">
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                        </svg>
                      </div>
                      <p className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium leading-tight text-center">
                        Switch
                      </p>
                      <p className="text-[8px] text-[var(--color-figma-text-tertiary)] leading-tight text-center">
                        Instantly
                      </p>
                    </div>
                  </div>
                </div>

                {/* Quick start */}
                <div className="w-full max-w-[260px] flex flex-col gap-1.5">
                  <p className="text-[10px] text-[var(--color-figma-text-tertiary)] uppercase tracking-wide font-medium text-left">
                    Quick start
                  </p>
                  {(
                    [
                      ["Color Mode", "Light / Dark"],
                      ["Brand", "Default / Premium"],
                      ["Density", "Regular / Compact"],
                    ] as const
                  ).map(([name, example]) => (
                    <button
                      key={name}
                      onClick={() => openCreateDim(name)}
                      className="flex items-center justify-between px-2.5 py-1.5 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-left hover:border-[var(--color-figma-accent)] hover:bg-[var(--color-figma-bg-hover)] transition-colors group"
                    >
                      <span className="text-[11px] font-medium text-[var(--color-figma-text)] group-hover:text-[var(--color-figma-accent)]">
                        {name}
                      </span>
                      <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">
                        {example}
                      </span>
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => openCreateDim()}
                  className="text-[10px] text-[var(--color-figma-accent)] hover:underline"
                >
                  or add a custom axis
                </button>

                {resolverState && (
                  <div className="w-full max-w-[260px] pt-3 mt-1 border-t border-[var(--color-figma-border)] flex flex-col gap-1">
                    <p className="text-[10px] text-[var(--color-figma-text-tertiary)] leading-snug text-left">
                      Need explicit resolution order or cross-dimensional theme
                      logic?
                    </p>
                    <button
                      onClick={() => {
                        openAdvancedView();
                      }}
                      className="flex items-center gap-1.5 text-[10px] text-[var(--color-figma-accent)] hover:underline text-left"
                    >
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                      Open advanced theme logic
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col">
                {activeView === "authoring" && (
                  <>
                    <div className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]/40 px-3 py-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-semibold text-[var(--color-figma-text)]">
                              {focusedDimension?.name ?? "Themes"}
                            </span>
                            {focusedOptionName && (
                              <>
                                <span
                                  className="text-[10px] text-[var(--color-figma-text-tertiary)]"
                                  aria-hidden="true"
                                >
                                  →
                                </span>
                                <span className="text-[11px] font-semibold text-[var(--color-figma-text)]">
                                  {focusedOptionName}
                                </span>
                              </>
                            )}
                          </div>
                          {focusedPrimaryIssue ? (
                            <div className="mt-1.5 flex flex-wrap items-center gap-2">
                              <p className="text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
                                <span className="font-medium">
                                  {focusedIssueCount} issue
                                  {focusedIssueCount !== 1 ? "s" : ""}:
                                </span>{" "}
                                {focusedPrimaryIssue.recommendedNextAction}
                              </p>
                              <button
                                type="button"
                                onClick={() => {
                                  const target = {
                                    dimId: focusedPrimaryIssue.dimensionId,
                                    optionName: focusedPrimaryIssue.optionName,
                                    preferredSetName:
                                      focusedPrimaryIssue.preferredSetName,
                                  };
                                  if (
                                    focusedPrimaryIssue.kind === "stale-set" ||
                                    focusedPrimaryIssue.kind === "empty-override"
                                  ) {
                                    focusRoleTarget(target, true);
                                  } else {
                                    openCoverageView(target, false);
                                  }
                                }}
                                className="shrink-0 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[10px] font-medium text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
                              >
                                {focusedPrimaryIssue.kind === "stale-set" ||
                                focusedPrimaryIssue.kind === "empty-override"
                                  ? "Edit set roles"
                                  : "Review coverage"}
                              </button>
                            </div>
                          ) : (
                            <p className="mt-0.5 text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
                              {focusedDimension
                                ? "No open issues for this option."
                                : "Add axes and options to begin."}
                            </p>
                          )}
                        </div>
                        <div
                          className="relative shrink-0"
                          ref={secondaryToolsRef}
                        >
                          <button
                            onClick={() =>
                              setSecondaryToolsOpen((value) => !value)
                            }
                            aria-expanded={secondaryToolsOpen}
                            aria-haspopup="menu"
                            className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[10px] font-medium transition-colors ${
                              secondaryToolsOpen
                                ? "border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]"
                                : "border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)]/35 hover:text-[var(--color-figma-text)]"
                            }`}
                            title="Open review and advanced theme tools"
                          >
                            <svg
                              width="10"
                              height="10"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <line x1="4" y1="21" x2="4" y2="14" />
                              <line x1="4" y1="10" x2="4" y2="3" />
                              <line x1="12" y1="21" x2="12" y2="12" />
                              <line x1="12" y1="8" x2="12" y2="3" />
                              <line x1="20" y1="21" x2="20" y2="16" />
                              <line x1="20" y1="12" x2="20" y2="3" />
                              <line x1="1" y1="14" x2="7" y2="14" />
                              <line x1="9" y1="8" x2="15" y2="8" />
                              <line x1="17" y1="16" x2="23" y2="16" />
                            </svg>
                            <span>Review tools</span>
                          </button>

                          {secondaryToolsOpen && (
                            <div
                              role="menu"
                              className="absolute right-0 top-full z-50 mt-1 w-[280px] overflow-hidden rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-xl"
                              onKeyDown={(event) => {
                                const container = event.currentTarget;
                                if (
                                  !handleMenuArrowKeys(
                                    event.nativeEvent,
                                    container,
                                  )
                                ) {
                                  if (event.key === "Escape") {
                                    event.preventDefault();
                                    setSecondaryToolsOpen(false);
                                  }
                                }
                              }}
                            >
                              <div className="border-b border-[var(--color-figma-border)] px-3 py-2">
                                <div className="text-[11px] font-semibold text-[var(--color-figma-text)]">
                                  Theme review tools
                                </div>
                                <div className="mt-1 text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
                                  Keep authoring focused on axes, options, set
                                  roles, and preview. Open review or expert
                                  flows only when needed.
                                </div>
                              </div>
                              <div className="p-2">
                                <div className="mb-1 px-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-figma-text-tertiary)]">
                                  Current context
                                </div>
                                <button
                                  role="menuitem"
                                  tabIndex={-1}
                                  onClick={() => {
                                    setSecondaryToolsOpen(false);
                                    openCoverageView(
                                      {
                                        dimId: focusedDimension?.id ?? null,
                                        optionName: focusedOptionName ?? null,
                                        preferredSetName:
                                          focusedPrimaryIssue?.preferredSetName ??
                                          null,
                                      },
                                      false,
                                    );
                                  }}
                                  className="flex w-full items-start justify-between gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-[var(--color-figma-bg-hover)]"
                                >
                                  <span className="min-w-0">
                                    <span className="block text-[10px] font-medium text-[var(--color-figma-text)]">
                                      Coverage review
                                    </span>
                                    <span className="mt-0.5 block text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
                                      Review missing values and override gaps
                                      for {focusedContextLabel}.
                                    </span>
                                  </span>
                                  <span className="shrink-0 rounded-full bg-[var(--color-figma-bg-secondary)] px-1.5 py-0.5 text-[9px] leading-none text-[var(--color-figma-text-secondary)]">
                                    {focusedIssueCount}
                                  </span>
                                </button>
                                <button
                                  role="menuitem"
                                  tabIndex={-1}
                                  onClick={() => {
                                    setSecondaryToolsOpen(false);
                                    openCoverageView(
                                      {
                                        dimId: focusedDimension?.id ?? null,
                                        optionName: focusedOptionName ?? null,
                                        preferredSetName:
                                          focusedPrimaryIssue?.preferredSetName ??
                                          null,
                                      },
                                      true,
                                    );
                                  }}
                                  className="flex w-full items-start justify-between gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-[var(--color-figma-bg-hover)]"
                                >
                                  <span className="min-w-0">
                                    <span className="block text-[10px] font-medium text-[var(--color-figma-text)]">
                                      Coverage across all axes
                                    </span>
                                    <span className="mt-0.5 block text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
                                      Scan every axis before returning to the
                                      workflow to fix the selected option.
                                    </span>
                                  </span>
                                  <span className="shrink-0 rounded-full bg-[var(--color-figma-bg-secondary)] px-1.5 py-0.5 text-[9px] leading-none text-[var(--color-figma-text-secondary)]">
                                    {totalIssueCount}
                                  </span>
                                </button>
                                <button
                                  role="menuitem"
                                  tabIndex={-1}
                                  disabled={!canCompareThemes}
                                  onClick={() => {
                                    setSecondaryToolsOpen(false);
                                    openCompareView(
                                      focusedDimension ?? undefined,
                                      focusedOptionName ?? undefined,
                                    );
                                  }}
                                  className="flex w-full items-start justify-between gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-[var(--color-figma-bg-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <span className="min-w-0">
                                    <span className="block text-[10px] font-medium text-[var(--color-figma-text)]">
                                      Compare options
                                    </span>
                                    <span className="mt-0.5 block text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
                                      Compare the focused axis without crowding
                                      the main authoring surface.
                                    </span>
                                  </span>
                                  {canCompareThemes && (
                                    <span className="shrink-0 rounded-full bg-[var(--color-figma-bg-secondary)] px-1.5 py-0.5 text-[9px] leading-none text-[var(--color-figma-text-secondary)]">
                                      Compare
                                    </span>
                                  )}
                                </button>
                                {resolverState && (
                                  <>
                                    <div className="my-1 border-t border-[var(--color-figma-border)]" />
                                    <div className="mb-1 px-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-figma-text-tertiary)]">
                                      Expert mode
                                    </div>
                                    <button
                                      role="menuitem"
                                      tabIndex={-1}
                                      onClick={() => {
                                        setSecondaryToolsOpen(false);
                                        openAdvancedView();
                                      }}
                                      className="flex w-full items-start justify-between gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-[var(--color-figma-bg-hover)]"
                                    >
                                      <span className="min-w-0">
                                        <span className="block text-[10px] font-medium text-[var(--color-figma-text)]">
                                          Advanced theme logic
                                        </span>
                                        <span className="mt-0.5 block text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
                                          Open DTCG resolvers for explicit
                                          ordering, modifier contexts, or
                                          cross-dimensional logic.
                                        </span>
                                      </span>
                                      <kbd className="shrink-0 rounded border border-[var(--color-figma-border)] px-1 font-mono text-[9px] leading-none text-[var(--color-figma-text-tertiary)]">
                                        {adaptShortcut(
                                          SHORTCUT_KEYS.GO_TO_RESOLVER,
                                        )}
                                      </kbd>
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    {/* Dimension search filter + gaps toggle */}
                    {dimensions.length > 1 && (
                      <div className="px-3 py-1.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]/50 flex flex-col gap-1.5">
                        <div className="relative">
                          <svg
                            className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[var(--color-figma-text-tertiary)]"
                            width="10"
                            height="10"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <circle cx="11" cy="11" r="8" />
                            <path d="M21 21l-4.35-4.35" />
                          </svg>
                          <input
                            ref={dimSearchRef}
                            type="text"
                            value={dimSearch}
                            onChange={(e) => setDimSearch(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Escape") {
                                setDimSearch("");
                                dimSearchRef.current?.blur();
                              }
                            }}
                            placeholder="Filter axes / options…"
                            className="w-full pl-6 pr-6 py-1 rounded text-[11px] bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-tertiary)] focus:focus-visible:border-[var(--color-figma-accent)]"
                          />
                          {dimSearch && (
                            <button
                              onClick={() => {
                                setDimSearch("");
                                dimSearchRef.current?.focus();
                              }}
                              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)]"
                              title="Clear search"
                              aria-label="Clear search"
                            >
                              <svg
                                width="10"
                                height="10"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <path d="M18 6L6 18M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                        </div>
                        <button
                          onClick={() => setShowOnlyWithGaps((v) => !v)}
                          className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium transition-colors self-start ${
                            showOnlyWithGaps
                              ? "bg-[var(--color-figma-warning)]/15 text-[var(--color-figma-warning)] border border-[var(--color-figma-warning)]/30"
                              : "text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                          }`}
                          title="Show only axes that have unresolved token gaps"
                        >
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                            <line x1="12" y1="9" x2="12" y2="13" />
                            <line x1="12" y1="17" x2="12.01" y2="17" />
                          </svg>
                          Show only axes with gaps
                        </button>
                      </div>
                    )}

                    {/* Priority hint */}
                    {dimensions.length > 1 && (
                      <div className="px-3 py-1 text-[10px] text-[var(--color-figma-text-tertiary)] bg-[var(--color-figma-bg-secondary)]/50 border-b border-[var(--color-figma-border)] flex items-center gap-1">
                        <svg
                          width="8"
                          height="8"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M12 19V5M5 12l7-7 7 7" />
                        </svg>
                        Higher priority
                        <span className="flex-1 border-b border-dotted border-[var(--color-figma-border)] mx-1" />
                        Lower priority
                        <svg
                          width="8"
                          height="8"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M12 5v14M5 12l7 7 7-7" />
                        </svg>
                      </div>
                    )}

                    {/* Global auto-fill suggestion banner — visible without expanding any section */}
                    {totalFillableGaps > 0 && (
                      <NoticeBanner
                        severity="warning"
                        actions={
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => {
                                const dimWithGaps = dimensions.find((dim) => {
                                  const dimCov = coverage[dim.id] ?? {};
                                  return Object.values(dimCov).some((opt) =>
                                    opt.uncovered.some(
                                      (i) =>
                                        i.missingRef && i.fillValue !== undefined,
                                    ),
                                  );
                                });
                                openCoverageView(
                                  {
                                    dimId:
                                      focusedDimension?.id ??
                                      dimWithGaps?.id ??
                                      null,
                                    optionName: focusedOptionName ?? null,
                                    preferredSetName:
                                      focusedPrimaryIssue?.preferredSetName ??
                                      null,
                                  },
                                  true,
                                );
                              }}
                              className="flex items-center gap-1 px-2 py-0.5 rounded border border-[var(--color-figma-warning)]/35 text-[10px] font-medium text-[var(--color-figma-warning)] hover:bg-[var(--color-figma-warning)]/12 transition-colors"
                              title="Review gap coverage in context"
                            >
                              Review gaps
                            </button>
                            <button
                              onClick={() => {
                                const dimWithGaps = dimensions.find((dim) => {
                                  const dimCov = coverage[dim.id] ?? {};
                                  return Object.values(dimCov).some((opt) =>
                                    opt.uncovered.some(
                                      (i) =>
                                        i.missingRef && i.fillValue !== undefined,
                                    ),
                                  );
                                });
                                if (dimWithGaps)
                                  handleAutoFillAllOptions(dimWithGaps.id);
                              }}
                              className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] transition-colors"
                              title={`Auto-fill ${totalFillableGaps} missing token${totalFillableGaps !== 1 ? "s" : ""} — opens confirmation dialog`}
                            >
                              Auto-fill gaps
                            </button>
                          </div>
                        }
                      >
                        <strong>{totalFillableGaps}</strong> gap
                        {totalFillableGaps !== 1 ? "s" : ""} can be
                        auto-filled from source sets
                      </NoticeBanner>
                    )}

                    {/* Dimension layer cards */}
                    <div className="flex flex-col">
                      {filteredDimensions.length === 0 &&
                        (dimSearch || showOnlyWithGaps) && (
                          <div className="py-6 text-center text-[11px] text-[var(--color-figma-text-tertiary)]">
                            {showOnlyWithGaps && !dimSearch
                              ? "No axes have coverage gaps"
                              : "No axes match your filter"}
                          </div>
                        )}
                      {filteredDimensions.map((dim) => {
                        const selectedOpt =
                          selectedOptions[dim.id] || dim.options[0]?.name || "";
                        const opt = dim.options.find(
                          (o) => o.name === selectedOpt,
                        );
                        const optSets = opt
                          ? optionSetOrders[dim.id]?.[opt.name] || sets
                          : sets;
                        const optionSummary = opt
                          ? optionRoleSummaries[`${dim.id}:${opt.name}`]
                          : null;
                        const dimIdx = dimensions.indexOf(dim);
                        const layerNum = dimensions.length - dimIdx;

                        // Group sets by status
                        const overrideSets = optSets.filter(
                          (s) => opt?.sets[s] === "enabled",
                        );
                        const foundationSets = optSets.filter(
                          (s) => opt?.sets[s] === "source",
                        );
                        const disabledSets = optSets.filter(
                          (s) => !opt?.sets[s] || opt?.sets[s] === "disabled",
                        );
                        const isDisabledCollapsed = collapsedDisabled.has(
                          dim.id,
                        );
                        const activeRoleEditor = editingRoleTarget;
                        const isEditingRoles =
                          activeRoleEditor?.dimId === dim.id &&
                          activeRoleEditor?.optionName === selectedOpt;
                        const bulkActionSetName = isEditingRoles
                          ? activeRoleEditor?.setName &&
                            optSets.includes(activeRoleEditor.setName)
                            ? activeRoleEditor.setName
                            : (optSets[0] ?? null)
                          : null;
                        const bulkActionCounts = bulkActionSetName
                          ? getSetRoleCounts(dim.id, bulkActionSetName)
                          : null;
                        const copySourceOptions = getCopySourceOptions(
                          dim.id,
                          selectedOpt,
                        );

                        const optionKey = `${dim.id}:${selectedOpt}`;
                        const selectedOptionIssues =
                          optionIssues[optionKey] ?? [];
                        const hasUncovered =
                          (optionSummary?.uncoveredCount ?? 0) > 0;
                        const staleSetNames =
                          optionSummary?.staleSetNames ?? [];

                        // Cross-option gap totals for this dimension
                        const dimCov = coverage[dim.id] ?? {};
                        const optionsWithGaps = dim.options.filter(
                          (o) => (dimCov[o.name]?.uncovered.length ?? 0) > 0,
                        );
                        const totalDimGaps = optionsWithGaps.reduce(
                          (sum, o) =>
                            sum + (dimCov[o.name]?.uncovered.length ?? 0),
                          0,
                        );
                        const totalDimFillable = optionsWithGaps.reduce(
                          (sum, o) => {
                            const items = dimCov[o.name]?.uncovered ?? [];
                            return (
                              sum +
                              items.filter(
                                (i) =>
                                  i.missingRef && i.fillValue !== undefined,
                              ).length
                            );
                          },
                          0,
                        );
                        const multiOptionGaps = optionsWithGaps.length > 1;
                        const isFillAllOptionsInProgress = fillingKeys.has(
                          `${dim.id}:__all_options__`,
                        );

                        return (
                          <div
                            key={dim.id}
                            ref={(el) => {
                              dimensionRefs.current[dim.id] = el;
                              if (el && dim.id === newlyCreatedDim) {
                                el.scrollIntoView({
                                  behavior: "smooth",
                                  block: "nearest",
                                });
                              }
                            }}
                            draggable
                            onDragStart={(e) => handleDimDragStart(e, dim.id)}
                            onDragOver={(e) => handleDimDragOver(e, dim.id)}
                            onDrop={() => handleDimDrop(dim.id)}
                            onDragEnd={handleDimDragEnd}
                            className={`border-b border-[var(--color-figma-border)] transition-opacity ${draggingDimId === dim.id ? "opacity-40" : ""} ${dragOverDimId === dim.id && draggingDimId !== dim.id ? "ring-2 ring-inset ring-[var(--color-figma-accent)]/50" : ""}`}
                          >
                            {/* Layer header */}
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--color-figma-bg-secondary)] group">
                              {/* Drag grip handle */}
                              {dimensions.length > 1 && (
                                <span
                                  className="cursor-grab active:cursor-grabbing text-[var(--color-figma-text-tertiary)] opacity-20 group-hover:opacity-60 hover:!opacity-100 flex-shrink-0 select-none transition-opacity"
                                  title="Drag to reorder axis"
                                  aria-hidden="true"
                                >
                                  <svg
                                    width="8"
                                    height="12"
                                    viewBox="0 0 8 12"
                                    fill="currentColor"
                                  >
                                    <circle cx="2" cy="2" r="1.2" />
                                    <circle cx="6" cy="2" r="1.2" />
                                    <circle cx="2" cy="6" r="1.2" />
                                    <circle cx="6" cy="6" r="1.2" />
                                    <circle cx="2" cy="10" r="1.2" />
                                    <circle cx="6" cy="10" r="1.2" />
                                  </svg>
                                </span>
                              )}
                              {/* Layer number badge */}
                              <span
                                className="flex items-center justify-center w-4 h-4 rounded bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] text-[10px] font-bold flex-shrink-0"
                                title={`Axis ${layerNum} — ${dimIdx === 0 ? "highest" : dimIdx === dimensions.length - 1 ? "lowest" : ""} priority`}
                              >
                                {layerNum}
                              </span>

                              {renameDim === dim.id ? (
                                <div className="flex flex-col gap-1 flex-1 min-w-0">
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="text"
                                      value={renameValue}
                                      onChange={(e) =>
                                        setRenameValue(e.target.value)
                                      }
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter")
                                          executeRenameDim();
                                        else if (e.key === "Escape")
                                          cancelRenameDim();
                                      }}
                                      className={`flex-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)] ${renameError ? "border-[var(--color-figma-error)]" : "border-[var(--color-figma-border)]"}`}
                                      autoFocus
                                    />
                                    <button
                                      onClick={executeRenameDim}
                                      disabled={!renameValue.trim()}
                                      className="px-1.5 py-0.5 rounded bg-[var(--color-figma-accent)] text-white text-[10px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
                                    >
                                      Save
                                    </button>
                                    <button
                                      onClick={cancelRenameDim}
                                      className="px-1.5 py-0.5 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                  {renameError && (
                                    <NoticeFieldMessage severity="error">{renameError}</NoticeFieldMessage>
                                  )}
                                </div>
                              ) : (
                                <>
                                  <div className="flex items-center gap-1 flex-1 min-w-0">
                                    <span
                                      className="text-[11px] font-medium text-[var(--color-figma-text)] truncate"
                                      title={dim.name}
                                    >
                                      {dim.name}
                                    </span>
                                    {totalDimGaps > 0 && (
                                      <NoticeCountBadge
                                        severity="warning"
                                        count={totalDimGaps}
                                        title={`${totalDimGaps} coverage gap${totalDimGaps !== 1 ? "s" : ""} across ${optionsWithGaps.length} option${optionsWithGaps.length !== 1 ? "s" : ""}`}
                                        className="min-w-[16px] px-1 flex-shrink-0"
                                      />
                                    )}
                                    <button
                                      onClick={() =>
                                        startRenameDim(dim.id, dim.name)
                                      }
                                      className="p-0.5 rounded opacity-20 group-hover:opacity-100 hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] flex-shrink-0 pointer-events-none group-hover:pointer-events-auto transition-opacity"
                                      title="Rename axis"
                                      aria-label="Rename axis"
                                    >
                                      <svg
                                        width="10"
                                        height="10"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        aria-hidden="true"
                                      >
                                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                                      </svg>
                                    </button>
                                  </div>
                                  {dimensions.length > 1 && (
                                    <div className="flex items-center gap-0 flex-shrink-0 opacity-20 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity">
                                      <button
                                        onClick={() =>
                                          handleMoveDimension(dim.id, "up")
                                        }
                                        disabled={dimIdx === 0}
                                        className="p-0.5 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] disabled:opacity-25 disabled:pointer-events-none"
                                        title="Move axis up (higher priority)"
                                        aria-label="Move axis up"
                                      >
                                        <svg
                                          width="10"
                                          height="10"
                                          viewBox="0 0 24 24"
                                          fill="none"
                                          stroke="currentColor"
                                          strokeWidth="2"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          aria-hidden="true"
                                        >
                                          <path d="M18 15l-6-6-6 6" />
                                        </svg>
                                      </button>
                                      <button
                                        onClick={() =>
                                          handleMoveDimension(dim.id, "down")
                                        }
                                        disabled={
                                          dimIdx === dimensions.length - 1
                                        }
                                        className="p-0.5 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] disabled:opacity-25 disabled:pointer-events-none"
                                        title="Move axis down (lower priority)"
                                        aria-label="Move axis down"
                                      >
                                        <svg
                                          width="10"
                                          height="10"
                                          viewBox="0 0 24 24"
                                          fill="none"
                                          stroke="currentColor"
                                          strokeWidth="2"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          aria-hidden="true"
                                        >
                                          <path d="M6 9l6 6 6-6" />
                                        </svg>
                                      </button>
                                    </div>
                                  )}
                                  {onGenerateForDimension && (
                                    <button
                                      onClick={() => {
                                        const targetSet =
                                          overrideSets[0] ??
                                          foundationSets[0] ??
                                          sets[0] ??
                                          "";
                                        if (targetSet)
                                          onGenerateForDimension({
                                            dimensionName: dim.name,
                                            targetSet,
                                          });
                                      }}
                                      className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium flex-shrink-0 opacity-40 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/10"
                                      title={`Generate tokens for ${dim.name} axis`}
                                      aria-label={`Generate tokens for ${dim.name} axis`}
                                    >
                                      <svg
                                        width="9"
                                        height="9"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        aria-hidden="true"
                                      >
                                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                                      </svg>
                                      Generate
                                    </button>
                                  )}
                                  <button
                                    onClick={() =>
                                      handleDuplicateDimension(dim.id)
                                    }
                                    disabled={isDuplicatingDim}
                                    className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] text-[10px] flex-shrink-0 opacity-20 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto disabled:opacity-25 disabled:pointer-events-none transition-opacity"
                                    title="Duplicate axis"
                                    aria-label="Duplicate axis"
                                  >
                                    <svg
                                      width="10"
                                      height="10"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      aria-hidden="true"
                                    >
                                      <rect
                                        x="9"
                                        y="9"
                                        width="13"
                                        height="13"
                                        rx="2"
                                        ry="2"
                                      />
                                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                                    </svg>
                                  </button>
                                  <button
                                    onClick={() => openDeleteConfirm(dim.id)}
                                    className="p-1 rounded hover:bg-[var(--color-figma-error)]/20 text-[var(--color-figma-error)] text-[10px] flex-shrink-0 opacity-20 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity"
                                    title="Delete axis"
                                    aria-label="Delete axis"
                                  >
                                    <svg
                                      width="10"
                                      height="10"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                    >
                                      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                                    </svg>
                                  </button>
                                </>
                              )}
                            </div>

                            {/* Option tabs */}
                            {dim.options.length > 0 && (
                              <div className="relative flex items-stretch border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
                                {tabScrollState[dim.id]?.left && (
                                  <button
                                    onClick={() => {
                                      const el = tabScrollRefs.current[dim.id];
                                      if (el)
                                        el.scrollBy({
                                          left: -120,
                                          behavior: "smooth",
                                        });
                                    }}
                                    className="absolute left-0 top-0 bottom-0 z-10 flex items-center px-0.5 bg-gradient-to-r from-[var(--color-figma-bg)] to-transparent text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)]"
                                    aria-label="Scroll tabs left"
                                  >
                                    <svg
                                      width="8"
                                      height="8"
                                      viewBox="0 0 8 8"
                                      fill="currentColor"
                                      aria-hidden="true"
                                    >
                                      <path d="M6 1L2 4l4 3V1z" />
                                    </svg>
                                  </button>
                                )}
                                <div
                                  ref={(el) => {
                                    tabScrollRefs.current[dim.id] = el;
                                  }}
                                  className="flex items-center gap-0 px-2 pt-1 pb-0 overflow-x-auto"
                                  style={{
                                    scrollbarWidth: "none",
                                    msOverflowStyle: "none",
                                  }}
                                >
                                  {dim.options.map((o, _oIdx) => {
                                    const optMatches =
                                      dimSearch.trim() !== "" &&
                                      o.name
                                        .toLowerCase()
                                        .includes(
                                          dimSearch.trim().toLowerCase(),
                                        );
                                    const optSummary =
                                      optionRoleSummaries[
                                        `${dim.id}:${o.name}`
                                      ];
                                    const optMissingCount =
                                      optSummary?.uncoveredCount ?? 0;
                                    const optMissingOverrideCount =
                                      optSummary?.missingOverrideCount ?? 0;
                                    const isSelected = selectedOpt === o.name;
                                    const diffCount = isSelected
                                      ? 0
                                      : (optionDiffCounts[
                                          `${dim.id}/${o.name}`
                                        ] ?? 0);
                                    const isBeingDragged =
                                      draggingOpt?.dimId === dim.id &&
                                      draggingOpt?.optionName === o.name;
                                    const isDragTarget =
                                      dragOverOpt?.dimId === dim.id &&
                                      dragOverOpt?.optionName === o.name &&
                                      draggingOpt?.optionName !== o.name;
                                    return (
                                      <button
                                        key={o.name}
                                        draggable={dim.options.length > 1}
                                        onDragStart={(e) =>
                                          handleOptDragStart(e, dim.id, o.name)
                                        }
                                        onDragOver={(e) =>
                                          handleOptDragOver(e, dim.id, o.name)
                                        }
                                        onDrop={(e) =>
                                          handleOptDrop(e, dim.id, o.name)
                                        }
                                        onDragEnd={handleOptDragEnd}
                                        onClick={() =>
                                          handleSelectOption(dim.id, o.name)
                                        }
                                        className={`relative px-2.5 py-1 text-[10px] font-medium rounded-t transition-colors flex-shrink-0 flex items-center gap-1 ${
                                          isSelected
                                            ? "text-[var(--color-figma-accent)] bg-[var(--color-figma-bg-secondary)]"
                                            : "text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
                                        }${optMatches ? " ring-1 ring-[var(--color-figma-accent)]/40 rounded" : ""}${isBeingDragged ? " opacity-40" : ""}${isDragTarget ? " ring-2 ring-[var(--color-figma-accent)]/60" : ""}${dim.options.length > 1 ? " cursor-grab active:cursor-grabbing" : ""}`}
                                      >
                                        {o.name}
                                        {!isSelected && diffCount > 0 && (
                                          <span
                                            className="inline-flex items-center justify-center min-w-[14px] h-[14px] px-0.5 rounded-full text-[9px] font-bold leading-none bg-[var(--color-figma-text-tertiary)]/20 text-[var(--color-figma-text-tertiary)]"
                                            title={`${diffCount} token${diffCount !== 1 ? "s" : ""} differ from ${selectedOpt}`}
                                          >
                                            {diffCount}
                                          </span>
                                        )}
                                        {optMissingCount > 0 && (
                                          <NoticeCountBadge
                                            severity="warning"
                                            count={optMissingCount}
                                            title={`${optMissingCount} unresolved alias${optMissingCount !== 1 ? "es" : ""}`}
                                          />
                                        )}
                                        {optMissingOverrideCount > 0 && (
                                          <span
                                            className="inline-flex items-center justify-center min-w-[14px] h-[14px] px-0.5 rounded-full text-[9px] font-bold leading-none bg-violet-500/15 text-violet-600"
                                            title={`${optMissingOverrideCount} Base token${optMissingOverrideCount !== 1 ? "s" : ""} not overridden`}
                                          >
                                            {optMissingOverrideCount}
                                          </span>
                                        )}
                                        {isSelected && (
                                          <span className="absolute bottom-0 left-1 right-1 h-[2px] bg-[var(--color-figma-accent)] rounded-t" />
                                        )}
                                      </button>
                                    );
                                  })}
                                  {/* Add option inline */}
                                  {showAddOption[dim.id] ? null : (
                                    <button
                                      onClick={() =>
                                        setShowAddOption((prev) => ({
                                          ...prev,
                                          [dim.id]: true,
                                        }))
                                      }
                                      className="px-1.5 py-1 text-[10px] text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)] flex-shrink-0"
                                      title="Add option"
                                    >
                                      +
                                    </button>
                                  )}
                                </div>
                                {tabScrollState[dim.id]?.right && (
                                  <button
                                    onClick={() => {
                                      const el = tabScrollRefs.current[dim.id];
                                      if (el)
                                        el.scrollBy({
                                          left: 120,
                                          behavior: "smooth",
                                        });
                                    }}
                                    className="absolute right-0 top-0 bottom-0 z-10 flex items-center px-0.5 bg-gradient-to-l from-[var(--color-figma-bg)] to-transparent text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)]"
                                    aria-label="Scroll tabs right"
                                  >
                                    <svg
                                      width="8"
                                      height="8"
                                      viewBox="0 0 8 8"
                                      fill="currentColor"
                                      aria-hidden="true"
                                    >
                                      <path d="M2 1l4 3-4 3V1z" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            )}

                            {/* Add option input (when no options exist or user clicked +) */}
                            {(showAddOption[dim.id] ||
                              dim.options.length === 0) && (
                              <div className="px-3 py-1.5 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
                                <div className="flex items-center gap-1">
                                  <input
                                    ref={(el) => {
                                      addOptionInputRefs.current[dim.id] = el;
                                    }}
                                    type="text"
                                    value={newOptionNames[dim.id] || ""}
                                    onChange={(e) => {
                                      setNewOptionNames((prev) => ({
                                        ...prev,
                                        [dim.id]: e.target.value,
                                      }));
                                      setAddOptionErrors((prev) => ({
                                        ...prev,
                                        [dim.id]: "",
                                      }));
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter")
                                        handleAddOption(dim.id);
                                      if (e.key === "Escape") {
                                        setShowAddOption((prev) => ({
                                          ...prev,
                                          [dim.id]: false,
                                        }));
                                        setNewOptionNames((prev) => ({
                                          ...prev,
                                          [dim.id]: "",
                                        }));
                                        setCopyFromNewOption((prev) => ({
                                          ...prev,
                                          [dim.id]: "",
                                        }));
                                      }
                                    }}
                                    placeholder={
                                      dim.options.length === 0
                                        ? "First option (e.g. Light, Dark)"
                                        : "Option name"
                                    }
                                    className={`flex-1 px-1.5 py-0.5 rounded text-[10px] bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)] ${addOptionErrors[dim.id] ? "border-[var(--color-figma-error)]" : "border-[var(--color-figma-border)]"}`}
                                    autoFocus
                                  />
                                  <button
                                    onClick={() => handleAddOption(dim.id)}
                                    disabled={!newOptionNames[dim.id]?.trim()}
                                    className="px-1.5 py-0.5 rounded bg-[var(--color-figma-accent)] text-white text-[10px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
                                  >
                                    Add
                                  </button>
                                  {dim.options.length > 0 && (
                                    <button
                                      onClick={() => {
                                        setShowAddOption((prev) => ({
                                          ...prev,
                                          [dim.id]: false,
                                        }));
                                        setNewOptionNames((prev) => ({
                                          ...prev,
                                          [dim.id]: "",
                                        }));
                                        setCopyFromNewOption((prev) => ({
                                          ...prev,
                                          [dim.id]: "",
                                        }));
                                      }}
                                      className="px-1.5 py-0.5 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                                    >
                                      Cancel
                                    </button>
                                  )}
                                </div>
                                {/* Copy-from selector — only shown when there are existing options to copy from */}
                                {dim.options.length > 0 && (
                                  <div className="flex items-center gap-1 mt-1">
                                    <span className="text-[9px] text-[var(--color-figma-text-tertiary)] flex-shrink-0">
                                      Copy assignments from:
                                    </span>
                                    <select
                                      value={copyFromNewOption[dim.id] || ""}
                                      onChange={(e) =>
                                        setCopyFromNewOption((prev) => ({
                                          ...prev,
                                          [dim.id]: e.target.value,
                                        }))
                                      }
                                      className="flex-1 px-1 py-0.5 rounded text-[9px] bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)]"
                                    >
                                      <option value="">
                                        None (start empty)
                                      </option>
                                      {dim.options.map((o) => (
                                        <option key={o.name} value={o.name}>
                                          {o.name}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                )}
                                {addOptionErrors[dim.id] && (
                                  <NoticeFieldMessage severity="error" className="mt-1">{addOptionErrors[dim.id]}</NoticeFieldMessage>
                                )}
                              </div>
                            )}

                            {/* Single-option fill banner — surfaced at dimension level so it's visible without expanding coverage */}
                            {!multiOptionGaps && totalDimFillable > 0 && (
                              <NoticeBanner
                                severity="warning"
                                className="border-t border-b-0"
                                actions={
                                  <button
                                    onClick={() =>
                                      optionsWithGaps[0] &&
                                      handleAutoFillAll(
                                        dim.id,
                                        optionsWithGaps[0].name,
                                      )
                                    }
                                    disabled={fillingKeys.has(
                                      `${dim.id}:${optionsWithGaps[0]?.name}:__all__`,
                                    )}
                                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                                    title={`Auto-fill ${totalDimFillable} token${totalDimFillable !== 1 ? "s" : ""} from source sets`}
                                  >
                                    {fillingKeys.has(
                                      `${dim.id}:${optionsWithGaps[0]?.name}:__all__`,
                                    )
                                      ? "Filling…"
                                      : `Fill from source (${totalDimFillable})`}
                                  </button>
                                }
                              >
                                {totalDimFillable} gap
                                {totalDimFillable !== 1 ? "s" : ""} in "
                                {optionsWithGaps[0]?.name}"
                              </NoticeBanner>
                            )}

                            {/* Cross-option fill banner */}
                            {multiOptionGaps && totalDimFillable > 0 && (
                              <NoticeBanner
                                severity="warning"
                                className="border-t border-b-0"
                                actions={
                                  <button
                                    onClick={() =>
                                      handleAutoFillAllOptions(dim.id)
                                    }
                                    disabled={isFillAllOptionsInProgress}
                                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50 transition-colors"
                                    title={`Auto-fill ${totalDimFillable} missing token${totalDimFillable !== 1 ? "s" : ""} across all options`}
                                  >
                                    {isFillAllOptionsInProgress
                                      ? "Filling…"
                                      : `Fill all options (${totalDimFillable})`}
                                  </button>
                                }
                              >
                                {totalDimGaps} gaps across{" "}
                                {optionsWithGaps.length} options
                              </NoticeBanner>
                            )}

                            {/* Selected option content */}
                            {opt && (
                              <div className="bg-[var(--color-figma-bg-secondary)]">
                                {/* Option actions bar */}
                                <div className="flex items-center justify-between px-3 py-1 border-t border-[var(--color-figma-border)]">
                                  {renameOption?.dimId === dim.id &&
                                  renameOption?.optionName === opt.name ? (
                                    <div className="flex flex-col gap-1 flex-1">
                                      <div className="flex items-center gap-1">
                                        <input
                                          type="text"
                                          value={renameOptionValue}
                                          onChange={(e) => {
                                            setRenameOptionValue(
                                              e.target.value,
                                            );
                                            setRenameOptionError(null);
                                          }}
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter")
                                              executeRenameOption();
                                            else if (e.key === "Escape")
                                              cancelRenameOption();
                                          }}
                                          className={`flex-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)] ${renameOptionError ? "border-[var(--color-figma-error)]" : "border-[var(--color-figma-border)]"}`}
                                          autoFocus
                                        />
                                        <button
                                          onClick={executeRenameOption}
                                          disabled={!renameOptionValue.trim()}
                                          className="px-1.5 py-0.5 rounded bg-[var(--color-figma-accent)] text-white text-[10px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
                                        >
                                          Save
                                        </button>
                                        <button
                                          onClick={cancelRenameOption}
                                          className="px-1.5 py-0.5 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                      {renameOptionError && (
                                        <NoticeFieldMessage severity="error">{renameOptionError}</NoticeFieldMessage>
                                      )}
                                    </div>
                                  ) : (
                                    <>
                                      <div className="flex flex-wrap items-center gap-1">
                                        {hasUncovered && (
                                          <NoticePill
                                            severity="warning"
                                            title={`${optionSummary?.uncoveredCount ?? 0} tokens have no value in active sets`}
                                          >
                                            {optionSummary?.uncoveredCount ?? 0}{" "}
                                            gaps
                                          </NoticePill>
                                        )}
                                        {(optionSummary?.missingOverrideCount ??
                                          0) > 0 && (
                                          <NoticePill
                                            severity="info"
                                            title={`${optionSummary?.missingOverrideCount ?? 0} tokens are missing from the override layer`}
                                            className="border-violet-500/30 bg-violet-500/10 text-violet-600"
                                          >
                                            {
                                              optionSummary?.missingOverrideCount
                                            }{" "}
                                            missing override
                                            {optionSummary?.missingOverrideCount ===
                                            1
                                              ? ""
                                              : "s"}
                                          </NoticePill>
                                        )}
                                        {(optionSummary?.emptyOverrideCount ??
                                          0) > 0 && (
                                          <NoticePill
                                            severity="warning"
                                            title={`${optionSummary?.emptyOverrideCount ?? 0} override set${optionSummary?.emptyOverrideCount === 1 ? "" : "s"} contain no tokens`}
                                          >
                                            {optionSummary?.emptyOverrideCount}{" "}
                                            empty override
                                            {optionSummary?.emptyOverrideCount ===
                                            1
                                              ? ""
                                              : "s"}
                                          </NoticePill>
                                        )}
                                        {staleSetNames.length > 0 && (
                                          <NoticePill
                                            severity="error"
                                            title={`${staleSetNames.length} set${staleSetNames.length !== 1 ? "s" : ""} referenced here no longer exist`}
                                          >
                                            {staleSetNames.length} stale
                                          </NoticePill>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-0.5">
                                        {sets.length > 0 &&
                                          (isEditingRoles ? (
                                            <button
                                              onClick={() =>
                                                closeRoleEditor(
                                                  dim.id,
                                                  opt.name,
                                                )
                                              }
                                              className="rounded border border-[var(--color-figma-accent)]/30 bg-[var(--color-figma-accent)]/10 px-2 py-1 text-[10px] font-medium text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/15"
                                              title={`Finish editing roles for ${opt.name}`}
                                            >
                                              Done
                                            </button>
                                          ) : (
                                            <button
                                              onClick={() => {
                                                openRoleEditor(
                                                  dim.id,
                                                  opt.name,
                                                  overrideSets[0] ??
                                                    foundationSets[0] ??
                                                    disabledSets[0] ??
                                                    null,
                                                );
                                                scrollToSetRoles(
                                                  dim.id,
                                                  opt.name,
                                                );
                                              }}
                                              className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[10px] font-medium text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
                                              title={`Edit set roles for ${opt.name}`}
                                            >
                                              Edit roles
                                            </button>
                                          ))}
                                        {dim.options.length > 1 && (
                                          <>
                                            <button
                                              onClick={() =>
                                                handleMoveOption(
                                                  dim.id,
                                                  opt.name,
                                                  "up",
                                                )
                                              }
                                              disabled={
                                                dim.options.indexOf(opt) === 0
                                              }
                                              className="p-1.5 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] disabled:opacity-25 disabled:pointer-events-none"
                                              title="Move option left"
                                              aria-label="Move option left"
                                            >
                                              <svg
                                                width="10"
                                                height="10"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                aria-hidden="true"
                                              >
                                                <path d="M15 18l-6-6 6-6" />
                                              </svg>
                                            </button>
                                            <button
                                              onClick={() =>
                                                handleMoveOption(
                                                  dim.id,
                                                  opt.name,
                                                  "down",
                                                )
                                              }
                                              disabled={
                                                dim.options.indexOf(opt) ===
                                                dim.options.length - 1
                                              }
                                              className="p-1.5 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] disabled:opacity-25 disabled:pointer-events-none"
                                              title="Move option right"
                                              aria-label="Move option right"
                                            >
                                              <svg
                                                width="10"
                                                height="10"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                aria-hidden="true"
                                              >
                                                <path d="M9 18l6-6-6-6" />
                                              </svg>
                                            </button>
                                          </>
                                        )}
                                        <button
                                          onClick={() =>
                                            startRenameOption(dim.id, opt.name)
                                          }
                                          className="p-1.5 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]"
                                          title="Rename option"
                                          aria-label="Rename option"
                                        >
                                          <svg
                                            width="10"
                                            height="10"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            aria-hidden="true"
                                          >
                                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                                          </svg>
                                        </button>
                                        <button
                                          onClick={() =>
                                            handleDuplicateOption(
                                              dim.id,
                                              opt.name,
                                            )
                                          }
                                          className="p-1.5 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]"
                                          title="Duplicate option"
                                          aria-label="Duplicate option"
                                        >
                                          <svg
                                            width="10"
                                            height="10"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            aria-hidden="true"
                                          >
                                            <rect
                                              x="9"
                                              y="9"
                                              width="13"
                                              height="13"
                                              rx="2"
                                              ry="2"
                                            />
                                            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                                          </svg>
                                        </button>
                                        <button
                                          onClick={() =>
                                            setOptionDeleteConfirm({
                                              dimId: dim.id,
                                              optionName: opt.name,
                                            })
                                          }
                                          className="p-1.5 rounded hover:bg-[var(--color-figma-error)]/20 text-[var(--color-figma-error)]"
                                          title="Delete option"
                                          aria-label="Delete option"
                                        >
                                          <svg
                                            width="10"
                                            height="10"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                          >
                                            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                                          </svg>
                                        </button>
                                      </div>
                                    </>
                                  )}
                                </div>

                                {/* Set groups */}
                                {sets.length > 0 && (
                                  <div
                                    ref={(el) => {
                                      setRoleRefs.current[
                                        `${dim.id}:${opt.name}`
                                      ] = el;
                                    }}
                                    className="border-t border-[var(--color-figma-border)]"
                                  >
                                    <div className="px-3 py-2 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]/40">
                                      <div className="flex flex-wrap items-start justify-between gap-2">
                                        <div className="min-w-0">
                                          <div className="text-[10px] font-semibold text-[var(--color-figma-text)]">
                                            Set role summary
                                          </div>
                                          <div className="mt-0.5 text-[9px] text-[var(--color-figma-text-secondary)]">
                                            {optionSummary?.isUnmapped
                                              ? "Assign at least one Base or Override set to activate this option."
                                              : optionSummary?.hasAssignmentIssues
                                                ? "Clean up stale or empty assignments before relying on this option in preview."
                                                : optionSummary?.hasCoverageIssues
                                                  ? "Role assignments are in place. Use the issue handoff below to review the remaining coverage work."
                                                  : "Base sets provide defaults, Override sets win on conflicts, and Excluded sets stay out of the resolved output."}
                                          </div>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-1">
                                          {optionSummary?.isUnmapped && (
                                            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-figma-accent)]/30 bg-[var(--color-figma-accent)]/10 px-1.5 py-0.5 text-[9px] font-medium text-[var(--color-figma-accent)]">
                                              Assign roles
                                            </span>
                                          )}
                                          {(optionSummary?.emptyOverrideCount ??
                                            0) > 0 && (
                                            <NoticePill severity="warning">
                                              {
                                                optionSummary?.emptyOverrideCount
                                              }{" "}
                                              empty override
                                              {optionSummary?.emptyOverrideCount ===
                                              1
                                                ? ""
                                                : "s"}
                                            </NoticePill>
                                          )}
                                          {staleSetNames.length > 0 && (
                                            <NoticePill severity="error">
                                              {staleSetNames.length} stale set
                                              {staleSetNames.length === 1
                                                ? ""
                                                : "s"}
                                            </NoticePill>
                                          )}
                                          {(optionSummary?.coverageIssueCount ??
                                            0) > 0 && (
                                            <NoticePill severity="warning">
                                              {
                                                optionSummary?.coverageIssueCount
                                              }{" "}
                                              coverage issue
                                              {optionSummary?.coverageIssueCount ===
                                              1
                                                ? ""
                                                : "s"}
                                            </NoticePill>
                                          )}
                                        </div>
                                      </div>
                                      <div className="mt-2 grid grid-cols-3 gap-1.5">
                                        {[
                                          {
                                            label: "Base",
                                            count:
                                              optionSummary?.baseCount ?? 0,
                                            toneClass:
                                              "border-[var(--color-figma-accent)]/25 bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]",
                                            description: "Default token values",
                                          },
                                          {
                                            label: "Override",
                                            count:
                                              optionSummary?.overrideCount ?? 0,
                                            toneClass:
                                              "border-[var(--color-figma-success)]/25 bg-[var(--color-figma-success)]/10 text-[var(--color-figma-success)]",
                                            description: "Wins on conflicts",
                                          },
                                          {
                                            label: "Excluded",
                                            count:
                                              optionSummary?.excludedCount ?? 0,
                                            toneClass:
                                              "border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)]",
                                            description: "Ignored in output",
                                          },
                                        ].map((card) => (
                                          <div
                                            key={card.label}
                                            className={`rounded border px-2 py-1 ${card.toneClass}`}
                                          >
                                            <div className="flex items-center justify-between gap-2">
                                              <span className="text-[9px] font-semibold">
                                                {card.label}
                                              </span>
                                              <span className="text-[11px] font-bold leading-none">
                                                {card.count}
                                              </span>
                                            </div>
                                            <div className="mt-0.5 text-[8px] leading-tight opacity-80">
                                              {card.description}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                    {selectedOptionIssues.length > 0 && (
                                      <div className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-2">
                                        <div className="text-[10px] font-semibold text-[var(--color-figma-text)]">
                                          Issue handoff
                                        </div>
                                        <div className="mt-1 flex flex-col gap-1.5">
                                          {selectedOptionIssues.map((issue) =>
                                            renderIssueEntry(
                                              issue,
                                              "authoring",
                                            ),
                                          )}
                                        </div>
                                      </div>
                                    )}
                                    {isEditingRoles && (
                                      <div className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-2">
                                        <div className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]/30 px-2.5 py-2">
                                          <div className="flex flex-wrap items-start justify-between gap-2">
                                            <div className="min-w-0">
                                              <div className="text-[10px] font-semibold text-[var(--color-figma-text)]">
                                                Bulk actions
                                              </div>
                                              <p className="mt-0.5 text-[9px] text-[var(--color-figma-text-secondary)]">
                                                Role buttons stay on the rows
                                                below. Apply broader updates
                                                here for{" "}
                                                <strong>{opt.name}</strong>.
                                              </p>
                                            </div>
                                            <div className="min-w-[148px]">
                                              <label className="text-[9px] font-medium text-[var(--color-figma-text-tertiary)]">
                                                Focused set
                                              </label>
                                              <select
                                                value={bulkActionSetName ?? ""}
                                                onChange={(event) =>
                                                  setRoleEditorSetName(
                                                    dim.id,
                                                    opt.name,
                                                    event.target.value,
                                                  )
                                                }
                                                className="mt-1 w-full rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[10px] text-[var(--color-figma-text)]"
                                              >
                                                {optSets.map((setName) => (
                                                  <option
                                                    key={setName}
                                                    value={setName}
                                                  >
                                                    {setName}
                                                  </option>
                                                ))}
                                              </select>
                                            </div>
                                          </div>
                                          {bulkActionSetName &&
                                            bulkActionCounts && (
                                              <div className="mt-2 flex flex-col gap-2 border-t border-[var(--color-figma-border)] pt-2">
                                                <div className="flex flex-col gap-1">
                                                  <span className="text-[9px] font-medium text-[var(--color-figma-text-tertiary)]">
                                                    Apply &ldquo;
                                                    {bulkActionSetName}&rdquo;
                                                    across every option in this
                                                    axis
                                                  </span>
                                                  <div className="flex flex-wrap gap-1">
                                                    {roleStates.map(
                                                      (nextState) => (
                                                        <button
                                                          key={`bulk-set-${nextState}`}
                                                          type="button"
                                                          onClick={() =>
                                                            handleBulkSetState(
                                                              dim.id,
                                                              bulkActionSetName,
                                                              nextState,
                                                            )
                                                          }
                                                          className={`min-h-6 rounded border px-2 py-1 text-[9px] font-medium ${
                                                            nextState ===
                                                            "source"
                                                              ? "border-[var(--color-figma-accent)]/20 bg-[var(--color-figma-accent)]/8 text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/12"
                                                              : nextState ===
                                                                  "enabled"
                                                                ? "border-[var(--color-figma-success)]/20 bg-[var(--color-figma-success)]/8 text-[var(--color-figma-success)] hover:bg-[var(--color-figma-success)]/12"
                                                                : "border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                                                          }`}
                                                        >
                                                          {
                                                            STATE_LABELS[
                                                              nextState
                                                            ]
                                                          }{" "}
                                                          (
                                                          {
                                                            bulkActionCounts[
                                                              nextState
                                                            ]
                                                          }
                                                          )
                                                        </button>
                                                      ),
                                                    )}
                                                  </div>
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                  <span className="text-[9px] font-medium text-[var(--color-figma-text-tertiary)]">
                                                    Set every available set in{" "}
                                                    {opt.name}
                                                  </span>
                                                  <div className="flex flex-wrap gap-1">
                                                    {roleStates.map(
                                                      (nextState) => (
                                                        <button
                                                          key={`bulk-option-${nextState}`}
                                                          type="button"
                                                          onClick={() =>
                                                            handleBulkSetAllInOption(
                                                              dim.id,
                                                              opt.name,
                                                              nextState,
                                                            )
                                                          }
                                                          className={`min-h-6 rounded border px-2 py-1 text-[9px] font-medium ${
                                                            nextState ===
                                                            "source"
                                                              ? "border-[var(--color-figma-accent)]/20 bg-[var(--color-figma-accent)]/8 text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/12"
                                                              : nextState ===
                                                                  "enabled"
                                                                ? "border-[var(--color-figma-success)]/20 bg-[var(--color-figma-success)]/8 text-[var(--color-figma-success)] hover:bg-[var(--color-figma-success)]/12"
                                                                : "border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                                                          }`}
                                                        >
                                                          {
                                                            STATE_LABELS[
                                                              nextState
                                                            ]
                                                          }
                                                        </button>
                                                      ),
                                                    )}
                                                  </div>
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                  <span className="text-[9px] font-medium text-[var(--color-figma-text-tertiary)]">
                                                    Copy role assignments from
                                                    another option
                                                  </span>
                                                  {copySourceOptions.length >
                                                  0 ? (
                                                    <div className="flex flex-wrap gap-1">
                                                      {copySourceOptions.map(
                                                        (sourceOptionName) => (
                                                          <button
                                                            key={
                                                              sourceOptionName
                                                            }
                                                            type="button"
                                                            onClick={() =>
                                                              handleCopyAssignmentsFrom(
                                                                dim.id,
                                                                opt.name,
                                                                sourceOptionName,
                                                              )
                                                            }
                                                            className="min-h-6 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[9px] font-medium text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
                                                          >
                                                            {sourceOptionName}
                                                          </button>
                                                        ),
                                                      )}
                                                    </div>
                                                  ) : (
                                                    <p className="text-[9px] text-[var(--color-figma-text-tertiary)]">
                                                      Add another option before
                                                      copying assignments.
                                                    </p>
                                                  )}
                                                </div>
                                                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-figma-border)] pt-2">
                                                  <p className="text-[9px] text-[var(--color-figma-text-secondary)]">
                                                    Need a dedicated override
                                                    set for{" "}
                                                    <strong>
                                                      {bulkActionSetName}
                                                    </strong>
                                                    ?
                                                  </p>
                                                  <button
                                                    type="button"
                                                    onClick={() =>
                                                      setCreateOverrideSet({
                                                        dimId: dim.id,
                                                        setName:
                                                          bulkActionSetName,
                                                        optName: opt.name,
                                                      })
                                                    }
                                                    className="min-h-6 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[9px] font-medium text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
                                                  >
                                                    Create override set from
                                                    focused set
                                                  </button>
                                                </div>
                                              </div>
                                            )}
                                        </div>
                                      </div>
                                    )}
                                    {/* Override section */}
                                    {overrideSets.length > 0 && (
                                      <div>
                                        <div className="px-3 py-0.5 flex items-center gap-1 text-[10px] font-medium text-[var(--color-figma-success)] bg-[var(--color-figma-success)]/5">
                                          <svg
                                            width="8"
                                            height="8"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2.5"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            aria-hidden="true"
                                          >
                                            <path d="M12 19V5M5 12l7-7 7 7" />
                                          </svg>
                                          Override (
                                          {optionSummary?.overrideCount ??
                                            overrideSets.length}
                                          )
                                          <span className="text-[var(--color-figma-text-tertiary)] font-normal ml-1">
                                            highest priority
                                          </span>
                                        </div>
                                        {overrideSets.map((s) =>
                                          renderSetRow(
                                            dim,
                                            opt,
                                            s,
                                            "enabled",
                                            isEditingRoles,
                                            bulkActionSetName === s,
                                          ),
                                        )}
                                      </div>
                                    )}

                                    {/* Base section */}
                                    {foundationSets.length > 0 && (
                                      <div>
                                        <div className="px-3 py-0.5 flex items-center gap-1 text-[10px] font-medium text-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/5">
                                          <svg
                                            width="8"
                                            height="8"
                                            viewBox="0 0 24 24"
                                            fill="currentColor"
                                            aria-hidden="true"
                                          >
                                            <rect
                                              x="2"
                                              y="2"
                                              width="20"
                                              height="20"
                                              rx="3"
                                              opacity="0.3"
                                            />
                                          </svg>
                                          Base (
                                          {optionSummary?.baseCount ??
                                            foundationSets.length}
                                          )
                                          <span className="text-[var(--color-figma-text-tertiary)] font-normal ml-1">
                                            default values
                                          </span>
                                        </div>
                                        {foundationSets.map((s) =>
                                          renderSetRow(
                                            dim,
                                            opt,
                                            s,
                                            "source",
                                            isEditingRoles,
                                            bulkActionSetName === s,
                                          ),
                                        )}
                                      </div>
                                    )}

                                    {/* Excluded section — collapsed by default */}
                                    {disabledSets.length > 0 && (
                                      <div>
                                        <button
                                          onClick={() =>
                                            setCollapsedDisabled((prev) => {
                                              const next = new Set(prev);
                                              next.has(dim.id)
                                                ? next.delete(dim.id)
                                                : next.add(dim.id);
                                              return next;
                                            })
                                          }
                                          className="w-full px-3 py-0.5 flex items-center gap-1 text-[10px] font-medium text-[var(--color-figma-text-tertiary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors text-left"
                                          title={STATE_DESCRIPTIONS["disabled"]}
                                        >
                                          <svg
                                            width="8"
                                            height="8"
                                            viewBox="0 0 8 8"
                                            fill="currentColor"
                                            className={`transition-transform ${isDisabledCollapsed ? "" : "rotate-90"}`}
                                            aria-hidden="true"
                                          >
                                            <path d="M2 1l4 3-4 3V1z" />
                                          </svg>
                                          Excluded (
                                          {optionSummary?.excludedCount ??
                                            disabledSets.length}
                                          )
                                        </button>
                                        {!isDisabledCollapsed &&
                                          disabledSets.map((s) =>
                                            renderSetRow(
                                              dim,
                                              opt,
                                              s,
                                              "disabled",
                                              isEditingRoles,
                                              bulkActionSetName === s,
                                            ),
                                          )}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {dimSearch && filteredDimensions.length === 0 && (
                        <div className="px-3 py-4 text-center text-[11px] text-[var(--color-figma-text-tertiary)]">
                          No dimensions or options matching &ldquo;{dimSearch}
                          &rdquo;
                        </div>
                      )}
                      {dimSearch &&
                        filteredDimensions.length > 0 &&
                        filteredDimensions.length < dimensions.length && (
                          <div className="px-3 py-1 text-[10px] text-[var(--color-figma-text-tertiary)] text-center">
                            Showing {filteredDimensions.length} of{" "}
                            {dimensions.length} axes
                          </div>
                        )}
                    </div>
                  </>
                )}

                {/* Coverage tab view */}
                {activeView === "coverage" && (
                  <ThemeCoverageMatrix
                    dimensions={coverageDimensions}
                    coverage={coverage}
                    missingOverrides={missingOverrides}
                    setTokenValues={setTokenValues}
                    issueEntries={coverageReviewIssues}
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
                )}

                {/* Compare tab view */}
                {activeView === "compare" && (
                  <UnifiedComparePanel
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
                    onEditToken={(set, path) => onNavigateToToken?.(path, set)}
                    onCreateToken={(path, set) => onCreateToken?.(path, set)}
                    onGoToTokens={
                      onGoToTokens ?? (() => setActiveView("authoring"))
                    }
                    serverUrl={serverUrl}
                    onTokensCreated={() => {
                      debouncedFetchDimensions();
                      onTokensCreated?.();
                    }}
                    onBack={() => {
                      returnToAuthoring({
                        dimId:
                          compareFocusDimension?.id ?? compareContext.dimId,
                        optionName:
                          compareFocusOptionName ?? compareContext.optionName,
                        preferredSetName: null,
                      });
                    }}
                    backLabel={
                      compareFocusDimension
                        ? `Back to ${compareFocusDimension.name}`
                        : "Back to authoring"
                    }
                  />
                )}

                {activeView === "advanced" && resolverState && (
                  <div className="h-full min-h-0 overflow-hidden">
                    <ResolverContent {...resolverState} onSuccess={onSuccess} />
                  </div>
                )}

                {/* Live Token Resolution Preview — only in theme authoring view */}
                {activeView === "authoring" &&
                  showPreview &&
                  dimensions.length > 0 && (
                    <div
                      ref={previewSectionRef}
                      className="border-t-2 border-[var(--color-figma-accent)]/30"
                    >
                      <div className="px-3 py-1.5 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-[10px] font-medium text-[var(--color-figma-text)]">
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="var(--color-figma-accent)"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                          Token Resolution Preview
                        </div>
                        <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">
                          {dimensions
                            .map((d) => {
                              const optName = selectedOptions[d.id];
                              return optName ? `${d.name}: ${optName}` : null;
                            })
                            .filter(Boolean)
                            .join(" + ")}
                        </span>
                      </div>
                      <div className="px-3 py-1 border-t border-[var(--color-figma-border)]">
                        <input
                          ref={previewSearchRef}
                          type="text"
                          placeholder="Search tokens..."
                          value={previewSearch}
                          onChange={(e) => setPreviewSearch(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") {
                              e.preventDefault();
                              if (previewSearch) setPreviewSearch("");
                              previewSearchRef.current?.blur();
                            }
                          }}
                          className="w-full bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] rounded px-1.5 py-0.5 text-[10px] text-[var(--color-figma-text)] placeholder-[var(--color-figma-text-tertiary)] focus:focus-visible:border-[var(--color-figma-accent)]"
                        />
                      </div>
                      <div className="max-h-48 overflow-y-auto">
                        {previewTokens.length === 0 ? (
                          <div className="px-3 py-3 text-[10px] text-[var(--color-figma-text-tertiary)] text-center italic">
                            {Object.keys(setTokenValues).length === 0
                              ? "No token data available"
                              : dimensions.every((d) => {
                                    const opt = d.options.find(
                                      (o) => o.name === selectedOptions[d.id],
                                    );
                                    return (
                                      !opt ||
                                      Object.values(opt.sets).every(
                                        (s) => s === "disabled",
                                      )
                                    );
                                  })
                                ? "Assign sets as Base or Override to see resolved tokens"
                                : previewSearch
                                  ? "No matching tokens"
                                  : "No tokens resolved with current selections"}
                          </div>
                        ) : (
                          <table className="w-full text-[10px]">
                            <thead>
                              <tr className="text-left text-[var(--color-figma-text-tertiary)] bg-[var(--color-figma-bg-secondary)]">
                                <th className="px-3 py-0.5 font-medium">
                                  Token
                                </th>
                                <th className="px-2 py-0.5 font-medium">
                                  Value
                                </th>
                                <th className="px-2 py-0.5 font-medium text-right">
                                  Source
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--color-figma-border)]">
                              {previewTokens.map((t) => (
                                <tr
                                  key={t.path}
                                  className="hover:bg-[var(--color-figma-bg-hover)] cursor-default"
                                  onClick={() =>
                                    onNavigateToToken?.(t.path, t.set)
                                  }
                                  title={`${t.path}\nRaw: ${typeof t.rawValue === "object" ? JSON.stringify(t.rawValue) : t.rawValue}\nFrom: ${t.set} (${t.layer})`}
                                >
                                  <td className="px-3 py-0.5 font-mono text-[var(--color-figma-text)] truncate max-w-[120px]">
                                    {t.path}
                                  </td>
                                  <td className="px-2 py-0.5 text-[var(--color-figma-text-secondary)]">
                                    {renderValuePreview(t.resolvedValue)}
                                  </td>
                                  <td
                                    className="px-2 py-0.5 text-right text-[var(--color-figma-text-tertiary)] truncate max-w-[80px]"
                                    title={t.layer}
                                  >
                                    {t.set}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                        {previewTokens.length >= 50 && (
                          <div className="px-3 py-1 text-[10px] text-[var(--color-figma-text-tertiary)] text-center border-t border-[var(--color-figma-border)]">
                            Showing first 50 tokens. Use search to filter.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
              </div>
            )}
          </div>

          {/* Create dimension footer — only shown in the authoring view */}
          <div
            className={`p-3 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] ${activeView !== "authoring" ? "hidden" : ""}`}
          >
            {showCreateDim ? (
              <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">
                    Axis name
                  </label>
                  <input
                    type="text"
                    value={newDimName}
                    onChange={(e) => setNewDimName(e.target.value)}
                    placeholder="e.g. Mode, Brand, Density"
                    className={`w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)] ${createDimError ? "border-[var(--color-figma-error)]" : "border-[var(--color-figma-border)]"}`}
                    onKeyDown={(e) =>
                      e.key === "Enter" && handleCreateDimension()
                    }
                    autoFocus
                  />
                  <p className="text-[10px] text-[var(--color-figma-text-tertiary)] leading-snug">
                    Each axis has options — e.g.{" "}
                    <span className="font-medium">Mode:</span> light, dark
                    &nbsp;·&nbsp; <span className="font-medium">Brand:</span>{" "}
                    default, premium
                  </p>
                </div>
                {createDimError && (
                  <NoticeFieldMessage severity="error">{createDimError}</NoticeFieldMessage>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={handleCreateDimension}
                    disabled={!newDimName || isCreatingDim}
                    className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
                  >
                    {isCreatingDim ? "Creating…" : "Create axis"}
                  </button>
                  <button
                    onClick={closeCreateDim}
                    className="px-3 py-1.5 rounded text-[11px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => openCreateDim()}
                className="w-full px-3 py-1.5 rounded border border-dashed border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] text-[11px] hover:bg-[var(--color-figma-bg-hover)] hover:border-[var(--color-figma-text-secondary)] transition-colors text-left flex items-center gap-1.5"
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="3" y="3" width="18" height="6" rx="1.5" />
                  <rect
                    x="3"
                    y="12"
                    width="18"
                    height="6"
                    rx="1.5"
                    opacity="0.5"
                  />
                </svg>
                Add theme axis
              </button>
            )}
          </div>
        </>

        <ThemeManagerModals />
      </div>
    </ThemeManagerModalsProvider>
  );
}
