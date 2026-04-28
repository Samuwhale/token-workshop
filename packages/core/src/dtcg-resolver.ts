/**
 * DTCG Resolver Engine (v2025.10)
 *
 * Implements the Design Tokens Resolver Module specification.
 * Given an external DTCG ResolverFile and modifier inputs, merges token sources
 * in resolution order and resolves all aliases to produce a single flat
 * token output.
 *
 * Spec: https://www.designtokens.org/tr/drafts/resolver/
 */

import type {
  ResolverFile,
  ResolverInput,
  ResolverSet,
  ResolverModifier,
  ResolverSource,
  ResolvedToken,
  Token,
  TokenType,
} from './types.js';
import type { DTCGGroup, DTCGToken } from './dtcg-types.js';
import { flattenTokenGroup } from './dtcg-types.js';
import { TOKEN_TYPE_VALUES } from './constants.js';
import { TokenResolver } from './resolver.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate a ResolverFile structure. Returns an array of error strings
 * (empty = valid).
 */
export function validateResolverFile(file: ResolverFile): string[] {
  const errors: string[] = [];

  if (file.version !== '2025.10') {
    errors.push(`Unsupported resolver version: "${file.version}". Expected "2025.10".`);
  }

  if (!Array.isArray(file.resolutionOrder) || file.resolutionOrder.length === 0) {
    errors.push('resolutionOrder must be a non-empty array.');
  }

  // Validate $ref targets in resolutionOrder
  for (const entry of file.resolutionOrder) {
    if (!entry.$ref) {
      errors.push('Each resolutionOrder entry must have a $ref property.');
      continue;
    }
    const target = resolveInternalPointer(entry.$ref, file);
    if (!target) {
      errors.push(`resolutionOrder $ref "${entry.$ref}" does not resolve to a known set or modifier.`);
    }
  }

  // Validate modifier defaults
  if (file.modifiers) {
    for (const [name, mod] of Object.entries(file.modifiers)) {
      if (mod.default && !mod.contexts[mod.default]) {
        errors.push(`Modifier "${name}" has default "${mod.default}" which is not a valid context.`);
      }
      if (Object.keys(mod.contexts).length === 0) {
        errors.push(`Modifier "${name}" has no contexts defined.`);
      }
    }
  }

  return errors;
}

/**
 * Validate resolver input against a ResolverFile's modifiers.
 * Returns an array of error strings (empty = valid).
 */
export function validateResolverInput(file: ResolverFile, input: ResolverInput): string[] {
  const errors: string[] = [];

  if (!file.modifiers) return errors;

  for (const [modName, mod] of Object.entries(file.modifiers)) {
    const selected = input[modName];
    if (!selected) {
      if (!mod.default) {
        errors.push(`Modifier "${modName}" requires an input value (no default defined).`);
      }
      continue;
    }
    if (!mod.contexts[selected]) {
      errors.push(`Modifier "${modName}" has no context "${selected}". Available: ${Object.keys(mod.contexts).join(', ')}.`);
    }
  }

  // Warn about extra input keys that don't match any modifier
  for (const key of Object.keys(input)) {
    if (!file.modifiers[key]) {
      errors.push(`Input key "${key}" does not match any modifier.`);
    }
  }

  return errors;
}

/**
 * Get a default input for a ResolverFile: uses each modifier's `default`
 * context, or falls back to the first context.
 */
export function getDefaultResolverInput(file: ResolverFile): ResolverInput {
  const input: ResolverInput = {};
  if (!file.modifiers) return input;
  for (const [name, mod] of Object.entries(file.modifiers)) {
    const contexts = Object.keys(mod.contexts);
    input[name] = mod.default ?? contexts[0] ?? '';
  }
  return input;
}

/**
 * The external file loader callback type.
 * Given a relative file path (e.g. "foundation.tokens.json"), returns the
 * parsed DTCGGroup (nested token structure).
 */
export type ExternalFileLoader = (filePath: string) => Promise<DTCGGroup>;

