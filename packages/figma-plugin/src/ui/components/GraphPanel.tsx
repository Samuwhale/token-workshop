import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TokenGenerator, GeneratorType } from "../hooks/useGenerators";
import { getGeneratorDashboardStatus } from "../hooks/useGenerators";
import type { UndoSlot } from "../hooks/useUndo";
import type { TokenMapEntry } from "../../shared/types";
import { NodeGraphCanvas } from "./nodeGraph/NodeGraphCanvas";
import { apiFetch } from "../shared/apiFetch";
import { dispatchToast } from "../shared/toastBus";
import type { ToastAction } from "../shared/toastBus";
import { TokenGeneratorDialog } from "./TokenGeneratorDialog";
import { GRAPH_TEMPLATES, templateIdForTokenType, type GraphTemplate } from "./graph-templates";
import { createGeneratorDraftFromTemplate } from "../hooks/useGeneratorDialog";
import { GeneratorPipelineCard, getGeneratorTypeLabel } from "./GeneratorPipelineCard";
import { getMenuItems, handleMenuArrowKeys } from "../hooks/useMenuKeyboard";
import type { GeneratorSaveSuccessInfo } from "../hooks/useGeneratorSave";
import { SkeletonGeneratorCard } from "./Skeleton";
import { FeedbackPlaceholder } from "./FeedbackPlaceholder";

type GraphEditingState =
  | { kind: "none" }
  | { kind: "editing"; generatorId: string };

