import { useCallback, type MutableRefObject } from "react";
import {
  ArrowLeft,
  ArrowUpDown,
  ChevronRight,
  MoreHorizontal,
  Plus,
  Search,
  Target,
  X,
} from "lucide-react";
import {
  FilterMenu,
  type TokenListOverflowMenuProps,
} from "./TokenListOverflowMenu";
import type { ToolbarStateChip } from "./token-list/useToolbarStateChips";
import { replaceQueryToken } from "./tokenListUtils";
import { useDropdownMenu } from "../hooks/useDropdownMenu";
import { useAnchoredFloatingStyle } from "../shared/floatingPosition";
import { FLOATING_MENU_CLASS } from "../shared/menuClasses";
import type { TokenGroupBy } from "./tokenListTypes";
import {
  Chip,
  MenuRadioGroup,
  SegmentedControl,
  type SegmentedOption,
} from "../primitives";

interface QualifierHint {
  id: string;
  label: string;
  desc: string;
  replacement?: string;
  kind: "replacement" | "hint";
}

function MenuSectionLabel({ children }: { children: string }) {
  return (
    <div className="px-2.5 pt-1 pb-0.5 text-secondary font-semibold text-[var(--color-figma-text-tertiary)]">
      {children}
    </div>
  );
}

interface RadioMenuGroup<T extends string> {
  key: string;
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
}

const TREE_VIEW_OPTIONS: SegmentedOption<"tree" | "json">[] = [
  { value: "tree", label: "Tokens" },
  { value: "json", label: "JSON" },
];

const GROUP_OPTIONS: SegmentedOption<TokenGroupBy>[] = [
  { value: "path", label: "Hierarchy" },
  { value: "type", label: "By type" },
];

const SORT_OPTIONS: SegmentedOption<"default" | "alpha-asc" | "by-type">[] = [
  { value: "default", label: "Default" },
  { value: "alpha-asc", label: "A – Z" },
  { value: "by-type", label: "Type" },
];

const RESULT_OPTIONS: SegmentedOption<"grouped" | "flat">[] = [
  { value: "grouped", label: "Grouped" },
  { value: "flat", label: "Flat" },
];

const TOOLBAR_BUTTON_CLASS =
  "inline-flex min-h-[26px] items-center gap-1 rounded px-2 text-secondary font-medium transition-colors";

export interface TokenListToolbarProps {
  onNavigateBack?: () => void;
  navHistoryLength?: number;
  zoomRootPath?: string | null;
  searchRef: MutableRefObject<HTMLInputElement | null>;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  hintIndex: number;
  setHintIndex: (fn: number | ((i: number) => number)) => void;
  showQualifierHints: boolean;
  setShowQualifierHints: (v: boolean) => void;
  qualifierHints: QualifierHint[];
  activeQueryToken: { token: string; start: number; end: number };
  searchTooltip: string;
  qualifierHintsRef: MutableRefObject<HTMLDivElement | null>;
  toolbarStateChips: ToolbarStateChip[];
  connected: boolean;
  hasTokens: boolean;
  viewMode: "tree" | "json";
  setViewMode: (mode: "tree" | "json") => void;
  groupBy: TokenGroupBy;
  setGroupBy: (value: TokenGroupBy) => void;
  selectedNodeCount: number;
  boundTokenCount: number;
  inspectMode: boolean;
  onToggleInspectMode: () => void;
  openTableCreate: () => void;
  onCreateToken?: () => void;
  onGenerateTokens?: () => void;
  handleOpenNewGroupDialog: () => void;
  onShowPasteModal?: () => void;
  onSelectTokens?: () => void;
  onBulkEdit?: () => void;
  onFindReplace?: () => void;
  overflowMenuProps: TokenListOverflowMenuProps | null;
}

