import {
  readTokenModeValuesForCollection,
  type TokenCollection,
} from "@token-workshop/core";
import { resolveAllAliases } from "../../shared/resolveAlias";
import type { TokenMapEntry } from "../../shared/types";

const STYLE_TYPES = new Set(["color", "gradient", "typography", "shadow"]);

export interface ScopedTokenTarget {
  path: string;
  collectionId: string;
}

export interface StylePublishModeValue {
  raw: unknown;
  resolved: unknown;
}

export interface StylePublishTokenPayload {
  path: string;
  $type: string;
  $value: unknown;
  resolvedValue?: unknown;
  collectionId: string;
  figmaCollection?: string;
  figmaMode?: string;
  primaryModeName?: string;
  modeValues?: Record<string, StylePublishModeValue>;
}

function buildGlobalRawFlatMap(
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>,
): Record<string, TokenMapEntry> {
  const globalFlat: Record<string, TokenMapEntry> = {};

  for (const collectionFlat of Object.values(perCollectionFlat)) {
    for (const [path, entry] of Object.entries(collectionFlat)) {
      if (!(path in globalFlat)) {
        globalFlat[path] = entry;
      }
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
    const modeValue = modeValues[modeName];
    nextFlat[path] = {
      ...entry,
      $value: (modeValue !== undefined ? modeValue : entry.$value) as TokenMapEntry['$value'],
    };
  }

  return nextFlat;
}

export function buildStylePublishTokens({
  targets,
  collections,
  perCollectionFlat,
  collectionMap,
  modeMap,
}: {
  targets: ScopedTokenTarget[];
  collections: TokenCollection[];
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>;
  collectionMap: Record<string, string>;
  modeMap: Record<string, string>;
}): StylePublishTokenPayload[] {
  const collectionById = new Map(
    collections.map((collection) => [collection.id, collection] as const),
  );
  const globalRawFlat = buildGlobalRawFlatMap(perCollectionFlat);
  const resolvedCollectionCache = new Map<string, Record<string, TokenMapEntry>>();
  const rawModeCache = new Map<string, Record<string, TokenMapEntry>>();
  const resolvedModeCache = new Map<string, Record<string, TokenMapEntry>>();

  const getResolvedCollectionFlat = (
    collectionId: string,
  ): Record<string, TokenMapEntry> => {
    const cached = resolvedCollectionCache.get(collectionId);
    if (cached) {
      return cached;
    }

    const resolvedCollectionFlat = resolveAllAliases({
      ...globalRawFlat,
      ...(perCollectionFlat[collectionId] ?? {}),
    });
    resolvedCollectionCache.set(collectionId, resolvedCollectionFlat);
    return resolvedCollectionFlat;
  };

  const getRawModeFlat = (
    collection: TokenCollection,
    modeName: string,
  ): Record<string, TokenMapEntry> => {
    const cacheKey = `${collection.id}\u0000${modeName}`;
    const cached = rawModeCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const rawModeFlat = buildCollectionModeRawFlatMap(
      collection,
      perCollectionFlat[collection.id] ?? {},
      globalRawFlat,
      modeName,
    );
    rawModeCache.set(cacheKey, rawModeFlat);
    return rawModeFlat;
  };

  const getResolvedModeFlat = (
    collection: TokenCollection,
    modeName: string,
  ): Record<string, TokenMapEntry> => {
    const cacheKey = `${collection.id}\u0000${modeName}`;
    const cached = resolvedModeCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const rawModeFlat = getRawModeFlat(collection, modeName);
    const resolvedModeFlat = resolveAllAliases(rawModeFlat);
    resolvedModeCache.set(cacheKey, resolvedModeFlat);
    return resolvedModeFlat;
  };

  const tokens: StylePublishTokenPayload[] = [];

  for (const { path, collectionId } of targets) {
    const rawEntry = perCollectionFlat[collectionId]?.[path];
    const resolvedEntry = getResolvedCollectionFlat(collectionId)[path];
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
              const rawModeValue = getRawModeFlat(collection, mode.name)[path]?.$value ?? rawEntry.$value;

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
