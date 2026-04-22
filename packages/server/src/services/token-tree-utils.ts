import {
  type Token,
  type TokenGroup,
  type TokenType,
  isDTCGToken,
} from '@tokenmanager/core';
import { BadRequestError } from '../errors.js';

const MAX_REGEX_LENGTH = 200;
const STRING_SCOPE_TOKEN_TYPES: Record<string, string> = {
  FONT_FAMILY: 'fontFamily',
  FONT_STYLE: 'string',
};

const FLOAT_SCOPE_TOKEN_TYPES: Record<string, string> = {
  FONT_WEIGHT: 'fontWeight',
  FONT_SIZE: 'dimension',
  LINE_HEIGHT: 'number',
  LETTER_SPACING: 'number',
  PARAGRAPH_SPACING: 'dimension',
  PARAGRAPH_INDENT: 'dimension',
};

/**
 * A node in the DTCG token tree — either a group (with nested children)
 * or a leaf token (with $value). Used as the traversal cursor type.
 */
type TokenTreeNode = TokenGroup[string]; // Token | TokenGroup | TokenType | string | undefined

function getTokenScopes(token: { $extensions?: Record<string, unknown> }): string[] {
  const rawScopes = token.$extensions?.['com.figma.scopes'];
  return Array.isArray(rawScopes)
    ? rawScopes.filter((scope): scope is string => typeof scope === 'string')
    : [];
}

function normalizeScopedVariableTokenValue(value: unknown, nextType: string): unknown {
  if (nextType === 'dimension') {
    if (typeof value === 'number') {
      return { value, unit: 'px' };
    }
  }
  return value;
}

function normalizeScopedVariableTokenShape<
  T extends { $type?: string; $value?: unknown; $extensions?: Record<string, unknown> },
>(token: T): T {
  const scopes = getTokenScopes(token);
  if (scopes.length === 0) {
    return token;
  }

  if (token.$type === 'string') {
    for (const scope of scopes) {
      const nextType = STRING_SCOPE_TOKEN_TYPES[scope];
      if (nextType) {
        return { ...token, $type: nextType };
      }
    }
  }

  if (token.$type === 'number') {
    for (const scope of scopes) {
      const nextType = FLOAT_SCOPE_TOKEN_TYPES[scope];
      if (nextType) {
        return {
          ...token,
          $type: nextType,
          ...(token.$value === undefined
            ? {}
            : { $value: normalizeScopedVariableTokenValue(token.$value, nextType) }),
        };
      }
    }
  }

  return token;
}

export function normalizeScopedVariableToken<
  T extends { $type?: string; $value?: unknown; $extensions?: Record<string, unknown> },
>(token: T): T {
  return normalizeScopedVariableTokenShape(token);
}

export function normalizeScopedVariableTokenGroup(tokens: TokenGroup): boolean {
  let changed = false;

  const walk = (group: TokenGroup) => {
    for (const [key, value] of Object.entries(group)) {
      if (key.startsWith('$') || value === null || typeof value !== 'object') continue;
      if (isDTCGToken(value)) {
        const normalized = normalizeScopedVariableTokenShape(value);
        if (normalized !== value) {
          Object.assign(value, normalized);
          changed = true;
        }
        continue;
      }
      walk(value as TokenGroup);
    }
  };

  walk(tokens);
  return changed;
}

// ----- Tree walkers -----

/**
 * Walk every $value in a token tree and apply `updateString` to string values
 * (including string leaves inside composite/object $values).
 * Returns the number of $value fields that were modified.
 */
export function walkAliasValues(
  group: TokenGroup,
  updateString: (s: string) => string | null,
): number {
  let count = 0;
  const updateComposite = (obj: Record<string, unknown>) => {
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (typeof v === 'string') {
        const replaced = updateString(v);
        if (replaced !== null) { obj[k] = replaced; count++; }
      } else if (typeof v === 'object' && v !== null) {
        updateComposite(v as Record<string, unknown>);
      }
    }
  };
  const walk = (obj: TokenGroup) => {
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (key === '$value' && typeof val === 'string') {
        const replaced = updateString(val);
        if (replaced !== null) { (obj as Record<string, unknown>)[key] = replaced; count++; }
      } else if (key === '$value' && typeof val === 'object' && val !== null) {
        updateComposite(val as Record<string, unknown>);
      } else if (typeof val === 'object' && val !== null) {
        walk(val as TokenGroup);
      }
    }
  };
  walk(group);
  return count;
}