/**
 * A diagnostic message produced during token resolution.
 * Severity "error" means a source was skipped (cycle or bad reference);
 * "warning" is reserved for softer issues.
 */
export interface ResolverDiagnostic {
  severity: 'error' | 'warning';
  message: string;
}

/**
 * The result of resolving tokens: the merged flat token map plus any
 * diagnostics collected during resolution (e.g. cycle errors, bad $ref).
 */
export interface ResolverResult {
  tokens: Record<string, Token>;
  diagnostics: ResolverDiagnostic[];
}

/**
 * Resolve tokens using a ResolverFile and a set of modifier inputs.
 *
 * Algorithm:
 * 1. Validate the file and input.
 * 2. Walk resolutionOrder, merging sources (later entries override earlier).
 *    For sets: merge all sources.
 *    For modifiers: merge only the selected context's sources.
 * 3. Feed the merged flat token map through TokenResolver for alias resolution.
 * 4. Return the resolved flat map.
 */
export async function resolveTokens(
  file: ResolverFile,
  input: ResolverInput,
  loadExternal: ExternalFileLoader,
): Promise<ResolverResult> {
  // Step 1: Validate
  const fileErrors = validateResolverFile(file);
  if (fileErrors.length > 0) {
    throw new Error(`Invalid resolver file: ${fileErrors.join('; ')}`);
  }
  const inputErrors = validateResolverInput(file, input);
  if (inputErrors.length > 0) {
    throw new Error(`Invalid resolver input: ${inputErrors.join('; ')}`);
  }

  const diagnostics: ResolverDiagnostic[] = [];

  // Step 2: Flatten — walk resolutionOrder, merge sources
  const merged = new Map<string, DTCGToken>();

  for (const entry of file.resolutionOrder) {
    const target = resolveInternalPointer(entry.$ref, file);
    if (!target) continue;

    let sources: ResolverSource[];

    if (target.kind === 'set') {
      sources = target.value.sources;
    } else {
      // modifier: pick the selected context (or default)
      const mod = target.value;
      const contextName = input[target.name] ?? mod.default;
      if (!contextName || !mod.contexts[contextName]) continue;
      sources = mod.contexts[contextName];
    }

    // Merge each source into the flat map (later overrides earlier)
    for (const source of sources) {
      const tokens = await loadSource(source, file, loadExternal, new Set(), diagnostics);
      for (const [path, token] of tokens) {
        merged.set(path, token);
      }
    }
  }

  // Step 3: Convert to Token records and resolve aliases
  // Validate each token's $value before letting it into the system.
  const tokens: Record<string, Token> = {};
  for (const [path, dtcgToken] of merged) {
    const resolvedType = (typeof dtcgToken.$type === 'string' && TOKEN_TYPE_VALUES.has(dtcgToken.$type))
      ? (dtcgToken.$type as TokenType)
      : undefined;

    const valueError = validateDTCGValue(dtcgToken.$value, resolvedType, path);
    if (valueError) {
      diagnostics.push({ severity: 'warning', message: `Skipping malformed token: ${valueError}` });
      continue;
    }

    tokens[path] = {
      $value: dtcgToken.$value as Token['$value'],
      $type: resolvedType,
      ...(dtcgToken.$description ? { $description: dtcgToken.$description } : {}),
      ...(dtcgToken.$extensions ? { $extensions: dtcgToken.$extensions } : {}),
    };
  }

  return { tokens, diagnostics };
}

/**
 * Fully resolve tokens (including alias resolution) using a ResolverFile.
 * Returns both the resolved token map and any diagnostics collected during source loading.
 */
export async function resolveTokensFull(
  file: ResolverFile,
  input: ResolverInput,
  loadExternal: ExternalFileLoader,
): Promise<{
  resolved: Map<string, ResolvedToken>;
  diagnostics: ResolverDiagnostic[];
}> {
  const { tokens, diagnostics } = await resolveTokens(file, input, loadExternal);
  const resolver = new TokenResolver(tokens, 'resolver');
  const resolved = resolver.resolveAll();
  return { resolved, diagnostics };
}

