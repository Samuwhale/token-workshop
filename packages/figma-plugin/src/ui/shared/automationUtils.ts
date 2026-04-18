import type { TokenRecipe, RecipeType } from "../hooks/useRecipes";
import { getRecipeDashboardStatus } from "../hooks/useRecipes";

export type DashboardStatus = ReturnType<typeof getRecipeDashboardStatus>;
export type SimplifiedStatus = "ready" | "needsRun" | "error";

export function getAutomationTypeLabel(type: RecipeType): string {
  switch (type) {
    case "colorRamp":
      return "Color ramp";
    case "spacingScale":
      return "Spacing scale";
    case "typeScale":
      return "Type scale";
    case "opacityScale":
      return "Opacity scale";
    case "borderRadiusScale":
      return "Border radius";
    case "zIndexScale":
      return "Z-index scale";
    case "shadowScale":
      return "Shadow scale";
    case "customScale":
      return "Custom scale";
    case "accessibleColorPair":
      return "Accessible color pair";
    case "darkModeInversion":
      return "Dark mode inversion";
    default:
      return type;
  }
}

export function formatRelativeTimestamp(value?: string): string | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  const diffMinutes = Math.max(0, Math.round((Date.now() - time) / 60000));
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

export function getAutomationStatusDetail(recipe: TokenRecipe, status: DashboardStatus): string {
  if (status === "blocked") {
    const blockedBy = recipe.blockedByRecipes?.filter((dependency) => dependency.name) ?? [];
    if (blockedBy.length > 0) {
      return `${blockedBy.length} blocked`;
    }
  }
  if (recipe.lastRunError?.message) return recipe.lastRunError.message;
  if (recipe.lastRunSummary?.message) return recipe.lastRunSummary.message;
  if (recipe.staleReason) return recipe.staleReason;
  return "";
}

export function getSimplifiedStatus(status: DashboardStatus): SimplifiedStatus {
  switch (status) {
    case "upToDate":
      return "ready";
    case "stale":
    case "neverRun":
      return "needsRun";
    case "failed":
    case "blocked":
      return "error";
    default:
      return "needsRun";
  }
}

export function getStatusDotClass(simpleStatus: SimplifiedStatus, isPaused: boolean): string {
  if (isPaused) return "border-[var(--color-figma-text-tertiary)] bg-[var(--color-figma-text-tertiary)]/20";
  switch (simpleStatus) {
    case "ready":
      return "border-[var(--color-figma-success,#22c55e)] bg-[var(--color-figma-success,#22c55e)]";
    case "needsRun":
      return "border-[var(--color-figma-warning,#f59e0b)] bg-[var(--color-figma-warning,#f59e0b)]";
    case "error":
      return "border-[var(--color-figma-error)] bg-[var(--color-figma-error)]";
  }
}

export function getStatusLabel(status: DashboardStatus, isPaused: boolean): string {
  if (isPaused) return "Paused";
  switch (status) {
    case "upToDate":
      return "Up to date";
    case "stale":
      return "Stale";
    case "failed":
      return "Failed";
    case "blocked":
      return "Blocked";
    case "neverRun":
      return "Never run";
    default:
      return "Generator";
  }
}
