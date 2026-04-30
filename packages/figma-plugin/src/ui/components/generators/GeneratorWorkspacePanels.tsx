import { Plus } from "lucide-react";
import type {
  TokenGeneratorDocumentNode,
  TokenGeneratorNodeKind,
} from "@tokenmanager/core";
import { Button, SearchField } from "../../primitives";

export interface GeneratorPaletteItem {
  kind: TokenGeneratorNodeKind;
  category: string;
  label: string;
  description?: string;
  defaults: Record<string, unknown>;
}

export function NodeLibraryPanel({
  allNodesOpen,
  paletteQuery,
  paletteItems,
  onToggleAllNodes,
  onPaletteQueryChange,
  onAddNode,
  presentation = "sidebar",
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
  presentation?: "sidebar" | "overlay";
}) {
  const className =
    presentation === "overlay"
      ? "flex h-full min-h-0 w-full flex-col overflow-y-auto p-2"
      : "flex w-[244px] shrink-0 flex-col overflow-y-auto border-l border-[var(--color-figma-border)] p-2 max-[760px]:max-h-[220px] max-[760px]:w-full max-[760px]:border-l-0 max-[760px]:border-t";

  return (
    <aside className={className}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        {presentation === "sidebar" ? (
          <h2 className="text-primary font-semibold">Add node</h2>
        ) : (
          <span />
        )}
        <Button
          type="button"
          onClick={onToggleAllNodes}
          variant="ghost"
          size="sm"
          className="px-2"
        >
          {allNodesOpen ? "Suggested" : "All nodes"}
        </Button>
      </div>
      <SearchField
        size="sm"
        value={paletteQuery}
        onChange={(event) => onPaletteQueryChange(event.target.value)}
        onClear={paletteQuery ? () => onPaletteQueryChange("") : undefined}
        placeholder={allNodesOpen ? "Search all nodes" : "Search suggested nodes"}
        aria-label={allNodesOpen ? "Search all nodes" : "Search suggested nodes"}
        containerClassName="mb-1.5"
      />
      <div className="space-y-2">
        {Object.entries(groupBy(paletteItems, (item) => item.category)).map(
          ([category, items]) => (
            <div key={category}>
              <div className="mb-1 px-1 text-tertiary font-medium text-[color:var(--color-figma-text-secondary)]">
                {category}
              </div>
              <div className="space-y-0.5">
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
                    className="flex w-full items-start gap-2 rounded px-1.5 py-1 text-left text-secondary hover:bg-[var(--color-figma-bg-hover)]"
                  >
                    <Plus
                      size={12}
                      className="mt-0.5 shrink-0 text-[color:var(--color-figma-text-secondary)]"
                    />
                    <span className="min-w-0">
                      <span className="block truncate">{item.label}</span>
                      {item.description ? (
                        <span className="block text-tertiary text-[color:var(--color-figma-text-secondary)]">
                          {item.description}
                        </span>
                      ) : null}
                    </span>
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
