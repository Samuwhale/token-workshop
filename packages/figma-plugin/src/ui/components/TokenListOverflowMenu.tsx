import { useCallback } from "react";
import { Check, Eye, Filter } from "lucide-react";
import type { SortOrder, TokenGroupBy } from "./tokenListTypes";
import type { FilterPreset } from "../hooks/useTokenSearch";
import { useDropdownMenu } from "../hooks/useDropdownMenu";
import { TOKEN_TYPE_CATEGORIES } from "../shared/tokenTypeCategories";
import {
  getQueryQualifierValues,
  setQueryQualifierValues,
} from "./tokenListUtils";

export interface ViewMenuProps {
  groupBy: TokenGroupBy;
  setGroupBy: (value: TokenGroupBy) => void;
  sortOrder: SortOrder;
  onSortOrderChange: (order: SortOrder) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  hasGroups: boolean;
  allGroupsExpanded: boolean;
  hasCollections: boolean;
  canToggleSearchResultPresentation: boolean;
  searchResultPresentation: "grouped" | "flat";
  onSearchResultPresentationChange: (
    presentation: "grouped" | "flat",
  ) => void;
}

export interface FilterMenuProps {
  showIssuesOnly: boolean;
  onToggleIssuesOnly?: () => void;
  lintCount: number;
  recentlyTouchedCount: number;
  showRecentlyTouched: boolean;
  onToggleRecentlyTouched: () => void;
  starredCount: number;
  showStarredOnly: boolean;
  onToggleStarredOnly: () => void;
  inspectMode: boolean;
  onToggleInspectMode: () => void;
  crossCollectionSearch: boolean;
  onToggleCrossCollectionSearch: () => void;
  hasMultipleCollections: boolean;
  refFilter: "all" | "aliases" | "direct";
  onRefFilterChange: (v: "all" | "aliases" | "direct") => void;
  showDuplicates: boolean;
  onToggleDuplicates: () => void;
  filterPresets: FilterPreset[];
  onApplyFilterPreset: (preset: FilterPreset) => void;
  onDeleteFilterPreset: (id: string) => void;
  activeCount: number;
}

export interface TokenListOverflowMenuProps
  extends ViewMenuProps,
    FilterMenuProps {}

const MENU_SECTION_BORDER =
  "border-t border-[var(--color-figma-border)] mt-0.5 pt-0.5";

function CheckIcon() {
  return <Check size={10} strokeWidth={1.5} className="shrink-0" aria-hidden />;
}

