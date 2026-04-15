import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import type { ThemeDimension, ThemeViewPreset } from "@tokenmanager/core";
import type { UndoSlot } from "../hooks/useUndo";
import type { ResolverContentProps } from "./resolverTypes";
import type { CompareMode } from "./UnifiedComparePanel";
import type { TokenMapEntry } from "../../shared/types";
import { useThemeDimensions } from "../hooks/useThemeDimensions";
import { useThemeCompare } from "../hooks/useThemeCompare";
import { Spinner } from "./Spinner";
import { apiFetch } from "../shared/apiFetch";
import { useThemeSwitcherContext } from "../contexts/ThemeContext";
import { ThemeCompareScreen } from "./theme-manager/ThemeCompareScreen";
import { ThemeResolverScreen } from "./theme-manager/ThemeResolverScreen";
import {
  buildSelectionLabel,
  buildThemeModeCoverage,
  createThemeViewName,
  createThemeViewPreset,
  normalizeThemeSelections,
} from "../shared/themeModeUtils";
import type {
  ThemeAuthoringStage,
  ThemeAuthoringMode,
  ThemeManagerView,
  ThemeWorkspaceShellState,
} from "../shared/themeWorkflow";

export interface ThemeManagerHandle {
  navigateToCompare: (
    mode: CompareMode,
    path?: string,
    tokenPaths?: Set<string>,
    optionA?: string,
    optionB?: string,
  ) => void;
  focusStage: (stage: ThemeAuthoringStage) => void;
  openCreateAxis: () => void;
  returnToAuthoring: () => void;
  switchToOutputView: () => void;
}

interface ThemeManagerProps {
  serverUrl: string;
  connected: boolean;
  sets: string[];
  onDimensionsChange?: (dimensions: ThemeDimension[]) => void;
  onNavigateToToken?: (path: string, set: string) => void;
  onCreateToken?: (tokenPath: string, set: string) => void;
  onPushUndo?: (slot: UndoSlot) => void;
  resolverState?: ResolverContentProps;
  allTokensFlat?: Record<string, TokenMapEntry>;
  pathToSet?: Record<string, string>;
  onTokensCreated?: () => void;
  onGoToTokens?: () => void;
  themeManagerHandle?: React.MutableRefObject<ThemeManagerHandle | null>;
  onSuccess?: (msg: string) => void;
  onShellStateChange?: (state: ThemeWorkspaceShellState) => void;
}

