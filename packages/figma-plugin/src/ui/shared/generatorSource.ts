import { createGeneratorOwnershipKey } from "@tokenmanager/core";
import { getCollectionIdsForPath } from "./collectionPathLookup";

export function getGeneratedGroupSourceCollectionIds(params: {
  sourceTokenPath?: string;
  sourceCollectionId?: string;
  pathToCollectionId?: Record<string, string>;
  collectionIdsByPath?: Record<string, string[]>;
}): string[] {
  const sourceTokenPath = params.sourceTokenPath?.trim();
  if (!sourceTokenPath) {
    return [];
  }

  const explicitCollectionId = params.sourceCollectionId?.trim();
  if (explicitCollectionId) {
    return [explicitCollectionId];
  }

  return getCollectionIdsForPath({
    path: sourceTokenPath,
    pathToCollectionId: params.pathToCollectionId,
    collectionIdsByPath: params.collectionIdsByPath,
  });
}

export function getGeneratedGroupSourceCollectionId(params: {
  sourceTokenPath?: string;
  sourceCollectionId?: string;
  pathToCollectionId?: Record<string, string>;
  collectionIdsByPath?: Record<string, string[]>;
}): string | undefined {
  return getGeneratedGroupSourceCollectionIds(params)[0];
}

export function createGeneratedGroupSourceKeys(params: {
  sourceTokenPath?: string;
  sourceCollectionId?: string;
  pathToCollectionId?: Record<string, string>;
  collectionIdsByPath?: Record<string, string[]>;
}): string[] {
  const sourceTokenPath = params.sourceTokenPath?.trim();
  if (!sourceTokenPath) {
    return [];
  }

  const sourceCollectionIds = getGeneratedGroupSourceCollectionIds(params);
  if (sourceCollectionIds.length === 0) {
    return [createGeneratorOwnershipKey("", sourceTokenPath)];
  }

  return sourceCollectionIds.map((collectionId) =>
    createGeneratorOwnershipKey(collectionId, sourceTokenPath),
  );
}

export function createGeneratedGroupSourceKey(params: {
  sourceTokenPath?: string;
  sourceCollectionId?: string;
  pathToCollectionId?: Record<string, string>;
  collectionIdsByPath?: Record<string, string[]>;
}): string | undefined {
  return createGeneratedGroupSourceKeys(params)[0];
}

export function hasGeneratedGroupSourceKeyMatch(params: {
  sourceTokenPath?: string;
  sourceCollectionId?: string;
  targetSourceKeys: ReadonlySet<string>;
  pathToCollectionId?: Record<string, string>;
  collectionIdsByPath?: Record<string, string[]>;
}): boolean {
  if (params.targetSourceKeys.size === 0) {
    return false;
  }

  return createGeneratedGroupSourceKeys(params).some((key) =>
    params.targetSourceKeys.has(key),
  );
}
