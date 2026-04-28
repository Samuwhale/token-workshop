import { useState, useCallback, useEffect } from "react";
import { apiFetch } from "../shared/apiFetch";
import { dispatchToast } from "../shared/toastBus";
import type { HistoryPanelProps, HistoryView } from "./history/types";
import { defaultSnapshotLabel } from "./history/types";
import { FeedbackPlaceholder } from "./FeedbackPlaceholder";
import { HistoryRecentView } from "./history/HistoryRecentView";
import { HistorySavedView } from "./history/HistorySavedView";
import { GitRepositoryPanel } from "./publish/GitRepositoryPanel";

const HISTORY_VIEWS: Array<{ id: HistoryView; label: string }> = [
  { id: "recent", label: "Recent" },
  { id: "saved", label: "Checkpoints" },
];

export function HistoryPanel({
  serverUrl,
  connected,
  workingCollectionId,
  scope,
  onScopeChange,
  collectionIds = [],
  onPushUndo,
  onRefreshTokens,
  recentOperations,
  totalOperations,
  hasMoreOperations,
  onLoadMoreOperations,
  onRollback,
  undoDescriptions,
  redoableOpIds,
  onServerRedo,
  executeUndo,
}: HistoryPanelProps) {
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [saveLabel, setSaveLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const validWorkingCollectionId = collectionIds.includes(workingCollectionId)
    ? workingCollectionId
    : collectionIds[0] ?? null;
  const activeCollectionFilter =
    scope.mode === "current"
      ? scope.collectionId && collectionIds.includes(scope.collectionId)
        ? scope.collectionId
        : validWorkingCollectionId
      : null;
  const activePanelLabelId =
    scope.view === "git" ? "history-heading-git" : `history-tab-${scope.view}`;

  useEffect(() => {
    if (scope.mode !== "current") {
      return;
    }
    if (activeCollectionFilter === scope.collectionId) {
      return;
    }
    onScopeChange({
      ...scope,
      collectionId: activeCollectionFilter || null,
    });
  }, [activeCollectionFilter, onScopeChange, scope]);

  const handleClearFilters = useCallback(() => {
    onScopeChange({
      ...scope,
      mode: "all",
      collectionId: null,
      tokenPath: null,
    });
  }, [onScopeChange, scope]);
  const handleViewChange = useCallback(
    (view: HistoryView) => {
      onScopeChange({ ...scope, view });
    },
    [onScopeChange, scope],
  );

  const handleSaveSnapshot = useCallback(async () => {
    const label = saveLabel.trim() || `Snapshot ${new Date().toLocaleString()}`;
    const destination = {
      kind: "workspace" as const,
      topTab: "library" as const,
      subTab: "history" as const,
    };
    setSaving(true);
    try {
      await apiFetch(`${serverUrl}/api/snapshots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      setSaveLabel("");
      setShowSaveInput(false);
      dispatchToast(`Checkpoint "${label}" saved`, "success", { destination });
    } catch (err) {
      dispatchToast((err as Error).message || "Failed to save checkpoint", "error", { destination });
    } finally {
      setSaving(false);
    }
  }, [saveLabel, serverUrl]);

  if (!connected && scope.view !== "git") {
    return (
      <FeedbackPlaceholder
        variant="disconnected"
        title="Not connected"
        description="Connect to the token server to view history."
      />
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        {scope.view === "git" ? (
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => handleViewChange("saved")}
              className="rounded px-2.5 py-1 text-secondary font-medium text-[var(--color-figma-accent)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
            >
              Back to checkpoints
            </button>
            <span
              id="history-heading-git"
              className="text-secondary text-[var(--color-figma-text-secondary)]"
            >
              Repository history
            </span>
          </div>
        ) : (
          <div
            role="tablist"
            aria-label="History views"
            className="inline-flex min-w-0 max-w-full flex-wrap items-center rounded bg-[var(--color-figma-bg-secondary)] p-0.5"
            onKeyDown={(event) => {
              const currentIndex = HISTORY_VIEWS.findIndex((view) => view.id === scope.view);
              if (event.key === "ArrowRight") {
                event.preventDefault();
                const next = HISTORY_VIEWS[(currentIndex + 1) % HISTORY_VIEWS.length];
                handleViewChange(next.id);
                document.getElementById(`history-tab-${next.id}`)?.focus();
              } else if (event.key === "ArrowLeft") {
                event.preventDefault();
                const next =
                  HISTORY_VIEWS[
                    (currentIndex - 1 + HISTORY_VIEWS.length) % HISTORY_VIEWS.length
                  ];
                handleViewChange(next.id);
                document.getElementById(`history-tab-${next.id}`)?.focus();
              }
            }}
          >
            {HISTORY_VIEWS.map((view) => (
              <button
                key={view.id}
                role="tab"
                id={`history-tab-${view.id}`}
                aria-selected={scope.view === view.id}
                aria-controls={`history-tabpanel-${view.id}`}
                tabIndex={scope.view === view.id ? 0 : -1}
                onClick={() => handleViewChange(view.id)}
                className={`rounded px-2.5 py-1 text-secondary font-medium transition-colors ${
                  scope.view === view.id
                    ? "bg-[var(--color-figma-bg-selected)] text-[var(--color-figma-text)]"
                    : "text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
                }`}
              >
                {view.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          {scope.view !== "git" && !showSaveInput ? (
            <button
              type="button"
              onClick={() => {
                const lastOp = recentOperations?.[0];
                setSaveLabel(defaultSnapshotLabel(lastOp?.description));
                setShowSaveInput(true);
              }}
              className="rounded text-secondary font-medium text-[var(--color-figma-accent)] hover:underline"
            >
              Save checkpoint
            </button>
          ) : null}
          {scope.view !== "git" ? (
            <button
              type="button"
              onClick={() => handleViewChange("git")}
              className="rounded px-2.5 py-1 text-secondary text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
            >
              Repository history
            </button>
          ) : null}
        </div>
      </div>

      {showSaveInput ? (
        <div className="shrink-0 flex flex-wrap items-center gap-1.5 px-3 pb-2">
          <input
            className="min-w-0 flex-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-secondary text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-tertiary)] focus:border-[var(--color-figma-accent)]"
            placeholder="Checkpoint label"
            value={saveLabel}
            onChange={(event) => setSaveLabel(event.target.value)}
            aria-label="Checkpoint label"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void handleSaveSnapshot();
              }
              if (event.key === "Escape") {
                setShowSaveInput(false);
                setSaveLabel("");
              }
            }}
            autoFocus
          />
          <button
            onClick={() => void handleSaveSnapshot()}
            disabled={saving}
            className="shrink-0 rounded bg-[var(--color-figma-accent)] px-2 py-1 text-secondary font-medium text-white transition-colors hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={() => {
              setShowSaveInput(false);
              setSaveLabel("");
            }}
            className="shrink-0 rounded px-2 py-1 text-secondary text-[var(--color-figma-text-tertiary)] transition-colors hover:text-[var(--color-figma-text)]"
          >
            Cancel
          </button>
        </div>
      ) : null}

      <div
        role="tabpanel"
        id={`history-tabpanel-${scope.view}`}
        aria-labelledby={activePanelLabelId}
        tabIndex={0}
        className="min-h-0 flex-1 overflow-hidden"
      >
        {scope.view === "recent" ? (
          <HistoryRecentView
            serverUrl={serverUrl}
            collectionFilter={activeCollectionFilter || null}
            filterTokenPath={scope.tokenPath}
            onClearFilter={handleClearFilters}
            recentOperations={recentOperations}
            totalOperations={totalOperations}
            hasMoreOperations={hasMoreOperations}
            onLoadMoreOperations={onLoadMoreOperations}
            onRollback={onRollback}
            undoDescriptions={undoDescriptions}
            redoableOpIds={redoableOpIds}
            onServerRedo={onServerRedo}
            executeUndo={executeUndo}
          />
        ) : scope.view === "saved" ? (
          <HistorySavedView
            serverUrl={serverUrl}
            connected={connected}
            onPushUndo={onPushUndo}
            onRefreshTokens={onRefreshTokens}
            collectionFilter={activeCollectionFilter ?? undefined}
            filterTokenPath={scope.tokenPath ?? undefined}
          />
        ) : (
          <GitRepositoryPanel
            serverUrl={serverUrl}
            connected={connected}
            onPushUndo={onPushUndo}
            onRefreshTokens={onRefreshTokens}
            embedded
          />
        )}
      </div>
    </div>
  );
}
