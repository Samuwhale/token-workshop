import type {
  ActiveThemes,
  ThemeDimension,
  ThemeViewPreset,
  TokenExtensions,
} from "@tokenmanager/core";
import type { TokenMapEntry } from "../../shared/types";
import { resolveAllAliases } from "../../shared/resolveAlias";

type TokenModeMap = Record<string, Record<string, unknown>>;

function readTokenModes(
  entry: TokenMapEntry | undefined,
): TokenModeMap | null {
  const modes = (
    entry?.$extensions as TokenExtensions | undefined
  )?.tokenmanager?.modes;
  if (!modes || typeof modes !== "object" || Array.isArray(modes)) return null;
  return modes as TokenModeMap;
}

export function applyThemeSelectionsToTokens(
  allTokensFlat: Record<string, TokenMapEntry>,
  dimensions: ThemeDimension[],
  selections: ActiveThemes,
): Record<string, TokenMapEntry> {
  if (dimensions.length === 0 || Object.keys(selections).length === 0) {
    return resolveAllAliases(allTokensFlat);
  }

  const themedEntries: Record<string, TokenMapEntry> = {};

  for (const [path, entry] of Object.entries(allTokensFlat)) {
    const tokenModes = readTokenModes(entry);
    if (!tokenModes) {
      themedEntries[path] = entry;
      continue;
    }

    let nextValue = entry.$value;
    for (const dimension of dimensions) {
      const optionName = selections[dimension.id];
      if (!optionName) continue;
      const overrideValue = tokenModes[dimension.id]?.[optionName];
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

export interface ThemeModeCoverageEntry {
  path: string;
  setName: string;
  collection: string;
  type?: string;
}

export type ThemeModeCoverageMap = Record<
  string,
  Record<string, { missing: ThemeModeCoverageEntry[] }>
>;

export function buildThemeModeCoverage(params: {
  dimensions: ThemeDimension[];
  perSetFlat: Record<string, Record<string, TokenMapEntry>>;
  collectionNames?: Record<string, string>;
}): ThemeModeCoverageMap {
  const { dimensions, perSetFlat, collectionNames = {} } = params;
  const coverage: ThemeModeCoverageMap = {};

  const tokenEntries = Object.entries(perSetFlat).flatMap(([setName, tokens]) =>
    Object.entries(tokens).map(([path, entry]) => ({
      path,
      setName,
      entry,
    })),
  );

  for (const dimension of dimensions) {
    const optionNames = new Set(dimension.options.map((option) => option.name));
    const expectedOptionsByPath = new Map<string, Set<string>>();

    for (const token of tokenEntries) {
      const dimModes = readTokenModes(token.entry)?.[dimension.id];
      if (!dimModes || typeof dimModes !== "object") continue;

      const expectedOptions =
        expectedOptionsByPath.get(token.path) ?? new Set<string>();
      for (const optionName of Object.keys(dimModes)) {
        if (optionNames.has(optionName)) {
          expectedOptions.add(optionName);
        }
      }
      if (expectedOptions.size > 0) {
        expectedOptionsByPath.set(token.path, expectedOptions);
      }
    }

    coverage[dimension.id] = {};

    for (const option of dimension.options) {
      const missing: ThemeModeCoverageEntry[] = [];

      for (const token of tokenEntries) {
        const expectedOptions = expectedOptionsByPath.get(token.path);
        if (!expectedOptions?.has(option.name)) continue;

        const dimModes = readTokenModes(token.entry)?.[dimension.id];
        if (dimModes && typeof dimModes === "object" && option.name in dimModes) {
          continue;
        }

        missing.push({
          path: token.path,
          setName: token.setName,
          collection: collectionNames[token.setName] || token.setName,
          type: token.entry.$type,
        });
      }

      missing.sort((left, right) => left.path.localeCompare(right.path));
      coverage[dimension.id][option.name] = { missing };
    }
  }

  return coverage;
}

export function buildSelectionLabel(
  dimensions: ThemeDimension[],
  selections: ActiveThemes,
): string {
  return dimensions
    .map((dimension) => {
      const optionName = selections[dimension.id];
      return optionName ? `${dimension.name}: ${optionName}` : null;
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
