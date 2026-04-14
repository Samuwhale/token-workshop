import { useCallback, useEffect } from "react";
import type { ThemeDimension, ThemeOption } from "@tokenmanager/core";
import {
  getThemeOptionRolePriorityWeight,
  summarizeThemeOptionRoles,
  type ThemeOptionRoleSummary,
} from "../themeManagerTypes";
import type { CompareMode } from "../UnifiedComparePanel";
import type {
  ThemeAuthoringMode,
  ThemeAuthoringStage,
  ThemeIssueSummary,
  ThemeManagerView,
  ThemeRoleNavigationTarget,
} from "../../shared/themeWorkflow";
import type { ThemeAuthoringScreenHandle } from "./ThemeAuthoringScreen";

type CoverageState = Record<string, Record<string, { uncovered: unknown[] }>>;
type MissingOverridesState = Record<
  string,
  Record<string, { missing: unknown[] }>
>;

interface UseThemeManagerNavigationParams {
  dimensions: ThemeDimension[];
  sets: string[];
  focusedDimensionId: string | null;
  setFocusedDimensionId: React.Dispatch<
    React.SetStateAction<string | null>
  >;
  selectedOptions: Record<string, string>;
  setSelectedOptions: React.Dispatch<
    React.SetStateAction<Record<string, string>>
  >;
  activeView: ThemeManagerView;
  setActiveView: (view: ThemeManagerView) => void;
  setAuthoringMode: (mode: ThemeAuthoringMode) => void;
  authoringScreenRef: React.RefObject<ThemeAuthoringScreenHandle | null>;
  openCreateDim: () => void;
  setShowAddOption: React.Dispatch<
    React.SetStateAction<Record<string, boolean>>
  >;
  addOptionInputRefs: React.MutableRefObject<
    Record<string, HTMLInputElement | null>
  >;
  optionSetOrders: Record<string, Record<string, string[]>>;
  coverage: CoverageState;
  missingOverrides: MissingOverridesState;
  optionIssues: Record<string, ThemeIssueSummary[]>;
  setTokenCounts: Record<string, number | null>;
  compareContext: { dimId: string | null; optionName: string | null };
  setCompareContext: React.Dispatch<
    React.SetStateAction<{ dimId: string | null; optionName: string | null }>
  >;
  setCompareMode: React.Dispatch<React.SetStateAction<CompareMode>>;
  setCompareThemeDefaultA: React.Dispatch<React.SetStateAction<string>>;
  setCompareThemeDefaultB: React.Dispatch<React.SetStateAction<string>>;
  setCompareThemeKey: React.Dispatch<React.SetStateAction<number>>;
  showCompare: boolean;
  setShowCompare: React.Dispatch<React.SetStateAction<boolean>>;
  navigateToCompareState: (
    mode: CompareMode,
    path?: string,
    tokenPaths?: Set<string>,
    optionA?: string,
    optionB?: string,
  ) => void;
  resolverAvailable: boolean;
}

