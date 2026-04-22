import type { ValidationIssue } from "../hooks/useValidationCache";

const DIRECT_FIX_LABELS: Record<string, string> = {
  "add-description": "Add desc",
  "flatten-alias-chain": "Flatten",
  "extract-to-alias": "Make alias",
  "delete-token": "Delete",
  "rename-token": "Rename",
  "fix-type": "Fix type",
};

export function canApplyIssueFixDirectly(
  issue: Pick<ValidationIssue, "suggestedFix" | "suggestion">,
): boolean {
  switch (issue.suggestedFix) {
    case "add-description":
    case "delete-token":
      return true;
    case "flatten-alias-chain":
    case "extract-to-alias":
    case "rename-token":
    case "fix-type":
      return !!issue.suggestion;
    default:
      return false;
  }
}

export function getIssueFixLabel(fix: string | undefined): string {
  return fix ? DIRECT_FIX_LABELS[fix] ?? "Fix" : "Fix";
}

export function getUnsupportedIssueFixMessage(
  issue: Pick<ValidationIssue, "suggestedFix" | "rule">,
): string {
  switch (issue.suggestedFix) {
    case "replace-deprecated-reference":
      return "Deprecated references need a replacement token. Use the Deprecated Health view to choose one.";
    case "promote-to-shared-alias":
      return "Alias promotion needs a shared target path. Use the Suggested aliases Health view.";
    case undefined:
      return `Issue "${issue.rule}" does not provide an automatic fix.`;
    default:
      return `Issue fix "${issue.suggestedFix}" is not supported in this action.`;
  }
}
