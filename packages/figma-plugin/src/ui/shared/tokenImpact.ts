import type { TokenRecipe } from '../hooks/useRecipes';
import type { TokenMapEntry } from '../../shared/types';
import type { TokenCollection } from '@tokenmanager/core';
import type { RecipeImpact, ModeImpact } from '../components/tokenListTypes';

/**
 * Returns all $tokenRefs entries from a recipe's config as a flat
 * Record<fieldName, tokenPath>. Handles all RecipeConfig variants.
 */
function extractTokenRefs(config: TokenRecipe['config']): Record<string, string> {
  const refs = (config as unknown as { $tokenRefs?: Record<string, string | undefined> }).$tokenRefs;
  if (!refs) return {};
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(refs)) {
    if (typeof val === 'string') out[key] = val;
  }
  return out;
}

/**
 * Compute which recipes reference any of the given token paths (directly
 * via `sourceToken` or via a `$tokenRefs` config field).
 */
export function computeRecipeImpacts(
  targetPaths: Set<string>,
  recipes: TokenRecipe[],
): RecipeImpact[] {
  const impacts: RecipeImpact[] = [];
  for (const gen of recipes) {
    if (gen.sourceToken && targetPaths.has(gen.sourceToken)) {
      impacts.push({
        recipeId: gen.id,
        recipeName: gen.name,
        recipeType: gen.type,
        role: 'source',
      });
    }
    const refs = extractTokenRefs(gen.config);
    for (const [field, path] of Object.entries(refs)) {
      if (targetPaths.has(path)) {
        impacts.push({
          recipeId: gen.id,
          recipeName: gen.name,
          recipeType: gen.type,
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
  perSetFlat: Record<string, Record<string, TokenMapEntry>>,
): ModeImpact[] {
  const seen = new Set<string>();
  const impacts: ModeImpact[] = [];
  const tokenEntries = Object.values(perSetFlat).flatMap((flatSet) =>
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
            collectionName: collection.name,
            optionName: option.name,
          });
        }
        break;
      }
    }
  }
  return impacts;
}
