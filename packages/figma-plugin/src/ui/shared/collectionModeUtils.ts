import type { TokenCollection } from "@token-workshop/core";
import type { TokenEditorModeValues } from "./tokenEditorTypes";
import {
  readTokenCollectionModeValues,
  sanitizeModeValuesForCollection,
} from "@token-workshop/core";
import type { TokenMapEntry } from "../../shared/types";
import { resolveAllAliases } from "../../shared/resolveAlias";

type ModeSelections = Record<string, string>;

function readTokenModes(
  entry: TokenMapEntry | undefined,
): ReturnType<typeof readTokenCollectionModeValues> | null {
  const modes = readTokenCollectionModeValues(entry);
  return Object.keys(modes).length > 0 ? modes : null;
}

export function readEditorCollectionModeValues(
  raw: unknown,
  collection: TokenCollection | null | undefined,
): TokenEditorModeValues {
  if (!collection || !raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  const optionMap = (raw as Record<string, unknown>)[collection.id];
  if (!optionMap || typeof optionMap !== "object" || Array.isArray(optionMap)) {
    return {};
  }

  const filteredModes = sanitizeModeValuesForCollection(
    collection,
    optionMap as Record<string, unknown>,
  );
  return Object.keys(filteredModes).length > 0
    ? { [collection.id]: filteredModes }
    : {};
}

export function sanitizeEditorCollectionModeValues(
  modeValues: TokenEditorModeValues,
  collection: TokenCollection | null | undefined,
): TokenEditorModeValues {
  if (!collection) {
    return {};
  }

  const collectionModes = modeValues[collection.id];
  if (!collectionModes || typeof collectionModes !== "object") {
    return {};
  }

  const filteredModes = sanitizeModeValuesForCollection(
    collection,
    collectionModes,
  );
  return Object.keys(filteredModes).length > 0
    ? { [collection.id]: filteredModes }
    : {};
}

export function applyModeSelectionsToTokens(
  allTokensFlat: Record<string, TokenMapEntry>,
  collections: TokenCollection[],
  selections: ModeSelections,
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
    const collectionId = pathToCollectionId?.[path];
    if (!collectionId || !collectionsById.has(collectionId)) {
      collectionResolvedEntries[path] = entry;
      continue;
    }

    let nextValue = entry.$value;
    const optionName = selections[collectionId];
    if (optionName) {
      const collection = collectionsById.get(collectionId);
      const optionIndex =
        collection?.modes.findIndex((mode) => mode.name === optionName) ?? -1;
      if (optionIndex > 0) {
        const overrideValue = tokenModes?.[collectionId]?.[optionName];
        if (overrideValue === undefined) {
          continue;
        }
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
