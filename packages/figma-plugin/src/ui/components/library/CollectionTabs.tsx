import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  Check,
  ChevronDown,
  Plus,
  Settings2,
  Upload,
} from "lucide-react";
import type { TokenCollection } from "@token-workshop/core";
import { useDropdownMenu } from "../../hooks/useDropdownMenu";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useAnchoredFloatingStyle } from "../../shared/floatingPosition";
import {
  FLOATING_MENU_CLASS,
  FLOATING_MENU_ITEM_CLASS,
  FLOATING_MENU_WIDE_CLASS,
} from "../../shared/menuClasses";
import { LONG_TEXT_CLASSES } from "../../shared/longTextStyles";
import type { CollectionReviewSummary } from "../../shared/reviewSummary";
import {
  filterCollections,
  getCollectionDisplayName,
} from "../../shared/libraryCollections";
import { CONTROL_FOCUS_ACCENT } from "../../shared/controlClasses";
import { Button, SearchField, SegmentedControl } from "../../primitives";

const COLLECTION_ACTION_BUTTON_CLASS =
  "tm-collection-toolbar__action inline-flex min-h-[28px] shrink-0 items-center gap-1 rounded px-2 py-1 text-secondary font-medium transition-colors";
const COLLECTION_SCOPE_OPTIONS = [
  { value: "current", label: "This collection" },
  { value: "all", label: "Browse all" },
] as const;

