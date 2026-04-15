import { useCallback, useMemo, useState } from "react";
import type { TokenRecipe, RecipeType } from "../hooks/useRecipes";
import { getRecipeDashboardStatus } from "../hooks/useRecipes";
import { apiFetch } from "../shared/apiFetch";
import { dispatchToast } from "../shared/toastBus";

export function getRecipeTypeLabel(type: RecipeType): string {
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
    case "contrastCheck":
      return "Contrast check";
    case "accessibleColorPair":
      return "Accessible color pair";
    case "darkModeInversion":
      return "Dark mode inversion";
    default:
      return type;
  }
}

type DashboardStatus = ReturnType<typeof getRecipeDashboardStatus>;

function formatRelativeTimestamp(value?: string): string | null {
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

function getRecipeStatusDetail(recipe: TokenRecipe, status: DashboardStatus): string {
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

type SimplifiedStatus = "ready" | "needsRun" | "error";

function getSimplifiedStatus(status: DashboardStatus): SimplifiedStatus {
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

function getStatusDotClass(simpleStatus: SimplifiedStatus, isPaused: boolean): string {
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

function getStatusLabel(status: DashboardStatus, isPaused: boolean): string {
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
      return "Recipe";
  }
}

function StatusDot({
  simpleStatus,
  isPaused,
  title,
}: {
  simpleStatus: SimplifiedStatus;
  isPaused: boolean;
  title: string;
}) {
  return (
    <span
      title={title}
      aria-label={title}
      className={`h-2 w-2 shrink-0 rounded-full border ${getStatusDotClass(simpleStatus, isPaused)}`}
    />
  );
}

/** Play icon for Run/Retry actions */
function PlayIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      aria-hidden="true"
    >
      <polygon points="6,4 20,12 6,20" />
    </svg>
  );
}

/** Eye icon for View action */
function ViewIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/** Resume icon (pause bars) */
function ResumeIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      aria-hidden="true"
    >
      <polygon points="6,4 20,12 6,20" />
    </svg>
  );
}

export interface RecipePipelineCardProps {
  recipe: TokenRecipe;
  isFocused?: boolean;
  focusRef?: React.RefObject<HTMLDivElement | null>;
  serverUrl: string;
  onRefresh: () => void;
  onViewTokens?: (targetGroup: string, targetSet: string) => void;
  onEditRecipe?: (recipeId: string) => void;
  onContextMenu?: (event: React.MouseEvent, recipe: TokenRecipe) => void;
}

export function RecipePipelineCard({
  recipe,
  isFocused,
  focusRef,
  serverUrl,
  onRefresh,
  onViewTokens,
  onEditRecipe,
  onContextMenu,
}: RecipePipelineCardProps) {
  const [running, setRunning] = useState(false);
  const [togglingEnabled, setTogglingEnabled] = useState(false);

  const status = getRecipeDashboardStatus(recipe);
  const isPaused = recipe.enabled === false;
  const simpleStatus = getSimplifiedStatus(status);
  const statusLabel = getStatusLabel(status, isPaused);
  const statusDetail = getRecipeStatusDetail(recipe, status);
  const lastRunAt = formatRelativeTimestamp(recipe.lastRunSummary?.at);

  const tooltipText = useMemo(() => {
    const parts = [getRecipeTypeLabel(recipe.type), statusLabel];
    if (lastRunAt) parts.push(`Last run: ${lastRunAt}`);
    if (statusDetail) parts.push(statusDetail);
    return parts.join(" \u00b7 ");
  }, [recipe.type, statusLabel, lastRunAt, statusDetail]);

  const handleToggleEnabled = useCallback(async () => {
    setTogglingEnabled(true);
    try {
      await apiFetch(`${serverUrl}/api/recipes/${recipe.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: isPaused }),
      });
      dispatchToast(isPaused ? "Recipe resumed" : "Recipe paused", "success");
      onRefresh();
    } catch (error) {
      dispatchToast(error instanceof Error ? error.message : "Unable to update recipe", "error");
    } finally {
      setTogglingEnabled(false);
    }
  }, [recipe.id, isPaused, onRefresh, serverUrl]);

  const handleRun = useCallback(async () => {
    setRunning(true);
    try {
      const result = await apiFetch<{ count?: number }>(
        `${serverUrl}/api/recipes/${recipe.id}/run`,
        { method: "POST" },
      );
      const count = result.count ?? 0;
      dispatchToast(
        count > 0
          ? `Recipe ran — ${count} token${count === 1 ? "" : "s"} updated`
          : "Recipe ran",
        "success",
        onViewTokens
          ? {
              label: "View tokens",
              onClick: () => onViewTokens(recipe.targetGroup, recipe.targetSet),
            }
          : undefined,
      );
      onRefresh();
    } catch (error) {
      dispatchToast(error instanceof Error ? error.message : "Unable to run recipe", "error");
    } finally {
      setRunning(false);
    }
  }, [recipe.id, recipe.targetGroup, recipe.targetSet, onRefresh, onViewTokens, serverUrl]);

  const handlePrimaryAction = useCallback(() => {
    if (isPaused) {
      void handleToggleEnabled();
      return;
    }
    if (status === "upToDate") {
      onViewTokens?.(recipe.targetGroup, recipe.targetSet);
      return;
    }
    void handleRun();
  }, [recipe.targetGroup, recipe.targetSet, handleRun, handleToggleEnabled, isPaused, onViewTokens, status]);

  const actionLabel = isPaused
    ? "Resume"
    : status === "upToDate"
      ? "View generated tokens"
      : status === "failed" || status === "blocked"
        ? "Retry"
        : "Run";

  const actionIcon = isPaused ? (
    <ResumeIcon />
  ) : status === "upToDate" ? (
    <ViewIcon />
  ) : (
    <PlayIcon />
  );

  const actionColorClass = isPaused
    ? "text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]"
    : status === "upToDate"
      ? "text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-accent)]"
      : status === "failed" || status === "blocked"
        ? "text-[var(--color-figma-error)] hover:text-[var(--color-figma-error)]"
        : "text-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent-hover)]";

  return (
    <>
      <div
        ref={isFocused ? (focusRef as React.LegacyRef<HTMLDivElement>) : undefined}
        role="button"
        tabIndex={0}
        onClick={() => onEditRecipe?.(recipe.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onEditRecipe?.(recipe.id);
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onContextMenu?.(e, recipe);
        }}
        title={tooltipText}
        className={`flex h-8 items-center gap-2 rounded-md px-2 transition-colors cursor-pointer ${
          isPaused ? "opacity-50" : ""
        }${
          isFocused
            ? " bg-[var(--color-figma-accent)]/[0.06]"
            : " hover:bg-[var(--color-figma-bg-secondary)]"
        }`}
      >
        <StatusDot
          simpleStatus={simpleStatus}
          isPaused={isPaused}
          title={statusLabel}
        />

        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-[var(--color-figma-text)]">
          {recipe.name}
        </span>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handlePrimaryAction();
          }}
          disabled={running || togglingEnabled || (status === "upToDate" && !onViewTokens)}
          aria-label={running ? "Running" : actionLabel}
          title={actionLabel}
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${actionColorClass}`}
        >
          {running || togglingEnabled ? (
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="animate-spin"
              aria-hidden="true"
            >
              <path d="M21 12a9 9 0 11-6.219-8.56" />
            </svg>
          ) : (
            actionIcon
          )}
        </button>
      </div>
    </>
  );
}
