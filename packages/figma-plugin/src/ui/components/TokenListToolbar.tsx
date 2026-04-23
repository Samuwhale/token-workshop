import { useCallback, type MutableRefObject } from "react";
import { ArrowLeft, ChevronDown, MoreVertical, Plus, Search, X } from "lucide-react";
import {
  FilterMenu,
  type TokenListOverflowMenuProps,
} from "./TokenListOverflowMenu";
import type { ToolbarStateChip } from "./token-list/useToolbarStateChips";
import { replaceQueryToken } from "./tokenListUtils";
import { useDropdownMenu } from "../hooks/useDropdownMenu";
import type { TokenGroupBy } from "./tokenListTypes";

interface QualifierHint {
  id: string;
  label: string;
  desc: string;
  replacement?: string;
  kind: "replacement" | "hint";
}

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
}

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <div className="inline-flex rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] p-0.5">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={selected}
            className={`rounded px-2 py-1 text-secondary font-medium transition-colors ${
              selected
                ? "bg-[var(--color-figma-text)] text-[var(--color-figma-bg)]"
                : "text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

interface ToolbarSelectProps<T extends string> {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
}

function ToolbarSelect<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: ToolbarSelectProps<T>) {
  return (
    <div className="relative shrink-0">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        aria-label={ariaLabel}
        className="min-h-[30px] rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] py-1 pl-2 pr-7 text-secondary font-medium text-[var(--color-figma-text)] outline-none transition-colors focus-visible:border-[var(--color-figma-accent)] appearance-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={12}
        strokeWidth={1.5}
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-figma-text-tertiary)]"
        aria-hidden
      />
    </div>
  );
}

function ToolbarChip({ chip }: { chip: ToolbarStateChip }) {
  return (
    <button
      type="button"
      onClick={chip.onRemove}
      disabled={!chip.onRemove}
      className="inline-flex items-center gap-1 rounded-md bg-[var(--color-figma-accent)]/10 px-2 py-1 text-secondary text-[var(--color-figma-accent)] transition-colors hover:bg-[var(--color-figma-accent)]/15 disabled:cursor-default"
      title={chip.onRemove ? `Remove ${chip.label}` : chip.label}
    >
      <span className="truncate">{chip.label}</span>
      {chip.onRemove ? <X size={10} strokeWidth={1.5} aria-hidden /> : null}
    </button>
  );
}

const TREE_VIEW_OPTIONS: SegmentedOption<"tree" | "json">[] = [
  { value: "tree", label: "Tokens" },
  { value: "json", label: "JSON" },
];

const SEARCH_SCOPE_OPTIONS: SegmentedOption<"collection" | "all">[] = [
  { value: "collection", label: "This collection" },
  { value: "all", label: "All collections" },
];

const GROUP_OPTIONS: SegmentedOption<TokenGroupBy>[] = [
  { value: "path", label: "Hierarchy" },
  { value: "type", label: "By type" },
];

const SORT_OPTIONS: SegmentedOption<"default" | "alpha-asc" | "by-type">[] = [
  { value: "default", label: "Collection order" },
  { value: "alpha-asc", label: "A to Z" },
  { value: "by-type", label: "Type order" },
];

const RESULT_OPTIONS: SegmentedOption<"grouped" | "flat">[] = [
  { value: "grouped", label: "Grouped matches" },
  { value: "flat", label: "Flat matches" },
];

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
  onCreateNew?: () => void;
  openTableCreate: () => void;
  handleOpenNewGroupDialog: () => void;
  onShowPasteModal?: () => void;
  onCreateGeneratedGroup?: () => void;
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
  onCreateNew,
  openTableCreate,
  handleOpenNewGroupDialog,
  onShowPasteModal,
  onCreateGeneratedGroup,
  onSelectTokens,
  onBulkEdit,
  onFindReplace,
  overflowMenuProps,
}: TokenListToolbarProps) {
  const {
    open: createToolsMenuOpen,
    menuRef: createToolsMenuRef,
    triggerRef: createToolsMenuButtonRef,
    toggle: toggleCreateToolsMenu,
    close: closeCreateToolsMenu,
  } = useDropdownMenu();

  const {
    open: actionsMenuOpen,
    menuRef: actionsMenuRef,
    triggerRef: actionsMenuButtonRef,
    toggle: toggleActionsMenu,
    close: closeActionsMenu,
  } = useDropdownMenu();

  const runCreateToolsAction = useCallback((action: () => void) => {
    action();
    closeCreateToolsMenu({ restoreFocus: false });
  }, [closeCreateToolsMenu]);

  const runActionsAction = useCallback((action: () => void) => {
    action();
    closeActionsMenu({ restoreFocus: false });
  }, [closeActionsMenu]);

  const searchScope =
    overflowMenuProps?.crossCollectionSearch === true ? "all" : "collection";
  const searchPlaceholder =
    searchScope === "all"
      ? "Search name, value, or type across collections"
      : "Search name, value, or type in this collection";

  return (
    <div className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
      <div className="flex flex-col gap-2 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1">
              {onNavigateBack && (navHistoryLength ?? 0) > 0 && (
                <button
                  type="button"
                  onClick={onNavigateBack}
                  className="shrink-0 rounded p-1 text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
                  title="Back (Alt+←)"
                  aria-label="Back"
                >
                  <ArrowLeft size={12} strokeWidth={1.5} aria-hidden />
                </button>
              )}
              {zoomRootPath && (
                <span
                  className="truncate text-secondary text-[var(--color-figma-text-tertiary)]"
                  title={`Scoped to ${zoomRootPath}`}
                >
                  / {zoomRootPath}
                </span>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            {hasTokens && (
              <SegmentedControl
                value={viewMode}
                options={TREE_VIEW_OPTIONS}
                onChange={setViewMode}
              />
            )}

            <div className="relative shrink-0">
              <button
                ref={createToolsMenuButtonRef}
                type="button"
                onClick={toggleCreateToolsMenu}
                disabled={!connected}
                aria-expanded={createToolsMenuOpen}
                aria-haspopup="menu"
                className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40"
                title="Create token, group, or collection"
                aria-label="Create token, group, or collection"
              >
                <Plus size={12} strokeWidth={1.5} aria-hidden />
              </button>

              {createToolsMenuOpen && (
                <div
                  ref={createToolsMenuRef}
                  className="absolute right-0 top-full z-50 mt-1 w-44 rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] py-0.5 shadow-lg"
                  role="menu"
                >
                  {onCreateNew && (
                    <button
                      role="menuitem"
                      onClick={() => runCreateToolsAction(onCreateNew)}
                      disabled={!connected}
                      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-secondary text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)] disabled:opacity-40"
                    >
                      New token
                    </button>
                  )}
                  <button
                    role="menuitem"
                    onClick={() => runCreateToolsAction(handleOpenNewGroupDialog)}
                    disabled={!connected}
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-secondary text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)] disabled:opacity-40"
                  >
                    New group
                  </button>
                  {onCreateGeneratedGroup && (
                    <button
                      role="menuitem"
                      onClick={() => runCreateToolsAction(onCreateGeneratedGroup)}
                      disabled={!connected}
                      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-secondary text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)] disabled:opacity-40"
                    >
                      Generate group…
                    </button>
                  )}
                  <div className="my-0.5 border-t border-[var(--color-figma-border)]" />
                  {onShowPasteModal && (
                    <button
                      role="menuitem"
                      onClick={() => runCreateToolsAction(() => onShowPasteModal())}
                      disabled={!connected}
                      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-secondary text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)] disabled:opacity-40"
                    >
                      Paste JSON
                    </button>
                  )}
                  <button
                    role="menuitem"
                    onClick={() => runCreateToolsAction(openTableCreate)}
                    disabled={!connected}
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-secondary text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)] disabled:opacity-40"
                  >
                    Token table
                  </button>
                </div>
              )}
            </div>

            {(onSelectTokens || onBulkEdit || onFindReplace) && (
              <div className="relative shrink-0">
                <button
                  ref={actionsMenuButtonRef}
                  type="button"
                  onClick={toggleActionsMenu}
                  disabled={!connected}
                  aria-expanded={actionsMenuOpen}
                  aria-haspopup="menu"
                  aria-label="Edit actions"
                  className={`inline-flex h-[30px] w-[30px] items-center justify-center rounded-md transition-colors ${
                    actionsMenuOpen
                      ? "bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]"
                      : "text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
                  } disabled:opacity-40`}
                  title="Edit actions"
                >
                  <MoreVertical size={12} strokeWidth={1.5} aria-hidden />
                </button>
                {actionsMenuOpen && (
                  <div
                    ref={actionsMenuRef}
                    className="absolute right-0 top-full z-50 mt-1 w-44 rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] py-0.5 shadow-lg"
                    role="menu"
                  >
                    {onSelectTokens && (
                      <button
                        role="menuitem"
                        onClick={() => runActionsAction(onSelectTokens)}
                        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-secondary text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)]"
                      >
                        Select tokens
                      </button>
                    )}
                    {onBulkEdit && (
                      <button
                        role="menuitem"
                        onClick={() => runActionsAction(onBulkEdit)}
                        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-secondary text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)]"
                      >
                        Bulk edit
                      </button>
                    )}
                    {onFindReplace && (
                      <button
                        role="menuitem"
                        onClick={() => runActionsAction(onFindReplace)}
                        disabled={!connected}
                        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-secondary text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)] disabled:opacity-40"
                      >
                        Find and replace
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {hasTokens && viewMode === "tree" && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-0 flex-[1_1_240px]">
                <div className="flex min-h-[32px] items-center gap-1.5 rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2">
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
                    aria-expanded={
                      showQualifierHints && qualifierHints.length > 0
                    }
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
                    title={searchTooltip}
                    className="min-w-[40px] flex-1 bg-transparent py-1 text-secondary text-[var(--color-figma-text)] outline-none placeholder:text-[var(--color-figma-text-tertiary)]"
                  />
                  {searchQuery && (
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
                  )}
                </div>

                {showQualifierHints &&
                  activeQueryToken.token.includes(":") &&
                  qualifierHints.length > 0 && (
                    <div
                      ref={qualifierHintsRef}
                      id="qualifier-hints-listbox"
                      role="listbox"
                      className="absolute left-0 top-full z-50 mt-0.5 max-h-48 w-full overflow-y-auto rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] shadow-lg"
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
                  )}
              </div>

              {overflowMenuProps?.hasMultipleCollections && (
                <SegmentedControl
                  value={searchScope}
                  options={SEARCH_SCOPE_OPTIONS}
                  onChange={(nextScope) => {
                    const shouldSearchAll = nextScope === "all";
                    if (
                      overflowMenuProps.crossCollectionSearch !==
                      shouldSearchAll
                    ) {
                      overflowMenuProps.onToggleCrossCollectionSearch();
                    }
                  }}
                />
              )}

              {overflowMenuProps && (
                <FilterMenu
                  {...overflowMenuProps}
                  searchQuery={searchQuery}
                  setSearchQuery={setSearchQuery}
                />
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                {toolbarStateChips.map((chip) => (
                  <ToolbarChip key={chip.key} chip={chip} />
                ))}
              </div>

              {overflowMenuProps && (
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  <SegmentedControl
                    value={groupBy}
                    options={GROUP_OPTIONS}
                    onChange={setGroupBy}
                  />
                  <ToolbarSelect
                    value={overflowMenuProps.sortOrder}
                    options={SORT_OPTIONS}
                    onChange={overflowMenuProps.onSortOrderChange}
                    ariaLabel="Sort tokens"
                  />
                  {overflowMenuProps.hasGroups ? (
                    <button
                      type="button"
                      onClick={
                        overflowMenuProps.allGroupsExpanded
                          ? overflowMenuProps.onCollapseAll
                          : overflowMenuProps.onExpandAll
                      }
                      className="min-h-[30px] rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-secondary font-medium text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
                    >
                      {overflowMenuProps.allGroupsExpanded
                        ? "Collapse groups"
                        : "Expand groups"}
                    </button>
                  ) : null}
                  {overflowMenuProps.canToggleSearchResultPresentation && (
                    <SegmentedControl
                      value={overflowMenuProps.searchResultPresentation}
                      options={RESULT_OPTIONS}
                      onChange={
                        overflowMenuProps.onSearchResultPresentationChange
                      }
                    />
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
