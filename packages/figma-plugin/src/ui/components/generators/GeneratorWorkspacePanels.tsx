import { useState } from "react";
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
  X,
} from "lucide-react";
import type {
  GeneratorPresetKind,
  TokenGeneratorDocument,
  TokenGeneratorDocumentNode,
  TokenGeneratorNodeKind,
} from "@tokenmanager/core";
import { readStructuredGeneratorDraft } from "@tokenmanager/core";
import { Button } from "../../primitives";

export interface GeneratorPaletteItem {
  kind: TokenGeneratorNodeKind;
  category: string;
  label: string;
  description?: string;
  defaults: Record<string, unknown>;
}

export function GeneratorBrowserPanel({
  generators,
  activeGeneratorId,
  createPanelOpen,
  collectionLabel,
  onCreate,
  onSelect,
  onClose,
}: {
  generators: TokenGeneratorDocument[];
  activeGeneratorId: string | null;
  createPanelOpen: boolean;
  collectionLabel: string;
  onCreate: () => void;
  onSelect: (generatorId: string) => void;
  onClose?: () => void;
}) {
  const [query, setQuery] = useState("");
  const filteredGenerators = generators.filter((generator) => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return true;
    return (
      generator.name.toLowerCase().includes(normalized) ||
      readGeneratorOutputLabel(generator).toLowerCase().includes(normalized) ||
      readGeneratorStatusLabel(generator).toLowerCase().includes(normalized)
    );
  });

  return (
    <section className="flex h-full min-h-0 flex-col bg-[var(--color-figma-bg)]">
      <header className="flex min-h-12 shrink-0 items-center gap-2 border-b border-[var(--color-figma-border)] px-3 py-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-primary font-semibold text-[color:var(--color-figma-text)]">
            Generators
          </h2>
          <div className="truncate text-tertiary text-[color:var(--color-figma-text-secondary)]">
            {collectionLabel}
          </div>
        </div>
        <Button type="button" size="sm" variant="primary" onClick={onCreate}>
          <Plus size={14} />
          Create
        </Button>
        {onClose ? (
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)]"
            aria-label="Close generator browser"
            title="Close"
            onClick={onClose}
          >
            <X size={14} />
          </button>
        ) : null}
      </header>
      <div className="border-b border-[var(--color-figma-border)] px-3 py-2">
        <div className="tm-generator-field tm-generator-field--search">
          <Search
            size={14}
            className="shrink-0 text-[color:var(--color-figma-text-secondary)]"
            aria-hidden
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search generators"
            className="min-w-0 flex-1 bg-transparent text-secondary text-[color:var(--color-figma-text)] outline-none"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {filteredGenerators.length > 0 ? (
          <div className="grid gap-1">
            {filteredGenerators.map((generator) => {
              const selected = generator.id === activeGeneratorId && !createPanelOpen;
              return (
                <button
                  key={generator.id}
                  type="button"
                  onClick={() => onSelect(generator.id)}
                  className={`flex w-full min-w-0 items-start gap-2 rounded px-2 py-2 text-left transition-colors ${
                    selected
                      ? "bg-[var(--color-figma-bg-selected)]"
                      : "hover:bg-[var(--color-figma-bg-hover)]"
                  }`}
                >
                  <GeneratorIcon generator={generator} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-secondary font-semibold text-[color:var(--color-figma-text)]">
                      {generator.name}
                    </span>
                    <span className="block truncate text-tertiary text-[color:var(--color-figma-text-secondary)]">
                      {readGeneratorOutputLabel(generator)}
                    </span>
                  </span>
                  <span className="shrink-0 text-tertiary text-[color:var(--color-figma-text-secondary)]">
                    {readGeneratorStatusLabel(generator)}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="px-2 py-8 text-center">
            <div className="text-secondary font-semibold text-[color:var(--color-figma-text)]">
              {generators.length === 0 ? "No generators yet" : "No matching generators"}
            </div>
            <div className="mx-auto mt-1 max-w-[260px] text-secondary text-[color:var(--color-figma-text-secondary)]">
              {generators.length === 0
                ? "Create generated token groups for this collection."
                : "Try a different generator name or output path."}
            </div>
            {generators.length === 0 ? (
              <Button
                type="button"
                size="sm"
                variant="primary"
                className="mt-3"
                onClick={onCreate}
              >
                <Plus size={14} />
                Create generator
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </section>
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

function readGeneratorStatusLabel(generator: TokenGeneratorDocument): string {
  const diagnostics = generator.lastApplyDiagnostics ?? [];
  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return "Needs attention";
  }
  if (diagnostics.some((diagnostic) => diagnostic.severity === "warning")) {
    return "Applied with warnings";
  }
  return generator.lastAppliedAt ? "Applied" : "Not applied";
}

function GeneratorIcon({ generator }: { generator: TokenGeneratorDocument }) {
  const kind = readStructuredGeneratorDraft(generator)?.kind;
  return <GeneratorKindIcon kind={kind} />;
}

function GeneratorKindIcon({ kind }: { kind?: GeneratorPresetKind }) {
  const className =
    "mt-0.5 shrink-0 text-[color:var(--color-figma-text-secondary)]";
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
          <h2 className="text-primary font-semibold">Add node</h2>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={onToggleAllNodes}
          className="rounded px-2 py-1 text-tertiary font-medium text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
        >
          {allNodesOpen ? "Suggested" : "All nodes"}
        </button>
      </div>
      <div className="mb-2 flex items-center gap-2 rounded-md bg-[var(--color-figma-bg-secondary)] px-2 py-1.5">
        <Search
          size={14}
          className="text-[color:var(--color-figma-text-secondary)]"
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
              <div className="mb-1 px-1 text-tertiary font-medium text-[color:var(--color-figma-text-secondary)]">
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
                    className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-secondary hover:bg-[var(--color-figma-bg-hover)]"
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
