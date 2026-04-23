import type { HealthSignalsResult, HealthStatus } from "../hooks/useHealthSignals";

const CATEGORY_ONLY_RULES = new Set(["no-duplicate-values", "alias-opportunity"]);

export interface CollectionReviewSummary {
  errors: number;
  warnings: number;
  info: number;
  actionable: number;
  reviewItems: number;
  severity: HealthStatus;
}

export interface ReviewSummaryTotals {
  actionable: number;
  reviewItems: number;
  status: HealthStatus;
}

export interface LibraryReviewSummary {
  byCollection: Map<string, CollectionReviewSummary>;
  totals: ReviewSummaryTotals;
}

interface BuildLibraryReviewSummaryParams {
  collectionIds: string[];
  healthSignals: HealthSignalsResult;
  duplicateAliasCountsByCollection: Record<string, number>;
  aliasOpportunityCountsByCollection: Record<string, number>;
  deprecatedUsageCountsByCollection: Map<string, number>;
  unusedTokenCountsByCollection: Record<string, number>;
}

function createEmptySummary(): CollectionReviewSummary {
  return {
    errors: 0,
    warnings: 0,
    info: 0,
    actionable: 0,
    reviewItems: 0,
    severity: "healthy",
  };
}

export function buildLibraryReviewSummary({
  collectionIds,
  healthSignals,
  duplicateAliasCountsByCollection,
  aliasOpportunityCountsByCollection,
  deprecatedUsageCountsByCollection,
  unusedTokenCountsByCollection,
}: BuildLibraryReviewSummaryParams): LibraryReviewSummary {
  const validCollectionIds = new Set(collectionIds);
  const byCollection = new Map<string, CollectionReviewSummary>(
    collectionIds.map((collectionId) => [collectionId, createEmptySummary()]),
  );

  for (const signal of healthSignals.signals) {
    if (
      CATEGORY_ONLY_RULES.has(signal.rule) ||
      !validCollectionIds.has(signal.collectionId)
    ) {
      continue;
    }

    const summary = byCollection.get(signal.collectionId);
    if (!summary) {
      continue;
    }
    if (signal.severity === "error") {
      summary.errors += 1;
      summary.actionable += 1;
      continue;
    }

    if (signal.severity === "warning") {
      summary.warnings += 1;
      summary.actionable += 1;
      continue;
    }

    summary.info += 1;
  }

  for (const [collectionId, summary] of byCollection.entries()) {
    const cleanupWarningCount =
      (duplicateAliasCountsByCollection[collectionId] ?? 0) +
      (aliasOpportunityCountsByCollection[collectionId] ?? 0) +
      (deprecatedUsageCountsByCollection.get(collectionId) ?? 0) +
      (unusedTokenCountsByCollection[collectionId] ?? 0);

    summary.warnings += cleanupWarningCount;
    summary.actionable += cleanupWarningCount;
    summary.reviewItems = summary.errors + summary.warnings + summary.info;
    summary.severity =
      summary.errors > 0
        ? "critical"
        : summary.warnings > 0 || summary.info > 0
          ? "warning"
          : "healthy";
  }

  const totals = [...byCollection.values()].reduce<ReviewSummaryTotals>(
    (acc, summary) => {
      acc.actionable += summary.actionable;
      acc.reviewItems += summary.reviewItems;
      if (summary.severity === "critical") {
        acc.status = "critical";
      } else if (summary.severity === "warning" && acc.status !== "critical") {
        acc.status = "warning";
      }
      return acc;
    },
    { actionable: 0, reviewItems: 0, status: "healthy" },
  );

  return {
    byCollection,
    totals,
  };
}
