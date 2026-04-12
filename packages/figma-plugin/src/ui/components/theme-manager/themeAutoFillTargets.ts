import type { ThemeDimension } from "@tokenmanager/core";
import type { CoverageMap, CoverageToken } from "../themeManagerTypes";

export interface ThemeAutoFillAction {
  mode: "single-option" | "all-options";
  dimId: string;
  dimensionName: string;
  fillableCount: number;
  optionCount: number;
  optionName: string | null;
}

function countFillableTokens(tokens: CoverageToken[]): number {
  return tokens.filter(
    (token) => token.missingRef && token.fillValue !== undefined,
  ).length;
}

function getDimensionFillableOptions(
  dimension: ThemeDimension,
  coverage: CoverageMap,
) {
  return dimension.options
    .map((option) => ({
      optionName: option.name,
      fillableCount: countFillableTokens(
        coverage[dimension.id]?.[option.name]?.uncovered ?? [],
      ),
    }))
    .filter((option) => option.fillableCount > 0);
}

export function getFirstDimensionWithFillableGaps(
  dimensions: ThemeDimension[],
  coverage: CoverageMap,
): ThemeDimension | null {
  return (
    dimensions.find(
      (dimension) => getDimensionFillableOptions(dimension, coverage).length > 0,
    ) ?? null
  );
}

export function resolveThemeAutoFillAction(
  dimension: ThemeDimension | null,
  coverage: CoverageMap,
  focusOptionName?: string | null,
): ThemeAutoFillAction | null {
  if (!dimension) return null;

  const fillableOptions = getDimensionFillableOptions(dimension, coverage);
  if (fillableOptions.length === 0) return null;

  const focusedOption =
    focusOptionName
      ? fillableOptions.find((option) => option.optionName === focusOptionName)
      : null;
  if (focusedOption) {
    return {
      mode: "single-option",
      dimId: dimension.id,
      dimensionName: dimension.name,
      fillableCount: focusedOption.fillableCount,
      optionCount: 1,
      optionName: focusedOption.optionName,
    };
  }

  if (fillableOptions.length === 1) {
    return {
      mode: "single-option",
      dimId: dimension.id,
      dimensionName: dimension.name,
      fillableCount: fillableOptions[0].fillableCount,
      optionCount: 1,
      optionName: fillableOptions[0].optionName,
    };
  }

  return {
    mode: "all-options",
    dimId: dimension.id,
    dimensionName: dimension.name,
    fillableCount: fillableOptions.reduce(
      (sum, option) => sum + option.fillableCount,
      0,
    ),
    optionCount: fillableOptions.length,
    optionName: null,
  };
}