// ---------------------------------------------------------------------------
// Value Validation
// ---------------------------------------------------------------------------

/**
 * Detect circular references in an object graph.
 * Tracks the current ancestor chain (not just visited nodes) so that
 * DAG sharing is permitted while true cycles are rejected.
 */
function hasCircularReference(value: unknown, ancestors = new Set<object>()): boolean {
  if (value === null || typeof value !== 'object') return false;
  const obj = value as object;
  if (ancestors.has(obj)) return true;
  ancestors.add(obj);
  const children = Array.isArray(obj) ? obj : Object.values(obj);
  const found = children.some(child => hasCircularReference(child, ancestors));
  ancestors.delete(obj);
  return found;
}

/**
 * Validate type-specific shape of a token value.
 * Returns an error string, or null if the value is acceptable.
 * Alias references (`{path.to.token}`) are always valid regardless of type.
 */
function validateTypedShape(value: unknown, type: string, path: string): string | null {
  // Alias reference — valid for any type
  if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
    return null;
  }

  switch (type) {
    case 'color':
    case 'string':
    case 'fontStyle':
    case 'textDecoration':
    case 'textTransform':
    case 'link':
    case 'asset':
      if (typeof value !== 'string') {
        return `token "${path}": type "${type}" requires a string $value (got ${typeof value})`;
      }
      break;

    case 'number':
    case 'percentage':
    case 'lineHeight':
    case 'letterSpacing':
    case 'fontWeight':
      if (typeof value !== 'number' && typeof value !== 'string') {
        return `token "${path}": type "${type}" requires a number or string $value (got ${typeof value})`;
      }
      break;

    case 'boolean':
      if (typeof value !== 'boolean') {
        return `token "${path}": type "boolean" requires a boolean $value (got ${typeof value})`;
      }
      break;

    case 'cubicBezier':
      if (
        !Array.isArray(value) ||
        value.length !== 4 ||
        !value.every(v => typeof v === 'number' && isFinite(v))
      ) {
        return `token "${path}": type "cubicBezier" requires an array of exactly 4 finite numbers`;
      }
      break;

    case 'fontFamily':
      if (typeof value !== 'string' && !Array.isArray(value)) {
        return `token "${path}": type "fontFamily" requires a string or string[] $value (got ${typeof value})`;
      }
      break;

    case 'dimension':
    case 'duration':
      if (typeof value !== 'string' && typeof value !== 'number') {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          return `token "${path}": type "${type}" requires a {value, unit} object, number, or string`;
        }
        const obj = value as Record<string, unknown>;
        if (typeof obj.value !== 'number' || !isFinite(obj.value)) {
          return `token "${path}": type "${type}" $value.value must be a finite number`;
        }
        if (typeof obj.unit !== 'string') {
          return `token "${path}": type "${type}" $value.unit must be a string`;
        }
      }
      break;

    case 'gradient':
      if (!Array.isArray(value)) {
        return `token "${path}": type "gradient" requires an array $value (got ${typeof value})`;
      }
      break;

    case 'strokeStyle':
      if (typeof value !== 'string' && (typeof value !== 'object' || value === null || Array.isArray(value))) {
        return `token "${path}": type "strokeStyle" requires a string or {dashArray, lineCap} object`;
      }
      break;

    case 'shadow':
    case 'typography':
    case 'border':
    case 'transition':
    case 'composition':
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return `token "${path}": type "${type}" requires an object $value (got ${Array.isArray(value) ? 'array' : typeof value})`;
      }
      break;
  }

  return null;
}

/**
 * Validate a DTCGToken's $value at the merge boundary.
 *
 * Checks for null/undefined, NaN, non-finite numbers, circular structures,
 * and type-specific shape mismatches. Returns an error string on failure,
 * or null if the value is acceptable.
 */
