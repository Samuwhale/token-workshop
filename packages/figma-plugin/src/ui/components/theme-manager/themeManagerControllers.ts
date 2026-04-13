import { useCallback, useMemo, useState } from "react";
import type { ThemeDimension, ThemeOption } from "@tokenmanager/core";
import type { UndoSlot } from "../../hooks/useUndo";
import { apiFetch } from "../../shared/apiFetch";
import { useThemeAutoFill } from "../../hooks/useThemeAutoFill";
import { useThemeBulkOps } from "../../hooks/useThemeBulkOps";
import { useThemeCompare } from "../../hooks/useThemeCompare";
import { useThemeCoverage } from "../../hooks/useThemeCoverage";
import { useThemeDimensions } from "../../hooks/useThemeDimensions";
import { useThemeDragDrop } from "../../hooks/useThemeDragDrop";
import { useThemeOptions } from "../../hooks/useThemeOptions";
import type { ResolverContentProps } from "../ResolverPanel";
import {
  summarizeThemeOptionRoles,
  type ThemeOptionRoleSummary,
} from "../themeManagerTypes";
import {
  useThemeManagerModalsValue,
  type ThemeManagerFeedbackState,
} from "../ThemeManagerContext";
import {
  type ThemeIssueSummary,
  type ThemeRoleNavigationTarget,
} from "../../shared/themeWorkflow";
import { buildThemeResolverAuthoringContext } from "./themeResolverContext";

export interface ThemeManagerWorkspaceControllerParams {
  serverUrl: string;
  connected: boolean;
  sets: string[];
  feedback: ThemeManagerFeedbackState;
  onPushUndo?: (slot: UndoSlot) => void;
  onTokensCreated?: () => void;
  onSetCreated?: (name: string) => void;
}

export function useThemeWorkspaceController({
  serverUrl,
  connected,
  sets,
  feedback,
  onPushUndo,
  onTokensCreated,
  onSetCreated,
}: ThemeManagerWorkspaceControllerParams) {
  const dimensionsState = useThemeDimensions({
    serverUrl,
    connected,
    sets,
    setError: feedback.reportError,
    onPushUndo,
    onSuccess: feedback.reportSuccess,
  });
  const {
    dimensions,
    setDimensions,
    coverage,
    missingOverrides,
    optionSetOrders,
    setOptionSetOrders,
    selectedOptions,
    setSelectedOptions,
    setTokenValues,
    fetchDimensions,
    debouncedFetchDimensions,
  } = dimensionsState;

  const dragDrop = useThemeDragDrop({
    serverUrl,
    connected,
    dimensions,
    setDimensions,
    fetchDimensions,
  });

  const bulkOps = useThemeBulkOps({
    serverUrl,
    sets,
    dimensions,
    setDimensions,
    debouncedFetchDimensions,
    setError: feedback.reportError,
    onSuccess: feedback.reportSuccess,
  });

  const autoFill = useThemeAutoFill({
    serverUrl,
    dimensions,
    coverage,
    debouncedFetchDimensions,
    setError: feedback.reportError,
    onSuccess: feedback.reportSuccess,
  });

  const options = useThemeOptions({
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
    setError: feedback.reportError,
    onSuccess: feedback.reportSuccess,
    onPushUndo,
    copyFromNewOption: bulkOps.copyFromNewOption,
    setCopyFromNewOption: bulkOps.setCopyFromNewOption,
  });

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

        const dimension = dimensions.find((item) => item.id === dimId);
        const option = dimension?.options.find(
          (item: ThemeOption) => item.name === optionName,
        );
        if (dimension && option) {
          const updatedSets = { ...option.sets, [newName]: "enabled" as const };
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
        debouncedFetchDimensions();
        setCreateOverrideSet(null);
        feedback.reportSuccess(
          `Created override set "${newName}"${dimension && option ? ` linked to ${dimension.name} → ${optionName}` : ""}`,
        );
      } catch (error) {
        feedback.reportError(
          error instanceof Error
            ? error.message
            : "Failed to create override set",
        );
      } finally {
        setIsCreatingOverrideSet(false);
      }
    },
    [
      createOverrideSet,
      debouncedFetchDimensions,
      dimensions,
      feedback,
      onSetCreated,
      onTokensCreated,
      serverUrl,
    ],
  );

  const modals = useThemeManagerModalsValue({
    dimensions,
    autoFillPreview: autoFill.autoFillPreview,
    setAutoFillPreview: autoFill.setAutoFillPreview,
    autoFillStrategy: autoFill.autoFillStrategy,
    setAutoFillStrategy: autoFill.setAutoFillStrategy,
    executeAutoFillAll: autoFill.executeAutoFillAll,
    executeAutoFillAllOptions: autoFill.executeAutoFillAllOptions,
    dimensionDeleteConfirm: dimensionsState.dimensionDeleteConfirm,
    setDimensionDeleteConfirm: dimensionsState.openDeleteConfirm,
    closeDeleteConfirm: dimensionsState.closeDeleteConfirm,
    executeDeleteDimension: dimensionsState.executeDeleteDimension,
    optionDeleteConfirm: options.optionDeleteConfirm,
    setOptionDeleteConfirm: options.setOptionDeleteConfirm,
    executeDeleteOption: options.executeDeleteOption,
    createOverrideSet,
    setCreateOverrideSet,
    executeCreateOverrideSet,
    isCreatingOverrideSet,
  });

  return useMemo(
    () => ({
      dimensionsState,
      dragDrop,
      bulkOps,
      autoFill,
      options,
      overrideSet: {
        createOverrideSet,
        setCreateOverrideSet,
        executeCreateOverrideSet,
        isCreatingOverrideSet,
      },
      modals,
      coverage,
      missingOverrides,
      optionSetOrders,
      selectedOptions,
      setSelectedOptions,
      setTokenValues,
      fetchDimensions,
      debouncedFetchDimensions,
      dimensions,
      setDimensions,
    }),
    [
      autoFill,
      bulkOps,
      coverage,
      debouncedFetchDimensions,
      dimensions,
      dimensionsState,
      dragDrop,
      executeCreateOverrideSet,
      fetchDimensions,
      isCreatingOverrideSet,
      missingOverrides,
      modals,
      optionSetOrders,
      options,
      selectedOptions,
      setDimensions,
      setSelectedOptions,
      setTokenValues,
      createOverrideSet,
    ],
  );
}

