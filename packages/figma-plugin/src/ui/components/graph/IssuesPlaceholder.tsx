import type { GraphModel, GraphNodeId } from "@tokenmanager/core";
import {
  useIssuesGroups,
  type GraphIssueEntry,
} from "../../hooks/useIssuesGroups";

interface IssuesPlaceholderProps {
  fullGraph: GraphModel;
  scopeCollectionIds: string[];
  onSelectIssue: (primaryNodeId: GraphNodeId) => void;
}

const KIND_LABELS: Record<GraphIssueEntry["kind"], string> = {
  "broken-alias": "Broken alias",
  "ghost-reference": "Missing reference",
  cycle: "Cycle",
  "ambiguous-generator-source": "Ambiguous source",
};

/**
 * PR1 placeholder for the Issues mode. The visual treatment is intentionally
 * minimal — the goal is to prove `useIssuesGroups` returns the right tokens
 * with the right grouping. PR2 ships the proper card layout.
 */
export function IssuesPlaceholder({
  fullGraph,
  scopeCollectionIds,
  onSelectIssue,
}: IssuesPlaceholderProps) {
  const groups = useIssuesGroups(fullGraph, scopeCollectionIds);

  if (groups.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center text-secondary text-[var(--color-figma-text-secondary)]">
        No issues in this scope.
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col gap-5 overflow-auto p-4 text-[var(--color-figma-text)]">
      {groups.map((group) => (
        <section key={group.collectionId} className="flex flex-col gap-1.5">
          <h3 className="font-medium">{group.collectionLabel}</h3>
          <ul className="flex flex-col">
            {group.entries.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => onSelectIssue(entry.primaryNodeId)}
                  className="flex w-full items-baseline gap-3 rounded px-1.5 py-1 text-left transition-colors hover:bg-[var(--color-figma-bg-hover)]"
                >
                  <span className="w-32 shrink-0 truncate text-[var(--color-figma-text-secondary)]">
                    {KIND_LABELS[entry.kind]}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {entry.message}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
