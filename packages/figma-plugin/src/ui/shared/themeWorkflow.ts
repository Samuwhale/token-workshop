import type { ThemeDimension, ThemeOption } from "@tokenmanager/core";
import {
  getThemeOptionRolePriorityWeight,
  summarizeThemeOptionRoles,
  type CoverageMap,
  type MissingOverridesMap,
  type ThemeOptionRolePriority,
} from "../components/themeManagerTypes";

export type ThemeAuthoringStage = "axes" | "options" | "set-roles" | "preview";
export type ThemeManagerView =
  | "authoring"
  | "coverage"
  | "compare"
  | "advanced";
export type ThemeIssueKind =
  | "stale-set"
  | "empty-override"
  | "missing-override"
  | "coverage-gap";

export interface ThemeWorkspaceShellState {
  activeView: ThemeManagerView;
  showPreview: boolean;
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
  nextSetRoleTarget: ThemeWorkflowSetRoleTarget | null;
}

export interface ThemeWorkflowSetRoleTarget {
  dimensionId: string;
  dimensionName: string;
  optionName: string;
  priority: ThemeOptionRolePriority;
  totalIssueCount: number;
  issueKind: ThemeIssueKind | "unmapped";
  recommendedNextAction: string;
  actionLabel: string;
  preferredSetName: string | null;
}

interface ThemeOptionIssueArgs {
  dimension: ThemeDimension;
  option: ThemeOption;
  orderedSets: string[];
  availableSets: string[];
  tokenCountsBySet?: Record<string, number | null>;
  uncoveredCount?: number;
  missingOverrideCount?: number;
}

interface SummarizeThemeWorkflowArgs {
  availableSets?: string[];
  setTokenCounts?: Record<string, number | null>;
  coverage?: CoverageMap;
  missingOverrides?: MissingOverridesMap;
}

const THEME_ISSUE_KIND_WEIGHT: Record<ThemeIssueKind, number> = {
  "stale-set": 0,
  "empty-override": 1,
  "missing-override": 2,
  "coverage-gap": 3,
};

function pickPreferredSetName(
  orderedSets: string[],
  availableSets: string[],
  preferredSetNames: string[] = [],
): string | null {
  const availableSetNames = new Set(availableSets);

  for (const setName of preferredSetNames) {
    if (availableSetNames.has(setName)) return setName;
  }

  for (const setName of orderedSets) {
    if (availableSetNames.has(setName)) return setName;
  }

  return availableSets[0] ?? null;
}

export function collectThemeOptionIssues({
  dimension,
  option,
  orderedSets,
  availableSets,
  tokenCountsBySet = {},
  uncoveredCount = 0,
  missingOverrideCount = 0,
}: ThemeOptionIssueArgs): ThemeIssueSummary[] {
  const summary = summarizeThemeOptionRoles({
    option,
    orderedSets,
    availableSets,
    tokenCountsBySet,
    uncoveredCount,
    missingOverrideCount,
  });

  const issues: ThemeIssueSummary[] = [];

  if (summary.staleSetCount > 0) {
    issues.push({
      key: `${dimension.id}:${option.name}:stale-set`,
      kind: "stale-set",
      dimensionId: dimension.id,
      dimensionName: dimension.name,
      optionName: option.name,
      count: summary.staleSetCount,
      title: "Deleted set assignments",
      summary: `${summary.staleSetCount} assigned set${summary.staleSetCount === 1 ? "" : "s"} no longer exist for this option.`,
      recommendedNextAction:
        "Open set roles, then remove or replace the deleted assignments before previewing this option.",
      actionLabel: "Edit set roles",
      preferredSetName: pickPreferredSetName(orderedSets, availableSets),
      affectedSetNames: summary.staleSetNames,
    });
  }

  if (summary.emptyOverrideCount > 0) {
    issues.push({
      key: `${dimension.id}:${option.name}:empty-override`,
      kind: "empty-override",
      dimensionId: dimension.id,
      dimensionName: dimension.name,
      optionName: option.name,
      count: summary.emptyOverrideCount,
      title: "Empty override sets",
      summary: `${summary.emptyOverrideCount} override set${summary.emptyOverrideCount === 1 ? "" : "s"} are assigned but currently contain no tokens.`,
      recommendedNextAction:
        "Open set roles, then add tokens to the empty override or move it out of the override layer.",
      actionLabel: "Edit set roles",
      preferredSetName: pickPreferredSetName(
        orderedSets,
        availableSets,
        summary.emptyOverrideSetNames,
      ),
      affectedSetNames: summary.emptyOverrideSetNames,
    });
  }

  if (missingOverrideCount > 0) {
    const assignedOverrideSets = orderedSets.filter(
      (setName) => option.sets[setName] === "enabled",
    );
    issues.push({
      key: `${dimension.id}:${option.name}:missing-override`,
      kind: "missing-override",
      dimensionId: dimension.id,
      dimensionName: dimension.name,
      optionName: option.name,
      count: missingOverrideCount,
      title: "Missing override coverage",
      summary: `${missingOverrideCount} token${missingOverrideCount === 1 ? "" : "s"} exist in Base sets but are missing from the override layer.`,
      recommendedNextAction:
        "Review this option in coverage, then return to set roles to confirm which override set should own the missing tokens.",
      actionLabel: "Edit set roles",
      preferredSetName: pickPreferredSetName(
        orderedSets,
        availableSets,
        assignedOverrideSets,
      ),
      affectedSetNames: assignedOverrideSets,
    });
  }

  if (uncoveredCount > 0) {
    issues.push({
      key: `${dimension.id}:${option.name}:coverage-gap`,
      kind: "coverage-gap",
      dimensionId: dimension.id,
      dimensionName: dimension.name,
      optionName: option.name,
      count: uncoveredCount,
      title: "Unresolved coverage gaps",
      summary: `${uncoveredCount} token${uncoveredCount === 1 ? "" : "s"} still resolve to missing values or aliases in the active stack.`,
      recommendedNextAction:
        "Review the missing tokens, then return to set roles to confirm the active Base and Override stack before filling them.",
      actionLabel: "Edit set roles",
      preferredSetName: pickPreferredSetName(orderedSets, availableSets),
      affectedSetNames: [],
    });
  }

  issues.sort((left, right) => {
    const weightDelta =
      THEME_ISSUE_KIND_WEIGHT[left.kind] - THEME_ISSUE_KIND_WEIGHT[right.kind];
    if (weightDelta !== 0) return weightDelta;
    return right.count - left.count;
  });

  return issues;
}

