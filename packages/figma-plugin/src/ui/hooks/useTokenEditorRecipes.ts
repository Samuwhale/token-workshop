import type { TokenRecipe } from './useRecipes';

interface UseTokenEditorRecipesParams {
  tokenPath: string;
  tokenType: string;
  recipes: TokenRecipe[];
}

export function useTokenEditorRecipes({
  tokenPath,
  tokenType,
  recipes,
}: UseTokenEditorRecipesParams) {
  const existingRecipesForToken = recipes.filter(g => g.sourceToken === tokenPath);
  const canBeRecipeSource = ['color', 'dimension', 'number', 'fontSize'].includes(tokenType);

  return {
    existingRecipesForToken,
    canBeRecipeSource,
  };
}
