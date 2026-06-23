import { useState, useCallback, useEffect } from "react";
import { apiFetch } from "../shared/apiFetch";
import { dispatchToast } from "../shared/toastBus";
import type { HistoryPanelProps, HistoryView } from "./history/types";
import { defaultSnapshotLabel } from "./history/types";
import { FeedbackPlaceholder } from "./FeedbackPlaceholder";
import { HistoryRecentView } from "./history/HistoryRecentView";
import { HistorySavedView } from "./history/HistorySavedView";
import { Button, SegmentedControl, TextInput } from "../primitives";

const HISTORY_VIEW_OPTIONS: Array<{ value: HistoryView; label: string }> = [
  { value: "recent", label: "Recent" },
  { value: "saved", label: "Checkpoints" },
];

const HISTORY_SCOPE_OPTIONS = [
  { value: "current", label: "Current" },
  { value: "all", label: "All" },
] as const;

export function HistoryPanel({
  serverUrl,
  connected,
  workingCollectionId,
  collectionDisplayNames,
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
  const tokenScopeLabel = scope.tokenPath
    ? scope.tokenPath
    : null;
  const showAllHistoryAction =
    scope.mode === "current" || tokenScopeLabel !== null;

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
  const handleScopeModeChange = useCallback(
    (mode: "current" | "all") => {
      onScopeChange({
        ...scope,
        mode,
        collectionId:
          mode === "current" ? activeCollectionFilter || null : null,
      });
    },
    [activeCollectionFilter, onScopeChange, scope],
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
        align="start"
      />
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 px-3 py-1.5">
        <div className="tm-responsive-toolbar">
          <div className="tm-responsive-toolbar__row">
            <div className="tm-responsive-toolbar__leading tm-history-view-switcher">
              <SegmentedControl
                value={scope.view}
                options={HISTORY_VIEW_OPTIONS}
                onChange={handleViewChange}
                ariaLabel="Activity view"
                size="compact"
              />
            </div>

            {scope.view === "recent" && collectionIds.length > 1 ? (
              <div className="tm-history-scope-switcher">
                <SegmentedControl
                  value={scope.mode}
                  options={[...HISTORY_SCOPE_OPTIONS]}
                  onChange={handleScopeModeChange}
                  ariaLabel="Activity scope"
                  size="compact"
                />
              </div>
            ) : null}

            <div className="tm-responsive-toolbar__actions">
              {showAllHistoryAction ? (
                <Button
                  onClick={handleClearFilters}
                  variant="ghost"
                  size="sm"
                  className="px-1.5 text-[color:var(--color-figma-text-secondary)] hover:text-[color:var(--color-figma-text)]"
                  title="Show all activity"
                >
                  Clear filter
                </Button>
              ) : null}

              {showSaveInput ? (
                <div className="tm-panel-inline-form">
                  <TextInput
                    className="tm-panel-inline-form__field"
                    placeholder="Checkpoint name"
                    value={saveLabel}
                    onChange={(event) => setSaveLabel(event.target.value)}
                    aria-label="Checkpoint name"
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
                      size="sm"
                    >
                      {saving ? "Saving…" : "Save"}
                    </Button>
                    <Button
                      onClick={() => {
                        setShowSaveInput(false);
                        setSaveLabel("");
                      }}
                      variant="ghost"
                      size="sm"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
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
              )}
            </div>
          </div>
        </div>
      </div>

      <div
        role="region"
        id="history-tabpanel-recent"
        aria-label="Recent activity"
        hidden={scope.view !== "recent"}
        tabIndex={scope.view === "recent" ? 0 : -1}
        className={`${scope.view === "recent" ? "flex" : "hidden"} min-h-0 flex-1 overflow-hidden`}
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
        ) : null}
      </div>

      <div
        role="region"
        id="history-tabpanel-saved"
        aria-label="Checkpoints"
        hidden={scope.view !== "saved"}
        tabIndex={scope.view === "saved" ? 0 : -1}
        className={`${scope.view === "saved" ? "flex" : "hidden"} min-h-0 flex-1 overflow-hidden`}
      >
        {scope.view === "saved" ? (
          <HistorySavedView
            serverUrl={serverUrl}
            connected={connected}
            onPushUndo={onPushUndo}
            onRefreshTokens={onRefreshTokens}
            collectionFilter={activeCollectionFilter ?? undefined}
            filterTokenPath={scope.tokenPath ?? undefined}
            collectionDisplayNames={collectionDisplayNames}
            refreshKey={savedViewRefreshKey}
          />
        ) : null}
      </div>
    </div>
  );
}
