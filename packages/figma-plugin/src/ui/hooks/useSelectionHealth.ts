import { useMemo } from "react";
import {
  ALL_BINDABLE_PROPERTIES,
  type BindableProperty,
  type SelectionNodeInfo,
  type TokenMapEntry,
} from "../../shared/types";
import {
  getBindingForProperty,
  getCurrentValue,
  getTokenTypeForProperty,
} from "../components/selectionInspectorUtils";
import { findNearbyTokens } from "./useNearbyTokenMatch";

export interface StaleBindingEntry {
  from: string;
  to?: string;
}

export interface SelectionHealth {
  selectionCount: number;
  hasSelection: boolean;
  unboundWithValueCount: number;
  staleBindingEntries: StaleBindingEntry[];
  staleBindingPaths: string[];
  staleBindingCount: number;
}

export function useSelectionHealth(
  selectedNodes: SelectionNodeInfo[],
  tokenMap: Record<string, TokenMapEntry>,
): SelectionHealth {
  return useMemo(() => {
    const rootNodes = selectedNodes.filter((node) => (node.depth ?? 0) === 0);
    const hasSelection = rootNodes.length > 0;

    let unboundWithValueCount = 0;
    const staleSet = new Set<string>();
    const pathToProperty = new Map<string, BindableProperty>();

    if (hasSelection) {
      for (const prop of ALL_BINDABLE_PROPERTIES) {
        const binding = getBindingForProperty(rootNodes, prop);
        if (!binding) {
          const value = getCurrentValue(rootNodes, prop);
          if (value !== undefined && value !== null) unboundWithValueCount += 1;
        }
      }

      for (const node of rootNodes) {
        for (const [propertyKey, path] of Object.entries(node.bindings)) {
          if (!path || tokenMap[path]) continue;
          staleSet.add(path);
          if (!pathToProperty.has(path)) {
            pathToProperty.set(path, propertyKey as BindableProperty);
          }
        }
      }
    }

    const staleBindingEntries: StaleBindingEntry[] = Array.from(staleSet).map(
      (from) => {
        const property = pathToProperty.get(from);
        if (!property) return { from };
        const currentValue = getCurrentValue(rootNodes, property);
        if (currentValue === undefined || currentValue === null) return { from };
        const matches = findNearbyTokens(
          currentValue,
          getTokenTypeForProperty(property),
          tokenMap,
          from,
        );
        const best =
          matches.find((match) => match.label === "Exact") ?? matches[0] ?? null;
        return best ? { from, to: best.path } : { from };
      },
    );

    return {
      selectionCount: rootNodes.length,
      hasSelection,
      unboundWithValueCount,
      staleBindingEntries,
      staleBindingPaths: staleBindingEntries.map((entry) => entry.from),
      staleBindingCount: staleBindingEntries.length,
    };
  }, [selectedNodes, tokenMap]);
}
