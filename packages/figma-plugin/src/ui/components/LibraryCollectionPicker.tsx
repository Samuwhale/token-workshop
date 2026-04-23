import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Check, ChevronDown, ChevronRight, Plus, Settings } from "lucide-react";
import type { TokenCollection } from "@tokenmanager/core";
import type { CollectionHealthSummary } from "../hooks/useHealthSignals";

interface LibraryCollectionPickerProps {
  collections: TokenCollection[];
  currentCollectionId: string;
  collectionDisplayNames?: Record<string, string>;
  collectionTokenCounts?: Record<string, number>;
  collectionHealth?: Map<string, CollectionHealthSummary>;
  focusRequestKey?: number;
  onSelectCollection: (collectionId: string) => void;
  onOpenCreateCollection?: () => void;
  onManageCollection?: (collectionId: string) => void;
  triggerClassName?: string;
  triggerAriaLabel?: string;
}

interface FolderGroup {
  folder: string;
  collectionIds: string[];
}

type CollectionListItem = string | FolderGroup;

function buildFolderGroups(collectionIds: string[]): CollectionListItem[] {
  const folderMap = new Map<string, string[]>();
  for (const collectionId of collectionIds) {
    const slashIndex = collectionId.indexOf("/");
    if (slashIndex === -1) {
      continue;
    }
    const folder = collectionId.slice(0, slashIndex);
    if (!folderMap.has(folder)) {
      folderMap.set(folder, []);
    }
    folderMap.get(folder)?.push(collectionId);
  }

  const groups: CollectionListItem[] = [];
  const seenFolders = new Set<string>();
  for (const collectionId of collectionIds) {
    const slashIndex = collectionId.indexOf("/");
    if (slashIndex === -1) {
      groups.push(collectionId);
      continue;
    }
    const folder = collectionId.slice(0, slashIndex);
    if (seenFolders.has(folder)) {
      continue;
    }
    seenFolders.add(folder);
    groups.push({
      folder,
      collectionIds: folderMap.get(folder) ?? [],
    });
  }

  return groups;
}

function leafName(collectionId: string): string {
  const lastSlashIndex = collectionId.lastIndexOf("/");
  return lastSlashIndex === -1 ? collectionId : collectionId.slice(lastSlashIndex + 1);
}

function getCollectionDisplayName(
  collectionId: string,
  collectionDisplayNames?: Record<string, string>,
): string {
  return collectionDisplayNames?.[collectionId] || collectionId;
}

function filterCollections(
  collections: TokenCollection[],
  query: string,
  collectionDisplayNames?: Record<string, string>,
): TokenCollection[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return collections;
  }

  return collections.filter((collection) => {
    const displayName = getCollectionDisplayName(collection.id, collectionDisplayNames);
    return (
      collection.id.toLowerCase().includes(normalizedQuery) ||
      displayName.toLowerCase().includes(normalizedQuery)
    );
  });
}

function formatCollectionMeta(
  collection: TokenCollection | undefined,
  tokenCount: number,
  health?: CollectionHealthSummary,
): string {
  const parts = [`${tokenCount} token${tokenCount === 1 ? "" : "s"}`];
  const modeCount = collection?.modes.length ?? 0;
  if (modeCount > 1) {
    parts.push(`${modeCount} modes`);
  }
  if (health?.actionable) {
    parts.push(`${health.actionable} issue${health.actionable === 1 ? "" : "s"}`);
  }
  return parts.join(" · ");
}

