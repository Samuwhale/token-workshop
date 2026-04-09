import { useMemo } from "react";
import type { ThemeDimension } from "@tokenmanager/core";
import type {
  CoverageMap,
  MissingOverridesMap,
} from "../components/themeManagerTypes";
import {
  collectThemeOptionIssues,
  type ThemeIssueSummary,
} from "../shared/themeWorkflow";

export interface UseThemeCoverageParams {
  dimensions: ThemeDimension[];
  coverage: CoverageMap;
  missingOverrides: MissingOverridesMap;
  availableSets: string[];
  optionSetOrders: Record<string, Record<string, string[]>>;
  setTokenCounts: Record<string, number | null>;
}

export interface UseThemeCoverageReturn {
  optionIssues: Record<string, ThemeIssueSummary[]>;
  totalIssueCount: number;
  totalFillableGaps: number;
}

export function useThemeCoverage({
  dimensions,
  coverage,
  missingOverrides,
  availableSets,
  optionSetOrders,
  setTokenCounts,
}: UseThemeCoverageParams): UseThemeCoverageReturn {
  const optionIssues = useMemo(() => {
    const nextIssues: Record<string, ThemeIssueSummary[]> = {};

    for (const dimension of dimensions) {
      for (const option of dimension.options) {
        const issues = collectThemeOptionIssues({
          dimension,
          option,
          orderedSets:
            optionSetOrders[dimension.id]?.[option.name] || availableSets,
          availableSets,
          tokenCountsBySet: setTokenCounts,
          uncoveredCount:
            coverage[dimension.id]?.[option.name]?.uncovered.length ?? 0,
          missingOverrideCount:
            missingOverrides[dimension.id]?.[option.name]?.missing.length ?? 0,
        });

        if (issues.length > 0) {
          nextIssues[`${dimension.id}:${option.name}`] = issues;
        }
      }
    }

    return nextIssues;
  }, [
    availableSets,
    coverage,
    dimensions,
    missingOverrides,
    optionSetOrders,
    setTokenCounts,
  ]);

  const totalIssueCount = useMemo(() => {
    return Object.values(optionIssues).reduce((sum, issues) => {
      return (
        sum + issues.reduce((issueSum, issue) => issueSum + issue.count, 0)
      );
    }, 0);
  }, [optionIssues]);

  const totalFillableGaps = useMemo(() => {
    let total = 0;
    for (const dimCoverage of Object.values(coverage)) {
      for (const optCoverage of Object.values(dimCoverage)) {
        total += optCoverage.uncovered.filter(
          (item) => item.missingRef && item.fillValue !== undefined,
        ).length;
      }
    }
    return total;
  }, [coverage]);

  return {
    optionIssues,
    totalIssueCount,
    totalFillableGaps,
  };
}
