export type CollectionPathResolutionReason =
  | "single"
  | "legacy"
  | "ambiguous"
  | "missing";

export interface CollectionPathResolution {
  collectionId?: string;
  reason: CollectionPathResolutionReason;
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

export function resolvePreferredCollectionIdForPath(params: {
  path: string;
  pathToCollectionId?: Record<string, string>;
  collectionIdsByPath?: Record<string, string[]>;
}): string | undefined {
  return resolveCollectionIdForPath(params).collectionId;
}
