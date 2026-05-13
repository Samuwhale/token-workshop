import {
  normalizeIconPath,
  type IconLicenseMetadata,
  type IconSource,
} from "@token-workshop/core";
import {
  BadRequestError,
  ConflictError,
  ServiceUnavailableError,
} from "../errors.js";

const ICONIFY_API_BASE_URL = "https://api.iconify.design";
const ICONIFY_SOURCE_BASE_URL = "https://icon-sets.iconify.design";
const ICONIFY_PROVIDER_ID = "iconify";
const ICONIFY_PROVIDER_NAME = "Iconify";
const PUBLIC_ICON_SEARCH_LIMIT_MAX = 64;
const PUBLIC_ICON_COLLECTION_LIST_LIMIT_MAX = 200;
const PUBLIC_ICON_COLLECTION_BROWSE_LIMIT_MAX = 96;
const PUBLIC_ICON_IMPORT_LIMIT_MAX = 64;
const PUBLIC_ICON_IMPORT_CONCURRENCY = 8;
const ICONIFY_REQUEST_TIMEOUT_MS = 10_000;
const ICONIFY_COLLECTION_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const ICONIFY_COLLECTION_CACHE_MAX_ENTRIES = 256;

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
const iconifyCollectionBrowseCache = new Map<
  string,
  IconifyCollectionBrowseCacheEntry
>();

export interface PublicIconProvider {
  id: string;
  name: string;
  description: string;
}

export interface PublicIconCollection {
  id: string;
  name: string;
  total: number;
  category?: string;
  tags: string[];
  license: IconLicenseMetadata;
}

export interface PublicIconSearchResult {
  id: string;
  provider: string;
  providerName: string;
  collection: PublicIconCollection;
  name: string;
  path: string;
  svgUrl: string;
  sourceUrl: string;
}

export interface PublicIconSearchResponse {
  provider: PublicIconProvider;
  query: string;
  total: number;
  limit: number;
  start: number;
  icons: PublicIconSearchResult[];
  collections: PublicIconCollection[];
}

export interface PublicIconCollectionCategory {
  name: string;
  count: number;
}

export interface PublicIconCollectionListResponse {
  provider: PublicIconProvider;
  query: string;
  category?: string;
  total: number;
  limit: number;
  start: number;
  collections: PublicIconCollection[];
  categories: PublicIconCollectionCategory[];
}

export interface PublicIconCollectionBrowseResponse {
  provider: PublicIconProvider;
  collection: PublicIconCollection;
  category?: string;
  total: number;
  limit: number;
  start: number;
  icons: PublicIconSearchResult[];
  categories: PublicIconCollectionCategory[];
}

export interface PublicIconImportItem {
  id: string;
  path?: string;
  name?: string;
}

export interface PublicIconImportData {
  source: IconSource;
  svg: string;
  path: string;
  name: string;
  tags?: string[];
}

