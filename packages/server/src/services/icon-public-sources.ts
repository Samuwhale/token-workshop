import {
  PUBLIC_ICON_LIMITS,
  PUBLIC_ICON_PROVIDER_ID,
  normalizeIconPath,
  type IconSource,
  type PublicIconCollection,
  type PublicIconCollectionBrowseResponse,
  type PublicIconCollectionCategory,
  type PublicIconCollectionListResponse,
  type PublicIconImportData,
  type PublicIconImportItem,
  type PublicIconProvider,
  type PublicIconSearchResponse,
  type PublicIconSearchResult,
} from "@token-workshop/core";
import {
  BadRequestError,
  ConflictError,
  ServiceUnavailableError,
} from "../errors.js";

const ICONIFY_API_BASE_URL = "https://api.iconify.design";
const ICONIFY_SOURCE_BASE_URL = "https://icon-sets.iconify.design";
const ICONIFY_PROVIDER_NAME = "Iconify";
const PUBLIC_ICON_IMPORT_CONCURRENCY = 8;
const ICONIFY_COLLECTION_LOOKUP_CONCURRENCY = 8;
const ICONIFY_REQUEST_TIMEOUT_MS = 10_000;
const ICONIFY_COLLECTION_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const ICONIFY_COLLECTION_CACHE_MAX_ENTRIES = 256;
const ICONIFY_SVG_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const ICONIFY_SVG_CACHE_MAX_ENTRIES = 512;
const PUBLIC_ICON_SEARCH_FIELDS = new Set([
  "provider",
  "query",
  "collection",
  "limit",
  "start",
]);
const PUBLIC_ICON_COLLECTION_LIST_FIELDS = new Set([
  "provider",
  "query",
  "limit",
  "start",
]);
const PUBLIC_ICON_COLLECTION_BROWSE_FIELDS = new Set([
  "provider",
  "collection",
  "category",
  "limit",
  "start",
]);
const PUBLIC_ICON_SVG_FIELDS = new Set(["provider", "id"]);

const LICENSES_WITHOUT_ATTRIBUTION = new Set([
  "0BSD",
  "Apache 2.0",
  "Apache License 2.0",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "CC0 1.0",
  "CC0-1.0",
  "ISC",
  "MIT",
  "MIT License",
  "OFL-1.1",
  "SIL OFL 1.1",
].map(normalizeLicenseIdentifier));

const iconifyCollectionCache = new Map<string, IconifyCollectionCacheEntry>();
let iconifyCollectionListCache: IconifyCollectionListCacheEntry | null = null;
let iconifyCollectionListRequest: Promise<PublicIconCollection[]> | null = null;
const iconifyCollectionRequests = new Map<
  string,
  Promise<PublicIconCollection>
>();
const iconifyCollectionBrowseCache = new Map<
  string,
  IconifyCollectionBrowseCacheEntry
>();
const iconifyCollectionBrowseRequests = new Map<
  string,
  Promise<IconifyCollectionBrowseData>
>();
const iconifySvgCache = new Map<string, IconifySvgCacheEntry>();
const iconifySvgRequests = new Map<string, Promise<string>>();

export function listPublicIconProviders(): PublicIconProvider[] {
  return [
    {
      id: PUBLIC_ICON_PROVIDER_ID,
      name: ICONIFY_PROVIDER_NAME,
      description: "Free SVG icon sets with collection license metadata.",
    },
  ];
}

export async function searchPublicIcons(
  input: unknown,
): Promise<PublicIconSearchResponse> {
  const request = readPublicIconSearchRequest(input);
  const url = new URL("/search", ICONIFY_API_BASE_URL);
  url.searchParams.set("query", request.query);
  url.searchParams.set("limit", String(request.limit));
  url.searchParams.set("start", String(request.start));
  if (request.collection) {
    url.searchParams.set("prefix", request.collection);
  }

  const payload = readIconifySearchResponse(
    await fetchIconifyJson(url, "Iconify search"),
  );
  const collections = normalizeIconifyCollections(payload.collections);
  const collectionById = new Map(
    collections.map((collection) => [collection.id, collection]),
  );
  await hydrateMissingSearchCollections(payload.icons, collectionById);
  const icons = payload.icons
    .map((id) => iconifySearchResult(id, collectionById))
    .filter((icon): icon is PublicIconSearchResult => Boolean(icon));

  return {
    provider: iconifyProvider(),
    query: request.query,
    total: payload.total,
    limit: payload.limit,
    start: payload.start,
    icons,
  };
}

