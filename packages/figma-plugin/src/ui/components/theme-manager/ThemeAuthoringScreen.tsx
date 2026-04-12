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
  type ReactNode,
  type SetStateAction,
} from "react";
import type { ThemeDimension, ThemeOption } from "@tokenmanager/core";
import {
  NoticeBanner,
  NoticeCountBadge,
  NoticeFieldMessage,
  NoticePill,
} from "../../shared/noticeSystem";
import type {
  CoverageMap,
  ThemeOptionRoleSummary,
  ThemeRoleState,
} from "../themeManagerTypes";
import { STATE_DESCRIPTIONS, STATE_LABELS } from "../themeManagerTypes";
import { getMenuItems, handleMenuArrowKeys } from "../../hooks/useMenuKeyboard";
import { adaptShortcut } from "../../shared/utils";
import { SHORTCUT_KEYS } from "../../shared/shortcutRegistry";
import type {
  ThemeIssueSummary,
  ThemeRoleNavigationTarget,
} from "../../shared/themeWorkflow";
import { getFirstDimensionWithFillableGaps } from "./themeAutoFillTargets";

export interface ThemeAuthoringScreenHandle {
  scrollToDimension: (dimId: string | null | undefined) => void;
  scrollToPreview: () => void;
  scrollToSetRoles: (dimId: string, optionName: string) => void;
}

interface RoleEditorTarget {
  dimId: string;
  optionName: string;
  setName: string | null;
}

interface OptionRenameTarget {
  dimId: string;
  optionName: string;
}

interface CreateOverrideSetTarget {
  dimId: string;
  setName: string;
  optName?: string;
}

interface OptionDragTarget {
  dimId: string;
  optionName: string;
}

interface PreviewTokenEntry {
  path: string;
  rawValue: unknown;
  resolvedValue: unknown;
  set: string;
  layer: string;
}

