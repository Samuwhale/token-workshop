import { useEffect, useRef, useState } from "react";
import type {
  GraphModel,
  GraphNodeId,
  TokenCollection,
} from "@tokenmanager/core";
import type { GraphMode } from "./GraphCanvas";
import type { GraphHopDepth } from "../../hooks/useFocusedSubgraph";
import { GraphFocusPicker } from "./GraphFocusPicker";
import { LegendPopoverButton } from "./GraphLegend";

interface GraphToolbarProps {
  mode: GraphMode;
  focusId: GraphNodeId | null;
  hopDepth: GraphHopDepth;
  scopeCollectionIds: string[];
  collections: TokenCollection[];
  fullGraph: GraphModel;
  issuesCount: number;
  onModeChange: (next: GraphMode) => void;
  onFocusChange: (next: GraphNodeId) => void;
  onHopDepthChange: (next: GraphHopDepth) => void;
  onScopeChange: (next: string[]) => void;
}

const HOP_DEPTHS: GraphHopDepth[] = [1, 2, "chain"];

export function GraphToolbar({
  mode,
  focusId,
  hopDepth,
  scopeCollectionIds,
  collections,
  fullGraph,
  issuesCount,
  onModeChange,
  onFocusChange,
  onHopDepthChange,
  onScopeChange,
}: GraphToolbarProps) {
  return (
    <div className="flex items-center gap-3 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-2">
      <ModeSwitch mode={mode} issuesCount={issuesCount} onChange={onModeChange} />

      <div className="min-w-0 flex-1">
        {mode === "focus" ? (
          <div className="mx-auto w-full max-w-[360px]">
            <GraphFocusPicker
              fullGraph={fullGraph}
              scopeCollectionIds={scopeCollectionIds}
              placeholder="Search tokens to focus…"
              onSelect={onFocusChange}
            />
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {collections.length > 1 ? (
          <CollectionScopePicker
            collections={collections}
            scopeCollectionIds={scopeCollectionIds}
            onChange={onScopeChange}
          />
        ) : null}
        {mode === "focus" && focusId ? (
          <HopDepthControl value={hopDepth} onChange={onHopDepthChange} />
        ) : null}
        <LegendPopoverButton />
      </div>
    </div>
  );
}

interface ModeSwitchProps {
  mode: GraphMode;
  issuesCount: number;
  onChange: (next: GraphMode) => void;
}

function ModeSwitch({ mode, issuesCount, onChange }: ModeSwitchProps) {
  return (
    <div className="flex shrink-0 overflow-hidden rounded border border-[var(--color-figma-border)]">
      <SegmentButton selected={mode === "focus"} onClick={() => onChange("focus")}>
        Focus
      </SegmentButton>
      <SegmentButton selected={mode === "issues"} onClick={() => onChange("issues")}>
        <span className="flex items-center gap-1.5">
          <span>Issues</span>
          {issuesCount > 0 ? (
            <span
              className={`inline-flex h-3.5 min-w-[14px] items-center justify-center rounded-full px-1 text-[9px] ${
                mode === "issues"
                  ? "bg-white/20 text-white"
                  : "bg-[var(--color-figma-error)]/15 text-[var(--color-figma-error)]"
              }`}
            >
              {issuesCount}
            </span>
          ) : null}
        </span>
      </SegmentButton>
    </div>
  );
}

interface SegmentButtonProps {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function SegmentButton({ selected, onClick, children }: SegmentButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 text-secondary ${
        selected
          ? "bg-[var(--color-figma-accent)] text-white"
          : "bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
      }`}
    >
      {children}
    </button>
  );
}

interface HopDepthControlProps {
  value: GraphHopDepth;
  onChange: (next: GraphHopDepth) => void;
}

function HopDepthControl({ value, onChange }: HopDepthControlProps) {
  return (
    <div
      role="group"
      aria-label="Hop depth"
      className="flex shrink-0 overflow-hidden rounded border border-[var(--color-figma-border)]"
    >
      {HOP_DEPTHS.map((depth) => (
        <button
          key={String(depth)}
          type="button"
          onClick={() => onChange(depth)}
          className={`px-2 py-1 text-[10px] ${
            value === depth
              ? "bg-[var(--color-figma-accent)] text-white"
              : "bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
          }`}
        >
          {depth === "chain" ? "Chain" : depth}
        </button>
      ))}
    </div>
  );
}

interface CollectionScopePickerProps {
  collections: TokenCollection[];
  scopeCollectionIds: string[];
  onChange: (next: string[]) => void;
}

function CollectionScopePicker({
  collections,
  scopeCollectionIds,
  onChange,
}: CollectionScopePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = new Set(scopeCollectionIds);
  const summary =
    selected.size === collections.length
      ? "All collections"
      : selected.size === 1
        ? collections.find((c) => c.id === [...selected][0])?.id ?? "1 collection"
        : `${selected.size} collections`;

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    if (next.size === 0) return;
    onChange([...next]);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
      >
        {summary}
      </button>
      {open ? (
        <div className="absolute right-0 top-[calc(100%+4px)] z-30 w-56 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] p-1 shadow-lg">
          {collections.map((collection) => {
            const isSelected = selected.has(collection.id);
            return (
              <button
                key={collection.id}
                type="button"
                onClick={() => toggle(collection.id)}
                className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-secondary text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
              >
                <span
                  aria-hidden
                  className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border text-[9px] ${
                    isSelected
                      ? "border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)] text-white"
                      : "border-[var(--color-figma-border)]"
                  }`}
                >
                  {isSelected ? "✓" : ""}
                </span>
                <span className="min-w-0 flex-1 truncate">{collection.id}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
