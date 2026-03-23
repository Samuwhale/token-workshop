/**
 * W3C Design Token Community Group file-format types.
 *
 * These types represent the raw JSON structure of `.tokens.json` files
 * as defined by the DTCG specification.
 *
 * Spec: https://tr.designtokens.org/format/
 */

// ---------------------------------------------------------------------------
// File-format interfaces
// ---------------------------------------------------------------------------

export interface DTCGToken {
  $value: unknown;
  $type?: string;
  $description?: string;
  $extensions?: Record<string, unknown>;
}

export interface DTCGGroup {
  $type?: string;
  $description?: string;
  $extensions?: Record<string, unknown>;
  [key: string]:
    | DTCGToken
    | DTCGGroup
    | string
    | Record<string, unknown>
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
  return typeof value === 'string' && /^\{[^}]+\}$/.test(value);
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
  const match = ref.match(/^\{([^}]+)\}$/);
  if (!match) throw new Error(`Invalid reference: ${ref}`);
  return match[1];
}
