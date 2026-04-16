import type {
  SelectedModes,
  TokenCollection,
  ViewPreset,
  TokenModeValues,
} from "@tokenmanager/core";
import {
  buildSelectedModesLabel,
  createViewPreset as createCanonicalViewPreset,
  createViewPresetName as createCanonicalViewPresetName,
  findCollectionById,
  normalizeSelectedModes,
  readTokenCollectionModeValues,
} from "@tokenmanager/core";
import type { TokenMapEntry } from "../../shared/types";
import { resolveAllAliases } from "../../shared/resolveAlias";

type TokenModeMap = TokenModeValues;

export interface ModeCoverageEntry {
  path: string;
  collectionId: string;
  type?: string;
}

export type ModeCoverageMap = Record<
  string,
  Record<
    string,
    {
      hasCoverage: boolean;
      missing: ModeCoverageEntry[];
    }
  >
>;

export interface ModeCoverageSummary {
  mappedOptionCount: number;
  unmappedOptionCount: number;
  mappedOptionWithAssignmentIssuesCount: number;
  totalMissingModeValueCount: number;
  mappedCollectionCount: number;
}

export interface ModeCoverageResult {
  coverage: ModeCoverageMap;
  summary: ModeCoverageSummary;
}

export function getTokenCollection(
  collections: TokenCollection[],
  collectionId: string,
): TokenCollection | null {
  return findCollectionById(collections, collectionId);
}

function readTokenModes(
  entry: TokenMapEntry | undefined,
): TokenModeMap | null {
  const modes = readTokenCollectionModeValues(entry);
  return Object.keys(modes).length > 0 ? modes : null;
}

function hasModeValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

function compareCoverageEntries(
  left: ModeCoverageEntry,
  right: ModeCoverageEntry,
): number {
  if (left.collectionId !== right.collectionId) {
    return left.collectionId.localeCompare(right.collectionId);
  }

  return left.path.localeCompare(right.path);
}

export function buildModeCoverage(params: {
  collections: TokenCollection[];
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToCollectionId?: Record<string, string>;
}): ModeCoverageResult {
  const coverage: ModeCoverageMap = {};
  const mappedCollectionIds = new Set<string>();
  const tokenEntries = Object.entries(params.allTokensFlat).map(
    ([path, entry]) => ({
      path,
      entry,
      tokenModes: readTokenModes(entry),
      collectionId: params.pathToCollectionId?.[path] ?? "",
    }),
  );

  let mappedOptionCount = 0;
  let unmappedOptionCount = 0;
  let mappedOptionWithAssignmentIssuesCount = 0;
  let totalMissingModeValueCount = 0;

  for (const collection of params.collections) {
    const optionNames = new Set(
      collection.modes.map((option) => option.name),
    );
    const tokenCoverage = tokenEntries.flatMap((token) => {
      if (token.collectionId !== collection.id) {
        return [];
      }
      const collectionModes = token.tokenModes?.[collection.id];
      if (!collectionModes || typeof collectionModes !== "object" || Array.isArray(collectionModes)) {
        return [];
      }

      const activeOptionNames = new Set(
        Object.entries(collectionModes)
          .filter(
            ([optionName, value]) =>
              optionNames.has(optionName) && hasModeValue(value),
          )
          .map(([optionName]) => optionName),
      );

      if (activeOptionNames.size === 0) {
        return [];
      }

      if (token.collectionId) {
        mappedCollectionIds.add(token.collectionId);
      }

      return [{ token, activeOptionNames }];
    });
    const collectionHasCoverage = tokenCoverage.length > 0;

    coverage[collection.id] = {};

    for (const option of collection.modes) {
      const missing: ModeCoverageEntry[] = [];

      for (const token of tokenCoverage) {
        if (!token.activeOptionNames.has(option.name)) {
          missing.push({
            path: token.token.path,
            collectionId: token.token.collectionId,
            type: token.token.entry.$type,
          });
        }
      }

      missing.sort(compareCoverageEntries);
      if (missing.length > 0) {
        mappedOptionWithAssignmentIssuesCount += 1;
        totalMissingModeValueCount += missing.length;
      }

      coverage[collection.id][option.name] = {
        hasCoverage: collectionHasCoverage,
        missing,
      };
    }

    if (collectionHasCoverage) {
      mappedOptionCount += collection.modes.length;
    } else {
      unmappedOptionCount += collection.modes.length;
    }
  }

  return {
    coverage,
    summary: {
      mappedOptionCount,
      unmappedOptionCount,
      mappedOptionWithAssignmentIssuesCount,
      totalMissingModeValueCount,
      mappedCollectionCount: mappedCollectionIds.size,
    },
  };
}

export function applyModeSelectionsToTokens(
  allTokensFlat: Record<string, TokenMapEntry>,
  collections: TokenCollection[],
  selections: SelectedModes,
  pathToCollectionId?: Record<string, string>,
): Record<string, TokenMapEntry> {
  if (collections.length === 0 || Object.keys(selections).length === 0) {
    return resolveAllAliases(allTokensFlat);
  }

  const collectionsById = new Map(
    collections.map((collection) => [collection.id, collection]),
  );
  const collectionResolvedEntries: Record<string, TokenMapEntry> = {};

  for (const [path, entry] of Object.entries(allTokensFlat)) {
    const tokenModes = readTokenModes(entry);
    if (!tokenModes) {
      collectionResolvedEntries[path] = entry;
      continue;
    }

    let nextValue = entry.$value;
    const collectionId = pathToCollectionId?.[path];
    if (!collectionId || !collectionsById.has(collectionId)) {
      collectionResolvedEntries[path] = entry;
      continue;
    }

    const optionName = selections[collectionId];
    if (optionName) {
      const overrideValue = tokenModes[collectionId]?.[optionName];
      if (overrideValue !== undefined) {
        nextValue = overrideValue as TokenMapEntry["$value"];
      }
    }

    collectionResolvedEntries[path] =
      nextValue === entry.$value
        ? entry
        : {
            ...entry,
            $value: nextValue,
          };
  }

  return resolveAllAliases(collectionResolvedEntries);
}

export function buildSelectionLabel(
  collections: TokenCollection[],
  selections: SelectedModes,
): string {
  return buildSelectedModesLabel(collections, selections);
}

export function createViewPresetName(
  collections: TokenCollection[],
  selections: SelectedModes,
): string {
  return createCanonicalViewPresetName(collections, selections);
}

export function normalizeModeSelections(
  collections: TokenCollection[],
  selections: SelectedModes,
): SelectedModes {
  return normalizeSelectedModes(collections, selections);
}

export function createViewPreset(params: {
  id: string;
  name: string;
  collections: TokenCollection[];
  selections: SelectedModes;
}): ViewPreset {
  const { id, name, collections, selections } = params;
  return createCanonicalViewPreset({
    id,
    name,
    collections,
    selections,
  });
}
