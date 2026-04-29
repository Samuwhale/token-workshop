import {
  Circle,
  Droplet,
  Hash,
  Layers,
  Palette,
  Plus,
  Ruler,
  Search,
  Sigma,
  Type,
  Workflow,
} from "lucide-react";
import type {
  GeneratorPresetKind,
  TokenGeneratorDocument,
  TokenGeneratorDocumentNode,
  TokenGeneratorNodeKind,
} from "@tokenmanager/core";
import { readStructuredGeneratorDraft } from "@tokenmanager/core";

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
  presentation = "sidebar",
}: {
  generators: TokenGeneratorDocument[];
  activeGeneratorId: string | null;
  createPanelOpen: boolean;
  onCreate: () => void;
  onSelect: (generatorId: string) => void;
  presentation?: "sidebar" | "overlay";
}) {
  return (
    <aside
      className={
        presentation === "overlay"
          ? "flex h-full min-h-0 w-full flex-col overflow-y-auto px-2 py-2"
          : "flex w-[260px] shrink-0 flex-col overflow-y-auto border-r border-[var(--color-figma-border)] px-2 py-2 max-[760px]:w-[220px]"
      }
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="px-1 text-primary font-semibold">
          {presentation === "overlay" ? "Switch generator" : "Generators"}
        </h2>
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
          title="Create generator"
          aria-label="Create generator"
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
            <GeneratorIcon generator={generator} />
            <span className="min-w-0">
              <span className="block truncate text-secondary font-medium">
                {generator.name}
              </span>
              <span className="block truncate text-tertiary text-[var(--color-figma-text-secondary)]">
                {readGeneratorOutputLabel(generator)}
              </span>
              <span className="block truncate text-tertiary text-[var(--color-figma-text-secondary)]">
                {generator.lastAppliedAt ? "Applied" : "Not applied"}
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

function readGeneratorOutputLabel(generator: TokenGeneratorDocument): string {
  const structured = readStructuredGeneratorDraft(generator);
  if (structured?.outputPrefix) return structured.outputPrefix;
  const output = generator.nodes.find(
    (node) => node.kind === "groupOutput" || node.kind === "output",
  );
  return String(output?.data.pathPrefix ?? output?.data.path ?? "No output");
}

function GeneratorIcon({ generator }: { generator: TokenGeneratorDocument }) {
  const kind = readStructuredGeneratorDraft(generator)?.kind;
  return <GeneratorKindIcon kind={kind} />;
}

function GeneratorKindIcon({ kind }: { kind?: GeneratorPresetKind }) {
  const className =
    "mt-0.5 shrink-0 text-[var(--color-figma-text-secondary)]";
  if (kind === "colorRamp") return <Palette size={14} className={className} />;
  if (kind === "spacing") return <Ruler size={14} className={className} />;
  if (kind === "type") return <Type size={14} className={className} />;
  if (kind === "radius") return <Circle size={14} className={className} />;
  if (kind === "opacity") return <Droplet size={14} className={className} />;
  if (kind === "shadow") return <Layers size={14} className={className} />;
  if (kind === "zIndex") return <Hash size={14} className={className} />;
  if (kind === "formula") return <Sigma size={14} className={className} />;
  return <Workflow size={14} className={className} />;
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
      ? "flex h-full min-h-0 w-full flex-col overflow-y-auto p-3"
      : "flex w-[260px] shrink-0 flex-col overflow-y-auto border-l border-[var(--color-figma-border)] p-3 max-[760px]:max-h-[260px] max-[760px]:w-full max-[760px]:border-l-0 max-[760px]:border-t";

  return (
    <aside className={className}>
      <div className="mb-2 flex items-center justify-between gap-2">
        {presentation === "sidebar" ? (
          <h2 className="text-primary font-semibold">Add step</h2>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={onToggleAllNodes}
          className="rounded px-2 py-1 text-tertiary font-medium text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
        >
          {allNodesOpen ? "Suggested" : "All steps"}
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
            allNodesOpen ? "Search all steps" : "Search suggested steps"
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
                    <Plus
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
