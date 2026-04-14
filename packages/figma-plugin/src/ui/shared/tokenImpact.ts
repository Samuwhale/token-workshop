import type { TokenRecipe } from '../hooks/useRecipes';
import type { TokenMapEntry } from '../../shared/types';
import type { ThemeDimension } from '@tokenmanager/core';
import type { RecipeImpact, ThemeImpact } from '../components/tokenListTypes';

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
 * Compute which theme options contain overrides (enabled/source sets) that
 * directly include any of the given token paths.
 */
export function computeThemeImpacts(
  targetPaths: Set<string>,
  dimensions: ThemeDimension[],
  perSetFlat: Record<string, Record<string, TokenMapEntry>>,
): ThemeImpact[] {
  const impacts: ThemeImpact[] = [];
  for (const dim of dimensions) {
    for (const option of dim.options) {
      for (const [setName, status] of Object.entries(option.sets)) {
        if (status !== 'enabled' && status !== 'source') continue;
        const flatSet = perSetFlat[setName];
        if (!flatSet) continue;
        let found = false;
        for (const path of targetPaths) {
          if (flatSet[path] !== undefined) {
            found = true;
            break;
          }
        }
        if (found) {
          impacts.push({ dimName: dim.name, optionName: option.name, setName });
          break; // one entry per option is enough
        }
      }
    }
  }
  return impacts;
}
