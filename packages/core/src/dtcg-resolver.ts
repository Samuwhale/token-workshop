/**
 * DTCG Resolver Engine (v2025.10)
 *
 * Implements the Design Tokens Resolver Module specification.
 * Given a ResolverFile and a set of modifier inputs, merges token sources
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
  Token,
  TokenType,
} from './types.js';
import type { DTCGGroup, DTCGToken } from './dtcg-types.js';
import { isDTCGToken, flattenTokenGroup } from './dtcg-types.js';
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
): Promise<Record<string, Token>> {
  // Step 1: Validate
  const fileErrors = validateResolverFile(file);
  if (fileErrors.length > 0) {
    throw new Error(`Invalid resolver file: ${fileErrors.join('; ')}`);
  }
  const inputErrors = validateResolverInput(file, input);
  if (inputErrors.length > 0) {
    throw new Error(`Invalid resolver input: ${inputErrors.join('; ')}`);
  }

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
      const tokens = await loadSource(source, file, loadExternal);
      for (const [path, token] of tokens) {
        merged.set(path, token);
      }
    }
  }

  // Step 3: Convert to Token records and resolve aliases
  const tokenRecords: Record<string, Token> = {};
  for (const [path, dtcgToken] of merged) {
    tokenRecords[path] = {
      $value: dtcgToken.$value as Token['$value'],
      $type: dtcgToken.$type as TokenType | undefined,
      ...(dtcgToken.$description ? { $description: dtcgToken.$description } : {}),
      ...(dtcgToken.$extensions ? { $extensions: dtcgToken.$extensions } : {}),
    };
  }

  return tokenRecords;
}

/**
 * Fully resolve tokens (including alias resolution) using a ResolverFile.
 */
export async function resolveTokensFull(
  file: ResolverFile,
  input: ResolverInput,
  loadExternal: ExternalFileLoader,
): Promise<Map<string, { path: string; $type: string; $value: unknown; rawValue: unknown }>> {
  const tokens = await resolveTokens(file, input, loadExternal);
  const resolver = new TokenResolver(tokens, 'resolver');
  const resolved = resolver.resolveAll();
  return resolved as Map<string, { path: string; $type: string; $value: unknown; rawValue: unknown }>;
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

type InternalTarget =
  | { kind: 'set'; name: string; value: ResolverSet }
  | { kind: 'modifier'; name: string; value: ResolverModifier };

/**
 * Resolve a JSON Pointer like "#/sets/foundation" or "#/modifiers/theme"
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
 */
async function loadSource(
  source: ResolverSource,
  file: ResolverFile,
  loadExternal: ExternalFileLoader,
): Promise<Map<string, DTCGToken>> {
  if ('$ref' in source && typeof source.$ref === 'string') {
    const ref = source.$ref;
    // Internal pointer
    if (ref.startsWith('#/')) {
      const target = resolveInternalPointer(ref, file);
      if (!target || target.kind !== 'set') {
        console.warn(
          `[dtcg-resolver] Internal pointer "${ref}" did not resolve to a set` +
            (target ? ` (resolved to kind "${target.kind}")` : ' (not found)') +
            '. Source will be skipped.',
        );
        return new Map();
      }
      // Merge all sources from the referenced set
      const result = new Map<string, DTCGToken>();
      for (const s of target.value.sources) {
        for (const [path, token] of await loadSource(s, file, loadExternal)) {
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
    return flattenTokenGroup(source as DTCGGroup);
  }

  return new Map();
}
