import type { TokenValue, TokenReference } from '@tokenmanager/core';
import type { TokenMapEntry } from './types';

const ALIAS_REGEX = /^\{([^}]+)\}$/;

export function isAlias(value: TokenValue | TokenReference | undefined): value is TokenReference {
  return typeof value === 'string' && ALIAS_REGEX.test(value);
}

export function extractAliasPath(value: TokenValue | TokenReference | undefined): string | null {
  if (typeof value !== 'string') return null;
  const match = value.match(ALIAS_REGEX);
  return match ? match[1] : null;
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