export function listPublicIconProviders(): PublicIconProvider[] {
  return [
    {
      id: ICONIFY_PROVIDER_ID,
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

  const payload = await fetchIconifyJson<IconifySearchResponse>(url);
  const collections = normalizeIconifyCollections(payload.collections ?? {});
  const collectionById = new Map(
    collections.map((collection) => [collection.id, collection]),
  );
  const icons = (payload.icons ?? [])
    .map((id) => iconifySearchResult(id, collectionById))
    .filter((icon): icon is PublicIconSearchResult => Boolean(icon));

  return {
    provider: iconifyProvider(),
    query: request.query,
    total: readNonNegativeNumber(payload.total, "Iconify search total"),
    limit: readPositiveNumber(payload.limit, "Iconify search limit"),
    start: readNonNegativeNumber(payload.start, "Iconify search start"),
    icons,
    collections,
  };
}

export async function listPublicIconCollections(
  input: unknown,
): Promise<PublicIconCollectionListResponse> {
  const request = readPublicIconCollectionListRequest(input);
  const collections = await readIconifyCollections();
  const categories = summarizeCollectionCategories(collections);
  const normalizedQuery = request.query.toLowerCase();
  const filtered = collections.filter((collection) => {
    if (request.category && collection.category !== request.category) {
      return false;
    }
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
    ...(request.category ? { category: request.category } : {}),
    total: filtered.length,
    limit: request.limit,
    start: request.start,
    collections: page,
    categories,
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
      const svg = await fetchIconifySvg(parsedId.prefix, parsedId.name);
      const sourceUrl = iconifySourceUrl(parsedId.prefix, parsedId.name);
      const iconId = iconifyIconId(parsedId.prefix, parsedId.name);
      const source: IconSource = {
        kind: "public-library",
        provider: ICONIFY_PROVIDER_ID,
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
  const parsedId = parseIconifyIconId(id);
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
    provider: ICONIFY_PROVIDER_ID,
    providerName: ICONIFY_PROVIDER_NAME,
    collection,
    name: titleFromIconName(name),
    path: defaultPublicIconPath(prefix, name),
    svgUrl: iconifySvgUrl(prefix, name),
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

  const url = new URL("/collections", ICONIFY_API_BASE_URL);
  const payload =
    await fetchIconifyJson<Record<string, IconifyCollectionInfo>>(url);
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

  const collection = await readIconifyCollection(prefix);
  const url = new URL("/collection", ICONIFY_API_BASE_URL);
  url.searchParams.set("prefix", prefix);
  const payload = await fetchIconifyJson<IconifyCollectionResponse>(url);
  const data = normalizeIconifyCollectionBrowseData(collection, payload);
  iconifyCollectionBrowseCache.set(prefix, {
    data,
    expiresAt: Date.now() + ICONIFY_COLLECTION_CACHE_TTL_MS,
  });
  while (iconifyCollectionBrowseCache.size > ICONIFY_COLLECTION_CACHE_MAX_ENTRIES) {
    const oldestKey = iconifyCollectionBrowseCache.keys().next().value;
    if (!oldestKey) {
      return data;
    }
    iconifyCollectionBrowseCache.delete(oldestKey);
  }
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

  const url = new URL("/collections", ICONIFY_API_BASE_URL);
  url.searchParams.set("prefixes", prefix);
  const payload =
    await fetchIconifyJson<Record<string, IconifyCollectionInfo>>(url);
  const collections = normalizeIconifyCollections(payload);
  const collection = collections.find((candidate) => candidate.id === prefix);
  if (!collection) {
    throw new BadRequestError(`Iconify collection "${prefix}" was not found.`);
  }
  cacheIconifyCollection(prefix, collection);
  return collection;
}

function cacheIconifyCollection(
  prefix: string,
  collection: PublicIconCollection,
): void {
  iconifyCollectionCache.set(prefix, {
    collection,
    expiresAt: Date.now() + ICONIFY_COLLECTION_CACHE_TTL_MS,
  });

  while (iconifyCollectionCache.size > ICONIFY_COLLECTION_CACHE_MAX_ENTRIES) {
    const oldestKey = iconifyCollectionCache.keys().next().value;
    if (!oldestKey) {
      return;
    }
    iconifyCollectionCache.delete(oldestKey);
  }
}

function normalizeIconifyCollections(
  input: Record<string, IconifyCollectionInfo>,
): PublicIconCollection[] {
  return Object.entries(input)
    .map(([id, collection]) => normalizeIconifyCollection(id, collection))
    .filter((collection): collection is PublicIconCollection => Boolean(collection));
}

function normalizeIconifyCollection(
  id: string,
  collection: IconifyCollectionInfo,
): PublicIconCollection | null {
  if (!collection.license?.title || !collection.license.url) {
    return null;
  }
  const licenseName = collection.license.spdx || collection.license.title;
  if (!licenseName.trim()) {
    return null;
  }
  const normalizedLicenseName = licenseName.trim();
  return {
    id,
    name: collection.name || id,
    total: typeof collection.total === "number" ? collection.total : 0,
    ...(collection.category ? { category: collection.category } : {}),
    tags: Array.isArray(collection.tags)
      ? collection.tags.filter(
          (tag): tag is string =>
            typeof tag === "string" && Boolean(tag.trim()),
        )
      : [],
    license: {
      name: normalizedLicenseName,
      url: collection.license.url,
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

  const categories = Object.entries(input.categories ?? {})
    .map(([name, icons]) => {
      const iconNames = normalizeIconifyIconNames(icons);
      for (const iconName of iconNames) {
        visibleIcons.add(iconName);
      }
      iconNamesByCategory.set(name, iconNames);
      return { name, count: iconNames.length };
    })
    .filter((category) => category.count > 0)
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
  const names = input.filter(
    (name): name is string =>
      typeof name === "string" && /^[a-z0-9][a-z0-9_-]*$/i.test(name),
  );
  return Array.from(new Set(names)).sort((left, right) =>
    left.localeCompare(right),
  );
}

function summarizeCollectionCategories(
  collections: PublicIconCollection[],
): PublicIconCollectionCategory[] {
  const counts = new Map<string, number>();
  for (const collection of collections) {
    if (!collection.category) {
      continue;
    }
    counts.set(collection.category, (counts.get(collection.category) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => left.name.localeCompare(right.name));
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
    throw new BadRequestError(
      `${label} could not be loaded (${response.status}).`,
    );
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

async function fetchIconifyJson<T>(url: URL): Promise<T> {
  const response = await fetchIconifyResponse(
    url,
    { headers: { accept: "application/json" } },
    "Iconify request",
  );
  if (!response.ok) {
    throw new BadRequestError(`Iconify request failed (${response.status}).`);
  }
  try {
    return (await response.json()) as T;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ConflictError(`Iconify returned invalid JSON: ${message}`);
  }
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
  provider: string;
  query: string;
  collection?: string;
  limit: number;
  start: number;
} {
  const params = isRecord(input) ? input : {};
  const provider = readOptionalString(params.provider, "provider") ?? ICONIFY_PROVIDER_ID;
  if (provider !== ICONIFY_PROVIDER_ID) {
    throw new BadRequestError(`Public icon provider "${provider}" is not supported.`);
  }
  const query = readRequiredString(params.query, "query");
  const collection = readOptionalString(params.collection, "collection");
  if (collection) {
    assertIconifyPathSegment(collection, "collection");
  }
  return {
    provider,
    query,
    ...(collection ? { collection } : {}),
    limit: readOptionalInteger(params.limit, 32, 1, PUBLIC_ICON_SEARCH_LIMIT_MAX, "limit"),
    start: readOptionalInteger(params.start, 0, 0, 10_000, "start"),
  };
}

function readPublicIconCollectionListRequest(input: unknown): {
  provider: string;
  query: string;
  category?: string;
  limit: number;
  start: number;
} {
  const params = isRecord(input) ? input : {};
  const provider = readOptionalString(params.provider, "provider") ?? ICONIFY_PROVIDER_ID;
  if (provider !== ICONIFY_PROVIDER_ID) {
    throw new BadRequestError(`Public icon provider "${provider}" is not supported.`);
  }
  const query = readOptionalString(params.query, "query") ?? "";
  const category = readOptionalString(params.category, "category");
  return {
    provider,
    query,
    ...(category ? { category } : {}),
    limit: readOptionalInteger(
      params.limit,
      80,
      1,
      PUBLIC_ICON_COLLECTION_LIST_LIMIT_MAX,
      "limit",
    ),
    start: readOptionalInteger(params.start, 0, 0, 10_000, "start"),
  };
}

function readPublicIconCollectionBrowseRequest(input: unknown): {
  provider: string;
  collection: string;
  category?: string;
  limit: number;
  start: number;
} {
  const params = isRecord(input) ? input : {};
  const provider = readOptionalString(params.provider, "provider") ?? ICONIFY_PROVIDER_ID;
  if (provider !== ICONIFY_PROVIDER_ID) {
    throw new BadRequestError(`Public icon provider "${provider}" is not supported.`);
  }
  const collection = readRequiredString(params.collection, "collection");
  assertIconifyPathSegment(collection, "collection");
  const category = readOptionalString(params.category, "category");
  return {
    provider,
    collection,
    ...(category ? { category } : {}),
    limit: readOptionalInteger(
      params.limit,
      64,
      1,
      PUBLIC_ICON_COLLECTION_BROWSE_LIMIT_MAX,
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
  if (input.icons.length > PUBLIC_ICON_IMPORT_LIMIT_MAX) {
    throw new BadRequestError(
      `icons must include ${PUBLIC_ICON_IMPORT_LIMIT_MAX} or fewer items.`,
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
    parseIconifyIconId(icon.id);
    const normalizedId = icon.id.toLowerCase();
    if (seenIds.has(normalizedId)) {
      throw new BadRequestError(`Duplicate public icon id "${icon.id}".`);
    }
    seenIds.add(normalizedId);

    const normalizedPath = normalizePublicIconImportPath(icon);
    if (seenPaths.has(normalizedPath)) {
      throw new BadRequestError(`Duplicate icon path "${normalizedPath}".`);
    }
    seenPaths.add(normalizedPath);
  }
}

function parseIconifyIconId(id: string): { prefix: string; name: string } {
  const [prefix, name, extra] = id.split(":");
  if (!prefix || !name || extra !== undefined) {
    throw new BadRequestError(`Iconify icon id "${id}" must look like "collection:name".`);
  }
  assertIconifyPathSegment(prefix, "collection");
  assertIconifyPathSegment(name, "icon name");
  return { prefix: prefix.toLowerCase(), name: name.toLowerCase() };
}

function assertIconifyPathSegment(value: string, label: string): void {
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(value)) {
    throw new BadRequestError(`Iconify ${label} "${value}" is not valid.`);
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

function defaultPublicIconPath(prefix: string, name: string): string {
  return `${prefix}.${name.replace(/-/g, ".")}`;
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
  const numberValue = typeof value === "string" ? Number(value) : value;
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

function readPositiveNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new ConflictError(`${field} must be a positive number.`);
  }
  return value;
}

function readNonNegativeNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new ConflictError(`${field} must be a non-negative number.`);
  }
  return value;
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

interface IconifySearchResponse {
  icons?: string[];
  total?: number;
  limit?: number;
  start?: number;
  collections?: Record<string, IconifyCollectionInfo>;
}

interface IconifyCollectionResponse {
  prefix?: string;
  total?: number;
  title?: string;
  uncategorized?: unknown;
  categories?: Record<string, unknown>;
}

interface IconifyCollectionInfo {
  name?: string;
  total?: number;
  category?: string;
  tags?: unknown[];
  license?: {
    title?: string;
    spdx?: string;
    url?: string;
  };
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
