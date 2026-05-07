import { useCallback } from "react";
import { Check, Filter } from "lucide-react";
import type { SortOrder } from "./tokenListTypes";
import { useDropdownMenu } from "../hooks/useDropdownMenu";
import { TOKEN_TYPE_CATEGORIES } from "../shared/tokenTypeCategories";
import { useAnchoredFloatingStyle } from "../shared/floatingPosition";
import { FLOATING_MENU_WIDE_CLASS } from "../shared/menuClasses";
import {
  getQueryQualifierValues,
  setQueryQualifierValues,
} from "./tokenListUtils";

export interface ViewMenuProps {
  sortOrder: SortOrder;
  onSortOrderChange: (order: SortOrder) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  hasGroups: boolean;
  allGroupsExpanded: boolean;
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
      role={checked !== undefined ? "menuitemcheckbox" : "menuitem"}
      aria-checked={checked}
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-2 px-2.5 py-1 text-left text-secondary transition-colors disabled:opacity-40 ${
        danger
          ? "text-[color:var(--color-figma-text-error)] hover:bg-[var(--color-figma-error)]/10"
          : "text-[color:var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
      }`}
    >
      <span className="w-3 shrink-0 text-center">
        {checked ? <CheckIcon /> : null}
      </span>
      <span className="min-w-0 flex-1 text-left leading-tight [overflow-wrap:anywhere]">
        {label}
      </span>
      {suffix && (
        <span className="shrink-0 text-[color:var(--color-figma-text-tertiary)]">
          {suffix}
        </span>
      )}
      {shortcut && (
        <span className="shrink-0 font-mono text-secondary text-[color:var(--color-figma-text-tertiary)]">
          {shortcut}
        </span>
      )}
    </button>
  );
}

function MenuLabel({ children }: { children: string }) {
  return (
    <div className="px-2.5 pt-1.5 pb-0.5 text-secondary font-semibold text-[color:var(--color-figma-text-tertiary)]">
      {children}
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
  const menuStyle = useAnchoredFloatingStyle({
    triggerRef,
    open,
    preferredWidth: 240,
    preferredHeight: 420,
    align: "end",
  });
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
  const referenceOptions: Array<{
    key: "all" | "aliases" | "direct";
    label: string;
  }> = [
    { key: "all", label: "All values" },
    { key: "aliases", label: "Alias references" },
    { key: "direct", label: "Literal values" },
  ];

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Filter options"
        aria-pressed={props.activeCount > 0}
        className={`inline-flex min-h-[24px] items-center gap-1 rounded px-2 text-secondary font-medium transition-colors ${
          open || props.activeCount > 0
            ? "bg-[var(--color-figma-accent)]/10 text-[color:var(--color-figma-text-accent)]"
            : "text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)]"
        }`}
        title="Filter options"
      >
        <Filter size={12} strokeWidth={1.5} aria-hidden />
        <span className="tm-token-toolbar__button-label">Filters</span>
        {props.activeCount > 0 && (
          <span className="ml-0.5 inline-flex h-[14px] min-w-[14px] items-center justify-center rounded-full bg-[var(--color-figma-action-bg)] px-1 text-[var(--font-size-xs)] font-semibold leading-none text-[color:var(--color-figma-text-onbrand)]">
            {props.activeCount}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={menuRef}
          style={menuStyle ?? { visibility: "hidden" }}
          className={FLOATING_MENU_WIDE_CLASS}
          role="menu"
        >
          <div className="max-h-[420px] overflow-y-auto">
            <MenuLabel>Show</MenuLabel>
            {!props.crossCollectionSearch && props.lintCount > 0 && (
              <MenuItem
                label="Tokens with issues"
                checked={props.showIssuesOnly}
                suffix={`${props.lintCount}`}
                onClick={() =>
                  runAndClose(() => props.onToggleIssuesOnly?.())
                }
              />
            )}
            {!props.crossCollectionSearch && props.recentlyTouchedCount > 0 && (
              <MenuItem
                label="Recently touched"
                checked={props.showRecentlyTouched}
                suffix={`${props.recentlyTouchedCount}`}
                onClick={() =>
                  runAndClose(props.onToggleRecentlyTouched)
                }
              />
            )}
            {!props.crossCollectionSearch && props.starredCount > 0 && (
              <MenuItem
                label="Starred"
                checked={props.showStarredOnly}
                suffix={`${props.starredCount}`}
                onClick={() => runAndClose(props.onToggleStarredOnly)}
              />
            )}
            {!props.crossCollectionSearch && (
              <MenuItem
                label="Used on selection"
                checked={props.inspectMode}
                onClick={() => runAndClose(props.onToggleInspectMode)}
              />
            )}
            <MenuItem
              label="Shared values"
              checked={props.showDuplicates}
              onClick={() => runAndClose(props.onToggleDuplicates)}
            />
            {props.crossCollectionSearch ? (
              <div className="px-2.5 pt-1 text-secondary text-[color:var(--color-figma-text-tertiary)]">
                Selection, review, and starred filters stay local to one collection.
              </div>
            ) : null}

            <div className={MENU_SECTION_BORDER}>
              <MenuLabel>Value source</MenuLabel>
            </div>
            {referenceOptions.map((option) => (
              <MenuItem
                key={option.key}
                label={option.label}
                checked={props.refFilter === option.key}
                onClick={() =>
                  runAndClose(() => {
                    props.onRefFilterChange(option.key);
                  })
                }
              />
            ))}

            <div className={MENU_SECTION_BORDER}>
              <MenuLabel>Filter by type</MenuLabel>
            </div>
            {typeCategoryEntries.map((entry) => (
              <MenuItem
                key={entry.group}
                label={entry.group}
                checked={entry.checked}
                onClick={() =>
                  runAndClose(() => {
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
                  })
                }
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
