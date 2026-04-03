import type { TokenValue, TokenReference, ThemeDimension } from '@tokenmanager/core';
import { isReference, parseReference } from '@tokenmanager/core';
import type { TokenMapEntry } from './types';

export function isAlias(value: TokenValue | TokenReference | undefined): value is TokenReference {
  return isReference(value);
}

export function extractAliasPath(value: TokenValue | TokenReference | undefined): string | null {
  if (!isReference(value)) return null;
  return parseReference(value);
}

export interface ResolveResult {
  value: TokenValue | TokenReference | null;
  $type: string;
  wasAlias: boolean;
  chain: string[];
  error?: string;
}

export function resolveTokenValue(
  value: TokenValue | TokenReference,
  $type: string,
  tokenMap: Record<string, TokenMapEntry>,
  maxDepth = 10,
): ResolveResult {
  if (!isAlias(value)) {
    return { value, $type, wasAlias: false, chain: [] };
  }

  const visited = new Set<string>();
  const chain: string[] = [];
  let current = value;
  let currentType = $type;

  for (let depth = 0; depth < maxDepth; depth++) {
    const path = extractAliasPath(current);
    if (!path) {
      return { value: current, $type: currentType, wasAlias: true, chain };
    }

    if (visited.has(path)) {
      return {
        value: null,
        $type: currentType,
        wasAlias: true,
        chain,
        error: `Circular alias: ${chain.join(' → ')} → {${path}}`,
      };
    }

    visited.add(path);
    chain.push(path);

    const entry = tokenMap[path];
    if (!entry) {
      return {
        value: null,
        $type: currentType,
        wasAlias: true,
        chain,
        error: `Alias target not found: {${path}}`,
      };
    }

    current = entry.$value;
    if (entry.$type && entry.$type !== 'unknown') {
      currentType = entry.$type;
    }
  }

  return {
    value: null,
    $type: currentType,
    wasAlias: true,
    chain,
    error: `Alias chain too deep (>${maxDepth}): ${chain.join(' → ')}`,
  };
}

// ---------------------------------------------------------------------------
// Resolution chain debugger — enriched per-hop metadata
// ---------------------------------------------------------------------------

export interface ResolutionStep {
  path: string;
  value: TokenValue | TokenReference | undefined;
  $type: string;
  setName?: string;
  /** Theme dimension name if this set is governed by a theme (e.g. "color-scheme") */
  themeDimension?: string;
  /** Theme option name if this set is governed by a theme (e.g. "dark") */
  themeOption?: string;
  isThemed: boolean;
  isError?: boolean;
  errorMsg?: string;
}

/**
 * Build a mapping from set name → { dimensionName, optionName } for quick lookup.
 * Only includes sets that are 'enabled' (override) in the currently active theme options.
 */
export function buildSetThemeMap(
  dimensions: ThemeDimension[],
  activeThemes: Record<string, string>,
): Map<string, { dimensionName: string; optionName: string }> {
  const map = new Map<string, { dimensionName: string; optionName: string }>();
  for (const dim of dimensions) {
    const activeOptionName = activeThemes[dim.id];
    if (!activeOptionName) continue;
    const opt = dim.options.find(o => o.name === activeOptionName);
    if (!opt) continue;
    for (const [setName, status] of Object.entries(opt.sets)) {
      if (status === 'enabled') {
        map.set(setName, { dimensionName: dim.name, optionName: opt.name });
      }
    }
  }
  return map;
}

/**
 * Build the full resolution chain for a token, including per-hop set and theme metadata.
 * The first step is the token itself; the last step is the final resolved concrete value.
 */
export function buildResolutionChain(
  startPath: string,
  startValue: TokenValue | TokenReference,
  startType: string,
  tokenMap: Record<string, TokenMapEntry>,
  pathToSet?: Record<string, string>,
  setThemeMap?: Map<string, { dimensionName: string; optionName: string }>,
  maxDepth = 10,
): ResolutionStep[] {
  const steps: ResolutionStep[] = [];

  const addStep = (path: string, value: TokenValue | TokenReference | undefined, $type: string, error?: string) => {
    const setName = pathToSet?.[path];
    const themeInfo = setName && setThemeMap ? setThemeMap.get(setName) : undefined;
    steps.push({
      path,
      value,
      $type,
      setName,
      themeDimension: themeInfo?.dimensionName,
      themeOption: themeInfo?.optionName,
      isThemed: !!themeInfo,
      isError: !!error,
      errorMsg: error,
    });
  };

  // First step: the starting token itself
  addStep(startPath, startValue, startType);

  if (!isAlias(startValue)) return steps;

  const visited = new Set<string>([startPath]);
  let current: TokenValue | TokenReference = startValue;
  let currentType = startType;

  for (let depth = 0; depth < maxDepth; depth++) {
    const aliasPath = extractAliasPath(current);
    if (!aliasPath) break;

    if (visited.has(aliasPath)) {
      addStep(aliasPath, undefined, currentType, `Circular alias`);
      break;
    }
    visited.add(aliasPath);

    const entry = tokenMap[aliasPath];
    if (!entry) {
      addStep(aliasPath, undefined, currentType, `Not found`);
      break;
    }

    if (entry.$type && entry.$type !== 'unknown') {
      currentType = entry.$type;
    }
    current = entry.$value;
    addStep(aliasPath, entry.$value, currentType);

    if (!isAlias(current)) break;
  }

  return steps;
}

/** Resolve alias strings in the direct properties of a plain object. */
function resolveObjectSubprops(
  obj: Record<string, unknown>,
  tokenMap: Record<string, TokenMapEntry>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (typeof val === 'string' && isAlias(val)) {
      const refPath = extractAliasPath(val)!;
      const refEntry = tokenMap[refPath];
      if (refEntry) {
        const refResult = resolveTokenValue(refEntry.$value, refEntry.$type, tokenMap);
        out[key] = refResult.value ?? val;
      } else {
        out[key] = val;
      }
    } else {
      out[key] = val;
    }
  }
  return out;
}

export function resolveAllAliases(
  tokenMap: Record<string, TokenMapEntry>,
): Record<string, TokenMapEntry> {
  const resolved: Record<string, TokenMapEntry> = {};
  for (const [path, entry] of Object.entries(tokenMap)) {
    const result = resolveTokenValue(entry.$value, entry.$type, tokenMap);
    let resolvedValue: TokenValue | TokenReference = result.value ?? entry.$value;

    // Resolve alias references embedded in composite token sub-properties
    // (typography, border, shadow, gradient, etc. where $value is an object
    // or array of objects with individually aliased properties).
    if (resolvedValue !== null && typeof resolvedValue === 'object') {
      if (Array.isArray(resolvedValue)) {
        resolvedValue = resolvedValue.map((item: unknown) =>
          item !== null && typeof item === 'object' && !Array.isArray(item)
            ? resolveObjectSubprops(item as Record<string, unknown>, tokenMap)
            : item,
        ) as TokenValue;
      } else {
        resolvedValue = resolveObjectSubprops(
          resolvedValue as Record<string, unknown>,
          tokenMap,
        ) as TokenValue;
      }
    }

    resolved[path] = {
      $value: resolvedValue,
      $type: result.$type,
    };
  }
  return resolved;
}
