import type { TokenGenerator } from '../hooks/useGenerators';
import type { TokenMapEntry } from '../../shared/types';
import type { TokenCollection } from '@tokenmanager/core';
import type { GeneratorImpact, ModeImpact } from '../components/tokenListTypes';

/**
 * Returns all $tokenRefs entries from a generator's config as a flat
 * Record<fieldName, tokenPath>. Handles all GeneratorConfig variants.
 */
function extractTokenRefs(config: TokenGenerator['config']): Record<string, string> {
  const refs = (config as unknown as { $tokenRefs?: Record<string, string | undefined> }).$tokenRefs;
  if (!refs) return {};
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(refs)) {
    if (typeof val === 'string') out[key] = val;
  }
  return out;
}

/**
 * Compute which generators reference any of the given token paths (directly
 * via `sourceToken` or via a `$tokenRefs` config field).
 */
export function computeGeneratorImpacts(
  targetPaths: Set<string>,
  generators: TokenGenerator[],
): GeneratorImpact[] {
  const impacts: GeneratorImpact[] = [];
  for (const gen of generators) {
    if (gen.sourceToken && targetPaths.has(gen.sourceToken)) {
      impacts.push({
        generatorId: gen.id,
        generatorName: gen.name,
        generatorType: gen.type,
        role: 'source',
      });
    }
    const refs = extractTokenRefs(gen.config);
    for (const [field, path] of Object.entries(refs)) {
      if (targetPaths.has(path)) {
        impacts.push({
          generatorId: gen.id,
          generatorName: gen.name,
          generatorType: gen.type,
          role: 'config-ref',
          configField: field,
        });
      }
    }
  }
  return impacts;
}

/**
 * Compute which mode options contain inline mode values for any of the given
 * token paths across the authored collections.
 */
export function computeModeImpacts(
  targetPaths: Set<string>,
  collections: TokenCollection[],
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>,
): ModeImpact[] {
  const seen = new Set<string>();
  const impacts: ModeImpact[] = [];
  const tokenEntries = Object.values(perCollectionFlat).flatMap((flatSet) =>
    Object.entries(flatSet),
  );

  for (const collection of collections) {
    for (const option of collection.modes) {
      for (const [path, entry] of tokenEntries) {
        if (!targetPaths.has(path)) continue;
        const modes = (entry.$extensions as {
          tokenmanager?: {
            modes?: Record<string, Record<string, unknown>>;
          };
        } | undefined)?.tokenmanager?.modes;
        if (modes?.[collection.id]?.[option.name] === undefined) continue;

        const impactKey = `${collection.id}:${option.name}`;
        if (!seen.has(impactKey)) {
          seen.add(impactKey);
          impacts.push({
            collectionName: collection.id,
            optionName: option.name,
          });
        }
        break;
      }
    }
  }
  return impacts;
}
