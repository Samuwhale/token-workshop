import { useCallback, useMemo, useState } from "react";
import type { TokenRecipe } from "../hooks/useRecipes";
import { getRecipeDashboardStatus } from "../hooks/useRecipes";
import { apiFetch } from "../shared/apiFetch";
import { dispatchToast } from "../shared/toastBus";
import {
  getAutomationTypeLabel,
  formatRelativeTimestamp,
  getAutomationStatusDetail,
  getSimplifiedStatus,
  getStatusDotClass,
  getStatusLabel,
} from "../shared/automationUtils";

export { getAutomationTypeLabel };

function StatusDot({
  simpleStatus,
  isPaused,
  title,
}: {
  simpleStatus: "ready" | "needsRun" | "error";
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

export interface AutomationPipelineCardProps {
  recipe: TokenRecipe;
  isFocused?: boolean;
  focusRef?: React.RefObject<HTMLDivElement | null>;
  serverUrl: string;
  onRefresh: () => void;
  onViewTokens?: (targetGroup: string, targetCollection: string) => void;
  onEditAutomation?: (recipeId: string) => void;
  onContextMenu?: (event: React.MouseEvent, recipe: TokenRecipe) => void;
}

export function AutomationPipelineCard({
  recipe,
  isFocused,
  focusRef,
  serverUrl,
  onRefresh,
  onViewTokens,
  onEditAutomation,
  onContextMenu,
}: AutomationPipelineCardProps) {
  const [running, setRunning] = useState(false);
  const [togglingEnabled, setTogglingEnabled] = useState(false);

  const status = getRecipeDashboardStatus(recipe);
  const isPaused = recipe.enabled === false;
  const simpleStatus = getSimplifiedStatus(status);
  const statusLabel = getStatusLabel(status, isPaused);
  const statusDetail = getAutomationStatusDetail(recipe, status);
  const lastRunAt = formatRelativeTimestamp(recipe.lastRunSummary?.at);

  const tooltipText = useMemo(() => {
    const parts = [getAutomationTypeLabel(recipe.type), statusLabel];
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
      dispatchToast(isPaused ? "Automation resumed" : "Automation paused", "success");
      onRefresh();
    } catch (error) {
      dispatchToast(error instanceof Error ? error.message : "Unable to update automation", "error");
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
          ? `Automation ran — ${count} token${count === 1 ? "" : "s"} updated`
          : "Automation ran",
        "success",
        onViewTokens
          ? {
              label: "View tokens",
              onClick: () => onViewTokens(recipe.targetGroup, recipe.targetCollection),
            }
          : undefined,
      );
      onRefresh();
    } catch (error) {
      dispatchToast(error instanceof Error ? error.message : "Unable to run automation", "error");
    } finally {
      setRunning(false);
    }
  }, [recipe.id, recipe.targetGroup, recipe.targetCollection, onRefresh, onViewTokens, serverUrl]);

  const handlePrimaryAction = useCallback(() => {
    if (isPaused) {
      void handleToggleEnabled();
      return;
    }
    if (status === "upToDate") {
      onViewTokens?.(recipe.targetGroup, recipe.targetCollection);
      return;
    }
    void handleRun();
  }, [recipe.targetGroup, recipe.targetCollection, handleRun, handleToggleEnabled, isPaused, onViewTokens, status]);

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
        onClick={() => onEditAutomation?.(recipe.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onEditAutomation?.(recipe.id);
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
