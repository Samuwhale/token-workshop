import { useCallback, type MutableRefObject } from "react";
import {
  ArrowLeft,
  ArrowUpDown,
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
import {
  FLOATING_MENU_CLASS,
  FLOATING_MENU_ITEM_CLASS,
} from "../shared/menuClasses";
import type { SortOrder, TokenGroupBy } from "./tokenListTypes";
import {
  Button,
  Chip,
  IconButton,
  MenuRadioGroup,
  SearchField,
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
    <div className="px-2.5 pt-1 pb-0.5 text-secondary font-semibold text-[color:var(--color-figma-text-tertiary)]">
      {children}
    </div>
  );
}

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

const VIEW_OPTIONS: SegmentedOption<"tree" | "json">[] = [
  { value: "tree", label: "Tokens" },
  { value: "json", label: "JSON" },
];

const SEARCH_SCOPE_OPTIONS: SegmentedOption<"collection" | "all">[] = [
  { value: "collection", label: "This collection" },
  { value: "all", label: "All collections" },
];

const TOOLBAR_BUTTON_CLASS =
  "inline-flex min-h-7 items-center gap-1 rounded px-2 text-secondary font-medium transition-colors";

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
  onBulkEdit,
  onFindReplace,
  overflowMenuProps,
}: TokenListToolbarProps) {
  const actionsMenu = useDropdownMenu();
  const viewMenu = useDropdownMenu();
  const createMenu = useDropdownMenu();
  const viewMenuStyle = useAnchoredFloatingStyle({
    triggerRef: viewMenu.triggerRef,
    open: viewMenu.open,
    preferredWidth: 240,
    preferredHeight: 420,
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
  const closeViewMenu = useCallback(() => {
    viewMenu.close({ restoreFocus: false });
  }, [viewMenu]);

  const searchScope: "collection" | "all" =
    overflowMenuProps?.crossCollectionSearch === true ? "all" : "collection";
  const searchPlaceholder =
    viewMode === "json"
      ? "Search JSON"
      : searchScope === "all"
        ? "Search all collections"
        : "Search tokens";
  const effectiveSearchTooltip =
    viewMode === "json" ? "Search raw JSON text" : searchTooltip;
  const searchAriaLabel =
    viewMode === "json"
      ? "Search JSON"
      : searchScope === "all"
        ? "Search all collections"
        : "Search tokens";

  const showSelectionChip = selectedNodeCount > 0 && boundTokenCount > 0;
  const showSearch =
    hasTokens ||
    (viewMode === "tree" && overflowMenuProps?.hasMultipleCollections === true);
  const showSearchScopeToggle =
    viewMode === "tree" &&
    showSearch &&
    overflowMenuProps?.hasMultipleCollections === true;
  const showInlineSearchScopeToggle = showSearchScopeToggle;
  const showResultPresentationToggle =
    viewMode === "tree" &&
    overflowMenuProps?.canToggleSearchResultPresentation === true;
  const hasChipRow =
    viewMode === "tree" &&
    hasTokens &&
    (showSelectionChip || toolbarStateChips.length > 0);

  const showTreeActions = viewMode === "tree";
  const hasEditActions =
    showTreeActions &&
    (Boolean(onBulkEdit) || Boolean(onFindReplace));
  const hasGroupOps = showTreeActions && overflowMenuProps?.hasGroups === true;
  const hasOverflowActions = hasEditActions || hasGroupOps;
  const showOverflow = hasOverflowActions;
  const showCreate = viewMode === "tree";
  const showPrimaryCreateAction = onCreateToken !== undefined;
  const showViewMenu = hasTokens;
  const groupToggleAction =
    overflowMenuProps?.allGroupsExpanded === true
      ? overflowMenuProps.onCollapseAll
      : overflowMenuProps?.onExpandAll;
  const groupToggleLabel =
    overflowMenuProps?.allGroupsExpanded === true
      ? "Collapse all groups"
      : "Expand all groups";
  const showSecondaryCluster =
    (overflowMenuProps && viewMode === "tree") || showViewMenu || showOverflow;
  const sortOrder: SortOrder = overflowMenuProps?.sortOrder ?? "default";
  const viewMenuActive =
    overflowMenuProps !== null &&
    overflowMenuProps !== undefined &&
    (sortOrder !== "default" ||
      groupBy !== "path" ||
      overflowMenuProps.searchResultPresentation === "flat");
  const viewMenuLabel = "View";
  return (
    <div className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
      <div className="tm-responsive-toolbar tm-token-toolbar px-2 py-1">
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

            {showSearch ? (
              <div className="tm-responsive-toolbar__search relative">
                <div className="tm-token-toolbar__search-control">
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
                    aria-label={searchAriaLabel}
                    title={effectiveSearchTooltip}
                    onClear={() => {
                      setSearchQuery("");
                      setHintIndex(0);
                      searchRef.current?.focus();
                    }}
                    containerClassName="min-w-0 flex-1"
                  />
                  {showInlineSearchScopeToggle && overflowMenuProps ? (
                    <SegmentedControl
                      value={
                        overflowMenuProps.crossCollectionSearch
                          ? "all"
                          : "collection"
                      }
                      options={SEARCH_SCOPE_OPTIONS}
                      onChange={(value) => {
                        if (
                          (value === "all") !==
                          overflowMenuProps.crossCollectionSearch
                        ) {
                          overflowMenuProps.onToggleCrossCollectionSearch();
                        }
                      }}
                      ariaLabel="Search scope"
                      allowWrap
                      size="compact"
                    />
                  ) : null}
                </div>

                {showQualifierHints &&
                viewMode === "tree" &&
                activeQueryToken.token.includes(":") &&
                qualifierHints.length > 0 ? (
                  <div
                    ref={qualifierHintsRef}
                    id="qualifier-hints-listbox"
                    role="listbox"
                    className="absolute left-0 top-full z-50 mt-0.5 max-h-48 w-full overflow-y-auto rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] shadow-[var(--shadow-popover)]"
                  >
                    {qualifierHints.map((hint, index) => (
                      <div
                        key={hint.id}
                        id={`qualifier-hint-${hint.id}`}
                        role="option"
                        aria-selected={index === hintIndex}
                        aria-disabled={hint.kind !== "replacement"}
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
                        <span className="font-mono font-semibold text-[color:var(--color-figma-text-accent)]">
                          {hint.label}
                        </span>
                        <span className="min-w-0 flex-1 whitespace-normal break-words leading-tight">
                          {hint.desc}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="min-w-[80px] flex-1" />
            )}
          </div>

          <div className="tm-responsive-toolbar__actions">
            {showSecondaryCluster ? (
              <div className="tm-token-toolbar__secondary">
                {overflowMenuProps && viewMode === "tree" ? (
                  <div className="tm-token-toolbar__filter">
                    <FilterMenu
                      {...overflowMenuProps}
                      searchQuery={searchQuery}
                      setSearchQuery={setSearchQuery}
                    />
                  </div>
                ) : null}

                {showViewMenu ? (
                  <div className="tm-token-toolbar__sort relative shrink-0">
                    <Button
                      ref={viewMenu.triggerRef}
                      onClick={viewMenu.toggle}
                      aria-expanded={viewMenu.open}
                      aria-haspopup="menu"
                      aria-label="View options"
                      title="View options"
                      variant="ghost"
                      size="sm"
                      wrap
                      className={`${TOOLBAR_BUTTON_CLASS} justify-start ${
                        viewMenu.open || viewMenuActive || viewMode === "json"
                          ? "bg-[var(--color-figma-accent)]/10 text-[color:var(--color-figma-text-accent)]"
                          : "text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)]"
                      }`}
                    >
                      <ArrowUpDown size={12} strokeWidth={1.5} aria-hidden />
                      <span className="tm-toolbar-action__label tm-token-toolbar__button-label tm-token-toolbar__secondary-label">
                        {viewMenuLabel}
                      </span>
                    </Button>

                    {viewMenu.open ? (
                      <div
                        ref={viewMenu.menuRef}
                        style={viewMenuStyle ?? { visibility: "hidden" }}
                        className={FLOATING_MENU_CLASS}
                        role="menu"
                      >
                        <MenuRadioGroup
                          label="View as"
                          value={viewMode}
                          options={VIEW_OPTIONS}
                          onChange={(value) => setViewMode(value)}
                          onSelect={closeViewMenu}
                        />

                        {overflowMenuProps && viewMode === "tree" ? (
                          <>
                            <MenuRadioGroup
                              label="Group by"
                              value={groupBy}
                              options={GROUP_OPTIONS}
                              onChange={(value) => setGroupBy(value)}
                              onSelect={closeViewMenu}
                            />
                            <MenuRadioGroup
                              label="Sort"
                              value={sortOrder}
                              options={SORT_OPTIONS}
                              onChange={(value) =>
                                overflowMenuProps.onSortOrderChange(value)
                              }
                              onSelect={closeViewMenu}
                            />
                            {showResultPresentationToggle ? (
                              <MenuRadioGroup
                                label="Search results"
                                value={overflowMenuProps.searchResultPresentation}
                                options={RESULT_OPTIONS}
                                onChange={
                                  overflowMenuProps.onSearchResultPresentationChange
                                }
                                onSelect={closeViewMenu}
                              />
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {showOverflow ? (
                  <div className="tm-token-toolbar__overflow relative shrink-0">
                    <Button
                      ref={actionsMenu.triggerRef}
                      type="button"
                      onClick={actionsMenu.toggle}
                      aria-expanded={actionsMenu.open}
                      aria-haspopup="menu"
                      aria-label="More actions"
                      title="More actions"
                      variant="ghost"
                      size="sm"
                      wrap
                      className={`tm-token-toolbar__overflow-button justify-start ${
                        actionsMenu.open
                          ? "bg-[var(--color-figma-bg-hover)] text-[color:var(--color-figma-text)]"
                          : ""
                      } disabled:opacity-40`}
                    >
                      <MoreHorizontal size={14} strokeWidth={1.5} aria-hidden />
                      <span className="tm-toolbar-action__label tm-token-toolbar__overflow-label">
                        More
                      </span>
                    </Button>

                    {actionsMenu.open ? (
                      <div
                        ref={actionsMenu.menuRef}
                        style={actionsMenuStyle ?? { visibility: "hidden" }}
                        className={FLOATING_MENU_CLASS}
                        role="menu"
                      >
                        {hasGroupOps ? (
                          <>
                            <MenuSectionLabel>Groups</MenuSectionLabel>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                if (groupToggleAction) {
                                  runMenuAction(groupToggleAction);
                                }
                              }}
                              className={FLOATING_MENU_ITEM_CLASS}
                            >
                              {groupToggleLabel}
                            </button>
                          </>
                        ) : null}

                        {hasEditActions ? (
                          <>
                            {hasGroupOps ? (
                              <div className="h-1.5" aria-hidden />
                            ) : null}
                            <MenuSectionLabel>Edit</MenuSectionLabel>
                            {onBulkEdit ? (
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => runMenuAction(onBulkEdit)}
                                className={FLOATING_MENU_ITEM_CLASS}
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
                                className={FLOATING_MENU_ITEM_CLASS}
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
            ) : null}

            {showCreate ? (
              <div className="tm-token-toolbar__create relative shrink-0">
                <div className="flex items-center gap-1">
                  {showPrimaryCreateAction ? (
                    <div className="tm-token-toolbar__split-button">
                      <Button
                        type="button"
                        onClick={() => onCreateToken?.()}
                        disabled={!connected}
                        title="New token"
                        aria-label="New token"
                        variant="primary"
                        size="sm"
                        wrap
                        className="tm-token-toolbar__split-button-primary rounded-r-none border-r border-white/15 pr-2"
                      >
                        <Plus size={12} strokeWidth={2} aria-hidden />
                        <span className="tm-toolbar-action__label tm-token-toolbar__button-label tm-token-toolbar__primary-label">
                          New token
                        </span>
                      </Button>
                      <Button
                        ref={createMenu.triggerRef}
                        type="button"
                        onClick={createMenu.toggle}
                        disabled={!connected}
                        aria-expanded={createMenu.open}
                        aria-haspopup="menu"
                        aria-label="More create actions"
                        title="More create actions"
                        variant="primary"
                        size="sm"
                        className="tm-token-toolbar__split-button-toggle rounded-l-none px-0"
                      >
                        <ChevronDown size={12} strokeWidth={1.8} aria-hidden />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      ref={createMenu.triggerRef}
                      type="button"
                      onClick={createMenu.toggle}
                      disabled={!connected}
                      aria-expanded={createMenu.open}
                      aria-haspopup="menu"
                      aria-label="Create"
                      title="Create"
                      variant="primary"
                      size="sm"
                      wrap
                      className={`${TOOLBAR_BUTTON_CLASS} justify-start disabled:opacity-40`}
                    >
                      <Plus size={12} strokeWidth={2} aria-hidden />
                      <span className="tm-toolbar-action__label tm-token-toolbar__button-label tm-token-toolbar__primary-label">
                        Create
                      </span>
                      <ChevronDown size={12} strokeWidth={1.8} aria-hidden />
                    </Button>
                  )}

                </div>

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
                      className={FLOATING_MENU_ITEM_CLASS}
                    >
                      New group
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => runCreateAction(openTableCreate)}
                      disabled={!connected}
                      className={FLOATING_MENU_ITEM_CLASS}
                    >
                      New tokens
                    </button>
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
                          className={FLOATING_MENU_ITEM_CLASS}
                        >
                          Create generator
                        </button>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

          </div>
        </div>

        {hasChipRow ? (
          <div className="tm-responsive-toolbar__chips tm-token-toolbar__chips">
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
                    ? "bg-[var(--color-figma-accent)]/15 text-[color:var(--color-figma-text-accent)]"
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
