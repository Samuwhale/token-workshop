import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, MoreHorizontal } from "lucide-react";
import type { TokenCollection } from "@tokenmanager/core";
import { COLLECTION_NAME_RE } from "../shared/utils";
import type { CollectionHealthSummary } from "../hooks/useHealthSignals";
import {
  MENU_DANGER_ITEM_CLASS,
  MENU_ITEM_CLASS,
  MENU_SEPARATOR_CLASS,
  MENU_SURFACE_CLASS,
  clampMenuPosition,
  type MenuPosition,
} from "./token-tree/tokenTreeNodeShared";

interface CollectionRailProps {
  collections: TokenCollection[];
  currentCollectionId: string;
  collectionTokenCounts?: Record<string, number>;
  collectionHealth?: Map<string, CollectionHealthSummary>;
  focusRequestKey: number;
  widthPx: number;
  onSelectCollection: (collectionId: string) => void;
  onCreateCollection: (name: string) => Promise<string>;
  onOpenCollectionDetails: (collectionId: string) => void;
  onRenameCollection: (collectionId: string) => void;
  onDuplicateCollection: (collectionId: string) => void;
  onMergeCollection?: (collectionId: string) => void;
  onSplitCollection: (collectionId: string) => void;
  onDeleteCollection: (collectionId: string) => void;
  onPublishCollection?: (collectionId: string, tokenCount: number) => void;
  onOpenCollectionIssues?: (collectionId: string) => void;
}

