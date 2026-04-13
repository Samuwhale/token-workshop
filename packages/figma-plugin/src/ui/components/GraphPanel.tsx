import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type {
  TokenGenerator,
  GeneratorTemplate,
  GeneratorType,
} from "../hooks/useGenerators";
import { getGeneratorDashboardStatus } from "../hooks/useGenerators";
import type { UndoSlot } from "../hooks/useUndo";
import type { TokenMapEntry } from "../../shared/types";
import { NodeGraphCanvas } from "./nodeGraph/NodeGraphCanvas";
import { usePanelHelp, PanelHelpIcon, PanelHelpBanner } from "./PanelHelpHint";
import { apiFetch } from "../shared/apiFetch";
import { dispatchToast } from "../shared/toastBus";
import type { ToastAction } from "../shared/toastBus";
import { TokenGeneratorDialog } from "./TokenGeneratorDialog";
import { GRAPH_TEMPLATES, templateIdForTokenType } from "./graph-templates";
import type { GraphTemplate } from "./graph-templates";
import { TemplatePicker } from "./TemplatePicker";
import {
  GeneratorPipelineCard,
  getGeneratorTypeLabel,
} from "./GeneratorPipelineCard";
import type { GeneratorSaveSuccessInfo } from "../hooks/useGeneratorSave";
import { SkeletonGeneratorCard } from "./Skeleton";
import { FeedbackPlaceholder } from "./FeedbackPlaceholder";
import { createGeneratorDraftFromTemplate } from "../hooks/useGeneratorDialog";

// ---------------------------------------------------------------------------
// Graph view editing state — generator being edited from the graph canvas
// ---------------------------------------------------------------------------
type GraphEditingState =
  | { kind: "none" }
  | { kind: "editing"; generatorId: string };

// ---------------------------------------------------------------------------
// SVG export
// ---------------------------------------------------------------------------

