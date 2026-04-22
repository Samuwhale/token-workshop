import {
  readTokenModeValuesForCollection,
  type TokenCollection,
} from "@tokenmanager/core";
import { resolveAllAliases } from "../../shared/resolveAlias";
import type { TokenMapEntry } from "../../shared/types";

const STYLE_TYPES = new Set(["color", "gradient", "typography", "shadow"]);

export interface StylePublishModeValue {
  raw: unknown;
  resolved: unknown;
}

export interface StylePublishTokenPayload {
  path: string;
  $type: string;
  $value: unknown;
  resolvedValue?: unknown;
  collectionId?: string;
  figmaCollection?: string;
  figmaMode?: string;
  primaryModeName?: string;
  modeValues?: Record<string, StylePublishModeValue>;
}

function buildGlobalRawFlatMap(
  pathToCollectionId: Record<string, string>,
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>,
): Record<string, TokenMapEntry> {
  const globalFlat: Record<string, TokenMapEntry> = {};

  for (const [path, collectionId] of Object.entries(pathToCollectionId)) {
    const entry = perCollectionFlat[collectionId]?.[path];
    if (entry) {
      globalFlat[path] = entry;
    }
  }

  return globalFlat;
}

function buildCollectionModeRawFlatMap(
  collection: TokenCollection,
  collectionFlat: Record<string, TokenMapEntry>,
  globalRawFlat: Record<string, TokenMapEntry>,
  modeName: string,
): Record<string, TokenMapEntry> {
  const nextFlat: Record<string, TokenMapEntry> = { ...globalRawFlat };

  for (const [path, entry] of Object.entries(collectionFlat)) {
    const modeValues = readTokenModeValuesForCollection(entry, collection);
    nextFlat[path] = {
      ...entry,
      $value: (modeName in modeValues ? modeValues[modeName] : entry.$value) as TokenMapEntry['$value'],
    };
  }

  return nextFlat;
}

export function buildStylePublishTokens({
  paths,
  collections,
  pathToCollectionId,
  perCollectionFlat,
  collectionMap,
  modeMap,
}: {
  paths: string[];
  collections: TokenCollection[];
  pathToCollectionId: Record<string, string>;
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>;
  collectionMap: Record<string, string>;
  modeMap: Record<string, string>;
}): StylePublishTokenPayload[] {
  const collectionById = new Map(
    collections.map((collection) => [collection.id, collection] as const),
  );
  const globalRawFlat = buildGlobalRawFlatMap(pathToCollectionId, perCollectionFlat);
  const resolvedDefaultFlat = resolveAllAliases(globalRawFlat);
  const resolvedModeCache = new Map<string, Record<string, TokenMapEntry>>();

  const getResolvedModeFlat = (
    collection: TokenCollection,
    modeName: string,
  ): Record<string, TokenMapEntry> => {
    const cacheKey = `${collection.id}\u0000${modeName}`;
    const cached = resolvedModeCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const collectionFlat = perCollectionFlat[collection.id] ?? {};
    const rawModeFlat = buildCollectionModeRawFlatMap(
      collection,
      collectionFlat,
      globalRawFlat,
      modeName,
    );
    const resolvedModeFlat = resolveAllAliases(rawModeFlat);
    resolvedModeCache.set(cacheKey, resolvedModeFlat);
    return resolvedModeFlat;
  };

  const tokens: StylePublishTokenPayload[] = [];

  for (const path of paths) {
    const collectionId = pathToCollectionId[path];
    if (!collectionId) {
      continue;
    }

    const rawEntry = perCollectionFlat[collectionId]?.[path];
    const resolvedEntry = resolvedDefaultFlat[path];
    if (!rawEntry || !resolvedEntry || !STYLE_TYPES.has(String(rawEntry.$type ?? ""))) {
      continue;
    }

    const collection = collectionById.get(collectionId);
    const primaryModeName = collection?.modes[0]?.name;
    const modeValues =
      collection && collection.modes.length > 1
        ? Object.fromEntries(
            collection.modes.map((mode) => {
              const resolvedModeFlat = getResolvedModeFlat(collection, mode.name);
              const rawModeValue =
                buildCollectionModeRawFlatMap(
                  collection,
                  perCollectionFlat[collection.id] ?? {},
                  globalRawFlat,
                  mode.name,
                )[path]?.$value ?? rawEntry.$value;

              return [
                mode.name,
                {
                  raw: rawModeValue,
                  resolved:
                    resolvedModeFlat[path]?.$value ??
                    (mode.name === primaryModeName
                      ? resolvedEntry.$value
                      : rawModeValue),
                },
              ];
            }),
          )
        : undefined;

    tokens.push({
      path,
      $type: String(rawEntry.$type ?? "string"),
      $value: rawEntry.$value,
      resolvedValue: resolvedEntry.$value,
      collectionId,
      figmaCollection: collectionMap[collectionId],
      figmaMode: modeMap[collectionId],
      primaryModeName,
      modeValues,
    });
  }

  return tokens;
}
