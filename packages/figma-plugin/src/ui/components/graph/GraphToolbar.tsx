import { forwardRef } from "react";
import { ChevronDown, Crosshair, Maximize2, Search } from "lucide-react";
import type { GraphModel, TokenCollection } from "@tokenmanager/core";
import type { GraphFilters, GraphView } from "../../hooks/useGraphScope";

interface GraphToolbarProps {
  graph: GraphModel;
  collections: TokenCollection[];
  selectedCollectionIds: string[];
  filters: GraphFilters;
  searchQuery: string;
  view: GraphView;
  hasFocus: boolean;
  onSelectedCollectionIdsChange: (collectionIds: string[]) => void;
  onFiltersChange: (filters: GraphFilters) => void;
  onSearchQueryChange: (query: string) => void;
  onViewChange: (view: GraphView) => void;
  onClearFocus: () => void;
  onResetView: () => void;
}

const VIEW_OPTIONS: { value: GraphView; label: string }[] = [
  { value: "all", label: "All" },
  { value: "issues", label: "Issues" },
  { value: "generators", label: "Generators" },
];

export const GraphToolbar = forwardRef<HTMLInputElement, GraphToolbarProps>(
  function GraphToolbar(
    {
      graph,
      collections,
      selectedCollectionIds,
      filters,
      searchQuery,
      view,
      hasFocus,
      onSelectedCollectionIdsChange,
      onFiltersChange,
      onSearchQueryChange,
      onViewChange,
      onClearFocus,
      onResetView,
    },
    searchInputRef,
  ) {
    const tokenTypes = [
      ...new Set(
        [...graph.nodes.values()]
          .filter((node) => node.kind === "token" && node.$type)
          .map((node) => (node.kind === "token" ? node.$type! : "")),
      ),
    ].sort();
    const selectedSet = new Set(selectedCollectionIds);
    const scopeLabel =
      selectedCollectionIds.length === 1
        ? collections.find((c) => c.id === selectedCollectionIds[0])?.id ??
          selectedCollectionIds[0]
        : selectedCollectionIds.length === collections.length
          ? "All collections"
          : `${selectedCollectionIds.length} collections`;

    const toggleCollection = (collectionId: string) => {
      const next = new Set(selectedCollectionIds);
      if (next.has(collectionId)) next.delete(collectionId);
      else next.add(collectionId);
      if (next.size === 0) next.add(collectionId);
      onSelectedCollectionIdsChange([...next]);
    };

    return (
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-2 text-secondary">
        <div className="flex min-w-[140px] flex-1 items-center gap-1.5 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2">
          <Search
            size={11}
            strokeWidth={2}
            className="text-[var(--color-figma-text-tertiary)]"
            aria-hidden
          />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            placeholder="Search graph"
            aria-label="Search graph"
            className="min-w-0 flex-1 bg-transparent py-1 text-[var(--color-figma-text)] outline-none placeholder:text-[var(--color-figma-text-tertiary)]"
          />
        </div>

        {collections.length > 1 ? (
          <details className="relative shrink-0">
            <summary
              className="flex cursor-pointer list-none items-center gap-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1 text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
              title="Choose which collections appear in the graph"
            >
              <span className="max-w-[160px] truncate">{scopeLabel}</span>
              <ChevronDown
                size={10}
                strokeWidth={2}
                className="text-[var(--color-figma-text-tertiary)]"
                aria-hidden
              />
            </summary>
            <div className="absolute right-0 top-full z-40 mt-1 w-[240px] rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] p-2 shadow-lg">
              <div className="flex items-center justify-between gap-2 pb-2">
                <span className="font-medium text-[var(--color-figma-text)]">
                  Collections
                </span>
                <button
                  type="button"
                  className="text-[var(--color-figma-accent)] hover:underline"
                  onClick={() =>
                    onSelectedCollectionIdsChange(collections.map((c) => c.id))
                  }
                >
                  All
                </button>
              </div>
              <div className="max-h-44 overflow-auto">
                {collections.map((collection) => (
                  <label
                    key={collection.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
                  >
                    <input
                      type="checkbox"
                      checked={selectedSet.has(collection.id)}
                      onChange={() => toggleCollection(collection.id)}
                    />
                    <span className="min-w-0 truncate">{collection.id}</span>
                  </label>
                ))}
              </div>
            </div>
          </details>
        ) : null}

        <div
          role="radiogroup"
          aria-label="Graph view"
          className="flex shrink-0 overflow-hidden rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]"
        >
          {VIEW_OPTIONS.map((opt) => {
            const active = view === opt.value;
            return (
              <button
                key={opt.value}
                role="radio"
                aria-checked={active}
                type="button"
                onClick={() => onViewChange(opt.value)}
                className={`px-2 py-1 transition-colors ${
                  active
                    ? "bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text)]"
                    : "text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {tokenTypes.length > 1 ? (
          <select
            value={filters.tokenType}
            onChange={(event) =>
              onFiltersChange({ ...filters, tokenType: event.target.value })
            }
            aria-label="Filter by token type"
            className="shrink-0 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-1.5 py-1 text-[var(--color-figma-text)] outline-none transition-colors hover:bg-[var(--color-figma-bg-hover)]"
          >
            <option value="all">All types</option>
            {tokenTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        ) : null}

        <div className="ml-auto flex shrink-0 items-center gap-1">
          {hasFocus ? (
            <button
              type="button"
              onClick={onClearFocus}
              aria-label="Clear focus"
              title="Clear focus"
              className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-1.5 text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
            >
              <Crosshair size={11} strokeWidth={2} aria-hidden />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onResetView}
            aria-label="Fit view"
            title="Fit view"
            className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-1.5 text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
          >
            <Maximize2 size={11} strokeWidth={2} aria-hidden />
          </button>
        </div>
      </div>
    );
  },
);
