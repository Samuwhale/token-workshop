import {
  forwardRef,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Search, Settings2, Upload } from "lucide-react";
import type { TokenCollection } from "@tokenmanager/core";
import type { CollectionReviewSummary } from "../../shared/reviewSummary";
import {
  filterCollections,
  getCollectionDisplayName,
} from "../../shared/libraryCollections";
import { useDropdownMenu } from "../../hooks/useDropdownMenu";
import { useAnchoredFloatingStyle } from "../../shared/floatingPosition";

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
  const showSearch = collections.length > 1 || Boolean(allCollectionsScope);
  const showCreateButton = Boolean(onOpenCreateCollection);
  const showImportButton = Boolean(onOpenImport);

  const searchMenu = useDropdownMenu();
  const searchMenuStyle = useAnchoredFloatingStyle({
    triggerRef: searchMenu.triggerRef,
    open: searchMenu.open,
    preferredWidth: 280,
    preferredHeight: 360,
    align: "end",
  });

  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const lastHandledFocusRequestKeyRef = useRef(focusRequestKey);

  const filteredCollections = useMemo(
    () => filterCollections(collections, deferredQuery, collectionDisplayNames),
    [collections, deferredQuery, collectionDisplayNames],
  );

  useEffect(() => {
    if (focusRequestKey <= lastHandledFocusRequestKeyRef.current) {
      return;
    }
    lastHandledFocusRequestKeyRef.current = focusRequestKey;
    if (!showSearch) {
      return;
    }
    searchMenu.setOpen(true);
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  }, [focusRequestKey, searchMenu, showSearch]);

  useEffect(() => {
    if (!searchMenu.open) {
      return;
    }
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
  }, [searchMenu.open]);

  useEffect(() => {
    if (!searchMenu.open) {
      setQuery("");
    }
  }, [searchMenu.open]);

  const activeTabRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    activeTabRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [currentCollectionId, allCollectionsScope?.selected]);

  const handleSelectFromMenu = useCallback(
    (collectionId: string) => {
      onSelectCollection(collectionId);
      searchMenu.close({ restoreFocus: false });
    },
    [onSelectCollection, searchMenu],
  );

  const handleSelectAllFromMenu = useCallback(() => {
    allCollectionsScope?.onSelect();
    searchMenu.close({ restoreFocus: false });
  }, [allCollectionsScope, searchMenu]);

  const settingsToggle = activeCollectionSettings;
  const settingsTargetId = currentCollectionId ?? null;

  return (
    <div
      className="flex min-w-0 shrink-0 flex-wrap items-center gap-1 border-b border-[var(--color-figma-border)] px-2 py-1"
    >
      <div
        role="tablist"
        aria-label="Collections"
        className="flex min-w-0 flex-1 items-stretch gap-1 overflow-x-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
      >
        {allCollectionsScope ? (
          <CollectionTab
            label="All"
            selected={allCollectionsScope.selected}
            onClick={allCollectionsScope.onSelect}
            ref={allCollectionsScope.selected ? activeTabRef : undefined}
          />
        ) : null}

        {collections.map((collection) => {
          const collectionId = collection.id;
          const isCurrent =
            (!allCollectionsScope || !allCollectionsScope.selected) &&
            collectionId === currentCollectionId;
          const displayName = getCollectionDisplayName(
            collectionId,
            collectionDisplayNames,
          );
          const tokenCount = collectionTokenCounts[collectionId];
          const summary = collectionHealth?.get(collectionId);
          const actionable = summary?.actionable ?? 0;
          const severity = summary?.severity;
          const healthTone =
            actionable > 0 && severity === "critical"
              ? "bg-[var(--color-figma-error)]"
              : actionable > 0 && severity === "warning"
                ? "bg-[var(--color-figma-warning)]"
                : null;
          const settingsActive =
            isCurrent &&
            settingsToggle?.open === true &&
            settingsTargetId === collectionId;

          return (
            <CollectionTab
              key={collectionId}
              label={displayName}
              selected={isCurrent}
              onClick={() => onSelectCollection(collectionId)}
              ref={isCurrent ? activeTabRef : undefined}
              healthDotClass={healthTone ?? undefined}
              count={tokenCount}
              trailing={
                settingsToggle ? (
                  isCurrent ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        settingsToggle.onToggle(collectionId);
                      }}
                      aria-label={
                        settingsActive
                          ? "Hide collection settings"
                          : "Open collection settings"
                      }
                      aria-pressed={settingsActive}
                      title="Collection settings"
                      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded transition-colors ${
                        settingsActive
                          ? "text-[var(--color-figma-text)]"
                          : "text-[var(--color-figma-text-tertiary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
                      }`}
                    >
                      <Settings2 size={11} strokeWidth={1.5} aria-hidden />
                    </button>
                  ) : null
                ) : undefined
              }
              reserveTrailingSpace={Boolean(settingsToggle)}
            />
          );
        })}
      </div>

      {(showSearch || showImportButton || showCreateButton) ? (
        <div className="ml-auto flex min-w-0 shrink-0 flex-wrap items-center justify-end gap-1">
          {showSearch ? (
            <div className="relative shrink-0">
              <button
                ref={searchMenu.triggerRef}
                type="button"
                onClick={searchMenu.toggle}
                aria-expanded={searchMenu.open}
                aria-haspopup="dialog"
                aria-label="Find collection"
                title="Find collection"
                className={`inline-flex h-7 w-7 items-center justify-center rounded transition-colors ${
                  searchMenu.open
                    ? "bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text)]"
                    : "text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
                }`}
              >
                <Search size={12} strokeWidth={1.5} aria-hidden />
              </button>

              {searchMenu.open ? (
                <div
                  ref={searchMenu.menuRef}
                  style={searchMenuStyle ?? { visibility: "hidden" }}
                  className="z-50 flex max-w-[min(320px,calc(100vw-24px))] flex-col rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] p-1 shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
                  role="dialog"
                  aria-label="Find collection"
                >
                  <div className="mb-1 flex min-h-[24px] items-center gap-1.5 rounded bg-[var(--color-figma-bg-secondary)] px-2">
                    <Search
                      size={11}
                      strokeWidth={1.5}
                      className="shrink-0 text-[var(--color-figma-text-tertiary)]"
                      aria-hidden
                    />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Filter collections"
                      className="min-w-0 flex-1 bg-transparent py-0.5 text-body text-[var(--color-figma-text)] outline-none placeholder:text-[var(--color-figma-text-tertiary)]"
                    />
                  </div>
                  <div className="max-h-[280px] min-h-0 overflow-y-auto">
                    {allCollectionsScope ? (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={handleSelectAllFromMenu}
                        className={`mb-0.5 flex w-full items-center rounded px-2 py-1 text-left text-body transition-colors ${
                          allCollectionsScope.selected
                            ? "bg-[var(--color-figma-bg-selected)] text-[var(--color-figma-text)]"
                            : "text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
                        }`}
                      >
                        All collections
                      </button>
                    ) : null}
                    {filteredCollections.length === 0 ? (
                      <div className="px-2 py-3 text-secondary text-[var(--color-figma-text-tertiary)]">
                        No matches.
                      </div>
                    ) : (
                      filteredCollections.map((collection) => {
                        const collectionId = collection.id;
                        const isCurrent = collectionId === currentCollectionId;
                        const displayName = getCollectionDisplayName(
                          collectionId,
                          collectionDisplayNames,
                        );
                        const tokenCount = collectionTokenCounts[collectionId] ?? 0;
                        const summary = collectionHealth?.get(collectionId);
                        const actionable = summary?.actionable ?? 0;
                        const severity = summary?.severity;
                        const healthTone =
                          actionable > 0 && severity === "critical"
                            ? "bg-[var(--color-figma-error)]"
                            : actionable > 0 && severity === "warning"
                              ? "bg-[var(--color-figma-warning)]"
                              : null;
                        return (
                          <button
                            key={collectionId}
                            type="button"
                            role="menuitem"
                            onClick={() => handleSelectFromMenu(collectionId)}
                            className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left transition-colors ${
                              isCurrent
                                ? "bg-[var(--color-figma-bg-selected)]"
                                : "hover:bg-[var(--color-figma-bg-hover)]"
                            }`}
                          >
                            {healthTone ? (
                              <span
                                className={`h-1.5 w-1.5 shrink-0 rounded-full ${healthTone}`}
                                aria-hidden
                              />
                            ) : null}
                            <span className="min-w-0 flex-1 truncate text-body text-[var(--color-figma-text)]">
                              {displayName}
                            </span>
                            <span className="shrink-0 text-secondary tabular-nums text-[var(--color-figma-text-tertiary)]">
                              {tokenCount}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {showImportButton ? (
            <button
              type="button"
              onClick={onOpenImport}
              className="inline-flex h-7 shrink-0 items-center gap-1 rounded px-2 text-secondary text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
            >
              <Upload size={12} strokeWidth={1.5} aria-hidden />
              <span>Import</span>
            </button>
          ) : null}

          {showCreateButton ? (
            <button
              type="button"
              onClick={onOpenCreateCollection}
              className="inline-flex h-7 shrink-0 items-center rounded bg-[var(--color-figma-accent)] px-2.5 text-secondary font-medium text-white transition-colors hover:bg-[var(--color-figma-accent-hover)]"
            >
              New collection
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

interface CollectionTabProps {
  label: string;
  selected: boolean;
  onClick: () => void;
  healthDotClass?: string;
  count?: number;
  trailing?: ReactNode;
  reserveTrailingSpace?: boolean;
}

const CollectionTab = forwardRef<HTMLButtonElement, CollectionTabProps>(
  function CollectionTab(
    { label, selected, onClick, healthDotClass, count, trailing, reserveTrailingSpace = false },
    ref,
  ) {
    return (
      <button
        ref={ref}
        role="tab"
        type="button"
        aria-selected={selected}
        onClick={onClick}
        title={label}
        className={`group relative flex min-w-0 max-w-[min(280px,60vw)] shrink-0 items-center gap-1.5 px-2.5 py-1.5 text-body transition-colors ${
          selected
            ? "text-[var(--color-figma-text)]"
            : "text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]"
        }`}
      >
        {healthDotClass ? (
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${healthDotClass}`}
            aria-hidden
          />
        ) : null}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {typeof count === "number" ? (
          <span
            className={`shrink-0 text-secondary tabular-nums ${
              selected
                ? "text-[var(--color-figma-text-secondary)]"
                : "text-[var(--color-figma-text-tertiary)]"
            }`}
          >
            {count}
          </span>
        ) : null}
        {reserveTrailingSpace ? (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center">
            {trailing}
          </span>
        ) : trailing}
        {selected ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-[var(--color-figma-accent)]"
          />
        ) : null}
      </button>
    );
  },
);
