import { useState, useEffect } from "react";
import type { UndoSlot } from "../hooks/useUndo";
import type { HeatmapResult } from "./HeatmapPanel";
import type { TokenMapEntry } from "../../shared/types";
import type { HealthSignalsResult } from "../hooks/useHealthSignals";
import type { ValidationIssue } from "../hooks/useValidationCache";
import type { UseIssueActionsResult } from "../hooks/useIssueActions";
import { apiFetch } from "../shared/apiFetch";
import { dispatchToast } from "../shared/toastBus";
import { promoteTokensToSharedAlias } from "../hooks/useExtractToAlias";
import { useHealthData } from "../hooks/useHealthData";
import type { AliasOpportunityGroup } from "../hooks/useHealthData";
import { parseSuppressKey } from "../shared/ruleLabels";
import type { HealthView } from "./health/types";
import { HealthDashboard } from "./health/HealthDashboard";
import { HealthIssuesView } from "./health/HealthIssuesView";
import { HealthHiddenView } from "./health/HealthHiddenView";
import { HealthUnusedView } from "./health/HealthUnusedView";
import { HealthDeprecatedView } from "./health/HealthDeprecatedView";
import type { DeprecatedUsageEntry } from "./health/HealthDeprecatedView";
import { HealthAliasOpportunitiesView } from "./health/HealthAliasOpportunitiesView";
import { HealthDuplicatesView } from "./health/HealthDuplicatesView";

type HealthStatus = "healthy" | "warning" | "critical";

function statusFromIssueSeverities(
  severities: Array<"error" | "warning" | "info">,
): HealthStatus {
  if (severities.includes("error")) {
    return "critical";
  }
  if (severities.length > 0) {
    return "warning";
  }
  return "healthy";
}

export interface HealthPanelProps {
  serverUrl: string;
  connected: boolean;
  currentCollectionId: string;
  healthSignals: HealthSignalsResult;
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToCollectionId: Record<string, string>;
  tokenUsageCounts: Record<string, number>;
  tokenUsageReady: boolean;
  heatmapResult: HeatmapResult | null;
  onNavigateToToken?: (path: string, collectionId: string) => void;
  validationIssues: ValidationIssue[] | null;
  validationLoading: boolean;
  validationError: string | null;
  validationLastRefreshed: Date | null;
  validationIsStale: boolean;
  onRefreshValidation: () => void;
  onPushUndo?: (slot: UndoSlot) => void;
  onError: (msg: string) => void;
  onNavigateToGenerators?: () => void;
  viewRequest?: { view: HealthView; nonce: number } | null;
  issueActions: UseIssueActionsResult;
}

