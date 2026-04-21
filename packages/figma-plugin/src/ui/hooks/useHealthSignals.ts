import { useMemo } from "react";
import type { ValidationIssue } from "./useValidationCache";
import type { LintViolation } from "./useLint";
import type { TokenGenerator } from "./useGenerators";

export type HealthSeverity = "error" | "warning" | "info";
export type HealthSource = "validation" | "lint" | "generator";

export interface HealthSignal {
  rule: string;
  path: string;
  collectionId: string;
  severity: HealthSeverity;
  message: string;
  source: HealthSource;
  suggestedFix?: string;
  suggestion?: string;
  group?: string;
}

export interface CollectionHealthSummary {
  errors: number;
  warnings: number;
  info: number;
  actionable: number;
  severity: HealthSeverity | null;
}

/**
 * Rules that are surfaced as dedicated Health categories (Consolidate, Duplicates)
 * rather than row-level issues. They should not inflate the primary issue count.
 */
const CATEGORY_ONLY_RULES = new Set(["no-duplicate-values", "alias-opportunity"]);

const EMPTY_SUMMARY: CollectionHealthSummary = {
  errors: 0,
  warnings: 0,
  info: 0,
  actionable: 0,
  severity: null,
};

export interface HealthSignalsResult {
  signals: HealthSignal[];
  byCollection: Map<string, CollectionHealthSummary>;
  byTokenPath: Map<string, HealthSignal[]>;
  currentCollection: CollectionHealthSummary;
  lintViolationsForCurrent: LintViolation[];
  totals: CollectionHealthSummary;
}

export function useHealthSignals(params: {
  validationIssues: ValidationIssue[] | null;
  lintViolations: LintViolation[];
  generators: TokenGenerator[];
  currentCollectionId: string;
}): HealthSignalsResult {
  const { validationIssues, lintViolations, generators, currentCollectionId } = params;

  return useMemo(() => {
    const severityRank = (s: HealthSeverity) =>
      s === "error" ? 3 : s === "warning" ? 2 : 1;
    const dedup = new Map<string, HealthSignal>();
    const consider = (signal: HealthSignal) => {
      const key = `${signal.rule}|${signal.collectionId}|${signal.path}`;
      const existing = dedup.get(key);
      if (!existing || severityRank(signal.severity) > severityRank(existing.severity)) {
        dedup.set(key, signal);
      }
    };

    for (const v of validationIssues ?? []) {
      consider({
        rule: v.rule,
        path: v.path,
        collectionId: v.collectionId,
        severity: v.severity,
        message: v.message,
        source: "validation",
        suggestedFix: v.suggestedFix,
        suggestion: v.suggestion,
        group: v.group,
      });
    }

    for (const v of lintViolations) {
      consider({
        rule: v.rule,
        path: v.path,
        collectionId: v.collectionId,
        severity: v.severity,
        message: v.message,
        source: "lint",
        suggestedFix: v.suggestedFix,
        suggestion: v.suggestion,
        group: v.group,
      });
    }

    for (const g of generators) {
      const cid = g.targetCollection;
      if (!cid) continue;
      const targetPath = g.targetGroup ?? "";
      if (g.lastRunError && !g.lastRunError.blockedBy) {
        consider({
          rule: "generator-error",
          path: targetPath,
          collectionId: cid,
          severity: "error",
          message: g.lastRunError.message || `Generator "${g.name}" failed to run.`,
          source: "generator",
        });
      } else if (g.isStale) {
        consider({
          rule: "generator-stale",
          path: targetPath,
          collectionId: cid,
          severity: "warning",
          message: g.staleReason || `Generator "${g.name}" is out of date.`,
          source: "generator",
        });
      }
    }

    const signals = [...dedup.values()];

    const byCollection = new Map<string, CollectionHealthSummary>();
    const byTokenPath = new Map<string, HealthSignal[]>();
    const bump = (cid: string, s: HealthSignal) => {
      const entry = byCollection.get(cid) ?? {
        errors: 0,
        warnings: 0,
        info: 0,
        actionable: 0,
        severity: null as HealthSeverity | null,
      };
      if (s.severity === "error") entry.errors += 1;
      else if (s.severity === "warning") entry.warnings += 1;
      else entry.info += 1;
      const isActionable = !CATEGORY_ONLY_RULES.has(s.rule) && s.severity !== "info";
      if (isActionable) entry.actionable += 1;
      if (s.severity === "error") entry.severity = "error";
      else if (s.severity === "warning" && entry.severity !== "error") entry.severity = "warning";
      else if (s.severity === "info" && entry.severity === null) entry.severity = "info";
      byCollection.set(cid, entry);
    };

    for (const s of signals) {
      bump(s.collectionId, s);
      if (s.path && s.collectionId === currentCollectionId) {
        const list = byTokenPath.get(s.path) ?? [];
        list.push(s);
        byTokenPath.set(s.path, list);
      }
    }

    const currentCollection = byCollection.get(currentCollectionId) ?? EMPTY_SUMMARY;
    const totals = signals.reduce<CollectionHealthSummary>(
      (acc, s) => {
        if (s.severity === "error") acc.errors += 1;
        else if (s.severity === "warning") acc.warnings += 1;
        else acc.info += 1;
        if (!CATEGORY_ONLY_RULES.has(s.rule) && s.severity !== "info") acc.actionable += 1;
        if (s.severity === "error") acc.severity = "error";
        else if (s.severity === "warning" && acc.severity !== "error") acc.severity = "warning";
        else if (s.severity === "info" && acc.severity === null) acc.severity = "info";
        return acc;
      },
      { errors: 0, warnings: 0, info: 0, actionable: 0, severity: null },
    );

    const lintViolationsForCurrent: LintViolation[] = signals
      .filter(
        (s) =>
          s.collectionId === currentCollectionId &&
          s.path &&
          s.severity !== "info" &&
          !CATEGORY_ONLY_RULES.has(s.rule),
      )
      .map((s) => ({
        rule: s.rule,
        path: s.path,
        collectionId: s.collectionId,
        severity: s.severity,
        message: s.message,
        suggestedFix: s.suggestedFix,
        suggestion: s.suggestion,
      }));

    return {
      signals,
      byCollection,
      byTokenPath,
      currentCollection,
      lintViolationsForCurrent,
      totals,
    };
  }, [validationIssues, lintViolations, generators, currentCollectionId]);
}
