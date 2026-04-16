import type { TokenCollection } from "@tokenmanager/core";

export interface ModeCoverageCollectionSummary {
  id: string;
  name: string;
  options: TokenCollection["modes"];
  optionCount: number;
  filledCount: number;
  missingCount: number;
}

export interface ModeCoverageSummary {
  collectionCount: number;
  configuredCollectionCount: number;
  unconfiguredCollectionCount: number;
  optionCount: number;
  filledCount: number;
  missingCount: number;
  collections: ModeCoverageCollectionSummary[];
}

function hasModeValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

export function summarizeModeCoverage(
  collections: TokenCollection[],
  modeValues: Record<string, Record<string, unknown>>,
): ModeCoverageSummary {
  const collectionsSummary: ModeCoverageCollectionSummary[] = collections.map(
    (collection) => {
      const optionCount = collection.modes.length;
      const filledCount = Object.entries(modeValues[collection.id] ?? {}).filter(
        ([optionName, value]) =>
          collection.modes.some((option) => option.name === optionName) &&
          hasModeValue(value),
      ).length;

      return {
        id: collection.id,
        name: collection.name,
        options: collection.modes,
        optionCount,
        filledCount,
        missingCount: Math.max(0, optionCount - filledCount),
      };
    },
  );

  const optionCount = collectionsSummary.reduce(
    (sum, collection) => sum + collection.optionCount,
    0,
  );
  const filledCount = collectionsSummary.reduce(
    (sum, collection) => sum + collection.filledCount,
    0,
  );
  const configuredCollectionCount = collectionsSummary.filter(
    (collection) => collection.optionCount > 0,
  ).length;

  return {
    collectionCount: collections.length,
    configuredCollectionCount,
    unconfiguredCollectionCount: collections.length - configuredCollectionCount,
    optionCount,
    filledCount,
    missingCount: Math.max(0, optionCount - filledCount),
    collections: collectionsSummary,
  };
}
