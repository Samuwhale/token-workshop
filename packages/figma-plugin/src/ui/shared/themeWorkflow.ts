import type { ThemeDimension } from '@tokenmanager/core';
import { getThemeOptionRolePriorityWeight, summarizeThemeOptionRoles, type ThemeOptionRolePriority } from '../components/themeManagerTypes';

export type ThemeAuthoringStage = 'axes' | 'options' | 'set-roles' | 'preview';
export type ThemeManagerView = 'authoring' | 'coverage' | 'compare' | 'advanced';

export interface ThemeWorkspaceShellState {
  activeView: ThemeManagerView;
  showPreview: boolean;
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
}

interface SummarizeThemeWorkflowArgs {
  availableSets?: string[];
  setTokenCounts?: Record<string, number | null>;
}

export function summarizeThemeWorkflow(
  dimensions: ThemeDimension[],
  { availableSets = [], setTokenCounts = {} }: SummarizeThemeWorkflowArgs = {},
): ThemeWorkflowSummary {
  const axisCount = dimensions.length;
  const optionCount = dimensions.reduce((sum, dimension) => sum + dimension.options.length, 0);
  const axesMissingOptionsCount = dimensions.filter((dimension) => dimension.options.length === 0).length;

  let mappedOptionCount = 0;
  let mappedOptionWithAssignmentIssuesCount = 0;
  let optionsWithCoverageIssuesCount = 0;
  let mappedSetCount = 0;
  let nextSetRoleTarget: ThemeWorkflowSetRoleTarget | null = null;

  for (const dimension of dimensions) {
    for (const option of dimension.options) {
      const summary = summarizeThemeOptionRoles({
        option,
        orderedSets: availableSets,
        availableSets,
        tokenCountsBySet: setTokenCounts,
      });

      mappedSetCount += summary.assignedCount;
      if (!summary.isUnmapped) mappedOptionCount += 1;
      if (!summary.isUnmapped && summary.hasAssignmentIssues) mappedOptionWithAssignmentIssuesCount += 1;
      if (summary.hasCoverageIssues) optionsWithCoverageIssuesCount += 1;

      if (summary.priority === 'ready') continue;

      const candidate: ThemeWorkflowSetRoleTarget = {
        dimensionId: dimension.id,
        dimensionName: dimension.name,
        optionName: option.name,
        priority: summary.priority,
        totalIssueCount: summary.totalIssueCount,
      };

      if (!nextSetRoleTarget) {
        nextSetRoleTarget = candidate;
        continue;
      }

      const currentWeight = getThemeOptionRolePriorityWeight(nextSetRoleTarget.priority);
      const candidateWeight = getThemeOptionRolePriorityWeight(candidate.priority);
      if (candidateWeight < currentWeight) {
        nextSetRoleTarget = candidate;
        continue;
      }
      if (candidateWeight === currentWeight && candidate.totalIssueCount > nextSetRoleTarget.totalIssueCount) {
        nextSetRoleTarget = candidate;
      }
    }
  }

  const unmappedOptionCount = optionCount - mappedOptionCount;
  const previewReady = mappedOptionCount > 0;
  const hasComparisonOptions = dimensions.some((dimension) => dimension.options.length >= 2);
  const optionsNeedingRoleAttentionCount = unmappedOptionCount + mappedOptionWithAssignmentIssuesCount;

  let currentStage: ThemeAuthoringStage = 'preview';
  if (axisCount === 0) {
    currentStage = 'axes';
  } else if (optionCount === 0 || axesMissingOptionsCount > 0) {
    currentStage = 'options';
  } else if (optionsNeedingRoleAttentionCount > 0) {
    currentStage = 'set-roles';
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