export function validateDTCGValue(
  value: unknown,
  type: string | undefined,
  path: string,
): string | null {
  // Reject null and undefined — $value must be present per DTCG spec
  if (value === null || value === undefined) {
    return `token "${path}": $value is ${value === null ? 'null' : 'undefined'}`;
  }

  // Reject NaN
  if (typeof value === 'number' && isNaN(value)) {
    return `token "${path}": $value is NaN`;
  }

  // Reject Infinity / -Infinity
  if (typeof value === 'number' && !isFinite(value)) {
    return `token "${path}": $value is non-finite (${value})`;
  }

  // Reject circular structures
  if (typeof value === 'object' && hasCircularReference(value)) {
    return `token "${path}": $value contains a circular reference`;
  }

  // Type-specific shape validation (only when type is known)
  if (type && TOKEN_TYPE_VALUES.has(type)) {
    return validateTypedShape(value, type, path);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

type InternalTarget =
  | { kind: 'set'; name: string; value: ResolverSet }
  | { kind: 'modifier'; name: string; value: ResolverModifier };

/**
 * Resolve an external DTCG resolver JSON Pointer like "#/sets/foundation" or "#/modifiers/theme"
 * within the resolver file itself.
 */
function resolveInternalPointer(ref: string, file: ResolverFile): InternalTarget | null {
  if (!ref.startsWith('#/')) return null;
  const parts = ref.slice(2).split('/');
  if (parts.length !== 2) return null;

  const [section, name] = parts;
  if (section === 'sets' && file.sets?.[name]) {
    return { kind: 'set', name, value: file.sets[name] };
  }
  if (section === 'modifiers' && file.modifiers?.[name]) {
    return { kind: 'modifier', name, value: file.modifiers[name] };
  }
  return null;
}

/**
 * Load tokens from a single ResolverSource.
 * - If it's a $ref to a file, call loadExternal.
 * - If it's a $ref to an internal pointer, recursively resolve.
 * - Otherwise treat as inline DTCGGroup.
 *
 * @param visited - set of internal $ref strings already on the call stack;
 *   prevents infinite recursion when sets reference each other cyclically.
 * @param diagnostics - accumulator for errors/warnings; cycle and bad-reference
 *   errors are pushed here so callers can surface them to the UI.
 */
async function loadSource(
  source: ResolverSource,
  file: ResolverFile,
  loadExternal: ExternalFileLoader,
  visited: Set<string> = new Set(),
  diagnostics: ResolverDiagnostic[] = [],
): Promise<Map<string, DTCGToken>> {
  if ('$ref' in source && typeof source.$ref === 'string') {
    const ref = source.$ref;
    // Internal pointer
    if (ref.startsWith('#/')) {
      if (visited.has(ref)) {
        diagnostics.push({
          severity: 'error',
          message:
            `Cycle detected: internal pointer "${ref}" was already visited. ` +
            `Cycle path: ${[...visited].join(' → ')} → ${ref}. Source will be skipped.`,
        });
        return new Map();
      }
      const target = resolveInternalPointer(ref, file);
      if (!target || target.kind !== 'set') {
        diagnostics.push({
          severity: 'error',
          message:
            `Internal pointer "${ref}" did not resolve to a set` +
            (target ? ` (resolved to kind "${target.kind}")` : ' (not found)') +
            '. Source will be skipped.',
        });
        return new Map();
      }
      // Merge all sources from the referenced set
      const childVisited = new Set(visited).add(ref);
      const result = new Map<string, DTCGToken>();
      for (const s of target.value.sources) {
        for (const [path, token] of await loadSource(s, file, loadExternal, childVisited, diagnostics)) {
          result.set(path, token);
        }
      }
      return result;
    }
    // External file reference
    const group = await loadExternal(ref);
    return flattenTokenGroup(group);
  }

  // Inline tokens — treat as DTCGGroup
  if (typeof source === 'object' && source !== null && !('$ref' in source)) {
    return flattenTokenGroup(source);
  }

  return new Map();
}