export function TokenListToolbar({
  onNavigateBack,
  navHistoryLength,
  zoomRootPath,
  searchRef,
  searchQuery,
  setSearchQuery,
  hintIndex,
  setHintIndex,
  showQualifierHints,
  setShowQualifierHints,
  qualifierHints,
  activeQueryToken,
  searchTooltip,
  qualifierHintsRef,
  toolbarStateChips,
  connected,
  hasTokens,
  viewMode,
  setViewMode,
  groupBy,
  setGroupBy,
  selectedNodeCount,
  boundTokenCount,
  inspectMode,
  onToggleInspectMode,
  openTableCreate,
  onCreateToken,
  onGenerateTokens,
  handleOpenNewGroupDialog,
  onShowPasteModal,
  onSelectTokens,
  onBulkEdit,
  onFindReplace,
  overflowMenuProps,
}: TokenListToolbarProps) {
  const actionsMenu = useDropdownMenu();
  const sortMenu = useDropdownMenu();
  const createMenu = useDropdownMenu();
  const sortMenuStyle = useAnchoredFloatingStyle({
    triggerRef: sortMenu.triggerRef,
    open: sortMenu.open,
    preferredWidth: 240,
    preferredHeight: 360,
    align: "end",
  });
  const createMenuStyle = useAnchoredFloatingStyle({
    triggerRef: createMenu.triggerRef,
    open: createMenu.open,
    preferredWidth: 240,
    preferredHeight: 360,
    align: "end",
  });
  const actionsMenuStyle = useAnchoredFloatingStyle({
    triggerRef: actionsMenu.triggerRef,
    open: actionsMenu.open,
    preferredWidth: 240,
    preferredHeight: 360,
    align: "end",
  });
  const runMenuAction = useCallback(
    (action: () => void) => {
      action();
      actionsMenu.close({ restoreFocus: false });
    },
    [actionsMenu],
  );
  const runCreateAction = useCallback(
    (action: () => void) => {
      action();
      createMenu.close({ restoreFocus: false });
    },
    [createMenu],
  );
  const closeSortMenu = useCallback(() => {
    sortMenu.close({ restoreFocus: false });
  }, [sortMenu]);

  const searchScope: "collection" | "all" =
    overflowMenuProps?.crossCollectionSearch === true ? "all" : "collection";
  const searchPlaceholder =
    searchScope === "all"
      ? "Search across collections"
      : "Search name, value, or type";

  const showSelectionChip = selectedNodeCount > 0 && boundTokenCount > 0;
  const hasChipRow =
    viewMode === "tree" && hasTokens && (showSelectionChip || toolbarStateChips.length > 0);

  const hasCreateActions =
    Boolean(onCreateToken) ||
    Boolean(onGenerateTokens) ||
    Boolean(handleOpenNewGroupDialog) ||
    Boolean(onShowPasteModal) ||
    Boolean(openTableCreate);
  const hasEditActions =
    Boolean(onSelectTokens) || Boolean(onBulkEdit) || Boolean(onFindReplace);
  const hasGroupOps = overflowMenuProps?.hasGroups === true;
  const hasOverflowActions = hasEditActions || hasGroupOps;
  const showOverflow =
    hasTokens && viewMode === "tree" && hasOverflowActions;
  const showCreate = viewMode === "tree" && hasCreateActions;

  const sortActive =
    Boolean(overflowMenuProps) &&
    (overflowMenuProps!.sortOrder !== "default" || groupBy !== "path");
  const sortStateLabel =
    overflowMenuProps && overflowMenuProps.sortOrder === "alpha-asc"
      ? "A – Z"
      : overflowMenuProps && overflowMenuProps.sortOrder === "by-type"
        ? "Type"
        : groupBy === "type"
          ? "By type"
          : null;

  const viewRadioGroups: RadioMenuGroup<string>[] = overflowMenuProps
    ? [
        {
          key: "group",
          label: "Group by",
          value: groupBy,
          onChange: (v: string) => setGroupBy(v as TokenGroupBy),
          options: GROUP_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
        } as RadioMenuGroup<string>,
        {
          key: "sort",
          label: "Sort",
          value: overflowMenuProps.sortOrder,
          onChange: (v: string) =>
            overflowMenuProps.onSortOrderChange(
              v as "default" | "alpha-asc" | "by-type",
            ),
          options: SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
        } as RadioMenuGroup<string>,
        ...(overflowMenuProps.canToggleSearchResultPresentation
          ? [
              {
                key: "results",
                label: "Results",
                value: overflowMenuProps.searchResultPresentation,
                onChange: (v: string) =>
                  overflowMenuProps.onSearchResultPresentationChange(
                    v as "grouped" | "flat",
                  ),
                options: RESULT_OPTIONS.map((o) => ({
                  value: o.value,
                  label: o.label,
                })),
              } as RadioMenuGroup<string>,
            ]
          : []),
      ]
    : [];

  return (
    <div className="bg-[var(--color-figma-bg-secondary)]">
      <div className="flex flex-col gap-2 px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            {onNavigateBack && (navHistoryLength ?? 0) > 0 ? (
              <button
                type="button"
                onClick={onNavigateBack}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
                title="Back (Alt+←)"
                aria-label="Back"
              >
                <ArrowLeft size={12} strokeWidth={1.5} aria-hidden />
              </button>
            ) : null}

            {zoomRootPath ? (
              <span
                className="inline-flex min-w-0 shrink items-center gap-1 truncate text-secondary text-[var(--color-figma-text-tertiary)]"
                title={`Scoped to ${zoomRootPath}`}
              >
                <ChevronRight size={10} strokeWidth={1.5} aria-hidden />
                <span className="truncate">{zoomRootPath}</span>
              </span>
            ) : null}

            {hasTokens && viewMode === "tree" ? (
              <div className="relative min-w-[140px] max-w-full flex-1 basis-[220px]">
                <div className="flex min-h-[28px] items-center gap-1.5 rounded bg-[var(--color-figma-bg)] px-2">
                  <Search
                    size={12}
                    strokeWidth={1.5}
                    className="pointer-events-none shrink-0 text-[var(--color-figma-text-tertiary)]"
                    aria-hidden
                  />
                  <input
                    ref={searchRef}
                    type="text"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={showQualifierHints && qualifierHints.length > 0}
                    aria-controls="qualifier-hints-listbox"
                    aria-activedescendant={
                      showQualifierHints && qualifierHints.length > 0
                        ? `qualifier-hint-${qualifierHints[hintIndex]?.id}`
                        : undefined
                    }
                    value={searchQuery}
                    onChange={(event) => {
                      setSearchQuery(event.target.value);
                      setHintIndex(0);
                    }}
                    onFocus={() => setShowQualifierHints(true)}
                    onBlur={() => {
                      window.setTimeout(() => setShowQualifierHints(false), 150);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        if (searchQuery) {
                          setSearchQuery("");
                          setHintIndex(0);
                        }
                        searchRef.current?.blur();
                        return;
                      }
                      if (!showQualifierHints || qualifierHints.length === 0) {
                        return;
                      }
                      if (event.key === "ArrowDown") {
                        event.preventDefault();
                        setHintIndex((index: number) =>
                          Math.min(index + 1, qualifierHints.length - 1),
                        );
                      } else if (event.key === "ArrowUp") {
                        event.preventDefault();
                        setHintIndex((index: number) => Math.max(index - 1, 0));
                      } else if (
                        event.key === "Tab" ||
                        (event.key === "Enter" && qualifierHints.length > 0)
                      ) {
                        const hint = qualifierHints[hintIndex];
                        if (!hint || hint.kind !== "replacement" || !hint.replacement) {
                          return;
                        }
                        event.preventDefault();
                        setSearchQuery(
                          replaceQueryToken(searchQuery, activeQueryToken, hint.replacement),
                        );
                        setHintIndex(0);
                      }
                    }}
                    placeholder={searchPlaceholder}
                    title={searchTooltip}
                    className="min-w-[40px] flex-1 bg-transparent py-1 text-body text-[var(--color-figma-text)] outline-none placeholder:text-[var(--color-figma-text-tertiary)]"
                  />
                  {searchQuery ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery("");
                        setHintIndex(0);
                        searchRef.current?.focus();
                      }}
                      className="flex h-5 w-5 shrink-0 items-center justify-center text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)]"
                      title="Clear search"
                      aria-label="Clear search"
                    >
                      <X size={10} strokeWidth={1.5} aria-hidden />
                    </button>
                  ) : null}
                </div>

                {showQualifierHints &&
                activeQueryToken.token.includes(":") &&
                qualifierHints.length > 0 ? (
                  <div
                    ref={qualifierHintsRef}
                    id="qualifier-hints-listbox"
                    role="listbox"
                    className="absolute left-0 top-full z-50 mt-0.5 max-h-48 w-full overflow-y-auto rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
                  >
                    {qualifierHints.map((hint, index) => (
                      <button
                        key={hint.id}
                        id={`qualifier-hint-${hint.id}`}
                        role="option"
                        aria-selected={index === hintIndex}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          if (hint.kind !== "replacement" || !hint.replacement) {
                            return;
                          }
                          setSearchQuery(
                            replaceQueryToken(
                              searchQuery,
                              activeQueryToken,
                              hint.replacement,
                            ),
                          );
                          setHintIndex(0);
                          searchRef.current?.focus();
                        }}
                        className={`flex w-full items-center gap-2 px-2 py-1 text-left text-secondary ${
                          index === hintIndex
                            ? "bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text)]"
                            : "text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                        } ${hint.kind === "replacement" ? "" : "cursor-default"}`}
                      >
                        <span className="font-mono font-semibold text-[var(--color-figma-accent)]">
                          {hint.label}
                        </span>
                        <span className="truncate">{hint.desc}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="min-w-[80px] flex-1" />
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
          <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5">
            {hasTokens ? (
              <div className="min-w-0 shrink-0">
                <SegmentedControl
                  value={viewMode}
                  options={TREE_VIEW_OPTIONS}
                  onChange={setViewMode}
                />
              </div>
            ) : null}

            {overflowMenuProps && viewMode === "tree" ? (
              <FilterMenu
                {...overflowMenuProps}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
              />
            ) : null}

            {overflowMenuProps && viewMode === "tree" && viewRadioGroups.length > 0 ? (
              <div className="relative shrink-0">
                <button
                  ref={sortMenu.triggerRef}
                  type="button"
                  onClick={sortMenu.toggle}
                  aria-expanded={sortMenu.open}
                  aria-haspopup="menu"
                  aria-label="Sort and group"
                  title="Sort and group"
                  className={`${TOOLBAR_BUTTON_CLASS} ${
                    sortMenu.open || sortActive
                      ? "bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]"
                      : "text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
                  }`}
                >
                  <ArrowUpDown size={12} strokeWidth={1.5} aria-hidden />
                  <span className="whitespace-nowrap">{sortStateLabel ?? "Sort"}</span>
                </button>

                {sortMenu.open ? (
                  <div
                    ref={sortMenu.menuRef}
                    style={sortMenuStyle ?? { visibility: "hidden" }}
                    className={FLOATING_MENU_CLASS}
                    role="menu"
                  >
                    {viewRadioGroups.map((group, idx) => (
                      <div key={group.key}>
                        {idx > 0 ? <div className="h-2" aria-hidden /> : null}
                        <MenuRadioGroup
                          label={group.label}
                          value={group.value}
                          options={group.options}
                          onChange={group.onChange}
                          onSelect={closeSortMenu}
                        />
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {showCreate ? (
              <div className="relative shrink-0">
                <button
                  ref={createMenu.triggerRef}
                  type="button"
                  onClick={createMenu.toggle}
                  disabled={!connected}
                  aria-expanded={createMenu.open}
                  aria-haspopup="menu"
                  aria-label="Create"
                  title="Create"
                  className={`${TOOLBAR_BUTTON_CLASS} ${
                    createMenu.open
                      ? "bg-[var(--color-figma-accent)] text-[var(--color-figma-text-onbrand)]"
                      : "bg-[var(--color-figma-accent)] text-[var(--color-figma-text-onbrand)] hover:bg-[var(--color-figma-accent-hover)]"
                  } disabled:opacity-40`}
                >
                  <Plus size={12} strokeWidth={2} aria-hidden />
                  <span className="whitespace-nowrap">Create</span>
                </button>

                {createMenu.open ? (
                  <div
                    ref={createMenu.menuRef}
                    style={createMenuStyle ?? { visibility: "hidden" }}
                    className={FLOATING_MENU_CLASS}
                    role="menu"
                  >
                    {onCreateToken ? (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => runCreateAction(onCreateToken)}
                        disabled={!connected}
                        className="flex w-full items-center px-2.5 py-1 text-left text-secondary text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40"
                      >
                        New token
                      </button>
                    ) : null}
                    {onGenerateTokens ? (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => runCreateAction(onGenerateTokens)}
                        disabled={!connected}
                        className="flex w-full items-center px-2.5 py-1 text-left text-secondary text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40"
                      >
                        Generate tokens…
                      </button>
                    ) : null}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => runCreateAction(handleOpenNewGroupDialog)}
                      disabled={!connected}
                      className="flex w-full items-center px-2.5 py-1 text-left text-secondary text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40"
                    >
                      New group
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => runCreateAction(openTableCreate)}
                      disabled={!connected}
                      className="flex w-full items-center px-2.5 py-1 text-left text-secondary text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40"
                    >
                      Token table
                    </button>
                    {onShowPasteModal ? (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => runCreateAction(onShowPasteModal)}
                        disabled={!connected}
                        className="flex w-full items-center px-2.5 py-1 text-left text-secondary text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40"
                      >
                        Paste JSON
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {showOverflow ? (
              <div className="relative shrink-0">
                <button
                  ref={actionsMenu.triggerRef}
                  type="button"
                  onClick={actionsMenu.toggle}
                  disabled={!connected}
                    aria-expanded={actionsMenu.open}
                    aria-haspopup="menu"
                    aria-label="More actions"
                    className={`inline-flex h-7 w-7 items-center justify-center rounded transition-colors ${
                      actionsMenu.open
                        ? "bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text)]"
                        : "text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
                    } disabled:opacity-40`}
                >
                  <MoreHorizontal size={14} strokeWidth={1.5} aria-hidden />
                </button>

                {actionsMenu.open ? (
                  <div
                    ref={actionsMenu.menuRef}
                    style={actionsMenuStyle ?? { visibility: "hidden" }}
                    className={FLOATING_MENU_CLASS}
                    role="menu"
                  >
                    {hasGroupOps ? (
                      <>
                        <MenuSectionLabel>View</MenuSectionLabel>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() =>
                            runMenuAction(
                              overflowMenuProps!.allGroupsExpanded
                                ? overflowMenuProps!.onCollapseAll
                                : overflowMenuProps!.onExpandAll,
                            )
                          }
                          className="flex w-full items-center px-2.5 py-1 text-left text-secondary text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
                        >
                          {overflowMenuProps!.allGroupsExpanded
                            ? "Collapse all groups"
                            : "Expand all groups"}
                        </button>
                      </>
                    ) : null}

                    {hasEditActions ? (
                      <>
                        {hasGroupOps ? (
                          <div className="h-1.5" aria-hidden />
                        ) : null}
                        <MenuSectionLabel>Edit</MenuSectionLabel>
                        {onSelectTokens ? (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => runMenuAction(onSelectTokens)}
                            className="flex w-full items-center px-2.5 py-1 text-left text-secondary text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
                          >
                            Select tokens
                          </button>
                        ) : null}
                        {onBulkEdit ? (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => runMenuAction(onBulkEdit)}
                            className="flex w-full items-center px-2.5 py-1 text-left text-secondary text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
                          >
                            Bulk edit
                          </button>
                        ) : null}
                        {onFindReplace ? (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => runMenuAction(onFindReplace)}
                            disabled={!connected}
                            className="flex w-full items-center px-2.5 py-1 text-left text-secondary text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40"
                          >
                            Find and replace
                          </button>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {hasChipRow ? (
          <div className="flex flex-wrap items-center gap-1">
            {showSelectionChip ? (
              <button
                type="button"
                onClick={onToggleInspectMode}
                aria-pressed={inspectMode}
                title={
                  inspectMode
                    ? "Show all tokens"
                    : `Show only the ${boundTokenCount} token${boundTokenCount === 1 ? "" : "s"} used on the current selection`
                }
                className={`inline-flex h-[22px] items-center gap-1 rounded-full px-2 text-secondary transition-colors ${
                  inspectMode
                    ? "bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)]"
                    : "bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]"
                }`}
              >
                <Target size={10} strokeWidth={1.5} aria-hidden />
                <span>{boundTokenCount} on selection</span>
              </button>
            ) : null}
            {toolbarStateChips.map((chip) => (
              <Chip key={chip.key} label={chip.label} onRemove={chip.onRemove} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