export async function listPublicIconCollections(
  input: unknown,
): Promise<PublicIconCollectionListResponse> {
  const request = readPublicIconCollectionListRequest(input);
  const collections = await readIconifyCollections();
  const normalizedQuery = request.query.toLowerCase();
  const filtered = collections.filter((collection) => {
    if (!normalizedQuery) {
      return true;
    }
    return [
      collection.id,
      collection.name,
      collection.category ?? "",
      collection.license.name,
      ...collection.tags,
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });
  const page = filtered.slice(request.start, request.start + request.limit);

  return {
    provider: iconifyProvider(),
    query: request.query,
    total: filtered.length,
    limit: request.limit,
    start: request.start,
    collections: page,
  };
}

export async function browsePublicIconCollection(
  input: unknown,
): Promise<PublicIconCollectionBrowseResponse> {
  const request = readPublicIconCollectionBrowseRequest(input);
  const browsed = await readIconifyCollectionBrowseData(request.collection);
  const iconNames = request.category
    ? (browsed.iconNamesByCategory.get(request.category) ?? [])
    : browsed.iconNames;
  const page = iconNames.slice(request.start, request.start + request.limit);

  return {
    provider: iconifyProvider(),
    collection: browsed.collection,
    ...(request.category ? { category: request.category } : {}),
    total: iconNames.length,
    limit: request.limit,
    start: request.start,
    icons: page.map((name) =>
      publicIconResultFromParts(browsed.collection.id, name, browsed.collection),
    ),
    categories: browsed.categories,
  };
}

export async function readPublicIconImportData(
  input: unknown,
): Promise<PublicIconImportData[]> {
  const request = readPublicIconImportRequest(input);
  const collectionByPrefix = new Map<string, Promise<PublicIconCollection>>();
  const imports = await mapInChunks(
    request.icons,
    PUBLIC_ICON_IMPORT_CONCURRENCY,
    async (icon) => {
      const parsedId = parseIconifyIconId(icon.id);
      const collection = await readIconifyCollectionOnce(
        parsedId.prefix,
        collectionByPrefix,
      );
      const svg = await readIconifySvg(parsedId.prefix, parsedId.name);
      const sourceUrl = iconifySourceUrl(parsedId.prefix, parsedId.name);
      const iconId = iconifyIconId(parsedId.prefix, parsedId.name);
      const source: IconSource = {
        kind: "public-library",
        provider: PUBLIC_ICON_PROVIDER_ID,
        providerName: ICONIFY_PROVIDER_NAME,
        collectionId: collection.id,
        collectionName: collection.name,
        iconId,
        iconName: parsedId.name,
        sourceUrl,
        license: collection.license,
      };

      return {
        source,
        svg,
        path: normalizePublicIconImportPath(icon),
        name: icon.name ?? titleFromIconName(parsedId.name),
        ...(request.tags ? { tags: request.tags } : {}),
      };
    },
  );

  return imports;
}

export async function readPublicIconSvg(input: unknown): Promise<string> {
  const params = isRecord(input) ? input : {};
  rejectUnsupportedFields(params, PUBLIC_ICON_SVG_FIELDS);
  assertPublicIconProvider(params.provider);
  const { prefix, name } = parseIconifyIconId(readRequiredString(params.id, "id"));
  return readIconifySvg(prefix, name);
}

async function hydrateMissingSearchCollections(
  iconIds: string[],
  collectionById: Map<string, PublicIconCollection>,
): Promise<void> {
  const missingPrefixes = uniqueSorted(
    iconIds
      .map((id) => tryParseIconifyIconId(id)?.prefix)
      .filter((prefix): prefix is string =>
        Boolean(prefix && !collectionById.has(prefix)),
      ),
  );
  if (missingPrefixes.length === 0) {
    return;
  }

  const collections = await mapInChunks(
    missingPrefixes,
    ICONIFY_COLLECTION_LOOKUP_CONCURRENCY,
    async (prefix) => {
      try {
        return await readIconifyCollection(prefix);
      } catch (err) {
        if (err instanceof BadRequestError) {
          return null;
        }
        throw err;
      }
    },
  );

  for (const collection of collections) {
    if (collection) {
      collectionById.set(collection.id, collection);
    }
  }
}

function readIconifyCollectionOnce(
  prefix: string,
  collectionByPrefix: Map<string, Promise<PublicIconCollection>>,
): Promise<PublicIconCollection> {
  const existing = collectionByPrefix.get(prefix);
  if (existing) {
    return existing;
  }
  const next = readIconifyCollection(prefix);
  collectionByPrefix.set(prefix, next);
  return next;
}

function iconifyProvider(): PublicIconProvider {
  return listPublicIconProviders()[0];
}

function iconifySearchResult(
  id: string,
  collectionById: Map<string, PublicIconCollection>,
): PublicIconSearchResult | null {
  const parsedId = tryParseIconifyIconId(id);
  if (!parsedId) {
    return null;
  }
  const collection = collectionById.get(parsedId.prefix);
  if (!collection) {
    return null;
  }
  return publicIconResultFromParts(parsedId.prefix, parsedId.name, collection);
}

function publicIconResultFromParts(
  prefix: string,
  name: string,
  collection: PublicIconCollection,
): PublicIconSearchResult {
  const id = iconifyIconId(prefix, name);
  return {
    id,
    provider: PUBLIC_ICON_PROVIDER_ID,
    providerName: ICONIFY_PROVIDER_NAME,
    collection,
    name: titleFromIconName(name),
    path: defaultPublicIconPath(prefix, name),
    svgUrl: publicIconSvgUrl(id),
    sourceUrl: iconifySourceUrl(prefix, name),
  };
}

async function readIconifyCollections(): Promise<PublicIconCollection[]> {
  if (
    iconifyCollectionListCache &&
    iconifyCollectionListCache.expiresAt > Date.now()
  ) {
    return iconifyCollectionListCache.collections;
  }
  if (iconifyCollectionListRequest) {
    return iconifyCollectionListRequest;
  }

  iconifyCollectionListRequest = fetchIconifyCollections();
  try {
    return await iconifyCollectionListRequest;
  } finally {
    iconifyCollectionListRequest = null;
  }
}

async function fetchIconifyCollections(): Promise<PublicIconCollection[]> {
  const url = new URL("/collections", ICONIFY_API_BASE_URL);
  const payload = await fetchIconifyJson(url, "Iconify collection list");
  const collections = normalizeIconifyCollections(payload);
  iconifyCollectionListCache = {
    collections,
    expiresAt: Date.now() + ICONIFY_COLLECTION_CACHE_TTL_MS,
  };
  for (const collection of collections) {
    cacheIconifyCollection(collection.id, collection);
  }
  return collections;
}

async function readIconifyCollectionBrowseData(
  prefix: string,
): Promise<IconifyCollectionBrowseData> {
  const cached = iconifyCollectionBrowseCache.get(prefix);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  if (cached) {
    iconifyCollectionBrowseCache.delete(prefix);
  }
  const existingRequest = iconifyCollectionBrowseRequests.get(prefix);
  if (existingRequest) {
    return existingRequest;
  }

  const request = fetchIconifyCollectionBrowseData(prefix);
  iconifyCollectionBrowseRequests.set(prefix, request);
  try {
    return await request;
  } finally {
    iconifyCollectionBrowseRequests.delete(prefix);
  }
}

async function fetchIconifyCollectionBrowseData(
  prefix: string,
): Promise<IconifyCollectionBrowseData> {
  const collection = await readIconifyCollection(prefix);
  const url = new URL("/collection", ICONIFY_API_BASE_URL);
  url.searchParams.set("prefix", prefix);
  const payload = readIconifyCollectionResponse(
    await fetchIconifyJson(url, `Iconify collection "${prefix}"`),
  );
  const data = normalizeIconifyCollectionBrowseData(collection, payload);
  iconifyCollectionBrowseCache.set(prefix, {
    data,
    expiresAt: Date.now() + ICONIFY_COLLECTION_CACHE_TTL_MS,
  });
  trimCacheMap(
    iconifyCollectionBrowseCache,
    ICONIFY_COLLECTION_CACHE_MAX_ENTRIES,
  );
  return data;
}

async function readIconifyCollection(
  prefix: string,
): Promise<PublicIconCollection> {
  const cached = iconifyCollectionCache.get(prefix);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.collection;
  }
  if (cached) {
    iconifyCollectionCache.delete(prefix);
  }
  const existingRequest = iconifyCollectionRequests.get(prefix);
  if (existingRequest) {
    return existingRequest;
  }

  const request = fetchIconifyCollection(prefix);
  iconifyCollectionRequests.set(prefix, request);
  try {
    return await request;
  } finally {
    iconifyCollectionRequests.delete(prefix);
  }
}

