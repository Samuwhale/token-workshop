import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TokenRecipe, RecipeType } from "../hooks/useRecipes";
import { getRecipeDashboardStatus } from "../hooks/useRecipes";
import type { UndoSlot } from "../hooks/useUndo";
import type { TokenMapEntry } from "../../shared/types";
import { apiFetch } from "../shared/apiFetch";
import { dispatchToast } from "../shared/toastBus";
import type { ToastAction } from "../shared/toastBus";
import { TokenRecipeDialog } from "./TokenRecipeDialog";
import { GRAPH_TEMPLATES, type GraphTemplate } from "./graph-templates";
import { createRecipeDraftFromTemplate } from "../hooks/useRecipeDialog";
import { RecipePipelineCard, getRecipeTypeLabel } from "./RecipePipelineCard";
import type { RecipeSaveSuccessInfo } from "../hooks/useRecipeSave";
import { SkeletonRecipeCard } from "./Skeleton";
import { FeedbackPlaceholder } from "./FeedbackPlaceholder";
import { ConfirmModal } from "./ConfirmModal";

/** Quick-start template definitions for the empty state */
const QUICK_START_TEMPLATES = [
  { label: "Color Ramp", templateId: "brand-color-palette" },
  { label: "Type Scale", templateId: "type-scale" },
  { label: "Spacing Scale", templateId: "spacing-foundation" },
] as const;

interface ContextMenuState {
  recipe: TokenRecipe;
  x: number;
  y: number;
}

export interface GraphPanelProps {
  serverUrl: string;
  activeSet: string;
  allSets: string[];
  recipes: TokenRecipe[];
  loading?: boolean;
  connected: boolean;
  onRefresh: () => void;
  onPushUndo?: (slot: UndoSlot) => void;
  pendingTemplateId?: string | null;
  onClearPendingTemplate?: () => void;
  pendingGroupPath?: string | null;
  pendingGroupTokenType?: string | null;
  onClearPendingGroup?: () => void;
  focusRecipeId?: string | null;
  onClearFocusRecipe?: () => void;
  allTokensFlat?: Record<string, TokenMapEntry>;
  onViewTokens?: (targetGroup: string, targetSet: string) => void;
  openCreateDialog?: boolean;
}

