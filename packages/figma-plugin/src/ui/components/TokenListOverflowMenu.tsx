import { useState, useRef, useEffect, useCallback } from "react";
import type { SortOrder } from "./tokenListTypes";
import type { Density } from "./tokenListTypes";
import type { FilterPreset } from "../hooks/useTokenSearch";
import { getMenuItems, handleMenuArrowKeys } from "../hooks/useMenuKeyboard";

export type LibraryViewMode = "library" | "mode-options" | "active-mode" | "json";

export interface ViewMenuProps {
  sortOrder: SortOrder;
  onSortOrderChange: (order: SortOrder) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  hasGroups: boolean;
  density: Density;
  onDensityChange: (d: Density) => void;
  condensedView: boolean;
  onCondensedViewChange: (v: boolean) => void;
  multiModeEnabled: boolean;
  onToggleMultiMode: () => void;
  modeLensEnabled: boolean;
  onToggleModeLens: () => void;
  hasCollections: boolean;
  showPreviewSplit: boolean;
  onTogglePreviewSplit?: () => void;
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
  inspectMode: boolean;
  onToggleInspectMode: () => void;
  crossSetSearch: boolean;
  onToggleCrossSetSearch: () => void;
  hasMultipleSets: boolean;
  refFilter: "all" | "aliases" | "direct";
  onRefFilterChange: (v: "all" | "aliases" | "direct") => void;
  showDuplicates: boolean;
  onToggleDuplicates: () => void;
  filterPresets: FilterPreset[];
  onApplyFilterPreset: (preset: FilterPreset) => void;
  onDeleteFilterPreset: (id: string) => void;
  activeCount: number;
}

export interface ToolsSyncMenuProps {
  onSelectTokens: () => void;
  onBulkEdit: () => void;
  onFindReplace: () => void;
  onFoundationTemplates?: () => void;
  onApplyVariables: () => void;
  onApplyStyles: () => void;
  applyingOrLoading: boolean;
  tokensExist: boolean;
  connected: boolean;
}

export interface TokenListOverflowMenuProps
  extends ViewMenuProps,
    FilterMenuProps,
    ToolsSyncMenuProps {}

const MENU_SECTION_BORDER =
  "border-t border-[var(--color-figma-border)] mt-0.5 pt-0.5";

function CheckIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
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
      className={`flex w-full items-center gap-2 px-2.5 py-1 text-left text-[10px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
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
        <span className="shrink-0 font-mono text-[9px] text-[var(--color-figma-text-tertiary)]">
          {shortcut}
        </span>
      )}
    </button>
  );
}

function MenuLabel({ children }: { children: string }) {
  return (
    <div className="px-2.5 pt-1.5 pb-0.5 text-[9px] font-semibold text-[var(--color-figma-text-tertiary)]">
      {children}
    </div>
  );
}

function useDropdownMenu() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
        return;
      }
      if (menuRef.current) {
        handleMenuArrowKeys(e, menuRef.current);
      }
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    window.requestAnimationFrame(() => {
      if (menuRef.current) getMenuItems(menuRef.current)[0]?.focus();
    });
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const runAndClose = useCallback(
    (fn: () => void) => {
      fn();
      close();
    },
    [close],
  );

  return { open, setOpen, containerRef, buttonRef, menuRef, runAndClose };
}

export function ViewMenu(props: ViewMenuProps & { currentLibraryViewMode: LibraryViewMode; onActivateViewMode: (mode: LibraryViewMode) => void }) {
  const { open, setOpen, containerRef, buttonRef, menuRef, runAndClose } =
    useDropdownMenu();
  const [groupsExpanded, setGroupsExpanded] = useState(true);

  return (
    <div className="relative shrink-0" ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="View options"
        className={`inline-flex min-h-[24px] items-center gap-1 rounded px-2 text-[10px] font-medium transition-colors ${
          open
            ? "bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]"
            : "text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
        }`}
        title="View options"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
        <span>
          {props.currentLibraryViewMode === "library"
            ? "View"
            : props.currentLibraryViewMode === "mode-options"
              ? "View: Modes"
              : props.currentLibraryViewMode === "active-mode"
                ? "View: Preview"
                : "View: JSON"}
        </span>
      </button>

      {open && (
        <div
          ref={menuRef}
          className="absolute right-0 top-full z-50 mt-1 w-[200px] overflow-hidden rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] py-1 shadow-xl"
          role="menu"
        >
          <div className="max-h-[420px] overflow-y-auto">
            <MenuItem
              label="Library"
              checked={props.currentLibraryViewMode === "library"}
              onClick={() => runAndClose(() => props.onActivateViewMode("library"))}
            />
            {props.hasCollections && (
              <MenuItem
                label="Mode Columns"
                checked={props.currentLibraryViewMode === "mode-options"}
                onClick={() => runAndClose(() => props.onActivateViewMode("mode-options"))}
              />
            )}
            {props.hasCollections && (
              <MenuItem
                label="Current Preview"
                checked={props.currentLibraryViewMode === "active-mode"}
                onClick={() => runAndClose(() => props.onActivateViewMode("active-mode"))}
              />
            )}
            <MenuItem
              label="JSON"
              checked={props.currentLibraryViewMode === "json"}
              onClick={() => runAndClose(() => props.onActivateViewMode("json"))}
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
            {props.hasGroups && (
              <MenuItem
                label={groupsExpanded ? "Collapse groups" : "Expand groups"}
                onClick={() =>
                  runAndClose(() => {
                    if (groupsExpanded) {
                      props.onCollapseAll();
                    } else {
                      props.onExpandAll();
                    }
                    setGroupsExpanded((v) => !v);
                  })
                }
              />
            )}
            <MenuItem
              label={
                props.density === "compact"
                  ? "Density: compact"
                  : "Density: comfortable"
              }
              onClick={() =>
                runAndClose(() =>
                  props.onDensityChange(
                    props.density === "compact" ? "comfortable" : "compact",
                  ),
                )
              }
            />
            <MenuItem
              label="Condense rows"
              checked={props.condensedView}
              onClick={() =>
                runAndClose(() =>
                  props.onCondensedViewChange(!props.condensedView),
                )
              }
            />
            {props.hasCollections && (
              <MenuItem
                label="Mode columns"
                checked={props.multiModeEnabled}
                onClick={() => runAndClose(props.onToggleMultiMode)}
              />
            )}
            {props.hasCollections && (
              <MenuItem
                label="Preview values"
                checked={props.modeLensEnabled}
                onClick={() => runAndClose(props.onToggleModeLens)}
              />
            )}
            <MenuItem
              label="Preview pane"
              checked={props.showPreviewSplit}
              onClick={() =>
                runAndClose(() => props.onTogglePreviewSplit?.())
              }
            />
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

export function FilterMenu(props: FilterMenuProps) {
  const { open, setOpen, containerRef, buttonRef, menuRef, runAndClose } =
    useDropdownMenu();

  return (
    <div className="relative shrink-0" ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Filter options"
        className={`inline-flex min-h-[24px] items-center gap-1 rounded px-2 text-[10px] font-medium transition-colors ${
          open || props.activeCount > 0
            ? "bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]"
            : "text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
        }`}
        title="Filter options"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
        </svg>
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
            <MenuItem
              label="Related to selection"
              checked={props.inspectMode}
              onClick={() => runAndClose(props.onToggleInspectMode)}
            />
            {props.hasMultipleSets && (
              <MenuItem
                label="Search across all collections"
                checked={props.crossSetSearch}
                onClick={() => runAndClose(props.onToggleCrossSetSearch)}
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
