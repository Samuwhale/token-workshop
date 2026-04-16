import { Spinner } from "../Spinner";
import { NoticeBanner } from "../../shared/noticeSystem";
import type { TokenRecipe } from "../../hooks/useRecipes";

interface TokenListStaleRecipeBannerProps {
  staleRecipesForSet: TokenRecipe[];
  runningStaleRecipes: boolean;
  onDismiss: () => void;
  onRegenerateAll: () => void;
  onNavigateToRecipe?: (recipeId: string) => void;
}

export function TokenListStaleRecipeBanner({
  staleRecipesForSet,
  runningStaleRecipes,
  onDismiss,
  onRegenerateAll,
  onNavigateToRecipe,
}: TokenListStaleRecipeBannerProps) {
  return (
    <NoticeBanner
      severity="warning"
      onDismiss={!runningStaleRecipes ? onDismiss : undefined}
      dismissLabel="Dismiss"
      actions={
        <button
          type="button"
          onClick={onRegenerateAll}
          disabled={runningStaleRecipes}
          className="inline-flex items-center gap-1 shrink-0 px-2 py-1 rounded bg-amber-500/15 text-amber-700 font-medium hover:bg-amber-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {runningStaleRecipes && <Spinner size="xs" />}
          <span>
            {runningStaleRecipes ? "Re-running..." : "Re-run all"}
          </span>
        </button>
      }
    >
      <span>
        {staleRecipesForSet.length === 1
          ? "1 recipe is"
          : `${staleRecipesForSet.length} recipes are`}{" "}
        out of date:{" "}
        {staleRecipesForSet.map((recipe, i) => (
          <span key={recipe.id}>
            {i > 0 && ", "}
            {onNavigateToRecipe ? (
              <button
                type="button"
                onClick={() => onNavigateToRecipe(recipe.id)}
                className="underline decoration-amber-500/40 hover:decoration-amber-600 hover:text-amber-800 transition-colors"
              >
                {recipe.name}
              </button>
            ) : (
              recipe.name
            )}
          </span>
        ))}
      </span>
    </NoticeBanner>
  );
}