export function useThemeManagerNavigation({
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
  resolverAvailable,
}: UseThemeManagerNavigationParams) {
  const getDimensionForContext = useCallback(
    (preferredId?: string | null) => {
      if (preferredId) {
        const matched = dimensions.find((dimension) => dimension.id === preferredId);
        if (matched) return matched;
      }
      if (focusedDimensionId) {
        const focused = dimensions.find((dimension) => dimension.id === focusedDimensionId);
        if (focused) return focused;
      }
      return dimensions[0] ?? null;
    },
    [dimensions, focusedDimensionId],
  );

  const getOptionNameForContext = useCallback(
    (dimension: ThemeDimension | null, preferredName?: string | null) => {
      if (!dimension) return null;
      if (
        preferredName &&
        dimension.options.some((option: ThemeOption) => option.name === preferredName)
      ) {
        return preferredName;
      }
      const selectedName = selectedOptions[dimension.id];
      if (
        selectedName &&
        dimension.options.some((option: ThemeOption) => option.name === selectedName)
      ) {
        return selectedName;
      }
      return dimension.options[0]?.name ?? null;
    },
    [selectedOptions],
  );

  const scrollToDimension = useCallback((dimensionId: string | null | undefined) => {
    if (!dimensionId) return;
    requestAnimationFrame(() => {
      authoringScreenRef.current?.scrollToDimension(dimensionId);
    });
  }, [authoringScreenRef]);

  const scrollToSetRoles = useCallback((dimensionId: string, optionName: string) => {
    requestAnimationFrame(() => {
      authoringScreenRef.current?.scrollToSetRoles(dimensionId, optionName);
    });
  }, [authoringScreenRef]);

  const focusRoleTarget = useCallback(
    (target: ThemeRoleNavigationTarget | null | undefined) => {
      const dimension = getDimensionForContext(target?.dimId ?? null);
      const optionName = getOptionNameForContext(
        dimension,
        target?.optionName ?? null,
      );
      if (!dimension || !optionName) return;

      setFocusedDimensionId(dimension.id);
      setSelectedOptions((previous) => ({
        ...previous,
        [dimension.id]: optionName,
      }));

      scrollToDimension(dimension.id);
      scrollToSetRoles(dimension.id, optionName);
    },
    [
      getDimensionForContext,
      getOptionNameForContext,
      scrollToDimension,
      scrollToSetRoles,
      setFocusedDimensionId,
      setSelectedOptions,
    ],
  );

  const handleSelectOption = useCallback(
    (dimensionId: string, optionName: string) => {
      setFocusedDimensionId(dimensionId);
      setSelectedOptions((previous) => ({ ...previous, [dimensionId]: optionName }));
    },
    [setFocusedDimensionId, setSelectedOptions],
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
            (activeView === "compare"
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

      if (stage === "preview") return;

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
        setShowAddOption((previous) => ({
          ...previous,
          [targetDimension.id]: true,
        }));
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
              missingOverrides[dimension.id]?.[option.name]?.missing.length ?? 0,
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
      coverage,
      dimensions,
      focusRoleTarget,
      focusedDimensionId,
      getDimensionForContext,
      getOptionNameForContext,
      missingOverrides,
      openCreateDim,
      optionIssues,
      optionSetOrders,
      scrollToDimension,
      setActiveView,
      setAuthoringMode,
      setFocusedDimensionId,
      setShowAddOption,
      setShowCompare,
      setTokenCounts,
      sets,
    ],
  );

  useEffect(() => {
    if (showCompare) setActiveView("compare");
  }, [setActiveView, showCompare]);

  const openCompareView = useCallback(
    (dimId?: string) => {
      const dimension = getDimensionForContext(dimId);
      setCompareMode("theme-options");
      const compareDimension =
        dimension && dimension.options.length >= 2
          ? dimension
          : dimensions.find((entry) => entry.options.length >= 2);
      if (compareDimension) {
        const optionAName =
          getOptionNameForContext(compareDimension, null) ??
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
      setCompareThemeKey((previous) => previous + 1);
      setShowCompare(true);
      setAuthoringMode("roles");
      setActiveView("compare");
    },
    [
      dimensions,
      focusedDimensionId,
      getDimensionForContext,
      getOptionNameForContext,
      setActiveView,
      setAuthoringMode,
      setCompareContext,
      setCompareMode,
      setCompareThemeDefaultA,
      setCompareThemeDefaultB,
      setCompareThemeKey,
      setFocusedDimensionId,
      setShowCompare,
    ],
  );

  const openResolverView = useCallback(() => {
    if (!resolverAvailable) return;
    setShowCompare(false);
    setAuthoringMode("roles");
    setActiveView("resolver");
  }, [resolverAvailable, setActiveView, setAuthoringMode, setShowCompare]);

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
    [
      focusedDimensionId,
      navigateToCompareState,
      setCompareContext,
      setFocusedDimensionId,
    ],
  );

  return {
    getOptionNameForContext,
    handleSelectOption,
    returnToAuthoring,
    focusAuthoringStage,
    openCompareView,
    openResolverView,
    handleNavigateToCompare,
  };
}
