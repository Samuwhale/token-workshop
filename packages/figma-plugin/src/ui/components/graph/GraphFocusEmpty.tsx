import type { GraphModel, GraphNodeId } from "@tokenmanager/core";
import { useGraphRecents } from "../../hooks/useGraphRecents";
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
    <div className="flex h-full w-full items-center justify-center px-6 py-8">
      <div className="flex w-full max-w-[480px] flex-col gap-6">
        <GraphFocusPicker
          fullGraph={fullGraph}
          scopeCollectionIds={scopeCollectionIds}
          placeholder="Inspect a token's dependencies…"
          autoFocus
          size="comfortable"
          onSelect={onSelectFocus}
        />

        {recents.length > 0 ? (
          <section className="flex flex-col gap-1.5">
            <h3 className="text-secondary text-[var(--color-figma-text-secondary)]">
              Recently focused
            </h3>
            <ul className="flex flex-col">
              {recents.map((entry) => (
                <li key={entry.nodeId}>
                  <button
                    type="button"
                    onClick={() => onSelectFocus(entry.nodeId)}
                    className="flex w-full items-baseline gap-3 rounded px-1.5 py-1 text-left text-secondary text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {entry.node.displayName}
                    </span>
                    <span className="shrink-0 truncate text-[10px] text-[var(--color-figma-text-tertiary)]">
                      {entry.node.path}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}