async function fetchIconifyCollection(
  prefix: string,
): Promise<PublicIconCollection> {
  const url = new URL("/collections", ICONIFY_API_BASE_URL);
  url.searchParams.set("prefixes", prefix);
  const payload = await fetchIconifyJson(
    url,
    `Iconify collection "${prefix}" metadata`,
  );
  const collections = normalizeIconifyCollections(payload);
  const collection = collections.find((candidate) => candidate.id === prefix);
  if (!collection) {
    throw new BadRequestError(`Iconify collection "${prefix}" was not found.`);
  }
  cacheIconifyCollection(prefix, collection);
  return collection;
}

async function readIconifySvg(prefix: string, name: string): Promise<string> {
  const key = iconifyIconId(prefix, name);
  const cached = iconifySvgCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.svg;
  }
  if (cached) {
    iconifySvgCache.delete(key);
  }

  const existingRequest = iconifySvgRequests.get(key);
  if (existingRequest) {
    return existingRequest;
  }

  const request = fetchIconifySvg(prefix, name);
  iconifySvgRequests.set(key, request);
  try {
    const svg = await request;
    iconifySvgCache.set(key, {
      svg,
      expiresAt: Date.now() + ICONIFY_SVG_CACHE_TTL_MS,
    });
    trimCacheMap(iconifySvgCache, ICONIFY_SVG_CACHE_MAX_ENTRIES);
    return svg;
  } finally {
    iconifySvgRequests.delete(key);
  }
}

