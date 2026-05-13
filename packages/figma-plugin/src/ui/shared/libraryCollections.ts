import type { TokenCollection } from "@token-workshop/core";

export function getCollectionDisplayName(
  collectionId: string,
  collectionDisplayNames?: Record<string, string>,
): string {
  return collectionDisplayNames?.[collectionId] || collectionId;
}

function formatList(values: string[]): string {
  if (values.length === 0) {
    return "";
  }
  if (values.length === 1) {
    return values[0];
  }
  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

export function formatCollectionDisplayNameList(
  collectionIds: string[],
  collectionDisplayNames?: Record<string, string>,
): string {
  return formatList(
    collectionIds.map((collectionId) =>
      getCollectionDisplayName(collectionId, collectionDisplayNames),
    ),
  );
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
      displayName.toLowerCase().includes(normalizedQuery) ||
      collection.modes.some((mode) =>
        mode.name.toLowerCase().includes(normalizedQuery),
      )
    );
  });
}
