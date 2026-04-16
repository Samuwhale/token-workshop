import type { CollectionDefinition } from "@tokenmanager/core";

export interface ModeCoverageDimensionSummary {
  id: string;
  name: string;
  options: CollectionDefinition["options"];
  optionCount: number;
  filledCount: number;
  missingCount: number;
}

export interface ModeCoverageSummary {
  dimensionCount: number;
  configuredDimensionCount: number;
  unconfiguredDimensionCount: number;
  optionCount: number;
  filledCount: number;
  missingCount: number;
  dimensions: ModeCoverageDimensionSummary[];
}

function hasModeValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

export function summarizeModeCoverage(
  dimensions: CollectionDefinition[],
  modeValues: Record<string, Record<string, unknown>>,
): ModeCoverageSummary {
  const dimensionsSummary: ModeCoverageDimensionSummary[] = dimensions.map(
    (dimension) => {
      const optionCount = dimension.options.length;
      const filledCount = Object.entries(modeValues[dimension.id] ?? {}).filter(
        ([optionName, value]) =>
          dimension.options.some((option) => option.name === optionName) &&
          hasModeValue(value),
      ).length;

      return {
        id: dimension.id,
        name: dimension.name,
        options: dimension.options,
        optionCount,
        filledCount,
        missingCount: Math.max(0, optionCount - filledCount),
      };
    },
  );

  const optionCount = dimensionsSummary.reduce(
    (sum, dimension) => sum + dimension.optionCount,
    0,
  );
  const filledCount = dimensionsSummary.reduce(
    (sum, dimension) => sum + dimension.filledCount,
    0,
  );
  const configuredDimensionCount = dimensionsSummary.filter(
    (dimension) => dimension.optionCount > 0,
  ).length;

  return {
    dimensionCount: dimensions.length,
    configuredDimensionCount,
    unconfiguredDimensionCount: dimensions.length - configuredDimensionCount,
    optionCount,
    filledCount,
    missingCount: Math.max(0, optionCount - filledCount),
    dimensions: dimensionsSummary,
  };
}