export interface ThemeManagerDiagnosticsControllerParams {
  dimensions: ThemeDimension[];
  coverage: ReturnType<typeof useThemeDimensions>["coverage"];
  missingOverrides: ReturnType<typeof useThemeDimensions>["missingOverrides"];
  availableSets: string[];
  optionSetOrders: Record<string, Record<string, string[]>>;
  setTokenValues: Record<string, Record<string, unknown>>;
  selectedOptions: Record<string, string>;
}

export function useThemeDiagnosticsController({
  dimensions,
  coverage,
  missingOverrides,
  availableSets,
  optionSetOrders,
  setTokenValues,
  selectedOptions,
}: ThemeManagerDiagnosticsControllerParams) {
  const [coverageContext, setCoverageContext] = useState<ThemeRoleNavigationTarget>({
    dimId: null,
    optionName: null,
    preferredSetName: null,
  });
  const [showAllCoverageAxes, setShowAllCoverageAxes] = useState(false);

  const setTokenCounts = useMemo(() => {
    const counts: Record<string, number | null> = {};
    for (const setName of availableSets) {
      counts[setName] = setTokenValues[setName]
        ? Object.keys(setTokenValues[setName]).length
        : null;
    }
    return counts;
  }, [availableSets, setTokenValues]);

  const coverageState = useThemeCoverage({
    dimensions,
    coverage,
    missingOverrides,
    availableSets,
    optionSetOrders,
    setTokenCounts,
  });

  const optionDiffCounts = useMemo(() => {
    const counts: Record<string, number> = {};

    const resolveOptionTokens = (option: ThemeOption): Record<string, unknown> => {
      const merged: Record<string, unknown> = {};
      for (const [setName, status] of Object.entries(option.sets)) {
        if (status === "source") {
          Object.assign(merged, setTokenValues[setName] ?? {});
        }
      }
      for (const [setName, status] of Object.entries(option.sets)) {
        if (status === "enabled") {
          Object.assign(merged, setTokenValues[setName] ?? {});
        }
      }

      const resolveValue = (value: unknown, depth = 0): unknown => {
        if (depth > 10 || typeof value !== "string") return value;
        const match = /^\{([^}]+)\}$/.exec(value);
        if (!match) return value;
        const tokenPath = match[1];
        return tokenPath in merged ? resolveValue(merged[tokenPath], depth + 1) : value;
      };

      const output: Record<string, unknown> = {};
      for (const [path, value] of Object.entries(merged)) {
        output[path] = resolveValue(value);
      }
      return output;
    };

    for (const dimension of dimensions) {
      if (dimension.options.length < 2) continue;
      const selectedOptionName =
        selectedOptions[dimension.id] ?? dimension.options[0]?.name ?? "";
      const selectedOption = dimension.options.find(
        (option) => option.name === selectedOptionName,
      );
      if (!selectedOption) continue;
      const selectedTokens = resolveOptionTokens(selectedOption);
      for (const option of dimension.options) {
        if (option.name === selectedOptionName) continue;
        const optionTokens = resolveOptionTokens(option);
        const allPaths = new Set([
          ...Object.keys(optionTokens),
          ...Object.keys(selectedTokens),
        ]);
        let differenceCount = 0;
        for (const path of allPaths) {
          if (
            JSON.stringify(optionTokens[path]) !==
            JSON.stringify(selectedTokens[path])
          ) {
            differenceCount += 1;
          }
        }
        counts[`${dimension.id}/${option.name}`] = differenceCount;
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
            orderedSets: optionSetOrders[dimension.id]?.[option.name] ?? availableSets,
            availableSets,
            tokenCountsBySet: setTokenCounts,
            uncoveredCount:
              coverage[dimension.id]?.[option.name]?.uncovered.length ?? 0,
            missingOverrideCount:
              missingOverrides[dimension.id]?.[option.name]?.missing.length ?? 0,
          },
        );
      }
    }
    return summaries;
  }, [
    availableSets,
    coverage,
    dimensions,
    missingOverrides,
    optionSetOrders,
    setTokenCounts,
  ]);

  return useMemo(
    () => ({
      coverageContext,
      setCoverageContext,
      showAllCoverageAxes,
      setShowAllCoverageAxes,
      setTokenCounts,
      optionIssues: coverageState.optionIssues,
      allIssues: coverageState.allIssues,
      totalIssueCount: coverageState.totalIssueCount,
      totalFillableGaps: coverageState.totalFillableGaps,
      optionDiffCounts,
      optionRoleSummaries,
    }),
    [
      coverageContext,
      coverageState.allIssues,
      coverageState.optionIssues,
      coverageState.totalFillableGaps,
      coverageState.totalIssueCount,
      optionDiffCounts,
      optionRoleSummaries,
      setTokenCounts,
      showAllCoverageAxes,
    ],
  );
}

