import type { TokenGenerator } from '../hooks/useGenerators';
import type { TokenMapEntry } from '../../shared/types';
import {
  createGeneratorSourceKeys,
  getGeneratorConfigTokenRefs,
  hasGeneratorSourceKeyMatch,
  readTokenCollectionModeValues,
  type TokenCollection,
} from '@tokenmanager/core';
import type { GeneratorImpact, ModeImpact } from '../components/tokenListTypes';

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
  const impacts = new Map<string, GeneratorImpact>();
  const targetSourceKeys = new Set<string>();
  for (const path of targetPaths) {
    for (const key of createGeneratorSourceKeys({
      sourceTokenPath: path,
      sourceCollectionId,
      pathToCollectionId,
      collectionIdsByPath,
    })) {
      targetSourceKeys.add(key);
    }
  }
  for (const gen of generators) {
    if (hasGeneratorSourceKeyMatch({
      sourceTokenPath: gen.sourceToken,
      sourceCollectionId: gen.sourceCollectionId,
      targetSourceKeys,
      pathToCollectionId,
      collectionIdsByPath,
    })) {
      impacts.set(`${gen.id}:source`, {
        generatorId: gen.id,
        generatorName: gen.name,
        generatorType: gen.type,
        role: 'source',
      });
    }
    const refs = getGeneratorConfigTokenRefs(gen.config);
    for (const [field, path] of Object.entries(refs)) {
      if (targetPaths.has(path)) {
        impacts.set(`${gen.id}:config-ref:${field}`, {
          generatorId: gen.id,
          generatorName: gen.name,
          generatorType: gen.type,
          role: 'config-ref',
          configField: field,
        });
      }
    }
  }
  return [...impacts.values()];
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

      const collectionModes = readTokenCollectionModeValues(entry)[sourceCollectionId];
      if (collectionModes?.[option.name] === undefined) continue;

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
