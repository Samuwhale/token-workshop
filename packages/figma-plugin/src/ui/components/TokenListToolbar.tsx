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
  hasStructuredFilters: boolean;
  removeQueryToken: (token: string) => void;
  clearFilters: () => void;

  // Create actions
  connected: boolean;
  hasTokens: boolean;
  onCreateNew?: () => void;
  openTableCreate: () => void;
  handleOpenNewGroupDialog: () => void;
  onShowPasteModal?: () => void;
  onOpenImportPanel?: () => void;

  // Modes toggle
  hasDimensions: boolean;
  multiModeEnabled: boolean;
  onToggleMultiMode: () => void;

  // Recipe creation
  onCreateRecipe?: () => void;

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
  hasStructuredFilters,
  removeQueryToken,
  clearFilters,
  connected,
  hasTokens,
  onCreateNew,
  openTableCreate,
  handleOpenNewGroupDialog,
  onShowPasteModal,
  onOpenImportPanel,
  hasDimensions,
  multiModeEnabled,
  onToggleMultiMode,
  onCreateRecipe,
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


  return (
    <div className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
      <div className="flex items-center gap-0.5 px-1 py-px">
      {(navHistoryLength ?? 0) > 0 && (
        <button
          onClick={onNavigateBack}
          className="shrink-0 rounded p-1 text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] transition-colors"
          title="Back (Alt+←)"
          aria-label="Back"
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
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showQualifierHints && qualifierHints.length > 0}
            aria-controls="qualifier-hints-listbox"
            aria-activedescendant={showQualifierHints && qualifierHints.length > 0 ? `qualifier-hint-${qualifierHints[hintIndex]?.id}` : undefined}
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
            placeholder="Search..."
            title={searchTooltip}
            className={`w-full rounded border bg-[var(--color-figma-bg)] py-0.5 pl-6 text-[10px] text-[var(--color-figma-text)] outline-none placeholder:text-[var(--color-figma-text-tertiary)] ${searchQuery ? "pr-8" : "pr-2"} ${structuredFilterChips.length > 0 ? "border-[var(--color-figma-accent)]" : "border-[var(--color-figma-border)] focus-visible:border-[var(--color-figma-accent)]"}`}
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery("");
                setHintIndex(0);
                searchRef.current?.focus();
              }}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[20px] min-w-[20px] flex items-center justify-center text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)]"
              title="Clear search"
              aria-label="Clear search"
            >
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
          {showQualifierHints &&
            activeQueryToken.token.includes(":") &&
            qualifierHints.length > 0 && (
              <div
                ref={qualifierHintsRef as React.RefObject<HTMLDivElement>}
                id="qualifier-hints-listbox"
                role="listbox"
                className="absolute left-0 top-full z-50 mt-0.5 max-h-48 w-full overflow-y-auto rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] shadow-lg"
              >
                {qualifierHints.map((hint, i) => (
                  <button
                    key={hint.id}
                    id={`qualifier-hint-${hint.id}`}
                    role="option"
                    aria-selected={i === hintIndex}
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
          aria-label="Add"
          className={`inline-flex items-center justify-center rounded p-1 transition-colors ${createToolsMenuOpen ? "bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]" : "text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"} disabled:cursor-not-allowed disabled:opacity-40`}
          title="Add"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>

        {createToolsMenuOpen && (
          <div
            ref={createToolsMenuRef}
            className="absolute right-0 top-full z-50 mt-1 w-40 rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] py-1 shadow-lg"
            role="menu"
          >
            <button role="menuitem" onClick={() => runCreateToolsAction(() => onCreateNew?.())} disabled={!connected} className="flex w-full items-center gap-2 px-2.5 py-1 text-left text-[10px] text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)] disabled:cursor-not-allowed disabled:opacity-40">
              Token
            </button>
            <button role="menuitem" onClick={() => runCreateToolsAction(openTableCreate)} disabled={!connected} className="flex w-full items-center gap-2 px-2.5 py-1 text-left text-[10px] text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)] disabled:cursor-not-allowed disabled:opacity-40">
              Bulk tokens
            </button>
            <button role="menuitem" onClick={() => runCreateToolsAction(handleOpenNewGroupDialog)} disabled={!connected} className="flex w-full items-center gap-2 px-2.5 py-1 text-left text-[10px] text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)] disabled:cursor-not-allowed disabled:opacity-40">
              Group
            </button>
            {onCreateRecipe && (
              <button role="menuitem" onClick={() => runCreateToolsAction(onCreateRecipe)} disabled={!connected} className="flex w-full items-center gap-2 px-2.5 py-1 text-left text-[10px] text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)] disabled:cursor-not-allowed disabled:opacity-40">
                Recipe
              </button>
            )}
            <div className="my-0.5 border-t border-[var(--color-figma-border)]" />
            <button role="menuitem" onClick={() => runCreateToolsAction(() => onShowPasteModal?.())} disabled={!connected} className="flex w-full items-center gap-2 px-2.5 py-1 text-left text-[10px] text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)] disabled:cursor-not-allowed disabled:opacity-40">
              Paste JSON
            </button>
            <button role="menuitem" onClick={() => runCreateToolsAction(() => onOpenImportPanel?.())} disabled={!connected} className="flex w-full items-center gap-2 px-2.5 py-1 text-left text-[10px] text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)] disabled:cursor-not-allowed disabled:opacity-40">
              Import...
            </button>
          </div>
        )}
      </div>

      {hasDimensions && (
        <button
          onClick={onToggleMultiMode}
          className={`shrink-0 inline-flex items-center justify-center rounded p-1 transition-colors ${multiModeEnabled ? "bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]" : "text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"}`}
          title={multiModeEnabled ? "Hide modes" : "Show modes"}
          aria-label={multiModeEnabled ? "Hide modes" : "Show modes"}
          aria-pressed={multiModeEnabled}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        </button>
      )}

      {overflowMenuProps && <TokenListOverflowMenu {...overflowMenuProps} />}
      </div>

      {toolbarStateChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-0.5 px-1 pb-0.5">
          {toolbarStateChips.map((chip) => (
            <span
              key={chip.key}
              className={`inline-flex items-center gap-1 rounded border px-1 py-px text-[9px] ${
                chip.tone === "filter"
                  ? "border-[var(--color-figma-accent)]/25 text-[var(--color-figma-accent)]"
                  : "border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)]"
              }`}
            >
              {chip.label}
              {chip.removeToken && (
                <button
                  type="button"
                  onClick={() => removeQueryToken(chip.removeToken!)}
                  className="text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text)]"
                  title={`Remove ${chip.label}`}
                  aria-label={`Remove ${chip.label}`}
                >
                  <svg width="6" height="6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
            </span>
          ))}
          {(activeFilterSummary.length > 0 || hasStructuredFilters) && (
            <button
              onClick={clearFilters}
              className="text-[9px] text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text)]"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
