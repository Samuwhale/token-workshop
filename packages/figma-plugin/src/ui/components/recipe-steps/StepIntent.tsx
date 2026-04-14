/**
 * Step 1 — Intent: "What do you want to generate?"
 * Type selection grid with optional template suggestions.
 */
import { useState } from 'react';
import type { RecipeType, RecipeConfig } from '../../hooks/useRecipes';
import type { GraphTemplate } from '../graph-templates';
import { GRAPH_TEMPLATES } from '../graph-templates';
import { createRecipeDraftFromTemplate } from '../../hooks/useRecipeDialog';
import { TYPE_LABELS, TYPE_DESCRIPTIONS, PRIMARY_TYPES, ADVANCED_TYPES } from '../recipes/recipeUtils';
import { TypeThumbnail } from '../recipes/TypeThumbnail';
import { RecipeIntentCatalog } from './IntentCatalog';
import { AUTHORING } from '../../shared/editorClasses';

// ---------------------------------------------------------------------------
// Type card grid
// ---------------------------------------------------------------------------

function TypeCard({
  type,
  isSelected,
  isRecommended,
  onSelect,
}: {
  type: RecipeType;
  isSelected: boolean;
  isRecommended: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left rounded-lg border px-2.5 py-2 transition-colors ${
        isSelected
          ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/5'
          : 'border-[var(--color-figma-border)] hover:border-[var(--color-figma-accent)]/40 hover:bg-[var(--color-figma-accent)]/5'
      }`}
    >
      <div className="flex items-start gap-2">
        <div className="flex-none mt-0.5 w-9 h-9 rounded flex items-center justify-center bg-[var(--color-figma-accent)]/10">
          <TypeThumbnail type={type} size={24} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-[var(--color-figma-text)]">
              {TYPE_LABELS[type]}
            </span>
            {isRecommended && (
              <span className="text-[9px] rounded-full px-1.5 py-0.5 bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]">
                Recommended
              </span>
            )}
          </div>
          <p className="text-[9px] text-[var(--color-figma-text-secondary)] leading-snug mt-0.5">
            {TYPE_DESCRIPTIONS[type]}
          </p>
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface StepIntentProps {
  selectedType: RecipeType;
  recommendedType: RecipeType | undefined;
  connected: boolean;
  activeSet: string;
  sourceTokenPath?: string;
  sourceTokenName?: string;
  sourceTokenType?: string;
  /** When true the type was pre-filled by an entry point — start collapsed */
  prefilled: boolean;
  onTypeChange: (type: RecipeType) => void;
  onTemplateApply: (template: GraphTemplate, draft: ReturnType<typeof createRecipeDraftFromTemplate>) => void;
  onConfigChange: (type: RecipeType, cfg: RecipeConfig) => void;
}

// ---------------------------------------------------------------------------
// StepIntent
// ---------------------------------------------------------------------------

export function StepIntent({
  selectedType,
  recommendedType,
  connected,
  activeSet,
  sourceTokenPath,
  sourceTokenName,
  sourceTokenType,
  prefilled,
  onTypeChange,
  onTemplateApply,
}: StepIntentProps) {
  const [expanded, setExpanded] = useState(!prefilled);
  const [showAdvanced, setShowAdvanced] = useState(
    () => ADVANCED_TYPES.includes(selectedType),
  );
  const [showTemplates, setShowTemplates] = useState(false);

  const handleTypeChange = (type: RecipeType) => {
    onTypeChange(type);
    setExpanded(false);
    setShowTemplates(true);
  };

  const matchingTemplates = GRAPH_TEMPLATES.filter(
    t => t.recipeType === selectedType,
  );

  const handleTemplateSelect = (template: GraphTemplate) => {
    const draft = createRecipeDraftFromTemplate(template, activeSet, {
      sourceTokenPath,
      sourceTokenName,
    });
    onTemplateApply(template, draft);
    setShowTemplates(false);
  };

  return (
    <section className={`${AUTHORING.recipeRoot} ${AUTHORING.recipeSection}`}>
      <div className={AUTHORING.recipeTitleBlock}>
        <h3 className={AUTHORING.recipeTitle}>What do you want to generate?</h3>
        <p className={AUTHORING.recipeDescription}>
          Pick a type, optionally a template.
        </p>
      </div>

      <div className={AUTHORING.recipeSectionCard}>
        <div className={AUTHORING.recipeFieldStack}>
          {!expanded ? (
            /* Collapsed summary row */
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="min-h-[36px] w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border border-[var(--color-figma-border)] hover:border-[var(--color-figma-accent)]/40 transition-colors"
            >
              <div className="flex-none w-6 h-6 rounded flex items-center justify-center bg-[var(--color-figma-accent)]/10">
                <TypeThumbnail type={selectedType} size={14} />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <span className="text-[11px] font-semibold text-[var(--color-figma-text)]">
                  {TYPE_LABELS[selectedType]}
                </span>
                <p className="text-[9px] text-[var(--color-figma-text-secondary)] leading-snug truncate">
                  {TYPE_DESCRIPTIONS[selectedType]}
                </p>
              </div>
              <span className="shrink-0 text-[10px] font-medium text-[var(--color-figma-accent)]">Change</span>
            </button>
          ) : (
            /* Expanded type grid */
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                {PRIMARY_TYPES.map(type => (
                  <TypeCard
                    key={type}
                    type={type}
                    isSelected={selectedType === type}
                    isRecommended={type === recommendedType}
                    onSelect={() => handleTypeChange(type)}
                  />
                ))}
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => setShowAdvanced(v => !v)}
                  className="flex items-center gap-1.5 py-1 text-[9px] text-[var(--color-figma-text-secondary)] uppercase tracking-wider font-medium hover:text-[var(--color-figma-text)] transition-colors"
                >
                  <svg
                    width="8" height="8" viewBox="0 0 10 10" fill="currentColor"
                    className={`transition-transform ${showAdvanced ? 'rotate-90' : ''}`}
                  >
                    <path d="M3 1.5l4 3.5-4 3.5V1.5z" />
                  </svg>
                  Advanced
                </button>
                {showAdvanced && (
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    {ADVANCED_TYPES.map(type => (
                      <TypeCard
                        key={type}
                        type={type}
                        isSelected={selectedType === type}
                        isRecommended={type === recommendedType}
                        onSelect={() => handleTypeChange(type)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Template suggestions for selected type */}
      {!expanded && showTemplates && matchingTemplates.length > 0 && (
        <div className={AUTHORING.recipeSectionCard}>
          <div className={AUTHORING.recipeFieldStack}>
            <div className="flex items-center justify-between">
              <label className={AUTHORING.recipeSummaryLabel}>
                Starter templates
              </label>
              <button
                type="button"
                onClick={() => setShowTemplates(false)}
                className="text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]"
              >
                Skip
              </button>
            </div>
            <RecipeIntentCatalog
              templates={matchingTemplates}
              connected={connected}
              onSelectTemplate={handleTemplateSelect}
              sourceTokenType={sourceTokenType}
              recommendedType={recommendedType}
              compact
            />
          </div>
        </div>
      )}
    </section>
  );
}