export function HealthPanel({
  serverUrl,
  connected,
  currentCollectionId,
  healthSignals,
  allTokensFlat,
  pathToCollectionId,
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
  viewRequest,
  issueActions,
}: HealthPanelProps) {
  const { suppressedKeys, suppressingKey, fixingKeys, applyIssueFix, handleSuppress, handleUnsuppress } = issueActions;
  const requestedView = viewRequest?.view;
  const viewRequestNonce = viewRequest?.nonce;
  const [activeView, setActiveView] = useState<HealthView>(requestedView ?? "dashboard");

  useEffect(() => {
    if (requestedView) setActiveView(requestedView);
  }, [requestedView, viewRequestNonce]);

  const [promotingAliasGroupId, setPromotingAliasGroupId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [deprecatedUsageEntries, setDeprecatedUsageEntries] = useState<DeprecatedUsageEntry[]>([]);
  const [deprecatedUsageLoading, setDeprecatedUsageLoading] = useState(false);
  const [deprecatedUsageError, setDeprecatedUsageError] = useState<string | null>(null);

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
  }, [connected, serverUrl, reloadKey, validationIssuesProp]);

  const { allTokensUnified, lintDuplicateGroups, aliasOpportunityGroups, unusedTokens } = useHealthData({
    allTokensFlat,
    pathToCollectionId,
    tokenUsageCounts,
    tokenUsageReady,
    validationIssues: validationIssuesProp,
    currentCollectionId,
  });

  const totalDuplicateAliases = lintDuplicateGroups.reduce((sum, g) => sum + g.tokens.length - 1, 0);

  const tokenLevelSignals = healthSignals.signals.filter(
    (s) =>
      s.collectionId === currentCollectionId &&
      s.source !== "generator" &&
      s.rule !== "no-duplicate-values" &&
      s.rule !== "alias-opportunity",
  );
  const generatorSignals = healthSignals.signals.filter(
    (s) => s.collectionId === currentCollectionId && s.source === "generator",
  );

  const deprecatedUsageEntriesForCurrent = deprecatedUsageEntries.filter(
    (e) => e.collectionId === currentCollectionId,
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
      return parseSuppressKey(key)?.collectionId === currentCollectionId;
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
      : healthSignals.currentCollection.severity === "error"
      ? "critical"
      : healthSignals.currentCollection.severity === "warning" ||
          healthSignals.currentCollection.severity === "info" ||
          validationIsStale ||
          duplicateCount > 0 ||
          deprecatedCount > 0 ||
          aliasOpportunitiesCount > 0 ||
          (tokenUsageReady && unusedCount > 0) ||
          heatmapSignalsPresent
        ? "warning"
        : "healthy";

  const handlePromote = async (group: AliasOpportunityGroup) => {
    const sampleEntry = allTokensUnified[group.tokens[0]?.path ?? ""];
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
          body: JSON.stringify({ deprecatedPath: entry.deprecatedPath, replacementPath }),
        },
      );
      if (onPushUndo && result.operationId && result.updated > 0) {
        const opId = result.operationId;
        onPushUndo({
          description: `Replace ${result.updated} deprecated reference${result.updated === 1 ? "" : "s"}`,
          restore: async () => {
            await apiFetch(`${serverUrl}/api/operations/${encodeURIComponent(opId)}/rollback`, { method: "POST" });
            setReloadKey((k) => k + 1);
            await onRefreshValidation();
          },
        });
      }
      setReloadKey((k) => k + 1);
      await onRefreshValidation();
      dispatchToast(
        `Replaced ${result.updated} reference${result.updated !== 1 ? "s" : ""}`,
        "success",
        { destination: { kind: "workspace", topTab: "library", subTab: "health" } },
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to replace deprecated references.");
    }
  };

  const goBack = () => setActiveView("dashboard");

  switch (activeView) {
    case "issues":
      return (
        <HealthIssuesView
          validationIssues={unifiedIssuesForView}
          validationLastRefreshed={validationLastRefreshed}
          suppressedKeys={suppressedKeysForCurrent}
          fixingKeys={fixingKeys}
          onFix={applyIssueFix}
          onIgnore={handleSuppress}
          onNavigateToToken={onNavigateToToken}
          onBack={goBack}
        />
      );

    case "hidden":
      return (
        <HealthHiddenView
          suppressedKeys={suppressedKeysForCurrent}
          suppressingKey={suppressingKey}
          onUnsuppress={handleUnsuppress}
          onBack={goBack}
        />
      );

    case "unused":
      return (
        <HealthUnusedView
          serverUrl={serverUrl}
          loading={!tokenUsageReady}
          unusedTokens={unusedTokens}
          onNavigateToToken={onNavigateToToken}
          onError={onError}
          onMutate={() => setReloadKey((k) => k + 1)}
          onBack={goBack}
        />
      );

    case "deprecated":
      return (
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

    case "alias-opportunities":
      return (
        <HealthAliasOpportunitiesView
          aliasOpportunityGroups={aliasOpportunityGroups}
          promotingGroupId={promotingAliasGroupId}
          onPromote={handlePromote}
          onBack={goBack}
        />
      );

    case "duplicates":
      return (
        <HealthDuplicatesView
          serverUrl={serverUrl}
          lintDuplicateGroups={lintDuplicateGroups}
          totalDuplicateAliases={totalDuplicateAliases}
          onNavigateToToken={onNavigateToToken}
          onError={onError}
          onMutate={() => setReloadKey((k) => k + 1)}
          onRefreshValidation={onRefreshValidation}
          onBack={goBack}
        />
      );

    default:
      return (
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
          onNavigateToView={setActiveView}
          onNavigateToGenerators={onNavigateToGenerators}
        />
      );
  }
}
