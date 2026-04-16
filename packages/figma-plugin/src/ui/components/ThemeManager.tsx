import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ThemeDimension, ThemeViewPreset } from "@tokenmanager/core";
import type { CompareMode } from "./UnifiedComparePanel";
import type { TokenMapEntry } from "../../shared/types";
import { apiFetch } from "../shared/apiFetch";
import { Spinner } from "./Spinner";
import { ThemeCompareScreen } from "./theme-manager/ThemeCompareScreen";
import { useThemeSwitcherContext } from "../contexts/ThemeContext";
import { useThemeCompare } from "../hooks/useThemeCompare";
import {
  buildSelectionLabel,
  buildThemeModeCoverage,
  createThemeViewName,
  createThemeViewPreset,
  normalizeThemeSelections,
} from "../shared/themeModeUtils";

export interface ThemeManagerHandle {
  navigateToCompare: (
    mode: CompareMode,
    path?: string,
    tokenPaths?: Set<string>,
    optionA?: string,
    optionB?: string,
  ) => void;
}

interface ThemeManagerProps {
  serverUrl: string;
  connected: boolean;
  sets: string[];
  onDimensionsChange?: (dimensions: ThemeDimension[]) => void;
  onNavigateToToken?: (path: string, set: string) => void;
  onCreateToken?: (tokenPath: string, set: string) => void;
  allTokensFlat?: Record<string, TokenMapEntry>;
  pathToSet?: Record<string, string>;
  onTokensCreated?: () => void;
  onGoToTokens?: () => void;
  themeManagerHandle?: React.MutableRefObject<ThemeManagerHandle | null>;
}

type ManagerView = "collections" | "compare";

function CollectionSection({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--color-figma-border)] px-3 py-2">
        <div className="min-w-0">
          <div className="text-[11px] font-medium text-[var(--color-figma-text)]">
            {title}
          </div>
          {description ? (
            <p className="mt-0.5 text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="px-3 py-3">{children}</div>
    </section>
  );
}