function exportGraphAsSVG(
  generators: TokenGenerator[],
  activeSet: string,
): void {
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

  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const trunc = (s: string, n: number) =>
    s.length > n ? s.slice(0, n - 1) + "\u2026" : s;

  let rows = "";
  generators.forEach((gen, i) => {
    const y = padY + titleH + i * (cardH + rowGap);
    const genLabel = trunc(gen.name || getGeneratorTypeLabel(gen.type), 28);
    const sourceLabel = gen.sourceToken ? `\u2190 ${trunc(gen.sourceToken, 30)}` : "\u2190 standalone";
    const targetLabel = `\u2192 ${trunc(gen.targetGroup + ".*", 30)}`;

    rows +=
      `<rect x="${padX}" y="${y}" width="${cardW}" height="${cardH}" rx="${cardR}" fill="#eff6ff" stroke="#93c5fd" stroke-width="1"/>` +
      `<text x="${padX + 10}" y="${y + 18}" font-family="system-ui,sans-serif" font-size="11" font-weight="600" fill="#1d4ed8">${esc(genLabel)}</text>` +
      `<text x="${padX + 10}" y="${y + 34}" font-family="ui-monospace,monospace" font-size="8" fill="#6b7280">${esc(sourceLabel)}  ${esc(targetLabel)}</text>`;
  });

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">`,
    `<rect width="${svgW}" height="${svgH}" fill="white"/>`,
    `<text x="${padX}" y="${padY + 18}" font-family="system-ui,sans-serif" font-size="13" font-weight="600" fill="#111827">${esc(activeSet)} \u2014 Generator graph</text>`,
    rows,
    "</svg>",
  ].join("\n");

  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${activeSet}-graph.svg`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface GraphPanelProps {
  serverUrl: string;
  activeSet: string;
  allSets: string[];
  generators: TokenGenerator[];
  loading?: boolean;
  connected: boolean;
  onRefresh: () => void;
  onPushUndo?: (slot: UndoSlot) => void;
  onApplyTemplate?: (templateId: string) => void;
  pendingTemplateId?: string | null;
  pendingGroupPath?: string | null;
  pendingGroupTokenType?: string | null;
  onClearPendingGroup?: () => void;
  focusGeneratorId?: string | null;
  onClearFocusGenerator?: () => void;
  allTokensFlat?: Record<string, TokenMapEntry>;
  onViewTokens?: (targetGroup: string, targetSet: string) => void;
  /** When true, automatically opens the template picker on mount (used when navigating from ThemeManager). */
  openTemplatePicker?: boolean;
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
  onApplyTemplate,
  pendingTemplateId,
  pendingGroupPath,
  pendingGroupTokenType,
  onClearPendingGroup,
  focusGeneratorId,
  onClearFocusGenerator,
  allTokensFlat,
  onViewTokens,
  openTemplatePicker,
}: GraphPanelProps) {
  const help = usePanelHelp("generators");
  const setGenerators = generators.filter((g) => g.targetSet === activeSet);
  const focusRef = useRef<HTMLDivElement>(null);

  const suggestedTemplateId = pendingGroupPath
    ? (GRAPH_TEMPLATES.find(
        (t) => t.id === templateIdForTokenType(pendingGroupTokenType),
      )?.id ??
      GRAPH_TEMPLATES[0]?.id ??
      null)
    : pendingTemplateId
      ? (GRAPH_TEMPLATES.find((t) => t.id === pendingTemplateId)?.id ?? null)
      : null;

  const [selectedTemplate, setSelectedTemplate] = useState<GraphTemplate | null>(
    null,
  );
  const [browsingTemplates, setBrowsingTemplates] = useState(
    Boolean(openTemplatePicker || suggestedTemplateId),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<GeneratorType | null>(null);
  // Default to graph view when there are enough generators to make it useful.
  // Reset when activeSet changes since the generator count may differ per set.
  const [viewMode, setViewMode] = useState<"graph" | "list">(() =>
    setGenerators.length >= 3 ? "graph" : "list",
  );
  const prevActiveSetRef = useRef(activeSet);
  useEffect(() => {
    if (prevActiveSetRef.current === activeSet) return;
    prevActiveSetRef.current = activeSet;
    setViewMode(setGenerators.length >= 3 ? "graph" : "list");
  }, [activeSet, setGenerators.length]);
  const [highlightedGeneratorId, setHighlightedGeneratorId] = useState<
    string | null
  >(null);
  const [runningAction, setRunningAction] = useState<
    "all" | "stale" | "failed" | "blocked" | null
  >(null);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [justApplied, setJustApplied] = useState<string | null>(null);
  const actionsMenuRef = useRef<HTMLDivElement>(null);
  const [graphEditing, setGraphEditing] = useState<GraphEditingState>({ kind: "none" });

  // Auto-open template picker when navigating from ThemeManager "Generate tokens" action
  useEffect(() => {
    if (!openTemplatePicker && !suggestedTemplateId) return;
    setBrowsingTemplates(true);
    setSelectedTemplate(null);
    if (openTemplatePicker) onClearPendingGroup?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTemplatePicker, suggestedTemplateId]);

  // Scroll to and highlight a focused generator (from token badge click)
  useEffect(() => {
    if (!focusGeneratorId) return;
    setHighlightedGeneratorId(focusGeneratorId);
    setViewMode("list"); // list view supports scroll-to-card
    onClearFocusGenerator?.();
    // Scroll after render
    requestAnimationFrame(() => {
      focusRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    // Clear highlight after 2s
    const timer = setTimeout(() => setHighlightedGeneratorId(null), 2000);
    return () => clearTimeout(timer);
  }, [focusGeneratorId, onClearFocusGenerator]);

  // Close actions menu on outside click
  useEffect(() => {
    if (!actionsMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        actionsMenuRef.current &&
        !actionsMenuRef.current.contains(e.target as Node)
      ) {
        setActionsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [actionsMenuOpen]);

  const handleSelectTemplate = (template: GraphTemplate) => {
    setSelectedTemplate(template);
  };

  const handleApplied = useCallback(() => {
    const label = selectedTemplate?.label ?? null;
    setJustApplied(label);
    setSelectedTemplate(null);
    setBrowsingTemplates(false);
    if (onApplyTemplate) onApplyTemplate("");
    if (onClearPendingGroup) onClearPendingGroup();
    onRefresh();
    if (label)
      dispatchToast(`${label} applied — tokens are generating`, "success");
  }, [selectedTemplate, onApplyTemplate, onClearPendingGroup, onRefresh]);

  const handleBack = () => {
    setSelectedTemplate(null);
    setBrowsingTemplates(false);
    setSearchQuery("");
    if (onApplyTemplate) onApplyTemplate("");
    if (onClearPendingGroup) onClearPendingGroup();
  };

  const runGenerators = useCallback(
    async (
      action: "all" | "stale" | "failed" | "blocked",
      selectedGenerators: TokenGenerator[],
    ) => {
      if (selectedGenerators.length === 0) return;
      setRunningAction(action);
      let successCount = 0;
      let totalTokens = 0;
      const errors: string[] = [];

      const generatorsToRun = [...selectedGenerators].sort(
        (a, b) =>
          (a.upstreamGenerators?.length ?? 0) - (b.upstreamGenerators?.length ?? 0),
      );

      for (const gen of generatorsToRun) {
        try {
          const res = await apiFetch<{ count: number }>(
            `${serverUrl}/api/generators/${gen.id}/run`,
            { method: "POST" },
          );
          successCount++;
          totalTokens += res.count ?? 0;
        } catch {
          errors.push(gen.name);
        }
      }

      setRunningAction(null);

      const actionLabel =
        action === "all"
          ? "Ran"
          : action === "stale"
            ? "Re-ran"
            : "Retried";
      const groupLabel =
        action === "all"
          ? "generator"
          : action === "stale"
            ? "stale generator"
            : action === "failed"
              ? "failed generator"
              : "blocked generator";

      if (errors.length === 0) {
        dispatchToast(
          `${actionLabel} ${successCount} ${groupLabel}${successCount !== 1 ? "s" : ""}${totalTokens > 0 ? ` — ${totalTokens} token${totalTokens !== 1 ? "s" : ""} updated` : ""}`,
          "success",
        );
      } else {
        dispatchToast(
          `${errors.length} ${groupLabel}${errors.length !== 1 ? "s" : ""} failed: ${errors.join(", ")}`,
          "error",
        );
      }
      onRefresh();
    },
    [onRefresh, serverUrl],
  );

  const staleGenerators = setGenerators.filter(
    (generator) => getGeneratorDashboardStatus(generator) === "stale",
  );
  const failedGenerators = setGenerators.filter(
    (generator) => getGeneratorDashboardStatus(generator) === "failed",
  );
  const blockedGenerators = setGenerators.filter(
    (generator) => getGeneratorDashboardStatus(generator) === "blocked",
  );
  const attentionGenerators = setGenerators.filter((generator) => {
    const status = getGeneratorDashboardStatus(generator);
    return status === "stale" || status === "failed" || status === "blocked";
  });

  const handleRunAll = async () => {
    await runGenerators("all", setGenerators);
  };

  const handleRunStale = async () => {
    await runGenerators("stale", staleGenerators);
  };

  const handleRetryFailed = async () => {
    await runGenerators("failed", failedGenerators);
  };

  const handleRetryBlocked = async () => {
    await runGenerators("blocked", blockedGenerators);
  };

  const generatorTemplate = useMemo<GeneratorTemplate | undefined>(() => {
    if (!selectedTemplate) return undefined;
    return {
      id: selectedTemplate.id,
      label: selectedTemplate.label,
      description: selectedTemplate.description,
      defaultPrefix: selectedTemplate.defaultPrefix,
      generatorType: selectedTemplate.generatorType,
      config: selectedTemplate.config,
      requiresSource: selectedTemplate.requiresSource,
    };
  }, [selectedTemplate]);

  const q = searchQuery.trim().toLowerCase();
  const filteredGenerators = setGenerators.filter((g) => {
    if (typeFilter && g.type !== typeFilter) return false;
    if (!q) return true;
    return (
      g.name.toLowerCase().includes(q) ||
      (g.sourceToken ?? "").toLowerCase().includes(q) ||
      g.targetGroup.toLowerCase().includes(q) ||
      (g.upstreamGenerators ?? []).some((dependency) =>
        dependency.name.toLowerCase().includes(q),
      ) ||
      (g.downstreamGenerators ?? []).some((dependency) =>
        dependency.name.toLowerCase().includes(q),
      ) ||
      getGeneratorTypeLabel(g.type).toLowerCase().includes(q)
    );
  });

  // Types present in the current set — used for filter pills
  const presentTypes = useMemo<GeneratorType[]>(() => {
    const seen = new Set<GeneratorType>();
    for (const g of setGenerators) seen.add(g.type);
    return Array.from(seen).sort((a, b) =>
      getGeneratorTypeLabel(a).localeCompare(getGeneratorTypeLabel(b)),
    );
  }, [setGenerators]);
  const filteredTemplates = q
    ? GRAPH_TEMPLATES.filter(
        (t) =>
          t.label.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.whenToUse.toLowerCase().includes(q) ||
          t.generatorType.toLowerCase().includes(q) ||
          t.sourceRequirement.toLowerCase().includes(q) ||
          t.starterPreset.toLowerCase().includes(q),
      )
    : GRAPH_TEMPLATES;
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

  // ---------------------------------------------------------------------------
  // Graph canvas action handlers
  // ---------------------------------------------------------------------------

  const handleGraphEdit = useCallback((generatorId: string) => {
    setGraphEditing({ kind: "editing", generatorId });
  }, []);

  const handleGraphRun = useCallback(async (generatorId: string) => {
    try {
      const res = await apiFetch<{ count: number }>(
        `${serverUrl}/api/generators/${generatorId}/run`,
        { method: "POST" },
      );
      dispatchToast(
        `Generator ran — ${res.count ?? 0} token${(res.count ?? 0) !== 1 ? "s" : ""} updated`,
        "success",
      );
    } catch {
      dispatchToast("Generator run failed", "error");
    }
    onRefresh();
  }, [serverUrl, onRefresh]);

  const handleGraphEditClose = useCallback(() => {
    setGraphEditing({ kind: "none" });
    onRefresh();
  }, [onRefresh]);

  const handleGraphEditSaved = useCallback(() => {
    setGraphEditing({ kind: "none" });
    onRefresh();
    dispatchToast("Generator updated", "success");
  }, [onRefresh]);

  // Generator editing from graph view
  if (graphEditing.kind === "editing") {
    const editGen = setGenerators.find(g => g.id === graphEditing.generatorId);
    if (editGen) {
      return (
        <TokenGeneratorDialog
          serverUrl={serverUrl}
          allSets={allSets}
          activeSet={activeSet}
          existingGenerator={editGen}
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

  // Template configuration — open full TokenGeneratorDialog pre-filled from template.
  // generatorTemplate and handleTemplateSaved are memoized at hook scope above.
  if (selectedTemplate) {
    return (
      <TokenGeneratorDialog
        serverUrl={serverUrl}
        allSets={allSets}
        activeSet={activeSet}
        template={generatorTemplate}
        initialDraft={createGeneratorDraftFromTemplate(selectedTemplate, activeSet, {
          sourceTokenPath: pendingGroupPath ?? undefined,
        })}
        sourceTokenPath={pendingGroupPath ?? undefined}
        sourceTokenType={pendingGroupTokenType ?? undefined}
        onBack={handleBack}
        onClose={handleBack}
        onSaved={handleApplied}
        getSuccessToastAction={getViewTokensToastAction}
        onInterceptSemanticMapping={() => {}}
        onPushUndo={onPushUndo}
      />
    );
  }

  // Pipeline view — generators exist (and not browsing templates)
  if (setGenerators.length > 0 && !browsingTemplates) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* Header row 1: title + actions */}
        <div className="px-3 py-2 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shrink-0 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[11px] font-medium text-[var(--color-figma-text)] shrink-0">
              Generators
            </span>
            <span className="text-[10px] text-[var(--color-figma-text-tertiary)] truncate">
              {q || typeFilter
                ? `${filteredGenerators.length} of ${setGenerators.length}`
                : String(setGenerators.length)}
            </span>
            <PanelHelpIcon
              panelKey="generators"
              title="Generators"
              expanded={help.expanded}
              onToggle={help.toggle}
            />
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {/* View mode toggle */}
            <div className="flex rounded border border-[var(--color-figma-border)] overflow-hidden text-[10px]">
              <button
                onClick={() => setViewMode("list")}
                className={`px-2 py-1 transition-colors ${viewMode === "list" ? "bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]" : "text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)]"}`}
                title="List view"
                aria-label="List view"
                aria-pressed={viewMode === "list"}
              >
                List
              </button>
              <button
                onClick={() => setViewMode("graph")}
                className={`px-2 py-1 transition-colors border-l border-[var(--color-figma-border)] ${viewMode === "graph" ? "bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]" : "text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)]"}`}
                title="Graph view"
                aria-label="Graph view"
                aria-pressed={viewMode === "graph"}
              >
                Graph
              </button>
            </div>
            {/* Add generator — primary action */}
            <button
              onClick={() => setBrowsingTemplates(true)}
              disabled={!connected}
              className="text-[10px] px-2.5 py-1 rounded bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
            >
              <svg
                width="9"
                height="9"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add generator
            </button>
            {/* Actions overflow menu */}
            <div className="relative" ref={actionsMenuRef}>
              <button
                onClick={() => setActionsMenuOpen((v) => !v)}
                disabled={!connected}
                className={`relative p-1 rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${actionsMenuOpen ? "border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]" : "border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"}`}
                title="More actions"
                aria-label="More actions"
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
                {attentionGenerators.length > 0 && !actionsMenuOpen && (
                  <span className="absolute -top-1 -right-1 min-w-[12px] h-[12px] px-[2px] flex items-center justify-center rounded-full bg-yellow-400 border border-[var(--color-figma-bg)] text-yellow-900 text-[7px] font-bold leading-none pointer-events-none">
                    {attentionGenerators.length}
                  </span>
                )}
              </button>
              {actionsMenuOpen && (
                <div
                  className="absolute right-0 top-full mt-1 w-52 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-lg z-50 py-0.5 text-[11px]"
                  role="menu"
                >
                  {staleGenerators.length > 0 && (
                    <button
                      role="menuitem"
                      onClick={() => {
                        setActionsMenuOpen(false);
                        handleRunStale();
                      }}
                      disabled={runningAction !== null}
                      className="w-full text-left px-3 py-2 flex items-center gap-2 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-400/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
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
                        <path d="M12 9v4M12 17h.01" />
                        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                      </svg>
                      Re-run stale ({staleGenerators.length})
                    </button>
                  )}
                  {failedGenerators.length > 0 && (
                    <button
                      role="menuitem"
                      onClick={() => {
                        setActionsMenuOpen(false);
                        handleRetryFailed();
                      }}
                      disabled={runningAction !== null}
                      className="w-full text-left px-3 py-2 flex items-center gap-2 text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
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
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      Retry failed ({failedGenerators.length})
                    </button>
                  )}
                  {blockedGenerators.length > 0 && (
                    <button
                      role="menuitem"
                      onClick={() => {
                        setActionsMenuOpen(false);
                        handleRetryBlocked();
                      }}
                      disabled={runningAction !== null}
                      className="w-full text-left px-3 py-2 flex items-center gap-2 text-amber-700 dark:text-amber-400 hover:bg-amber-400/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
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
                        <path d="M18 8a6 6 0 0 0-12 0v3a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2Z" />
                      </svg>
                      Retry blocked ({blockedGenerators.length})
                    </button>
                  )}
                  <button
                    role="menuitem"
                    onClick={() => {
                      setActionsMenuOpen(false);
                      handleRunAll();
                    }}
                    disabled={runningAction !== null}
                    className="w-full text-left px-3 py-2 flex items-center gap-2 text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
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
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                    Run all generators
                  </button>
                  <div
                    className="my-0.5 border-t border-[var(--color-figma-border)]"
                    role="separator"
                  />
                  <button
                    role="menuitem"
                    onClick={() => {
                      setActionsMenuOpen(false);
                      exportGraphAsSVG(setGenerators, activeSet);
                    }}
                    className="w-full text-left px-3 py-2 flex items-center gap-2 text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                  >
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
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Export as SVG
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {help.expanded && (
          <PanelHelpBanner
            title="Generators"
            description="Turn a single source token into a whole token group automatically — color ramps, spacing scales, type scales, and more. Pick a template to get started, then customize the parameters."
            onDismiss={help.dismiss}
          />
        )}

        {/* Search bar (shown in both views) */}
        <div className="px-3 pt-2.5 pb-1 shrink-0">
          <div className="relative">
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--color-figma-text-tertiary)] pointer-events-none"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                viewMode === "graph"
                  ? "Search generators — highlights and zooms to matches…"
                  : "Search generators…"
              }
              aria-label="Search generators"
              className="w-full pl-6 pr-6 py-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[11px] text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-tertiary)] focus:focus-visible:border-[var(--color-figma-accent)]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text)] transition-colors"
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
        </div>

        {/* Type filter pills — shown only when multiple types exist */}
        {presentTypes.length > 1 && (
          <div className="px-3 pb-2 shrink-0 flex items-center gap-1 flex-wrap">
            <button
              onClick={() => setTypeFilter(null)}
              className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${typeFilter === null ? "bg-[var(--color-figma-accent)]/10 border-[var(--color-figma-accent)]/40 text-[var(--color-figma-accent)]" : "border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"}`}
              aria-pressed={typeFilter === null}
            >
              All
            </button>
            {presentTypes.map((type) => (
              <button
                key={type}
                onClick={() => setTypeFilter(typeFilter === type ? null : type)}
                className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${typeFilter === type ? "bg-[var(--color-figma-accent)]/10 border-[var(--color-figma-accent)]/40 text-[var(--color-figma-accent)]" : "border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"}`}
                aria-pressed={typeFilter === type}
              >
                {getGeneratorTypeLabel(type)}
              </button>
            ))}
          </div>
        )}

        {/* Node graph view */}
        {viewMode === "graph" && (
          <NodeGraphCanvas
            generators={filteredGenerators}
            activeSet={activeSet}
            onRefresh={onRefresh}
            onPushUndo={onPushUndo}
            searchQuery={searchQuery}
            onEditGenerator={handleGraphEdit}
            onRunGenerator={handleGraphRun}
            onViewTokens={onViewTokens}
          />
        )}

        {/* List view */}
        {viewMode === "list" && (
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
            {filteredGenerators.length > 0 ? (
              filteredGenerators.map((gen) => (
                <GeneratorPipelineCard
                  key={gen.id}
                  generator={gen}
                  isFocused={gen.id === highlightedGeneratorId}
                  focusRef={focusRef}
                  serverUrl={serverUrl}
                  allSets={allSets}
                  activeSet={activeSet}
                  onRefresh={onRefresh}
                  allTokensFlat={allTokensFlat}
                  onPushUndo={onPushUndo}
                  onViewTokens={onViewTokens}
                />
              ))
            ) : (
              <FeedbackPlaceholder
                variant="no-results"
                size="full"
                title="No generators match"
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

  // Loading state — generators haven't loaded yet
  if (loading && setGenerators.length === 0) {
    return (
      <div
        className="flex flex-col gap-2 p-3 overflow-y-auto"
        aria-label="Loading generators…"
        aria-busy="true"
      >
        <SkeletonGeneratorCard />
        <SkeletonGeneratorCard />
        <SkeletonGeneratorCard />
      </div>
    );
  }

  // True empty state — no generators exist and not browsing templates
  if (setGenerators.length === 0 && !browsingTemplates) {
    return (
      <div className="flex flex-col h-full overflow-y-auto">
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 text-center">
          <FeedbackPlaceholder
            variant="empty"
            size="section"
            className="w-full max-w-[320px]"
            icon={
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="5" cy="12" r="3" />
                <path d="M8 12h3" />
                <rect x="11" y="9" width="6" height="6" rx="1" />
                <path d="M17 12h3" />
                <circle cx="22" cy="12" r="1" />
              </svg>
            }
            title="No generators yet"
            description="Generators turn a source token into a whole token group — color scales, spacing scales, type scales, contrast pairs, and semantic aliases."
          />

          {/* What generators produce */}
          <div className="mt-5 grid w-full max-w-[320px] grid-cols-2 gap-1.5">
            {[
              {
                label: "Color scales",
                icon: (
                  <>
                    <div
                      className="w-1.5 h-3 rounded-sm"
                      style={{ background: "hsl(220,70%,80%)" }}
                    />
                    <div
                      className="w-1.5 h-3 rounded-sm"
                      style={{ background: "hsl(220,70%,55%)" }}
                    />
                    <div
                      className="w-1.5 h-3 rounded-sm"
                      style={{ background: "hsl(220,70%,30%)" }}
                    />
                  </>
                ),
              },
              {
                label: "Spacing scales",
                icon: (
                  <>
                    <div
                      className="h-1.5 rounded-sm bg-[var(--color-figma-accent)]"
                      style={{ width: "4px", opacity: 0.5 }}
                    />
                    <div
                      className="h-1.5 rounded-sm bg-[var(--color-figma-accent)]"
                      style={{ width: "8px", opacity: 0.7 }}
                    />
                    <div
                      className="h-1.5 rounded-sm bg-[var(--color-figma-accent)]"
                      style={{ width: "14px" }}
                    />
                  </>
                ),
              },
              {
                label: "Type scales",
                icon: (
                  <div className="flex items-baseline gap-0.5">
                    <span className="text-[7px] font-medium text-[var(--color-figma-text-secondary)]">
                      A
                    </span>
                    <span className="text-[10px] font-medium text-[var(--color-figma-text)]">
                      A
                    </span>
                    <span className="text-[11px] font-medium text-[var(--color-figma-accent)]">
                      A
                    </span>
                  </div>
                ),
              },
              {
                label: "Semantic aliases",
                icon: (
                  <>
                    <span className="text-[8px] font-mono text-[var(--color-figma-accent)]">
                      500
                    </span>
                    <svg
                      width="8"
                      height="8"
                      viewBox="0 0 8 8"
                      fill="currentColor"
                      className="text-[var(--color-figma-text-tertiary)]"
                    >
                      <path d="M2 1l4 3-4 3V1z" />
                    </svg>
                    <span className="text-[8px] font-mono text-[var(--color-figma-text-secondary)]">
                      btn
                    </span>
                  </>
                ),
              },
            ].map(({ label, icon }) => (
              <div
                key={label}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]"
              >
                <div className="flex items-center gap-0.5 w-8 justify-center shrink-0">
                  {icon}
                </div>
                <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                  {label}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-5 flex w-full max-w-[320px] flex-col items-center gap-3">
            <button
              onClick={() => setBrowsingTemplates(true)}
              disabled={!connected}
              className="px-4 py-2 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Add your first generator
            </button>

            {!connected && (
              <FeedbackPlaceholder
                variant="disconnected"
                size="section"
                className="w-full"
                title="Connect to the server first"
                description="Template setup needs the server connection before it can create and run generators."
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  // Template browsing — no generators yet or user clicked "+ Template"
  return (
    <TemplatePicker
      templates={filteredTemplates}
      connected={connected}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      onSelectTemplate={handleSelectTemplate}
      browsingTemplates={browsingTemplates}
      onBack={handleBack}
      activeSet={activeSet}
      justApplied={justApplied}
      sourceTokenType={pendingGroupTokenType ?? undefined}
      suggestedTemplateId={suggestedTemplateId}
    />
  );
}
