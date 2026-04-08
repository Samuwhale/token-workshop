import type { ThemeDimension } from '@tokenmanager/core';

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
  mappedSetCount: number;
  previewReady: boolean;
  hasComparisonOptions: boolean;
  currentStage: ThemeAuthoringStage;
}

export function summarizeThemeWorkflow(dimensions: ThemeDimension[]): ThemeWorkflowSummary {
  const axisCount = dimensions.length;
  const optionCount = dimensions.reduce((sum, dimension) => sum + dimension.options.length, 0);
  const axesMissingOptionsCount = dimensions.filter((dimension) => dimension.options.length === 0).length;

  let mappedOptionCount = 0;
  let mappedSetCount = 0;

  for (const dimension of dimensions) {
    for (const option of dimension.options) {
      const assignedStatuses = Object.values(option.sets).filter((status) => status === 'source' || status === 'enabled');
      mappedSetCount += assignedStatuses.length;
      if (assignedStatuses.length > 0) mappedOptionCount += 1;
    }
  }

  const unmappedOptionCount = optionCount - mappedOptionCount;
  const previewReady = mappedOptionCount > 0;
  const hasComparisonOptions = dimensions.some((dimension) => dimension.options.length >= 2);

  let currentStage: ThemeAuthoringStage = 'preview';
  if (axisCount === 0) {
    currentStage = 'axes';
  } else if (optionCount === 0 || axesMissingOptionsCount > 0) {
    currentStage = 'options';
  } else if (unmappedOptionCount > 0) {
    currentStage = 'set-roles';
  }

  return {
    axisCount,
    optionCount,
    axesMissingOptionsCount,
    mappedOptionCount,
    unmappedOptionCount,
    mappedSetCount,
    previewReady,
    hasComparisonOptions,
    currentStage,
  };
}
