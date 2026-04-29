import { useCallback, type MutableRefObject } from "react";
import {
  ArrowLeft,
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Plus,
  Target,
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
import type { SortOrder, TokenGroupBy } from "./tokenListTypes";
import {
  Chip,
  IconButton,
  MenuRadioGroup,
  SearchField,
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
    <div className="px-2.5 pt-1 pb-0.5 text-secondary font-semibold text-[color:var(--color-figma-text-tertiary)]">
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
  "inline-flex min-h-7 items-center gap-1 rounded px-2 text-secondary font-medium transition-colors";

type SearchResultPresentation = "grouped" | "flat";

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
  onCreateGenerator?: (initialOutputPrefix?: string) => void;
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
  onCreateGenerator,
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
    preferredWidth: 220,
    preferredHeight: 260,
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
    viewMode === "json"
      ? "Search JSON text"
      : searchScope === "all"
        ? "Search across collections"
        : "Search name, value, or type";
  const effectiveSearchTooltip =
    viewMode === "json" ? "Search raw JSON text" : searchTooltip;

  const showSelectionChip = selectedNodeCount > 0 && boundTokenCount > 0;
  const hasChipRow =
    viewMode === "tree" &&
    hasTokens &&
    (showSelectionChip || toolbarStateChips.length > 0);

  const showTreeActions = viewMode === "tree";
  const hasEditActions =
    showTreeActions &&
    (Boolean(onSelectTokens) || Boolean(onBulkEdit) || Boolean(onFindReplace));
  const hasGroupOps = showTreeActions && overflowMenuProps?.hasGroups === true;
  const hasOverflowActions = hasEditActions || hasGroupOps || hasTokens;
  const showOverflow = hasOverflowActions;
  const showCreate = viewMode === "tree";
  const showPrimaryCreateAction = onCreateToken !== undefined;
  const sortOrder: SortOrder = overflowMenuProps?.sortOrder ?? "default";

  const sortActive =
    overflowMenuProps !== null &&
    overflowMenuProps !== undefined &&
    (sortOrder !== "default" || groupBy !== "path");
  const sortStateLabel =
    sortOrder === "alpha-asc"
      ? "A – Z"
      : sortOrder === "by-type"
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
          options: GROUP_OPTIONS.map((o) => ({
            value: o.value,
            label: o.label,
          })),
        } as RadioMenuGroup<string>,
        {
          key: "sort",
          label: "Sort",
          value: sortOrder,
          onChange: (v: string) =>
            overflowMenuProps.onSortOrderChange(v as SortOrder),
          options: SORT_OPTIONS.map((o) => ({
            value: o.value,
            label: o.label,
          })),
        } as RadioMenuGroup<string>,
        ...(overflowMenuProps.canToggleSearchResultPresentation
          ? [
              {
                key: "results",
                label: "Results",
                value: overflowMenuProps.searchResultPresentation,
                onChange: (v: string) =>
                  overflowMenuProps.onSearchResultPresentationChange(
                    v as SearchResultPresentation,
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
      <div className="tm-responsive-toolbar tm-token-toolbar px-3 py-2">
        <div className="tm-responsive-toolbar__row tm-token-toolbar__row">
          <div className="tm-responsive-toolbar__leading">
            {onNavigateBack && (navHistoryLength ?? 0) > 0 ? (
              <IconButton
                onClick={onNavigateBack}
                size="md"
                className="shrink-0"
                title="Back (Alt+←)"
                aria-label="Back"
              >
                <ArrowLeft size={12} strokeWidth={1.5} aria-hidden />
              </IconButton>
            ) : null}

            {zoomRootPath ? (
              <span
                className="tm-token-toolbar__scope inline-flex min-w-0 shrink items-start gap-1 text-secondary text-[color:var(--color-figma-text-tertiary)]"
                title={`Scoped to ${zoomRootPath}`}
              >
                <ChevronRight size={10} strokeWidth={1.5} aria-hidden />
                <span className="tm-token-toolbar__scope-text">
                  {zoomRootPath}
                </span>
              </span>
            ) : null}

            {hasTokens ? (
              <div className="tm-responsive-toolbar__search relative">
                <SearchField
                  ref={searchRef}
                  role={viewMode === "tree" ? "combobox" : "searchbox"}
                  aria-autocomplete={viewMode === "tree" ? "list" : undefined}
                  aria-expanded={
                    viewMode === "tree"
                      ? showQualifierHints && qualifierHints.length > 0
                      : undefined
                  }
                  aria-controls={
                    viewMode === "tree"
                      ? "qualifier-hints-listbox"
                      : undefined
                  }
                  aria-activedescendant={
                    viewMode === "tree" &&
                    showQualifierHints &&
                    qualifierHints.length > 0
                      ? `qualifier-hint-${qualifierHints[hintIndex]?.id}`
                      : undefined
                  }
                  value={searchQuery}
                  onChange={(event) => {
                    setSearchQuery(event.target.value);
                    setHintIndex(0);
                  }}
                  onFocus={() => setShowQualifierHints(viewMode === "tree")}
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
                    if (viewMode !== "tree") {
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
                      if (
                        !hint ||
                        hint.kind !== "replacement" ||
                        !hint.replacement
                      ) {
                        return;
                      }
                      event.preventDefault();
                      setSearchQuery(
                        replaceQueryToken(
                          searchQuery,
                          activeQueryToken,
                          hint.replacement,
                        ),
                      );
                      setHintIndex(0);
                    }
                  }}
                  placeholder={searchPlaceholder}
                  title={effectiveSearchTooltip}
                  onClear={() => {
                    setSearchQuery("");
                    setHintIndex(0);
                    searchRef.current?.focus();
                  }}
                  containerClassName="w-full"
                />

                {showQualifierHints &&
                viewMode === "tree" &&
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
                          if (
                            hint.kind !== "replacement" ||
                            !hint.replacement
                          ) {
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
                            ? "bg-[var(--color-figma-bg-hover)] text-[color:var(--color-figma-text)]"
                            : "text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                        } ${hint.kind === "replacement" ? "" : "cursor-default"}`}
                      >
                        <span className="font-mono font-semibold text-[color:var(--color-figma-accent)]">
                          {hint.label}
                        </span>
                        <span className="min-w-0 flex-1 whitespace-normal break-words leading-tight">
                          {hint.desc}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="min-w-[80px] flex-1" />
            )}
          </div>

          <div className="tm-responsive-toolbar__actions">
            {overflowMenuProps && viewMode === "tree" ? (
              <FilterMenu
                {...overflowMenuProps}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
              />
            ) : null}

            {overflowMenuProps &&
            viewMode === "tree" &&
            viewRadioGroups.length > 0 ? (
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
                      ? "bg-[var(--color-figma-accent)]/10 text-[color:var(--color-figma-accent)]"
                      : "text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)]"
                  }`}
                >
                  <ArrowUpDown size={12} strokeWidth={1.5} aria-hidden />
                  <span className="tm-toolbar-action__label tm-token-toolbar__button-label tm-token-toolbar__secondary-label">
                    {sortStateLabel ?? "Sort"}
                  </span>
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
                {showPrimaryCreateAction ? (
                  <div className="tm-token-toolbar__split-button">
                    <button
                      type="button"
                      onClick={() => onCreateToken?.()}
                      disabled={!connected}
                      title="New token"
                      aria-label="New token"
                      className="tm-token-toolbar__split-button-primary inline-flex min-h-[26px] items-center gap-1 bg-[var(--color-figma-action-bg)] px-2 text-secondary font-medium text-[color:var(--color-figma-text-onbrand)] transition-colors hover:bg-[var(--color-figma-action-bg-hover)] disabled:opacity-40"
                    >
                      <Plus size={12} strokeWidth={2} aria-hidden />
                      <span className="tm-toolbar-action__label tm-token-toolbar__button-label tm-token-toolbar__primary-label">
                        New token
                      </span>
                    </button>
                    <button
                      ref={createMenu.triggerRef}
                      type="button"
                      onClick={createMenu.toggle}
                      disabled={!connected}
                      aria-expanded={createMenu.open}
                      aria-haspopup="menu"
                      aria-label="More create actions"
                      title="More create actions"
                      className="tm-token-toolbar__split-button-toggle inline-flex min-h-7 w-7 items-center justify-center border-l border-white/25 bg-[var(--color-figma-action-bg)] text-[color:var(--color-figma-text-onbrand)] transition-colors hover:bg-[var(--color-figma-action-bg-hover)] disabled:opacity-40"
                    >
                      <ChevronDown size={12} strokeWidth={1.8} aria-hidden />
                    </button>
                  </div>
                ) : (
                  <button
                    ref={createMenu.triggerRef}
                    type="button"
                    onClick={createMenu.toggle}
                    disabled={!connected}
                    aria-expanded={createMenu.open}
                    aria-haspopup="menu"
                    aria-label="Create"
                    title="Create"
                    className={`${TOOLBAR_BUTTON_CLASS} bg-[var(--color-figma-action-bg)] text-[color:var(--color-figma-text-onbrand)] hover:bg-[var(--color-figma-action-bg-hover)] disabled:opacity-40`}
                  >
                    <Plus size={12} strokeWidth={2} aria-hidden />
                    <span className="tm-toolbar-action__label tm-token-toolbar__button-label tm-token-toolbar__primary-label">
                      Create
                    </span>
                    <ChevronDown size={12} strokeWidth={1.8} aria-hidden />
                  </button>
                )}

                {createMenu.open ? (
                  <div
                    ref={createMenu.menuRef}
                    style={createMenuStyle ?? { visibility: "hidden" }}
                    className={FLOATING_MENU_CLASS}
                    role="menu"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => runCreateAction(handleOpenNewGroupDialog)}
                      disabled={!connected}
                      className="flex w-full items-center px-2.5 py-1 text-left text-secondary text-[color:var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40"
                    >
                      New group
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => runCreateAction(openTableCreate)}
                      disabled={!connected}
                      className="flex w-full items-center px-2.5 py-1 text-left text-secondary text-[color:var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40"
                    >
                      Token table
                    </button>
                    {onShowPasteModal ? (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => runCreateAction(onShowPasteModal)}
                        disabled={!connected}
                        className="flex w-full items-center px-2.5 py-1 text-left text-secondary text-[color:var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40"
                      >
                        Paste JSON
                      </button>
                    ) : null}
                    {onCreateGenerator ? (
                      <>
                        <div className="h-1.5" aria-hidden />
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() =>
                            runCreateAction(() =>
                              onCreateGenerator(zoomRootPath ?? undefined),
                            )
                          }
                          disabled={!connected}
                          className="flex w-full items-center px-2.5 py-1 text-left text-secondary text-[color:var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)] disabled:opacity-40"
                        >
                          Generator…
                        </button>
                      </>
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
                  aria-expanded={actionsMenu.open}
                  aria-haspopup="menu"
                  aria-label="More actions"
                  title="More actions"
                  className={`inline-flex h-7 w-7 items-center justify-center rounded transition-colors ${
                    actionsMenu.open
                      ? "bg-[var(--color-figma-bg-hover)] text-[color:var(--color-figma-text)]"
                      : "text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)]"
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
                    {hasTokens ? (
                      <div className="tm-token-toolbar__overflow-view-section">
                        <MenuSectionLabel>View</MenuSectionLabel>
                        {TREE_VIEW_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            role="menuitemradio"
                            aria-checked={viewMode === option.value}
                            onClick={() =>
                              runMenuAction(() => setViewMode(option.value))
                            }
                            className="flex w-full items-center gap-2 px-2.5 py-1 text-left text-secondary text-[color:var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
                          >
                            <span className="w-3 shrink-0 text-center">
                              {viewMode === option.value ? (
                                <Check
                                  size={10}
                                  strokeWidth={1.5}
                                  aria-hidden
                                />
                              ) : null}
                            </span>
                            <span>{option.label}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}

                    {hasGroupOps ? (
                      <>
                        {hasTokens ? (
                          <div
                            className="tm-token-toolbar__overflow-after-view-separator h-1.5"
                            aria-hidden
                          />
                        ) : null}
                        <MenuSectionLabel>Groups</MenuSectionLabel>
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
                          className="flex w-full items-center px-2.5 py-1 text-left text-secondary text-[color:var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
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
                        ) : hasTokens ? (
                          <div
                            className="tm-token-toolbar__overflow-after-view-separator h-1.5"
                            aria-hidden
                          />
                        ) : null}
                        <MenuSectionLabel>Edit</MenuSectionLabel>
                        {onSelectTokens ? (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => runMenuAction(onSelectTokens)}
                            className="flex w-full items-center px-2.5 py-1 text-left text-secondary text-[color:var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
                          >
                            Select tokens
                          </button>
                        ) : null}
                        {onBulkEdit ? (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => runMenuAction(onBulkEdit)}
                            className="flex w-full items-center px-2.5 py-1 text-left text-secondary text-[color:var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
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
                            className="flex w-full items-center px-2.5 py-1 text-left text-secondary text-[color:var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40"
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
          <div className="tm-responsive-toolbar__chips">
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
                    ? "bg-[var(--color-figma-accent)]/15 text-[color:var(--color-figma-accent)]"
                    : "bg-[var(--color-figma-bg)] text-[color:var(--color-figma-text-secondary)] hover:text-[color:var(--color-figma-text)]"
                }`}
              >
                <Target size={10} strokeWidth={1.5} aria-hidden />
                <span>{boundTokenCount} on selection</span>
              </button>
            ) : null}
            {toolbarStateChips.map((chip) => (
              <Chip
                key={chip.key}
                label={chip.label}
                onRemove={chip.onRemove}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
