/**
 * Step 1 — Type selection: compact single-column list of all recipe types.
 */
import type { RecipeType, RecipeConfig } from '../../hooks/useRecipes';
import type { GraphTemplate } from '../graph-templates';
import { GRAPH_TEMPLATES } from '../graph-templates';
import { createRecipeDraftFromTemplate } from '../../hooks/useRecipeDialog';
import { TYPE_LABELS, TYPE_DESCRIPTIONS, PRIMARY_TYPES, ADVANCED_TYPES } from '../recipes/recipeUtils';
import { TypeThumbnail } from '../recipes/TypeThumbnail';
import { AUTHORING } from '../../shared/editorClasses';

// ---------------------------------------------------------------------------
// Compact type row
// ---------------------------------------------------------------------------

function TypeRow({
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
      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md transition-colors text-left ${
        isSelected
          ? 'bg-[var(--color-figma-accent)]/8 border-l-2 border-l-[var(--color-figma-accent)] pl-2'
          : isRecommended
            ? 'border-l-2 border-l-[var(--color-figma-accent)]/30 pl-2 hover:bg-[var(--color-figma-bg-hover)]'
            : 'hover:bg-[var(--color-figma-bg-hover)]'
      }`}
    >
      <TypeThumbnail type={type} size={16} />
      <div className="flex-1 min-w-0">
        <span className={`text-[11px] font-medium ${isSelected ? 'text-[var(--color-figma-accent)]' : 'text-[var(--color-figma-text)]'}`}>
          {TYPE_LABELS[type]}
        </span>
        <p className="text-[9px] text-[var(--color-figma-text-secondary)] leading-snug truncate">
          {TYPE_DESCRIPTIONS[type]}
        </p>
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
  connected: _connected,
  activeSet,
  sourceTokenPath,
  sourceTokenName,
  sourceTokenType: _sourceTokenType,
  prefilled: _prefilled,
  onTypeChange,
  onTemplateApply,
}: StepIntentProps) {
  // Sort: recommended type first, then primary, then advanced
  const sortedPrimary = recommendedType
    ? [recommendedType, ...PRIMARY_TYPES.filter(t => t !== recommendedType)]
    : PRIMARY_TYPES;

  const handleTypeChange = (type: RecipeType) => {
    onTypeChange(type);

    // Auto-apply template if exactly one exists for this type
    const templates = GRAPH_TEMPLATES.filter(t => t.recipeType === type);
    if (templates.length === 1) {
      const draft = createRecipeDraftFromTemplate(templates[0], activeSet, {
        sourceTokenPath,
        sourceTokenName,
      });
      onTemplateApply(templates[0], draft);
    }
  };

  return (
    <section className={`${AUTHORING.recipeRoot} ${AUTHORING.recipeSection}`}>
      <div className="flex flex-col gap-0.5">
        {sortedPrimary.map(type => (
          <TypeRow
            key={type}
            type={type}
            isSelected={selectedType === type}
            isRecommended={type === recommendedType}
            onSelect={() => handleTypeChange(type)}
          />
        ))}

        <div className="mx-2.5 my-1 border-t border-[var(--color-figma-border)]" />

        {ADVANCED_TYPES.map(type => (
          <TypeRow
            key={type}
            type={type}
            isSelected={selectedType === type}
            isRecommended={type === recommendedType}
            onSelect={() => handleTypeChange(type)}
          />
        ))}
      </div>
    </section>
  );
}
