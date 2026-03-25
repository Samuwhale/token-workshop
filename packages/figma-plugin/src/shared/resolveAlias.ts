import type { TokenMapEntry } from './types';

const ALIAS_REGEX = /^\{([^}]+)\}$/;

export function isAlias(value: any): value is string {
  return typeof value === 'string' && ALIAS_REGEX.test(value);
}

export function extractAliasPath(value: any): string | null {
  if (typeof value !== 'string') return null;
  const match = value.match(ALIAS_REGEX);
  return match ? match[1] : null;
}

export interface ResolveResult {
  value: any;
  $type: string;
  wasAlias: boolean;
  chain: string[];
  error?: string;
}

export function resolveTokenValue(
  value: any,
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

export function resolveAllAliases(
  tokenMap: Record<string, TokenMapEntry>,
): Record<string, TokenMapEntry> {
  const resolved: Record<string, TokenMapEntry> = {};
  for (const [path, entry] of Object.entries(tokenMap)) {
    const result = resolveTokenValue(entry.$value, entry.$type, tokenMap);
    let resolvedValue = result.value ?? entry.$value;

    // Resolve alias references embedded in gradient stop colors.
    // GradientValue is a flat GradientStop[], not { stops: GradientStop[] }.
    if (entry.$type === 'gradient' && Array.isArray(resolvedValue)) {
      resolvedValue = resolvedValue.map((stop: any) => {
        if (typeof stop.color === 'string' && stop.color.startsWith('{') && stop.color.endsWith('}')) {
          const refPath = stop.color.slice(1, -1);
          const refEntry = tokenMap[refPath];
          if (refEntry) {
            const refResult = resolveTokenValue(refEntry.$value, refEntry.$type, tokenMap);
            return { ...stop, color: refResult.value ?? stop.color };
          }
        }
        return stop;
      });
    }

    resolved[path] = {
      $value: resolvedValue,
      $type: result.$type,
    };
  }
  return resolved;
}
