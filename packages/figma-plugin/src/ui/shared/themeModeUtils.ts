import type {
  ActiveThemes,
  ThemeDimension,
  ThemeViewPreset,
  TokenExtensions,
} from "@tokenmanager/core";
import type { TokenMapEntry } from "../../shared/types";
import { resolveAllAliases } from "../../shared/resolveAlias";

type TokenModeMap = Record<string, Record<string, unknown>>;

export interface ThemeModeCoverageEntry {
  path: string;
  setName: string;
  type?: string;
}

export type ThemeModeCoverageMap = Record<
  string,
  Record<
    string,
    {
      hasCoverage: boolean;
      missing: ThemeModeCoverageEntry[];
    }
  >
>;

export interface ThemeModeCoverageSummary {
  mappedOptionCount: number;
  unmappedOptionCount: number;
  mappedOptionWithAssignmentIssuesCount: number;
  totalMissingModeValueCount: number;
  mappedSetCount: number;
}

export interface ThemeModeCoverageResult {
  coverage: ThemeModeCoverageMap;
  summary: ThemeModeCoverageSummary;
}

export function getCollectionModeDefinition(
  dimensions: ThemeDimension[],
  setName: string,
): ThemeDimension | null {
  return dimensions.find((dimension) => dimension.id === setName) ?? null;
}

function readTokenModes(
  entry: TokenMapEntry | undefined,
): TokenModeMap | null {
  const modes = (
    entry?.$extensions as TokenExtensions | undefined
  )?.tokenmanager?.modes;
  if (!modes || typeof modes !== "object" || Array.isArray(modes)) return null;
  return modes as TokenModeMap;
}

function hasModeValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

function compareCoverageEntries(
  left: ThemeModeCoverageEntry,
  right: ThemeModeCoverageEntry,
): number {
  if (left.setName !== right.setName) {
    return left.setName.localeCompare(right.setName);
  }

  return left.path.localeCompare(right.path);
}

export function buildThemeModeCoverage(params: {
  dimensions: ThemeDimension[];
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToSet?: Record<string, string>;
}): ThemeModeCoverageResult {
  const coverage: ThemeModeCoverageMap = {};
  const mappedSetNames = new Set<string>();
  const tokenEntries = Object.entries(params.allTokensFlat).map(
    ([path, entry]) => ({
      path,
      entry,
      tokenModes: readTokenModes(entry),
      setName: params.pathToSet?.[path] ?? "",
    }),
  );

  let mappedOptionCount = 0;
  let unmappedOptionCount = 0;
  let mappedOptionWithAssignmentIssuesCount = 0;
  let totalMissingModeValueCount = 0;

  for (const dimension of params.dimensions) {
    const optionNames = new Set(
      dimension.options.map((option) => option.name),
    );
    const tokenCoverage = tokenEntries.flatMap((token) => {
      if (token.setName !== dimension.id) {
        return [];
      }
      const dimensionModes = token.tokenModes?.[dimension.id];
      if (
        !dimensionModes ||
        typeof dimensionModes !== "object" ||
        Array.isArray(dimensionModes)
      ) {
        return [];
      }

      const activeOptionNames = new Set(
        Object.entries(dimensionModes)
          .filter(
            ([optionName, value]) =>
              optionNames.has(optionName) && hasModeValue(value),
          )
          .map(([optionName]) => optionName),
      );

      if (activeOptionNames.size === 0) {
        return [];
      }

      if (token.setName) {
        mappedSetNames.add(token.setName);
      }

      return [{ token, activeOptionNames }];
    });
    const dimensionHasCoverage = tokenCoverage.length > 0;

    coverage[dimension.id] = {};

    for (const option of dimension.options) {
      const missing: ThemeModeCoverageEntry[] = [];

      for (const token of tokenCoverage) {
        if (!token.activeOptionNames.has(option.name)) {
          missing.push({
            path: token.token.path,
            setName: token.token.setName,
            type: token.token.entry.$type,
          });
        }
      }

      missing.sort(compareCoverageEntries);
      if (missing.length > 0) {
        mappedOptionWithAssignmentIssuesCount += 1;
        totalMissingModeValueCount += missing.length;
      }

      coverage[dimension.id][option.name] = {
        hasCoverage: dimensionHasCoverage,
        missing,
      };
    }

    if (dimensionHasCoverage) {
      mappedOptionCount += dimension.options.length;
    } else {
      unmappedOptionCount += dimension.options.length;
    }
  }

  return {
    coverage,
    summary: {
      mappedOptionCount,
      unmappedOptionCount,
      mappedOptionWithAssignmentIssuesCount,
      totalMissingModeValueCount,
      mappedSetCount: mappedSetNames.size,
    },
  };
}

export function applyThemeSelectionsToTokens(
  allTokensFlat: Record<string, TokenMapEntry>,
  dimensions: ThemeDimension[],
  selections: ActiveThemes,
  pathToSet?: Record<string, string>,
): Record<string, TokenMapEntry> {
  if (dimensions.length === 0 || Object.keys(selections).length === 0) {
    return resolveAllAliases(allTokensFlat);
  }

  const dimensionsById = new Map(
    dimensions.map((dimension) => [dimension.id, dimension]),
  );
  const themedEntries: Record<string, TokenMapEntry> = {};

  for (const [path, entry] of Object.entries(allTokensFlat)) {
    const tokenModes = readTokenModes(entry);
    if (!tokenModes) {
      themedEntries[path] = entry;
      continue;
    }

    let nextValue = entry.$value;
    const setName = pathToSet?.[path];
    if (!setName || !dimensionsById.has(setName)) {
      themedEntries[path] = entry;
      continue;
    }

    const optionName = selections[setName];
    if (optionName) {
      const overrideValue = tokenModes[setName]?.[optionName];
      if (overrideValue !== undefined) {
        nextValue = overrideValue as TokenMapEntry["$value"];
      }
    }

    themedEntries[path] =
      nextValue === entry.$value
        ? entry
        : {
            ...entry,
            $value: nextValue,
          };
  }

  return resolveAllAliases(themedEntries);
}

export function buildSelectionLabel(
  dimensions: ThemeDimension[],
  selections: ActiveThemes,
): string {
  return dimensions
    .map((dimension) => {
      const optionName = selections[dimension.id];
      return optionName ? `${dimension.name} · ${optionName}` : null;
    })
    .filter(Boolean)
    .join(" · ");
}

export function createThemeViewName(
  dimensions: ThemeDimension[],
  selections: ActiveThemes,
): string {
  const parts = dimensions
    .map((dimension) => selections[dimension.id])
    .filter((value): value is string => Boolean(value));
  return parts.join(" / ") || "New view";
}

export function normalizeThemeSelections(
  dimensions: ThemeDimension[],
  selections: ActiveThemes,
): ActiveThemes {
  const next: ActiveThemes = {};

  for (const dimension of dimensions) {
    const selectedOption = selections[dimension.id];
    if (
      selectedOption &&
      dimension.options.some((option) => option.name === selectedOption)
    ) {
      next[dimension.id] = selectedOption;
      continue;
    }

    if (dimension.options[0]) {
      next[dimension.id] = dimension.options[0].name;
    }
  }

  return next;
}

export function createThemeViewPreset(params: {
  id: string;
  name: string;
  dimensions: ThemeDimension[];
  selections: ActiveThemes;
}): ThemeViewPreset {
  const { id, name, dimensions, selections } = params;
  return {
    id,
    name,
    selections: normalizeThemeSelections(dimensions, selections),
  };
}
