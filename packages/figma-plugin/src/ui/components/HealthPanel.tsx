import { useState, useEffect } from "react";
import { SlidersHorizontal } from "lucide-react";
import type { UndoSlot } from "../hooks/useUndo";
import type { TokenMapEntry } from "../../shared/types";
import type { HealthSignalsResult, HealthStatus } from "../hooks/useHealthSignals";
import { statusFromIssueSeverities } from "../hooks/useHealthSignals";
import type { ValidationIssue } from "../hooks/useValidationCache";
import type { UseIssueActionsResult } from "../hooks/useIssueActions";
import { createFetchSignal } from "../shared/apiFetch";
import { rollbackOperation } from "../shared/tokenMutations";
import { dispatchToast } from "../shared/toastBus";
import { promoteTokensToSharedAlias } from "../hooks/useExtractToAlias";
import { useHealthData } from "../hooks/useHealthData";
import type { AliasOpportunityGroup } from "../hooks/useHealthData";
import { parseSuppressKey } from "../shared/ruleLabels";
import type { HealthScope, HealthView } from "./health/types";
import { HealthDashboard } from "./health/HealthDashboard";
import { HealthIssuesView } from "./health/HealthIssuesView";
import { HealthHiddenView } from "./health/HealthHiddenView";
import { HealthUnusedView } from "./health/HealthUnusedView";
import { HealthDeprecatedView } from "./health/HealthDeprecatedView";
import { HealthAliasOpportunitiesView } from "./health/HealthAliasOpportunitiesView";
import { HealthDuplicatesView } from "./health/HealthDuplicatesView";
import { HealthRulesView } from "./health/HealthRulesView";
import {
  replaceDeprecatedReferences,
  type DeprecatedReplacementSelection,
  type DeprecatedUsageEntry,
} from "../shared/deprecatedUsage";
import {
  fetchGeneratorStatuses,
  type GeneratorStatusItem,
} from "../shared/generatorStatus";
import { LONG_TEXT_CLASSES } from "../shared/longTextStyles";
import type { CollectionReviewSummary } from "../shared/reviewSummary";
import { isAbortError } from "../shared/utils";
import { SegmentedControl, type SegmentedOption } from "../primitives";

const GENERATOR_ISSUE_SEVERITY_RANK = {
  error: 0,
  warning: 1,
  info: 2,
} as const;
const REVIEW_SCOPE_OPTIONS: SegmentedOption<"current" | "all">[] = [
  { value: "current", label: "Current collection" },
  { value: "all", label: "All collections" },
];

function getHighestPriorityGeneratorIssue(
  issues: ValidationIssue[],
): ValidationIssue | null {
  let highestPriorityIssue: ValidationIssue | null = null;
  for (const issue of issues) {
    if (
      !highestPriorityIssue ||
      GENERATOR_ISSUE_SEVERITY_RANK[issue.severity] <
        GENERATOR_ISSUE_SEVERITY_RANK[highestPriorityIssue.severity]
    ) {
      highestPriorityIssue = issue;
    }
  }
  return highestPriorityIssue;
}

export interface HealthPanelProps {
  serverUrl: string;
  connected: boolean;
  workingCollectionId: string;
  collectionIds: string[];
  collectionDisplayNames?: Record<string, string>;
  healthSignals: HealthSignalsResult;
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToCollectionId: Record<string, string>;
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>;
  tokenUsageCounts: Record<string, number>;
  tokenUsageReady: boolean;
  onNavigateToToken?: (path: string, collectionId: string) => void;
  onViewIssueInGenerator?: (issue: ValidationIssue) => void;
  validationIssues: ValidationIssue[] | null;
  validationLoading: boolean;
  validationError: string | null;
  validationLastRefreshed: Date | null;
  validationIsStale: boolean;
  deprecatedUsageEntries: DeprecatedUsageEntry[];
  deprecatedUsageLoading: boolean;
  deprecatedUsageError: string | null;
  collectionReviewSummaries: Map<string, CollectionReviewSummary>;
  onRefreshReview: () => Promise<unknown> | void;
  onPushUndo?: (slot: UndoSlot) => void;
  onError: (msg: string) => void;
  onNavigateToGenerators?: () => void;
  scope: HealthScope;
  onScopeChange: (scope: HealthScope) => void;
  issueActions: UseIssueActionsResult;
  onSelectIssue?: (issue: ValidationIssue) => void;
}

