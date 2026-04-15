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
import type { ThemeIssueSummary } from "../../shared/themeWorkflow";
import type { ThemeResolverAuthoringContext } from "./themeResolverContext";
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
  onOpenCompare: (dimId?: string) => void;
  onOpenOutput: () => void;
  /** Navigate to Tokens workspace with a specific set selected */
  onNavigateToTokenSet?: (setName: string) => void;
  /** Resolver alignment context for inline token output section */
  resolverAuthoringContext?: ThemeResolverAuthoringContext | null;
}

function InlineTokenOutputSection({
  context,
  onConfigure,
}: {
  context: ThemeResolverAuthoringContext;
  onConfigure: () => void;
}) {
  const connectedCount = context.axes.filter(
    (axis) => axis.status === "matched",
  ).length;
  const hasIssues = context.issueCount > 0;

  return (
    <section className="border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]/35 px-3 py-2.5">
      <button
        type="button"
        onClick={onConfigure}
        className="group flex w-full items-start gap-3 rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-2 text-left transition-colors hover:border-[var(--color-figma-accent)]/35 hover:bg-[var(--color-figma-bg-hover)]"
      >
        <span
          className={`mt-1 h-2 w-2 shrink-0 rounded-full ${hasIssues ? "bg-amber-500" : "bg-[var(--color-figma-success,#18a058)]"}`}
        />
        <div className="min-w-0 flex-1">
          <span className="text-[10px] font-semibold text-[var(--color-figma-text)]">
            {context.resolverName}
          </span>
          <p className="mt-0.5 text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
            {context.setupSummary}
          </p>
        </div>
        <span className="shrink-0 rounded border border-[var(--color-figma-border)] px-2 py-0.5 text-[9px] font-medium text-[var(--color-figma-text-secondary)] transition-colors group-hover:border-[var(--color-figma-accent)]/35 group-hover:text-[var(--color-figma-accent)]">
          {context.recommendedActionLabel}
        </span>
      </button>
    </section>
  );
}

function CreateModePanel({
  newDimName,
  setNewDimName,
  createDimError,
  isCreatingDim,
  handleCreateDimension,
  closeCreateDim,
  openCreateDim,
}: {
  newDimName: string;
  setNewDimName: (value: string) => void;
  createDimError: string | null;
  isCreatingDim: boolean;
  handleCreateDimension: () => void;
  closeCreateDim: () => void;
  openCreateDim: (seedName?: string) => void;
}) {
  const presetNames = ["Light / Dark", "Brand", "Density"];

  return (
    <section className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-2.5">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {presetNames.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => openCreateDim(name)}
              className="rounded-full border border-[var(--color-figma-border)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-figma-text)] transition-colors hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)]"
            >
              {name}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={newDimName}
          onChange={(event) => setNewDimName(event.target.value)}
          placeholder="Color mode, Brand, Density"
          className={`w-full rounded border bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-[11px] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)] ${
            createDimError
              ? "border-[var(--color-figma-error)]"
              : "border-[var(--color-figma-border)]"
          }`}
          onKeyDown={(event) => {
            if (event.key === "Enter") handleCreateDimension();
            if (event.key === "Escape") closeCreateDim();
          }}
          autoFocus
        />
        {createDimError && (
          <NoticeFieldMessage severity="error">{createDimError}</NoticeFieldMessage>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleCreateDimension}
            disabled={!newDimName.trim() || isCreatingDim}
            className="flex-1 rounded bg-[var(--color-figma-accent)] px-3 py-1.5 text-[11px] font-medium text-white hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
          >
            {isCreatingDim ? "Creating..." : "Create mode"}
          </button>
          <button
            type="button"
            onClick={closeCreateDim}
            className="rounded px-3 py-1.5 text-[11px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
          >
            Cancel
          </button>
        </div>
      </div>
    </section>
  );
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
    onOpenCompare,
    onOpenOutput,
    onNavigateToTokenSet,
    resolverAuthoringContext,
  },
  ref,
) {
  const [collapsedDisabled, setCollapsedDisabled] = useState<Set<string>>(
    () => new Set(dimensions.map((dimension) => dimension.id)),
  );
  const [dimSearch, setDimSearch] = useState("");
  const dimSearchRef = useRef<HTMLInputElement | null>(null);
  const dimensionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const setRoleRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const tabScrollRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [tabScrollState, setTabScrollState] = useState<
    Record<string, { left: boolean; right: boolean }>
  >({});

  const totalIssueCount = useMemo(
    () => Object.values(optionIssues).reduce((sum, issues) => sum + issues.length, 0),
    [optionIssues],
  );

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
      onOpenCompare,
      onOpenOutput,
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
      onOpenCompare,
      onOpenOutput,
      onNavigateToTokenSet,
      onGenerateForDimension,
    ],
  );

  const hasDimensions = dimensions.length > 0;

  const content = hasDimensions ? (
    <ThemeAuthoringProvider value={authoringContextValue}>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ThemeAxisBrowser
            issueCount={totalIssueCount}
            onCreateMode={() => openCreateDim()}
          />
          <div className="flex flex-col">
            {filteredDimensions.length === 0 && dimSearch && (
              <div className="px-3 py-6 text-center text-[11px] text-[var(--color-figma-text-tertiary)]">
                No modes or values match this search.
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
                  const uncovered = dimensionCoverage[item.name]?.uncovered ?? [];
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
            {/* Search results are implicitly visible from the filtered list */}
          </div>

          {resolverAuthoringContext && (
            <InlineTokenOutputSection
              context={resolverAuthoringContext}
              onConfigure={onOpenOutput}
            />
          )}
        </div>
      </div>
    </ThemeAuthoringProvider>
  ) : showCreateDim ? (
    <div className="flex-1" />
  ) : (
    <div className="flex flex-1 items-center justify-center px-4 py-8">
      <div className="flex w-full max-w-[320px] flex-col items-center gap-3">
        <p className="text-center text-[11px] leading-snug text-[var(--color-figma-text-secondary)]">
          Define how tokens change across contexts
        </p>
        <div className="flex flex-wrap justify-center gap-1.5">
          {(["Light / Dark", "Brand", "Density"] as const).map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => openCreateDim(name)}
              className="rounded-full border border-[var(--color-figma-border)] px-2.5 py-1 text-[10px] font-medium text-[var(--color-figma-text)] transition-colors hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)]"
            >
              {name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => openCreateDim()}
            className="rounded-full border border-dashed border-[var(--color-figma-border)] px-2.5 py-1 text-[10px] font-medium text-[var(--color-figma-text-tertiary)] transition-colors hover:border-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text-secondary)]"
          >
            Custom
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {showCreateDim && (
        <CreateModePanel
          newDimName={newDimName}
          setNewDimName={setNewDimName}
          createDimError={createDimError}
          isCreatingDim={isCreatingDim}
          handleCreateDimension={handleCreateDimension}
          closeCreateDim={closeCreateDim}
          openCreateDim={openCreateDim}
        />
      )}

      {content}
    </div>
  );
});
