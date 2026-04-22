import React, {
  useCallback,
  type RefObject,
} from "react";
import { ArrowLeft, Plus, MoreVertical, Search, X, AlertTriangle, Settings } from "lucide-react";
import {
  ViewMenu,
  FilterMenu,
  type TokenListOverflowMenuProps,
} from "./TokenListOverflowMenu";
import type { ToolbarStateChip } from "./token-list/useToolbarStateChips";
import type { CollectionHealthSummary } from "../hooks/useHealthSignals";
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

export interface TokenListToolbarProps {
  onNavigateBack?: () => void;
  navHistoryLength?: number;
  collectionId: string;
  collectionDisplayName?: string;
  onOpenCollectionDetails?: () => void;
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
  onOpenImportPanel?: () => void;
  onOpenCreateCollection?: () => void;
  onCreateGeneratedGroup?: () => void;
  onSelectTokens?: () => void;
  onBulkEdit?: () => void;
  onFindReplace?: () => void;
  onFoundationTemplates?: () => void;
  overflowMenuProps: TokenListOverflowMenuProps | null;
  collectionHealthSummary?: CollectionHealthSummary;
  onOpenHealth?: () => void;
}

export function TokenListToolbar({
  onNavigateBack,
  navHistoryLength,
  collectionId,
  collectionDisplayName,
  onOpenCollectionDetails,
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
  onOpenImportPanel: _onOpenImportPanel,
  onOpenCreateCollection,
  onCreateGeneratedGroup,
  onSelectTokens,
  onBulkEdit,
  onFindReplace,
  onFoundationTemplates,
  overflowMenuProps,
  collectionHealthSummary,
  onOpenHealth,
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

  const filterPills = toolbarStateChips.filter((chip) => chip.tone === "filter");

  return (
    <div className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
      <div className="flex flex-col gap-2 px-3 py-2">
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
                  <ArrowLeft size={12} strokeWidth={1.5} aria-hidden />
                </button>
              )}
              {(() => {
                const label = collectionDisplayName || collectionId;
                return (
                  <span className="truncate px-1.5 text-heading font-semibold text-[var(--color-figma-text)]">
                    {label}
                  </span>
                );
              })()}
              {zoomRootPath && (
                <span
                  className="truncate text-secondary text-[var(--color-figma-text-tertiary)]"
                  title={`Scoped to ${zoomRootPath}`}
                >
                  / {zoomRootPath}
                </span>
              )}
              {onOpenCollectionDetails && (
                <button
                  type="button"
                  onClick={onOpenCollectionDetails}
                  className="shrink-0 rounded p-1 text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
                  title="Collection settings"
                  aria-label="Collection settings"
                >
                  <Settings size={12} strokeWidth={1.5} aria-hidden />
                </button>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {onOpenHealth && collectionHealthSummary && collectionHealthSummary.actionable > 0 && (
              <button
                type="button"
                onClick={onOpenHealth}
                className={`shrink-0 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-secondary transition-colors ${
                  collectionHealthSummary.severity === "error"
                    ? "text-[var(--color-figma-error,#f24822)] hover:bg-[var(--color-figma-error,#f24822)]/10"
                    : "text-[var(--color-figma-warning,#f5a623)] hover:bg-[var(--color-figma-warning,#f5a623)]/10"
                }`}
                title={`${collectionHealthSummary.errors} error${collectionHealthSummary.errors !== 1 ? "s" : ""}, ${collectionHealthSummary.warnings} warning${collectionHealthSummary.warnings !== 1 ? "s" : ""}`}
                aria-label="Open Health"
              >
                <AlertTriangle size={12} strokeWidth={1.5} aria-hidden />
                <span>{collectionHealthSummary.actionable}</span>
              </button>
            )}
            <div className="relative shrink-0">
              <button
                ref={createToolsMenuButtonRef}
                type="button"
                onClick={toggleCreateToolsMenu}
                disabled={!connected}
                aria-expanded={createToolsMenuOpen}
                aria-haspopup="menu"
                className="inline-flex h-[24px] w-[24px] items-center justify-center rounded bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] shadow-[inset_0_0_0_1px_var(--color-figma-border)] transition-colors hover:bg-[var(--color-figma-bg-hover)] disabled:cursor-not-allowed disabled:opacity-40"
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
                  <button
                    role="menuitem"
                    onClick={() => runCreateToolsAction(() => onCreateNew?.())}
                    disabled={!connected}
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-secondary text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    New token
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => runCreateToolsAction(handleOpenNewGroupDialog)}
                    disabled={!connected}
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-secondary text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    New group
                  </button>
                  {onCreateGeneratedGroup && (
                    <button
                      role="menuitem"
                      onClick={() => runCreateToolsAction(onCreateGeneratedGroup)}
                      disabled={!connected}
                      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-secondary text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Generate group…
                    </button>
                  )}
                  {onOpenCreateCollection && (
                    <>
                      <div className="my-0.5 border-t border-[var(--color-figma-border)]" />
                      <button
                        role="menuitem"
                        onClick={() => runCreateToolsAction(onOpenCreateCollection)}
                        disabled={!connected}
                        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-secondary text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        New collection
                      </button>
                    </>
                  )}
                  <div className="my-0.5 border-t border-[var(--color-figma-border)]" />
                  {onFoundationTemplates && (
                    <button
                      role="menuitem"
                      onClick={() => runCreateToolsAction(onFoundationTemplates)}
                      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-secondary text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)]"
                    >
                      Templates
                    </button>
                  )}
                  {onShowPasteModal && (
                    <button
                      role="menuitem"
                      onClick={() => runCreateToolsAction(() => onShowPasteModal())}
                      disabled={!connected}
                      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-secondary text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Paste JSON
                    </button>
                  )}
                  <button
                    role="menuitem"
                    onClick={() => runCreateToolsAction(openTableCreate)}
                    disabled={!connected}
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-secondary text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Token table
                  </button>
                </div>
              )}
            </div>

            {overflowMenuProps && (
              <ViewMenu
                {...overflowMenuProps}
                viewMode={viewMode}
                setViewMode={setViewMode}
                groupBy={groupBy}
                setGroupBy={setGroupBy}
              />
            )}

            {overflowMenuProps && (
              <FilterMenu
                {...overflowMenuProps}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
              />
            )}

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
                  className={`inline-flex h-[24px] w-[24px] items-center justify-center rounded transition-colors ${
                    actionsMenuOpen
                      ? "bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]"
                      : "text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
                  } disabled:cursor-not-allowed disabled:opacity-40`}
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
                        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-secondary text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)] disabled:cursor-not-allowed disabled:opacity-40"
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

        {hasTokens && (
          <div className="flex items-center gap-1.5">
            <div className="relative min-w-0 flex-1">
              <div
                className={`flex items-center gap-1 rounded border bg-[var(--color-figma-bg)] px-1.5 ${
                  filterPills.length > 0
                    ? "border-[var(--color-figma-accent)]"
                    : "border-[var(--color-figma-border)] focus-within:border-[var(--color-figma-accent)]"
                }`}
              >
                <Search size={12} strokeWidth={1.5} className="pointer-events-none shrink-0 text-[var(--color-figma-text-tertiary)]" aria-hidden />
                {filterPills.length > 0 && (
                  <div className="flex max-w-[60%] items-center gap-1 overflow-x-auto py-1 scrollbar-thin">
                    {filterPills.map((pill) => (
                      <button
                        key={pill.key}
                        type="button"
                        onClick={pill.onRemove}
                        disabled={!pill.onRemove}
                        className="inline-flex shrink-0 items-center gap-1 rounded bg-[var(--color-figma-accent)]/10 px-1.5 py-0.5 text-[10px] text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/20 disabled:cursor-default"
                        title={pill.onRemove ? `Remove ${pill.label}` : pill.label}
                      >
                        <span className="truncate">{pill.label}</span>
                        {pill.onRemove && <X size={10} strokeWidth={1.5} aria-hidden />}
                      </button>
                    ))}
                  </div>
                )}
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
                  placeholder="Search…"
                  title={searchTooltip}
                  className={`flex-1 min-w-[40px] bg-transparent py-1 text-secondary text-[var(--color-figma-text)] outline-none placeholder:text-[var(--color-figma-text-tertiary)] ${
                    searchQuery ? "pr-1" : ""
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
                    className="flex min-h-[20px] min-w-[20px] shrink-0 items-center justify-center text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)]"
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
          </div>
        )}
      </div>
    </div>
  );
}