function cacheIconifyCollection(
  prefix: string,
  collection: PublicIconCollection,
): void {
  iconifyCollectionCache.set(prefix, {
    collection,
    expiresAt: Date.now() + ICONIFY_COLLECTION_CACHE_TTL_MS,
  });

  trimCacheMap(iconifyCollectionCache, ICONIFY_COLLECTION_CACHE_MAX_ENTRIES);
}

function trimCacheMap<TKey, TValue>(
  cache: Map<TKey, TValue>,
  maxEntries: number,
): void {
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) {
      return;
    }
    cache.delete(oldestKey);
  }
}

function normalizeIconifyCollections(input: unknown): PublicIconCollection[] {
  if (!isRecord(input)) {
    throw new ConflictError("Iconify collections response must be a JSON object.");
  }
  return Object.entries(input)
    .map(([id, collection]) => normalizeIconifyCollection(id, collection))
    .filter((collection): collection is PublicIconCollection =>
      Boolean(collection),
    );
}

function normalizeIconifyCollection(
  id: string,
  collection: unknown,
): PublicIconCollection | null {
  const normalizedId = tryNormalizeIconifyPathSegment(id, "collection");
  if (!normalizedId) {
    return null;
  }
  if (!isRecord(collection) || !isRecord(collection.license)) {
    return null;
  }
  const license = collection.license;
  const licenseTitle = readOptionalText(license.title);
  const licenseUrl = readOptionalText(license.url);
  if (!licenseTitle || !licenseUrl) {
    return null;
  }
  const normalizedLicenseName = readOptionalText(license.spdx) ?? licenseTitle;
  const normalizedName = readOptionalText(collection.name) ?? normalizedId;
  const normalizedCategory = readOptionalText(collection.category);
  const normalizedTags = Array.isArray(collection.tags)
    ? uniqueSorted(
        collection.tags
          .filter((tag): tag is string => typeof tag === "string")
          .map(readOptionalText)
          .filter((tag): tag is string => Boolean(tag)),
      )
    : [];
  return {
    id: normalizedId,
    name: normalizedName,
    total: readOptionalNonNegativeInteger(collection.total, 0),
    ...(normalizedCategory ? { category: normalizedCategory } : {}),
    tags: normalizedTags,
    license: {
      name: normalizedLicenseName,
      url: licenseUrl,
      attributionRequired: !LICENSES_WITHOUT_ATTRIBUTION.has(
        normalizeLicenseIdentifier(normalizedLicenseName),
      ),
    },
  };
}

