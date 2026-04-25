import { X } from "lucide-react";
import type {
  GraphModel,
  GraphNodeId,
  TokenCollection,
} from "@tokenmanager/core";
import type { GraphIssueGroup } from "../../hooks/useIssuesGroups";
import { IssueCard } from "./IssueCard";

interface GraphIssuesPanelProps {
  fullGraph: GraphModel;
  groups: GraphIssueGroup[];
  collections: TokenCollection[];
  onOpenInFocus: (nodeId: GraphNodeId) => void;
  onRequestDetach?: (params: {
    edgeId: string;
    screenX: number;
    screenY: number;
  }) => void;
  onClose: () => void;
}

export function GraphIssuesPanel({
  fullGraph,
  groups,
  collections,
  onOpenInFocus,
  onRequestDetach,
  onClose,
}: GraphIssuesPanelProps) {
  const total = groups.reduce((n, g) => n + g.entries.length, 0);
  const labelByCollectionId = new Map<string, string>();
  for (const c of collections) labelByCollectionId.set(c.id, c.id);

  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col border-r border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
      <header className="flex items-center justify-between px-3 py-2">
        <h3 className="font-medium text-[var(--color-figma-text)]">
          Issues{total > 0 ? ` (${total})` : ""}
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close issues panel"
          className="rounded p-1 text-[var(--color-figma-text-tertiary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
        >
          <X size={12} strokeWidth={2} aria-hidden />
        </button>
      </header>
      {groups.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-3 text-secondary text-[var(--color-figma-text-secondary)]">
          No issues in this scope.
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-3 overflow-auto px-3 pb-4 text-[var(--color-figma-text)]">
          {groups.map((group) => (
            <section key={group.collectionId} className="flex flex-col">
              {groups.length > 1 ? (
                <h4 className="text-secondary text-[var(--color-figma-text-secondary)]">
                  {labelByCollectionId.get(group.collectionId) ?? group.collectionId}
                </h4>
              ) : null}
              {group.entries.map((entry) => (
                <IssueCard
                  key={entry.id}
                  entry={entry}
                  fullGraph={fullGraph}
                  onOpenInFocus={onOpenInFocus}
                  onRequestDetach={onRequestDetach}
                />
              ))}
            </section>
          ))}
        </div>
      )}
    </aside>
  );
}
