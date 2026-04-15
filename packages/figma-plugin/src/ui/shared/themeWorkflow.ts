import type { ThemeDimension } from "@tokenmanager/core";

export type ThemeAuthoringStage = "axes" | "options" | "token-modes" | "preview";
export type ThemeManagerView = "authoring" | "compare" | "output";
export type ThemeAuthoringMode = "authoring" | "preview";
export type ThemeWorkflowTone = "default" | "success" | "warning" | "critical";
export type ThemeWorkflowItem = {
  id: ThemeAuthoringStage;
  label: string;
  tone: ThemeWorkflowTone;
  current: boolean;
};
export type ThemeWorkflowAction = {
  label: string;
  stage: ThemeAuthoringStage;
};

export interface ThemeRoleNavigationTarget {
  dimId: string | null;
  optionName: string | null;
  preferredSetName?: string | null;
}

export type ThemeIssueKind = "missing-mode-value";

export interface ThemeWorkspaceShellState {
  activeView: ThemeManagerView;
  authoringMode: ThemeAuthoringMode;
}

export interface ThemeIssueSummary {
  key: string;
  kind: ThemeIssueKind;
  dimensionId: string;
  dimensionName: string;
  optionName: string;
  count: number;
  title: string;
  summary: string;
  recommendedNextAction: string;
  actionLabel: string;
  preferredSetName: string | null;
  affectedSetNames: string[];
}

export interface ThemeIssueReviewGroup {
  kind: ThemeIssueKind;
  title: string;
  description: string;
  issues: ThemeIssueSummary[];
}

export interface ThemeIssueHealthSummary {
  totalCount: number;
  description: string;
}

export interface ThemeWorkflowSummary {
  axisCount: number;
  optionCount: number;
  axesMissingOptionsCount: number;
  mappedOptionCount: number;
  unmappedOptionCount: number;
  mappedOptionWithAssignmentIssuesCount: number;
  optionsWithCoverageIssuesCount: number;
  mappedSetCount: number;
  previewReady: boolean;
  hasComparisonOptions: boolean;
  currentStage: ThemeAuthoringStage;
  nextSetRoleTarget: null;
}

export function sortThemeIssuesByPriority(
  issues: ThemeIssueSummary[],
): ThemeIssueSummary[] {
  return issues
    .slice()
    .sort((left, right) =>
      left.dimensionName === right.dimensionName
        ? left.optionName.localeCompare(right.optionName)
        : left.dimensionName.localeCompare(right.dimensionName),
    );
}

export function summarizeThemeIssueHealth(
  issues: ThemeIssueSummary[],
): ThemeIssueHealthSummary | null {
  if (issues.length === 0) return null;
  const totalCount = issues.reduce((sum, issue) => sum + issue.count, 0);
  return {
    totalCount,
    description: `${totalCount} missing mode value${totalCount === 1 ? "" : "s"}`,
  };
}

export function groupThemeIssuesForReview(
  issues: ThemeIssueSummary[],
): ThemeIssueReviewGroup[] {
  if (issues.length === 0) return [];
  return [
    {
      kind: "missing-mode-value",
      title: "Missing mode values",
      description:
        "These options are missing inline token mode values that were authored elsewhere in the same dimension.",
      issues: sortThemeIssuesByPriority(issues),
    },
  ];
}

export function collectThemeOptionIssues(params: {
  dimension: ThemeDimension;
  option: { name: string };
  missingCount?: number;
}): ThemeIssueSummary[] {
  const { dimension, option, missingCount = 0 } = params;
  if (missingCount === 0) return [];
  return [
    {
      key: `${dimension.id}:${option.name}`,
      kind: "missing-mode-value",
      dimensionId: dimension.id,
      dimensionName: dimension.name,
      optionName: option.name,
      count: missingCount,
      title: `${missingCount} missing mode value${missingCount === 1 ? "" : "s"}`,
      summary: `${option.name} is missing ${missingCount} inline token mode value${missingCount === 1 ? "" : "s"}.`,
      recommendedNextAction: "Open the affected tokens and add the missing mode values inline.",
      actionLabel: "Review tokens",
      preferredSetName: null,
      affectedSetNames: [],
    },
  ];
}

export function summarizeThemeWorkflow(
  dimensions: ThemeDimension[],
  params: {
    totalIssueCount?: number;
    authoringMode?: ThemeAuthoringMode;
    activeView?: ThemeManagerView;
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
  const totalIssueCount = params.totalIssueCount ?? 0;
  const currentStage: ThemeAuthoringStage =
    params.activeView === "compare" || params.authoringMode === "preview"
      ? "preview"
      : axesMissingOptionsCount > 0
        ? "options"
        : axisCount === 0
          ? "axes"
          : totalIssueCount > 0
            ? "token-modes"
            : "preview";

  return {
    axisCount,
    optionCount,
    axesMissingOptionsCount,
    mappedOptionCount: optionCount,
    unmappedOptionCount: 0,
    mappedOptionWithAssignmentIssuesCount: 0,
    optionsWithCoverageIssuesCount: totalIssueCount,
    mappedSetCount: 0,
    previewReady: axisCount > 0 && optionCount > 0,
    hasComparisonOptions: optionCount > 1,
    currentStage,
    nextSetRoleTarget: null,
  };
}
