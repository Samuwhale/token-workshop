import { useState, useEffect } from "react";
import { SlidersHorizontal } from "lucide-react";
import type { UndoSlot } from "../hooks/useUndo";
import type { HeatmapResult } from "./HeatmapPanel";
import type { TokenMapEntry } from "../../shared/types";
import type { HealthSignalsResult, HealthStatus } from "../hooks/useHealthSignals";
import { statusFromIssueSeverities } from "../hooks/useHealthSignals";
import type { ValidationIssue } from "../hooks/useValidationCache";
import type { UseIssueActionsResult } from "../hooks/useIssueActions";
import { apiFetch } from "../shared/apiFetch";
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
import type { DeprecatedUsageEntry } from "../shared/deprecatedUsage";
import type { CollectionReviewSummary } from "../shared/reviewSummary";

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
  heatmapResult: HeatmapResult | null;
  onNavigateToToken?: (path: string, collectionId: string) => void;
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
  heatmapResult,
  onNavigateToToken,
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
    pathToCollectionId,
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
      s.source !== "generator" &&
      s.rule !== "no-duplicate-values" &&
      s.rule !== "alias-opportunity",
  );
  const generatorSignals = healthSignals.signals.filter(
    (s) => s.collectionId === scopedCollectionKey && s.source === "generator",
  );

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
  const generatorIssueCount = generatorSignals.length;
  const generatorStatus = statusFromIssueSeverities(
    generatorSignals.map((signal) => signal.severity),
  );
  const unusedCount = unusedTokens.length;
  const deprecatedCount = deprecatedUsageEntriesForCurrent.length;
  const aliasOpportunitiesCount = aliasOpportunityGroups.length;
  const duplicateCount = totalDuplicateAliases;

  const suppressedKeysForCurrent = new Set<string>(
    [...suppressedKeys].filter((key) => {
      return parseSuppressKey(key)?.collectionId === scopedCollectionKey;
    }),
  );

  const unifiedIssuesForView: ValidationIssue[] = tokenLevelSignals.map((s) => ({
    rule: s.rule,
    path: s.path,
    collectionId: s.collectionId,
    severity: s.severity,
    message: s.message,
    suggestedFix: s.suggestedFix,
    suggestion: s.suggestion,
    group: s.group,
  }));

  const totalIssueCount =
    issueCount +
    generatorIssueCount +
    (unusedDataReady ? unusedCount : 0) +
    deprecatedCount +
    aliasOpportunitiesCount +
    duplicateCount;
  const heatmapSignalsPresent = (heatmapResult?.red ?? 0) > 0;
  const currentReviewSummary = scopedCollectionKey
    ? collectionReviewSummaries.get(scopedCollectionKey)
    : undefined;
  const overallStatus: HealthStatus =
    validationError
      ? "critical"
      : currentReviewSummary?.severity === "critical"
      ? "critical"
      : currentReviewSummary?.severity === "warning" ||
          validationIsStale ||
          duplicateCount > 0 ||
          deprecatedCount > 0 ||
          aliasOpportunitiesCount > 0 ||
          (tokenUsageReady && unusedCount > 0) ||
          heatmapSignalsPresent
        ? "warning"
        : "healthy";

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

  const handleReplaceDeprecated = async (entry: DeprecatedUsageEntry, replacementPath: string) => {
    try {
      const result = await apiFetch<{ ok: true; updated: number; operationId?: string }>(
        `${serverUrl}/api/tokens/deprecated-usage/replace`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            collectionId: entry.collectionId,
            deprecatedPath: entry.deprecatedPath,
            replacementPath,
          }),
        },
      );
      if (onPushUndo && result.operationId && result.updated > 0) {
        const opId = result.operationId;
        onPushUndo({
          description: `Replace ${result.updated} deprecated reference${result.updated === 1 ? "" : "s"}`,
          restore: async () => {
            await apiFetch(`${serverUrl}/api/operations/${encodeURIComponent(opId)}/rollback`, { method: "POST" });
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

            return [
              collectionId,
              {
                errors: summary?.errors ?? 0,
                warnings: summary?.warnings ?? 0,
                info: summary?.info ?? 0,
                actionable: summary?.actionable ?? 0,
                reviewItems: summary?.reviewItems ?? 0,
                severity: summary?.severity ?? "healthy",
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
  const libraryReviewErrors = [validationError, deprecatedUsageError].filter(
    (message): message is string => Boolean(message),
  );

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
      ([, summary]) => summary.errors === 0 && summary.reviewItems > 0,
    );
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
          <span className="min-w-0 flex-1 truncate text-body text-[var(--color-figma-text)]">
            {collectionDisplayNames?.[collectionId] ?? collectionId}
          </span>
          <span className="shrink-0 text-secondary text-[var(--color-figma-text-tertiary)]">
            {meta}
          </span>
        </button>
      );
    };

    content = (
      <div
        className="flex h-full flex-col overflow-y-auto px-4 py-4"
        style={{ scrollbarWidth: "thin" }}
      >
        {libraryReviewErrors.length > 0 ? (
          <div className="mb-4 text-secondary text-[var(--color-figma-error)]">
            Some review checks failed. {libraryReviewErrors.join(" ")}
          </div>
        ) : null}

        {collectionSummaries.length > 0 ? (
          <div className="flex flex-col gap-4">
            <section>
              <h3 className="px-1 pb-1.5 text-secondary font-medium text-[var(--color-figma-text-secondary)]">
                Fix next
              </h3>
              <div>
                {(fixNextCollections.length > 0
                  ? fixNextCollections
                  : collectionSummaries.slice(0, 3)
                ).map(([collectionId, summary]) =>
                  renderCollectionRow(collectionId, summary, "fix"),
                )}
              </div>
            </section>

            {cleanupCollections.length > 0 ? (
              <section>
                <h3 className="px-1 pb-1.5 text-secondary font-medium text-[var(--color-figma-text-secondary)]">
                  Clean up
                </h3>
                <div>
                  {cleanupCollections.map(([collectionId, summary]) =>
                    renderCollectionRow(collectionId, summary, "cleanup"),
                  )}
                </div>
              </section>
            ) : null}
          </div>
        ) : (
          <p className="text-body text-[var(--color-figma-text-secondary)]">
            {collectionSummariesPending
              ? "Checking…"
              : libraryReviewErrors.length > 0
                ? "Review results are unavailable. Try again once connected."
                : "All clear."}
          </p>
        )}

        <div className="mt-auto pt-6">
          <button
            type="button"
            onClick={openRulesView}
            className="flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left transition-colors hover:bg-[var(--color-figma-bg-hover)]"
          >
            <span className="shrink-0 text-[var(--color-figma-text-tertiary)]">
              <SlidersHorizontal size={14} strokeWidth={2.25} aria-hidden />
            </span>
            <span className="min-w-0 flex-1 truncate text-body text-[var(--color-figma-text)]">
              Rules
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
            suppressedKeys={suppressedKeysForCurrent}
            fixingKeys={fixingKeys}
            onFix={applyIssueFix}
            onIgnore={handleSuppress}
            onNavigateToToken={onNavigateToToken}
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
            onBack={goBack}
          />
        );
        break;

      default:
        content = (
          <HealthDashboard
            connected={connected}
            overallStatus={overallStatus}
            totalIssueCount={totalIssueCount}
            validationLoading={validationLoading}
            validationLastRefreshed={validationLastRefreshed}
            validationError={validationError}
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
          />
        );
        break;
    }
  }

  return <div className="h-full min-h-0 overflow-hidden">{content}</div>;
}
