import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import type {
  GraphModel,
  GraphNodeId,
  TokenCollection,
} from "@tokenmanager/core";
import type { GraphHopDepthSetting } from "../../hooks/useFocusedSubgraph";
import { GraphFocusPicker } from "./GraphFocusPicker";
import { LegendContent } from "./GraphLegend";

interface GraphToolbarProps {
  focusId: GraphNodeId | null;
  hopDepth: GraphHopDepthSetting;
  scopeCollectionIds: string[];
  collections: TokenCollection[];
  fullGraph: GraphModel;
  onFocusChange: (next: GraphNodeId) => void;
  onHopDepthChange: (next: GraphHopDepthSetting) => void;
  onScopeChange: (next: string[]) => void;
}

export function GraphToolbar({
  hopDepth,
  scopeCollectionIds,
  collections,
  fullGraph,
  onFocusChange,
  onHopDepthChange,
  onScopeChange,
}: GraphToolbarProps) {
  return (
    <div className="flex items-center gap-3 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-2">
      <div className="mx-auto w-full max-w-[480px]">
        <GraphFocusPicker
          fullGraph={fullGraph}
          scopeCollectionIds={scopeCollectionIds}
          placeholder="Inspect a token's dependencies…"
          onSelect={onFocusChange}
        />
      </div>
      <OverflowMenu
        collections={collections}
        scopeCollectionIds={scopeCollectionIds}
        onScopeChange={onScopeChange}
        hopDepth={hopDepth}
        onHopDepthChange={onHopDepthChange}
      />
    </div>
  );
}

interface OverflowMenuProps {
  collections: TokenCollection[];
  scopeCollectionIds: string[];
  onScopeChange: (next: string[]) => void;
  hopDepth: GraphHopDepthSetting;
  onHopDepthChange: (next: GraphHopDepthSetting) => void;
}

function OverflowMenu({
  collections,
  scopeCollectionIds,
  onScopeChange,
  hopDepth,
  onHopDepthChange,
}: OverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const selected = new Set(scopeCollectionIds);
  const toggleCollection = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    if (next.size === 0) return;
    onScopeChange([...next]);
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Graph options"
        aria-expanded={open}
        className="flex h-7 w-7 items-center justify-center rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
      >
        <MoreHorizontal size={14} strokeWidth={2} aria-hidden />
      </button>
      {open ? (
        <div className="absolute right-0 top-[calc(100%+4px)] z-30 flex w-60 flex-col gap-4 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] p-3 shadow-lg">
          {collections.length > 1 ? (
            <div className="flex flex-col">
              {collections.map((collection) => {
                const isSelected = selected.has(collection.id);
                return (
                  <button
                    key={collection.id}
                    type="button"
                    onClick={() => toggleCollection(collection.id)}
                    className="flex items-center gap-2 rounded px-1 py-1 text-left text-secondary text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
                  >
                    <Checkbox checked={isSelected} />
                    <span className="min-w-0 flex-1 truncate">
                      {collection.id}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => onHopDepthChange(hopDepth === 1 ? "auto" : 1)}
            className="flex items-center gap-2 rounded px-1 py-1 text-left text-secondary text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
          >
            <Checkbox checked={hopDepth === 1} />
            <span className="min-w-0 flex-1">Show 1-hop only</span>
          </button>

          <LegendContent />
        </div>
      ) : null}
    </div>
  );
}

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border text-[9px] ${
        checked
          ? "border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)] text-white"
          : "border-[var(--color-figma-border)]"
      }`}
    >
      {checked ? "✓" : ""}
    </span>
  );
}
