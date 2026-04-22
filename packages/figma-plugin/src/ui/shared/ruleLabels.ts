import type { ValidationIssue } from "../hooks/useValidationCache";
import { canApplyIssueFixDirectly, getIssueFixLabel } from "./issueFixes";
import { LINT_RULE_BY_ID } from "./lintRules";

const VALIDATION_LABELS: Record<string, { label: string; tip: string }> = {
  "missing-type": { label: "Missing type", tip: "Add a $type for spec compliance" },
  "broken-alias": { label: "Broken reference", tip: "Referenced token missing — update or remove" },
  "circular-reference": { label: "Circular reference", tip: "Break the loop so the token resolves" },
  "max-alias-depth": { label: "Deep reference chain", tip: "Shorten the chain to the source token" },
  "references-deprecated-token": { label: "Deprecated token in use", tip: "Replace with a non-deprecated token" },
  "type-mismatch": { label: "Type / value mismatch", tip: "Value doesn't match declared $type" },
};

function isSuppressKeyPart(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export function getRuleLabel(rule: string): { label: string; tip: string } {
  const validation = VALIDATION_LABELS[rule];
  if (validation) return validation;
  const lint = LINT_RULE_BY_ID[rule];
  if (lint) return { label: lint.label, tip: lint.tip };
  return { label: rule, tip: "" };
}

export function suppressKey(issue: Pick<ValidationIssue, "rule" | "collectionId" | "path">): string {
  return JSON.stringify([issue.rule, issue.collectionId, issue.path]);
}

export function parseSuppressKey(
  key: string,
): { rule: string; collectionId: string; path: string } | null {
  try {
    const parsed = JSON.parse(key) as unknown;
    if (!Array.isArray(parsed) || parsed.length !== 3) {
      return null;
    }
    const [rule, collectionId, path] = parsed;
    if (
      !isSuppressKeyPart(rule) ||
      !isSuppressKeyPart(collectionId) ||
      !isSuppressKeyPart(path)
    ) {
      return null;
    }
    return { rule, collectionId, path };
  } catch {
    return null;
  }
}

export function hasFix(issue: ValidationIssue): boolean {
  return canApplyIssueFixDirectly(issue);
}

export function fixLabel(fix: string | undefined): string {
  return getIssueFixLabel(fix);
}