export interface ThemeManagerAdvancedToolsControllerParams {
  dimensions: ThemeDimension[];
  selectedOptions: Record<string, string>;
  resolverState?: ResolverContentProps;
}

export function useThemeAdvancedToolsController({
  dimensions,
  selectedOptions,
  resolverState,
}: ThemeManagerAdvancedToolsControllerParams) {
  const compare = useThemeCompare();
  const [compareContext, setCompareContext] = useState<{
    dimId: string | null;
    optionName: string | null;
  }>({
    dimId: null,
    optionName: null,
  });
  const [advancedSetupRequestKey, setAdvancedSetupRequestKey] = useState<
    string | null
  >(null);

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

  const canCompareThemes = useMemo(
    () => dimensions.some((dimension) => dimension.options.length >= 2),
    [dimensions],
  );

  return useMemo(
    () => ({
      compare,
      compareContext,
      setCompareContext,
      advancedSetupRequestKey,
      setAdvancedSetupRequestKey,
      resolverAuthoringContext,
      canCompareThemes,
    }),
    [
      advancedSetupRequestKey,
      canCompareThemes,
      compare,
      compareContext,
      resolverAuthoringContext,
    ],
  );
}

export interface ThemeDiagnosticsControllerState {
  coverageContext: ThemeRoleNavigationTarget;
  setCoverageContext: React.Dispatch<
    React.SetStateAction<ThemeRoleNavigationTarget>
  >;
  showAllCoverageAxes: boolean;
  setShowAllCoverageAxes: React.Dispatch<React.SetStateAction<boolean>>;
  setTokenCounts: Record<string, number | null>;
  optionIssues: Record<string, ThemeIssueSummary[]>;
  allIssues: ThemeIssueSummary[];
  totalIssueCount: number;
  totalFillableGaps: number;
  optionDiffCounts: Record<string, number>;
  optionRoleSummaries: Record<string, ThemeOptionRoleSummary>;
}

export interface ThemeAdvancedToolsControllerState {
  compare: ReturnType<typeof useThemeCompare>;
  compareContext: { dimId: string | null; optionName: string | null };
  setCompareContext: React.Dispatch<
    React.SetStateAction<{ dimId: string | null; optionName: string | null }>
  >;
  advancedSetupRequestKey: string | null;
  setAdvancedSetupRequestKey: React.Dispatch<
    React.SetStateAction<string | null>
  >;
  resolverAuthoringContext: ReturnType<
    typeof buildThemeResolverAuthoringContext
  > | null;
  canCompareThemes: boolean;
}

export interface ThemeWorkspaceControllerState {
  dimensionsState: ReturnType<typeof useThemeDimensions>;
  dragDrop: ReturnType<typeof useThemeDragDrop>;
  bulkOps: ReturnType<typeof useThemeBulkOps>;
  autoFill: ReturnType<typeof useThemeAutoFill>;
  options: ReturnType<typeof useThemeOptions>;
  overrideSet: {
    createOverrideSet: {
      dimId: string;
      setName: string;
      optName?: string;
    } | null;
    setCreateOverrideSet: React.Dispatch<
      React.SetStateAction<
        { dimId: string; setName: string; optName?: string } | null
      >
    >;
    executeCreateOverrideSet: (params: {
      newName: string;
      optionName: string;
      startEmpty: boolean;
    }) => Promise<void>;
    isCreatingOverrideSet: boolean;
  };
  modals: ReturnType<typeof useThemeManagerModalsValue>;
  coverage: ReturnType<typeof useThemeDimensions>["coverage"];
  missingOverrides: ReturnType<typeof useThemeDimensions>["missingOverrides"];
  optionSetOrders: Record<string, Record<string, string[]>>;
  selectedOptions: Record<string, string>;
  setSelectedOptions: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setTokenValues: Record<string, Record<string, unknown>>;
  fetchDimensions: () => Promise<void>;
  debouncedFetchDimensions: () => void;
  dimensions: ThemeDimension[];
  setDimensions: React.Dispatch<React.SetStateAction<ThemeDimension[]>>;
}
