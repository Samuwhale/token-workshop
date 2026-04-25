import type { GraphNodeId } from "@tokenmanager/core";

export type LibraryGraphFocusIntent =
  | {
      kind: "token";
      path: string;
      collectionId: string;
      highlightEdgeId?: string;
      issue?: {
        rule: string;
        targetPath?: string;
        targetCollectionId?: string;
        cyclePath?: string[];
      };
    }
  | { kind: "generator"; generatorId: string }
  | { kind: "nodeId"; nodeId: GraphNodeId; highlightEdgeId?: string };

// Module-scope ref — the PanelRouter writes before calling navigateTo(),
// GraphPanel consumes on mount. A bus keeps the intent decoupled from the
// top-level navigation state without requiring a new context.
let pending: LibraryGraphFocusIntent | null = null;
const listeners = new Set<() => void>();

export function setPendingGraphFocus(intent: LibraryGraphFocusIntent): void {
  pending = intent;
  for (const listener of listeners) {
    listener();
  }
}

export function consumePendingGraphFocus(): LibraryGraphFocusIntent | null {
  const out = pending;
  pending = null;
  return out;
}

export function subscribeGraphFocusIntent(
  listener: () => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
