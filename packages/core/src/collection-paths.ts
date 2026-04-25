export type CollectionPathResolutionReason =
  | "single"
  | "preferred"
  | "legacy"
  | "ambiguous"
  | "missing";

export interface CollectionPathResolution {
  collectionId?: string;
  reason: CollectionPathResolutionReason;
}

function normalizePath(path: string): string {
  return path.trim();
}

function normalizeCollectionId(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function getExplicitCollectionIds(
  path: string,
  collectionIdsByPath?: Record<string, string[]>,
): string[] {
  const normalizedPath = normalizePath(path);
  if (!normalizedPath) {
    return [];
  }

  return [
    ...new Set(
      (collectionIdsByPath?.[normalizedPath] ?? [])
        .map((collectionId) => normalizeCollectionId(collectionId))
        .filter((collectionId): collectionId is string => Boolean(collectionId)),
    ),
  ];
}

export function getCollectionIdsForPath(params: {
  path: string;
  pathToCollectionId?: Record<string, string>;
  collectionIdsByPath?: Record<string, string[]>;
}): string[] {
  const normalizedPath = normalizePath(params.path);
  if (!normalizedPath) {
    return [];
  }

  const explicitCollectionIds = getExplicitCollectionIds(
    normalizedPath,
    params.collectionIdsByPath,
  );
  if (explicitCollectionIds.length > 0) {
    return explicitCollectionIds;
  }

  const fallbackCollectionId = normalizeCollectionId(
    params.pathToCollectionId?.[normalizedPath],
  );
  return fallbackCollectionId ? [fallbackCollectionId] : [];
}

export function pathExistsInCollection(params: {
  path: string;
  collectionId: string;
  pathToCollectionId?: Record<string, string>;
  collectionIdsByPath?: Record<string, string[]>;
}): boolean {
  const collectionId = normalizeCollectionId(params.collectionId);
  if (!collectionId) {
    return false;
  }

  return getCollectionIdsForPath(params).includes(collectionId);
}

export function resolveCollectionIdForPath(params: {
  path: string;
  pathToCollectionId?: Record<string, string>;
  collectionIdsByPath?: Record<string, string[]>;
  preferredCollectionId?: string;
}): CollectionPathResolution {
  const {
    pathToCollectionId = {},
    collectionIdsByPath = {},
  } = params;
  const path = normalizePath(params.path);
  const preferredCollectionId = normalizeCollectionId(
    params.preferredCollectionId,
  );
  if (!path) {
    return { reason: "missing" };
  }

  const explicitCollectionIds = getExplicitCollectionIds(
    path,
    collectionIdsByPath,
  );
  if (explicitCollectionIds.length === 1) {
    return { collectionId: explicitCollectionIds[0], reason: "single" };
  }

  if (
    preferredCollectionId &&
    explicitCollectionIds.includes(preferredCollectionId)
  ) {
    return { collectionId: preferredCollectionId, reason: "preferred" };
  }

  if (explicitCollectionIds.length > 1) {
    return { reason: "ambiguous" };
  }

  const legacyCollectionId = normalizeCollectionId(pathToCollectionId[path]);
  if (legacyCollectionId) {
    return { collectionId: legacyCollectionId, reason: "legacy" };
  }

  return { reason: "missing" };
}
