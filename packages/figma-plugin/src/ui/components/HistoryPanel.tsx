import { useState, useCallback, useEffect } from "react";
import { apiFetch } from "../shared/apiFetch";
import { dispatchToast } from "../shared/toastBus";
import type { HistoryPanelProps, HistoryView } from "./history/types";
import { defaultSnapshotLabel } from "./history/types";
import { FeedbackPlaceholder } from "./FeedbackPlaceholder";
import { HistoryRecentView } from "./history/HistoryRecentView";
import { HistorySavedView } from "./history/HistorySavedView";
import { Button, TextInput } from "../primitives";

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
  const [savedViewRefreshKey, setSavedViewRefreshKey] = useState(0);
  const validWorkingCollectionId = collectionIds.includes(workingCollectionId)
    ? workingCollectionId
    : collectionIds[0] ?? null;
  const activeCollectionFilter =
    scope.mode === "current"
      ? scope.collectionId && collectionIds.includes(scope.collectionId)
        ? scope.collectionId
        : validWorkingCollectionId
      : null;
  const activePanelLabelId = `history-tab-${scope.view}`;
  const scopeLabel =
    scope.view === "saved"
      ? activeCollectionFilter || scope.tokenPath
        ? "Checkpoints are workspace-wide; filter applies to compare"
        : "Workspace-wide checkpoints"
      : scope.mode === "all"
        ? "All collections"
        : activeCollectionFilter ?? "Current collection";
  const tokenScopeLabel = scope.tokenPath
    ? scope.tokenPath
    : null;

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
    const label = saveLabel.trim() || `Checkpoint ${new Date().toLocaleString()}`;
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
      setSavedViewRefreshKey((key) => key + 1);
      dispatchToast(`Checkpoint "${label}" saved`, "success", { destination });
    } catch (err) {
      dispatchToast((err as Error).message || "Failed to save checkpoint", "error", { destination });
    } finally {
      setSaving(false);
    }
  }, [saveLabel, serverUrl]);

  if (!connected) {
    return (
      <FeedbackPlaceholder
        variant="disconnected"
        title="Not connected"
        description="Connect to the token server to view history."
        align="start"
      />
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 px-3 py-1.5">
        <div className="tm-responsive-toolbar">
          <div className="tm-responsive-toolbar__row">
            <div
              role="tablist"
              aria-label="History views"
              className="tm-responsive-toolbar__leading inline-flex min-w-0 max-w-full flex-wrap items-center rounded bg-[var(--color-figma-bg-secondary)] p-0.5"
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
                      ? "bg-[var(--color-figma-bg-selected)] text-[color:var(--color-figma-text)]"
                      : "text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)]"
                  }`}
                >
                  {view.label}
                </button>
              ))}
            </div>

            <div className="tm-responsive-toolbar__actions">
              {!showSaveInput ? (
                <Button
                  onClick={() => {
                    const lastOp = recentOperations?.[0];
                    setSaveLabel(defaultSnapshotLabel(lastOp?.description));
                    setShowSaveInput(true);
                  }}
                  variant="ghost"
                  size="sm"
                  className="px-1.5 text-[color:var(--color-figma-text-secondary)] hover:text-[color:var(--color-figma-text)]"
                  title="Save a workspace-wide checkpoint"
                >
                  Save checkpoint
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {showSaveInput ? (
        <div className="tm-panel-inline-form shrink-0 px-3 pb-2">
          <TextInput
            className="tm-panel-inline-form__field"
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
          <div className="tm-panel-inline-form__actions">
            <Button
              onClick={() => void handleSaveSnapshot()}
              disabled={saving}
              variant="primary"
              size="md"
            >
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button
              onClick={() => {
                setShowSaveInput(false);
                setSaveLabel("");
              }}
              variant="ghost"
              size="md"
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <div className="shrink-0 px-3 pb-1.5">
        <p className="truncate text-secondary text-[color:var(--color-figma-text-tertiary)]">
          {scopeLabel}
          {tokenScopeLabel ? ` · ${tokenScopeLabel}` : ""}
        </p>
      </div>

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
        ) : (
          <HistorySavedView
            serverUrl={serverUrl}
            connected={connected}
            onPushUndo={onPushUndo}
            onRefreshTokens={onRefreshTokens}
            collectionFilter={activeCollectionFilter ?? undefined}
            filterTokenPath={scope.tokenPath ?? undefined}
            refreshKey={savedViewRefreshKey}
          />
        )}
      </div>
    </div>
  );
}
