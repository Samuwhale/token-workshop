import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TokenGenerator, GeneratorType, GeneratedTokenResult } from "../hooks/useGenerators";
import { getGeneratorDashboardStatus } from "../hooks/useGenerators";
import type { TokenMapEntry } from "../../shared/types";
import { apiFetch } from "../shared/apiFetch";
import { TokenGeneratorDialog } from "./TokenGeneratorDialog";
import { SemanticMappingDialog } from "./SemanticMappingDialog";
import type { GeneratorSaveSuccessInfo } from "../hooks/useGeneratorSave";
import { dispatchToast } from "../shared/toastBus";
import type { ToastAction } from "../shared/toastBus";
import { ConfirmModal } from "./ConfirmModal";
import { getMenuItems, handleMenuArrowKeys } from "../hooks/useMenuKeyboard";

export function getGeneratorTypeLabel(type: GeneratorType): string {
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

type DashboardStatus = ReturnType<typeof getGeneratorDashboardStatus>;

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

function formatInlineValue(value: unknown): string {
  if (value === null || value === undefined) return "standalone";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object" && value && "value" in (value as Record<string, unknown>)) {
    const dimension = value as { value?: unknown; unit?: unknown };
    return `${dimension.value ?? ""}${dimension.unit ?? ""}`;
  }
  return JSON.stringify(value);
}

function getRecipeStatusDetail(generator: TokenGenerator, status: DashboardStatus): string {
  if (status === "blocked") {
    const blockedBy = generator.blockedByGenerators?.map((dependency) => dependency.name).filter(Boolean) ?? [];
    if (blockedBy.length > 0) {
      return `Blocked by ${blockedBy.join(", ")}`;
    }
  }
  if (generator.lastRunError?.message) return generator.lastRunError.message;
  if (generator.lastRunSummary?.message) return generator.lastRunSummary.message;
  if (generator.staleReason) return generator.staleReason;
  switch (status) {
    case "stale":
      return "Source changed since the last run.";
    case "failed":
      return "Last run failed.";
    case "neverRun":
      return "This recipe has not run yet.";
    case "upToDate":
      return "Outputs match the current source.";
    case "blocked":
      return "This recipe is waiting on an upstream dependency.";
    default:
      return generator.enabled === false ? "This recipe is paused." : "Recipe state available.";
  }
}

function getStatusDotClass(status: DashboardStatus, isPaused: boolean): string {
  if (isPaused) return "border-[var(--color-figma-text-tertiary)] bg-[var(--color-figma-text-tertiary)]/20";
  switch (status) {
    case "upToDate":
      return "border-[var(--color-figma-success,#22c55e)] bg-[var(--color-figma-success,#22c55e)]";
    case "stale":
      return "border-[var(--color-figma-warning,#f59e0b)] bg-[var(--color-figma-warning,#f59e0b)]";
    case "failed":
    case "blocked":
      return "border-[var(--color-figma-error)] bg-[var(--color-figma-error)]";
    case "neverRun":
      return "border-[var(--color-figma-border)] bg-transparent";
    default:
      return "border-[var(--color-figma-border)] bg-[var(--color-figma-text-tertiary)]/20";
  }
}

function getPrimaryActionConfig(status: DashboardStatus, isPaused: boolean) {
  if (isPaused) {
    return {
      label: "Resume",
      className:
        "border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)]/30 hover:text-[var(--color-figma-text)]",
    };
  }
  if (status === "stale") {
    return {
      label: "Re-run",
      className:
        "border-[var(--color-figma-warning,#f59e0b)]/50 bg-[var(--color-figma-warning,#f59e0b)]/10 text-[var(--color-figma-warning,#f59e0b)] hover:bg-[var(--color-figma-warning,#f59e0b)]/16",
    };
  }
  if (status === "failed" || status === "blocked") {
    return {
      label: "Retry",
      className:
        "border-[var(--color-figma-error)]/40 bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/16",
    };
  }
  if (status === "neverRun") {
    return {
      label: "Run",
      className:
        "border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)]",
    };
  }
  return {
    label: "View tokens",
    className:
      "border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)]/30 hover:text-[var(--color-figma-accent)]",
  };
}

function StatusDot({
  status,
  isPaused,
  title,
}: {
  status: DashboardStatus;
  isPaused: boolean;
  title: string;
}) {
  return (
    <span
      title={title}
      aria-label={title}
      className={`mt-[2px] h-2.5 w-2.5 shrink-0 rounded-full border ${getStatusDotClass(status, isPaused)}`}
    />
  );
}

