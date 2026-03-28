/**
 * W3C Design Token Community Group file-format types.
 *
 * These types represent the raw JSON structure of `.tokens.json` files
 * as defined by the DTCG specification.
 *
 * Spec: https://tr.designtokens.org/format/
 */

import { REFERENCE_REGEX, makeReferenceGlobalRegex } from './constants.js';
import type { TokenExtensions } from './types.js';

// ---------------------------------------------------------------------------
// File-format interfaces
// ---------------------------------------------------------------------------

export interface DTCGToken {
  $value: unknown;
  $type?: string;
  $description?: string;
  $extensions?: TokenExtensions;
}

export interface DTCGGroup {
  $type?: string;
  $description?: string;
  $extensions?: TokenExtensions;
  [key: string]:
    | DTCGToken
    | DTCGGroup
    | string
    | TokenExtensions
    | undefined;
}

/** A complete DTCG file is simply a top-level group. */
export type DTCGFile = DTCGGroup;

// ---------------------------------------------------------------------------
// Type Guards
// ---------------------------------------------------------------------------

/** Returns `true` if `node` is a token (has a `$value` property). */
export function isDTCGToken(node: unknown): node is DTCGToken {
  return typeof node === 'object' && node !== null && '$value' in node;
}

/** Returns `true` if `node` is a group (object without `$value`). */
export function isDTCGGroup(node: unknown): node is DTCGGroup {
  return typeof node === 'object' && node !== null && !('$value' in node);
}

// ---------------------------------------------------------------------------
// Reference Helpers
// ---------------------------------------------------------------------------

/** Returns `true` if `value` is a DTCG alias reference string (e.g. `"{a.b}"`). */
export function isReference(value: unknown): value is string {
  return typeof value === 'string' && REFERENCE_REGEX.test(value);
}

/**
 * Returns `true` if `value` is a formula string — a string containing at least
 * one `{ref}` plus arithmetic operators outside of braces.
 *
 * Formula examples: `"{spacing.base} * 2"`, `"{a} + {b} / 3"`
 * NOT formulas: `"{a.b}"` (pure alias — use `isReference` for that)
 */
export function isFormula(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (REFERENCE_REGEX.test(value)) return false; // pure alias
  // Must contain at least one {ref}
  if (!value.match(makeReferenceGlobalRegex())) return false;
  // Must have at least one math operator outside of braces
  const withoutRefs = value.replace(makeReferenceGlobalRegex(), '');
  return /[+\-*/^()]/.test(withoutRefs);
}

/**
 * Extract the dot-path from a reference string.
 *
 * @example
 * parseReference('{colors.primary}') // => 'colors.primary'
 *
 * @throws if the string is not a valid reference.
 */
export function parseReference(ref: string): string {
  const match = ref.match(REFERENCE_REGEX);
  if (!match) throw new Error(`Invalid reference: ${ref}`);
  return match[1];
}

// ---------------------------------------------------------------------------
// Reference resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a `{path.to.token}` reference through a flat string-value map.
 *
 * Follows alias chains (`{path}` values) until a concrete string or a cycle.
 * Returns `null` on cycle, missing path, or non-string value.
 *
 * @param pathOrRef  Bare path (`a.b.c`) or braced reference (`{a.b.c}`).
 * @param flatMap    Path → value lookup (only string values are followed as aliases).
 * @param visited    Cycle-detection set; omit on first call.
 */
export function resolveRefValue(
  pathOrRef: string,
  flatMap: Record<string, unknown>,
  visited = new Set<string>(),
): string | null {
  const path =
    pathOrRef.startsWith('{') && pathOrRef.endsWith('}')
      ? pathOrRef.slice(1, -1)
      : pathOrRef;
  if (visited.has(path)) return null;
  visited.add(path);
  const val = flatMap[path];
  if (typeof val === 'string' && val.startsWith('{') && val.endsWith('}')) {
    return resolveRefValue(val, flatMap, visited);
  }
  return typeof val === 'string' ? val : null;
}

// ---------------------------------------------------------------------------
// Flatten
// ---------------------------------------------------------------------------

/**
 * Flatten a nested DTCG group into a `Map<dotPath, DTCGToken>`.
 *
 * Keys that start with `$` are treated as metadata and skipped.
 * `$type` is inherited from parent groups per the DTCG spec — if a token has
 * no `$type` of its own, the nearest ancestor group's `$type` is applied.
 *
 * @param group     The group (or file root) to flatten.
 * @param prefix    Dot-path prefix accumulated by parent calls (omit on first call).
 * @param parentType Inherited `$type` from an ancestor group (omit on first call).
 */
export function flattenTokenGroup(
  group: DTCGGroup,
  prefix = '',
  parentType?: string,
): Map<string, DTCGToken> {
  const out = new Map<string, DTCGToken>();
  const inheritedType = group.$type ?? parentType;
  for (const [key, value] of Object.entries(group)) {
    if (key.startsWith('$')) continue;
    if (value === undefined || value === null) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (isDTCGToken(value)) {
      const token = value as DTCGToken;
      out.set(path, (!token.$type && inheritedType) ? { ...token, $type: inheritedType } : token);
    } else if (typeof value === 'object' && !Array.isArray(value)) {
      for (const [subPath, subToken] of flattenTokenGroup(value as DTCGGroup, path, inheritedType)) {
        out.set(subPath, subToken);
      }
    }
  }
  return out;
}
