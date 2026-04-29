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
  Plus,
  Search,
  Settings2,
  Upload,
  X,
} from "lucide-react";
import type { TokenCollection } from "@tokenmanager/core";
import { useDropdownMenu } from "../../hooks/useDropdownMenu";
import { useAnchoredFloatingStyle } from "../../shared/floatingPosition";
import { FLOATING_MENU_WIDE_CLASS } from "../../shared/menuClasses";
import { LONG_TEXT_CLASSES } from "../../shared/longTextStyles";
import type { CollectionReviewSummary } from "../../shared/reviewSummary";
import {
  filterCollections,
  getCollectionDisplayName,
} from "../../shared/libraryCollections";
import { IconButton } from "../../primitives";

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

  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const searchInputRef = useRef<HTMLInputElement>(null);
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
  const hasNoMatches = query.trim().length > 0 && filteredCollections.length === 0;

  const closeSwitcher = useCallback(() => {
    closeSwitcherMenu({ restoreFocus: false });
  }, [closeSwitcherMenu]);

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

  return (
    <div className="flex min-w-0 shrink-0 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5">
      <div className="tm-responsive-toolbar tm-collection-toolbar w-full">
        <div className="tm-responsive-toolbar__row tm-collection-toolbar__row">
          <div className="tm-responsive-toolbar__leading tm-collection-toolbar__leading">
            <button
              ref={switcherTriggerRef}
              type="button"
              onClick={toggleSwitcher}
              aria-haspopup="dialog"
              aria-expanded={switcherOpen}
              className={`tm-collection-toolbar__trigger flex h-8 min-w-0 flex-1 items-center gap-2 rounded px-2 text-left transition-colors ${
                switcherOpen
                  ? "bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text)]"
                  : "text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
              }`}
            >
              <span className="tm-collection-toolbar__summary min-w-0 flex-1">
                <span className="tm-collection-toolbar__summary-title block truncate text-body font-medium">
                  {currentDisplayName}
                </span>
                {currentMeta ? (
                  <span className="tm-collection-toolbar__summary-meta block truncate text-secondary text-[var(--color-figma-text-tertiary)]">
                    {currentMeta}
                  </span>
                ) : null}
              </span>
              <ChevronDown
                size={12}
                strokeWidth={1.5}
                className="shrink-0 text-[var(--color-figma-text-tertiary)]"
                aria-hidden
              />
            </button>

            {switcherOpen ? (
              <div
                ref={switcherMenuRef}
                style={switcherStyle ?? { visibility: "hidden" }}
                className={`${FLOATING_MENU_WIDE_CLASS} flex flex-col p-1`}
                role="dialog"
                aria-label="Choose collection"
              >
                <div className="mb-1 flex min-h-[28px] items-center gap-1.5 rounded bg-[var(--color-figma-bg-secondary)] px-2">
                  <Search
                    size={12}
                    strokeWidth={1.5}
                    className="shrink-0 text-[var(--color-figma-text-tertiary)]"
                    aria-hidden
                  />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape" && query.length > 0) {
                        event.stopPropagation();
                        setQuery("");
                      }
                    }}
                    placeholder="Search collections"
                    aria-label="Search collections"
                    className="min-w-0 flex-1 bg-transparent py-1 text-body text-[var(--color-figma-text)] outline-none placeholder:text-[var(--color-figma-text-tertiary)]"
                  />
                  {query ? (
                    <IconButton
                      onClick={() => {
                        setQuery("");
                        requestAnimationFrame(() => searchInputRef.current?.focus());
                      }}
                      size="sm"
                      className="text-[var(--color-figma-text-tertiary)] transition-colors hover:text-[var(--color-figma-text-secondary)]"
                      aria-label="Clear collection search"
                    >
                      <X size={10} strokeWidth={1.5} aria-hidden />
                    </IconButton>
                  ) : null}
                </div>

                <div className="min-h-0 overflow-y-auto">
                  {allCollectionsScope ? (
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={allCollectionsScope.selected}
                      onClick={handleSelectAll}
                      className={`mb-0.5 flex w-full min-w-0 items-center gap-2 rounded px-2 py-1.5 text-left transition-colors ${
                        allCollectionsScope.selected
                          ? "bg-[var(--color-figma-bg-selected)] text-[var(--color-figma-text)]"
                          : "text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
                      }`}
                    >
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[var(--color-figma-accent)]">
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
                    <div className="px-2 py-3 text-secondary text-[var(--color-figma-text-tertiary)]">
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
                          role="menuitemradio"
                          aria-checked={isCurrent}
                          onClick={() => handleSelectCollection(collectionId)}
                          className={`mb-0.5 flex w-full min-w-0 items-center gap-2 rounded px-2 py-1.5 text-left transition-colors ${
                            isCurrent
                              ? "bg-[var(--color-figma-bg-selected)] text-[var(--color-figma-text)]"
                              : "text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
                          }`}
                        >
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[var(--color-figma-accent)]">
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
            {showManageButton ? (
              <button
                type="button"
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
                className={`tm-collection-toolbar__action inline-flex h-7 shrink-0 items-center gap-1 rounded px-2 text-secondary font-medium transition-colors ${
                  activeCollectionSettings?.open === true
                    ? "bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text)]"
                    : "text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
                }`}
              >
                <Settings2 size={12} strokeWidth={1.5} aria-hidden />
                <span className="tm-toolbar-action__label tm-collection-toolbar__optional-label">
                  Manage
                </span>
              </button>
            ) : null}

            {showCreateButton ? (
              <button
                type="button"
                onClick={onOpenCreateCollection}
                title="Create collection"
                className="tm-collection-toolbar__action tm-collection-toolbar__action--primary inline-flex h-7 shrink-0 items-center gap-1 rounded bg-[var(--color-figma-accent)] px-2.5 text-secondary font-medium text-white transition-colors hover:bg-[var(--color-figma-accent-hover)]"
              >
                <Plus size={12} strokeWidth={1.7} aria-hidden />
                <span className="tm-toolbar-action__label">New collection</span>
              </button>
            ) : null}

            {showImportButton ? (
              <button
                type="button"
                onClick={onOpenImport}
                title="Import collections"
                className="tm-collection-toolbar__action inline-flex h-7 shrink-0 items-center gap-1 rounded px-2 text-secondary font-medium text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
              >
                <Upload size={12} strokeWidth={1.5} aria-hidden />
                <span className="tm-toolbar-action__label tm-collection-toolbar__optional-label">
                  Import
                </span>
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
