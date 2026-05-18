import type { IconLicenseMetadata, IconSource } from './icon-types.js';

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
}

export interface PublicIconCollectionCategory {
  name: string;
  count: number;
}

export interface PublicIconCollectionListResponse {
  provider: PublicIconProvider;
  query: string;
  total: number;
  limit: number;
  start: number;
  collections: PublicIconCollection[];
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

export type PublicIconResultsResponse =
  | PublicIconSearchResponse
  | PublicIconCollectionBrowseResponse;

export interface PublicIconProvidersResponse {
  providers: PublicIconProvider[];
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
