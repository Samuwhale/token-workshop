import type { ThemeDimension } from "@tokenmanager/core";
import type { ThemeModeCoverageSummary } from "./themeModeUtils";

export type ThemeAuthoringStage = "axes" | "options" | "token-modes" | "preview";
export type ThemeManagerView = "authoring" | "compare" | "output";
export type ThemeAuthoringMode = "authoring" | "preview";

export interface ThemeWorkspaceShellState {
  activeView: ThemeManagerView;
  authoringMode: ThemeAuthoringMode;
}

export interface ThemeWorkflowSummary {
  axisCount: number;
  optionCount: number;
  axesMissingOptionsCount: number;
  mappedOptionCount: number;
  unmappedOptionCount: number;
  mappedOptionWithAssignmentIssuesCount: number;
  totalMissingModeValueCount: number;
  mappedSetCount: number;
  previewReady: boolean;
  hasComparisonOptions: boolean;
  currentStage: ThemeAuthoringStage;
}

export function summarizeThemeWorkflow(
  dimensions: ThemeDimension[],
  params: {
    authoringMode?: ThemeAuthoringMode;
    activeView?: ThemeManagerView;
    coverageSummary?: ThemeModeCoverageSummary;
  } = {},
): ThemeWorkflowSummary {
  const axisCount = dimensions.length;
  const optionCount = dimensions.reduce(
    (sum, dimension) => sum + dimension.options.length,
    0,
  );
  const axesMissingOptionsCount = dimensions.filter(
    (dimension) => dimension.options.length === 0,
  ).length;
  const coverageSummary = params.coverageSummary ?? {
    mappedOptionCount: 0,
    unmappedOptionCount: 0,
    mappedOptionWithAssignmentIssuesCount: 0,
    totalMissingModeValueCount: 0,
    mappedSetCount: 0,
  };
  const currentStage: ThemeAuthoringStage =
    axisCount === 0
      ? "axes"
      : axesMissingOptionsCount > 0
        ? "options"
        : coverageSummary.totalMissingModeValueCount > 0
          ? "token-modes"
          : "preview";

  return {
    axisCount,
    optionCount,
    axesMissingOptionsCount,
    mappedOptionCount: coverageSummary.mappedOptionCount,
    unmappedOptionCount: coverageSummary.unmappedOptionCount,
    mappedOptionWithAssignmentIssuesCount:
      coverageSummary.mappedOptionWithAssignmentIssuesCount,
    totalMissingModeValueCount: coverageSummary.totalMissingModeValueCount,
    mappedSetCount: coverageSummary.mappedSetCount,
    previewReady:
      axisCount > 0 &&
      optionCount > 0 &&
      axesMissingOptionsCount === 0,
    hasComparisonOptions: optionCount > 1,
    currentStage,
  };
}