function normalizeIconifyCollectionBrowseData(
  collection: PublicIconCollection,
  input: IconifyCollectionResponse,
): IconifyCollectionBrowseData {
  const visibleIcons = new Set<string>();
  const iconNamesByCategory = new Map<string, string[]>();

  for (const name of normalizeIconifyIconNames(input.uncategorized)) {
    visibleIcons.add(name);
  }

  for (const [rawCategoryName, icons] of Object.entries(input.categories ?? {})) {
    const categoryName = readOptionalText(rawCategoryName);
    if (!categoryName) {
      continue;
    }
    const iconNames = normalizeIconifyIconNames(icons);
    if (iconNames.length === 0) {
      continue;
    }
    for (const iconName of iconNames) {
      visibleIcons.add(iconName);
    }
    const existingNames = iconNamesByCategory.get(categoryName) ?? [];
    iconNamesByCategory.set(
      categoryName,
      uniqueSorted([...existingNames, ...iconNames]),
    );
  }

  const categories = Array.from(iconNamesByCategory.entries())
    .map(([name, iconNames]) => ({ name, count: iconNames.length }))
    .sort((left, right) => left.name.localeCompare(right.name));

  return {
    collection,
    iconNames: Array.from(visibleIcons).sort((left, right) =>
      left.localeCompare(right),
    ),
    categories,
    iconNamesByCategory,
  };
}

function normalizeIconifyIconNames(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }
  return uniqueSorted(
    input
      .filter((name): name is string => typeof name === "string")
      .map((name) => tryNormalizeIconifyPathSegment(name, "icon name"))
      .filter((name): name is string => Boolean(name)),
  );
}

async function fetchIconifySvg(prefix: string, name: string): Promise<string> {
  const label = `Iconify icon "${prefix}:${name}"`;
  const response = await fetchIconifyResponse(
    iconifySvgUrl(prefix, name),
    {
      headers: { accept: "image/svg+xml" },
    },
    label,
  );
  if (!response.ok) {
    throw iconifyResponseError(label, response);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("svg")) {
    throw new BadRequestError(`${label} did not return SVG.`);
  }
  const svg = await response.text();
  if (!svg.trim()) {
    throw new BadRequestError(`${label} returned empty SVG.`);
  }
  return svg;
}

async function fetchIconifyJson(url: URL, label: string): Promise<unknown> {
  const response = await fetchIconifyResponse(
    url,
    { headers: { accept: "application/json" } },
    label,
  );
  if (!response.ok) {
    throw iconifyResponseError(label, response);
  }
  try {
    return await response.json();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ConflictError(`Iconify returned invalid JSON: ${message}`);
  }
}

function iconifyResponseError(label: string, response: Response): Error {
  const statusLabel = response.statusText
    ? `${response.status} ${response.statusText}`
    : String(response.status);
  const message = `${label} failed (${statusLabel}).`;
  if (response.status === 429 || response.status >= 500) {
    return new ServiceUnavailableError(message);
  }
  return new BadRequestError(message);
}

