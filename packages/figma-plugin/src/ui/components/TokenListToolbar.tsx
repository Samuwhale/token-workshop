import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  type RefObject,
} from "react";
import {
  ViewMenu,
  FilterMenu,
  type TokenListOverflowMenuProps,
} from "./TokenListOverflowMenu";
import { replaceQueryToken } from "./tokenListUtils";
import { getMenuItems, handleMenuArrowKeys } from "../hooks/useMenuKeyboard";

export interface ToolbarStateChip {
  key: string;
  label: string;
  tone: "filter" | "view";
  onRemove?: () => void;
}

interface QualifierHint {
  id: string;
  label: string;
  desc: string;
  replacement?: string;
  kind: "replacement" | "hint";
}

import type { LibraryViewMode } from "./TokenListOverflowMenu";

export interface TokenListToolbarProps {
  onNavigateBack?: () => void;
  navHistoryLength?: number;
  setName: string;
  zoomRootPath?: string | null;
  searchRef: RefObject<HTMLInputElement | null>;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  hintIndex: number;
  setHintIndex: (fn: number | ((i: number) => number)) => void;
  showQualifierHints: boolean;
  setShowQualifierHints: (v: boolean) => void;
  qualifierHints: QualifierHint[];
  activeQueryToken: { token: string; start: number; end: number };
  searchTooltip: string;
  qualifierHintsRef: RefObject<HTMLDivElement | null>;
  structuredFilterChips: Array<{ token: string; label: string }>;
  toolbarStateChips: ToolbarStateChip[];
  contextSummary?: string | null;
  hasStructuredFilters: boolean;
  clearFilters: () => void;
  clearViewModes: () => void;
  connected: boolean;
  hasTokens: boolean;
  viewMode: "tree" | "json";
  setViewMode: (mode: "tree" | "json") => void;
  onCreateNew?: () => void;
  openTableCreate: () => void;
  handleOpenNewGroupDialog: () => void;
  onShowPasteModal?: () => void;
  onOpenImportPanel?: () => void;
  onOpenSetSwitcher?: () => void;
  hasDimensions: boolean;
  multiModeEnabled: boolean;
  onToggleMultiMode: () => void;
  themeLensEnabled: boolean;
  onToggleThemeLens: () => void;
  onCreateRecipe?: () => void;
  onSelectTokens?: () => void;
  onBulkEdit?: () => void;
  onFindReplace?: () => void;
  onFoundationTemplates?: () => void;
  onApplyVariables?: () => void;
  onApplyStyles?: () => void;
  applyingOrLoading?: boolean;
  tokensExist?: boolean;
  overflowMenuProps: TokenListOverflowMenuProps | null;
}