function CreateAxisForm({
  value,
  error,
  saving,
  onChange,
  onSubmit,
  onCancel,
}: {
  value: string;
  error: string | null;
  saving: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] p-3">
      <div className="text-[11px] font-medium text-[var(--color-figma-text)]">
        New mode axis
      </div>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Color mode, Brand, Density"
        className="mt-2 w-full rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-[11px] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)]"
      />
      {error ? (
        <div className="mt-1 text-[10px] text-[var(--color-figma-error)]">
          {error}
        </div>
      ) : null}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={onSubmit}
          disabled={!value.trim() || saving}
          className="rounded bg-[var(--color-figma-accent)] px-3 py-1.5 text-[11px] font-medium text-white disabled:opacity-40"
        >
          {saving ? "Creating..." : "Create axis"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded px-3 py-1.5 text-[11px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function ThemeManager({
  serverUrl,
  connected,
  sets,
  onDimensionsChange,
  onNavigateToToken,
  onCreateToken,
  onPushUndo,
  resolverState,
  allTokensFlat = {},
  pathToSet = {},
  onTokensCreated,
  onGoToTokens,
  themeManagerHandle,
  onSuccess,
  onShellStateChange,
}: ThemeManagerProps) {
  const {
    activeThemes,
    setActiveThemes,
    themedAllTokensFlat,
    setDimensions: setThemeContextDimensions,
  } = useThemeSwitcherContext();
  const [activeView, setActiveView] = useState<ThemeManagerView>("authoring");
  const [authoringMode, setAuthoringMode] = useState<ThemeAuthoringMode>("authoring");
  const [axisDrafts, setAxisDrafts] = useState<Record<string, string>>({});
  const [axisSaving, setAxisSaving] = useState<Record<string, boolean>>({});
  const [axisErrors, setAxisErrors] = useState<Record<string, string | null>>({});
  const [views, setViews] = useState<ThemeViewPreset[]>([]);
  const [viewsLoading, setViewsLoading] = useState(true);
  const [viewsError, setViewsError] = useState<string | null>(null);
  const [newViewName, setNewViewName] = useState("");

  const compare = useThemeCompare();

  const {
    dimensions,
    loading,
    fetchDimensions,
    createDimError,
    isCreatingDim,
    closeCreateDim,
    executeDeleteDimension,
    executeRenameDim,
    handleCreateDimension,
    handleDuplicateDimension,
    newDimName,
    openCreateDim,
    renameDim,
    renameError,
    renameValue,
    setNewDimName,
    setRenameValue,
    showCreateDim,
    startRenameDim,
    cancelRenameDim,
    openDeleteConfirm,
    dimensionDeleteConfirm,
    closeDeleteConfirm,
  } = useThemeDimensions({
    serverUrl,
    connected,
    setError: () => undefined,
    onPushUndo,
    onSuccess,
  });

  useEffect(() => {
    onShellStateChange?.({ activeView, authoringMode });
  }, [activeView, authoringMode, onShellStateChange]);

  useEffect(() => {
    onDimensionsChange?.(dimensions);
    setThemeContextDimensions(dimensions);
  }, [dimensions, onDimensionsChange, setThemeContextDimensions]);

  const refreshViews = useCallback(async () => {
    if (!connected) {
      setViews([]);
      setViewsLoading(false);
      return;
    }
    setViewsLoading(true);
    setViewsError(null);
    try {
      const result = await apiFetch<{ views?: ThemeViewPreset[] }>(
        `${serverUrl}/api/themes`,
      );
      setViews(result.views ?? []);
    } catch (error) {
      setViewsError(error instanceof Error ? error.message : "Failed to load views");
    } finally {
      setViewsLoading(false);
    }
  }, [connected, serverUrl]);

  useEffect(() => {
    void refreshViews();
  }, [refreshViews]);

  const normalizedSelections = useMemo(
    () => normalizeThemeSelections(dimensions, activeThemes),
    [dimensions, activeThemes],
  );

  useEffect(() => {
    if (JSON.stringify(normalizedSelections) !== JSON.stringify(activeThemes)) {
      setActiveThemes(normalizedSelections);
    }
  }, [activeThemes, normalizedSelections, setActiveThemes]);

  const selectionLabel = useMemo(
    () => buildSelectionLabel(dimensions, normalizedSelections),
    [dimensions, normalizedSelections],
  );

  const themeModeCoverage = useMemo(
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
        .slice(0, 200),
    [themedAllTokensFlat],
  );

  const handleSaveOption = useCallback(
    async (dimensionId: string) => {
      const name = axisDrafts[dimensionId]?.trim();
      if (!name) return;
      setAxisSaving((previous) => ({ ...previous, [dimensionId]: true }));
      setAxisErrors((previous) => ({ ...previous, [dimensionId]: null }));
      try {
        await apiFetch(`${serverUrl}/api/themes/dimensions/${encodeURIComponent(dimensionId)}/options`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        setAxisDrafts((previous) => ({ ...previous, [dimensionId]: "" }));
        await fetchDimensions();
      } catch (error) {
        setAxisErrors((previous) => ({
          ...previous,
          [dimensionId]:
            error instanceof Error ? error.message : "Failed to add option",
        }));
      } finally {
        setAxisSaving((previous) => ({ ...previous, [dimensionId]: false }));
      }
    },
    [axisDrafts, fetchDimensions, serverUrl],
  );

  const saveView = useCallback(async () => {
    const proposedName = newViewName.trim() || createThemeViewName(dimensions, normalizedSelections);
    const view = createThemeViewPreset({
      id: `${Date.now()}`,
      name: proposedName,
      dimensions,
      selections: normalizedSelections,
    });
    await apiFetch(`${serverUrl}/api/themes/views`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(view),
    });
    setNewViewName("");
    await refreshViews();
  }, [dimensions, newViewName, normalizedSelections, refreshViews, serverUrl]);

  const applyView = useCallback(
    (view: ThemeViewPreset) => {
      setActiveThemes(normalizeThemeSelections(dimensions, view.selections));
    },
    [dimensions, setActiveThemes],
  );

  const deleteView = useCallback(
    async (viewId: string) => {
      await apiFetch(`${serverUrl}/api/themes/views/${encodeURIComponent(viewId)}`, {
        method: "DELETE",
      });
      await refreshViews();
    },
    [refreshViews, serverUrl],
  );

  const focusStage = useCallback((stage: ThemeAuthoringStage) => {
    setActiveView("authoring");
    setAuthoringMode(stage === "preview" ? "preview" : "authoring");
    if (stage === "axes" && !showCreateDim) {
      openCreateDim();
    }
  }, [openCreateDim, showCreateDim]);

  const handleNavigateToCompare = useCallback((
    mode: CompareMode,
    path?: string,
    tokenPaths?: Set<string>,
    optionA?: string,
    optionB?: string,
  ) => {
    compare.navigateToCompare(mode, path, tokenPaths, optionA, optionB);
    setActiveView("compare");
  }, [compare]);

  useImperativeHandle(themeManagerHandle, () => ({
    navigateToCompare: handleNavigateToCompare,
    focusStage,
    openCreateAxis: () => openCreateDim(),
    returnToAuthoring: () => {
      setActiveView("authoring");
      setAuthoringMode("authoring");
    },
    switchToOutputView: () => setActiveView("output"),
  }), [focusStage, handleNavigateToCompare, openCreateDim]);

  useEffect(() => {
    if (!resolverState) return;

    const nextInput = { ...resolverState.resolverInput };
    let changed = false;

    for (const dimension of dimensions) {
      if (!(dimension.id in resolverState.activeModifiers)) continue;
      const selectedOption = normalizedSelections[dimension.id];
      if (!selectedOption || nextInput[dimension.id] === selectedOption) {
        continue;
      }
      nextInput[dimension.id] = selectedOption;
      changed = true;
    }

    if (changed) {
      resolverState.setResolverInput(nextInput);
    }
  }, [
    dimensions,
    normalizedSelections,
    resolverState,
  ]);

  if (loading && dimensions.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--color-figma-bg)]">
      <div className="shrink-0 border-b border-[var(--color-figma-border)] px-3 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[12px] font-semibold text-[var(--color-figma-text)]">
              Themes
            </div>
            <p className="mt-0.5 text-[10px] text-[var(--color-figma-text-secondary)]">
              Author mode axes, save preview views, and review token output generated from inline mode values.
            </p>
            {themeModeCoverage.summary.optionsWithCoverageIssuesCount > 0 ? (
              <p className="mt-0.5 text-[10px] text-[var(--color-figma-warning)]">
                {themeModeCoverage.summary.optionsWithCoverageIssuesCount} missing mode value
                {themeModeCoverage.summary.optionsWithCoverageIssuesCount === 1 ? "" : "s"}
              </p>
            ) : null}
          </div>
          <div className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1 text-[10px] text-[var(--color-figma-text-secondary)]">
            {selectionLabel || "No active view"}
          </div>
        </div>
        <div className="mt-2 flex gap-1">
          {[
            { id: "authoring" as const, label: "Axes" },
            { id: "compare" as const, label: "Compare" },
            { id: "output" as const, label: "Output" },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveView(item.id)}
              className={`rounded px-2 py-1 text-[10px] font-medium ${
                activeView === item.id
                  ? "bg-[var(--color-figma-accent)] text-white"
                  : "text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {activeView === "compare" ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <ThemeCompareScreen
            compareFocusDimension={dimensions[0] ?? null}
            compareFocusOptionName={dimensions[0]?.options[0]?.name ?? null}
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
            onBack={() => setActiveView("authoring")}
          />
        </div>
      ) : null}

      {activeView === "output" ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          {resolverState ? (
            <ThemeResolverScreen
              resolverState={resolverState}
              onBack={() => setActiveView("authoring")}
              onSuccess={onSuccess}
            />
          ) : (
            <div className="px-3 py-3 text-[11px] text-[var(--color-figma-text-secondary)]">
              No output mapping is configured yet. Use Sync to generate implementation-facing artifacts from the authored token system.
            </div>
          )}
        </div>
      ) : null}

      {activeView === "authoring" ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <div className="space-y-3">
            {showCreateDim ? (
              <CreateAxisForm
                value={newDimName}
                error={createDimError}
                saving={isCreatingDim}
                onChange={setNewDimName}
                onSubmit={() => void handleCreateDimension()}
                onCancel={closeCreateDim}
              />
            ) : (
              <button
                type="button"
                onClick={() => openCreateDim()}
                className="rounded border border-[var(--color-figma-border)] px-3 py-2 text-[11px] font-medium text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
              >
                Create mode axis
              </button>
            )}

            <section className="rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
              <div className="border-b border-[var(--color-figma-border)] px-3 py-2">
                <div className="text-[11px] font-medium text-[var(--color-figma-text)]">
                  Saved views
                </div>
                <p className="mt-0.5 text-[10px] text-[var(--color-figma-text-secondary)]">
                  Saved views store reusable selections across mode axes. They do not own token values.
                </p>
              </div>
              <div className="space-y-2 px-3 py-3">
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
                    onClick={() => void saveView()}
                    className="rounded bg-[var(--color-figma-accent)] px-3 py-1.5 text-[11px] font-medium text-white"
                  >
                    Save current
                  </button>
                </div>
                {viewsLoading ? <Spinner /> : null}
                {viewsError ? (
                  <div className="text-[10px] text-[var(--color-figma-error)]">
                    {viewsError}
                  </div>
                ) : null}
                <div className="space-y-2">
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
                          onClick={() => applyView(view)}
                          className="rounded px-2 py-1 text-[10px] font-medium text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/10"
                        >
                          Apply
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteView(view.id)}
                          className="rounded px-2 py-1 text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                  {views.length === 0 && !viewsLoading ? (
                    <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
                      No saved views yet.
                    </div>
                  ) : null}
                </div>
              </div>
            </section>

            {dimensions.map((dimension) => (
              <section
                key={dimension.id}
                className="rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]"
              >
                <div className="border-b border-[var(--color-figma-border)] px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    {renameDim === dimension.id ? (
                      <div className="flex flex-1 gap-2">
                        <input
                          type="text"
                          value={renameValue}
                          onChange={(event) => setRenameValue(event.target.value)}
                          className="flex-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1 text-[11px] text-[var(--color-figma-text)]"
                        />
                        <button type="button" onClick={() => void executeRenameDim()} className="rounded bg-[var(--color-figma-accent)] px-2 py-1 text-[10px] font-medium text-white">
                          Save
                        </button>
                        <button type="button" onClick={cancelRenameDim} className="rounded px-2 py-1 text-[10px] text-[var(--color-figma-text-secondary)]">
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <div>
                          <div className="text-[11px] font-medium text-[var(--color-figma-text)]">
                            {dimension.name}
                          </div>
                          <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
                            {dimension.options.length} option{dimension.options.length === 1 ? "" : "s"}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <button type="button" onClick={() => startRenameDim(dimension.id, dimension.name)} className="rounded px-2 py-1 text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]">Rename</button>
                          <button type="button" onClick={() => void handleDuplicateDimension(dimension.id)} className="rounded px-2 py-1 text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]">Duplicate</button>
                          <button type="button" onClick={() => openDeleteConfirm(dimension.id)} className="rounded px-2 py-1 text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]">Delete</button>
                        </div>
                      </>
                    )}
                  </div>
                  {renameDim === dimension.id && renameError ? (
                    <div className="mt-1 text-[10px] text-[var(--color-figma-error)]">
                      {renameError}
                    </div>
                  ) : null}
                </div>
                <div className="space-y-2 px-3 py-3">
                  {dimension.options.map((option) => {
                    const optionCoverage =
                      themeModeCoverage.coverage[dimension.id]?.[option.name];
                    const hasCoverage = optionCoverage?.hasCoverage ?? false;
                    const missing = optionCoverage?.missing ?? [];
                    const isActive = normalizedSelections[dimension.id] === option.name;
                    return (
                      <div
                        key={option.name}
                        className="rounded border border-[var(--color-figma-border)] px-2.5 py-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="text-[11px] font-medium text-[var(--color-figma-text)]">
                              {option.name}
                            </div>
                            <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
                              {!hasCoverage
                                ? "No mode values yet"
                                : missing.length === 0
                                  ? "Complete"
                                  : `${missing.length} missing mode value${missing.length === 1 ? "" : "s"}`}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setActiveThemes({
                                ...normalizedSelections,
                                [dimension.id]: option.name,
                              })
                            }
                            className={`rounded px-2 py-1 text-[10px] font-medium ${
                              isActive
                                ? "bg-[var(--color-figma-accent)] text-white"
                                : "text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/10"
                            }`}
                          >
                            {isActive ? "Active" : "Apply"}
                          </button>
                        </div>
                        {hasCoverage && missing.length > 0 ? (
                          <div className="mt-2 rounded bg-[var(--color-figma-bg-secondary)] px-2 py-2">
                            <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
                              Missing examples
                            </div>
                            <div className="mt-1 space-y-1">
                              {missing.slice(0, 4).map((entry) => {
                                const targetSet =
                                  entry.setName ||
                                  pathToSet[entry.path] ||
                                  sets[0] ||
                                  "";
                                return (
                                  <button
                                    key={`${entry.setName}:${entry.path}`}
                                    type="button"
                                    onClick={() =>
                                      onNavigateToToken?.(entry.path, targetSet)
                                    }
                                    className="block w-full truncate text-left text-[10px] text-[var(--color-figma-accent)] hover:underline"
                                    title={`${entry.setName || targetSet} · ${entry.path}`}
                                  >
                                    {entry.setName ? `${entry.setName} · ${entry.path}` : entry.path}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}

                  <div className="rounded border border-dashed border-[var(--color-figma-border)] px-2.5 py-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={axisDrafts[dimension.id] ?? ""}
                        onChange={(event) =>
                          setAxisDrafts((previous) => ({
                            ...previous,
                            [dimension.id]: event.target.value,
                          }))
                        }
                        placeholder="Add option"
                        className="flex-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1 text-[11px] text-[var(--color-figma-text)]"
                      />
                      <button
                        type="button"
                        onClick={() => void handleSaveOption(dimension.id)}
                        disabled={!axisDrafts[dimension.id]?.trim() || axisSaving[dimension.id]}
                        className="rounded bg-[var(--color-figma-accent)] px-3 py-1 text-[10px] font-medium text-white disabled:opacity-40"
                      >
                        Add
                      </button>
                    </div>
                    {axisErrors[dimension.id] ? (
                      <div className="mt-1 text-[10px] text-[var(--color-figma-error)]">
                        {axisErrors[dimension.id]}
                      </div>
                    ) : null}
                  </div>
                </div>
              </section>
            ))}

            <section className="rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
              <div className="border-b border-[var(--color-figma-border)] px-3 py-2">
                <div className="text-[11px] font-medium text-[var(--color-figma-text)]">
                  Preview
                </div>
                <p className="mt-0.5 text-[10px] text-[var(--color-figma-text-secondary)]">
                  This output is generated from token base values plus the active inline mode values.
                </p>
              </div>
              <div className="max-h-[280px] overflow-auto px-3 py-2">
                <div className="space-y-1">
                  {previewTokens.map(([tokenPath, entry]) => (
                    <div
                      key={tokenPath}
                      className="flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-[var(--color-figma-bg-hover)]"
                    >
                      <button
                        type="button"
                        onClick={() => onNavigateToToken?.(tokenPath, pathToSet[tokenPath] ?? sets[0] ?? "")}
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
                </div>
              </div>
            </section>
          </div>
        </div>
      ) : null}

      {dimensionDeleteConfirm ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-[320px] rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] p-3">
            <div className="text-[12px] font-semibold text-[var(--color-figma-text)]">
              Delete mode axis?
            </div>
            <div className="mt-1 text-[10px] text-[var(--color-figma-text-secondary)]">
              This removes the axis definition and deletes its inline mode values from tokens and saved views.
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeDeleteConfirm}
                className="rounded px-3 py-1.5 text-[11px] text-[var(--color-figma-text-secondary)]"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => void executeDeleteDimension(dimensionDeleteConfirm)}
                className="rounded bg-[var(--color-figma-error)] px-3 py-1.5 text-[11px] font-medium text-white"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