function normalizeLicenseIdentifier(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

async function fetchIconifyResponse(
  url: string | URL,
  init: RequestInit,
  label: string,
): Promise<Response> {
  try {
    return await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(ICONIFY_REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    if (isAbortError(err)) {
      throw new ServiceUnavailableError(
        `${label} timed out after ${ICONIFY_REQUEST_TIMEOUT_MS / 1000} seconds.`,
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new ServiceUnavailableError(`${label} failed: ${message}`);
  }
}

async function mapInChunks<T, U>(
  items: T[],
  chunkSize: number,
  mapper: (item: T) => Promise<U>,
): Promise<U[]> {
  const results: U[] = [];
  for (let start = 0; start < items.length; start += chunkSize) {
    const chunk = items.slice(start, start + chunkSize);
    const chunkResults = await Promise.all(chunk.map(mapper));
    results.push(...chunkResults);
  }
  return results;
}

function isAbortError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === "TimeoutError" || err.name === "AbortError")
  );
}

function readPublicIconSearchRequest(input: unknown): {
  query: string;
  collection?: string;
  limit: number;
  start: number;
} {
  const params = isRecord(input) ? input : {};
  rejectUnsupportedFields(params, PUBLIC_ICON_SEARCH_FIELDS);
  assertPublicIconProvider(params.provider);
  const query = readRequiredString(params.query, "query");
  const collection = readOptionalIconifyPathSegment(params.collection, "collection");
  return {
    query,
    ...(collection ? { collection } : {}),
    limit: readOptionalInteger(
      params.limit,
      PUBLIC_ICON_LIMITS.searchDefault,
      1,
      PUBLIC_ICON_LIMITS.searchMax,
      "limit",
    ),
    start: readOptionalInteger(params.start, 0, 0, 10_000, "start"),
  };
}

function readPublicIconCollectionListRequest(input: unknown): {
  query: string;
  limit: number;
  start: number;
} {
  const params = isRecord(input) ? input : {};
  rejectUnsupportedFields(params, PUBLIC_ICON_COLLECTION_LIST_FIELDS);
  assertPublicIconProvider(params.provider);
  const query = readOptionalString(params.query, "query") ?? "";
  return {
    query,
    limit: readOptionalInteger(
      params.limit,
      PUBLIC_ICON_LIMITS.collectionListDefault,
      1,
      PUBLIC_ICON_LIMITS.collectionListMax,
      "limit",
    ),
    start: readOptionalInteger(params.start, 0, 0, 10_000, "start"),
  };
}

function readPublicIconCollectionBrowseRequest(input: unknown): {
  collection: string;
  category?: string;
  limit: number;
  start: number;
} {
  const params = isRecord(input) ? input : {};
  rejectUnsupportedFields(params, PUBLIC_ICON_COLLECTION_BROWSE_FIELDS);
  assertPublicIconProvider(params.provider);
  const collection = readRequiredIconifyPathSegment(params.collection, "collection");
  const category = readOptionalString(params.category, "category");
  return {
    collection,
    ...(category ? { category } : {}),
    limit: readOptionalInteger(
      params.limit,
      PUBLIC_ICON_LIMITS.collectionBrowseDefault,
      1,
      PUBLIC_ICON_LIMITS.collectionBrowseMax,
      "limit",
    ),
    start: readOptionalInteger(params.start, 0, 0, 10_000, "start"),
  };
}

function readPublicIconImportRequest(input: unknown): {
  icons: PublicIconImportItem[];
  tags?: string[];
} {
  if (!isRecord(input)) {
    throw new BadRequestError("Public icon import body must be a JSON object.");
  }
  rejectUnsupportedFields(input, new Set(["icons", "tags"]));
  if (!Array.isArray(input.icons) || input.icons.length === 0) {
    throw new BadRequestError("icons must be a non-empty array.");
  }
  if (input.icons.length > PUBLIC_ICON_LIMITS.importMax) {
    throw new BadRequestError(
      `icons must include ${PUBLIC_ICON_LIMITS.importMax} or fewer items.`,
    );
  }
  const tags = readOptionalTags(input.tags, "tags");
  const icons = input.icons.map((icon, index) => readPublicIconImportItem(icon, index));
  assertUniquePublicIconImports(icons);
  return {
    icons,
    ...(tags ? { tags } : {}),
  };
}

function readPublicIconImportItem(input: unknown, index: number): PublicIconImportItem {
  if (!isRecord(input)) {
    throw new BadRequestError(`icons[${index}] must be a JSON object.`);
  }
  rejectUnsupportedFields(input, new Set(["id", "path", "name"]));
  return {
    id: readRequiredString(input.id, `icons[${index}].id`),
    path: readOptionalString(input.path, `icons[${index}].path`),
    name: readOptionalString(input.name, `icons[${index}].name`),
  };
}

function assertUniquePublicIconImports(icons: PublicIconImportItem[]): void {
  const seenIds = new Set<string>();
  const seenPaths = new Set<string>();

  for (const icon of icons) {
    const parsedId = parseIconifyIconId(icon.id);
    const canonicalId = iconifyIconId(parsedId.prefix, parsedId.name);
    if (seenIds.has(canonicalId)) {
      throw new BadRequestError(`Duplicate public icon id "${icon.id}".`);
    }
    seenIds.add(canonicalId);

    const normalizedPath = normalizePublicIconImportPath(icon);
    if (seenPaths.has(normalizedPath)) {
      throw new BadRequestError(`Duplicate icon path "${normalizedPath}".`);
    }
    seenPaths.add(normalizedPath);
  }
}

function assertPublicIconProvider(value: unknown): void {
  const provider = readOptionalString(value, "provider") ?? PUBLIC_ICON_PROVIDER_ID;
  if (provider !== PUBLIC_ICON_PROVIDER_ID) {
    throw new BadRequestError(`Public icon provider "${provider}" is not supported.`);
  }
}

function parseIconifyIconId(id: string): { prefix: string; name: string } {
  const [prefix, name, extra] = id.split(":");
  if (!prefix || !name || extra !== undefined) {
    throw new BadRequestError(`Iconify icon id "${id}" must look like "collection:name".`);
  }
  return {
    prefix: normalizeIconifyPathSegment(prefix, "collection"),
    name: normalizeIconifyPathSegment(name, "icon name"),
  };
}

function tryParseIconifyIconId(id: string): { prefix: string; name: string } | null {
  try {
    return parseIconifyIconId(id);
  } catch {
    return null;
  }
}

function assertIconifyPathSegment(value: string, label: string): void {
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(value)) {
    throw new BadRequestError(`Iconify ${label} "${value}" is not valid.`);
  }
}