export function LibraryCollectionPicker({
  collections,
  currentCollectionId,
  collectionDisplayNames,
  collectionTokenCounts = {},
  collectionHealth,
  focusRequestKey = 0,
  onSelectCollection,
  onOpenCreateCollection,
  onManageCollection,
  triggerClassName,
  triggerAriaLabel = "Switch working collection",
}: LibraryCollectionPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const lastHandledFocusRequestKeyRef = useRef(focusRequestKey);

  const collectionsById = useMemo(() => {
    const map = new Map<string, TokenCollection>();
    for (const collection of collections) {
      map.set(collection.id, collection);
    }
    return map;
  }, [collections]);

  const currentCollection = collectionsById.get(currentCollectionId);
  const currentHealth = collectionHealth?.get(currentCollectionId);
  const currentDisplayName = currentCollection
    ? getCollectionDisplayName(currentCollection.id, collectionDisplayNames)
    : collections[0]
      ? getCollectionDisplayName(collections[0].id, collectionDisplayNames)
      : "Choose collection";

  const filteredCollections = useMemo(
    () => filterCollections(collections, deferredQuery, collectionDisplayNames),
    [collections, deferredQuery, collectionDisplayNames],
  );
  const filteredCollectionIds = useMemo(
    () => filteredCollections.map((collection) => collection.id),
    [filteredCollections],
  );
  const visibleGroups = useMemo(
    () => buildFolderGroups(filteredCollectionIds),
    [filteredCollectionIds],
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  }, [open]);

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
    if (triggerRef.current?.offsetParent === null) {
      return;
    }
    lastHandledFocusRequestKeyRef.current = focusRequestKey;
    setOpen(true);
    if (document.activeElement !== searchInputRef.current) {
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      });
    }
  }, [focusRequestKey]);

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    setQuery("");
    if (restoreFocus) {
      triggerRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleMouseDown = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) {
        return;
      }
      if (triggerRef.current?.contains(event.target as Node)) {
        return;
      }
      close(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [close, open]);

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

  const handleSelectCollection = useCallback(
    (collectionId: string) => {
      if (collectionId !== currentCollectionId) {
        onSelectCollection(collectionId);
      }
      close(false);
    },
    [close, currentCollectionId, onSelectCollection],
  );

  const runSecondaryAction = useCallback(
    (action: (() => void) | undefined) => {
      if (!action) {
        return;
      }
      close(false);
      action();
    },
    [close],
  );

  const renderCollectionRow = (collectionId: string, indented: boolean) => {
    const collection = collectionsById.get(collectionId);
    const health = collectionHealth?.get(collectionId);
    const tokenCount = collectionTokenCounts[collectionId] ?? 0;
    const isCurrent = collectionId === currentCollectionId;
    const healthTone =
      health?.actionable && health.severity === "error"
        ? "text-[var(--color-figma-error)]"
        : "text-[var(--color-figma-warning)]";

    return (
      <div
        key={collectionId}
        className={`flex items-start gap-1 rounded-md ${
          indented ? "ml-3 w-[calc(100%-12px)]" : ""
        } ${
          isCurrent
            ? "bg-[var(--color-figma-bg-selected)]"
            : "hover:bg-[var(--color-figma-bg-hover)]"
        }`}
      >
        <button
          type="button"
          onClick={() => handleSelectCollection(collectionId)}
          className="flex min-w-0 flex-1 items-start gap-2 px-2.5 py-2 text-left"
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-body font-medium text-[var(--color-figma-text)]">
              {indented
                ? leafName(getCollectionDisplayName(collectionId, collectionDisplayNames))
                : getCollectionDisplayName(collectionId, collectionDisplayNames)}
            </span>
            <span
              className={`mt-0.5 text-secondary text-[var(--color-figma-text-tertiary)] ${
                health?.actionable ? healthTone : ""
              }`}
            >
              {formatCollectionMeta(collection, tokenCount, health)}
            </span>
          </span>
          {isCurrent ? (
            <Check
              size={12}
              strokeWidth={2}
              className="mt-0.5 shrink-0 text-[var(--color-figma-accent)]"
              aria-hidden
            />
          ) : null}
        </button>
        {onManageCollection ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              runSecondaryAction(() => onManageCollection(collectionId));
            }}
            className="mt-1 mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg)] hover:text-[var(--color-figma-text)]"
            aria-label={`Open collection details for ${getCollectionDisplayName(collectionId, collectionDisplayNames)}`}
            title="Open collection details"
          >
            <Settings size={12} strokeWidth={1.5} aria-hidden />
          </button>
        ) : null}
      </div>
    );
  };

  return (
    <div className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={triggerAriaLabel}
        className={
          triggerClassName ??
          "inline-flex min-w-0 items-center gap-1 rounded px-1.5 py-1 text-left transition-colors hover:bg-[var(--color-figma-bg-hover)]"
        }
      >
        <span className="truncate text-body font-semibold text-[var(--color-figma-text)]">
          {currentDisplayName}
        </span>
        <ChevronDown
          size={12}
          strokeWidth={1.5}
          className="shrink-0 text-[var(--color-figma-text-secondary)]"
          aria-hidden
        />
      </button>

      {open ? (
        <div
          ref={menuRef}
          role="dialog"
          aria-label="Working collection picker"
          className="absolute left-0 top-full z-50 mt-1 w-[320px] max-w-[calc(100vw-24px)] overflow-hidden rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-lg"
        >
          <div className="border-b border-[var(--color-figma-border)] px-3 py-3">
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a collection"
              className="w-full rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2.5 py-1.5 text-body text-[var(--color-figma-text)] outline-none placeholder:text-[var(--color-figma-text-secondary)] focus-visible:border-[var(--color-figma-accent)]"
            />

            {currentCollection ? (
              <div className="mt-2 rounded-md bg-[var(--color-figma-bg-secondary)] px-2.5 py-2">
                <div className="text-secondary text-[var(--color-figma-text-tertiary)]">
                  Working collection
                </div>
                <div className="truncate text-body font-medium text-[var(--color-figma-text)]">
                  {currentDisplayName}
                </div>
                <div
                  className={`mt-0.5 text-secondary text-[var(--color-figma-text-tertiary)] ${
                    currentHealth?.actionable
                      ? currentHealth.severity === "error"
                        ? "text-[var(--color-figma-error)]"
                        : "text-[var(--color-figma-warning)]"
                      : ""
                  }`}
                >
                  {formatCollectionMeta(
                    currentCollection,
                    collectionTokenCounts[currentCollectionId] ?? 0,
                    currentHealth,
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <div className="max-h-72 overflow-y-auto px-2 py-2">
            {visibleGroups.length === 0 ? (
              <div className="rounded-md border border-dashed border-[var(--color-figma-border)] px-3 py-4 text-body text-[var(--color-figma-text-secondary)]">
                {collections.length === 0
                  ? "Create a collection to start structuring your token system."
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
                        className="flex w-full items-center gap-1 rounded-md px-2 py-1 text-left text-secondary font-medium text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
                      >
                        <ChevronRight
                          size={10}
                          strokeWidth={1.5}
                          className={`transition-transform ${isCollapsed ? "" : "rotate-90"}`}
                          aria-hidden
                        />
                        <span className="truncate">{group.folder}/</span>
                        <span className="text-secondary text-[var(--color-figma-text-tertiary)]">
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

          <div className="border-t border-[var(--color-figma-border)] px-2 py-2">
            {onOpenCreateCollection ? (
              <button
                type="button"
                onClick={() => runSecondaryAction(onOpenCreateCollection)}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-body text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
              >
                <Plus size={12} strokeWidth={1.5} aria-hidden />
                <span>New collection</span>
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
