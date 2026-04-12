import { isReference, parseReference } from './dtcg-types.js';
import type { ThemeDimension } from './types.js';

export interface ThemeCoverageToken {
  path: string;
  set: string;
  missingRef?: string;
  fillValue?: unknown;
  fillType?: string;
}

export type ThemeCoverageMap = Record<
  string,
  Record<string, { uncovered: ThemeCoverageToken[] }>
>;

export interface ThemeMissingOverrideToken {
  path: string;
  sourceSet: string;
  value: unknown;
  type?: string;
}

export type ThemeMissingOverridesMap = Record<
  string,
  Record<string, { missing: ThemeMissingOverrideToken[] }>
>;

export interface ThemeCoverageSetTokens {
  values: Record<string, unknown>;
  types?: Record<string, string>;
}

export interface ThemeCoverageResult {
  coverage: ThemeCoverageMap;
  missingOverrides: ThemeMissingOverridesMap;
}

interface BuildThemeCoverageArgs {
  dimensions: ThemeDimension[];
  setTokens: Record<string, ThemeCoverageSetTokens>;
  fillSearchOrder?: string[];
}

function isResolvedValue(
  value: unknown,
  activeValues: Record<string, unknown>,
  visited = new Set<string>(),
): boolean {
  if (!isReference(value)) return true;
  const target = parseReference(value);
  if (visited.has(target)) return false;
  if (!(target in activeValues)) return false;
  return isResolvedValue(
    activeValues[target],
    activeValues,
    new Set([...visited, target]),
  );
}

function findMissingReference(
  value: unknown,
  activeValues: Record<string, unknown>,
  visited = new Set<string>(),
): string | null {
  if (!isReference(value)) return null;
  const target = parseReference(value);
  if (visited.has(target)) return null;
  if (!(target in activeValues)) return target;
  return findMissingReference(
    activeValues[target],
    activeValues,
    new Set([...visited, target]),
  );
}

function mergeSetIntoActiveValues(
  activeValues: Record<string, unknown>,
  tokenSetOrigin: Record<string, string>,
  setName: string,
  setTokens: ThemeCoverageSetTokens | undefined,
): void {
  if (!setTokens) return;
  for (const path of Object.keys(setTokens.values)) {
    tokenSetOrigin[path] = setName;
  }
  Object.assign(activeValues, setTokens.values);
}

function findFillToken(
  path: string,
  setTokens: Record<string, ThemeCoverageSetTokens>,
  fillSearchOrder: string[],
): { value: unknown; type?: string } | null {
  for (const setName of fillSearchOrder) {
    const candidate = setTokens[setName];
    if (!candidate || !(path in candidate.values)) continue;
    return {
      value: candidate.values[path],
      type: candidate.types?.[path],
    };
  }

  return null;
}

export function buildThemeCoverage({
  dimensions,
  setTokens,
  fillSearchOrder,
}: BuildThemeCoverageArgs): ThemeCoverageResult {
  const orderedSetNames =
    fillSearchOrder?.filter((setName) => setName in setTokens) ??
    Object.keys(setTokens);

  const coverage: ThemeCoverageMap = {};
  const missingOverrides: ThemeMissingOverridesMap = {};

  for (const dimension of dimensions) {
    coverage[dimension.id] = {};
    missingOverrides[dimension.id] = {};

    for (const option of dimension.options) {
      const activeValues: Record<string, unknown> = {};
      const tokenSetOrigin: Record<string, string> = {};

      for (const [setName, state] of Object.entries(option.sets)) {
        if (state === 'source') {
          mergeSetIntoActiveValues(
            activeValues,
            tokenSetOrigin,
            setName,
            setTokens[setName],
          );
        }
      }

      for (const [setName, state] of Object.entries(option.sets)) {
        if (state === 'enabled') {
          mergeSetIntoActiveValues(
            activeValues,
            tokenSetOrigin,
            setName,
            setTokens[setName],
          );
        }
      }

      const uncovered: ThemeCoverageToken[] = [];
      for (const [path, value] of Object.entries(activeValues)) {
        if (isResolvedValue(value, activeValues)) continue;

        const missingRef = findMissingReference(value, activeValues);
        const entry: ThemeCoverageToken = {
          path,
          set: tokenSetOrigin[path] ?? '',
          missingRef: missingRef ?? undefined,
        };

        if (missingRef) {
          const fillToken = findFillToken(
            missingRef,
            setTokens,
            orderedSetNames,
          );
          if (fillToken) {
            entry.fillValue = fillToken.value;
            entry.fillType = fillToken.type;
          }
        }

        uncovered.push(entry);
      }

      coverage[dimension.id][option.name] = { uncovered };

      const enabledPaths = new Set<string>();
      for (const [setName, state] of Object.entries(option.sets)) {
        if (state !== 'enabled') continue;
        for (const path of Object.keys(setTokens[setName]?.values ?? {})) {
          enabledPaths.add(path);
        }
      }

      const missing: ThemeMissingOverrideToken[] = [];
      const hasEnabledSets =
        enabledPaths.size > 0 ||
        Object.values(option.sets).some((state) => state === 'enabled');

      if (hasEnabledSets) {
        for (const [setName, state] of Object.entries(option.sets)) {
          if (state !== 'source') continue;

          const sourceTokens = setTokens[setName];
          if (!sourceTokens) continue;

          for (const [path, value] of Object.entries(sourceTokens.values)) {
            if (enabledPaths.has(path)) continue;
            missing.push({
              path,
              sourceSet: setName,
              value,
              type: sourceTokens.types?.[path],
            });
          }
        }
      }

      missingOverrides[dimension.id][option.name] = { missing };
    }
  }

  return { coverage, missingOverrides };
}