function normalizeIconifyPathSegment(value: string, label: string): string {
  const normalized = value.trim().toLowerCase();
  assertIconifyPathSegment(normalized, label);
  return normalized;
}

function tryNormalizeIconifyPathSegment(
  value: string,
  label: string,
): string | null {
  try {
    return normalizeIconifyPathSegment(value, label);
  } catch {
    return null;
  }
}

function iconifySvgUrl(prefix: string, name: string): string {
  return `${ICONIFY_API_BASE_URL}/${encodeURIComponent(prefix)}/${encodeURIComponent(name)}.svg`;
}

function iconifySourceUrl(prefix: string, name: string): string {
  return `${ICONIFY_SOURCE_BASE_URL}/${encodeURIComponent(prefix)}/${encodeURIComponent(name)}/`;
}

function iconifyIconId(prefix: string, name: string): string {
  return `${prefix}:${name}`;
}

function publicIconSvgUrl(id: string): string {
  const params = new URLSearchParams({
    provider: PUBLIC_ICON_PROVIDER_ID,
    id,
  });
  return `/api/icons/public/svg?${params.toString()}`;
}

function defaultPublicIconPath(prefix: string, name: string): string {
  return normalizeIconPath(`${prefix}.${name}`);
}

function normalizePublicIconImportPath(icon: PublicIconImportItem): string {
  try {
    if (icon.path) {
      return normalizeIconPath(icon.path);
    }
    const { prefix, name } = parseIconifyIconId(icon.id);
    return normalizeIconPath(defaultPublicIconPath(prefix, name));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new BadRequestError(message);
  }
}

function titleFromIconName(name: string): string {
  return name
    .split(/[-_.\s]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new BadRequestError(`${field} must be a non-empty string.`);
  }
  return value.trim();
}

function readOptionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  return readRequiredString(value, field);
}

function readOptionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readRequiredIconifyPathSegment(value: unknown, field: string): string {
  return normalizeIconifyPathSegment(readRequiredString(value, field), field);
}

