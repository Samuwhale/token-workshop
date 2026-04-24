import type { TokenGenerator } from '../hooks/useGenerators';
import type { TokenMapEntry } from '../../shared/types';
import type { TokenCollection } from '@tokenmanager/core';
import type { GeneratorImpact, ModeImpact } from '../components/tokenListTypes';
import {
  createGeneratedGroupSourceKeys,
  hasGeneratedGroupSourceKeyMatch,
} from './generatorSource';

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
  sourceCollectionId: string,
  generators: TokenGenerator[],
  pathToCollectionId?: Record<string, string>,
  collectionIdsByPath?: Record<string, string[]>,
): GeneratorImpact[] {
  const impacts: GeneratorImpact[] = [];
  const targetSourceKeys = new Set<string>();
  for (const path of targetPaths) {
    for (const key of createGeneratedGroupSourceKeys({
      sourceTokenPath: path,
      sourceCollectionId,
      pathToCollectionId,
      collectionIdsByPath,
    })) {
      targetSourceKeys.add(key);
    }
  }
  for (const gen of generators) {
    if (hasGeneratedGroupSourceKeyMatch({
      sourceTokenPath: gen.sourceToken,
      sourceCollectionId: gen.sourceCollectionId,
      targetSourceKeys,
      pathToCollectionId,
      collectionIdsByPath,
    })) {
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
  sourceCollectionId: string,
  collections: TokenCollection[],
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>,
): ModeImpact[] {
  const collection = collections.find(
    (candidate) => candidate.id === sourceCollectionId,
  );
  const collectionFlat = perCollectionFlat[sourceCollectionId];
  if (!collection || !collectionFlat) {
    return [];
  }

  const seen = new Set<string>();
  const impacts: ModeImpact[] = [];

  for (const option of collection.modes) {
    for (const path of targetPaths) {
      const entry = collectionFlat[path];
      if (!entry) continue;

      const modes = (entry.$extensions as {
        tokenmanager?: {
          modes?: Record<string, Record<string, unknown>>;
        };
      } | undefined)?.tokenmanager?.modes;
      if (modes?.[sourceCollectionId]?.[option.name] === undefined) continue;

      const impactKey = `${sourceCollectionId}:${option.name}`;
      if (!seen.has(impactKey)) {
        seen.add(impactKey);
        impacts.push({
          collectionName: sourceCollectionId,
          optionName: option.name,
        });
      }
      break;
    }
  }

  return impacts;
}
