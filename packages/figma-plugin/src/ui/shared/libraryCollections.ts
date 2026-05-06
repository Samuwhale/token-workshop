import type { TokenCollection } from "@token-workshop/core";

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
