import { useState, useRef, useEffect, useCallback } from "react";
import type { SortOrder } from "./tokenListTypes";
import type { Density } from "./tokenListTypes";
import type { FilterPreset } from "../hooks/useTokenSearch";

export interface TokenListOverflowMenuProps {
  // View
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
  hasDimensions: boolean;
  showPreviewSplit: boolean;
  onTogglePreviewSplit?: () => void;

  // Filter
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

  // Tools
  onSelectTokens: () => void;
  onBulkEdit: () => void;
  onFindReplace: () => void;
  onFoundationTemplates?: () => void;

  // Sync
  onApplyVariables: () => void;
  onApplyStyles: () => void;
  applyingOrLoading: boolean;
  tokensExist: boolean;

  connected: boolean;
  activeCount: number;
}

const MENU_SECTION_BORDER =
  "border-t border-[var(--color-figma-border)] mt-1 pt-1";

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
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[10px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
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
    <div className="px-3 pt-2 pb-1 text-[9px] font-semibold uppercase tracking-[0.06em] text-[var(--color-figma-text-tertiary)]">
      {children}
    </div>
  );
}

export function TokenListOverflowMenu(props: TokenListOverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

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
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
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

  return (
    <div className="relative shrink-0" ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`inline-flex items-center justify-center rounded border px-1.5 py-1.5 transition-colors ${
          open || props.activeCount > 0
            ? "border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]"
            : "border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)]/40 hover:text-[var(--color-figma-text)]"
        }`}
        title="More options"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
        {props.activeCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--color-figma-accent)] text-[8px] font-bold leading-none text-white">
            {props.activeCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-1 w-[220px] overflow-hidden rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] py-1 shadow-xl"
          role="menu"
        >
          <div className="max-h-[420px] overflow-y-auto">
            {/* ── View ── */}
            <MenuLabel>View</MenuLabel>
            <MenuItem
              label={
                props.sortOrder === "default"
                  ? "Sort: Default"
                  : props.sortOrder === "alpha-asc"
                    ? "Sort: A to Z"
                    : "Sort: By type"
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
              <>
                <MenuItem
                  label="Expand all"
                  onClick={() => runAndClose(props.onExpandAll)}
                />
                <MenuItem
                  label="Collapse all"
                  onClick={() => runAndClose(props.onCollapseAll)}
                />
              </>
            )}
            <MenuItem
              label={`Density: ${props.density === "compact" ? "Compact" : "Comfortable"}`}
              onClick={() =>
                runAndClose(() =>
                  props.onDensityChange(
                    props.density === "compact" ? "comfortable" : "compact",
                  ),
                )
              }
            />
            <MenuItem
              label="Condensed groups"
              checked={props.condensedView}
              onClick={() =>
                runAndClose(() =>
                  props.onCondensedViewChange(!props.condensedView),
                )
              }
            />
            {props.hasDimensions && (
              <MenuItem
                label="Mode columns"
                checked={props.multiModeEnabled}
                onClick={() => runAndClose(props.onToggleMultiMode)}
              />
            )}
            <MenuItem
              label="Split preview"
              checked={props.showPreviewSplit}
              onClick={() =>
                runAndClose(() => props.onTogglePreviewSplit?.())
              }
            />

            {/* ── Filter ── */}
            <div className={MENU_SECTION_BORDER}>
              <MenuLabel>Filter</MenuLabel>
            </div>
            {props.lintCount > 0 && (
              <MenuItem
                label="Issues only"
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
              label="Selection only"
              checked={props.inspectMode}
              onClick={() => runAndClose(props.onToggleInspectMode)}
            />
            {props.hasMultipleSets && (
              <MenuItem
                label="Search all sets"
                checked={props.crossSetSearch}
                onClick={() => runAndClose(props.onToggleCrossSetSearch)}
              />
            )}
            <MenuItem
              label={
                props.refFilter === "all"
                  ? "Values: All"
                  : props.refFilter === "aliases"
                    ? "Values: References"
                    : "Values: Direct"
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
              label="Duplicate values"
              checked={props.showDuplicates}
              onClick={() => runAndClose(props.onToggleDuplicates)}
            />

            {/* Filter presets */}
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

            {/* ── Tools ── */}
            <div className={MENU_SECTION_BORDER}>
              <MenuLabel>Tools</MenuLabel>
            </div>
            <MenuItem
              label="Select tokens..."
              shortcut="M"
              onClick={() => runAndClose(props.onSelectTokens)}
            />
            <MenuItem
              label="Bulk edit..."
              onClick={() => runAndClose(props.onBulkEdit)}
            />
            <MenuItem
              label="Find & Replace..."
              disabled={!props.connected}
              onClick={() => runAndClose(props.onFindReplace)}
            />
            {props.onFoundationTemplates && (
              <MenuItem
                label="Foundation templates..."
                onClick={() =>
                  runAndClose(() => props.onFoundationTemplates!())
                }
              />
            )}

            {/* ── Sync ── */}
            <div className={MENU_SECTION_BORDER}>
              <MenuLabel>Sync</MenuLabel>
            </div>
            <MenuItem
              label="Apply as Variables"
              disabled={props.applyingOrLoading || !props.tokensExist}
              onClick={() => runAndClose(props.onApplyVariables)}
            />
            <MenuItem
              label="Apply as Styles"
              disabled={props.applyingOrLoading || !props.tokensExist}
              onClick={() => runAndClose(props.onApplyStyles)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
