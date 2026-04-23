import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronDown, ChevronUp, Plus, Search, Upload } from "lucide-react";
import type { TokenCollection } from "@tokenmanager/core";
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

interface DetailsToggle {
  open: boolean;
  onToggle: () => void;
}

interface LibraryCollectionsRailProps {
  collections: TokenCollection[];
  currentCollectionId?: string | null;
  collectionDisplayNames?: Record<string, string>;
  collectionTokenCounts?: Record<string, number>;
  collectionHealth?: Map<string, CollectionReviewSummary>;
  focusRequestKey?: number;
  allCollectionsScope?: AllCollectionsScope;
  onSelectCollection: (collectionId: string) => void;
  onOpenCreateCollection?: () => void;
  onOpenImport?: () => void;
  bottomPanel?: ReactNode;
  detailsToggle?: DetailsToggle;
}

export function LibraryCollectionsRail({
  collections,
  currentCollectionId = null,
  collectionDisplayNames,
  collectionTokenCounts = {},
  collectionHealth,
  focusRequestKey = 0,
  allCollectionsScope,
  onSelectCollection,
  onOpenCreateCollection,
  onOpenImport,
  bottomPanel,
  detailsToggle,
}: LibraryCollectionsRailProps) {
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
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  }, [focusRequestKey]);

  const showHeader =
    Boolean(onOpenImport) ||
    Boolean(onOpenCreateCollection) ||
    collections.length > 6;
  const showSearch = collections.length > 6;

  return (
    <aside
      aria-label="Collections"
      className="flex h-full w-[232px] shrink-0 flex-col bg-[var(--color-figma-bg-secondary)]"
    >
      {showHeader ? (
        <div className="flex items-center gap-1 px-3 pt-3 pb-1">
          {showSearch ? (
            <div className="flex min-h-[24px] flex-1 items-center gap-1.5 rounded bg-[var(--color-figma-bg)] px-2">
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
          ) : (
            <div className="flex-1" />
          )}
          {onOpenImport ? (
            <IconButton
              onClick={onOpenImport}
              aria-label="Import tokens"
              title="Import tokens"
            >
              <Upload size={12} strokeWidth={1.5} aria-hidden />
            </IconButton>
          ) : null}
          {onOpenCreateCollection ? (
            <IconButton
              onClick={onOpenCreateCollection}
              aria-label="New collection"
              title="New collection"
            >
              <Plus size={12} strokeWidth={1.5} aria-hidden />
            </IconButton>
          ) : null}
        </div>
      ) : null}

      <div className="mt-1 min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
        {allCollectionsScope ? (
          <button
            type="button"
            onClick={allCollectionsScope.onSelect}
            className={`mb-1 flex w-full items-center rounded px-2 py-1 text-left text-body transition-colors ${
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
            {collections.length === 0
              ? "No collections yet."
              : "No matches."}
          </div>
        ) : (
          filteredCollections.map((collection) => {
            const collectionId = collection.id;
            const isCurrent = collectionId === currentCollectionId;
            const summary = collectionHealth?.get(collectionId);
            const actionable = summary?.actionable ?? 0;
            const severity = summary?.severity;
            const tokenCount = collectionTokenCounts[collectionId] ?? 0;
            const displayName = getCollectionDisplayName(
              collectionId,
              collectionDisplayNames,
            );
            const healthTone =
              actionable > 0 && severity === "critical"
                ? "bg-[var(--color-figma-error)]"
                : actionable > 0 && severity === "warning"
                  ? "bg-[var(--color-figma-warning)]"
                  : null;

            const rowTitle =
              actionable > 0
                ? `${displayName} — ${actionable} ${actionable === 1 ? "issue" : "issues"}`
                : displayName;

            return (
              <button
                key={collectionId}
                type="button"
                onClick={() => onSelectCollection(collectionId)}
                className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left transition-colors ${
                  isCurrent
                    ? "bg-[var(--color-figma-bg-selected)]"
                    : "hover:bg-[var(--color-figma-bg-hover)]"
                }`}
                title={rowTitle}
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

      {bottomPanel ? (
        <div className="flex min-h-0 basis-3/5 flex-col overflow-hidden bg-[var(--color-figma-bg)]">
          {bottomPanel}
        </div>
      ) : null}

      {detailsToggle ? (
        <button
          type="button"
          onClick={detailsToggle.onToggle}
          aria-expanded={detailsToggle.open}
          title={detailsToggle.open ? "Hide collection details" : "Show collection details"}
          className="flex shrink-0 items-center justify-between gap-2 px-3 py-2 text-left text-body text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
        >
          <span className="truncate">Collection details</span>
          {detailsToggle.open ? (
            <ChevronDown size={12} strokeWidth={1.5} aria-hidden />
          ) : (
            <ChevronUp size={12} strokeWidth={1.5} aria-hidden />
          )}
        </button>
      ) : null}
    </aside>
  );
}
