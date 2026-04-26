import { X } from "lucide-react";
import type {
  GraphModel,
  GraphNodeId,
  TokenCollection,
  TokenGraphNode,
} from "@tokenmanager/core";
import type { ReactNode } from "react";
import type { TokenMapEntry } from "../../../shared/types";
import { AliasEdgeInspector } from "./inspectors/AliasEdgeInspector";
import { CompareTokensInspector } from "./inspectors/CompareTokensInspector";
import { GeneratorInspector } from "./inspectors/GeneratorInspector";
import { TokenInspector } from "./inspectors/TokenInspector";
import { UnresolvedInspector } from "./inspectors/UnresolvedInspector";

interface GraphInspectorProps {
  graph: GraphModel;
  focusId: GraphNodeId | null;
  selectedEdgeId: string | null;
  selectedTokenIds: GraphNodeId[];
  collections: TokenCollection[];
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>;
  onNavigateToToken: (path: string, collectionId: string) => void;
  onEditGenerator: (generatorId: string) => void;
  onCompareTokens?: (
    a: { path: string; collectionId: string },
    b: { path: string; collectionId: string },
  ) => void;
  onSelectNode: (nodeId: GraphNodeId | null) => void;
  onSelectEdge: (edgeId: string | null) => void;
  onDismiss?: () => void;
}

export function GraphInspector({
  graph,
  focusId,
  selectedEdgeId,
  selectedTokenIds,
  collections,
  perCollectionFlat,
  onNavigateToToken,
  onEditGenerator,
  onCompareTokens,
  onSelectNode,
  onSelectEdge,
  onDismiss,
}: GraphInspectorProps) {
  const node = focusId ? graph.nodes.get(focusId) : null;
  const edge = selectedEdgeId ? graph.edges.get(selectedEdgeId) : null;

  // Multi-token side-by-side comparison takes priority over single-node detail
  // when ≥2 tokens are selected — that's a deliberate user gesture (shift-click)
  // and the inspector is the right surface for the comparison.
  if (selectedTokenIds.length >= 2) {
    const tokens = selectedTokenIds
      .map((id) => graph.nodes.get(id))
      .filter((n): n is TokenGraphNode => n?.kind === "token");
    if (tokens.length >= 2) {
      return (
        <Shell onDismiss={onDismiss}>
          <CompareTokensInspector
            tokens={tokens}
            collections={collections}
            perCollectionFlat={perCollectionFlat}
            onNavigateToToken={onNavigateToToken}
            onSelectNode={onSelectNode}
          />
        </Shell>
      );
    }
  }

  if (edge && edge.kind === "alias") {
    return (
      <Shell onDismiss={onDismiss}>
        <AliasEdgeInspector
          graph={graph}
          edge={edge}
          onNavigateToToken={onNavigateToToken}
          onSelectNode={onSelectNode}
          onSelectEdge={onSelectEdge}
        />
      </Shell>
    );
  }

  if (node?.kind === "token") {
    return (
      <Shell onDismiss={onDismiss}>
        <TokenInspector
          graph={graph}
          token={node}
          collections={collections}
          perCollectionFlat={perCollectionFlat}
          onNavigateToToken={onNavigateToToken}
          onCompareTokens={onCompareTokens}
          onSelectNode={onSelectNode}
        />
      </Shell>
    );
  }

  if (node?.kind === "generator") {
    return (
      <Shell onDismiss={onDismiss}>
        <GeneratorInspector
          generator={node}
          graph={graph}
          onNavigateToToken={onNavigateToToken}
          onEditGenerator={onEditGenerator}
          onSelectNode={onSelectNode}
        />
      </Shell>
    );
  }

  if (node?.kind === "ghost") {
    return (
      <Shell onDismiss={onDismiss}>
        <UnresolvedInspector
          ghost={node}
          graph={graph}
          onSelectNode={onSelectNode}
        />
      </Shell>
    );
  }

  return null;
}

function Shell({
  children,
  onDismiss,
}: {
  children: ReactNode;
  onDismiss?: () => void;
}) {
  return (
    <div className="relative h-full min-h-0 overflow-auto bg-[var(--color-figma-bg)] px-3 pb-4 pt-3">
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Hide inspector"
          title="Hide inspector"
          className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded text-[var(--color-figma-text-tertiary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
        >
          <X size={11} strokeWidth={2} aria-hidden />
        </button>
      ) : null}
      <div className="pr-8">{children}</div>
    </div>
  );
}
