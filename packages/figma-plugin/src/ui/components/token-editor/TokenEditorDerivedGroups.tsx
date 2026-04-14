import type { TokenRecipe } from "../../hooks/useRecipes";
import type { TokensLibraryRecipeEditorTarget } from "../../shared/navigationTypes";
import { LONG_TEXT_CLASSES } from "../../shared/longTextStyles";
import {
  getQuickRecipeTypeForToken,
  getQuickRecipeActionLabel,
} from "../token-tree/tokenTreeNodeShared";

export interface TokenEditorDerivedGroupsProps {
  tokenPath: string;
  tokenName?: string;
  tokenType: string;
  value: any;
  existingRecipesForToken: TokenRecipe[];
  openRecipeEditor: (target: TokensLibraryRecipeEditorTarget) => void;
}

export function TokenEditorDerivedGroups({
  tokenPath,
  tokenName,
  tokenType,
  value,
  existingRecipesForToken,
  openRecipeEditor,
}: TokenEditorDerivedGroupsProps) {
  const quickType = getQuickRecipeTypeForToken(
    tokenPath,
    tokenName ?? tokenPath.split(".").pop() ?? "",
    tokenType,
    value,
  );
  const quickLabel = quickType ? getQuickRecipeActionLabel(quickType) : null;
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
      <button
        onClick={() => {
          openRecipeEditor({
            mode: 'create',
            sourceTokenPath: tokenPath,
            sourceTokenName: tokenName,
            sourceTokenType: tokenType,
            sourceTokenValue: value,
            ...(quickType
              ? { initialDraft: { selectedType: quickType } }
              : {}),
          });
        }}
        className="w-full px-3 py-2 flex items-center justify-between bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text-secondary)] font-medium hover:bg-[var(--color-figma-bg-hover)] transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="5" cy="2" r="1.5" />
            <circle cx="2" cy="8" r="1.5" />
            <circle cx="8" cy="8" r="1.5" />
            <path d="M5 3.5V6M5 6L2 6.5M5 6L8 6.5" />
          </svg>
          {existingRecipesForToken.length > 0
            ? `Recipes (${existingRecipesForToken.length})`
            : (quickLabel ?? "Create recipe")}
        </span>
        {existingRecipesForToken.length === 0 ? (
          <span className="text-[10px] text-[var(--color-figma-accent)]">
            + Create
          </span>
        ) : (
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M7 2L3 5l4 3" />
          </svg>
        )}
      </button>
      {existingRecipesForToken.length > 0 && (
        <div className="px-3 py-2 flex flex-col gap-1.5 border-t border-[var(--color-figma-border)]">
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
                    openRecipeEditor({
                      mode: 'edit',
                      id: gen.id,
                    });
                  }}
                  className="text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-accent)] transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openRecipeEditor({
                      mode: 'create',
                      sourceTokenPath: tokenPath,
                      sourceTokenName: tokenName,
                      sourceTokenType: tokenType,
                      sourceTokenValue: value,
                      template: {
                        id: `dup-${gen.id}`,
                        label: `${gen.name} (copy)`,
                        description: "",
                        defaultPrefix: gen.targetGroup,
                        recipeType: gen.type,
                        config: gen.config,
                        requiresSource: false,
                      },
                    });
                  }}
                  title="Duplicate recipe"
                  className="text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-accent)] transition-colors"
                >
                  Duplicate
                </button>
              </div>
            </div>
          ))}
          <button
            onClick={() => {
              openRecipeEditor({
                mode: 'create',
                sourceTokenPath: tokenPath,
                sourceTokenName: tokenName,
                sourceTokenType: tokenType,
                sourceTokenValue: value,
              });
            }}
            className="mt-0.5 text-[10px] text-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent-hover)] transition-colors text-left"
          >
            + Add another recipe
          </button>
        </div>
      )}
    </div>
  );
}
