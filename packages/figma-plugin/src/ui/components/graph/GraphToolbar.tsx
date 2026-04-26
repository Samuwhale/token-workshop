import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type {
  GraphModel,
  GraphNodeId,
  TokenCollection,
} from "@tokenmanager/core";
import type { GraphIssueGroup } from "../../hooks/useIssuesGroups";
import { GraphFocusPicker } from "./GraphFocusPicker";
import { GraphIssuesMenu } from "./GraphIssuesMenu";
import { collectionAccentHue } from "./collectionAccent";

interface GraphToolbarProps {
  fullGraph: GraphModel;
  collections: TokenCollection[];
  scopeCollectionIds: string[];
  issueGroups: GraphIssueGroup[];
  onFocusChange: (next: GraphNodeId) => void;
  onScopeChange: (next: string[]) => void;
  onSelectIssue: (nodeId: GraphNodeId) => void;
  onRequestDetach?: (params: {
    edgeId: string;
    screenX: number;
    screenY: number;
  }) => void;
}

export function GraphToolbar({
  fullGraph,
  collections,
  scopeCollectionIds,
  issueGroups,
  onFocusChange,
  onScopeChange,
  onSelectIssue,
  onRequestDetach,
}: GraphToolbarProps) {
  return (
    <div className="flex items-center gap-2 bg-[var(--color-figma-bg)] px-3 py-2">
      <div className="min-w-0 flex-1">
        <GraphFocusPicker
          fullGraph={fullGraph}
          scopeCollectionIds={scopeCollectionIds}
          placeholder="Find a token to explore…"
          onSelect={onFocusChange}
        />
      </div>
      {collections.length > 1 ? (
        <ScopeMenu
          collections={collections}
          scopeCollectionIds={scopeCollectionIds}
          onScopeChange={onScopeChange}
        />
      ) : null}
      <GraphIssuesMenu
        fullGraph={fullGraph}
        groups={issueGroups}
        onOpenInFocus={onSelectIssue}
        onRequestDetach={onRequestDetach}
      />
    </div>
  );
}

interface ScopeMenuProps {
  collections: TokenCollection[];
  scopeCollectionIds: string[];
  onScopeChange: (next: string[]) => void;
}

function ScopeMenu({
  collections,
  scopeCollectionIds,
  onScopeChange,
}: ScopeMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = new Set(scopeCollectionIds);
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    if (next.size === 0) return;
    onScopeChange([...next]);
  };

  const isAll = selected.size === collections.length;
  const summary = isAll
    ? "All collections"
    : selected.size === 1
      ? collections.find((c) => selected.has(c.id))?.id ?? "1 collection"
      : `${selected.size} collections`;
  const singleAccent =
    selected.size === 1
      ? collectionAccentHue([...selected][0])
      : null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-[26px] items-center gap-1.5 rounded px-2 text-secondary text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
      >
        {singleAccent ? (
          <span
            aria-hidden
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: singleAccent }}
          />
        ) : null}
        <span className="max-w-[140px] truncate" title={summary}>
          {summary}
        </span>
        <ChevronDown size={10} strokeWidth={2} aria-hidden />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+4px)] z-30 flex w-56 max-w-[calc(100vw-16px)] flex-col rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] p-1 shadow-lg"
        >
          {!isAll ? (
            <button
              type="button"
              onClick={() =>
                onScopeChange(collections.map((collection) => collection.id))
              }
              className="flex h-7 items-center px-2 text-left text-secondary text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-bg-hover)]"
            >
              Select all
            </button>
          ) : null}
          <ul className="flex flex-col">
            {collections.map((collection) => {
              const isSelected = selected.has(collection.id);
              return (
                <li key={collection.id}>
                  <label className="flex h-7 cursor-pointer items-center gap-2 rounded px-2 text-secondary text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggle(collection.id)}
                      aria-label={collection.id}
                    />
                    <span
                      aria-hidden
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: collectionAccentHue(collection.id) }}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {collection.id}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