interface AllCollectionsScope {
  value: "current" | "all";
  onChange: (value: "current" | "all") => void;
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
  collectionMetaById?: Record<string, string>;
  allCollectionsMeta?: string;
  collectionHealth?: Map<string, CollectionReviewSummary>;
  focusRequestKey?: number;
  allCollectionsScope?: AllCollectionsScope;
  activeCollectionSettings?: ActiveCollectionSettings;
  onSelectCollection: (collectionId: string) => void;
  onOpenCreateCollection?: () => void;
  onOpenImport?: () => void;
  createActionLabel?: string;
  createActionTitle?: string;
  createActionIcon?: ReactNode;
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

function formatAllCollectionsMeta(
  collectionCount: number,
  tokenCount: number,
): string {
  const collectionLabel = collectionCount === 1 ? "collection" : "collections";
  const tokenLabel = tokenCount === 1 ? "token" : "tokens";
  return `${collectionCount} ${collectionLabel} · ${tokenCount} ${tokenLabel}`;
}

export function CollectionTabs({
  collections,
  currentCollectionId = null,
  collectionDisplayNames,
  collectionTokenCounts = {},
  collectionMetaById,
  allCollectionsMeta,
  collectionHealth,
  focusRequestKey = 0,
  allCollectionsScope,
  activeCollectionSettings,
  onSelectCollection,
  onOpenCreateCollection,
  onOpenImport,
  createActionLabel = "New collection",
  createActionTitle = "Create a collection",
  createActionIcon,
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
  const createMenu = useDropdownMenu();
  const createMenuStyle = useAnchoredFloatingStyle({
    triggerRef: createMenu.triggerRef,
    open: createMenu.open,
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
  const scopeValue = allCollectionsScope?.value ?? "current";
  const currentDisplayName = currentCollection
    ? getCollectionDisplayName(currentCollection.id, collectionDisplayNames)
    : "Choose collection";
  const allCollectionsTokenCount = collections.reduce(
    (sum, collection) => sum + (collectionTokenCounts[collection.id] ?? 0),
    0,
  );
  const currentCollectionMeta = currentCollection
    ? (collectionMetaById?.[currentCollection.id] ??
      formatCollectionMeta(
        collectionTokenCounts[currentCollection.id] ?? 0,
        currentCollection.modes.length,
      ))
    : "";
  const visibleTitle =
    scopeValue === "all" ? "All collections" : currentDisplayName;
  const visibleMeta =
    scopeValue === "all"
      ? (allCollectionsMeta ??
        formatAllCollectionsMeta(collections.length, allCollectionsTokenCount))
      : currentCollectionMeta;

  const filteredCollections = useMemo(
    () => filterCollections(collections, deferredQuery, collectionDisplayNames),
    [collections, deferredQuery, collectionDisplayNames],
  );

  const showManageButton =
    Boolean(activeCollectionSettings) &&
    currentCollectionId !== null &&
    scopeValue !== "all";
  const showCreateButton = Boolean(onOpenCreateCollection);
  const showImportButton = Boolean(onOpenImport);
  const primaryAction =
    showCreateButton
      ? {
          icon: createActionIcon ?? (
            <Plus size={12} strokeWidth={1.5} aria-hidden />
          ),
          label: createActionLabel,
          title: createActionTitle,
          onClick: () => onOpenCreateCollection?.(),
        }
      : showImportButton
        ? {
            icon: <Upload size={12} strokeWidth={1.5} aria-hidden />,
            label: "Import",
            title: "Import into library",
            onClick: () => onOpenImport?.(),
          }
        : null;
  const showImportAction = showCreateButton && showImportButton;
  const hasNoMatches = query.trim().length > 0 && filteredCollections.length === 0;
  const triggerTitle =
    visibleMeta.length > 0 ? `${visibleTitle} · ${visibleMeta}` : visibleTitle;
  const triggerAriaLabel =
    scopeValue === "all"
      ? visibleMeta
        ? `All collections, ${visibleMeta}. Choose collection`
        : "All collections. Choose collection"
      : currentCollection
        ? visibleMeta
          ? `Collection: ${currentDisplayName}, ${visibleMeta}. Choose collection`
          : `Collection: ${currentDisplayName}. Choose collection`
        : "Choose collection";
  const triggerStateClass =
    switcherOpen || scopeValue === "all"
      ? "border-[var(--border-accent)] bg-[var(--surface-group)] text-[color:var(--color-figma-text)]"
      : "border-[var(--border-muted)] bg-[var(--surface-group-quiet)] text-[color:var(--color-figma-text)] hover:border-[var(--border-accent)] hover:bg-[var(--surface-group)]";

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
      if (scopeValue === "all") {
        allCollectionsScope?.onChange("current");
      }
      setQuery("");
      closeSwitcher();
    },
    [allCollectionsScope, closeSwitcher, onSelectCollection, scopeValue],
  );

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
    }
  }, [query.length, switcherOpen]);

  useEffect(() => {
    if (!switcherOpen) return;

    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  }, [switcherOpen]);
  useFocusTrap(switcherMenuRef, {
    enabled: switcherOpen,
    initialFocusRef: searchInputRef,
  });

  const switcherMenu = switcherOpen ? (
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
        {hasNoMatches ? (
          <div className="px-2 py-3 text-secondary text-[color:var(--color-figma-text-tertiary)]">
            No collections match "{query.trim()}".
          </div>
        ) : (
          filteredCollections.map((collection) => {
            const collectionId = collection.id;
            const isCurrent = collectionId === currentCollectionId;
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
            const visibleMeta = collectionMetaById?.[collectionId] ?? meta;

            return (
              <button
                key={collectionId}
                type="button"
                role="radio"
                aria-checked={isCurrent}
                onClick={() => handleSelectCollection(collectionId)}
                className={`mb-0.5 flex w-full min-w-0 items-center gap-2 rounded px-2 py-1.5 text-left transition-colors ${CONTROL_FOCUS_ACCENT} ${
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
                    {visibleMeta}
                  </span>
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  ) : null;

  const createMenuPopover =
    showImportAction && createMenu.open ? (
      <div
        ref={createMenu.menuRef}
        style={createMenuStyle ?? { visibility: "hidden" }}
        className={FLOATING_MENU_CLASS}
        role="menu"
      >
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onOpenImport?.();
            createMenu.close({ restoreFocus: false });
          }}
          className={FLOATING_MENU_ITEM_CLASS}
        >
          <span className="shrink-0 text-[color:var(--color-figma-text-secondary)]">
            <Upload size={12} strokeWidth={1.5} aria-hidden />
          </span>
          <span className="min-w-0 flex-1 text-left leading-tight [overflow-wrap:anywhere]">
            Import
          </span>
        </button>
      </div>
    ) : null;

  return (
    <>
      <div className="flex min-w-0 shrink-0 border-b border-[var(--border-muted)] bg-[var(--surface-panel-header)] px-2 py-1">
        <div className="tm-responsive-toolbar tm-collection-toolbar w-full">
          <div className="tm-responsive-toolbar__row tm-collection-toolbar__row">
            <div className="tm-responsive-toolbar__leading tm-collection-toolbar__leading">
              {allCollectionsScope ? (
                <div className="tm-collection-toolbar__scope">
                  <SegmentedControl
                    value={scopeValue}
                    options={[...COLLECTION_SCOPE_OPTIONS]}
                    onChange={allCollectionsScope.onChange}
                    ariaLabel="Collection scope"
                    size="compact"
                  />
                </div>
              ) : null}
              <button
                ref={switcherTriggerRef}
                type="button"
                onClick={toggleSwitcher}
                aria-haspopup="dialog"
                aria-controls="collection-switcher-dialog"
                aria-expanded={switcherOpen}
                aria-label={triggerAriaLabel}
                title={triggerTitle}
                className={`tm-collection-toolbar__trigger flex min-h-7 min-w-0 flex-1 items-center gap-2 rounded px-2 py-1 text-left transition-colors ${CONTROL_FOCUS_ACCENT} ${triggerStateClass}`}
              >
                <span className="tm-collection-toolbar__summary min-w-0 flex-1">
                  <span className="tm-collection-toolbar__summary-title block truncate text-body font-medium">
                    {visibleTitle}
                  </span>
                  {visibleMeta ? (
                    <span className="tm-collection-toolbar__summary-meta block truncate text-secondary text-[color:var(--color-figma-text-tertiary)]">
                      {visibleMeta}
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
            </div>

            <div className="tm-responsive-toolbar__actions tm-collection-toolbar__actions">
              {showImportAction ? (
                <div className="tm-collection-toolbar__split-button">
                  <Button
                    onClick={() => onOpenCreateCollection?.()}
                    aria-label={createActionTitle}
                    title={createActionTitle}
                    variant="secondary"
                    size="sm"
                    wrap
                    className={`${COLLECTION_ACTION_BUTTON_CLASS} tm-collection-toolbar__action--primary tm-collection-toolbar__split-button-primary justify-start rounded-r-none border-r-0 pr-2`}
                  >
                    {primaryAction?.icon}
                    <span className="tm-toolbar-action__label tm-collection-toolbar__action-label">
                      {primaryAction?.label}
                    </span>
                  </Button>
                  <Button
                    ref={createMenu.triggerRef}
                    onClick={createMenu.toggle}
                    aria-expanded={createMenu.open}
                    aria-haspopup="menu"
                    aria-label="New collection actions"
                    title="New collection actions"
                    variant="secondary"
                    size="sm"
                    className="tm-collection-toolbar__split-button-toggle rounded-l-none px-0"
                  >
                    <ChevronDown size={12} strokeWidth={1.8} aria-hidden />
                  </Button>
                </div>
              ) : primaryAction ? (
                <Button
                  onClick={primaryAction.onClick}
                  aria-label={primaryAction.title}
                  title={primaryAction.title}
                  variant="secondary"
                  size="sm"
                  wrap
                  className={`${COLLECTION_ACTION_BUTTON_CLASS} tm-collection-toolbar__action--primary justify-start`}
                >
                  {primaryAction.icon}
                  <span className="tm-toolbar-action__label tm-collection-toolbar__action-label">
                    {primaryAction.label}
                  </span>
                </Button>
              ) : null}
              {showManageButton ? (
                <Button
                  onClick={() =>
                    activeCollectionSettings?.onToggle(currentCollectionId!)
                  }
                  aria-label={
                    activeCollectionSettings?.open === true
                      ? "Hide collection and modes"
                      : "Show collection and modes"
                  }
                  aria-pressed={activeCollectionSettings?.open === true}
                  title={
                    activeCollectionSettings?.open === true
                      ? "Hide collection and modes"
                      : "Show collection and modes"
                  }
                  variant="secondary"
                  size="sm"
                  wrap
                  className={`${COLLECTION_ACTION_BUTTON_CLASS} tm-collection-toolbar__action--secondary justify-start`}
                >
                  <Settings2 size={12} strokeWidth={1.5} aria-hidden />
                  <span className="tm-toolbar-action__label tm-collection-toolbar__action-label">
                    Collection
                  </span>
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      {switcherMenu ? createPortal(switcherMenu, document.body) : null}
      {createMenuPopover ? createPortal(createMenuPopover, document.body) : null}
    </>
  );
}