export function HealthPanel({
  serverUrl,
  connected,
  workingCollectionId,
  collectionIds,
  collectionDisplayNames,
  healthSignals,
  allTokensFlat,
  pathToCollectionId,
  perCollectionFlat,
  tokenUsageCounts,
  tokenUsageReady,
  onNavigateToToken,
  onViewIssueInGenerator,
  validationIssues: validationIssuesProp,
  validationLoading,
  validationError,
  validationLastRefreshed,
  validationIsStale,
  deprecatedUsageEntries,
  deprecatedUsageLoading,
  deprecatedUsageError,
  collectionReviewSummaries,
  onRefreshReview,
  onPushUndo,
  onError,
  onNavigateToGenerators,
  scope,
  onScopeChange,
  issueActions,
  onSelectIssue,
}: HealthPanelProps) {
  const { suppressedKeys, suppressingKey, fixingKeys, applyIssueFix, handleSuppress, handleUnsuppress } = issueActions;
  const activeView = scope.view ?? "dashboard";
  const activeIssueTokenPath = scope.tokenPath;
  const validWorkingCollectionId = collectionIds.includes(workingCollectionId)
    ? workingCollectionId
    : collectionIds[0] ?? null;
  const scopedCollectionId =
    scope.mode === "current"
      ? scope.collectionId && collectionIds.includes(scope.collectionId)
        ? scope.collectionId
        : validWorkingCollectionId
      : null;
  const scopedCollectionKey = scopedCollectionId ?? "";

  const [promotingAliasGroupId, setPromotingAliasGroupId] = useState<string | null>(null);
  const [generatorStatuses, setGeneratorStatuses] = useState<GeneratorStatusItem[]>([]);
  const [generatorStatusError, setGeneratorStatusError] = useState<string | null>(null);

  useEffect(() => {
    if (scope.mode !== "current") {
      return;
    }
    if (scopedCollectionId === scope.collectionId) {
      return;
    }
    onScopeChange({
      ...scope,
      collectionId: scopedCollectionId || null,
      nonce: Date.now(),
    });
  }, [collectionIds, onScopeChange, scope, scopedCollectionId]);

  useEffect(() => {
    if (!connected) {
      setGeneratorStatuses([]);
      setGeneratorStatusError(null);
      return;
    }

    const controller = new AbortController();

    fetchGeneratorStatuses(serverUrl, {
      signal: createFetchSignal(controller.signal, 8000),
    })
      .then((statuses) => {
        if (controller.signal.aborted) {
          return;
        }
        setGeneratorStatuses(statuses);
        setGeneratorStatusError(null);
      })
      .catch((error) => {
        if (controller.signal.aborted || isAbortError(error)) {
          return;
        }
        setGeneratorStatuses([]);
        setGeneratorStatusError(error instanceof Error ? error.message : String(error));
      });

    return () => {
      controller.abort();
    };
  }, [connected, serverUrl, validationLastRefreshed]);

  const refreshHealthState = async () => {
    await onRefreshReview();
  };

  const getTokenEntry = (path: string, collectionId?: string) =>
    (collectionId ? perCollectionFlat[collectionId]?.[path] : undefined) ??
    allTokensFlat[path];

  const {
    lintDuplicateGroups,
    aliasOpportunityGroups,
    unusedTokens,
  } = useHealthData({
    allTokensFlat,
    perCollectionFlat,
    tokenUsageCounts,
    tokenUsageReady,
    validationIssues: validationIssuesProp,
    currentCollectionId: scopedCollectionKey,
  });

  const totalDuplicateAliases = lintDuplicateGroups.reduce((sum, g) => sum + g.tokens.length - 1, 0);

  const tokenLevelSignals = healthSignals.signals.filter(
    (s) =>
      scopedCollectionKey.length > 0 &&
      s.collectionId === scopedCollectionKey &&
      s.rule !== "no-duplicate-values" &&
      s.rule !== "alias-opportunity",
  );
  const allGeneratorIssues: ValidationIssue[] = generatorStatuses.flatMap((item) => {
      const diagnostics = item.preview.diagnostics.map<ValidationIssue>((diagnostic) => ({
        rule: "generator-diagnostic",
        path: item.generator.name,
        collectionId: item.generator.targetCollectionId,
        severity: diagnostic.severity,
        message: diagnostic.message,
        generatorId: item.generator.id,
        generatorDiagnosticId: diagnostic.id,
        generatorNodeId: diagnostic.nodeId,
        generatorEdgeId: diagnostic.edgeId,
      }));
      if (item.stale || item.unapplied) {
        diagnostics.unshift({
          rule: "generator-diagnostic",
          path: item.generator.name,
          collectionId: item.generator.targetCollectionId,
          severity: item.blocking ? "error" : "warning",
          message: item.stale
            ? "Generator outputs are stale. Preview and apply the generator before publishing."
            : "Generator outputs have not been applied yet.",
          generatorId: item.generator.id,
          generatorDiagnosticId: item.stale ? `${item.generator.id}-stale` : `${item.generator.id}-unapplied`,
        });
      }
      if (item.preview.outputs.some((output) => output.collision)) {
        diagnostics.unshift({
          rule: "generator-diagnostic",
          path: item.generator.name,
          collectionId: item.generator.targetCollectionId,
          severity: "error",
          message: "A generated output collides with a manually edited token. Open the generator to resolve or detach the token.",
          generatorId: item.generator.id,
          generatorDiagnosticId: `${item.generator.id}-collision`,
        });
      }
      return diagnostics;
    });
  const generatorIssues: ValidationIssue[] =
    scope.mode === "current"
      ? allGeneratorIssues.filter(
          (issue) => issue.collectionId === scopedCollectionKey,
        )
      : allGeneratorIssues;

  const deprecatedUsageEntriesForCurrent = deprecatedUsageEntries.filter(
    (e) => e.collectionId === scopedCollectionKey,
  );
  const scopedTokenCount =
    scope.mode === "current"
      ? scopedCollectionId
        ? Object.keys(perCollectionFlat[scopedCollectionId] ?? {}).length
        : 0
      : collectionIds.reduce(
          (count, collectionId) =>
            count + Object.keys(perCollectionFlat[collectionId] ?? {}).length,
          0,
        );
  // Usage scan feeds the "unused tokens" category. If the scope has zero tokens
  // there is nothing to scan, so treat it as ready to avoid spinning forever.
  const unusedDataReady = tokenUsageReady || scopedTokenCount === 0;
  const issueCount = tokenLevelSignals.length;
  const issueStatus = statusFromIssueSeverities(
    tokenLevelSignals.map((signal) => signal.severity),
  );
  const generatorIssueCount = generatorIssues.length;
  const generatorStatus = statusFromIssueSeverities(
    generatorIssues.map((issue) => issue.severity),
  );
  const highestPriorityGeneratorIssue =
    getHighestPriorityGeneratorIssue(generatorIssues);
  const unusedCount = unusedTokens.length;
  const deprecatedCount = deprecatedUsageEntriesForCurrent.length;
  const aliasOpportunitiesCount = aliasOpportunityGroups.length;
  const duplicateCount = totalDuplicateAliases;

  const suppressedKeysForCurrent = new Set<string>(
    [...suppressedKeys].filter((key) => {
      return parseSuppressKey(key)?.collectionId === scopedCollectionKey;
    }),
  );

  const unifiedIssuesForView: ValidationIssue[] = [
    ...tokenLevelSignals.map((s) => ({
      rule: s.rule,
      path: s.path,
      collectionId: s.collectionId,
      severity: s.severity,
      message: s.message,
      suggestedFix: s.suggestedFix,
      suggestion: s.suggestion,
      group: s.group,
    })),
    ...generatorIssues,
  ];

  const totalIssueCount =
    issueCount +
    generatorIssueCount +
    (unusedDataReady ? unusedCount : 0) +
    deprecatedCount +
    aliasOpportunitiesCount +
    duplicateCount;
  const currentReviewSummary = scopedCollectionKey
    ? collectionReviewSummaries.get(scopedCollectionKey)
    : undefined;
  const reviewError = validationError ?? generatorStatusError;
  const overallStatus: HealthStatus =
    reviewError
      ? "critical"
      : currentReviewSummary?.severity === "critical"
      ? "critical"
      : currentReviewSummary?.severity === "warning" ||
          validationIsStale ||
          !unusedDataReady ||
          duplicateCount > 0 ||
          deprecatedCount > 0 ||
          aliasOpportunitiesCount > 0 ||
          generatorIssues.length > 0 ||
          (tokenUsageReady && unusedCount > 0)
        ? "warning"
        : "healthy";
  const scopedCollectionLabel =
    collectionDisplayNames?.[scopedCollectionKey] ||
    scopedCollectionKey ||
    "the current collection";
  const scopeLabel =
    scope.mode === "all"
      ? "Reviewing every collection in the library."
      : `Reviewing ${scopedCollectionLabel}.`;

  const handlePromote = async (group: AliasOpportunityGroup) => {
    const sampleToken = group.tokens[0];
    const sampleEntry = sampleToken
      ? getTokenEntry(sampleToken.path, sampleToken.collectionId)
      : undefined;
    if (!sampleEntry) { onError("Alias promotion failed — source tokens unavailable."); return; }
    setPromotingAliasGroupId(group.id);
    try {
      await promoteTokensToSharedAlias({
        serverUrl,
        primitivePath: group.suggestedPrimitivePath,
        primitiveCollectionId: group.suggestedPrimitiveCollectionId,
        sourceTokens: group.tokens,
        tokenType: sampleEntry.$type,
        tokenValue: sampleEntry.$value,
      });
      await onRefreshReview();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Alias promotion failed — try refreshing.");
    } finally {
      setPromotingAliasGroupId(null);
    }
  };

  const handleReplaceDeprecated = async (
    entry: DeprecatedUsageEntry,
    replacement: DeprecatedReplacementSelection,
  ) => {
    try {
      const result = await replaceDeprecatedReferences({
        serverUrl,
        deprecatedPath: entry.deprecatedPath,
        collectionId: entry.collectionId,
        replacement,
      });
      if (onPushUndo && result.operationId && result.updated > 0) {
        const opId = result.operationId;
        onPushUndo({
          description: `Replace ${result.updated} deprecated reference${result.updated === 1 ? "" : "s"}`,
          restore: async () => {
            await rollbackOperation(serverUrl, opId);
            await refreshHealthState();
          },
        });
      }
      await refreshHealthState();
      dispatchToast(
        `Replaced ${result.updated} reference${result.updated !== 1 ? "s" : ""}`,
        "success",
        { destination: { kind: "workspace", topTab: "library", subTab: "health" } },
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to replace deprecated references.");
    }
  };

  const openCollectionScope = (collectionId: string, nextView: HealthView = "dashboard") => {
    onScopeChange({
      ...scope,
      mode: "current",
      collectionId,
      tokenPath: null,
      issueKey: null,
      view: nextView,
      nonce: Date.now(),
    });
  };

  const goBack = () => {
    onScopeChange({
      ...scope,
      tokenPath: null,
      issueKey: null,
      view: "dashboard",
      nonce: Date.now(),
    });
  };

  const openRulesView = () => {
    onScopeChange({
      ...scope,
      tokenPath: null,
      issueKey: null,
      view: "rules",
      nonce: Date.now(),
    });
  };

  const collectionSummaries =
    scope.mode === "all"
      ? collectionIds
          .map((collectionId) => {
            const summary = collectionReviewSummaries.get(collectionId);

            const generatorIssueSummary = allGeneratorIssues.reduce(
              (acc, issue) => {
                if (issue.collectionId !== collectionId) {
                  return acc;
                }
                if (issue.severity === "error") {
                  acc.errors += 1;
                  acc.actionable += 1;
                } else if (issue.severity === "warning") {
                  acc.warnings += 1;
                  acc.actionable += 1;
                } else {
                  acc.info += 1;
                }
                acc.reviewItems += 1;
                return acc;
              },
              { errors: 0, warnings: 0, info: 0, actionable: 0, reviewItems: 0 },
            );
            const errors = (summary?.errors ?? 0) + generatorIssueSummary.errors;
            const warnings =
              (summary?.warnings ?? 0) + generatorIssueSummary.warnings;
            const info = (summary?.info ?? 0) + generatorIssueSummary.info;
            const actionable =
              (summary?.actionable ?? 0) + generatorIssueSummary.actionable;
            const reviewItems =
              (summary?.reviewItems ?? 0) + generatorIssueSummary.reviewItems;

            return [
              collectionId,
              {
                errors,
                warnings,
                info,
                actionable,
                reviewItems,
                severity: statusFromIssueSeverities([
                  ...Array.from({ length: errors }, () => "error" as const),
                  ...Array.from({ length: warnings }, () => "warning" as const),
                  ...Array.from({ length: info }, () => "info" as const),
                ]),
              },
            ] as const;
          })
          .filter(([, summary]) => summary.reviewItems > 0)
          .sort((left, right) => {
            const severityRank = { critical: 0, warning: 1, healthy: 2 } as const;
            const leftRank = severityRank[left[1].severity];
            const rightRank = severityRank[right[1].severity];
            if (leftRank !== rightRank) {
              return leftRank - rightRank;
            }
            if (left[1].actionable !== right[1].actionable) {
              return right[1].actionable - left[1].actionable;
            }
            if (left[1].reviewItems !== right[1].reviewItems) {
              return right[1].reviewItems - left[1].reviewItems;
            }
            return left[0].localeCompare(right[0]);
          })
      : [];
  const collectionSummariesPending =
    scope.mode === "all" &&
    (validationLoading || deprecatedUsageLoading || !unusedDataReady);
  const libraryReviewErrors = [validationError, deprecatedUsageError, generatorStatusError].filter(
    (message): message is string => Boolean(message),
  );
  const clearCollectionCount =
    scope.mode === "all" &&
    !collectionSummariesPending &&
    libraryReviewErrors.length === 0
      ? Math.max(collectionIds.length - collectionSummaries.length, 0)
      : 0;

  let content: JSX.Element;
  if (activeView === "rules") {
    content = (
      <HealthRulesView
        serverUrl={serverUrl}
        connected={connected}
        onRulesChanged={refreshHealthState}
        onBack={goBack}
      />
    );
  } else if (scope.mode === "all") {
    const fixNextCollections = collectionSummaries.filter(
      ([, summary]) => summary.errors > 0 || summary.actionable > 0,
    );
    const cleanupCollections = collectionSummaries.filter(
      ([, summary]) => summary.actionable === 0 && summary.reviewItems > 0,
    );
    const allScopeStatusTitle =
      libraryReviewErrors.length > 0
        ? "Review could not finish"
        : collectionSummariesPending
          ? "Checking library"
          : collectionSummaries.length > 0
            ? "Review items found"
            : "Review is clear";
    const allScopeStatusDetail =
      libraryReviewErrors.length > 0
        ? "Some checks failed. Refresh Review once the server is connected."
        : collectionSummariesPending
          ? "Scanning collections, token usage, and generator outputs."
          : collectionSummaries.length > 0
            ? `${collectionSummaries.length} collection${collectionSummaries.length === 1 ? "" : "s"} have review items. Resolve blockers first; cleanup can wait.`
            : "Every collection is clear.";
    const renderCollectionRow = (
      collectionId: string,
      summary: { errors: number; warnings: number; actionable: number; reviewItems: number; info: number },
      kind: "fix" | "cleanup",
    ) => {
      const meta =
        kind === "fix"
          ? `${summary.errors} error${summary.errors === 1 ? "" : "s"}, ${summary.warnings} warning${summary.warnings === 1 ? "" : "s"}`
          : `${summary.reviewItems} item${summary.reviewItems === 1 ? "" : "s"}`;
      return (
        <button
          key={collectionId}
          type="button"
          onClick={() => openCollectionScope(collectionId)}
          className="flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left transition-colors hover:bg-[var(--color-figma-bg-hover)]"
        >
          <span className="min-w-0 flex-1">
            <span className={`block text-body font-medium ${LONG_TEXT_CLASSES.textPrimary}`}>
              {collectionDisplayNames?.[collectionId] ?? collectionId}
            </span>
            <span className={`block text-secondary ${LONG_TEXT_CLASSES.textTertiary}`}>
              {meta}
            </span>
          </span>
          <span className="shrink-0 text-secondary font-medium text-[color:var(--color-figma-text-secondary)]">
            Review
          </span>
        </button>
      );
    };

    content = (
      <div
        className="flex h-full flex-col overflow-y-auto px-2.5 py-2.5"
        style={{ scrollbarWidth: "thin" }}
      >
        <div className="mb-3">
          <h2 className="text-body font-semibold text-[color:var(--color-figma-text)]">
            {allScopeStatusTitle}
          </h2>
          <p className="mt-0.5 text-secondary text-[color:var(--color-figma-text-secondary)]">
            {allScopeStatusDetail}
          </p>
          {clearCollectionCount > 0 ? (
            <p className="mt-1 text-secondary text-[color:var(--color-figma-text-tertiary)]">
              {clearCollectionCount} collection{clearCollectionCount === 1 ? "" : "s"} clear.
            </p>
          ) : null}
        </div>

        {libraryReviewErrors.length > 0 ? (
          <div className="mb-4 flex flex-col gap-2 rounded bg-[var(--color-figma-error)]/8 px-2.5 py-2 text-secondary text-[color:var(--color-figma-text-error)]">
            <div>
              Some review checks failed. {libraryReviewErrors.join(" ")}
            </div>
            <button
              type="button"
              onClick={() => void refreshHealthState()}
              disabled={validationLoading || deprecatedUsageLoading}
              className="self-start rounded bg-[var(--color-figma-bg)] px-2 py-1 font-medium text-[color:var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-50"
            >
              {validationLoading || deprecatedUsageLoading
                ? "Refreshing..."
                : "Refresh Review"}
            </button>
          </div>
        ) : null}

        {collectionSummaries.length > 0 ? (
          <div className="flex flex-col gap-3">
            {fixNextCollections.length > 0 ? (
              <section>
                <div className="mb-1.5 px-1">
                  <h3 className="text-body font-semibold text-[color:var(--color-figma-text)]">
                    Fix next
                  </h3>
                  <p className="mt-0.5 text-secondary text-[color:var(--color-figma-text-secondary)]">
                    Collections with errors or actionable warnings.
                  </p>
                </div>
                <div>
                  {fixNextCollections.map(([collectionId, summary]) =>
                    renderCollectionRow(collectionId, summary, "fix"),
                  )}
                </div>
              </section>
            ) : null}

            {cleanupCollections.length > 0 ? (
              <section>
                <div className="mb-1.5 px-1">
                  <h3 className="text-body font-semibold text-[color:var(--color-figma-text)]">
                    Clean up
                  </h3>
                  <p className="mt-0.5 text-secondary text-[color:var(--color-figma-text-secondary)]">
                    Library hygiene after blockers are clear.
                  </p>
                </div>
                <div>
                  {cleanupCollections.map(([collectionId, summary]) =>
                    renderCollectionRow(collectionId, summary, "cleanup"),
                  )}
                </div>
              </section>
            ) : null}
          </div>
        ) : (
          <p className="text-body text-[color:var(--color-figma-text-secondary)]">
            {collectionSummariesPending
              ? "Checking…"
              : libraryReviewErrors.length > 0
                ? "Review results are unavailable. Try again once connected."
                : "All clear."}
          </p>
        )}

        <div className="mt-auto pt-4">
          <button
            type="button"
            onClick={openRulesView}
            className="flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left transition-colors hover:bg-[var(--color-figma-bg-hover)]"
          >
            <span className="shrink-0 text-[color:var(--color-figma-text-tertiary)]">
              <SlidersHorizontal size={14} strokeWidth={2.25} aria-hidden />
            </span>
            <span className="min-w-0 flex-1 truncate text-body text-[color:var(--color-figma-text)]">
              Review settings
            </span>
          </button>
        </div>
      </div>
    );
  } else {
    switch (activeView) {
      case "issues":
        content = (
          <HealthIssuesView
            validationIssues={unifiedIssuesForView}
            validationLastRefreshed={validationLastRefreshed}
            collectionDisplayNames={collectionDisplayNames}
            suppressedKeys={suppressedKeysForCurrent}
            fixingKeys={fixingKeys}
            onFix={applyIssueFix}
            onIgnore={handleSuppress}
            onNavigateToToken={onNavigateToToken}
            onViewIssueInGenerator={onViewIssueInGenerator}
            initialTokenPath={activeIssueTokenPath}
            selectedIssueKey={scope.issueKey ?? null}
            selectedTokenPath={activeIssueTokenPath}
            requestNonce={scope.nonce}
            onSelectIssue={onSelectIssue}
            onBack={goBack}
          />
        );
        break;

      case "hidden":
        content = (
          <HealthHiddenView
            suppressedKeys={suppressedKeysForCurrent}
            suppressingKey={suppressingKey}
            onUnsuppress={handleUnsuppress}
            onBack={goBack}
          />
        );
        break;

      case "unused":
        content = (
          <HealthUnusedView
            serverUrl={serverUrl}
            loading={!tokenUsageReady}
            unusedTokens={unusedTokens}
            onNavigateToToken={onNavigateToToken}
            onError={onError}
            onMutate={refreshHealthState}
            collectionDisplayNames={collectionDisplayNames}
            onBack={goBack}
          />
        );
        break;

      case "deprecated":
        content = (
          <HealthDeprecatedView
            entries={deprecatedUsageEntriesForCurrent}
            loading={deprecatedUsageLoading}
            error={deprecatedUsageError}
            allTokensFlat={allTokensFlat}
            pathToCollectionId={pathToCollectionId}
            onReplace={handleReplaceDeprecated}
            onBack={goBack}
          />
        );
        break;

      case "alias-opportunities":
        content = (
          <HealthAliasOpportunitiesView
            aliasOpportunityGroups={aliasOpportunityGroups}
            promotingGroupId={promotingAliasGroupId}
            onPromote={handlePromote}
            onBack={goBack}
          />
        );
        break;

      case "duplicates":
        content = (
          <HealthDuplicatesView
            serverUrl={serverUrl}
            lintDuplicateGroups={lintDuplicateGroups}
            totalDuplicateAliases={totalDuplicateAliases}
            onNavigateToToken={onNavigateToToken}
            onError={onError}
            onMutate={refreshHealthState}
            collectionDisplayNames={collectionDisplayNames}
            onBack={goBack}
          />
        );
        break;

      default:
        content = (
          <HealthDashboard
            connected={connected}
            scopeLabel={scopeLabel}
            overallStatus={overallStatus}
            totalIssueCount={totalIssueCount}
            validationLoading={validationLoading}
            validationLastRefreshed={validationLastRefreshed}
            validationError={reviewError}
            issueCount={issueCount}
            issueStatus={issueStatus}
            generatorIssueCount={generatorIssueCount}
            generatorStatus={generatorStatus}
            unusedReady={unusedDataReady}
            unusedCount={unusedCount}
            deprecatedCount={deprecatedCount}
            aliasOpportunitiesCount={aliasOpportunitiesCount}
            duplicateCount={duplicateCount}
            hiddenCount={suppressedKeysForCurrent.size}
            highestPriorityGeneratorIssue={highestPriorityGeneratorIssue}
            onNavigateToView={(view) =>
              onScopeChange({
                ...scope,
                view,
                tokenPath: null,
                issueKey: null,
                nonce: Date.now(),
              })
            }
            onNavigateToGenerators={onNavigateToGenerators}
            onViewGeneratorIssue={onViewIssueInGenerator}
          />
        );
        break;
    }
  }

  const scopeControl =
    activeView !== "rules" && collectionIds.length > 1 ? (
      <div className="shrink-0 border-b border-[var(--color-figma-border)] px-2.5 py-1.5">
        <SegmentedControl
          value={scope.mode}
          options={REVIEW_SCOPE_OPTIONS}
          ariaLabel="Review scope"
          allowWrap
          size="compact"
          onChange={(mode) =>
            onScopeChange({
              ...scope,
              mode,
              collectionId:
                mode === "current"
                  ? scopedCollectionId || validWorkingCollectionId
                  : null,
              tokenPath: null,
              issueKey: null,
              nonce: Date.now(),
            })
          }
        />
      </div>
    ) : null;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {scopeControl}
      <div className="min-h-0 flex-1 overflow-hidden">{content}</div>
    </div>
  );
}
