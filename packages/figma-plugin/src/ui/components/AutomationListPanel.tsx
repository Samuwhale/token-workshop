import { useCallback, useMemo, useState } from "react";
import type { TokenRecipe } from "../hooks/useRecipes";
import { getRecipeDashboardStatus } from "../hooks/useRecipes";
import { useRecipeContext } from "../contexts/TokenDataContext";
import { useConnectionContext } from "../contexts/ConnectionContext";
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
import type { SimplifiedStatus } from "../shared/automationUtils";

type StatusFilter = "all" | "attention" | "upToDate" | "paused";

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

function PlayIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
      <polygon points="6,4 20,12 6,20" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
      <rect x="6" y="4" width="4" height="16" />
      <rect x="14" y="4" width="4" height="16" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}

function classifyAutomation(recipe: TokenRecipe): { status: ReturnType<typeof getRecipeDashboardStatus>; isPaused: boolean; needsAttention: boolean } {
  const status = getRecipeDashboardStatus(recipe);
  const isPaused = recipe.enabled === false;
  const needsAttention = !isPaused && (status === "stale" || status === "failed" || status === "blocked" || status === "neverRun");
  return { status, isPaused, needsAttention };
}

export interface AutomationListPanelProps {
  onCreateAutomation: () => void;
  onEditAutomation: (recipeId: string) => void;
  onViewOutputs?: (targetGroup: string, targetCollection: string) => void;
}