interface ThemeAuthoringScreenProps {
  dimensions: ThemeDimension[];
  sets: string[];
  coverage: CoverageMap;
  optionSetOrders: Record<string, Record<string, string[]>>;
  selectedOptions: Record<string, string>;
  setTokenValues: Record<string, Record<string, any>>;
  optionIssues: Record<string, ThemeIssueSummary[]>;
  totalIssueCount: number;
  totalFillableGaps: number;
  optionDiffCounts: Record<string, number>;
  optionRoleSummaries: Record<string, ThemeOptionRoleSummary>;
  focusedDimension: ThemeDimension | null;
  focusedOptionName: string | null;
  focusedContextLabel: string;
  focusedIssueCount: number;
  focusedPrimaryIssue: ThemeIssueSummary | null;
  canCompareThemes: boolean;
  showPreview: boolean;
  resolverAvailable: boolean;
  newlyCreatedDim: string | null;
  draggingDimId: string | null;
  dragOverDimId: string | null;
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
  editingRoleTarget: RoleEditorTarget | null;
  roleStates: ThemeRoleState[];
  fillingKeys: Set<string>;
  onNavigateToToken?: (path: string, set: string) => void;
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
  handleDimDragStart: (event: DragEvent<HTMLElement>, dimId: string) => void;
  handleDimDragOver: (event: DragEvent<HTMLElement>, dimId: string) => void;
  handleDimDrop: (dimId: string) => void;
  handleDimDragEnd: () => void;
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
  openRoleEditor: (
    dimId: string,
    optionName: string,
    preferredSetName?: string | null,
  ) => void;
  closeRoleEditor: (dimId: string, optionName: string) => void;
  setRoleEditorSetName: (
    dimId: string,
    optionName: string,
    setName: string,
  ) => void;
  getSetRoleCounts: (
    dimId: string,
    setName: string,
  ) => Record<ThemeRoleState, number>;
  getCopySourceOptions: (dimId: string, optionName: string) => string[];
  handleBulkSetState: (
    dimId: string,
    setName: string,
    nextState: ThemeRoleState,
  ) => void;
  handleBulkSetAllInOption: (
    dimId: string,
    optionName: string,
    nextState: ThemeRoleState,
  ) => void;
  handleCopyAssignmentsFrom: (
    dimId: string,
    optionName: string,
    sourceOptionName: string,
  ) => void;
  setCreateOverrideSet: (target: CreateOverrideSetTarget | null) => void;
  handleAutoFillAll: (dimId: string, optionName: string) => void;
  handleAutoFillAllOptions: (dimId: string) => void;
  onOpenCoverageView: (
    target?: ThemeRoleNavigationTarget | null,
    allAxes?: boolean,
  ) => void;
  onOpenCompareView: (dimension?: ThemeDimension, optionName?: string) => void;
  onOpenAdvancedView: () => void;
  onFocusRoleTarget: (
    target: ThemeRoleNavigationTarget | null | undefined,
    openEditor?: boolean,
  ) => void;
  renderSetRow: (
    dim: ThemeDimension,
    opt: ThemeOption,
    setName: string,
    status: ThemeRoleState,
    isEditingRoles: boolean,
    isBulkActionTarget: boolean,
  ) => ReactNode;
  renderIssueEntry: (
    issue: ThemeIssueSummary,
    source: "authoring" | "coverage",
  ) => ReactNode;
  renderValuePreview: (value: unknown) => ReactNode;
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
    totalIssueCount,
    totalFillableGaps,
    optionDiffCounts,
    optionRoleSummaries,
    focusedDimension,
    focusedOptionName,
    focusedContextLabel,
    focusedIssueCount,
    focusedPrimaryIssue,
    canCompareThemes,
    showPreview,
    resolverAvailable,
    newlyCreatedDim,
    draggingDimId,
    dragOverDimId,
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
    editingRoleTarget,
    roleStates,
    fillingKeys,
    onNavigateToToken,
    onGenerateForDimension,
    setRenameValue,
    startRenameDim,
    cancelRenameDim,
    executeRenameDim,
    openDeleteConfirm,
    handleDuplicateDimension,
    handleMoveDimension,
    handleDimDragStart,
    handleDimDragOver,
    handleDimDrop,
    handleDimDragEnd,
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
    openRoleEditor,
    closeRoleEditor,
    setRoleEditorSetName,
    getSetRoleCounts,
    getCopySourceOptions,
    handleBulkSetState,
    handleBulkSetAllInOption,
    handleCopyAssignmentsFrom,
    setCreateOverrideSet,
    handleAutoFillAll,
    handleAutoFillAllOptions,
    onOpenCoverageView,
    onOpenCompareView,
    onOpenAdvancedView,
    onFocusRoleTarget,
    renderSetRow,
    renderIssueEntry,
    renderValuePreview,
  },
  ref,
) {
  const [collapsedDisabled, setCollapsedDisabled] = useState<Set<string>>(
    new Set(),
  );
  const [dimSearch, setDimSearch] = useState("");
  const [previewSearch, setPreviewSearch] = useState("");
  const [showOnlyWithGaps, setShowOnlyWithGaps] = useState(false);
  const [secondaryToolsOpen, setSecondaryToolsOpen] = useState(false);
  const dimSearchRef = useRef<HTMLInputElement | null>(null);
  const previewSearchRef = useRef<HTMLInputElement | null>(null);
  const dimensionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const setRoleRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const previewSectionRef = useRef<HTMLDivElement | null>(null);
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

  const scrollToPreview = () => {
    requestAnimationFrame(() => {
      previewSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  useImperativeHandle(
    ref,
    () => ({
      scrollToDimension,
      scrollToPreview,
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
      if (!secondaryToolsRef.current) return;
      getMenuItems(secondaryToolsRef.current)[0]?.focus();
    });
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [secondaryToolsOpen]);

  const filteredDimensions = useMemo(() => {
    let next = dimensions;
    if (showOnlyWithGaps) {
      next = next.filter((dimension) => {
        const dimensionCoverage = coverage[dimension.id] ?? {};
        return Object.values(dimensionCoverage).some(
          (option) => option.uncovered.length > 0,
        );
      });
    }
    const query = dimSearch.trim().toLowerCase();
    if (!query) return next;
    return next.filter((dimension) => {
      if (dimension.name.toLowerCase().includes(query)) return true;
      return dimension.options.some((option: ThemeOption) =>
        option.name.toLowerCase().includes(query),
      );
    });
  }, [coverage, dimSearch, dimensions, showOnlyWithGaps]);
  const firstDimensionWithFillableGaps = useMemo(
    () => getFirstDimensionWithFillableGaps(dimensions, coverage),
    [coverage, dimensions],
  );

  const previewTokens = useMemo<PreviewTokenEntry[]>(() => {
    if (!showPreview || dimensions.length === 0) return [];
    const merged: Record<
      string,
      { value: unknown; set: string; layer: string }
    > = {};
    for (let index = dimensions.length - 1; index >= 0; index -= 1) {
      const dimension = dimensions[index];
      const optionName = selectedOptions[dimension.id];
      const option = dimension.options.find(
        (item: ThemeOption) => item.name === optionName,
      );
      if (!option) continue;
      for (const [setName, status] of Object.entries(option.sets)) {
        if (status !== "source") continue;
        const tokens = setTokenValues[setName];
        if (!tokens) continue;
        for (const [path, value] of Object.entries(tokens)) {
          merged[path] = {
            value,
            set: setName,
            layer: `${dimension.name} / Base`,
          };
        }
      }
      for (const [setName, status] of Object.entries(option.sets)) {
        if (status !== "enabled") continue;
        const tokens = setTokenValues[setName];
        if (!tokens) continue;
        for (const [path, value] of Object.entries(tokens)) {
          merged[path] = {
            value,
            set: setName,
            layer: `${dimension.name} / Override`,
          };
        }
      }
    }

    const resolveAlias = (value: unknown, depth = 0): unknown => {
      if (depth > 10 || typeof value !== "string") return value;
      const match = /^\{([^}]+)\}$/.exec(value);
      if (!match) return value;
      const target = match[1];
      if (merged[target]) return resolveAlias(merged[target].value, depth + 1);
      return value;
    };

    let entries = Object.entries(merged).map(([path, info]) => ({
      path,
      rawValue: info.value,
      resolvedValue: resolveAlias(info.value),
      set: info.set,
      layer: info.layer,
    }));

    if (previewSearch) {
      const query = previewSearch.toLowerCase();
      entries = entries.filter(
        (entry) =>
          entry.path.toLowerCase().includes(query) ||
          entry.set.toLowerCase().includes(query) ||
          String(entry.resolvedValue).toLowerCase().includes(query),
      );
    }

    return entries.slice(0, 50);
  }, [dimensions, previewSearch, selectedOptions, setTokenValues, showPreview]);

  return (
    <>
      <div className="flex-1 overflow-y-auto">
        {dimensions.length === 0 && !showCreateDim ? (
          <div className="flex flex-col items-center justify-center gap-4 px-5 py-8 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-[var(--color-figma-text-secondary)]"
                aria-hidden="true"
              >
                <rect x="3" y="3" width="18" height="6" rx="1.5" />
                <rect
                  x="3"
                  y="12"
                  width="18"
                  height="6"
                  rx="1.5"
                  opacity="0.5"
                />
              </svg>
            </div>

            <div className="flex flex-col gap-1">
              <p className="text-[12px] font-semibold text-[var(--color-figma-text)]">
                No theme axes yet
              </p>
              <p className="max-w-[240px] text-[11px] leading-relaxed text-[var(--color-figma-text-secondary)]">
                Themes let you switch entire sets of tokens at once — light/dark
                mode, brand variants, or density levels — without duplicating
                values.
              </p>
            </div>

            <div className="w-full max-w-[260px]">
              <p className="mb-2 text-left text-[10px] font-medium uppercase tracking-wide text-[var(--color-figma-text-tertiary)]">
                How themes work
              </p>
              <div className="flex w-full items-start gap-0">
                <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]">
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 2L2 7l10 5 10-5-10-5z" />
                      <path d="M2 17l10 5 10-5" />
                    </svg>
                  </div>
                  <p className="text-center text-[10px] font-medium leading-tight text-[var(--color-figma-text-secondary)]">
                    Add axes
                  </p>
                  <p className="text-center text-[8px] leading-tight text-[var(--color-figma-text-tertiary)]">
                    Theme axes
                  </p>
                </div>
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 8 8"
                  fill="var(--color-figma-text-tertiary)"
                  className="mt-2 shrink-0"
                >
                  <path d="M2 1l4 3-4 3V1z" />
                </svg>
                <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]">
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <path d="M3 9h18M9 21V9" />
                    </svg>
                  </div>
                  <p className="text-center text-[10px] font-medium leading-tight text-[var(--color-figma-text-secondary)]">
                    Map sets
                  </p>
                  <p className="text-center text-[8px] leading-tight text-[var(--color-figma-text-tertiary)]">
                    Per option
                  </p>
                </div>
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 8 8"
                  fill="var(--color-figma-text-tertiary)"
                  className="mt-2 shrink-0"
                >
                  <path d="M2 1l4 3-4 3V1z" />
                </svg>
                <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]">
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                    </svg>
                  </div>
                  <p className="text-center text-[10px] font-medium leading-tight text-[var(--color-figma-text-secondary)]">
                    Switch
                  </p>
                  <p className="text-center text-[8px] leading-tight text-[var(--color-figma-text-tertiary)]">
                    Instantly
                  </p>
                </div>
              </div>
            </div>

            <div className="flex w-full max-w-[260px] flex-col gap-1.5">
              <p className="text-left text-[10px] font-medium uppercase tracking-wide text-[var(--color-figma-text-tertiary)]">
                Quick start
              </p>
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
              or add a custom axis
            </button>

            {resolverAvailable && (
              <div className="mt-1 flex w-full max-w-[260px] flex-col gap-1 border-t border-[var(--color-figma-border)] pt-3">
                <p className="text-left text-[10px] leading-snug text-[var(--color-figma-text-tertiary)]">
                  Need explicit resolution order or cross-dimensional theme
                  logic?
                </p>
                <button
                  onClick={onOpenAdvancedView}
                  className="flex items-center gap-1.5 text-left text-[10px] text-[var(--color-figma-accent)] hover:underline"
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
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                  Open advanced theme logic
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col">
            <div className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]/40 px-3 py-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-[var(--color-figma-text)]">
                      {focusedDimension?.name ?? "Themes"}
                    </span>
                    {focusedOptionName && (
                      <>
                        <span
                          className="text-[10px] text-[var(--color-figma-text-tertiary)]"
                          aria-hidden="true"
                        >
                          →
                        </span>
                        <span className="text-[11px] font-semibold text-[var(--color-figma-text)]">
                          {focusedOptionName}
                        </span>
                      </>
                    )}
                  </div>
                  {focusedPrimaryIssue ? (
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <p className="text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
                        <span className="font-medium">
                          {focusedIssueCount} issue
                          {focusedIssueCount !== 1 ? "s" : ""}:
                        </span>{" "}
                        {focusedPrimaryIssue.recommendedNextAction}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          const target = {
                            dimId: focusedPrimaryIssue.dimensionId,
                            optionName: focusedPrimaryIssue.optionName,
                            preferredSetName:
                              focusedPrimaryIssue.preferredSetName,
                          };
                          if (
                            focusedPrimaryIssue.kind === "stale-set" ||
                            focusedPrimaryIssue.kind === "empty-override"
                          ) {
                            onFocusRoleTarget(target, true);
                          } else {
                            onOpenCoverageView(target, false);
                          }
                        }}
                        className="shrink-0 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[10px] font-medium text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
                      >
                        {focusedPrimaryIssue.kind === "stale-set" ||
                        focusedPrimaryIssue.kind === "empty-override"
                          ? "Edit set roles"
                          : "Review coverage"}
                      </button>
                    </div>
                  ) : (
                    <p className="mt-0.5 text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
                      {focusedDimension
                        ? "No open issues for this option."
                        : "Add axes and options to begin."}
                    </p>
                  )}
                </div>
                <div className="relative shrink-0" ref={secondaryToolsRef}>
                  <button
                    onClick={() => setSecondaryToolsOpen((value) => !value)}
                    aria-expanded={secondaryToolsOpen}
                    aria-haspopup="menu"
                    className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[10px] font-medium transition-colors ${
                      secondaryToolsOpen
                        ? "border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]"
                        : "border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)]/35 hover:text-[var(--color-figma-text)]"
                    }`}
                    title="Open Coverage, Compare, and advanced theme views"
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
                      <line x1="4" y1="21" x2="4" y2="14" />
                      <line x1="4" y1="10" x2="4" y2="3" />
                      <line x1="12" y1="21" x2="12" y2="12" />
                      <line x1="12" y1="8" x2="12" y2="3" />
                      <line x1="20" y1="21" x2="20" y2="16" />
                      <line x1="20" y1="12" x2="20" y2="3" />
                      <line x1="1" y1="14" x2="7" y2="14" />
                      <line x1="9" y1="8" x2="15" y2="8" />
                      <line x1="17" y1="16" x2="23" y2="16" />
                    </svg>
                    <span>Coverage & Compare</span>
                  </button>

                  {secondaryToolsOpen && (
                    <div
                      role="menu"
                      className="absolute right-0 top-full z-50 mt-1 w-[280px] overflow-hidden rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-xl"
                      onKeyDown={(event) => {
                        const container = event.currentTarget;
                        if (
                          !handleMenuArrowKeys(event.nativeEvent, container)
                        ) {
                          if (event.key === "Escape") {
                            event.preventDefault();
                            setSecondaryToolsOpen(false);
                          }
                        }
                      }}
                    >
                      <div className="p-2">
                        <div className="mb-1 px-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-figma-text-tertiary)]">
                          Current context
                        </div>
                        <button
                          role="menuitem"
                          tabIndex={-1}
                          onClick={() => {
                            setSecondaryToolsOpen(false);
                            onOpenCoverageView(
                              {
                                dimId: focusedDimension?.id ?? null,
                                optionName: focusedOptionName ?? null,
                                preferredSetName:
                                  focusedPrimaryIssue?.preferredSetName ?? null,
                              },
                              false,
                            );
                          }}
                          className="flex w-full items-start justify-between gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-[var(--color-figma-bg-hover)]"
                        >
                          <span className="min-w-0">
                            <span className="block text-[10px] font-medium text-[var(--color-figma-text)]">
                              Coverage review
                            </span>
                            <span className="mt-0.5 block text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
                              Review missing values and override gaps for{" "}
                              {focusedContextLabel}.
                            </span>
                          </span>
                          <span className="shrink-0 rounded-full bg-[var(--color-figma-bg-secondary)] px-1.5 py-0.5 text-[9px] leading-none text-[var(--color-figma-text-secondary)]">
                            {focusedIssueCount}
                          </span>
                        </button>
                        <button
                          role="menuitem"
                          tabIndex={-1}
                          onClick={() => {
                            setSecondaryToolsOpen(false);
                            onOpenCoverageView(
                              {
                                dimId: focusedDimension?.id ?? null,
                                optionName: focusedOptionName ?? null,
                                preferredSetName:
                                  focusedPrimaryIssue?.preferredSetName ?? null,
                              },
                              true,
                            );
                          }}
                          className="flex w-full items-start justify-between gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-[var(--color-figma-bg-hover)]"
                        >
                          <span className="min-w-0">
                            <span className="block text-[10px] font-medium text-[var(--color-figma-text)]">
                              Coverage across all axes
                            </span>
                            <span className="mt-0.5 block text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
                              Scan every axis before returning to the workflow
                              to fix the selected option.
                            </span>
                          </span>
                          <span className="shrink-0 rounded-full bg-[var(--color-figma-bg-secondary)] px-1.5 py-0.5 text-[9px] leading-none text-[var(--color-figma-text-secondary)]">
                            {totalIssueCount}
                          </span>
                        </button>
                        <button
                          role="menuitem"
                          tabIndex={-1}
                          disabled={!canCompareThemes}
                          onClick={() => {
                            setSecondaryToolsOpen(false);
                            onOpenCompareView(
                              focusedDimension ?? undefined,
                              focusedOptionName ?? undefined,
                            );
                          }}
                          className="flex w-full items-start justify-between gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-[var(--color-figma-bg-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <span className="min-w-0">
                            <span className="block text-[10px] font-medium text-[var(--color-figma-text)]">
                              Compare options
                            </span>
                            <span className="mt-0.5 block text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
                              Compare the focused axis without crowding the main
                              authoring surface.
                            </span>
                          </span>
                          {canCompareThemes && (
                            <span className="shrink-0 rounded-full bg-[var(--color-figma-bg-secondary)] px-1.5 py-0.5 text-[9px] leading-none text-[var(--color-figma-text-secondary)]">
                              Compare
                            </span>
                          )}
                        </button>
                        {resolverAvailable && (
                          <>
                            <div className="my-1 border-t border-[var(--color-figma-border)]" />
                            <div className="mb-1 px-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-figma-text-tertiary)]">
                              Expert mode
                            </div>
                            <button
                              role="menuitem"
                              tabIndex={-1}
                              onClick={() => {
                                setSecondaryToolsOpen(false);
                                onOpenAdvancedView();
                              }}
                              className="flex w-full items-start justify-between gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-[var(--color-figma-bg-hover)]"
                            >
                              <span className="min-w-0">
                                <span className="block text-[10px] font-medium text-[var(--color-figma-text)]">
                                  Advanced theme logic
                                </span>
                                <span className="mt-0.5 block text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
                                  Open DTCG resolvers for explicit ordering,
                                  modifier contexts, or cross-dimensional logic.
                                </span>
                              </span>
                              <kbd className="shrink-0 rounded border border-[var(--color-figma-border)] px-1 font-mono text-[9px] leading-none text-[var(--color-figma-text-tertiary)]">
                                {adaptShortcut(SHORTCUT_KEYS.GO_TO_RESOLVER)}
                              </kbd>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {dimensions.length > 1 && (
              <div className="flex flex-col gap-1.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]/50 px-3 py-1.5">
                <div className="relative">
                  <svg
                    className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[var(--color-figma-text-tertiary)]"
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
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" />
                  </svg>
                  <input
                    ref={dimSearchRef}
                    type="text"
                    value={dimSearch}
                    onChange={(event) => setDimSearch(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        setDimSearch("");
                        dimSearchRef.current?.blur();
                      }
                    }}
                    placeholder="Filter axes / options…"
                    className="w-full rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] py-1 pl-6 pr-6 text-[11px] text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-tertiary)] focus:focus-visible:border-[var(--color-figma-accent)]"
                  />
                  {dimSearch && (
                    <button
                      onClick={() => {
                        setDimSearch("");
                        dimSearchRef.current?.focus();
                      }}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)]"
                      title="Clear search"
                      aria-label="Clear search"
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
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
                <button
                  onClick={() => setShowOnlyWithGaps((value) => !value)}
                  className={`self-start rounded px-2 py-1 text-[10px] font-medium transition-colors ${
                    showOnlyWithGaps
                      ? "border border-[var(--color-figma-warning)]/30 bg-[var(--color-figma-warning)]/15 text-[var(--color-figma-warning)]"
                      : "text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                  }`}
                  title="Show only axes that have unresolved token gaps"
                >
                  <span className="flex items-center gap-1.5">
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
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    Show only axes with gaps
                  </span>
                </button>
              </div>
            )}

            {dimensions.length > 1 && (
              <div className="flex items-center gap-1 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]/50 px-3 py-1 text-[10px] text-[var(--color-figma-text-tertiary)]">
                <svg
                  width="8"
                  height="8"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
                Higher priority
                <span className="mx-1 flex-1 border-b border-dotted border-[var(--color-figma-border)]" />
                Lower priority
                <svg
                  width="8"
                  height="8"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 5v14M5 12l7 7 7-7" />
                </svg>
              </div>
            )}

            {totalFillableGaps > 0 && (
              <NoticeBanner
                severity="warning"
                actions={
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      onClick={() => {
                        onOpenCoverageView(
                          {
                            dimId:
                              focusedDimension?.id ??
                              firstDimensionWithFillableGaps?.id ??
                              null,
                            optionName: focusedOptionName ?? null,
                            preferredSetName:
                              focusedPrimaryIssue?.preferredSetName ?? null,
                          },
                          true,
                        );
                      }}
                      className="rounded border border-[var(--color-figma-warning)]/35 px-2 py-0.5 text-[10px] font-medium text-[var(--color-figma-warning)] transition-colors hover:bg-[var(--color-figma-warning)]/12"
                      title="Review gap coverage in context"
                    >
                      Review gaps
                    </button>
                    <button
                      onClick={() => {
                        if (firstDimensionWithFillableGaps) {
                          handleAutoFillAllOptions(
                            firstDimensionWithFillableGaps.id,
                          );
                        }
                      }}
                      className="rounded bg-[var(--color-figma-accent)] px-2 py-0.5 text-[10px] font-medium text-white transition-colors hover:bg-[var(--color-figma-accent-hover)]"
                      title={`Auto-fill ${totalFillableGaps} missing token${totalFillableGaps !== 1 ? "s" : ""} — opens confirmation dialog`}
                    >
                      Auto-fill gaps
                    </button>
                  </div>
                }
              >
                <strong>{totalFillableGaps}</strong> gap
                {totalFillableGaps !== 1 ? "s" : ""} can be auto-filled from
                source sets
              </NoticeBanner>
            )}

            <div className="flex flex-col">
              {filteredDimensions.length === 0 &&
                (dimSearch || showOnlyWithGaps) && (
                  <div className="py-6 text-center text-[11px] text-[var(--color-figma-text-tertiary)]">
                    {showOnlyWithGaps && !dimSearch
                      ? "No axes have coverage gaps"
                      : "No axes match your filter"}
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
                const optionSummary = option
                  ? optionRoleSummaries[`${dimension.id}:${option.name}`]
                  : null;
                const dimensionIndex = dimensions.indexOf(dimension);
                const layerNumber = dimensions.length - dimensionIndex;
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
                const isDisabledCollapsed = collapsedDisabled.has(dimension.id);
                const isEditingRoles =
                  editingRoleTarget?.dimId === dimension.id &&
                  editingRoleTarget?.optionName === selectedOption;
                const bulkActionSetName = isEditingRoles
                  ? editingRoleTarget?.setName &&
                    optionSets.includes(editingRoleTarget.setName)
                    ? editingRoleTarget.setName
                    : (optionSets[0] ?? null)
                  : null;
                const bulkActionCounts = bulkActionSetName
                  ? getSetRoleCounts(dimension.id, bulkActionSetName)
                  : null;
                const copySourceOptions = getCopySourceOptions(
                  dimension.id,
                  selectedOption,
                );
                const optionKey = `${dimension.id}:${selectedOption}`;
                const selectedOptionIssues = optionIssues[optionKey] ?? [];
                const hasUncovered = (optionSummary?.uncoveredCount ?? 0) > 0;
                const staleSetNames = optionSummary?.staleSetNames ?? [];
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
                const multiOptionGaps = optionsWithGaps.length > 1;
                const isFillAllOptionsInProgress = fillingKeys.has(
                  `${dimension.id}:__all_options__`,
                );

                return (
                  <div
                    key={dimension.id}
                    ref={(element) => {
                      dimensionRefs.current[dimension.id] = element;
                      if (element && dimension.id === newlyCreatedDim) {
                        element.scrollIntoView({
                          behavior: "smooth",
                          block: "nearest",
                        });
                      }
                    }}
                    draggable
                    onDragStart={(event) =>
                      handleDimDragStart(event, dimension.id)
                    }
                    onDragOver={(event) =>
                      handleDimDragOver(event, dimension.id)
                    }
                    onDrop={() => handleDimDrop(dimension.id)}
                    onDragEnd={handleDimDragEnd}
                    className={`border-b border-[var(--color-figma-border)] transition-opacity ${
                      draggingDimId === dimension.id ? "opacity-40" : ""
                    } ${
                      dragOverDimId === dimension.id &&
                      draggingDimId !== dimension.id
                        ? "ring-2 ring-inset ring-[var(--color-figma-accent)]/50"
                        : ""
                    }`}
                  >
                    <div className="group flex items-center gap-2 bg-[var(--color-figma-bg-secondary)] px-3 py-1.5">
                      {dimensions.length > 1 && (
                        <span
                          className="shrink-0 select-none text-[var(--color-figma-text-tertiary)] opacity-20 transition-opacity group-hover:opacity-60 hover:!opacity-100"
                          title="Drag to reorder axis"
                          aria-hidden="true"
                        >
                          <svg
                            width="8"
                            height="12"
                            viewBox="0 0 8 12"
                            fill="currentColor"
                          >
                            <circle cx="2" cy="2" r="1.2" />
                            <circle cx="6" cy="2" r="1.2" />
                            <circle cx="2" cy="6" r="1.2" />
                            <circle cx="6" cy="6" r="1.2" />
                            <circle cx="2" cy="10" r="1.2" />
                            <circle cx="6" cy="10" r="1.2" />
                          </svg>
                        </span>
                      )}
                      <span
                        className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-[var(--color-figma-accent)]/10 text-[10px] font-bold text-[var(--color-figma-accent)]"
                        title={`Axis ${layerNumber} — ${
                          dimensionIndex === 0
                            ? "highest"
                            : dimensionIndex === dimensions.length - 1
                              ? "lowest"
                              : ""
                        } priority`}
                      >
                        {layerNumber}
                      </span>

                      {renameDim === dimension.id ? (
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={renameValue}
                              onChange={(event) =>
                                setRenameValue(event.target.value)
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Enter") executeRenameDim();
                                else if (event.key === "Escape")
                                  cancelRenameDim();
                              }}
                              className={`flex-1 rounded border bg-[var(--color-figma-bg)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)] ${
                                renameError
                                  ? "border-[var(--color-figma-error)]"
                                  : "border-[var(--color-figma-border)]"
                              }`}
                              autoFocus
                            />
                            <button
                              onClick={executeRenameDim}
                              disabled={!renameValue.trim()}
                              className="rounded bg-[var(--color-figma-accent)] px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
                            >
                              Save
                            </button>
                            <button
                              onClick={cancelRenameDim}
                              className="rounded px-1.5 py-0.5 text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                            >
                              Cancel
                            </button>
                          </div>
                          {renameError && (
                            <NoticeFieldMessage severity="error">
                              {renameError}
                            </NoticeFieldMessage>
                          )}
                        </div>
                      ) : (
                        <>
                          <div className="flex min-w-0 flex-1 items-center gap-1">
                            <span
                              className="truncate text-[11px] font-medium text-[var(--color-figma-text)]"
                              title={dimension.name}
                            >
                              {dimension.name}
                            </span>
                            {totalDimensionGaps > 0 && (
                              <NoticeCountBadge
                                severity="warning"
                                count={totalDimensionGaps}
                                title={`${totalDimensionGaps} coverage gap${
                                  totalDimensionGaps !== 1 ? "s" : ""
                                } across ${optionsWithGaps.length} option${
                                  optionsWithGaps.length !== 1 ? "s" : ""
                                }`}
                                className="min-w-[16px] shrink-0 px-1"
                              />
                            )}
                            <button
                              onClick={() =>
                                startRenameDim(dimension.id, dimension.name)
                              }
                              className="shrink-0 rounded p-0.5 text-[var(--color-figma-text-secondary)] opacity-20 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 hover:bg-[var(--color-figma-bg-hover)]"
                              title="Rename axis"
                              aria-label="Rename axis"
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
                                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                          </div>
                          {dimensions.length > 1 && (
                            <div className="flex shrink-0 items-center gap-0 opacity-20 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
                              <button
                                onClick={() =>
                                  handleMoveDimension(dimension.id, "up")
                                }
                                disabled={dimensionIndex === 0}
                                className="rounded p-0.5 text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] disabled:pointer-events-none disabled:opacity-25"
                                title="Move axis up"
                                aria-label="Move axis up"
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
                                  <path d="M18 15l-6-6-6 6" />
                                </svg>
                              </button>
                              <button
                                onClick={() =>
                                  handleMoveDimension(dimension.id, "down")
                                }
                                disabled={
                                  dimensionIndex === dimensions.length - 1
                                }
                                className="rounded p-0.5 text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] disabled:pointer-events-none disabled:opacity-25"
                                title="Move axis down"
                                aria-label="Move axis down"
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
                                  <path d="M6 9l6 6 6-6" />
                                </svg>
                              </button>
                            </div>
                          )}
                          {onGenerateForDimension && (
                            <button
                              onClick={() => {
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
                              }}
                              className="flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-medium text-[var(--color-figma-accent)] opacity-40 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 hover:bg-[var(--color-figma-accent)]/10"
                              title={`Generate tokens for ${dimension.name} axis`}
                              aria-label={`Generate tokens for ${dimension.name} axis`}
                            >
                              <svg
                                width="9"
                                height="9"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                              </svg>
                              Generate
                            </button>
                          )}
                          <button
                            onClick={() =>
                              handleDuplicateDimension(dimension.id)
                            }
                            disabled={isDuplicatingDim}
                            className="shrink-0 rounded p-1 text-[var(--color-figma-text-secondary)] opacity-20 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 hover:bg-[var(--color-figma-bg-hover)] disabled:pointer-events-none disabled:opacity-25"
                            title="Duplicate axis"
                            aria-label="Duplicate axis"
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
                              <rect
                                x="9"
                                y="9"
                                width="13"
                                height="13"
                                rx="2"
                                ry="2"
                              />
                              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                            </svg>
                          </button>
                          <button
                            onClick={() => openDeleteConfirm(dimension.id)}
                            className="shrink-0 rounded p-1 text-[var(--color-figma-error)] opacity-20 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 hover:bg-[var(--color-figma-error)]/20"
                            title="Delete axis"
                            aria-label="Delete axis"
                          >
                            <svg
                              width="10"
                              height="10"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                            </svg>
                          </button>
                        </>
                      )}
                    </div>

                    {dimension.options.length > 0 && (
                      <div className="relative flex items-stretch border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
                        {tabScrollState[dimension.id]?.left && (
                          <button
                            onClick={() => {
                              const element =
                                tabScrollRefs.current[dimension.id];
                              element?.scrollBy({
                                left: -120,
                                behavior: "smooth",
                              });
                            }}
                            className="absolute bottom-0 left-0 top-0 z-10 flex items-center bg-gradient-to-r from-[var(--color-figma-bg)] to-transparent px-0.5 text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)]"
                            aria-label="Scroll tabs left"
                          >
                            <svg
                              width="8"
                              height="8"
                              viewBox="0 0 8 8"
                              fill="currentColor"
                              aria-hidden="true"
                            >
                              <path d="M6 1L2 4l4 3V1z" />
                            </svg>
                          </button>
                        )}
                        <div
                          ref={(element) => {
                            tabScrollRefs.current[dimension.id] = element;
                          }}
                          className="flex items-center gap-0 overflow-x-auto px-2 pb-0 pt-1"
                          style={{
                            scrollbarWidth: "none",
                            msOverflowStyle: "none",
                          }}
                        >
                          {dimension.options.map((item: ThemeOption) => {
                            const optionMatches =
                              dimSearch.trim() !== "" &&
                              item.name
                                .toLowerCase()
                                .includes(dimSearch.trim().toLowerCase());
                            const summary =
                              optionRoleSummaries[
                                `${dimension.id}:${item.name}`
                              ];
                            const unresolvedCount =
                              summary?.uncoveredCount ?? 0;
                            const missingOverrideCount =
                              summary?.missingOverrideCount ?? 0;
                            const isSelected = selectedOption === item.name;
                            const diffCount = isSelected
                              ? 0
                              : (optionDiffCounts[
                                  `${dimension.id}/${item.name}`
                                ] ?? 0);
                            const isBeingDragged =
                              draggingOpt?.dimId === dimension.id &&
                              draggingOpt?.optionName === item.name;
                            const isDragTarget =
                              dragOverOpt?.dimId === dimension.id &&
                              dragOverOpt?.optionName === item.name &&
                              draggingOpt?.optionName !== item.name;
                            return (
                              <button
                                key={item.name}
                                draggable={dimension.options.length > 1}
                                onDragStart={(event) =>
                                  handleOptDragStart(
                                    event,
                                    dimension.id,
                                    item.name,
                                  )
                                }
                                onDragOver={(event) =>
                                  handleOptDragOver(
                                    event,
                                    dimension.id,
                                    item.name,
                                  )
                                }
                                onDrop={(event) =>
                                  handleOptDrop(event, dimension.id, item.name)
                                }
                                onDragEnd={handleOptDragEnd}
                                onClick={() =>
                                  onSelectOption(dimension.id, item.name)
                                }
                                className={`relative flex shrink-0 items-center gap-1 rounded-t px-2.5 py-1 text-[10px] font-medium transition-colors ${
                                  isSelected
                                    ? "bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-accent)]"
                                    : "text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
                                }${optionMatches ? " rounded ring-1 ring-[var(--color-figma-accent)]/40" : ""}${isBeingDragged ? " opacity-40" : ""}${isDragTarget ? " ring-2 ring-[var(--color-figma-accent)]/60" : ""}${dimension.options.length > 1 ? " cursor-grab active:cursor-grabbing" : ""}`}
                              >
                                {item.name}
                                {!isSelected && diffCount > 0 && (
                                  <span
                                    className="inline-flex min-w-[14px] items-center justify-center rounded-full bg-[var(--color-figma-text-tertiary)]/20 px-0.5 text-[9px] font-bold leading-none text-[var(--color-figma-text-tertiary)]"
                                    title={`${diffCount} token${diffCount !== 1 ? "s" : ""} differ from ${selectedOption}`}
                                  >
                                    {diffCount}
                                  </span>
                                )}
                                {unresolvedCount > 0 && (
                                  <NoticeCountBadge
                                    severity="warning"
                                    count={unresolvedCount}
                                    title={`${unresolvedCount} unresolved alias${
                                      unresolvedCount !== 1 ? "es" : ""
                                    }`}
                                  />
                                )}
                                {missingOverrideCount > 0 && (
                                  <span
                                    className="inline-flex min-w-[14px] items-center justify-center rounded-full bg-violet-500/15 px-0.5 text-[9px] font-bold leading-none text-violet-600"
                                    title={`${missingOverrideCount} Base token${
                                      missingOverrideCount !== 1 ? "s" : ""
                                    } not overridden`}
                                  >
                                    {missingOverrideCount}
                                  </span>
                                )}
                                {isSelected && (
                                  <span className="absolute bottom-0 left-1 right-1 h-[2px] rounded-t bg-[var(--color-figma-accent)]" />
                                )}
                              </button>
                            );
                          })}
                          {!showAddOption[dimension.id] && (
                            <button
                              onClick={() =>
                                setShowAddOption((current) => ({
                                  ...current,
                                  [dimension.id]: true,
                                }))
                              }
                              className="shrink-0 px-1.5 py-1 text-[10px] text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)]"
                              title="Add option"
                            >
                              +
                            </button>
                          )}
                        </div>
                        {tabScrollState[dimension.id]?.right && (
                          <button
                            onClick={() => {
                              const element =
                                tabScrollRefs.current[dimension.id];
                              element?.scrollBy({
                                left: 120,
                                behavior: "smooth",
                              });
                            }}
                            className="absolute bottom-0 right-0 top-0 z-10 flex items-center bg-gradient-to-l from-[var(--color-figma-bg)] to-transparent px-0.5 text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)]"
                            aria-label="Scroll tabs right"
                          >
                            <svg
                              width="8"
                              height="8"
                              viewBox="0 0 8 8"
                              fill="currentColor"
                              aria-hidden="true"
                            >
                              <path d="M2 1l4 3-4 3V1z" />
                            </svg>
                          </button>
                        )}
                      </div>
                    )}

                    {(showAddOption[dimension.id] ||
                      dimension.options.length === 0) && (
                      <div className="border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-1.5">
                        <div className="flex items-center gap-1">
                          <input
                            ref={(element) => {
                              addOptionInputRefs.current[dimension.id] =
                                element;
                            }}
                            type="text"
                            value={newOptionNames[dimension.id] || ""}
                            onChange={(event) => {
                              setNewOptionNames((current) => ({
                                ...current,
                                [dimension.id]: event.target.value,
                              }));
                              setAddOptionErrors((current) => ({
                                ...current,
                                [dimension.id]: "",
                              }));
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter")
                                handleAddOption(dimension.id);
                              if (event.key === "Escape") {
                                setShowAddOption((current) => ({
                                  ...current,
                                  [dimension.id]: false,
                                }));
                                setNewOptionNames((current) => ({
                                  ...current,
                                  [dimension.id]: "",
                                }));
                                setCopyFromNewOption((current) => ({
                                  ...current,
                                  [dimension.id]: "",
                                }));
                              }
                            }}
                            placeholder={
                              dimension.options.length === 0
                                ? "First option (e.g. Light, Dark)"
                                : "Option name"
                            }
                            className={`flex-1 rounded border bg-[var(--color-figma-bg)] px-1.5 py-0.5 text-[10px] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)] ${
                              addOptionErrors[dimension.id]
                                ? "border-[var(--color-figma-error)]"
                                : "border-[var(--color-figma-border)]"
                            }`}
                            autoFocus
                          />
                          <button
                            onClick={() => handleAddOption(dimension.id)}
                            disabled={!newOptionNames[dimension.id]?.trim()}
                            className="rounded bg-[var(--color-figma-accent)] px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
                          >
                            Add
                          </button>
                          {dimension.options.length > 0 && (
                            <button
                              onClick={() => {
                                setShowAddOption((current) => ({
                                  ...current,
                                  [dimension.id]: false,
                                }));
                                setNewOptionNames((current) => ({
                                  ...current,
                                  [dimension.id]: "",
                                }));
                                setCopyFromNewOption((current) => ({
                                  ...current,
                                  [dimension.id]: "",
                                }));
                              }}
                              className="rounded px-1.5 py-0.5 text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                        {dimension.options.length > 0 && (
                          <div className="mt-1 flex items-center gap-1">
                            <span className="shrink-0 text-[9px] text-[var(--color-figma-text-tertiary)]">
                              Copy assignments from:
                            </span>
                            <select
                              value={copyFromNewOption[dimension.id] || ""}
                              onChange={(event) =>
                                setCopyFromNewOption((current) => ({
                                  ...current,
                                  [dimension.id]: event.target.value,
                                }))
                              }
                              className="flex-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-1 py-0.5 text-[9px] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)]"
                            >
                              <option value="">None (start empty)</option>
                              {dimension.options.map((item: ThemeOption) => (
                                <option key={item.name} value={item.name}>
                                  {item.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                        {addOptionErrors[dimension.id] && (
                          <NoticeFieldMessage severity="error" className="mt-1">
                            {addOptionErrors[dimension.id]}
                          </NoticeFieldMessage>
                        )}
                      </div>
                    )}

                    {!multiOptionGaps && totalDimensionFillable > 0 && (
                      <NoticeBanner
                        severity="warning"
                        className="border-b-0 border-t"
                        actions={
                          <button
                            onClick={() => {
                              if (optionsWithGaps[0]) {
                                handleAutoFillAll(
                                  dimension.id,
                                  optionsWithGaps[0].name,
                                );
                              }
                            }}
                            disabled={fillingKeys.has(
                              `${dimension.id}:${optionsWithGaps[0]?.name}:__all__`,
                            )}
                            className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                            title={`Auto-fill ${totalDimensionFillable} token${
                              totalDimensionFillable !== 1 ? "s" : ""
                            } from source sets`}
                          >
                            {fillingKeys.has(
                              `${dimension.id}:${optionsWithGaps[0]?.name}:__all__`,
                            )
                              ? "Filling…"
                              : `Fill from source (${totalDimensionFillable})`}
                          </button>
                        }
                      >
                        {totalDimensionFillable} gap
                        {totalDimensionFillable !== 1 ? "s" : ""} in "
                        {optionsWithGaps[0]?.name}"
                      </NoticeBanner>
                    )}

                    {multiOptionGaps && totalDimensionFillable > 0 && (
                      <NoticeBanner
                        severity="warning"
                        className="border-b-0 border-t"
                        actions={
                          <button
                            onClick={() =>
                              handleAutoFillAllOptions(dimension.id)
                            }
                            disabled={isFillAllOptionsInProgress}
                            className="rounded bg-[var(--color-figma-accent)] px-1.5 py-0.5 text-[10px] font-medium text-white transition-colors hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50"
                            title={`Auto-fill ${totalDimensionFillable} missing token${
                              totalDimensionFillable !== 1 ? "s" : ""
                            } across all options`}
                          >
                            {isFillAllOptionsInProgress
                              ? "Filling…"
                              : `Fill all options (${totalDimensionFillable})`}
                          </button>
                        }
                      >
                        {totalDimensionGaps} gaps across{" "}
                        {optionsWithGaps.length} options
                      </NoticeBanner>
                    )}

                    {option && (
                      <div className="bg-[var(--color-figma-bg-secondary)]">
                        <div className="flex items-center justify-between border-t border-[var(--color-figma-border)] px-3 py-1">
                          {renameOption?.dimId === dimension.id &&
                          renameOption?.optionName === option.name ? (
                            <div className="flex flex-1 flex-col gap-1">
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={renameOptionValue}
                                  onChange={(event) => {
                                    setRenameOptionValue(event.target.value);
                                    setRenameOptionError(null);
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter")
                                      executeRenameOption();
                                    else if (event.key === "Escape")
                                      cancelRenameOption();
                                  }}
                                  className={`flex-1 rounded border bg-[var(--color-figma-bg)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)] ${
                                    renameOptionError
                                      ? "border-[var(--color-figma-error)]"
                                      : "border-[var(--color-figma-border)]"
                                  }`}
                                  autoFocus
                                />
                                <button
                                  onClick={executeRenameOption}
                                  disabled={!renameOptionValue.trim()}
                                  className="rounded bg-[var(--color-figma-accent)] px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={cancelRenameOption}
                                  className="rounded px-1.5 py-0.5 text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                                >
                                  Cancel
                                </button>
                              </div>
                              {renameOptionError && (
                                <NoticeFieldMessage severity="error">
                                  {renameOptionError}
                                </NoticeFieldMessage>
                              )}
                            </div>
                          ) : (
                            <>
                              <div className="flex flex-wrap items-center gap-1">
                                {hasUncovered && (
                                  <NoticePill
                                    severity="warning"
                                    title={`${optionSummary?.uncoveredCount ?? 0} tokens have no value in active sets`}
                                  >
                                    {optionSummary?.uncoveredCount ?? 0} gaps
                                  </NoticePill>
                                )}
                                {(optionSummary?.missingOverrideCount ?? 0) >
                                  0 && (
                                  <NoticePill
                                    severity="info"
                                    title={`${optionSummary?.missingOverrideCount ?? 0} tokens are missing from the override layer`}
                                    className="border-violet-500/30 bg-violet-500/10 text-violet-600"
                                  >
                                    {optionSummary?.missingOverrideCount}{" "}
                                    missing override
                                    {optionSummary?.missingOverrideCount === 1
                                      ? ""
                                      : "s"}
                                  </NoticePill>
                                )}
                                {(optionSummary?.emptyOverrideCount ?? 0) >
                                  0 && (
                                  <NoticePill
                                    severity="warning"
                                    title={`${optionSummary?.emptyOverrideCount ?? 0} override set${
                                      optionSummary?.emptyOverrideCount === 1
                                        ? ""
                                        : "s"
                                    } contain no tokens`}
                                  >
                                    {optionSummary?.emptyOverrideCount} empty
                                    override
                                    {optionSummary?.emptyOverrideCount === 1
                                      ? ""
                                      : "s"}
                                  </NoticePill>
                                )}
                                {staleSetNames.length > 0 && (
                                  <NoticePill
                                    severity="error"
                                    title={`${staleSetNames.length} set${
                                      staleSetNames.length !== 1 ? "s" : ""
                                    } referenced here no longer exist`}
                                  >
                                    {staleSetNames.length} stale
                                  </NoticePill>
                                )}
                              </div>
                              <div className="flex items-center gap-0.5">
                                {sets.length > 0 &&
                                  (isEditingRoles ? (
                                    <button
                                      onClick={() =>
                                        closeRoleEditor(
                                          dimension.id,
                                          option.name,
                                        )
                                      }
                                      className="rounded border border-[var(--color-figma-accent)]/30 bg-[var(--color-figma-accent)]/10 px-2 py-1 text-[10px] font-medium text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/15"
                                      title={`Finish editing roles for ${option.name}`}
                                    >
                                      Done
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => {
                                        openRoleEditor(
                                          dimension.id,
                                          option.name,
                                          overrideSets[0] ??
                                            foundationSets[0] ??
                                            disabledSets[0] ??
                                            null,
                                        );
                                        scrollToSetRoles(
                                          dimension.id,
                                          option.name,
                                        );
                                      }}
                                      className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[10px] font-medium text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
                                      title={`Edit set roles for ${option.name}`}
                                    >
                                      Edit roles
                                    </button>
                                  ))}
                                {dimension.options.length > 1 && (
                                  <>
                                    <button
                                      onClick={() =>
                                        handleMoveOption(
                                          dimension.id,
                                          option.name,
                                          "up",
                                        )
                                      }
                                      disabled={
                                        dimension.options.indexOf(option) === 0
                                      }
                                      className="rounded p-1.5 text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] disabled:pointer-events-none disabled:opacity-25"
                                      title="Move option left"
                                      aria-label="Move option left"
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
                                        <path d="M15 18l-6-6 6-6" />
                                      </svg>
                                    </button>
                                    <button
                                      onClick={() =>
                                        handleMoveOption(
                                          dimension.id,
                                          option.name,
                                          "down",
                                        )
                                      }
                                      disabled={
                                        dimension.options.indexOf(option) ===
                                        dimension.options.length - 1
                                      }
                                      className="rounded p-1.5 text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] disabled:pointer-events-none disabled:opacity-25"
                                      title="Move option right"
                                      aria-label="Move option right"
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
                                        <path d="M9 18l6-6-6-6" />
                                      </svg>
                                    </button>
                                  </>
                                )}
                                <button
                                  onClick={() =>
                                    startRenameOption(dimension.id, option.name)
                                  }
                                  className="rounded p-1.5 text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                                  title="Rename option"
                                  aria-label="Rename option"
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
                                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() =>
                                    handleDuplicateOption(
                                      dimension.id,
                                      option.name,
                                    )
                                  }
                                  className="rounded p-1.5 text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                                  title="Duplicate option"
                                  aria-label="Duplicate option"
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
                                    <rect
                                      x="9"
                                      y="9"
                                      width="13"
                                      height="13"
                                      rx="2"
                                      ry="2"
                                    />
                                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() =>
                                    setOptionDeleteConfirm({
                                      dimId: dimension.id,
                                      optionName: option.name,
                                    })
                                  }
                                  className="rounded p-1.5 text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/20"
                                  title="Delete option"
                                  aria-label="Delete option"
                                >
                                  <svg
                                    width="10"
                                    height="10"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                  >
                                    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                                  </svg>
                                </button>
                              </div>
                            </>
                          )}
                        </div>

                        {sets.length > 0 && (
                          <div
                            ref={(element) => {
                              setRoleRefs.current[
                                `${dimension.id}:${option.name}`
                              ] = element;
                            }}
                            className="border-t border-[var(--color-figma-border)]"
                          >
                            <div className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]/40 px-3 py-2">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="text-[10px] font-semibold text-[var(--color-figma-text)]">
                                    Set role summary
                                  </div>
                                  <div className="mt-0.5 text-[9px] text-[var(--color-figma-text-secondary)]">
                                    {optionSummary?.isUnmapped
                                      ? "Assign at least one Base or Override set to activate this option."
                                      : optionSummary?.hasAssignmentIssues
                                        ? "Clean up stale or empty assignments before relying on this option in preview."
                                        : optionSummary?.hasCoverageIssues
                                          ? "Role assignments are in place. Use the issue handoff below to review the remaining coverage work."
                                          : "Base sets provide defaults, Override sets win on conflicts, and Excluded sets stay out of the resolved output."}
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-1">
                                  {optionSummary?.isUnmapped && (
                                    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-figma-accent)]/30 bg-[var(--color-figma-accent)]/10 px-1.5 py-0.5 text-[9px] font-medium text-[var(--color-figma-accent)]">
                                      Assign roles
                                    </span>
                                  )}
                                  {(optionSummary?.emptyOverrideCount ?? 0) >
                                    0 && (
                                    <NoticePill severity="warning">
                                      {optionSummary?.emptyOverrideCount} empty
                                      override
                                      {optionSummary?.emptyOverrideCount === 1
                                        ? ""
                                        : "s"}
                                    </NoticePill>
                                  )}
                                  {staleSetNames.length > 0 && (
                                    <NoticePill severity="error">
                                      {staleSetNames.length} stale set
                                      {staleSetNames.length === 1 ? "" : "s"}
                                    </NoticePill>
                                  )}
                                  {(optionSummary?.coverageIssueCount ?? 0) >
                                    0 && (
                                    <NoticePill severity="warning">
                                      {optionSummary?.coverageIssueCount}{" "}
                                      coverage issue
                                      {optionSummary?.coverageIssueCount === 1
                                        ? ""
                                        : "s"}
                                    </NoticePill>
                                  )}
                                </div>
                              </div>
                              <div className="mt-2 grid grid-cols-3 gap-1.5">
                                {[
                                  {
                                    label: "Base",
                                    count: optionSummary?.baseCount ?? 0,
                                    toneClass:
                                      "border-[var(--color-figma-accent)]/25 bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]",
                                    description: "Default token values",
                                  },
                                  {
                                    label: "Override",
                                    count: optionSummary?.overrideCount ?? 0,
                                    toneClass:
                                      "border-[var(--color-figma-success)]/25 bg-[var(--color-figma-success)]/10 text-[var(--color-figma-success)]",
                                    description: "Wins on conflicts",
                                  },
                                  {
                                    label: "Excluded",
                                    count: optionSummary?.excludedCount ?? 0,
                                    toneClass:
                                      "border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)]",
                                    description: "Ignored in output",
                                  },
                                ].map((card) => (
                                  <div
                                    key={card.label}
                                    className={`rounded border px-2 py-1 ${card.toneClass}`}
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-[9px] font-semibold">
                                        {card.label}
                                      </span>
                                      <span className="text-[11px] font-bold leading-none">
                                        {card.count}
                                      </span>
                                    </div>
                                    <div className="mt-0.5 text-[8px] leading-tight opacity-80">
                                      {card.description}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                            {selectedOptionIssues.length > 0 && (
                              <div className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-2">
                                <div className="text-[10px] font-semibold text-[var(--color-figma-text)]">
                                  Issue handoff
                                </div>
                                <div className="mt-1 flex flex-col gap-1.5">
                                  {selectedOptionIssues.map((issue) =>
                                    renderIssueEntry(issue, "authoring"),
                                  )}
                                </div>
                              </div>
                            )}
                            {isEditingRoles && (
                              <div className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-2">
                                <div className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]/30 px-2.5 py-2">
                                  <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <div className="text-[10px] font-semibold text-[var(--color-figma-text)]">
                                        Bulk actions
                                      </div>
                                      <p className="mt-0.5 text-[9px] text-[var(--color-figma-text-secondary)]">
                                        Role buttons stay on the rows below.
                                        Apply broader updates here for{" "}
                                        <strong>{option.name}</strong>.
                                      </p>
                                    </div>
                                    <div className="min-w-[148px]">
                                      <label className="text-[9px] font-medium text-[var(--color-figma-text-tertiary)]">
                                        Focused set
                                      </label>
                                      <select
                                        value={bulkActionSetName ?? ""}
                                        onChange={(event) =>
                                          setRoleEditorSetName(
                                            dimension.id,
                                            option.name,
                                            event.target.value,
                                          )
                                        }
                                        className="mt-1 w-full rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[10px] text-[var(--color-figma-text)]"
                                      >
                                        {optionSets.map((setName) => (
                                          <option key={setName} value={setName}>
                                            {setName}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                  {bulkActionSetName && bulkActionCounts && (
                                    <div className="mt-2 flex flex-col gap-2 border-t border-[var(--color-figma-border)] pt-2">
                                      <div className="flex flex-col gap-1">
                                        <span className="text-[9px] font-medium text-[var(--color-figma-text-tertiary)]">
                                          Apply “{bulkActionSetName}” across
                                          every option in this axis
                                        </span>
                                        <div className="flex flex-wrap gap-1">
                                          {roleStates.map((nextState) => (
                                            <button
                                              key={`bulk-set-${nextState}`}
                                              type="button"
                                              onClick={() =>
                                                handleBulkSetState(
                                                  dimension.id,
                                                  bulkActionSetName,
                                                  nextState,
                                                )
                                              }
                                              className={`min-h-6 rounded border px-2 py-1 text-[9px] font-medium ${
                                                nextState === "source"
                                                  ? "border-[var(--color-figma-accent)]/20 bg-[var(--color-figma-accent)]/8 text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/12"
                                                  : nextState === "enabled"
                                                    ? "border-[var(--color-figma-success)]/20 bg-[var(--color-figma-success)]/8 text-[var(--color-figma-success)] hover:bg-[var(--color-figma-success)]/12"
                                                    : "border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                                              }`}
                                            >
                                              {STATE_LABELS[nextState]} (
                                              {bulkActionCounts[nextState]})
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                      <div className="flex flex-col gap-1">
                                        <span className="text-[9px] font-medium text-[var(--color-figma-text-tertiary)]">
                                          Set every available set in{" "}
                                          {option.name}
                                        </span>
                                        <div className="flex flex-wrap gap-1">
                                          {roleStates.map((nextState) => (
                                            <button
                                              key={`bulk-option-${nextState}`}
                                              type="button"
                                              onClick={() =>
                                                handleBulkSetAllInOption(
                                                  dimension.id,
                                                  option.name,
                                                  nextState,
                                                )
                                              }
                                              className={`min-h-6 rounded border px-2 py-1 text-[9px] font-medium ${
                                                nextState === "source"
                                                  ? "border-[var(--color-figma-accent)]/20 bg-[var(--color-figma-accent)]/8 text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/12"
                                                  : nextState === "enabled"
                                                    ? "border-[var(--color-figma-success)]/20 bg-[var(--color-figma-success)]/8 text-[var(--color-figma-success)] hover:bg-[var(--color-figma-success)]/12"
                                                    : "border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                                              }`}
                                            >
                                              {STATE_LABELS[nextState]}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                      <div className="flex flex-col gap-1">
                                        <span className="text-[9px] font-medium text-[var(--color-figma-text-tertiary)]">
                                          Copy role assignments from another
                                          option
                                        </span>
                                        {copySourceOptions.length > 0 ? (
                                          <div className="flex flex-wrap gap-1">
                                            {copySourceOptions.map(
                                              (sourceOptionName) => (
                                                <button
                                                  key={sourceOptionName}
                                                  type="button"
                                                  onClick={() =>
                                                    handleCopyAssignmentsFrom(
                                                      dimension.id,
                                                      option.name,
                                                      sourceOptionName,
                                                    )
                                                  }
                                                  className="min-h-6 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[9px] font-medium text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
                                                >
                                                  {sourceOptionName}
                                                </button>
                                              ),
                                            )}
                                          </div>
                                        ) : (
                                          <p className="text-[9px] text-[var(--color-figma-text-tertiary)]">
                                            Add another option before copying
                                            assignments.
                                          </p>
                                        )}
                                      </div>
                                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-figma-border)] pt-2">
                                        <p className="text-[9px] text-[var(--color-figma-text-secondary)]">
                                          Need a dedicated override set for{" "}
                                          <strong>{bulkActionSetName}</strong>?
                                        </p>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setCreateOverrideSet({
                                              dimId: dimension.id,
                                              setName: bulkActionSetName,
                                              optName: option.name,
                                            })
                                          }
                                          className="min-h-6 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[9px] font-medium text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
                                        >
                                          Create override set from focused set
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                            {overrideSets.length > 0 && (
                              <div>
                                <div className="flex items-center gap-1 bg-[var(--color-figma-success)]/5 px-3 py-0.5 text-[10px] font-medium text-[var(--color-figma-success)]">
                                  <svg
                                    width="8"
                                    height="8"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    aria-hidden="true"
                                  >
                                    <path d="M12 19V5M5 12l7-7 7 7" />
                                  </svg>
                                  Override (
                                  {optionSummary?.overrideCount ??
                                    overrideSets.length}
                                  )
                                  <span className="ml-1 font-normal text-[var(--color-figma-text-tertiary)]">
                                    highest priority
                                  </span>
                                </div>
                                {overrideSets.map((setName) =>
                                  renderSetRow(
                                    dimension,
                                    option,
                                    setName,
                                    "enabled",
                                    isEditingRoles,
                                    bulkActionSetName === setName,
                                  ),
                                )}
                              </div>
                            )}
                            {foundationSets.length > 0 && (
                              <div>
                                <div className="flex items-center gap-1 bg-[var(--color-figma-accent)]/5 px-3 py-0.5 text-[10px] font-medium text-[var(--color-figma-accent)]">
                                  <svg
                                    width="8"
                                    height="8"
                                    viewBox="0 0 24 24"
                                    fill="currentColor"
                                    aria-hidden="true"
                                  >
                                    <rect
                                      x="2"
                                      y="2"
                                      width="20"
                                      height="20"
                                      rx="3"
                                      opacity="0.3"
                                    />
                                  </svg>
                                  Base (
                                  {optionSummary?.baseCount ??
                                    foundationSets.length}
                                  )
                                  <span className="ml-1 font-normal text-[var(--color-figma-text-tertiary)]">
                                    default values
                                  </span>
                                </div>
                                {foundationSets.map((setName) =>
                                  renderSetRow(
                                    dimension,
                                    option,
                                    setName,
                                    "source",
                                    isEditingRoles,
                                    bulkActionSetName === setName,
                                  ),
                                )}
                              </div>
                            )}
                            {disabledSets.length > 0 && (
                              <div>
                                <button
                                  onClick={() =>
                                    setCollapsedDisabled((current) => {
                                      const next = new Set(current);
                                      if (next.has(dimension.id))
                                        next.delete(dimension.id);
                                      else next.add(dimension.id);
                                      return next;
                                    })
                                  }
                                  className="w-full px-3 py-0.5 text-left text-[10px] font-medium text-[var(--color-figma-text-tertiary)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
                                  title={STATE_DESCRIPTIONS.disabled}
                                >
                                  <span className="flex items-center gap-1">
                                    <svg
                                      width="8"
                                      height="8"
                                      viewBox="0 0 8 8"
                                      fill="currentColor"
                                      className={`transition-transform ${
                                        isDisabledCollapsed ? "" : "rotate-90"
                                      }`}
                                      aria-hidden="true"
                                    >
                                      <path d="M2 1l4 3-4 3V1z" />
                                    </svg>
                                    Excluded (
                                    {optionSummary?.excludedCount ??
                                      disabledSets.length}
                                    )
                                  </span>
                                </button>
                                {!isDisabledCollapsed &&
                                  disabledSets.map((setName) =>
                                    renderSetRow(
                                      dimension,
                                      option,
                                      setName,
                                      "disabled",
                                      isEditingRoles,
                                      bulkActionSetName === setName,
                                    ),
                                  )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {dimSearch && filteredDimensions.length === 0 && (
                <div className="px-3 py-4 text-center text-[11px] text-[var(--color-figma-text-tertiary)]">
                  No dimensions or options matching &ldquo;{dimSearch}&rdquo;
                </div>
              )}
              {dimSearch &&
                filteredDimensions.length > 0 &&
                filteredDimensions.length < dimensions.length && (
                  <div className="px-3 py-1 text-center text-[10px] text-[var(--color-figma-text-tertiary)]">
                    Showing {filteredDimensions.length} of {dimensions.length}{" "}
                    axes
                  </div>
                )}
            </div>

            {showPreview && dimensions.length > 0 && (
              <div
                ref={previewSectionRef}
                className="border-t-2 border-[var(--color-figma-accent)]/30"
              >
                <div className="flex items-center justify-between bg-[var(--color-figma-bg-secondary)] px-3 py-1.5">
                  <div className="flex items-center gap-1.5 text-[10px] font-medium text-[var(--color-figma-text)]">
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--color-figma-accent)"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                    Token Resolution Preview
                  </div>
                  <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">
                    {dimensions
                      .map((dimension) => {
                        const optionName = selectedOptions[dimension.id];
                        return optionName
                          ? `${dimension.name}: ${optionName}`
                          : null;
                      })
                      .filter(Boolean)
                      .join(" + ")}
                  </span>
                </div>
                <div className="border-t border-[var(--color-figma-border)] px-3 py-1">
                  <input
                    ref={previewSearchRef}
                    type="text"
                    placeholder="Search tokens..."
                    value={previewSearch}
                    onChange={(event) => setPreviewSearch(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        if (previewSearch) setPreviewSearch("");
                        previewSearchRef.current?.blur();
                      }
                    }}
                    className="w-full rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-1.5 py-0.5 text-[10px] text-[var(--color-figma-text)] placeholder-[var(--color-figma-text-tertiary)] focus:focus-visible:border-[var(--color-figma-accent)]"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {previewTokens.length === 0 ? (
                    <div className="px-3 py-3 text-center text-[10px] italic text-[var(--color-figma-text-tertiary)]">
                      {Object.keys(setTokenValues).length === 0
                        ? "No token data available"
                        : dimensions.every((dimension) => {
                              const option = dimension.options.find(
                                (item: ThemeOption) =>
                                  item.name === selectedOptions[dimension.id],
                              );
                              return (
                                !option ||
                                Object.values(option.sets).every(
                                  (status) => status === "disabled",
                                )
                              );
                            })
                          ? "Assign sets as Base or Override to see resolved tokens"
                          : previewSearch
                            ? "No matching tokens"
                            : "No tokens resolved with current selections"}
                    </div>
                  ) : (
                    <table className="w-full text-[10px]">
                      <thead>
                        <tr className="bg-[var(--color-figma-bg-secondary)] text-left text-[var(--color-figma-text-tertiary)]">
                          <th className="px-3 py-0.5 font-medium">Token</th>
                          <th className="px-2 py-0.5 font-medium">Value</th>
                          <th className="px-2 py-0.5 text-right font-medium">
                            Source
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--color-figma-border)]">
                        {previewTokens.map((token) => (
                          <tr
                            key={token.path}
                            className="cursor-default hover:bg-[var(--color-figma-bg-hover)]"
                            onClick={() =>
                              onNavigateToToken?.(token.path, token.set)
                            }
                            title={`${token.path}\nRaw: ${
                              typeof token.rawValue === "object"
                                ? JSON.stringify(token.rawValue)
                                : token.rawValue
                            }\nFrom: ${token.set} (${token.layer})`}
                          >
                            <td className="max-w-[120px] truncate px-3 py-0.5 font-mono text-[var(--color-figma-text)]">
                              {token.path}
                            </td>
                            <td className="px-2 py-0.5 text-[var(--color-figma-text-secondary)]">
                              {renderValuePreview(token.resolvedValue)}
                            </td>
                            <td
                              className="max-w-[80px] truncate px-2 py-0.5 text-right text-[var(--color-figma-text-tertiary)]"
                              title={token.layer}
                            >
                              {token.set}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {previewTokens.length >= 50 && (
                    <div className="border-t border-[var(--color-figma-border)] px-3 py-1 text-center text-[10px] text-[var(--color-figma-text-tertiary)]">
                      Showing first 50 tokens. Use search to filter.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-3">
        {showCreateDim ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">
                Axis name
              </label>
              <input
                type="text"
                value={newDimName}
                onChange={(event) => setNewDimName(event.target.value)}
                placeholder="e.g. Mode, Brand, Density"
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
                Each axis has options — e.g.{" "}
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
                {isCreatingDim ? "Creating…" : "Create axis"}
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
            Add theme axis
          </button>
        )}
      </div>
    </>
  );
});
