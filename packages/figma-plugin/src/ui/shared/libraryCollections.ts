import type { TokenCollection } from "@tokenmanager/core";
import type { CollectionHealthSummary } from "../hooks/useHealthSignals";

export interface CollectionFolderGroup {
  folder: string;
  collectionIds: string[];
}

export type CollectionListItem = string | CollectionFolderGroup;

export function buildCollectionGroups(collectionIds: string[]): CollectionListItem[] {
  const folderMap = new Map<string, string[]>();
  for (const collectionId of collectionIds) {
    const slashIndex = collectionId.indexOf("/");
    if (slashIndex === -1) {
      continue;
    }
    const folder = collectionId.slice(0, slashIndex);
    if (!folderMap.has(folder)) {
      folderMap.set(folder, []);
    }
    folderMap.get(folder)?.push(collectionId);
  }

  const groups: CollectionListItem[] = [];
  const seenFolders = new Set<string>();
  for (const collectionId of collectionIds) {
    const slashIndex = collectionId.indexOf("/");
    if (slashIndex === -1) {
      groups.push(collectionId);
      continue;
    }
    const folder = collectionId.slice(0, slashIndex);
    if (seenFolders.has(folder)) {
      continue;
    }
    seenFolders.add(folder);
    groups.push({
      folder,
      collectionIds: folderMap.get(folder) ?? [],
    });
  }

  return groups;
}

export function getCollectionLeafName(collectionId: string): string {
  const lastSlashIndex = collectionId.lastIndexOf("/");
  return lastSlashIndex === -1 ? collectionId : collectionId.slice(lastSlashIndex + 1);
}

export function getCollectionDisplayName(
  collectionId: string,
  collectionDisplayNames?: Record<string, string>,
): string {
  return collectionDisplayNames?.[collectionId] || collectionId;
}

export function filterCollections(
  collections: TokenCollection[],
  query: string,
  collectionDisplayNames?: Record<string, string>,
): TokenCollection[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return collections;
  }

  return collections.filter((collection) => {
    const displayName = getCollectionDisplayName(collection.id, collectionDisplayNames);
    return (
      collection.id.toLowerCase().includes(normalizedQuery) ||
      displayName.toLowerCase().includes(normalizedQuery)
    );
  });
}

export function formatCollectionMeta(
  collection: TokenCollection | undefined,
  tokenCount: number,
  health?: CollectionHealthSummary,
): string {
  const parts = [`${tokenCount} token${tokenCount === 1 ? "" : "s"}`];
  const modeCount = collection?.modes.length ?? 0;
  if (modeCount > 1) {
    parts.push(`${modeCount} modes`);
  }
  if (health?.actionable) {
    parts.push(`${health.actionable} issue${health.actionable === 1 ? "" : "s"}`);
  }
  return parts.join(" · ");
}
