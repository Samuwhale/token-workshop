import type { TokenValue, TokenReference } from '@tokenmanager/core';
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
  let current: TokenValue | TokenReference = value;
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
  collectionId?: string;
  isError?: boolean;
  errorMsg?: string;
}

/**
 * Build the full resolution chain for a token, including per-hop collection metadata.
 * The first step is the token itself; the last step is the final resolved concrete value.
 */
export function buildResolutionChain(
  startPath: string,
  startValue: TokenValue | TokenReference,
  startType: string,
  tokenMap: Record<string, TokenMapEntry>,
  pathToCollectionId?: Record<string, string>,
  maxDepth = 10,
): ResolutionStep[] {
  const steps: ResolutionStep[] = [];

  const addStep = (path: string, value: TokenValue | TokenReference | undefined, $type: string, error?: string) => {
    const collectionId = pathToCollectionId?.[path];
    steps.push({
      path,
      value,
      $type,
      collectionId,
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

function resolveCompositeAliases(
  value: unknown,
  tokenMap: Record<string, TokenMapEntry>,
): unknown {
  if (typeof value === 'string' && isAlias(value)) {
    const refPath = extractAliasPath(value);
    if (!refPath) {
      return value;
    }
    const refEntry = tokenMap[refPath];
    if (!refEntry) {
      return value;
    }
    const resolved = resolveTokenValue(refEntry.$value, refEntry.$type, tokenMap);
    return resolved.value === null
      ? value
      : resolveCompositeAliases(resolved.value, tokenMap);
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveCompositeAliases(item, tokenMap));
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
        key,
        resolveCompositeAliases(nestedValue, tokenMap),
      ]),
    );
  }

  return value;
}

export function resolveAllAliases(
  tokenMap: Record<string, TokenMapEntry>,
): Record<string, TokenMapEntry> {
  const resolved: Record<string, TokenMapEntry> = {};
  for (const [path, entry] of Object.entries(tokenMap)) {
    const result = resolveTokenValue(entry.$value, entry.$type, tokenMap);
    let resolvedValue: TokenValue | TokenReference = result.value ?? entry.$value;

    // Resolve alias references embedded anywhere inside composite token values
    // (nested objects, nested arrays, gradient stop lists, composition payloads).
    if (resolvedValue !== null && typeof resolvedValue === 'object') {
      resolvedValue = resolveCompositeAliases(resolvedValue, tokenMap) as TokenValue;
    }

    resolved[path] = {
      ...entry,
      $value: resolvedValue,
      $type: result.$type,
      ...(isAlias(entry.$value) ? { reference: entry.$value } : {}),
    };
  }
  return resolved;
}