/**
 * Walk all leaf tokens under a token group object, calling `visitor` for each.
 * Skips `$`-prefixed keys (DTCG metadata).
 */
export function walkLeafTokens(
  obj: TokenGroup,
  visitor: (relativePath: string, token: Token) => void,
  prefix = '',
): void {
  for (const [key, val] of Object.entries(obj)) {
    if (key.startsWith('$')) continue;
    const relPath = prefix ? `${prefix}.${key}` : key;
    if (isDTCGToken(val)) {
      visitor(relPath, val as Token);
    } else if (typeof val === 'object' && val !== null) {
      walkLeafTokens(val as TokenGroup, visitor, relPath);
    }
  }
}

/**
 * Collect all leaf tokens under a group path, with relative paths from the group root.
 */
export function collectGroupLeafTokens(tokens: TokenGroup, groupPath: string): Array<{ relativePath: string; token: Token }> {
  const parts = groupPath.split('.');
  let current: TokenTreeNode = tokens as TokenGroup;
  for (const part of parts) {
    if (!current || typeof current !== 'object') return [];
    current = (current as TokenGroup)[part];
  }
  if (!current || typeof current !== 'object' || isDTCGToken(current)) return [];
  const result: Array<{ relativePath: string; token: Token }> = [];
  walkLeafTokens(current as TokenGroup, (relativePath, token) => {
    result.push({ relativePath, token });
  });
  return result;
}

// ----- Path helpers -----

/**
 * Validate a dot-separated token path.
 * Rejects empty paths, empty segments (double dots), segments starting with
 * the reserved DTCG `$` prefix, and segments containing `/` or `\`.
 */
export function validateTokenPath(tokenPath: string): void {
  if (!tokenPath) {
    throw new BadRequestError('Token path must not be empty');
  }
  const segments = tokenPath.split('.');
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg === '') {
      throw new BadRequestError(
        `Invalid token path "${tokenPath}": contains an empty segment (double dot or leading/trailing dot)`,
      );
    }
    if (seg.startsWith('$')) {
      throw new BadRequestError(
        `Invalid token path "${tokenPath}": segment "${seg}" starts with reserved "$" prefix`,
      );
    }
    if (seg.includes('/') || seg.includes('\\')) {
      throw new BadRequestError(
        `Invalid token path "${tokenPath}": segment "${seg}" contains a slash`,
      );
    }
  }
}

export function pathExistsAt(tokens: TokenGroup, path: string): boolean {
  const parts = path.split('.');
  let current: TokenTreeNode = tokens as TokenGroup;
  for (const part of parts) {
    if (!current || typeof current !== 'object') return false;
    current = (current as TokenGroup)[part];
  }
  return current !== undefined;
}

export function getObjectAtPath(tokens: TokenGroup, path: string): TokenGroup | undefined {
  const parts = path.split('.');
  let current: TokenTreeNode = tokens as TokenGroup;
  for (const part of parts) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as TokenGroup)[part];
  }
  return (current && typeof current === 'object' && !isDTCGToken(current)) ? current as TokenGroup : undefined;
}

export function setGroupAtPath(tokens: TokenGroup, path: string, group: TokenGroup): void {
  const parts = path.split('.');
  let current: TokenGroup = tokens;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]] || isDTCGToken(current[parts[i]])) {
      current[parts[i]] = {} as TokenGroup;
    }
    current = current[parts[i]] as TokenGroup;
  }
  current[parts[parts.length - 1]] = group;
}

export function getTokenAtPath(group: TokenGroup, tokenPath: string): Token | undefined {
  const parts = tokenPath.split('.');
  let current: TokenTreeNode = group as TokenGroup;
  for (const part of parts) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as TokenGroup)[part];
  }
  return isDTCGToken(current) ? (current as Token) : undefined;
}