export function ThemeManager({
  serverUrl,
  connected,
  sets,
  onDimensionsChange,
  onNavigateToToken,
  onCreateToken,
  allTokensFlat = {},
  pathToSet = {},
  onTokensCreated,
  onGoToTokens,
  themeManagerHandle,
}: ThemeManagerProps) {
  const {
    dimensions,
    setDimensions,
    activeThemes,
    setActiveThemes,
    themedAllTokensFlat,
  } = useThemeSwitcherContext();
  const compare = useThemeCompare();
  const [activeView, setActiveView] = useState<ManagerView>("collections");
  const [views, setViews] = useState<ThemeViewPreset[]>([]);
  const [viewsLoading, setViewsLoading] = useState(false);
  const [viewsError, setViewsError] = useState<string | null>(null);
  const [newViewName, setNewViewName] = useState("");
  const [modeDrafts, setModeDrafts] = useState<Record<string, string>>({});
  const [modeSaving, setModeSaving] = useState<Record<string, boolean>>({});
  const [modeErrors, setModeErrors] = useState<Record<string, string | null>>({});
  const viewsAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    onDimensionsChange?.(dimensions);
  }, [dimensions, onDimensionsChange]);

  const refreshCollectionsAndViews = useCallback(async () => {
    if (!connected) {
      setViews([]);
      setViewsError(null);
      setViewsLoading(false);
      return;
    }

    setViewsLoading(true);
    setViewsError(null);
    viewsAbortRef.current?.abort();
    const controller = new AbortController();
    viewsAbortRef.current = controller;

    try {
      const result = await apiFetch<{
        collections?: ThemeDimension[];
        previews?: ThemeViewPreset[];
      }>(`${serverUrl}/api/collections`, { signal: controller.signal });
      if (viewsAbortRef.current !== controller) return;
      const collections = result.collections ?? [];
      setDimensions(collections);
      setViews(result.previews ?? []);
    } catch (error) {
      if (viewsAbortRef.current !== controller) return;
      setViewsError(
        error instanceof Error ? error.message : "Failed to load collections",
      );
    } finally {
      if (viewsAbortRef.current === controller) {
        viewsAbortRef.current = null;
        setViewsLoading(false);
      }
    }
  }, [connected, serverUrl, setDimensions]);

  useEffect(() => {
    void refreshCollectionsAndViews();
  }, [refreshCollectionsAndViews]);

  useEffect(
    () => () => {
      viewsAbortRef.current?.abort();
    },
    [],
  );

  const normalizedSelections = useMemo(
    () => normalizeThemeSelections(dimensions, activeThemes),
    [dimensions, activeThemes],
  );

  useEffect(() => {
    if (
      JSON.stringify(normalizedSelections) !== JSON.stringify(activeThemes)
    ) {
      setActiveThemes(normalizedSelections);
    }
  }, [activeThemes, normalizedSelections, setActiveThemes]);

  const compareFocusLabel = useMemo(() => {
    const parts = buildSelectionLabel(dimensions, normalizedSelections);
    return parts.length > 0 ? parts : null;
  }, [dimensions, normalizedSelections]);

  const modeCoverage = useMemo(
    () =>
      buildThemeModeCoverage({
        dimensions,
        allTokensFlat,
        pathToSet,
      }),
    [allTokensFlat, dimensions, pathToSet],
  );

  const previewTokens = useMemo(
    () =>
      Object.entries(themedAllTokensFlat)
        .sort(([left], [right]) => left.localeCompare(right))
        .slice(0, 16),
    [themedAllTokensFlat],
  );

  const handleSaveMode = useCallback(
    async (setName: string) => {
      const name = modeDrafts[setName]?.trim();
      if (!name) return;
      setModeSaving((previous) => ({ ...previous, [setName]: true }));
      setModeErrors((previous) => ({ ...previous, [setName]: null }));
      try {
        await apiFetch(
          `${serverUrl}/api/collections/${encodeURIComponent(setName)}/modes`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
          },
        );
        setModeDrafts((previous) => ({ ...previous, [setName]: "" }));
        await refreshCollectionsAndViews();
      } catch (error) {
        setModeErrors((previous) => ({
          ...previous,
          [setName]:
            error instanceof Error ? error.message : "Failed to add mode",
        }));
      } finally {
        setModeSaving((previous) => ({ ...previous, [setName]: false }));
      }
    },
    [modeDrafts, refreshCollectionsAndViews, serverUrl],
  );

  const handleDeleteMode = useCallback(
    async (setName: string, modeName: string) => {
      await apiFetch(
        `${serverUrl}/api/collections/${encodeURIComponent(setName)}/modes/${encodeURIComponent(modeName)}`,
        { method: "DELETE" },
      );
      await refreshCollectionsAndViews();
    },
    [refreshCollectionsAndViews, serverUrl],
  );

  const handleSaveView = useCallback(async () => {
    const proposedName =
      newViewName.trim() || createThemeViewName(dimensions, normalizedSelections);
    const view = createThemeViewPreset({
      id: `${Date.now()}`,
      name: proposedName,
      dimensions,
      selections: normalizedSelections,
    });
    await apiFetch(`${serverUrl}/api/previews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(view),
    });
    setNewViewName("");
    await refreshCollectionsAndViews();
  }, [dimensions, newViewName, normalizedSelections, refreshCollectionsAndViews, serverUrl]);

  const handleApplyView = useCallback(
    (view: ThemeViewPreset) => {
      setActiveThemes(normalizeThemeSelections(dimensions, view.selections));
    },
    [dimensions, setActiveThemes],
  );

  const handleDeleteView = useCallback(
    async (viewId: string) => {
      await apiFetch(`${serverUrl}/api/previews/${encodeURIComponent(viewId)}`, {
        method: "DELETE",
      });
      await refreshCollectionsAndViews();
    },
    [refreshCollectionsAndViews, serverUrl],
  );

  const handleNavigateToCompare = useCallback(
    (
      mode: CompareMode,
      path?: string,
      tokenPaths?: Set<string>,
      optionA?: string,
      optionB?: string,
    ) => {
      compare.navigateToCompare(mode, path, tokenPaths, optionA, optionB);
      setActiveView("compare");
    },
    [compare],
  );

  useImperativeHandle(
    themeManagerHandle,
    () => ({
      navigateToCompare: handleNavigateToCompare,
    }),
    [handleNavigateToCompare],
  );

  if (activeView === "compare") {
    return (
      <div className="min-h-0 flex-1 overflow-hidden">
        <ThemeCompareScreen
          focusLabel={compareFocusLabel}
          mode={compare.compareMode}
          onModeChange={compare.setCompareMode}
          tokenPaths={compare.compareTokenPaths}
          onClearTokenPaths={() => compare.setCompareTokenPaths(new Set())}
          tokenPath={compare.compareTokenPath}
          onClearTokenPath={() => compare.setCompareTokenPath("")}
          allTokensFlat={allTokensFlat}
          pathToSet={pathToSet}
          dimensions={dimensions}
          sets={sets}
          themeOptionsKey={compare.compareThemeKey}
          themeOptionsDefaultA={compare.compareThemeDefaultA}
          themeOptionsDefaultB={compare.compareThemeDefaultB}
          onEditToken={(setName, tokenPath) => onNavigateToToken?.(tokenPath, setName)}
          onCreateToken={(tokenPath, setName) => onCreateToken?.(tokenPath, setName)}
          onGoToTokens={() => onGoToTokens?.()}
          serverUrl={serverUrl}
          onTokensCreated={() => onTokensCreated?.()}
          onBack={() => setActiveView("collections")}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--color-figma-bg)]">
      <div className="shrink-0 border-b border-[var(--color-figma-border)] px-3 py-2">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[12px] font-semibold text-[var(--color-figma-text)]">
            Collections
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveView("compare")}
              className="rounded border border-[var(--color-figma-border)] px-2.5 py-1 text-[10px] font-medium text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
            >
              Review
            </button>
            {onGoToTokens ? (
              <button
                type="button"
                onClick={() => onGoToTokens()}
                className="rounded px-2 py-1 text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
              >
                Edit tokens
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <div className="space-y-3">
          <CollectionSection
            title="Current Preview"
            description="Choose modes only where you want to review them. This is a preview lens over authored tokens, not a second authoring system."
          >
            <div className="space-y-2">
              {dimensions.map((dimension) => {
                const selected = normalizedSelections[dimension.id] ?? "";
                return (
                  <div
                    key={dimension.id}
                    className="flex items-center justify-between gap-3 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2.5 py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[11px] font-medium text-[var(--color-figma-text)]">
                        {dimension.name}
                      </div>
                      <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
                        {dimension.options.length} mode
                        {dimension.options.length === 1 ? "" : "s"}
                      </div>
                    </div>
                    <select
                      value={selected}
                      onChange={(event) => {
                        const nextSelections = { ...normalizedSelections };
                        if (event.target.value) {
                          nextSelections[dimension.id] = event.target.value;
                        } else {
                          delete nextSelections[dimension.id];
                        }
                        setActiveThemes(nextSelections);
                      }}
                      className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[10px] text-[var(--color-figma-text)]"
                    >
                      <option value="">No preview</option>
                      {dimension.options.map((option) => (
                        <option key={option.name} value={option.name}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
              {dimensions.length === 0 ? (
                <div className="rounded border border-dashed border-[var(--color-figma-border)] px-3 py-3 text-[10px] text-[var(--color-figma-text-secondary)]">
                  No collections are available yet.
                </div>
              ) : null}
            </div>
          </CollectionSection>

          <CollectionSection
            title="Collection Modes"
            description="Each collection owns its own modes, just like Figma. Tokens vary only through the modes of their own collection."
          >
            <div className="space-y-3">
              {dimensions.map((dimension) => {
                const coverageByMode = modeCoverage.coverage[dimension.id] ?? {};
                return (
                  <section
                    key={dimension.id}
                    className="rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]"
                  >
                    <div className="border-b border-[var(--color-figma-border)] px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-[11px] font-medium text-[var(--color-figma-text)]">
                            {dimension.name}
                          </div>
                          <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
                            {dimension.options.length} mode
                            {dimension.options.length === 1 ? "" : "s"}
                          </div>
                        </div>
                        {onGoToTokens ? (
                          <button
                            type="button"
                            onClick={() => onGoToTokens()}
                            className="rounded px-2 py-1 text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                          >
                            Open tokens
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <div className="space-y-2 px-3 py-3">
                      {dimension.options.map((option) => {
                        const missing = coverageByMode[option.name]?.missing ?? [];
                        return (
                          <div
                            key={option.name}
                            className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2.5 py-2"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-[11px] font-medium text-[var(--color-figma-text)]">
                                {option.name}
                              </div>
                              <div className="flex items-center gap-2">
                                {missing.length > 0 ? (
                                  <span className="text-[10px] text-[var(--color-figma-warning)]">
                                    {missing.length} gaps
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                                    Complete
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteMode(dimension.id, option.name)}
                                  className="rounded px-2 py-1 text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                            {missing.length > 0 ? (
                              <div className="mt-2 space-y-1 border-t border-[var(--color-figma-border)] pt-2">
                                {missing.slice(0, 4).map((entry) => (
                                  <button
                                    key={`${entry.setName}:${entry.path}`}
                                    type="button"
                                    onClick={() =>
                                      onNavigateToToken?.(entry.path, entry.setName || dimension.id)
                                    }
                                    className="block w-full truncate text-left text-[10px] text-[var(--color-figma-accent)] hover:underline"
                                    title={`${entry.setName || dimension.id} · ${entry.path}`}
                                  >
                                    {entry.path}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}

                      <div className="rounded border border-dashed border-[var(--color-figma-border)] px-2.5 py-2">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={modeDrafts[dimension.id] ?? ""}
                            onChange={(event) =>
                              setModeDrafts((previous) => ({
                                ...previous,
                                [dimension.id]: event.target.value,
                              }))
                            }
                            placeholder="Add mode"
                            className="flex-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[11px] text-[var(--color-figma-text)]"
                          />
                          <button
                            type="button"
                            onClick={() => void handleSaveMode(dimension.id)}
                            disabled={
                              !modeDrafts[dimension.id]?.trim() ||
                              modeSaving[dimension.id]
                            }
                            className="rounded bg-[var(--color-figma-accent)] px-3 py-1 text-[10px] font-medium text-white disabled:opacity-40"
                          >
                            {modeSaving[dimension.id] ? "Adding..." : "Add"}
                          </button>
                        </div>
                        {modeErrors[dimension.id] ? (
                          <div className="mt-1 text-[10px] text-[var(--color-figma-error)]">
                            {modeErrors[dimension.id]}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </section>
                );
              })}
            </div>
          </CollectionSection>

          <CollectionSection
            title={`Preview Presets${views.length > 0 ? ` (${views.length})` : ""}`}
            description="Save only the collection modes you explicitly selected for review and handoff."
            action={viewsLoading ? <Spinner size="sm" /> : null}
          >
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newViewName}
                  onChange={(event) => setNewViewName(event.target.value)}
                  placeholder={createThemeViewName(dimensions, normalizedSelections)}
                  className="flex-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-[11px] text-[var(--color-figma-text)]"
                />
                <button
                  type="button"
                  onClick={() => void handleSaveView()}
                  className="rounded bg-[var(--color-figma-accent)] px-3 py-1.5 text-[11px] font-medium text-white"
                >
                  Save
                </button>
              </div>
              {viewsError ? (
                <div className="text-[10px] text-[var(--color-figma-error)]">
                  {viewsError}
                </div>
              ) : null}
              {views.length === 0 && !viewsLoading ? (
                <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
                  No saved previews yet.
                </div>
              ) : null}
              {views.map((view) => (
                <div
                  key={view.id}
                  className="flex items-center justify-between gap-2 rounded border border-[var(--color-figma-border)] px-2.5 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[11px] font-medium text-[var(--color-figma-text)]">
                      {view.name}
                    </div>
                    <div className="truncate text-[10px] text-[var(--color-figma-text-secondary)]">
                      {buildSelectionLabel(dimensions, view.selections)}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => handleApplyView(view)}
                      className="rounded px-2 py-1 text-[10px] font-medium text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/10"
                    >
                      Apply
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteView(view.id)}
                      className="rounded px-2 py-1 text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </CollectionSection>

          <CollectionSection
            title={`Resolved Preview${previewTokens.length > 0 ? ` (${previewTokens.length})` : ""}`}
            description="Sample of the currently resolved token values for the active preview."
          >
            <div className="max-h-[220px] space-y-1 overflow-auto">
              {previewTokens.map(([tokenPath, entry]) => (
                <div
                  key={tokenPath}
                  className="flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-[var(--color-figma-bg-hover)]"
                >
                  <button
                    type="button"
                    onClick={() =>
                      onNavigateToToken?.(tokenPath, pathToSet[tokenPath] ?? sets[0] ?? "")
                    }
                    className="min-w-0 flex-1 truncate text-left text-[10px] text-[var(--color-figma-text)]"
                    title={tokenPath}
                  >
                    {tokenPath}
                  </button>
                  <div className="max-w-[45%] truncate text-[10px] text-[var(--color-figma-text-secondary)]">
                    {typeof entry.$value === "object"
                      ? JSON.stringify(entry.$value)
                      : String(entry.$value)}
                  </div>
                </div>
              ))}
              {previewTokens.length === 0 ? (
                <div className="px-2 py-1 text-[10px] text-[var(--color-figma-text-secondary)]">
                  No preview values yet.
                </div>
              ) : null}
            </div>
          </CollectionSection>
        </div>
      </div>
    </div>
  );
}