function exportGraphAsSVG(generators: TokenGenerator[], activeSet: string): void {
  const css = (name: string, fallback: string) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  const colorBg = css("--color-figma-bg", "#ffffff");
  const colorBgSecondary = css("--color-figma-bg-secondary", "#eff6ff");
  const colorAccent = css("--color-figma-accent", "#1d4ed8");
  const colorTextSecondary = css("--color-figma-text-secondary", "#6b7280");
  const colorText = css("--color-figma-text", "#111827");

  const cardW = 240;
  const cardH = 48;
  const cardR = 6;
  const padX = 20;
  const padY = 20;
  const titleH = 32;
  const rowGap = 12;
  const svgW = padX * 2 + cardW;
  const svgH =
    padY +
    titleH +
    generators.length * (cardH + rowGap) -
    (generators.length > 0 ? rowGap : 0) +
    padY;

  const esc = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const trunc = (value: string, length: number) =>
    value.length > length ? `${value.slice(0, length - 1)}…` : value;

  const rows = generators
    .map((generator, index) => {
      const y = padY + titleH + index * (cardH + rowGap);
      const name = trunc(generator.name || getGeneratorTypeLabel(generator.type), 28);
      const source = generator.sourceToken
        ? `← ${trunc(generator.sourceToken, 30)}`
        : "← standalone";
      const target = `→ ${trunc(`${generator.targetGroup}.*`, 30)}`;
      return [
        `<rect x="${padX}" y="${y}" width="${cardW}" height="${cardH}" rx="${cardR}" fill="${colorBgSecondary}" stroke="${colorAccent}" stroke-width="1"/>`,
        `<text x="${padX + 10}" y="${y + 18}" font-family="system-ui,sans-serif" font-size="11" font-weight="600" fill="${colorAccent}">${esc(name)}</text>`,
        `<text x="${padX + 10}" y="${y + 34}" font-family="ui-monospace,monospace" font-size="8" fill="${colorTextSecondary}">${esc(source)}  ${esc(target)}</text>`,
      ].join("");
    })
    .join("");

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">`,
    `<rect width="${svgW}" height="${svgH}" fill="${colorBg}"/>`,
    `<text x="${padX}" y="${padY + 18}" font-family="system-ui,sans-serif" font-size="13" font-weight="600" fill="${colorText}">${esc(activeSet)} — Recipe graph</text>`,
    rows,
    "</svg>",
  ].join("\n");

  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${activeSet}-graph.svg`;
  link.click();
  URL.revokeObjectURL(url);
}

export interface GraphPanelProps {
  serverUrl: string;
  activeSet: string;
  allSets: string[];
  generators: TokenGenerator[];
  loading?: boolean;
  connected: boolean;
  onRefresh: () => void;
  onPushUndo?: (slot: UndoSlot) => void;
  pendingTemplateId?: string | null;
  onClearPendingTemplate?: () => void;
  pendingGroupPath?: string | null;
  pendingGroupTokenType?: string | null;
  onClearPendingGroup?: () => void;
  focusGeneratorId?: string | null;
  onClearFocusGenerator?: () => void;
  allTokensFlat?: Record<string, TokenMapEntry>;
  onViewTokens?: (targetGroup: string, targetSet: string) => void;
  openCreateDialog?: boolean;
}

export function GraphPanel({
  serverUrl,
  activeSet,
  allSets,
  generators,
  loading = false,
  connected,
  onRefresh,
  onPushUndo,
  pendingTemplateId,
  onClearPendingTemplate,
  pendingGroupPath,
  pendingGroupTokenType,
  onClearPendingGroup,
  focusGeneratorId,
  onClearFocusGenerator,
  allTokensFlat,
  onViewTokens,
  openCreateDialog = false,
}: GraphPanelProps) {
  const setGenerators = useMemo(
    () => generators.filter((generator) => generator.targetSet === activeSet),
    [activeSet, generators],
  );
  const focusRef = useRef<HTMLDivElement>(null);
  const suggestedTemplateId = pendingGroupPath
    ? (GRAPH_TEMPLATES.find((template) => template.id === templateIdForTokenType(pendingGroupTokenType))?.id ??
      GRAPH_TEMPLATES[0]?.id ??
      null)
    : pendingTemplateId ??
      null;
  const pendingTemplate = useMemo<GraphTemplate | undefined>(
    () => GRAPH_TEMPLATES.find((template) => template.id === suggestedTemplateId),
    [suggestedTemplateId],
  );

  const [showCreateDialog, setShowCreateDialog] = useState(
    Boolean(openCreateDialog || suggestedTemplateId),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<GeneratorType | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "graph">("list");
  const [highlightedGeneratorId, setHighlightedGeneratorId] = useState<string | null>(null);
  const [runningAction, setRunningAction] = useState<"all" | "stale" | "failed" | null>(null);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [graphEditing, setGraphEditing] = useState<GraphEditingState>({ kind: "none" });
  const actionsMenuRef = useRef<HTMLDivElement>(null);
  const actionsMenuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!openCreateDialog && !suggestedTemplateId) return;
    setShowCreateDialog(true);
  }, [openCreateDialog, suggestedTemplateId]);

  useEffect(() => {
    if (!focusGeneratorId) return;
    setHighlightedGeneratorId(focusGeneratorId);
    setViewMode("list");
    onClearFocusGenerator?.();
    requestAnimationFrame(() => {
      focusRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    const timer = window.setTimeout(() => setHighlightedGeneratorId(null), 2000);
    return () => window.clearTimeout(timer);
  }, [focusGeneratorId, onClearFocusGenerator]);

  useEffect(() => {
    if (!actionsMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (actionsMenuRef.current?.contains(event.target as Node)) return;
      if (actionsMenuButtonRef.current?.contains(event.target as Node)) return;
      setActionsMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setActionsMenuOpen(false);
        actionsMenuButtonRef.current?.focus();
        return;
      }
      if (actionsMenuRef.current) handleMenuArrowKeys(event, actionsMenuRef.current);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    requestAnimationFrame(() => {
      if (actionsMenuRef.current) getMenuItems(actionsMenuRef.current)[0]?.focus();
    });

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [actionsMenuOpen]);

  const clearPendingState = useCallback(() => {
    onClearPendingTemplate?.();
    onClearPendingGroup?.();
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

  const runGenerators = useCallback(
    async (action: "all" | "stale" | "failed", selectedGenerators: TokenGenerator[]) => {
      if (selectedGenerators.length === 0) return;
      setRunningAction(action);
      let successCount = 0;
      let totalTokens = 0;
      const errors: string[] = [];

      const generatorsToRun = [...selectedGenerators].sort(
        (left, right) =>
          (left.upstreamGenerators?.length ?? 0) - (right.upstreamGenerators?.length ?? 0),
      );

      for (const generator of generatorsToRun) {
        try {
          const result = await apiFetch<{ count: number }>(
            `${serverUrl}/api/generators/${generator.id}/run`,
            { method: "POST" },
          );
          successCount += 1;
          totalTokens += result.count ?? 0;
        } catch {
          errors.push(generator.name);
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

  const staleGenerators = useMemo(
    () => setGenerators.filter((generator) => getGeneratorDashboardStatus(generator) === "stale"),
    [setGenerators],
  );
  const failedGenerators = useMemo(
    () => setGenerators.filter((generator) => getGeneratorDashboardStatus(generator) === "failed"),
    [setGenerators],
  );

  const filteredGenerators = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return setGenerators.filter((generator) => {
      if (typeFilter && generator.type !== typeFilter) return false;
      if (!query) return true;
      return (
        generator.name.toLowerCase().includes(query) ||
        (generator.sourceToken ?? "").toLowerCase().includes(query) ||
        generator.targetGroup.toLowerCase().includes(query) ||
        getGeneratorTypeLabel(generator.type).toLowerCase().includes(query)
      );
    });
  }, [searchQuery, setGenerators, typeFilter]);

  const presentTypes = useMemo<GeneratorType[]>(() => {
    const seen = new Set<GeneratorType>();
    for (const generator of setGenerators) seen.add(generator.type);
    return Array.from(seen).sort((left, right) =>
      getGeneratorTypeLabel(left).localeCompare(getGeneratorTypeLabel(right)),
    );
  }, [setGenerators]);

  const getViewTokensToastAction = useCallback(
    (info: GeneratorSaveSuccessInfo): ToastAction | undefined =>
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
        ? createGeneratorDraftFromTemplate(pendingTemplate, activeSet, {
            sourceTokenPath: pendingGroupPath ?? undefined,
          })
        : undefined,
    [activeSet, pendingGroupPath, pendingTemplate],
  );

  const handleGraphEditClose = useCallback(() => {
    setGraphEditing({ kind: "none" });
    onRefresh();
  }, [onRefresh]);

  const handleGraphEditSaved = useCallback(() => {
    setGraphEditing({ kind: "none" });
    onRefresh();
    dispatchToast("Recipe updated", "success");
  }, [onRefresh]);

  const handleGraphRun = useCallback(
    async (generatorId: string) => {
      try {
        const result = await apiFetch<{ count: number }>(
          `${serverUrl}/api/generators/${generatorId}/run`,
          { method: "POST" },
        );
        dispatchToast(
          `Recipe ran — ${result.count ?? 0} token${(result.count ?? 0) === 1 ? "" : "s"} updated`,
          "success",
        );
      } catch {
        dispatchToast("Recipe run failed", "error");
      }
      onRefresh();
    },
    [onRefresh, serverUrl],
  );

  if (graphEditing.kind === "editing") {
    const generator = setGenerators.find((item) => item.id === graphEditing.generatorId);
    if (generator) {
      return (
        <TokenGeneratorDialog
          serverUrl={serverUrl}
          allSets={allSets}
          activeSet={activeSet}
          existingGenerator={generator}
          onBack={handleGraphEditClose}
          onClose={handleGraphEditClose}
          onSaved={handleGraphEditSaved}
          getSuccessToastAction={getViewTokensToastAction}
          onInterceptSemanticMapping={() => {}}
          onPushUndo={onPushUndo}
        />
      );
    }
  }

  if (showCreateDialog) {
    return (
      <TokenGeneratorDialog
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

  if (loading && setGenerators.length === 0) {
    return (
      <div className="flex flex-col gap-2 overflow-y-auto p-3" aria-busy="true" aria-label="Loading recipes">
        <SkeletonGeneratorCard />
        <SkeletonGeneratorCard />
        <SkeletonGeneratorCard />
      </div>
    );
  }

  if (setGenerators.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 py-8 text-center">
        <FeedbackPlaceholder
          variant="empty"
          size="section"
          className="w-full max-w-[320px]"
          title="No recipes yet"
          description="Create one recipe and the editor will guide the type, source, destination, and save review in a single flow."
        />
        <button
          type="button"
          onClick={() => setShowCreateDialog(true)}
          disabled={!connected}
          className="mt-4 rounded-md bg-[var(--color-figma-accent)] px-4 py-2 text-[11px] font-medium text-white transition-colors hover:bg-[var(--color-figma-accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Create your first recipe
        </button>
        {!connected && (
          <p className="mt-2 text-[10px] text-[var(--color-figma-text-tertiary)]">
            Connect to the server to create recipes.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b border-[var(--color-figma-border)] px-3 py-2">
        <div className="flex items-center gap-2">
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

          <button
            type="button"
            onClick={() => setShowCreateDialog(true)}
            disabled={!connected}
            className="shrink-0 rounded-md bg-[var(--color-figma-accent)] px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-[var(--color-figma-accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Add recipe
          </button>

          <div className="relative shrink-0">
            <button
              ref={actionsMenuButtonRef}
              type="button"
              onClick={() => setActionsMenuOpen((open) => !open)}
              disabled={!connected}
              className={`flex h-8 w-8 items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                actionsMenuOpen
                  ? "border-[var(--color-figma-accent)]/30 bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]"
                  : "border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-secondary)] hover:text-[var(--color-figma-text)]"
              }`}
              aria-label="Recipe actions"
              aria-haspopup="menu"
              aria-expanded={actionsMenuOpen}
            >
              {runningAction ? (
                <svg
                  width="12"
                  height="12"
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
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="5" r="1" />
                  <circle cx="12" cy="12" r="1" />
                  <circle cx="12" cy="19" r="1" />
                </svg>
              )}
            </button>

            {actionsMenuOpen && (
              <div
                ref={actionsMenuRef}
                role="menu"
                className="absolute right-0 top-full z-50 mt-1 w-48 rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] py-1 shadow-lg"
              >
                {viewMode === "list" && (
                  <button
                    role="menuitem"
                    onClick={() =>
                      runMenuAction(() => {
                        setViewMode("graph");
                      })
                    }
                    className="w-full px-3 py-2 text-left text-[10px] text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)]"
                  >
                    View dependency graph
                  </button>
                )}
                {staleGenerators.length > 0 && (
                  <button
                    role="menuitem"
                    onClick={() => runMenuAction(() => void runGenerators("stale", staleGenerators))}
                    disabled={runningAction !== null}
                    className="w-full px-3 py-2 text-left text-[10px] text-[var(--color-figma-warning,#f59e0b)] transition-colors hover:bg-[var(--color-figma-warning,#f59e0b)]/10 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Re-run stale ({staleGenerators.length})
                  </button>
                )}
                {failedGenerators.length > 0 && (
                  <button
                    role="menuitem"
                    onClick={() => runMenuAction(() => void runGenerators("failed", failedGenerators))}
                    disabled={runningAction !== null}
                    className="w-full px-3 py-2 text-left text-[10px] text-[var(--color-figma-error)] transition-colors hover:bg-[var(--color-figma-error)]/10 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Retry failed ({failedGenerators.length})
                  </button>
                )}
                <button
                  role="menuitem"
                  onClick={() => runMenuAction(() => void runGenerators("all", setGenerators))}
                  disabled={runningAction !== null}
                  className="w-full px-3 py-2 text-left text-[10px] text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Run all recipes
                </button>
                <div className="my-1 border-t border-[var(--color-figma-border)]" role="separator" />
                <button
                  role="menuitem"
                  onClick={() =>
                    runMenuAction(() => {
                      exportGraphAsSVG(setGenerators, activeSet);
                    })
                  }
                  className="w-full px-3 py-2 text-left text-[10px] text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)]"
                >
                  Export as SVG
                </button>
              </div>
            )}
          </div>
        </div>

        {presentTypes.length > 1 && (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => setTypeFilter(null)}
              className={`rounded-full border px-2 py-0.5 text-[10px] transition-colors ${
                typeFilter === null
                  ? "border-[var(--color-figma-accent)]/40 bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]"
                  : "border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-secondary)] hover:text-[var(--color-figma-text)]"
              }`}
            >
              All
            </button>
            {presentTypes.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setTypeFilter(typeFilter === type ? null : type)}
                className={`rounded-full border px-2 py-0.5 text-[10px] transition-colors ${
                  typeFilter === type
                    ? "border-[var(--color-figma-accent)]/40 bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]"
                    : "border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-secondary)] hover:text-[var(--color-figma-text)]"
                }`}
              >
                {getGeneratorTypeLabel(type)}
              </button>
            ))}
          </div>
        )}
      </div>

      {viewMode === "graph" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-[var(--color-figma-border)] px-3 py-2">
            <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
              Dependency graph
            </span>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className="text-[10px] font-medium text-[var(--color-figma-accent)] transition-colors hover:text-[var(--color-figma-accent-hover)]"
            >
              Back to list
            </button>
          </div>
          <NodeGraphCanvas
            generators={filteredGenerators}
            activeSet={activeSet}
            onPushUndo={onPushUndo}
            searchQuery={searchQuery}
            onEditGenerator={(generatorId) => setGraphEditing({ kind: "editing", generatorId })}
            onRunGenerator={handleGraphRun}
            onViewTokens={onViewTokens}
          />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3">
          {filteredGenerators.length > 0 ? (
            <div className="flex flex-col gap-2">
              {filteredGenerators.map((generator) => (
                <GeneratorPipelineCard
                  key={generator.id}
                  generator={generator}
                  isFocused={generator.id === highlightedGeneratorId}
                  focusRef={focusRef}
                  serverUrl={serverUrl}
                  allSets={allSets}
                  activeSet={activeSet}
                  onRefresh={onRefresh}
                  allTokensFlat={allTokensFlat}
                  onPushUndo={onPushUndo}
                  onViewTokens={onViewTokens}
                />
              ))}
            </div>
          ) : (
            <FeedbackPlaceholder
              variant="no-results"
              size="full"
              title="No recipes match"
              description="Try a different search term or clear the active filter."
              secondaryAction={
                searchQuery || typeFilter
                  ? {
                      label: "Clear filters",
                      onClick: () => {
                        setSearchQuery("");
                        setTypeFilter(null);
                      },
                    }
                  : undefined
              }
            />
          )}
        </div>
      )}
    </div>
  );
}
