/**
 * Step 1 — Outcome selection: choose the generated group outcome before editing details.
 */
import type { RecipeType, RecipeConfig } from "../../hooks/useRecipes";
import type { GraphTemplate } from "../graph-templates";
import { GRAPH_TEMPLATES } from "../graph-templates";
import { createRecipeDraftFromTemplate } from "../../hooks/useGeneratedGroupEditor";
import { AUTHORING } from "../../shared/editorClasses";
import { RecipeIntentCatalog } from "./IntentCatalog";

export interface StepIntentProps {
  templates?: GraphTemplate[];
  title?: string;
  description?: string;
  selectedType: RecipeType;
  recommendedType: RecipeType | undefined;
  connected: boolean;
  currentCollectionId: string;
  sourceTokenPath?: string;
  sourceTokenName?: string;
  sourceTokenType?: string;
  prefilled: boolean;
  onTypeChange: (type: RecipeType) => void;
  onTemplateApply: (
    template: GraphTemplate,
    draft: ReturnType<typeof createRecipeDraftFromTemplate>,
  ) => void;
  onConfigChange: (type: RecipeType, cfg: RecipeConfig) => void;
}

export function StepIntent({
  templates = GRAPH_TEMPLATES,
  title = "What do you want to create?",
  description = "Start from the outcome you want. You can tune the generated group in the next step.",
  selectedType,
  recommendedType,
  connected,
  currentCollectionId,
  sourceTokenPath,
  sourceTokenName,
  sourceTokenType,
  onTypeChange,
  onTemplateApply,
}: StepIntentProps) {
  const suggestedTemplateId =
    templates.find((template) => template.recipeType === selectedType)?.id ??
    templates.find((template) => template.recipeType === recommendedType)?.id ??
    null;

  return (
    <section className={`${AUTHORING.recipeRoot} ${AUTHORING.recipeSection}`}>
      <div className="mb-3 flex flex-col gap-1">
        <h3 className="text-[14px] font-semibold text-[var(--color-figma-text)]">
          {title}
        </h3>
        <p className="text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">
          {description}
        </p>
      </div>

      <RecipeIntentCatalog
        templates={templates}
        connected={connected}
        sourceTokenType={sourceTokenType}
        recommendedType={recommendedType}
        suggestedTemplateId={suggestedTemplateId}
        onSelectTemplate={(template) => {
          onTypeChange(template.recipeType);
          onTemplateApply(
            template,
            createRecipeDraftFromTemplate(template, currentCollectionId, {
              sourceTokenPath,
              sourceTokenName,
            }),
          );
        }}
      />
    </section>
  );
}
