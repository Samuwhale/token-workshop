import { useState, useEffect } from "react";
import type { LintViolation } from "../hooks/useLint";
import type { TokenGenerator } from "../hooks/useGenerators";
import type { UndoSlot } from "../hooks/useUndo";
import type { HeatmapResult } from "./HeatmapPanel";
import type { TokenMapEntry } from "../../shared/types";
import type {
  ValidationIssue,
  ValidationSummary,
} from "../hooks/useValidationCache";
import { apiFetch } from "../shared/apiFetch";
import { dispatchToast } from "../shared/toastBus";
import {
  createTokenBody,
  deleteToken,
  updateToken,
} from "../shared/tokenMutations";
import { promoteTokensToSharedAlias } from "../hooks/useExtractToAlias";
import { useHealthData } from "../hooks/useHealthData";
import type { AliasOpportunityGroup } from "../hooks/useHealthData";
import type { HealthView } from "./health/types";
import { HealthDashboard } from "./health/HealthDashboard";
import { HealthIssuesView } from "./health/HealthIssuesView";
import { HealthIgnoredView } from "./health/HealthIgnoredView";
import { HealthUnusedView } from "./health/HealthUnusedView";
import { HealthDeprecatedView } from "./health/HealthDeprecatedView";
import type { DeprecatedUsageEntry } from "./health/HealthDeprecatedView";
import { HealthConsolidateView } from "./health/HealthConsolidateView";
import { HealthDuplicatesView } from "./health/HealthDuplicatesView";

type HealthStatus = "healthy" | "warning" | "critical";

export interface HealthPanelProps {
  serverUrl: string;
  connected: boolean;
  currentCollectionId: string;
  generators: TokenGenerator[];
  lintViolations: LintViolation[];
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToCollectionId: Record<string, string>;
  tokenUsageCounts: Record<string, number>;
  heatmapResult: HeatmapResult | null;
  onNavigateToToken?: (path: string, collectionId: string) => void;
  validationIssues: ValidationIssue[] | null;
  validationSummary: ValidationSummary | null;
  validationLoading: boolean;
  validationError: string | null;
  validationLastRefreshed: Date | null;
  validationIsStale: boolean;
  onRefreshValidation: () => void;
  onPushUndo?: (slot: UndoSlot) => void;
  onError: (msg: string) => void;
}

function suppressKey(issue: ValidationIssue): string {
  return `${issue.rule}:${issue.collectionId}:${issue.path}`;
}

