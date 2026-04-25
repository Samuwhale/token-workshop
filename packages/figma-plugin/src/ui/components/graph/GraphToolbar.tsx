import { Filter, Search, X } from "lucide-react";
import type { GraphModel, TokenCollection } from "@tokenmanager/core";

interface GraphFilters {
  tokenType: string;
  health: string;
  generatorType: string;
}

interface GraphToolbarProps {
  graph: GraphModel;
  focusedPath: string | null;
  workingCollectionLabel: string;
  collections: TokenCollection[];
  selectedCollectionIds: string[];
  filters: GraphFilters;
  searchQuery: string;
  onSelectedCollectionIdsChange: (collectionIds: string[]) => void;
  onFiltersChange: (filters: GraphFilters) => void;
  onSearchQueryChange: (query: string) => void;
  onClearFocus: () => void;
  onResetView: () => void;
}

export function GraphToolbar({
  graph,
  focusedPath,
  workingCollectionLabel,
  collections,
  selectedCollectionIds,
  filters,
  searchQuery,
  onSelectedCollectionIdsChange,
  onFiltersChange,
  onSearchQueryChange,
  onClearFocus,
  onResetView,
}: GraphToolbarProps) {
  const tokenCount = [...graph.nodes.values()].filter(
    (n) => n.kind === "token",
  ).length;
  const cycleCount = [...graph.nodes.values()].filter(
    (n) => n.kind === "token" && n.health === "cycle",
  ).length;
  const brokenTokenCount = [...graph.nodes.values()].filter(
    (n) => n.kind === "token" && n.health === "broken",
  ).length;
  const generatorIssueCount = [...graph.nodes.values()].filter(
    (n) =>
      n.kind === "generator" &&
      (n.health === "broken" || n.health === "generator-error"),
  ).length;
  const tokenTypes = [...new Set(
    [...graph.nodes.values()]
      .filter((node) => node.kind === "token" && node.$type)
      .map((node) => (node.kind === "token" ? node.$type! : "")),
  )].sort();
  const generatorTypes = [...new Set(
    [...graph.nodes.values()]
      .filter((node) => node.kind === "generator")
      .map((node) => (node.kind === "generator" ? node.generatorType : "")),
  )].sort();
  const selectedSet = new Set(selectedCollectionIds);
  const selectedCollectionLabel =
    selectedCollectionIds.length === 1
      ? selectedCollectionIds[0]
      : selectedCollectionIds.length === collections.length
        ? "All collections"
        : `${selectedCollectionIds.length} collections`;

  const toggleCollection = (collectionId: string) => {
    const next = new Set(selectedCollectionIds);
    if (next.has(collectionId)) next.delete(collectionId);
    else next.add(collectionId);
    if (next.size === 0) {
      next.add(collectionId);
    }
    onSelectedCollectionIdsChange([...next]);
  };

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-figma-border)] px-3 py-2 text-secondary">
      <div className="flex items-center gap-2 rounded-full border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1 text-[var(--color-figma-text-secondary)]">
        <span className="text-[var(--color-figma-text)]">{workingCollectionLabel}</span>
        {focusedPath ? (
          <>
            <span className="text-[var(--color-figma-text-tertiary)]">→</span>
            <span className="font-mono text-[var(--color-figma-text)]">{focusedPath}</span>
            <button
              type="button"
              onClick={onClearFocus}
              className="ml-1 rounded p-0.5 text-[var(--color-figma-text-tertiary)] hover:bg-[var(--color-figma-bg-hover)]"
              aria-label="Clear focus"
            >
              <X size={10} strokeWidth={2} />
            </button>
          </>
        ) : (
          <span className="text-[var(--color-figma-text-tertiary)]">
            · {tokenCount} tokens
            {brokenTokenCount > 0 ? ` · ${brokenTokenCount} broken` : ""}
            {cycleCount > 0 ? ` · ${cycleCount} in cycle` : ""}
            {generatorIssueCount > 0
              ? ` · ${generatorIssueCount} generator issue${generatorIssueCount === 1 ? "" : "s"}`
              : ""}
          </span>
        )}
      </div>

      <details className="relative">
        <summary className="flex cursor-pointer list-none items-center gap-1 rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1 text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]">
          <Filter size={10} strokeWidth={2} aria-hidden />
          <span>{selectedCollectionLabel}</span>
        </summary>
        <div className="absolute left-0 top-full z-40 mt-1 w-[260px] rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] p-2 shadow-lg">
          <div className="flex items-center justify-between gap-2 pb-2">
            <span className="font-medium text-[var(--color-figma-text)]">Scope</span>
            <button
              type="button"
              className="text-[var(--color-figma-accent)] hover:underline"
              onClick={() => onSelectedCollectionIdsChange(collections.map((c) => c.id))}
            >
              All
            </button>
          </div>
          <div className="max-h-36 overflow-auto">
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
                {collection.id === workingCollectionLabel ? (
                  <span className="ml-auto text-[10px] text-[var(--color-figma-text-tertiary)]">
                    current
                  </span>
                ) : null}
              </label>
            ))}
          </div>

          <div className="mt-2 grid grid-cols-1 gap-2 border-t border-[var(--color-figma-border)] pt-2">
            <label className="flex items-center justify-between gap-2">
              <span className="text-[var(--color-figma-text-secondary)]">Type</span>
              <select
                value={filters.tokenType}
                onChange={(event) =>
                  onFiltersChange({ ...filters, tokenType: event.target.value })
                }
                className="min-w-0 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-1 py-0.5 text-[var(--color-figma-text)]"
              >
                <option value="all">All tokens</option>
                {tokenTypes.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center justify-between gap-2">
              <span className="text-[var(--color-figma-text-secondary)]">Health</span>
              <select
                value={filters.health}
                onChange={(event) =>
                  onFiltersChange({ ...filters, health: event.target.value })
                }
                className="min-w-0 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-1 py-0.5 text-[var(--color-figma-text)]"
              >
                <option value="all">All</option>
                <option value="issues">Issues</option>
                <option value="broken">Broken</option>
                <option value="cycle">Cycle</option>
                <option value="generator-error">Generator error</option>
              </select>
            </label>
            <label className="flex items-center justify-between gap-2">
              <span className="text-[var(--color-figma-text-secondary)]">Generators</span>
              <select
                value={filters.generatorType}
                onChange={(event) =>
                  onFiltersChange({ ...filters, generatorType: event.target.value })
                }
                className="min-w-0 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-1 py-0.5 text-[var(--color-figma-text)]"
              >
                <option value="all">All generators</option>
                {generatorTypes.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </details>

      <div className="flex flex-1 items-center gap-1 rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2">
        <Search size={10} strokeWidth={2} className="text-[var(--color-figma-text-tertiary)]" aria-hidden />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          placeholder="Search tokens and generators"
          aria-label="Search graph"
          className="min-w-0 flex-1 bg-transparent py-1 text-[var(--color-figma-text)] outline-none placeholder:text-[var(--color-figma-text-tertiary)]"
        />
      </div>

      <button
        type="button"
        onClick={onResetView}
        className="rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1 text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
      >
        Reset view
      </button>
    </div>
  );
}