export function getTokenAtPathWithInheritedType(
  group: TokenGroup,
  tokenPath: string,
): Token | undefined {
  const parts = tokenPath.split('.');
  let current: TokenTreeNode = group as TokenGroup;
  let inheritedType: TokenType | undefined = group.$type;

  for (const part of parts) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as TokenGroup)[part];
    if (!current || typeof current !== 'object') return undefined;
    if (!isDTCGToken(current)) {
      inheritedType = (current as TokenGroup).$type ?? inheritedType;
    }
  }

  if (!isDTCGToken(current)) return undefined;
  const token = current as Token;
  return !token.$type && inheritedType ? { ...token, $type: inheritedType } : token;
}

export function setTokenAtPath(group: TokenGroup, tokenPath: string, token: Token): void {
  const parts = tokenPath.split('.');
  let current: TokenGroup = group;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]] || typeof current[parts[i]] !== 'object' || isDTCGToken(current[parts[i]])) {
      current[parts[i]] = {} as TokenGroup;
    }
    current = current[parts[i]] as TokenGroup;
  }
  current[parts[parts.length - 1]] = token;
}

export function deleteTokenAtPath(group: TokenGroup, tokenPath: string): boolean {
  const parts = tokenPath.split('.');
  // Track the chain of parent objects so we can prune empty groups after deletion.
  const chain: Array<{ obj: TokenGroup; key: string }> = [];
  let current: TokenGroup = group;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]]) return false;
    chain.push({ obj: current, key: parts[i] });
    current = current[parts[i]] as TokenGroup;
  }
  const last = parts[parts.length - 1];
  if (!(last in current)) return false;
  delete current[last];
  // Walk back up and remove any parent group that is now empty.
  for (let i = chain.length - 1; i >= 0; i--) {
    const { obj, key } = chain[i];
    const child = obj[key];
    if (typeof child === 'object' && child !== null && Object.keys(child).every(k => k.startsWith('$'))) {
      delete obj[key];
    } else {
      break;
    }
  }
  return true;
}

// ----- Alias ref updaters -----

/** Update alias $value references from oldGroupPath to newGroupPath across a token tree */
export function updateAliasRefs(group: TokenGroup, oldGroupPath: string, newGroupPath: string): number {
  const escapedOld = oldGroupPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const refRegex = new RegExp(`\\{(${escapedOld})(\\.[^}]*)?\\}`, 'g');
  return walkAliasValues(group, (s) => {
    if (!s.includes(`{${oldGroupPath}`)) return null;
    let matched = false;
    const result = s.replace(refRegex, (_, _groupPath, rest) => {
      matched = true;
      return rest ? `{${newGroupPath}${rest}}` : `{${newGroupPath}}`;
    });
    return matched ? result : null;
  });
}

/** Update alias $value references using a full path map (oldPath -> newPath) */
export function updateBulkAliasRefs(group: TokenGroup, pathMap: Map<string, string>): number {
  const refRegex = /\{([^}]+)\}/g;
  return walkAliasValues(group, (s) => {
    if (!s.includes('{')) return null;
    let matched = false;
    const result = s.replace(refRegex, (_match, refPath) => {
      if (pathMap.has(refPath)) { matched = true; return `{${pathMap.get(refPath)}}`; }
      return _match;
    });
    return matched ? result : null;
  });
}

// ----- Alias ref preview (read-only) -----

export interface AliasChange {
  /** Dotted path of the token whose $value would be rewritten */
  tokenPath: string;
  /** Current $value (or sub-field value) containing the alias */
  oldValue: string;
  /** New $value after alias rewrite */
  newValue: string;
}

/**
 * Read-only scan: find every $value in `group` that contains alias references
 * matching any key in `pathMap`, and return the before/after strings.
 * Does NOT mutate the group.
 */
