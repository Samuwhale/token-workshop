/**
 * Step 1 — Outcome selection: choose the generated group outcome before editing details.
 */
import type { GeneratorType, GeneratorConfig } from "../../hooks/useGenerators";
import type { GraphTemplate } from "../graph-templates";
import { GRAPH_TEMPLATES } from "../graph-templates";
import { createGeneratorDraftFromTemplate } from "../../hooks/useGeneratedGroupEditor";
import { AUTHORING } from "../../shared/editorClasses";
import { GeneratorIntentCatalog } from "./IntentCatalog";

export interface StepIntentProps {
  templates?: GraphTemplate[];
  title?: string;
  description?: string;
  selectedType: GeneratorType;
  recommendedType: GeneratorType | undefined;
  connected: boolean;
  currentCollectionId: string;
  sourceTokenPath?: string;
  sourceTokenName?: string;
  sourceTokenType?: string;
  prefilled: boolean;
  onTypeChange: (type: GeneratorType) => void;
  onTemplateApply: (
    template: GraphTemplate,
    draft: ReturnType<typeof createGeneratorDraftFromTemplate>,
  ) => void;
  onConfigChange: (type: GeneratorType, cfg: GeneratorConfig) => void;
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
    templates.find((template) => template.generatorType === selectedType)?.id ??
    templates.find((template) => template.generatorType === recommendedType)?.id ??
    null;

  return (
    <section className={`${AUTHORING.generatorRoot} ${AUTHORING.generatorSection}`}>
      <div className="mb-3 flex flex-col gap-1">
        <h3 className="text-[14px] font-semibold text-[var(--color-figma-text)]">
          {title}
        </h3>
        <p className="text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">
          {description}
        </p>
      </div>

      <GeneratorIntentCatalog
        templates={templates}
        connected={connected}
        sourceTokenType={sourceTokenType}
        recommendedType={recommendedType}
        suggestedTemplateId={suggestedTemplateId}
        onSelectTemplate={(template) => {
          onTypeChange(template.generatorType);
          onTemplateApply(
            template,
            createGeneratorDraftFromTemplate(template, currentCollectionId, {
              sourceTokenPath,
              sourceTokenName,
            }),
          );
        }}
      />
    </section>
  );
}
