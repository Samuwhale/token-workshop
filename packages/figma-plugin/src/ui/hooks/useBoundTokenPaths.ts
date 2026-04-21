import { useMemo } from "react";
import type { SelectionNodeInfo } from "../../shared/types";

/**
 * Derive the set of token paths bound to the given Figma selection. Shared
 * between `TokenList`'s internal selection-aware filter and the Library-wide
 * selection strip so both reflect the same truth.
 */
export function useBoundTokenPaths(
  selectedNodes: SelectionNodeInfo[],
): Set<string> {
  return useMemo(() => {
    const paths = new Set<string>();
    for (const node of selectedNodes) {
      for (const tokenPath of Object.values(node.bindings)) {
        if (tokenPath) paths.add(tokenPath);
      }
    }
    return paths;
  }, [selectedNodes]);
}
