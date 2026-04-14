import type { ThemeOption } from '@tokenmanager/core';
export type {
  ThemeCoverageMap as CoverageMap,
  ThemeCoverageToken as CoverageToken,
  ThemeMissingOverrideToken as MissingOverrideToken,
  ThemeMissingOverridesMap as MissingOverridesMap,
} from '@tokenmanager/core';

// Shared types and constants for ThemeManager and its extracted hooks

export type ThemeRoleState = 'disabled' | 'source' | 'enabled';

export const THEME_ROLE_STATES: ThemeRoleState[] = ['disabled', 'source', 'enabled'];

export const STATE_LABELS: Record<ThemeRoleState, string> = {
  disabled: 'Not used',
  source: 'Default',
  enabled: 'Override',
};

export const STATE_DESCRIPTIONS: Record<ThemeRoleState, string> = {
  disabled: 'Not included in this mode',
  source: 'Always included as defaults',
  enabled: 'Overrides default values in this mode',
};

export type AutoFillPendingItem = { path: string; $value: unknown; $type?: string };

export type AutoFillPreview =
  | { mode: 'single-option'; dimId: string; optionName: string; targetSet: string; tokens: AutoFillPendingItem[] }
  | { mode: 'all-options'; dimId: string; perSetBatch: Record<string, AutoFillPendingItem[]>; totalCount: number };

export type ThemeOptionRolePriority = 'unmapped' | 'stale-set' | 'empty-override' | 'coverage' | 'ready';

export interface ThemeOptionRoleSummary {
  baseCount: number;
  overrideCount: number;
  excludedCount: number;
  assignedCount: number;
  emptyOverrideCount: number;
  staleSetCount: number;
  uncoveredCount: number;
  missingOverrideCount: number;
  coverageIssueCount: number;
  assignmentIssueCount: number;
  totalIssueCount: number;
  staleSetNames: string[];
  emptyOverrideSetNames: string[];
  isUnmapped: boolean;
  hasAssignmentIssues: boolean;
  hasCoverageIssues: boolean;
  priority: ThemeOptionRolePriority;
}

interface SummarizeThemeOptionRolesArgs {
  option: ThemeOption;
  orderedSets: string[];
  availableSets: string[];
  tokenCountsBySet?: Record<string, number | null>;
  uncoveredCount?: number;
  missingOverrideCount?: number;
}

function isAssignedRole(status: string | undefined): boolean {
  return status === 'source' || status === 'enabled';
}

export function getThemeOptionRolePriorityWeight(priority: ThemeOptionRolePriority): number {
  switch (priority) {
    case 'unmapped':
      return 0;
    case 'stale-set':
      return 1;
    case 'empty-override':
      return 2;
    case 'coverage':
      return 3;
    default:
      return 4;
  }
}

export function summarizeThemeOptionRoles({
  option,
  orderedSets,
  availableSets,
  tokenCountsBySet = {},
  uncoveredCount = 0,
  missingOverrideCount = 0,
}: SummarizeThemeOptionRolesArgs): ThemeOptionRoleSummary {
  const availableSetNames = new Set(availableSets);
  const allSetNames = Array.from(new Set([...orderedSets, ...Object.keys(option.sets)]));

  let baseCount = 0;
  let overrideCount = 0;
  let excludedCount = 0;
  let emptyOverrideCount = 0;
  const staleSetNames: string[] = [];
  const emptyOverrideSetNames: string[] = [];

  for (const setName of allSetNames) {
    const status = option.sets[setName] ?? 'disabled';
    if (status === 'source') {
      baseCount += 1;
    } else if (status === 'enabled') {
      overrideCount += 1;
      if (tokenCountsBySet[setName] === 0) {
        emptyOverrideCount += 1;
        emptyOverrideSetNames.push(setName);
      }
    } else {
      excludedCount += 1;
    }

    if (isAssignedRole(status) && !availableSetNames.has(setName)) {
      staleSetNames.push(setName);
    }
  }

  const assignedCount = baseCount + overrideCount;
  const staleSetCount = staleSetNames.length;
  const coverageIssueCount = uncoveredCount + missingOverrideCount;
  const assignmentIssueCount = staleSetCount + emptyOverrideCount;
  const isUnmapped = assignedCount === 0;
  const priority: ThemeOptionRolePriority = isUnmapped
    ? 'unmapped'
    : staleSetCount > 0
      ? 'stale-set'
      : emptyOverrideCount > 0
        ? 'empty-override'
        : coverageIssueCount > 0
          ? 'coverage'
          : 'ready';

  return {
    baseCount,
    overrideCount,
    excludedCount,
    assignedCount,
    emptyOverrideCount,
    staleSetCount,
    uncoveredCount,
    missingOverrideCount,
    coverageIssueCount,
    assignmentIssueCount,
    totalIssueCount: assignmentIssueCount + coverageIssueCount,
    staleSetNames,
    emptyOverrideSetNames,
    isUnmapped,
    hasAssignmentIssues: assignmentIssueCount > 0,
    hasCoverageIssues: coverageIssueCount > 0,
    priority,
  };
}