export function HealthPanel({
  serverUrl,
  connected,
  currentCollectionId,
  generators,
  lintViolations,
  allTokensFlat,
  pathToCollectionId,
  tokenUsageCounts,
  heatmapResult,
  onNavigateToToken,
  validationIssues: validationIssuesProp,
  validationSummary,
  validationLoading,
  validationError,
  validationLastRefreshed,
  validationIsStale,
  onRefreshValidation,
  onPushUndo,
  onError,
}: HealthPanelProps) {
  const [activeView, setActiveView] = useState<HealthView>("dashboard");

  const [fixingKeys, setFixingKeys] = useState<Set<string>>(new Set());
  const [promotingAliasGroupId, setPromotingAliasGroupId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [deprecatedUsageEntries, setDeprecatedUsageEntries] = useState<DeprecatedUsageEntry[]>([]);
  const [deprecatedUsageLoading, setDeprecatedUsageLoading] = useState(false);
  const [deprecatedUsageError, setDeprecatedUsageError] = useState<string | null>(null);

  const [suppressedKeys, setSuppressedKeys] = useState<Set<string>>(new Set());
  const [suppressingKey, setSuppressingKey] = useState<string | null>(null);

  useEffect(() => {
    if (!connected || !serverUrl) return;
    apiFetch<{ suppressions: string[] }>(`${serverUrl}/api/lint/suppressions`)
      .then((data) => {
        if (Array.isArray(data.suppressions)) setSuppressedKeys(new Set(data.suppressions));
      })
      .catch(() => {});
  }, [connected, serverUrl]);

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
    validationIssues: validationIssuesProp,
    currentCollectionId,
  });

  const totalDuplicateAliases = lintDuplicateGroups.reduce((sum, g) => sum + g.tokens.length - 1, 0);

  const lintErrors = lintViolations.filter((v) => v.severity === "error").length;
  const lintWarnings = lintViolations.filter((v) => v.severity === "warning").length;
  const validationErrors = validationSummary?.errors ?? 0;
  const validationWarnings = validationSummary?.warnings ?? 0;
  const errorGenerators = generators.filter((g) => g.lastRunError && !g.lastRunError.blockedBy);
  const staleGenerators = generators.filter((g) => g.isStale);

  const overallStatus: HealthStatus =
    lintErrors > 0 || validationErrors > 0 || errorGenerators.length > 0
      ? "critical"
      : lintWarnings > 0 || validationWarnings > 0 || staleGenerators.length > 0 || totalDuplicateAliases > 0 || (heatmapResult?.red ?? 0) > 0
        ? "warning"
        : "healthy";

  const activeIssueCount = validationIssuesProp
    ? validationIssuesProp.filter(
        (i) => i.rule !== "no-duplicate-values" && i.rule !== "alias-opportunity" && !suppressedKeys.has(suppressKey(i)),
      ).filter((i) => i.severity !== "info").length
    : 0;

  const totalIssueCount = activeIssueCount + lintErrors + lintWarnings;

  const handleSuppress = async (issue: ValidationIssue) => {
    const key = suppressKey(issue);
    if (suppressedKeys.has(key)) return;
    setSuppressingKey(key);
    const next = new Set(suppressedKeys);
    next.add(key);
    setSuppressedKeys(next);
    try {
      await apiFetch(`${serverUrl}/api/lint/suppressions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suppressions: [...next] }),
      });
    } catch {
      setSuppressedKeys((prev) => { const r = new Set(prev); r.delete(key); return r; });
      onError("Failed to save suppression");
    } finally {
      setSuppressingKey(null);
    }
  };

  const handleUnsuppress = async (key: string) => {
    setSuppressingKey(key);
    const next = new Set(suppressedKeys);
    next.delete(key);
    setSuppressedKeys(next);
    try {
      await apiFetch(`${serverUrl}/api/lint/suppressions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suppressions: [...next] }),
      });
    } catch {
      setSuppressedKeys((prev) => { const r = new Set(prev); r.add(key); return r; });
      onError("Failed to remove suppression");
    } finally {
      setSuppressingKey(null);
    }
  };

  const applyIssueFix = async (issue: ValidationIssue) => {
    const key = suppressKey(issue);
    setFixingKeys((prev) => { const next = new Set(prev); next.add(key); return next; });
    try {
      if (issue.suggestedFix === "add-description") {
        await updateToken(serverUrl, issue.collectionId, issue.path, createTokenBody({ $description: "" }));
      } else if ((issue.suggestedFix === "flatten-alias-chain" || issue.suggestedFix === "extract-to-alias") && issue.suggestion) {
        await updateToken(serverUrl, issue.collectionId, issue.path, createTokenBody({ $value: issue.suggestion }));
      } else if (issue.suggestedFix === "delete-token") {
        await deleteToken(serverUrl, issue.collectionId, issue.path);
      } else if (issue.suggestedFix === "rename-token" && issue.suggestion) {
        await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(issue.collectionId)}/tokens/rename`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ oldPath: issue.path, newPath: issue.suggestion, updateAliases: true }),
        });
      } else if (issue.suggestedFix === "fix-type" && issue.suggestion) {
        await updateToken(serverUrl, issue.collectionId, issue.path, createTokenBody({ $type: issue.suggestion }));
      }
      await onRefreshValidation();
    } catch {
      onError("Fix failed — check connection and retry.");
    } finally {
      setFixingKeys((prev) => { const next = new Set(prev); next.delete(key); return next; });
    }
  };

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
      dispatchToast(`Replaced ${result.updated} reference${result.updated !== 1 ? "s" : ""}`, "success");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to replace deprecated references.");
    }
  };

  const goBack = () => setActiveView("dashboard");

  switch (activeView) {
    case "issues":
      return (
        <HealthIssuesView
          validationIssues={validationIssuesProp ?? []}
          validationLastRefreshed={validationLastRefreshed}
          suppressedKeys={suppressedKeys}
          fixingKeys={fixingKeys}
          onFix={applyIssueFix}
          onIgnore={handleSuppress}
          onNavigateToToken={onNavigateToToken}
          onBack={goBack}
        />
      );

    case "ignored":
      return (
        <HealthIgnoredView
          suppressedKeys={suppressedKeys}
          suppressingKey={suppressingKey}
          onUnsuppress={handleUnsuppress}
          onBack={goBack}
        />
      );

    case "unused":
      return (
        <HealthUnusedView
          serverUrl={serverUrl}
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
          entries={deprecatedUsageEntries}
          loading={deprecatedUsageLoading}
          error={deprecatedUsageError}
          allTokensFlat={allTokensFlat}
          pathToCollectionId={pathToCollectionId}
          onReplace={handleReplaceDeprecated}
          onBack={goBack}
        />
      );

    case "consolidate":
      return (
        <HealthConsolidateView
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
          issueCount={activeIssueCount}
          unusedCount={unusedTokens.length}
          deprecatedCount={deprecatedUsageEntries.length}
          consolidateCount={aliasOpportunityGroups.length}
          duplicateCount={totalDuplicateAliases}
          ignoredCount={suppressedKeys.size}
          onNavigateToView={setActiveView}
        />
      );
  }
}

export { computeHealthIssueCount } from "../hooks/useHealthData";
