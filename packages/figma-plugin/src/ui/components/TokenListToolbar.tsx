import React, { useState, useRef, useEffect, useCallback, type RefObject } from "react";
import { TokenListOverflowMenu, type TokenListOverflowMenuProps } from "./TokenListOverflowMenu";
import { replaceQueryToken } from "./tokenListUtils";
import { getMenuItems, handleMenuArrowKeys } from "../hooks/useMenuKeyboard";

export interface ToolbarStateChip {
  key: string;
  label: string;
  tone: "filter" | "view";
  removeToken?: string;
}

interface QualifierHint {
  id: string;
  label: string;
  desc: string;
  replacement?: string;
  kind: "replacement" | "hint";
}

export interface TokenListToolbarProps {
  // Navigation
  onNavigateBack?: () => void;
  navHistoryLength?: number;

  // Search
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

  // Toolbar state chips & filter management
  toolbarStateChips: ToolbarStateChip[];
  activeFilterSummary: string[];
  activeViewSummary: string[];
  hasStructuredFilters: boolean;
  removeQueryToken: (token: string) => void;
  clearFilters: () => void;
  clearViewModes: () => void;

  // Create actions
  connected: boolean;
  hasTokens: boolean;
  onCreateNew?: () => void;
  openTableCreate: () => void;
  handleOpenNewGroupDialog: () => void;
  onShowPasteModal?: () => void;
  onOpenImportPanel?: () => void;

  // Overflow menu (pass-through)
  overflowMenuProps: TokenListOverflowMenuProps | null;
}

