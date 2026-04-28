import { CircleDot, GitBranch, Plus, Search } from "lucide-react";
import type {
  TokenGeneratorDocument,
  TokenGeneratorDocumentNode,
  TokenGeneratorNodeKind,
} from "@tokenmanager/core";

export interface GeneratorPaletteItem {
  kind: TokenGeneratorNodeKind;
  category: string;
  label: string;
  defaults: Record<string, unknown>;
}

export function GeneratorListSidebar({
  generators,
  activeGeneratorId,
  createPanelOpen,
  onCreate,
  onSelect,
}: {
  generators: TokenGeneratorDocument[];
  activeGeneratorId: string | null;
  createPanelOpen: boolean;
  onCreate: () => void;
  onSelect: (generatorId: string) => void;
}) {
  return (
    <aside className="flex w-[260px] shrink-0 flex-col overflow-y-auto border-r border-[var(--color-figma-border)] px-3 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-primary font-semibold">Generators</h2>
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
          title="Create generator"
        >
          <Plus size={14} />
        </button>
      </div>
      <div className="space-y-1">
        {generators.map((generator) => (
          <button
            key={generator.id}
            type="button"
            onClick={() => onSelect(generator.id)}
            className={`flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors ${
              generator.id === activeGeneratorId && !createPanelOpen
                ? "bg-[var(--color-figma-bg-selected)]"
                : "hover:bg-[var(--color-figma-bg-hover)]"
            }`}
          >
            <GitBranch
              size={14}
              className="mt-0.5 shrink-0 text-[var(--color-figma-text-secondary)]"
            />
            <span className="min-w-0">
              <span className="block truncate text-secondary font-medium">
                {generator.name}
              </span>
              <span className="block truncate text-tertiary text-[var(--color-figma-text-secondary)]">
                {generator.targetCollectionId}
              </span>
            </span>
          </button>
        ))}
        {generators.length === 0 ? (
          <div className="p-2 text-secondary text-[var(--color-figma-text-secondary)]">
            Create generated tokens for this collection.
          </div>
        ) : null}
      </div>
    </aside>
  );
}

export function NodeLibraryPanel({
  allNodesOpen,
  paletteQuery,
  paletteItems,
  onToggleAllNodes,
  onPaletteQueryChange,
  onAddNode,
}: {
  allNodesOpen: boolean;
  paletteQuery: string;
  paletteItems: GeneratorPaletteItem[];
  onToggleAllNodes: () => void;
  onPaletteQueryChange: (value: string) => void;
  onAddNode: (
    item: GeneratorPaletteItem,
    position?: TokenGeneratorDocumentNode["position"],
  ) => void;
}) {
  return (
    <aside className="flex w-[260px] shrink-0 flex-col overflow-y-auto border-l border-[var(--color-figma-border)] p-3 max-[760px]:max-h-[260px] max-[760px]:w-full max-[760px]:border-l-0 max-[760px]:border-t">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-primary font-semibold">Add step</h2>
        <button
          type="button"
          onClick={onToggleAllNodes}
          className="rounded px-2 py-1 text-tertiary font-medium text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
        >
          {allNodesOpen ? "Suggested" : "All nodes"}
        </button>
      </div>
      <div className="mb-2 flex items-center gap-2 rounded-md bg-[var(--color-figma-bg-secondary)] px-2 py-1.5">
        <Search
          size={14}
          className="text-[var(--color-figma-text-secondary)]"
        />
        <input
          value={paletteQuery}
          onChange={(event) => onPaletteQueryChange(event.target.value)}
          placeholder={
            allNodesOpen ? "Search all nodes" : "Search suggested nodes"
          }
          className="min-w-0 flex-1 bg-transparent text-secondary outline-none"
        />
      </div>
      <div className="space-y-3">
        {Object.entries(groupBy(paletteItems, (item) => item.category)).map(
          ([category, items]) => (
            <div key={category}>
              <div className="mb-1 px-1 text-tertiary font-medium text-[var(--color-figma-text-secondary)]">
                {category}
              </div>
              <div className="space-y-1">
                {items.map((item) => (
                  <button
                    key={`${item.kind}-${item.label}`}
                    type="button"
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData(
                        "application/tokenmanager-node",
                        item.label,
                      );
                      event.dataTransfer.effectAllowed = "copy";
                    }}
                    onClick={() => onAddNode(item)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-secondary hover:bg-[var(--color-figma-bg-hover)]"
                  >
                    <CircleDot
                      size={12}
                      className="text-[var(--color-figma-text-secondary)]"
                    />
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          ),
        )}
      </div>
    </aside>
  );
}

function groupBy<T>(
  items: T[],
  keyFn: (item: T) => string,
): Record<string, T[]> {
  return items.reduce<Record<string, T[]>>((groups, item) => {
    const key = keyFn(item);
    groups[key] = [...(groups[key] ?? []), item];
    return groups;
  }, {});
}
