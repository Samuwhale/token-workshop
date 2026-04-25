import { useMemo } from "react";
import type {
  GraphModel,
  GraphNodeId,
  TokenCollection,
} from "@tokenmanager/core";
import { useIssuesGroups } from "../../hooks/useIssuesGroups";
import { IssueCard } from "./IssueCard";

interface GraphIssuesListProps {
  fullGraph: GraphModel;
  scopeCollectionIds: string[];
  collections: TokenCollection[];
  onOpenInFocus: (nodeId: GraphNodeId) => void;
  onRequestDetach?: (params: {
    edgeId: string;
    screenX: number;
    screenY: number;
  }) => void;
}

export function GraphIssuesList({
  fullGraph,
  scopeCollectionIds,
  collections,
  onOpenInFocus,
  onRequestDetach,
}: GraphIssuesListProps) {
  const groups = useIssuesGroups(fullGraph, scopeCollectionIds);
  const labelByCollectionId = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of collections) map.set(c.id, c.id);
    return map;
  }, [collections]);

  if (groups.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center text-secondary text-[var(--color-figma-text-secondary)]">
        No issues in this scope.
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-auto px-4 pb-6 pt-2 text-[var(--color-figma-text)]">
      {groups.map((group) => (
        <section key={group.collectionId} className="mb-5 flex flex-col gap-2">
          <header className="sticky top-0 z-10 bg-[var(--color-figma-bg)] py-1">
            <h3 className="font-medium">
              {labelByCollectionId.get(group.collectionId) ?? group.collectionId}
            </h3>
          </header>
          <div className="flex flex-col gap-2">
            {group.entries.map((entry) => (
              <IssueCard
                key={entry.id}
                entry={entry}
                fullGraph={fullGraph}
                onOpenInFocus={onOpenInFocus}
                onRequestDetach={onRequestDetach}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
