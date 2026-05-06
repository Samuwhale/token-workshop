import type { TokenMapEntry } from '../../shared/types';
import {
  readTokenCollectionModeValues,
  type TokenCollection,
} from '@token-workshop/core';
import type { ModeImpact } from '../components/tokenListTypes';

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
