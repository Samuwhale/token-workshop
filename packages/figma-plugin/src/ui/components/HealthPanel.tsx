import { useState, useEffect } from "react";
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
import type { DeprecatedUsageEntry } from "./health/HealthDeprecatedView";
import { HealthAliasOpportunitiesView } from "./health/HealthAliasOpportunitiesView";
import { HealthDuplicatesView } from "./health/HealthDuplicatesView";

export interface HealthPanelProps {
  serverUrl: string;
  connected: boolean;
  workingCollectionId: string;
  collectionIds: string[];
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
  onRefreshValidation: () => Promise<unknown> | void;
  onPushUndo?: (slot: UndoSlot) => void;
  onError: (msg: string) => void;
  onNavigateToGenerators?: () => void;
  scope: HealthScope;
  onScopeChange: (scope: HealthScope) => void;
  issueActions: UseIssueActionsResult;
}

export function HealthPanel({
  serverUrl,
  connected,
  workingCollectionId,
  collectionIds,
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
  onRefreshValidation,
  onPushUndo,
  onError,
  onNavigateToGenerators,
  scope,
  onScopeChange,
  issueActions,
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
  const [deprecatedUsageReloadKey, setDeprecatedUsageReloadKey] = useState(0);

  const [deprecatedUsageEntries, setDeprecatedUsageEntries] = useState<DeprecatedUsageEntry[]>([]);
  const [deprecatedUsageLoading, setDeprecatedUsageLoading] = useState(false);
  const [deprecatedUsageError, setDeprecatedUsageError] = useState<string | null>(null);
  const validationRefreshKey = validationLastRefreshed?.getTime() ?? 0;

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
    setDeprecatedUsageReloadKey((currentKey) => currentKey + 1);
    await onRefreshValidation();
  };

  useEffect(() => {
    if (!connected || !serverUrl) {
      setDeprecatedUsageEntries([]);
      setDeprecatedUsageError(null);
      setDeprecatedUsageLoading(false);
      return;
    }
    let cancelled = false;
    setDeprecatedUsageLoading(true);
    setDeprecatedUsageError(null);
    apiFetch<{ entries: DeprecatedUsageEntry[] }>(`${serverUrl}/api/tokens/deprecated-usage`)
      .then((data) => {
        if (!cancelled) setDeprecatedUsageEntries(Array.isArray(data.entries) ? data.entries : []);
      })
      .catch((err) => {
        if (!cancelled) {
          setDeprecatedUsageEntries([]);
          setDeprecatedUsageError("Failed to load deprecated usage. Try refreshing.");
        }
        console.warn("[HealthPanel] failed to load deprecated usage:", err);
      })
      .finally(() => { if (!cancelled) setDeprecatedUsageLoading(false); });
    return () => { cancelled = true; };
  }, [connected, serverUrl, deprecatedUsageReloadKey, validationRefreshKey]);

  const getTokenEntry = (path: string, collectionId?: string) =>
    (collectionId ? perCollectionFlat[collectionId]?.[path] : undefined) ??
    allTokensFlat[path];

  const { lintDuplicateGroups, aliasOpportunityGroups, unusedTokens } = useHealthData({
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
    (tokenUsageReady ? unusedCount : 0) +
    deprecatedCount +
    aliasOpportunitiesCount +
    duplicateCount;
  const heatmapSignalsPresent = (heatmapResult?.red ?? 0) > 0;
  const overallStatus: HealthStatus =
    validationError
      ? "critical"
      : healthSignals.byCollection.get(scopedCollectionKey)?.severity === "error"
      ? "critical"
      : healthSignals.byCollection.get(scopedCollectionKey)?.severity === "warning" ||
          healthSignals.byCollection.get(scopedCollectionKey)?.severity === "info" ||
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
      await onRefreshValidation();
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
      view: nextView,
      nonce: Date.now(),
    });
  };

  const goBack = () => {
    onScopeChange({
      ...scope,
      tokenPath: null,
      view: "dashboard",
      nonce: Date.now(),
    });
  };

  const collectionSummaries =
    scope.mode === "all"
      ? [...healthSignals.byCollection.entries()].sort((left, right) => {
          const severityRank = { error: 0, warning: 1, info: 2, null: 3 } as const;
          const leftRank = severityRank[left[1].severity ?? "null"];
          const rightRank = severityRank[right[1].severity ?? "null"];
          if (leftRank !== rightRank) {
            return leftRank - rightRank;
          }
          if (left[1].actionable !== right[1].actionable) {
            return right[1].actionable - left[1].actionable;
          }
          return left[0].localeCompare(right[0]);
        })
      : [];

  let content: JSX.Element;
  if (scope.mode === "all") {
    content = (
      <div
        className="flex h-full flex-col overflow-y-auto px-3 py-3"
        style={{ scrollbarWidth: "thin" }}
      >
        <div className="mb-4">
          <div className="text-body font-semibold text-[var(--color-figma-text)]">
            All collections
          </div>
          <div className="mt-0.5 text-secondary text-[var(--color-figma-text-secondary)]">
            {healthSignals.overall.issueCount} issue
            {healthSignals.overall.issueCount === 1 ? "" : "s"} across{" "}
            {Math.max(collectionSummaries.length, 1)} collection
            {collectionSummaries.length === 1 ? "" : "s"}
          </div>
        </div>

        <div className="mb-4 rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-2">
          <div className="text-secondary text-[var(--color-figma-text-secondary)]">
            Focused fixing stays in one collection. Choose a collection below to review actionable issues in context.
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          {collectionSummaries.map(([collectionId, summary]) => (
            <button
              key={collectionId}
              type="button"
              onClick={() => openCollectionScope(collectionId)}
              className="flex items-center gap-3 rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-2 text-left transition-colors hover:bg-[var(--color-figma-bg-hover)]"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-body font-medium text-[var(--color-figma-text)]">
                  {collectionId}
                </div>
                <div className="mt-0.5 text-secondary text-[var(--color-figma-text-secondary)]">
                  {summary.actionable} actionable · {summary.errors} errors · {summary.warnings} warnings
                </div>
              </div>
              <div className="shrink-0 text-secondary text-[var(--color-figma-text-tertiary)]">
                Review
              </div>
            </button>
          ))}
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
            requestNonce={scope.nonce}
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
            validationIsStale={validationIsStale}
            validationError={validationError}
            issueCount={issueCount}
            issueStatus={issueStatus}
            generatorIssueCount={generatorIssueCount}
            generatorStatus={generatorStatus}
            unusedReady={tokenUsageReady}
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
                nonce: Date.now(),
              })
            }
            onNavigateToGenerators={onNavigateToGenerators}
            scopeLabel={scopedCollectionId ?? undefined}
          />
        );
        break;
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="shrink-0 flex items-center gap-2 border-b border-[var(--color-figma-border)] px-3 py-2">
        <div className="inline-flex rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-0.5">
          {([
            { value: "current", label: "Current collection" },
            { value: "all", label: "All collections" },
          ] as const).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() =>
                onScopeChange({
                  ...scope,
                  mode: option.value,
                  collectionId:
                    option.value === "current"
                      ? (scopedCollectionId ?? validWorkingCollectionId ?? null)
                      : null,
                  view: "dashboard",
                  tokenPath: null,
                  nonce: Date.now(),
                })
              }
              className={`rounded px-2 py-1 text-secondary transition-colors ${
                scope.mode === option.value
                  ? "bg-[var(--color-figma-bg-selected)] text-[var(--color-figma-text)]"
                  : "text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        {scope.mode === "current" ? (
          <select
            value={scopedCollectionId ?? ""}
            onChange={(event) => openCollectionScope(event.target.value, activeView)}
            className="min-w-0 flex-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-body text-[var(--color-figma-text)]"
          >
            {collectionIds.map((collectionId) => (
              <option key={collectionId} value={collectionId}>
                {collectionId}
              </option>
            ))}
          </select>
        ) : (
          <div className="min-w-0 flex-1 text-secondary text-[var(--color-figma-text-secondary)]">
            Library-wide issue review
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {content}
      </div>
    </div>
  );
}
