import {
  PUBLIC_ICON_LIMITS,
  type PublicIconCollection,
  type PublicIconCollectionBrowseResponse,
  type PublicIconCollectionListResponse,
  type PublicIconResultsResponse,
  type PublicIconSearchResult,
} from "@token-workshop/core";

export type PublicIconSourceId =
  | "lucide"
  | "material-symbols"
  | "tabler"
  | "heroicons"
  | "all"
  | "custom";

export interface PublicIconSourceOption {
  id: Exclude<PublicIconSourceId, "all" | "custom">;
  label: string;
  collection: string;
}

export const PUBLIC_ICON_SOURCES: PublicIconSourceOption[] = [
  { id: "lucide", label: "Lucide", collection: "lucide" },
  {
    id: "material-symbols",
    label: "Material",
    collection: "material-symbols",
  },
  { id: "tabler", label: "Tabler", collection: "tabler" },
  {
    id: "heroicons",
    label: "Heroicons",
    collection: "heroicons",
  },
];

export interface PublicIconLicenseSummary {
  key: string;
  providerName: string;
  collectionName: string;
  licenseName: string;
  licenseUrl: string;
  attributionRequired: boolean;
  iconCount: number;
}

export function summarizePublicIconLicenses(
  icons: PublicIconSearchResult[],
): PublicIconLicenseSummary[] {
  const summaries = new Map<string, PublicIconLicenseSummary>();
  for (const icon of icons) {
    const key = [
      icon.provider,
      icon.collection.id,
      icon.collection.license.name,
      icon.collection.license.url,
      icon.collection.license.attributionRequired ? "attribution" : "no-attribution",
    ].join(":");
    const existing = summaries.get(key);
    if (existing) {
      existing.iconCount += 1;
      continue;
    }
    summaries.set(key, {
      key,
      providerName: icon.providerName,
      collectionName: icon.collection.name,
      licenseName: icon.collection.license.name,
      licenseUrl: icon.collection.license.url,
      attributionRequired: icon.collection.license.attributionRequired,
      iconCount: 1,
    });
  }
  return Array.from(summaries.values()).sort((left, right) =>
    `${left.providerName} ${left.collectionName} ${left.licenseName}`.localeCompare(
      `${right.providerName} ${right.collectionName} ${right.licenseName}`,
    ),
  );
}

export function formatPublicIconSelection(count: number): string {
  return `${count} selected`;
}

export function publicIconImportLabel(count: number, busy: boolean): string {
  if (busy) {
    return "Importing...";
  }
  if (count === 0) {
    return "Import";
  }
  return `Import ${count} icon${count === 1 ? "" : "s"}`;
}

export function publicIconPreviewUrl(
  serverUrl: string,
  icon: PublicIconSearchResult,
): string {
  if (icon.svgUrl.startsWith("data:")) {
    return icon.svgUrl;
  }
  return new URL(icon.svgUrl, serverUrl).toString();
}

export function attributionSummaryLabel(required: boolean): string {
  return required ? "attribution required" : "no attribution required";
}

export function isPublicIconCollectionBrowseResponse(
  response: PublicIconResultsResponse | null,
): response is PublicIconCollectionBrowseResponse {
  return Boolean(response && "collection" in response);
}

export function normalizePublicCollectionId(value: string): string {
  return value.trim().toLowerCase();
}

export function publicCollectionIdError(value: string): string | null {
  const normalized = normalizePublicCollectionId(value);
  if (!normalized) {
    return "Enter an Iconify prefix.";
  }
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(normalized)) {
    return "Iconify prefixes can use letters, numbers, hyphens, and underscores.";
  }
  return null;
}

export function publicIconPageLimit(query: string): number {
  return query
    ? PUBLIC_ICON_LIMITS.searchPage
    : PUBLIC_ICON_LIMITS.collectionBrowsePage;
}

export function publicIconNextStart(response: PublicIconResultsResponse): number {
  return response.start + response.limit;
}

export function publicCollectionNextStart(
  response: PublicIconCollectionListResponse,
): number {
  return response.start + response.limit;
}

export function publicResultSummary(response: PublicIconResultsResponse): string {
  return response.icons.length === response.total
    ? `${response.icons.length} icon${response.icons.length === 1 ? "" : "s"}`
    : `${response.icons.length} of ${response.total} icons`;
}

export function mergePublicIconResults(
  current: PublicIconResultsResponse | null,
  next: PublicIconResultsResponse,
): PublicIconResultsResponse {
  if (!current) {
    return next;
  }
  if (
    isPublicIconCollectionBrowseResponse(current) !==
    isPublicIconCollectionBrowseResponse(next)
  ) {
    return next;
  }
  return {
    ...next,
    start: current.start,
    limit: Math.max(current.limit, publicIconNextStart(next) - current.start),
    icons: mergePublicIconRows(current.icons, next.icons),
  };
}

export function mergePublicCollectionResults(
  current: PublicIconCollectionListResponse | null,
  next: PublicIconCollectionListResponse,
): PublicIconCollectionListResponse {
  if (!current) {
    return next;
  }
  return {
    ...next,
    start: current.start,
    limit: Math.max(
      current.limit,
      publicCollectionNextStart(next) - current.start,
    ),
    collections: mergePublicCollections(current.collections, next.collections),
  };
}

function mergePublicIconRows(
  current: PublicIconSearchResult[],
  next: PublicIconSearchResult[],
): PublicIconSearchResult[] {
  const seen = new Set<string>();
  const merged: PublicIconSearchResult[] = [];
  for (const icon of [...current, ...next]) {
    if (seen.has(icon.id)) {
      continue;
    }
    seen.add(icon.id);
    merged.push(icon);
  }
  return merged;
}

function mergePublicCollections(
  current: PublicIconCollection[],
  next: PublicIconCollection[],
): PublicIconCollection[] {
  const seen = new Set<string>();
  const merged: PublicIconCollection[] = [];
  for (const collection of [...current, ...next]) {
    if (seen.has(collection.id)) {
      continue;
    }
    seen.add(collection.id);
    merged.push(collection);
  }
  return merged;
}
