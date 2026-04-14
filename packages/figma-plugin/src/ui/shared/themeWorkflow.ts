import type { ThemeDimension, ThemeOption } from "@tokenmanager/core";
import {
  getThemeOptionRolePriorityWeight,
  summarizeThemeOptionRoles,
  type CoverageMap,
  type MissingOverridesMap,
  type ThemeOptionRolePriority,
} from "../components/themeManagerTypes";
import type {
  WorkflowStageIndicatorAction,
  WorkflowStageIndicatorItem,
  WorkflowStageTone,
} from "./WorkflowStageIndicators";

export type ThemeAuthoringStage = "axes" | "options" | "set-roles" | "preview";
export type ThemeManagerView =
  | "authoring"
  | "compare"
  | "resolver";
export type ThemeAuthoringMode = "roles" | "preview";
export type ThemeWorkflowTone = WorkflowStageTone;
export type ThemeWorkflowItem = WorkflowStageIndicatorItem<ThemeAuthoringStage>;
export type ThemeWorkflowAction = WorkflowStageIndicatorAction;

export interface ThemeRoleNavigationTarget {
  dimId: string | null;
  optionName: string | null;
  preferredSetName?: string | null;
}

export type ThemeIssueKind =
  | "stale-set"
  | "empty-override"
  | "missing-override"
  | "coverage-gap";

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

const THEME_ISSUE_KIND_LABEL: Record<ThemeIssueKind, string> = {
  "stale-set": "deleted token sources",
  "empty-override": "empty variant sets",
  "missing-override": "missing variant coverage",
  "coverage-gap": "coverage gaps",
};

const THEME_ISSUE_GROUP_COPY: Record<
  ThemeIssueKind,
  { title: string; description: string }
> = {
  "stale-set": {
    title: "Deleted token sources",
    description: "Variants reference deleted sets.",
  },
  "empty-override": {
    title: "Empty variant sets",
    description: "Assigned override sets are empty.",
  },
  "missing-override": {
    title: "Missing variant coverage",
    description: "Shared tokens missing from variant layer.",
  },
  "coverage-gap": {
    title: "Coverage gaps",
    description: "Unresolved values in the active stack.",
  },
};

function getThemeIssueKindWeight(kind: ThemeIssueKind): number {
  return THEME_ISSUE_KIND_WEIGHT[kind];
}

function formatThemeIssueKindList(kinds: ThemeIssueKind[]): string {
  const labels = Array.from(
    new Set(
      kinds
        .slice()
        .sort((left, right) => getThemeIssueKindWeight(left) - getThemeIssueKindWeight(right))
        .map((kind) => THEME_ISSUE_KIND_LABEL[kind]),
    ),
  );

  if (labels.length === 0) return "issues";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

export function sortThemeIssuesByPriority(
  issues: ThemeIssueSummary[],
): ThemeIssueSummary[] {
  return issues.slice().sort((left, right) => {
    const weightDelta =
      getThemeIssueKindWeight(left.kind) - getThemeIssueKindWeight(right.kind);
    if (weightDelta !== 0) return weightDelta;

    if (right.count !== left.count) return right.count - left.count;
    if (left.dimensionName !== right.dimensionName) {
      return left.dimensionName.localeCompare(right.dimensionName);
    }
    return left.optionName.localeCompare(right.optionName);
  });
}

export function summarizeThemeIssueHealth(
  issues: ThemeIssueSummary[],
): ThemeIssueHealthSummary | null {
  if (issues.length === 0) return null;

  const totalCount = issues.reduce((sum, issue) => sum + issue.count, 0);
  const description =
    `${totalCount} issue${totalCount === 1 ? "" : "s"} across ${formatThemeIssueKindList(
      issues.map((issue) => issue.kind),
    )}. Review them before previewing this variant.`;

  return {
    totalCount,
    description,
  };
}

export function groupThemeIssuesForReview(
  issues: ThemeIssueSummary[],
): ThemeIssueReviewGroup[] {
  if (issues.length === 0) return [];

  const issuesByKind = new Map<ThemeIssueKind, ThemeIssueSummary[]>();
  for (const issue of sortThemeIssuesByPriority(issues)) {
    const groupIssues = issuesByKind.get(issue.kind);
    if (groupIssues) {
      groupIssues.push(issue);
    } else {
      issuesByKind.set(issue.kind, [issue]);
    }
  }

  return Array.from(issuesByKind.entries())
    .sort(
      ([leftKind], [rightKind]) =>
        getThemeIssueKindWeight(leftKind) - getThemeIssueKindWeight(rightKind),
    )
    .map(([kind, groupedIssues]) => ({
      kind,
      title: THEME_ISSUE_GROUP_COPY[kind].title,
      description: THEME_ISSUE_GROUP_COPY[kind].description,
      issues: groupedIssues,
    }));
}

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
      title: "Deleted token sources",
      summary: `${summary.staleSetCount} deleted source${summary.staleSetCount === 1 ? "" : "s"}.`,
      recommendedNextAction:
        "Remove or replace deleted sources.",
      actionLabel: "View set",
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
      title: "Empty variant sets",
      summary: `${summary.emptyOverrideCount} empty override set${summary.emptyOverrideCount === 1 ? "" : "s"}.`,
      recommendedNextAction:
        "Add tokens or reassign to shared.",
      actionLabel: "View set",
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
      title: "Missing variant coverage",
      summary: `${missingOverrideCount} shared token${missingOverrideCount === 1 ? "" : "s"} missing from variant layer.`,
      recommendedNextAction:
        "Review missing tokens.",
      actionLabel: "Return to variant",
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
      summary: `${uncoveredCount} unresolved value${uncoveredCount === 1 ? "" : "s"} in active stack.`,
      recommendedNextAction:
        "Fill or create missing tokens.",
      actionLabel: "Return to variant",
      preferredSetName: pickPreferredSetName(orderedSets, availableSets),
      affectedSetNames: [],
    });
  }

  return sortThemeIssuesByPriority(issues);
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
          ? "Assign a set so this variant can contribute tokens."
          : (topIssue?.recommendedNextAction ??
            "Resolve outstanding issues."),
        actionLabel: summary.isUnmapped
          ? "Assign token sources"
          : (topIssue?.actionLabel ?? "View set"),
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