export function summarizeThemeWorkflow(
  dimensions: ThemeDimension[],
  {
    availableSets = [],
    setTokenCounts = {},
    coverage = {},
    missingOverrides = {},
  }: SummarizeThemeWorkflowArgs = {},
): ThemeWorkflowSummary {
  const axisCount = dimensions.length;
  const optionCount = dimensions.reduce(
    (sum, dimension) => sum + dimension.options.length,
    0,
  );
  const axesMissingOptionsCount = dimensions.filter(
    (dimension) => dimension.options.length === 0,
  ).length;

  let mappedOptionCount = 0;
  let mappedOptionWithAssignmentIssuesCount = 0;
  let optionsWithCoverageIssuesCount = 0;
  let mappedSetCount = 0;
  let nextSetRoleTarget: ThemeWorkflowSetRoleTarget | null = null;

  for (const dimension of dimensions) {
    for (const option of dimension.options) {
      const uncoveredCount =
        coverage[dimension.id]?.[option.name]?.uncovered.length ?? 0;
      const missingOverrideCount =
        missingOverrides[dimension.id]?.[option.name]?.missing.length ?? 0;
      const summary = summarizeThemeOptionRoles({
        option,
        orderedSets: availableSets,
        availableSets,
        tokenCountsBySet: setTokenCounts,
        uncoveredCount,
        missingOverrideCount,
      });
      const issueEntries = collectThemeOptionIssues({
        dimension,
        option,
        orderedSets: availableSets,
        availableSets,
        tokenCountsBySet: setTokenCounts,
        uncoveredCount,
        missingOverrideCount,
      });

      mappedSetCount += summary.assignedCount;
      if (!summary.isUnmapped) mappedOptionCount += 1;
      if (!summary.isUnmapped && summary.hasAssignmentIssues)
        mappedOptionWithAssignmentIssuesCount += 1;
      if (summary.hasCoverageIssues) optionsWithCoverageIssuesCount += 1;

      if (summary.priority === "ready") continue;

      const topIssue = issueEntries[0] ?? null;
      const candidate: ThemeWorkflowSetRoleTarget = {
        dimensionId: dimension.id,
        dimensionName: dimension.name,
        optionName: option.name,
        priority: summary.priority,
        totalIssueCount: summary.totalIssueCount,
        issueKind: summary.isUnmapped
          ? "unmapped"
          : (topIssue?.kind ?? "coverage-gap"),
        recommendedNextAction: summary.isUnmapped
          ? "Assign at least one Base or Override set so this option can contribute tokens."
          : (topIssue?.recommendedNextAction ??
            "Open set roles and resolve the outstanding issue."),
        actionLabel: summary.isUnmapped
          ? "Assign set roles"
          : (topIssue?.actionLabel ?? "Edit set roles"),
        preferredSetName: summary.isUnmapped
          ? pickPreferredSetName(availableSets, availableSets)
          : (topIssue?.preferredSetName ??
            pickPreferredSetName(availableSets, availableSets)),
      };

      if (!nextSetRoleTarget) {
        nextSetRoleTarget = candidate;
        continue;
      }

      const currentWeight = getThemeOptionRolePriorityWeight(
        nextSetRoleTarget.priority,
      );
      const candidateWeight = getThemeOptionRolePriorityWeight(
        candidate.priority,
      );
      if (candidateWeight < currentWeight) {
        nextSetRoleTarget = candidate;
        continue;
      }
      if (
        candidateWeight === currentWeight &&
        candidate.totalIssueCount > nextSetRoleTarget.totalIssueCount
      ) {
        nextSetRoleTarget = candidate;
      }
    }
  }

  const unmappedOptionCount = optionCount - mappedOptionCount;
  const previewReady = mappedOptionCount > 0;
  const hasComparisonOptions = dimensions.some(
    (dimension) => dimension.options.length >= 2,
  );
  const optionsNeedingRoleAttentionCount =
    unmappedOptionCount + mappedOptionWithAssignmentIssuesCount;

  let currentStage: ThemeAuthoringStage = "preview";
  if (axisCount === 0) {
    currentStage = "axes";
  } else if (optionCount === 0 || axesMissingOptionsCount > 0) {
    currentStage = "options";
  } else if (optionsNeedingRoleAttentionCount > 0) {
    currentStage = "set-roles";
  }

  return {
    axisCount,
    optionCount,
    axesMissingOptionsCount,
    mappedOptionCount,
    unmappedOptionCount,
    mappedOptionWithAssignmentIssuesCount,
    optionsWithCoverageIssuesCount,
    mappedSetCount,
    previewReady,
    hasComparisonOptions,
    currentStage,
    nextSetRoleTarget,
  };
}