const MENU_WIDTH = 220;
const MENU_HEIGHT = 260;

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
  collectionHealth,
  focusRequestKey,
  widthPx,
  onSelectCollection,
  onCreateCollection,
  onOpenCollectionDetails,
  onRenameCollection,
  onDuplicateCollection,
  onMergeCollection,
  onSplitCollection,
  onDeleteCollection,
  onPublishCollection,
  onOpenCollectionIssues,
}: CollectionRailProps) {
  const [query, setQuery] = useState("");
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const [menuState, setMenuState] = useState<
    { collectionId: string; pos: MenuPosition } | null
  >(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const createInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const canMerge = collections.length > 1 && !!onMergeCollection;

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

  const closeMenu = useCallback((options?: { restoreFocus?: boolean }) => {
    const restoreFocus = options?.restoreFocus ?? true;
    setMenuState((previous) => {
      if (previous && restoreFocus) {
        triggerRefs.current.get(previous.collectionId)?.focus();
      }
      return null;
    });
  }, []);

  useEffect(() => {
    if (!menuState) {
      return;
    }
    const handleMouseDown = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) {
        return;
      }
      closeMenu({ restoreFocus: false });
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        closeMenu();
      }
    };
    const handleBlur = () => closeMenu({ restoreFocus: false });
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("blur", handleBlur);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("blur", handleBlur);
    };
  }, [menuState, closeMenu]);

  const openMenuFromTrigger = useCallback((collectionId: string) => {
    const trigger = triggerRefs.current.get(collectionId);
    if (!trigger) {
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const pos = clampMenuPosition(
      rect.right - MENU_WIDTH,
      rect.bottom + 4,
      MENU_WIDTH,
      MENU_HEIGHT,
    );
    setMenuState({ collectionId, pos });
  }, []);

  const openMenuFromContextEvent = useCallback(
    (collectionId: string, event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const pos = clampMenuPosition(
        event.clientX,
        event.clientY,
        MENU_WIDTH,
        MENU_HEIGHT,
      );
      setMenuState({ collectionId, pos });
    },
    [],
  );

  const runMenuAction = useCallback(
    (
      collectionId: string,
      action: ((collectionId: string) => void) | undefined,
    ) => {
      if (!action) {
        return;
      }
      onSelectCollection(collectionId);
      action(collectionId);
      closeMenu({ restoreFocus: false });
    },
    [onSelectCollection, closeMenu],
  );

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

  const collectionsById = useMemo(() => {
    const map = new Map<string, TokenCollection>();
    for (const collection of collections) {
      map.set(collection.id, collection);
    }
    return map;
  }, [collections]);

  const renderCollectionRow = (collectionId: string, indented: boolean) => {
    const isActive = collectionId === currentCollectionId;
    const isMenuOpen = menuState?.collectionId === collectionId;
    const collection = collectionsById.get(collectionId);
    const modeCount = collection?.modes.length ?? 0;
    const tokenCount = collectionTokenCounts[collectionId] ?? 0;
    const health = collectionHealth?.get(collectionId);
    const healthTone =
      health && health.actionable > 0
        ? health.severity === "error"
          ? "error"
          : "warning"
        : null;
    const healthTitle =
      health && health.actionable > 0
        ? [
            health.errors > 0 ? `${health.errors} error${health.errors === 1 ? "" : "s"}` : null,
            health.warnings > 0 ? `${health.warnings} warning${health.warnings === 1 ? "" : "s"}` : null,
          ]
            .filter(Boolean)
            .join(", ")
        : undefined;
    return (
      <div
        key={collectionId}
        onContextMenu={(event) => openMenuFromContextEvent(collectionId, event)}
        className={`group flex items-center gap-1 rounded-md ${
          indented ? "ml-3" : ""
        } ${isActive ? "bg-[var(--color-figma-bg-selected)]" : "hover:bg-[var(--color-figma-bg-hover)]"}`}
      >
        <div
          role="button"
          tabIndex={0}
          onClick={() => onSelectCollection(collectionId)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelectCollection(collectionId);
            }
          }}
          className="min-w-0 flex-1 cursor-pointer px-2.5 py-1.5 text-left"
        >
          <span
            className={`truncate text-body font-medium ${
              isActive
                ? "text-[var(--color-figma-text)]"
                : "text-[var(--color-figma-text-secondary)]"
            }`}
          >
            {indented ? leafName(collectionId) : collectionId}
          </span>
          <div className="mt-0.5 text-secondary text-[var(--color-figma-text-tertiary)]">
            {tokenCount} token{tokenCount === 1 ? "" : "s"}
            {modeCount > 1 && (
              <>
                {" · "}
                {modeCount} modes
              </>
            )}
            {healthTone && (
              <>
                {" · "}
                {onOpenCollectionIssues ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenCollectionIssues(collectionId);
                    }}
                    title={healthTitle ? `${healthTitle} — review` : undefined}
                    className={`hover:underline ${
                      healthTone === "error"
                        ? "text-[var(--color-figma-error)]"
                        : "text-[var(--color-figma-warning)]"
                    }`}
                  >
                    {health!.actionable} issue{health!.actionable === 1 ? "" : "s"}
                  </button>
                ) : (
                  <span
                    title={healthTitle}
                    className={
                      healthTone === "error"
                        ? "text-[var(--color-figma-error)]"
                        : "text-[var(--color-figma-warning)]"
                    }
                  >
                    {health!.actionable} issue{health!.actionable === 1 ? "" : "s"}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
        <button
          ref={(node) => {
            if (node) {
              triggerRefs.current.set(collectionId, node);
            } else {
              triggerRefs.current.delete(collectionId);
            }
          }}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            if (isMenuOpen) {
              closeMenu();
            } else {
              openMenuFromTrigger(collectionId);
            }
          }}
          aria-haspopup="menu"
          aria-expanded={isMenuOpen}
          aria-label={`${collectionId} actions`}
          title="Collection actions"
          className={`mr-1 rounded p-1 text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-secondary)] hover:text-[var(--color-figma-text)] ${
            isActive || isMenuOpen
              ? "opacity-100"
              : "opacity-60 group-hover:opacity-100"
          }`}
        >
          <MoreHorizontal size={14} strokeWidth={1.8} aria-hidden />
        </button>
      </div>
    );
  };

  const renderMenu = () => {
    if (!menuState) {
      return null;
    }
    const { collectionId, pos } = menuState;
    return (
      <div
        ref={menuRef}
        role="menu"
        data-context-menu="collection"
        style={{ top: pos.y, left: pos.x, width: MENU_WIDTH }}
        onClick={(event) => event.stopPropagation()}
        className={MENU_SURFACE_CLASS}
      >
        <button
          type="button"
          role="menuitem"
          onClick={() => runMenuAction(collectionId, onOpenCollectionDetails)}
          className={MENU_ITEM_CLASS}
        >
          Open setup…
        </button>
        <div className={MENU_SEPARATOR_CLASS} role="separator" />
        <button
          type="button"
          role="menuitem"
          onClick={() => runMenuAction(collectionId, onRenameCollection)}
          className={MENU_ITEM_CLASS}
        >
          Rename
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => runMenuAction(collectionId, onDuplicateCollection)}
          className={MENU_ITEM_CLASS}
        >
          Create from this collection
        </button>
        <div className={MENU_SEPARATOR_CLASS} role="separator" />
        <button
          type="button"
          role="menuitem"
          disabled={!canMerge}
          onClick={() => runMenuAction(collectionId, onMergeCollection)}
          className={`${MENU_ITEM_CLASS} disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent`}
        >
          Merge into another collection…
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => runMenuAction(collectionId, onSplitCollection)}
          className={MENU_ITEM_CLASS}
        >
          Split by top-level groups…
        </button>
        {onPublishCollection && (
          <>
            <div className={MENU_SEPARATOR_CLASS} role="separator" />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                const count = collectionTokenCounts[collectionId] ?? 0;
                closeMenu();
                onPublishCollection(collectionId, count);
              }}
              className={MENU_ITEM_CLASS}
            >
              Publish to Figma
            </button>
          </>
        )}
        <div className={MENU_SEPARATOR_CLASS} role="separator" />
        <button
          type="button"
          role="menuitem"
          onClick={() => runMenuAction(collectionId, onDeleteCollection)}
          className={MENU_DANGER_ITEM_CLASS}
        >
          Delete collection
        </button>
      </div>
    );
  };

  return (
    <aside
      className="flex h-full shrink-0 flex-col bg-[var(--color-figma-bg)]"
      style={{ width: widthPx }}
    >
      <div className="border-b border-[var(--color-figma-border)] px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-body font-semibold text-[var(--color-figma-text)]">
              Collections
            </h2>
          </div>
          <button
            type="button"
            onClick={() => {
              setCreateOpen((open) => !open);
              setCreateError("");
            }}
            className="rounded-md border border-[var(--color-figma-border)] px-2 py-1 text-secondary font-medium text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
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
            className="w-full rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2.5 py-1.5 text-body text-[var(--color-figma-text)] outline-none placeholder-[var(--color-figma-text-secondary)] focus-visible:border-[var(--color-figma-accent)]"
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
              className="w-full rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2.5 py-1.5 text-body text-[var(--color-figma-text)] outline-none focus-visible:border-[var(--color-figma-accent)]"
            />
            {createError ? (
              <p className="text-secondary text-[var(--color-figma-error)]">{createError}</p>
            ) : null}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleCreateCollection()}
                disabled={creating}
                className="rounded-md bg-[var(--color-figma-accent)] px-2.5 py-1 text-secondary font-medium text-white disabled:opacity-50"
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
                className="rounded-md px-2 py-1 text-secondary text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
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
                    <ChevronRight size={8} strokeWidth={2} className={`transition-transform ${isCollapsed ? "" : "rotate-90"}`} aria-hidden />
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
      {renderMenu()}
    </aside>
  );
}