export function TokenListToolbar({
  onNavigateBack,
  navHistoryLength,
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
  activeFilterSummary,
  activeViewSummary,
  hasStructuredFilters,
  removeQueryToken,
  clearFilters,
  clearViewModes,
  connected,
  hasTokens,
  onCreateNew,
  openTableCreate,
  handleOpenNewGroupDialog,
  onShowPasteModal,
  onOpenImportPanel,
  overflowMenuProps,
}: TokenListToolbarProps) {
  // --- Create menu state (internal) ---
  const [createToolsMenuOpen, setCreateToolsMenuOpen] = useState(false);
  const createToolsMenuContainerRef = useRef<HTMLDivElement>(null);
  const createToolsMenuButtonRef = useRef<HTMLButtonElement>(null);
  const createToolsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!createToolsMenuOpen) return;
    const onMouseDown = (event: MouseEvent) => {
      if (createToolsMenuContainerRef.current?.contains(event.target as Node))
        return;
      setCreateToolsMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setCreateToolsMenuOpen(false);
        createToolsMenuButtonRef.current?.focus();
        return;
      }
      if (createToolsMenuRef.current) {
        handleMenuArrowKeys(event, createToolsMenuRef.current);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    window.requestAnimationFrame(() => {
      if (createToolsMenuRef.current)
        getMenuItems(createToolsMenuRef.current)[0]?.focus();
    });
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [createToolsMenuOpen]);

  const runCreateToolsAction = useCallback((action: () => void) => {
    setCreateToolsMenuOpen(false);
    action();
  }, []);

  // --- Filter popover state (internal) ---
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);
  const filterPopoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!filterPopoverOpen) return;
    const onMouseDown = (event: MouseEvent) => {
      if (filterPopoverRef.current?.contains(event.target as Node)) return;
      setFilterPopoverOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFilterPopoverOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [filterPopoverOpen]);

  return (
    <div className="flex items-center gap-1 px-1.5 py-1 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
      {(navHistoryLength ?? 0) > 0 && (
        <button
          onClick={onNavigateBack}
          className="shrink-0 rounded p-1 text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] transition-colors"
          title={`Go back to previous token (Alt+←)${(navHistoryLength ?? 0) > 1 ? ` — ${navHistoryLength} in history` : ""}`}
          aria-label="Go back to previous token"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      {hasTokens ? (
        <div className="relative flex-1 min-w-0">
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-[var(--color-figma-text-tertiary)]"
            aria-hidden="true"
          >
            <circle cx="4" cy="4" r="3" />
            <path d="M6.5 6.5L9 9" strokeLinecap="round" />
          </svg>
          <input
            ref={searchRef as React.RefObject<HTMLInputElement>}
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setHintIndex(0);
            }}
            onFocus={() => {
              setShowQualifierHints(true);
            }}
            onBlur={() => {
              setTimeout(() => setShowQualifierHints(false), 150);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                if (searchQuery) {
                  setSearchQuery("");
                  setHintIndex(0);
                }
                searchRef.current?.blur();
                return;
              }
              if (!showQualifierHints || qualifierHints.length === 0)
                return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHintIndex((i: number) =>
                  Math.min(i + 1, qualifierHints.length - 1),
                );
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHintIndex((i: number) => Math.max(i - 1, 0));
              } else if (
                e.key === "Tab" ||
                (e.key === "Enter" && qualifierHints.length > 0)
              ) {
                const hint = qualifierHints[hintIndex];
                if (!hint || hint.kind !== "replacement" || !hint.replacement) return;
                e.preventDefault();
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
            placeholder="Search names, paths, or descriptions"
            title={searchTooltip}
            className={`w-full rounded border bg-[var(--color-figma-bg)] py-1 pl-6 text-[10px] text-[var(--color-figma-text)] outline-none placeholder:text-[var(--color-figma-text-tertiary)] ${searchQuery || toolbarStateChips.length > 0 ? "pr-12" : "pr-2"} ${structuredFilterChips.length > 0 ? "border-[var(--color-figma-accent)]" : "border-[var(--color-figma-border)] focus-visible:border-[var(--color-figma-accent)]"}`}
          />
          {/* Active filter/view badge inside search */}
          {toolbarStateChips.length > 0 && (
            <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setFilterPopoverOpen((v) => !v)}
                className="rounded-full bg-[var(--color-figma-accent)]/15 px-1.5 py-0.5 text-[9px] font-medium leading-none text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/25 transition-colors"
                title={`${toolbarStateChips.length} active filter${toolbarStateChips.length !== 1 ? "s" : ""} — click to manage`}
              >
                {toolbarStateChips.length}
              </button>
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setHintIndex(0);
                    searchRef.current?.focus();
                  }}
                  className="text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)]"
                  title="Clear search"
                  aria-label="Clear search"
                >
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          )}
          {!toolbarStateChips.length && searchQuery && (
            <button
              onClick={() => {
                setSearchQuery("");
                setHintIndex(0);
                searchRef.current?.focus();
              }}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)]"
              title="Clear search"
              aria-label="Clear search"
            >
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
          {/* Filter popover — lists active filters with dismiss */}
          {filterPopoverOpen && toolbarStateChips.length > 0 && (
            <div ref={filterPopoverRef} className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] py-1 shadow-xl">
              {toolbarStateChips.map((chip) => (
                <div
                  key={chip.key}
                  className="flex items-center gap-2 px-2.5 py-1 text-[10px]"
                >
                  <span className={`flex-1 truncate ${chip.tone === "filter" ? "text-[var(--color-figma-accent)]" : "text-[var(--color-figma-text-secondary)]"}`}>
                    {chip.label}
                  </span>
                  {chip.removeToken && (
                    <button
                      type="button"
                      onClick={() => {
                        removeQueryToken(chip.removeToken!);
                      }}
                      className="shrink-0 rounded p-0.5 text-[var(--color-figma-text-tertiary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
                      title={`Remove ${chip.label}`}
                    >
                      <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
              <div className="mt-1 border-t border-[var(--color-figma-border)] px-2.5 py-1 flex items-center gap-2">
                {(activeFilterSummary.length > 0 || hasStructuredFilters) && (
                  <button
                    onClick={() => { clearFilters(); setFilterPopoverOpen(false); }}
                    className="text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]"
                  >
                    Clear filters
                  </button>
                )}
                {activeViewSummary.length > 0 && (
                  <button
                    onClick={() => { clearViewModes(); setFilterPopoverOpen(false); }}
                    className="text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]"
                  >
                    Reset view
                  </button>
                )}
              </div>
            </div>
          )}
          {showQualifierHints &&
            activeQueryToken.token.includes(":") &&
            qualifierHints.length > 0 && (
              <div
                ref={qualifierHintsRef as React.RefObject<HTMLDivElement>}
                className="absolute left-0 top-full z-50 mt-0.5 max-h-48 w-full overflow-y-auto rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] shadow-lg"
              >
                {qualifierHints.map((hint, i) => (
                  <button
                    key={hint.id}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      if (hint.kind !== "replacement" || !hint.replacement) return;
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
                    className={`flex w-full items-center gap-2 px-2 py-1 text-left text-[10px] ${i === hintIndex ? "bg-[var(--color-figma-bg-selected)] text-[var(--color-figma-text)]" : "text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"} ${hint.kind === "replacement" ? "" : "cursor-default"}`}
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
      ) : (
        <div className="flex-1" />
      )}

      <div
        className="relative shrink-0"
        ref={createToolsMenuContainerRef}
      >
        <button
          ref={createToolsMenuButtonRef}
          onClick={() => setCreateToolsMenuOpen((open) => !open)}
          disabled={!connected}
          aria-expanded={createToolsMenuOpen}
          aria-haspopup="menu"
          className={`inline-flex items-center justify-center rounded p-1 transition-colors ${createToolsMenuOpen ? "bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]" : "text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"} disabled:cursor-not-allowed disabled:opacity-40`}
          title="Create token, group, or import"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>

        {createToolsMenuOpen && (
          <div
            ref={createToolsMenuRef}
            className="absolute right-0 top-full z-50 mt-1 w-48 rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] py-1 shadow-lg"
            role="menu"
          >
            <button role="menuitem" onClick={() => runCreateToolsAction(() => onCreateNew?.())} disabled={!connected} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)] disabled:cursor-not-allowed disabled:opacity-40">
              Single token
            </button>
            <button role="menuitem" onClick={() => runCreateToolsAction(openTableCreate)} disabled={!connected} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)] disabled:cursor-not-allowed disabled:opacity-40">
              Bulk create
            </button>
            <button role="menuitem" onClick={() => runCreateToolsAction(handleOpenNewGroupDialog)} disabled={!connected} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)] disabled:cursor-not-allowed disabled:opacity-40">
              New group
            </button>
            <div className="my-0.5 border-t border-[var(--color-figma-border)]" />
            <button role="menuitem" onClick={() => runCreateToolsAction(() => onShowPasteModal?.())} disabled={!connected} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)] disabled:cursor-not-allowed disabled:opacity-40">
              Paste JSON
            </button>
            <button role="menuitem" onClick={() => runCreateToolsAction(() => onOpenImportPanel?.())} disabled={!connected} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)] disabled:cursor-not-allowed disabled:opacity-40">
              Import
            </button>
          </div>
        )}
      </div>

      {overflowMenuProps && <TokenListOverflowMenu {...overflowMenuProps} />}
    </div>
  );
}
