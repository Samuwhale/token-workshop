import type { TokenRecipe } from "../../hooks/useRecipes";
import type { TokensLibraryAutomationEditorTarget } from "../../shared/navigationTypes";
import { LONG_TEXT_CLASSES } from "../../shared/longTextStyles";
import { getSingleObviousRecipeType } from "../recipes/recipeUtils";

export interface TokenEditorDerivedGroupsProps {
  tokenPath: string;
  tokenName?: string;
  tokenType: string;
  value: any;
  existingRecipesForToken: TokenRecipe[];
  openAutomationEditor: (target: TokensLibraryAutomationEditorTarget) => void;
}

export function TokenEditorDerivedGroups({
  tokenPath,
  tokenName,
  tokenType,
  value,
  existingRecipesForToken,
  openAutomationEditor,
}: TokenEditorDerivedGroupsProps) {
  const obviousType = getSingleObviousRecipeType(tokenType);
  const recipeTypeLabel = (type: TokenRecipe["type"]) => {
    switch (type) {
      case "colorRamp":
        return "Color ramp";
      case "typeScale":
        return "Type scale";
      case "spacingScale":
        return "Spacing scale";
      default:
        return "Opacity scale";
    }
  };

  return (
    <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
      <div className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">
            Generated groups
          </span>
          {existingRecipesForToken.length > 0 && (
            <span className="text-[10px] tabular-nums text-[var(--color-figma-text-secondary)]">
              {existingRecipesForToken.length}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[10px] text-[var(--color-text-secondary,var(--color-figma-text-tertiary))]">
          Auto-generate token groups from a formula
        </p>
      </div>
      <div className="px-3 py-2 flex flex-col gap-2">
        {existingRecipesForToken.length > 0 ? (
          <div className="flex flex-col gap-1.5">
          {existingRecipesForToken.map((gen) => (
            <div
              key={gen.id}
              className="flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[10px] font-medium text-[var(--color-figma-text)] truncate">
                    {gen.name}
                  </span>
                  <span className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0">
                    {recipeTypeLabel(gen.type)}
                  </span>
                </div>
                <span className={`${LONG_TEXT_CLASSES.monoSecondary} block`}>
                  {gen.targetGroup}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openAutomationEditor({
                      mode: 'edit',
                      id: gen.id,
                    });
                  }}
                  className="text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-accent)] transition-colors"
                >
                  Edit
                </button>
              </div>
            </div>
          ))}
          </div>
        ) : (
          <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
            No generated groups yet.
          </p>
        )}
        <button
          onClick={() => {
            openAutomationEditor({
              mode: 'create',
              sourceTokenPath: tokenPath,
              sourceTokenName: tokenName,
              sourceTokenType: tokenType,
              sourceTokenValue: value,
              ...(obviousType
                ? { initialDraft: { selectedType: obviousType } }
                : {}),
            });
          }}
          className="self-start rounded border border-[var(--color-figma-border)] px-2.5 py-1 text-[10px] font-medium text-[var(--color-figma-text)] transition-colors hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)]"
        >
          Generate from this token
        </button>
      </div>
    </div>
  );
}
