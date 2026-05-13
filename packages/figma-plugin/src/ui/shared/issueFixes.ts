import type { ValidationIssue } from "../hooks/useValidationCache";

const DIRECT_FIX_LABELS: Record<string, string> = {
  "flatten-alias-chain": "Flatten",
  "extract-to-alias": "Make reference",
  "delete-token": "Delete",
  "rename-token": "Rename",
  "fix-type": "Fix type",
};

export function canApplyIssueFixDirectly(
  issue: Pick<ValidationIssue, "suggestedFix" | "suggestion">,
): boolean {
  switch (issue.suggestedFix) {
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
    case "add-description":
      return "Descriptions need authored text. Open the token and write a real description.";
    case "replace-deprecated-reference":
      return "Deprecated references need a replacement token. Use the Deprecated review view to choose one.";
    case "promote-to-shared-alias":
      return "Reference promotion needs a shared target path. Use the Suggested references review view.";
    case undefined:
      return `Issue "${issue.rule}" does not provide an automatic fix.`;
    default:
      return `Issue fix "${issue.suggestedFix}" is not supported in this action.`;
  }
}
