import { useState, useMemo, useEffect } from "react";
import type { LintViolation } from "../hooks/useLint";
import type { TokenGenerator } from "../hooks/useGenerators";
import type { UndoSlot } from "../hooks/useUndo";
import type { HeatmapResult } from "./HeatmapPanel";
import type { TokenMapEntry } from "../../shared/types";
import type {
  ValidationIssue,
  ValidationSummary,
} from "../hooks/useValidationCache";
import {
  NoticeBanner,
  NoticePill,
  severityStyles,
} from "../shared/noticeSystem";
import type { NoticeSeverity } from "../shared/noticeSystem";
import { apiFetch } from "../shared/apiFetch";
import { isAlias, extractAliasPath } from "../../shared/resolveAlias";
import { hexToLuminance } from "../shared/colorUtils";
import { normalizeHex } from "@tokenmanager/core";
import type { ThemeDimension } from "@tokenmanager/core";
import { LINT_RULE_BY_ID } from "../shared/lintRules";
import {
  createTokenBody,
  deleteToken,
  updateToken,
} from "../shared/tokenMutations";
import { UnusedTokensPanel } from "./UnusedTokensPanel";
import { DuplicateDetectionPanel } from "./DuplicateDetectionPanel";
import { ContrastMatrixPanel } from "./ContrastMatrixPanel";
import { LightnessInspectorPanel } from "./LightnessInspectorPanel";
import { TokenPickerDropdown } from "./TokenPicker";
import {
  ensureUniqueSharedAliasPath,
  promoteTokensToSharedAlias,
  suggestSharedAliasPath,
} from "../hooks/useExtractToAlias";

type HealthStatus = "healthy" | "warning" | "critical";



interface PriorityIssue {
  severity: "critical" | "warning" | "info";
  category: string;
  message: string;
  count: number;
  ctaLabel: string;
  /** Stable string key describing the action — resolved to a handler in JSX */
  action:
    | "lint"
    | "generators"
    | "validation-scroll"
    | "alias-opportunities-scroll"
    | "deprecated-scroll"
    | "duplicates-scroll"
    | "canvas"
    | "unused-scroll";
}


function statusColor(status: HealthStatus | null): string {
  if (status === "critical") return "text-[var(--color-figma-error)]";
  if (status === "warning") return "text-amber-500";
  return "text-[var(--color-figma-success,#18a058)]";
}