export function GraphPanel({
  serverUrl,
  activeSet,
  allSets,
  recipes,
  loading = false,
  connected,
  onRefresh,
  onPushUndo,
  pendingTemplateId,
  onClearPendingTemplate,
  pendingGroupPath,
  pendingGroupTokenType,
  onClearPendingGroup,
  focusRecipeId,
  onClearFocusRecipe,
  allTokensFlat,
  onViewTokens,
  openCreateDialog = false,
}: GraphPanelProps) {
  const setRecipes = useMemo(
    () => recipes.filter((recipe) => recipe.targetSet === activeSet),
    [activeSet, recipes],
  );
  const focusRef = useRef<HTMLDivElement>(null);
  const [quickStartTemplateId, setQuickStartTemplateId] = useState<string | null>(null);
  const suggestedTemplateId = quickStartTemplateId
    ?? (pendingGroupPath
      ? (GRAPH_TEMPLATES.find((template) => template.id === (pendingGroupTokenType ? GRAPH_TEMPLATES.find((t) => t.sourceTokenTypes?.includes(pendingGroupTokenType))?.id : undefined))?.id ??
        GRAPH_TEMPLATES[0]?.id ??
        null)
      : pendingTemplateId ??
        null);
  const pendingTemplate = useMemo<GraphTemplate | undefined>(
    () => GRAPH_TEMPLATES.find((template) => template.id === suggestedTemplateId),
    [suggestedTemplateId],
  );

  const [showCreateDialog, setShowCreateDialog] = useState(
    Boolean(openCreateDialog || suggestedTemplateId),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedRecipeId, setHighlightedRecipeId] = useState<string | null>(null);
  const [runningAction, setRunningAction] = useState<"all" | "stale" | "failed" | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Edit dialog opened from context menu
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);

  // Delete confirmation opened from context menu
  const [deletingRecipe, setDeletingRecipe] = useState<TokenRecipe | null>(null);
  const [deleteTokensOnDelete, setDeleteTokensOnDelete] = useState(false);

  useEffect(() => {
    if (!openCreateDialog && !suggestedTemplateId) return;
    setShowCreateDialog(true);
  }, [openCreateDialog, suggestedTemplateId]);

  useEffect(() => {
    if (!focusRecipeId) return;
    setHighlightedRecipeId(focusRecipeId);
    onClearFocusRecipe?.();
    requestAnimationFrame(() => {
      focusRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    const timer = window.setTimeout(() => setHighlightedRecipeId(null), 2000);
    return () => window.clearTimeout(timer);
  }, [focusRecipeId, onClearFocusRecipe]);

  // Close context menu on outside click or Escape
  useEffect(() => {
    if (!contextMenu) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (contextMenuRef.current?.contains(event.target as Node)) return;
      setContextMenu(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setContextMenu(null);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenu]);

  const clearPendingState = useCallback(() => {
    onClearPendingTemplate?.();
    onClearPendingGroup?.();
    setQuickStartTemplateId(null);
  }, [onClearPendingGroup, onClearPendingTemplate]);

  const handleCreateClose = useCallback(() => {
    setShowCreateDialog(false);
    clearPendingState();
  }, [clearPendingState]);

  const handleCreateSaved = useCallback(() => {
    setShowCreateDialog(false);
    clearPendingState();
    onRefresh();
    dispatchToast("Recipe created — tokens are generating", "success");
  }, [clearPendingState, onRefresh]);

  const runRecipes = useCallback(
    async (action: "all" | "stale" | "failed", selectedRecipes: TokenRecipe[]) => {
      if (selectedRecipes.length === 0) return;
      setRunningAction(action);
      let successCount = 0;
      let totalTokens = 0;
      const errors: string[] = [];

      const recipesToRun = [...selectedRecipes].sort(
        (left, right) =>
          (left.upstreamRecipes?.length ?? 0) - (right.upstreamRecipes?.length ?? 0),
      );

      for (const recipe of recipesToRun) {
        try {
          const result = await apiFetch<{ count: number }>(
            `${serverUrl}/api/recipes/${recipe.id}/run`,
            { method: "POST" },
          );
          successCount += 1;
          totalTokens += result.count ?? 0;
        } catch {
          errors.push(recipe.name);
        }
      }

      setRunningAction(null);

      if (errors.length === 0) {
        const actionLabel =
          action === "all" ? "Ran" : action === "stale" ? "Re-ran" : "Retried";
        dispatchToast(
          `${actionLabel} ${successCount} recipe${successCount === 1 ? "" : "s"}${totalTokens > 0 ? ` — ${totalTokens} token${totalTokens === 1 ? "" : "s"} updated` : ""}`,
          "success",
        );
      } else {
        dispatchToast(
          `${errors.length} recipe${errors.length === 1 ? "" : "s"} failed: ${errors.join(", ")}`,
          "error",
        );
      }

      onRefresh();
    },
    [onRefresh, serverUrl],
  );

  const staleRecipes = useMemo(
    () =>
      setRecipes.filter((recipe) => {
        const s = getRecipeDashboardStatus(recipe);
        return s === "stale" || s === "neverRun";
      }),
    [setRecipes],
  );
  const failedRecipes = useMemo(
    () =>
      setRecipes.filter((recipe) => {
        const s = getRecipeDashboardStatus(recipe);
        return s === "failed" || s === "blocked";
      }),
    [setRecipes],
  );

  const filteredRecipes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return setRecipes.filter((recipe) => {
      if (!query) return true;
      return (
        recipe.name.toLowerCase().includes(query) ||
        (recipe.sourceToken ?? "").toLowerCase().includes(query) ||
        recipe.targetGroup.toLowerCase().includes(query) ||
        getRecipeTypeLabel(recipe.type).toLowerCase().includes(query)
      );
    });
  }, [searchQuery, setRecipes]);

  const getViewTokensToastAction = useCallback(
    (info: RecipeSaveSuccessInfo): ToastAction | undefined =>
      onViewTokens
        ? {
            label: "View tokens",
            onClick: () => onViewTokens(info.targetGroup, info.targetSet),
          }
        : undefined,
    [onViewTokens],
  );

  const initialDraft = useMemo(
    () =>
      pendingTemplate
        ? createRecipeDraftFromTemplate(pendingTemplate, activeSet, {
            sourceTokenPath: pendingGroupPath ?? undefined,
          })
        : undefined,
    [activeSet, pendingGroupPath, pendingTemplate],
  );

  // Context menu handlers
  const handleContextMenu = useCallback((event: React.MouseEvent, recipe: TokenRecipe) => {
    setContextMenu({ recipe, x: event.clientX, y: event.clientY });
  }, []);

  const handleContextMenuEdit = useCallback(() => {
    if (!contextMenu) return;
    setEditingRecipeId(contextMenu.recipe.id);
    setContextMenu(null);
  }, [contextMenu]);

  const handleContextMenuRun = useCallback(async () => {
    if (!contextMenu) return;
    const recipe = contextMenu.recipe;
    setContextMenu(null);
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
    }
  }, [contextMenu, onRefresh, onViewTokens, serverUrl]);

  const handleContextMenuToggleEnabled = useCallback(async () => {
    if (!contextMenu) return;
    const recipe = contextMenu.recipe;
    const isPaused = recipe.enabled === false;
    setContextMenu(null);
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
    }
  }, [contextMenu, onRefresh, serverUrl]);

  const handleContextMenuDelete = useCallback(() => {
    if (!contextMenu) return;
    setDeletingRecipe(contextMenu.recipe);
    setDeleteTokensOnDelete(false);
    setContextMenu(null);
  }, [contextMenu]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deletingRecipe) return;
    try {
      await apiFetch(
        `${serverUrl}/api/recipes/${deletingRecipe.id}?deleteTokens=${deleteTokensOnDelete}`,
        { method: "DELETE" },
      );
      dispatchToast("Recipe deleted", "success");
      onRefresh();
    } catch (error) {
      dispatchToast(error instanceof Error ? error.message : "Unable to delete recipe", "error");
    }
    setDeletingRecipe(null);
  }, [deletingRecipe, deleteTokensOnDelete, onRefresh, serverUrl]);

  const handleEditClose = useCallback(() => {
    setEditingRecipeId(null);
  }, []);

  const handleEditSaved = useCallback(() => {
    setEditingRecipeId(null);
    onRefresh();
    dispatchToast("Recipe updated", "success");
  }, [onRefresh]);

  const handleQuickStart = useCallback(
    (templateId: string) => {
      setQuickStartTemplateId(templateId);
      setShowCreateDialog(true);
    },
    [],
  );

  // Editing dialog from context menu
  const editingRecipe = editingRecipeId
    ? setRecipes.find((r) => r.id === editingRecipeId)
    : undefined;
  if (editingRecipe) {
    return (
      <TokenRecipeDialog
        serverUrl={serverUrl}
        allSets={allSets}
        activeSet={activeSet}
        existingRecipe={editingRecipe}
        onBack={handleEditClose}
        onClose={handleEditClose}
        onSaved={handleEditSaved}
        getSuccessToastAction={getViewTokensToastAction}
        onInterceptSemanticMapping={() => {}}
        onPushUndo={onPushUndo}
      />
    );
  }

  if (showCreateDialog) {
    return (
      <TokenRecipeDialog
        serverUrl={serverUrl}
        allSets={allSets}
        activeSet={activeSet}
        allTokensFlat={allTokensFlat}
        sourceTokenPath={pendingGroupPath ?? undefined}
        sourceTokenType={pendingGroupTokenType ?? undefined}
        initialDraft={initialDraft}
        template={pendingTemplate}
        onBack={handleCreateClose}
        onClose={handleCreateClose}
        onSaved={handleCreateSaved}
        getSuccessToastAction={getViewTokensToastAction}
        onInterceptSemanticMapping={() => {}}
        onPushUndo={onPushUndo}
      />
    );
  }

  if (loading && setRecipes.length === 0) {
    return (
      <div className="flex flex-col gap-2 overflow-y-auto p-3" aria-busy="true" aria-label="Loading recipes">
        <SkeletonRecipeCard />
        <SkeletonRecipeCard />
        <SkeletonRecipeCard />
      </div>
    );
  }

  if (setRecipes.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-4 py-6 text-center">
        <FeedbackPlaceholder
          variant="empty"
          size="section"
          className="w-full max-w-[320px]"
          title="No recipes"
          description="Generate color palettes, type scales, and spacing systems from your tokens."
        />
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {QUICK_START_TEMPLATES.map((qs) => (
            <button
              key={qs.templateId}
              type="button"
              onClick={() => handleQuickStart(qs.templateId)}
              disabled={!connected}
              className="rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2.5 py-1.5 text-[10px] font-medium text-[var(--color-figma-text)] transition-colors hover:border-[var(--color-figma-accent)]/40 hover:bg-[var(--color-figma-accent)]/5 hover:text-[var(--color-figma-accent)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {qs.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setShowCreateDialog(true)}
          disabled={!connected}
          className="mt-3 rounded-md bg-[var(--color-figma-accent)] px-3 py-1 text-[11px] font-medium text-white transition-colors hover:bg-[var(--color-figma-accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          New recipe
        </button>
        {!connected && (
          <p className="mt-2 text-[10px] text-[var(--color-figma-text-tertiary)]">
            Connect to create recipes.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="shrink-0 border-b border-[var(--color-figma-border)] px-3 py-2">
        <div className="flex items-center gap-2">
          {/* Search input */}
          <div className="relative min-w-0 flex-1">
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--color-figma-text-tertiary)]"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search recipes…"
              aria-label="Search recipes"
              className="w-full rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] py-1.5 pl-6 pr-6 text-[11px] text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-tertiary)] focus-visible:border-[var(--color-figma-accent)]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--color-figma-text-tertiary)] transition-colors hover:text-[var(--color-figma-text)]"
                aria-label="Clear search"
              >
                <svg
                  width="8"
                  height="8"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Conditional batch action buttons */}
          {staleRecipes.length > 0 && (
            <button
              type="button"
              onClick={() => void runRecipes("stale", staleRecipes)}
              disabled={runningAction !== null || !connected}
              className="shrink-0 rounded-md border border-[var(--color-figma-warning,#f59e0b)]/40 bg-[var(--color-figma-warning,#f59e0b)]/10 px-2 py-1.5 text-[10px] font-medium text-[var(--color-figma-warning,#f59e0b)] transition-colors hover:bg-[var(--color-figma-warning,#f59e0b)]/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {runningAction === "stale" ? "Running…" : `Re-run (${staleRecipes.length})`}
            </button>
          )}
          {failedRecipes.length > 0 && (
            <button
              type="button"
              onClick={() => void runRecipes("failed", failedRecipes)}
              disabled={runningAction !== null || !connected}
              className="shrink-0 rounded-md border border-[var(--color-figma-error)]/40 bg-[var(--color-figma-error)]/10 px-2 py-1.5 text-[10px] font-medium text-[var(--color-figma-error)] transition-colors hover:bg-[var(--color-figma-error)]/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {runningAction === "failed" ? "Retrying…" : `Retry (${failedRecipes.length})`}
            </button>
          )}

          {/* New recipe button */}
          <button
            type="button"
            onClick={() => setShowCreateDialog(true)}
            disabled={!connected}
            className="shrink-0 rounded-md bg-[var(--color-figma-accent)] px-2.5 py-1.5 text-[10px] font-medium text-white transition-colors hover:bg-[var(--color-figma-accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            New
          </button>
        </div>
      </div>

      {/* Recipe list */}
      <div className="flex-1 overflow-y-auto px-1 py-1">
        {filteredRecipes.length > 0 ? (
          <div className="flex flex-col">
            {filteredRecipes.map((recipe) => (
              <RecipePipelineCard
                key={recipe.id}
                recipe={recipe}
                isFocused={recipe.id === highlightedRecipeId}
                focusRef={focusRef}
                serverUrl={serverUrl}
                allSets={allSets}
                activeSet={activeSet}
                onRefresh={onRefresh}
                allTokensFlat={allTokensFlat}
                onPushUndo={onPushUndo}
                onViewTokens={onViewTokens}
                onContextMenu={handleContextMenu}
              />
            ))}
          </div>
        ) : (
          <FeedbackPlaceholder
            variant="no-results"
            size="full"
            title="No recipes match"
            description="Try a different search or clear filters."
            secondaryAction={
              searchQuery
                ? {
                    label: "Clear search",
                    onClick: () => setSearchQuery(""),
                  }
                : undefined
            }
          />
        )}
      </div>

      {/* Shared context menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          role="menu"
          style={{
            position: "fixed",
            left: contextMenu.x,
            top: contextMenu.y,
          }}
          className="z-50 min-w-[140px] rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] py-1 shadow-lg"
        >
          <button
            role="menuitem"
            onClick={handleContextMenuEdit}
            className="flex w-full items-center px-3 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)]"
          >
            Edit
          </button>
          <button
            role="menuitem"
            onClick={() => void handleContextMenuRun()}
            className="flex w-full items-center px-3 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)]"
          >
            Run
          </button>
          <button
            role="menuitem"
            onClick={() => void handleContextMenuToggleEnabled()}
            className="flex w-full items-center px-3 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)]"
          >
            {contextMenu.recipe.enabled === false ? "Resume" : "Pause"}
          </button>
          <div className="my-1 border-t border-[var(--color-figma-border)]" role="separator" />
          <button
            role="menuitem"
            onClick={handleContextMenuDelete}
            className="flex w-full items-center px-3 py-1.5 text-left text-[10px] text-[var(--color-figma-error)] transition-colors hover:bg-[var(--color-figma-error)]/8"
          >
            Delete
          </button>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deletingRecipe && (
        <ConfirmModal
          title="Delete Recipe"
          description={`Delete "${deletingRecipe.name}"? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => void handleDeleteConfirm()}
          onCancel={() => setDeletingRecipe(null)}
        >
          <label className="mt-3 flex items-center gap-2 text-[11px] text-[var(--color-figma-text-secondary)]">
            <input
              type="checkbox"
              checked={deleteTokensOnDelete}
              onChange={(event) => setDeleteTokensOnDelete(event.target.checked)}
              className="rounded"
            />
            <span>Also delete managed tokens</span>
          </label>
        </ConfirmModal>
      )}
    </div>
  );
}
