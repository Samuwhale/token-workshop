import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChevronRight, Plus, Settings, Upload } from "lucide-react";
import type { TokenCollection } from "@tokenmanager/core";
import type { CollectionHealthSummary } from "../../hooks/useHealthSignals";
import {
  buildCollectionGroups,
  filterCollections,
  formatCollectionMeta,
  getCollectionDisplayName,
  getCollectionLeafName,
} from "../../shared/libraryCollections";

interface LibraryCollectionsRailProps {
  collections: TokenCollection[];
  currentCollectionId: string;
  collectionDisplayNames?: Record<string, string>;
  collectionTokenCounts?: Record<string, number>;
  collectionHealth?: Map<string, CollectionHealthSummary>;
  focusRequestKey?: number;
  onSelectCollection: (collectionId: string) => void;
  onOpenCreateCollection?: () => void;
  onOpenImport?: () => void;
  onManageCollection?: (collectionId: string) => void;
}

export function LibraryCollectionsRail({
  collections,
  currentCollectionId,
  collectionDisplayNames,
  collectionTokenCounts = {},
  collectionHealth,
  focusRequestKey = 0,
  onSelectCollection,
  onOpenCreateCollection,
  onOpenImport,
  onManageCollection,
}: LibraryCollectionsRailProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const searchInputRef = useRef<HTMLInputElement>(null);
  const lastHandledFocusRequestKeyRef = useRef(focusRequestKey);

  const collectionsById = useMemo(() => {
    const map = new Map<string, TokenCollection>();
    for (const collection of collections) {
      map.set(collection.id, collection);
    }
    return map;
  }, [collections]);

  const filteredCollections = useMemo(
    () => filterCollections(collections, deferredQuery, collectionDisplayNames),
    [collections, deferredQuery, collectionDisplayNames],
  );
  const visibleGroups = useMemo(
    () => buildCollectionGroups(filteredCollections.map((collection) => collection.id)),
    [filteredCollections],
  );

  useEffect(() => {
    if (!deferredQuery) {
      return;
    }
    setCollapsedFolders(new Set());
  }, [deferredQuery]);

  useEffect(() => {
    if (focusRequestKey <= lastHandledFocusRequestKeyRef.current) {
      return;
    }
    lastHandledFocusRequestKeyRef.current = focusRequestKey;
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  }, [focusRequestKey]);

  const toggleFolder = useCallback((folder: string) => {
    setCollapsedFolders((previous) => {
      const next = new Set(previous);
      if (next.has(folder)) {
        next.delete(folder);
      } else {
        next.add(folder);
      }
      return next;
    });
  }, []);

  const renderCollectionRow = (collectionId: string, indented: boolean) => {
    const collection = collectionsById.get(collectionId);
    const health = collectionHealth?.get(collectionId);
    const tokenCount = collectionTokenCounts[collectionId] ?? 0;
    const isCurrent = collectionId === currentCollectionId;
    const issueTone =
      health?.actionable && health.severity === "error"
        ? "text-[var(--color-figma-error)]"
        : "text-[var(--color-figma-warning)]";

    return (
      <div
        key={collectionId}
        className={`group flex items-start gap-2 rounded-lg ${
          indented ? "ml-3" : ""
        } ${
          isCurrent
            ? "bg-[var(--color-figma-bg-selected)]"
            : "hover:bg-[var(--color-figma-bg-hover)]/70"
        }`}
      >
        <button
          type="button"
          onClick={() => onSelectCollection(collectionId)}
          className="flex min-w-0 flex-1 flex-col px-3 py-2 text-left"
        >
          <span className="truncate text-body font-medium text-[var(--color-figma-text)]">
            {indented
              ? getCollectionLeafName(
                  getCollectionDisplayName(collectionId, collectionDisplayNames),
                )
              : getCollectionDisplayName(collectionId, collectionDisplayNames)}
          </span>
          <span
            className={`mt-0.5 text-secondary ${
              health?.actionable ? issueTone : "text-[var(--color-figma-text-tertiary)]"
            }`}
          >
            {formatCollectionMeta(collection, tokenCount, health)}
          </span>
        </button>
        {onManageCollection ? (
          <button
            type="button"
            onClick={() => onManageCollection(collectionId)}
            className={`mr-2 mt-2 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--color-figma-text-secondary)] transition-colors ${
              isCurrent
                ? "hover:bg-[var(--color-figma-bg)] hover:text-[var(--color-figma-text)]"
                : "opacity-0 group-hover:opacity-100 hover:bg-[var(--color-figma-bg)] hover:text-[var(--color-figma-text)]"
            }`}
            aria-label={`Open collection details for ${getCollectionDisplayName(collectionId, collectionDisplayNames)}`}
            title="Collection details"
          >
            <Settings size={12} strokeWidth={1.5} aria-hidden />
          </button>
        ) : null}
      </div>
    );
  };

  return (
    <aside className="flex h-full w-[252px] shrink-0 flex-col bg-[var(--color-figma-bg-secondary)]">
      <div className="px-3 pb-2 pt-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-body font-semibold text-[var(--color-figma-text)]">
            Collections
          </h2>
          <div className="flex items-center gap-1">
            {onOpenImport ? (
              <button
                type="button"
                onClick={onOpenImport}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg)] hover:text-[var(--color-figma-text)]"
                aria-label="Import tokens"
                title="Import tokens"
              >
                <Upload size={13} strokeWidth={1.5} aria-hidden />
              </button>
            ) : null}
            {onOpenCreateCollection ? (
              <button
                type="button"
                onClick={onOpenCreateCollection}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg)] hover:text-[var(--color-figma-text)]"
                aria-label="Create collection"
                title="Create collection"
              >
                <Plus size={13} strokeWidth={1.5} aria-hidden />
              </button>
            ) : null}
          </div>
        </div>
        <input
          ref={searchInputRef}
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search collections"
          className="mt-3 w-full rounded-md border border-[var(--color-figma-border)]/60 bg-[var(--color-figma-bg)] px-2.5 py-2 text-body text-[var(--color-figma-text)] outline-none placeholder:text-[var(--color-figma-text-secondary)] focus-visible:border-[var(--color-figma-accent)]"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {visibleGroups.length === 0 ? (
          <div className="rounded-lg bg-[var(--color-figma-bg)] px-3 py-4 text-secondary text-[var(--color-figma-text-secondary)]">
            {collections.length === 0
              ? "Create or import a collection to start building the library."
              : "No collections match this search."}
          </div>
        ) : (
          <div className="space-y-1">
            {visibleGroups.map((group) => {
              if (typeof group === "string") {
                return renderCollectionRow(group, false);
              }

              const isCollapsed = collapsedFolders.has(group.folder);
              return (
                <div key={group.folder} className="space-y-1">
                  <button
                    type="button"
                    onClick={() => toggleFolder(group.folder)}
                    className="flex w-full items-center gap-1 rounded-md px-2 py-1 text-left text-secondary font-medium text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg)]"
                  >
                    <ChevronRight
                      size={10}
                      strokeWidth={1.5}
                      className={`transition-transform ${isCollapsed ? "" : "rotate-90"}`}
                      aria-hidden
                    />
                    <span className="truncate">{group.folder}/</span>
                    <span className="ml-auto text-[var(--color-figma-text-tertiary)]">
                      {group.collectionIds.length}
                    </span>
                  </button>
                  {isCollapsed
                    ? null
                    : group.collectionIds.map((collectionId) =>
                        renderCollectionRow(collectionId, true),
                      )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
