import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type DragEvent,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { ThemeDimension, ThemeOption } from "@tokenmanager/core";
import { NoticeFieldMessage } from "../../shared/noticeSystem";
import type {
  CoverageMap,
  ThemeOptionRoleSummary,
  ThemeRoleState,
} from "../themeManagerTypes";
import type {
  ThemeIssueSummary,
  ThemeRoleNavigationTarget,
} from "../../shared/themeWorkflow";
import {
  ThemeAuthoringProvider,
  type ThemeAuthoringContextValue,
} from "./ThemeAuthoringContext";
import { ThemeAxisBrowser } from "./ThemeAxisBrowser";
import { ThemeAxisCard } from "./ThemeAxisCard";

export interface ThemeAuthoringScreenHandle {
  scrollToDimension: (dimId: string | null | undefined) => void;
  scrollToSetRoles: (dimId: string, optionName: string) => void;
}

interface OptionRenameTarget {
  dimId: string;
  optionName: string;
}

interface OptionDragTarget {
  dimId: string;
  optionName: string;
}

interface ThemeAuthoringScreenProps {
  dimensions: ThemeDimension[];
  sets: string[];
  coverage: CoverageMap;
  optionSetOrders: Record<string, Record<string, string[]>>;
  selectedOptions: Record<string, string>;
  setTokenValues: Record<string, Record<string, any>>;
  optionIssues: Record<string, ThemeIssueSummary[]>;
  optionDiffCounts: Record<string, number>;
  optionRoleSummaries: Record<string, ThemeOptionRoleSummary>;
  focusedDimension: ThemeDimension | null;
  newlyCreatedDim: string | null;
  draggingOpt: OptionDragTarget | null;
  dragOverOpt: OptionDragTarget | null;
  renameDim: string | null;
  renameValue: string;
  renameError: string | null;
  showCreateDim: boolean;
  newDimName: string;
  createDimError: string | null;
  isCreatingDim: boolean;
  isDuplicatingDim: boolean;
  newOptionNames: Record<string, string>;
  showAddOption: Record<string, boolean>;
  addOptionErrors: Record<string, string>;
  addOptionInputRefs: MutableRefObject<Record<string, HTMLInputElement | null>>;
  copyFromNewOption: Record<string, string>;
  renameOption: OptionRenameTarget | null;
  renameOptionValue: string;
  renameOptionError: string | null;
  onGenerateForDimension?: (info: {
    dimensionName: string;
    targetSet: string;
  }) => void;
  setRenameValue: (value: string) => void;
  startRenameDim: (dimId: string, currentName: string) => void;
  cancelRenameDim: () => void;
  executeRenameDim: () => void;
  openDeleteConfirm: (dimId: string) => void;
  handleDuplicateDimension: (dimId: string) => void;
  handleMoveDimension: (dimId: string, direction: "up" | "down") => void;
  onSelectDimension: (dimId: string) => void;
  onSelectOption: (dimId: string, optionName: string) => void;
  openCreateDim: (seedName?: string) => void;
  closeCreateDim: () => void;
  handleCreateDimension: () => void;
  setNewDimName: (value: string) => void;
  setShowAddOption: Dispatch<SetStateAction<Record<string, boolean>>>;
  setNewOptionNames: Dispatch<SetStateAction<Record<string, string>>>;
  setAddOptionErrors: Dispatch<SetStateAction<Record<string, string>>>;
  handleAddOption: (dimId: string) => void;
  setCopyFromNewOption: Dispatch<SetStateAction<Record<string, string>>>;
  handleOptDragStart: (
    event: DragEvent<HTMLElement>,
    dimId: string,
    optionName: string,
  ) => void;
  handleOptDragOver: (
    event: DragEvent<HTMLElement>,
    dimId: string,
    optionName: string,
  ) => void;
  handleOptDrop: (
    event: DragEvent<HTMLElement>,
    dimId: string,
    optionName: string,
  ) => void;
  handleOptDragEnd: () => void;
  handleMoveOption: (
    dimId: string,
    optionName: string,
    direction: "up" | "down",
  ) => void;
  handleDuplicateOption: (dimId: string, optionName: string) => void;
  setOptionDeleteConfirm: (target: OptionRenameTarget | null) => void;
  startRenameOption: (dimId: string, optionName: string) => void;
  setRenameOptionValue: (value: string) => void;
  setRenameOptionError: (value: string | null) => void;
  executeRenameOption: () => void;
  cancelRenameOption: () => void;
  getCopySourceOptions: (dimId: string, optionName: string) => string[];
  handleSetState: (
    dimId: string,
    optionName: string,
    setName: string,
    nextState: ThemeRoleState,
  ) => void;
  handleCopyAssignmentsFrom: (
    dimId: string,
    optionName: string,
    sourceOptionName: string,
  ) => void;
  handleAutoFillAll: (dimId: string, optionName: string) => void;
  handleAutoFillAllOptions: (dimId: string) => void;
  onOpenCoverageView: (
    target?: ThemeRoleNavigationTarget | null,
    allAxes?: boolean,
  ) => void;
  onOpenAdvancedSetup: (
    target?: ThemeRoleNavigationTarget | null,
  ) => void;
  /** Navigate to Tokens workspace with a specific set selected */
  onNavigateToTokenSet?: (setName: string) => void;
}