export function previewBulkAliasChanges(
  group: TokenGroup,
  pathMap: Map<string, string>,
): AliasChange[] {
  const refRegex = /\{([^}]+)\}/g;
  const changes: AliasChange[] = [];

  const scanComposite = (obj: Record<string, unknown>, parentPath: string) => {
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (typeof v === 'string' && v.includes('{')) {
        let matched = false;
        const result = v.replace(refRegex, (_match, refPath) => {
          if (pathMap.has(refPath)) { matched = true; return `{${pathMap.get(refPath)}}`; }
          return _match;
        });
        if (matched) {
          changes.push({ tokenPath: parentPath, oldValue: v, newValue: result });
        }
      } else if (typeof v === 'object' && v !== null) {
        scanComposite(v as Record<string, unknown>, parentPath);
      }
    }
  };

  const walk = (obj: TokenGroup, prefix: string) => {
    for (const key of Object.keys(obj)) {
      if (key.startsWith('$')) {
        if (key === '$value') {
          const val = obj[key];
          const path = prefix.slice(0, -1); // remove trailing '.'
          if (typeof val === 'string' && val.includes('{')) {
            let matched = false;
            const result = (val as string).replace(refRegex, (_match, refPath) => {
              if (pathMap.has(refPath)) { matched = true; return `{${pathMap.get(refPath)}}`; }
              return _match;
            });
            if (matched) {
              changes.push({ tokenPath: path, oldValue: val as string, newValue: result });
            }
          } else if (typeof val === 'object' && val !== null) {
            scanComposite(val as Record<string, unknown>, path);
          }
        }
        continue;
      }
      const child = obj[key];
      if (typeof child === 'object' && child !== null) {
        walk(child as TokenGroup, prefix + key + '.');
      }
    }
  };

  walk(group, '');
  return changes;
}

/**
 * Read-only scan for group renames: find every $value containing alias references
 * to tokens under `oldGroupPath` and return before/after strings.
 */
export function previewGroupAliasChanges(
  group: TokenGroup,
  oldGroupPath: string,
  newGroupPath: string,
): AliasChange[] {
  const escapedOld = oldGroupPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const refRegex = new RegExp(`\\{(${escapedOld})(\\.[^}]*)?\\}`, 'g');
  const changes: AliasChange[] = [];

  const scanValue = (val: unknown, tokenPath: string) => {
    if (typeof val === 'string' && val.includes(`{${oldGroupPath}`)) {
      let matched = false;
      const result = val.replace(refRegex, (_, _groupPath, rest) => {
        matched = true;
        return rest ? `{${newGroupPath}${rest}}` : `{${newGroupPath}}`;
      });
      if (matched) {
        changes.push({ tokenPath, oldValue: val, newValue: result });
      }
    } else if (typeof val === 'object' && val !== null) {
      for (const v of Object.values(val as Record<string, unknown>)) {
        scanValue(v, tokenPath);
      }
    }
  };

  const walk = (obj: TokenGroup, prefix: string) => {
    for (const key of Object.keys(obj)) {
      if (key.startsWith('$')) {
        if (key === '$value') {
          scanValue(obj[key], prefix.slice(0, -1));
        }
        continue;
      }
      const child = obj[key];
      if (typeof child === 'object' && child !== null) {
        walk(child as TokenGroup, prefix + key + '.');
      }
    }
  };

  walk(group, '');
  return changes;
}

// ----- Regex safety -----

/**
 * Detect regex patterns vulnerable to catastrophic backtracking (ReDoS).
 * Checks for nested quantifiers: a quantified group whose contents also
 * contain a quantifier, e.g. `(a+)+`, `(x*|y+)*`, `(?:a{2,})+`.
 */
export function isSafeRegex(pattern: string): boolean {
  if (pattern.length > MAX_REGEX_LENGTH) return false;
  // Strip escaped characters and character classes to avoid false positives
  const cleaned = pattern
    .replace(/\\./g, 'a')
    .replace(/\[[^\]]*\]/g, 'a');
  // Quantifier immediately before ')' + quantifier immediately after ')'
  // catches the classic nested-quantifier ReDoS family
  if (/([+*?]|\{\d+,?\d*\})\s*\)\s*([+*?]|\{\d+,?\d*\})/.test(cleaned)) {
    return false;
  }
  return true;
}