function ToolbarSummaryLine({
  label,
  items,
}: {
  label: string;
  items: ToolbarStateChip[];
}) {
  if (items.length === 0) return null;

  return (
    <div className="flex min-w-0 items-start gap-1.5 text-[9px] leading-tight">
      <span className="shrink-0 text-[var(--color-figma-text-tertiary)]">
        {label}
      </span>
      <div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5">
        {items.map((item, index) => (
          <span
            key={item.key}
            className="inline-flex min-w-0 items-center gap-1"
          >
            <button
              type="button"
              onClick={item.onRemove}
              disabled={!item.onRemove}
              className={`truncate ${
                item.tone === "filter"
                  ? "text-[var(--color-figma-accent)] hover:text-[var(--color-figma-text)]"
                  : "text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]"
              } disabled:cursor-default`}
              title={item.onRemove ? `Remove ${item.label}` : item.label}
            >
              {item.label}
            </button>
            {index < items.length - 1 && (
              <span
                aria-hidden="true"
                className="text-[var(--color-figma-text-tertiary)]/60"
              >
                ·
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

function getCurrentLibraryViewMode({
  viewMode,
  multiModeEnabled,
  themeLensEnabled,
}: {
  viewMode: "tree" | "json";
  multiModeEnabled: boolean;
  themeLensEnabled: boolean;
}): LibraryViewMode {
  if (viewMode === "json") return "json";
  if (multiModeEnabled) return "theme-options";
  if (themeLensEnabled) return "active-theme";
  return "library";
}

export function TokenListToolbar({
  onNavigateBack,
  navHistoryLength,
  setName,
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
  structuredFilterChips,
  toolbarStateChips,
  contextSummary,
  hasStructuredFilters,
  clearFilters,
  clearViewModes,
  connected,
  hasTokens,
  viewMode,
  setViewMode,
  onCreateNew,
  openTableCreate,
  handleOpenNewGroupDialog,
  onShowPasteModal,
  onOpenImportPanel,
  onOpenSetSwitcher,
  hasDimensions,
  multiModeEnabled,
  onToggleMultiMode,
  themeLensEnabled,
  onToggleThemeLens,
  onCreateRecipe,
  onSelectTokens,
  onBulkEdit,
  onFindReplace,
  onFoundationTemplates,
  onApplyVariables,
  onApplyStyles,
  applyingOrLoading,
  tokensExist,
  overflowMenuProps,
}: TokenListToolbarProps) {
  const [createToolsMenuOpen, setCreateToolsMenuOpen] = useState(false);
  const createToolsMenuContainerRef = useRef<HTMLDivElement>(null);
  const createToolsMenuButtonRef = useRef<HTMLButtonElement>(null);
  const createToolsMenuRef = useRef<HTMLDivElement>(null);
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
  const toolsMenuContainerRef = useRef<HTMLDivElement>(null);
  const toolsMenuButtonRef = useRef<HTMLButtonElement>(null);
  const toolsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!createToolsMenuOpen && !toolsMenuOpen) return;
    const onMouseDown = (event: MouseEvent) => {
      if (
        createToolsMenuContainerRef.current?.contains(event.target as Node) ||
        toolsMenuContainerRef.current?.contains(event.target as Node)
      ) {
        return;
      }
      setCreateToolsMenuOpen(false);
      setToolsMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setCreateToolsMenuOpen(false);
        setToolsMenuOpen(false);
        if (createToolsMenuOpen) {
          createToolsMenuButtonRef.current?.focus();
          return;
        }
        if (toolsMenuOpen) {
          toolsMenuButtonRef.current?.focus();
          return;
        }
      }
      if (createToolsMenuOpen && createToolsMenuRef.current) {
        handleMenuArrowKeys(event, createToolsMenuRef.current);
        return;
      }
      if (toolsMenuOpen && toolsMenuRef.current) {
        handleMenuArrowKeys(event, toolsMenuRef.current);
        return;
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    window.requestAnimationFrame(() => {
      if (createToolsMenuOpen && createToolsMenuRef.current) {
        getMenuItems(createToolsMenuRef.current)[0]?.focus();
      }
      if (toolsMenuOpen && toolsMenuRef.current) {
        getMenuItems(toolsMenuRef.current)[0]?.focus();
      }
    });
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [createToolsMenuOpen, toolsMenuOpen]);

  const runCreateToolsAction = useCallback((action: () => void) => {
    setCreateToolsMenuOpen(false);
    action();
  }, []);

  const runToolsAction = useCallback((action: () => void) => {
    setToolsMenuOpen(false);
    action();
  }, []);

  const currentLibraryViewMode = getCurrentLibraryViewMode({
    viewMode,
    multiModeEnabled,
    themeLensEnabled,
  });
  const filterItems = toolbarStateChips.filter((chip) => chip.tone === "filter");
  const viewItems = toolbarStateChips.filter((chip) => chip.tone === "view");
  const canClearFilters = hasStructuredFilters || filterItems.length > 0;
  const canClearView = viewItems.length > 0;

  const activateViewMode = useCallback(
    (nextMode: LibraryViewMode) => {
      if (nextMode === "json") {
        setViewMode("json");
        return;
      }

      if (viewMode !== "tree") {
        setViewMode("tree");
      }

      if (nextMode === "library") {
        if (multiModeEnabled) onToggleMultiMode();
        if (themeLensEnabled) onToggleThemeLens();
        return;
      }

      if (nextMode === "theme-options") {
        if (themeLensEnabled) onToggleThemeLens();
        if (!multiModeEnabled) onToggleMultiMode();
        return;
      }

      if (multiModeEnabled) onToggleMultiMode();
      if (!themeLensEnabled) onToggleThemeLens();
    },
    [
      multiModeEnabled,
      onToggleMultiMode,
      onToggleThemeLens,
      setViewMode,
      themeLensEnabled,
      viewMode,
    ],
  );

  return (
    <div className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
      <div className="flex flex-col gap-2 px-2 py-2">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1">
              {(navHistoryLength ?? 0) > 0 && (
                <button
                  type="button"
                  onClick={onNavigateBack}
                  className="shrink-0 rounded p-1 text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
                  title="Back (Alt+←)"
                  aria-label="Back"
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
                    <path d="M19 12H5M12 19l-7-7 7-7" />
                  </svg>
                </button>
              )}
              {onOpenSetSwitcher ? (
                <button
                  type="button"
                  onClick={onOpenSetSwitcher}
                  className="min-w-0 rounded px-1.5 py-0.5 text-left text-[12px] font-semibold text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
                  title="Switch set"
                >
                  <span className="truncate">{setName}</span>
                </button>
              ) : (
                <span className="truncate px-1.5 text-[12px] font-semibold text-[var(--color-figma-text)]">
                  {setName}
                </span>
              )}
              {zoomRootPath && (
                <span
                  className="truncate text-[10px] text-[var(--color-figma-text-tertiary)]"
                  title={`Scoped to ${zoomRootPath}`}
                >
                  in {zoomRootPath}
                </span>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <div className="relative shrink-0" ref={createToolsMenuContainerRef}>
              <button
                ref={createToolsMenuButtonRef}
                type="button"
                onClick={() => {
                  setToolsMenuOpen(false);
                  setCreateToolsMenuOpen((open) => !open);
                }}
                disabled={!connected}
                aria-expanded={createToolsMenuOpen}
                aria-haspopup="menu"
                className="inline-flex min-h-[24px] items-center gap-1 rounded bg-[var(--color-figma-bg)] px-2 text-[10px] font-medium text-[var(--color-figma-text)] shadow-[inset_0_0_0_1px_var(--color-figma-border)] transition-colors hover:bg-[var(--color-figma-bg-hover)] disabled:cursor-not-allowed disabled:opacity-40"
                title="Create or import"
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
                  <path d="M12 5v14M5 12h14" />
                </svg>
                <span>Create</span>
              </button>

              {createToolsMenuOpen && (
                <div
                  ref={createToolsMenuRef}
                  className="absolute right-0 top-full z-50 mt-1 w-48 rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] py-1 shadow-lg"
                  role="menu"
                >
                  <button
                    role="menuitem"
                    onClick={() => runCreateToolsAction(() => onCreateNew?.())}
                    disabled={!connected}
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    New token
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => runCreateToolsAction(handleOpenNewGroupDialog)}
                    disabled={!connected}
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    New group
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => runCreateToolsAction(openTableCreate)}
                    disabled={!connected}
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Token table
                  </button>
                  {onCreateRecipe && (
                    <button
                      role="menuitem"
                      onClick={() => runCreateToolsAction(onCreateRecipe)}
                      disabled={!connected}
                      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      New recipe
                    </button>
                  )}
                  <div className="my-0.5 border-t border-[var(--color-figma-border)]" />
                  <button
                    role="menuitem"
                    onClick={() =>
                      runCreateToolsAction(() => onShowPasteModal?.())
                    }
                    disabled={!connected}
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Paste JSON
                  </button>
                  <button
                    role="menuitem"
                    onClick={() =>
                      runCreateToolsAction(() => onOpenImportPanel?.())
                    }
                    disabled={!connected}
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Import tokens
                  </button>
                </div>
              )}
            </div>

            {(onSelectTokens ||
              onBulkEdit ||
              onFindReplace ||
              onFoundationTemplates ||
              onApplyVariables ||
              onApplyStyles) && (
              <div className="relative shrink-0" ref={toolsMenuContainerRef}>
                <button
                  ref={toolsMenuButtonRef}
                  type="button"
                  onClick={() => {
                    setCreateToolsMenuOpen(false);
                    setToolsMenuOpen((open) => !open);
                  }}
                  aria-expanded={toolsMenuOpen}
                  aria-haspopup="menu"
                  className="inline-flex min-h-[24px] items-center gap-1 rounded px-2 text-[10px] font-medium text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
                  title="Tools"
                >
                  <span>Tools</span>
                </button>

                {toolsMenuOpen && (
                  <div
                    ref={toolsMenuRef}
                    className="absolute right-0 top-full z-50 mt-1 w-44 rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] py-1 shadow-lg"
                    role="menu"
                  >
                    {onSelectTokens && (
                      <button
                        role="menuitem"
                        onClick={() => runToolsAction(onSelectTokens)}
                        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)]"
                      >
                        Select tokens
                      </button>
                    )}
                    {onBulkEdit && (
                      <button
                        role="menuitem"
                        onClick={() => runToolsAction(onBulkEdit)}
                        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)]"
                      >
                        Bulk edit
                      </button>
                    )}
                    {onFindReplace && (
                      <button
                        role="menuitem"
                        onClick={() => runToolsAction(onFindReplace)}
                        disabled={!connected}
                        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Find and replace
                      </button>
                    )}
                    {onFoundationTemplates && (
                      <button
                        role="menuitem"
                        onClick={() => runToolsAction(onFoundationTemplates)}
                        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)]"
                      >
                        Templates
                      </button>
                    )}
                    {(onApplyVariables || onApplyStyles) && (
                      <div className="my-0.5 border-t border-[var(--color-figma-border)]" />
                    )}
                    {onApplyVariables && (
                      <button
                        role="menuitem"
                        onClick={() => runToolsAction(onApplyVariables)}
                        disabled={applyingOrLoading || !tokensExist}
                        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Push variables
                      </button>
                    )}
                    {onApplyStyles && (
                      <button
                        role="menuitem"
                        onClick={() => runToolsAction(onApplyStyles)}
                        disabled={applyingOrLoading || !tokensExist}
                        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Push styles
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {overflowMenuProps && (
              <>
                <ViewMenu {...overflowMenuProps} currentLibraryViewMode={currentLibraryViewMode} onActivateViewMode={activateViewMode} />
                <FilterMenu {...overflowMenuProps} />
              </>
            )}
          </div>
        </div>

        {hasTokens && (
          <div className="flex items-center gap-1.5">
            <div className="relative min-w-0 flex-1">
              <div
                className={`flex items-center gap-0.5 rounded border bg-[var(--color-figma-bg)] ${
                  structuredFilterChips.length > 0
                    ? "border-[var(--color-figma-accent)]"
                    : "border-[var(--color-figma-border)] focus-within:border-[var(--color-figma-accent)]"
                }`}
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  className="pointer-events-none ml-1.5 shrink-0 text-[var(--color-figma-text-tertiary)]"
                  aria-hidden="true"
                >
                  <circle cx="4" cy="4" r="3" />
                  <path d="M6.5 6.5L9 9" strokeLinecap="round" />
                </svg>
                <input
                  ref={searchRef as React.RefObject<HTMLInputElement>}
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
                  placeholder="Search tokens, groups, scopes, recipes, themes…"
                  title={searchTooltip}
                  className={`flex-1 min-w-[40px] bg-transparent py-1 pl-1 text-[10px] text-[var(--color-figma-text)] outline-none placeholder:text-[var(--color-figma-text-tertiary)] ${
                    searchQuery ? "pr-5" : "pr-2"
                  }`}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setHintIndex(0);
                      searchRef.current?.focus();
                    }}
                    className="mr-1 flex min-h-[20px] min-w-[20px] shrink-0 items-center justify-center text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)]"
                    title="Clear search"
                    aria-label="Clear search"
                  >
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
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              {showQualifierHints &&
                activeQueryToken.token.includes(":") &&
                qualifierHints.length > 0 && (
                  <div
                    ref={qualifierHintsRef as React.RefObject<HTMLDivElement>}
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
                        className={`flex w-full items-center gap-2 px-2 py-1 text-left text-[10px] ${
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

          </div>
        )}

        {(contextSummary || filterItems.length > 0 || viewItems.length > 0) && (
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1 space-y-0.5">
              {contextSummary && (
                <div className="text-[9px] leading-tight text-[var(--color-figma-text-secondary)]">
                  {contextSummary}
                </div>
              )}
              <ToolbarSummaryLine label="Filters" items={filterItems} />
              <ToolbarSummaryLine label="View" items={viewItems} />
            </div>
            {(canClearFilters || canClearView) && (
              <div className="flex shrink-0 items-center gap-2">
                {canClearFilters && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="text-[9px] text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text)]"
                  >
                    Reset filters
                  </button>
                )}
                {canClearView && (
                  <button
                    type="button"
                    onClick={clearViewModes}
                    className="text-[9px] text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text)]"
                  >
                    Reset view
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