export function AutomationListPanel({
  onCreateAutomation,
  onEditAutomation,
  onViewOutputs,
}: AutomationListPanelProps) {
  const { serverUrl } = useConnectionContext();
  const { recipes, refreshRecipes } = useRecipeContext();
  const [activeFilter, setActiveFilter] = useState<StatusFilter>("all");
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());

  const classified = useMemo(
    () => recipes.map((r) => ({ recipe: r, ...classifyAutomation(r) })),
    [recipes],
  );

  const counts = useMemo(() => {
    let attention = 0;
    let upToDate = 0;
    let paused = 0;
    for (const c of classified) {
      if (c.isPaused) paused++;
      else if (c.needsAttention) attention++;
      else upToDate++;
    }
    return { all: classified.length, attention, upToDate, paused };
  }, [classified]);

  const filtered = useMemo(() => {
    switch (activeFilter) {
      case "attention":
        return classified.filter((c) => c.needsAttention);
      case "upToDate":
        return classified.filter((c) => !c.isPaused && !c.needsAttention);
      case "paused":
        return classified.filter((c) => c.isPaused);
      default:
        return classified;
    }
  }, [classified, activeFilter]);

  const sorted = useMemo(() => {
    const statusOrder: Record<string, number> = { failed: 0, blocked: 1, stale: 2, neverRun: 3, upToDate: 4, paused: 5 };
    return [...filtered].sort((a, b) => (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9));
  }, [filtered]);

  const handleRun = useCallback(async (recipe: TokenRecipe) => {
    setRunningIds((prev) => new Set(prev).add(recipe.id));
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
        onViewOutputs
          ? { label: "View tokens", onClick: () => onViewOutputs(recipe.targetGroup, recipe.targetCollection) }
          : undefined,
      );
      refreshRecipes();
    } catch (error) {
      dispatchToast(error instanceof Error ? error.message : "Unable to run automation", "error");
    } finally {
      setRunningIds((prev) => { const next = new Set(prev); next.delete(recipe.id); return next; });
    }
  }, [serverUrl, refreshRecipes, onViewOutputs]);

  const handleToggleEnabled = useCallback(async (recipe: TokenRecipe) => {
    const isPaused = recipe.enabled === false;
    setTogglingIds((prev) => new Set(prev).add(recipe.id));
    try {
      await apiFetch(`${serverUrl}/api/recipes/${recipe.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: isPaused }),
      });
      dispatchToast(isPaused ? "Automation resumed" : "Automation paused", "success");
      refreshRecipes();
    } catch (error) {
      dispatchToast(error instanceof Error ? error.message : "Unable to update automation", "error");
    } finally {
      setTogglingIds((prev) => { const next = new Set(prev); next.delete(recipe.id); return next; });
    }
  }, [serverUrl, refreshRecipes]);

  const filters: { key: StatusFilter; label: string; count: number }[] = [
    { key: "all", label: "All", count: counts.all },
    { key: "attention", label: "Needs attention", count: counts.attention },
    { key: "upToDate", label: "Up to date", count: counts.upToDate },
    { key: "paused", label: "Paused", count: counts.paused },
  ];

  if (recipes.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="text-[12px] font-medium text-[var(--color-figma-text)]">No automations yet</div>
        <div className="max-w-[240px] text-[11px] text-[var(--color-figma-text-secondary)]">
          Automations generate and maintain tokens automatically — color ramps, type scales, spacing systems, and more.
        </div>
        <button
          onClick={onCreateAutomation}
          className="mt-1 rounded-full bg-[var(--color-figma-accent)] px-3 py-1 text-[11px] font-medium text-white transition-colors hover:bg-[var(--color-figma-accent-hover)]"
        >
          New automation
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-figma-border)] px-3 py-2">
        <div className="text-[11px] font-medium text-[var(--color-figma-text)]">
          {counts.all} automation{counts.all === 1 ? "" : "s"}
        </div>
        <button
          onClick={onCreateAutomation}
          className="rounded-full bg-[var(--color-figma-accent)] px-2.5 py-0.5 text-[10px] font-medium text-white transition-colors hover:bg-[var(--color-figma-accent-hover)]"
        >
          New automation
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex shrink-0 gap-0.5 border-b border-[var(--color-figma-border)] px-3 py-1">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setActiveFilter(f.key)}
            className={`rounded px-1.5 py-0.5 text-[10px] transition-colors ${
              activeFilter === f.key
                ? "bg-[var(--color-figma-bg-selected)] font-medium text-[var(--color-figma-text)]"
                : "text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]"
            }`}
          >
            {f.label}
            {f.count > 0 && (
              <span className="ml-0.5 tabular-nums text-[var(--color-figma-text-tertiary)]">{f.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-1 py-1">
        {sorted.length === 0 && (
          <div className="px-3 py-6 text-center text-[11px] text-[var(--color-figma-text-tertiary)]">
            No automations match this filter.
          </div>
        )}
        {sorted.map(({ recipe, status, isPaused }) => {
          const simpleStatus = getSimplifiedStatus(status);
          const statusLabel = getStatusLabel(status, isPaused);
          const statusDetail = getAutomationStatusDetail(recipe, status);
          const lastRunAt = formatRelativeTimestamp(recipe.lastRunSummary?.at);
          const isRunning = runningIds.has(recipe.id);
          const isToggling = togglingIds.has(recipe.id);
          const isBusy = isRunning || isToggling;

          return (
            <div
              key={recipe.id}
              role="button"
              tabIndex={0}
              onClick={() => onEditAutomation(recipe.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onEditAutomation(recipe.id); } }}
              className={`group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors cursor-pointer hover:bg-[var(--color-figma-bg-secondary)] ${isPaused ? "opacity-50" : ""}`}
            >
              <StatusDot simpleStatus={simpleStatus} isPaused={isPaused} title={statusLabel} />

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="truncate text-[11px] font-medium text-[var(--color-figma-text)]">
                    {recipe.name}
                  </span>
                  <span className="shrink-0 text-[10px] text-[var(--color-figma-text-tertiary)]">
                    {getAutomationTypeLabel(recipe.type)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-figma-text-tertiary)]">
                  {recipe.sourceToken && (
                    <span className="truncate">{recipe.sourceToken}</span>
                  )}
                  {recipe.sourceToken && (lastRunAt || statusDetail) && <span>·</span>}
                  {statusDetail ? (
                    <span className={status === "failed" || status === "blocked" ? "text-[var(--color-figma-error)]" : ""}>
                      {statusDetail}
                    </span>
                  ) : lastRunAt ? (
                    <span>{lastRunAt}</span>
                  ) : null}
                </div>
              </div>

              {/* Row actions */}
              <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                {!isPaused && status !== "upToDate" && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); void handleRun(recipe); }}
                    disabled={isBusy}
                    title="Run"
                    aria-label="Run automation"
                    className="flex h-5 w-5 items-center justify-center rounded text-[var(--color-figma-accent)] transition-colors hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40"
                  >
                    {isRunning ? <Spinner /> : <PlayIcon />}
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); void handleToggleEnabled(recipe); }}
                  disabled={isBusy}
                  title={isPaused ? "Resume" : "Pause"}
                  aria-label={isPaused ? "Resume automation" : "Pause automation"}
                  className="flex h-5 w-5 items-center justify-center rounded text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40"
                >
                  {isToggling ? <Spinner /> : isPaused ? <PlayIcon /> : <PauseIcon />}
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onEditAutomation(recipe.id); }}
                  title="Edit"
                  aria-label="Edit automation"
                  className="flex h-5 w-5 items-center justify-center rounded text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
                >
                  <EditIcon />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin" aria-hidden="true">
      <path d="M21 12a9 9 0 11-6.219-8.56" />
    </svg>
  );
}