export interface GeneratorPipelineCardProps {
  generator: TokenGenerator;
  isFocused?: boolean;
  focusRef?: React.RefObject<HTMLDivElement | null>;
  serverUrl: string;
  allSets: string[];
  activeSet: string;
  onRefresh: () => void;
  allTokensFlat?: Record<string, TokenMapEntry>;
  onPushUndo?: (slot: import("../hooks/useUndo").UndoSlot) => void;
  onViewTokens?: (targetGroup: string, targetSet: string) => void;
}

export function GeneratorPipelineCard({
  generator,
  isFocused,
  focusRef,
  serverUrl,
  allSets,
  activeSet,
  onRefresh,
  allTokensFlat,
  onPushUndo,
  onViewTokens,
}: GeneratorPipelineCardProps) {
  const [running, setRunning] = useState(false);
  const [togglingEnabled, setTogglingEnabled] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showCloneDialog, setShowCloneDialog] = useState(false);
  const [cloneName, setCloneName] = useState("");
  const [cloneTargetGroup, setCloneTargetGroup] = useState("");
  const [cloneSourceToken, setCloneSourceToken] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTokensOnDelete, setDeleteTokensOnDelete] = useState(false);
  const [showSemanticDialog, setShowSemanticDialog] = useState(false);
  const [semanticDialogTokens, setSemanticDialogTokens] = useState<GeneratedTokenResult[]>([]);
  const [semanticDialogLoading, setSemanticDialogLoading] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const actionsMenuContainerRef = useRef<HTMLDivElement>(null);
  const actionsMenuRef = useRef<HTMLDivElement>(null);
  const actionsMenuButtonRef = useRef<HTMLButtonElement>(null);

  const status = getGeneratorDashboardStatus(generator);
  const isPaused = generator.enabled === false;
  const typeLabel = getGeneratorTypeLabel(generator.type);
  const semanticAliasCount = generator.semanticLayer?.mappings.length ?? 0;
  const primaryAction = getPrimaryActionConfig(status, isPaused);
  const statusDetail = getRecipeStatusDetail(generator, status);
  const lastRunAt = formatRelativeTimestamp(generator.lastRunSummary?.at);

  const secondarySummary = useMemo(() => {
    const sourceSummary = generator.sourceToken
      ? generator.sourceToken
      : formatInlineValue(generator.inlineValue);
    return [typeLabel, sourceSummary, `${generator.targetGroup}.*`, generator.targetSet]
      .filter(Boolean)
      .join(" · ");
  }, [generator.inlineValue, generator.sourceToken, generator.targetGroup, generator.targetSet, typeLabel]);

  const statusLabel = useMemo(() => {
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
  }, [isPaused, status]);

  const supportMessage = actionError
    ? actionError
    : status === "failed" || status === "blocked"
      ? statusDetail
      : null;

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

  useEffect(() => {
    if (!actionsMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (actionsMenuContainerRef.current?.contains(event.target as Node)) return;
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

  const handleToggleEnabled = useCallback(async () => {
    setTogglingEnabled(true);
    setActionError(null);
    try {
      await apiFetch(`${serverUrl}/api/generators/${generator.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: isPaused }),
      });
      dispatchToast(isPaused ? "Recipe resumed" : "Recipe paused", "success");
      onRefresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to update recipe");
    } finally {
      setTogglingEnabled(false);
    }
  }, [generator.id, isPaused, onRefresh, serverUrl]);

  const handleRun = useCallback(async () => {
    setRunning(true);
    setActionError(null);
    try {
      const result = await apiFetch<{ count?: number }>(
        `${serverUrl}/api/generators/${generator.id}/run`,
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
              onClick: () => onViewTokens(generator.targetGroup, generator.targetSet),
            }
          : undefined,
      );
      onRefresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to run recipe");
    } finally {
      setRunning(false);
    }
  }, [generator.id, generator.targetGroup, generator.targetSet, onRefresh, onViewTokens, serverUrl]);

  const fetchStepResults = useCallback(async (): Promise<GeneratedTokenResult[]> => {
    const response = await apiFetch<{ count: number; results: GeneratedTokenResult[] }>(
      `${serverUrl}/api/generators/${generator.id}/steps`,
    );
    return response.results;
  }, [generator.id, serverUrl]);

  const handleOpenSemanticDialog = useCallback(async () => {
    setSemanticDialogLoading(true);
    setActionError(null);
    try {
      const results = await fetchStepResults();
      setSemanticDialogTokens(results);
      setShowSemanticDialog(true);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to load recipe steps");
    } finally {
      setSemanticDialogLoading(false);
    }
  }, [fetchStepResults]);

  const handleSaveSemanticLayer = useCallback(
    async (semanticLayer: TokenGenerator["semanticLayer"] | null) => {
      await apiFetch(`${serverUrl}/api/generators/${generator.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ semanticLayer }),
      });
      dispatchToast("Semantic layer updated", "success");
      onRefresh();
    },
    [generator.id, onRefresh, serverUrl],
  );

  const openCloneDialog = useCallback(() => {
    setCloneName(`${generator.name} copy`);
    setCloneTargetGroup(generator.targetGroup);
    setCloneSourceToken(generator.sourceToken ?? "");
    setShowCloneDialog(true);
    setActionsMenuOpen(false);
  }, [generator.name, generator.sourceToken, generator.targetGroup]);

  const handleDuplicate = useCallback(async () => {
    setDuplicating(true);
    setActionError(null);
    try {
      await apiFetch(`${serverUrl}/api/generators`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: generator.type,
          name: cloneName.trim(),
          sourceToken: generator.sourceToken !== undefined ? cloneSourceToken.trim() || undefined : generator.sourceToken,
          inlineValue: generator.inlineValue,
          targetSet: generator.targetSet,
          targetGroup: cloneTargetGroup.trim(),
          config: generator.config,
          semanticLayer: generator.semanticLayer ?? null,
          overrides: generator.overrides,
          inputTable: generator.inputTable,
          targetSetTemplate: generator.targetSetTemplate,
        }),
      });
      setShowCloneDialog(false);
      dispatchToast("Recipe cloned", "success");
      onRefresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to clone recipe");
    } finally {
      setDuplicating(false);
    }
  }, [
    cloneName,
    cloneSourceToken,
    cloneTargetGroup,
    generator.config,
    generator.inlineValue,
    generator.inputTable,
    generator.overrides,
    generator.semanticLayer,
    generator.sourceToken,
    generator.targetSet,
    generator.targetSetTemplate,
    generator.type,
    onRefresh,
    serverUrl,
  ]);

  const handleDelete = useCallback(async () => {
    setActionError(null);
    try {
      await apiFetch(
        `${serverUrl}/api/generators/${generator.id}?deleteTokens=${deleteTokensOnDelete}`,
        { method: "DELETE" },
      );
      setShowDeleteConfirm(false);
      dispatchToast("Recipe deleted", "success");
      onRefresh();
    } catch (error) {
      setShowDeleteConfirm(false);
      setActionError(error instanceof Error ? error.message : "Unable to delete recipe");
    }
  }, [deleteTokensOnDelete, generator.id, onRefresh, serverUrl]);

  const handlePrimaryAction = useCallback(() => {
    if (isPaused) {
      void handleToggleEnabled();
      return;
    }
    if (status === "upToDate") {
      onViewTokens?.(generator.targetGroup, generator.targetSet);
      return;
    }
    void handleRun();
  }, [generator.targetGroup, generator.targetSet, handleRun, handleToggleEnabled, isPaused, onViewTokens, status]);

  const runMenuAction = (action: () => void) => {
    setActionsMenuOpen(false);
    action();
  };

  return (
    <>
      <div
        ref={isFocused ? (focusRef as React.LegacyRef<HTMLDivElement>) : undefined}
        className={`border-b border-[var(--color-figma-border)] px-1 py-2 transition-colors${
          isFocused
            ? " bg-[var(--color-figma-accent)]/[0.06]"
            : ""
        }`}
      >
        <div className="flex items-start gap-3">
          <StatusDot
            status={status}
            isPaused={isPaused}
            title={`${statusLabel}. ${statusDetail}`}
          />

          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <h3 className="truncate text-[11px] font-medium text-[var(--color-figma-text)]">
                {generator.name}
              </h3>
              <span className="shrink-0 text-[10px] text-[var(--color-figma-text-tertiary)]">
                {statusLabel}
              </span>
            </div>
            <p className="truncate text-[10px] text-[var(--color-figma-text-secondary)]">
              {secondarySummary}
            </p>
            {supportMessage && (
              <p className="mt-1 break-words text-[10px] text-[var(--color-figma-error)]">
                {supportMessage}
              </p>
            )}
            {!supportMessage && lastRunAt && (
              <p className="mt-1 text-[10px] text-[var(--color-figma-text-tertiary)]">
                Last run {lastRunAt}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={handlePrimaryAction}
              disabled={
                running ||
                togglingEnabled ||
                (status === "upToDate" && !onViewTokens)
              }
              className={`inline-flex min-w-[86px] items-center justify-center rounded-md border px-2.5 py-1.5 text-[10px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${primaryAction.className}`}
            >
              {running ? "Running…" : togglingEnabled ? "Updating…" : primaryAction.label}
            </button>

            <div className="relative" ref={actionsMenuContainerRef}>
              <button
                ref={actionsMenuButtonRef}
                type="button"
                onClick={() => setActionsMenuOpen((open) => !open)}
                className={`flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${
                  actionsMenuOpen
                    ? "border-[var(--color-figma-accent)]/30 bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]"
                    : "border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-secondary)] hover:text-[var(--color-figma-text)]"
                }`}
                aria-label="More recipe actions"
                aria-haspopup="menu"
                aria-expanded={actionsMenuOpen}
              >
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
              </button>

              {actionsMenuOpen && (
                <div
                  ref={actionsMenuRef}
                  role="menu"
                  className="absolute right-0 top-full z-50 mt-1 w-44 rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] py-1 shadow-lg"
                >
                  <button
                    role="menuitem"
                    onClick={() => runMenuAction(() => setShowEditDialog(true))}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[10px] text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)]"
                  >
                    Edit
                  </button>
                  <button
                    role="menuitem"
                    onClick={openCloneDialog}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[10px] text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)]"
                  >
                    Clone
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => runMenuAction(() => void handleOpenSemanticDialog())}
                    disabled={semanticDialogLoading}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[10px] text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {semanticDialogLoading
                      ? "Loading…"
                      : semanticAliasCount > 0
                        ? "Semantic layer"
                        : "Add semantic layer"}
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => runMenuAction(() => void handleToggleEnabled())}
                    disabled={togglingEnabled}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[10px] text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isPaused ? "Resume" : "Pause"}
                  </button>
                  <div className="my-1 border-t border-[var(--color-figma-border)]" role="separator" />
                  <button
                    role="menuitem"
                    onClick={() =>
                      runMenuAction(() => {
                        setDeleteTokensOnDelete(false);
                        setShowDeleteConfirm(true);
                      })
                    }
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[10px] text-[var(--color-figma-error)] transition-colors hover:bg-[var(--color-figma-error)]/8"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showEditDialog && (
        <TokenGeneratorDialog
          serverUrl={serverUrl}
          allSets={allSets}
          activeSet={activeSet}
          allTokensFlat={allTokensFlat}
          existingGenerator={generator}
          onClose={() => setShowEditDialog(false)}
          onSaved={() => {
            setShowEditDialog(false);
            onRefresh();
          }}
          getSuccessToastAction={getViewTokensToastAction}
          onInterceptSemanticMapping={() => {}}
          onPushUndo={onPushUndo}
        />
      )}

      {showCloneDialog && (
        <ConfirmModal
          title="Clone Recipe"
          description="Create a new recipe from the current one."
          confirmLabel={duplicating ? "Cloning…" : "Clone"}
          confirmDisabled={
            duplicating || !cloneName.trim() || !cloneTargetGroup.trim()
          }
          onConfirm={() => void handleDuplicate()}
          onCancel={() => setShowCloneDialog(false)}
        >
          <div className="mt-3 space-y-3">
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">
                Name
              </label>
              <input
                type="text"
                value={cloneName}
                onChange={(event) => setCloneName(event.target.value)}
                className="w-full rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5 text-[11px] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)]"
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">
                Target group
              </label>
              <input
                type="text"
                value={cloneTargetGroup}
                onChange={(event) => setCloneTargetGroup(event.target.value)}
                className="w-full rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5 text-[11px] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)]"
              />
            </div>
            {generator.sourceToken !== undefined && (
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">
                  Source token
                </label>
                <input
                  type="text"
                  value={cloneSourceToken}
                  onChange={(event) => setCloneSourceToken(event.target.value)}
                  className="w-full rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5 text-[11px] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)]"
                />
              </div>
            )}
          </div>
        </ConfirmModal>
      )}

      {showDeleteConfirm && (
        <ConfirmModal
          title="Delete Recipe"
          description={`Delete "${generator.name}"? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => void handleDelete()}
          onCancel={() => setShowDeleteConfirm(false)}
        >
          <label className="mt-3 flex items-center gap-2 text-[11px] text-[var(--color-figma-text-secondary)]">
            <input
              type="checkbox"
              checked={deleteTokensOnDelete}
              onChange={(event) => setDeleteTokensOnDelete(event.target.checked)}
              className="rounded"
            />
            <span>
              {semanticAliasCount > 0
                ? `Also delete managed tokens and ${semanticAliasCount} semantic alias${semanticAliasCount === 1 ? "" : "es"}`
                : "Also delete managed tokens"}
            </span>
          </label>
        </ConfirmModal>
      )}

      {showSemanticDialog && (
        <SemanticMappingDialog
          serverUrl={serverUrl}
          generatedTokens={semanticDialogTokens}
          generatorType={generator.type}
          targetGroup={generator.targetGroup}
          targetSet={generator.targetSet}
          initialPrefix={generator.semanticLayer?.prefix}
          initialMappings={generator.semanticLayer?.mappings}
          initialPatternId={generator.semanticLayer?.patternId ?? null}
          onSaveLayer={handleSaveSemanticLayer}
          onClose={() => setShowSemanticDialog(false)}
        />
      )}
    </>
  );
}
