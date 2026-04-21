import type {
  SelectedModes,
  TokenCollection,
  TokenModeValues,
} from "@tokenmanager/core";
import type { TokenEditorModeValues } from "./tokenEditorTypes";
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

function getSecondaryModeNames(collection: TokenCollection): Set<string> {
  return new Set(collection.modes.slice(1).map((mode) => mode.name));
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

  const secondaryModeNames = getSecondaryModeNames(collection);
  if (secondaryModeNames.size === 0) {
    return {};
  }

  const filteredEntries = Object.entries(optionMap as Record<string, unknown>).filter(
    ([modeName]) => secondaryModeNames.has(modeName),
  );

  return filteredEntries.length > 0
    ? { [collection.id]: Object.fromEntries(filteredEntries) }
    : {};
}

export function sanitizeEditorCollectionModeValues(
  modeValues: TokenEditorModeValues,
  collection: TokenCollection | null | undefined,
): TokenEditorModeValues {
  if (!collection) {
    return {};
  }

  const secondaryModeNames = getSecondaryModeNames(collection);
  if (secondaryModeNames.size === 0) {
    return {};
  }

  const collectionModes = modeValues[collection.id];
  if (!collectionModes || typeof collectionModes !== "object") {
    return {};
  }

  const filteredEntries = Object.entries(collectionModes).filter(
    ([modeName, value]) =>
      secondaryModeNames.has(modeName) &&
      value !== "" &&
      value !== undefined &&
      value !== null,
  );

  return filteredEntries.length > 0
    ? { [collection.id]: Object.fromEntries(filteredEntries) }
    : {};
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
