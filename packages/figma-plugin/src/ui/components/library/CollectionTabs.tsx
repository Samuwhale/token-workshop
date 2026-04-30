import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Check,
  ChevronDown,
  MoreHorizontal,
  Plus,
  Settings2,
  Upload,
} from "lucide-react";
import type { TokenCollection } from "@tokenmanager/core";
import { useDropdownMenu } from "../../hooks/useDropdownMenu";
import { useElementWidth } from "../../hooks/useElementWidth";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useAnchoredFloatingStyle } from "../../shared/floatingPosition";
import {
  FLOATING_MENU_CLASS,
  FLOATING_MENU_WIDE_CLASS,
} from "../../shared/menuClasses";
import { LONG_TEXT_CLASSES } from "../../shared/longTextStyles";
import type { CollectionReviewSummary } from "../../shared/reviewSummary";
import {
  filterCollections,
  getCollectionDisplayName,
} from "../../shared/libraryCollections";
import { Button, SearchField } from "../../primitives";

const COLLECTION_ACTION_BUTTON_CLASS =
  "tm-collection-toolbar__action inline-flex min-h-[28px] shrink-0 items-center gap-1 rounded px-2 py-1 text-secondary font-medium transition-colors";
const COLLECTION_ACTIONS_COLLAPSE_WIDTH = 480;

interface AllCollectionsScope {
  selected: boolean;
  onSelect: () => void;
}

interface ActiveCollectionSettings {
  open: boolean;
  onToggle: (collectionId: string) => void;
}

interface CollectionTabsProps {
  collections: TokenCollection[];
  currentCollectionId?: string | null;
  collectionDisplayNames?: Record<string, string>;
  collectionTokenCounts?: Record<string, number>;
  collectionHealth?: Map<string, CollectionReviewSummary>;
  focusRequestKey?: number;
  allCollectionsScope?: AllCollectionsScope;
  activeCollectionSettings?: ActiveCollectionSettings;
  onSelectCollection: (collectionId: string) => void;
  onOpenCreateCollection?: () => void;
  onOpenImport?: () => void;
}

function collectionHealthTone(summary?: CollectionReviewSummary): string | null {
  const actionable = summary?.actionable ?? 0;
  if (actionable === 0) return null;
  if (summary?.severity === "critical") return "bg-[var(--color-figma-error)]";
  if (summary?.severity === "warning") return "bg-[var(--color-figma-warning)]";
  return null;
}

function formatCollectionMeta(tokenCount: number, modeCount: number): string {
  const tokenLabel = tokenCount === 1 ? "token" : "tokens";
  const modeLabel = modeCount === 1 ? "mode" : "modes";
  return `${tokenCount} ${tokenLabel} · ${modeCount} ${modeLabel}`;
}

