import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TokenCollection, ViewPreset } from "@tokenmanager/core";
import { apiFetch } from "../shared/apiFetch";
import {
  buildSelectionLabel,
  createViewPreset,
  createViewPresetName,
  normalizeModeSelections,
} from "../shared/collectionModeUtils";

interface CollectionScenarioControlProps {
  collections: TokenCollection[];
  selectedModes: Record<string, string>;
  setSelectedModes: (selectedModes: Record<string, string>) => void;
  serverUrl: string;
  connected: boolean;
}

function selectionsEqual(
  left: Record<string, string>,
  right: Record<string, string>,
): boolean {
  const leftEntries = Object.entries(left).sort(([a], [b]) => a.localeCompare(b));
  const rightEntries = Object.entries(right).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(leftEntries) === JSON.stringify(rightEntries);
}

export function CollectionScenarioControl({
  collections,
  selectedModes,
  setSelectedModes,
  serverUrl,
  connected,
}: CollectionScenarioControlProps) {
  const [open, setOpen] = useState(false);
  const [views, setViews] = useState<ViewPreset[]>([]);
  const [viewsLoading, setViewsLoading] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [viewError, setViewError] = useState("");
  const [savingView, setSavingView] = useState(false);
  const [deletingViewId, setDeletingViewId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const refreshViews = useCallback(async () => {
    if (!connected) {
      setViews([]);
      setViewError("");
      return;
    }
    setViewsLoading(true);
    try {
      const result = await apiFetch<{ views?: ViewPreset[] }>(`${serverUrl}/api/collections`);
      setViews(result.views ?? []);
      setViewError("");
    } catch (error) {
      setViews([]);
      setViewError(
        error instanceof Error ? error.message : "Could not load saved views.",
      );
    } finally {
      setViewsLoading(false);
    }
  }, [connected, serverUrl]);

  useEffect(() => {
    void refreshViews();
  }, [refreshViews]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleMouseDown = (event: MouseEvent) => {
      if (containerRef.current?.contains(event.target as Node)) {
        return;
      }
      setOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const normalizedSelections = useMemo(
    () => normalizeModeSelections(collections, selectedModes),
    [collections, selectedModes],
  );
  const activeView = useMemo(
    () =>
      views.find((view) =>
        selectionsEqual(
          normalizeModeSelections(collections, view.selections),
          normalizedSelections,
        ),
      ) ?? null,
    [collections, normalizedSelections, views],
  );

  const currentLabel = activeView
    ? activeView.name
    : Object.keys(normalizedSelections).length > 0
      ? buildSelectionLabel(collections, normalizedSelections)
      : "Base values";

  const handleSaveView = async () => {
    if (!connected) {
      setViewError("Reconnect to save a view.");
      return;
    }
    const name = newViewName.trim() || createViewPresetName(collections, normalizedSelections);
    setSavingView(true);
    setViewError("");
    try {
      const nextView = createViewPreset({
        id: `${Date.now()}`,
        name,
        collections,
        selections: normalizedSelections,
      });
      await apiFetch(`${serverUrl}/api/views`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextView),
      });
      setNewViewName("");
      await refreshViews();
    } catch (error) {
      setViewError(error instanceof Error ? error.message : "Could not save view.");
    } finally {
      setSavingView(false);
    }
  };

  const handleApplyView = (view: ViewPreset) => {
    setSelectedModes(normalizeModeSelections(collections, view.selections));
  };

  const handleDeleteView = async (viewId: string) => {
    if (!connected) {
      setViewError("Reconnect to delete a view.");
      return;
    }
    setDeletingViewId(viewId);
    setViewError("");
    try {
      await apiFetch(`${serverUrl}/api/views/${encodeURIComponent(viewId)}`, {
        method: "DELETE",
      });
      await refreshViews();
    } catch (error) {
      setViewError(error instanceof Error ? error.message : "Could not delete view.");
    } finally {
      setDeletingViewId((current) => (current === viewId ? null : current));
    }
  };

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1 rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[10px] text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
      >
        <span className="text-[var(--color-figma-text-tertiary)]">View</span>
        <span className="max-w-[180px] truncate font-medium text-[var(--color-figma-text)]">
          {currentLabel}
        </span>
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
          <path
            d="M1 3l3 3 3-3"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-50 mt-1 w-[320px] rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] p-3 shadow-lg">
          <div className="pb-3">
            <h3 className="text-[11px] font-semibold text-[var(--color-figma-text)]">
              View
            </h3>
            <p className="mt-0.5 text-[10px] text-[var(--color-figma-text-secondary)]">
              Choose how token values are currently resolved.
            </p>
          </div>

          <div className="space-y-2 border-t border-[var(--color-figma-border)] py-3">
            <button
              type="button"
              onClick={() => setSelectedModes({})}
              className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-[11px] transition-colors ${
                Object.keys(normalizedSelections).length === 0
                  ? "bg-[var(--color-figma-bg-selected)] text-[var(--color-figma-text)]"
                  : "hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]"
              }`}
            >
              <span className="font-medium">Base values</span>
              <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">
                No mode overrides
              </span>
            </button>
            {collections.map((collection) => (
              <div key={collection.id} className="rounded-md border border-[var(--color-figma-border)] p-2.5">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-[11px] font-medium text-[var(--color-figma-text)]">
                      {collection.id}
                    </div>
                    <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
                      Edit scenario
                    </div>
                  </div>
                </div>
                <select
                  value={normalizedSelections[collection.id] ?? ""}
                  onChange={(event) => {
                    const nextSelections = { ...normalizedSelections };
                    if (event.target.value) {
                      nextSelections[collection.id] = event.target.value;
                    } else {
                      delete nextSelections[collection.id];
                    }
                    setSelectedModes(nextSelections);
                  }}
                  className="w-full rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-[11px] text-[var(--color-figma-text)] outline-none focus-visible:border-[var(--color-figma-accent)]"
                >
                  <option value="">Base value</option>
                  {collection.modes.map((mode) => (
                    <option key={mode.name} value={mode.name}>
                      {mode.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className="space-y-2 border-t border-[var(--color-figma-border)] pt-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-figma-text-tertiary)]">
                Saved views
              </h4>
              {viewsLoading ? (
                <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                  Loading...
                </span>
              ) : null}
            </div>
            <div className="flex gap-2">
                <input
                  type="text"
                  value={newViewName}
                  onChange={(event) => {
                    setNewViewName(event.target.value);
                    setViewError("");
                  }}
                  placeholder={createViewPresetName(collections, normalizedSelections)}
                  className="flex-1 rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-[11px] text-[var(--color-figma-text)] outline-none focus-visible:border-[var(--color-figma-accent)]"
                />
              <button
                type="button"
                onClick={() => void handleSaveView()}
                disabled={!connected || savingView || deletingViewId !== null}
                className="rounded-md bg-[var(--color-figma-accent)] px-2.5 py-1.5 text-[10px] font-medium text-white disabled:opacity-50"
              >
                {savingView ? "Saving..." : "Save"}
              </button>
            </div>
            {viewError ? (
              <p className="text-[10px] text-[var(--color-figma-error)]">{viewError}</p>
            ) : null}
            {views.length === 0 && !viewsLoading ? (
              <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
                No saved views yet.
              </p>
            ) : null}
            <div className="max-h-[220px] space-y-1 overflow-y-auto">
              {views.map((view) => {
                const isActive = activeView?.id === view.id;
                return (
                  <div
                    key={view.id}
                    className={`flex items-center justify-between gap-2 rounded-md px-2.5 py-2 ${
                      isActive ? "bg-[var(--color-figma-bg-selected)]" : "hover:bg-[var(--color-figma-bg-hover)]"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleApplyView(view)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="truncate text-[11px] font-medium text-[var(--color-figma-text)]">
                        {view.name}
                      </div>
                      <div className="truncate text-[10px] text-[var(--color-figma-text-secondary)]">
                        {buildSelectionLabel(collections, view.selections)}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteView(view.id)}
                      disabled={!connected || savingView || deletingViewId !== null}
                      className="rounded px-2 py-1 text-[10px] text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-secondary)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                    >
                      {deletingViewId === view.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
