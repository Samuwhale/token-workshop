import type {
  SelectedModes,
  TokenCollection,
  TokenModeValues,
} from "@tokenmanager/core";
import {
  readTokenCollectionModeValues,
} from "@tokenmanager/core";
import type { TokenMapEntry } from "../../shared/types";
import { resolveAllAliases } from "../../shared/resolveAlias";

type TokenModeMap = TokenModeValues;

function readTokenModes(
  entry: TokenMapEntry | undefined,
): TokenModeMap | null {
  const modes = readTokenCollectionModeValues(entry);
  return Object.keys(modes).length > 0 ? modes : null;
}

export function applyModeSelectionsToTokens(
  allTokensFlat: Record<string, TokenMapEntry>,
  collections: TokenCollection[],
  selections: SelectedModes,
  pathToCollectionId?: Record<string, string>,
): Record<string, TokenMapEntry> {
  if (collections.length === 0 || Object.keys(selections).length === 0) {
    return resolveAllAliases(allTokensFlat);
  }

  const collectionsById = new Map(
    collections.map((collection) => [collection.id, collection]),
  );
  const collectionResolvedEntries: Record<string, TokenMapEntry> = {};

  for (const [path, entry] of Object.entries(allTokensFlat)) {
    const tokenModes = readTokenModes(entry);
    if (!tokenModes) {
      collectionResolvedEntries[path] = entry;
      continue;
    }

    let nextValue = entry.$value;
    const collectionId = pathToCollectionId?.[path];
    if (!collectionId || !collectionsById.has(collectionId)) {
      collectionResolvedEntries[path] = entry;
      continue;
    }

    const optionName = selections[collectionId];
    if (optionName) {
      const overrideValue = tokenModes[collectionId]?.[optionName];
      if (overrideValue !== undefined) {
        nextValue = overrideValue as TokenMapEntry["$value"];
      }
    }

    collectionResolvedEntries[path] =
      nextValue === entry.$value
        ? entry
        : {
            ...entry,
            $value: nextValue,
          };
  }

  return resolveAllAliases(collectionResolvedEntries);
}