export function CollectionTabs({
  collections,
  currentCollectionId = null,
  collectionDisplayNames,
  collectionTokenCounts = {},
  collectionHealth,
  focusRequestKey = 0,
  allCollectionsScope,
  activeCollectionSettings,
  onSelectCollection,
  onOpenCreateCollection,
  onOpenImport,
}: CollectionTabsProps) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const toolbarWidth = useElementWidth(toolbarRef);
  const {
    open: switcherOpen,
    setOpen: setSwitcherOpen,
    toggle: toggleSwitcher,
    close: closeSwitcherMenu,
    menuRef: switcherMenuRef,
    triggerRef: switcherTriggerRef,
  } = useDropdownMenu();
  const switcherStyle = useAnchoredFloatingStyle({
    triggerRef: switcherTriggerRef,
    open: switcherOpen,
    preferredWidth: 340,
    preferredHeight: 380,
    align: "start",
  });
  const actionsMenu = useDropdownMenu();
  const actionsMenuStyle = useAnchoredFloatingStyle({
    triggerRef: actionsMenu.triggerRef,
    open: actionsMenu.open,
    preferredWidth: 220,
    preferredHeight: 220,
    align: "end",
  });

  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const switcherOptionsRef = useRef<HTMLDivElement>(null);
  const lastHandledFocusRequestKeyRef = useRef(focusRequestKey);

  const currentCollection = useMemo(
    () =>
      currentCollectionId
        ? collections.find((collection) => collection.id === currentCollectionId) ?? null
        : null,
    [collections, currentCollectionId],
  );
  const currentDisplayName = currentCollection
    ? getCollectionDisplayName(currentCollection.id, collectionDisplayNames)
    : allCollectionsScope?.selected
      ? "All collections"
      : "Choose collection";
  const currentMeta = currentCollection
    ? formatCollectionMeta(
        collectionTokenCounts[currentCollection.id] ?? 0,
        currentCollection.modes.length,
      )
    : allCollectionsScope?.selected
      ? `${collections.length} ${collections.length === 1 ? "collection" : "collections"}`
      : "";

  const filteredCollections = useMemo(
    () => filterCollections(collections, deferredQuery, collectionDisplayNames),
    [collections, deferredQuery, collectionDisplayNames],
  );

  const showManageButton =
    Boolean(activeCollectionSettings) &&
    currentCollectionId !== null &&
    allCollectionsScope?.selected !== true;
  const showCreateButton = Boolean(onOpenCreateCollection);
  const showImportButton = Boolean(onOpenImport);
  const hasSecondaryActions =
    showManageButton || showCreateButton || showImportButton;
  const collapseSecondaryActions =
    hasSecondaryActions &&
    toolbarWidth !== null &&
    toolbarWidth < COLLECTION_ACTIONS_COLLAPSE_WIDTH;
  const hasCollapsedOverflowActions = showManageButton || showImportButton;
  const hasNoMatches = query.trim().length > 0 && filteredCollections.length === 0;
  const triggerAriaLabel = currentCollection
    ? `Current collection: ${currentDisplayName}. Choose collection`
    : allCollectionsScope?.selected
      ? "All collections selected. Choose collection"
      : "Choose collection";

  const closeSwitcher = useCallback(() => {
    closeSwitcherMenu({ restoreFocus: false });
  }, [closeSwitcherMenu]);

  const focusCollectionOption = useCallback((nextIndex: number) => {
    const options = switcherOptionsRef.current?.querySelectorAll<HTMLButtonElement>(
      'button[role="radio"]',
    );
    if (!options || options.length === 0) {
      return;
    }
    const clampedIndex = Math.min(Math.max(nextIndex, 0), options.length - 1);
    options[clampedIndex]?.focus();
  }, []);

  const handleSelectCollection = useCallback(
    (collectionId: string) => {
      onSelectCollection(collectionId);
      setQuery("");
      closeSwitcher();
    },
    [closeSwitcher, onSelectCollection],
  );

  const handleSelectAll = useCallback(() => {
    allCollectionsScope?.onSelect();
    setQuery("");
    closeSwitcher();
  }, [allCollectionsScope, closeSwitcher]);

  useEffect(() => {
    if (focusRequestKey <= lastHandledFocusRequestKeyRef.current) {
      return;
    }
    lastHandledFocusRequestKeyRef.current = focusRequestKey;
    setSwitcherOpen(true);
  }, [focusRequestKey, setSwitcherOpen]);

  useEffect(() => {
    if (!switcherOpen) {
      if (query.length > 0) setQuery("");
      return;
    }
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  }, [query.length, switcherOpen]);
  useFocusTrap(switcherMenuRef, { initialFocusRef: searchInputRef });

  return (
    <div
      ref={toolbarRef}
      className="flex min-w-0 shrink-0 border-b border-[var(--border-muted)] bg-[var(--surface-panel-header)] px-2 py-1"
    >
      <div className="tm-responsive-toolbar tm-collection-toolbar w-full">
        <div className="tm-responsive-toolbar__row tm-collection-toolbar__row">
          <div className="tm-responsive-toolbar__leading tm-collection-toolbar__leading">
            <button
              ref={switcherTriggerRef}
              type="button"
              onClick={toggleSwitcher}
              aria-haspopup="dialog"
              aria-controls="collection-switcher-dialog"
              aria-expanded={switcherOpen}
              aria-label={triggerAriaLabel}
              title={currentCollection ? currentDisplayName : "Choose collection"}
              className={`tm-collection-toolbar__trigger flex min-h-7 min-w-0 flex-1 items-center gap-2 rounded px-2 py-1 text-left transition-colors ${
                switcherOpen
                  ? "bg-[var(--color-figma-bg-hover)] text-[color:var(--color-figma-text)]"
                  : "bg-[var(--surface-group-quiet)] text-[color:var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
              }`}
            >
              <span className="tm-collection-toolbar__summary min-w-0 flex-1">
                <span className="tm-collection-toolbar__summary-title block truncate text-body font-medium">
                  {currentDisplayName}
                </span>
                {currentMeta ? (
                  <span className="tm-collection-toolbar__summary-meta block truncate text-secondary text-[color:var(--color-figma-text-tertiary)]">
                    {currentMeta}
                  </span>
                ) : null}
              </span>
              <ChevronDown
                size={12}
                strokeWidth={1.5}
                className={`shrink-0 text-[color:var(--color-figma-text-tertiary)] transition-transform ${
                  switcherOpen ? "rotate-180" : ""
                }`}
                aria-hidden
              />
            </button>

            {switcherOpen ? (
              <div
                id="collection-switcher-dialog"
                ref={switcherMenuRef}
                style={switcherStyle ?? { visibility: "hidden" }}
                className={`${FLOATING_MENU_WIDE_CLASS} flex flex-col p-1`}
                role="dialog"
                aria-modal="false"
                aria-label="Choose collection"
              >
                <div className="mb-1">
                  <SearchField
                    ref={searchInputRef}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onClear={() => {
                      setQuery("");
                      requestAnimationFrame(() => searchInputRef.current?.focus());
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Escape" && query.length > 0) {
                        event.stopPropagation();
                        setQuery("");
                        return;
                      }
                      if (event.key === "Escape") {
                        event.stopPropagation();
                        setSwitcherOpen(false);
                        requestAnimationFrame(() => {
                          switcherTriggerRef.current?.focus();
                        });
                      }
                    }}
                    placeholder="Search collections"
                    aria-label="Search collections"
                    containerClassName="w-full"
                    className="bg-[var(--surface-group-quiet)] hover:bg-[var(--surface-group-quiet)]"
                  />
                </div>

                <div
                  ref={switcherOptionsRef}
                  className="min-h-0 overflow-y-auto"
                  role="radiogroup"
                  aria-label="Collections"
                  onKeyDown={(event) => {
                    const activeElement = document.activeElement;
                    if (!(activeElement instanceof HTMLButtonElement)) {
                      return;
                    }
                    const options = Array.from(
                      switcherOptionsRef.current?.querySelectorAll<HTMLButtonElement>(
                        'button[role="radio"]',
                      ) ?? [],
                    );
                    const currentIndex = options.indexOf(activeElement);
                    if (currentIndex < 0) {
                      return;
                    }

                    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
                      event.preventDefault();
                      focusCollectionOption(currentIndex + 1);
                      return;
                    }
                    if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
                      event.preventDefault();
                      focusCollectionOption(currentIndex - 1);
                      return;
                    }
                    if (event.key === "Home") {
                      event.preventDefault();
                      focusCollectionOption(0);
                      return;
                    }
                    if (event.key === "End") {
                      event.preventDefault();
                      focusCollectionOption(options.length - 1);
                      return;
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      closeSwitcher();
                      requestAnimationFrame(() => {
                        switcherTriggerRef.current?.focus();
                      });
                    }
                  }}
                >
                  {allCollectionsScope ? (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={allCollectionsScope.selected}
                      onClick={handleSelectAll}
                      className={`mb-0.5 flex w-full min-w-0 items-center gap-2 rounded px-2 py-1.5 text-left transition-colors ${
                        allCollectionsScope.selected
                          ? "bg-[var(--color-figma-bg-selected)] text-[color:var(--color-figma-text)]"
                          : "text-[color:var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
                      }`}
                    >
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[color:var(--color-figma-text-accent)]">
                        {allCollectionsScope.selected ? (
                          <Check size={12} strokeWidth={1.7} aria-hidden />
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block text-body font-medium ${LONG_TEXT_CLASSES.textPrimary}`}>
                          All collections
                        </span>
                        <span className={`block text-secondary ${LONG_TEXT_CLASSES.textTertiary}`}>
                          {collections.length}{" "}
                          {collections.length === 1 ? "collection" : "collections"}
                        </span>
                      </span>
                    </button>
                  ) : null}

                  {hasNoMatches ? (
                    <div className="px-2 py-3 text-secondary text-[color:var(--color-figma-text-tertiary)]">
                      No collections match "{query.trim()}".
                    </div>
                  ) : (
                    filteredCollections.map((collection) => {
                      const collectionId = collection.id;
                      const isCurrent =
                        allCollectionsScope?.selected !== true &&
                        collectionId === currentCollectionId;
                      const displayName = getCollectionDisplayName(
                        collectionId,
                        collectionDisplayNames,
                      );
                      const healthTone = collectionHealthTone(
                        collectionHealth?.get(collectionId),
                      );
                      const meta = formatCollectionMeta(
                        collectionTokenCounts[collectionId] ?? 0,
                        collection.modes.length,
                      );

                      return (
                        <button
                          key={collectionId}
                          type="button"
                          role="radio"
                          aria-checked={isCurrent}
                          onClick={() => handleSelectCollection(collectionId)}
                          className={`mb-0.5 flex w-full min-w-0 items-center gap-2 rounded px-2 py-1.5 text-left transition-colors ${
                            isCurrent
                              ? "bg-[var(--color-figma-bg-selected)] text-[color:var(--color-figma-text)]"
                              : "text-[color:var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
                          }`}
                        >
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[color:var(--color-figma-text-accent)]">
                            {isCurrent ? (
                              <Check size={12} strokeWidth={1.7} aria-hidden />
                            ) : healthTone ? (
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${healthTone}`}
                                aria-hidden
                              />
                            ) : null}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={`block text-body font-medium ${LONG_TEXT_CLASSES.textPrimary}`}>
                              {displayName}
                            </span>
                            <span className={`block text-secondary ${LONG_TEXT_CLASSES.textTertiary}`}>
                              {meta}
                            </span>
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <div className="tm-responsive-toolbar__actions tm-collection-toolbar__actions">
            {collapseSecondaryActions ? (
              <>
                {showCreateButton ? (
                  <Button
                    onClick={onOpenCreateCollection}
                    aria-label="Create collection"
                    title="Create collection"
                    variant="ghost"
                    size="sm"
                    className={`${COLLECTION_ACTION_BUTTON_CLASS} tm-collection-toolbar__action--primary justify-start text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)]`}
                  >
                    <Plus size={12} strokeWidth={1.5} aria-hidden />
                    <span className="tm-toolbar-action__label">New collection</span>
                  </Button>
                ) : null}
                {hasCollapsedOverflowActions ? (
                  <div className="relative">
                    <Button
                      ref={actionsMenu.triggerRef}
                      onClick={actionsMenu.toggle}
                      aria-expanded={actionsMenu.open}
                      aria-haspopup="menu"
                      aria-label="More collection actions"
                      title="More collection actions"
                      variant="ghost"
                      size="sm"
                      className={`${COLLECTION_ACTION_BUTTON_CLASS} justify-start text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)]`}
                    >
                      <MoreHorizontal size={12} strokeWidth={1.5} aria-hidden />
                      <span className="tm-toolbar-action__label">More</span>
                    </Button>
                    {actionsMenu.open ? (
                      <div
                        ref={actionsMenu.menuRef}
                        style={actionsMenuStyle ?? { visibility: "hidden" }}
                        className={FLOATING_MENU_CLASS}
                        role="menu"
                      >
                        {showManageButton ? (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              activeCollectionSettings?.onToggle(currentCollectionId!);
                              actionsMenu.close({ restoreFocus: false });
                            }}
                            className="flex w-full items-center gap-2 px-2.5 py-1 text-left text-secondary text-[color:var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
                          >
                            <Settings2 size={12} strokeWidth={1.5} aria-hidden />
                            {activeCollectionSettings?.open === true
                              ? "Hide collection details"
                              : "Collection details"}
                          </button>
                        ) : null}
                        {showImportButton ? (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              onOpenImport?.();
                              actionsMenu.close({ restoreFocus: false });
                            }}
                            className="flex w-full items-center gap-2 px-2.5 py-1 text-left text-secondary text-[color:var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
                          >
                            <Upload size={12} strokeWidth={1.5} aria-hidden />
                            Import tokens
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : (
              <>
                {showManageButton ? (
                  <Button
                    onClick={() => activeCollectionSettings?.onToggle(currentCollectionId!)}
                    aria-label={
                      activeCollectionSettings?.open === true
                        ? "Hide collection management"
                        : "Manage collection"
                    }
                    title={
                      activeCollectionSettings?.open === true
                        ? "Hide collection management"
                        : "Manage collection"
                    }
                    aria-pressed={activeCollectionSettings?.open === true}
                    variant="ghost"
                    size="sm"
                    className={`${COLLECTION_ACTION_BUTTON_CLASS} justify-start ${
                      activeCollectionSettings?.open === true
                        ? "bg-[var(--color-figma-bg-hover)] text-[color:var(--color-figma-text)]"
                        : "text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)]"
                    }`}
                  >
                    <Settings2 size={12} strokeWidth={1.5} aria-hidden />
                    <span className="tm-toolbar-action__label tm-collection-toolbar__optional-label">
                      Collection details
                    </span>
                  </Button>
                ) : null}

                {showCreateButton ? (
                  <Button
                    onClick={onOpenCreateCollection}
                    aria-label="Create collection"
                    title="Create collection"
                    variant="ghost"
                    size="sm"
                    className={`${COLLECTION_ACTION_BUTTON_CLASS} justify-start text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)]`}
                  >
                    <Plus size={12} strokeWidth={1.5} aria-hidden />
                    <span className="tm-toolbar-action__label tm-collection-toolbar__optional-label">
                      New collection
                    </span>
                  </Button>
                ) : null}

                {showImportButton ? (
                  <Button
                    onClick={onOpenImport}
                    aria-label="Import tokens"
                    title="Import tokens"
                    variant="ghost"
                    size="sm"
                    className={`${COLLECTION_ACTION_BUTTON_CLASS} justify-start text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)]`}
                  >
                    <Upload size={12} strokeWidth={1.5} aria-hidden />
                    <span className="tm-toolbar-action__label tm-collection-toolbar__optional-label">
                      Import tokens
                    </span>
                  </Button>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
