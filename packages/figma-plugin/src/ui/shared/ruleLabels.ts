import type { ValidationIssue } from "../hooks/useValidationCache";
import { LINT_RULE_BY_ID } from "./lintRules";

const VALIDATION_LABELS: Record<string, { label: string; tip: string }> = {
  "missing-type": { label: "Missing type", tip: "Add a $type for spec compliance" },
  "broken-alias": { label: "Broken reference", tip: "Referenced token missing — update or remove" },
  "circular-reference": { label: "Circular reference", tip: "Break the loop so the token resolves" },
  "max-alias-depth": { label: "Deep reference chain", tip: "Shorten the chain to the source token" },
  "references-deprecated-token": { label: "Deprecated token in use", tip: "Replace with a non-deprecated token" },
  "type-mismatch": { label: "Type / value mismatch", tip: "Value doesn't match declared $type" },
};

export function getRuleLabel(rule: string): { label: string; tip: string } {
  const validation = VALIDATION_LABELS[rule];
  if (validation) return validation;
  const lint = LINT_RULE_BY_ID[rule];
  if (lint) return { label: lint.label, tip: lint.tip };
  return { label: rule, tip: "" };
}

export function suppressKey(issue: Pick<ValidationIssue, "rule" | "collectionId" | "path">): string {
  return `${issue.rule}:${issue.collectionId}:${issue.path}`;
}

export function hasFix(issue: ValidationIssue): boolean {
  return (
    issue.suggestedFix === "add-description" ||
    ((issue.suggestedFix === "flatten-alias-chain" || issue.suggestedFix === "extract-to-alias") && !!issue.suggestion) ||
    issue.suggestedFix === "delete-token" ||
    (issue.suggestedFix === "rename-token" && !!issue.suggestion) ||
    (issue.suggestedFix === "fix-type" && !!issue.suggestion)
  );
}

export function fixLabel(fix: string | undefined): string {
  switch (fix) {
    case "add-description": return "Add desc";
    case "flatten-alias-chain": return "Flatten";
    case "extract-to-alias": return "Make alias";
    case "delete-token": return "Delete";
    case "rename-token": return "Rename";
    case "fix-type": return "Fix type";
    default: return "Fix";
  }
}