function MenuItem({
  label,
  checked,
  disabled,
  danger,
  shortcut,
  onClick,
  suffix,
}: {
  label: string;
  checked?: boolean;
  disabled?: boolean;
  danger?: boolean;
  shortcut?: string;
  onClick: () => void;
  suffix?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-2 px-2.5 py-1 text-left text-secondary transition-colors disabled:opacity-40 ${
        danger
          ? "text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10"
          : "text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
      }`}
    >
      <span className="w-3 shrink-0 text-center">
        {checked ? <CheckIcon /> : null}
      </span>
      <span className="flex-1 truncate">{label}</span>
      {suffix && (
        <span className="shrink-0 text-[var(--color-figma-text-tertiary)]">
          {suffix}
        </span>
      )}
      {shortcut && (
        <span className="shrink-0 font-mono text-secondary text-[var(--color-figma-text-tertiary)]">
          {shortcut}
        </span>
      )}
    </button>
  );
}

function MenuLabel({ children }: { children: string }) {
  return (
    <div className="px-2.5 pt-1.5 pb-0.5 text-secondary font-semibold text-[var(--color-figma-text-tertiary)]">
      {children}
    </div>
  );
}

export function ViewMenu(
  props: ViewMenuProps & {
    viewMode: "tree" | "json";
    setViewMode: (mode: "tree" | "json") => void;
  },
) {
  const { open, menuRef, triggerRef, toggle, close } = useDropdownMenu();
  const runAndClose = useCallback(
    (fn: () => void) => {
      fn();
      close({ restoreFocus: false });
    },
    [close],
  );

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="View options"
        className={`inline-flex min-h-[24px] items-center gap-1 rounded px-2 text-secondary font-medium transition-colors ${
          open
            ? "bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]"
            : "text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
        }`}
        title="View options"
      >
        <Eye size={12} strokeWidth={1.5} aria-hidden />
        <span>View</span>
      </button>

      {open && (
        <div
          ref={menuRef}
          className="absolute right-0 top-full z-50 mt-1 w-[224px] overflow-hidden rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] py-1 shadow-xl"
          role="menu"
        >
          <div className="max-h-[420px] overflow-y-auto">
            <MenuItem
              label="JSON editor"
              checked={props.viewMode === "json"}
              onClick={() => runAndClose(() => props.setViewMode(props.viewMode === "json" ? "tree" : "json"))}
            />
            <div className={MENU_SECTION_BORDER} />
            <MenuItem
              label={
                props.sortOrder === "default"
                  ? "Sort: default order"
                  : props.sortOrder === "alpha-asc"
                    ? "Sort: A to Z"
                    : "Sort: by type"
              }
              onClick={() =>
                runAndClose(() => {
                  const next: SortOrder =
                    props.sortOrder === "default"
                      ? "alpha-asc"
                      : props.sortOrder === "alpha-asc"
                        ? "by-type"
                        : "default";
                  props.onSortOrderChange(next);
                })
              }
            />
            <MenuItem
              label={`Group by: ${props.groupBy}`}
              onClick={() =>
                runAndClose(() =>
                  props.setGroupBy(props.groupBy === "path" ? "type" : "path"),
                )
              }
            />
            {props.hasGroups && (
              <MenuItem
                label={props.allGroupsExpanded ? "Collapse groups" : "Expand groups"}
                onClick={() =>
                  runAndClose(() => {
                    if (props.allGroupsExpanded) {
                      props.onCollapseAll();
                    } else {
                      props.onExpandAll();
                    }
                  })
                }
              />
            )}
            {props.canToggleSearchResultPresentation && (
              <MenuItem
                label={
                  props.searchResultPresentation === "grouped"
                    ? "Grouped"
                    : "Flat"
                }
                checked={props.searchResultPresentation === "flat"}
                onClick={() =>
                  runAndClose(() =>
                    props.onSearchResultPresentationChange(
                      props.searchResultPresentation === "grouped"
                        ? "flat"
                        : "grouped",
                    ),
                  )
                }
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function FilterMenu(
  props: FilterMenuProps & {
    searchQuery: string;
    setSearchQuery: (q: string) => void;
  },
) {
  const { open, menuRef, triggerRef, toggle, close } = useDropdownMenu();
  const runAndClose = useCallback(
    (fn: () => void) => {
      fn();
      close({ restoreFocus: false });
    },
    [close],
  );
  const activeTypeValues = new Set(
    getQueryQualifierValues(props.searchQuery, "type"),
  );
  const typeCategoryEntries = TOKEN_TYPE_CATEGORIES.map((category) => {
    const values = category.options.map((option) => option.value.toLowerCase());
    const checked = values.every((value) => activeTypeValues.has(value));
    return { group: category.group, values, checked };
  });

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Filter options"
        className={`inline-flex min-h-[24px] items-center gap-1 rounded px-2 text-secondary font-medium transition-colors ${
          open || props.activeCount > 0
            ? "bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]"
            : "text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
        }`}
        title="Filter options"
      >
        <Filter size={12} strokeWidth={1.5} aria-hidden />
        <span>Filter</span>
        {props.activeCount > 0 && <span>{props.activeCount}</span>}
      </button>

      {open && (
        <div
          ref={menuRef}
          className="absolute right-0 top-full z-50 mt-1 w-[200px] overflow-hidden rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] py-1 shadow-xl"
          role="menu"
        >
          <div className="max-h-[420px] overflow-y-auto">
            {props.lintCount > 0 && (
              <MenuItem
                label="Only tokens with issues"
                checked={props.showIssuesOnly}
                suffix={`${props.lintCount}`}
                onClick={() =>
                  runAndClose(() => props.onToggleIssuesOnly?.())
                }
              />
            )}
            {props.recentlyTouchedCount > 0 && (
              <MenuItem
                label="Recently touched"
                checked={props.showRecentlyTouched}
                suffix={`${props.recentlyTouchedCount}`}
                onClick={() =>
                  runAndClose(props.onToggleRecentlyTouched)
                }
              />
            )}
            {props.starredCount > 0 && (
              <MenuItem
                label="Only starred"
                checked={props.showStarredOnly}
                suffix={`${props.starredCount}`}
                onClick={() => runAndClose(props.onToggleStarredOnly)}
              />
            )}
            <MenuItem
              label="Related to selection"
              checked={props.inspectMode}
              onClick={() => runAndClose(props.onToggleInspectMode)}
            />
            {props.hasMultipleCollections && (
              <MenuItem
                label="Search across all collections"
                checked={props.crossCollectionSearch}
                onClick={() => runAndClose(props.onToggleCrossCollectionSearch)}
              />
            )}
            <MenuItem
              label={
                props.refFilter === "all"
                  ? "Reference mode: all tokens"
                  : props.refFilter === "aliases"
                    ? "Reference mode: alias tokens"
                    : "Reference mode: direct values"
              }
              onClick={() =>
                runAndClose(() => {
                  const next =
                    props.refFilter === "all"
                      ? "aliases"
                      : props.refFilter === "aliases"
                        ? "direct"
                        : "all";
                  props.onRefFilterChange(
                    next as "all" | "aliases" | "direct",
                  );
                })
              }
              checked={props.refFilter !== "all"}
            />
            <MenuItem
              label="Duplicate values only"
              checked={props.showDuplicates}
              onClick={() => runAndClose(props.onToggleDuplicates)}
            />

            <div className={MENU_SECTION_BORDER}>
              <MenuLabel>Filter by type</MenuLabel>
            </div>
            {typeCategoryEntries.map((entry) => (
              <MenuItem
                key={entry.group}
                label={entry.group}
                checked={entry.checked}
                onClick={() => {
                  const next = new Set(activeTypeValues);
                  if (entry.checked) {
                    entry.values.forEach((value) => next.delete(value));
                  } else {
                    entry.values.forEach((value) => next.add(value));
                  }
                  props.setSearchQuery(
                    setQueryQualifierValues(
                      props.searchQuery,
                      "type",
                      Array.from(next),
                    ),
                  );
                }}
              />
            ))}

            {props.filterPresets.length > 0 && (
              <>
                <div className={MENU_SECTION_BORDER}>
                  <MenuLabel>Saved filters</MenuLabel>
                </div>
                {props.filterPresets.map((preset) => (
                  <MenuItem
                    key={preset.id}
                    label={preset.name}
                    onClick={() =>
                      runAndClose(() => props.onApplyFilterPreset(preset))
                    }
                  />
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
