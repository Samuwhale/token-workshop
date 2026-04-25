import type { GraphTokenLike } from "@tokenmanager/core";
import type { TokenMapEntry } from "../../shared/types";

export function projectTokenEntriesToGraphTokens(
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>,
): Record<string, Record<string, GraphTokenLike>> {
  const projectedCollections: Record<string, Record<string, GraphTokenLike>> = {};

  for (const [collectionId, entries] of Object.entries(perCollectionFlat)) {
    const projectedEntries: Record<string, GraphTokenLike> = {};
    for (const [path, entry] of Object.entries(entries)) {
      projectedEntries[path] = {
        $value: entry.$value,
        $type: entry.$type,
        ...(entry.$extensions ? { $extensions: entry.$extensions } : {}),
      };
    }
    projectedCollections[collectionId] = projectedEntries;
  }

  return projectedCollections;
}