export const ThemeAuthoringScreen = forwardRef<
  ThemeAuthoringScreenHandle,
  ThemeAuthoringScreenProps
>(function ThemeAuthoringScreen(
  {
    dimensions,
    sets,
    coverage,
    optionSetOrders,
    selectedOptions,
    setTokenValues,
    optionIssues,
    optionDiffCounts,
    optionRoleSummaries,
    focusedDimension,
    newlyCreatedDim,
    draggingOpt,
    dragOverOpt,
    renameDim,
    renameValue,
    renameError,
    showCreateDim,
    newDimName,
    createDimError,
    isCreatingDim,
    isDuplicatingDim,
    newOptionNames,
    showAddOption,
    addOptionErrors,
    addOptionInputRefs,
    copyFromNewOption,
    renameOption,
    renameOptionValue,
    renameOptionError,
    onGenerateForDimension,
    setRenameValue,
    startRenameDim,
    cancelRenameDim,
    executeRenameDim,
    openDeleteConfirm,
    handleDuplicateDimension,
    handleMoveDimension,
    onSelectDimension,
    onSelectOption,
    openCreateDim,
    closeCreateDim,
    handleCreateDimension,
    setNewDimName,
    setShowAddOption,
    setNewOptionNames,
    setAddOptionErrors,
    handleAddOption,
    setCopyFromNewOption,
    handleOptDragStart,
    handleOptDragOver,
    handleOptDrop,
    handleOptDragEnd,
    handleMoveOption,
    handleDuplicateOption,
    setOptionDeleteConfirm,
    startRenameOption,
    setRenameOptionValue,
    setRenameOptionError,
    executeRenameOption,
    cancelRenameOption,
    getCopySourceOptions,
    handleSetState,
    handleCopyAssignmentsFrom,
    handleAutoFillAll,
    handleAutoFillAllOptions,
    onOpenCoverageView,
    onOpenAdvancedSetup,
    onNavigateToTokenSet,
  },
  ref,
) {
  const [collapsedDisabled, setCollapsedDisabled] = useState<Set<string>>(
    () => new Set(dimensions.map((d) => d.id)),
  );
  const [dimSearch, setDimSearch] = useState("");
  const dimSearchRef = useRef<HTMLInputElement | null>(null);
  const dimensionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const setRoleRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const tabScrollRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [tabScrollState, setTabScrollState] = useState<
    Record<string, { left: boolean; right: boolean }>
  >({});

  const scrollToDimension = (dimId: string | null | undefined) => {
    if (!dimId) return;
    requestAnimationFrame(() => {
      dimensionRefs.current[dimId]?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  const scrollToSetRoles = (dimId: string, optionName: string) => {
    requestAnimationFrame(() => {
      setRoleRefs.current[`${dimId}:${optionName}`]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  };

  useImperativeHandle(
    ref,
    () => ({
      scrollToDimension,
      scrollToSetRoles,
    }),
    [],
  );

  const updateTabScroll = (dimId: string) => {
    const element = tabScrollRefs.current[dimId];
    if (!element) return;
    setTabScrollState((current) => ({
      ...current,
      [dimId]: {
        left: element.scrollLeft > 0,
        right:
          element.scrollLeft + element.clientWidth < element.scrollWidth - 1,
      },
    }));
  };

  useEffect(() => {
    const cleanups: Array<() => void> = [];
    for (const dimension of dimensions) {
      const element = tabScrollRefs.current[dimension.id];
      if (!element) continue;
      const handleScroll = () => updateTabScroll(dimension.id);
      element.addEventListener("scroll", handleScroll, { passive: true });
      const resizeObserver = new ResizeObserver(() =>
        updateTabScroll(dimension.id),
      );
      resizeObserver.observe(element);
      updateTabScroll(dimension.id);
      cleanups.push(() => {
        element.removeEventListener("scroll", handleScroll);
        resizeObserver.disconnect();
      });
    }
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [dimensions]);

  const filteredDimensions = useMemo(() => {
    const query = dimSearch.trim().toLowerCase();
    if (!query) return dimensions;
    return dimensions.filter((dimension) => {
      if (dimension.name.toLowerCase().includes(query)) return true;
      return dimension.options.some((option: ThemeOption) =>
        option.name.toLowerCase().includes(query),
      );
    });
  }, [dimSearch, dimensions]);
  const toggleCollapsedDisabled = (dimId: string) => {
    setCollapsedDisabled((current) => {
      const next = new Set(current);
      if (next.has(dimId)) next.delete(dimId);
      else next.add(dimId);
      return next;
    });
  };

  const scrollOptionRail = (dimId: string, direction: "left" | "right") => {
    const element = tabScrollRefs.current[dimId];
    if (!element) return;
    element.scrollBy({
      left: direction === "left" ? -120 : 120,
      behavior: "smooth",
    });
  };

  const authoringContextValue = useMemo<ThemeAuthoringContextValue>(
    () => ({
      // UI state
      collapsedDisabled,
      toggleCollapsedDisabled,
      dimSearch,
      setDimSearch,
      dimSearchRef,
      dimensionRefs,
      setRoleRefs,
      tabScrollRefs,
      tabScrollState,
      scrollOptionRail,
      addOptionInputRefs,

      // Drag & drop
      draggingOpt,
      dragOverOpt,
      handleOptDragStart,
      handleOptDragOver,
      handleOptDrop,
      handleOptDragEnd,

      // Dimension CRUD
      renameDim,
      renameValue,
      renameError,
      setRenameValue,
      startRenameDim,
      cancelRenameDim,
      executeRenameDim,
      openDeleteConfirm,
      handleDuplicateDimension,
      isDuplicatingDim,
      handleMoveDimension,
      newlyCreatedDim,

      // Option CRUD
      newOptionNames,
      showAddOption,
      addOptionErrors,
      copyFromNewOption,
      setShowAddOption,
      setNewOptionNames,
      setAddOptionErrors,
      setCopyFromNewOption,
      handleAddOption,
      renameOption,
      renameOptionValue,
      renameOptionError,
      startRenameOption,
      setRenameOptionValue,
      setRenameOptionError,
      executeRenameOption,
      cancelRenameOption,
      handleDuplicateOption,
      setOptionDeleteConfirm,
      handleMoveOption,

      // Selection
      onSelectDimension,
      onSelectOption,
      selectedOptions,

      // Data
      optionDiffCounts,
      optionRoleSummaries,
      optionIssues,

      // Set operations
      getCopySourceOptions,
      handleSetState,
      handleCopyAssignmentsFrom,
      handleAutoFillAll,
      handleAutoFillAllOptions,

      // Navigation
      onOpenCoverageView,
      onOpenAdvancedSetup,
      onNavigateToTokenSet,
      onGenerateForDimension,
    }),
    [
      collapsedDisabled,
      dimSearch,
      tabScrollState,
      addOptionInputRefs,
      draggingOpt,
      dragOverOpt,
      handleOptDragStart,
      handleOptDragOver,
      handleOptDrop,
      handleOptDragEnd,
      renameDim,
      renameValue,
      renameError,
      setRenameValue,
      startRenameDim,
      cancelRenameDim,
      executeRenameDim,
      openDeleteConfirm,
      handleDuplicateDimension,
      isDuplicatingDim,
      handleMoveDimension,
      newlyCreatedDim,
      newOptionNames,
      showAddOption,
      addOptionErrors,
      copyFromNewOption,
      setShowAddOption,
      setNewOptionNames,
      setAddOptionErrors,
      setCopyFromNewOption,
      handleAddOption,
      renameOption,
      renameOptionValue,
      renameOptionError,
      startRenameOption,
      setRenameOptionValue,
      setRenameOptionError,
      executeRenameOption,
      cancelRenameOption,
      handleDuplicateOption,
      setOptionDeleteConfirm,
      handleMoveOption,
      onSelectDimension,
      onSelectOption,
      selectedOptions,
      optionDiffCounts,
      optionRoleSummaries,
      optionIssues,
      getCopySourceOptions,
      handleSetState,
      handleCopyAssignmentsFrom,
      handleAutoFillAll,
      handleAutoFillAllOptions,
      onOpenCoverageView,
      onOpenAdvancedSetup,
      onNavigateToTokenSet,
      onGenerateForDimension,
    ],
  );

  return (
    <>
      <div className="flex-1 overflow-y-auto">
        {dimensions.length === 0 && !showCreateDim ? (
          <div className="flex flex-col items-center justify-center gap-3 px-3 py-3 text-center">
            <div className="flex flex-col gap-1">
              <p className="text-[12px] font-semibold text-[var(--color-figma-text)]">
                Create a mode
              </p>
              <p className="max-w-[240px] text-[11px] leading-relaxed text-[var(--color-figma-text-secondary)]">
                Define a mode like color mode or brand, then assign the base
                and variant-specific token sets for each variant.
              </p>
            </div>

            <div className="flex w-full max-w-[260px] flex-col gap-1.5">
              {(
                [
                  ["Color Mode", "Light / Dark"],
                  ["Brand", "Default / Premium"],
                  ["Density", "Regular / Compact"],
                ] as const
              ).map(([name, example]) => (
                <button
                  key={name}
                  onClick={() => openCreateDim(name)}
                  className="group flex items-center justify-between rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2.5 py-1.5 text-left transition-colors hover:border-[var(--color-figma-accent)] hover:bg-[var(--color-figma-bg-hover)]"
                >
                  <span className="text-[11px] font-medium text-[var(--color-figma-text)] group-hover:text-[var(--color-figma-accent)]">
                    {name}
                  </span>
                  <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">
                    {example}
                  </span>
                </button>
              ))}
            </div>

            <button
              onClick={() => openCreateDim()}
              className="text-[10px] text-[var(--color-figma-accent)] hover:underline"
            >
              or add a custom mode
            </button>
          </div>
        ) : (
          <ThemeAuthoringProvider value={authoringContextValue}>
            <div className="flex flex-col">
              <ThemeAxisBrowser dimensionsCount={dimensions.length} />
              <div className="flex flex-col">
                {filteredDimensions.length === 0 && dimSearch && (
                  <div className="py-6 text-center text-[11px] text-[var(--color-figma-text-tertiary)]">
                    No modes match your filter
                  </div>
                )}
                {filteredDimensions.map((dimension) => {
                  const dimensionIndex = dimensions.indexOf(dimension);
                  const dimensionCoverage = coverage[dimension.id] ?? {};
                  const optionsWithGaps = dimension.options.filter(
                    (item: ThemeOption) =>
                      (dimensionCoverage[item.name]?.uncovered.length ?? 0) > 0,
                  );
                  const totalDimensionGaps = optionsWithGaps.reduce(
                    (sum: number, item: ThemeOption) =>
                      sum + (dimensionCoverage[item.name]?.uncovered.length ?? 0),
                    0,
                  );
                  const totalDimensionFillable = optionsWithGaps.reduce(
                    (sum: number, item: ThemeOption) => {
                      const uncovered =
                        dimensionCoverage[item.name]?.uncovered ?? [];
                      return (
                        sum +
                        uncovered.filter(
                          (entry) =>
                            entry.missingRef && entry.fillValue !== undefined,
                        ).length
                      );
                    },
                    0,
                  );
                  return (
                    <ThemeAxisCard
                      key={dimension.id}
                      dimension={dimension}
                      sets={sets}
                      optionSetOrders={optionSetOrders}
                      setTokenValues={setTokenValues}
                      dimensionIndex={dimensionIndex}
                      totalDimensions={dimensions.length}
                      isExpanded={focusedDimension?.id === dimension.id}
                      totalDimensionGaps={totalDimensionGaps}
                      totalDimensionFillable={totalDimensionFillable}
                      multiOptionGaps={optionsWithGaps.length > 1}
                    />
                  );
                })}
                {dimSearch && filteredDimensions.length === 0 && (
                  <div className="px-3 py-4 text-center text-[11px] text-[var(--color-figma-text-tertiary)]">
                    No modes matching &ldquo;{dimSearch}&rdquo;
                  </div>
                )}
                {dimSearch &&
                  filteredDimensions.length > 0 &&
                  filteredDimensions.length < dimensions.length && (
                    <div className="px-3 py-1 text-center text-[10px] text-[var(--color-figma-text-tertiary)]">
                      Showing {filteredDimensions.length} of {dimensions.length} modes
                    </div>
                  )}
              </div>
            </div>
          </ThemeAuthoringProvider>
        )}
      </div>

      <div className="border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-2">
        {showCreateDim ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">
                Mode name
              </label>
              <input
                type="text"
                value={newDimName}
                onChange={(event) => setNewDimName(event.target.value)}
                placeholder="e.g. Color mode, Brand, Density"
                className={`w-full rounded border bg-[var(--color-figma-bg)] px-2 py-1.5 text-[11px] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)] ${
                  createDimError
                    ? "border-[var(--color-figma-error)]"
                    : "border-[var(--color-figma-border)]"
                }`}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleCreateDimension();
                }}
                autoFocus
              />
              <p className="text-[10px] leading-snug text-[var(--color-figma-text-tertiary)]">
                Each mode has variants — e.g.{" "}
                <span className="font-medium">Mode:</span> light, dark
                &nbsp;·&nbsp; <span className="font-medium">Brand:</span>{" "}
                default, premium
              </p>
            </div>
            {createDimError && (
              <NoticeFieldMessage severity="error">
                {createDimError}
              </NoticeFieldMessage>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleCreateDimension}
                disabled={!newDimName || isCreatingDim}
                className="flex-1 rounded bg-[var(--color-figma-accent)] px-3 py-1.5 text-[11px] font-medium text-white hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
              >
                {isCreatingDim ? "Creating…" : "Create mode"}
              </button>
              <button
                onClick={closeCreateDim}
                className="rounded px-3 py-1.5 text-[11px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => openCreateDim()}
            className="flex w-full items-center justify-center rounded border border-dashed border-[var(--color-figma-border)] px-3 py-1 text-[11px] text-[var(--color-figma-text-secondary)] transition-colors hover:border-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
          >
            Add mode
          </button>
        )}
      </div>
    </>
  );
});
