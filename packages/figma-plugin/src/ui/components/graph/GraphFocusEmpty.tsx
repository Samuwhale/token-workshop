import { ArrowRight, Clock } from "lucide-react";
import type { GraphModel, GraphNodeId } from "@tokenmanager/core";
import { useGraphRecents } from "../../hooks/useGraphRecents";
import { collectionAccentHue } from "./collectionAccent";
import { GraphFocusPicker } from "./GraphFocusPicker";

interface GraphFocusEmptyProps {
  fullGraph: GraphModel;
  scopeCollectionIds: string[];
  onSelectFocus: (nodeId: GraphNodeId) => void;
}

export function GraphFocusEmpty({
  fullGraph,
  scopeCollectionIds,
  onSelectFocus,
}: GraphFocusEmptyProps) {
  const recents = useGraphRecents(fullGraph, null);

  return (
    <div className="flex h-full w-full items-center justify-center px-6 py-10">
      <div className="flex w-full max-w-[440px] flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <h2 className="m-0 text-[var(--font-size-md)] font-semibold leading-[var(--leading-tight)] text-[var(--color-figma-text)]">
            Trace how a token connects
          </h2>
          <p className="m-0 text-secondary leading-[var(--leading-body)] text-[var(--color-figma-text-secondary)]">
            Pick a token or generator to see what it depends on, what depends
            on it, and where things break.
          </p>
        </div>

        <GraphFocusPicker
          fullGraph={fullGraph}
          scopeCollectionIds={scopeCollectionIds}
          placeholder="Find a token to explore…"
          autoFocus
          size="comfortable"
          onSelect={onSelectFocus}
        />

        {recents.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 text-secondary text-[var(--color-figma-text-tertiary)]">
              <Clock size={10} strokeWidth={2} aria-hidden />
              <span>Recent</span>
            </div>
            <ul className="flex flex-col">
              {recents.map((entry) => {
                const node = entry.node;
                return (
                  <li key={entry.nodeId}>
                    <button
                      type="button"
                      onClick={() => onSelectFocus(entry.nodeId)}
                      className="group flex h-7 w-full items-center gap-2 rounded px-1.5 text-left text-secondary text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
                    >
                      {node.swatchColor ? (
                        <span
                          aria-hidden
                          className="h-3 w-3 shrink-0 rounded border border-[var(--color-figma-border)]"
                          style={{ background: node.swatchColor }}
                        />
                      ) : (
                        <span
                          aria-hidden
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{
                            background: collectionAccentHue(node.collectionId),
                          }}
                        />
                      )}
                      <span
                        className="min-w-0 flex-1 truncate"
                        title={node.displayName}
                      >
                        {node.displayName}
                      </span>
                      <span
                        className="max-w-[180px] truncate font-mono text-secondary text-[var(--color-figma-text-tertiary)]"
                        title={node.path}
                      >
                        {node.path}
                      </span>
                      <ArrowRight
                        size={10}
                        strokeWidth={2}
                        aria-hidden
                        className="shrink-0 text-[var(--color-figma-text-tertiary)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
