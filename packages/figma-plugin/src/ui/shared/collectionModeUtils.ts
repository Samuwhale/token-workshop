import type { TokenCollection } from "@token-workshop/core";
import type { TokenEditorModeValues } from "./tokenEditorTypes";
import {
  readTokenCollectionModeValues,
  sanitizeModeValuesForCollection,
} from "@token-workshop/core";
import type { TokenMapEntry } from "../../shared/types";
import { resolveAllAliases } from "../../shared/resolveAlias";

type SelectedModeNamesByCollection = Record<string, string>;

function cloneModeValue<T>(value: T): T {
  return typeof value === "object" && value !== null
    ? structuredClone(value)
    : value;
}

function readTokenModes(
  entry: TokenMapEntry | undefined,
): ReturnType<typeof readTokenCollectionModeValues> | null {
  const modes = readTokenCollectionModeValues(entry);
  return Object.keys(modes).length > 0 ? modes : null;
}

function getSelectedModeValue(
  entry: TokenMapEntry,
  collection: TokenCollection,
  selectedModeName: string | undefined,
): TokenMapEntry["$value"] {
  if (!selectedModeName) {
    return entry.$value;
  }

  const selectedModeIndex = collection.modes.findIndex(
    (mode) => mode.name === selectedModeName,
  );
  if (selectedModeIndex <= 0) {
    return entry.$value;
  }

  const tokenModes = readTokenModes(entry);
  const selectedModeValue = tokenModes?.[collection.id]?.[selectedModeName];
  return selectedModeValue === undefined
    ? entry.$value
    : selectedModeValue as TokenMapEntry["$value"];
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

export function createEditorModeValuesForCollection(
  collection: TokenCollection | null | undefined,
  firstModeValue: unknown,
): TokenEditorModeValues {
  if (!collection || collection.modes.length <= 1) {
    return {};
  }

  const [, ...additionalModes] = collection.modes;
  if (additionalModes.length === 0) {
    return {};
  }

  return {
    [collection.id]: Object.fromEntries(
      additionalModes.map((mode) => [
        mode.name,
        cloneModeValue(firstModeValue),
      ]),
    ),
  };
}

export function applyModeSelectionsToTokens(
  allTokensFlat: Record<string, TokenMapEntry>,
  collections: TokenCollection[],
  selections: SelectedModeNamesByCollection,
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
    const collectionId = pathToCollectionId?.[path];
    const collection = collectionId
      ? collectionsById.get(collectionId)
      : undefined;
    if (!collectionId || !collection) {
      collectionResolvedEntries[path] = entry;
      continue;
    }

    const nextValue = getSelectedModeValue(
      entry,
      collection,
      selections[collectionId],
    );

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
