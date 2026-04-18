import { useEffect, useMemo, useRef, useState } from "react";
import type { TokenCollection } from "@tokenmanager/core";
import { COLLECTION_NAME_RE } from "../shared/utils";

interface CollectionRailProps {
  collections: TokenCollection[];
  currentCollectionId: string;
  collectionTokenCounts?: Record<string, number>;
  focusRequestKey: number;
  onSelectCollection: (collectionId: string) => void;
  onCreateCollection: (name: string) => Promise<string>;
  onOpenCollectionDetails: (collectionId: string) => void;
}

interface FolderGroup {
  folder: string;
  collectionIds: string[];
}

function buildFolderGroups(collectionIds: string[]): Array<string | FolderGroup> {
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

  const groups: Array<string | FolderGroup> = [];
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

function filterCollections(collections: TokenCollection[], query: string): TokenCollection[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return collections;
  }

  return collections.filter((collection) =>
    collection.id.toLowerCase().includes(normalizedQuery),
  );
}

function leafName(collectionId: string): string {
  const index = collectionId.lastIndexOf("/");
  return index === -1 ? collectionId : collectionId.slice(index + 1);
}

export function CollectionRail({
  collections,
  currentCollectionId,
  collectionTokenCounts = {},
  focusRequestKey,
  onSelectCollection,
  onCreateCollection,
  onOpenCollectionDetails,
}: CollectionRailProps) {
  const [query, setQuery] = useState("");
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const createInputRef = useRef<HTMLInputElement>(null);

  const filteredCollections = useMemo(
    () => filterCollections(collections, query),
    [collections, query],
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
    if (!createOpen) {
      return;
    }
    createInputRef.current?.focus();
  }, [createOpen]);

  useEffect(() => {
    if (!query) {
      return;
    }
    setCollapsedFolders(new Set());
  }, [query]);

  useEffect(() => {
    if (focusRequestKey === 0) {
      return;
    }
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  }, [focusRequestKey]);

  const handleCreateCollection = async () => {
    const name = newCollectionName.trim();
    if (!name) {
      setCreateError("Collection name is required.");
      return;
    }
    if (!COLLECTION_NAME_RE.test(name)) {
      setCreateError("Use letters, numbers, hyphens, underscores, and folders.");
      return;
    }

    setCreating(true);
    setCreateError("");
    try {
      await onCreateCollection(name);
      setNewCollectionName("");
      setQuery("");
      setCreateOpen(false);
    } catch (error) {
      setCreateError(
        error instanceof Error ? error.message : "Failed to create collection.",
      );
    } finally {
      setCreating(false);
    }
  };

  const toggleFolder = (folder: string) => {
    setCollapsedFolders((previous) => {
      const next = new Set(previous);
      if (next.has(folder)) {
        next.delete(folder);
      } else {
        next.add(folder);
      }
      return next;
    });
  };

  const renderCollectionRow = (collectionId: string, indented: boolean) => {
    const isActive = collectionId === currentCollectionId;
    return (
      <div
        key={collectionId}
        className={`group flex items-center gap-1 rounded-md ${
          indented ? "ml-3" : ""
        } ${isActive ? "bg-[var(--color-figma-bg-selected)]" : "hover:bg-[var(--color-figma-bg-hover)]"}`}
      >
        <button
          type="button"
          onClick={() => onSelectCollection(collectionId)}
          className="min-w-0 flex-1 px-2.5 py-1.5 text-left"
        >
          <div className="flex items-center gap-2">
            <span
              className={`truncate text-[11px] font-medium ${
                isActive
                  ? "text-[var(--color-figma-text)]"
                  : "text-[var(--color-figma-text-secondary)]"
              }`}
            >
              {indented ? leafName(collectionId) : collectionId}
            </span>
            {isActive ? (
              <span className="shrink-0 text-[9px] text-[var(--color-figma-accent)]">
                Active
              </span>
            ) : null}
          </div>
          <div className="mt-0.5 text-[10px] text-[var(--color-figma-text-tertiary)]">
            {collectionTokenCounts[collectionId] ?? 0} token
            {(collectionTokenCounts[collectionId] ?? 0) === 1 ? "" : "s"}
          </div>
        </button>
        <button
          type="button"
          onClick={() => {
            onSelectCollection(collectionId);
            onOpenCollectionDetails(collectionId);
          }}
          className={`mr-1 rounded p-1 text-[var(--color-figma-text-tertiary)] transition-colors hover:bg-[var(--color-figma-bg-secondary)] hover:text-[var(--color-figma-text)] ${
            isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
          aria-label={`Open ${collectionId} setup`}
          title="Collection setup"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 3v3" />
            <path d="M12 18v3" />
            <path d="M3 12h3" />
            <path d="M18 12h3" />
            <path d="M5.64 5.64l2.12 2.12" />
            <path d="M16.24 16.24l2.12 2.12" />
            <path d="M5.64 18.36l2.12-2.12" />
            <path d="M16.24 7.76l2.12-2.12" />
            <circle cx="12" cy="12" r="3.25" />
          </svg>
        </button>
      </div>
    );
  };

  return (
    <aside className="flex h-full w-[240px] shrink-0 flex-col border-r border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
      <div className="border-b border-[var(--color-figma-border)] px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-[11px] font-semibold text-[var(--color-figma-text)]">
              Collections
            </h2>
            <p className="mt-0.5 text-[10px] text-[var(--color-figma-text-secondary)]">
              Choose where you are editing tokens.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setCreateOpen((open) => !open);
              setCreateError("");
            }}
            className="rounded-md border border-[var(--color-figma-border)] px-2 py-1 text-[10px] font-medium text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
          >
            New
          </button>
        </div>
        <div className="mt-3">
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a collection"
            className="w-full rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2.5 py-1.5 text-[11px] text-[var(--color-figma-text)] outline-none placeholder-[var(--color-figma-text-secondary)] focus-visible:border-[var(--color-figma-accent)]"
          />
        </div>
        {createOpen ? (
          <div className="mt-3 flex flex-col gap-2 rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-2.5">
            <input
              ref={createInputRef}
              type="text"
              value={newCollectionName}
              onChange={(event) => {
                setNewCollectionName(event.target.value);
                setCreateError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void handleCreateCollection();
                }
              }}
              placeholder="primitives"
              className="w-full rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2.5 py-1.5 text-[11px] text-[var(--color-figma-text)] outline-none focus-visible:border-[var(--color-figma-accent)]"
            />
            {createError ? (
              <p className="text-[10px] text-[var(--color-figma-error)]">{createError}</p>
            ) : null}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleCreateCollection()}
                disabled={creating}
                className="rounded-md bg-[var(--color-figma-accent)] px-2.5 py-1 text-[10px] font-medium text-white disabled:opacity-50"
              >
                {creating ? "Creating..." : "Create"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreateOpen(false);
                  setNewCollectionName("");
                  setCreateError("");
                }}
                className="rounded-md px-2 py-1 text-[10px] text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {visibleGroups.length === 0 ? (
          <div className="rounded-md border border-dashed border-[var(--color-figma-border)] px-3 py-4 text-[11px] text-[var(--color-figma-text-secondary)]">
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
                    className="flex w-full items-center gap-1 rounded-md px-2 py-1 text-left text-[10px] font-medium text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
                  >
                    <svg
                      width="8"
                      height="8"
                      viewBox="0 0 8 8"
                      fill="currentColor"
                      className={`transition-transform ${isCollapsed ? "" : "rotate-90"}`}
                      aria-hidden="true"
                    >
                      <path d="M2 1l4 3-4 3V1z" />
                    </svg>
                    <span className="truncate">{group.folder}/</span>
                    <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">
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
