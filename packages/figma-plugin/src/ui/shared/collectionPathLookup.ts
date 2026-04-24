export type CollectionPathResolutionReason =
  | "single"
  | "legacy"
  | "ambiguous"
  | "missing";

export interface CollectionPathResolution {
  collectionId?: string;
  reason: CollectionPathResolutionReason;
}

export function getCollectionIdsForPath(params: {
  path: string;
  pathToCollectionId?: Record<string, string>;
  collectionIdsByPath?: Record<string, string[]>;
}): string[] {
  const explicitCollectionIds = [
    ...new Set(params.collectionIdsByPath?.[params.path] ?? []),
  ];
  if (explicitCollectionIds.length > 0) {
    return explicitCollectionIds;
  }

  const fallbackCollectionId = params.pathToCollectionId?.[params.path];
  return fallbackCollectionId ? [fallbackCollectionId] : [];
}

export function pathExistsInCollection(params: {
  path: string;
  collectionId: string;
  pathToCollectionId?: Record<string, string>;
  collectionIdsByPath?: Record<string, string[]>;
}): boolean {
  return getCollectionIdsForPath(params).includes(params.collectionId);
}

export function resolveCollectionIdForPath(params: {
  path: string;
  pathToCollectionId?: Record<string, string>;
  collectionIdsByPath?: Record<string, string[]>;
}): CollectionPathResolution {
  const {
    path,
    pathToCollectionId = {},
    collectionIdsByPath = {},
  } = params;

  const explicitCollectionIds = [...new Set(collectionIdsByPath[path] ?? [])];
  if (explicitCollectionIds.length === 1) {
    return { collectionId: explicitCollectionIds[0], reason: "single" };
  }

  if (explicitCollectionIds.length > 1) {
    return { reason: "ambiguous" };
  }

  const legacyCollectionId = pathToCollectionId[path];
  if (legacyCollectionId) {
    return { collectionId: legacyCollectionId, reason: "legacy" };
  }

  return { reason: "missing" };
}
