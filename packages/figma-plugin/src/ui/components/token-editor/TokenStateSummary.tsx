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
  aliasCollectionId?: string | null;
  extendsPath: string | null;
  extendsCollectionId?: string | null;
  sourceRecipes: TokenRecipe[];
  generatedRecipe: TokenRecipe | null;
  usageCount?: number;
  onNavigateToPath?: (path: string) => void;
  onNavigateToAutomation?: (recipeId: string) => void;
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
  onNavigateToAutomation,
}: {
  recipes: TokenRecipe[];
  onNavigateToAutomation?: (recipeId: string) => void;
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
          {onNavigateToAutomation ? (
            <button
              type="button"
              onClick={() => onNavigateToAutomation(recipe.id)}
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

function TokenReferenceValue({
  path,
  collectionId,
  onNavigateToPath,
}: {
  path: string;
  collectionId?: string | null;
  onNavigateToPath?: (path: string) => void;
}) {
  return (
    <div className="min-w-0">
      {onNavigateToPath ? (
        <button
          type="button"
          onClick={() => onNavigateToPath(path)}
          className="block truncate text-left font-mono text-[var(--color-figma-accent)] hover:underline"
          title={path}
        >
          {compactTokenPath(path)}
        </button>
      ) : (
        <span
          className="block truncate font-mono text-[var(--color-figma-text)]"
          title={path}
        >
          {compactTokenPath(path)}
        </span>
      )}
      {collectionId ? (
        <div className="mt-0.5 text-[10px] text-[var(--color-figma-text-secondary)]">
          {collectionId}
        </div>
      ) : null}
    </div>
  );
}

export function TokenStateSummary({
  tokenType,
  scopes,
  lifecycle,
  provenance,
  aliasPath,
  aliasCollectionId,
  extendsPath,
  extendsCollectionId,
  sourceRecipes,
  generatedRecipe,
  usageCount,
  onNavigateToPath,
  onNavigateToAutomation,
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
  const sourceRecipesLabel = sourceRecipes.length === 1 ? "Generator" : "Generators";

  if (!hasContent) return null;

  return (
    <div
      className={`rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]/35 px-3 py-2 ${className ?? ""}`}
    >
      <dl className="grid grid-cols-[84px_minmax(0,1fr)] gap-x-3 gap-y-1.5">
        {aliasPath && (
          <SummaryRow label="Alias of">
            <TokenReferenceValue
              path={aliasPath}
              collectionId={aliasCollectionId}
              onNavigateToPath={onNavigateToPath}
            />
          </SummaryRow>
        )}

        {extendsPath && (
          <SummaryRow label="Extends">
            <TokenReferenceValue
              path={extendsPath}
              collectionId={extendsCollectionId}
              onNavigateToPath={onNavigateToPath}
            />
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
            {onNavigateToAutomation ? (
              <button
                type="button"
                onClick={() => onNavigateToAutomation(generatedRecipe.id)}
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
              onNavigateToAutomation={onNavigateToAutomation}
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
