import type { TokenType } from "@token-workshop/core";
import type { TokenMapEntry } from "../../shared/types";

interface TokenResolveEntry {
  $value: TokenMapEntry["$value"];
  $type?: TokenType;
  $extensions?: TokenMapEntry["$extensions"];
}

export function projectTokenEntriesToResolutionTokens(
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>,
): Record<string, Record<string, TokenResolveEntry>> {
  const projectedCollections: Record<string, Record<string, TokenResolveEntry>> = {};

  for (const [collectionId, entries] of Object.entries(perCollectionFlat)) {
    const projectedEntries: Record<string, TokenResolveEntry> = {};
    for (const [path, entry] of Object.entries(entries)) {
      projectedEntries[path] = {
        $value: entry.$value,
        $type: entry.$type as TokenType,
        ...(entry.$extensions ? { $extensions: entry.$extensions } : {}),
      };
    }
    projectedCollections[collectionId] = projectedEntries;
  }

  return projectedCollections;
}