function StatusIcon({ status }: { status: HealthStatus | null }) {
  if (status === "critical") {
    return (
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    );
  }
  if (status === "warning") {
    return (
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" />
      </svg>
    );
  }
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

/** No longer needed — InfoIcon was used for priority rows, now covered by NoticePill. */

/** Human-friendly labels for validation rules */
const VALIDATION_LABELS: Record<string, { label: string; tip: string }> = {
  "missing-type": {
    label: "Missing type",
    tip: "Add a $type to make the token spec-compliant",
  },
  "broken-alias": {
    label: "Broken reference",
    tip: "The referenced token doesn't exist — update or remove the reference",
  },
  "circular-reference": {
    label: "Circular reference",
    tip: "Break the reference loop so the token can resolve",
  },
  "max-alias-depth": {
    label: "Deep reference chain",
    tip: "Shorten the chain by pointing closer to the source token",
  },
  "references-deprecated-token": {
    label: "Deprecated token in use",
    tip: "Replace active references with a non-deprecated successor token",
  },
  "type-mismatch": {
    label: "Type / value mismatch",
    tip: "The value doesn't match the declared $type",
  },
};

function getRuleLabel(
  rule: string,
): { label: string; tip: string } | undefined {
  return (
    VALIDATION_LABELS[rule] ??
    (LINT_RULE_BY_ID[rule]
      ? { label: LINT_RULE_BY_ID[rule].label, tip: LINT_RULE_BY_ID[rule].tip }
      : undefined)
  );
}

function formatCount(
  count: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${count} ${count === 1 ? singular : plural}`;
}


function getValidationPriorityCtaLabel(rule: string): string {
  switch (rule) {
    case "missing-type":
      return "Add type";
    case "broken-alias":
      return "Resolve alias";
    case "circular-reference":
      return "Break cycle";
    case "max-alias-depth":
      return "Shorten chain";
    case "references-deprecated-token":
      return "Replace refs";
    case "type-mismatch":
      return "Fix type";
    default: {
      const label = getRuleLabel(rule)?.label ?? "issue";
      return `Review ${label.toLowerCase()}`;
    }
  }
}

function formatDuplicateValue(value: unknown): string {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "[complex value]";
  }
}

interface AliasOpportunityToken {
  path: string;
  setName: string;
}

interface AliasOpportunityGroup {
  id: string;
  tokens: AliasOpportunityToken[];
  typeLabel: string;
  valueLabel: string;
  suggestedPrimitivePath: string;
  suggestedPrimitiveSet: string;
  colorHex?: string;
}

interface DeprecatedUsageDependent {
  path: string;
  setName: string;
}

interface DeprecatedUsageEntry {
  deprecatedPath: string;
  setName: string;
  type: string;
  activeReferenceCount: number;
  dependents: DeprecatedUsageDependent[];
}

export interface HealthPanelProps {
  serverUrl: string;
  connected: boolean;
  activeSet: string;
  generators: TokenGenerator[];
  lintViolations: LintViolation[];
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToSet: Record<string, string>;
  /** Theme dimensions — enables cross-theme contrast checking in the matrix */
  dimensions?: ThemeDimension[];
  tokenUsageCounts: Record<string, number>;
  heatmapResult: HeatmapResult | null;
  onNavigateTo: (topTab: "define" | "apply" | "sync", subTab?: string) => void;
  onNavigateToToken?: (path: string, set: string) => void;
  onTriggerHeatmap: () => void;
  /** Shared validation cache — avoids re-fetching when switching from Analytics tab */
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

export function HealthPanel({
  serverUrl,
  connected,
  activeSet,
  generators,
  lintViolations,
  allTokensFlat,
  pathToSet,
  dimensions = [],
  tokenUsageCounts,
  heatmapResult,
  onNavigateTo,
  onNavigateToToken,
  onTriggerHeatmap,
  validationIssues: validationIssuesProp,
  validationSummary,
  validationLoading,
  validationError: _validationError,
  validationLastRefreshed,
  validationIsStale,
  onRefreshValidation,
  onPushUndo,
  onError,
}: HealthPanelProps) {
  const validating = validationLoading;
  const lastRefreshed = validationLastRefreshed;
  const runValidation = onRefreshValidation;

  const [fixingKeys, setFixingKeys] = useState<Set<string>>(new Set());
  const [promotingAliasGroupId, setPromotingAliasGroupId] = useState<
    string | null
  >(null);
  const [deprecatedUsageEntries, setDeprecatedUsageEntries] = useState<
    DeprecatedUsageEntry[]
  >([]);
  const [deprecatedUsageLoading, setDeprecatedUsageLoading] = useState(false);
  const [deprecatedUsageError, setDeprecatedUsageError] = useState<
    string | null
  >(null);
  const [deprecatedReplacementPaths, setDeprecatedReplacementPaths] = useState<
    Record<string, string>
  >({});
  const [openDeprecatedPickerPath, setOpenDeprecatedPickerPath] = useState<
    string | null
  >(null);
  const [replacingDeprecatedPath, setReplacingDeprecatedPath] = useState<
    string | null
  >(null);

  // Suppressions
  const [suppressedKeys, setSuppressedKeys] = useState<Set<string>>(new Set());
  const [suppressingKey, setSuppressingKey] = useState<string | null>(null);
  const [showSuppressed, setShowSuppressed] = useState(false);

  // Load suppressions from server on mount / reconnect
  useEffect(() => {
    if (!connected || !serverUrl) return;
    apiFetch<{ suppressions: string[] }>(`${serverUrl}/api/lint/suppressions`)
      .then((data) => {
        if (Array.isArray(data.suppressions)) {
          setSuppressedKeys(new Set(data.suppressions));
        }
      })
      .catch(() => {
        /* suppressions are best-effort */
      });
  }, [connected, serverUrl]);

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
      setSuppressedKeys((prev) => {
        const r = new Set(prev);
        r.delete(key);
        return r;
      });
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
      setSuppressedKeys((prev) => {
        const r = new Set(prev);
        r.add(key);
        return r;
      });
      onError("Failed to remove suppression");
    } finally {
      setSuppressingKey(null);
    }
  };

  // Analytics section state
  const [severityFilter, setSeverityFilter] = useState<
    "all" | "error" | "warning" | "info"
  >("all");
  const [collapsedRules, setCollapsedRules] = useState<Set<string>>(new Set());
  const [validationReportExpanded, setValidationReportExpanded] =
    useState(true);
  const [validationToolsExpanded, setValidationToolsExpanded] =
    useState(false);
  const [validationCopied, setValidationCopied] = useState(false);
  const [validationExported, setValidationExported] = useState<
    "json" | "csv" | null
  >(null);
  const [issueGroupVisibleCounts, setIssueGroupVisibleCounts] = useState<
    Record<string, number>
  >({});
  const ISSUES_PER_PAGE = 20;

  // reloadKey forces re-computation of allTokensUnified after mutations
  const [reloadKey, setReloadKey] = useState(0);

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

    apiFetch<{ entries: DeprecatedUsageEntry[] }>(
      `${serverUrl}/api/tokens/deprecated-usage`,
    )
      .then((data) => {
        if (cancelled) return;
        setDeprecatedUsageEntries(
          Array.isArray(data.entries) ? data.entries : [],
        );
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("[HealthPanel] failed to load deprecated usage:", err);
        setDeprecatedUsageEntries([]);
        setDeprecatedUsageError(
          "Failed to load deprecated usage. Refresh the audit and try again.",
        );
      })
      .finally(() => {
        if (!cancelled) {
          setDeprecatedUsageLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [connected, serverUrl, reloadKey, validationIssuesProp]);

  // ── Derived data from allTokensFlat ────────────────────────────────────────

  const allTokensUnified = useMemo(() => {
    const result: Record<
      string,
      {
        $value: unknown;
        $type: string;
        set: string;
        $scopes?: string[];
        $lifecycle?: TokenMapEntry["$lifecycle"];
      }
    > = {};
    for (const [path, entry] of Object.entries(allTokensFlat)) {
      result[path] = {
        $value: entry.$value,
        $type: entry.$type,
        set: pathToSet[path] ?? "",
        $scopes: entry.$scopes,
        $lifecycle: entry.$lifecycle,
      };
    }
    return result;
  }, [allTokensFlat, pathToSet]);

  const resolveColorHex = useMemo(() => {
    return (path: string, visited = new Set<string>()): string | null => {
      if (visited.has(path)) return null;
      visited.add(path);
      const entry = allTokensUnified[path];
      if (!entry || entry.$type !== "color") return null;
      const v = entry.$value as import("@tokenmanager/core").TokenValue;
      if (isAlias(v)) {
        const aliasPath = extractAliasPath(v);
        return aliasPath ? resolveColorHex(aliasPath, visited) : null;
      }
      return typeof v === "string" &&
        /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v)
        ? v
        : null;
    };
  }, [allTokensUnified]);

  // Non-alias color tokens sorted by luminance (for ContrastMatrixPanel)
  const colorTokens = useMemo((): { path: string; hex: string }[] => {
    const colors: { path: string; hex: string }[] = [];
    for (const [path, entry] of Object.entries(allTokensUnified)) {
      if (entry.$type !== "color") continue;
      if (isAlias(entry.$value as import("@tokenmanager/core").TokenValue))
        continue;
      const v = entry.$value;
      if (
        typeof v !== "string" ||
        !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v)
      )
        continue;
      colors.push({ path, hex: normalizeHex(v) });
    }
    return colors.sort(
      (a, b) => (hexToLuminance(a.hex) ?? 0) - (hexToLuminance(b.hex) ?? 0),
    );
  }, [allTokensUnified]);

  // All color tokens with alias resolution (for LightnessInspectorPanel)
  const allColorTokens = useMemo((): {
    path: string;
    set: string;
    hex: string;
  }[] => {
    const colors: { path: string; set: string; hex: string }[] = [];
    for (const [path, entry] of Object.entries(allTokensUnified)) {
      if (entry.$type !== "color") continue;
      const hex = resolveColorHex(path);
      if (hex) colors.push({ path, set: entry.set, hex: normalizeHex(hex) });
    }
    return colors;
  }, [allTokensUnified, resolveColorHex]);

  // Duplicate groups from validation results (for DuplicateDetectionPanel)
  const lintDuplicateGroups = useMemo(() => {
    if (!validationIssuesProp) return [];
    const dupViolations = validationIssuesProp.filter(
      (v) => v.rule === "no-duplicate-values" && v.group,
    );
    if (dupViolations.length === 0) return [];
    const byGroup = new Map<
      string,
      { tokens: { path: string; setName: string }[] }
    >();
    for (const v of dupViolations) {
      const groupId = v.group!;
      if (!byGroup.has(groupId)) byGroup.set(groupId, { tokens: [] });
      const entry = byGroup.get(groupId)!;
      if (
        !entry.tokens.some((t) => t.path === v.path && t.setName === v.setName)
      ) {
        entry.tokens.push({ path: v.path, setName: v.setName });
      }
    }
    return [...byGroup.entries()]
      .filter(([, g]) => g.tokens.length > 1)
      .map(([id, { tokens }]) => {
        const sampleToken = tokens[0];
        const tokenEntry = sampleToken
          ? allTokensUnified[sampleToken.path]
          : undefined;
        const colorHex =
          tokenEntry?.$type === "color" && typeof tokenEntry.$value === "string"
            ? tokenEntry.$value
            : undefined;
        return {
          id,
          valueLabel: tokenEntry
            ? formatDuplicateValue(tokenEntry.$value)
            : "Unknown value",
          typeLabel: tokenEntry?.$type ?? "unknown",
          colorHex,
          tokens: tokens
            .map(({ path, setName }) => {
              const duplicateEntry = allTokensUnified[path];
              return {
                path,
                setName,
                type: duplicateEntry?.$type ?? "unknown",
                lifecycle: duplicateEntry?.$lifecycle,
                scopes: duplicateEntry?.$scopes ?? [],
                colorHex:
                  duplicateEntry?.$type === "color" &&
                  typeof duplicateEntry.$value === "string"
                    ? duplicateEntry.$value
                    : undefined,
              };
            })
            .sort(
              (a, b) =>
                a.path.localeCompare(b.path) ||
                a.setName.localeCompare(b.setName),
            ),
        };
      })
      .sort((a, b) => b.tokens.length - a.tokens.length);
  }, [validationIssuesProp, allTokensUnified]);

  const aliasOpportunityGroups = useMemo((): AliasOpportunityGroup[] => {
    if (!validationIssuesProp) return [];
    const groupedIssues = validationIssuesProp.filter(
      (issue) => issue.rule === "alias-opportunity" && issue.group,
    );
    if (groupedIssues.length === 0) return [];

    const groups = new Map<string, AliasOpportunityToken[]>();
    for (const issue of groupedIssues) {
      const groupId = issue.group!;
      const existing = groups.get(groupId) ?? [];
      if (
        !existing.some(
          (token) =>
            token.path === issue.path && token.setName === issue.setName,
        )
      ) {
        existing.push({ path: issue.path, setName: issue.setName });
      }
      groups.set(groupId, existing);
    }

    return [...groups.entries()]
      .filter(([, tokens]) => tokens.length > 1)
      .map(([id, tokens]) => {
        const sortedTokens = [...tokens].sort(
          (a, b) =>
            a.path.localeCompare(b.path) ||
            a.setName.localeCompare(b.setName),
        );
        const sampleEntry = allTokensUnified[sortedTokens[0]?.path ?? ""];
        const sourceSetNames = Array.from(
          new Set(sortedTokens.map((token) => token.setName)),
        );
        const suggestedPrimitiveSet = sourceSetNames.includes(activeSet)
          ? activeSet
          : sortedTokens[0]?.setName ?? activeSet;
        const suggestedPrimitivePath = ensureUniqueSharedAliasPath(
          suggestSharedAliasPath(
            sortedTokens.map((token) => token.path),
            sampleEntry?.$type,
          ),
          [
            ...Object.keys(allTokensUnified),
            ...sortedTokens.map((token) => token.path),
          ],
        );

        return {
          id,
          tokens: sortedTokens,
          typeLabel: sampleEntry?.$type ?? "unknown",
          valueLabel: sampleEntry
            ? formatDuplicateValue(sampleEntry.$value)
            : "Unknown value",
          suggestedPrimitivePath,
          suggestedPrimitiveSet,
          colorHex:
            sampleEntry?.$type === "color" &&
            typeof sampleEntry.$value === "string"
              ? sampleEntry.$value
              : undefined,
        };
      })
      .sort((a, b) => b.tokens.length - a.tokens.length);
  }, [validationIssuesProp, allTokensUnified, activeSet]);

  // Color scales for LightnessInspectorPanel (groups with numeric suffix, ≥3 steps)
  const colorScales = useMemo(() => {
    const parentGroups = new Map<
      string,
      { path: string; label: string; hex: string }[]
    >();
    for (const t of allColorTokens) {
      const parts = t.path.split(".");
      const last = parts[parts.length - 1];
      if (!/^\d+$/.test(last)) continue;
      const parent = parts.slice(0, -1).join(".");
      const list = parentGroups.get(parent) ?? [];
      list.push({ path: t.path, label: last, hex: t.hex });
      parentGroups.set(parent, list);
    }
    return [...parentGroups.entries()]
      .filter(([, steps]) => steps.length >= 3)
      .map(([parent, steps]) => ({
        parent,
        steps: steps.sort((a, b) => Number(a.label) - Number(b.label)),
      }));
  }, [allColorTokens]);

  // Unused tokens (for UnusedTokensPanel)
  const unusedTokens = useMemo(() => {
    if (
      Object.keys(tokenUsageCounts).length === 0 ||
      Object.keys(allTokensUnified).length === 0
    )
      return [];
    const referencedPaths = new Set<string>();
    const collectRefs = (value: unknown) => {
      if (typeof value === "string") {
        const m = value.match(/^\{([^}]+)\}$/);
        if (m) referencedPaths.add(m[1]);
      } else if (Array.isArray(value)) {
        for (const item of value) collectRefs(item);
      } else if (value && typeof value === "object") {
        for (const v of Object.values(value as Record<string, unknown>))
          collectRefs(v);
      }
    };
    for (const entry of Object.values(allTokensUnified))
      collectRefs(entry.$value);
    return Object.entries(allTokensUnified)
      .filter(
        ([path, _entry]) =>
          (tokenUsageCounts[path] ?? 0) === 0 &&
          !referencedPaths.has(path) &&
          allTokensUnified[path]?.$lifecycle !== "deprecated",
      )
      .map(([path, entry]) => ({
        path,
        set: entry.set,
        $type: entry.$type,
        $lifecycle: entry.$lifecycle,
      }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }, [tokenUsageCounts, allTokensUnified]);

  // ── Validation issue filtering ──────────────────────────────────────────────

  const suppressKey = (issue: ValidationIssue) =>
    `${issue.rule}:${issue.setName}:${issue.path}`;

  const activeIssues = validationIssuesProp
    ? validationIssuesProp.filter(
        (i) =>
          i.rule !== "no-duplicate-values" &&
          i.rule !== "alias-opportunity" &&
          !suppressedKeys.has(suppressKey(i)),
      )
    : null;

  const filteredIssues = activeIssues
    ? severityFilter === "all"
      ? [...activeIssues].sort((a, b) => {
          const order = { error: 0, warning: 1, info: 2 } as const;
          return order[a.severity] - order[b.severity];
        })
      : activeIssues.filter((i) => i.severity === severityFilter)
    : null;

  const severityCounts = activeIssues
    ? {
        all: activeIssues.length,
        error: activeIssues.filter((i) => i.severity === "error").length,
        warning: activeIssues.filter((i) => i.severity === "warning").length,
        info: activeIssues.filter((i) => i.severity === "info").length,
      }
    : null;

  useEffect(() => {
    if (validationIssuesProp === null) return;
    setValidationReportExpanded((activeIssues?.length ?? 0) > 0);
    setValidationToolsExpanded(false);
  }, [validationIssuesProp, activeIssues?.length]);

  const issueGroups = (() => {
    if (!filteredIssues || filteredIssues.length === 0) return [];
    const map = new Map<string, ValidationIssue[]>();
    for (const issue of filteredIssues) {
      const list = map.get(issue.rule) ?? [];
      list.push(issue);
      map.set(issue.rule, list);
    }
    const severityOrder = { error: 0, warning: 1, info: 2 } as const;
    return [...map.entries()]
      .map(([rule, issues]) => {
        const meta = getRuleLabel(rule) ?? { label: rule, tip: "" };
        const worst = issues.reduce((a, b) =>
          severityOrder[a.severity] <= severityOrder[b.severity] ? a : b,
        );
        return {
          rule,
          label: meta.label,
          tip: meta.tip,
          severity: worst.severity,
          issues,
        };
      })
      .sort(
        (a, b) =>
          severityOrder[a.severity] - severityOrder[b.severity] ||
          b.issues.length - a.issues.length,
      );
  })();

  // ── Fix / mutate handlers ───────────────────────────────────────────────────

  const applyIssueFix = async (issue: ValidationIssue) => {
    const key = suppressKey(issue);
    const renameUrl = `${serverUrl}/api/tokens/${encodeURIComponent(issue.setName)}/tokens/rename`;
    setFixingKeys((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    try {
      if (issue.suggestedFix === "add-description") {
        await updateToken(serverUrl, issue.setName, issue.path, createTokenBody({ $description: "" }));
      } else if (
        (issue.suggestedFix === "flatten-alias-chain" ||
          issue.suggestedFix === "extract-to-alias") &&
        issue.suggestion
      ) {
        await updateToken(serverUrl, issue.setName, issue.path, createTokenBody({ $value: issue.suggestion }));
      } else if (issue.suggestedFix === "delete-token") {
        await deleteToken(serverUrl, issue.setName, issue.path);
      } else if (issue.suggestedFix === "rename-token" && issue.suggestion) {
        await apiFetch(renameUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            oldPath: issue.path,
            newPath: issue.suggestion,
            updateAliases: true,
          }),
        });
      } else if (issue.suggestedFix === "fix-type" && issue.suggestion) {
        await updateToken(serverUrl, issue.setName, issue.path, createTokenBody({ $type: issue.suggestion }));
      }
      await runValidation();
    } catch {
      onError("Fix failed — check your connection and try again.");
    } finally {
      setFixingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const handlePromoteAliasOpportunity = async (
    group: AliasOpportunityGroup,
  ) => {
    const sampleEntry = allTokensUnified[group.tokens[0]?.path ?? ""];
    if (!sampleEntry) {
      onError("Alias promotion failed — source tokens are no longer available.");
      return;
    }

    setPromotingAliasGroupId(group.id);
    try {
      await promoteTokensToSharedAlias({
        serverUrl,
        primitivePath: group.suggestedPrimitivePath,
        primitiveSet: group.suggestedPrimitiveSet,
        sourceTokens: group.tokens,
        tokenType: sampleEntry.$type,
        tokenValue: sampleEntry.$value,
      });
      await runValidation();
    } catch (err) {
      console.warn("[HealthPanel] promote alias opportunity failed:", err);
      onError(
        err instanceof Error
          ? err.message
          : "Alias promotion failed — refresh the audit and try again.",
      );
    } finally {
      setPromotingAliasGroupId(null);
    }
  };

  const handleReplaceDeprecatedReferences = async (
    entry: DeprecatedUsageEntry,
  ) => {
    const replacementPath =
      deprecatedReplacementPaths[entry.deprecatedPath]?.trim();
    if (!replacementPath) {
      onError("Pick a replacement token before rewriting references.");
      return;
    }

    setReplacingDeprecatedPath(entry.deprecatedPath);
    try {
      const result = await apiFetch<{
        ok: true;
        updated: number;
        operationId?: string;
      }>(`${serverUrl}/api/tokens/deprecated-usage/replace`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deprecatedPath: entry.deprecatedPath,
          replacementPath,
        }),
      });

      if (onPushUndo && result.operationId && result.updated > 0) {
        const opId = result.operationId;
        onPushUndo({
          description: `Replace ${result.updated} deprecated reference${result.updated === 1 ? "" : "s"}`,
          restore: async () => {
            await apiFetch(
              `${serverUrl}/api/operations/${encodeURIComponent(opId)}/rollback`,
              { method: "POST" },
            );
            setReloadKey((key) => key + 1);
            await runValidation();
          },
        });
      }

      setDeprecatedReplacementPaths((prev) => {
        const next = { ...prev };
        delete next[entry.deprecatedPath];
        return next;
      });
      setOpenDeprecatedPickerPath(null);
      setReloadKey((key) => key + 1);
      await runValidation();
    } catch (err) {
      console.warn("[HealthPanel] replace deprecated references failed:", err);
      onError(
        err instanceof Error
          ? err.message
          : "Failed to replace deprecated references.",
      );
    } finally {
      setReplacingDeprecatedPath(null);
    }
  };

  // ── Derived metrics ──────────────────────────────────────────────────────
  const lintErrors = lintViolations.filter(
    (v) => v.severity === "error",
  ).length;
  const lintWarnings = lintViolations.filter(
    (v) => v.severity === "warning",
  ).length;

  const validationErrors = validationSummary?.errors ?? 0;
  const validationWarnings = validationSummary?.warnings ?? 0;

  const staleGenerators = generators.filter((g) => g.isStale);
  const errorGenerators = generators.filter(
    (g) => g.lastRunError && !g.lastRunError.blockedBy,
  );
  const hasUsageData = Object.keys(tokenUsageCounts).length > 0;
  const unusedCount = hasUsageData
    ? Object.keys(allTokensFlat).filter((path) => !tokenUsageCounts[path])
        .length
    : 0;

  const totalDuplicateAliases = lintDuplicateGroups.reduce(
    (sum, g) => sum + g.tokens.length - 1,
    0,
  );

  const overallStatus: HealthStatus =
    lintErrors > 0 || validationErrors > 0 || errorGenerators.length > 0
      ? "critical"
      : lintWarnings > 0 ||
          validationWarnings > 0 ||
          staleGenerators.length > 0 ||
          totalDuplicateAliases > 0 ||
          (heatmapResult?.red ?? 0) > 0
        ? "warning"
        : "healthy";

  // Comprehensive prioritised issue list — aggregates ALL sources so the panel
  // is useful at a glance without expanding any sub-section.
  const priorityIssues = ((): PriorityIssue[] => {
    const items: PriorityIssue[] = [];

    // ── Critical ──────────────────────────────────────────────────────────────
    if (lintErrors > 0) {
      items.push({
        severity: "critical",
        category: "Lint",
        message: `${formatCount(lintErrors, "lint error")} in the current set`,
        count: lintErrors,
        ctaLabel: "Review lint",
        action: "lint",
      });
    }

    if (activeIssues) {
      const errorsByRule = new Map<string, number>();
      for (const issue of activeIssues) {
        if (issue.severity === "error") {
          errorsByRule.set(issue.rule, (errorsByRule.get(issue.rule) ?? 0) + 1);
        }
      }
      for (const [rule, count] of [...errorsByRule.entries()].sort(
        (a, b) => b[1] - a[1],
      )) {
        const meta = getRuleLabel(rule);
        items.push({
          severity: "critical",
          category: meta?.label ?? rule,
          message: `${formatCount(count, "token")} affected`,
          count,
          ctaLabel: getValidationPriorityCtaLabel(rule),
          action: "validation-scroll",
        });
      }
    }

    if (errorGenerators.length > 0) {
      items.push({
        severity: "critical",
        category: "Recipes",
        message: `${formatCount(errorGenerators.length, "recipe")} failed`,
        count: errorGenerators.length,
        ctaLabel: "Inspect recipes",
        action: "generators",
      });
    }

    // ── Warning ───────────────────────────────────────────────────────────────
    if (lintWarnings > 0) {
      items.push({
        severity: "warning",
        category: "Lint",
        message: `${formatCount(lintWarnings, "lint warning")} in the current set`,
        count: lintWarnings,
        ctaLabel: "Review lint",
        action: "lint",
      });
    }

    if (activeIssues) {
      const warnsByRule = new Map<string, number>();
      for (const issue of activeIssues) {
        if (issue.severity === "warning") {
          warnsByRule.set(issue.rule, (warnsByRule.get(issue.rule) ?? 0) + 1);
        }
      }
      for (const [rule, count] of [...warnsByRule.entries()].sort(
        (a, b) => b[1] - a[1],
      )) {
        const meta = getRuleLabel(rule);
        items.push({
          severity: "warning",
          category: meta?.label ?? rule,
          message: `${formatCount(count, "token")} affected`,
          count,
          ctaLabel: getValidationPriorityCtaLabel(rule),
          action: "validation-scroll",
        });
      }
    }

    if (totalDuplicateAliases > 0) {
      items.push({
        severity: "warning",
        category: "Duplicates",
        message: `${formatCount(totalDuplicateAliases, "redundant value")} detected`,
        count: totalDuplicateAliases,
        ctaLabel: "Review duplicates",
        action: "duplicates-scroll",
      });
    }

    if (staleGenerators.length > 0) {
      items.push({
        severity: "warning",
        category: "Recipes",
        message: `${formatCount(staleGenerators.length, "recipe")} stale`,
        count: staleGenerators.length,
        ctaLabel: "Run recipes",
        action: "generators",
      });
    }

    if (heatmapResult && heatmapResult.red > 0) {
      items.push({
        severity: "warning",
        category: "Canvas",
        message: `${formatCount(heatmapResult.red, "unbound layer")} on canvas`,
        count: heatmapResult.red,
        ctaLabel: "Fix bindings",
        action: "canvas",
      });
    }

    // ── Info ──────────────────────────────────────────────────────────────────
    if (aliasOpportunityGroups.length > 0) {
      items.push({
        severity: "info",
        category: "Alias",
        message: `${formatCount(aliasOpportunityGroups.length, "shared-alias opportunity", "shared-alias opportunities")} detected`,
        count: aliasOpportunityGroups.length,
        ctaLabel: "Promote aliases",
        action: "alias-opportunities-scroll",
      });
    }

    if (hasUsageData && unusedCount > 0) {
      items.push({
        severity: "info",
        category: "Unused",
        message: `${formatCount(unusedCount, "unused token")} ready for cleanup`,
        count: unusedCount,
        ctaLabel: "Review unused",
        action: "unused-scroll",
      });
    }

    return items;
  })();

  const summaryCounts = priorityIssues.reduce(
    (counts, issue) => {
      counts[issue.severity] += issue.count;
      return counts;
    },
    { critical: 0, warning: 0, info: 0 },
  );

  const totalAllIssues = priorityIssues
    .filter((i) => i.severity !== "info")
    .reduce((sum, i) => sum + i.count, 0);

  const resolveIssueAction = (action: PriorityIssue["action"]) => {
    switch (action) {
      case "lint":
        return () => onNavigateTo("define", "tokens");
      case "generators":
        return () => onNavigateTo("define", "generators");
      case "canvas":
        return () => {
          onNavigateTo("apply", "canvas-analysis");
          if (!heatmapResult) onTriggerHeatmap();
        };
      case "validation-scroll":
        return () =>
          document
            .getElementById("health-validation-section")
            ?.scrollIntoView({ behavior: "smooth" });
      case "alias-opportunities-scroll":
        return () =>
          document
            .getElementById("health-alias-opportunities-section")
            ?.scrollIntoView({ behavior: "smooth" });
      case "deprecated-scroll":
        return () =>
          document
            .getElementById("health-deprecated-section")
            ?.scrollIntoView({ behavior: "smooth" });
      case "duplicates-scroll":
        return () =>
          document
            .getElementById("health-duplicates-section")
            ?.scrollIntoView({ behavior: "smooth" });
      case "unused-scroll":
        return () =>
          document
            .getElementById("health-unused-section")
            ?.scrollIntoView({ behavior: "smooth" });
    }
  };

  function formatValidatedAt(date: Date): string {
    const diffMs = Date.now() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "just now";
    if (diffMin === 1) return "1 min ago";
    if (diffMin < 60) return `${diffMin} min ago`;
    return `at ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Body */}
      <div
        className="flex-1 overflow-y-auto px-3 py-3"
        style={{ scrollbarWidth: "thin" }}
      >
        {!connected ? (
          <div className="flex flex-col items-center justify-center gap-2 py-3 text-center">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-[var(--color-figma-text-secondary)]"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p className="text-[11px] text-[var(--color-figma-text-secondary)]">
              Connect to the token server to run validation
            </p>
          </div>
        ) : (
          <>
            {validationIsStale && (
              <NoticeBanner severity="stale" className="mb-3">
                Audit results are outdated. Token data changed after the last
                check, so review findings with caution until you refresh from
                the shell header.
              </NoticeBanner>
            )}

            {_validationError && (
              <NoticeBanner severity="error" className="mb-3">
                {_validationError}
              </NoticeBanner>
            )}

            <section className="rounded border border-[var(--color-figma-border)] mb-3 overflow-hidden">
              <div className="flex items-center justify-between gap-2 px-3 py-2.5 bg-[var(--color-figma-bg-secondary)]/35">
                <div className="flex items-center gap-2 min-w-0">
                  {validationIssuesProp !== null && (
                    <span className={statusColor(overallStatus)}>
                      <StatusIcon status={overallStatus} />
                    </span>
                  )}
                  <span className="text-[11px] font-semibold text-[var(--color-figma-text)]">
                    {validationIssuesProp === null
                      ? "Run the audit to check library health"
                      : overallStatus === "healthy"
                        ? "All clear"
                        : `${totalAllIssues} active issue${totalAllIssues !== 1 ? "s" : ""}`}
                  </span>
                  {validating && (
                    <NoticePill severity="info">Auditing…</NoticePill>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {summaryCounts.critical > 0 && (
                    <NoticePill severity="error">
                      {summaryCounts.critical} critical
                    </NoticePill>
                  )}
                  {summaryCounts.warning > 0 && (
                    <NoticePill severity="warning">
                      {summaryCounts.warning} warning
                    </NoticePill>
                  )}
                  {summaryCounts.info > 0 && (
                    <NoticePill severity="info">
                      {summaryCounts.info} info
                    </NoticePill>
                  )}
                </div>
              </div>

              {priorityIssues.length > 0 && (
                <div className="divide-y divide-[var(--color-figma-border)] border-t border-[var(--color-figma-border)]">
                  {priorityIssues.map((issue) => (
                    <div
                      key={`${issue.severity}:${issue.category}:${issue.message}`}
                      className="flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                    >
                      <span className={`shrink-0 ${statusColor(
                        issue.severity === "critical"
                          ? "critical"
                          : issue.severity === "warning"
                            ? "warning"
                            : "healthy",
                      )}`}>
                        <StatusIcon
                          status={
                            issue.severity === "critical"
                              ? "critical"
                              : issue.severity === "warning"
                                ? "warning"
                                : "healthy"
                          }
                        />
                      </span>
                      <span className="text-[10px] font-medium text-[var(--color-figma-text)] flex-1 min-w-0 truncate">
                        {issue.category}
                        <span className="font-normal text-[var(--color-figma-text-secondary)]">
                          {" \u2014 "}{issue.message}
                        </span>
                      </span>
                      <button
                        onClick={resolveIssueAction(issue.action)}
                        className="shrink-0 text-[10px] font-medium text-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent-hover)] transition-colors whitespace-nowrap"
                      >
                        {issue.ctaLabel}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {lastRefreshed && (
                <div className="px-3 py-1.5 border-t border-[var(--color-figma-border)] text-[10px] text-[var(--color-figma-text-tertiary)]">
                  Last checked {formatValidatedAt(lastRefreshed)}
                </div>
              )}
            </section>

            {/* Validation Issues */}
            {validationIssuesProp !== null && (
              <div
                id="health-validation-section"
                className="rounded border border-[var(--color-figma-border)] overflow-hidden mb-2"
              >
                <div className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <button
                      onClick={() =>
                        setValidationReportExpanded((current) => !current)
                      }
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      aria-expanded={validationReportExpanded}
                    >
                      <svg
                        width="8"
                        height="8"
                        viewBox="0 0 8 8"
                        fill="currentColor"
                        className={`shrink-0 transition-transform ${validationReportExpanded ? "rotate-90" : ""}`}
                        aria-hidden="true"
                      >
                        <path d="M2 1l4 3-4 3V1z" />
                      </svg>
                      <div className="flex min-w-0 flex-1 items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-semibold text-[var(--color-figma-text)]">
                          Audit report
                        </span>
                        {validationIsStale && (
                          <NoticePill severity="stale">Stale</NoticePill>
                        )}
                        {(activeIssues?.length ?? 0) === 0 ? (
                          <NoticePill severity="success">All clear</NoticePill>
                        ) : null}
                      </div>
                    </button>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {lastRefreshed ? (
                        <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">
                          Updated {formatValidatedAt(lastRefreshed)}
                        </span>
                      ) : null}
                      {(["all", "error", "warning", "info"] as const).map((f) => {
                        const filterSeverity: NoticeSeverity =
                          f === "all" ? "info" : f;
                        const isActive = severityFilter === f;
                        const label =
                          severityCounts && f !== "all"
                            ? `${f} (${severityCounts[f]})`
                            : f;
                        return (
                          <button
                            key={f}
                            onClick={() => setSeverityFilter(f)}
                            className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                              isActive
                                ? `${severityStyles(filterSeverity).pill} border-current/20`
                                : "border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                      <button
                        onClick={() =>
                          setValidationToolsExpanded((current) => !current)
                        }
                        className="text-[10px] px-2 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                        aria-expanded={validationToolsExpanded}
                      >
                        Tools
                      </button>
                    </div>
                  </div>

                  {validationToolsExpanded && (
                    <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]/45">
                      <button
                        onClick={() => {
                          const issues = validationIssuesProp ?? [];
                          const lines: string[] = [
                            `# Validation Report — ${issues.length} issue${issues.length !== 1 ? "s" : ""}\n`,
                          ];
                          for (const sev of [
                            "error",
                            "warning",
                            "info",
                          ] as const) {
                            const group = issues.filter(
                              (i) => i.severity === sev,
                            );
                            if (group.length === 0) continue;
                            lines.push(
                              `## ${sev.charAt(0).toUpperCase() + sev.slice(1)}s (${group.length})`,
                            );
                            for (const issue of group) {
                              lines.push(
                                `- **${issue.path}** (set: ${issue.setName}): ${issue.message}${issue.suggestedFix ? ` — Fix: ${issue.suggestedFix}` : ""}`,
                              );
                            }
                            lines.push("");
                          }
                          navigator.clipboard
                            .writeText(lines.join("\n"))
                            .then(() => {
                              setValidationCopied(true);
                              setTimeout(() => setValidationCopied(false), 1500);
                            });
                        }}
                        className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                      >
                        {validationCopied ? "Copied!" : "Copy MD"}
                      </button>
                      <button
                        onClick={() => {
                          const issues = validationIssuesProp ?? [];
                          const payload = {
                            generatedAt: new Date().toISOString(),
                            total: issues.length,
                            issues: issues.map((i) => ({
                              severity: i.severity,
                              rule: i.rule,
                              set: i.setName,
                              path: i.path,
                              message: i.message,
                              ...(i.suggestedFix
                                ? { suggestedFix: i.suggestedFix }
                                : {}),
                            })),
                          };
                          const blob = new Blob(
                            [JSON.stringify(payload, null, 2)],
                            { type: "application/json" },
                          );
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = "validation-report.json";
                          a.click();
                          URL.revokeObjectURL(url);
                          setValidationExported("json");
                          setTimeout(() => setValidationExported(null), 1500);
                        }}
                        className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                      >
                        {validationExported === "json" ? "Saved!" : "JSON"}
                      </button>
                      <button
                        onClick={() => {
                          const issues = validationIssuesProp ?? [];
                          const header =
                            "severity,rule,set,path,message,suggestedFix";
                          const escape = (s: string) =>
                            `"${s.replace(/"/g, '""')}"`;
                          const rows = issues.map((i) =>
                            [
                              i.severity,
                              i.rule,
                              i.setName,
                              i.path,
                              i.message,
                              i.suggestedFix ?? "",
                            ]
                              .map(escape)
                              .join(","),
                          );
                          const blob = new Blob(
                            [[header, ...rows].join("\n")],
                            {
                              type: "text/csv",
                            },
                          );
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = "validation-report.csv";
                          a.click();
                          URL.revokeObjectURL(url);
                          setValidationExported("csv");
                          setTimeout(() => setValidationExported(null), 1500);
                        }}
                        className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                      >
                        {validationExported === "csv" ? "Saved!" : "CSV"}
                      </button>
                    </div>
                  )}
                </div>

                {validationReportExpanded && filteredIssues && filteredIssues.length === 0 ? (
                  <div className="px-3 py-6 text-center">
                    <div className="text-[11px] text-[var(--color-figma-text-secondary)]">
                      {(activeIssues?.length ?? 0) === 0
                        ? "No validation issues found"
                        : "No issues match this filter"}
                    </div>
                  </div>
                ) : validationReportExpanded ? (
                  <div className="max-h-64 overflow-y-auto">
                    {issueGroups.map((group) => {
                      const isCollapsed = collapsedRules.has(group.rule);
                      return (
                        <div key={group.rule}>
                          <div className="group/ruleheader flex items-center bg-[var(--color-figma-bg-secondary)]/50 border-y border-[var(--color-figma-border)]">
                            <button
                              onClick={() =>
                                setCollapsedRules((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(group.rule))
                                    next.delete(group.rule);
                                  else next.add(group.rule);
                                  return next;
                                })
                              }
                              className="flex-1 flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--color-figma-bg-hover)] transition-colors min-w-0"
                            >
                              <svg
                                width="8"
                                height="8"
                                viewBox="0 0 8 8"
                                fill="currentColor"
                                className={`transition-transform shrink-0 ${isCollapsed ? "" : "rotate-90"}`}
                                aria-hidden="true"
                              >
                                <path d="M2 1l4 3-4 3V1z" />
                              </svg>
                              <NoticePill
                                severity={group.severity as NoticeSeverity}
                              >
                                {group.severity === "error"
                                  ? "Error"
                                  : group.severity === "warning"
                                    ? "Warn"
                                    : "Info"}
                              </NoticePill>
                              <span className="text-[10px] font-medium text-[var(--color-figma-text)] flex-1 text-left">
                                {group.label}
                              </span>
                              <span className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0">
                                {group.issues.length}
                              </span>
                            </button>
                          </div>
                          {!isCollapsed && group.tip && (
                            <div className="px-3 py-1 text-[10px] text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-bg-secondary)]/30 border-b border-[var(--color-figma-border)] flex items-center gap-1">
                              <svg
                                width="8"
                                height="8"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                                className="shrink-0 opacity-50"
                              >
                                <circle cx="12" cy="12" r="10" />
                                <path d="M12 16v-4M12 8h.01" />
                              </svg>
                              {group.tip}
                            </div>
                          )}
                          {!isCollapsed &&
                            (() => {
                              const visibleLimit =
                                issueGroupVisibleCounts[group.rule] ??
                                ISSUES_PER_PAGE;
                              const visibleIssues = group.issues.slice(
                                0,
                                visibleLimit,
                              );
                              const remainingCount =
                                group.issues.length - visibleLimit;
                              return (
                                <>
                                  {visibleIssues.map((issue, i) => (
                                    <div
                                      key={i}
                                      className="group px-3 py-1.5 flex items-center gap-2 border-b border-[var(--color-figma-border)] last:border-b-0"
                                    >
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-baseline gap-1.5 flex-wrap">
                                          <span className="text-[10px] text-[var(--color-figma-text)] font-medium font-mono truncate">
                                            {issue.path}
                                          </span>
                                          <span className="text-[10px] text-[var(--color-figma-text-secondary)] opacity-60 shrink-0">
                                            {issue.setName}
                                          </span>
                                        </div>
                                        <div className="text-[10px] text-[var(--color-figma-text-secondary)] mt-0.5">
                                          {issue.message}
                                        </div>
                                      </div>
                                      {(issue.suggestedFix ===
                                        "add-description" ||
                                        ((issue.suggestedFix ===
                                          "flatten-alias-chain" ||
                                          issue.suggestedFix ===
                                            "extract-to-alias") &&
                                          !!issue.suggestion) ||
                                        issue.suggestedFix === "delete-token" ||
                                        (issue.suggestedFix ===
                                          "rename-token" &&
                                          !!issue.suggestion) ||
                                        (issue.suggestedFix === "fix-type" &&
                                          !!issue.suggestion)) && (
                                        <button
                                          onClick={() => applyIssueFix(issue)}
                                          disabled={fixingKeys.has(
                                            suppressKey(issue),
                                          )}
                                          className={`text-[10px] px-2 py-0.5 rounded border shrink-0 disabled:opacity-40 disabled:cursor-wait ${issue.suggestedFix === "delete-token" ? "border-[var(--color-figma-error)] bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/15" : "border-[var(--color-figma-success,#34a853)] bg-[var(--color-figma-success,#34a853)]/10 text-[var(--color-figma-success,#34a853)] hover:bg-[var(--color-figma-success,#34a853)]/15"}`}
                                        >
                                          {fixingKeys.has(suppressKey(issue))
                                            ? "…"
                                            : issue.suggestedFix ===
                                                "add-description"
                                              ? "Add desc"
                                              : issue.suggestedFix ===
                                                  "flatten-alias-chain"
                                                ? "Flatten"
                                                : issue.suggestedFix ===
                                                    "extract-to-alias"
                                                  ? "Make alias"
                                                  : issue.suggestedFix ===
                                                      "delete-token"
                                                    ? "Delete"
                                                    : issue.suggestedFix ===
                                                        "rename-token"
                                                      ? "Rename"
                                                      : "Fix type"}
                                        </button>
                                      )}
                                      <button
                                        onClick={() => handleSuppress(issue)}
                                        disabled={
                                          suppressedKeys.has(
                                            suppressKey(issue),
                                          ) ||
                                          suppressingKey === suppressKey(issue)
                                        }
                                        title="Suppress this violation — hide it from the report"
                                        className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] shrink-0 disabled:opacity-40 disabled:cursor-wait"
                                      >
                                        {suppressingKey === suppressKey(issue)
                                          ? "…"
                                          : "Suppress"}
                                      </button>
                                      {onNavigateToToken && (
                                        <button
                                          onClick={() =>
                                            onNavigateToToken(
                                              issue.path,
                                              issue.setName,
                                            )
                                          }
                                          className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)] transition-colors shrink-0"
                                        >
                                          Open
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                  {remainingCount > 0 && (
                                    <button
                                      onClick={() =>
                                        setIssueGroupVisibleCounts((prev) => ({
                                          ...prev,
                                          [group.rule]:
                                            visibleLimit +
                                            Math.min(
                                              remainingCount,
                                              ISSUES_PER_PAGE,
                                            ),
                                        }))
                                      }
                                      className="w-full px-3 py-1.5 text-[10px] text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-bg-hover)] transition-colors text-center border-b border-[var(--color-figma-border)]"
                                    >
                                      Show{" "}
                                      {Math.min(
                                        remainingCount,
                                        ISSUES_PER_PAGE,
                                      )}{" "}
                                      more
                                      {remainingCount > ISSUES_PER_PAGE
                                        ? ` of ${remainingCount} remaining`
                                        : ""}
                                    </button>
                                  )}
                                </>
                              );
                            })()}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            )}

            {/* Suppressed Issues */}
            {suppressedKeys.size > 0 && (
              <div className="rounded border border-[var(--color-figma-border)] overflow-hidden mb-2">
                <button
                  onClick={() => setShowSuppressed((v) => !v)}
                  className="w-full px-3 py-2 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between text-[10px] text-[var(--color-figma-text-secondary)] font-medium"
                >
                  <span className="flex items-center gap-1.5">
                    Suppressed Issues
                    <span className="ml-1 px-1.5 py-0.5 rounded bg-[var(--color-figma-bg-hover)] font-mono normal-case">
                      {suppressedKeys.size}
                    </span>
                  </span>
                  <svg
                    width="8"
                    height="8"
                    viewBox="0 0 8 8"
                    fill="currentColor"
                    className={`transition-transform ${showSuppressed ? "rotate-90" : ""}`}
                    aria-hidden="true"
                  >
                    <path d="M2 1l4 3-4 3V1z" />
                  </svg>
                </button>
                {showSuppressed && (
                  <div>
                    <div className="px-3 py-1.5 text-[10px] text-[var(--color-figma-text-secondary)] border-b border-[var(--color-figma-border)]">
                      These violations are hidden from the report. Click{" "}
                      <strong>Unsuppress</strong> to re-enable.
                    </div>
                    <div className="divide-y divide-[var(--color-figma-border)] max-h-48 overflow-y-auto">
                      {[...suppressedKeys].map((key) => {
                        const [rule, setName, ...pathParts] = key.split(":");
                        const path = pathParts.join(":");
                        const meta = getRuleLabel(rule);
                        return (
                          <div
                            key={key}
                            className="group flex items-center gap-2 px-3 py-1.5"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline gap-1.5 flex-wrap">
                                <span className="text-[10px] font-mono text-[var(--color-figma-text)] truncate">
                                  {path}
                                </span>
                                <span className="text-[10px] text-[var(--color-figma-text-secondary)] opacity-60 shrink-0">
                                  {setName}
                                </span>
                              </div>
                              <div
                                className="text-[10px] text-[var(--color-figma-text-secondary)] opacity-70"
                                title={meta?.tip}
                              >
                                {meta?.label ?? rule}
                              </div>
                            </div>
                            <button
                              onClick={() => handleUnsuppress(key)}
                              disabled={suppressingKey === key}
                              className="opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity text-[10px] px-1.5 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-error)] hover:text-[var(--color-figma-error)] shrink-0 disabled:opacity-40 disabled:cursor-wait"
                              title="Remove suppression — show this violation again"
                            >
                              {suppressingKey === key ? "…" : "Unsuppress"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Unused Tokens */}
            <div id="health-unused-section">
              <UnusedTokensPanel
                serverUrl={serverUrl}
                unusedTokens={unusedTokens}
                hasUsageData={hasUsageData}
                unusedCount={unusedCount}
                onNavigateToToken={onNavigateToToken}
                onError={onError}
                onMutate={() => setReloadKey((k) => k + 1)}
              />
            </div>

            <div id="health-deprecated-section">
              <div className="rounded border border-[var(--color-figma-border)] overflow-hidden mb-2">
                <div className="px-3 py-2 bg-[var(--color-figma-bg-secondary)] flex items-center gap-2">
                  <span className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">
                    Deprecated in use
                  </span>
                  {deprecatedUsageLoading ? (
                    <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">
                      Loading…
                    </span>
                  ) : deprecatedUsageEntries.length > 0 ? (
                    <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">
                      {deprecatedUsageEntries.length} token{deprecatedUsageEntries.length === 1 ? "" : "s"}
                    </span>
                  ) : (
                    <NoticePill severity="success">All clear</NoticePill>
                  )}
                </div>
                {deprecatedUsageLoading ? (
                  <div className="px-3 py-6 text-center text-[11px] text-[var(--color-figma-text-secondary)]">
                    Loading deprecated usage…
                  </div>
                ) : deprecatedUsageError ? (
                  <div className="px-3 py-3 text-[10px] text-[var(--color-figma-error)]">
                    {deprecatedUsageError}
                  </div>
                ) : deprecatedUsageEntries.length === 0 ? (
                  <div className="px-3 py-6 text-center text-[11px] text-[var(--color-figma-text-secondary)]">
                    No deprecated tokens have active alias references.
                  </div>
                ) : (
                  <div className="divide-y divide-[var(--color-figma-border)]">
                    {deprecatedUsageEntries.map((entry) => {
                      const selectedReplacement =
                        deprecatedReplacementPaths[entry.deprecatedPath];
                      const isPickerOpen =
                        openDeprecatedPickerPath === entry.deprecatedPath;
                      const isReplacing =
                        replacingDeprecatedPath === entry.deprecatedPath;
                      const dependentPreview = entry.dependents.slice(0, 3);
                      const remainingDependents =
                        entry.dependents.length - dependentPreview.length;
                      return (
                        <div
                          key={entry.deprecatedPath}
                          className="px-3 py-2.5"
                        >
                          <div className="flex items-start gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline gap-1.5 flex-wrap">
                                <span className="text-[10px] font-medium font-mono text-[var(--color-figma-text)] line-through">
                                  {entry.deprecatedPath}
                                </span>
                                <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                                  {entry.type} ·{" "}
                                  {formatCount(
                                    entry.activeReferenceCount,
                                    "active reference",
                                  )}
                                </span>
                              </div>
                              <div className="mt-0.5 text-[10px] text-[var(--color-figma-text-secondary)]">
                                {dependentPreview.map((dependent, index) => (
                                  <span
                                    key={`${dependent.setName}:${dependent.path}`}
                                  >
                                    {index > 0 ? ", " : ""}
                                    <span className="font-mono text-[var(--color-figma-text)]">
                                      {dependent.path}
                                    </span>{" "}
                                    <span className="opacity-70">
                                      ({dependent.setName})
                                    </span>
                                  </span>
                                ))}
                                {remainingDependents > 0 && (
                                  <span>
                                    {dependentPreview.length > 0 ? ", " : ""}
                                    and {remainingDependents} more
                                  </span>
                                )}
                              </div>
                              {selectedReplacement && (
                                <div className="mt-1.5 text-[10px] text-[var(--color-figma-text-secondary)]">
                                  Replace with{" "}
                                  <span className="font-mono text-[var(--color-figma-text)]">
                                    {selectedReplacement}
                                  </span>
                                </div>
                              )}
                              {isPickerOpen && (
                                <div className="mt-2 max-w-xl">
                                  <TokenPickerDropdown
                                    allTokensFlat={allTokensFlat}
                                    pathToSet={pathToSet}
                                    filterType={
                                      entry.type === "unknown"
                                        ? undefined
                                        : entry.type
                                    }
                                    excludePaths={[entry.deprecatedPath]}
                                    placeholder="Search replacement token…"
                                    onSelect={(path) => {
                                      setDeprecatedReplacementPaths((prev) => ({
                                        ...prev,
                                        [entry.deprecatedPath]: path,
                                      }));
                                      setOpenDeprecatedPickerPath(null);
                                    }}
                                    onClose={() =>
                                      setOpenDeprecatedPickerPath(null)
                                    }
                                  />
                                </div>
                              )}
                            </div>
                            <div className="shrink-0 flex flex-col items-end gap-1.5">
                              {selectedReplacement ? (
                                <>
                                  <button
                                    onClick={() =>
                                      handleReplaceDeprecatedReferences(entry)
                                    }
                                    disabled={isReplacing}
                                    className="rounded bg-[var(--color-figma-accent)] px-2 py-1 text-[10px] font-medium text-white transition-colors hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
                                  >
                                    {isReplacing
                                      ? "Replacing…"
                                      : "Replace references"}
                                  </button>
                                  <button
                                    onClick={() =>
                                      setOpenDeprecatedPickerPath(
                                        entry.deprecatedPath,
                                      )
                                    }
                                    disabled={isReplacing}
                                    className="text-[10px] px-2 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)] disabled:opacity-40"
                                  >
                                    Change
                                  </button>
                                </>
                              ) : isPickerOpen ? (
                                <button
                                  onClick={() =>
                                    setOpenDeprecatedPickerPath(null)
                                  }
                                  className="text-[10px] px-2 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-text)] hover:text-[var(--color-figma-text)]"
                                >
                                  Cancel
                                </button>
                              ) : (
                                <button
                                  onClick={() =>
                                    setOpenDeprecatedPickerPath(
                                      entry.deprecatedPath,
                                    )
                                  }
                                  className="text-[10px] px-2 py-1 rounded border border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/10 transition-colors"
                                >
                                  Replace references
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div id="health-alias-opportunities-section">
              <div className="rounded border border-[var(--color-figma-border)] overflow-hidden mb-2">
                <div className="px-3 py-2 bg-[var(--color-figma-bg-secondary)] flex items-center gap-2">
                  <span className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">
                    Alias Opportunities
                  </span>
                  {aliasOpportunityGroups.length > 0 ? (
                    <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">
                      {aliasOpportunityGroups.length} group{aliasOpportunityGroups.length === 1 ? "" : "s"}
                    </span>
                  ) : (
                    <NoticePill severity="success">All clear</NoticePill>
                  )}
                </div>
                {aliasOpportunityGroups.length === 0 ? (
                  <div className="px-3 py-6 text-center text-[11px] text-[var(--color-figma-text-secondary)]">
                    No alias-opportunity groups in the latest audit.
                  </div>
                ) : (
                  <div className="divide-y divide-[var(--color-figma-border)]">
                    {aliasOpportunityGroups.map((group) => {
                      const isPromoting = promotingAliasGroupId === group.id;
                      return (
                        <div
                          key={group.id}
                          className="flex items-start gap-2 px-3 py-2.5"
                        >
                          {group.colorHex && (
                            <div
                              className="mt-0.5 h-4 w-4 shrink-0 rounded border border-[var(--color-figma-border)]"
                              style={{ background: group.colorHex }}
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-[10px] font-medium font-mono text-[var(--color-figma-text)]">
                                {group.valueLabel}
                              </span>
                              <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                                {group.typeLabel} · {group.tokens.length} tokens
                              </span>
                            </div>
                            <div className="mt-0.5 text-[10px] text-[var(--color-figma-text-secondary)]">
                              Promote to{" "}
                              <span className="font-mono text-[var(--color-figma-text)]">
                                {group.suggestedPrimitivePath}
                              </span>
                              {" "}in{" "}
                              <span className="font-mono text-[var(--color-figma-text)]">
                                {group.suggestedPrimitiveSet}
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() =>
                              handlePromoteAliasOpportunity(group)
                            }
                            disabled={isPromoting}
                            className="shrink-0 rounded bg-[var(--color-figma-accent)] px-2 py-1 text-[10px] font-medium text-white transition-colors hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
                          >
                            {isPromoting ? "Promoting…" : "Promote"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Duplicate Detection */}
            <div id="health-duplicates-section">
              <DuplicateDetectionPanel
                serverUrl={serverUrl}
                lintDuplicateGroups={lintDuplicateGroups}
                totalDuplicateAliases={totalDuplicateAliases}
                onNavigateToToken={onNavigateToToken}
                onError={onError}
                onMutate={() => setReloadKey((k) => k + 1)}
                onRefreshValidation={onRefreshValidation}
              />
            </div>

            {/* Color Contrast Matrix */}
            <ContrastMatrixPanel
              colorTokens={colorTokens}
              dimensions={dimensions}
              allTokensFlat={allTokensFlat}
              pathToSet={pathToSet}
              onNavigateToToken={onNavigateToToken}
            />

            {/* Color Scale Lightness Inspector */}
            <LightnessInspectorPanel
              colorScales={colorScales}
              onNavigateToToken={
                onNavigateToToken
                  ? (path) => {
                      const setName = pathToSet[path];
                      if (!setName) return;
                      onNavigateToToken(path, setName);
                    }
                  : undefined
              }
            />
          </>
        )}
      </div>
    </div>
  );
}

/** Computes a single health issue count for use in status badges outside the panel. */
export function computeHealthIssueCount(
  lintViolations: LintViolation[],
  generators: TokenGenerator[],
  validationSummary?: ValidationSummary | null,
): number {
  const lintCount = lintViolations.filter(
    (v) => v.severity === "error" || v.severity === "warning",
  ).length;
  const validationCount = validationSummary
    ? validationSummary.errors + validationSummary.warnings
    : 0;
  const genIssues = generators.filter(
    (g) => g.isStale || g.lastRunError,
  ).length;
  return lintCount + validationCount + genIssues;
}
