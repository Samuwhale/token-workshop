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
} from "../themeManagerTypes";
import type {
  ThemeIssueSummary,
  ThemeRoleNavigationTarget,
} from "../../shared/themeWorkflow";
import {
  ThemeAuthoringProvider,
  type ThemeAuthoringContextValue,
} from "./ThemeAuthoringContext";
import { ThemeAuthoringHeader } from "./ThemeAuthoringHeader";
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
  },
  ref,
) {
  const [collapsedDisabled, setCollapsedDisabled] = useState<Set<string>>(
    () => new Set(dimensions.map((d) => d.id)),
  );
  const [dimSearch, setDimSearch] = useState("");
  const [secondaryToolsOpen, setSecondaryToolsOpen] = useState(false);
  const dimSearchRef = useRef<HTMLInputElement | null>(null);
  const dimensionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const setRoleRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const secondaryToolsRef = useRef<HTMLDivElement | null>(null);
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

  useEffect(() => {
    if (!secondaryToolsOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!secondaryToolsRef.current?.contains(event.target as Node)) {
        setSecondaryToolsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSecondaryToolsOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    requestAnimationFrame(() => {
      secondaryToolsRef.current
        ?.querySelector<HTMLElement>('[role="menuitem"]')
        ?.focus();
    });
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [secondaryToolsOpen]);

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
      secondaryToolsOpen,
      setSecondaryToolsOpen,
      secondaryToolsRef,
      dimensionRefs,
      setRoleRefs,
      tabScrollRefs,
      tabScrollState,
      scrollOptionRail,
      addOptionInputRefs,
      setShowAddOption,
      setNewOptionNames,
      setAddOptionErrors,
      setCopyFromNewOption,
      handleOptDragStart,
      handleOptDragOver,
      handleOptDrop,
      handleOptDragEnd,
      draggingOpt,
      dragOverOpt,
    }),
    [
      collapsedDisabled,
      dimSearch,
      secondaryToolsOpen,
      tabScrollState,
      addOptionInputRefs,
      setShowAddOption,
      setNewOptionNames,
      setAddOptionErrors,
      setCopyFromNewOption,
      handleOptDragStart,
      handleOptDragOver,
      handleOptDrop,
      handleOptDragEnd,
      draggingOpt,
      dragOverOpt,
    ],
  );

  return (
    <>
      <div className="flex-1 overflow-y-auto">
        {dimensions.length === 0 && !showCreateDim ? (
          <div className="flex flex-col items-center justify-center gap-4 px-5 py-10 text-center">
            <div className="flex flex-col gap-1">
              <p className="text-[12px] font-semibold text-[var(--color-figma-text)]">
                Create a theme family
              </p>
              <p className="max-w-[240px] text-[11px] leading-relaxed text-[var(--color-figma-text-secondary)]">
                Define a family like color mode or brand, then assign the shared
                and variant-specific token sets behind each option.
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
              or add a custom family
            </button>
          </div>
        ) : (
          <ThemeAuthoringProvider value={authoringContextValue}>
            <div className="flex flex-col">
              <ThemeAuthoringHeader
                focusedDimension={focusedDimension}
                onOpenCoverageView={() => onOpenCoverageView(null, true)}
                onOpenAdvancedSetup={() =>
                  onOpenAdvancedSetup(
                    focusedDimension
                      ? {
                          dimId: focusedDimension.id,
                          optionName:
                            selectedOptions[focusedDimension.id] ??
                            focusedDimension.options[0]?.name ??
                            null,
                          preferredSetName: null,
                        }
                      : null,
                  )
                }
              />
              <ThemeAxisBrowser dimensionsCount={dimensions.length} />
              <div className="flex flex-col">
                {filteredDimensions.length === 0 && dimSearch && (
                  <div className="py-6 text-center text-[11px] text-[var(--color-figma-text-tertiary)]">
                    No families match your filter
                  </div>
                )}
                {filteredDimensions.map((dimension) => {
                  const selectedOption =
                    selectedOptions[dimension.id] ||
                    dimension.options[0]?.name ||
                    "";
                  const option = dimension.options.find(
                    (item: ThemeOption) => item.name === selectedOption,
                  );
                  const optionSets = option
                    ? optionSetOrders[dimension.id]?.[option.name] || sets
                    : sets;
                  const dimensionIndex = dimensions.indexOf(dimension);
                  const overrideSets = optionSets.filter(
                    (setName) => option?.sets[setName] === "enabled",
                  );
                  const foundationSets = optionSets.filter(
                    (setName) => option?.sets[setName] === "source",
                  );
                  const disabledSets = optionSets.filter(
                    (setName) =>
                      !option?.sets[setName] ||
                      option?.sets[setName] === "disabled",
                  );
                  const copySourceOptions = getCopySourceOptions(
                    dimension.id,
                    selectedOption,
                  );
                  const optionKey = `${dimension.id}:${selectedOption}`;
                  const selectedOptionIssues = optionIssues[optionKey] ?? [];
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
                      dimensionIndex={dimensionIndex}
                      isExpanded={focusedDimension?.id === dimension.id}
                      onToggleExpand={() => onSelectDimension(dimension.id)}
                      totalDimensionGaps={totalDimensionGaps}
                      totalDimensionFillable={totalDimensionFillable}
                      multiOptionGaps={optionsWithGaps.length > 1}
                      selectedOption={selectedOption}
                      option={option}
                      selectedOptionIssues={selectedOptionIssues}
                      overrideSets={overrideSets}
                      foundationSets={foundationSets}
                      disabledSets={disabledSets}
                      optionDiffCounts={optionDiffCounts}
                      optionRoleSummaries={optionRoleSummaries}
                      renameDim={renameDim}
                      renameValue={renameValue}
                      renameError={renameError}
                      showAddOption={showAddOption[dimension.id] ?? false}
                      newOptionName={newOptionNames[dimension.id] ?? ""}
                      addOptionError={addOptionErrors[dimension.id] ?? ""}
                      copyFromNewOption={copyFromNewOption[dimension.id] ?? ""}
                      renameOption={renameOption}
                      renameOptionValue={renameOptionValue}
                      renameOptionError={renameOptionError}
                      newlyCreatedDim={newlyCreatedDim}
                      isDuplicatingDim={isDuplicatingDim}
                      copySourceOptions={copySourceOptions}
                      setTokenCounts={Object.fromEntries(
                        sets.map((setName) => [
                          setName,
                          setTokenValues[setName]
                            ? Object.keys(setTokenValues[setName]).length
                            : null,
                        ]),
                      )}
                      onSetRenameValue={setRenameValue}
                      onStartRenameDim={() =>
                        startRenameDim(dimension.id, dimension.name)
                      }
                      onCancelRenameDim={cancelRenameDim}
                      onExecuteRenameDim={executeRenameDim}
                      onDeleteDimension={() => openDeleteConfirm(dimension.id)}
                      onDuplicateDimension={() =>
                        handleDuplicateDimension(dimension.id)
                      }
                      onMoveDimension={(direction) =>
                        handleMoveDimension(dimension.id, direction)
                      }
                      onSelectOption={(optionName) =>
                        onSelectOption(dimension.id, optionName)
                      }
                      onToggleAddOption={(next) =>
                        setShowAddOption((current) => ({
                          ...current,
                          [dimension.id]: next,
                        }))
                      }
                      onSetNewOptionName={(value) => {
                        setNewOptionNames((current) => ({
                          ...current,
                          [dimension.id]: value,
                        }));
                        setAddOptionErrors((current) => ({
                          ...current,
                          [dimension.id]: "",
                        }));
                      }}
                      onSetCopyFromNewOption={(value) =>
                        setCopyFromNewOption((current) => ({
                          ...current,
                          [dimension.id]: value,
                        }))
                      }
                      onAddOption={() => handleAddOption(dimension.id)}
                      onStartRenameOption={() =>
                        startRenameOption(dimension.id, selectedOption)
                      }
                      onRenameOptionValueChange={(value) => {
                        setRenameOptionValue(value);
                        setRenameOptionError(null);
                      }}
                      onExecuteRenameOption={executeRenameOption}
                      onCancelRenameOption={cancelRenameOption}
                      onMoveOption={(direction) =>
                        handleMoveOption(dimension.id, selectedOption, direction)
                      }
                      onDuplicateOption={() =>
                        handleDuplicateOption(dimension.id, selectedOption)
                      }
                      onDeleteOption={() =>
                        setOptionDeleteConfirm({
                          dimId: dimension.id,
                          optionName: selectedOption,
                        })
                      }
                      onOpenCoverageView={onOpenCoverageView}
                      onOpenAdvancedSetup={() =>
                        onOpenAdvancedSetup({
                          dimId: dimension.id,
                          optionName: selectedOption,
                          preferredSetName: null,
                        })
                      }
                      onHandleSetState={(setName, nextState) =>
                        handleSetState(dimension.id, selectedOption, setName, nextState)
                      }
                      onHandleCopyAssignmentsFrom={(sourceOptionName) =>
                        handleCopyAssignmentsFrom(
                          dimension.id,
                          selectedOption,
                          sourceOptionName,
                        )
                      }
                      onAutoFillOption={() =>
                        handleAutoFillAll(dimension.id, selectedOption)
                      }
                      onAutoFillAllOptions={() =>
                        handleAutoFillAllOptions(dimension.id)
                      }
                      onGenerateForDimension={
                        onGenerateForDimension
                          ? () => {
                              const targetSet =
                                overrideSets[0] ??
                                foundationSets[0] ??
                                sets[0] ??
                                "";
                              if (targetSet) {
                                onGenerateForDimension({
                                  dimensionName: dimension.name,
                                  targetSet,
                                });
                              }
                            }
                          : undefined
                      }
                    />
                  );
                })}
                {dimSearch && filteredDimensions.length === 0 && (
                  <div className="px-3 py-4 text-center text-[11px] text-[var(--color-figma-text-tertiary)]">
                    No families or variants matching &ldquo;{dimSearch}&rdquo;
                  </div>
                )}
                {dimSearch &&
                  filteredDimensions.length > 0 &&
                  filteredDimensions.length < dimensions.length && (
                    <div className="px-3 py-1 text-center text-[10px] text-[var(--color-figma-text-tertiary)]">
                      Showing {filteredDimensions.length} of {dimensions.length} families
                    </div>
                  )}
              </div>
            </div>
          </ThemeAuthoringProvider>
        )}
      </div>

      <div className="border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-3">
        {showCreateDim ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">
                Family name
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
                Each family has variants — e.g.{" "}
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
                {isCreatingDim ? "Creating…" : "Create family"}
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
            className="flex w-full items-center gap-1.5 rounded border border-dashed border-[var(--color-figma-border)] px-3 py-1.5 text-left text-[11px] text-[var(--color-figma-text-secondary)] transition-colors hover:border-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
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
              <rect x="3" y="3" width="18" height="6" rx="1.5" />
              <rect x="3" y="12" width="18" height="6" rx="1.5" opacity="0.5" />
            </svg>
            Add theme family
          </button>
        )}
      </div>
    </>
  );
});
