import { Fragment, type ReactNode } from "react";
import type { TokenRecipe } from "../../hooks/useRecipes";
import {
  compactTokenPath,
  getLifecycleLabel,
  getTokenProvenanceLabel,
  summarizeTokenScopes,
  FIGMA_SCOPE_OPTIONS,
} from "../../shared/tokenMetadata";

interface TokenStateSummaryProps {
  tokenType: string;
  scopes: string[];
  lifecycle: "draft" | "published" | "deprecated";
  provenance: string | null;
  aliasPath: string | null;
  extendsPath: string | null;
  sourceRecipes: TokenRecipe[];
  generatedRecipe: TokenRecipe | null;
  usageCount?: number;
  onNavigateToPath?: (path: string) => void;
  onNavigateToRecipe?: (recipeId: string) => void;
  onHighlightUsage?: () => void;
  className?: string;
}

function SummaryRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <>
      <dt className="text-[10px] text-[var(--color-figma-text-secondary)]">
        {label}
      </dt>
      <dd className="min-w-0 text-[10px] text-[var(--color-figma-text)]">
        {children}
      </dd>
    </>
  );
}

function RecipeLinks({
  recipes,
  onNavigateToRecipe,
}: {
  recipes: TokenRecipe[];
  onNavigateToRecipe?: (recipeId: string) => void;
}) {
  const visibleRecipes = recipes.slice(0, 3);
  const remaining = recipes.length - visibleRecipes.length;

  return (
    <div className="flex flex-wrap gap-x-0.5 gap-y-0.5">
      {visibleRecipes.map((recipe, index) =>
        <Fragment key={recipe.id}>
          {index > 0 && (
            <span className="text-[var(--color-figma-text-secondary)]">, </span>
          )}
          {onNavigateToRecipe ? (
            <button
              type="button"
              onClick={() => onNavigateToRecipe(recipe.id)}
              className="text-left text-[var(--color-figma-accent)] hover:underline"
              title={recipe.name}
            >
              {recipe.name}
            </button>
          ) : (
            <span title={recipe.name}>{recipe.name}</span>
          )}
        </Fragment>,
      )}
      {remaining > 0 && (
        <span className="text-[var(--color-figma-text-secondary)]">
          +{remaining} more
        </span>
      )}
    </div>
  );
}

export function TokenStateSummary({
  tokenType,
  scopes,
  lifecycle,
  provenance,
  aliasPath,
  extendsPath,
  sourceRecipes,
  generatedRecipe,
  usageCount,
  onNavigateToPath,
  onNavigateToRecipe,
  onHighlightUsage,
  className,
}: TokenStateSummaryProps) {
  const lifecycleLabel = getLifecycleLabel(lifecycle);
  const provenanceLabel = getTokenProvenanceLabel(provenance);
  const scopeLabel =
    scopes.length > 0
      ? summarizeTokenScopes(tokenType, scopes, 2)
      : FIGMA_SCOPE_OPTIONS[tokenType]?.length
        ? "All scopes"
        : null;
  const hasContent = Boolean(
    aliasPath ||
      extendsPath ||
      scopeLabel ||
      lifecycleLabel ||
      provenanceLabel ||
      generatedRecipe ||
      sourceRecipes.length > 0 ||
      (typeof usageCount === "number" && usageCount > 0),
  );
  const sourceRecipesLabel = sourceRecipes.length === 1 ? "Recipe" : "Recipes";

  if (!hasContent) return null;

  return (
    <div
      className={`rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]/35 px-3 py-2 ${className ?? ""}`}
    >
      <dl className="grid grid-cols-[84px_minmax(0,1fr)] gap-x-3 gap-y-1.5">
        {aliasPath && (
          <SummaryRow label="Alias of">
            {onNavigateToPath ? (
              <button
                type="button"
                onClick={() => onNavigateToPath(aliasPath)}
                className="truncate text-left font-mono text-[var(--color-figma-accent)] hover:underline"
                title={aliasPath}
              >
                {compactTokenPath(aliasPath)}
              </button>
            ) : (
              <span className="font-mono text-[var(--color-figma-text)]" title={aliasPath}>
                {compactTokenPath(aliasPath)}
              </span>
            )}
          </SummaryRow>
        )}

        {extendsPath && (
          <SummaryRow label="Extends">
            {onNavigateToPath ? (
              <button
                type="button"
                onClick={() => onNavigateToPath(extendsPath)}
                className="truncate text-left font-mono text-[var(--color-figma-accent)] hover:underline"
                title={extendsPath}
              >
                {compactTokenPath(extendsPath)}
              </button>
            ) : (
              <span className="font-mono text-[var(--color-figma-text)]" title={extendsPath}>
                {compactTokenPath(extendsPath)}
              </span>
            )}
          </SummaryRow>
        )}

        {scopeLabel && (
          <SummaryRow label="Scopes">
            <span title={scopes.join(", ")}>{scopeLabel}</span>
          </SummaryRow>
        )}

        {lifecycleLabel && (
          <SummaryRow label="Lifecycle">
            <span>{lifecycleLabel}</span>
          </SummaryRow>
        )}

        {provenanceLabel && (
          <SummaryRow label="Origin">
            <span>{provenanceLabel}</span>
          </SummaryRow>
        )}

        {generatedRecipe && (
          <SummaryRow label="Generated by">
            {onNavigateToRecipe ? (
              <button
                type="button"
                onClick={() => onNavigateToRecipe(generatedRecipe.id)}
                className="text-left text-[var(--color-figma-accent)] hover:underline"
                title={generatedRecipe.name}
              >
                {generatedRecipe.name}
              </button>
            ) : (
              <span title={generatedRecipe.name}>{generatedRecipe.name}</span>
            )}
          </SummaryRow>
        )}

        {sourceRecipes.length > 0 && (
          <SummaryRow label={sourceRecipesLabel}>
            <RecipeLinks
              recipes={sourceRecipes}
              onNavigateToRecipe={onNavigateToRecipe}
            />
          </SummaryRow>
        )}

        {typeof usageCount === "number" && usageCount > 0 && (
          <SummaryRow label="Usage">
            {onHighlightUsage ? (
              <button
                type="button"
                onClick={onHighlightUsage}
                className="text-left text-[var(--color-figma-accent)] hover:underline"
                title={`Highlight ${usageCount} bound layer${usageCount === 1 ? "" : "s"} on the canvas`}
              >
                {usageCount} bound layer{usageCount === 1 ? "" : "s"}
              </button>
            ) : (
              <span>{usageCount} bound layer{usageCount === 1 ? "" : "s"}</span>
            )}
          </SummaryRow>
        )}
      </dl>
    </div>
  );
}