function readOptionalIconifyPathSegment(
  value: unknown,
  field: string,
): string | undefined {
  const text = readOptionalString(value, field);
  return text ? normalizeIconifyPathSegment(text, field) : undefined;
}

function readOptionalInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  field: string,
): number {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const numberValue =
    typeof value === "string" && value.trim()
      ? Number(value.trim())
      : typeof value === "string"
        ? Number.NaN
        : value;
  if (
    typeof numberValue !== "number" ||
    !Number.isInteger(numberValue) ||
    numberValue < min ||
    numberValue > max
  ) {
    throw new BadRequestError(`${field} must be an integer from ${min} to ${max}.`);
  }
  return numberValue;
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) =>
    left.localeCompare(right),
  );
}

function readPositiveInteger(value: unknown, field: string): number {
  const integer = readNonNegativeInteger(value, field);
  if (integer <= 0) {
    throw new ConflictError(`${field} must be a positive integer.`);
  }
  return integer;
}

function readNonNegativeInteger(value: unknown, field: string): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new ConflictError(`${field} must be a non-negative integer.`);
  }
  return value;
}

function readOptionalNonNegativeInteger(
  value: unknown,
  fallback: number,
): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : fallback;
}

function readOptionalTags(value: unknown, field: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new BadRequestError(`${field} must be an array of strings.`);
  }
  const tags = value.map((tag, index) => {
    if (typeof tag !== "string" || !tag.trim()) {
      throw new BadRequestError(`${field}[${index}] must be a non-empty string.`);
    }
    return tag.trim();
  });
  return Array.from(new Set(tags));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function rejectUnsupportedFields(
  record: Record<string, unknown>,
  allowed: Set<string>,
): void {
  const unsupported = Object.keys(record).filter((key) => !allowed.has(key));
  if (unsupported.length > 0) {
    throw new BadRequestError(
      `Unsupported public icon field${unsupported.length === 1 ? "" : "s"}: ${unsupported.join(", ")}.`,
    );
  }
}

function readIconifySearchResponse(input: unknown): IconifySearchResponse {
  if (!isRecord(input)) {
    throw new ConflictError("Iconify search response must be a JSON object.");
  }
  return {
    icons: readOptionalStringArray(input.icons, "Iconify search icons"),
    total: readNonNegativeInteger(input.total, "Iconify search total"),
    limit: readPositiveInteger(input.limit, "Iconify search limit"),
    start: readNonNegativeInteger(input.start, "Iconify search start"),
    collections: input.collections ?? {},
  };
}

function readIconifyCollectionResponse(
  input: unknown,
): IconifyCollectionResponse {
  if (!isRecord(input)) {
    throw new ConflictError("Iconify collection response must be a JSON object.");
  }
  return {
    uncategorized: input.uncategorized,
    categories:
      input.categories === undefined
        ? {}
        : readRecord(input.categories, "Iconify collection categories"),
  };
}

function readRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new ConflictError(`${field} must be a JSON object.`);
  }
  return value;
}

function readOptionalStringArray(value: unknown, field: string): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new ConflictError(`${field} must be an array.`);
  }
  return value.map((item, index) => {
    if (typeof item !== "string") {
      throw new ConflictError(`${field}[${index}] must be a string.`);
    }
    return item;
  });
}

interface IconifySearchResponse {
  icons: string[];
  total: number;
  limit: number;
  start: number;
  collections: unknown;
}

interface IconifyCollectionResponse {
  uncategorized?: unknown;
  categories?: Record<string, unknown>;
}

interface IconifyCollectionCacheEntry {
  collection: PublicIconCollection;
  expiresAt: number;
}

interface IconifyCollectionListCacheEntry {
  collections: PublicIconCollection[];
  expiresAt: number;
}

interface IconifyCollectionBrowseData {
  collection: PublicIconCollection;
  iconNames: string[];
  categories: PublicIconCollectionCategory[];
  iconNamesByCategory: Map<string, string[]>;
}

interface IconifyCollectionBrowseCacheEntry {
  data: IconifyCollectionBrowseData;
  expiresAt: number;
}

interface IconifySvgCacheEntry {
  svg: string;
  expiresAt: number;
}
